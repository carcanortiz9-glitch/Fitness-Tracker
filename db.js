// ============================================================
// db.js — persistencia local con IndexedDB + datos semilla
// ============================================================

const DB_NAME = 'overload';
const DB_VERSION = 1;
const STORES = ['exercises', 'routines', 'sessions', 'kv'];

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const db = {
  all: (store) => open().then((d) => new Promise((res, rej) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  })),
  put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  getKV: (key) => open().then((d) => new Promise((res, rej) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result ? r.result.value : undefined);
    r.onerror = () => rej(r.error);
  })),
  setKV: (key, value) => tx('kv', 'readwrite', (s) => s.put({ key, value })),
  delKV: (key) => tx('kv', 'readwrite', (s) => s.delete(key)),
};

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

// ---------- Grupos musculares ----------
export const MUSCLES = {
  pecho:    { name: 'Pecho',    color: '#189ec2' },
  espalda:  { name: 'Espalda',  color: '#c67d1d' },
  pierna:   { name: 'Pierna',   color: '#d84f86' },
  hombros:  { name: 'Hombros',  color: '#63ab35' },
  biceps:   { name: 'Bíceps',   color: '#189ec2' },
  triceps:  { name: 'Tríceps',  color: '#c67d1d' },
  core:     { name: 'Core',     color: '#d84f86' },
};

// ---------- Biblioteca semilla de ejercicios ----------
// rest en segundos · increment en kg · rango de reps objetivo
const E = (id, name, muscle, rest = 90, increment = 2.5, repMin = 8, repMax = 12) =>
  ({ id, name, muscle, rest, increment, repMin, repMax, custom: false });

export const SEED_EXERCISES = [
  // Pecho
  E('ex-press-banca', 'Press de banca', 'pecho', 150, 2.5, 6, 10),
  E('ex-press-incl', 'Press inclinado con mancuernas', 'pecho', 120),
  E('ex-aperturas', 'Aperturas / cruce en poleas', 'pecho'),
  E('ex-fondos', 'Fondos en paralelas', 'pecho', 120),
  // Espalda
  E('ex-dominadas', 'Dominadas', 'espalda', 150, 2.5, 5, 10),
  E('ex-remo-barra', 'Remo con barra', 'espalda', 150, 2.5, 6, 10),
  E('ex-jalon', 'Jalón al pecho', 'espalda', 120),
  E('ex-remo-polea', 'Remo en polea baja', 'espalda', 120),
  // Pierna
  E('ex-sentadilla', 'Sentadilla', 'pierna', 180, 2.5, 5, 8),
  E('ex-peso-muerto', 'Peso muerto', 'pierna', 180, 5, 4, 6),
  E('ex-prensa', 'Prensa de pierna', 'pierna', 150, 5),
  E('ex-zancadas', 'Zancadas con mancuernas', 'pierna', 120),
  E('ex-femoral', 'Curl femoral', 'pierna'),
  E('ex-cuadriceps', 'Extensión de cuádriceps', 'pierna'),
  E('ex-talones', 'Elevación de talones', 'pierna', 60, 2.5, 12, 20),
  // Hombros
  E('ex-press-militar', 'Press militar', 'hombros', 150, 2.5, 6, 10),
  E('ex-laterales', 'Elevaciones laterales', 'hombros', 75, 1.25, 10, 15),
  E('ex-posterior', 'Pájaros / deltoide posterior', 'hombros', 75, 1.25, 10, 15),
  // Bíceps
  E('ex-curl-barra', 'Curl con barra', 'biceps'),
  E('ex-curl-martillo', 'Curl martillo', 'biceps'),
  E('ex-curl-inclinado', 'Curl inclinado', 'biceps'),
  // Tríceps
  E('ex-triceps-polea', 'Extensión de tríceps en polea', 'triceps'),
  E('ex-press-frances', 'Press francés', 'triceps'),
  E('ex-fondos-banco', 'Fondos en banco', 'triceps', 75, 0, 10, 15),
  // Core
  E('ex-crunch-polea', 'Crunch en polea', 'core', 60, 2.5, 10, 15),
  E('ex-elev-piernas', 'Elevación de piernas', 'core', 60, 0, 10, 20),
  E('ex-plancha', 'Plancha (segundos)', 'core', 60, 0, 30, 60),

  // --- Básicos con mancuernas / barra / banco / polea (sin máquinas raras) ---
  // Pecho
  E('ex-press-mancuernas', 'Press plano con mancuernas', 'pecho', 120),
  E('ex-aperturas-manc', 'Aperturas con mancuernas', 'pecho', 90, 1.25, 10, 15),
  E('ex-lagartijas', 'Lagartijas (push-ups)', 'pecho', 75, 0, 10, 20),
  // Espalda
  E('ex-remo-mancuerna', 'Remo con mancuerna a una mano', 'espalda', 90),
  E('ex-pullover', 'Pull-over con mancuerna', 'espalda', 90),
  E('ex-jalon-cerrado', 'Jalón agarre cerrado', 'espalda', 120),
  E('ex-encogimientos', 'Encogimientos de trapecio', 'espalda', 75, 2.5, 10, 15),
  E('ex-hiperextensiones', 'Hiperextensiones lumbares', 'espalda', 75, 0, 10, 15),
  // Pierna
  E('ex-goblet', 'Sentadilla goblet', 'pierna', 120),
  E('ex-rumano', 'Peso muerto rumano', 'pierna', 150, 2.5, 8, 12),
  E('ex-bulgara', 'Sentadilla búlgara', 'pierna', 120, 2.5, 8, 12),
  E('ex-hip-thrust', 'Hip thrust / puente de glúteo', 'pierna', 120, 5),
  E('ex-step-ups', 'Step-ups al banco', 'pierna', 90),
  E('ex-sumo-manc', 'Sentadilla sumo con mancuerna', 'pierna', 120),
  // Hombros
  E('ex-press-manc-sentado', 'Press de hombros con mancuernas', 'hombros', 120),
  E('ex-arnold', 'Press Arnold', 'hombros', 120),
  E('ex-frontales', 'Elevaciones frontales', 'hombros', 75, 1.25, 10, 15),
  E('ex-face-pull', 'Face pull en polea', 'hombros', 75, 1.25, 12, 15),
  E('ex-remo-menton', 'Remo al mentón', 'hombros', 90, 1.25, 10, 15),
  // Bíceps
  E('ex-curl-alterno', 'Curl alterno con mancuernas', 'biceps'),
  E('ex-curl-concentrado', 'Curl concentrado', 'biceps', 75, 1.25, 10, 15),
  E('ex-curl-polea', 'Curl en polea baja', 'biceps'),
  // Tríceps
  E('ex-triceps-cabeza', 'Extensión sobre cabeza con mancuerna', 'triceps'),
  E('ex-patada-triceps', 'Patada de tríceps', 'triceps', 75, 1.25, 10, 15),
  // Core
  E('ex-crunch', 'Crunch abdominal', 'core', 60, 0, 12, 20),
  E('ex-giro-ruso', 'Giro ruso (russian twist)', 'core', 60, 2.5, 12, 20),
  E('ex-plancha-lateral', 'Plancha lateral (segundos)', 'core', 60, 0, 20, 45),
  E('ex-rodillas-colgado', 'Elevación de rodillas colgado', 'core', 75, 0, 8, 15),
];

export const SEED_ROUTINES = [
  {
    id: 'rt-push', name: 'Push · Empuje', emoji: '🔥',
    items: [
      { exerciseId: 'ex-press-banca', sets: 4 },
      { exerciseId: 'ex-press-incl', sets: 3 },
      { exerciseId: 'ex-press-militar', sets: 3 },
      { exerciseId: 'ex-laterales', sets: 3 },
      { exerciseId: 'ex-triceps-polea', sets: 3 },
    ],
  },
  {
    id: 'rt-pull', name: 'Pull · Jalón', emoji: '⚡',
    items: [
      { exerciseId: 'ex-dominadas', sets: 4 },
      { exerciseId: 'ex-remo-barra', sets: 4 },
      { exerciseId: 'ex-jalon', sets: 3 },
      { exerciseId: 'ex-curl-barra', sets: 3 },
      { exerciseId: 'ex-curl-martillo', sets: 3 },
    ],
  },
  {
    id: 'rt-legs', name: 'Pierna', emoji: '🦵',
    items: [
      { exerciseId: 'ex-sentadilla', sets: 4 },
      { exerciseId: 'ex-prensa', sets: 3 },
      { exerciseId: 'ex-femoral', sets: 3 },
      { exerciseId: 'ex-cuadriceps', sets: 3 },
      { exerciseId: 'ex-talones', sets: 4 },
    ],
  },
];

export async function loadAll() {
  let [exercises, routines, sessions, settings] = await Promise.all([
    db.all('exercises'), db.all('routines'), db.all('sessions'), db.getKV('settings'),
  ]);
  const seeded = await db.getKV('seeded');
  if (!seeded) {
    await Promise.all([
      ...SEED_EXERCISES.map((e) => db.put('exercises', e)),
      ...SEED_ROUTINES.map((r) => db.put('routines', r)),
      db.setKV('seeded', true),
    ]);
    exercises = SEED_EXERCISES.slice();
    routines = SEED_ROUTINES.slice();
  } else {
    // Dispositivos ya sembrados: incorporar ejercicios semilla nuevos
    // agregados en actualizaciones, sin tocar los existentes ni los custom.
    const have = new Set(exercises.map((e) => e.id));
    const missing = SEED_EXERCISES.filter((e) => !have.has(e.id));
    if (missing.length) {
      await Promise.all(missing.map((e) => db.put('exercises', e)));
      exercises = exercises.concat(missing);
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return {
    exercises, routines, sessions,
    settings: Object.assign({ defaultRest: 90, sound: true, vibrate: true }, settings || {}),
  };
}

// ---------- Respaldo ----------
export async function exportJSON(state) {
  const payload = {
    app: 'OVERLOAD', version: 1, exportedAt: new Date().toISOString(),
    exercises: state.exercises, routines: state.routines,
    sessions: state.sessions, settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `overload-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.app !== 'OVERLOAD' || !Array.isArray(data.sessions)) {
    throw new Error('El archivo no es un respaldo válido de OVERLOAD');
  }
  await Promise.all(STORES.slice(0, 3).map((s) => db.clear(s)));
  await Promise.all([
    ...data.exercises.map((e) => db.put('exercises', e)),
    ...data.routines.map((r) => db.put('routines', r)),
    ...data.sessions.map((s) => db.put('sessions', s)),
    db.setKV('settings', data.settings || {}),
    db.setKV('seeded', true),
  ]);
}
