// Servidor local para probar la app sin Vercel: imita Upstash Redis (REST) en memoria y
// corre las funciones de /api como lo hace Vercel. Uso: node dev/server.js  (abre :3000)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000), RPORT = PORT + 1;

// ---- Upstash falso ----
const store = new Map(); // key -> string | Map
const hashes = (k) => { let h = store.get(k); if (!(h instanceof Map)) { h = new Map(); store.set(k, h); } return h; };
function run(cmd) {
  const [c, ...a] = cmd; const C = String(c).toUpperCase();
  switch (C) {
    case "HSET": { const h = hashes(a[0]); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!h.has(a[i])) n++; h.set(a[i], String(a[i + 1])); } return n; }
    case "HGET": { const h = store.get(a[0]); return h instanceof Map && h.has(a[1]) ? h.get(a[1]) : null; }
    case "HGETALL": { const h = store.get(a[0]); return h instanceof Map ? [...h].flat() : []; }
    case "HDEL": { const h = store.get(a[0]); let n = 0; if (h instanceof Map) for (const f of a.slice(1)) n += h.delete(f) ? 1 : 0; return n; }
    case "DEL": { let n = 0; for (const k of a) n += store.delete(k) ? 1 : 0; return n; }
    case "GET": { const v = store.get(a[0]); return typeof v === "string" ? v : null; }
    case "SET": store.set(a[0], String(a[1])); return "OK";
    default: throw new Error("cmd no soportado " + C);
  }
}
const enc = (v, b64) => (b64 ? (typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map((x) => enc(x, b64)) : v) : v);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "null");
  const b64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.url.startsWith("/pipeline") || req.url.startsWith("/multi-exec")) res.end(JSON.stringify(body.map((c) => ({ result: enc(run(c), b64) }))));
    else res.end(JSON.stringify({ result: enc(run(body), b64) }));
  } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
}).listen(RPORT);

process.env.KV_REST_API_URL = `http://127.0.0.1:${RPORT}`;
process.env.KV_REST_API_TOKEN = "dev";
process.env.APP_PASSWORD = process.env.APP_PASSWORD || "impoluto-dev-1234";

// ---- datos de ejemplo ----
if (process.env.SEED !== "0") {
  const { seed } = await import("./seed.js");
  const { redis } = await import("../api/_lib.js");
  await seed(redis);
}

// ---- funciones /api como Vercel ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    const name = u.pathname.slice(5).replace(/[^a-z_]/gi, "");
    let mod; try { mod = await import(path.join(ROOT, "api", name + ".js")); } catch { res.statusCode = 404; return res.end("no"); }
    req.query = Object.fromEntries(u.searchParams);
    const r = res;
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (o) => { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify(o)); return r; };
    r.send = (b) => { r.end(b); return r; };
    try { await mod.default(req, r); } catch (e) { console.error(e); if (!r.headersSent) r.status(500).json({ error: e.message }); }
    return;
  }
  let p = path.join(ROOT, "public", u.pathname === "/" ? "index.html" : u.pathname);
  if (!p.startsWith(path.join(ROOT, "public")) || !fs.existsSync(p)) { res.statusCode = 404; return res.end("404"); }
  res.setHeader("Content-Type", MIME[path.extname(p)] || "application/octet-stream");
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}  · clave: ${process.env.APP_PASSWORD}`));
