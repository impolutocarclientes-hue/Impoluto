import { redis, SECRETS, setupError, getSecrets, setStatus } from "./_lib.js";
import { exchangeCode, me } from "./_mp.js";

// Paso 2: Mercado Pago vuelve acá con un código. Lo cambiamos por un token y SOLO lo guardamos si es de lectura.
// (No usa la cookie de sesión porque los navegadores no la mandan al volver desde otro sitio: lo protege el "state".)
export default async function handler(req, res) {
  if (setupError(res)) return;
  const back = (msg) => { res.statusCode = 302; res.setHeader("Location", "/?mp=" + encodeURIComponent(msg)); res.end(); };
  const { code, state, error } = req.query || {};
  if (error) return back("cancelado");
  if (!state || !/^[a-f0-9]{32}$/.test(String(state))) return back("estado-invalido");
  const ok = await redis.get("impoluto:mp_state:" + state);
  if (!ok) return back("vencido");
  await redis.del("impoluto:mp_state:" + state);
  const sec = await getSecrets();
  if (!sec.mpApp) return back("falta-app");
  try {
    const t = await exchangeCode(sec.mpApp, String(code), `https://${req.headers.host}/api/mp-callback`);
    const scopes = String(t.scope || "").split(/[\s,]+/).filter(Boolean);
    if (scopes.includes("write")) return back("tiene-write");
    if (!scopes.includes("read")) return back("sin-permisos");
    const u = await me(t.access_token);
    await redis.hset(SECRETS, { mp: JSON.stringify({ token: t.access_token, refresh: t.refresh_token || null, exp: Date.now() + (Number(t.expires_in) || 15552000) * 1000, userId: u.id, scope: scopes.join(" "), oauth: true }) });
    await setStatus("mp", { ok: true, name: u.nickname, userId: u.id, scope: scopes.join(" "), error: null });
    return back("ok");
  } catch (e) {
    await setStatus("mp", { ok: false, error: e.message });
    return back("error");
  }
}
