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
