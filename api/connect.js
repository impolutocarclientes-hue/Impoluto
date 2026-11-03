import { redis, SECRETS, STATUS, ORDERS, ADS, ADMETA, MPPAY, isAuthed, deny, setupError, readJson, getSecrets, getStatus, setStatus } from "./_lib.js";
import { shopHost, getToken, shopInfo } from "./_shopify.js";
import { accountInfo, actId } from "./_meta.js";
import { tokenSoloLectura, me as mpMe } from "./_mp.js";

// Conexiones: guarda los códigos de Shopify y el acceso de Meta. Los secretos nunca vuelven al navegador.
export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const sec = await getSecrets();
    const st = await getStatus();
    return res.status(200).json({
      shopify: sec.shopify ? { connected: true, shop: sec.shopify.shop, fromEnv: !!process.env.SHOPIFY_CLIENT_SECRET, ...(st.shopify || {}) } : { connected: false },
      meta: sec.meta ? { connected: true, accounts: sec.meta.accounts, fromEnv: !!process.env.META_TOKEN, savedAt: sec.meta.savedAt || null, ...(st.meta || {}) } : { connected: false },
      mp: sec.mp ? { connected: true, scope: sec.mp.scope || "", ...(st.mp || {}) } : { connected: false, app: !!sec.mpApp, ...(st.mp && st.mp.error ? { error: st.mp.error } : {}) },
      sync: st.sync || null,
      cron: !!process.env.CRON_SECRET,
    });
  }

  const body = await readJson(req);

  if (req.method === "POST" && body.which === "shopify") {
    const shop = (() => { try { return shopHost(body.shop); } catch (e) { return { err: e.message }; } })();
    if (shop.err) return res.status(400).json({ error: shop.err });
    const clientId = String(body.clientId || "").trim();
    const clientSecret = String(body.clientSecret || "").trim();
    if (!/^[a-z0-9]{32}$/i.test(clientId)) return res.status(400).json({ error: "El Client ID son 32 letras y números. No es el número de la app que se ve en la dirección." });
    if (clientSecret.length < 20) return res.status(400).json({ error: "Falta el Client secret (el que se copia con el botón, en Configuración de la app)." });
    const cfg = { shop, clientId, clientSecret };
    try {
      await getToken(cfg, true);
      const info = await shopInfo(cfg);
      await redis.hset(SECRETS, { shopify: JSON.stringify(cfg) });
      await setStatus("shopify", { ok: true, name: info.name, currency: info.currencyCode, tz: info.ianaTimezone });
      return res.status(200).json({ ok: true, name: info.name });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (req.method === "POST" && body.which === "meta") {
    const token = String(body.token || "").trim();
    let accounts;
    try { accounts = String(body.accounts || "").split(/[\s,]+/).filter(Boolean).map(actId); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!token || token.length < 40) return res.status(400).json({ error: "Pegá el token de acceso de Meta." });
    if (!accounts.length) return res.status(400).json({ error: "Pegá el ID de la cuenta publicitaria." });
    try {
      const infos = [];
      for (const a of accounts) infos.push(await accountInfo(token, a));
      await redis.hset(SECRETS, { meta: JSON.stringify({ token, accounts, savedAt: new Date().toISOString(), expiresDays: Number(body.expiresDays) || null }) });
      await redis.hset(ADMETA, { currency: JSON.stringify(infos[0].currency) });
      await setStatus("meta", { ok: true, names: infos.map((i) => i.name), currency: infos[0].currency });
      return res.status(200).json({ ok: true, names: infos.map((i) => i.name), currency: infos[0].currency });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Mercado Pago: guardamos el Client ID y el Client secret de la aplicación. El token lo da Mercado Pago
  // cuando el usuario autoriza "solo lectura" en su pantalla (ver mp-auth.js y mp-callback.js).
  if (req.method === "POST" && body.which === "mp-app") {
    const clientId = String(body.clientId || "").trim(), clientSecret = String(body.clientSecret || "").trim();
    if (!/^\d{6,20}$/.test(clientId)) return res.status(400).json({ error: "El Client ID de Mercado Pago son solo números (es el número de la aplicación)." });
    if (clientSecret.length < 20) return res.status(400).json({ error: "Falta el Client secret de la aplicación." });
    try {
      const t = await tokenSoloLectura({ clientId, clientSecret });
      const u = await mpMe(t.token);
      await redis.hset(SECRETS, { mpApp: JSON.stringify({ clientId, clientSecret }), mp: JSON.stringify({ ...t, userId: u.id }) });
      await setStatus("mp", { ok: true, name: u.nickname, userId: u.id, scope: t.scope, error: null });
      return res.status(200).json({ ok: true, name: u.nickname, scope: t.scope });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (req.method === "DELETE") {
    if (body.which === "shopify") { await redis.hdel(SECRETS, "shopify"); await redis.hdel(STATUS, "shopify"); await redis.del("impoluto:shopify_token"); if (body.wipe) await redis.del(ORDERS); }
    else if (body.which === "meta") { await redis.hdel(SECRETS, "meta"); await redis.hdel(STATUS, "meta"); if (body.wipe) { await redis.del(ADS); await redis.del(ADMETA); } }
    else if (body.which === "mp") { await redis.hdel(SECRETS, "mp"); await redis.hdel(SECRETS, "mpApp"); await redis.hdel(STATUS, "mp"); if (body.wipe) await redis.del(MPPAY); }
    else return deny(res, 400, "bad_which");
    return res.status(200).json({ ok: true });
  }
  res.status(405).end();
}
