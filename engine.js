// ============================================================
// engine.js — motor de progresión
// e1RM, sugerencias, detección de mesetas, PRs, volumen, rachas
// ============================================================

// 1RM estimado (fórmula de Epley). Para reps altas se vuelve impreciso,
// así que se acota a 15 reps efectivas.
export const e1rm = (w, r) => (!w || !r ? 0 : w * (1 + Math.min(r, 15) / 30));

export const fmtKg = (n) => {
  const v = Math.round(n * 10) / 10;
  return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1));
};

const validSets = (sets) => (sets || []).filter((s) => s.w > 0 && s.r > 0);

// ---------- Historial por ejercicio ----------
// sessions llega ordenado por fecha ascendente.
export function exHistory(sessions, exId) {
  const out = [];
  for (const s of sessions) {
    for (const en of s.entries) {
      if (en.exerciseId !== exId) continue;
      const sets = validSets(en.sets);
      if (!sets.length) continue;
      const best = sets.reduce((m, x) => Math.max(m, e1rm(x.w, x.r)), 0);
      const topW = sets.reduce((m, x) => Math.max(m, x.w), 0);
      const vol = sets.reduce((m, x) => m + x.w * x.r, 0);
      out.push({ date: s.date, sessionId: s.id, sets, best, topW, vol });
    }
  }
  return out;
}

// ---------- Sugerencia de progresión ----------
// Regla de doble progresión: llena el rango de reps con un peso;
// cuando todas las series tocan el techo del rango, sube el peso.
export function suggestFor(ex, hist) {
  if (!hist.length) {
    return {
      type: 'start', icon: '🎯',
      text: `Primera vez. Encuentra un peso con el que logres <strong>${ex.repMin}–${ex.repMax} reps</strong> dejando 1–2 en reserva.`,
    };
  }
  const last = hist[hist.length - 1];
  const topSets = last.sets.filter((s) => s.w === last.topW);
  const allAtCeiling = topSets.every((s) => s.r >= ex.repMax);
  const inc = ex.increment || 2.5;

  if (allAtCeiling && inc > 0) {
    return {
      type: 'weight', icon: '📈',
      text: `Llenaste el rango con ${fmtKg(last.topW)} kg. Hoy sube a <strong>${fmtKg(last.topW + inc)} kg</strong> (aunque bajen las reps, es progreso).`,
      targetW: last.topW + inc,
    };
  }
  const worst = Math.min(...topSets.map((s) => s.r));
  return {
    type: 'reps', icon: '➕',
    text: `Con <strong>${fmtKg(last.topW)} kg</strong>, busca al menos <strong>${Math.min(worst + 1, ex.repMax)} reps</strong> por serie (techo: ${ex.repMax}).`,
    targetW: last.topW,
  };
}

// ---------- Detección de meseta ----------
// Cuenta sesiones desde la última vez que el mejor e1RM marcó un máximo
// histórico. 3+ sesiones sin superar tu mejor marca = estancamiento.
export function plateauFor(ex, hist) {
  if (hist.length < 4) return null;
  let runningMax = 0;
  let lastImprovedIdx = 0;
  hist.forEach((h, i) => {
    if (h.best > runningMax + 0.01) { runningMax = h.best; lastImprovedIdx = i; }
  });
  const stale = hist.length - 1 - lastImprovedIdx;
  if (stale < 3) return null;
  const last = hist[hist.length - 1];
  return {
    exercise: ex, sessions: stale, bestE1rm: runningMax,
    deloadW: Math.max(0, Math.round((last.topW * 0.9) / 2.5) * 2.5),
  };
}

export function allPlateaus(exercises, sessions) {
  const out = [];
  for (const ex of exercises) {
    const hist = exHistory(sessions, ex.id);
    const p = plateauFor(ex, hist);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

// ---------- PRs ----------
// Compara la sesión contra TODO el historial previo a ella.
export function detectPRs(session, prevSessions) {
  const prs = [];
  for (const en of session.entries) {
    const sets = validSets(en.sets);
    if (!sets.length) continue;
    const hist = exHistory(prevSessions, en.exerciseId);
    const prevTopW = hist.reduce((m, h) => Math.max(m, h.topW), 0);
    const prevBest = hist.reduce((m, h) => Math.max(m, h.best), 0);
    const prevVol = hist.reduce((m, h) => Math.max(m, h.vol), 0);

    const topW = sets.reduce((m, s) => Math.max(m, s.w), 0);
    const best = sets.reduce((m, s) => Math.max(m, e1rm(s.w, s.r)), 0);
    const vol = sets.reduce((m, s) => m + s.w * s.r, 0);

    if (hist.length && topW > prevTopW) {
      prs.push({ ex: en.name, kind: 'Peso máximo', value: `${fmtKg(topW)} kg`, icon: '🏋️' });
    }
    if (hist.length && best > prevBest + 0.01) {
      prs.push({ ex: en.name, kind: '1RM estimado', value: `${fmtKg(best)} kg`, icon: '💥' });
    }
    if (hist.length && vol > prevVol + 0.01) {
      prs.push({ ex: en.name, kind: 'Volumen', value: `${fmtKg(vol)} kg`, icon: '📊' });
    }
  }
  return prs;
}

// ---------- Volumen y calendario ----------
export const sessionVolume = (s) =>
  s.entries.reduce((m, en) => m + validSets(en.sets).reduce((x, st) => x + st.w * st.r, 0), 0);

export const totalSets = (s) =>
  s.entries.reduce((m, en) => m + validSets(en.sets).length, 0);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Lunes de la semana de una fecha (ISO local)
export function weekStart(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = lunes
  dt.setDate(dt.getDate() - dow);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function sessionsInWeek(sessions, refISO = todayISO()) {
  const ws = weekStart(refISO);
  return sessions.filter((s) => weekStart(s.date) === ws);
}

// Volumen por grupo muscular en los últimos `days` días
export function volumeByMuscle(sessions, exercises, days = 7) {
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const cutISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const acc = {};
  for (const s of sessions) {
    if (s.date < cutISO) continue;
    for (const en of s.entries) {
      const ex = exMap[en.exerciseId];
      const muscle = ex ? ex.muscle : (en.muscle || 'core');
      const vol = validSets(en.sets).reduce((m, st) => m + st.w * st.r, 0);
      if (vol > 0) acc[muscle] = (acc[muscle] || 0) + vol;
    }
  }
  return acc;
}

// Volumen semanal total de las últimas n semanas → [{week, vol}]
export function weeklyVolumes(sessions, weeks = 8) {
  const out = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i * 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ws = weekStart(iso);
    const vol = sessions.filter((s) => weekStart(s.date) === ws).reduce((m, s) => m + sessionVolume(s), 0);
    out.push({ week: ws, vol });
  }
  return out;
}

// Racha: semanas consecutivas (terminando en esta o la pasada) con ≥1 sesión
export function streakWeeks(sessions) {
  if (!sessions.length) return 0;
  const weeksWith = new Set(sessions.map((s) => weekStart(s.date)));
  let streak = 0;
  const d = new Date();
  let iso = todayISO();
  // La semana actual cuenta si ya entrenaste; si no, no rompe la racha todavía.
  if (weeksWith.has(weekStart(iso))) streak++;
  for (let i = 1; i < 260; i++) {
    d.setDate(d.getDate() - 7);
    iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (weeksWith.has(weekStart(iso))) streak++;
    else break;
  }
  return streak;
}
