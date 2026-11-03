import { redis, ORDERS, ADS, ADMETA, MPPAY, isAuthed, isCron, deny, setupError, readJson, getSecrets, getStatus, setStatus } from "./_lib.js";
import { fetchOrders, fetchSessions } from "./_shopify.js";
import { insightsByDay, frequency7d, campaigns, accountInfo } from "./_meta.js";
import { fetchPayments, refreshToken } from "./_mp.js";
import { SECRETS } from "./_lib.js";

export const config = { maxDuration: 60 };

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };

async function hsetChunks(key, entries) {
  for (let i = 0; i < entries.length; i += 200) {
    const obj = {};
    for (const [k, v] of entries.slice(i, i + 200)) obj[k] = JSON.stringify(v);
    await redis.hset(key, obj);
  }
}

export async function syncShopify(cfg, prev, opts = {}) {
  // Primera vez: los últimos 60 días (lo que deja read_orders). Después: lo que cambió desde el último sync, con 2 h de margen.
  const since = opts.full || !prev || !prev.lastUpdated
    ? iso(daysAgo(Number(opts.days) || 60)) + "T00:00:00Z"
    : new Date(new Date(prev.lastUpdated).getTime() - 2 * 3600 * 1000).toISOString();
  const { orders, complete } = await fetchOrders(cfg, since);
  await hsetChunks(ORDERS, orders.map((o) => [o.id, o]));
  const lastUpdated = complete ? new Date().toISOString() : (orders.length ? orders[orders.length - 1].u || since : since);
  let sessions = null;
  if (opts.sessions !== false) {
    sessions = await fetchSessions(cfg, 90);
    if (sessions) await redis.hset(ADMETA, { sessions: JSON.stringify(sessions) });
  }
  return { count: orders.length, complete, lastUpdated, sessions: !!sessions };
}

export async function syncMeta(cfg, prev, opts = {}) {
  // Meta corrige las conversiones de los últimos días: siempre volvemos a leer los últimos 3.
  const back = opts.full || !prev || !prev.lastDay ? Number(opts.days) || 60 : Math.max(3, Math.ceil((Date.now() - new Date(prev.lastDay).getTime()) / 864e5) + 3);
  const until = iso(new Date());
  let total = 0;
  for (const acc of cfg.accounts) {
    for (let start = back; start >= 0; start -= 10) {
      const s = iso(daysAgo(start)), e = iso(daysAgo(Math.max(0, start - 9)));
      const rows = await insightsByDay(cfg.token, acc, s, e > until ? until : e);
      await hsetChunks(ADS, rows.map((r) => [r.d + "|" + r.ad, r]));
      total += rows.length;
    }
  }
  const freqs = { ad: {}, camp: {} }, camps = {};
  for (const acc of cfg.accounts) {
    const f = await frequency7d(cfg.token, acc);
    Object.assign(freqs.ad, f.ad); Object.assign(freqs.camp, f.camp);
    Object.assign(camps, await campaigns(cfg.token, acc));
  }
  const info = await accountInfo(cfg.token, cfg.accounts[0]);
  await redis.hset(ADMETA, { freq: JSON.stringify(freqs), campaigns: JSON.stringify(camps), currency: JSON.stringify(info.currency) });
  return { rows: total, lastDay: until, currency: info.currency };
}

export async function syncMp(cfg, prev, opts = {}) {
  // Primera vez: 60 días. Después: lo actualizado desde el último sync, con un día de margen
  // (los cobros cambian de estado cuando se liberan o se devuelven).
  const since = opts.full || !prev || !prev.lastUpdated
    ? new Date(Date.now() - (Number(opts.days) || 60) * 864e5)
    : new Date(new Date(prev.lastUpdated).getTime() - 864e5);
  // El token de la autorización dura 180 días: lo renovamos solos cuando falta un mes.
  if (cfg.oauth && cfg.refresh && opts.app && cfg.exp && cfg.exp - Date.now() < 30 * 864e5) {
    const t = await refreshToken(opts.app, cfg.refresh);
    const scopes = String(t.scope || "").split(/[\s,]+/).filter(Boolean);
    if (scopes.includes("write")) throw new Error("Mercado Pago devolvió un acceso con permiso de escritura: no lo usamos. Volvé a autorizar solo lectura.");
    cfg = { ...cfg, token: t.access_token, refresh: t.refresh_token || cfg.refresh, exp: Date.now() + (Number(t.expires_in) || 15552000) * 1000 };
    await redis.hset(SECRETS, { mp: JSON.stringify(cfg) });
  }
  const pays = await fetchPayments(cfg.token, since);
  await hsetChunks(MPPAY, pays.map((p) => [p.id, p]));
  return { count: pays.length, lastUpdated: new Date().toISOString() };
}

export default async function handler(req, res) {
  if (setupError(res)) return;
  const cron = isCron(req);
  if (!cron && !isAuthed(req)) return deny(res);
  if (!cron && req.method !== "POST") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");

  const body = cron ? {} : await readJson(req);
  const which = body.which || "all";
  const sec = await getSecrets();
  const st = await getStatus();
  const prev = st.sync || {};
  const out = { shopify: null, meta: null, mp: null };

  if ((which === "all" || which === "shopify") && sec.shopify) {
    try {
      out.shopify = await syncShopify(sec.shopify, prev.shopify, body);
      await setStatus("shopify", { ...(st.shopify || {}), ok: true, error: null });
    } catch (e) {
      out.shopify = { error: e.message };
      await setStatus("shopify", { ...(st.shopify || {}), ok: false, error: e.message });
    }
  }
  if ((which === "all" || which === "meta") && sec.meta) {
    try {
      out.meta = await syncMeta(sec.meta, prev.meta, body);
      await setStatus("meta", { ...(st.meta || {}), ok: true, error: null, currency: out.meta.currency });
    } catch (e) {
      out.meta = { error: e.message };
      await setStatus("meta", { ...(st.meta || {}), ok: false, error: e.message });
    }
  }
  if ((which === "all" || which === "mp") && sec.mp) {
    try {
      out.mp = await syncMp(sec.mp, prev.mp, { ...body, app: sec.mpApp });
      await setStatus("mp", { ...(st.mp || {}), ok: true, error: null });
    } catch (e) {
      out.mp = { error: e.message };
      await setStatus("mp", { ...(st.mp || {}), ok: false, error: e.message });
    }
  }
  const next = { ...prev };
  if (out.shopify && !out.shopify.error) next.shopify = { lastUpdated: out.shopify.lastUpdated, at: new Date().toISOString() };
  if (out.mp && !out.mp.error) next.mp = { lastUpdated: out.mp.lastUpdated, at: new Date().toISOString() };
  if (out.meta && !out.meta.error) next.meta = { lastDay: out.meta.lastDay, at: new Date().toISOString() };
  await setStatus("sync", next);
  res.status(200).json(out);
}
