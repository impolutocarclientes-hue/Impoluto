// Facturador contra un ARCA simulado: firma, numeración, no duplicar, corte de conexión.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import forge from "node-forge";

// ---- Upstash falso ----
const store = new Map();
const hh = (k) => { let h = store.get(k); if (!(h instanceof Map)) { h = new Map(); store.set(k, h); } return h; };
function run([c, ...a]) {
  switch (String(c).toUpperCase()) {
    case "HSET": { const h = hh(a[0]); for (let i = 1; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case "HGETALL": { const h = store.get(a[0]); return h instanceof Map ? [...h].flat() : []; }
    case "HDEL": { const h = store.get(a[0]); let n = 0; if (h instanceof Map) for (const f of a.slice(1)) n += h.delete(f) ? 1 : 0; return n; }
    case "DEL": { let n = 0; for (const k of a) n += store.delete(k) ? 1 : 0; return n; }
    case "GET": { const v = store.get(a[0]); return typeof v === "string" ? v : null; }
    case "SET": { const o = a.slice(2).map((x) => String(x).toUpperCase()); if (o.includes("NX") && store.has(a[0])) return null; store.set(a[0], String(a[1])); return "OK"; }
    default: throw new Error("cmd " + c);
  }
}
const srv = http.createServer(async (req, res) => {
  const ch = []; for await (const c of req) ch.push(c);
  const body = JSON.parse(Buffer.concat(ch).toString() || "null");
  const b64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
  const enc = (v) => (b64 ? (typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(enc) : v) : v);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(req.url.startsWith("/pipeline") ? body.map((c) => ({ result: enc(run(c)) })) : { result: enc(run(body)) }));
});
await new Promise((r) => srv.listen(0, r));
process.env.KV_REST_API_URL = "http://127.0.0.1:" + srv.address().port;
process.env.KV_REST_API_TOKEN = "t";
process.env.APP_PASSWORD = "clave-test";

// ---- ARCA falso ----
const arcaFake = { last: 41, comps: {}, cortar: false, logins: 0, cmsOk: false };
const tagv = (x, n) => (String(x).match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith(process.env.KV_REST_API_URL)) return realFetch(url, opts);
  const body = String(opts.body || "");
  const xml = (inner) => new Response(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`, { status: 200 });
  if (url.includes("LoginCms")) {
    arcaFake.logins++;
    const cms = tagv(body, "in0");
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
    arcaFake.cmsOk = /<service>wsfe<\/service>/.test(p7.rawCapture.content ? forge.asn1.toDer(p7.rawCapture.content).getBytes() : "") || /wsfe/.test(JSON.stringify(p7.contentInfo || {})) || !!p7.certificates.length;
    const ret = `<loginTicketResponse><credentials><token>TOK</token><sign>SIG</sign></credentials><header><expirationTime>${new Date(Date.now() + 12 * 3600e3).toISOString()}</expirationTime></header></loginTicketResponse>`.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return xml(`<loginCmsResponse><loginCmsReturn>${ret}</loginCmsReturn></loginCmsResponse>`);
  }
  const action = String(opts.headers.SOAPAction).split("/").pop();
  assert.match(body, /<Token>TOK<\/Token><Sign>SIG<\/Sign><Cuit>20111111112<\/Cuit>/);
  if (action === "FEParamGetPtosVenta") return xml(`<R><ResultGet><PtoVenta><Nro>3</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta></ResultGet></R>`);
  if (action === "FECompUltimoAutorizado") return xml(`<R><CbteNro>${arcaFake.last}</CbteNro></R>`);
  if (action === "FECompConsultar") {
    const c = arcaFake.comps[tagv(body, "CbteNro")];
    return xml(c ? `<R><ResultGet><CbteFch>${c.fecha}</CbteFch><ImpTotal>${c.total}</ImpTotal><CodAutorizacion>${c.cae}</CodAutorizacion><FchVto>20261120</FchVto><Resultado>A</Resultado></ResultGet></R>` : `<R><Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors></R>`);
  }
  if (action === "FECAESolicitar") {
    const nro = Number(tagv(body, "CbteDesde"));
    assert.equal(tagv(body, "CondicionIVAReceptorId"), "5");
    assert.equal(tagv(body, "DocTipo"), "99");
    if (nro !== arcaFake.last + 1) return xml(`<R><FECAEDetResponse><Resultado>R</Resultado></FECAEDetResponse><Errors><Err><Code>10016</Code><Msg>Numero no correlativo</Msg></Err></Errors></R>`);
    const neto = Number(tagv(body, "ImpNeto")), iva = Number(tagv(body, "ImpIVA")), total = Number(tagv(body, "ImpTotal"));
    assert.ok(Math.abs(neto + iva - total) < 0.001);
    arcaFake.last = nro;
    arcaFake.comps[nro] = { total, fecha: tagv(body, "CbteFch"), cae: "7" + String(nro).padStart(13, "0") };
    if (arcaFake.cortar) { arcaFake.cortar = false; throw new Error("socket hang up"); }
    return xml(`<R><FECAEDetResponse><Resultado>A</Resultado><CAE>${arcaFake.comps[nro].cae}</CAE><CAEFchVto>20261120</CAEFchVto></FECAEDetResponse></R>`);
  }
  throw new Error("URL inesperada " + url);
};

const { sessionToken, redis, ORDERS } = await import("../api/_lib.js");
const { default: handler } = await import("../api/factura.js");
const A = await import("../api/_arca.js");

async function call(method, body, query) {
  const req = { method, body, query: query || {}, headers: { cookie: "imp_auth=" + sessionToken() }, url: "/api/factura" };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; }, send(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); return this; }, end() { resolve({ status: this.statusCode }); } };
    handler(req, res);
  });
}

const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const order = (id, total, extra = {}) => ({ id, n: "#" + id, c: hoy + "T15:00:00Z", x: null, t: false, f: "PAID", tot: total, cur: total, ship: 0, ref: 0, li: [{ ti: "Impoluto · Restaurador", vt: "Default Title", q: 1, cq: 1, tot: total }], ...extra });

test("CUIT y montos de factura B", () => {
  assert.ok(A.cuitValido("20-11111111-2"));
  assert.ok(!A.cuitValido("20111111113"));
  assert.deepEqual(A.montos(42990, 10.5), { total: 42990, neto: 38904.98, iva: 4085.02 });
  assert.deepEqual(A.montos(56990, 21), { total: 56990, neto: 47099.17, iva: 9890.83 });
});

test("Conectar, emitir en orden, no duplicar y sobrevivir a un corte", async (t) => {
  t.after(() => srv.close());
  await redis.hset(ORDERS, {
    "1001": JSON.stringify(order("1001", 42990)), "1002": JSON.stringify(order("1002", 56990)), "1003": JSON.stringify(order("1003", 67990)),
    "1004": JSON.stringify(order("1004", 42990, { f: "PENDING" })), "1005": JSON.stringify(order("1005", 42990, { x: hoy + "T16:00:00Z" })),
  });
  // 1) Pedido de certificado
  let r = await call("POST", { action: "preparar", cuit: "20111111112" });
  assert.equal(r.status, 200);
  assert.match(r.body.csr, /BEGIN CERTIFICATE REQUEST/);
  const csr = forge.pki.certificationRequestFromPem(r.body.csr);
  assert.ok(csr.verify());
  // ARCA firma el certificado (simulado con una CA propia)
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 2 * 365 * 864e5);
  cert.setSubject(csr.subject.attributes); cert.setIssuer([{ name: "commonName", value: "Computadores Test" }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  // Un certificado de otra clave se rechaza
  const otra = forge.pki.rsa.generateKeyPair(1024); const malo = forge.pki.createCertificate();
  malo.publicKey = otra.publicKey; malo.serialNumber = "02"; malo.validity.notBefore = new Date(); malo.validity.notAfter = new Date(Date.now() + 864e5);
  malo.setSubject([{ name: "commonName", value: "x" }]); malo.setIssuer([{ name: "commonName", value: "x" }]); malo.sign(otra.privateKey, forge.md.sha256.create());
  r = await call("POST", { action: "certificado", cert: forge.pki.certificateToPem(malo) });
  assert.equal(r.status, 400);
  r = await call("POST", { action: "certificado", cert: forge.pki.certificateToPem(cert) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.puntos[0].nro, 3);
  assert.ok(arcaFake.cmsOk);

  // 2) Sin alícuota / datos no deja emitir
  r = await call("POST", { action: "emitir", ids: ["1001"] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /punto de venta/);
  // El punto 3 ya tiene 41 facturas de otro sistema (Mercado Libre): no se deja elegir
  r = await call("POST", { action: "config", ptoVta: 3 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /otro sistema/);
  arcaFake.last = 0;
  r = await call("POST", { action: "config", ptoVta: 3 });
  assert.equal(r.status, 200);
  r = await call("POST", { action: "emitir", ids: ["1001"] });
  assert.match(r.body.error, /tus datos/); // la alícuota ya viene en 21 %
  await call("POST", { action: "config", alicuota: null });
  r = await call("POST", { action: "emitir", ids: ["1001"] });
  assert.match(r.body.error, /alícuota/);
  await call("POST", { action: "config", alicuota: "21", emisor: { razon: "Juan Prueba", domicilio: "Calle 123, Lomas de Zamora", inicio: "01/03/2026" } });

  // 3) Pendientes: no aparecen cancelados; el impago aparece con motivo
  r = await call("GET");
  const ids = r.body.pendientes.map((p) => p.id);
  assert.deepEqual(ids.sort(), ["1001", "1002", "1003", "1004"]);
  assert.match(r.body.pendientes.find((p) => p.id === "1004").motivo, /No está pagado/);

  // 4) Emitir dos: números 42 y 43, en orden
  r = await call("POST", { action: "emitir", ids: ["1001", "1002", "1004"] });
  assert.equal(r.status, 200);
  const [a, b, c] = r.body.resultados;
  assert.equal(a.f.nro, 1); assert.equal(b.f.nro, 2);
  assert.equal(c.ok, false);
  assert.equal(a.f.total, 42990);

  // 5) Volver a emitir el mismo pedido no crea otra factura
  r = await call("POST", { action: "emitir", ids: ["1001"] });
  assert.equal(r.body.resultados[0].ya, true);
  assert.equal(arcaFake.last, 2);

  // 6) Se corta la conexión justo cuando ARCA aprobó: se consulta y se guarda, sin duplicar
  arcaFake.cortar = true;
  r = await call("POST", { action: "emitir", ids: ["1003"] });
  assert.equal(r.body.resultados[0].ok, true, JSON.stringify(r.body));
  assert.equal(r.body.resultados[0].f.nro, 3);
  assert.equal(arcaFake.last, 3);
  assert.equal(Object.keys(arcaFake.comps).length, 3);

  // Si otro sistema factura en el mismo punto de venta, la app frena y no emite
  arcaFake.last = 10;
  await redis.hset(ORDERS, { "1006": JSON.stringify(order("1006", 42990)) });
  r = await call("POST", { action: "emitir", ids: ["1006"] });
  assert.equal(r.body.resultados[0].ok, false);
  assert.match(r.body.resultados[0].error, /otro sistema/);
  assert.equal(arcaFake.last, 10);

  // 7) El login a ARCA se reutiliza (ARCA no da otro mientras el anterior sigue vigente)
  assert.equal(arcaFake.logins, 1);

  // 8) PDF
  r = await call("GET", null, { pdf: "1002" });
  assert.equal(r.headers["Content-Type"], "application/pdf");
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");
});
