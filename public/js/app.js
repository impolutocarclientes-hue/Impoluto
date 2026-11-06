import * as M from "./metrics.js";
import { calcular, cpaPotencial, CALC_DEFAULTS } from "./calc.js";
import { initFacturas, viewFacturas, onFactClick, onFactChange, cargarFacturas } from "./facturas.js";

// ============ utilidades ============
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nn = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const fARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fUSD = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fUSD1 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 1 });
const ars = (v) => fARS.format(Math.round(nn(v)));
const usd = (v) => fUSD.format(nn(v));
const usd1 = (v) => fUSD1.format(nn(v));
const int = (v) => Math.round(nn(v)).toLocaleString("es-AR");
const pct = (v, d = 1) => (nn(v) * 100).toFixed(d).replace(".", ",") + " %";
const x2 = (v) => nn(v).toFixed(2).replace(".", ",");
const CAJA = "Caja Impoluto";
const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function shortDate(d) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
function longDate(d) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); }
function monthName(ym) { const [y, m] = ym.split("-").map(Number); const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }); return s.charAt(0).toUpperCase() + s.slice(1); }
initFacturas({ api, toast, render, esc, money: ars });
// Último dólar de ARQ guardado (hoy o el más reciente).
function dolarArqHoy() {
  const D = (S.data && S.data.dolares) || {};
  const d = Object.keys(D).filter((k) => D[k].src === "arq").sort().pop();
  return d ? D[d].v : null;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), Math.max(2600, msg.length * 55)); }

const ICON = {
  dash: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  ads: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  caja: '<path d="M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2"/>',
  imp: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
  socios: '<path d="M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5"/>',
  gastos: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  calc: '<path d="M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  cfg: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15.4H3a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 009.6 4.6V4.5a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.8.3z"/>',
  sync: '<path d="M21 12a9 9 0 01-15.5 6.3M3 12A9 9 0 0118.5 5.7M18 2v4h-4M6 22v-4h4"/>',
  spark: '<path d="M4 18l5-6 4 3 7-9"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
};
const svg = (k, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const SRC = { shopify: '<svg class="src" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#95bf47"/></svg>', meta: '<svg class="src" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#0082fb"/></svg>', mix: '<svg class="src" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#dc327d"/></svg>' };
const tip = (t) => (t ? `<i class="tip" data-tip="${esc(t)}">i</i>` : "");

// ============ estado ============
const today = M.todayAR();
const S = {
  view: localStorage.getItem("imp_view") || "dashboard",
  sub: "resumen",
  cfgSub: "conexiones",
  preset: localStorage.getItem("imp_preset") || "30d",
  from: null, to: null,
  cur: "ARS",
  adsDays: 4, adsGroup: "bidcap",
  impMes: today.slice(0, 7),
  sociosR: "todo",
  gastosMes: today.slice(0, 7), gastosCat: "",
  data: { orders: [], ads: [], meta: {}, status: {} },
  loaded: false, syncing: false, conn: null,
  gastos: [], movs: [], app: {}, costos: {}, prods: {}, calcCur: null, escenarios: [],
};
const DEF_CATS = [
  { id: "meta", name: "Meta Ads", color: "#3557E8" }, { id: "stock", name: "Stock / Producto", color: "#0E8C7F" },
  { id: "envios", name: "Envíos y logística", color: "#C26A0A" }, { id: "packaging", name: "Packaging", color: "#8B4FE0" },
  { id: "shopify", name: "Shopify (plan)", color: "#2E9447" }, { id: "apps", name: "Apps Shopify", color: "#6A9A12" },
  { id: "comisiones", name: "Comisiones de cobro", color: "#D0367A" }, { id: "creativos", name: "Creativos y contenido", color: "#E0582A" },
  { id: "herramientas", name: "Herramientas / software", color: "#1A86C2" }, { id: "impuestos", name: "Impuestos y tasas", color: "#7A8291" },
  { id: "devoluciones", name: "Devoluciones y reemplazos", color: "#C73A32" }, { id: "otros", name: "Otros", color: "#8C7F72" },
];
const socios = () => (Array.isArray(S.app.socios) && S.app.socios.length >= 2 ? S.app.socios.slice(0, 2) : ["Francisco", "Socio"]);
const cats = () => (Array.isArray(S.app.cats) && S.app.cats.length ? S.app.cats : DEF_CATS);
const catOf = (g) => cats().find((c) => c.id === g.catId) || cats().find((c) => c.name === g.cat) || { id: "otros", name: g.cat || "Otros", color: "#8C7F72" };
// Costos de la configuración + el % real promedio de Mercado Pago (para pedidos que no se pudieron vincular a su cobro).
const costosVivos = () => ({ ...S.costos, _mpProm: S.mpPcts && S.mpPcts.todos && S.mpPcts.todos.n >= 10 ? S.mpPcts.todos.pct : null });
const cfg = () => M.costosCfg(costosVivos());
// Gasto diario de Meta (solo campañas de Impoluto), pasado a pesos con el dólar ARQ de cada día. Se arma solo
// desde la conexión con Meta: no se guarda, así nunca se duplica. Lo paga quien diga «La tarjeta de Meta la paga».
function gastosMetaAuto() {
  const ads = (S.data && S.data.ads) || [];
  if (!ads.length) return [];
  const conf = costosVivos(), conv = M.adsArs(ads, S.data.meta, conf), porDia = {};
  ads.forEach((a) => { const d = a.d; if (!d || !(nn(a.sp) > 0)) return; const x = (porDia[d] = porDia[d] || { usd: 0, ars: 0 }); x.usd += nn(a.sp); x.ars += nn(a.sp) * M.kDe(a, conv) * conv.recargo; });
  return Object.entries(porDia).map(([d, x]) => ({ id: "meta-auto-" + d, auto: true, fecha: d, concepto: "Meta Ads · campañas de Impoluto", catId: "meta", monto: x.ars, moneda: conv.usd ? "USD" : "ARS", montoOrig: conv.usd ? x.usd : x.ars, tc: conv.usd && x.usd ? x.ars / x.usd : null, quien: conf.metaPaga || "Caja", pago: "Tarjeta" }));
}
const gastosTodos = () => [...S.gastos.filter((g) => g.catId !== "meta" || !(S.data && S.data.ads && S.data.ads.length)), ...gastosMetaAuto()];
const ctx = () => ({ orders: S.data.orders, ads: S.data.ads, meta: S.data.meta, pays: S.data.pays || [], costos: costosVivos(), prods: S.prods, gastos: gastosTodos(), movs: S.movs, stockMovs: S.stockMovs || [], fifo: S.fifo });
const money = (v) => (S.cur === "USD" ? usd(nn(v) / nn(cfg().dolar || 1)) : ars(v));

function rangeOf(p) {
  const t = today;
  switch (p) {
    case "hoy": return [t, t];
    case "ayer": return [M.addDays(t, -1), M.addDays(t, -1)];
    case "7d": return [M.addDays(t, -6), t];
    case "30d": return [M.addDays(t, -29), t];
    case "mes": return [t.slice(0, 8) + "01", t];
    case "mespasado": { const d = M.addDays(t.slice(0, 8) + "01", -1); return [d.slice(0, 8) + "01", d]; }
    case "90d": return [M.addDays(t, -89), t];
    default: return [S.from || M.addDays(t, -29), S.to || t];
  }
}
function setRange(p) { S.preset = p; if (p !== "custom") [S.from, S.to] = rangeOf(p); localStorage.setItem("imp_preset", p); }
setRange(S.preset === "custom" ? "30d" : S.preset);
const prevRange = (f, t) => { const n = M.daysBetween(f, t); return [M.addDays(f, -n), M.addDays(f, -1)]; };

// ============ datos ============
let db = null;
async function api(path, opts) {
  const r = await fetch(path, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", ...((opts && opts.headers) || {}) } });
  if (r.status === 401) { location.reload(); throw new Error("auth"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.detail || "Error " + r.status);
  return j;
}
async function loadData() {
  try {
    S.data = await api(`/api/data?from=2020-01-01&to=${M.addDays(today, 1)}`);
    // Cada pedido con su cobro real de Mercado Pago (comisión exacta en vez del %).
    // Nombre actual de cada producto (aunque en el pedido haya quedado el nombre viejo).
    const T = (S.data.meta && S.data.meta.prodTitles) || {};
    if (!T._error) S.data.orders.forEach((o) => o.li.forEach((l) => { if (l.pid && T[l.pid] && T[l.pid] !== l.ti) { l.tiOrig = l.ti; l.ti = T[l.pid]; } }));
    S.data.orders = M.vincularPagos(S.data.orders, S.data.pays);
    S.data.ads = M.soloCampanasTienda(S.data.ads);
    // Cada día de anuncios con su dólar (ARQ si está guardado; si no, el cripto de ese día).
    const DL = S.data.dolares || {};
    S.data.ads.forEach((a) => { if (DL[a.d]) a.k = DL[a.d].v; });
    S.mpPcts = M.mpPctReales(S.data.pays, M.addDays(today, -60));
    S.loaded = true;
  } catch (e) { if (e.message !== "auth") S.loadErr = e.message; }
  render();
}
async function loadConn() { try { S.conn = await api("/api/connect"); } catch {} render(); }
async function sync(which = "all", extra = {}) {
  if (S.syncing) return;
  S.syncing = true; render();
  try {
    const r = await api("/api/sync", { method: "POST", body: JSON.stringify({ which, ...extra }) });
    const errs = [r.shopify && r.shopify.error, r.meta && r.meta.error, r.mp && r.mp.error].filter(Boolean);
    toast(errs.length ? "Sync con errores: " + errs[0] : "Datos actualizados");
  } catch (e) { toast("No se pudo sincronizar: " + e.message); }
  S.syncing = false;
  await Promise.all([loadData(), loadConn()]);
}

function subscribe() {
  db.collection("gastos").onSnapshot((s) => { S.gastos = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => g.fecha); schedule(); });
  db.collection("movimientos").onSnapshot((s) => { S.movs = s.docs.map((d) => ({ id: d.id, ...d.data() })); schedule(); });
  db.collection("stockmov").onSnapshot((s) => { S.stockMovs = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.pid && m.fecha); schedule(); });
  db.collection("prods").onSnapshot((s) => { const o = {}; s.docs.forEach((d) => (o[d.id] = d.data())); S.prods = o; schedule(); });
  db.collection("escenarios").onSnapshot((s) => { S.escenarios = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); schedule(); });
  db.doc("config/app").onSnapshot((d) => { S.app = d.exists ? d.data() : {}; schedule(); });
  db.doc("config/costos").onSnapshot((d) => { S.costos = d.exists ? d.data() : {}; schedule(); });
  db.doc("config/calc").onSnapshot((d) => { if (!S.calcTouched) S.calcCur = d.exists ? d.data() : null; schedule(); });
}
let rt = null;
function schedule() { clearTimeout(rt); rt = setTimeout(render, 30); }
const saveDoc = (p, d) => db.doc(p).set(d);
let costTimer = null;
function saveCostos(patch) {
  S.costos = { ...S.costos, ...patch };
  clearTimeout(costTimer);
  costTimer = setTimeout(() => saveDoc("config/costos", S.costos).catch((e) => toast("No se guardó: " + e.message)), 500);
}

// ============ gráficos ============
function spark(vals, color = "#dc327d") {
  if (!vals || vals.length < 2) return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><defs><linearGradient id="gz" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M0 28 L100 28" stroke="${color}" stroke-opacity=".5" stroke-width="1" fill="none" vector-effect="non-scaling-stroke"/><path d="M0 28 L100 28 L100 40 L0 40Z" fill="url(#gz)"/></svg>`;
  const mn = Math.min(...vals, 0), mx = Math.max(...vals, 1e-9), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 100, 34 - ((v - mn) / rg) * 28]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L100 40 L0 40Z" fill="url(#${id})"/><path d="${d}" stroke="${color}" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}
function lineChart(series, labels, fmt) {
  const W = 1000, H = 260, L = 70, R = 10, T = 10, B = 28;
  const all = series.flatMap((s) => s.vals);
  let mn = Math.min(0, ...all), mx = Math.max(1, ...all);
  const rg = mx - mn || 1; mx += rg * 0.06;
  const X = (i) => L + (labels.length > 1 ? (i / (labels.length - 1)) * (W - L - R) : 0);
  const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = mn + ((mx - mn) * k) / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#252525"/><text x="${L - 8}" y="${Y(v) + 4}" fill="#737373" font-size="11" text-anchor="end">${esc(fmt(v))}</text>`; }
  if (mn < 0) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#525252" stroke-dasharray="3 3"/>`;
  const step = Math.max(1, Math.ceil(labels.length / 9));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) g += `<text x="${X(i)}" y="${H - 8}" fill="#737373" font-size="11" text-anchor="middle">${esc(l)}</text>`; });
  series.forEach((s) => {
    if (s.bars) { const bw = Math.max(2, ((W - L - R) / Math.max(1, labels.length)) * 0.6); s.vals.forEach((v, i) => { g += `<rect x="${X(i) - bw / 2}" y="${Math.min(Y(v), Y(0))}" width="${bw}" height="${Math.abs(Y(v) - Y(0))}" fill="${s.color}" opacity=".35" rx="2"/>`; }); return; }
    const d = s.vals.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
    g += `<path d="${d}" stroke="${s.color}" stroke-width="2" fill="none"${s.dash ? ' stroke-dasharray="5 4"' : ""}/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg><div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}

// ============ tarjetas (estilo Escalafy) ============
function delta(cur, prev, invert) {
  if (!prev || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return "";
  const d = (cur - prev) / Math.abs(prev);
  if (Math.abs(d) < 0.0005) return '<span class="muted">igual que antes</span>';
  const good = invert ? d < 0 : d > 0;
  return `<span class="${good ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${pct(Math.abs(d), 0)}</span> <span class="muted">vs período anterior</span>`;
}
function card(c) {
  return `<div class="cell ${c.tone || ""}"><div class="lbl">${esc(c.label)} ${tip(c.tip)}${SRC[c.src] || ""}</div><div class="v">${c.value}</div><div class="d">${c.sub || ""}</div>${spark(c.series, c.color)}</div>`;
}
function block(id, title, inner, right = "") { return `<section class="block" id="b-${id}"><div class="bh"><h2>${svg("spark", "ico")}${esc(title)}</h2>${right}</div>${inner}</section>`; }

// ============ vistas ============
const VIEWS = [
  ["dashboard", "Dashboard", "dash"], ["anuncios", "Anuncios", "ads"], ["caja", "Cashflow", "caja"],
  ["impuestos", "Impuestos", "imp"], ["socios", "Socios", "socios"], ["gastos", "Tracker gastos", "gastos"],
  ["stock", "Control de stock", "box"], ["facturas", "Facturador", "imp"], ["calculadora", "Calculadora de precios", "calc"], ["config", "Configuración", "cfg"],
];
function sideHTML() {
  const c = S.conn || {};
  const dot = (x) => (x && x.connected ? (x.ok === false || x.error ? "bad" : "ok") : "");
  const last = c.sync && (c.sync.shopify || c.sync.meta || c.sync.mp) ? new Date((c.sync.shopify || c.sync.meta || c.sync.mp).at) : null;
  return `<div class="brand"><i></i>Impoluto</div><h6>Analítica</h6>${VIEWS.slice(0, 5).map(navBtn).join("")}<h6>Operación</h6>${VIEWS.slice(5).map(navBtn).join("")}
  <div class="foot"><div><span class="dot ${dot(c.shopify)}"></span>Shopify ${c.shopify && c.shopify.connected ? "" : "· sin conectar"}</div><div><span class="dot ${dot(c.meta)}"></span>Meta Ads ${c.meta && c.meta.connected ? "" : "· sin conectar"}</div><div><span class="dot ${dot(c.mp)}"></span>Mercado Pago ${c.mp && c.mp.connected ? "" : "· sin conectar"}</div>
  <div>${last ? "Actualizado " + last.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sin sincronizar"}</div><button class="ctl" data-act="logout" style="justify-self:start">Cerrar sesión</button></div>`;
}
const navBtn = ([id, label, ic]) => `<button data-nav="${id}" aria-current="${S.view === id}">${svg(ic)}${esc(label)}</button>`;

function topRight() {
  const can = S.conn && (S.conn.shopify.connected || S.conn.meta.connected || (S.conn.mp && S.conn.mp.connected));
  return `<div class="seg" role="group"><button data-cur="ARS" aria-pressed="${S.cur === "ARS"}">ARS</button><button data-cur="USD" aria-pressed="${S.cur === "USD"}">USD</button></div>
  ${can ? `<button class="ctl" data-act="sync" ${S.syncing ? "disabled" : ""}>${S.syncing ? "Sincronizando…" : "↻ Actualizar"}</button>` : `<button class="ctl pri" data-nav="config">Conectar Shopify y Meta</button>`}`;
}
const PRESETS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "7 días"], ["30d", "30 días"], ["mes", "Este mes"], ["mespasado", "Mes pasado"], ["90d", "90 días"]];
function rangeBar() {
  return `<div class="chips">${PRESETS.map(([k, l]) => `<button class="chip" data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join("")}
  <input type="date" class="chip" data-range="from" value="${S.from}" max="${today}" aria-label="Desde"><input type="date" class="chip" data-range="to" value="${S.to}" max="${today}" aria-label="Hasta"></div>`;
}

function banners() {
  const out = [];
  const c = S.conn;
  if (c && !c.shopify.connected) out.push('<p class="banner info">Conectá tu tienda de Shopify para ver las ventas solas. Está en <a href="#" data-nav="config">Configuración → Conexiones</a>.</p>');
  if (c && c.shopify.connected && c.shopify.error) out.push(`<p class="banner bad">Shopify: ${esc(c.shopify.error)}</p>`);
  if (c && c.meta.connected && c.meta.error) out.push(`<p class="banner bad">Meta: ${esc(c.meta.error)}</p>`);
  if (c && c.mp && c.mp.connected && c.mp.error) out.push(`<p class="banner bad">Mercado Pago: ${esc(c.mp.error)}</p>`);
  if (c && c.meta.connected && c.meta.savedAt && S.costos.metaVence) {
    const left = Math.ceil((Date.parse(S.costos.metaVence) - Date.now()) / 864e5);
    if (left <= 10) out.push(`<p class="banner warn">El acceso a Meta vence en ${left} días. Generá uno nuevo y pegalo en Configuración → Conexiones.</p>`);
  }
  const sinCosto = productosVistos().filter((p) => sinCostoCargado(p.pid) && p.ventas > 0);
  if (S.loaded && S.view === "dashboard") {
    const urg = M.stockDetalle(ctx(), today).filter((x) => x.estadoStock === "sin-stock" || x.estadoStock === "critico");
    if (urg.length) out.push(`<p class="banner bad">Stock: ${urg.map((x) => `${esc(x.nombre)} ${x.estadoStock === "sin-stock" ? "sin stock" : "alcanza " + int(x.dias) + " días"}`).join(" · ")}. <a href="#" data-nav="stock">Ver stock</a></p>`);
  }
  if (S.loaded && sinCosto.length) out.push(`<p class="banner warn">Falta el costo de ${sinCosto.length === 1 ? esc(sinCosto[0].titulo) : sinCosto.length + " productos"}: la ganancia sale más alta de lo que es. <a href="#" data-nav="config" data-cfgsub="productos">Cargalo acá</a>.</p>`);
  if (S.loaded && !nn(cfg().envioPedido) && !nn(cfg().armadoPedido) && !S.costos.envioOk) out.push('<p class="banner warn">Todavía no cargaste cuánto te sale el envío y el armado de cada pedido. Si no pagás nada de eso, poné 0 en <a href="#" data-nav="config" data-cfgsub="costos">Costos y comisiones</a>.</p>');
  return out.join("");
}

const sinCostoCargado = (pid) => { const c = (S.prods[pid] || {}).costo; return c == null || c === ""; };

// ---------- Resumen (lo importante, en criollo) ----------
function plataBars(r) {
  const items = [["Producto", r.producto, "#0E8C7F"], ["Cobro e impuestos", r.cobroImp, "#D0367A"], ["Envío y armado", r.envio + r.armado, "#C26A0A"], ["Anuncios", r.anuncios, "#0082fb"], ["Gastos fijos", r.fijos, "#7A8291"]].filter((x) => x[1] > 0);
  const max = Math.max(r.ventas, 1);
  return `<div class="flow"><div class="row"><span>Entró</span><div class="track"><div class="fill" style="width:100%;background:#34d399"></div></div><b>${money(r.ventas)}</b></div>
    ${items.map(([l, v, c]) => `<div class="row"><span>${l}</span><div class="track"><div class="fill" style="width:${Math.min(100, (v / max) * 100)}%;background:${c}"></div></div><b>−${money(v)}</b></div>`).join("")}
    <div class="row" style="border-top:1px solid var(--n690);padding-top:8px"><span><b>Te quedó</b></span><div></div><b class="${r.ganancia < 0 ? "down" : "up"}">${money(r.ganancia)}</b></div></div>`;
}
function chartHTML(serie) {
  const labels = serie.map((d) => shortDate(d.d));
  const k = S.cur === "USD" ? 1 / nn(cfg().dolar || 1) : 1;
  const fmt = (v) => (S.cur === "USD" ? "US$" : "$") + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " M" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + " mil" : Math.round(v));
  return `<div class="card chart">${lineChart([{ name: "Vendiste", color: "#dc327d", vals: serie.map((d) => d.ventas * k) }, { name: "Te quedó", color: "#34d399", vals: serie.map((d) => d.ganancia * k) }, { name: "Anuncios", color: "#0082fb", vals: serie.map((d) => d.anuncios * k), bars: true }], labels, fmt)}</div>`;
}
function resumenHTML(r, p, serie) {
  const sv = (k) => serie.map((d) => d[k]);
  if (!r.pedidos && !r.anuncios) return '<div class="card empty"><b>Todavía no hay ventas ni anuncios en estas fechas.</b><br>Si recién conectaste, tocá ↻ Actualizar arriba.</div>';
  const gana = r.ganancia >= 0;
  const de100 = Math.round(Math.abs(r.margen) * 100);
  const titulo = !r.ventas ? "Todavía no cobraste ventas en estas fechas." : gana ? `Ganaste plata: de cada $100 que vendiste te quedaron $${de100}.` : `Perdiste plata: de cada $100 que vendiste perdiste $${de100}.`;
  const vsAntes = p.ventas ? (r.ganancia >= p.ganancia ? `Mejoró contra los ${r.dias} días anteriores (${money(p.ganancia)}).` : `Empeoró contra los ${r.dias} días anteriores (${money(p.ganancia)}).`) : "";
  const tiles = [
    { label: "Vendiste", value: money(r.ventas), sub: `${int(r.pagados)} pedidos pagados · ${delta(r.ventas, p.ventas)}`, series: sv("ventas"), src: "shopify" },
    { label: "Te quedó", value: money(r.ganancia), sub: delta(r.ganancia, p.ganancia) || (r.ventas ? `${pct(r.margen)} de lo que vendiste` : ""), series: sv("ganancia"), tone: gana ? "good" : "bad", color: gana ? "#34d399" : "#ef4444", src: "mix" },
    { label: "En anuncios", value: money(r.anuncios), sub: r.monedaAds === "USD" && S.cur !== "USD" ? usd(r.spendCuenta) + " en Meta" : delta(r.anuncios, p.anuncios, true), series: sv("anuncios"), color: "#0082fb", src: "meta" },
    { label: "Cada venta te costó", value: r.pagados && r.anuncios ? usd1(r.cpaUsd) : "–", sub: r.cpaMaxUsd ? `podés pagar hasta ${usd1(r.cpaMaxUsd)}` : "", tone: r.cpaUsd && r.cpaMaxUsd ? (r.cpaUsd <= r.cpaMaxUsd ? "good" : "bad") : "", src: "mix" },
  ];
  const ok = (b) => `<span class="dot ${b ? "ok" : "bad"}"></span>`;
  const frases = [];
  if (r.anuncios && r.ventas) frases.push(`${ok(r.roas >= r.beRoas)}Por cada <b>$1</b> que pusiste en anuncios volvieron <b>$${x2(r.roas)}</b>. Para no perder alcanzaba con <b>$${x2(r.beRoas)}</b>: ${r.roas >= r.beRoas ? "estás arriba del equilibrio." : "estás debajo del equilibrio, perdés plata con los anuncios."}`);
  if (r.anuncios && r.pagados) frases.push(`${ok(r.cpaUsd <= r.cpaMaxUsd)}Cada venta te costó <b>${usd1(r.cpaUsd)}</b> en anuncios y podés pagar hasta <b>${usd1(r.cpaMaxUsd)}</b> sin perder.`);
  if (r.pagados) frases.push(`<span class="dot"></span>Cada pedido te deja <b>${money(r.aov)}</b> en promedio y se llevan <b>${x2(r.unidadesPorPedido).replace(",00", "")}</b> unidades.`);
  if (r.pendientes.n + r.vencidos.n) frases.push(`${ok(false)}Quedaron <b>${money(r.pendientes.monto + r.vencidos.monto)}</b> sin cobrar en ${int(r.pendientes.n + r.vencidos.n)} pedidos (pendientes o vencidos).`);
  if (r.mpReal) {
    const lib = M.mpALiberar(S.data.pays);
    frases.push(`<span class="dot"></span>Mercado Pago te cobró <b>${pct(r.mpReal.pct)}</b> de comisión real${r.mpReal.retenciones ? ` y te retuvo <b>${money(r.mpReal.retenciones)}</b> de impuestos (a cuenta, no es costo)` : ""}.${lib && lib.total ? ` Tenés <b>${money(lib.total)}</b> por liberar.` : ""}`);
  }
  const top = M.ofertas(ctx(), S.from, S.to).filter((o) => o.pedidos >= 3).sort((a, b) => b.antes - a.antes)[0];
  if (top) frases.push(`<span class="dot ok"></span>La oferta que más plata te deja por venta es la de <b>${top.oferta}${top.oferta === 3 ? " o más" : ""} ${top.oferta === 1 ? "unidad" : "unidades"}</b>: ${money(top.antes)} antes del anuncio.`);
  return `<div class="hero"><span class="muted">${shortDate(S.from)} – ${shortDate(S.to)}</span><span class="big ${gana ? "" : "down"}" style="font-size:30px">${titulo}</span><p class="muted small">${vsAntes}</p></div>
    <div class="grid">${tiles.map(card).join("")}</div>
    <div class="cols"><div class="card"><h3>Cómo vas</h3><div style="display:grid;gap:10px;font-size:14px">${frases.map((f) => `<div>${f}</div>`).join("")}</div></div>
    <div class="card"><h3>A dónde fue la plata</h3>${plataBars(r)}</div></div>
    ${block("grafico-r", "Día por día", chartHTML(serie))}
    <div class="actions"><button class="ctl" data-sub="todas">Ver todo el detalle →</button><button class="ctl" data-nav="anuncios">Ver cómo vienen tus anuncios →</button></div>`;
}

// ---------- Dashboard ----------
const SUBS = [["resumen", "Resumen"], ["todas", "Todo el detalle"], ["plata", "A dónde fue la plata"], ["tienda", "Pedidos"], ["meta", "Anuncios de Meta"], ["costos", "Costos"], ["productos", "Productos"], ["ofertas", "Ofertas"], ["embudo", "Dónde se pierde la gente"], ["mes", "Tu mes"], ["ventas", "Últimas ventas"], ["grafico", "Día por día"]];
function viewDashboard() {
  const c = ctx();
  const r = M.resumen(c, S.from, S.to);
  const [pf, pt] = prevRange(S.from, S.to);
  const p = M.resumen(c, pf, pt);
  const serie = M.serieDiaria(c, S.from, S.to);
  const sv = (k) => serie.map((d) => d[k]);
  const conf = cfg();
  const show = (k) => S.sub === "todas" || S.sub === k;
  let h = `<div class="bar2"><div class="chips">${SUBS.map(([k, l]) => `<button class="chip" data-sub="${k}" aria-pressed="${S.sub === k}">${l}</button>`).join("")}</div>${rangeBar()}</div><div class="content">${banners()}`;
  if (!S.loaded) return h + '<div class="empty">Cargando datos…</div></div>';
  if (S.sub === "resumen") return h + resumenHTML(r, p, serie) + "</div>";

  if (show("principales")) {
    const cards = [
      { label: "Vendiste", tip: "Facturación: lo que entró de verdad de los pedidos pagados, sin devoluciones.", value: money(r.ventas), sub: delta(r.ventas, p.ventas), series: sv("ventas"), src: "shopify" },
      { label: "Te quedó", tip: "Ganancia: lo que vendiste menos producto, cobro e impuestos, envío y armado, anuncios y gastos fijos.", value: money(r.ganancia), sub: delta(r.ganancia, p.ganancia), series: sv("ganancia"), tone: r.ganancia < 0 ? "bad" : "", src: "mix" },
      { label: "Margen", tip: "Ganancia ÷ ventas. De cada $100 que vendés, cuánto te queda.", value: pct(r.margen), sub: delta(r.margen, p.margen), src: "mix" },
      { label: "Pedidos pagados", tip: `Pedidos pagados. Se hicieron ${int(r.pedidos)} en total (incluye pendientes, vencidos y cancelados).`, value: int(r.pagados), sub: delta(r.pagados, p.pagados), series: sv("pedidos"), src: "shopify" },
      { label: "En anuncios", tip: `Inversión publicitaria: gasto en Meta${nn(conf.recargoAds) ? " con el " + conf.recargoAds + " % de recargo" : ""}, pasado a pesos con tu dólar.`, value: money(r.anuncios), sub: r.monedaAds === "USD" ? usd(r.spendCuenta) + " en la cuenta" : delta(r.anuncios, p.anuncios, true), series: sv("anuncios"), color: "#0082fb", src: "meta" },
      { label: "Por cada $1 en anuncios", tip: "ROAS: ventas ÷ gasto en anuncios. Cuánto vendiste por cada $1 que pusiste en Meta.", value: "$" + x2(r.roas), sub: r.beRoas ? `para no perder necesitás más de $${x2(r.beRoas)}` : "", tone: r.roas && r.beRoas ? (r.roas >= r.beRoas ? "good" : "bad") : "", src: "mix" },
      { label: "Para no perder necesitás", tip: "ROAS de equilibrio (break even): ventas ÷ lo que te queda antes de pagar anuncios. Por debajo, perdés plata.", value: "$" + x2(r.beRoas), sub: delta(r.beRoas, p.beRoas, true), src: "mix" },
      { label: "Por cada $1, sin costos", tip: "True ROAS: lo vendido ya sin producto, envío, armado y comisiones, dividido lo que pusiste en anuncios.", value: "$" + x2(r.trueRoas), sub: delta(r.trueRoas, p.trueRoas), src: "mix" },
      { label: "Cada venta te costó", tip: "CPA: lo que gastaste en anuncios por cada venta pagada.", value: usd1(r.cpaUsd), sub: r.cpaMaxUsd ? `podés pagar hasta ${usd1(r.cpaMaxUsd)} sin perder` : "", tone: r.cpaUsd && r.cpaMaxUsd ? (r.cpaUsd <= r.cpaMaxUsd ? "good" : "bad") : "", src: "mix" },
      { label: "Cada pedido, en promedio", tip: "Ticket promedio (AOV): ventas ÷ pedidos pagados.", value: money(r.aov), sub: `${x2(r.unidadesPorPedido)} unidades por pedido`, src: "shopify" },
      { label: "Vendiste, sin costos de venta", tip: "Facturación neta: ventas menos producto, envío, armado y comisiones de cobro.", value: money(r.netas), sub: delta(r.netas, p.netas), src: "mix" },
      { label: "Parte de lo vendido que va a anuncios", tip: "MER: anuncios ÷ ventas.", value: pct(r.mer), sub: delta(r.mer, p.mer, true), src: "mix" },
    ];
    h += block("principales", "Números clave", `<div class="grid">${cards.map(card).join("")}</div>`, `<span class="muted">${shortDate(S.from)} – ${shortDate(S.to)}</span>`);
  }
  if (show("plata")) {
    const items = [["Producto", r.producto, "#0E8C7F"], ["Cobro e impuestos", r.cobroImp, "#D0367A"], ["Envío y armado", r.envio + r.armado, "#C26A0A"], ["Anuncios", r.anuncios, "#0082fb"], ["Gastos fijos", r.fijos, "#7A8291"]];
    const salio = items.reduce((a, x) => a + x[1], 0);
    const max = Math.max(r.ventas, 1);
    h += block("plata", "A dónde fue la plata", `<div class="cols"><div class="hero"><span class="muted">Te quedó</span><span class="big ${r.ganancia < 0 ? "down" : ""}">${money(r.ganancia)}</span>
      <p>${r.anuncios ? `Por cada $1 en anuncios volvieron <b>$${x2(r.roas)}</b> y para no perder alcanzaba con <b>$${x2(r.beRoas)}</b>: ${r.roas >= r.beRoas ? "estás arriba del equilibrio." : "estás debajo del equilibrio."}` : "Todavía no hay gasto en anuncios en estas fechas."}</p>
      ${r.pagados && r.anuncios ? `<p>Cada venta te costó <b>${usd1(r.cpaUsd)}</b> en anuncios y podés pagar hasta <b>${usd1(r.cpaMaxUsd)}</b> sin perder.</p>` : ""}
      <p class="muted small">${p.ventas ? (r.ganancia >= p.ganancia ? "Mejoró" : "Empeoró") + " contra el período anterior (" + money(p.ganancia) + ")." : ""}</p></div>
      <div class="card"><div class="flow"><div class="row"><span>Entró</span><div class="track"><div class="fill" style="width:100%;background:#34d399"></div></div><b>${money(r.ventas)}</b></div>
      ${items.map(([l, v, c]) => `<div class="row"><span>${l}</span><div class="track"><div class="fill" style="width:${Math.min(100, (v / max) * 100)}%;background:${c}"></div></div><b>${money(v)}</b></div>`).join("")}
      <div class="row"><span><b style="text-align:left">Salió</b></span><div></div><b>${money(salio)}</b></div></div>
      <details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Ver la cuenta</summary><table class="tbl" style="margin-top:8px">
      ${[[r.mpReal ? "Mercado Pago (real)" : "Mercado Pago (estimado)", r.mp], ["Shopify", r.shopify], ["Ingresos brutos", r.iibb], ["IVA de venta (lo que pagás)", r.ivaDebito], ["IVA que descontás", -r.ivaCredito], ["IVA a pagar", r.ivaPagar], ["Envío", r.envio], ["Armado", r.armado]].map(([l, v]) => `<tr><td>${l}</td><td class="r">${money(v)}</td></tr>`).join("")}</table></details></div></div>`);
  }
  if (show("tienda")) {
    const cards = [
      { label: "Pedidos que se hicieron", tip: "Todos los pedidos, pagados o no.", value: int(r.pedidos), sub: delta(r.pedidos, p.pedidos), src: "shopify" },
      { label: "Se pagaron", value: int(r.pagados), sub: money(r.ventas), src: "shopify" },
      { label: "Todavía sin cobrar", tip: "Pedidos pendientes de pago.", value: int(r.pendientes.n), sub: money(r.pendientes.monto), src: "shopify" },
      { label: "Venció el pago", value: int(r.vencidos.n), sub: money(r.vencidos.monto), src: "shopify" },
      { label: "Cancelados", value: int(r.cancelados.n), sub: money(r.cancelados.monto), src: "shopify" },
      { label: "Devueltos", value: int(r.devueltos.n), sub: money(r.devueltos.monto), src: "shopify" },
      { label: "Descontaste", tip: "Plata que se descontó en los pedidos pagados.", value: money(r.descuentos), sub: r.pagados ? `${pct(r.conDescuento / r.pagados, 0)} de los pedidos` : "", src: "shopify" },
      { label: "Pagaron por transferencia", tip: "Pedidos pagados con un medio manual (no pagan comisión de Mercado Pago).", value: int(r.transferencias), sub: r.pagados ? pct(r.transferencias / r.pagados, 0) : "", src: "shopify" },
    ];
    const codes = Object.entries(r.codigos).sort((a, b) => b[1] - a[1]);
    h += block("tienda", "Pedidos", `<div class="grid">${cards.map(card).join("")}</div>${codes.length ? `<p class="note" style="margin-top:8px">Códigos usados: ${codes.slice(0, 8).map(([k, v]) => `<span class="tag">${esc(k)} · ${v}</span>`).join(" ")}</p>` : ""}`);
  }
  if (show("meta")) {
    const m = r.meta;
    const cards = [
      { label: "Gastaste en Meta", value: r.monedaAds === "USD" ? usd(r.spendCuenta) : ars(r.spendCuenta), sub: money(r.anuncios) + " en pesos", src: "meta", series: sv("anuncios"), color: "#0082fb" },
      { label: "Meta dice que vendiste", tip: "Lo que el píxel atribuye a tus anuncios. Puede no coincidir con Shopify.", value: money(m.pv), sub: `${int(m.pu)} compras según Meta`, src: "meta" },
      { label: "Por cada $1, según Meta", tip: "ROAS del píxel: lo que Meta dice que vendiste ÷ gasto.", value: "$" + x2(m.roasPixel), src: "meta" },
      { label: "Cada compra, según Meta", tip: "CPA del píxel: gasto ÷ compras que reporta Meta.", value: r.monedaAds === "USD" ? usd(m.cpaPixel) : ars(m.cpaPixel), src: "meta" },
      { label: "Que te vean 1.000 veces cuesta", tip: "CPM: costo de 1.000 impresiones.", value: r.monedaAds === "USD" ? usd(m.cpm) : ars(m.cpm), src: "meta" },
      { label: "Tocan el anuncio", tip: "CTR: clics en el enlace ÷ impresiones. De cada 100 que lo ven, cuántos tocan.", value: pct(m.ctr, 2), src: "meta" },
      { label: "Veces que se vio", tip: "Impresiones.", value: int(m.imp), src: "meta" },
      { label: "Agregaron al carrito", value: int(m.atc), sub: m.atc ? (r.monedaAds === "USD" ? usd(r.spendCuenta / m.atc) : ars(r.spendCuenta / m.atc)) + " cada uno" : "", src: "meta" },
    ];
    h += block("meta", "Anuncios de Meta", S.data.ads.length ? `<div class="grid">${cards.map(card).join("")}</div>` : '<div class="card empty">Conectá Meta en Configuración para ver el gasto y el ROAS.</div>');
  }
  if (show("costos")) {
    const cards = [
      { label: "Producto", tip: "Unidades vendidas × el costo que cargaste de cada producto.", value: money(r.producto), sub: r.ventas ? pct(r.producto / r.ventas) + " de la facturación" : "", src: "mix" },
      { label: "Envío y armado", value: money(r.envio + r.armado), sub: r.pagados ? money((r.envio + r.armado) / r.pagados) + " por pedido" : "", src: "mix" },
      { label: "Mercado Pago", tip: r.mpReal ? "Comisión real que te cobró Mercado Pago (sale de tus cobros)." : "Comisión estimada con el % que cargaste (conectá Mercado Pago para usar la real).", value: money(r.mp), sub: r.mpReal ? `real · ${pct(r.mpReal.pct)} de lo cobrado` : r.ventas ? `estimada · ${pct(r.mp / r.ventas)}` : "", src: "mix" },
      ...(r.mpReal ? [{ label: "Retenciones de Mercado Pago", tip: "Impuestos que te retuvo Mercado Pago (IIBB, IVA, Ganancias). No son costo: son pagos a cuenta que descontás en tus declaraciones.", value: money(r.mpReal.retenciones), sub: "a cuenta de impuestos", src: "mix" }] : []),
      { label: "Shopify", tip: "Lo que se queda Shopify por venta.", value: money(r.shopify), src: "mix" },
      { label: "Ingresos brutos", value: money(r.iibb), src: "mix" },
      { label: "IVA a pagar", tip: "IVA de venta (con el beneficio) menos el IVA de comisiones, envío y lo que te facturan.", value: money(r.ivaPagar), src: "mix" },
      { label: "Anuncios", value: money(r.anuncios), src: "meta" },
      { label: "Gastos fijos", tip: `Lo que pagás todos los meses (${money(r.fijosMensual)} por mes), repartido día a día.`, value: money(r.fijos), src: "mix" },
    ];
    h += block("costos", "Costos", `<div class="grid">${cards.map(card).join("")}</div>`);
  }
  if (show("productos")) {
    const pp = M.porProducto(c, S.from, S.to);
    h += block("productos", "Tus productos", pp.lista.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Facturación</th><th class="r">Unidades</th><th class="r">Te quedó (antes de anuncios)</th><th class="r">Anuncios</th><th class="r">Ganancia</th><th class="r">ROAS</th></tr></thead><tbody>
      ${pp.lista.map((x) => `<tr><td>${esc(x.titulo)}${sinCostoCargado(x.pid) ? ' <span class="tag warn">sin costo</span>' : ""}</td><td class="r">${money(x.ventas)}</td><td class="r">${int(x.unidades)}</td><td class="r">${money(x.quedo)}</td><td class="r">${x.anuncios ? money(x.anuncios) : "–"}</td><td class="r ${x.ganancia < 0 ? "down" : ""}">${money(x.ganancia)}</td><td class="r">${x.roas ? x2(x.roas) : "–"}</td></tr>`).join("")}</tbody></table></div>
      ${pp.sinAsignar > 1 ? `<p class="note" style="margin-top:8px">Hay ${money(pp.sinAsignar)} de anuncios sin asignar a un producto: suman en el total pero no en esta lista. Poné una palabra clave de la campaña en <a href="#" data-nav="config" data-cfgsub="productos">Productos</a>.</p>` : ""}` : '<div class="card empty">Sin ventas en estas fechas.</div>');
  }
  if (show("ofertas")) {
    const of = M.ofertas(c, S.from, S.to);
    h += block("ofertas", "Tus ofertas · cuánto le podés pagar a Meta por venta", of.length ? `<div class="cols">${of.map((o) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Oferta ${o.oferta}${o.oferta === 3 ? "+" : ""} · lleva ${o.oferta}${o.oferta === 3 ? " o más" : ""} ${o.oferta === 1 ? "unidad" : "unidades"}</h3><span class="tag ${o.ok ? "good" : "warn"}">${o.ok ? "Bien" : "Floja"}</span></div>
      <p class="muted small" style="margin:0 0 8px">${int(o.pedidos)} ventas · sale ${money(o.precio)} en promedio</p>
      <div class="muted small">Podés pagarle a Meta hasta</div><div style="font-size:26px;font-weight:700">${usd1(o.maxUsd)} <span class="muted small" style="font-weight:400">por venta</span></div>
      <p class="note">Son ${ars(o.antes)} antes del anuncio. ${o.objetivo ? (o.ok ? `Tu objetivo es ${usd1(o.objetivo)}: estás bien.` : `Tu objetivo es ${usd1(o.objetivo)}: te faltan ${usd1(o.falta)}. Para llegar, esta oferta tendría que salir <b>${ars(Math.ceil(o.precioObjetivo / 100) * 100)}</b>.`) : ""}</p></div>`).join("")}</div>
      <p class="note" style="margin-top:8px">Sabemos qué oferta compró cada uno por cuántas unidades se llevó del producto principal. El objetivo de CPA de cada oferta se cambia en Configuración → Costos.</p>` : '<div class="card empty">Sin ventas en estas fechas.</div>');
  }
  if (show("embudo")) {
    const e = M.embudo(c, S.from, S.to);
    const max = Math.max(1, e.pasos[0].v || e.pasos[2].v);
    h += block("embudo", "Dónde se pierde la gente", e.pasos[0].v || e.pasos[2].v ? `<div class="card"><p style="margin:0 0 10px">${e.peor ? `Donde más gente se pierde: <b>${esc(e.peor.t.toLowerCase())}</b> (siguen ${pct(e.peor.sigue, 0)}).` : ""} ${e.fuente === "meta" ? '<span class="muted small">Visitas, carrito y pago según el píxel de Meta (sumá el permiso read_reports en Shopify para usar los datos de la tienda).</span>' : ""}</p><div class="funnel">
      ${e.pasos.map((s) => `<div class="st ${e.peor === s ? "worst" : ""}"><span>${esc(s.t)}</span><div class="track"><div class="fill" style="width:${Math.max(0.3, (Math.log10(1 + s.v) / Math.log10(1 + max)) * 100)}%"></div></div><b class="num" style="text-align:right">${int(s.v)}</b><span class="muted small sub">${s.sigue != null ? `siguen ${pct(s.sigue, s.sigue < 0.1 ? 1 : 0)} · ${int(s.pierde)} se van` : ""}</span></div>`).join("")}</div></div>` : '<div class="card empty">Sin datos de visitas todavía.</div>');
  }
  if (show("mes")) {
    const pm = M.proyeccionMes(c, today);
    const meta = nn(S.app.metaVentas);
    h += block("mes", "Tu mes · cómo terminás", `<div class="cols"><div class="hero"><span class="muted">A este ritmo terminás ${esc(monthName(today.slice(0, 7)).split(" ")[0].toLowerCase())} en</span><span class="big">${money(pm.ventasFin)}</span><p>de ventas, y te quedarían unos <b>${money(pm.gananciaFin)}</b> de ganancia.</p><p class="muted small">Llevás ${money(pm.llevas)} (día ${pm.dia} de ${pm.dias}). Vendés unos ${money(pm.porDia)} por día (promedio de los 7 días antes de hoy).</p></div>
      <div class="card"><h3>Objetivo del mes</h3>${meta ? `<div class="flow"><div class="row"><span>Vendido</span><div class="track"><div class="fill" style="width:${Math.min(100, (pm.llevas / meta) * 100)}%;background:#34d399"></div></div><b>${pct(pm.llevas / meta, 0)}</b></div><div class="row"><span>Proyección</span><div class="track"><div class="fill" style="width:${Math.min(100, (pm.ventasFin / meta) * 100)}%;background:#dc327d"></div></div><b>${pct(pm.ventasFin / meta, 0)}</b></div></div><p class="note" style="margin-top:8px">${pm.ventasFin >= meta ? "Llegás al objetivo." : `Te faltarían ${money(meta - pm.ventasFin)}: necesitás vender ${money((meta - pm.llevas) / Math.max(1, pm.dias - pm.dia))} por día.`}</p>` : ""}
      <label class="f" style="margin-top:8px"><span>¿Cuánto querés vender este mes?</span><div class="prefix"><em>$</em><input class="in" type="number" min="0" step="1000" data-app="metaVentas" value="${meta || ""}"></div></label></div></div>`);
  }
  if (show("ventas")) {
    // Filtro: los pedidos sin pagar (rechazados por seguridad, Rapipago que no se pagó, cancelados) nunca suman en los números.
    const FILTROS = [["pagados", "Pagados", (st) => st === "pagado"], ["sinpagar", "Sin pagar", (st) => st === "pendiente" || st === "vencido"], ["cancelados", "Cancelados o devueltos", (st) => st === "cancelado" || st === "devuelto"], ["todos", "Todos", () => true]];
    const fv = FILTROS.find((x) => x[0] === (S.ventasFiltro || "pagados")) || FILTROS[0];
    const enFechas = S.data.orders.filter((o) => !o.t && M.dayOf(o.c) >= S.from && M.dayOf(o.c) <= S.to);
    const cuenta = (f) => enFechas.filter((o) => f(M.estado(o))).length;
    const ult = enFechas.filter((o) => fv[2](M.estado(o))).sort((a, b) => b.c.localeCompare(a.c)).slice(0, S.sub === "ventas" ? 200 : 15);
    const chipsVentas = `<div class="chips" style="margin-bottom:10px">${FILTROS.map(([k, l, f]) => `<button class="chip" data-vfil="${k}" aria-pressed="${fv[0] === k}">${l} (${cuenta(f)})</button>`).join("")}</div>${fv[0] !== "pagados" ? '<p class="note" style="margin:0 0 8px">Los pedidos sin pagar, cancelados o devueltos no suman en ventas, ganancia ni impuestos.</p>' : ""}`;
    const E = { pagado: ["good", "Pagado"], pendiente: ["warn", "Pendiente"], vencido: ["bad", "Venció"], cancelado: ["bad", "Cancelado"], devuelto: ["bad", "Devuelto"] };
    h += block("ventas", "Últimas ventas", chipsVentas + (ult.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Estado</th><th>Fecha</th><th>Productos</th><th>Cobro</th><th class="r">Total</th><th class="r">Te quedó</th><th class="r">Neto %</th></tr></thead><tbody>
      ${ult.map((o) => { const st = M.estado(o); const k = M.costoPedido(o, cfg(), S.prods); const margen = st === "pagado" ? k.margen : 0; return `<tr><td>${esc(o.n)}</td><td><span class="tag ${E[st][0]}">${E[st][1]}</span></td><td>${new Date(o.c).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(o.li.filter((l) => l.cq > 0).map((l) => l.cq + "× " + l.ti).join(", ").slice(0, 60))}</td><td class="muted">${M.esTransferencia(o) ? "Transferencia" : "Mercado Pago"}</td><td class="r">${money(o.tot)}</td><td class="r">${st === "pagado" ? money(margen) : "–"}</td><td class="r">${st === "pagado" && k.venta ? pct(margen / k.venta, 0) : "–"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="actions" style="margin-top:8px"><button class="ctl" data-act="csv-orders">Exportar Excel (CSV)</button><span class="note">"Te quedó" es antes de anuncios y gastos fijos.</span></div>` : '<div class="card empty">No hay pedidos así en estas fechas.</div>'));
  }
  if (show("grafico")) h += block("grafico", "Día por día", chartHTML(serie));
  return h + "</div>";
}

// ---------- Anuncios ----------
function viewAnuncios() {
  const c = ctx();
  const to = M.addDays(today, -1), from = M.addDays(today, -S.adsDays);
  let h = `<div class="bar2"><div class="chips">${[4, 7, 14, 30].map((d) => `<button class="chip" data-adsdays="${d}" aria-pressed="${S.adsDays === d}">Últimos ${d} días</button>`).join("")}</div><span class="muted small">${shortDate(from)} al ${shortDate(to)} · sin contar hoy</span></div><div class="content">${banners()}`;
  if (!S.data.ads.length) return h + '<div class="card empty">Conectá Meta en Configuración → Conexiones para ver el análisis de tus anuncios.</div></div>';
  const s = M.anunciosSemaforo(c, from, to, M.addDays(today, -30), to);
  if (!S.adsPicked && !s.grupos[S.adsGroup].length) { const first = M.SEMAFORO.find((x) => s.grupos[x.id].length); if (first) S.adsGroup = first.id; }
  const sel = M.SEMAFORO.find((x) => x.id === S.adsGroup) || M.SEMAFORO[0];
  const tone = { good: "good", info: "info", warn: "warn", bad: "bad", muted: "" };
  const adCard = (a) => `<div class="ad"><div style="display:flex;justify-content:space-between;gap:6px"><span class="an">${esc(a.nombre)}</span><span class="tag ${a.ganancia == null ? "" : a.ganancia >= 0.25 ? "good" : a.ganancia >= 0.15 ? "warn" : "bad"}">${a.ganancia == null ? "sin ventas" : pct(a.ganancia) + (a.ganancia < 0 ? " pierde" : " ganancia")}</span></div><div class="muted small">${esc(a.campana)} · ${esc(a.conjunto || "")}</div>
    <div class="kv"><span>Gastó</span><b>${usd1(a.gastoUsd)}</b><span>CPA</span><b>${a.cpaUsd ? usd(a.cpaUsd) : "–"}</b><span>ROAS</span><b>${a.pu ? x2(a.roas) : "–"}</b><span>Frecuencia 7 d</span><b>${a.frecuencia ? x2(a.frecuencia) : "–"} ${a.frecuencia >= 1.4 ? '<span class="tag bad">alta</span>' : a.frecuencia >= 1.2 ? '<span class="tag warn">ojo</span>' : a.frecuencia ? '<span class="tag good">bien</span>' : ""}</b><span>CTR</span><b>${pct(a.ctr, 2)}</b><span>Compras</span><b>${int(a.pu)}</b></div>
    ${a.bidcap ? `<div class="muted small">Armá 5 conjuntos con este anuncio, uno con cada puja:</div><div class="bids">${a.bidcap.map((b, i) => `<span class="tag pink">Conjunto ${i + 1} · ${usd(b)}</span>`).join("")}</div><div class="note">Sale de su CPA de estos días (${usd(a.cpaUsd)}): la primera es el doble y cada una suma 1 dólar.</div>` : ""}</div>`;
  h += block("semaforo", "Cómo vienen tus anuncios", `<p class="note" style="margin:-4px 0 10px">${s.lista.length} anuncios con gasto, según cuánto te dejan. De cada $ que venden, te queda ${pct(s.ratio)} antes del anuncio (últimos 30 días).</p>
    <div class="sem">${M.SEMAFORO.map((x) => `<button data-adsgroup="${x.id}" aria-pressed="${S.adsGroup === x.id}"><span class="tag ${tone[x.tone]}">${esc(x.t)}</span><b>${s.grupos[x.id].length}</b><span>anuncios</span></button>`).join("")}</div>
    <div class="card" style="margin-top:10px"><h3>${esc(sel.t)} · ${s.grupos[sel.id].length} ${s.grupos[sel.id].length === 1 ? "anuncio" : "anuncios"}</h3><p class="note" style="margin-bottom:10px">${esc(sel.d)}</p>${s.grupos[sel.id].length ? `<div class="ads">${s.grupos[sel.id].map(adCard).join("")}</div>` : '<p class="muted small">Ninguno en este grupo.</p>'}</div>`);
  const AUD = [["prospeccion", "Prospección", "frecuencia de 1 a 1,2 · gente nueva"], ["tibia", "Audiencia tibia", "frecuencia de 1,2 a 1,4 · ya te vieron un poco"], ["caliente", "Audiencia caliente", "frecuencia de 1,4 o más · ya te conocen"]];
  h += block("audiencia", "Por audiencia", `<div class="cols">${AUD.map(([k, t, d]) => `<div class="card"><h3>${t} <span class="muted small">· ${s.audiencias[k].length}</span></h3><p class="note">${d}</p><ol style="margin:8px 0 0;padding-left:18px;display:grid;gap:6px">${s.audiencias[k].slice(0, 5).map((a) => `<li><b>${esc(a.nombre)}</b> <span class="muted small">frecuencia ${x2(a.frecuencia)} · ${a.ganancia == null ? "sin ventas" : "deja " + pct(a.ganancia)}</span><span style="float:right">${a.cpaUsd ? usd(a.cpaUsd) + " CPA" : "–"}</span></li>`).join("") || '<li class="muted">Ninguno</li>'}</ol></div>`).join("")}</div>`);
  const camps = M.campanas(c, from, to);
  h += block("campanas", "Tus campañas", camps.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campaña</th><th>Fase</th><th class="r">Gasto</th><th class="r">CTR</th><th class="r">Carrito</th><th class="r">Compra</th><th class="r">ROAS</th><th class="r">Equilibrio</th><th class="r">Frec. 7 d</th><th>Qué hacer</th></tr></thead><tbody>
    ${camps.map((x) => `<tr><td>${esc(x.nombre)}</td><td><span class="tag ${x.pausada ? "" : "pink"}">${x.fase}${x.pausada ? " · pausada" : ""}</span></td><td class="r">${usd1(x.usd)}</td><td class="r">${pct(x.ctr)}</td><td class="r">${x.costoCarrito ? usd1(x.costoCarrito) : "–"}</td><td class="r">${x.costoCompra ? usd1(x.costoCompra) : "–"}</td><td class="r ${x.roas >= x.be ? "up" : "down"}">${x2(x.roas)}</td><td class="r">${x2(x.be)}</td><td class="r">${x.frecuencia ? x2(x.frecuencia) : "–"}</td><td style="white-space:normal;min-width:260px" class="small">${esc(x.consejo)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="card empty">Sin gasto en estas fechas.</div>');
  return h + "</div>";
}

// ---------- Caja ----------
function viewCaja() {
  const c = ctx();
  const cj = M.caja(c, today, 10, CAJA);
  const saldo = M.conciliacion(c, today, nn(S.app.saldoInicial), CAJA).caja.total; // solo cobros de pedidos de Impoluto (sin Mercado Libre ni otras tiendas de la misma cuenta)
  let h = `<div class="content" style="padding-top:14px">${banners()}<div class="cols"><div class="hero"><span class="muted">Los próximos 30 días <span class="tag">supuesto</span></span><span class="big ${cj.proy.neto < 0 ? "down" : ""}">${money(cj.proy.neto)}</span><p>te quedarían si vendés y gastás como en los últimos 14 días.</p><p class="muted small">Entraría ${money(cj.proy.entra)} · saldría ${money(cj.proy.sale)}</p></div>
    <div class="grid">${card({ label: "Caja hoy", tip: "Saldo inicial + lo cobrado (ya sin comisiones) + aportes − gastos que pagó la caja − anuncios − retiros.", value: money(saldo), tone: saldo < 0 ? "bad" : "", src: "mix" })}${card({ label: "Esta semana", value: money(cj.semanas[0].neto), sub: `Entró ${money(cj.semanas[0].entro)} · salió ${money(cj.semanas[0].salio)}`, src: "mix" })}${(() => { const lib = M.mpALiberar(S.data.pays); return lib ? card({ label: "Por liberar en Mercado Pago", tip: "Cobros aprobados que Mercado Pago todavía no te liberó. Entran a la caja el día que se liberan.", value: money(lib.total), sub: lib.porDia.length ? lib.porDia.slice(0, 3).map((x) => `${shortDate(x.d)}: ${money(x.v)}`).join(" · ") : "nada pendiente", src: "mix" }) : ""; })()}</div></div>`;
  h += block("semanas", "Semana por semana", `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Semana</th><th class="r">Ventas cobradas</th><th class="r">Comisiones</th><th class="r">Aportes</th><th class="r">Gastos de la caja</th><th class="r">Anuncios</th><th class="r">Retiros</th><th class="r">Neto</th></tr></thead><tbody>
    ${cj.semanas.map((w, i) => `<tr><td>${i === 0 ? "Esta semana" : i === 1 ? "La semana pasada" : shortDate(w.desde) + " al " + shortDate(w.hasta)}</td><td class="r">${money(w.det.ventas)}</td><td class="r">${w.det.comisiones ? "−" + money(w.det.comisiones) : "–"}</td><td class="r">${w.det.aportes ? money(w.det.aportes) : "–"}</td><td class="r">${w.det.gastos ? "−" + money(w.det.gastos) : "–"}</td><td class="r">${w.det.anuncios ? "−" + money(w.det.anuncios) : "–"}</td><td class="r">${w.det.retiros ? "−" + money(w.det.retiros) : "–"}</td><td class="r ${w.neto < 0 ? "down" : "up"}"><b>${money(w.neto)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">Cómo se arma: entra ${S.data.pays && S.data.pays.length ? "lo que Mercado Pago te libera (neto, el día que se libera) y las ventas por transferencia" : "lo que cobrás en Shopify (suponiendo que Mercado Pago acredita al toque) ya sin comisiones"}, más los aportes. Sale lo que pagó la caja (gastos cargados con "pagó: ${CAJA}"), los anuncios de Meta${cfg().metaPaga === "Caja" ? "" : " (no: los paga " + esc(cfg().metaPaga) + ")"} y los retiros. Los impuestos no salen acá hasta que los cargues como gasto cuando los pagás.</p>`);
  const hasta = S.cajaHasta || today;
  const cc = M.conciliacion(c, hasta, nn(S.app.saldoInicial), CAJA, undefined, S.cajaDesde || null);
  const fila = (l, v, nota, b) => `<tr${b ? ' style="font-weight:600"' : ""}><td>${l}${nota ? ` <span class="muted small">· ${nota}</span>` : ""}</td><td class="r">${money(v)}</td></tr>`;
  const conc = block("concilia", "Cuánta plata debería haber", `<div class="actions" style="margin-bottom:10px"><span class="muted">Desde</span><input class="in" type="date" id="caja-desde" value="${esc(cc.desde || "")}" min="${esc(cc.primera || "")}" max="${today}" style="width:160px"><span class="muted">hasta</span><input class="in" type="date" id="caja-hasta" value="${esc(hasta)}" max="${today}" style="width:160px"><button class="ctl pri" data-act="caja-hasta">Ver</button><button class="ctl" data-act="caja-todo">Desde la primera venta</button><button class="ctl" data-act="csv-concilia">Exportar (CSV)</button></div>
    <div class="grid">${card({ label: "Debería haber al empezar", tip: "La caja al cierre del día anterior a «desde».", value: money(cc.caja.inicio), sub: cc.desde ? "al " + shortDate(M.addDays(cc.desde, -1)) : "", src: "mix" })}${card({ label: "Caja que debería haber", tip: "Saldo inicial + lo que Mercado Pago ya te liberó de las ventas de Impoluto + transferencias + aportes − gastos que pagó la caja − retiros − comisión de Shopify" + (cfg().metaPaga === "Caja" ? " − Meta" : "") + ".", value: money(cc.caja.total), sub: "al " + shortDate(hasta), tone: cc.caja.total < 0 ? "bad" : "", src: "mix" })}${card({ label: "Te ingresó según Shopify", tip: "Ventas cobradas (total con envío) menos devoluciones y cancelaciones.", value: money(cc.shopify.total), sub: `${cc.shopify.n} ventas · ${money(cc.shopify.devoluciones)} devuelto`, src: "shopify" })}${card({ label: "Te ingresó de verdad en Mercado Pago", tip: "Lo que te depositó Mercado Pago por cada venta de Impoluto: ya sin comisiones ni retenciones. No incluye las ventas de Mercado Libre.", value: money(cc.mp.neto), sub: `${cc.mp.n} cobros · liberado ${money(cc.mp.liberado)}`, src: "mp" })}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><tbody>
      ${fila("Vendido según Shopify", cc.shopify.vendido, cc.shopify.n + " ventas cobradas")}
      ${fila("− Devoluciones y cancelaciones", -cc.shopify.devoluciones, cc.shopify.nDev + " ventas")}
      ${fila("Te ingresó según Shopify", cc.shopify.total, "", true)}
      ${fila("− Ventas sin cobro de Mercado Pago encontrado", -cc.sinMp.total, cc.sinMp.n ? cc.sinMp.n + " ventas: revisalas abajo" : "ninguna")}
      ${fila("− Ventas por transferencia (no pasan por Mercado Pago)", -cc.transferencias.total, cc.transferencias.n + " ventas")}
      ${fila("Cobrado en Mercado Pago", cc.mp.cobrado, cc.mp.n + " cobros", true)}
      ${fila("− Comisiones de Mercado Pago", -cc.mp.comisiones, "")}
      ${fila("− Retenciones de impuestos", -cc.mp.retenciones, "son pagos a cuenta: van al contador")}
      ${fila("− Devoluciones", -cc.mp.devoluciones, "en las devoluciones totales Mercado Pago te reintegra la comisión")}
      ${fila("Te ingresó de verdad en Mercado Pago", cc.mp.neto, "", true)}
      ${fila("· ya liberado", cc.mp.liberado, "disponible para usar")}
      ${fila("· por liberar", cc.mp.pendiente, "Mercado Pago lo libera en los próximos días")}
    </tbody></table></div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><tbody>
      ${fila(cc.desde && cc.desde !== cc.primera ? "Caja al " + shortDate(M.addDays(cc.desde, -1)) : "Saldo inicial", cc.caja.inicio, "", true)}
      ${fila("+ Liberado por Mercado Pago", cc.caja.liberado, "")}
      ${fila("+ Transferencias", cc.caja.transferencias, "")}
      ${fila("+ Aportes de socios", cc.caja.aportes, "")}
      ${fila("− Gastos que pagó la caja", -cc.caja.gastos, "los del Tracker de gastos con «pagó: " + esc(CAJA) + "»")}
      ${fila("− Retiros", -cc.caja.retiros, "")}
      ${cc.caja.anuncios ? fila("− Anuncios de Meta", -cc.caja.anuncios, "") : ""}
      ${fila("− Comisión de Shopify", -cc.caja.shopify, "")}
      ${fila("Caja que debería haber al " + shortDate(hasta), cc.caja.total, "", true)}
      ${fila("Diferencia en el período", cc.caja.total - cc.caja.inicio, "", true)}
    </tbody></table></div>
    <details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Ver venta por venta (${cc.filas.length})</summary><div class="tbl-wrap" style="margin-top:6px"><table class="tbl"><thead><tr><th>Pedido</th><th>Fecha</th><th class="r">Shopify</th><th class="r">Devuelto</th><th class="r">Cobrado MP</th><th class="r">Comisión</th><th class="r">Retenciones</th><th class="r">Te entró</th><th>Liberado</th></tr></thead><tbody>
    ${cc.filas.slice().reverse().map((f) => `<tr><td>${esc(f.n)}</td><td>${shortDate(f.fecha)}</td><td class="r">${money(f.vendido)}</td><td class="r">${f.devShop ? "−" + money(f.devShop) : "–"}</td>${f.mp ? `<td class="r">${money(f.cobrado)}${f.dev ? `<div class="muted small">devuelto ${money(f.dev)}</div>` : ""}</td><td class="r">${money(f.com)}</td><td class="r">${money(f.ret)}</td><td class="r"><b>${money(f.neto)}</b></td><td>${f.liberado ? "Sí" : f.rel ? "el " + shortDate(f.rel.slice(0, 10)) : "–"}</td>` : `<td colspan="5" class="muted">${f.transfer ? "Transferencia" : f.cancelada ? "Cancelada: no encontré el cobro en Mercado Pago" : "No encontré el cobro en Mercado Pago"}</td>`}</tr>`).join("")}</tbody></table></div></details>`);
  h = h.replace("<div class=\"content\" style=\"padding-top:14px\">", "<div class=\"content\" style=\"padding-top:14px\">" + conc);

  return h + "</div>";
}

// ---------- Impuestos ----------
function viewImpuestos() {
  const meses = []; let m = today.slice(0, 7);
  for (let i = 0; i < 6; i++) { meses.push(m); const d = M.addDays(m + "-01", -1); m = d.slice(0, 7); }
  const t = M.impuestosMes(ctx(), S.impMes);
  const ri = t.regimen !== "mono";
  let h = `<div class="bar2"><div class="chips">${meses.map((x) => `<button class="chip" data-impmes="${x}" aria-pressed="${S.impMes === x}">${esc(monthName(x))}</button>`).join("")}</div><button class="ctl" data-act="csv-imp">Exportar para el contador (CSV)</button></div><div class="content">`;
  const rows = ri ? [
    ["Ventas del mes (con IVA)", t.ventas, ""],
    ["IVA de venta (21 % contenido)", t.debitoTotal, "(Ventas + envíos que pagó el cliente) ÷ 1,21 × 0,21."],
    [`Beneficio de IVA (${nn(cfg().beneficioIva)} %)`, -t.beneficio, "La parte del IVA de venta que no pagás por el beneficio."],
    ["IVA de venta que pagás", t.debito, ""],
    ["IVA de comisiones (Mercado Pago)", -t.creditoComisiones, "Te lo facturan: lo descontás."],
    ["IVA de envíos (Andreani)", -t.creditoEnvios, "Envíos gratis y los que pagó el cliente: vienen con factura."],
    ["IVA de gastos con Factura A", -t.creditoGastos, "Sale de los gastos que cargaste con Factura A en este mes."],
    ["IVA a pagar", t.ivaPagar, t.ivaPagar < 0 ? "Negativo = saldo a favor para el mes que viene." : ""],
  ] : [["Ventas del mes", t.ventas, ""], ["IVA", 0, "En monotributo no pagás IVA aparte: va en la cuota."]];
  h += block("iva", "IVA · " + monthName(S.impMes), `<div class="tbl-wrap"><table class="tbl"><tbody>${rows.map(([l, v, n], i) => `<tr${i === rows.length - 1 ? ' style="font-weight:600"' : ""}><td>${esc(l)}${n ? ` <span class="muted small">· ${esc(n)}</span>` : ""}</td><td class="r">${money(v)}</td></tr>`).join("")}</tbody></table></div>`);
  if (t.retencionesMp != null) h += `<p class="banner info">Mercado Pago te retuvo <b>${money(t.retencionesMp)}</b> de impuestos este mes. Son pagos a cuenta (IIBB, IVA o Ganancias): pasáselo a tu contador para que los descuente. El detalle está en Mercado Pago → Tu negocio → Impuestos.</p>`;
  h += block("otros", "Ingresos brutos", `<div class="grid">${card({ label: "Ingresos brutos", tip: `${nn(cfg().iibbPct)} % sobre las ventas sin IVA.`, value: money(t.iibb), src: "mix" })}${card({ label: "Ganancia del mes", tip: "La del dashboard: ya descuenta IVA e IIBB. El impuesto a las Ganancias no se cuenta.", value: money(t.gananciaAntes), tone: t.gananciaAntes < 0 ? "bad" : "", src: "mix" })}</div>
    <p class="note" style="margin-top:8px">El dashboard estima el IVA pedido por pedido (con el envío y lo que te facturan según la configuración: ${money(t.estimadoEnDashboard)} este mes). Esta pantalla usa los gastos con Factura A que cargaste de verdad, así que es la que va para el contador.</p>`);
  return h + "</div>";
}

// ---------- Socios ----------
function viewSocios() {
  const R = { mes: [today.slice(0, 8) + "01", today, "Este mes"], mespasado: [...rangeOf("mespasado"), "Mes pasado"], anio: [today.slice(0, 4) + "-01-01", today, "Este año"], todo: ["2020-01-01", today, "Desde el principio"] };
  const [f, t, label] = R[S.sociosR];
  const so = M.socios(ctx(), f, t, socios(), CAJA);
  let h = `<div class="bar2"><div class="chips">${Object.entries(R).map(([k, v]) => `<button class="chip" data-socr="${k}" aria-pressed="${S.sociosR === k}">${v[2]}</button>`).join("")}</div><button class="ctl pri" data-open="mov">+ Aporte o retiro</button></div><div class="content">`;
  h += block("reparto", "Reparto de la ganancia · " + label, `<div class="grid">${card({ label: "Ganancia", value: money(so.ganancia), tone: so.ganancia < 0 ? "bad" : "", src: "mix" })}${card({ label: "Ganancia a repartir", tip: "Sin descontar el impuesto a las Ganancias.", value: money(so.neta), tone: so.neta < 0 ? "bad" : "good", src: "mix" })}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Socio</th><th class="r">%</th><th class="r">Le corresponde</th><th class="r">Gastos que pagó</th><th class="r">Aportes</th><th class="r">Retiros</th><th class="r">Saldo a su favor</th></tr></thead><tbody>
    ${so.filas.map((x) => `<tr><td>${esc(x.socio)}</td><td class="r">${int(x.pct)} %</td><td class="r">${money(x.corresponde)}</td><td class="r">${money(x.pusoGastos)}</td><td class="r">${money(x.aportes)}</td><td class="r">${x.retiros ? "−" + money(x.retiros) : money(0)}</td><td class="r"><b class="${x.saldo < 0 ? "down" : ""}">${money(x.saldo)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">Saldo a su favor = lo que puso (gastos de su bolsillo + aportes) + su parte de la ganancia neta − lo que ya retiró. Es lo que puede retirar sin desbalancear la sociedad. El reparto (${int(cfg().repartoPct)} / ${int(100 - nn(cfg().repartoPct))}) se cambia en Configuración → General.</p>`);
  const movs = S.movs.filter((m) => m.fecha >= f && m.fecha <= t).sort((a, b) => b.fecha.localeCompare(a.fecha));
  h += block("movs", "Aportes y retiros", movs.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${movs.map((m) => `<tr class="click" data-open="mov" data-id="${esc(m.id)}"><td>${esc(longDate(m.fecha))}</td><td>${m.tipo === "retiro" ? "Retiro" : "Aporte"} de ${esc(m.socio)}</td><td class="muted">${esc(m.nota || "")}</td><td class="r ${m.tipo === "retiro" ? "down" : "up"}">${m.tipo === "retiro" ? "−" : "+"}${money(m.monto)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="card empty">Sin aportes ni retiros en estas fechas.</div>');
  return h + "</div>";
}

// ---------- Gastos ----------
function viewGastos() {
  const list = gastosTodos().filter((g) => g.fecha.startsWith(S.gastosMes) && (!S.gastosCat || catOf(g).id === S.gastosCat)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const tot = list.reduce((a, g) => a + nn(g.monto), 0);
  const ivaC = list.reduce((a, g) => a + (g.facturaA ? nn(g.monto) - nn(g.monto) / 1.21 : 0), 0);
  const prev = M.addDays(S.gastosMes + "-01", -1).slice(0, 7), next = M.addDays(S.gastosMes + "-28", 7).slice(0, 7);
  let h = `<div class="bar2"><div class="chips"><button class="chip" data-gmes="${prev}">‹</button><span class="chip" aria-pressed="true">${esc(monthName(S.gastosMes))}</span><button class="chip" data-gmes="${next}">›</button>
    <select class="chip" data-gcat><option value="">Todas las categorías</option>${cats().map((c) => `<option value="${esc(c.id)}" ${S.gastosCat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="actions"><button class="ctl" data-act="csv-g">Descargar CSV</button><button class="ctl pri" data-open="gasto">+ Cargar gasto</button></div></div><div class="content">`;
  h += `<div class="grid">${card({ label: "Gastado", value: money(tot), sub: `${list.length} gastos` })}${card({ label: "IVA crédito (Factura A)", tip: "21 % contenido en los gastos con Factura A.", value: money(ivaC) })}</div>`;
  const byCat = {};
  list.forEach((g) => { const c = catOf(g); byCat[c.id] = byCat[c.id] || { c, v: 0 }; byCat[c.id].v += nn(g.monto); });
  const cs = Object.values(byCat).sort((a, b) => b.v - a.v);
  if (cs.length) h += `<div class="card"><div class="flow">${cs.map(({ c, v }) => `<div class="row"><span>${esc(c.name)}</span><div class="track"><div class="fill" style="width:${(v / (cs[0].v || 1)) * 100}%;background:${esc(c.color)}"></div></div><b>${money(v)}</b></div>`).join("")}</div></div>`;
  h += list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Pagó</th><th>Medio</th><th class="r">Monto</th></tr></thead><tbody>
    ${list.map((g) => `<tr ${g.auto ? 'title="Se carga solo desde Meta"' : `class="click" data-open="gasto" data-id="${esc(g.id)}"`}><td>${esc(g.fecha.slice(8))}/${esc(g.fecha.slice(5, 7))}</td><td>${esc(g.concepto || catOf(g).name)} ${g.cuota ? `<span class="tag warn">Cuota ${g.cuota.i}/${g.cuota.n}</span>` : ""}${g.auto ? '<span class="tag">Automático</span>' : ""}${g.facturaA ? '<span class="tag">Fact. A</span>' : ""}${g.recurrente ? '<span class="tag">Mensual</span>' : ""}</td><td><span class="dot" style="background:${esc(catOf(g).color)}"></span>${esc(catOf(g).name)}</td><td>${esc(g.quien || "")}</td><td class="muted">${esc(g.pago || "")}</td><td class="r">${money(g.monto)}${g.moneda === "USD" ? `<div class="muted small">${usd(g.montoOrig)} · TC ${int(g.tc)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="card empty">Sin gastos en ${esc(monthName(S.gastosMes).toLowerCase())}.</div>`;
  h += `<p class="note">Acá van los pagos reales (mercadería, envíos, apps, el contador…). Sirven para la caja, el IVA con Factura A y lo que pone cada socio. El costo del producto y los anuncios del dashboard salen solos de Shopify y Meta.</p>`;
  return h + "</div>";
}

// ---------- Calculadora ----------
function calcState() { return { ...CALC_DEFAULTS, tc: nn(cfg().dolar) || CALC_DEFAULTS.tc, ...(S.calcCur || {}) }; }
function viewCalc() {
  const v = calcState();
  const r = calcular(v);
  const mono = S.calcReg === "mono";
  const R = mono ? r.mono : r.ri;
  const seg = (k, a, b) => `<div class="c2-seg"><button data-calcb="${k}" data-val="1" aria-pressed="${!!v[k]}">${a}</button><button data-calcb="${k}" data-val="0" aria-pressed="${!v[k]}">${b}</button></div>`;
  const inp = (k, pre, big) => `<div class="c2-in${big ? " big" : ""}">${pre ? `<em>${pre}</em>` : ""}<input type="text" inputmode="decimal" data-calc="${k}" value="${esc(String(v[k] ?? "").replace(".", ","))}"></div>`;
  const out = (key, val) => `<span class="c2-val" data-out="${key}">${val}</span>`;
  const row = (label, sub, ctrl, t) => `<div class="c2-row"><div class="c2-l">${label}${t ? " " + tip(t) : ""}${sub ? `<small>${sub}</small>` : ""}</div><div class="c2-r">${ctrl}</div></div>`;
  const card = (titulo, body, cls = "") => `<section class="c2-card ${cls}"><h2>${titulo}</h2>${body}</section>`;
  const pot = cpaPotencial(v.cpaCliente ?? 0.5, v.cantClientes ?? 2500);
  const tone = (x) => (x < 0 ? "bad" : "ok");
  let h = `<div class="content c2">
  <header class="c2-head"><div class="c2-ico">⚡</div><div><h1>Calculadora de precios</h1><p>Impoluto · Shopify + Meta Ads</p></div></header>
  <div class="c2-grid"><div class="c2-col">
  ${card("Tipo de cambio y cobro",
    row("Dólar (T.C. USD)", `<a href="#" data-act="dolarhoy">Usar el dólar de ARQ de hoy</a>`, inp("tc", "$"), "El dólar de hoy: pasa el CPA a pesos.") +
    row("Transferencia con 10% off", "", seg("transferencia", "Sí", "No"), "¿Tu tienda cobra por transferencia con 10 % off?"))}
  ${card("Costos del producto",
    row("Costo del producto", "Lo que le pagás al proveedor", inp("costoProducto", "$"), "Lo que te cobra el fabricante por lo que lleva la venta.") +
    row("¿Te da factura A?", out("ivaProd", "IVA " + ars(r.iva.productoSiTuviera)), seg("ivaProducto", "Sí", "No"), "Réplicas y sin factura: No.") +
    row("Insumos / armado", "Caja, etiqueta y armado", inp("insumos", "$")) +
    row("¿El armado te da factura?", out("ivaIns", "IVA " + ars(r.iva.empaquetajeSiTuviera)), seg("ivaInsumos", "Sí", "No")))}
  ${card("Envío y publicidad",
    row("Envío gratis que pagás vos", out("ivaEnv", "IVA a favor " + ars(r.iva.envio)), inp("envio", "$"), "Lo que pagás de envío por pedido. 0 si lo paga el comprador.") +
    row("Envío que paga el comprador", out("ivaEnvC", "IVA a favor " + ars(r.iva.envioComprador) + " · también suma IVA de venta"), inp("envioComprador", "$"), "Va en la factura y la logística te lo factura: te da crédito de IVA aunque lo pague el cliente.") +
    row("CPA objetivo", out("cpaArs", ars(r.cpaArs) + " en pesos"), inp("cpaUsd", "US$"), "Lo que esperás pagarle a Meta por venta."))}
  ${card("Comisiones e impuestos",
    row("Comisiones (Mercado Pago + Shopify)", "En cuotas", inp("comision", "%"), "Mercado Pago + la plataforma, en 3 cuotas.") +
    row("Ingresos brutos", "Sobre el precio", inp("iibb", "%")) +
    row("% facturado", "Solo RI: la parte del IVA de venta que cuenta", inp("facturado", "%")) +
    `<div class="c2-row tot"><div class="c2-l"><b>Total costos</b></div><div class="c2-r">${out("totCost", ars(r.totalCostos))}</div></div>`)}
  ${card("CPA por cliente potencial",
    `<p class="c2-note">Si cada cliente potencial te sale tanto y compra 1 de cada 10, cuánto te sale cada venta.</p>` +
    row("CPA cliente potencial", "", inp("cpaCliente")) + row("Cantidad de clientes", "", inp("cantClientes")) +
    `<div data-out="pot">${row("Inversión", "", `<span class="c2-val">${int(pot.inversion)}</span>`)}${row("Ventas (10 %)", "", `<span class="c2-val">${int(pot.ventas)}</span>`)}${row("<b>CPA</b>", "", `<span class="c2-val">${x2(pot.cpa)}</span>`)}</div>`)}
  </div><div class="c2-col c2-side">
  ${card("Precio", row("Precio final", "Lo que paga el comprador", inp("precio", "$", true)))}
  <div data-out="res" style="display:grid;gap:14px">
  <section class="c2-card c2-hero ${tone(R.utilidadProm)}"><div class="c2-hero-top"><h2>Ganancia neta por venta</h2><div class="c2-seg sm"><button data-calcreg="ri" aria-pressed="${!mono}">RI</button><button data-calcreg="mono" aria-pressed="${mono}">Monotributo</button></div></div>
    <div class="c2-hero-n"><span class="n">${ars(R.utilidadProm)}</span><span class="pill">${pct(R.margenProm)}</span></div>
    <p>${R.utilidadProm < 0 ? "Con este CPA perdés plata: subí el precio o bajá costos." : `Con un CPA de ${usd1(v.cpaUsd)}. Si pagás más de ${usd1(R.cpaBreakEvenUsd)} por venta, perdés.`}</p></section>
  ${card("Meta Ads · equilibrio", `<div class="c2-kpis"><div><b>${usd1(R.cpaBreakEvenUsd)}</b><span>CPA break even: tenés que estar por debajo · ${ars(R.cpaBreakEvenArs)}</span></div><div><b>${x2(R.roasBreak)}</b><span>ROAS break even: tenés que estar por encima</span></div></div>`)}
  ${card("Resultado", `<div class="c2-tbl"><div class="c2-th"><span></span><span class="${mono ? "" : "on"}">RI</span><span class="${mono ? "on" : ""}">Monotributo</span></div>
    ${[["IVA compra", ars(r.ri.totalIvaCompra), "—"], ["IVA venta", ars(r.ri.totalIvaVenta), "—"], ["IVA a pagar", ars(r.ri.ivaAAbonar), "—"], ["<b>Ganancia neta</b>", ars(r.ri.utilidadProm), ars(r.mono.utilidadProm)], ["Margen", pct(r.ri.margenProm), pct(r.mono.margenProm)], ["CPA break even", usd1(r.ri.cpaBreakEvenUsd), usd1(r.mono.cpaBreakEvenUsd)], ["ROAS break even", x2(r.ri.roasBreak), x2(r.mono.roasBreak)]].map(([a, b, c]) => `<div class="c2-tr"><span>${a}</span><span>${b}</span><span>${c}</span></div>`).join("")}</div>
    <details><summary>Ver la cuenta completa</summary><div class="c2-tbl">${[["Ganancia mín. (cuotas)", ars(r.ri.utilidadMin), ars(r.mono.utilidadMin)], ["Ganancia máx. (transferencia)", ars(r.ri.utilidadMax), ars(r.mono.utilidadMax)], ["Margen mín.", pct(r.ri.margenMin), pct(r.mono.margenMin)], ["Margen máx.", pct(r.ri.margenMax), pct(r.mono.margenMax)], ["IVA comisiones", ars(r.iva.comisiones), "—"], ["Precio sugerido", "—", ars(r.mono.precioSugerido)]].map(([a, b, c]) => `<div class="c2-tr"><span>${a}</span><span>${b}</span><span>${c}</span></div>`).join("")}</div></details>`)}
  </div>
  ${card("Escenarios", `<div class="c2-save"><input class="in" placeholder="Nombre del escenario" id="esc-name"><button class="ctl pri" data-act="esc-save">Guardar</button><button class="ctl" data-act="calc-copy">Copiar</button></div>
    ${S.escenarios.map((e) => { const rr = calcular(e.v); const RR = mono ? rr.mono : rr.ri; return `<div class="c2-esc"><button data-esc="${esc(e.id)}"><b>${esc(e.nombre)}</b><small>${ars(e.v.precio)} · CPA break even ${usd1(RR.cpaBreakEvenUsd)} · ROAS ${x2(RR.roasBreak)}</small></button><button class="ctl" data-escdel="${esc(e.id)}">Borrar</button></div>`; }).join("")}`)}
  </div></div>
  <p class="c2-foot">Estimaciones con las cuentas de la planilla «Roas Breakeven». No contempla devoluciones. El impuesto a las Ganancias no se cuenta.</p></div>`;
  return h;
}

// ---------- Configuración ----------
function productosVistos() {
  const m = {};
  S.data.orders.forEach((o) => { if (o.t) return; const ok = M.estado(o) === "pagado"; o.li.forEach((l) => { if (!l.pid) return; const p = (m[l.pid] = m[l.pid] || { pid: l.pid, titulo: l.ti, unidades: 0, ventas: 0, ultimo: "" }); if (ok) { p.unidades += nn(l.cq); p.ventas += nn(l.tot); } if (o.c > p.ultimo) { p.ultimo = o.c; p.titulo = l.ti; } }); });
  Object.keys(S.prods).forEach((pid) => { if (!m[pid]) m[pid] = { pid, titulo: S.prods[pid].nombre || pid, unidades: 0, ventas: 0 }; });
  return Object.values(m).sort((a, b) => b.ventas - a.ventas);
}
const CFG_SUBS = [["conexiones", "Conexiones"], ["costos", "Costos y comisiones"], ["productos", "Productos"], ["fijos", "Gastos fijos"], ["general", "General"]];
function viewConfig() {
  let h = `<div class="bar2"><div class="chips">${CFG_SUBS.map(([k, l]) => `<button class="chip" data-cfgsub="${k}" aria-pressed="${S.cfgSub === k}">${l}</button>`).join("")}</div></div><div class="content">`;
  const c = cfg();
  const num = (k, pre, step = "1", t = "", small = "") => `<label class="f"><span>${t}</span><div class="prefix${pre.length > 2 ? " w" : ""}"><em>${pre}</em><input class="in" type="number" step="${step}" data-cost="${k}" value="${esc(S.costos[k] ?? c[k])}"></div>${small ? `<small>${small}</small>` : ""}</label>`;
  const yn = (k, label, a = "Sí", b = "No") => `<label class="f"><span>${label}</span><div class="seg" style="width:100%"><button data-costb="${k}" data-val="1" aria-pressed="${!!c[k]}">${a}</button><button data-costb="${k}" data-val="0" aria-pressed="${!c[k]}">${b}</button></div></label>`;

  if (S.cfgSub === "conexiones") {
    const cn = S.conn || { shopify: {}, meta: {} };
    const sh = cn.shopify || {}, me = cn.meta || {};
    const when = (x) => (x ? new Date(x.at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);
    const lastS = when(cn.sync && cn.sync.shopify), lastM = when(cn.sync && cn.sync.meta);
    const copy = (v) => `<span class="copyrow"><code>${esc(v)}</code><button class="ctl" data-copy="${esc(v)}">Copiar</button></span>`;
    const step = (n, title, body, done) => `<div class="step ${done ? "done" : ""}"><span class="num">${done ? "✓" : n}</span><div><b>${title}</b><div class="small" style="color:var(--n200);margin-top:4px;display:grid;gap:6px">${body}</div></div></div>`;
    const estado = (x, okTxt) => `<span class="tag ${x.connected ? (x.error ? "bad" : "good") : ""}">${x.connected ? (x.error ? "Con error" : okTxt) : "Sin conectar"}</span>`;
    const ext = (url, txt) => `<a class="ctl" href="${url}" target="_blank" rel="noopener" style="text-decoration:none;justify-self:start">${txt} ↗</a>`;

    h += `<p class="banner info">Las conexiones son <b>solo de lectura</b>: no instalan nada en tu tienda, no tocan tu píxel ni tus campañas. Solo leen ventas y gastos.</p>`;
    // ----- Shopify -----
    h += `<div class="card" style="display:grid;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">1 · Tu tienda de Shopify</h3>${estado(sh, "Conectada")}</div>`;
    if (sh.connected && !S.editSh) {
      h += `<p style="margin:0">${sh.error ? `<span class="down">${esc(sh.error)}</span>` : `Leyendo <b>${esc(sh.name || sh.shop)}</b>${lastS ? ` · última actualización ${esc(lastS)}` : ""}.`}</p>
        <div class="actions"><button class="ctl" data-act="sync" ${S.syncing ? "disabled" : ""}>${S.syncing ? "Actualizando…" : "↻ Actualizar ahora"}</button><button class="ctl" data-act="edit-sh">Cambiar los códigos</button><button class="ctl" data-act="sh-del">Desconectar</button></div>`;
    } else {
      h += `<div class="steps">
        ${step(1, "Creá la app en Shopify <span class='muted'>(si ya la tenés, salteá)</span>", `${ext("https://dev.shopify.com/dashboard", "Abrir Shopify Dev Dashboard")}<div>Apps → <b>Crear app</b> → <b>Crear app de forma manual</b>, y completá:</div>
          <div>Nombre: ${copy("Impoluto Numeros")}</div><div>URL de la app: ${copy("https://shopify.dev/apps/default-app-home")} <span class="muted">y destildá "Incrustar app"</span></div><div>Alcances (permisos): ${copy("read_orders,read_products,read_inventory,read_reports")}</div><div>Tocá <b>Crear app</b> y después <b>Lanzar</b>.</div>`)}
        ${step(2, "Instalala en tu tienda", `<div>En Apps, al lado de tu app tocá los <b>tres puntitos → Instalar app</b>, elegí Impoluto y tocá <b>Install</b>.</div>`)}
        ${step(3, "Pegá los códigos acá", `<div>Están en tu app → <b>Overview → Credentials</b>. Copialos con sus botones.</div>
          <div class="form" style="margin-top:4px"><label class="f"><span>Nombre de la tienda</span><input class="in" id="sh-shop" placeholder="6a01uk-kf.myshopify.com" value="${esc(sh.shop || "6a01uk-kf.myshopify.com")}"><small>Termina en .myshopify.com</small></label>
          <label class="f"><span>Client ID</span><input class="in" id="sh-id" autocomplete="off" placeholder="32 letras y números"></label>
          <label class="f"><span>Client secret</span><input class="in" id="sh-secret" type="password" autocomplete="off" placeholder="el que está con puntitos"><small>Lo guardamos bajo llave y nunca se muestra.</small></label></div>
          <div class="actions"><button class="ctl pri" data-act="sh-save">Conectar mi tienda</button>${sh.connected ? '<button class="ctl" data-act="edit-sh">Cancelar</button>' : ""}</div>`)}
      </div><p class="note">Trae los pedidos de los últimos 60 días. No ve nombres, mails ni direcciones de tus clientes.</p>`;
    }
    h += `</div>`;
    // ----- Meta -----
    h += `<div class="card" style="display:grid;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">2 · Tus anuncios de Meta</h3>${estado(me, "Conectado")}</div>`;
    if (me.connected && !S.editMe) {
      h += `<p style="margin:0">${me.error ? `<span class="down">${esc(me.error)}</span>` : `Leyendo <b>${esc((me.names || me.accounts || []).join(", "))}</b> (en ${esc(me.currency || "?")})${lastM ? ` · última actualización ${esc(lastM)}` : ""}.`}</p>
        <div class="actions"><button class="ctl" data-act="sync" ${S.syncing ? "disabled" : ""}>${S.syncing ? "Actualizando…" : "↻ Actualizar ahora"}</button><button class="ctl" data-act="edit-me">Cambiar el acceso</button><button class="ctl" data-act="me-del">Desconectar</button></div>`;
    } else {
      h += `<div class="steps">
        ${step(1, "Creá una app de Meta <span class='muted'>(una sola vez)</span>", `${ext("https://developers.facebook.com/apps/creation/", "Abrir Meta for Developers")}<div>Nombre: ${copy("Impoluto Numeros")}. En el caso de uso elegí <b>Otro</b> → tipo <b>Empresa</b>, y conectala a tu portfolio comercial.</div>`)}
        ${step(2, "Creá un usuario del sistema", `${ext("https://business.facebook.com/latest/settings/system_users", "Abrir Usuarios del sistema")}<div><b>Agregar</b> → nombre ${copy("impoluto-numeros")} rol <b>Empleado</b>. Después <b>Asignar activos → Cuentas publicitarias</b> → tu cuenta → <b>Ver rendimiento</b>.</div>`)}
        ${step(3, "Generá el token", `<div>En ese usuario tocá <b>Generar token</b> → elegí la app del paso 1 → vencimiento <b>Nunca</b> → tildá solo ${copy("ads_read")} → <b>Generar</b> y copiá el token.</div>`)}
        ${step(4, "Pegá el token y tu cuenta acá", `<div>El número de la cuenta lo ves en el ${ext("https://adsmanager.facebook.com/adsmanager/manage/campaigns", "Administrador de anuncios")} arriba a la izquierda (o en la dirección, después de <code>act=</code>).</div>
          <div class="form" style="margin-top:4px"><label class="f"><span>Token</span><input class="in" id="me-token" type="password" autocomplete="off" placeholder="empieza con EAA…"></label>
          <label class="f"><span>Número de cuenta publicitaria</span><input class="in" id="me-acc" placeholder="1234567890" value="${esc((me.accounts || []).map((a) => a.replace("act_", "")).join(", "))}"><small>Si tenés varias, separalas con coma.</small></label></div>
          <div class="actions"><button class="ctl pri" data-act="me-save">Conectar Meta</button>${me.connected ? '<button class="ctl" data-act="edit-me">Cancelar</button>' : ""}</div>`)}
      </div>`;
    }
    // ----- Mercado Pago (autorización de solo lectura) -----
    const mp = cn.mp || {};
    const lastP = when(cn.sync && cn.sync.mp);
    const cb = location.origin + "/api/mp-callback";
    h += `</div><div class="card" style="display:grid;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">3 · Mercado Pago</h3>${estado(mp, "Conectado")}</div>`;
    if (mp.connected && !S.editMp) {
      h += `<p style="margin:0">${mp.error ? `<span class="down">${esc(mp.error)}</span>` : `Leyendo los cobros de <b>${esc(mp.name || "tu cuenta")}</b>${lastP ? ` · última actualización ${esc(lastP)}` : ""}. ${mp.amplio ? "Mercado Pago dio un acceso amplio (lo aceptaste al conectar); la app solo lo usa para <b>leer</b> cobros: nunca cobra, devuelve ni toca tarjetas. Para cortarlo, borrá la aplicación en Mercado Pago Developers." : "Acceso de solo lectura."}`}</p><p class="note">Solo cuenta las ventas online de Checkout Pro. Las ventas de <b>Mercado Libre</b>, los cobros en persona (Point, QR) y las transferencias que entren a esta cuenta se ignoran: no suman en ventas, comisiones, caja ni impuestos.</p>
        <div class="actions"><button class="ctl" data-act="sync" ${S.syncing ? "disabled" : ""}>${S.syncing ? "Actualizando…" : "↻ Actualizar ahora"}</button><button class="ctl" data-act="edit-mp">Cambiar de cuenta</button><button class="ctl" data-act="mp-del">Desconectar</button></div>`;
    } else {
      h += `<p class="note">Sirve para tener la <b>comisión real</b> de cada cobro, las <b>retenciones</b> y <b>cuándo te liberan la plata</b>. La app solo hace consultas de lectura. Solo cuenta las ventas online de Checkout Pro: las de <b>Mercado Libre</b> que entren a la misma cuenta se ignoran.</p>${mp.error ? `<p class="banner bad">${esc(mp.error)}</p>` : ""}<div class="steps">
        ${step(1, "Tu aplicación en Mercado Pago", `${ext("https://www.mercadopago.com.ar/developers/panel/app", "Abrir Mercado Pago Developers")}<div>Entrá a la aplicación <b>Impoluto Numeros</b> (si no existe, <b>Crear aplicación</b> → Checkout Pro → nombre ${copy("Impoluto Numeros")}).</div>`)}
        ${step(2, "Activá producción", `<div>En la aplicación → <b>Credenciales → Producción → Comenzar</b>: elegí el rubro, sitio web ${copy("https://impolutocar.com")}, aceptá y activá. En la aplicación dejá tildados solo <b>Lectura</b> y <b>Acceso offline</b>.</div>`)}
        ${step(3, "Pegá los códigos y conectá", `<div>Están en <b>Credenciales → Producción</b>: <b>Client ID</b> (son números) y <b>Client secret</b>. No uses el Access Token.</div>
          <div class="form" style="margin-top:4px"><label class="f"><span>Client ID</span><input class="in" id="mp-cid" autocomplete="off" placeholder="son solo números"></label>
          <label class="f"><span>Client secret</span><input class="in" id="mp-csecret" type="password" autocomplete="off"><small>Lo guardamos bajo llave y nunca se muestra.</small></label></div>
          <label class="f" style="margin-top:6px"><span style="align-items:flex-start"><input type="checkbox" id="mp-amplio" style="margin-top:3px"> Entiendo que con mi propia cuenta Mercado Pago da un acceso amplio (podría cobrar o devolver). La app solo lo usa para leer cobros y lo puedo cortar borrando la aplicación.</span></label>
          <div class="actions"><button class="ctl pri" data-act="mp-auth">Conectar Mercado Pago</button>${mp.connected ? '<button class="ctl" data-act="edit-mp">Cancelar</button>' : ""}</div>`)}
      </div>`;
    }
    h += `</div><p class="note">Se actualiza sola todos los días a las 6 de la mañana y cada vez que abrís la app (si pasó más de una hora).${cn.cron ? "" : " Falta la variable CRON_SECRET en Vercel para la actualización diaria."} <a href="#" data-act="sync-full">Volver a traer los últimos 60 días</a></p>`;
  }
  if (S.cfgSub === "costos") {
    // Estilo ESA: una pregunta por fila, en criollo.
    const row = (titulo, ayuda, control) => `<div class="qrow"><div><b>${titulo}</b>${ayuda ? `<small>${ayuda}</small>` : ""}</div><div>${control}</div></div>`;
    const pesos = (k) => `<div class="prefix"><em>$</em><input class="in" type="number" step="1" data-cost="${k}" value="${esc(S.costos[k] ?? c[k] ?? "")}"></div>`;
    const porc = (k, step = "0.1") => `<div class="prefix"><em>%</em><input class="in" type="number" step="${step}" data-cost="${k}" value="${esc(S.costos[k] ?? c[k] ?? "")}"></div>`;
    const sino = (k) => `<div class="seg" style="width:100%"><button data-costb="${k}" data-val="1" aria-pressed="${!!c[k]}">Sí</button><button data-costb="${k}" data-val="0" aria-pressed="${!c[k]}">No</button></div>`;
    const modo = c.mpModo || (c.mpCuotas ? "si" : "no");
    const real = S.mpPcts;
    const mpCtrl = real
      ? `<div class="banner info" style="margin:0"><b>Sale de tus cobros reales</b> (últimos 60 días, ${int(real.n)} cobros).<br>En 1 pago: <b>${real.uno.pct == null ? "–" : pct(real.uno.pct / 100)}</b> · En cuotas: <b>${real.cuotas.pct == null ? "–" : pct(real.cuotas.pct / 100)}</b><br><span class="small">Cada pedido usa la comisión exacta de su cobro.</span></div>`
      : `<div style="display:grid;gap:8px"><div class="seg" style="width:100%">${[["si", "Sí ≈17 %"], ["no", "No ≈7 %"], ["mio", "Pongo el mío"]].map(([v, l]) => `<button data-mpmodo="${v}" aria-pressed="${modo === v}">${l}</button>`).join("")}</div>
         ${modo === "mio" ? porc("mpPctSin") : ""}${modo === "si" ? `<div class="seg" style="width:100%">${[[1, "En todas"], [2, "Desde la 2"], [3, "Desde la 3"]].map(([v, l]) => `<button data-costv="mpDesde" data-val="${v}" aria-pressed="${nn(c.mpDesde || 1) === v}">${l}</button>`).join("")}</div>` : ""}</div>`;
    h += `<div class="card qcard"><h3>Tu dólar</h3>
      ${row("Dólar de ARQ", dolarArqHoy() ? `El gasto de Meta de cada día se pasa a pesos con el dólar de ARQ de ese día (se guarda solo). Hoy: <b>${ars(dolarArqHoy())}</b>. Los días anteriores a que se empezara a guardar usan el dólar cripto de ese día.` : "Todavía no se guardó el dólar de ARQ: se guarda solo en la próxima actualización.", `<div class="small muted">Respaldo si un día no hay dato:</div><div class="prefix"><em>$</em><input class="in" type="number" data-cost="dolar" value="${esc(S.costos.dolar ?? c.dolar)}"></div><a href="#" class="small" data-act="dolarhoy-cfg">Poner el de ARQ de hoy</a>`)}</div>
    <div class="card qcard"><h3>Lo que te cuesta cada pedido</h3>
      ${row("Envío gratis", `Lo pagás vos y va a sucursal: se calcula solo con el código postal de cada pedido, con las tarifas de Andreani en Senyfull del ${new Date(M.TARIFAS_SUCURSAL.fecha + "T12:00:00").toLocaleDateString("es-AR")} (CABA y GBA $7.887 · centro $9.679 · resto $10.603). El envío que paga el cliente no se resta.`, `<span class="small muted">Automático</span>`)}
      ${row("Otro envío fijo por pedido", "Si pagás algo en todos los pedidos. 0 si no.", pesos("envioPedido"))}
      ${row("Armado y caja", "Caja, etiqueta, depósito.", pesos("armadoPedido"))}
      <p class="note">El costo de cada producto va en la pestaña <a href="#" data-cfgsub="productos">Productos</a>.</p></div>
    <div class="card qcard"><h3>Lo que se queda cada cobro</h3>
      ${row("Mercado Pago", real ? "Conectado: no hace falta cargar nada." : "¿Ofrecés cuotas sin interés? Fijate el tuyo en Mercado Pago › Tu negocio › Costos y cuotas.", mpCtrl)}
      ${row("Shopify", "Lo que se queda por cada venta.", porc("shopifyPct"))}
      ${row("Ingresos brutos", "Un impuesto de tu provincia por vender.", porc("iibbPct"))}</div>
    <div class="card qcard"><h3>¿Cómo facturás?</h3>
      ${row("Régimen", "", `<div class="seg" style="width:100%">${[["mono", "Monotributo"], ["ri", "Resp. inscripto"], ["sa", "Sociedad"]].map(([v, l]) => `<button data-costv="regimen" data-val="${v}" aria-pressed="${c.regimen === v}">${l}</button>`).join("")}</div>`)}
      ${c.regimen !== "mono" ? `${row("Beneficio del IVA", "50 el primer año, 30 el segundo, 20 el tercero. Si ya no lo tenés, 0.", porc("beneficioIva", "1"))}
      ${row("¿Tu proveedor te da factura?", "Réplicas o sin factura: No.", sino("provFactura"))}
      ${row("¿El armado (fulfillment) te da factura?", "", sino("armadoFactura"))}` : ""}
</div>
    <div class="card qcard"><h3>Cuánto querés pagarle a Meta por venta</h3>
      ${[1, 2, 3].map((k) => row(`Oferta ${k}${k === 3 ? " o más" : ""}`, k === 1 ? "Lleva 1 unidad. Lauty pide US$16." : k === 2 ? "Lleva 2. Lauty pide US$18." : "Lleva 3 o más. Lauty pide US$20.", `<div class="prefix w"><em>US$</em><input class="in" type="number" step="0.5" data-cpaobj="${k}" value="${esc(c.cpaObjetivo[k])}"></div>`)).join("")}</div>
    <div class="card qcard"><h3>Otros</h3>${row("Recargo sobre Meta", "Impuestos de la tarjeta sobre el gasto en anuncios. 0 si no tenés.", porc("recargoAds"))}</div>`;
  }
  if (S.cfgSub === "productos") {
    const ps = productosVistos();
    const st = M.stockDetalle(ctx(), today).filter((x) => x.conteo);
    h += ps.length ? `<p class="note">Los productos salen solos de tus ventas de Shopify. Cargá cuánto te cuesta cada unidad (lo que le pagás al proveedor). Si cada compra sale distinto, cargala en Control de stock → «Entró mercadería» con su costo: cada venta usa el costo de la compra de la que salió. "Agregado" es un upsell, order bump o seguro de envío: no paga envío ni anuncio aparte.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Vendidas</th><th>Costo por unidad</th><th>Factura A ${tip("Si el proveedor de este producto te da Factura A, descontás el IVA de su costo.")}</th><th>Tipo</th><th>Palabra de la campaña ${tip("Si el nombre de la campaña de Meta tiene esta palabra, sus anuncios se le asignan a este producto.")}</th><th>Stock ${tip("Cuántas unidades tenías en esa fecha. Descontamos solas las que se venden después.")}</th><th>Desde</th><th class="r">Te alcanza</th></tr></thead><tbody>
      ${ps.map((p) => { const pc = S.prods[p.pid] || {}; const s = st.find((x) => x.pid === p.pid); return `<tr><td style="white-space:normal;min-width:180px">${esc(p.titulo)}</td><td class="r">${int(p.unidades)}</td>
      <td><div class="prefix" style="width:130px"><em>$</em><input class="in" type="number" data-prod="${esc(p.pid)}" data-k="costo" value="${esc(pc.costo ?? "")}"></div></td>
      <td><select class="in" style="width:90px" data-prod="${esc(p.pid)}" data-k="factura"><option value="" ${pc.factura ? "" : "selected"}>No</option><option value="1" ${pc.factura ? "selected" : ""}>Sí</option></select></td>
      <td><select class="in" style="width:130px" data-prod="${esc(p.pid)}" data-k="tipo">${[["principal", "Principal"], ["agregado", "Agregado"], ["digital", "Digital (sin envío)"]].map(([v, l]) => `<option value="${v}" ${(pc.tipo || "principal") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><input class="in" style="width:130px" data-prod="${esc(p.pid)}" data-k="clave" value="${esc(pc.clave ?? "")}" placeholder="ej: impoluto"></td>
      <td><input class="in" style="width:90px" type="number" data-prod="${esc(p.pid)}" data-k="stock" value="${esc(pc.stock ?? "")}"></td>
      <td><input class="in" style="width:140px" type="date" data-prod="${esc(p.pid)}" data-k="stockFecha" value="${esc(pc.stockFecha ?? "")}"></td>
      <td class="r">${s ? `${int(s.actual)} u.${s.dias != null ? ` · <span class="${s.dias <= s.alertaDias ? "down" : ""}">${int(s.dias)} días</span>` : ""}` : "–"}</td></tr>`; }).join("")}</tbody></table></div>` : '<div class="card empty">Cuando conectes Shopify y entren ventas, acá aparecen tus productos para cargarles el costo.</div>';
  }
  if (S.cfgSub === "fijos") {
    const fijos = c.fijos || [];
    const sug = ["Shopify", "ChatGPT", "Contador", "GemPages", "Klaviyo", "Kaching Bundles", "Claude"].filter((s) => !fijos.some((f) => f.nombre === s));
    h += `<div class="card"><h3>Lo que pagás todos los meses</h3><p class="note">Shopify, las apps, el contador: lo que pagás aunque no vendas nada. Lo restamos de tu ganancia, un poquito cada día.</p>
      <div style="display:grid;gap:8px;margin-top:10px">${fijos.map((f, i) => `<div style="display:flex;gap:8px;align-items:center"><input class="in" data-fijo="${i}" data-k="nombre" value="${esc(f.nombre)}" style="flex:1"><div class="prefix" style="width:170px"><em>$</em><input class="in" type="number" data-fijo="${i}" data-k="monto" value="${esc(f.monto)}"></div><button class="ctl" data-fijodel="${i}">Quitar</button></div>`).join("")}</div>
      <div class="actions" style="margin-top:10px">${sug.map((s) => `<button class="chip" data-fijoadd="${esc(s)}">+ ${esc(s)}</button>`).join("")}<button class="chip" data-fijoadd="">+ Otro</button></div>
      <p class="note" style="margin-top:10px">Total por mes: <b>${ars(fijos.reduce((a, f) => a + nn(f.monto), 0))}</b>. Si es en dólares, ponelo pasado a pesos.</p></div>`;
  }
  if (S.cfgSub === "general") {
    const [a, b] = socios();
    h += `<div class="card"><h3>Socios y caja</h3><div class="form">
      <label class="f"><span>Socio 1</span><input class="in" data-appk="socio0" value="${esc(a)}"></label><label class="f"><span>Socio 2</span><input class="in" data-appk="socio1" value="${esc(b)}"></label>
      ${num("repartoPct", "%", "1", "Parte de la ganancia para " + esc(a), "El resto es para " + esc(b) + ".")}
      <label class="f"><span>Saldo inicial de la caja</span><div class="prefix"><em>$</em><input class="in" type="number" data-app="saldoInicial" value="${esc(S.app.saldoInicial ?? 0)}"></div><small>Lo que había en la caja antes de empezar a usar la app.</small></label>
      <label class="f"><span>La tarjeta de Meta la paga</span><select class="in" data-costsel="metaPaga">${["Caja", ...socios()].map((s) => `<option ${c.metaPaga === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><small>Si la paga un socio, cuenta como aporte suyo (cargalo como gasto con su nombre).</small></label>
    </div></div>`;
  }
  return h + "</div>";
}

// ============ modales ============
function openModal(html) { closeModal(); const bg = document.createElement("div"); bg.className = "modal-bg"; bg.id = "modal"; bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(bg); bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(); }); const f = bg.querySelector("input,select"); if (f) setTimeout(() => f.focus(), 20); }
function closeModal() { const m = $("#modal"); if (m) m.remove(); }

function modalGasto(id) {
  const g = id ? S.gastos.find((x) => x.id === id) : null;
  const d = g || { fecha: today, moneda: "ARS", quien: CAJA, pago: "Mercado Pago", catId: "stock" };
  openModal(`<h2>${g ? "Editar gasto" : "Cargar gasto"}</h2><div class="form">
    <label class="f"><span>Fecha</span><input class="in" type="date" id="g-fecha" value="${esc(d.fecha)}"></label>
    <label class="f"><span>Categoría</span><select class="in" id="g-cat">${cats().map((c) => `<option value="${esc(c.id)}" ${catOf(d).id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label class="f" style="grid-column:1/-1"><span>Concepto</span><input class="in" id="g-concepto" value="${esc(d.concepto || "")}" placeholder="ej: 300 unidades del restaurador"></label>
    <label class="f"><span>Monto</span><input class="in" type="number" step="0.01" id="g-monto" value="${esc(d.moneda === "USD" ? d.montoOrig : d.monto ?? "")}"></label>
    <label class="f"><span>Moneda</span><select class="in" id="g-moneda"><option ${d.moneda !== "USD" ? "selected" : ""}>ARS</option><option ${d.moneda === "USD" ? "selected" : ""}>USD</option></select></label>
    <label class="f"><span>Dólar (si es en USD)</span><input class="in" type="number" id="g-tc" value="${esc(d.tc || cfg().dolar)}"></label>
    <label class="f"><span>Pagó</span><select class="in" id="g-quien">${[CAJA, ...socios()].map((s) => `<option ${d.quien === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="f"><span>Medio de pago</span><select class="in" id="g-pago">${(S.app.pagos || ["Tarjeta de crédito", "Tarjeta de débito", "Transferencia", "Mercado Pago", "Efectivo"]).map((s) => `<option ${d.pago === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="f"><span>Proveedor</span><input class="in" id="g-prov" value="${esc(d.proveedor || "")}"></label>
    <label class="f"><span><input type="checkbox" id="g-fa" ${d.facturaA ? "checked" : ""}> Tiene Factura A</span><small>Suma al IVA crédito.</small></label>
    <label class="f"><span><input type="checkbox" id="g-rec" ${d.recurrente ? "checked" : ""}> Es mensual</span></label>
    <label class="f" style="grid-column:1/-1"><span>Notas</span><input class="in" id="g-notas" value="${esc(d.notas || "")}"></label>
  </div><p class="note" id="g-err" style="color:var(--red)"></p><div class="actions" style="justify-content:space-between">${g ? '<button class="ctl" data-act="g-del" data-id="' + esc(g.id) + '">Eliminar</button>' : "<span></span>"}<div class="actions"><button class="ctl" data-act="close">Cancelar</button><button class="ctl pri" data-act="g-save" data-id="${esc(g ? g.id : "")}">Guardar</button></div></div>`);
}
async function saveGasto(id) {
  const fecha = $("#g-fecha").value, monto = parseFloat($("#g-monto").value), mon = $("#g-moneda").value, tc = parseFloat($("#g-tc").value) || 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return ($("#g-err").textContent = "Elegí la fecha.");
  if (!(monto > 0)) return ($("#g-err").textContent = "Poné el monto.");
  if (mon === "USD" && !(tc > 0)) return ($("#g-err").textContent = "Poné el dólar.");
  const prev = id ? S.gastos.find((x) => x.id === id) : null;
  const now = new Date().toISOString();
  const cat = cats().find((c) => c.id === $("#g-cat").value);
  const data = { ...(prev || {}), fecha, mes: fecha.slice(0, 7), catId: cat.id, cat: cat.name, concepto: $("#g-concepto").value.trim().slice(0, 200), moneda: mon, montoOrig: monto, tc: mon === "USD" ? tc : null, monto: mon === "USD" ? monto * tc : monto, quien: $("#g-quien").value, pago: $("#g-pago").value, proveedor: $("#g-prov").value.trim().slice(0, 120), facturaA: $("#g-fa").checked, recurrente: $("#g-rec").checked, notas: $("#g-notas").value.trim().slice(0, 1000), comprobantes: (prev && prev.comprobantes) || [], updatedAt: now, createdAt: (prev && prev.createdAt) || now };
  delete data.id;
  await (id ? db.doc("gastos/" + id) : db.collection("gastos").doc()).set(data);
  closeModal(); toast(id ? "Gasto actualizado" : "Gasto guardado");
}
function modalMov(id) {
  const m = id ? S.movs.find((x) => x.id === id) : null;
  const d = m || { fecha: today, tipo: "aporte", socio: socios()[0] };
  openModal(`<h2>${m ? "Editar" : "Cargar"} aporte o retiro</h2><div class="form">
    <label class="f"><span>Tipo</span><select class="in" id="m-tipo"><option value="aporte" ${d.tipo !== "retiro" ? "selected" : ""}>Aporte (pone plata)</option><option value="retiro" ${d.tipo === "retiro" ? "selected" : ""}>Retiro (se lleva plata)</option></select></label>
    <label class="f"><span>Socio</span><select class="in" id="m-socio">${socios().map((s) => `<option ${d.socio === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="f"><span>Monto</span><div class="prefix"><em>$</em><input class="in" type="number" id="m-monto" value="${esc(d.monto ?? "")}"></div></label>
    <label class="f"><span>Fecha</span><input class="in" type="date" id="m-fecha" value="${esc(d.fecha)}"></label>
    <label class="f" style="grid-column:1/-1"><span>Nota</span><input class="in" id="m-nota" value="${esc(d.nota || "")}"></label></div>
    <p class="note" id="m-err" style="color:var(--red)"></p><div class="actions" style="justify-content:space-between">${m ? '<button class="ctl" data-act="m-del" data-id="' + esc(m.id) + '">Eliminar</button>' : "<span></span>"}<div class="actions"><button class="ctl" data-act="close">Cancelar</button><button class="ctl pri" data-act="m-save" data-id="${esc(m ? m.id : "")}">Guardar</button></div></div>`);
}
async function saveMov(id) {
  const monto = parseFloat($("#m-monto").value), fecha = $("#m-fecha").value;
  if (!(monto > 0)) return ($("#m-err").textContent = "Poné el monto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return ($("#m-err").textContent = "Elegí la fecha.");
  const prev = id ? S.movs.find((x) => x.id === id) : null;
  const now = new Date().toISOString();
  const data = { tipo: $("#m-tipo").value, socio: $("#m-socio").value, monto, fecha, mes: fecha.slice(0, 7), nota: $("#m-nota").value.trim().slice(0, 200), createdAt: (prev && prev.createdAt) || now, updatedAt: now };
  await (id ? db.doc("movimientos/" + id) : db.collection("movimientos").doc()).set(data);
  closeModal(); toast("Guardado");
}

// ============ CSV ============
async function download(name, rows) {
  const txt = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
  const dl = await window.claude.use("downloads");
  await dl.save({ filename: name, data: new Blob([txt], { type: "text/csv;charset=utf-8" }) });
}
function csvOrders() {
  const rows = [["Pedido", "Fecha", "Estado", "Cobro", "Total", "Devuelto", "Producto", "Envío", "Armado", "Mercado Pago", "Shopify", "IIBB", "IVA a pagar", "Te quedó (antes de anuncios)"]];
  S.data.orders.filter((o) => !o.t && M.dayOf(o.c) >= S.from && M.dayOf(o.c) <= S.to).sort((a, b) => a.c.localeCompare(b.c)).forEach((o) => { const k = M.costoPedido(o, cfg(), S.prods); const p = M.estado(o) === "pagado"; rows.push([o.n, M.dayOf(o.c), M.estado(o), M.esTransferencia(o) ? "Transferencia" : "Mercado Pago", o.tot, o.ref, ...(p ? [k.producto, k.envio, k.armado, k.mp, k.shopify, k.iibb, k.ivaPagar, k.margen] : ["", "", "", "", "", "", "", ""])].map((v) => (typeof v === "number" ? Math.round(v) : v))); });
  download(`pedidos_${S.from}_${S.to}.csv`, rows);
}
function csvImp() {
  const t = M.impuestosMes(ctx(), S.impMes);
  const rows = [["Concepto", "Monto"], ["Ventas con IVA", t.ventas], ["IVA de venta total", t.debitoTotal], ["Beneficio de IVA", t.beneficio], ["IVA de venta a pagar", t.debito], ["IVA comisiones de Mercado Pago", t.creditoComisiones], ["IVA envíos Andreani", t.creditoEnvios], ["IVA gastos con Factura A", t.creditoGastos], ["IVA a pagar", t.ivaPagar], ["Ingresos brutos", t.iibb], ["Ganancia del mes", t.gananciaAntes]].map((r) => [r[0], typeof r[1] === "number" ? Math.round(r[1]) : r[1]]);
  rows.push([], ["Gastos del mes con Factura A"], ["Fecha", "Concepto", "Proveedor", "Monto", "IVA"]);
  S.gastos.filter((g) => g.fecha.startsWith(S.impMes) && g.facturaA).forEach((g) => rows.push([g.fecha, g.concepto || catOf(g).name, g.proveedor || "", Math.round(g.monto), Math.round(g.monto - g.monto / 1.21)]));
  download(`impuestos_${S.impMes}.csv`, rows);
}
function csvGastos() {
  const rows = [["Fecha", "Concepto", "Categoría", "Monto ARS", "Moneda", "Monto original", "Dólar", "Pagó", "Medio", "Proveedor", "Factura A", "Mensual", "Notas"]];
  gastosTodos().filter((g) => g.fecha.startsWith(S.gastosMes)).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((g) => rows.push([g.fecha, g.concepto || "", catOf(g).name, Math.round(g.monto), g.moneda || "ARS", g.montoOrig ?? g.monto, g.tc || "", g.quien || "", g.pago || "", g.proveedor || "", g.facturaA ? "Sí" : "", g.recurrente ? "Sí" : "", g.notas || ""]));
  download(`gastos_${S.gastosMes}.csv`, rows);
}


// ============ Stock ============
const fechaCorta = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const ESTADO_STOCK = {
  "sin-stock": ["bad", "Sin stock"], critico: ["bad", "Se termina"], pedir: ["warn", "Pedí ya"], bien: ["good", "Bien"], "sin-conteo": ["", "Falta el conteo"],
};
function barras(serie) {
  const max = Math.max(1, ...serie.map((x) => x.u));
  const w = 100 / serie.length;
  return `<svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:70px;display:block">${serie.map((x, i) => `<rect x="${i * w + w * 0.15}" y="${34 - (x.u / max) * 32}" width="${w * 0.7}" height="${(x.u / max) * 32}" fill="var(--pink)" opacity="${i === serie.length - 1 ? 0.45 : 0.9}"><title>${fechaCorta(x.d)}: ${x.u} u.</title></rect>`).join("")}</svg>
    <div class="small muted" style="display:flex;justify-content:space-between"><span>${fechaCorta(serie[0].d)}</span><span>hoy</span></div>`;
}
function viewStock() {
  if (!S.loaded) return `<div class="content"><div class="card empty">Cargando…</div></div>`;
  const [from, to] = [S.from, S.to];
  const lista = M.stockDetalle(ctx(), today, [from, to]);
  const con = lista.filter((x) => !x.sinStock);
  const sin = lista.filter((x) => x.sinStock);
  let h = `<div class="bar2"><div class="chips">${PRESETS.map(([k, l]) => `<button class="chip" data-preset="${k}" aria-pressed="${S.preset === k}">${l}</button>`).join("")}</div></div><div class="content">`;
  const urg = con.filter((x) => ["sin-stock", "critico", "pedir"].includes(x.estadoStock));
  urg.forEach((x) => (h += `<p class="banner ${x.estadoStock === "pedir" ? "warn" : "bad"}"><b>${esc(x.nombre)}:</b> ${x.estadoStock === "sin-stock" ? "te quedaste sin stock según la cuenta. Si no es así, hacé un conteo." : `te quedan ${int(x.actual)} unidades, alcanzan ${int(x.dias)} días (hasta el ${fechaCorta(x.quiebre)}). Tu proveedor tarda ${x.entregaDias} días: pedí ${int(x.pedir.cant)} unidades ahora.`}</p>`));

  // Tarjetas por producto
  h += `<div style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))">`;
  for (const x of con) {
    const [tone, txt] = ESTADO_STOCK[x.estadoStock];
    h += `<div class="card" style="display:grid;gap:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3 style="margin:0">${esc(x.nombre)}</h3><span class="tag ${tone}">${txt}</span></div>`;
    if (!x.conteo) {
      h += `<p class="note" style="margin:0">Para saber cuánto te queda, contá cuántas unidades tenés hoy. Desde ahí la app descuenta sola cada venta.</p>
        <div class="actions"><input class="in" type="number" min="0" id="stk-ini-${esc(x.pid)}" placeholder="Unidades que tenés hoy" style="max-width:220px"><button class="ctl pri" data-stk="inicial" data-pid="${esc(x.pid)}">Guardar</button></div>`;
    } else {
      h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div><div class="small muted">Te quedan</div><div style="font-size:26px;font-weight:600">${int(x.actual)} <span class="small muted">u.</span></div>${x.reservadas ? `<div class="small muted">+ ${int(x.reservadas)} en pedidos sin pagar</div>` : ""}</div>
        <div><div class="small muted">Te alcanza</div><div style="font-size:26px;font-weight:600">${x.dias != null ? int(x.dias) + ' <span class="small muted">días</span>' : "–"}</div>${x.quiebre ? `<div class="small muted">hasta el ${fechaCorta(x.quiebre)}</div>` : ""}</div>
        <div><div class="small muted">Vendés por día</div><div style="font-size:26px;font-weight:600">${x.ritmo ? (Math.round(x.ritmo * 10) / 10).toString().replace(".", ",") : "0"}</div><div class="small muted">30 días: ${(Math.round(x.r30 * 10) / 10).toString().replace(".", ",")}/día</div></div></div>`;
      if (x.pedir) h += `<p style="margin:0">${x.pedir.ya ? `<b class="down">Pedí ya ${int(x.pedir.cant)} unidades.</b>` : `Próximo pedido: <b>el ${fechaCorta(x.pedir.cuando)}</b>, unas <b>${int(x.pedir.cant)} unidades</b>.`} <span class="muted small">Cuenta: lo que vendés en ${x.entregaDias} días que tarda en llegar + ${x.coberturaDias} días más, menos lo que te queda.</span></p>`;
      h += `<div class="small muted">Desde el conteo del ${fechaCorta(x.conteo.fecha)} (${int(x.conteo.cant)} u.): ${x.entradas ? `+${int(x.entradas)} entraron · ` : ""}${x.salidas ? `−${int(x.salidas)} salidas · ` : ""}${x.ajustes ? `${x.ajustes > 0 ? "+" : ""}${int(x.ajustes)} por conteo · ` : ""}−${int(x.vendidas)} vendidas${x.valor != null ? ` · stock valuado en ${ars(x.valor)}` : ""}</div>`;
      if (x.lotes && x.lotes.length) h += `<div class="small"><span class="muted">Lo que tenés, por compra (se vende primero lo más viejo):</span> ${x.lotes.map((lt) => `<b>${int(lt.quedan)} u.</b> a ${lt.costo != null ? ars(lt.costo) : "<span class='down'>sin costo</span>"}${lt.proveedor ? ` · ${esc(lt.proveedor)}` : ""} <span class="muted">(${fechaCorta(lt.fecha)})</span>`).join(" &nbsp;|&nbsp; ")}</div>`;
      h += `<div class="actions"><button class="ctl pri" data-stk="ingreso" data-pid="${esc(x.pid)}">+ Entró mercadería</button><button class="ctl" data-stk="conteo" data-pid="${esc(x.pid)}">Conté el stock</button><button class="ctl" data-stk="salida" data-pid="${esc(x.pid)}">Salida (regalo, rotura)</button></div>`;
    }
    h += `<div><div class="small muted" style="margin-bottom:4px">Unidades vendidas por día · últimos 30 días</div>${barras(x.serie)}</div>
      <details><summary class="small muted" style="cursor:pointer">Ajustes de este producto</summary><div class="form" style="margin-top:8px">
        <label class="f"><span>Días que tarda tu proveedor</span><input class="in" type="number" min="0" data-stkcfg="${esc(x.pid)}" data-k="entregaDias" value="${esc(x.entregaDias)}"></label>
        <label class="f"><span>Días de stock que querés tener</span><input class="in" type="number" min="0" data-stkcfg="${esc(x.pid)}" data-k="coberturaDias" value="${esc(x.coberturaDias)}"></label>
        <label class="f"><span>Avisame cuando queden menos de (días)</span><input class="in" type="number" min="0" data-stkcfg="${esc(x.pid)}" data-k="alertaDias" value="${esc(x.alertaDias)}"></label>
        <label class="f" style="align-self:end"><span><input type="checkbox" data-stkcfg="${esc(x.pid)}" data-k="sinStock"> No lleva stock</span></label></div></details></div>`;
  }
  h += `</div>`;

  // Unidades vendidas y proyección
  h += block("unidades", "Unidades vendidas", `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">En estas fechas</th><th class="r">Este mes</th><th class="r">Proyección del mes ${tip("Lo vendido en el mes más lo que vendés por día (últimos 7 días) por los días que faltan.")}</th><th class="r">Mes pasado</th><th class="r">Por día (7 / 30 días)</th></tr></thead><tbody>
    ${lista.map((x) => `<tr><td>${esc(x.nombre)}${x.sinStock ? ' <span class="muted small">(no lleva stock)</span>' : ""}</td><td class="r">${int(x.enRango)}</td><td class="r">${int(x.vendMes)}</td><td class="r"><b>${int(x.proyMes)}</b></td><td class="r">${int(x.mesPasado)}</td><td class="r">${(Math.round(x.r7 * 10) / 10).toString().replace(".", ",")} / ${(Math.round(x.r30 * 10) / 10).toString().replace(".", ",")}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">Cuenta las unidades de pedidos pagados (sin cancelados ni devueltos), incluidas las que van de regalo en los packs.</p>`);

  // Historial de movimientos
  const mv = (S.stockMovs || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.at).localeCompare(String(a.at))).slice(0, 60);
  const nom = Object.fromEntries(lista.map((x) => [x.pid, x.nombre]));
  const TIPO = { ingreso: "Entró mercadería", ajuste: "Conteo", salida: "Salida" };
  h += block("movstock", "Movimientos de stock", mv.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Producto</th><th>Qué</th><th class="r">Unidades</th><th>Nota</th><th></th></tr></thead><tbody>
    ${mv.map((m) => `<tr><td>${esc(fechaCorta(m.fecha))}</td><td>${esc(nom[m.pid] || m.pid)}</td><td>${esc(TIPO[m.tipo] || m.tipo)}</td><td class="r">${m.tipo === "salida" ? "−" : m.cant > 0 && m.tipo === "ajuste" ? "+" : ""}${int(m.cant)}</td><td class="muted" style="white-space:normal">${[m.costo != null ? ars(m.costo) + " c/u" : "", m.proveedor || "", m.nota || ""].filter(Boolean).map(esc).join(" · ")}</td><td class="r"><button class="ctl" data-stk="borrar" data-id="${esc(m.id)}">Borrar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="card empty">Cuando entre mercadería o hagas un conteo, queda registrado acá.</div>`);
  if (sin.length) h += `<p class="note">No llevan stock: ${sin.map((x) => `${esc(x.nombre)} <a href="#" data-stk="lleva" data-pid="${esc(x.pid)}">(sí lleva)</a>`).join(" · ")}</p>`;
  return h + "</div>";
}

function stockAccion(acc, pid, id) {
  const x = pid ? M.stockDetalle(ctx(), today).find((y) => y.pid === pid) : null;
  if (acc === "inicial") {
    const el = document.getElementById("stk-ini-" + pid);
    const v = el && el.value.trim();
    if (v === "" || !(Number(v) >= 0)) return toast("Poné cuántas unidades tenés hoy.");
    const prev = S.prods[pid] || {};
    const next = { ...prev, nombre: prev.nombre || (x && x.nombre) || "", stock: Number(v), stockFecha: today };
    S.prods = { ...S.prods, [pid]: next };
    return db.doc("prods/" + pid).set(next).then(() => { toast("Stock guardado: desde hoy se descuenta solo"); render(); });
  }
  if (acc === "lleva") { const prev = S.prods[pid] || {}; const next = { ...prev, nombre: prev.nombre || (x && x.nombre) || "", sinStock: false }; S.prods = { ...S.prods, [pid]: next }; return db.doc("prods/" + pid).set(next).then(render); }
  if (acc === "borrar") return db.doc("stockmov/" + id).delete().then(() => toast("Movimiento borrado"));
  const titulos = { ingreso: "Entró mercadería", conteo: "Conté el stock", salida: "Salida de stock" };
  const ayuda = {
    ingreso: "Las unidades que llegaron del proveedor. Se suman al stock.",
    conteo: `Contá las unidades que tenés de verdad. La app calcula ${int(x.actual)}: la diferencia queda registrada como ajuste.`,
    salida: "Unidades que salieron sin venderse: regalos, muestras, roturas, uso propio. Se restan.",
  };
  openModal(`<h2>${titulos[acc]} · ${esc(x.nombre)}</h2><p class="note">${ayuda[acc]}</p><div class="form">
    <label class="f"><span>Fecha</span><input class="in" type="date" id="sm-fecha" value="${today}"></label>
    <label class="f"><span>${acc === "conteo" ? "Unidades que contaste" : "Unidades"}</span><input class="in" type="number" min="0" id="sm-cant"></label>
    ${acc === "ingreso" ? `<label class="f"><span>Costo por unidad</span><div class="prefix"><em>$</em><input class="in" type="number" min="0" step="0.01" id="sm-costo" value="${esc(x.costoUltimo ?? x.costo ?? "")}"></div><small>Lo que pagaste por cada unidad de esta compra.</small></label>
    <label class="f"><span>Proveedor</span><input class="in" id="sm-prov" list="sm-provs" value="${esc(((S.stockMovs || []).filter((m) => m.pid === pid && m.proveedor).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || {}).proveedor || "")}"><datalist id="sm-provs">${[...new Set((S.stockMovs || []).map((m) => m.proveedor).filter(Boolean))].map((p) => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    <label class="f" style="grid-column:1/-1"><span>Nota</span><input class="in" id="sm-nota" placeholder="${acc === "ingreso" ? "ej: remito 123" : acc === "salida" ? "ej: 2 de regalo a influencer" : "opcional"}"></label></div>
    <p class="note" id="sm-err" style="color:var(--red)"></p>
    <div class="actions" style="justify-content:flex-end"><button class="ctl" data-act="close">Cancelar</button><button class="ctl pri" id="sm-ok">Guardar</button></div>`);
  document.getElementById("sm-ok").onclick = async () => {
    const fecha = document.getElementById("sm-fecha").value, cantS = document.getElementById("sm-cant").value.trim(), nota = document.getElementById("sm-nota").value.trim();
    const cant = Number(cantS);
    const err = (m) => (document.getElementById("sm-err").textContent = m);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err("Elegí la fecha.");
    if (fecha > today) return err("La fecha no puede ser futura.");
    if (x.conteo && fecha < x.conteo.fecha) return err(`Es anterior al conteo del ${fechaCorta(x.conteo.fecha)}: no cambiaría nada.`);
    if (cantS === "" || !Number.isFinite(cant) || cant < 0 || !Number.isInteger(cant)) return err("Poné una cantidad entera.");
    let doc;
    if (acc === "conteo") {
      // Se compara contra lo que la app calcula para ese día.
      const calc = M.stockDetalle({ ...ctx(), orders: ctx().orders.filter((o) => M.dayOf(o.c) <= fecha), stockMovs: (S.stockMovs || []).filter((m) => m.fecha <= fecha) }, fecha).find((y) => y.pid === pid);
      const dif = cant - Math.round(calc.actual);
      if (dif === 0) { closeModal(); return toast("Coincide con la cuenta de la app. ¡Bien!"); }
      doc = { pid, fecha, tipo: "ajuste", cant: dif, nota: `Contaste ${cant}, la app calculaba ${int(calc.actual)}${nota ? " · " + nota : ""}` };
    } else {
      if (!(cant > 0)) return err("Poné cuántas unidades.");
      doc = { pid, fecha, tipo: acc, cant, nota };
      if (acc === "ingreso") {
        const cS = document.getElementById("sm-costo").value.trim(), costo = Number(cS);
        if (cS === "" || !Number.isFinite(costo) || costo < 0) return err("Poné el costo por unidad de esta compra.");
        doc.costo = costo; doc.proveedor = document.getElementById("sm-prov").value.trim();
      }
    }
    await db.collection("stockmov").add({ ...doc, at: new Date().toISOString() });
    closeModal();
    toast(acc === "conteo" ? `Ajuste guardado: ${doc.cant > 0 ? "+" : ""}${doc.cant} unidades` : "Guardado");
  };
}

// ============ render ============
function render() {
  const a = document.activeElement;
  if (a && a.matches && a.matches("#view input, #view select, #view textarea") && a.type !== "checkbox" && a.type !== "file") return void (S.dirty = true);
  S.dirty = false;
  const scroll = window.scrollY;
  $("#side").innerHTML = sideHTML();
  $("#topr").innerHTML = topRight();
  const V = { dashboard: viewDashboard, anuncios: viewAnuncios, caja: viewCaja, impuestos: viewImpuestos, socios: viewSocios, gastos: viewGastos, calculadora: viewCalc, config: viewConfig, facturas: viewFacturas, stock: viewStock };
  $("#title").textContent = (VIEWS.find((v) => v[0] === S.view) || VIEWS[0])[1];
  // Costo de cada venta según el lote del que salió (proveedores con precios distintos).
  if (S.loaded) { try { S.fifo = M.costeoFIFO(S.data.orders, S.prods, S.stockMovs); } catch (e) { console.error(e); S.fifo = null; } }
  // Lo que el usuario está escribiendo en un formulario no se borra cuando la pantalla se actualiza sola.
  const kept = {};
  document.querySelectorAll("#view input[id], #view textarea[id], #modal input[id]").forEach((i) => { if (i.type !== "checkbox" && i.type !== "file" && i.value) kept[i.id] = i.value; });
  try { $("#view").innerHTML = (V[S.view] || viewDashboard)(); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="content"><p class="banner bad">Algo falló al armar esta pantalla: ${esc(e.message)}</p></div>`; }
  for (const [id, v] of Object.entries(kept)) { const el = document.getElementById(id); if (el && el.closest("#view") && el.value !== v && !el.readOnly) el.value = v; }
  window.scrollTo(0, scroll);
}
document.addEventListener("focusout", () => setTimeout(() => { if (S.dirty) render(); }, 0));

// ============ eventos ============
document.addEventListener("click", async (e) => {
  if (await onFactClick(e)) return;
  const t = e.target.closest("[data-nav],[data-sub],[data-preset],[data-cur],[data-act],[data-open],[data-adsdays],[data-adsgroup],[data-impmes],[data-socr],[data-gmes],[data-cfgsub],[data-calcb],[data-calcreg],[data-esc],[data-escdel],[data-costb],[data-costv],[data-mpmodo],[data-fijoadd],[data-fijodel],[data-stk],[data-vfil]");
  const cp = e.target.closest("[data-copy]");
  if (cp) { e.preventDefault(); navigator.clipboard.writeText(cp.dataset.copy).then(() => toast("Copiado"), () => toast("No se pudo copiar")); return; }
  if (!t) return;
  if ((t.tagName === "A" && !t.target) || t.dataset.act || t.dataset.nav) e.preventDefault();
  const d = t.dataset;
  if (d.nav) { S.view = d.nav; localStorage.setItem("imp_view", S.view); if (d.nav === "facturas") cargarFacturas(true); if (d.cfgsub) S.cfgSub = d.cfgsub; window.scrollTo(0, 0); return render(); }
  if (d.cfgsub) { S.cfgSub = d.cfgsub; return render(); }
  if (d.sub) { S.sub = d.sub; return render(); }
  if (d.preset) { setRange(d.preset); return render(); }
  if (d.cur) { S.cur = d.cur; return render(); }
  if (d.adsdays) { S.adsDays = Number(d.adsdays); return render(); }
  if (d.adsgroup) { S.adsGroup = d.adsgroup; S.adsPicked = true; return render(); }
  if (d.impmes) { S.impMes = d.impmes; return render(); }
  if (d.socr) { S.sociosR = d.socr; return render(); }
  if (d.gmes) { S.gastosMes = d.gmes; return render(); }
  if (d.calcreg) { S.calcReg = d.calcreg; return render(); }
  if (d.calcb) { setCalc(d.calcb, d.val === "1"); return; }
  if (d.costb) { saveCostos({ [d.costb]: d.val === "1" }); return render(); }
  if (d.mpmodo) { const v = d.mpmodo; saveCostos(v === "si" ? { mpModo: v, mpCuotas: true, mpPctCuotas: 17, mpPctSin: 7 } : v === "no" ? { mpModo: v, mpCuotas: false, mpPctSin: 7 } : { mpModo: v, mpCuotas: false }); return render(); }
  if (d.costv) { saveCostos({ [d.costv]: isNaN(Number(d.val)) ? d.val : Number(d.val) }); return render(); }
  if (d.fijoadd !== undefined) { saveCostos({ fijos: [...(cfg().fijos || []), { nombre: d.fijoadd || "Otro", monto: 0 }] }); return render(); }
  if (d.fijodel !== undefined) { const f = [...(cfg().fijos || [])]; f.splice(Number(d.fijodel), 1); saveCostos({ fijos: f }); return render(); }
  if (d.esc) { const s = S.escenarios.find((x) => x.id === d.esc); if (s) { S.calcCur = { ...s.v }; S.calcTouched = true; saveCalc(); render(); } return; }
  if (d.escdel) { await db.doc("escenarios/" + d.escdel).delete(); return; }
  if (d.stk) return stockAccion(d.stk, d.pid, d.id);
  if (d.vfil) { S.ventasFiltro = d.vfil; return render(); }
  if (d.open === "gasto") return modalGasto(d.id);
  if (d.open === "mov") return modalMov(d.id);
  const act = d.act;
  try {
    if (act === "close") closeModal();
    else if (act === "logout") window.impolutoLogout();
    else if (act === "sync") sync();
    else if (act === "edit-sh") { S.editSh = !S.editSh; render(); }
    else if (act === "edit-me") { S.editMe = !S.editMe; render(); }
    else if (act === "edit-mp") { S.editMp = !S.editMp; render(); }
    else if (act === "mp-auth") {
      t.disabled = true; t.textContent = "Conectando…";
      const r = await api("/api/connect", { method: "POST", body: JSON.stringify({ which: "mp-app", clientId: $("#mp-cid").value, clientSecret: $("#mp-csecret").value, amplio: $("#mp-amplio").checked }) });
      toast(`Mercado Pago conectado: ${r.name}`); S.editMp = false; await loadConn(); sync("mp", { full: true });
    }
    else if (act === "sync-full") sync("all", { full: true, days: 60 });
    else if (act === "g-save") await saveGasto(d.id);
    else if (act === "g-del") { await db.doc("gastos/" + d.id).delete(); closeModal(); toast("Gasto eliminado"); }
    else if (act === "m-save") await saveMov(d.id);
    else if (act === "m-del") { await db.doc("movimientos/" + d.id).delete(); closeModal(); toast("Eliminado"); }
    else if (act === "csv-orders") csvOrders();
    else if (act === "csv-imp") csvImp();
    else if (act === "csv-g") csvGastos();
    else if (act === "caja-hasta") { S.cajaHasta = ($("#caja-hasta").value || today).slice(0, 10); S.cajaDesde = ($("#caja-desde").value || "").slice(0, 10) || null; if (S.cajaDesde && S.cajaDesde > S.cajaHasta) [S.cajaDesde, S.cajaHasta] = [S.cajaHasta, S.cajaDesde]; render(); }
    else if (act === "caja-todo") { S.cajaDesde = null; S.cajaHasta = today; render(); }
    else if (act === "csv-concilia") { const cc = M.conciliacion(ctx(), S.cajaHasta || today, nn(S.app.saldoInicial), CAJA, undefined, S.cajaDesde || null); const rows = [["Pedido", "Fecha", "Shopify vendido", "Shopify devuelto", "Cobrado MP", "Comisión MP", "Retenciones", "Devoluciones", "Te entró (neto)", "Se libera", "Liberado", "Nota"]]; cc.filas.forEach((f) => rows.push([f.n, f.fecha, Math.round(f.vendido), Math.round(f.devShop), f.mp ? Math.round(f.cobrado) : "", f.mp ? Math.round(f.com) : "", f.mp ? Math.round(f.ret) : "", f.mp ? Math.round(f.dev) : "", f.mp ? Math.round(f.neto) : "", f.rel ? f.rel.slice(0, 10) : "", f.liberado ? "Sí" : "No", f.mp ? "" : f.transfer ? "Transferencia" : "Sin cobro en MP"])); download(`caja_${cc.desde}_a_${cc.hasta}.csv`, rows); }
    else if (act === "esc-save") { const nombre = ($("#esc-name").value || "").trim() || "Escenario " + (S.escenarios.length + 1); await db.collection("escenarios").doc().set({ nombre: nombre.slice(0, 80), v: calcState(), createdAt: new Date().toISOString() }); toast("Escenario guardado"); }
    else if (act === "calc-copy") { const v = calcState(), r = calcular(v), R = S.calcReg === "mono" ? r.mono : r.ri; await navigator.clipboard.writeText(`Precio ${ars(v.precio)} · CPA break even ${usd1(R.cpaBreakEvenUsd)} (${ars(R.cpaBreakEvenArs)}) · ROAS break ${x2(R.roasBreak)} · Utilidad ${ars(R.utilidadProm)} (${pct(R.margenProm)})`); toast("Copiado"); }
    else if (act === "dolarhoy" || act === "dolarhoy-cfg") {
      const v = Math.round(dolarArqHoy() || 0) || Math.round(Number((await fetch("https://criptoya.com/api/dolarapp/usdc/ars/1").then((x) => x.json())).totalAsk));
      if (!v) throw new Error("no llegó el dólar de ARQ");
      if (act === "dolarhoy") setCalc("tc", v); else { saveCostos({ dolar: v }); render(); }
      toast("Dólar ARQ: " + ars(v));
    }
    else if (act === "sh-save") {
      t.disabled = true; t.textContent = "Conectando…";
      const r = await api("/api/connect", { method: "POST", body: JSON.stringify({ which: "shopify", shop: $("#sh-shop").value, clientId: $("#sh-id").value, clientSecret: $("#sh-secret").value }) });
      toast("Conectada: " + r.name); S.editSh = false; await loadConn(); sync("shopify", { full: true });
    }
    else if (act === "me-save") {
      t.disabled = true; t.textContent = "Conectando…";
      const r = await api("/api/connect", { method: "POST", body: JSON.stringify({ which: "meta", token: $("#me-token").value, accounts: $("#me-acc").value }) });
      toast("Meta conectado: " + r.names.join(", ")); S.editMe = false; await loadConn(); sync("meta", { full: true });
    }
    else if (act === "sh-del" || act === "me-del" || act === "mp-del") {
      await api("/api/connect", { method: "DELETE", body: JSON.stringify({ which: { "sh-del": "shopify", "me-del": "meta", "mp-del": "mp" }[act] }) });
      toast("Desconectado"); loadConn();
    }
  } catch (err) {
    toast(err.message || String(err));
    if (act === "sh-save" || act === "me-save" || act === "mp-auth") render();
  }
});

let calcTimer = null;
function saveCalc() { clearTimeout(calcTimer); calcTimer = setTimeout(() => db.doc("config/calc").set(S.calcCur).catch(() => {}), 600); }
// Al tipear en la calculadora solo cambiamos los resultados, así no se mueve el cursor.
function refreshCalc() {
  const tmp = document.createElement("div");
  tmp.innerHTML = viewCalc();
  tmp.querySelectorAll("[data-out]").forEach((n) => {
    const cur = document.querySelector(`#view [data-out="${n.dataset.out}"]`);
    if (!cur) return;
    if (cur.tagName === "INPUT") cur.value = n.value; else cur.innerHTML = n.innerHTML;
  });
}
function setCalc(k, v) { S.calcCur = { ...calcState(), [k]: v }; S.calcTouched = true; saveCalc(); render(); }

document.addEventListener("input", (e) => {
  const t = e.target, d = t.dataset;
  if (d.calc) {
    let raw = t.value.trim().replace(/[$\s]/g, "");
    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");          // 1.670,5 → 1670.5
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");         // 1.670 → 1670
    const v = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(v)) return;
    S.calcCur = { ...calcState(), [d.calc]: v }; S.calcTouched = true; saveCalc(); refreshCalc();
  }
});
document.addEventListener("change", async (e) => {
  if (onFactChange(e)) return;
  const t = e.target, d = t.dataset;
  if (d.range) { S.preset = "custom"; S[d.range] = t.value; if (S.from > S.to) [S.from, S.to] = [S.to, S.from]; return render(); }
  if (d.gcat !== undefined) { S.gastosCat = t.value; return render(); }
  if (d.cost) { saveCostos({ [d.cost]: t.value === "" ? null : Number(t.value), ...(d.cost === "envioPedido" || d.cost === "armadoPedido" ? { envioOk: true } : {}) }); return; }
  if (d.costsel) { saveCostos({ [d.costsel]: t.value }); return; }
  if (d.cpaobj) { saveCostos({ cpaObjetivo: { ...cfg().cpaObjetivo, [d.cpaobj]: Number(t.value) || 0 } }); return; }
  if (d.fijo !== undefined) { const f = [...(cfg().fijos || [])]; f[Number(d.fijo)] = { ...f[Number(d.fijo)], [d.k]: d.k === "monto" ? Number(t.value) || 0 : t.value }; saveCostos({ fijos: f }); return; }
  if (d.stkcfg) {
    const prev = S.prods[d.stkcfg] || {};
    const v = t.type === "checkbox" ? t.checked : t.value === "" ? null : Number(t.value);
    const next = { ...prev, nombre: prev.nombre || (M.stockDetalle(ctx(), today).find((x) => x.pid === d.stkcfg) || {}).nombre || "", [d.k]: v };
    S.prods = { ...S.prods, [d.stkcfg]: next };
    await db.doc("prods/" + d.stkcfg).set(next); render(); return;
  }
  if (d.prod) {
    const prev = S.prods[d.prod] || {};
    const p = productosVistos().find((x) => x.pid === d.prod);
    const val = d.k === "costo" || d.k === "stock" ? (t.value === "" ? null : Number(t.value)) : d.k === "factura" ? t.value === "1" : t.value;
    const next = { ...prev, nombre: (p && p.titulo) || prev.nombre || "", [d.k]: val };
    if (d.k === "stock" && val != null && !next.stockFecha) next.stockFecha = today;
    S.prods = { ...S.prods, [d.prod]: next };
    await db.doc("prods/" + d.prod).set(next); return;
  }
  if (d.app) { await saveDoc("config/app", { ...S.app, [d.app]: Number(t.value) || 0 }); return; }
  if (d.appk) { const s = socios().slice(); s[d.appk === "socio0" ? 0 : 1] = t.value.trim() || s[d.appk === "socio0" ? 0 : 1]; await saveDoc("config/app", { ...S.app, socios: s }); return; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ============ arranque ============
(async function init() {
  render();
  db = await window.claude.use("db");
  const mpRet = new URLSearchParams(location.search).get("mp");
  if (mpRet) {
    const MSG = { ok: "Mercado Pago conectado en solo lectura. Trayendo tus cobros…", cancelado: "Cancelaste la autorización de Mercado Pago.", "tiene-write": "Mercado Pago dio un acceso con permiso de escritura y lo rechazamos. En tu aplicación de Mercado Pago dejá solo 'read' y 'offline_access' y autorizá de nuevo.", "sin-permisos": "Mercado Pago no informó permisos de lectura: no guardamos nada. Probá de nuevo.", vencido: "La autorización tardó demasiado. Probá de nuevo.", "estado-invalido": "La autorización no es válida. Probá de nuevo.", "falta-app": "Primero pegá el Client ID y el Client secret.", error: "Mercado Pago no dio el acceso. Revisá que la dirección de regreso esté bien cargada." };
    toast(MSG[mpRet] || "Mercado Pago: " + mpRet);
    S.view = "config"; S.cfgSub = "conexiones";
    history.replaceState(null, "", "/");
    if (mpRet === "ok") setTimeout(() => sync("mp", { full: true }), 500);
  }
  if (!db) { $("#view").innerHTML = '<div class="content"><p class="banner bad">No se pudo conectar con la base de datos. Recargá la página.</p></div>'; return; }
  subscribe();
  await Promise.all([loadData(), loadConn()]);
  const c = S.conn;
  const last = c && c.sync ? Math.max(...[c.sync.shopify, c.sync.meta, c.sync.mp].filter(Boolean).map((x) => Date.parse(x.at)), 0) : 0;
  if (c && (c.shopify.connected || c.meta.connected || (c.mp && c.mp.connected)) && Date.now() - last > 3600e3) sync();
  setInterval(() => { if (!document.hidden) loadData(); }, 5 * 60e3);
})();
