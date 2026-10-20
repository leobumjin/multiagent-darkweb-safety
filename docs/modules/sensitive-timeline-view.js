import {scenarioDefinition} from "./scenario-definition.js";
import { timelineRun } from "./timeline-run.js";
import { anxietyOverlay, anxietyColor, anxietyValue, anxietyScale, formatAnxiety, anxietyEndLabels } from "./monitoring-anxiety.js";
let RUN = timelineRun("No run loaded", []);
// Gaussian smoothing of the hit train that keeps every peak at its true height.
// 1) bin tokens into `bin`-token slots; a slot holds the highest confirmed category.
// 2) each hit becomes a Gaussian bump of height = its level (σ in tokens); the curve is the MAX of the bumps.
//    Confidential access peaks at 0.5 and use at 1.0; bumps never add up to imply another category.
//    Dark reads peak at 1.5 and dark information use at 2. Dense stretches merge at their highest category.
// Returns { t0, bin, v: Float32Array } covering [0, total]. hits need not be sorted.
function smoothHits(hits, total, sigma, bin = 250) {
  const n = Math.max(1, Math.ceil(total / bin)), raw = new Float32Array(n), v = new Float32Array(n);
  for (const h of hits) { const i = Math.min(n - 1, Math.floor(h.tokens / bin)); if (h.level > raw[i]) raw[i] = h.level; }
  const s = sigma / bin, r = Math.ceil(3 * s), k = [];
  for (let j = -r; j <= r; j++) k.push(Math.exp(-j * j / (2 * s * s)));
  for (let x = 0; x < n; x++) {
    if (!raw[x]) continue;
    for (let j = -r; j <= r; j++) { const i = x + j; if (i >= 0 && i < n) { const b = raw[x] * k[j + r]; if (b > v[i]) v[i] = b; } }
  }
  return { t0: bin / 2, bin, v };
}

// ---------- view ----------
const $ = s => document.querySelector(s);
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const fmtK = t => t >= 1e6 ? +(t / 1e6).toFixed(2) + "M" : t >= 1e3 ? +(t / 1e3).toFixed(1) + "k" : "" + Math.round(t);
const fmtN = n => Math.round(n).toLocaleString("en-US");
const f1 = n => n.toFixed(1);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const textW = (s, fs) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? fs * .98 : c === " " ? fs * .3 : fs * .56), 0);
const LEVELS = scenarioDefinition.monitoring.levels;
if (typeof document.querySelectorAll === 'function') {
  document.querySelector('[data-scenario-monitoring-title]').textContent = scenarioDefinition.monitoring.title;
  for (const node of document.querySelectorAll('[data-scenario-level]')) {
    node.textContent = LEVELS[Number(node.dataset.scenarioLevel)].label;
  }
}

const lvCls = v => v > 1.5 ? "dark-use" : v > 1 ? "dark" : v > .5 ? "p2-use" : v > .02 ? "p2" : "ink";

// Playback = Bostock "Path Transitions" ticker: the camera is a fixed WIN-token window whose right edge is the playhead.
// The ridge, fill, rug, bands, annotations and axis ticks are drawn untransformed for a span a bit wider than the window
// and live in one <g> that is only translated left at a constant token rate. New data sits just past the clip's right
// edge and slides in; the path d is rebuilt only every CH tokens, and the transform is rebased so nothing jumps.
let RATE = 2500;     // tokens per second at 1x
let WIN = 30000;     // window width in tokens while playing
let CH = 3000;       // rebuild the sliding group every CH tokens
const AXIS_W = 12;     // rad/s, critically damped spring (axis extension, zoom-out at the end)
const total = () => RUN.total;
const cam = P => Math.max(P, WIN); // camera right edge: holds at WIN early on, so the window never shows negative tokens
const st = { P: 0, mode: "rest", B: 0, playing: false, speed: 4, sigma: 75, view: null, domEnd: 0, domV: 0, out: null,
  last: 0, raf: 0, listKey: "", W: 0, Wm: 0, sm: null, smKey: "", g: null, mg: null, dirty: false, sticky: -1 };

function niceStep(span, maxTicks) {
  for (const s of [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 5e5, 1e6, 25e5]) if (span / s <= maxTicks) return s;
  return 5e6;
}
const domTarget = () => { const T = Math.max(1,total()), s = niceStep(T, 6); return Math.ceil(T / s) * s; };
function phases() { // the last phase keeps going while the run grows
  const ph = RUN.phases.map(p => ({ ...p })), l = ph[ph.length - 1];
  l.end = Math.max(l.end, total()); return ph;
}
const phaseAt = t => { const ph = phases(); let i = ph.findIndex(p => t >= p.start && t < p.end); return i < 0 ? (t < 0 ? 0 : ph.length - 1) : i; };
function upTo(t) { // hits arrive in token order: number of hits with tokens <= t
  const H = RUN.hits; let lo = 0, hi = H.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (H[m].tokens <= t) lo = m + 1; else hi = m; }
  return lo;
}
const countIn = (a, b) => { let access = 0, use = 0, dark = 0, darkUse = 0; const H = RUN.hits; for (let i = upTo(a), e = upTo(b); i < e; i++) H[i].level === 2 ? darkUse++ : H[i].level === 1.5 ? dark++ : H[i].level === 1 ? use++ : access++; return { access, use, dark, darkUse }; };
const near = t => countIn(t - 2000, Math.min(t + 2000, st.P)); // never peeks past the playhead
const events = () => RUN.events.map((e, i) => ({ ...e, n: i + 1 }));
const valAt = (sm, t) => { // linear between bin centres
  const u = (t - sm.t0) / sm.bin, i = Math.floor(u), n = sm.v.length - 1;
  return i < 0 ? sm.v[0] : i >= n ? sm.v[n] : sm.v[i] + (sm.v[i + 1] - sm.v[i]) * (u - i);
};
const curve = () => { // full-run curve, recomputed only when the hits or σ change
  const k = RUN.hits.length + "|" + total() + "|" + st.sigma;
  if (k !== st.smKey) { st.smKey = k; st.sm = smoothHits(RUN.hits, total(), st.sigma, Math.max(1, Math.ceil(total() / 20000))); }
  return st.sm;
};

// One filled line, with a separate color band for each category.
function ridge(sm, x, y, d0, d1, P, id, top, bot, sw) {
  const pts = [];
  for (let i = 0; i < sm.v.length; i++) {
    const t = sm.t0 + i * sm.bin;
    if (t >= P) break;
    if (t < d0 - 2 * sm.bin || t > d1 + 2 * sm.bin) continue;
    pts.push(f1(x(t)) + "," + f1(y(sm.v[i])));
  }
  if (P > 0 && P <= d1 + 2 * sm.bin) pts.push(f1(x(P)) + "," + f1(y(valAt(sm, P))));
  if (P > 0 && d0 <= 0) pts.unshift(f1(x(0)) + "," + f1(y(sm.v[0])));
  if (pts.length < 2) return "";
  const line = "M" + pts.join("L"), x0 = pts[0].split(",")[0], x1 = pts[pts.length - 1].split(",")[0];
  const area = `M${x0},${f1(y(0))}L${pts.join("L")}L${x1},${f1(y(0))}Z`, mid = y(.5);
  return [["p2",y(.5),bot],["p2-use",y(1),y(.5)],["dark",y(1.5),y(1)],["dark-use",top,y(1.5)]].map(([color,a,b]) => `<clipPath id="${id}-${color}"><rect x="-1e5" y="${a}" width="2e5" height="${b-a}"/></clipPath><g clip-path="url(#${id}-${color})"><path d="${area}" class="f-${color}" fill-opacity=".16"/><path d="${line}" class="s-${color}" stroke-width="${sw}" fill="none" stroke-linejoin="round"/></g>`).join("");
}

const chart = $("#chart"), mini = $("#mini"), wrap = $("#chartWrap");
const PT = 150, PB = 350, RUG = PB + 9, H = PB + 52, ROW = 34;
const hiddenAnxiety = new Set();
let anxietyValues = [];
let anxietyMode = 'absolute', anxietyDomain = anxietyScale([]);
let focusedAnxiety = null;
const anxietyY = (top,bottom) => value => bottom-(value-anxietyDomain.min)/(anxietyDomain.max-anxietyDomain.min)*(bottom-top);

function focusAnxiety(id) {
  focusedAnxiety=id && !hiddenAnxiety.has(id) ? id : null;
  for (const target of [chart,mini]) {
    target.classList.toggle('anxiety-has-focus',Boolean(focusedAnxiety));
    for (const series of target.querySelectorAll('.anxiety-series, .anxiety-end-label')) series.classList.toggle('is-focused',series.dataset.anxietyId===focusedAnxiety);
  }
}

function drawAnxietyMode() {
  const adjusted=anxietyMode === 'adjusted';
  $('#anxietyAbsolute').setAttribute('aria-pressed',String(!adjusted));
  $('#anxietyAdjusted').setAttribute('aria-pressed',String(adjusted));
  $('#anxietyScaleLabel').textContent=adjusted ? 'Change from first record' : '0–99';
  $('#anxietyModeNote').textContent=adjusted
    ? 'Relative value = Current value − First record per participant · 0: unchanged, +: increase, −: decrease · shared axis adjusts automatically'
    : 'Absolute value = Recorded anxiety 0–99 · Current anxiety per participant';
  $('#anxietyAxisNote').textContent=adjusted ? 'Outer left column: access/use category · inner column: change from first record' : 'Outer left column: access/use category · inner column: anxiety 0–99';
  chart.setAttribute('aria-label',`Information access and anxiety over cumulative tokens. Outer left: access/use category; inner left: ${adjusted?'change from first record; 0 means no change':'absolute anxiety from 0 to 99'}. Right: participant name and last displayed value. Band color represents absolute anxiety; agents use solid lines and circles, candidates use dashed lines and squares.`);
}

function buildAnxietyLegend() {
  $("#anxietyLegend").innerHTML = [false,true].map(user => {
    const series = RUN.anxiety.filter(s => s.user === user);
    return `<div class="anxiety-legend-group ${user?'is-user':'is-agent'}"><span class="anxiety-group-label">${user?'Candidate · dashed':'Agent · solid'}</span><div class="anxiety-people">${series.length ? series.map(s =>
      `<button type="button" data-anxiety="${esc(s.id)}" aria-pressed="${!hiddenAnxiety.has(s.id)}" aria-label="${esc(s.label)} Anxiety display" style="--anxiety-color:${anxietyColor(s.points.findLast(p=>p.tokens<=st.P)?.value ?? 0)}"><i aria-hidden="true"></i><span>${esc(s.label)}</span><b class="num" data-anxiety-value="${esc(s.id)}">—</b></button>`).join('') : '<span class="anxiety-empty">Anxiety not recorded</span>'}</div></div>`;
  }).join('');
  anxietyValues = [...$("#anxietyLegend").querySelectorAll('[data-anxiety-value]')].map(el => ({el, series:RUN.anxiety.find(s=>s.id===el.dataset.anxietyValue)}));
}

function revealAnxiety(segments) {
  for (const segment of segments) {
    const visible = segment.tokens <= st.P;
    if (visible !== segment.visible) {
      segment.visible = visible;
      segment.el.setAttribute('visibility',visible?'visible':'hidden');
    }
  }
}
const anxietySegments = node => [...node.querySelectorAll('.anxiety-segment')].map(el => ({el, tokens:+el.dataset.t, visible:+el.dataset.t<=st.P}));

function drawAnxietyEndLabels() {
  const g=st.g;
  const [start,end]=st.mode==='slide' ? [cam(st.P)-WIN,cam(st.P)] : [g.d0,g.d1];
  const labels=anxietyEndLabels(RUN.anxiety,{y:anxietyY(PT,PB),top:PT+4,bottom:PB-4,start,end,cursor:st.P,hidden:hiddenAnxiety,mode:anxietyMode});
  const key=labels.map(l=>`${l.id}:${l.tokens}:${l.valueLabel}:${l.labelY}`).join('|');
  if (key!==g.labelKey) {
    g.labelKey=key;
    g.labelLayer.innerHTML=labels.map(l=>{
      const title=`${l.label} · ${anxietyMode==='adjusted'?'Relative value':'Absolute value'} ${l.valueLabel} · ${fmtN(l.tokens)} Tokens${l.interpolated?' · Interpolated value at the end of the displayed range':' · Last displayed record'}`;
      return `<g class="anxiety-end-label${l.user?' is-user':''}" data-anxiety-id="${esc(l.id)}" tabindex="0" role="img" aria-label="${esc(title)}" style="--anxiety-color:${l.color}"><title>${esc(title)}</title>
        <path class="anxiety-label-leader"/>
        <g class="anxiety-end-anchor">${l.user?'<rect x="-2.5" y="-2.5" width="5" height="5"/>':'<circle r="2.5"/>'}</g>
        <g transform="translate(${g.labelX} ${l.labelY})"><rect class="anxiety-label-bg" x="-3" y="-10" width="200" height="20" rx="4"/>
        <path d="M2,0H16" class="anxiety-label-swatch"/><text x="22" y="4" class="anxiety-label-name">${esc(l.label)}</text><text x="191" y="4" text-anchor="end" class="anxiety-label-value num">${l.valueLabel}</text></g></g>`;
    }).join('');
    g.labelNodes=[...g.labelLayer.querySelectorAll('.anxiety-end-label')].map((el,i)=>({el,label:labels[i],leader:el.querySelector('.anxiety-label-leader'),anchor:el.querySelector('.anxiety-end-anchor')}));
    focusAnxiety(focusedAnxiety);
  }
  for (const {label,leader,anchor} of g.labelNodes) {
    const x=g.L+(label.tokens-start)*g.k;
    leader.setAttribute('d',`M${x},${label.anchorY}H${g.R+5}L${g.labelX-6},${label.labelY}H${g.labelX}`);
    anchor.setAttribute('transform',`translate(${x} ${label.anchorY})`);
  }
}

// annotation rows: greedy, in event order. Sliding mode lays out once on the window's fixed scale, labels to the
// left of their dot so a label is whole the moment its dot enters at the right edge.
function placeAnn(ev, x, R, allLeft) {
  const placed = [];
  for (const e of ev) {
    const ex = x(e.tokens), w = Math.max(textW(`${e.n}  ${e.title}`, 12) + 4, textW(e.detail.slice(0, 55), 11));
    const right = !allLeft && ex + 8 + w <= R + 40, a = right ? ex : ex - 8 - w, b = right ? ex + 8 + w : ex;
    let row = -1;
    for (let r = 0; r < 3 && row < 0; r++) {
      const ok = placed.every(p => p.row !== r ? !(p.row > r && p.ex >= a - 4 && p.ex <= b + 4) && !(p.row < r && ex >= p.a - 4 && ex <= p.b + 4) : (b + 10 < p.a || a - 10 > p.b));
      if (ok) row = r;
    }
    placed.push({ e, ex, a, b, row, right });
  }
  return placed;
}

function build() {
  anxietyDomain=anxietyScale(RUN.anxiety,anxietyMode,st.P);
  drawAnxietyMode();
  const sm = curve(), T = total(), slide = st.mode === "slide";
  const stacks = new Map();
  const markerRows = (RUN.markers || []).map(m => {
    const row = stacks.get(m.tokens) || 0; stacks.set(m.tokens,row+1); return {...m,row};
  });
  const H = PB + 85 + Math.max(1, ...stacks.values()) * 18;
  const categoryWidth = Math.ceil(Math.max(...LEVELS.map(level => textW(level.label, 11)))) + 28;
  const anxietyLabelWidth=RUN.anxiety.length ? 224 : 0;
  const W = Math.max(anxietyLabelWidth ? 850 : slide ? 480 : 720, st.W), L = categoryWidth + 64, R = W - (anxietyLabelWidth || 44);
  let d0, d1, s0, s1;
  if (slide) { st.B = cam(st.P); d1 = st.B; d0 = d1 - WIN; s0 = d0 - 3 * st.sigma; s1 = d1 + CH + 3 * st.sigma; }
  else { [d0, d1] = st.view || [0, st.domEnd]; s0 = d0; s1 = d1; }
  const k = (R - L) / (d1 - d0), x = t => L + (t - d0) * k, y = v => PB - v / 2 * (PB - PT);
  const inS = t => t >= s0 && t <= s1;
  let g = "", fx = "";

  // phase bands: two alternating tints, small-caps names at the top edge, thin boundary rules
  phases().forEach((p, i) => {
    if (p.end <= s0 || p.start >= s1) return;
    const a = slide ? x(p.start) : Math.max(x(p.start), L), b = slide ? x(p.end) : Math.min(x(p.end), R), w = b - a;
    g += `<rect x="${f1(a)}" y="0" width="${f1(w)}" height="${RUG + 16}" class="${i % 2 ? "f-bb" : "f-ba"}"/>`;
    if (p.start > (slide ? s0 : d0)) g += `<line x1="${f1(a)}" x2="${f1(a)}" y1="0" y2="${RUG + 16}" class="s-ln"/>`;
    if (textW(p.name, 11) * 1.08 + 12 < w) g += `<text x="${f1(a + 6)}" y="15" class="sc f-mu" data-ph="${i}">${esc(p.name)}</text>`;
  });

  // Two distinct left columns: information categories outside, anxiety values beside the plot.
  fx += `<g class="information-axis"><text x="8" y="${PT-33}" class="axis-heading f-ink">Information access/use</text><text x="8" y="${PT-17}" class="axis-subtitle f-mu">Category</text>
    <line x1="${categoryWidth}" x2="${categoryWidth}" y1="${PT-42}" y2="${PB+12}" class="s-ln" stroke-width="1"/>`;
  fx += LEVELS.map(level => `<line x1="${L}" x2="${R}" y1="${y(level.value)}" y2="${y(level.value)}" class="s-ln" stroke-width=".75"/><text x="8" y="${y(level.value)+4}" font-size="11" class="f-${level.color}" font-weight="700">${esc(level.label)}</text>`).join('');
  fx += `<text x="8" y="${y(0)+4}" font-size="10" class="num f-mu">0</text></g>`;
  if (anxietyLabelWidth) fx += `<text x="${R+20}" y="${PT-16}" class="anxiety-label-heading">Anxiety · last displayed value</text>`;
  fx += `
    <text x="${R + 8}" y="${RUG + 32}" font-size="11" class="f-mu">Tokens</text>`;
  const ay=anxietyY(PT,PB);
  fx += `<g class="anxiety-axis"><rect x="${categoryWidth+8}" y="${PT-42}" width="48" height="${PB-PT+54}" rx="5" class="anxiety-axis-bg"/>
    <text x="${L-16}" y="${PT-33}" text-anchor="end" class="axis-heading">Anxiety</text><text x="${L-16}" y="${PT-17}" text-anchor="end" class="axis-subtitle">${anxietyMode==='adjusted'?'Change':'0–99'}</text>`;
  fx += anxietyDomain.ticks.map(value => `<text x="${L-16}" y="${ay(value)+4}" text-anchor="end" font-size="10" class="num">${formatAnxiety(value,anxietyMode)}</text><line x1="${L-5}" x2="${L}" y1="${ay(value)}" y2="${ay(value)}" class="anxiety-axis-tick"/>`).join('');
  fx += '</g>';
  if (anxietyMode==='adjusted') fx += `<line x1="${L}" x2="${R}" y1="${ay(0)}" y2="${ay(0)}" class="anxiety-zero"/><text x="${L+6}" y="${ay(0)-8}" class="anxiety-zero-label">First-record baseline · 0</text>`;

  // ridge + rug (full-run curve; whatever lies past the playhead sits outside the reveal clip)
  let gd = "";
  gd += ridge(sm, x, y, s0, s1, T, "rc", 0, PB, 1.75);
  gd += anxietyOverlay(RUN.anxiety, {x, y:ay, start:s0, end:s1, hidden:hiddenAnxiety, cursor:st.P, mode:anxietyMode});
  let accessRug = "", useRug = "", rd = "", ru = "";
  for (let i = upTo(s0 - 1e-9), e = upTo(s1); i < e; i++) {
    const h = RUN.hits[i], hx = f1(x(h.tokens));
    if (h.level === 2) ru += `M${hx},${RUG + 12}v-16`; else if (h.level === 1.5) rd += `M${hx},${RUG + 12}v-16`; else if (h.level === 1) useRug += `M${hx},${RUG + 12}v-12`; else accessRug += `M${hx},${RUG + 12}v-8`;
  }
  gd += `<path d="${ru}" class="s-dark-use" stroke-width="2"/><path d="${rd}" class="s-dark" stroke-width="2"/><path d="${accessRug}" class="s-p2" stroke-width="1" stroke-opacity=".85"/><path d="${useRug}" class="s-p2-use" stroke-width="1.5"/>`;

  // Preserve x coordinates: coincident evidence is stacked vertically, never jittered in token space.
  for (const m of markerRows) {
    if (!inS(m.tokens)) continue;
    const mx=x(m.tokens), my=RUG+62+m.row*18;
    const color=m.kind === 'dark-use' ? 'var(--dark-use)' : m.kind === 'dark' ? 'var(--dark-access)' : m.activity === 'use' ? 'var(--confidential-use)' : 'var(--p2)';
    const shape=m.kind === 'dark-use' ? `<rect x="${mx-4}" y="${my-4}" width="8" height="8" fill="${color}"/>` : m.kind === 'dark' ? `<path d="M${mx},${my-5}l5,5 -5,5 -5,-5Z" fill="${color}"/>` : `<circle cx="${mx}" cy="${my}" r="4" stroke="${color}" fill="${m.kind === 'mention' ? 'var(--bg)' : color}"/>`;
    gd += `<g class="ann${m.tokens <= st.P ? ' on' : ''}" data-t="${m.tokens}"><title>${esc(m.title)} · ${fmtN(m.tokens)} Tokens · ${esc(m.agent)} · Turn ${m.turn ?? '—'} · ${esc(m.field)}
${esc(m.detail)}</title>${shape}</g>`;
  }

  // x axis labels (slide with the data)
  const step = niceStep(d1 - d0, Math.min(6, Math.floor(W / 120)));
  for (let t = Math.max(0, Math.ceil(s0 / step) * step); t <= s1 + 1; t += step) {
    if (slide && st.P < WIN && t >= d1) break; // camera holding at [0, WIN]: no half-clipped label at the right edge
    const tx = x(t), anchor = slide ? "middle" : tx < L + 14 ? "start" : tx > R - 14 ? "end" : "middle";
    g += `<text x="${f1(tx)}" y="${RUG + 32}" text-anchor="${anchor}" font-size="11" class="num f-mu">${fmtK(t)}</text>`;
  }

  // annotations: plain text, elbow leaders, a dot on the curve; rows stacked upward, no boxes
  const rowY = r => PT - 30 - r * ROW; // title baseline
  const placed = slide ? placeAnn(events(), t => t * k, R, true).filter(p => inS(p.e.tokens)).map(p => ({ ...p, ex: x(p.e.tokens) }))
    : placeAnn(events().filter(e => e.tokens >= d0 && e.tokens <= d1), x, R, false);
  for (const { e, ex, row, right } of placed) {
    const v = valAt(sm, e.tokens), ey = y(v), c = lvCls(v), on = e.tokens <= st.P ? " on" : "";
    if (row < 0) { // no room: number only, just above the dot, or just below it when above would hit the label rows
      const dn = ey - 30 < rowY(0) + 16, s = dn ? 1 : -1;
      gd += `<g class="ann${on}" data-t="${e.tokens}"><title>${esc(e.title)} · ${fmtK(e.tokens)}</title><line x1="${f1(ex)}" x2="${f1(ex)}" y1="${f1(ey + 3 * s)}" y2="${f1(ey + 14 * s)}" class="s-mu" stroke-width=".75"/>
        <text x="${f1(ex)}" y="${f1(dn ? ey + 26 : ey - 17)}" text-anchor="middle" font-size="11" font-weight="700" class="num halo f-ink">${e.n}</text>
        <circle cx="${f1(ex)}" cy="${f1(ey)}" r="2.6" class="f-${c} s-bg" stroke-width="1"/></g>`;
      continue;
    }
    const ty = rowY(row), ky = ty - 4, hx = right ? ex + 6 : ex - 6, tx = right ? ex + 9 : ex - 9, anc = right ? "start" : "end";
    gd += `<g class="ann${on}" data-t="${e.tokens}"><path d="M${f1(ex)},${f1(ey - 3)}V${f1(ky)}H${f1(hx)}" class="s-mu" stroke-width=".75" fill="none"/>
      <text x="${f1(tx)}" y="${f1(ty)}" text-anchor="${anc}" font-size="12" class="halo"><tspan class="num f-fa" font-weight="700">${e.n}</tspan><tspan class="f-ink" font-weight="700" dx="5">${esc(e.title)}</tspan></text>
      <text x="${f1(tx)}" y="${f1(ty + 14)}" text-anchor="${anc}" font-size="11" class="halo f-mu">${esc(e.detail.slice(0, 55))}</text>
      <circle cx="${f1(ex)}" cy="${f1(ey)}" r="2.6" class="f-${c} s-bg" stroke-width="1"/></g>`;
  }

  // sliding: sticky phase name at top-left and the playhead pinned to the right edge
  if (slide) fx += `<g clip-path="url(#clip)"><rect id="stkBg" y="2" height="18" class="f-ba"/><text id="stk" y="15" class="sc f-ink"></text></g>
    <line id="phL" x1="${R}" x2="${R}" y1="36" y2="${RUG + 14}" class="s-ink" stroke-width="1"/>
    <text id="phT" x="${R - 6}" y="32" text-anchor="end" font-size="11" font-weight="600" class="num halo f-ink"></text>`;

  chart.setAttribute("width", W); chart.setAttribute("height", H); chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
  chart.innerHTML = `<defs><clipPath id="clip"><rect x="${L}" y="0" width="${R - L}" height="${H}"/></clipPath>
    <clipPath id="rev"><rect id="revR" x="${L}" y="0" width="${R - L}" height="${H}"/></clipPath></defs>
    <g clip-path="url(#clip)"><g class="sl">${g}</g><g clip-path="url(#rev)"><g class="sl">${gd}</g></g></g>
    <line x1="${L}" x2="${R}" y1="${PB}" y2="${PB}" class="s-ink" stroke-width="1"/>${fx}<g id="anxietyEndLabels"></g>`;
  st.g = { k, L, R, d0, d1, labelX:R+20,labelKey:null,labelNodes:[],labelLayer:chart.querySelector('#anxietyEndLabels'), sl: [...chart.querySelectorAll(".sl")], revR: chart.querySelector("#revR"), phL: chart.querySelector("#phL"), ann: [...chart.querySelectorAll(".ann")].map(el => ({ el, t: +el.dataset.t, on: el.classList.contains("on") })),
    anxiety:anxietySegments(chart),
    names: [...chart.querySelectorAll("[data-ph]")], stk: chart.querySelector("#stk"), stkBg: chart.querySelector("#stkBg"), phT: chart.querySelector("#phT") };
  st.sticky = -1; st.listKey = "";
  buildMini();
}

function buildMini() {
  const W = st.Wm, Hm = 36, D = st.domEnd, x = t => t / D * W, y = v => Hm - 2 - v / 2 * (Hm - 6);
  let o = `<defs><clipPath id="mrev"><rect id="mrevR" x="0" y="0" width="1e5" height="${Hm}"/></clipPath></defs><g clip-path="url(#mrev)">${ridge(curve(), x, y, 0, D, total(), "mc", 0, Hm, 1)}${anxietyOverlay(RUN.anxiety,{x,y:anxietyY(4,Hm-2),hidden:hiddenAnxiety,mini:true,cursor:st.P,mode:anxietyMode})}</g>`;
  if (anxietyMode==='adjusted') o += `<line x1="0" x2="${W}" y1="${anxietyY(4,Hm-2)(0)}" y2="${anxietyY(4,Hm-2)(0)}" class="anxiety-zero"/>`;
  if (st.view) {
    const a = x(st.view[0]), b = x(st.view[1]);
    o += `<rect x="0" y="0" width="${f1(a)}" height="${Hm}" class="f-bg" fill-opacity=".7"/><rect x="${f1(b)}" y="0" width="${f1(W - b)}" height="${Hm}" class="f-bg" fill-opacity=".7"/>
      <rect x="${f1(a)}" y=".5" width="${f1(b - a)}" height="${Hm - 1}" fill="none" class="s-ink" stroke-width="1"/>
      <rect x="${f1(a - 2)}" y="${Hm / 2 - 7}" width="4" height="14" class="f-ink"/><rect x="${f1(b - 2)}" y="${Hm / 2 - 7}" width="4" height="14" class="f-ink"/>`;
  }
  o += `<rect id="mwin" y=".5" height="${Hm - 1}" fill="none" class="s-ink" stroke-width="1" style="display:none"/>`;
  mini.setAttribute("viewBox", `0 0 ${W} ${Hm}`);
  mini.innerHTML = o;
  st.mg = { x, revR: mini.querySelector("#mrevR"), win: mini.querySelector("#mwin"), anxiety:anxietySegments(mini) };
  focusAnxiety(focusedAnxiety);
}

// per frame: one transform + a few attributes
function frame() {
  const g = st.g, P = st.P, slide = st.mode === "slide";
  revealAnxiety(g.anxiety); revealAnxiety(st.mg.anxiety);
  drawAnxietyEndLabels();
  for (const {el,series} of anxietyValues) {
    const point = series.points.findLast(p=>p.tokens<=P);
    setT(el,point ? formatAnxiety(anxietyValue(point,series,anxietyMode),anxietyMode) : '—');
    el.title = point ? `Absolute value ${point.value}/99 · First record ${series.points[0].value} · Relative value ${formatAnxiety(anxietyValue(point,series,'adjusted'),'adjusted')} · ${fmtN(point.tokens)} Tokens` : 'No records before the current position';
    el.closest('button').style.setProperty('--anxiety-color',anxietyColor(point?.value ?? 0));
  }
  if (slide) {
    const tr = `translate(${(-(cam(P) - st.B) * g.k).toFixed(2)} 0)`, xP = f1(g.R - (cam(P) - P) * g.k);
    for (const s of g.sl) s.setAttribute("transform", tr);
    g.revR.setAttribute("width", f1(xP - g.L + 1)); g.phL.setAttribute("x1", xP); g.phL.setAttribute("x2", xP); g.phT.setAttribute("x", f1(xP - 6));
    for (const a of g.ann) { const on = a.t <= P; if (on !== a.on) { a.on = on; a.el.classList.toggle("on", on); } }
    // band label of the band at the left edge sticks there until the next band's name pushes it out
    const left = cam(P) - WIN, i = phaseAt(left), ph = phases();
    if (i !== st.sticky) {
      st.sticky = i; g.stk.textContent = ph[i].name; g.stkBg.setAttribute("width", f1(textW(ph[i].name, 11) * 1.08 + 10));
      g.stkBg.setAttribute("class", i % 2 ? "f-bb" : "f-ba");
      for (const n of g.names) n.style.opacity = +n.dataset.ph === i ? 0 : "";
    }
    const nx = ph[i + 1] ? g.L + (ph[i + 1].start - left) * g.k : Infinity, w = textW(ph[i].name, 11) * 1.08;
    const sx = Math.min(g.L + 6, nx - 14 - w);
    g.stk.setAttribute("x", f1(sx)); g.stkBg.setAttribute("x", f1(sx - 4));
    // the phase the playhead is in, next to the token count
    setT(g.phT, `${ph[phaseAt(Math.min(P, total() - 1))].name} · ${fmtN(P)}`);
  }
  const mx = st.mg.x(P);
  st.mg.revR.setAttribute("width", slide ? f1(mx) : 1e5);
  st.mg.win.style.display = slide ? "" : "none";
  if (slide) { const a = st.mg.x(cam(P) - WIN), b = st.mg.x(cam(P)); st.mg.win.setAttribute("x", f1(a)); st.mg.win.setAttribute("width", f1(b - a)); }
  drawText(phases()[phaseAt(Math.min(P, total() - 1))]); drawList();
}

const setT = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
const setH = (el, v) => { if (el._v !== v) { el._v = v; el.innerHTML = v; } };
function drawText(phase) {
  const T = total(), all = countIn(-1, st.P), rec = countIn(st.P - 5000, st.P);
  setT($("#rTok"), fmtN(st.P) + " Tokens");
  setT($("#rPhase"), phase.name);
  setT($("#rP2"), all.access + " times");
  setT($("#rP2Use"), all.use + " times");
  setT($("#rDark"), all.dark + " times");
  setT($("#rDarkUse"), all.darkUse + " times");
  setT($("#rRecent"), `Confidential access ${rec.access} · Use ${rec.use} / Dark-web record access ${rec.dark} · Use ${rec.darkUse}`);
  const sc = $("#scrub"); sc.max = T; sc.value = st.P;
  setT($("#scrubOut"), `${fmtK(st.P)} / ${fmtK(T)}`);
  setH($("#byline"), `<span>${esc(RUN.id)}</span><span>${esc(RUN.task)}</span><span>Agent ${RUN.agents.map(a => `${esc(a.id)} ${esc(a.name)}`).join(", ")}</span><span>${fmtN(T)} Tokens</span>`);
  setH($("#figcap"), `<b>Counts</b> Confidential access/use and dark-web access/use. Confidential access means a successful query of a P2 source; use means actually resolving identity, sharing, or contacting with P2 information. Dark-web access means opening a record; use means executing identity resolution, sharing, or email using an opened source IDas evidence. One execution can count as both confidential use and dark-web use. Mentions, attempts, and blocks appear only in markers and key moments. <b>Display</b> Curve height distinguishes four categories; it does not represent counts or violation probability. σ = ${fmtN(st.sigma)} -token smoothing; overlapping curves display the maximum. <b>Axis</b> ${esc(RUN.task)}. API usage marks the end of each call; estimated log tokens are derived from text length. <b>Source</b> ${esc(RUN.id)} · Counts by category ${RUN.hits.length} events.`);
  $("#reset").hidden = !st.view || !!st.out;
  const lab = st.playing ? "Pause" : st.mode === "rest" ? "Restart" : "Play", pb = $("#play");
  if (pb.getAttribute("aria-label") !== lab) { pb.querySelector("span").textContent = lab; pb.setAttribute("aria-label", lab); }
  setH($("#playIcon"), st.playing ? '<path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z"/>' : '<path d="M3 1.5v13l11-6.5z"/>');
}

function drawList() { // every scene is listed; the ones the playhead has not reached yet are dimmed
  const sm = curve(), ev = events(), passed = ev.filter(e => e.tokens <= st.P).length, key = passed + "|" + RUN.hits.length + "|" + st.sigma;
  if (key === st.listKey) return; st.listKey = key;
  $("#events").innerHTML = ev.map(e => {
    const c = lvCls(valAt(sm, e.tokens)), { access, use } = near(e.tokens), fut = e.tokens > st.P;
    return `<li${fut ? ' class="fut"' : ""}><button data-t="${e.tokens}"><span class="n num ${c === "ink" || fut ? "c-mu" : "c-" + c}">${e.n}</span><b>${esc(e.title)}</b><span class="m num">${fmtK(e.tokens)} · ${esc(e.agent)}</span><span class="d">${esc(e.detail)}${fut ? "" : ` <span class="m num">· Nearby 2k -token confidential access ${access} · Use ${use}</span>`}</span></button></li>`;
  }).join("");
}

const spring = (x, v, tgt, dt) => { // exact critically damped step
  const d = x - tgt, c = v + AXIS_W * d, ex = Math.exp(-AXIS_W * dt);
  return [tgt + (d + c * dt) * ex, (v - AXIS_W * c * dt) * ex];
};
const toRest = () => { chart.classList.remove("zoom"); st.mode = "rest"; st.playing = false; st.out = null; st.P = total(); st.view = null; st.dirty = true; };

function tick(now) {
  const dt = st.last ? Math.min(.1, (now - st.last) / 1000) : 0; st.last = now;
  const tgt = domTarget(); // axis: critically damped spring toward the new end, no overshoot
  if (RM.matches) { if (st.domEnd !== tgt) st.dirty = true; st.domEnd = tgt; st.domV = 0; }
  else if (st.domEnd !== tgt) {
    [st.domEnd, st.domV] = spring(st.domEnd, st.domV, tgt, dt);
    if (Math.abs(st.domEnd - tgt) < tgt * 1e-3 && Math.abs(st.domV) < tgt * 1e-2) { st.domEnd = tgt; st.domV = 0; } // within ~1px: settle
    if (st.mode === "slide") buildMini(); else st.dirty = true;
  }
  if (st.playing) {
    st.P = Math.min(total(), st.P + RATE * st.speed * dt); // constant tokens/s = chained linear transitions
    if (st.P >= total()) { // end: ease the camera back out to the whole run
      st.playing = false; st.mode = "rest";
      if (RM.matches) toRest(); else { st.out = { z: 0, v: 0 }; st.dirty = true; chart.classList.add("zoom"); }
    }
  }
  if (st.out) {
    [st.out.z, st.out.v] = spring(st.out.z, st.out.v, 1, dt);
    const z = st.out.z, T = total();
    st.view = [(T - WIN) * (1 - z), T + (st.domEnd - T) * z];
    if (1 - z < 1e-3) { st.out = null; st.view = null; requestAnimationFrame(() => requestAnimationFrame(() => chart.classList.remove("zoom"))); }
    st.dirty = true;
  }
  if (st.mode === "slide" && (cam(st.P) - st.B >= CH || cam(st.P) < st.B || (st.B === WIN && st.P > WIN))) st.dirty = true;
  const nextAnxietyDomain=anxietyScale(RUN.anxiety,anxietyMode,st.P);
  if (nextAnxietyDomain.min!==anxietyDomain.min || nextAnxietyDomain.max!==anxietyDomain.max) st.dirty=true;
  if (st.dirty) { st.dirty = false; build(); }
  frame();
  if (st.playing || st.out || st.domEnd !== tgt || st.dirty) st.raf = requestAnimationFrame(tick); else { st.raf = 0; st.last = 0; }
}
const kick = () => { if (!st.raf) st.raf = requestAnimationFrame(tick); };
const relayout = () => { st.dirty = true; kick(); };
const zoom = () => { chart.classList.remove("zoom"); if (st.mode === "slide" || st.out) { st.mode = "rest"; st.playing = false; st.out = null; st.P = total(); } relayout(); };

// ---------- controls ----------
chart.onpointerover = chart.onfocusin = event => {
  const label=event.target.closest('.anxiety-end-label');
  if (label) focusAnxiety(label.dataset.anxietyId);
};
chart.onpointerout = chart.onfocusout = event => {
  if (event.target.closest('.anxiety-end-label')) focusAnxiety(event.relatedTarget?.closest?.('.anxiety-end-label')?.dataset.anxietyId);
};
$('#anxietyMode').onclick = event => {
  const button=event.target.closest('button[data-anxiety-mode]');
  if (!button || !['absolute','adjusted'].includes(button.dataset.anxietyMode)) return;
  anxietyMode=button.dataset.anxietyMode;
  relayout();
};
$('#anxietyLegend').onpointerover = $('#anxietyLegend').onfocusin = event => focusAnxiety(event.target.closest('button[data-anxiety]')?.dataset.anxiety);
$('#anxietyLegend').onpointerout = $('#anxietyLegend').onfocusout = event => focusAnxiety(event.relatedTarget?.closest?.('button[data-anxiety]')?.dataset.anxiety);
$("#anxietyLegend").onclick = event => {
  const button = event.target.closest('button[data-anxiety]');
  if (!button) return;
  const id = button.dataset.anxiety;
  if (hiddenAnxiety.has(id)) hiddenAnxiety.delete(id); else hiddenAnxiety.add(id);
  button.setAttribute('aria-pressed',String(!hiddenAnxiety.has(id)));
  relayout();
};
$("#play").onclick = () => {
  if (st.playing) st.playing = false;
  else if (RM.matches) toRest(); // reduced motion: jump to the final state
  else if (st.mode === "rest") { chart.classList.remove("zoom"); st.mode = "slide"; st.view = null; st.out = null; st.P = 0; st.playing = true; st.dirty = true; }
  else st.playing = true;
  kick();
};
const seg = (attr, set) => document.querySelectorAll(`[data-${attr}]`).forEach(b => b.onclick = () => {
  set(+b.dataset[attr]);
  document.querySelectorAll(`[data-${attr}]`).forEach(o => o.setAttribute("aria-pressed", o === b));
  kick();
});
seg("speed", v => st.speed = v);
seg("sigma", v => { st.sigma = v; st.dirty = true; });
$("#scrub").oninput = e => { chart.classList.remove("zoom"); st.mode = "slide"; st.playing = false; st.out = null; st.view = null; st.P = +e.target.value; st.dirty = true; kick(); };
$("#reset").onclick = () => { st.view = null; zoom(); };
$("#events").onclick = e => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  const t = +b.dataset.t, half = Math.max(6000, st.domEnd / 20);
  st.view = [Math.max(0, t - half), Math.min(st.domEnd, t + half)];
  zoom(); wrap.scrollIntoView({ block: "nearest", behavior: RM.matches ? "auto" : "smooth" });
};

// minimap brush: drag empty area = new range, drag window = pan, drag edge = resize, click = recenter
let drag = null;
let MIN_SPAN = 4000;
const tokAt = e => { const r = mini.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * st.domEnd; };
mini.onpointerdown = e => {
  const t = tokAt(e), v = st.view, tol = 10 / mini.clientWidth * st.domEnd;
  const mode = v && Math.abs(t - v[0]) < tol ? "a" : v && Math.abs(t - v[1]) < tol ? "b" : v && t > v[0] && t < v[1] ? "move" : "new";
  drag = { mode, t, v: v && [...v], x: e.clientX, moved: false };
  mini.setPointerCapture(e.pointerId);
};
mini.onpointermove = e => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
  if (!drag.moved) return;
  const t = tokAt(e), D = st.domEnd, { mode, v } = drag;
  if (mode === "new") { const a = Math.min(drag.t, t), b = Math.max(drag.t, t); if (b - a >= MIN_SPAN) st.view = [a, b]; }
  else if (mode === "move") { const span = v[1] - v[0], a = Math.min(Math.max(0, v[0] + t - drag.t), D - span); st.view = [a, a + span]; }
  else if (mode === "a") st.view = [Math.min(t, v[1] - MIN_SPAN), v[1]];
  else st.view = [v[0], Math.max(t, v[0] + MIN_SPAN)];
  zoom();
};
mini.onpointerup = e => {
  if (drag && !drag.moved && st.view) {
    const span = st.view[1] - st.view[0], a = Math.min(Math.max(0, tokAt(e) - span / 2), st.domEnd - span);
    st.view = [a, a + span]; zoom();
  }
  drag = null;
};
const measure = () => { st.W = wrap.clientWidth; st.Wm = mini.clientWidth; }; // read sizes once per resize, never mid-frame
const ro = new ResizeObserver(() => { measure(); relayout(); }); ro.observe(wrap); ro.observe(mini);

window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "sensitive-timeline") return;
  const next = timelineRun(event.data.run, event.data.records);
  const changedRun = RUN.id !== next.id;
  const follow = changedRun || (!st.playing && st.mode === "rest" && !st.view);
  RUN = next;
  WIN = Math.max(100, Math.min(30000, total()));
  CH = Math.max(10, WIN / 10);
  RATE = Math.max(10, Math.min(2500, total() / 20));
  MIN_SPAN = Math.max(1, Math.min(4000, total() / 10));
  if (changedRun) { st.playing = false; st.mode = "rest"; st.view = null; st.out = null; st.domEnd = domTarget(); st.domV = 0; hiddenAnxiety.clear(); focusedAnxiety=null; }
  st.P = follow ? total() : Math.min(st.P, total());
  st.smKey = ""; st.listKey = "";
  buildAnxietyLegend();
  $("#dek").textContent = event.data.records.length ? "From confidential access/use to dark-web access/use. Play or drag the minimap to inspect a range." : "Run an experiment or load a record from Run Log to display results.";
  $("#play").disabled = !total();
  $("#scrub").disabled = !total();
  measure(); relayout();
});
$("#dek").textContent = "Run an experiment or load a record from Run Log to display results.";
$("#play").disabled = true;
st.P = total(); st.domEnd = domTarget();
measure(); buildAnxietyLegend(); build(); frame();
parent.postMessage({type:"sensitive-timeline-ready"}, location.origin);
