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
    case "HGET": { const h = store.get(a[0]); return h instanceof Map && h.has(a[1]) ? h.get(a[1]) : null; }
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
const arcaFake = { lastA: 0, lastNCA: 0, compsA: {}, aBody: null, ncaBody: null, last: 41, lastNC: 0, comps: {}, ncs: {}, ncBody: null, cortar: false, lento: null, consultaFalla: false, logins: 0, cmsOk: false };
// ---- Shopify falso: el pedido "de verdad" en este momento ----
const shopOrders = {};
const raw = (o) => ({ id: "gid://shopify/Order/" + o.id, name: o.n, createdAt: o.c, processedAt: o.c, updatedAt: o.c, cancelledAt: o.x, test: o.t, displayFinancialStatus: o.f, paymentGatewayNames: ["mercado_pago"], sourceName: o.s,
  totalPriceSet: { shopMoney: { amount: String(o.tot) } }, currentTotalPriceSet: { shopMoney: { amount: String(o.cur) } }, totalDiscountsSet: { shopMoney: { amount: "0" } }, totalShippingPriceSet: { shopMoney: { amount: String(o.ship || 0) } }, totalRefundedSet: { shopMoney: { amount: String(o.ref || 0) } }, discountCodes: [],
  lineItems: { nodes: o.li.map((l) => ({ quantity: l.q, currentQuantity: l.cq, sku: "", name: l.ti, title: l.ti, variantTitle: l.vt, product: { id: "gid://shopify/Product/1" }, variant: { id: "gid://shopify/ProductVariant/1" }, discountedTotalSet: { shopMoney: { amount: String(l.tot) } }, originalTotalSet: { shopMoney: { amount: String(l.tot) } } })) } });
const tagv = (x, n) => (String(x).match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith(process.env.KV_REST_API_URL)) return realFetch(url, opts);
  if (url.includes("myshopify.com")) {
    if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: "shp", scope: "read_orders", expires_in: 86399 }));
    const { variables } = JSON.parse(opts.body);
    const id = String(variables.id).split("/").pop();
    return new Response(JSON.stringify({ data: { order: shopOrders[id] ? raw(shopOrders[id]) : null } }));
  }
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
  if (action === "FECompUltimoAutorizado") { const t = tagv(body, "CbteTipo"); return xml(`<R><CbteNro>${t === "8" ? arcaFake.lastNC : t === "1" ? arcaFake.lastA : t === "3" ? arcaFake.lastNCA : arcaFake.last}</CbteNro></R>`); }
  if (action === "FECAESolicitar" && (tagv(body, "CbteTipo") === "1" || tagv(body, "CbteTipo") === "3")) {
    const t = tagv(body, "CbteTipo"), nro = Number(tagv(body, "CbteDesde"));
    assert.equal(tagv(body, "DocTipo"), "80");
    const ultimo = t === "1" ? arcaFake.lastA : arcaFake.lastNCA;
    if (nro !== ultimo + 1) return xml(`<R><FECAEDetResponse><Resultado>R</Resultado></FECAEDetResponse></R>`);
    if (t === "1") { arcaFake.aBody = body; arcaFake.lastA = nro; arcaFake.compsA[nro] = { total: Number(tagv(body, "ImpTotal")), doc: tagv(body, "DocNro") }; }
    else { arcaFake.ncaBody = body; assert.equal(tagv(body, "DocNro"), arcaFake.compsA[Number(tagv(tagv(body, "CbteAsoc"), "Nro"))].doc); arcaFake.lastNCA = nro; }
    return xml(`<R><FECAEDetResponse><Resultado>A</Resultado><CAE>${t}${String(nro).padStart(13, "0")}</CAE><CAEFchVto>20261120</CAEFchVto></FECAEDetResponse></R>`);
  }
  if (action === "FECompConsultar") {
    if (arcaFake.consultaFalla) return xml(`<R><Errors><Err><Code>500</Code><Msg>Error interno de aplicacion</Msg></Err></Errors></R>`);
    const c = (tagv(body, "CbteTipo") === "8" ? arcaFake.ncs : arcaFake.comps)[tagv(body, "CbteNro")];
    // Como ARCA real: FchVtoPago vacío ANTES de FchVto
    return xml(c ? `<R><ResultGet><CbteFch>${c.fecha}</CbteFch><FchVtoPago /><ImpTotal>${c.total}</ImpTotal><MonId>PES</MonId><CodAutorizacion>${c.cae}</CodAutorizacion><FchVto>20261120</FchVto><Resultado>A</Resultado></ResultGet></R>` : `<R><Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors></R>`);
  }
  if (action === "FECAESolicitar" && tagv(body, "CbteTipo") === "8") {
    const nro = Number(tagv(body, "CbteDesde"));
    arcaFake.ncBody = body;
    if (nro !== arcaFake.lastNC + 1) return xml(`<R><FECAEDetResponse><Resultado>R</Resultado></FECAEDetResponse><Errors><Err><Code>10016</Code><Msg>No correlativo</Msg></Err></Errors></R>`);
    const asoc = Number(tagv(tagv(body, "CbteAsoc") || "", "Nro"));
    if (!arcaFake.comps[asoc]) return xml(`<R><FECAEDetResponse><Resultado>R</Resultado></FECAEDetResponse><Errors><Err><Code>10197</Code><Msg>Comprobante asociado inexistente</Msg></Err></Errors></R>`);
    arcaFake.lastNC = nro;
    arcaFake.ncs[nro] = { total: Number(tagv(body, "ImpTotal")), fecha: tagv(body, "CbteFch"), cae: "8" + String(nro).padStart(13, "0") };
    return xml(`<R><FECAEDetResponse><Resultado>A</Resultado><CAE>${arcaFake.ncs[nro].cae}</CAE><CAEFchVto>20261120</CAEFchVto></FECAEDetResponse></R>`);
  }
  if (action === "FECAESolicitar") {
    const nro = Number(tagv(body, "CbteDesde"));
    assert.equal(tagv(body, "CondicionIVAReceptorId"), "5");
    assert.equal(tagv(body, "DocTipo"), "99");
    if (nro !== arcaFake.last + 1) return xml(`<R><FECAEDetResponse><Resultado>R</Resultado></FECAEDetResponse><Errors><Err><Code>10016</Code><Msg>Numero no correlativo</Msg></Err></Errors></R>`);
    const neto = Number(tagv(body, "ImpNeto")), iva = Number(tagv(body, "ImpIVA")), total = Number(tagv(body, "ImpTotal"));
    assert.ok(Math.abs(neto + iva - total) < 0.001);
    const comp = { total, fecha: tagv(body, "CbteFch"), cae: "7" + String(nro).padStart(13, "0") };
    // "lento": ARCA todavía está procesando; la consulta inmediata no la encuentra, pero termina autorizándola.
    if (arcaFake.lento) { arcaFake.lento = () => { arcaFake.last = nro; arcaFake.comps[nro] = comp; }; throw new Error("timeout"); }
    arcaFake.last = nro;
    arcaFake.comps[nro] = comp;
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
const order = (id, total, extra = {}) => ({ id, n: "#" + id, c: hoy + "T15:00:00Z", x: null, t: false, f: "PAID", s: "web", tot: total, cur: total, ship: 0, ref: 0, li: [{ ti: "Impoluto · Restaurador", vt: "Default Title", q: 1, cq: 1, tot: total }], ...extra });

test("Pedidos que no son del checkout web (ej. Mercado Libre copiado a Shopify) no se facturan", async () => {
  const { motivoNoFacturable } = await import("../api/factura.js");
  assert.equal(motivoNoFacturable(order("1", 1000)), null);
  assert.match(motivoNoFacturable(order("2", 1000, { s: "mercadolibre" })), /No es una venta de la tienda online/);
  assert.match(motivoNoFacturable(order("3", 1000, { s: "1234567" })), /No es una venta/);
});

test("CUIT y montos de factura B", () => {
  assert.ok(A.cuitValido("20-11111111-2"));
  assert.ok(!A.cuitValido("20111111113"));
  assert.deepEqual(A.montos(42990, 10.5), { total: 42990, neto: 38904.98, iva: 4085.02 });
  assert.deepEqual(A.montos(56990, 21), { total: 56990, neto: 47099.17, iva: 9890.83 });
});

test("Conectar, emitir en orden, no duplicar y sobrevivir a un corte", async (t) => {
  t.after(() => srv.close());
  const { SECRETS } = await import("../api/_lib.js");
  await redis.hset(SECRETS, { shopify: JSON.stringify({ shop: "prueba.myshopify.com", clientId: "c", clientSecret: "s" }) });
  ["1001", "1002", "1003", "1006", "1007", "1008"].forEach((id, i) => (shopOrders[id] = order(id, [42990, 56990, 67990, 42990, 56990, 42990][i])));
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
  arcaFake.last = 0; arcaFake.lastNC = 7;
  r = await call("POST", { action: "config", ptoVta: 3 });
  assert.match(r.body.error, /notas de crédito de otro sistema/);
  arcaFake.lastNC = 0;
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
  arcaFake.last = 3; delete arcaFake.comps[10];

  // Sincronizado como pagado, pero en Shopify ya lo cancelaron: no se factura
  await redis.hset(ORDERS, { "1007": JSON.stringify(order("1007", 56990)) });
  shopOrders["1007"] = order("1007", 56990, { x: hoy + "T18:00:00Z" });
  r = await call("POST", { action: "emitir", ids: ["1007"] });
  assert.equal(r.body.resultados[0].ok, false);
  assert.match(r.body.resultados[0].error, /cancelado/);
  assert.equal(arcaFake.last, 3);

  // ARCA lento: no contesta a tiempo y la consulta inmediata no la encuentra. NO se borra: queda «revisar».
  arcaFake.lento = true;
  await redis.hset(ORDERS, { "1008": JSON.stringify(order("1008", 42990)) });
  r = await call("POST", { action: "emitir", ids: ["1008"] });
  assert.equal(r.body.resultados[0].ok, false);
  assert.match(r.body.resultados[0].error, /Se cortó/);
  r = await call("GET");
  assert.equal(r.body.facturas.find((f) => f.orderId === "1008").estado, "revisar");
  arcaFake.lento(); arcaFake.lento = null; // ARCA termina de autorizarla (número 4)
  // Mientras hay una pendiente no se puede cambiar el punto de venta
  r = await call("POST", { action: "config", ptoVta: 7 });
  assert.match(r.body.error, /medio emitir/);
  // Si la consulta a ARCA falla, no se toca nada ni se emite
  arcaFake.consultaFalla = true;
  r = await call("POST", { action: "emitir", ids: ["1008"] });
  assert.equal(r.status, 400);
  assert.equal(arcaFake.last, 4);
  arcaFake.consultaFalla = false;
  // Próxima emisión: se resuelve sola como emitida, con el vencimiento bien leído, sin duplicar
  r = await call("POST", { action: "emitir", ids: ["1008"] });
  assert.equal(r.body.resultados[0].ya, true);
  const f8 = r.body.resultados[0].f;
  assert.equal(f8.estado, "emitida"); assert.equal(f8.nro, 4); assert.equal(f8.vto, "20261120");
  assert.ok(f8.iva > 0 && f8.neto > 0);
  assert.equal(arcaFake.last, 4);

  // Se cortó y ARCA de verdad NO la autorizó: hasta 5 minutos no se da por perdida; después se libera y se emite una sola vez
  arcaFake.lento = true;
  await redis.hset(ORDERS, { "1009": JSON.stringify(order("1009", 42990)) }); shopOrders["1009"] = order("1009", 42990);
  r = await call("POST", { action: "emitir", ids: ["1009"] });
  assert.equal(r.body.resultados[0].ok, false);
  arcaFake.lento = null; // nunca la autoriza
  r = await call("POST", { action: "emitir", ids: ["1009"] });
  assert.equal(r.status, 400); assert.match(r.body.error, /Esperá/);
  assert.equal(arcaFake.last, 4);
  const key = "impoluto:facturas:20111111112:prod";
  const pv = (await redis.hgetall(key))["1009"]; const pend = typeof pv === "string" ? JSON.parse(pv) : pv;
  await redis.hset(key, { "1009": JSON.stringify({ ...pend, sentAt: new Date(Date.now() - 6 * 60e3).toISOString() }) });
  r = await call("POST", { action: "emitir", ids: ["1009"] });
  assert.equal(r.body.resultados[0].ok, true, JSON.stringify(r.body));
  assert.equal(r.body.resultados[0].f.nro, 5);
  assert.equal(arcaFake.last, 5);

  // 7) El login a ARCA se reutiliza (ARCA no da otro mientras el anterior sigue vigente)
  assert.equal(arcaFake.logins, 1);

  // 9) Nota de crédito: anula la factura del pedido 1002, el pedido vuelve a «Para facturar»
  r = await call("POST", { action: "anular", id: "1002" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.nc.tipo, 8); assert.equal(r.body.nc.nro, 1); assert.equal(r.body.nc.total, 56990);
  assert.match(arcaFake.ncBody, /<CbtesAsoc><CbteAsoc><Tipo>6<\/Tipo><PtoVta>3<\/PtoVta><Nro>2<\/Nro>/);
  r = await call("GET");
  const anul = r.body.facturas.find((f) => f.clave === "anulada:1002:2");
  assert.ok(r.body.facturas.find((f) => f.clave === "nc:1002:B2"));
  assert.equal(anul.estado, "anulada"); assert.equal(anul.anuladaPor.nro, 1);
  assert.ok(r.body.pendientes.some((p) => p.id === "1002"), "el pedido vuelve a estar para facturar");
  // Anular de nuevo: ya no hay factura vigente, no sale otra nota de crédito
  r = await call("POST", { action: "anular", id: "1002" });
  assert.equal(r.status, 400); assert.equal(arcaFake.lastNC, 1);
  // Se refactura: número siguiente, sin chocar con la anulada
  r = await call("POST", { action: "emitir", ids: ["1002"] });
  assert.equal(r.body.resultados[0].ok, true, JSON.stringify(r.body)); assert.equal(r.body.resultados[0].f.nro, 6);
  // Pedido facturado que después se canceló: aparece para anular
  await redis.hset(ORDERS, { "1001": JSON.stringify(order("1001", 42990, { x: hoy + "T20:00:00Z" })) });
  r = await call("GET");
  assert.deepEqual(r.body.aAnular.map((x) => x.orderId), ["1001"]);
  // Un email de una nota de crédito o de una factura anulada no pisa nada
  r = await call("POST", { action: "email", id: "nc:1002:B2" });
  assert.equal(r.status, 400);
  r = await call("GET", null, { pdf: "nc:1002:B2" });
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");

  // 10) Factura A a un cliente monotributista: numeración propia, va con su CUIT
  await redis.hset(ORDERS, { "1010": JSON.stringify(order("1010", 67990)) }); shopOrders["1010"] = order("1010", 67990);
  r = await call("POST", { action: "emitirA", id: "1010", cuit: "20-11111111-3", cond: "mono", razon: "Taller X", domicilio: "Calle 1, Lanús" });
  assert.match(r.body.error, /CUIT del cliente no es válido/);
  r = await call("POST", { action: "emitirA", id: "1010", cuit: "20111111112", cond: "mono", razon: "Taller X", domicilio: "Calle 1, Lanús" });
  assert.match(r.body.error, /es el tuyo/);
  r = await call("POST", { action: "emitirA", id: "1010", cuit: "27-22222222-8", cond: "mono", razon: "Taller X", domicilio: "Calle 1, Lanús" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.f.tipo, 1); assert.equal(r.body.f.nro, 1); assert.equal(r.body.f.receptor.cuit, "27222222228");
  assert.equal(tagv(arcaFake.aBody, "DocNro"), "27222222228");
  assert.equal(tagv(arcaFake.aBody, "CondicionIVAReceptorId"), "6");
  const lastB = arcaFake.last;
  // El mismo pedido no se puede facturar de nuevo (ni A ni B)
  r = await call("POST", { action: "emitirA", id: "1010", cuit: "27222222228", cond: "ri", razon: "Taller X", domicilio: "Calle 1" });
  assert.match(r.body.error, /ya tiene factura/);
  r = await call("POST", { action: "emitir", ids: ["1010"] });
  assert.equal(r.body.resultados[0].ya, true); assert.equal(arcaFake.last, lastB);
  r = await call("GET", null, { pdf: "1010" });
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");
  // Nota de crédito A: tipo 3, asociada a la A, mismo CUIT
  r = await call("POST", { action: "anular", id: "1010" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.nc.tipo, 3); assert.equal(r.body.nc.nro, 1);
  assert.match(arcaFake.ncaBody, /<CbteAsoc><Tipo>1<\/Tipo>/);
  r = await call("GET");
  assert.equal(r.body.facturas.find((f) => f.clave === "anulada:1010:A1").estado, "anulada");
  r = await call("GET", null, { pdf: "nc:1010:A1" });
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");

  // 8) PDF
  r = await call("GET", null, { pdf: "1002" });
  assert.equal(r.headers["Content-Type"], "application/pdf");
  assert.equal(r.body.slice(0, 5).toString(), "%PDF-");
});
