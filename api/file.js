import { redis, FILES, isAuthed, deny, setupError } from "./_lib.js";

// Sirve el comprobante solo a quien tiene la clave; la URL real del archivo nunca llega al navegador.
export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  const id = String(req.query.id || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return deny(res, 404, "not_found");
  const rec = await redis.hget(FILES, id);
  if (!rec) return deny(res, 404, "not_found");
  const r = typeof rec === "string" ? JSON.parse(rec) : rec;
  const up = await fetch(r.url);
  if (!up.ok) return deny(res, 404, "not_found");
  res.setHeader("Content-Type", r.type);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.status(200).send(Buffer.from(await up.arrayBuffer()));
}
