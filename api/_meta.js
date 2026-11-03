// Meta Ads: leemos gasto, ventas y embudo por anuncio y por día. Solo lectura.
export const GRAPH = "https://graph.facebook.com/v23.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function actId(a) {
  const s = String(a || "").trim().replace(/^act_/, "");
  if (!/^\d{5,25}$/.test(s)) throw new Error("El ID de la cuenta publicitaria son solo números (lo ves en el Administrador de anuncios).");
  return "act_" + s;
}

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const e = j.error || {};
    // 17 / 4 / 613 = límite de llamadas: esperamos y probamos de nuevo
    if ([4, 17, 613, 80004].includes(e.code)) { await sleep(3000 * (i + 1)); continue; }
    if (e.code === 190) throw new Error("El acceso a Meta venció o es inválido. Volvé a pegar el token en Configuración → Conexiones.");
    throw new Error("Meta: " + (e.message || r.status));
  }
  throw new Error("Meta no respondió después de varios intentos.");
}

async function getAll(url, max = 50) {
  const out = [];
  let next = url;
  for (let i = 0; next && i < max; i++) {
    const j = await get(next);
    out.push(...(j.data || []));
    next = j.paging && j.paging.next;
  }
  return out;
}

const q = (o) => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))).join("&");

export async function accountInfo(token, account) {
  return get(`${GRAPH}/${actId(account)}?${q({ fields: "name,currency,timezone_name,account_status", access_token: token })}`);
}

export async function tokenInfo(token) {
  // Para avisar antes de que venza (los tokens de usuario duran 60 días).
  try {
    const j = await get(`${GRAPH}/me?${q({ fields: "id,name", access_token: token })}`);
    return { ok: true, name: j.name };
  } catch (e) { return { ok: false, error: e.message }; }
}

const pick = (arr, types) => {
  if (!Array.isArray(arr)) return 0;
  for (const t of types) {
    const a = arr.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
};
const PURCHASE = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const ATC = ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const IC = ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const LPV = ["landing_page_view", "omni_landing_page_view"];

// Métricas por anuncio y por día, en la moneda de la cuenta.
export async function insightsByDay(token, account, since, until) {
  const rows = await getAll(`${GRAPH}/${actId(account)}/insights?${q({
    level: "ad",
    time_increment: "1",
    time_range: { since, until },
    fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,clicks,actions,action_values",
    limit: "500",
    access_token: token,
  })}`);
  return rows.map((r) => ({
    d: r.date_start,
    acc: actId(account),
    ad: r.ad_id, an: r.ad_name,
    as: r.adset_id, asn: r.adset_name,
    ca: r.campaign_id, can: r.campaign_name,
    sp: Number(r.spend) || 0,
    imp: Number(r.impressions) || 0,
    clk: Number(r.inline_link_clicks) || 0,
    lpv: pick(r.actions, LPV),
    atc: pick(r.actions, ATC),
    ic: pick(r.actions, IC),
    pu: pick(r.actions, PURCHASE),
    pv: pick(r.action_values, PURCHASE),
  }));
}

// Frecuencia de los últimos 7 días por anuncio y por campaña (ESA la usa para el semáforo).
export async function frequency7d(token, account) {
  const base = { date_preset: "last_7d", limit: "500", access_token: token };
  const [ads, camps] = await Promise.all([
    getAll(`${GRAPH}/${actId(account)}/insights?${q({ ...base, level: "ad", fields: "ad_id,frequency" })}`),
    getAll(`${GRAPH}/${actId(account)}/insights?${q({ ...base, level: "campaign", fields: "campaign_id,frequency" })}`),
  ]);
  const ad = {}, camp = {};
  ads.forEach((r) => (ad[r.ad_id] = Number(r.frequency) || 0));
  camps.forEach((r) => (camp[r.campaign_id] = Number(r.frequency) || 0));
  return { ad, camp };
}

export async function campaigns(token, account) {
  const rows = await getAll(`${GRAPH}/${actId(account)}/campaigns?${q({ fields: "id,name,effective_status,daily_budget,lifetime_budget,bid_strategy", limit: "200", access_token: token })}`);
  const out = {};
  rows.forEach((c) => (out[c.id] = { n: c.name, st: c.effective_status, db: Number(c.daily_budget) || 0, bs: c.bid_strategy || "" }));
  return out;
}
