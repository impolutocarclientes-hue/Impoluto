// Facturación electrónica con ARCA (ex AFIP): login WSAA + web service WSFEv1.
// La clave privada se genera y queda en el servidor (Redis, hash de secretos): nadie la ve ni la copia.
import forge from "node-forge";
import { redis } from "./_lib.js";
import https from "node:https";

// El servidor de facturación de ARCA usa una clave Diffie-Hellman de 1024 bits que Node rechaza por defecto
// ("dh key too small"). Autorizado por el usuario (5/11/2026): SOLO para hosts de ARCA bajamos TLS a SECLEVEL=1,
// que acepta 1024 bits. El resto de las conexiones de la app (Shopify, Meta, Mercado Pago) no cambia.
const agenteArca = new https.Agent({ ciphers: "DEFAULT@SECLEVEL=1", keepAlive: true });
const esHostArca = (u) => /(^|\.)afip\.gov\.ar$/.test(new URL(u).hostname);
export function arcaFetch(url, opts = {}) {
  if (!esHostArca(url)) return Promise.reject(new Error("arcaFetch solo se usa con ARCA"));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: opts.method || "GET", headers: opts.headers, agent: agenteArca, timeout: 25000 }, (res) => {
      const partes = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => { const txt = Buffer.concat(partes).toString("utf8"); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => txt }); });
    });
    req.on("timeout", () => req.destroy(new Error("ARCA no respondió a tiempo")));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const URLS = {
  prod: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
  homo: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
};
export const TA_KEY = "impoluto:arca_ta"; // ticket de acceso cacheado (vale 12 h; ARCA no da otro mientras siga vigente)

export const ALICUOTAS = { "10.5": 4, "21": 5 }; // Id de alícuota en ARCA
export const FACTURA_A = 1, NC_A = 3, FACTURA_B = 6, NC_B = 8;
export const COND_IVA_CONSUMIDOR_FINAL = 5;
// Condición frente al IVA del cliente de una factura A (tabla de ARCA).
export const COND_IVA_A = { ri: 1, mono: 6 };
export const esFactura = (t) => t === FACTURA_A || t === FACTURA_B;
export const esNC = (t) => t === NC_A || t === NC_B;
export const ncDe = (t) => (t === FACTURA_A ? NC_A : NC_B);
export const letra = (t) => (t === FACTURA_A || t === NC_A ? "A" : "B");

export const cuitValido = (c) => {
  const s = String(c || "").replace(/\D/g, "");
  if (s.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const r = 11 - (w.reduce((a, x, i) => a + x * Number(s[i]), 0) % 11);
  const dv = r === 11 ? 0 : r === 10 ? 9 : r;
  return dv === Number(s[10]);
};

// 1) Clave + pedido de certificado (CSR) para subir a ARCA.
export function nuevaClave(cuit, alias = "impolutoapp") {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: "Impoluto" },
    { name: "commonName", value: alias },
    { type: "2.5.4.5", value: "CUIT " + String(cuit).replace(/\D/g, ""), valueTagClass: forge.asn1.Type.PRINTABLESTRING }, // serialNumber
  ]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(keys.privateKey), csr: forge.pki.certificationRequestToPem(csr) };
}

// 2) El certificado que devuelve ARCA tiene que corresponder a la clave guardada.
export function certCorresponde(certPem, keyPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const ok = cert.publicKey.n.equals(key.n) && cert.publicKey.e.equals(key.e);
  return { ok, vence: cert.validity.notAfter.toISOString(), cn: (cert.subject.getField("CN") || {}).value || "" };
}

// ---------- SOAP mínimo ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Nombre exacto (FchVto no confunde con FchVtoPago) y las etiquetas vacías <X/> no se leen como abiertas.
const reTag = (name, flags) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</(?:\\w+:)?${name}>`, flags);
export const tag = (xml, name) => { const m = String(xml).match(reTag(name)); return m ? m[1] : null; };
export const tags = (xml, name) => [...String(xml).matchAll(reTag(name, "g"))].map((m) => m[1]);
const unesc = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// En Vercel, la conexión especial para ARCA; en local y en los tests, el fetch normal (que los tests reemplazan).
const fetchArca = (u, o) => (process.env.VERCEL ? arcaFetch(u, o) : globalThis.fetch(u, o));
async function soap(url, action, body, fetchImpl = fetchArca) {
  const env = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
  let r;
  try {
    r = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action }, body: env, signal: AbortSignal.timeout(25000) });
  } catch (e) {
    // Diagnóstico: el motivo real de la falla de conexión (TLS, DNS, timeout...).
    const c = e && e.cause;
    throw new Error(`No se pudo conectar con ARCA (${new URL(url).host}): ${(c && (c.code || c.name)) || e.name} ${(c && c.message) || e.message}`);
  }
  const txt = await r.text();
  const fault = tag(txt, "faultstring");
  if (fault) throw new Error("ARCA: " + unesc(fault));
  if (!r.ok) throw new Error("ARCA respondió " + r.status);
  return txt;
}

// 3) Login en WSAA: firma el pedido con la clave y el certificado, devuelve token + sign.
function tra(service) {
  const now = Date.now();
  const f = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now / 1000)}</uniqueId><generationTime>${f(now - 600000)}</generationTime><expirationTime>${f(now + 600000)}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
}
export function firmarTra(xml, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  p7.addCertificate(certPem);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: forge.pki.certificateFromPem(certPem),
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export async function ticket(cfg, { fetchImpl = fetchArca, force = false } = {}) {
  const ent = cfg.entorno === "homo" ? "homo" : "prod";
  const cacheKey = TA_KEY + ":" + ent + ":" + cfg.cuit;
  const c = await redis.get(cacheKey);
  const cached = typeof c === "string" ? JSON.parse(c) : c;
  const vigente = cached && cached.exp && Date.parse(cached.exp) - Date.now() > 10 * 60e3;
  if (!force && vigente) return cached;
  const cms = firmarTra(tra("wsfe"), cfg.cert, cfg.key);
  let xml;
  try {
    xml = await soap(URLS[ent].wsaa, "", `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms>`, fetchImpl);
  } catch (e) {
    // ARCA no da un acceso nuevo mientras el anterior siga vigente: se usa el guardado.
    if (vigente && /TA valido/i.test(e.message)) return cached;
    throw e;
  }
  const ret = unesc(tag(xml, "loginCmsReturn"));
  const ta = { token: tag(ret, "token"), sign: tag(ret, "sign"), exp: tag(ret, "expirationTime") };
  if (!ta.token || !ta.sign) throw new Error("ARCA no devolvió el acceso (revisá que el certificado esté asociado al servicio de factura electrónica).");
  await redis.set(cacheKey, JSON.stringify(ta), { ex: 12 * 3600 });
  return ta;
}

// ---------- WSFEv1 ----------
const FE = "http://ar.gov.afip.dif.FEV1/";
function auth(ta, cuit) { return `<Auth><Token>${ta.token}</Token><Sign>${ta.sign}</Sign><Cuit>${String(cuit).replace(/\D/g, "")}</Cuit></Auth>`; }
async function fe(cfg, metodo, inner, opts = {}) {
  const ta = await ticket(cfg, opts);
  const ent = cfg.entorno === "homo" ? "homo" : "prod";
  const xml = await soap(URLS[ent].wsfe, FE + metodo, `<${metodo} xmlns="${FE}">${auth(ta, cfg.cuit)}${inner}</${metodo}>`, opts.fetchImpl);
  const errs = tags(tag(xml, "Errors") || "", "Err").map((e) => `${tag(e, "Code")}: ${unesc(tag(e, "Msg"))}`);
  return { xml, errs };
}

export async function puntosDeVenta(cfg, opts) {
  const { xml, errs } = await fe(cfg, "FEParamGetPtosVenta", "", opts);
  const pts = tags(xml, "PtoVenta").map((p) => ({ nro: Number(tag(p, "Nro")), tipo: tag(p, "EmisionTipo"), baja: tag(p, "Bloqueado") === "S" || (tag(p, "FchBaja") || "NULL") !== "NULL" }));
  // "602: Sin resultados" = todavía no hay puntos de venta para web service.
  if (!pts.length && errs.length && !errs.some((e) => e.startsWith("602"))) throw new Error(errs.join(" · "));
  return pts;
}

export async function ultimoNumero(cfg, tipo = FACTURA_B, opts) {
  const { xml, errs } = await fe(cfg, "FECompUltimoAutorizado", `<PtoVta>${cfg.ptoVta}</PtoVta><CbteTipo>${tipo}</CbteTipo>`, opts);
  const n = tag(xml, "CbteNro");
  if (errs.length) throw new Error("ARCA: " + errs.join(" · "));
  if (n == null || !/^\d+$/.test(n.trim())) throw new Error("ARCA no devolvió el último número.");
  return Number(n);
}

export async function consultar(cfg, nro, tipo = FACTURA_B, opts) {
  const { xml, errs } = await fe(cfg, "FECompConsultar", `<FeCompConsReq><CbteTipo>${tipo}</CbteTipo><CbteNro>${nro}</CbteNro><PtoVta>${cfg.ptoVta}</PtoVta></FeCompConsReq>`, opts);
  const r = tag(xml, "ResultGet");
  if (!r) {
    if (errs.some((e) => e.startsWith("602"))) return { existe: false };
    throw new Error("No se pudo consultar en ARCA: " + (errs.join(" · ") || "respuesta vacía"));
  }
  return { existe: true, cae: tag(r, "CodAutorizacion"), vto: tag(r, "FchVto"), total: Number(tag(r, "ImpTotal")), fecha: tag(r, "CbteFch"), resultado: tag(r, "Resultado") };
}

// Montos de una factura B: el total trae el IVA adentro.
export function montos(total, alicuota) {
  const t = Math.round(Number(total) * 100) / 100;
  const r = Number(alicuota) / 100;
  const neto = Math.round((t / (1 + r)) * 100) / 100;
  const iva = Math.round((t - neto) * 100) / 100;
  return { total: t, neto, iva };
}

// Pide el CAE de UN comprobante con número fijo. Devuelve {ok, cae, vto} o {ok:false, errs, obs}.
// receptor: null = consumidor final (B); para A: { cuit, cond: "ri" | "mono" }
export async function solicitarCae(cfg, { nro, fecha, total, alicuota, tipo = FACTURA_B, asociado = null, receptor = null }, opts) {
  const esA = tipo === FACTURA_A || tipo === NC_A;
  if (esA && !(receptor && cuitValido(receptor.cuit) && COND_IVA_A[receptor.cond])) throw new Error("Falta el CUIT y la condición frente al IVA del cliente.");
  if (!esA && receptor) throw new Error("Una factura B no lleva CUIT del cliente.");
  const doc = esA ? `<DocTipo>80</DocTipo><DocNro>${String(receptor.cuit).replace(/\D/g, "")}</DocNro>` : `<DocTipo>99</DocTipo><DocNro>0</DocNro>`;
  const cond = esA ? COND_IVA_A[receptor.cond] : COND_IVA_CONSUMIDOR_FINAL;
  const ivaId = ALICUOTAS[String(alicuota)];
  if (!ivaId) throw new Error("Alícuota de IVA sin definir.");
  const m = montos(total, alicuota);
  const asoc = asociado ? `<CbtesAsoc><CbteAsoc><Tipo>${asociado.tipo}</Tipo><PtoVta>${asociado.pto}</PtoVta><Nro>${asociado.nro}</Nro><Cuit>${String(cfg.cuit).replace(/\D/g, "")}</Cuit><CbteFch>${asociado.fecha}</CbteFch></CbteAsoc></CbtesAsoc>` : "";
  const det = `<FECAEDetRequest><Concepto>1</Concepto>${doc}<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta><CbteFch>${fecha}</CbteFch><ImpTotal>${m.total.toFixed(2)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${m.neto.toFixed(2)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${m.iva.toFixed(2)}</ImpIVA><MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>${cond}</CondicionIVAReceptorId>${asoc}<Iva><AlicIva><Id>${ivaId}</Id><BaseImp>${m.neto.toFixed(2)}</BaseImp><Importe>${m.iva.toFixed(2)}</Importe></AlicIva></Iva></FECAEDetRequest>`;
  const inner = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${cfg.ptoVta}</PtoVta><CbteTipo>${tipo}</CbteTipo></FeCabReq><FeDetReq>${det}</FeDetReq></FeCAEReq>`;
  const { xml, errs } = await fe(cfg, "FECAESolicitar", inner, opts);
  const d = tag(xml, "FECAEDetResponse") || "";
  const obs = tags(tag(d, "Observaciones") || "", "Obs").map((o) => `${tag(o, "Code")}: ${unesc(tag(o, "Msg"))}`);
  const resultado = tag(d, "Resultado") || tag(tag(xml, "FeCabResp") || "", "Resultado");
  const cae = tag(d, "CAE");
  if (resultado === "A" && cae && /^\d{14}$/.test(cae.trim())) return { ok: true, resultado, cae: cae.trim(), vto: tag(d, "CAEFchVto"), obs, ...m };
  return { ok: false, resultado: resultado || null, errs, obs, ...m };
}

// Contenido del QR obligatorio (RG 4892).
export function qrUrl(cfg, f) {
  const fecha = `${f.fecha.slice(0, 4)}-${f.fecha.slice(4, 6)}-${f.fecha.slice(6, 8)}`;
  const data = { ver: 1, fecha, cuit: Number(String(cfg.cuit).replace(/\D/g, "")), ptoVta: Number(f.pto), tipoCmp: f.tipo, nroCmp: f.nro, importe: f.total, moneda: "PES", ctz: 1, tipoDocRec: f.receptor ? 80 : 99, nroDocRec: f.receptor ? Number(String(f.receptor.cuit).replace(/\D/g, "")) : 0, tipoCodAut: "E", codAut: Number(f.cae) };
  return "https://www.afip.gob.ar/fe/qr/?p=" + Buffer.from(JSON.stringify(data)).toString("base64");
}
