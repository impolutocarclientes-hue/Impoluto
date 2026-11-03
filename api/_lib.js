import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;
export const DOCS = "impoluto:docs";
export const FILES = "impoluto:files";
export const COOKIE = "imp_auth";
// Datos que trae la sincronización automática (no los toca el navegador).
export const ORDERS = "impoluto:orders";      // id de pedido → pedido compacto
export const ADS = "impoluto:ads";            // "AAAA-MM-DD|adId" → métricas del día
export const ADMETA = "impoluto:admeta";      // datos sueltos de Meta (frecuencia 7 días, estado de campañas, moneda)
export const SECRETS = "impoluto:secrets";    // credenciales: solo las lee el servidor
export const STATUS = "impoluto:status";      // estado de cada conexión y último sync

export async function getSecrets() {
  const raw = (await redis.hgetall(SECRETS)) || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "string" ? safeParse(v) : v;
  // Las variables de entorno de Vercel tienen prioridad si están cargadas.
  if (process.env.SHOPIFY_SHOP && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
    out.shopify = { shop: process.env.SHOPIFY_SHOP, clientId: process.env.SHOPIFY_CLIENT_ID, clientSecret: process.env.SHOPIFY_CLIENT_SECRET };
  if (process.env.META_TOKEN && process.env.META_AD_ACCOUNT)
    out.meta = { token: process.env.META_TOKEN, accounts: process.env.META_AD_ACCOUNT.split(",").map((s) => s.trim()).filter(Boolean) };
  return out;
}
export function safeParse(v) { try { return JSON.parse(v); } catch { return v; } }
export async function getStatus() {
  const raw = (await redis.hgetall(STATUS)) || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "string" ? safeParse(v) : v;
  return out;
}
export async function setStatus(key, data) {
  await redis.hset(STATUS, { [key]: JSON.stringify({ ...data, at: new Date().toISOString() }) });
}
// El cron de Vercel manda "Authorization: Bearer <CRON_SECRET>".
export function isCron(req) {
  const s = process.env.CRON_SECRET;
  if (!s) return false;
  const h = String(req.headers.authorization || "");
  const a = Buffer.from(h), b = Buffer.from("Bearer " + s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionToken() {
  const pw = process.env.APP_PASSWORD || "";
  return crypto.createHmac("sha256", pw).update("impoluto-gastos-v1").digest("hex");
}
export function checkPassword(given) {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return false;
  const a = Buffer.from(String(given || "")), b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookieValue(req) {
  const raw = req.headers.cookie || "";
  const m = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : "";
}
export function isAuthed(req) {
  if (!process.env.APP_PASSWORD) return false;
  const v = Buffer.from(cookieValue(req)), t = Buffer.from(sessionToken());
  return v.length === t.length && crypto.timingSafeEqual(v, t);
}
export function deny(res, code = 401, msg = "unauthorized") {
  res.status(code).json({ error: msg });
}
export function setupError(res) {
  if (!process.env.APP_PASSWORD) { res.status(500).json({ error: "setup", detail: "Falta la variable APP_PASSWORD en Vercel." }); return true; }
  if (!redis) { res.status(500).json({ error: "setup", detail: "Falta conectar la base Upstash Redis (Storage) al proyecto en Vercel." }); return true; }
  return false;
}
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
