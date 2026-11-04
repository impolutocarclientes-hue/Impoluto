// Facturador: arma las facturas B de los pedidos pagados de Shopify y las emite en ARCA cuando el usuario toca «Emitir».
// Nunca factura solo: cada emisión la pide el usuario desde la app.
import { redis, SECRETS, ORDERS, isAuthed, deny, setupError, readJson, getSecrets, safeParse } from "./_lib.js";
import { nuevaClave, certCorresponde, cuitValido, puntosDeVenta, ultimoNumero, consultar, solicitarCae, montos, ALICUOTAS, FACTURA_B } from "./_arca.js";
import { facturaPdf, numeroFactura } from "./_pdf.js";
import { contactoPedido, fetchOrder } from "./_shopify.js";

// Las facturas se guardan por CUIT y por entorno: las de prueba (homologación) nunca se mezclan con las reales.
const factKey = (a) => `impoluto:facturas:${a.cuit}:${a.entorno === "homo" ? "homo" : "prod"}`;
const LOCK = "impoluto:facturas:lock";
const TOPE_CF = 10000000; // desde $10.000.000 hay que identificar al consumidor final (RG 5700)
const MAX_POR_VEZ = 10;
const ESPERA_MS = 5 * 60e3; // cuánto se espera antes de dar por no emitida una factura que se cortó

const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const yyyymmdd = (iso) => iso.replace(/-/g, "");
const dayOf = (iso) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);

async function leerHash(key) {
  const raw = (await redis.hgetall(key)) || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "string" ? safeParse(v) : v;
  return out;
}
const leerFacturas = (arca) => (arca && arca.cuit ? leerHash(factKey(arca)) : Promise.resolve({}));
const guardarFactura = (arca, oid, f) => redis.hset(factKey(arca), { [oid]: JSON.stringify(f) });
const publico = (a) => a ? { cuit: a.cuit, entorno: a.entorno || "prod", tieneClave: !!(a.key || a.pendKey), csr: a.csr || null, conectado: !!(a.cert && a.key), vence: a.vence || null, ptoVta: a.ptoVta || null, alicuota: a.alicuota || null, desde: a.desde || null, emisor: a.emisor || {} } : null;
const pendientesDe = (facturas) => Object.values(facturas).filter((f) => f.estado === "enviando" || f.estado === "revisar");
// El número más alto que emitió ESTA app (Factura B) en ese punto de venta.
const maxPropio = (facturas, pto) => Math.max(0, ...Object.values(facturas).filter((f) => f.pto === pto && (f.tipo || FACTURA_B) === FACTURA_B).map((f) => Number(f.nro) || 0));

// ¿Se puede facturar este pedido? Devuelve el motivo si no.
export function motivoNoFacturable(o) {
  if (!o) return "No existe el pedido.";
  if (o.t) return "Es un pedido de prueba.";
  // Solo ventas del checkout de la tienda. Si algún día una app copia a Shopify pedidos de Mercado Libre
  // u otro canal, esos pedidos traen otro origen y quedan afuera (ya se facturan por su lado).
  if (o.s && o.s !== "web") return "No es una venta de la tienda online (origen: " + o.s + ").";
  if (o.x) return "Está cancelado.";
  if (o.f !== "PAID") return "No está pagado (o tuvo devoluciones).";
  if (Number(o.ref) > 0) return "Tuvo devoluciones.";
  const total = Number(o.cur != null ? o.cur : o.tot);
  if (!(total > 0)) return "Total en cero.";
  if (total >= TOPE_CF) return "Supera $10.000.000: hay que pedirle el DNI al cliente.";
  return null;
}

function itemsDe(o) {
  return (o.li || []).filter((l) => Number(l.cq) > 0).map((l) => {
    const q = Number(l.q) || 0, cq = Number(l.cq);
    const tot = Number(l.tot) || 0;
    return { ti: l.ti + (l.vt && l.vt !== "Default Title" ? " - " + l.vt : ""), q: cq, tot: q > 0 && cq < q ? Math.round((tot * cq / q) * 100) / 100 : tot };
  });
}

async function guardarArca(arca) { await redis.hset(SECRETS, { arca: JSON.stringify(arca) }); }

// Una factura que quedó a medio emitir (se cortó la conexión) se averigua en ARCA, en SU punto de venta.
// Solo se borra el registro si ARCA dice que ese número no existe Y todavía no llegó a ese número.
async function resolverPendientes(arca, facturas) {
  for (const [oid, f] of Object.entries(facturas)) {
    if (f.estado !== "enviando" && f.estado !== "revisar") continue;
    const cfg = { ...arca, ptoVta: f.pto };
    const c = await consultar(cfg, f.nro, f.tipo || FACTURA_B); // si ARCA no responde bien, tira error y no se toca nada
    if (c.existe && Math.abs(c.total - f.total) < 0.01) {
      const ok = { ...f, ...montos(f.total, f.alicuota), estado: "emitida", cae: c.cae, vto: c.vto, fecha: c.fecha || f.fecha, aviso: undefined };
      await guardarFactura(arca, oid, ok); facturas[oid] = ok;
      continue;
    }
    if (c.existe) {
      const r = { ...f, estado: "revisar", aviso: `En ARCA el comprobante ${numeroFactura(f)} existe con otro importe ($${c.total}). Revisalo en ARCA antes de seguir.` };
      await guardarFactura(arca, oid, r); facturas[oid] = r;
      throw new Error(r.aviso);
    }
    const ultimo = await ultimoNumero(cfg, f.tipo || FACTURA_B);
    if (ultimo < f.nro) {
      // ARCA puede seguir procesando un pedido que no contestó a tiempo: antes de darla por no emitida se espera.
      const edad = Date.now() - Date.parse(f.sentAt || 0);
      if (!(edad > ESPERA_MS)) throw new Error(`La factura del pedido ${f.pedido} quedó a medio emitir hace un momento. Esperá ${Math.ceil((ESPERA_MS - (edad || 0)) / 60000)} minutos y tocá Emitir de nuevo: la app confirma en ARCA si salió antes de seguir.`);
      await redis.hdel(factKey(arca), oid); delete facturas[oid]; continue;
    }
    const r = { ...f, estado: "revisar", aviso: `ARCA ya pasó el número ${numeroFactura(f)} pero no lo encuentra. Revisalo en ARCA antes de seguir.` };
    await guardarFactura(arca, oid, r); facturas[oid] = r;
    throw new Error(r.aviso);
  }
}

async function emitirUno(arca, o, facturas) {
  const ultimo = await ultimoNumero(arca, FACTURA_B);
  const propio = maxPropio(facturas, arca.ptoVta);
  if (ultimo !== propio) throw new Error(`En el punto de venta ${arca.ptoVta} facturó otro sistema (ARCA va por el ${ultimo}, la app por el ${propio}). No se emite nada para no mezclar con Mercado Libre: usá un punto de venta solo para esta app.`);
  const nro = ultimo + 1;
  const total = Number(o.cur != null ? o.cur : o.tot);
  const base = { tipo: FACTURA_B, pto: arca.ptoVta, nro, fecha: yyyymmdd(hoyAR()), pedido: o.n, orderId: o.id, alicuota: arca.alicuota, items: itemsDe(o), envio: Number(o.ship) || 0, entorno: arca.entorno || "prod", cuit: arca.cuit, ...montos(total, arca.alicuota) };
  // Se anota ANTES de pedir el CAE: si se corta, la próxima vez se consulta en ARCA y no se duplica.
  base.sentAt = new Date().toISOString();
  await guardarFactura(arca, o.id, { ...base, estado: "enviando" });
  facturas[o.id] = { ...base, estado: "enviando" };
  let r;
  try {
    r = await solicitarCae(arca, { nro, fecha: base.fecha, total, alicuota: arca.alicuota });
  } catch (e) {
    // Sin respuesta clara de ARCA: nunca se borra. Si la factura salió, se guarda; si no se sabe, queda «revisar».
    const c = await consultar(arca, nro).catch(() => null);
    if (c && c.existe && Math.abs(c.total - total) < 0.01) r = { ok: true, cae: c.cae, vto: c.vto, ...montos(total, arca.alicuota) };
    else {
      const rev = { ...base, estado: "revisar", aviso: "Se cortó la comunicación con ARCA: " + e.message };
      await guardarFactura(arca, o.id, rev); facturas[o.id] = rev;
      throw new Error(rev.aviso + ". No se emite nada más hasta confirmar en ARCA si salió (se revisa sola en la próxima emisión).");
    }
  }
  if (!r.ok) {
    if (r.resultado === "R") { await redis.hdel(factKey(arca), o.id); delete facturas[o.id]; throw new Error("ARCA rechazó la factura: " + ([...(r.errs || []), ...(r.obs || [])].join(" · ") || "sin detalle")); }
    const rev = { ...base, estado: "revisar", aviso: "Respuesta de ARCA poco clara: " + ([...(r.errs || []), ...(r.obs || [])].join(" · ") || "sin resultado") };
    await guardarFactura(arca, o.id, rev); facturas[o.id] = rev;
    throw new Error(rev.aviso);
  }
  const f = { ...base, total: r.total, neto: r.neto, iva: r.iva, cae: r.cae, vto: r.vto, estado: "emitida", at: new Date().toISOString(), obs: r.obs && r.obs.length ? r.obs : undefined };
  await guardarFactura(arca, o.id, f);
  facturas[o.id] = f;
  return f;
}

async function enviarEmail(sec, arca, f) {
  const mail = sec.mail;
  if (!mail || !mail.resendKey || !mail.from) throw new Error("Falta configurar el envío de emails.");
  const sh = sec.shopify;
  const c = sh ? await contactoPedido(sh, f.orderId) : null;
  if (!c || !c.email) throw new Error("Shopify no nos pasa el email de este cliente: descargá la factura y mandala a mano.");
  const pdf = await facturaPdf(arca, arca.emisor || {}, { ...f, cliente: c.nombre });
  const nombre = (c.nombre || "").split(" ")[0];
  const html = `<p>Hola${nombre ? " " + nombre.replace(/[<>&]/g, "") : ""}!</p><p>Muchas gracias por tu compra en Impoluto. Te dejamos adjunta la factura de tu pedido ${f.pedido}.</p><p>Cualquier cosa que necesites, respondé este mail.</p><p>¡Que lo disfrutes!<br>Equipo Impoluto</p>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + mail.resendKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mail.from, to: [c.email], reply_to: mail.replyTo || undefined, subject: `Tu factura de Impoluto · pedido ${f.pedido}`, html, attachments: [{ filename: `Factura-B-${numeroFactura(f)}.pdf`, content: pdf.toString("base64") }] }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("No se pudo mandar el email: " + (j.message || r.status)); }
  const env = { ...f, emailAt: new Date().toISOString() };
  await guardarFactura(arca, f.orderId, env);
  return env;
}

export default async function handler(req, res) {
  if (setupError(res)) return;
  if (!isAuthed(req)) return deny(res);
  res.setHeader("Cache-Control", "no-store");
  const sec = await getSecrets();
  let arca = sec.arca || null;

  if (req.method === "GET") {
    const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
    if (q.pdf) {
      if (!arca) return deny(res, 404, "Esa factura no existe.");
      const f = (await leerFacturas(arca))[q.pdf];
      if (!f || f.estado !== "emitida") return deny(res, 404, "Esa factura no existe.");
      const pdf = await facturaPdf(arca, arca.emisor || {}, f);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Factura-B-${numeroFactura(f)}.pdf"`);
      return res.status(200).send(pdf);
    }
    const facturas = await leerFacturas(arca);
    const desde = (arca && arca.desde) || hoyAR().slice(0, 8) + "01";
    const ords = await leerHash(ORDERS);
    const pendientes = Object.values(ords)
      .filter((o) => o && dayOf(o.c) >= desde && !facturas[o.id])
      .map((o) => ({ id: o.id, n: o.n, c: o.c, total: Number(o.cur != null ? o.cur : o.tot), motivo: motivoNoFacturable(o) }))
      .filter((o) => !/prueba|cancelado/i.test(o.motivo || ""))
      .sort((a, b) => a.c.localeCompare(b.c));
    return res.status(200).json({ arca: publico(arca), mail: sec.mail ? { from: sec.mail.from } : null, desde, pendientes, facturas: Object.values(facturas).sort((a, b) => (b.nro || 0) - (a.nro || 0)) });
  }

  if (req.method !== "POST") return res.status(405).end();
  const b = await readJson(req);
  try {
    if (b.action === "preparar") {
      const cuit = String(b.cuit || "").replace(/\D/g, "");
      if (!cuitValido(cuit)) return res.status(400).json({ error: "Ese CUIT no es válido. Son 11 números, sin guiones." });
      const { key, csr } = nuevaClave(cuit);
      // Si ya hay una conexión andando, la clave nueva espera aparte hasta que llegue su certificado.
      const entorno = b.entorno === "homo" ? "homo" : "prod";
      const sigue = arca && arca.cert && arca.cuit === cuit && (arca.entorno || "prod") === entorno;
      arca = sigue
        ? { ...arca, pendKey: key, csr }
        : { cuit, entorno, pendKey: key, csr, alicuota: (arca && arca.alicuota) || "21", emisor: (arca && arca.emisor) || {}, desde: arca && arca.desde, ptoVta: null };
      await guardarArca(arca);
      return res.status(200).json({ ok: true, csr });
    }
    if (b.action === "certificado") {
      const key = arca && (arca.pendKey || arca.key);
      if (!key) return res.status(400).json({ error: "Primero generá el pedido de certificado." });
      const pem = String(b.cert || "").trim();
      if (!/-----BEGIN CERTIFICATE-----/.test(pem)) return res.status(400).json({ error: "Pegá el certificado completo: desde -----BEGIN CERTIFICATE----- hasta -----END CERTIFICATE-----." });
      const c = certCorresponde(pem, key);
      if (!c.ok) return res.status(400).json({ error: "Ese certificado no corresponde a este pedido. Subí a ARCA el último pedido que te dio la app." });
      const prueba = { ...arca, key, cert: pem };
      delete prueba.pendKey;
      const pts = await puntosDeVenta(prueba, { force: true }); // solo lee: confirma que el acceso funciona
      arca = { ...prueba, vence: c.vence, csr: null };
      await guardarArca(arca);
      return res.status(200).json({ ok: true, puntos: pts });
    }
    if (b.action === "puntos") {
      if (!arca || !arca.cert) return res.status(400).json({ error: "Falta conectar ARCA." });
      return res.status(200).json({ ok: true, puntos: await puntosDeVenta(arca) });
    }
    if (b.action === "config") {
      if (!arca) return res.status(400).json({ error: "Falta conectar ARCA." });
      const next = { ...arca };
      if (b.ptoVta !== undefined) {
        const pto = Number(b.ptoVta) || null;
        const facturas = await leerFacturas(arca);
        if (pendientesDe(facturas).length) return res.status(400).json({ error: "Hay una factura a medio emitir: primero se tiene que resolver (tocá Emitir de nuevo o revisala en ARCA)." });
        if (pto) {
          const ultimo = await ultimoNumero({ ...arca, ptoVta: pto }, FACTURA_B);
          const propio = maxPropio(facturas, pto);
          if (ultimo !== propio) return res.status(400).json({ error: `El punto de venta ${pto} ya tiene ${ultimo - propio} facturas hechas por otro sistema (por ejemplo, las de Mercado Libre). Creá en ARCA un punto de venta nuevo solo para esta app.` });
        }
        next.ptoVta = pto;
      }
      if (b.alicuota !== undefined) { if (b.alicuota !== null && !ALICUOTAS[String(b.alicuota)]) return res.status(400).json({ error: "Alícuota inválida." }); next.alicuota = b.alicuota; }
      if (b.desde !== undefined) next.desde = /^\d{4}-\d{2}-\d{2}$/.test(b.desde) ? b.desde : null;
      if (b.emisor) next.emisor = { ...(arca.emisor || {}), ...Object.fromEntries(Object.entries(b.emisor).map(([k, v]) => [k, String(v || "").slice(0, 120)])) };
      await guardarArca(next);
      return res.status(200).json({ ok: true, arca: publico(next) });
    }
    if (b.action === "mail") {
      const resendKey = String(b.resendKey || "").trim() || (sec.mail && sec.mail.resendKey);
      const from = String(b.from || "").trim();
      if (!resendKey || !/^re_/.test(resendKey)) return res.status(400).json({ error: "La clave de Resend empieza con re_." });
      if (!/@/.test(from)) return res.status(400).json({ error: "Falta el email que envía (por ejemplo: Impoluto <facturas@impolutocar.com>)." });
      await redis.hset(SECRETS, { mail: JSON.stringify({ resendKey, from, replyTo: String(b.replyTo || "").trim() || null }) });
      return res.status(200).json({ ok: true });
    }
    if (b.action === "emitir") {
      if (!arca || !arca.cert || !arca.key) return res.status(400).json({ error: "Falta conectar ARCA." });
      if (!arca.ptoVta) return res.status(400).json({ error: "Elegí el punto de venta." });
      if (!ALICUOTAS[String(arca.alicuota)]) return res.status(400).json({ error: "Falta definir la alícuota de IVA (confirmala con tu contador)." });
      const e = arca.emisor || {};
      if (!e.razon || !e.domicilio || !e.inicio) return res.status(400).json({ error: "Completá tus datos de la factura (nombre, domicilio e inicio de actividades)." });
      const ids = [...new Set((b.ids || []).map(String))].slice(0, MAX_POR_VEZ);
      if (!ids.length) return res.status(400).json({ error: "No elegiste pedidos." });
      // Una sola emisión a la vez: los números de factura van en orden.
      if (!sec.shopify) return res.status(400).json({ error: "Falta conectar Shopify." });
      const token = "t-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      const lock = await redis.set(LOCK, token, { nx: true, ex: 90 });
      if (!lock) return res.status(409).json({ error: "Ya se están emitiendo facturas. Esperá unos segundos." });
      const out = [];
      try {
        const facturas = await leerFacturas(arca);
        await resolverPendientes(arca, facturas);
        for (const id of ids) {
          if (facturas[id]) { out.push({ id, ok: true, ya: true, f: facturas[id] }); continue; }
          // El pedido se vuelve a leer de Shopify en este momento: si lo cancelaron o devolvieron, no se factura.
          let o;
          try { o = await fetchOrder(sec.shopify, id); } catch (err) { out.push({ id, ok: false, error: "No se pudo verificar el pedido en Shopify: " + err.message }); continue; }
          if (o) await redis.hset(ORDERS, { [id]: JSON.stringify(o) });
          const motivo = motivoNoFacturable(o);
          if (motivo) { out.push({ id, ok: false, error: motivo }); continue; }
          try {
            const f = await emitirUno(arca, o, facturas);
            let mail = null;
            if (b.email !== false && sec.mail) { try { await enviarEmail(sec, arca, f); mail = true; } catch (err) { mail = err.message; } }
            out.push({ id, ok: true, f, mail });
          } catch (err) { out.push({ id, ok: false, error: err.message }); break; }
        }
      } finally { if ((await redis.get(LOCK)) === token) await redis.del(LOCK); }
      return res.status(200).json({ ok: true, resultados: out });
    }
    if (b.action === "email") {
      if (!arca) return res.status(400).json({ error: "Falta conectar ARCA." });
      const f = (await leerFacturas(arca))[String(b.id)];
      if (!f || f.estado !== "emitida") return res.status(400).json({ error: "Esa factura no está emitida." });
      const env = await enviarEmail(sec, arca, f);
      return res.status(200).json({ ok: true, f: env });
    }
    if (b.action === "desconectar") {
      await redis.hdel(SECRETS, "arca");
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Acción desconocida." });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
