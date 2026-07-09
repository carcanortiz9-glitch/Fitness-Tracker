// ============================================================
// charts.js — gráficas SVG a mano (línea con tooltip, barras H)
// Colores de datos validados sobre superficie oscura.
// ============================================================

const NS = 'http://www.w3.org/2000/svg';
const INK_MUTED = 'rgba(215,230,255,.45)';
const GRID = 'rgba(255,255,255,.07)';

function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function niceTicks(max, count = 3) {
  if (max <= 0) return [0, 1];
  const step = Math.pow(10, Math.floor(Math.log10(max / count)));
  const err = max / count / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const ticks = [];
  for (let v = 0; v <= max + s * 0.001; v += s) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const fmtShort = (n) =>
  n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n * 10) / 10}`;

// ---------- Gráfica de línea (progresión en el tiempo) ----------
// points: [{label, sub, y}] · una sola serie → sin leyenda, el título la nombra.
export function lineChart(container, points, { color = '#189ec2', unit = 'kg', height = 190 } = {}) {
  container.innerHTML = '';
  const W = 640, H = height;
  const padL = 42, padR = 18, padT = 14, padB = 26;

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  wrap.appendChild(svg);

  const ys = points.map((p) => p.y);
  const maxY = Math.max(...ys) * 1.12;
  const minY = Math.min(0, ...ys);
  const ticks = niceTicks(maxY);
  const topTick = ticks[ticks.length - 1];

  const x = (i) => points.length === 1
    ? (padL + (W - padL - padR) / 2)
    : padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - minY) / (topTick - minY || 1)) * (H - padT - padB);

  // Rejilla y ejes (recesivos)
  for (const t of ticks) {
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: GRID, 'stroke-width': 1 }));
    const lb = el('text', { x: padL - 8, y: y(t) + 4, 'text-anchor': 'end', fill: INK_MUTED, 'font-size': 11, 'font-weight': 600 });
    lb.textContent = fmtShort(t);
    svg.appendChild(lb);
  }

  // Área con degradado + línea
  const gid = 'lg' + Math.random().toString(36).slice(2, 7);
  const defs = el('defs');
  const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0', 'stop-color': color, 'stop-opacity': .32 }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const pts = points.map((p, i) => [x(i), y(p.y)]);
  const dLine = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  if (points.length > 1) {
    svg.appendChild(el('path', {
      d: `${dLine} L${pts[pts.length - 1][0]},${y(minY)} L${pts[0][0]},${y(minY)} Z`, fill: `url(#${gid})`,
    }));
    svg.appendChild(el('path', {
      d: dLine, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // Puntos: anillo de 2px del color de superficie para separarlos de la línea
  pts.forEach(([px, py], i) => {
    svg.appendChild(el('circle', {
      cx: px, cy: py, r: points.length > 24 ? 3 : 4.2, fill: color,
      stroke: '#0e1a2e', 'stroke-width': 2, 'data-i': i,
    }));
  });

  // Etiqueta directa del último valor
  const last = points[points.length - 1];
  const lastLb = el('text', {
    x: Math.min(pts[pts.length - 1][0], W - padR - 4), y: Math.max(pts[pts.length - 1][1] - 12, 12),
    'text-anchor': 'end', fill: 'rgba(238,244,255,.92)', 'font-size': 12.5, 'font-weight': 800,
  });
  lastLb.textContent = `${fmtShort(last.y)} ${unit}`;
  svg.appendChild(lastLb);

  // Tooltip por cercanía (mouse y touch)
  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  wrap.appendChild(tip);
  const cross = el('line', { y1: padT, y2: H - padB, stroke: 'rgba(255,255,255,.2)', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0 });
  svg.insertBefore(cross, svg.firstChild.nextSibling);

  function showNearest(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach(([px], i) => { const d = Math.abs(px - relX); if (d < bd) { bd = d; best = i; } });
    const p = points[best];
    cross.setAttribute('x1', pts[best][0]); cross.setAttribute('x2', pts[best][0]);
    cross.setAttribute('opacity', 1);
    tip.innerHTML = `${fmtShort(p.y)} ${unit}<span class="tt-sub">${p.label}${p.sub ? ' · ' + p.sub : ''}</span>`;
    tip.style.left = `${(pts[best][0] / W) * 100}%`;
    tip.style.top = `${(pts[best][1] / H) * 100}%`;
    tip.style.opacity = 1;
  }
  const hide = () => { tip.style.opacity = 0; cross.setAttribute('opacity', 0); };
  svg.addEventListener('mousemove', (e) => showNearest(e.clientX));
  svg.addEventListener('mouseleave', hide);
  svg.addEventListener('touchstart', (e) => showNearest(e.touches[0].clientX), { passive: true });
  svg.addEventListener('touchmove', (e) => showNearest(e.touches[0].clientX), { passive: true });
  svg.addEventListener('touchend', () => setTimeout(hide, 1200), { passive: true });

  container.appendChild(wrap);
}

// ---------- Barras horizontales (volumen por grupo muscular) ----------
// Identidad por etiqueta de fila (una medida) → un solo matiz de datos.
export function hBars(container, rows, { color = '#189ec2', unit = 'kg' } = {}) {
  container.innerHTML = '';
  const W = 640;
  const rowH = 34, gap = 10, padL = 92, padR = 64;
  const H = rows.length * (rowH + gap) + 6;
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const max = Math.max(...rows.map((r) => r.value), 1);

  rows.forEach((r, i) => {
    const yPos = i * (rowH + gap) + 3;
    const bw = Math.max((r.value / max) * (W - padL - padR), 3);
    // etiqueta de fila (tinta de texto, nunca color de serie)
    const lb = el('text', { x: padL - 10, y: yPos + rowH / 2 + 4, 'text-anchor': 'end', fill: 'rgba(230,240,255,.72)', 'font-size': 12.5, 'font-weight': 700 });
    lb.textContent = r.label;
    svg.appendChild(lb);
    // pista
    svg.appendChild(el('rect', { x: padL, y: yPos, width: W - padL - padR, height: rowH, rx: 9, fill: 'rgba(255,255,255,.045)' }));
    // barra — extremo redondeado, anclada a la base
    const bar = el('rect', { x: padL, y: yPos, width: 0, height: rowH, rx: 9, fill: color, opacity: .92 });
    svg.appendChild(bar);
    requestAnimationFrame(() => {
      bar.style.transition = `width .7s cubic-bezier(.2,.8,.3,1) ${i * 70}ms`;
      bar.setAttribute('width', bw);
    });
    // valor directo
    const val = el('text', { x: padL + bw + 10, y: yPos + rowH / 2 + 4, fill: 'rgba(238,244,255,.9)', 'font-size': 12, 'font-weight': 800 });
    val.textContent = `${fmtShort(r.value)} ${unit}`;
    requestAnimationFrame(() => {
      setTimeout(() => val.setAttribute('x', padL + bw + 10), 0);
    });
    svg.appendChild(val);
  });

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

// ---------- Barras verticales (volumen semanal) ----------
export function vBars(container, rows, { color = '#189ec2', unit = 'kg', height = 170 } = {}) {
  container.innerHTML = '';
  const W = 640, H = height;
  const padL = 42, padR = 12, padT = 12, padB = 26;
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

  const max = Math.max(...rows.map((r) => r.value), 1) * 1.1;
  const ticks = niceTicks(max, 3);
  const topTick = ticks[ticks.length - 1];
  const innerW = W - padL - padR;
  const bw = Math.min(innerW / rows.length - 8, 44);
  const y = (v) => padT + (1 - v / topTick) * (H - padT - padB);

  for (const t of ticks) {
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: GRID }));
    const lb = el('text', { x: padL - 8, y: y(t) + 4, 'text-anchor': 'end', fill: INK_MUTED, 'font-size': 11, 'font-weight': 600 });
    lb.textContent = fmtShort(t);
    svg.appendChild(lb);
  }

  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';

  rows.forEach((r, i) => {
    const cx = padL + (i + 0.5) * (innerW / rows.length);
    const bh = Math.max(H - padB - y(r.value), r.value > 0 ? 4 : 0);
    const bar = el('rect', {
      x: cx - bw / 2, y: H - padB, width: bw, height: 0, rx: 4,
      fill: r.current ? color : color, opacity: r.current ? 1 : .55,
    });
    svg.appendChild(bar);
    requestAnimationFrame(() => {
      bar.style.transition = `y .6s cubic-bezier(.2,.8,.3,1) ${i * 55}ms, height .6s cubic-bezier(.2,.8,.3,1) ${i * 55}ms`;
      bar.setAttribute('y', H - padB - bh);
      bar.setAttribute('height', bh);
    });
    const lb = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', fill: INK_MUTED, 'font-size': 10.5, 'font-weight': 700 });
    lb.textContent = r.label;
    svg.appendChild(lb);

    const zone = el('rect', { x: cx - (innerW / rows.length) / 2, y: padT, width: innerW / rows.length, height: H - padT - padB, fill: 'transparent' });
    zone.style.cursor = 'pointer';
    const show = () => {
      tip.innerHTML = `${fmtShort(r.value)} ${unit}<span class="tt-sub">${r.tooltip || r.label}</span>`;
      tip.style.left = `${(cx / W) * 100}%`;
      tip.style.top = `${(y(r.value) / H) * 100}%`;
      tip.style.opacity = 1;
    };
    zone.addEventListener('mouseenter', show);
    zone.addEventListener('mouseleave', () => (tip.style.opacity = 0));
    zone.addEventListener('touchstart', () => { show(); setTimeout(() => (tip.style.opacity = 0), 1400); }, { passive: true });
    svg.appendChild(zone);
  });

  wrap.appendChild(svg);
  wrap.appendChild(tip);
  container.appendChild(wrap);
}
