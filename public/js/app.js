import * as M from "./metrics.js";
import { calcular, cpaPotencial, CALC_DEFAULTS } from "./calc.js";

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
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

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
const cfg = () => M.costosCfg(S.costos);
const ctx = () => ({ orders: S.data.orders, ads: S.data.ads, meta: S.data.meta, pays: S.data.pays || [], costos: S.costos, prods: S.prods, gastos: S.gastos, movs: S.movs });
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
  ["dashboard", "Tu plata", "dash"], ["anuncios", "Anuncios", "ads"], ["caja", "Caja", "caja"],
  ["impuestos", "Impuestos", "imp"], ["socios", "Socios", "socios"], ["gastos", "Gastos", "gastos"],
  ["calculadora", "Calculadora", "calc"], ["config", "Configuración", "cfg"],
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
    const ult = S.data.orders.filter((o) => !o.t && M.dayOf(o.c) >= S.from && M.dayOf(o.c) <= S.to).sort((a, b) => b.c.localeCompare(a.c)).slice(0, S.sub === "ventas" ? 200 : 15);
    const E = { pagado: ["good", "Pagado"], pendiente: ["warn", "Pendiente"], vencido: ["bad", "Venció"], cancelado: ["bad", "Cancelado"], devuelto: ["bad", "Devuelto"] };
    h += block("ventas", "Últimas ventas", ult.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Estado</th><th>Fecha</th><th>Productos</th><th>Cobro</th><th class="r">Total</th><th class="r">Te quedó</th><th class="r">Neto %</th></tr></thead><tbody>
      ${ult.map((o) => { const st = M.estado(o); const k = M.costoPedido(o, cfg(), S.prods); const margen = st === "pagado" ? k.margen : 0; return `<tr><td>${esc(o.n)}</td><td><span class="tag ${E[st][0]}">${E[st][1]}</span></td><td>${new Date(o.c).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(o.li.filter((l) => l.cq > 0).map((l) => l.cq + "× " + l.ti).join(", ").slice(0, 60))}</td><td class="muted">${M.esTransferencia(o) ? "Transferencia" : "Mercado Pago"}</td><td class="r">${money(o.tot)}</td><td class="r">${st === "pagado" ? money(margen) : "–"}</td><td class="r">${st === "pagado" && k.venta ? pct(margen / k.venta, 0) : "–"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="actions" style="margin-top:8px"><button class="ctl" data-act="csv-orders">Exportar Excel (CSV)</button><span class="note">"Te quedó" es antes de anuncios y gastos fijos.</span></div>` : '<div class="card empty">Sin pedidos en estas fechas.</div>');
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
  const saldo = M.saldoCaja(c, today, nn(S.app.saldoInicial), CAJA);
  let h = `<div class="content" style="padding-top:14px">${banners()}<div class="cols"><div class="hero"><span class="muted">Los próximos 30 días <span class="tag">supuesto</span></span><span class="big ${cj.proy.neto < 0 ? "down" : ""}">${money(cj.proy.neto)}</span><p>te quedarían si vendés y gastás como en los últimos 14 días.</p><p class="muted small">Entraría ${money(cj.proy.entra)} · saldría ${money(cj.proy.sale)}</p></div>
    <div class="grid">${card({ label: "Caja hoy", tip: "Saldo inicial + lo cobrado (ya sin comisiones) + aportes − gastos que pagó la caja − anuncios − retiros.", value: money(saldo), tone: saldo < 0 ? "bad" : "", src: "mix" })}${card({ label: "Esta semana", value: money(cj.semanas[0].neto), sub: `Entró ${money(cj.semanas[0].entro)} · salió ${money(cj.semanas[0].salio)}`, src: "mix" })}${(() => { const lib = M.mpALiberar(S.data.pays); return lib ? card({ label: "Por liberar en Mercado Pago", tip: "Cobros aprobados que Mercado Pago todavía no te liberó. Entran a la caja el día que se liberan.", value: money(lib.total), sub: lib.porDia.length ? lib.porDia.slice(0, 3).map((x) => `${shortDate(x.d)}: ${money(x.v)}`).join(" · ") : "nada pendiente", src: "mix" }) : ""; })()}</div></div>`;
  h += block("semanas", "Semana por semana", `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Semana</th><th class="r">Ventas cobradas</th><th class="r">Comisiones</th><th class="r">Aportes</th><th class="r">Gastos de la caja</th><th class="r">Anuncios</th><th class="r">Retiros</th><th class="r">Neto</th></tr></thead><tbody>
    ${cj.semanas.map((w, i) => `<tr><td>${i === 0 ? "Esta semana" : i === 1 ? "La semana pasada" : shortDate(w.desde) + " al " + shortDate(w.hasta)}</td><td class="r">${money(w.det.ventas)}</td><td class="r">${w.det.comisiones ? "−" + money(w.det.comisiones) : "–"}</td><td class="r">${w.det.aportes ? money(w.det.aportes) : "–"}</td><td class="r">${w.det.gastos ? "−" + money(w.det.gastos) : "–"}</td><td class="r">${w.det.anuncios ? "−" + money(w.det.anuncios) : "–"}</td><td class="r">${w.det.retiros ? "−" + money(w.det.retiros) : "–"}</td><td class="r ${w.neto < 0 ? "down" : "up"}"><b>${money(w.neto)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">Cómo se arma: entra ${S.data.pays && S.data.pays.length ? "lo que Mercado Pago te libera (neto, el día que se libera) y las ventas por transferencia" : "lo que cobrás en Shopify (suponiendo que Mercado Pago acredita al toque) ya sin comisiones"}, más los aportes. Sale lo que pagó la caja (gastos cargados con "pagó: ${CAJA}"), los anuncios de Meta${cfg().metaPaga === "Caja" ? "" : " (no: los paga " + esc(cfg().metaPaga) + ")"} y los retiros. Los impuestos no salen acá hasta que los cargues como gasto cuando los pagás.</p>`);
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
    ["IVA de venta (21 % contenido)", t.debitoTotal, "Ventas ÷ 1,21 × 0,21."],
    [`Beneficio de IVA (${nn(cfg().beneficioIva)} %)`, -t.beneficio, "La parte del IVA de venta que no pagás por el beneficio."],
    ["IVA de venta que pagás", t.debito, ""],
    ["IVA de comisiones (Mercado Pago + Shopify)", -t.creditoComisiones, "Te lo facturan: lo descontás."],
    ["IVA de gastos con Factura A", -t.creditoGastos, "Sale de los gastos que cargaste con Factura A en este mes."],
    ["IVA a pagar", t.ivaPagar, t.ivaPagar < 0 ? "Negativo = saldo a favor para el mes que viene." : ""],
  ] : [["Ventas del mes", t.ventas, ""], ["IVA", 0, "En monotributo no pagás IVA aparte: va en la cuota."]];
  h += block("iva", "IVA · " + monthName(S.impMes), `<div class="tbl-wrap"><table class="tbl"><tbody>${rows.map(([l, v, n], i) => `<tr${i === rows.length - 1 ? ' style="font-weight:600"' : ""}><td>${esc(l)}${n ? ` <span class="muted small">· ${esc(n)}</span>` : ""}</td><td class="r">${money(v)}</td></tr>`).join("")}</tbody></table></div>`);
  if (t.retencionesMp != null) h += `<p class="banner info">Mercado Pago te retuvo <b>${money(t.retencionesMp)}</b> de impuestos este mes. Son pagos a cuenta (IIBB, IVA o Ganancias): pasáselo a tu contador para que los descuente. El detalle está en Mercado Pago → Tu negocio → Impuestos.</p>`;
  h += block("otros", "Ingresos brutos y Ganancias", `<div class="grid">${card({ label: "Ingresos brutos", tip: `${nn(cfg().iibbPct)} % sobre las ventas.`, value: money(t.iibb), src: "mix" })}${card({ label: "Ganancia del mes", tip: "La del dashboard: ya descuenta IVA e IIBB.", value: money(t.gananciaAntes), tone: t.gananciaAntes < 0 ? "bad" : "", src: "mix" })}${card({ label: "Provisión de Ganancias", tip: `${nn(cfg().ganPct)} % de la ganancia, para guardar. Es una estimación: el número final lo calcula tu contador en la declaración anual.`, value: money(t.ganancias), src: "mix" })}${card({ label: "Ganancia neta", tip: "Ganancia menos la provisión de Ganancias. Es la que se reparte entre los socios.", value: money(t.gananciaNeta), tone: t.gananciaNeta < 0 ? "bad" : "good", src: "mix" })}</div>
    <p class="note" style="margin-top:8px">El dashboard estima el IVA pedido por pedido (con el envío y lo que te facturan según la configuración: ${money(t.estimadoEnDashboard)} este mes). Esta pantalla usa los gastos con Factura A que cargaste de verdad, así que es la que va para el contador.</p>`);
  return h + "</div>";
}

// ---------- Socios ----------
function viewSocios() {
  const R = { mes: [today.slice(0, 8) + "01", today, "Este mes"], mespasado: [...rangeOf("mespasado"), "Mes pasado"], anio: [today.slice(0, 4) + "-01-01", today, "Este año"], todo: ["2020-01-01", today, "Desde el principio"] };
  const [f, t, label] = R[S.sociosR];
  const so = M.socios(ctx(), f, t, socios(), CAJA);
  let h = `<div class="bar2"><div class="chips">${Object.entries(R).map(([k, v]) => `<button class="chip" data-socr="${k}" aria-pressed="${S.sociosR === k}">${v[2]}</button>`).join("")}</div><button class="ctl pri" data-open="mov">+ Aporte o retiro</button></div><div class="content">`;
  h += block("reparto", "Reparto de la ganancia neta · " + label, `<div class="grid">${card({ label: "Ganancia", value: money(so.ganancia), tone: so.ganancia < 0 ? "bad" : "", src: "mix" })}${card({ label: "Provisión de Ganancias", tip: `${nn(cfg().ganPct)} % de la ganancia: queda en la caja para pagar el impuesto.`, value: money(so.ganancias), src: "mix" })}${card({ label: "Ganancia neta a repartir", value: money(so.neta), tone: so.neta < 0 ? "bad" : "good", src: "mix" })}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Socio</th><th class="r">%</th><th class="r">Le corresponde</th><th class="r">Gastos que pagó</th><th class="r">Aportes</th><th class="r">Retiros</th><th class="r">Saldo a su favor</th></tr></thead><tbody>
    ${so.filas.map((x) => `<tr><td>${esc(x.socio)}</td><td class="r">${int(x.pct)} %</td><td class="r">${money(x.corresponde)}</td><td class="r">${money(x.pusoGastos)}</td><td class="r">${money(x.aportes)}</td><td class="r">${x.retiros ? "−" + money(x.retiros) : money(0)}</td><td class="r"><b class="${x.saldo < 0 ? "down" : ""}">${money(x.saldo)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">Saldo a su favor = lo que puso (gastos de su bolsillo + aportes) + su parte de la ganancia neta − lo que ya retiró. Es lo que puede retirar sin desbalancear la sociedad. El reparto (${int(cfg().repartoPct)} / ${int(100 - nn(cfg().repartoPct))}) se cambia en Configuración → General.</p>`);
  const movs = S.movs.filter((m) => m.fecha >= f && m.fecha <= t).sort((a, b) => b.fecha.localeCompare(a.fecha));
  h += block("movs", "Aportes y retiros", movs.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${movs.map((m) => `<tr class="click" data-open="mov" data-id="${esc(m.id)}"><td>${esc(longDate(m.fecha))}</td><td>${m.tipo === "retiro" ? "Retiro" : "Aporte"} de ${esc(m.socio)}</td><td class="muted">${esc(m.nota || "")}</td><td class="r ${m.tipo === "retiro" ? "down" : "up"}">${m.tipo === "retiro" ? "−" : "+"}${money(m.monto)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="card empty">Sin aportes ni retiros en estas fechas.</div>');
  return h + "</div>";
}

// ---------- Gastos ----------
function viewGastos() {
  const list = S.gastos.filter((g) => g.fecha.startsWith(S.gastosMes) && (!S.gastosCat || catOf(g).id === S.gastosCat)).sort((a, b) => b.fecha.localeCompare(a.fecha));
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
    ${list.map((g) => `<tr class="click" data-open="gasto" data-id="${esc(g.id)}"><td>${esc(g.fecha.slice(8))}/${esc(g.fecha.slice(5, 7))}</td><td>${esc(g.concepto || catOf(g).name)} ${g.cuota ? `<span class="tag warn">Cuota ${g.cuota.i}/${g.cuota.n}</span>` : ""}${g.facturaA ? '<span class="tag">Fact. A</span>' : ""}${g.recurrente ? '<span class="tag">Mensual</span>' : ""}</td><td><span class="dot" style="background:${esc(catOf(g).color)}"></span>${esc(catOf(g).name)}</td><td>${esc(g.quien || "")}</td><td class="muted">${esc(g.pago || "")}</td><td class="r">${money(g.monto)}${g.moneda === "USD" ? `<div class="muted small">${usd(g.montoOrig)} · TC ${int(g.tc)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="card empty">Sin gastos en ${esc(monthName(S.gastosMes).toLowerCase())}.</div>`;
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
  const seg = (k, a, b) => `<div class="seg" style="width:100%"><button data-calcb="${k}" data-val="1" aria-pressed="${!!v[k]}">${a}</button><button data-calcb="${k}" data-val="0" aria-pressed="${!v[k]}">${b}</button></div>`;
  const inp = (k, pre, step = "1") => `<div class="prefix${pre.length > 2 ? " w" : ""}"><em>${pre}</em><input class="in" type="text" inputmode="decimal" data-calc="${k}" value="${esc(String(v[k]).replace(".", ","))}"></div>`;
  let o = 0;
  const f = (label, t, body, small) => `<label class="f"><span>${label} ${tip(t)}</span>${body.replace('<input class="in ro"', `<input data-out="${o++}" class="in ro"`)}${small ? `<small data-out="${o++}">${small}</small>` : ""}</label>`;
  const pot = cpaPotencial(v.cpaCliente ?? 0.5, v.cantClientes ?? 2500);
  let h = `<div class="content" style="padding-top:14px"><div><h2 style="margin:0;font-size:22px">Calculadora de costos</h2><p class="note">La planilla de la clase «Roas Breakeven», con los mismos campos y las mismas cuentas. Cargás tus costos una vez, cambiás el precio y te dice cuánto te queda, tu CPA break even y tu ROAS break even.</p></div>
  <div class="calc"><div style="display:grid;gap:12px">
  <div class="card"><div class="form">${f("T.C. USD", "El dólar de hoy: pasa el CPA a pesos.", inp("tc", "$"), `<a href="#" data-act="dolarhoy">Usar el dólar tarjeta de hoy</a>`)}${f("Transferencia bancaria 10%", "¿Tu tienda cobra por transferencia con 10 % off?", seg("transferencia", "Sí", "No"))}</div></div>
  <div class="card"><h3>Tus costos</h3><div class="form">
    ${f("Costo producto", "Lo que te cobra el fabricante por lo que lleva la venta.", inp("costoProducto", "$"))}
    ${f("IVA compra producto", "¿Te da factura? Réplicas y sin factura: No.", seg("ivaProducto", "Sí", "No"), ars(r.iva.productoSiTuviera))}
    ${f("Insumos / fulfillment", "Caja, etiqueta y armado de cada pedido.", inp("insumos", "$"))}
    ${f("IVA empaquetaje", "En la planilla de Lauty va vacío (No).", seg("ivaInsumos", "Sí", "No"), ars(r.iva.empaquetajeSiTuviera))}
    ${f("Envío", "Lo que pagás de envío por pedido.", inp("envio", "$"))}
    ${f("IVA envío 21%", "Sale solo: los envíos siempre facturan.", `<input class="in ro" readonly value="${ars(r.iva.envio)}">`)}
    ${f("CPA objetivo", "Lo que esperás pagarle a Meta por venta.", inp("cpaUsd", "US$", "0.1"))}
    ${f("CPA objetivo en pesos", "CPA objetivo × T.C. USD.", `<input class="in ro" readonly value="${ars(r.cpaArs)}">`)}
    ${f("Comisiones Mercado Pago / TN-Shopify", "Mercado Pago + la plataforma, en 3 cuotas.", inp("comision", "%", "0.1"))}
    ${f("IIBB", "Ingresos brutos, sobre el precio.", inp("iibb", "%", "0.1"))}
    ${f("Total costos", "Producto + envío + CPA + comisiones + insumos + IIBB.", `<input class="in ro" readonly value="${ars(r.totalCostos)}">`)}
    ${f("% facturado", "Solo RI/SA: la parte del IVA de venta que cuenta.", inp("facturado", "%", "1"))}
    ${f("Precio producto", "Lo que paga el cliente. Es la que más vas a tocar.", inp("precio", "$", "100"))}
  </div></div>
  <div class="card"><h3>CPA por cliente potencial</h3><p class="note">Si cada cliente potencial te sale tanto y compra 1 de cada 10, cuánto te sale cada venta. El CPA sale en la misma moneda que pongas.</p><div class="form" style="margin-top:8px">
    ${f("CPA cliente potencial", "", `<input class="in" type="text" inputmode="decimal" data-calc="cpaCliente" value="${esc(String(v.cpaCliente ?? 0.5).replace(".", ","))}">`)}${f("Cantidad clientes", "", `<input class="in" type="text" inputmode="decimal" data-calc="cantClientes" value="${esc(v.cantClientes ?? 2500)}">`)}
  </div><table class="tbl" style="margin-top:8px" data-out="pot"><tr><td>Inversión</td><td class="r">${int(pot.inversion)}</td></tr><tr><td>10 % de conversión</td><td class="r">${int(pot.ventas)}</td></tr><tr><td><b>CPA</b></td><td class="r"><b>${x2(pot.cpa)}</b></td></tr></table></div>
  </div>
  <div class="res card" style="display:grid;gap:12px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Lo que te queda</h3><div class="seg"><button data-calcreg="mono" aria-pressed="${mono}">Monotributo</button><button data-calcreg="ri" aria-pressed="${!mono}">RI / SA</button></div></div>
    <div data-out="res" style="display:grid;gap:12px"><div class="be"><div><div class="k">CPA break even USD</div><div class="big">${usd1(R.cpaBreakEvenUsd)}</div><div class="k">${ars(R.cpaBreakEvenArs)}</div></div><div><div class="k">ROAS break</div><div class="big2">${x2(R.roasBreak)}</div><div class="k">Debajo de esto, perdés</div></div>
    <p>Con un CPA de <b>${usd1(v.cpaUsd)}</b> te quedan <b>${ars(R.utilidadProm)}</b> por venta (${pct(R.margenProm)}). Si pagás más de <b>${usd1(R.cpaBreakEvenUsd)}</b> por venta, perdés.</p></div>
    <table class="tbl"><thead><tr><th></th><th class="r" style="color:${mono ? "" : "var(--pink)"}">RI/SA</th><th class="r" style="color:${mono ? "var(--pink)" : ""}">Monotributo</th></tr></thead><tbody>
    ${[["Total IVA compra", ars(r.ri.totalIvaCompra), "—"], ["Total IVA venta", ars(r.ri.totalIvaVenta), "—"], ["IVA a abonar", ars(r.ri.ivaAAbonar), "—"], ["Utilidad prom. (descontando IVA)", ars(r.ri.utilidadProm), ars(r.mono.utilidadProm)], ["Promedio (margen)", pct(r.ri.margenProm), pct(r.mono.margenProm)], ["CPA break even USD", usd1(r.ri.cpaBreakEvenUsd), usd1(r.mono.cpaBreakEvenUsd)], ["CPA break even ARS", ars(r.ri.cpaBreakEvenArs), ars(r.mono.cpaBreakEvenArs)], ["ROAS break", x2(r.ri.roasBreak), x2(r.mono.roasBreak)]].map(([a, b, c]) => `<tr><td>${a}</td><td class="r">${b}</td><td class="r">${c}</td></tr>`).join("")}
    </tbody></table>
    <details><summary class="muted small" style="cursor:pointer">Ver la cuenta completa (las filas ocultas de la planilla)</summary><table class="tbl" style="margin-top:6px">
    ${[["Utilidad min (cuotas)", ars(r.ri.utilidadMin), ars(r.mono.utilidadMin)], ["Utilidad max (transfer)", ars(r.ri.utilidadMax), ars(r.mono.utilidadMax)], ["Margen min. (cuotas)", pct(r.ri.margenMin), pct(r.mono.margenMin)], ["Margen max. (transfer)", pct(r.ri.margenMax), pct(r.mono.margenMax)], ["IVA comisiones", ars(r.iva.comisiones), "—"], ["Precio sugerido", "—", ars(r.mono.precioSugerido)]].map(([a, b, c]) => `<tr><td>${a}</td><td class="r">${b}</td><td class="r">${c}</td></tr>`).join("")}</table></details></div>
    <div class="actions"><input class="in" style="flex:1;min-width:160px" placeholder="Nombre del escenario" id="esc-name"><button class="ctl pri" data-act="esc-save">Guardar</button><button class="ctl" data-act="calc-copy">Copiar resultado</button></div>
    ${S.escenarios.length ? `<div style="display:grid;gap:6px">${S.escenarios.map((e) => { const rr = calcular(e.v); const RR = mono ? rr.mono : rr.ri; return `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid var(--n690);border-radius:8px;padding:8px 10px"><button class="ctl" style="border:0;background:none;text-align:left;padding:0" data-esc="${esc(e.id)}"><b>${esc(e.nombre)}</b><div class="muted small">${ars(e.v.precio)} · CPA break even ${usd1(RR.cpaBreakEvenUsd)} · ROAS ${x2(RR.roasBreak)}</div></button><button class="ctl" data-escdel="${esc(e.id)}">Borrar</button></div>`; }).join("")}</div>` : ""}
  </div></div></div>`;
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
    // ----- Mercado Pago -----
    const mp = cn.mp || {};
    const lastP = when(cn.sync && cn.sync.mp);
    h += `</div><div class="card" style="display:grid;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">3 · Mercado Pago</h3>${estado(mp, "Conectado")}</div>`;
    if (mp.connected && !S.editMp) {
      h += `<p style="margin:0">${mp.error ? `<span class="down">${esc(mp.error)}</span>` : `Leyendo los cobros de <b>${esc(mp.name || "tu cuenta")}</b>${lastP ? ` · última actualización ${esc(lastP)}` : ""}. El resumen usa la comisión real, separa las retenciones y la caja cuenta la plata cuando se libera.`}</p>
        <div class="actions"><button class="ctl" data-act="sync" ${S.syncing ? "disabled" : ""}>${S.syncing ? "Actualizando…" : "↻ Actualizar ahora"}</button><button class="ctl" data-act="edit-mp">Cambiar el token</button><button class="ctl" data-act="mp-del">Desconectar</button></div>`;
    } else {
      h += `<p class="note">Sirve para tener la <b>comisión real</b> de cada cobro (en vez del % estimado), las <b>retenciones</b> de impuestos y <b>cuándo te liberan la plata</b>.</p><div class="steps">
        ${step(1, "Creá una aplicación en Mercado Pago <span class='muted'>(una sola vez)</span>", `${ext("https://www.mercadopago.com.ar/developers/panel/app", "Abrir Mercado Pago Developers")}<div>Entrá con la cuenta que cobra las ventas de Impoluto → <b>Crear aplicación</b>. Nombre: ${copy("Impoluto Numeros")}. Tipo: <b>Pagos online</b> → plataforma <b>Shopify</b> (o la opción que te ofrezca). Aceptá y creala.</div>`)}
        ${step(2, "Copiá el Access Token de producción", `<div>Dentro de la app: <b>Credenciales de producción</b> (si te pide activarlas, completá rubro y sitio web ${copy("https://impolutocar.com")}). Copiá el <b>Access Token</b>: empieza con <code>APP_USR-</code>.</div>`)}
        ${step(3, "Pegalo acá", `<div class="form"><label class="f"><span>Access Token</span><input class="in" id="mp-token" type="password" autocomplete="off" placeholder="APP_USR-…"><small>Mercado Pago no tiene tokens de solo lectura: la app lo usa solo para leer cobros, nunca para cobrar ni devolver. Lo guardamos bajo llave.</small></label></div>
          <div class="actions"><button class="ctl pri" data-act="mp-save">Conectar Mercado Pago</button>${mp.connected ? '<button class="ctl" data-act="edit-mp">Cancelar</button>' : ""}</div>`)}
      </div>`;
    }
    h += `</div><p class="note">Se actualiza sola todos los días a las 6 de la mañana y cada vez que abrís la app (si pasó más de una hora).${cn.cron ? "" : " Falta la variable CRON_SECRET en Vercel para la actualización diaria."} <a href="#" data-act="sync-full">Volver a traer los últimos 60 días</a></p>`;
  }
  if (S.cfgSub === "costos") {
    h += `<div class="card"><h3>Tu dólar</h3><div class="form">${num("dolar", "$", "1", "Dólar para pasar el gasto de Meta y el CPA", '<a href="#" data-act="dolarhoy-cfg">Usar el dólar tarjeta de hoy</a>')}${num("recargoAds", "%", "0.1", "Recargo sobre el gasto en Meta", "Impuestos o percepciones de la tarjeta sobre Meta. 0 si no tenés.")}</div></div>
    <div class="card"><h3>Lo que te cuesta cada pedido</h3><div class="form">${num("envioPedido", "$", "1", "Envío que pagás vos", "0 si lo paga el cliente.")}${num("armadoPedido", "$", "1", "Armado y caja", "Caja, etiqueta, depósito.")}</div><p class="note" style="margin-top:8px">El costo de cada producto se carga en la pestaña Productos.</p></div>
    <div class="card"><h3>Lo que se queda cada cobro</h3><div class="form">
      ${yn("mpCuotas", "¿Ofrecés cuotas sin interés?")}
      ${num("mpPctCuotas", "%", "0.1", "Mercado Pago con cuotas", "Con 3 cuotas sin interés suele ser 17 %.")}
      ${num("mpPctSin", "%", "0.1", "Mercado Pago sin cuotas", "Sin cuotas, 7 %. Fijate el tuyo en Mercado Pago › Tu negocio › Costos y cuotas.")}
      ${(() => { const rr = M.mpCobros(S.data.pays, M.addDays(today, -29), today); return rr && rr.monto ? `<p class="banner info" style="grid-column:1/-1">Con Mercado Pago conectado, el resumen usa la comisión real. En los últimos 30 días fue <b>${pct(rr.pct)}</b> (${int(rr.cuotas)} de ${int(rr.n)} cobros en cuotas). Estos % se siguen usando para las ofertas y la calculadora.</p>` : ""; })()}
      <label class="f"><span>¿En qué ofertas hay cuotas?</span><div class="seg" style="width:100%">${[[1, "En todas"], [2, "Desde la 2"], [3, "Desde la 3"]].map(([v, l]) => `<button data-costv="mpDesde" data-val="${v}" aria-pressed="${nn(c.mpDesde) === v}">${l}</button>`).join("")}</div></label>
      ${num("shopifyPct", "%", "0.1", "Shopify", "Lo que se queda por cada venta.")}
      ${num("iibbPct", "%", "0.1", "Ingresos brutos", "El impuesto de tu provincia por vender.")}
    </div><p class="note" style="margin-top:8px">Los pedidos pagados por transferencia no pagan Mercado Pago.</p></div>
    <div class="card"><h3>¿Cómo facturás?</h3><div class="form">
      <label class="f"><span>Régimen</span><div class="seg" style="width:100%">${[["mono", "Monotributo"], ["ri", "Resp. inscripto"], ["sa", "Sociedad"]].map(([v, l]) => `<button data-costv="regimen" data-val="${v}" aria-pressed="${c.regimen === v}">${l}</button>`).join("")}</div></label>
      ${num("beneficioIva", "%", "1", "Beneficio del IVA", "Si ya no lo tenés, 0. Pagás el resto del IVA de venta.")}
      ${yn("provFactura", "¿Tu proveedor te da factura?")}
      ${yn("armadoFactura", "¿El armado (fulfillment) te da factura?")}
      ${num("ganPct", "%", "0.5", "Provisión de Ganancias", "Sobre la ganancia, para guardar.")}
    </div></div>
    <div class="card"><h3>CPA objetivo por oferta</h3><p class="note">Lo que querés pagarle a Meta por venta en cada oferta (Lauty pide 16, 18 y 20).</p><div class="form" style="margin-top:8px">${[1, 2, 3].map((k) => `<label class="f"><span>Oferta ${k}${k === 3 ? " o más" : ""}</span><div class="prefix w"><em>US$</em><input class="in" type="number" step="0.5" data-cpaobj="${k}" value="${esc(c.cpaObjetivo[k])}"></div></label>`).join("")}</div></div>`;
  }
  if (S.cfgSub === "productos") {
    const ps = productosVistos();
    const st = M.stock(ctx(), today);
    h += ps.length ? `<p class="note">Los productos salen solos de tus ventas de Shopify. Cargá cuánto te cuesta cada unidad (lo que le pagás al proveedor). "Agregado" es un upsell, order bump o seguro de envío: no paga envío ni anuncio aparte.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Vendidas</th><th>Costo por unidad</th><th>Tipo</th><th>Palabra de la campaña ${tip("Si el nombre de la campaña de Meta tiene esta palabra, sus anuncios se le asignan a este producto.")}</th><th>Stock ${tip("Cuántas unidades tenías en esa fecha. Descontamos solas las que se venden después.")}</th><th>Desde</th><th class="r">Te alcanza</th></tr></thead><tbody>
      ${ps.map((p) => { const pc = S.prods[p.pid] || {}; const s = st.find((x) => x.pid === p.pid); return `<tr><td style="white-space:normal;min-width:180px">${esc(p.titulo)}</td><td class="r">${int(p.unidades)}</td>
      <td><div class="prefix" style="width:130px"><em>$</em><input class="in" type="number" data-prod="${esc(p.pid)}" data-k="costo" value="${esc(pc.costo ?? "")}"></div></td>
      <td><select class="in" style="width:130px" data-prod="${esc(p.pid)}" data-k="tipo">${[["principal", "Principal"], ["agregado", "Agregado"], ["digital", "Digital (sin envío)"]].map(([v, l]) => `<option value="${v}" ${(pc.tipo || "principal") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><input class="in" style="width:130px" data-prod="${esc(p.pid)}" data-k="clave" value="${esc(pc.clave ?? "")}" placeholder="ej: impoluto"></td>
      <td><input class="in" style="width:90px" type="number" data-prod="${esc(p.pid)}" data-k="stock" value="${esc(pc.stock ?? "")}"></td>
      <td><input class="in" style="width:140px" type="date" data-prod="${esc(p.pid)}" data-k="stockFecha" value="${esc(pc.stockFecha ?? "")}"></td>
      <td class="r">${s ? `${int(s.actual)} u.${s.dias != null ? ` · <span class="${s.dias < 7 ? "down" : ""}">${int(s.dias)} días</span>` : ""}` : "–"}</td></tr>`; }).join("")}</tbody></table></div>` : '<div class="card empty">Cuando conectes Shopify y entren ventas, acá aparecen tus productos para cargarles el costo.</div>';
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
  const rows = [["Concepto", "Monto"], ["Ventas con IVA", t.ventas], ["IVA de venta total", t.debitoTotal], ["Beneficio de IVA", t.beneficio], ["IVA de venta a pagar", t.debito], ["IVA comisiones (MP + Shopify)", t.creditoComisiones], ["IVA gastos con Factura A", t.creditoGastos], ["IVA a pagar", t.ivaPagar], ["Ingresos brutos", t.iibb], ["Ganancia del mes", t.gananciaAntes], ["Provisión Ganancias", t.ganancias]].map((r) => [r[0], typeof r[1] === "number" ? Math.round(r[1]) : r[1]]);
  rows.push([], ["Gastos del mes con Factura A"], ["Fecha", "Concepto", "Proveedor", "Monto", "IVA"]);
  S.gastos.filter((g) => g.fecha.startsWith(S.impMes) && g.facturaA).forEach((g) => rows.push([g.fecha, g.concepto || catOf(g).name, g.proveedor || "", Math.round(g.monto), Math.round(g.monto - g.monto / 1.21)]));
  download(`impuestos_${S.impMes}.csv`, rows);
}
function csvGastos() {
  const rows = [["Fecha", "Concepto", "Categoría", "Monto ARS", "Moneda", "Monto original", "Dólar", "Pagó", "Medio", "Proveedor", "Factura A", "Mensual", "Notas"]];
  S.gastos.filter((g) => g.fecha.startsWith(S.gastosMes)).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((g) => rows.push([g.fecha, g.concepto || "", catOf(g).name, Math.round(g.monto), g.moneda || "ARS", g.montoOrig ?? g.monto, g.tc || "", g.quien || "", g.pago || "", g.proveedor || "", g.facturaA ? "Sí" : "", g.recurrente ? "Sí" : "", g.notas || ""]));
  download(`gastos_${S.gastosMes}.csv`, rows);
}

// ============ render ============
function render() {
  const a = document.activeElement;
  if (a && a.matches && a.matches("#view input, #view select") && a.type !== "checkbox") return void (S.dirty = true);
  S.dirty = false;
  const scroll = window.scrollY;
  $("#side").innerHTML = sideHTML();
  $("#topr").innerHTML = topRight();
  const V = { dashboard: viewDashboard, anuncios: viewAnuncios, caja: viewCaja, impuestos: viewImpuestos, socios: viewSocios, gastos: viewGastos, calculadora: viewCalc, config: viewConfig };
  $("#title").textContent = (VIEWS.find((v) => v[0] === S.view) || VIEWS[0])[1];
  // Lo que el usuario está escribiendo en un formulario no se borra cuando la pantalla se actualiza sola.
  const kept = {};
  document.querySelectorAll("#view input[id], #modal input[id]").forEach((i) => { if (i.type !== "checkbox" && i.value) kept[i.id] = i.value; });
  try { $("#view").innerHTML = (V[S.view] || viewDashboard)(); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="content"><p class="banner bad">Algo falló al armar esta pantalla: ${esc(e.message)}</p></div>`; }
  for (const [id, v] of Object.entries(kept)) { const el = document.getElementById(id); if (el && el.closest("#view") && el.value !== v && !el.readOnly) el.value = v; }
  window.scrollTo(0, scroll);
}
document.addEventListener("focusout", () => setTimeout(() => { if (S.dirty) render(); }, 0));

// ============ eventos ============
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-nav],[data-sub],[data-preset],[data-cur],[data-act],[data-open],[data-adsdays],[data-adsgroup],[data-impmes],[data-socr],[data-gmes],[data-cfgsub],[data-calcb],[data-calcreg],[data-esc],[data-escdel],[data-costb],[data-costv],[data-fijoadd],[data-fijodel]");
  const cp = e.target.closest("[data-copy]");
  if (cp) { e.preventDefault(); navigator.clipboard.writeText(cp.dataset.copy).then(() => toast("Copiado"), () => toast("No se pudo copiar")); return; }
  if (!t) return;
  if ((t.tagName === "A" && !t.target) || t.dataset.act || t.dataset.nav) e.preventDefault();
  const d = t.dataset;
  if (d.nav) { S.view = d.nav; localStorage.setItem("imp_view", S.view); if (d.cfgsub) S.cfgSub = d.cfgsub; window.scrollTo(0, 0); return render(); }
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
  if (d.costv) { saveCostos({ [d.costv]: isNaN(Number(d.val)) ? d.val : Number(d.val) }); return render(); }
  if (d.fijoadd !== undefined) { saveCostos({ fijos: [...(cfg().fijos || []), { nombre: d.fijoadd || "Otro", monto: 0 }] }); return render(); }
  if (d.fijodel !== undefined) { const f = [...(cfg().fijos || [])]; f.splice(Number(d.fijodel), 1); saveCostos({ fijos: f }); return render(); }
  if (d.esc) { const s = S.escenarios.find((x) => x.id === d.esc); if (s) { S.calcCur = { ...s.v }; S.calcTouched = true; saveCalc(); render(); } return; }
  if (d.escdel) { await db.doc("escenarios/" + d.escdel).delete(); return; }
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
    else if (act === "mp-save") {
      t.disabled = true; t.textContent = "Conectando…";
      const r = await api("/api/connect", { method: "POST", body: JSON.stringify({ which: "mp", token: $("#mp-token").value }) });
      toast("Mercado Pago conectado: " + r.name); S.editMp = false; await loadConn(); sync("mp", { full: true });
    }
    else if (act === "sync-full") sync("all", { full: true, days: 60 });
    else if (act === "g-save") await saveGasto(d.id);
    else if (act === "g-del") { await db.doc("gastos/" + d.id).delete(); closeModal(); toast("Gasto eliminado"); }
    else if (act === "m-save") await saveMov(d.id);
    else if (act === "m-del") { await db.doc("movimientos/" + d.id).delete(); closeModal(); toast("Eliminado"); }
    else if (act === "csv-orders") csvOrders();
    else if (act === "csv-imp") csvImp();
    else if (act === "csv-g") csvGastos();
    else if (act === "esc-save") { const nombre = ($("#esc-name").value || "").trim() || "Escenario " + (S.escenarios.length + 1); await db.collection("escenarios").doc().set({ nombre: nombre.slice(0, 80), v: calcState(), createdAt: new Date().toISOString() }); toast("Escenario guardado"); }
    else if (act === "calc-copy") { const v = calcState(), r = calcular(v), R = S.calcReg === "mono" ? r.mono : r.ri; await navigator.clipboard.writeText(`Precio ${ars(v.precio)} · CPA break even ${usd1(R.cpaBreakEvenUsd)} (${ars(R.cpaBreakEvenArs)}) · ROAS break ${x2(R.roasBreak)} · Utilidad ${ars(R.utilidadProm)} (${pct(R.margenProm)})`); toast("Copiado"); }
    else if (act === "dolarhoy" || act === "dolarhoy-cfg") {
      const r = await fetch("https://dolarapi.com/v1/dolares/tarjeta").then((x) => x.json());
      const v = Math.round(Number(r.venta));
      if (!v) throw new Error("no llegó el dólar");
      if (act === "dolarhoy") setCalc("tc", v); else { saveCostos({ dolar: v }); render(); }
      toast("Dólar tarjeta: " + ars(v));
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
    if (act === "sh-save" || act === "me-save" || act === "mp-save") render();
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
  const t = e.target, d = t.dataset;
  if (d.range) { S.preset = "custom"; S[d.range] = t.value; if (S.from > S.to) [S.from, S.to] = [S.to, S.from]; return render(); }
  if (d.gcat !== undefined) { S.gastosCat = t.value; return render(); }
  if (d.cost) { saveCostos({ [d.cost]: t.value === "" ? null : Number(t.value), ...(d.cost === "envioPedido" || d.cost === "armadoPedido" ? { envioOk: true } : {}) }); return; }
  if (d.costsel) { saveCostos({ [d.costsel]: t.value }); return; }
  if (d.cpaobj) { saveCostos({ cpaObjetivo: { ...cfg().cpaObjetivo, [d.cpaobj]: Number(t.value) || 0 } }); return; }
  if (d.fijo !== undefined) { const f = [...(cfg().fijos || [])]; f[Number(d.fijo)] = { ...f[Number(d.fijo)], [d.k]: d.k === "monto" ? Number(t.value) || 0 : t.value }; saveCostos({ fijos: f }); return; }
  if (d.prod) {
    const prev = S.prods[d.prod] || {};
    const p = productosVistos().find((x) => x.pid === d.prod);
    const val = d.k === "costo" || d.k === "stock" ? (t.value === "" ? null : Number(t.value)) : t.value;
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
  if (!db) { $("#view").innerHTML = '<div class="content"><p class="banner bad">No se pudo conectar con la base de datos. Recargá la página.</p></div>'; return; }
  subscribe();
  await Promise.all([loadData(), loadConn()]);
  const c = S.conn;
  const last = c && c.sync ? Math.max(...[c.sync.shopify, c.sync.meta, c.sync.mp].filter(Boolean).map((x) => Date.parse(x.at)), 0) : 0;
  if (c && (c.shopify.connected || c.meta.connected || (c.mp && c.mp.connected)) && Date.now() - last > 3600e3) sync();
  setInterval(() => { if (!document.hidden) loadData(); }, 5 * 60e3);
})();
