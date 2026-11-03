import { redis, ORDERS, ADS, ADMETA, MPPAY, isAuthed, deny, setupError, safeParse, getStatus } from "./_lib.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Devuelve los pedidos y los anuncios sincronizados entre dos fechas (con un día de margen por la zona horaria).
export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  if (!DAY.test(from) || !DAY.test(to)) return deny(res, 400, "bad_range");
  const lo = new Date(from + "T00:00:00Z"); lo.setUTCDate(lo.getUTCDate() - 1);
  const hi = new Date(to + "T00:00:00Z"); hi.setUTCDate(hi.getUTCDate() + 2);
  const loS = lo.toISOString(), hiS = hi.toISOString();

  const [oRaw, aRaw, mRaw, pRaw, status] = await Promise.all([redis.hgetall(ORDERS), redis.hgetall(ADS), redis.hgetall(ADMETA), redis.hgetall(MPPAY), getStatus()]);
  const orders = [];
  for (const v of Object.values(oRaw || {})) {
    const o = typeof v === "string" ? safeParse(v) : v;
    if (o && o.c >= loS && o.c < hiS) orders.push(o);
  }
  const ads = [];
  for (const [k, v] of Object.entries(aRaw || {})) {
    const d = k.slice(0, 10);
    if (d >= from && d <= to) ads.push(typeof v === "string" ? safeParse(v) : v);
  }
  // Cobros de Mercado Pago: los del rango y los que todavía se están por liberar (para la caja).
  const pays = [];
  for (const v of Object.values(pRaw || {})) {
    const p = typeof v === "string" ? safeParse(v) : v;
    if (!p) continue;
    const d = p.a || p.c;
    if ((d >= loS && d < hiS) || (p.rel && p.rel >= new Date().toISOString())) pays.push(p);
  }
  const meta = {};
  for (const [k, v] of Object.entries(mRaw || {})) meta[k] = typeof v === "string" ? safeParse(v) : v;
  if (meta.sessions) meta.sessions = meta.sessions.filter((s) => s.d >= from && s.d <= to);
  res.status(200).json({ orders, ads, meta, pays, status });
}
