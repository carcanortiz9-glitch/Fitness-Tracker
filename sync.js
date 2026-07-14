// ============================================================
// sync.js — sincronización opcional con Firebase
// Local-first: IndexedDB manda en la UI; Firestore es el espejo
// en la nube que une teléfono ↔ computadora. Si no hay internet
// o no hay sesión, la app funciona igual que siempre.
// ============================================================

import { db, cloudHooks } from './db.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDUPqPZFYygSyYx1_Bn-cFMa71rF6jq36w',
  authDomain: 'overload-e83c7.firebaseapp.com',
  projectId: 'overload-e83c7',
  storageBucket: 'overload-e83c7.firebasestorage.app',
  messagingSenderId: '207443705298',
  appId: '1:207443705298:web:0d3188271546769fdc5c0b',
};

const FB = 'https://www.gstatic.com/firebasejs/11.6.1';
const STORES_SYNC = ['exercises', 'routines', 'sessions', 'habitLogs'];
const KV_SYNC = new Set(['settings', 'plan']); // 'seeded'/'activeWorkout' se quedan locales

let A = null, F = null;      // módulos auth y firestore
let auth = null, fs = null;
let user = null;
let unsubs = [];
let applyingRemote = false;  // evita eco: cambios remotos no se re-suben
let renderTimer = null;

export const sync = {
  status: 'init', // init | offline-sdk | signedout | syncing | on | error
  user: null,
  onStatus: null, // (status, detalle) => void
  onRemote: null, // () => void — recargar estado y re-render
};

const setStatus = (s, detail) => { sync.status = s; sync.onStatus?.(s, detail); };
const clean = (obj) => JSON.parse(JSON.stringify(obj)); // Firestore no acepta undefined
const col = (store) => F.collection(fs, 'users', user.uid, store);
const kvRef = () => F.doc(fs, 'users', user.uid, 'meta', 'kv');

export async function initFirebase() {
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-auth.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    A = authM; F = fsM;
    const app = appM.initializeApp(firebaseConfig);
    auth = A.getAuth(app);
    auth.useDeviceLanguage?.();
    // Caché local de Firestore: los cambios hechos sin internet se
    // encolan y suben solos al reconectar.
    fs = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
    A.getRedirectResult(auth).catch(() => { /* sin redirect pendiente */ });
    A.onAuthStateChanged(auth, async (u) => {
      stopListeners();
      user = u; sync.user = u;
      if (!u) { removeHooks(); setStatus('signedout'); return; }
      try {
        setStatus('syncing');
        installHooks();
        await firstSync();
        startListeners();
        setStatus('on');
      } catch (e) {
        setStatus('error', e.code || e.message);
      }
    });
  } catch (e) {
    // Sin internet o CDN inaccesible: la app sigue 100% local.
    setStatus('offline-sdk', e.message);
  }
}

export async function signIn() {
  const provider = new A.GoogleAuthProvider();
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    const retriable = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'];
    if (retriable.includes(e.code)) { await A.signInWithRedirect(auth, provider); return; }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export const signOutUser = () => A.signOut(auth);

// ---------- Hooks: cada escritura local se refleja en la nube ----------
function installHooks() {
  cloudHooks.put = (store, obj) => {
    if (applyingRemote || !user || !STORES_SYNC.includes(store)) return;
    F.setDoc(F.doc(col(store), String(obj.id)), clean(obj)).catch(() => {});
  };
  cloudHooks.del = (store, id) => {
    if (applyingRemote || !user || !STORES_SYNC.includes(store)) return;
    F.deleteDoc(F.doc(col(store), String(id))).catch(() => {});
  };
  cloudHooks.setKV = (key, value) => {
    if (applyingRemote || !user || !KV_SYNC.has(key)) return;
    F.setDoc(kvRef(), { [key]: clean(value) }, { merge: true }).catch(() => {});
  };
  cloudHooks.delKV = (key) => {
    if (applyingRemote || !user || !KV_SYNC.has(key)) return;
    F.setDoc(kvRef(), { [key]: F.deleteField() }, { merge: true }).catch(() => {});
  };
}

function removeHooks() {
  cloudHooks.put = cloudHooks.del = cloudHooks.setKV = cloudHooks.delKV = null;
}

// ---------- Primera sincronización: unión nube ∪ local ----------
async function firstSync() {
  for (const store of STORES_SYNC) {
    const [snap, locals] = await Promise.all([F.getDocs(col(store)), db.all(store)]);
    const localById = Object.fromEntries(locals.map((x) => [String(x.id), x]));
    const remoteIds = new Set();

    applyingRemote = true;
    for (const d of snap.docs) {
      remoteIds.add(d.id);
      let data = d.data();
      // Hábitos del mismo día en dos dispositivos: unir ambos checklists
      if (store === 'habitLogs' && localById[d.id]) {
        data = { id: d.id, done: { ...localById[d.id].done, ...data.done } };
      }
      await db.putLocal(store, data);
    }
    applyingRemote = false;

    // Subir lo local que la nube no tiene (y hábitos ya fusionados)
    const toPush = locals.filter((x) => !remoteIds.has(String(x.id)));
    if (store === 'habitLogs') {
      for (const d of snap.docs) {
        if (localById[d.id]) toPush.push({ id: d.id, done: { ...localById[d.id].done, ...d.data().done } });
      }
    }
    for (const x of toPush) {
      await F.setDoc(F.doc(col(store), String(x.id)), clean(x));
    }
  }

  // KV: la nube manda si existe; si no, se sube lo local
  const kvSnap = await F.getDoc(kvRef());
  const remoteKV = kvSnap.exists() ? kvSnap.data() : {};
  const push = {};
  for (const key of KV_SYNC) {
    const localVal = await db.getKV(key);
    if (remoteKV[key] !== undefined) {
      applyingRemote = true;
      await db.setKVLocal(key, remoteKV[key]);
      applyingRemote = false;
    } else if (localVal !== undefined) {
      push[key] = clean(localVal);
    }
  }
  if (Object.keys(push).length) await F.setDoc(kvRef(), push, { merge: true });
}

// ---------- Escucha en vivo: cambios remotos → local → re-render ----------
function startListeners() {
  for (const store of STORES_SYNC) {
    unsubs.push(F.onSnapshot(col(store), async (snap) => {
      let changed = false;
      for (const ch of snap.docChanges()) {
        if (ch.doc.metadata.hasPendingWrites) continue; // eco de este dispositivo
        applyingRemote = true;
        if (ch.type === 'removed') await db.delLocal(store, ch.doc.data().id ?? ch.doc.id);
        else await db.putLocal(store, ch.doc.data());
        applyingRemote = false;
        changed = true;
      }
      if (changed) scheduleRender();
    }, () => {}));
  }
  unsubs.push(F.onSnapshot(kvRef(), async (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const data = snap.data();
    applyingRemote = true;
    for (const key of KV_SYNC) {
      if (data[key] !== undefined) await db.setKVLocal(key, data[key]);
    }
    applyingRemote = false;
    scheduleRender();
  }, () => {}));
}

function stopListeners() {
  unsubs.forEach((u) => u());
  unsubs = [];
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => sync.onRemote?.(), 350);
}

// ---------- Borrado total (usado por «Borrar todos los datos») ----------
export async function cloudWipe() {
  if (!user || !F) return;
  for (const store of STORES_SYNC) {
    const snap = await F.getDocs(col(store));
    for (const d of snap.docs) await F.deleteDoc(d.ref);
  }
  await F.deleteDoc(kvRef()).catch(() => {});
}
