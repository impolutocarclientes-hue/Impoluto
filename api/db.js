import { redis, DOCS, isAuthed, deny, setupError, readJson } from "./_lib.js";

const PATH_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}\/[A-Za-z0-9_\-.~:@+]{1,200}$/;

export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const all = (await redis.hgetall(DOCS)) || {};
    const docs = {};
    for (const [k, v] of Object.entries(all)) docs[k] = typeof v === "string" ? JSON.parse(v) : v;
    return res.status(200).json({ docs });
  }
  if (req.method === "POST") {
    const { ops } = await readJson(req);
    if (!Array.isArray(ops) || !ops.length || ops.length > 50) return deny(res, 400, "bad_ops");
    for (const o of ops) {
      if (!o || !PATH_RE.test(o.path || "")) return deny(res, 400, "bad_path");
      if (o.op === "set" && (typeof o.data !== "object" || Array.isArray(o.data) || o.data === null)) return deny(res, 400, "bad_data");
      if (o.op === "set" && JSON.stringify(o.data).length > 256 * 1024) return deny(res, 400, "too_large");
      if (o.op !== "set" && o.op !== "delete") return deny(res, 400, "bad_op");
    }
    const p = redis.pipeline();
    for (const o of ops) o.op === "set" ? p.hset(DOCS, { [o.path]: JSON.stringify(o.data) }) : p.hdel(DOCS, o.path);
    await p.exec();
    return res.status(200).json({ ok: true });
  }
  res.status(405).end();
}
