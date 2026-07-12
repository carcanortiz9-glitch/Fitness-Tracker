// ============================================================
// app.js — vistas, navegación e interacción de OVERLOAD
// ============================================================

import { db, uid, MUSCLES, HABITS, loadAll, exportJSON, importJSON } from './db.js';
import {
  e1rm, fmtKg, exHistory, suggestFor, plateauFor, allPlateaus, detectPRs,
  sessionVolume, totalSets, todayISO, sessionsInWeek, volumeByMuscle,
  weeklyVolumes, streakWeeks, weekStart,
  PLAN_PHASES, planWeek, planPhase, planGoals, habitLast7, habitStreak,
} from './engine.js';
import { lineChart, hBars, vBars } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { exercises: [], routines: [], sessions: [], settings: {}, active: null, habitLogs: {}, plan: null };
let currentView = 'home';

const exById = (id) => state.exercises.find((e) => e.id === id);
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>';

// ============================== ARRANQUE ==============================
(async function boot() {
  Object.assign(state, await loadAll());
  state.active = (await db.getKV('activeWorkout')) || null;
  bindNav();
  render('home');
  if (state.active) {
    toast('Tienes un entrenamiento sin terminar — tócalo en «Entrenar»');
  }
})();

function bindNav() {
  $$('.tab[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => render(btn.dataset.nav));
  });
  $('#btn-train').addEventListener('click', () => {
    if (state.active) openWorkout();
    else pickRoutineModal();
  });
  $('#btn-settings').addEventListener('click', settingsModal);
}

function render(view) {
  currentView = view;
  $$('.tab[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  const el = $('#view');
  el.className = 'view view-anim';
  if (view === 'home') renderHome(el);
  else if (view === 'progress') renderProgress(el);
  else if (view === 'history') renderHistory(el);
  else if (view === 'routines') renderRoutines(el);
  el.focus({ preventScroll: true });
}

// ============================== INICIO ==============================
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function lastDoneOf(routineId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if (state.sessions[i].routineId === routineId) return state.sessions[i].date;
  }
  return null;
}

function daysAgoText(iso) {
  if (!iso) return 'Nunca realizada';
  const [y, m, d] = iso.split('-').map(Number);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(y, m - 1, d)) / 86400000);
  return diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : `Hace ${diff} días`;
}

function renderHome(el) {
  const week = sessionsInWeek(state.sessions);
  const weekVol = week.reduce((m, s) => m + sessionVolume(s), 0);
  const streak = streakWeeks(state.sessions);
  const plateaus = allPlateaus(state.exercises, state.sessions);

  // Rutina sugerida: la menos reciente
  const sorted = [...state.routines].sort((a, b) =>
    (lastDoneOf(a.id) || '0000').localeCompare(lastDoneOf(b.id) || '0000'));

  el.innerHTML = `
    <section class="card hero">
      <div class="hi">${greeting()}, Carlos 👊</div>
      <h1>${state.sessions.length ? 'Hoy toca <em>superar</em> lo de la semana pasada.' : 'Tu primer entrenamiento <em>empieza aquí</em>.'}</h1>
      <div class="hero-stats">
        <span class="chip-stat"><span class="fire">🔥</span> <span class="v">${streak}</span> ${streak === 1 ? 'semana' : 'semanas'} de racha</span>
        <span class="chip-stat">🗓️ <span class="v">${week.length}</span> esta semana</span>
        ${weekVol > 0 ? `<span class="chip-stat">🏋️ <span class="v">${fmtKg(weekVol)}</span> kg movidos</span>` : ''}
      </div>
    </section>

    <h2 class="section-title">Mi plan de regreso</h2>
    ${planCardHTML()}

    <h2 class="section-title">Hábitos de hoy</h2>
    ${habitCardHTML()}

    ${plateaus.length ? `
      <h2 class="section-title">⚠️ Alertas de estancamiento</h2>
      ${plateaus.slice(0, 2).map((p) => `
        <section class="card plateau" style="margin-bottom:12px">
          <div class="p-head"><span class="p-ico">📉</span> ${esc(p.exercise.name)}</div>
          <p class="p-tip"><strong>${p.sessions} sesiones</strong> sin superar tu mejor 1RM estimado (${fmtKg(p.bestE1rm)} kg).
          Prueba una descarga a <strong>${fmtKg(p.deloadW)} kg</strong> y vuelve a subir, o cambia el rango de reps.</p>
        </section>`).join('')}
    ` : ''}

    <h2 class="section-title">Entrenar ahora</h2>
    <div class="routine-grid">
      ${sorted.map((r, i) => `
        <button class="card card-press routine-card" data-routine="${r.id}">
          <span class="routine-emoji">${r.emoji || '💪'}</span>
          <span class="routine-info">
            <span class="routine-name">${esc(r.name)}${i === 0 && state.routines.length > 1 ? ' · <span style="color:var(--lime);font-size:11px">SUGERIDA</span>' : ''}</span>
            <span class="routine-meta">${r.items.length} ejercicios · ${daysAgoText(lastDoneOf(r.id))}</span>
          </span>
          <span class="routine-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></span>
        </button>`).join('')}
    </div>
    ${!state.sessions.length ? `
      <div class="empty">
        <span class="e-ico">🚀</span>
        <div class="e-title">Todo listo para arrancar</div>
        <p>Elige una rutina arriba. Al registrar tu primera sesión, la app empezará a sugerirte cuándo subir peso o reps.</p>
      </div>` : ''}
  `;
  $$('[data-routine]', el).forEach((b) =>
    b.addEventListener('click', () => startWorkout(b.dataset.routine)));
  $$('[data-habit]', el).forEach((b) =>
    b.addEventListener('click', () => toggleHabit(b.dataset.habit, b)));
  $('#plan-open', el)?.addEventListener('click', planModal);
}

// ---------- Plan coach ----------
function planCardHTML() {
  if (!state.plan) {
    return `
      <button class="card card-press plan-card plan-cta" id="plan-open">
        <span class="plan-ico">🧭</span>
        <span class="plan-info">
          <span class="plan-title">Comenzar mi plan de regreso</span>
          <span class="plan-sub">3 fases guiadas: readaptación con rodilla protegida → reconstrucción → hipertrofia.</span>
        </span>
        <span class="routine-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></span>
      </button>`;
  }
  const week = planWeek(state.plan.startISO);
  const phase = planPhase(week);
  const P = PLAN_PHASES[phase];
  const goals = planGoals(phase, state.sessions);
  const doneCount = goals.filter((g) => g.done).length;
  return `
    <button class="card card-press plan-card" id="plan-open">
      <div class="plan-head">
        <span class="plan-ico">${P.icon}</span>
        <span class="plan-info">
          <span class="plan-title">Fase ${phase} · ${P.name}</span>
          <span class="plan-sub">Semana ${week} · objetivos ${doneCount}/${goals.length} cumplidos</span>
        </span>
        <span class="plan-phase-chip">${P.weeksLabel}</span>
      </div>
      <div class="plan-goals">
        ${goals.map((g) => `
          <span class="goal ${g.done ? 'ok' : ''}">
            <i>${g.done ? '✓' : `${g.now}/${g.target}`}</i> ${g.text}
          </span>`).join('')}
      </div>
    </button>`;
}

function planModal() {
  const active = !!state.plan;
  const week = active ? planWeek(state.plan.startISO) : 0;
  const curPhase = active ? planPhase(week) : 0;
  const m = openModal(`
    <h2>🧭 Plan de regreso · 3 fases</h2>
    <p class="m-sub">${active ? `Vas en la semana ${week}. La fase avanza sola con las semanas.` : 'Después de 7 meses fuera, la clave es progresar sin lesionarte. Así va el camino:'}</p>
    ${[1, 2, 3].map((n) => {
      const P = PLAN_PHASES[n];
      return `
      <div class="card phase-row ${curPhase === n ? 'current' : ''}" style="margin-bottom:10px;padding:15px">
        <div class="phase-head"><span>${P.icon}</span>
          <strong>Fase ${n} · ${P.name}</strong>
          <span class="phase-weeks">${P.weeksLabel}</span>
          ${curPhase === n ? '<span class="phase-now">AQUÍ VAS</span>' : ''}
        </div>
        <p class="phase-desc">${P.desc}</p>
      </div>`;
    }).join('')}
    <p class="m-sub" style="margin-top:6px">⚠️ Viniendo de lesión en ambas rodillas: si algo duele, se cambia o se baja la carga. Idealmente valida la selección con un fisioterapeuta.</p>
    ${active
      ? '<button class="btn btn-danger btn-block" id="plan-reset">Reiniciar plan desde la Fase 1</button>'
      : '<button class="btn btn-primary btn-block" id="plan-start">Comenzar hoy · Fase 1 🩹</button>'}
  `);
  $('#plan-start', m)?.addEventListener('click', async () => {
    state.plan = { startISO: todayISO() };
    await db.setKV('plan', state.plan);
    closeModal();
    render('home');
    toast('Plan iniciado. Fase 1: protege la rodilla y reconecta 💪');
  });
  $('#plan-reset', m)?.addEventListener('click', () => {
    confirmModal('¿Reiniciar el plan desde la Fase 1, semana 1?', async () => {
      state.plan = { startISO: todayISO() };
      await db.setKV('plan', state.plan);
      closeModal();
      render('home');
    });
  });
}

// ---------- Hábitos ----------
function habitCardHTML() {
  const today = todayISO();
  const log = state.habitLogs[today] || {};
  const done = HABITS.filter((h) => log[h.id]).length;
  const streak = habitStreak(state.habitLogs);
  return `
    <section class="card habit-card">
      <div class="habit-grid">
        ${HABITS.map((h) => `
          <button class="habit-chip ${log[h.id] ? 'on' : ''}" data-habit="${h.id}">
            <span class="h-ico">${h.icon}</span>
            <span class="h-name">${h.name}</span>
            <span class="h-check">${log[h.id] ? '✓' : ''}</span>
          </button>`).join('')}
      </div>
      <div class="habit-foot">
        <span id="habit-count"><strong>${done}/${HABITS.length}</strong> hoy</span>
        <span>🔥 <strong>${streak}</strong> ${streak === 1 ? 'día' : 'días'} de racha</span>
      </div>
    </section>`;
}

async function toggleHabit(id, btn) {
  const today = todayISO();
  const log = state.habitLogs[today] || (state.habitLogs[today] = {});
  log[id] = !log[id];
  await db.put('habitLogs', { id: today, done: log });
  btn.classList.toggle('on', log[id]);
  btn.querySelector('.h-check').textContent = log[id] ? '✓' : '';
  const done = HABITS.filter((h) => log[h.id]).length;
  const counter = $('#habit-count');
  if (counter) counter.innerHTML = `<strong>${done}/${HABITS.length}</strong> hoy`;
}

// ============================== ENTRENAMIENTO ==============================
function pickRoutineModal() {
  const m = openModal(`
    <h2>¿Qué toca hoy?</h2>
    <p class="m-sub">Elige una rutina para empezar a registrar.</p>
    <div class="routine-grid">
      ${state.routines.map((r) => `
        <button class="card card-press routine-card" data-pick="${r.id}">
          <span class="routine-emoji">${r.emoji || '💪'}</span>
          <span class="routine-info">
            <span class="routine-name">${esc(r.name)}</span>
            <span class="routine-meta">${r.items.length} ejercicios · ${daysAgoText(lastDoneOf(r.id))}</span>
          </span>
        </button>`).join('')}
    </div>
    <div style="margin-top:14px">
      <button class="btn btn-ghost btn-block" data-pick="__empty">🧪 Sesión libre (sin rutina)</button>
    </div>
  `);
  $$('[data-pick]', m).forEach((b) => b.addEventListener('click', () => {
    closeModal();
    startWorkout(b.dataset.pick === '__empty' ? null : b.dataset.pick);
  }));
}

function prefillFromHistory(exId, setIdx) {
  const hist = exHistory(state.sessions, exId);
  if (!hist.length) return { w: '', r: '', prev: '—' };
  const last = hist[hist.length - 1];
  const s = last.sets[Math.min(setIdx, last.sets.length - 1)];
  return { w: s.w, r: s.r, prev: `${fmtKg(s.w)} kg × ${s.r}` };
}

function buildEntry(ex, nSets) {
  const sets = [];
  for (let i = 0; i < nSets; i++) {
    const p = prefillFromHistory(ex.id, i);
    sets.push({ w: p.w, r: p.r, prev: p.prev, done: false });
  }
  return { exerciseId: ex.id, name: ex.name, muscle: ex.muscle, sets };
}

function startWorkout(routineId) {
  if (state.active) { openWorkout(); return; }
  const r = routineId ? state.routines.find((x) => x.id === routineId) : null;
  const entries = r
    ? r.items.map((it) => {
        const ex = exById(it.exerciseId);
        return ex ? buildEntry(ex, it.sets) : null;
      }).filter(Boolean)
    : [];
  state.active = {
    id: uid(), routineId: r ? r.id : null,
    name: r ? r.name : 'Sesión libre', emoji: r ? r.emoji : '🧪',
    startedAt: Date.now(), entries,
  };
  saveActive();
  openWorkout();
}

const saveActive = () => db.setKV('activeWorkout', state.active);

let elapsedInt = null;

function openWorkout() {
  const wk = $('#workout');
  wk.classList.remove('hidden', 'closing');
  renderWorkout();
  clearInterval(elapsedInt);
  elapsedInt = setInterval(() => {
    const t = $('#wk-elapsed');
    if (t && state.active) t.textContent = elapsedText();
  }, 1000);
}

function elapsedText() {
  const s = Math.floor((Date.now() - state.active.startedAt) / 1000);
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')} min`;
}

function closeWorkout() {
  const wk = $('#workout');
  clearInterval(elapsedInt);
  wk.classList.add('closing');
  setTimeout(() => { wk.classList.add('hidden'); wk.innerHTML = ''; }, 300);
  $('#rest-pill').classList.remove('in-workout');
}

function renderWorkout() {
  const a = state.active;
  const wk = $('#workout');
  wk.innerHTML = `
    <div class="wk-shell">
      <div class="wk-top">
        <div>
          <div class="wk-title">${a.emoji || '💪'} ${esc(a.name)}</div>
          <div class="wk-elapsed" id="wk-elapsed">${elapsedText()}</div>
        </div>
        <button class="wk-close" id="wk-min" aria-label="Minimizar">⌄</button>
      </div>
      <div id="wk-list">
        ${a.entries.map((en, ei) => exCardHTML(en, ei)).join('')}
      </div>
      <button class="add-set" id="wk-add-ex" style="padding:14px">＋ Agregar ejercicio</button>
    </div>
    <div class="wk-finishbar">
      <button class="btn btn-danger" id="wk-cancel">Descartar</button>
      <button class="btn btn-primary btn-block" id="wk-finish">Terminar entrenamiento ✔</button>
    </div>
  `;
  $('#wk-min').addEventListener('click', closeWorkout);
  $('#wk-cancel').addEventListener('click', cancelWorkout);
  $('#wk-finish').addEventListener('click', finishWorkout);
  $('#wk-add-ex').addEventListener('click', () => exercisePicker((ex) => {
    state.active.entries.push(buildEntry(ex, 3));
    saveActive(); renderWorkout();
  }));
  bindWorkoutList();
  if (!$('#rest-pill').classList.contains('hidden')) $('#rest-pill').classList.add('in-workout');
}

function exCardHTML(en, ei) {
  const ex = exById(en.exerciseId) || { repMin: 8, repMax: 12, increment: 2.5, muscle: en.muscle, name: en.name };
  const hist = exHistory(state.sessions, en.exerciseId);
  const sug = suggestFor(ex, hist);
  const plateau = plateauFor(ex, hist);
  return `
    <section class="card ex-card" data-ei="${ei}">
      <div class="ex-head">
        <div>
          <div class="ex-name">${esc(en.name)}</div>
          <span class="ex-muscle">${MUSCLES[en.muscle]?.name || en.muscle}</span>
        </div>
        <button class="ex-menu" data-rm-ex="${ei}" aria-label="Quitar ejercicio">✕</button>
      </div>
      ${plateau ? `
        <div class="suggest warn"><span class="s-ico">📉</span><span>
        <strong>Estancado ${plateau.sessions} sesiones.</strong> Opción: descarga a <strong>${fmtKg(plateau.deloadW)} kg</strong> y reconstruye.</span></div>`
      : `<div class="suggest"><span class="s-ico">${sug.icon}</span><span>${sug.text}</span></div>`}
      <div class="set-table">
        <div class="set-head"><span>#</span><span>Anterior</span><span>kg</span><span>Reps</span><span></span></div>
        ${en.sets.map((s, si) => `
          <div class="set-row ${s.done ? 'done' : ''}" data-si="${si}">
            <span class="set-num">${si + 1}</span>
            <span class="set-prev">${esc(s.prev || '—')}</span>
            <input class="set-input" data-f="w" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="${s.w !== '' ? s.w : ''}">
            <input class="set-input" data-f="r" type="number" inputmode="numeric" step="1" min="0" placeholder="reps" value="${s.r !== '' ? s.r : ''}">
            <button class="set-check" aria-label="Marcar serie">${CHECK_SVG}</button>
          </div>`).join('')}
      </div>
      <button class="add-set" data-add-set="${ei}">＋ Agregar serie</button>
    </section>
  `;
}

function bindWorkoutList() {
  const list = $('#wk-list');

  list.addEventListener('input', (e) => {
    const row = e.target.closest('.set-row'); if (!row) return;
    const en = state.active.entries[+row.closest('.ex-card').dataset.ei];
    const s = en.sets[+row.dataset.si];
    const f = e.target.dataset.f;
    s[f] = e.target.value === '' ? '' : parseFloat(e.target.value);
    saveActive();
  });

  list.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm-ex]');
    if (rm) {
      const ei = +rm.dataset.rmEx;
      confirmModal(`¿Quitar «${esc(state.active.entries[ei].name)}» de esta sesión?`, () => {
        state.active.entries.splice(ei, 1);
        saveActive(); renderWorkout();
      });
      return;
    }
    const add = e.target.closest('[data-add-set]');
    if (add) {
      const en = state.active.entries[+add.dataset.addSet];
      const lastSet = en.sets[en.sets.length - 1];
      en.sets.push({ w: lastSet ? lastSet.w : '', r: lastSet ? lastSet.r : '', prev: '—', done: false });
      saveActive(); renderWorkout();
      return;
    }
    const check = e.target.closest('.set-check');
    if (check) {
      const row = check.closest('.set-row');
      const card = row.closest('.ex-card');
      const en = state.active.entries[+card.dataset.ei];
      const s = en.sets[+row.dataset.si];
      s.done = !s.done;
      row.classList.toggle('done', s.done);
      saveActive();
      if (s.done && s.w > 0 && s.r > 0) {
        const ex = exById(en.exerciseId);
        startRest(ex ? ex.rest : state.settings.defaultRest);
        // ¿es PR al vuelo?
        const hist = exHistory(state.sessions, en.exerciseId);
        const prevBest = hist.reduce((m, h) => Math.max(m, h.best), 0);
        if (hist.length && e1rm(s.w, s.r) > prevBest + 0.01) {
          row.classList.add('pr-flash');
          toast(`💥 ¡Récord en ${en.name}!`);
        }
      }
    }
  });
}

function cancelWorkout() {
  confirmModal('¿Descartar este entrenamiento? Se perderán las series registradas.', async () => {
    state.active = null;
    await db.delKV('activeWorkout');
    closeWorkout();
    render('home');
  });
}

async function finishWorkout() {
  const a = state.active;
  const entries = a.entries
    .map((en) => ({ ...en, sets: en.sets.filter((s) => s.done && s.w > 0 && s.r > 0).map(({ w, r }) => ({ w, r })) }))
    .filter((en) => en.sets.length);
  if (!entries.length) {
    toast('Marca al menos una serie completada (✓) antes de terminar');
    return;
  }
  const session = {
    id: a.id, date: todayISO(), routineId: a.routineId,
    name: a.name, emoji: a.emoji,
    durationMin: Math.max(1, Math.round((Date.now() - a.startedAt) / 60000)),
    entries: entries.map(({ exerciseId, name, muscle, sets }) => ({ exerciseId, name, muscle, sets })),
  };
  const prs = detectPRs(session, state.sessions);
  session.prs = prs.length;

  await db.put('sessions', session);
  state.sessions.push(session);
  state.sessions.sort((x, y) => x.date.localeCompare(y.date));
  state.active = null;
  await db.delKV('activeWorkout');
  stopRest();
  closeWorkout();
  celebrate(session, prs);
  render('home');
}

// ============================== CELEBRACIÓN ==============================
function celebrate(session, prs) {
  const c = $('#celebrate');
  const colors = ['#41e6ff', '#ff6ab8', '#b9f65a', '#ffc753', '#7c9bff'];
  const confetti = prs.length ? 90 : 40;
  let pieces = '';
  for (let i = 0; i < confetti; i++) {
    pieces += `<span class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};
      animation-duration:${2.4 + Math.random() * 2.2}s;animation-delay:${Math.random() * .9}s"></span>`;
  }
  c.innerHTML = `
    ${pieces}
    <div class="card summary-card">
      <span class="s-badge">${prs.length ? '🏆' : '✅'}</span>
      <h2>${prs.length ? `¡${prs.length} récord${prs.length > 1 ? 's' : ''} personal${prs.length > 1 ? 'es' : ''}!` : 'Sesión completada'}</h2>
      <div class="summary-stats">
        <div class="ss"><div class="v">${session.durationMin}′</div><div class="l">Duración</div></div>
        <div class="ss"><div class="v">${totalSets(session)}</div><div class="l">Series</div></div>
        <div class="ss"><div class="v">${fmtKg(sessionVolume(session))}</div><div class="l">kg totales</div></div>
      </div>
      ${prs.length ? `<div class="pr-list">${prs.map((p) => `
        <div class="pr-item"><span>${p.icon}</span><span style="flex:1">${esc(p.ex)}</span>
        <span class="pr-what">${p.kind}: ${p.value}</span></div>`).join('')}</div>` : ''}
      <button class="btn btn-primary btn-block" id="cel-ok">¡Seguimos! 💪</button>
    </div>
  `;
  c.classList.remove('hidden');
  $('#cel-ok').addEventListener('click', () => { c.classList.add('hidden'); c.innerHTML = ''; });
}

// ============================== DESCANSO ==============================
const rest = { int: null, endsAt: 0, total: 0 };
const RING_LEN = 119.4;

function startRest(seconds) {
  const secs = seconds || state.settings.defaultRest || 90;
  rest.total = secs;
  rest.endsAt = Date.now() + secs * 1000;
  const pill = $('#rest-pill');
  pill.classList.remove('hidden');
  pill.classList.toggle('in-workout', !$('#workout').classList.contains('hidden'));
  clearInterval(rest.int);
  rest.int = setInterval(tickRest, 250);
  tickRest();
}

function tickRest() {
  const left = Math.max(0, (rest.endsAt - Date.now()) / 1000);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  $('#rest-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
  $('.ring-fg').style.strokeDashoffset = RING_LEN * (1 - left / rest.total);
  if (left <= 0) {
    stopRest();
    notifyRestDone();
  }
}

function stopRest() {
  clearInterval(rest.int);
  $('#rest-pill').classList.add('hidden');
}

function notifyRestDone() {
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([180, 90, 180]);
  if (state.settings.sound) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
    } catch { /* sin audio disponible */ }
  }
  toast('⏱️ ¡Descanso terminado, a darle!');
}

$('#rest-plus').addEventListener('click', () => { rest.endsAt += 15000; rest.total += 15; tickRest(); });
$('#rest-minus').addEventListener('click', () => { rest.endsAt -= 15000; tickRest(); });
$('#rest-skip').addEventListener('click', stopRest);

// ============================== PROGRESO ==============================
function renderProgress(el) {
  const now = todayISO();
  const week = sessionsInWeek(state.sessions);
  const weekVol = week.reduce((m, s) => m + sessionVolume(s), 0);
  const prevRef = (() => { const d = new Date(); d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const prevWeek = sessionsInWeek(state.sessions, prevRef);
  const prevVol = prevWeek.reduce((m, s) => m + sessionVolume(s), 0);
  const delta = prevVol > 0 ? Math.round(((weekVol - prevVol) / prevVol) * 100) : null;

  const monthISO = now.slice(0, 7);
  const monthSessions = state.sessions.filter((s) => s.date.startsWith(monthISO));
  const monthPRs = monthSessions.reduce((m, s) => m + (s.prs || 0), 0);
  const streak = streakWeeks(state.sessions);
  const plateaus = allPlateaus(state.exercises, state.sessions);

  const trackedExs = state.exercises
    .map((ex) => ({ ex, n: exHistory(state.sessions, ex.id).length }))
    .filter((x) => x.n >= 1)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.ex);

  el.innerHTML = `
    <div class="tiles">
      <section class="card tile"><div class="t-label">Volumen semana</div>
        <div class="t-value">${fmtKg(weekVol)}<span class="t-unit">kg</span></div>
        ${delta !== null ? `<div class="t-sub ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs anterior</div>` : '<div class="t-sub">Sin semana previa</div>'}
      </section>
      <section class="card tile"><div class="t-label">Sesiones del mes</div>
        <div class="t-value">${monthSessions.length}</div>
        <div class="t-sub">${week.length} esta semana</div>
      </section>
      <section class="card tile"><div class="t-label">Racha</div>
        <div class="t-value">${streak}<span class="t-unit">sem</span></div>
        <div class="t-sub">${streak > 0 ? '🔥 sin fallar' : 'arranca hoy'}</div>
      </section>
      <section class="card tile"><div class="t-label">PRs del mes</div>
        <div class="t-value">${monthPRs}</div>
        <div class="t-sub">${plateaus.length ? `⚠️ ${plateaus.length} estancado${plateaus.length > 1 ? 's' : ''}` : '✓ sin mesetas'}</div>
      </section>
    </div>

    <div class="grid-2col">
      <div>
        <h2 class="section-title">Fuerza · 1RM estimado</h2>
        <section class="card chart-card">
          <div class="c-head">
            <div><div class="c-title">Progresión de fuerza</div><div class="c-sub">Mejor 1RM estimado por sesión (Epley)</div></div>
            <select class="select-glass" id="prog-ex">
              ${trackedExs.map((ex, i) => `<option value="${ex.id}" ${i === 0 ? 'selected' : ''}>${esc(ex.name)}</option>`).join('')}
            </select>
          </div>
          <div id="chart-e1rm"></div>
        </section>

        <h2 class="section-title">Volumen semanal</h2>
        <section class="card chart-card">
          <div class="c-head"><div><div class="c-title">Kilos movidos por semana</div><div class="c-sub">Últimas 8 semanas · la actual resaltada</div></div></div>
          <div id="chart-weeks"></div>
        </section>
      </div>
      <div>
        <h2 class="section-title">Hábitos · reporte semanal</h2>
        <section class="card chart-card">
          <div class="c-head"><div><div class="c-title">Últimos 7 días</div><div class="c-sub">Cumplimiento diario y por hábito · 🔥 ${habitStreak(state.habitLogs)} días de racha</div></div></div>
          <div class="habit-week">
            ${habitLast7(state.habitLogs, HABITS.length).map((d) => `
              <div class="hw-day ${d.date === todayISO() ? 'today' : ''}" title="${d.done}/${HABITS.length}">
                <div class="hw-bar"><i style="height:${Math.round(d.pct * 100)}%"></i></div>
                <span class="hw-dow">${d.dow}</span>
                <span class="hw-n">${d.done || ''}</span>
              </div>`).join('')}
          </div>
          <div class="habit-counts">
            ${HABITS.map((h) => {
              const n = habitLast7(state.habitLogs, HABITS.length).filter((d) => (state.habitLogs[d.date] || {})[h.id]).length;
              return `<span class="hc ${n >= 5 ? 'ok' : ''}">${h.icon} ${n}/7</span>`;
            }).join('')}
          </div>
        </section>

        <h2 class="section-title">Volumen por músculo</h2>
        <section class="card chart-card">
          <div class="c-head"><div><div class="c-title">Últimos 7 días</div><div class="c-sub">¿Algún grupo abandonado?</div></div></div>
          <div id="chart-muscle"></div>
        </section>

        <h2 class="section-title">Mesetas detectadas</h2>
        ${plateaus.length ? plateaus.map((p) => `
          <section class="card plateau" style="margin-bottom:12px">
            <div class="p-head"><span class="p-ico">📉</span> ${esc(p.exercise.name)}</div>
            <p class="p-tip"><strong>${p.sessions} sesiones</strong> sin superar ${fmtKg(p.bestE1rm)} kg de 1RM estimado.
            Sugerencia: descarga a <strong>${fmtKg(p.deloadW)} kg</strong> (−10 %) y sube de nuevo, o cambia el rango de reps / la variante del ejercicio.</p>
          </section>`).join('')
        : `<section class="card"><div class="chart-empty"><span class="ce-ico">🟢</span>Ninguna meseta activa.<br>Todos tus ejercicios siguen progresando.</div></section>`}
      </div>
    </div>
  `;

  // Gráfica 1RM
  const sel = $('#prog-ex', el);
  const drawE1rm = () => {
    const box = $('#chart-e1rm', el);
    if (!sel || !sel.value) {
      box.innerHTML = `<div class="chart-empty"><span class="ce-ico">📈</span>Registra tu primer entrenamiento<br>para ver tu curva de fuerza.</div>`;
      return;
    }
    const hist = exHistory(state.sessions, sel.value);
    if (hist.length < 2) {
      box.innerHTML = `<div class="chart-empty"><span class="ce-ico">📈</span>Con 2+ sesiones de este ejercicio<br>aparece la curva de progresión.</div>`;
      return;
    }
    lineChart(box, hist.map((h) => ({
      label: fmtDateShort(h.date), sub: `${fmtKg(h.topW)} kg máx`, y: Math.round(h.best * 10) / 10,
    })), { color: '#189ec2', unit: 'kg' });
  };
  if (sel) sel.addEventListener('change', drawE1rm);
  drawE1rm();

  // Volumen semanal
  const weeks = weeklyVolumes(state.sessions, 8);
  const anyVol = weeks.some((w) => w.vol > 0);
  if (anyVol) {
    vBars($('#chart-weeks', el), weeks.map((w, i) => ({
      label: 'S' + fmtDateShort(w.week).replace(/ /g, ''), value: Math.round(w.vol),
      tooltip: 'Semana del ' + fmtDateShort(w.week), current: i === weeks.length - 1,
    })), { color: '#63ab35', unit: 'kg' });
  } else {
    $('#chart-weeks', el).innerHTML = `<div class="chart-empty"><span class="ce-ico">📊</span>Aquí verás tus kilos totales por semana<br>en cuanto registres sesiones.</div>`;
  }

  // Volumen por músculo
  const byMuscle = volumeByMuscle(state.sessions, state.exercises, 7);
  const rows = Object.entries(byMuscle)
    .map(([k, v]) => ({ label: MUSCLES[k]?.name || k, value: Math.round(v) }))
    .sort((a, b) => b.value - a.value);
  if (rows.length) {
    hBars($('#chart-muscle', el), rows, { color: '#189ec2', unit: 'kg' });
  } else {
    $('#chart-muscle', el).innerHTML = `<div class="chart-empty"><span class="ce-ico">🧩</span>Sin datos esta semana.<br>El desglose por músculo aparece al entrenar.</div>`;
  }
}

function fmtDateShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ============================== HISTORIAL ==============================
let calCursor = null; // {y, m}

function renderHistory(el) {
  if (!calCursor) {
    const n = new Date();
    calCursor = { y: n.getFullYear(), m: n.getMonth() };
  }
  el.innerHTML = `
    <h2 class="section-title">Calendario</h2>
    <section class="card" id="cal-card"></section>
    <h2 class="section-title">Sesiones recientes</h2>
    <div id="hist-list" class="routine-grid"></div>
  `;
  drawCalendar($('#cal-card', el));
  drawSessionList($('#hist-list', el));
}

function drawCalendar(box) {
  const { y, m } = calCursor;
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // lunes = 0
  const monthName = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const today = todayISO();

  const byDay = {};
  for (const s of state.sessions) {
    if (s.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)) {
      (byDay[s.date] = byDay[s.date] || []).push(s);
    }
  }

  let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const has = byDay[iso];
    cells += `<div class="cal-day ${has ? 'has' : ''} ${iso === today ? 'today' : ''}" ${has ? `data-day="${iso}"` : ''}>${d}</div>`;
  }

  box.innerHTML = `
    <div class="cal-head">
      <span class="cal-title">${monthName}</span>
      <div class="cal-nav">
        <button id="cal-prev" aria-label="Mes anterior">‹</button>
        <button id="cal-next" aria-label="Mes siguiente">›</button>
      </div>
    </div>
    <div class="cal-grid">${cells}</div>
  `;
  $('#cal-prev', box).addEventListener('click', () => {
    calCursor.m--; if (calCursor.m < 0) { calCursor.m = 11; calCursor.y--; }
    drawCalendar(box);
  });
  $('#cal-next', box).addEventListener('click', () => {
    calCursor.m++; if (calCursor.m > 11) { calCursor.m = 0; calCursor.y++; }
    drawCalendar(box);
  });
  $$('[data-day]', box).forEach((c) => c.addEventListener('click', () => {
    const list = byDay[c.dataset.day];
    if (list.length === 1) sessionDetailModal(list[0]);
    else sessionDetailModal(list[list.length - 1]);
  }));
}

function drawSessionList(box) {
  const recent = [...state.sessions].reverse().slice(0, 20);
  if (!recent.length) {
    box.innerHTML = `<div class="empty"><span class="e-ico">📭</span>
      <div class="e-title">Aún no hay sesiones</div>
      <p>Cuando termines tu primer entrenamiento aparecerá aquí, con su detalle completo.</p></div>`;
    return;
  }
  box.innerHTML = recent.map((s) => {
    const [yy, mm, dd] = s.date.split('-').map(Number);
    const mes = new Date(yy, mm - 1, dd).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
    return `
      <button class="card card-press session-row" data-session="${s.id}">
        <span class="session-date"><div class="d">${dd}</div><div class="m">${mes}</div></span>
        <span class="session-info">
          <span class="session-name">${s.emoji || '💪'} ${esc(s.name)}</span>
          <span class="session-meta">${s.entries.length} ejercicios · ${totalSets(s)} series · ${fmtKg(sessionVolume(s))} kg · ${s.durationMin}′</span>
        </span>
        ${s.prs ? `<span class="session-pr">🏆 ${s.prs} PR</span>` : ''}
      </button>`;
  }).join('');
  $$('[data-session]', box).forEach((b) => b.addEventListener('click', () => {
    const s = state.sessions.find((x) => x.id === b.dataset.session);
    if (s) sessionDetailModal(s);
  }));
}

function sessionDetailModal(s) {
  const [yy, mm, dd] = s.date.split('-').map(Number);
  const fecha = new Date(yy, mm - 1, dd).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const m = openModal(`
    <h2>${s.emoji || '💪'} ${esc(s.name)}</h2>
    <p class="m-sub" style="text-transform:capitalize">${fecha} · ${s.durationMin} min · ${fmtKg(sessionVolume(s))} kg totales</p>
    ${s.entries.map((en) => `
      <div class="card" style="margin-bottom:10px;padding:14px">
        <div style="font-weight:800;font-size:14px;margin-bottom:8px">${esc(en.name)}</div>
        ${en.sets.map((st, i) => `
          <div style="display:flex;justify-content:space-between;font-size:13.5px;padding:5px 2px;color:var(--ink-2)">
            <span>Serie ${i + 1}</span>
            <span style="font-weight:800;color:var(--ink)">${fmtKg(st.w)} kg × ${st.r}</span>
            <span style="color:var(--ink-3)">e1RM ${fmtKg(e1rm(st.w, st.r))}</span>
          </div>`).join('')}
      </div>`).join('')}
    <button class="btn btn-danger btn-block" id="del-session" style="margin-top:8px">Eliminar esta sesión</button>
  `);
  $('#del-session', m).addEventListener('click', () => {
    confirmModal('¿Eliminar esta sesión del historial? No se puede deshacer.', async () => {
      await db.del('sessions', s.id);
      state.sessions = state.sessions.filter((x) => x.id !== s.id);
      closeModal();
      render(currentView);
      toast('Sesión eliminada');
    });
  });
}

// ============================== RUTINAS ==============================
function renderRoutines(el) {
  el.innerHTML = `
    <h2 class="section-title">Mis rutinas</h2>
    <div class="routine-grid">
      ${state.routines.map((r) => `
        <button class="card card-press routine-card" data-edit="${r.id}">
          <span class="routine-emoji">${r.emoji || '💪'}</span>
          <span class="routine-info">
            <span class="routine-name">${esc(r.name)}</span>
            <span class="routine-meta">${r.items.map((it) => esc(exById(it.exerciseId)?.name || '?')).slice(0, 3).join(' · ')}${r.items.length > 3 ? ` +${r.items.length - 3}` : ''}</span>
          </span>
          <span class="routine-go" style="background:rgba(255,255,255,.1);color:var(--ink-2);box-shadow:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </span>
        </button>`).join('')}
    </div>
    <div style="display:grid;gap:10px;margin-top:16px">
      <button class="btn btn-primary btn-block" id="new-routine">＋ Nueva rutina</button>
      <button class="btn btn-ghost btn-block" id="manage-ex">🗂️ Biblioteca de ejercicios</button>
    </div>
  `;
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () =>
    routineEditor(state.routines.find((r) => r.id === b.dataset.edit))));
  $('#new-routine', el).addEventListener('click', () => routineEditor(null));
  $('#manage-ex', el).addEventListener('click', libraryModal);
}

const EMOJIS = ['💪', '🔥', '⚡', '🦵', '🏋️', '🫸', '🫷', '🧨', '🚀', '🐉'];

function routineEditor(routine) {
  const draft = routine
    ? JSON.parse(JSON.stringify(routine))
    : { id: uid(), name: '', emoji: '💪', items: [] };

  const m = openModal(`
    <h2>${routine ? 'Editar rutina' : 'Nueva rutina'}</h2>
    <p class="m-sub">Define nombre, ícono y ejercicios con sus series objetivo.</p>
    <div class="field"><label>Nombre</label>
      <input id="r-name" type="text" placeholder="Ej. Push · Empuje" value="${esc(draft.name)}" maxlength="40"></div>
    <div class="field"><label>Ícono</label>
      <div class="emoji-pick">${EMOJIS.map((e) => `<button data-emoji="${e}" class="${draft.emoji === e ? 'sel' : ''}">${e}</button>`).join('')}</div></div>
    <div class="field"><label>Ejercicios</label>
      <div class="r-ex-list" id="r-ex-list"></div>
      <button class="btn btn-ghost btn-block btn-sm" id="r-add-ex">＋ Agregar ejercicio</button></div>
    <div style="display:grid;gap:10px;margin-top:18px">
      <button class="btn btn-primary btn-block" id="r-save">Guardar rutina</button>
      ${routine ? '<button class="btn btn-danger btn-block" id="r-del">Eliminar rutina</button>' : ''}
    </div>
  `);

  const drawItems = () => {
    $('#r-ex-list', m).innerHTML = draft.items.length ? draft.items.map((it, i) => `
      <div class="r-ex-item">
        <span class="n">${esc(exById(it.exerciseId)?.name || '?')}</span>
        <span class="sets-ctrl">
          <button data-dec="${i}">−</button><span>${it.sets}×</span><button data-inc="${i}">＋</button>
        </span>
        <button class="rm" data-rm="${i}">✕</button>
      </div>`).join('')
    : '<div style="font-size:13px;color:var(--ink-3);padding:8px 2px">Sin ejercicios todavía.</div>';

    $$('[data-dec]', m).forEach((b) => b.addEventListener('click', () => {
      const it = draft.items[+b.dataset.dec];
      it.sets = Math.max(1, it.sets - 1); drawItems();
    }));
    $$('[data-inc]', m).forEach((b) => b.addEventListener('click', () => {
      draft.items[+b.dataset.inc].sets = Math.min(10, draft.items[+b.dataset.inc].sets + 1); drawItems();
    }));
    $$('[data-rm]', m).forEach((b) => b.addEventListener('click', () => {
      draft.items.splice(+b.dataset.rm, 1); drawItems();
    }));
  };
  drawItems();

  $$('[data-emoji]', m).forEach((b) => b.addEventListener('click', () => {
    draft.emoji = b.dataset.emoji;
    $$('[data-emoji]', m).forEach((x) => x.classList.toggle('sel', x === b));
  }));
  $('#r-add-ex', m).addEventListener('click', () => exercisePicker((ex) => {
    draft.items.push({ exerciseId: ex.id, sets: 3 });
    drawItems();
  }, true));
  $('#r-save', m).addEventListener('click', async () => {
    draft.name = $('#r-name', m).value.trim();
    if (!draft.name) { toast('Ponle nombre a la rutina'); return; }
    if (!draft.items.length) { toast('Agrega al menos un ejercicio'); return; }
    await db.put('routines', draft);
    const idx = state.routines.findIndex((r) => r.id === draft.id);
    if (idx >= 0) state.routines[idx] = draft; else state.routines.push(draft);
    closeModal();
    render('routines');
    toast('Rutina guardada ✓');
  });
  if (routine) $('#r-del', m).addEventListener('click', () => {
    confirmModal(`¿Eliminar la rutina «${esc(routine.name)}»? Tu historial de sesiones no se borra.`, async () => {
      await db.del('routines', routine.id);
      state.routines = state.routines.filter((r) => r.id !== routine.id);
      closeModal();
      render('routines');
    });
  });
}

// Selector de ejercicios (stacked: no cierra el modal anterior si stacked=true)
function exercisePicker(onPick, stacked = false) {
  const m = openModal(`
    <h2>Elegir ejercicio</h2>
    <div class="ex-search"><input id="ex-q" type="search" placeholder="Buscar… (ej. press, curl)" autocomplete="off"></div>
    <div id="ex-results"></div>
    <button class="btn btn-ghost btn-block btn-sm" id="ex-new" style="margin-top:10px">＋ Crear ejercicio nuevo</button>
  `, stacked);

  const draw = (q = '') => {
    const t = q.trim().toLowerCase();
    const list = state.exercises
      .filter((e) => !t || e.name.toLowerCase().includes(t) || (MUSCLES[e.muscle]?.name || '').toLowerCase().includes(t))
      .sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));
    $('#ex-results', m).innerHTML = list.map((e) => `
      <button class="ex-pick-row" data-ex="${e.id}">
        <span class="ex-dot" style="background:${MUSCLES[e.muscle]?.color || '#888'}"></span>
        <span class="ex-pick-name">${esc(e.name)}</span>
        <span class="ex-pick-muscle">${MUSCLES[e.muscle]?.name || e.muscle}</span>
      </button>`).join('') || '<div class="chart-empty">Sin resultados. Puedes crearlo abajo. 👇</div>';
    $$('[data-ex]', m).forEach((b) => b.addEventListener('click', () => {
      const ex = exById(b.dataset.ex);
      closeModal();
      onPick(ex);
    }));
  };
  draw();
  $('#ex-q', m).addEventListener('input', (e) => draw(e.target.value));
  $('#ex-new', m).addEventListener('click', () => newExerciseModal((ex) => { closeModal(); onPick(ex); }));
}

function newExerciseModal(onCreate) {
  const m = openModal(`
    <h2>Nuevo ejercicio</h2>
    <div class="field"><label>Nombre</label><input id="ne-name" type="text" placeholder="Ej. Remo unilateral" maxlength="50"></div>
    <div class="field-row">
      <div class="field"><label>Grupo muscular</label>
        <select id="ne-muscle">${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Descanso (seg)</label>
        <select id="ne-rest"><option>60</option><option selected>90</option><option>120</option><option>150</option><option>180</option></select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Incremento (kg)</label>
        <select id="ne-inc"><option>1.25</option><option selected>2.5</option><option>5</option><option value="0">Sin peso</option></select></div>
      <div class="field"><label>Rango de reps</label>
        <select id="ne-range"><option value="5-8">5–8 (fuerza)</option><option value="8-12" selected>8–12 (hipertrofia)</option><option value="12-20">12–20 (resistencia)</option></select></div>
    </div>
    <button class="btn btn-primary btn-block" id="ne-save">Crear ejercicio</button>
  `, true);
  $('#ne-save', m).addEventListener('click', async () => {
    const name = $('#ne-name', m).value.trim();
    if (!name) { toast('El ejercicio necesita nombre'); return; }
    const [repMin, repMax] = $('#ne-range', m).value.split('-').map(Number);
    const ex = {
      id: uid(), name, muscle: $('#ne-muscle', m).value,
      rest: +$('#ne-rest', m).value, increment: +$('#ne-inc', m).value,
      repMin, repMax, custom: true,
    };
    await db.put('exercises', ex);
    state.exercises.push(ex);
    onCreate(ex);
  });
}

function libraryModal() {
  const m = openModal(`
    <h2>Biblioteca de ejercicios</h2>
    <p class="m-sub">${state.exercises.length} ejercicios · toca uno para ver su progresión.</p>
    <div class="ex-search"><input id="lib-q" type="search" placeholder="Buscar…" autocomplete="off"></div>
    <div id="lib-list"></div>
    <button class="btn btn-primary btn-block" id="lib-new" style="margin-top:12px">＋ Crear ejercicio</button>
  `);
  const draw = (q = '') => {
    const t = q.trim().toLowerCase();
    const list = state.exercises
      .filter((e) => !t || e.name.toLowerCase().includes(t))
      .sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));
    $('#lib-list', m).innerHTML = list.map((e) => {
      const hist = exHistory(state.sessions, e.id);
      const best = hist.reduce((x, h) => Math.max(x, h.best), 0);
      return `
      <button class="ex-pick-row" data-lib="${e.id}">
        <span class="ex-dot" style="background:${MUSCLES[e.muscle]?.color || '#888'}"></span>
        <span class="ex-pick-name">${esc(e.name)}</span>
        <span class="ex-pick-muscle">${best ? `e1RM ${fmtKg(best)} kg` : MUSCLES[e.muscle]?.name || ''}</span>
      </button>`;
    }).join('');
    $$('[data-lib]', m).forEach((b) => b.addEventListener('click', () => {
      closeModal();
      render('progress');
      setTimeout(() => {
        const sel = $('#prog-ex');
        if (sel && [...sel.options].some((o) => o.value === b.dataset.lib)) {
          sel.value = b.dataset.lib;
          sel.dispatchEvent(new Event('change'));
        } else toast('Este ejercicio aún no tiene sesiones registradas');
      }, 60);
    }));
  };
  draw();
  $('#lib-q', m).addEventListener('input', (e) => draw(e.target.value));
  $('#lib-new', m).addEventListener('click', () => newExerciseModal(() => { toast('Ejercicio creado ✓'); closeModal(); }));
}

// ============================== AJUSTES ==============================
function settingsModal() {
  const s = state.settings;
  const m = openModal(`
    <h2>Ajustes</h2>
    <p class="m-sub">Tus datos viven solo en este dispositivo. Haz respaldos.</p>
    <div class="field"><label>Descanso por defecto</label>
      <select id="set-rest">
        ${[60, 90, 120, 150, 180].map((v) => `<option value="${v}" ${s.defaultRest === v ? 'selected' : ''}>${v} segundos</option>`).join('')}
      </select></div>
    <div class="field-row">
      <div class="field"><label>Sonido</label>
        <select id="set-sound"><option value="1" ${s.sound ? 'selected' : ''}>Activado</option><option value="0" ${!s.sound ? 'selected' : ''}>Silencio</option></select></div>
      <div class="field"><label>Vibración</label>
        <select id="set-vib"><option value="1" ${s.vibrate ? 'selected' : ''}>Activada</option><option value="0" ${!s.vibrate ? 'selected' : ''}>Apagada</option></select></div>
    </div>
    <div style="display:grid;gap:10px;margin-top:16px">
      <button class="btn btn-ghost btn-block" id="set-export">⬇️ Exportar respaldo (JSON)</button>
      <button class="btn btn-ghost btn-block" id="set-import">⬆️ Importar respaldo</button>
      <input type="file" id="set-file" accept="application/json" class="hidden">
      <button class="btn btn-danger btn-block" id="set-wipe">Borrar todos los datos</button>
    </div>
  `);
  const persist = async () => {
    s.defaultRest = +$('#set-rest', m).value;
    s.sound = $('#set-sound', m).value === '1';
    s.vibrate = $('#set-vib', m).value === '1';
    await db.setKV('settings', s);
  };
  ['set-rest', 'set-sound', 'set-vib'].forEach((id) => $('#' + id, m).addEventListener('change', persist));
  $('#set-export', m).addEventListener('click', () => exportJSON(state));
  $('#set-import', m).addEventListener('click', () => $('#set-file', m).click());
  $('#set-file', m).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await importJSON(f);
      Object.assign(state, await loadAll());
      closeModal();
      render('home');
      toast('Respaldo importado ✓');
    } catch (err) {
      toast('⚠️ ' + err.message);
    }
  });
  $('#set-wipe', m).addEventListener('click', () => {
    confirmModal('Esto borra TODAS tus sesiones, rutinas y ejercicios personalizados. ¿Seguro? Considera exportar antes.', async () => {
      await Promise.all([db.clear('sessions'), db.clear('routines'), db.clear('exercises'), db.delKV('seeded'), db.delKV('activeWorkout')]);
      state.active = null;
      Object.assign(state, await loadAll());
      closeModal();
      render('home');
      toast('Datos reiniciados');
    });
  });
}

// ============================== MODALES / TOAST ==============================
const modalStack = [];

function openModal(html, stacked = false) {
  if (!stacked) closeAllModals();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal"><div class="modal-grip"></div>${html}</div>`;
  bd.addEventListener('click', (e) => { if (e.target === bd) closeModal(); });
  $('#modal-root').appendChild(bd);
  modalStack.push(bd);
  return bd;
}

function closeModal() {
  const bd = modalStack.pop();
  if (bd) bd.remove();
}

function closeAllModals() {
  while (modalStack.length) modalStack.pop().remove();
}

function confirmModal(text, onYes) {
  const m = openModal(`
    <h2>Confirmar</h2>
    <p class="m-sub" style="font-size:14px;line-height:1.5">${text}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn btn-ghost" id="cf-no">Cancelar</button>
      <button class="btn btn-danger" id="cf-yes">Sí, continuar</button>
    </div>
  `, true);
  $('#cf-no', m).addEventListener('click', closeModal);
  $('#cf-yes', m).addEventListener('click', () => { closeModal(); onYes(); });
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
