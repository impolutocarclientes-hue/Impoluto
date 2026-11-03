import crypto from "node:crypto";
import { redis, isAuthed, deny, setupError, getSecrets } from "./_lib.js";

// Paso 1 de la autorización de solo lectura: manda al usuario a la pantalla oficial de Mercado Pago.
export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  const sec = await getSecrets();
  if (!sec.mpApp || !sec.mpApp.clientId) {
    res.statusCode = 302; res.setHeader("Location", "/?mp=falta-app"); return res.end();
  }
  const state = crypto.randomBytes(16).toString("hex");
  await redis.set("impoluto:mp_state:" + state, "1", { ex: 900 }); // vale 15 minutos
  const redirect = `https://${req.headers.host}/api/mp-callback`;
  const q = new URLSearchParams({ client_id: sec.mpApp.clientId, response_type: "code", platform_id: "mp", state, redirect_uri: redirect, scope: "read offline_access" });
  res.statusCode = 302;
  res.setHeader("Location", "https://auth.mercadopago.com.ar/authorization?" + q);
  res.end();
}
