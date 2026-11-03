import { put, del } from "@vercel/blob";
import crypto from "node:crypto";
import { redis, FILES, isAuthed, deny, setupError, readJson } from "./_lib.js";

export const config = { api: { bodyParser: false } };
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: "setup", detail: "Falta conectar Vercel Blob (Storage) al proyecto." });

  if (req.method === "DELETE") {
    const { id } = await readJson(req);
    const rec = id && (await redis.hget(FILES, id));
    if (rec) { const r = typeof rec === "string" ? JSON.parse(rec) : rec; await del(r.url).catch(() => {}); await redis.hdel(FILES, id); }
    return res.status(200).json({ deleted: !!rec });
  }
  if (req.method !== "POST") return res.status(405).end();
  const type = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!TYPES.includes(type)) return res.status(415).json({ error: "unsupported_type" });
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX) return res.status(413).json({ error: "too_large" }); chunks.push(c); }
  if (!size) return res.status(400).json({ error: "invalid_request" });
  const id = crypto.randomBytes(16).toString("hex");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" }[type];
  const blob = await put(`comprobantes/${id}.${ext}`, Buffer.concat(chunks), { access: "public", contentType: type, addRandomSuffix: true });
  await redis.hset(FILES, { [id]: JSON.stringify({ url: blob.url, type, size }) });
  res.status(200).json({ id, url: "/_blob/" + id, contentType: type, sizeBytes: size });
}
