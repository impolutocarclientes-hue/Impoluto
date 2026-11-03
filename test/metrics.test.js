import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../public/js/metrics.js";

const order = (id, day, units, price, extra = {}) => ({
  id, n: "#" + id, c: day + "T15:00:00Z", p: day + "T15:00:00Z", x: null, t: false, f: "PAID", g: "mercado_pago", s: "web",
  tot: price, cur: price, disc: 0, ship: 0, ref: 0, dc: [],
  li: [{ pid: "P1", vid: "V1", sku: "", ti: "Restaurador", vt: "", q: units, cq: units, tot: price, orig: price }],
  ...extra,
});
const prods = { P1: { costo: 6500, tipo: "principal", clave: "impoluto", stock: 100, stockFecha: "2026-10-01" } };
const costos = { dolar: 1000, mpCuotas: true, mpPctCuotas: 10, mpPctSin: 5, mpDesde: 2, shopifyPct: 1, iibbPct: 2, regimen: "ri", beneficioIva: 50, envioPedido: 2000, armadoPedido: 0, recargoAds: 0, ganPct: 15, fijos: [] };

test("costo de un pedido: comisión sin cuotas para 1 unidad e IVA con beneficio", () => {
  const c = M.costoPedido(order(1, "2026-10-10", 1, 42990), costos, prods);
  assert.equal(c.mp, 42990 * 0.05);
  assert.equal(c.producto, 6500);
  const debito = (42990 / 1.21) * 0.21 * 0.5;
  const credito = ((c.mp + c.shopify) / 1.21) * 0.21 + (2000 / 1.21) * 0.21;
  assert.ok(Math.abs(c.ivaPagar - (debito - credito)) < 1e-6);
  assert.ok(Math.abs(c.margen - (42990 - 6500 - 2000 - c.mp - c.shopify - c.iibb - c.ivaPagar)) < 1e-6);
});

test("cuotas aplican desde 2 unidades y transferencia no paga Mercado Pago", () => {
  assert.equal(M.costoPedido(order(2, "2026-10-10", 2, 56990), costos, prods).mp, 56990 * 0.1);
  assert.equal(M.costoPedido(order(3, "2026-10-10", 2, 56990, { g: "manual" }), costos, prods).mp, 0);
});

test("resumen: ganancia, ROAS y equilibrio", () => {
  const orders = [order(1, "2026-10-10", 1, 42990), order(2, "2026-10-11", 2, 56990), order(3, "2026-10-11", 1, 42990, { f: "PENDING" }), order(4, "2026-10-12", 1, 42990, { x: "2026-10-12T16:00:00Z" })];
  const ads = [{ d: "2026-10-10", ad: "A1", can: "Impoluto chapa", ca: "C1", sp: 20, imp: 1000, clk: 30, pu: 1, pv: 42990 }, { d: "2026-10-11", ad: "A1", can: "Impoluto chapa", ca: "C1", sp: 30, imp: 1500, clk: 40, pu: 2, pv: 56990 }];
  const ctx = { orders, ads, meta: { currency: "USD" }, costos, prods };
  const r = M.resumen(ctx, "2026-10-10", "2026-10-12");
  assert.equal(r.pagados, 2); assert.equal(r.pendientes.n, 1); assert.equal(r.cancelados.n, 1);
  assert.equal(r.ventas, 42990 + 56990);
  assert.equal(r.anuncios, 50 * 1000);
  assert.ok(Math.abs(r.ganancia - (r.margenAntes - 50000)) < 1e-6);
  assert.ok(Math.abs(r.roas - (99980 / 50000)) < 1e-9);
  assert.ok(Math.abs(r.beRoas - 99980 / r.margenAntes) < 1e-9);
  const serie = M.serieDiaria(ctx, "2026-10-10", "2026-10-12");
  assert.ok(Math.abs(M.serieDiaria(ctx, "2026-10-10", "2026-10-12").reduce((a, x) => a + x.ganancia, 0) - r.ganancia) < 1e-6);
  assert.equal(serie.length, 3);
  const pp = M.porProducto(ctx, "2026-10-10", "2026-10-12");
  assert.equal(pp.sinAsignar, 0);
  assert.ok(Math.abs(pp.lista[0].ventas - r.ventas) < 1e-6);
  const of = M.ofertas(ctx, "2026-10-10", "2026-10-12");
  assert.equal(of.length, 2);
  assert.ok(of[0].precioObjetivo > 0);
  // si la oferta saliera al precio objetivo, podrías pagar justo el CPA objetivo
  const fake = order(9, "2026-10-10", 1, of[0].precioObjetivo);
  assert.ok(Math.abs(M.costoPedido(fake, costos, prods).margen / 1000 - of[0].objetivo) < 0.01);
  const sem = M.anunciosSemaforo(ctx, "2026-10-10", "2026-10-12");
  assert.equal(sem.lista.length, 1);
  const st = M.stock(ctx, "2026-10-12");
  assert.equal(st[0].actual, 100 - 1 - 2 - 1); // pagados + pendiente
  const imp = M.impuestosMes(ctx, "2026-10");
  assert.ok(imp.ivaPagar > 0 && imp.ganancias >= 0);
  const so = M.socios(ctx, "2026-10-01", "2026-10-31", ["Francisco", "Socio"]);
  assert.ok(Math.abs(so.filas[0].corresponde + so.filas[1].corresponde - so.neta) < 1e-6);
  const cj = M.caja({ ...ctx, gastos: [], movs: [] }, "2026-10-12", 4);
  assert.equal(cj.semanas.length, 4);
});

test("día argentino", () => {
  assert.equal(M.dayOf("2026-10-11T02:30:00Z"), "2026-10-10");
  assert.equal(M.dayOf("2026-10-11T03:30:00Z"), "2026-10-11");
});

test("Mercado Pago: comisión real reemplaza la estimada y separa retenciones", () => {
  const o1 = order(1, "2026-10-10", 1, 42990);
  const pay = { id: "p1", desc: "Compra en Impoluto", c: "2026-10-10T15:00:00.000-03:00", a: "2026-10-10T15:00:01.000-03:00", rel: "2026-10-24T15:00:00.000-03:00", rs: "pending", st: "approved", op: "regular_payment", monto: 42990, devuelto: 0, comision: 3000, retenciones: 1000, neto: 38990, cu: 1 };
  const base = { orders: [o1], ads: [], meta: {}, costos, prods };
  const sin = M.resumen(base, "2026-10-10", "2026-10-10");
  const con = M.resumen({ ...base, pays: [pay] }, "2026-10-10", "2026-10-10");
  assert.equal(con.mp, 3000);
  assert.equal(con.mpReal.retenciones, 1000);
  const k = 0.21 / 1.21;
  assert.ok(Math.abs((con.ganancia - sin.ganancia) - (sin.mp - 3000) * (1 - k)) < 1e-6);
  const serie = M.serieDiaria({ ...base, pays: [pay] }, "2026-10-10", "2026-10-10");
  assert.ok(Math.abs(serie[0].ganancia - con.ganancia) < 1e-6);
  const lib = M.mpALiberar([pay], "2026-10-12T00:00:00Z");
  assert.equal(lib.total, 38990);
  assert.equal(M.mpALiberar([pay], "2026-10-25T00:00:00Z").total, 0);
  // En la caja, la plata entra el día que se libera, no el día de la venta
  const cj = M.caja({ ...base, pays: [pay], gastos: [], movs: [] }, "2026-10-27", 3);
  const sem = cj.semanas.find((w) => w.desde <= "2026-10-24" && w.hasta >= "2026-10-24");
  assert.equal(sem.det.ventas, 42990);
});

test("Mercado Pago: solo cuenta ventas online de Checkout Pro", () => {
  const base = { id: "x", desc: "Compra en Impoluto", ref: "rUARs8V8WllLy2iRabcdefghij", c: "2026-10-10T15:00:00.000-03:00", a: "2026-10-10T15:00:00.000-03:00", st: "approved", op: "regular_payment", monto: 1000, comision: 100, retenciones: 0, neto: 900, devuelto: 0 };
  const r = M.mpCobros([base, { ...base, id: "pos", poi: "POINT" }, { ...base, id: "qr", pid: "123" }, { ...base, id: "tr", op: "money_transfer" },
    { ...base, id: "meli1", mk: "MELI", monto: 50000, comision: 9000 }, { ...base, id: "meli2", ot: "mercadolibre", monto: 30000, comision: 5000 },
    { ...base, id: "liq", desc: "", ref: "MELIPAYMENTS-COLLECTIONAT", monto: 1778368, comision: 0 }, { ...base, id: "otro", desc: "Transferencia", ref: "abc", monto: 4653466, comision: 0 }], "2026-10-10", "2026-10-10");
  assert.equal(r.n, 1);
  assert.equal(r.comision, 100);
});

test("Mercado Pago: la app solo puede hacer consultas de lectura", async () => {
  const mp = await import("../api/_mp.js");
  const src = (await import("node:fs")).readFileSync(new URL("../api/_mp.js", import.meta.url), "utf8");
  // Las únicas llamadas a la API: GET de consulta y el pedido de token (POST /oauth/token)
  const fetches = src.match(/fetch\([^)]*\)/g) || [];
  assert.equal(fetches.length, 2);
  assert.ok(/method: "GET"/.test(src));
  assert.ok(/API \+ "\/oauth\/token", \{ method: "POST"/.test(src));
  assert.equal(typeof mp.fetchPayments, "function");
});

test("Mercado Pago: cada pedido usa la comisión real de su cobro", () => {
  const o = order(7, "2026-10-10", 2, 56990);
  const pay = { id: "p7", desc: "Compra en Impoluto", c: "2026-10-10T15:02:00Z", a: "2026-10-10T15:02:00Z", st: "approved", op: "regular_payment", monto: 56990, comision: 8310.28, retenciones: 584.15, neto: 48095.57, cu: 3 };
  const [v] = M.vincularPagos([o], [pay]);
  assert.equal(v._mp.com, 8310.28);
  assert.equal(M.costoPedido(v, costos, prods).mp, 8310.28);
  // el resumen no ajusta dos veces: queda la comisión real
  const r = M.resumen({ orders: [v], ads: [], meta: {}, costos, prods, pays: [pay] }, "2026-10-10", "2026-10-10");
  assert.ok(Math.abs(r.mp - 8310.28) < 1e-6);
  const r0 = M.resumen({ orders: [v], ads: [], meta: {}, costos, prods }, "2026-10-10", "2026-10-10");
  assert.ok(Math.abs(r.ganancia - r0.ganancia) < 1e-6);
});
