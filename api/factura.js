// Facturador: arma las facturas B de los pedidos pagados de Shopify y las emite en ARCA cuando el usuario toca «Emitir».
// Nunca factura solo: cada emisión la pide el usuario desde la app.
import { redis, SECRETS, ORDERS, isAuthed, deny, setupError, readJson, getSecrets, safeParse } from "./_lib.js";
import { nuevaClave, certCorresponde, cuitValido, puntosDeVenta, ultimoNumero, consultar, solicitarCae, montos, ALICUOTAS, FACTURA_A, NC_A, FACTURA_B, NC_B, COND_IVA_A, esFactura, esNC, ncDe, letra } from "./_arca.js";
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
const maxPropio = (facturas, pto, tipo = FACTURA_B) => Math.max(0, ...Object.values(facturas).filter((f) => f.pto === pto && (f.tipo || FACTURA_B) === tipo).map((f) => Number(f.nro) || 0));
const nombreTipo = (t) => (esNC(t) ? "nota de crédito " : "factura ") + letra(t);
// Claves del registro: la factura vigente de un pedido va con el id del pedido; las notas de crédito y las facturas anuladas, aparte.
const claveAnulada = (f) => `anulada:${f.orderId}:${f.tipo === FACTURA_A ? "A" : ""}${f.nro}`;

// Una nota de crédito emitida anula su factura: la factura pasa a «anulada» y el pedido se puede volver a facturar si sigue pagado.
async function finalizarNC(arca, facturas, nc) {
  const f = facturas[nc.orderId];
  if (!f || !esFactura(f.tipo) || f.tipo !== nc.asociado.tipo || f.nro !== nc.asociado.nro || f.pto !== nc.asociado.pto) return;
  const an = { ...f, estado: "anulada", anuladaPor: { pto: nc.pto, nro: nc.nro, fecha: nc.fecha, cae: nc.cae } };
  await guardarFactura(arca, claveAnulada(f), an); facturas[claveAnulada(f)] = an;
  await redis.hdel(factKey(arca), nc.orderId); delete facturas[nc.orderId];
}

// ¿Se puede facturar este pedido? Devuelve el motivo si no.
export function motivoNoFacturable(o, { conCuit = false } = {}) {
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
  if (!conCuit && total >= TOPE_CF) return "Supera $10.000.000: hay que pedirle el DNI al cliente.";
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
  // Si se cortó justo después de guardar una nota de crédito, se termina de anular su factura.
  for (const nc of Object.values(facturas).filter((x) => esNC(x.tipo) && x.estado === "emitida")) await finalizarNC(arca, facturas, nc);
  for (const [oid, f] of Object.entries(facturas)) {
    if (f.estado !== "enviando" && f.estado !== "revisar") continue;
    const cfg = { ...arca, ptoVta: f.pto };
    const c = await consultar(cfg, f.nro, f.tipo || FACTURA_B); // si ARCA no responde bien, tira error y no se toca nada
    if (c.existe && Math.abs(c.total - f.total) < 0.01) {
      const ok = { ...f, ...montos(f.total, f.alicuota), estado: "emitida", cae: c.cae, vto: c.vto, fecha: c.fecha || f.fecha, aviso: undefined };
      await guardarFactura(arca, oid, ok); facturas[oid] = ok;
      if (esNC(ok.tipo)) await finalizarNC(arca, facturas, ok);
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
      if (!(edad > ESPERA_MS)) throw new Error(`La ${nombreTipo(f.tipo)} del pedido ${f.pedido} quedó a medio emitir hace un momento. Esperá ${Math.ceil((ESPERA_MS - (edad || 0)) / 60000)} minutos y tocá Emitir de nuevo: la app confirma en ARCA si salió antes de seguir.`);
      await redis.hdel(factKey(arca), oid); delete facturas[oid]; continue;
    }
    const r = { ...f, estado: "revisar", aviso: `ARCA ya pasó el número ${numeroFactura(f)} pero no lo encuentra. Revisalo en ARCA antes de seguir.` };
    await guardarFactura(arca, oid, r); facturas[oid] = r;
    throw new Error(r.aviso);
  }
}

// Pide el CAE de un comprobante (factura o nota de crédito) con todos los controles: punto de venta propio,
// registro previo, consulta si se corta, y nunca se borra sin certeza.
async function emitirComp(arca, facturas, clave, datos) {
  const tipo = datos.tipo;
  const ultimo = await ultimoNumero(arca, tipo);
  const propio = maxPropio(facturas, arca.ptoVta, tipo);
  if (ultimo !== propio) throw new Error(`En el punto de venta ${arca.ptoVta} emitió otro sistema (ARCA va por el ${ultimo}, la app por el ${propio}). No se emite nada para no mezclar con Mercado Libre: usá un punto de venta solo para esta app.`);
  const nro = ultimo + 1;
  const total = datos.total;
  // La nota de crédito usa la alícuota de SU factura (aunque después se haya cambiado la configuración).
  const alicuota = datos.alicuota || arca.alicuota;
  const base = { ...datos, pto: arca.ptoVta, nro, fecha: yyyymmdd(hoyAR()), alicuota, entorno: arca.entorno || "prod", cuit: arca.cuit, ...montos(total, alicuota) };
  // Se anota ANTES de pedir el CAE: si se corta, la próxima vez se consulta en ARCA y no se duplica.
  base.sentAt = new Date().toISOString();
  await guardarFactura(arca, clave, { ...base, estado: "enviando" });
  facturas[clave] = { ...base, estado: "enviando" };
  let r;
  try {
    r = await solicitarCae(arca, { nro, fecha: base.fecha, total, alicuota, tipo, asociado: datos.asociado || null, receptor: datos.receptor ? { cuit: datos.receptor.cuit, cond: datos.receptor.cond } : null });
  } catch (e) {
    // Sin respuesta clara de ARCA: nunca se borra. Si salió, se guarda; si no se sabe, queda «revisar».
    const c = await consultar(arca, nro, tipo).catch(() => null);
    if (c && c.existe && Math.abs(c.total - total) < 0.01) r = { ok: true, cae: c.cae, vto: c.vto, ...montos(total, alicuota) };
    else {
      const rev = { ...base, estado: "revisar", aviso: "Se cortó la comunicación con ARCA: " + e.message };
      await guardarFactura(arca, clave, rev); facturas[clave] = rev;
      throw new Error(rev.aviso + ". No se emite nada más hasta confirmar en ARCA si salió (se revisa sola en la próxima emisión).");
    }
  }
  if (!r.ok) {
    if (r.resultado === "R") { await redis.hdel(factKey(arca), clave); delete facturas[clave]; throw new Error(`ARCA rechazó la ${nombreTipo(tipo)}: ` + ([...(r.errs || []), ...(r.obs || [])].join(" · ") || "sin detalle")); }
    const rev = { ...base, estado: "revisar", aviso: "Respuesta de ARCA poco clara: " + ([...(r.errs || []), ...(r.obs || [])].join(" · ") || "sin resultado") };
    await guardarFactura(arca, clave, rev); facturas[clave] = rev;
    throw new Error(rev.aviso);
  }
  const f = { ...base, total: r.total, neto: r.neto, iva: r.iva, cae: r.cae, vto: r.vto, estado: "emitida", at: new Date().toISOString(), obs: r.obs && r.obs.length ? r.obs : undefined };
  await guardarFactura(arca, clave, f);
  facturas[clave] = f;
  return f;
}

// receptor (solo factura A): { cuit, cond: "ri" | "mono", razon, domicilio }
const emitirUno = (arca, o, facturas, receptor = null) => emitirComp(arca, facturas, o.id, {
  tipo: receptor ? FACTURA_A : FACTURA_B, receptor: receptor || undefined, pedido: o.n, orderId: o.id, items: itemsDe(o), envio: Number(o.ship) || 0, total: Number(o.cur != null ? o.cur : o.tot),
});

// Nota de crédito B por el total de la factura vigente del pedido.
async function emitirNC(arca, facturas, orderId) {
  const f = facturas[orderId];
  if (!f || !esFactura(f.tipo)) throw new Error("Ese pedido no tiene una factura vigente.");
  if (f.estado !== "emitida") throw new Error("La factura todavía no está confirmada en ARCA.");
  const tipoNC = ncDe(f.tipo);
  const ya = Object.values(facturas).find((x) => x.tipo === tipoNC && x.orderId === orderId && x.asociado && x.asociado.tipo === f.tipo && x.asociado.nro === f.nro && x.asociado.pto === f.pto);
  if (ya) { if (ya.estado === "emitida") { await finalizarNC(arca, facturas, ya); return ya; } throw new Error("La nota de crédito de esta factura quedó a medio emitir: tocá de nuevo en unos minutos."); }
  if (f.pto !== arca.ptoVta) throw new Error(`La factura es del punto de venta ${f.pto} y ahora usás el ${arca.ptoVta}. La nota de crédito tiene que salir del mismo punto: hacela desde ARCA.`);
  const nc = await emitirComp(arca, facturas, `nc:${orderId}:${letra(f.tipo)}${f.nro}`, {
    tipo: tipoNC, pedido: f.pedido, orderId, items: f.items, envio: f.envio, total: f.total, alicuota: f.alicuota, receptor: f.receptor || undefined,
    asociado: { tipo: f.tipo, pto: f.pto, nro: f.nro, fecha: f.fecha },
  });
  await finalizarNC(arca, facturas, nc);
  return nc;
}

async function enviarEmail(sec, arca, f) {
  if (!esFactura(f.tipo) || f.estado !== "emitida") throw new Error("Solo se manda por email una factura vigente.");
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
    body: JSON.stringify({ from: mail.from, to: [c.email], reply_to: mail.replyTo || undefined, subject: `Tu factura de Impoluto · pedido ${f.pedido}`, html, attachments: [{ filename: `Factura-${letra(f.tipo)}-${numeroFactura(f)}.pdf`, content: pdf.toString("base64") }] }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("No se pudo mandar el email: " + (j.message || r.status)); }
  // Se vuelve a leer: si mientras tanto la anularon, no se pisa el registro.
  const actualRaw = await redis.hget(factKey(arca), f.orderId);
  const actual = typeof actualRaw === "string" ? safeParse(actualRaw) : actualRaw;
  if (!actual || actual.tipo !== f.tipo || actual.nro !== f.nro || actual.pto !== f.pto || actual.estado !== "emitida") return f;
  const env = { ...actual, emailAt: new Date().toISOString() };
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
      if (!f || (f.estado !== "emitida" && f.estado !== "anulada")) return deny(res, 404, "Ese comprobante no existe.");
      const pdf = await facturaPdf(arca, arca.emisor || {}, f);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${esNC(f.tipo) ? "Nota-de-Credito" : "Factura"}-${letra(f.tipo)}-${numeroFactura(f)}.pdf"`);
      return res.status(200).send(pdf);
    }
    const facturas = await leerFacturas(arca);
    const desde = (arca && arca.desde) || hoyAR().slice(0, 8) + "01";
    const ords = await leerHash(ORDERS);
    const pendientes = Object.values(ords)
      .filter((o) => o && dayOf(o.c) >= desde && !facturas[o.id] && !Object.values(facturas).some((f) => esNC(f.tipo) && f.orderId === o.id && f.estado !== "emitida"))
      .map((o) => ({ id: o.id, n: o.n, c: o.c, total: Number(o.cur != null ? o.cur : o.tot), motivo: motivoNoFacturable(o) }))
      .filter((o) => !/prueba|cancelado/i.test(o.motivo || ""))
      .sort((a, b) => a.c.localeCompare(b.c));
    // Pedidos con factura vigente que después se cancelaron o devolvieron: necesitan nota de crédito.
    const aAnular = Object.entries(facturas)
      .filter(([k, f]) => k === f.orderId && esFactura(f.tipo) && f.estado === "emitida")
      .map(([k, f]) => ({ f, o: ords[k] }))
      .filter(({ o }) => o && (o.x || Number(o.ref) > 0 || /REFUNDED|VOIDED/.test(o.f || "")))
      .map(({ f, o }) => {
        const parcial = !o.x && o.f === "PARTIALLY_REFUNDED";
        return { orderId: f.orderId, pedido: f.pedido, nro: f.nro, pto: f.pto, total: f.total, parcial, motivo: o.x ? "Se canceló" : parcial ? "Devolución parcial: consultá al contador antes de anular (la nota de crédito es por el total)" : "Se devolvió" };
      });
    const lista = Object.entries(facturas).map(([k, f]) => ({ ...f, clave: k })).sort((a, b) => (b.at || b.sentAt || "").localeCompare(a.at || a.sentAt || ""));
    return res.status(200).json({ arca: publico(arca), mail: sec.mail ? { from: sec.mail.from } : null, desde, pendientes, aAnular, facturas: lista });
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
      let avisoPto = null;
      if (b.ptoVta !== undefined) {
        const pto = Number(b.ptoVta) || null;
        const facturas = await leerFacturas(arca);
        if (pendientesDe(facturas).length) return res.status(400).json({ error: "Hay una factura a medio emitir: primero se tiene que resolver (tocá Emitir de nuevo o revisala en ARCA)." });
        if (pto) {
          const ultimo = await ultimoNumero({ ...arca, ptoVta: pto }, FACTURA_B);
          const propio = maxPropio(facturas, pto);
          if (ultimo !== propio) return res.status(400).json({ error: `El punto de venta ${pto} ya tiene ${ultimo - propio} facturas hechas por otro sistema (por ejemplo, las de Mercado Libre). Creá en ARCA un punto de venta nuevo solo para esta app.` });
          const ultimoNC = await ultimoNumero({ ...arca, ptoVta: pto }, NC_B);
          if (ultimoNC !== maxPropio(facturas, pto, NC_B)) return res.status(400).json({ error: `El punto de venta ${pto} ya tiene notas de crédito de otro sistema. Creá en ARCA un punto de venta nuevo solo para esta app.` });
          for (const t of [FACTURA_A, NC_A]) {
            // Si el CUIT no puede hacer A, ARCA puede no responder este tipo. Igual, antes de cada factura A se vuelve a controlar.
            const u = await ultimoNumero({ ...arca, ptoVta: pto }, t).catch((e) => { avisoPto = "No se pudo verificar la factura A en este punto de venta (" + e.message + "). Se controla otra vez antes de emitir cada una."; return null; });
            if (u != null && u !== maxPropio(facturas, pto, t)) return res.status(400).json({ error: `El punto de venta ${pto} ya tiene ${t === FACTURA_A ? "facturas A" : "notas de crédito A"} de otro sistema. Creá en ARCA un punto de venta nuevo solo para esta app.` });
          }
        }
        next.ptoVta = pto;
      }
      if (b.alicuota !== undefined) { if (b.alicuota !== null && !ALICUOTAS[String(b.alicuota)]) return res.status(400).json({ error: "Alícuota inválida." }); next.alicuota = b.alicuota; }
      if (b.desde !== undefined) next.desde = /^\d{4}-\d{2}-\d{2}$/.test(b.desde) ? b.desde : null;
      if (b.emisor) next.emisor = { ...(arca.emisor || {}), ...Object.fromEntries(Object.entries(b.emisor).map(([k, v]) => [k, String(v || "").slice(0, 120)])) };
      await guardarArca(next);
      return res.status(200).json({ ok: true, arca: publico(next), aviso: avisoPto });
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
    if (b.action === "emitirA") {
      if (!arca || !arca.cert || !arca.key) return res.status(400).json({ error: "Falta conectar ARCA." });
      if (!arca.ptoVta) return res.status(400).json({ error: "Elegí el punto de venta." });
      if (!ALICUOTAS[String(arca.alicuota)]) return res.status(400).json({ error: "Falta definir la alícuota de IVA." });
      const e = arca.emisor || {};
      if (!e.razon || !e.domicilio || !e.inicio) return res.status(400).json({ error: "Completá tus datos de la factura (nombre, domicilio e inicio de actividades)." });
      if (!sec.shopify) return res.status(400).json({ error: "Falta conectar Shopify." });
      const cuit = String(b.cuit || "").replace(/\D/g, "");
      if (!cuitValido(cuit)) return res.status(400).json({ error: "El CUIT del cliente no es válido. Revisalo: son 11 números." });
      if (cuit === String(arca.cuit)) return res.status(400).json({ error: "Ese CUIT es el tuyo." });
      if (!COND_IVA_A[b.cond]) return res.status(400).json({ error: "Elegí si el cliente es responsable inscripto o monotributista." });
      const razon = String(b.razon || "").trim().slice(0, 120), domicilio = String(b.domicilio || "").trim().slice(0, 160);
      if (razon.length < 2 || domicilio.length < 4) return res.status(400).json({ error: "La factura A lleva el nombre o razón social y el domicilio del cliente." });
      const id = String(b.id || "");
      const token = "t-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      const lock = await redis.set(LOCK, token, { nx: true, ex: 90 });
      if (!lock) return res.status(409).json({ error: "Ya se está emitiendo algo. Esperá unos segundos." });
      try {
        const facturas = await leerFacturas(arca);
        await resolverPendientes(arca, facturas);
        if (facturas[id]) return res.status(400).json({ error: "Ese pedido ya tiene factura. Si tiene que ser A, primero anulala." });
        const o = await fetchOrder(sec.shopify, id);
        if (o) await redis.hset(ORDERS, { [id]: JSON.stringify(o) });
        const motivo = motivoNoFacturable(o, { conCuit: true });
        if (motivo) return res.status(400).json({ error: motivo });
        const f = await emitirUno(arca, o, facturas, { cuit, cond: b.cond, razon, domicilio });
        return res.status(200).json({ ok: true, f });
      } finally { if ((await redis.get(LOCK)) === token) await redis.del(LOCK); }
    }
    if (b.action === "anular") {
      if (!arca || !arca.cert || !arca.key) return res.status(400).json({ error: "Falta conectar ARCA." });
      if (!arca.ptoVta || !ALICUOTAS[String(arca.alicuota)]) return res.status(400).json({ error: "Falta el punto de venta o el IVA." });
      const token = "t-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      const lock = await redis.set(LOCK, token, { nx: true, ex: 90 });
      if (!lock) return res.status(409).json({ error: "Ya se está emitiendo algo. Esperá unos segundos." });
      try {
        const facturas = await leerFacturas(arca);
        await resolverPendientes(arca, facturas);
        const nc = await emitirNC(arca, facturas, String(b.id));
        return res.status(200).json({ ok: true, nc });
      } finally { if ((await redis.get(LOCK)) === token) await redis.del(LOCK); }
    }
    if (b.action === "email") {
      if (!arca) return res.status(400).json({ error: "Falta conectar ARCA." });
      const f = (await leerFacturas(arca))[String(b.id)];
      if (!f || f.estado !== "emitida" || !esFactura(f.tipo) || f.orderId !== String(b.id)) return res.status(400).json({ error: "Esa factura no está vigente." });
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
