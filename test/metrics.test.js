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
  // Crédito: comisión de MP y envío (Shopify factura desde el exterior: sin IVA).
  const credito = (c.mp / 1.21) * 0.21 + (2000 / 1.21) * 0.21;
  assert.ok(Math.abs(c.ivaPagar - (debito - credito)) < 1e-6);
  // Ingresos brutos del responsable inscripto: sobre el precio sin IVA.
  assert.ok(Math.abs(c.iibb - (42990 / 1.21) * (costos.iibbPct / 100)) < 1e-6);
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
  const pay = { id: "p1", desc: "Compra en Impoluto", c: "2026-10-10T12:00:00.000-03:00", a: "2026-10-10T12:00:01.000-03:00", rel: "2026-10-24T15:00:00.000-03:00", rs: "pending", st: "approved", op: "regular_payment", monto: 42990, devuelto: 0, comision: 3000, retenciones: 1000, neto: 38990, cu: 1 };
  const base = { orders: [o1], ads: [], meta: {}, costos, prods };
  const sin = M.resumen(base, "2026-10-10", "2026-10-10");
  const con = M.resumen({ ...base, orders: M.vincularPagos([o1], [pay]), pays: [pay] }, "2026-10-10", "2026-10-10");
  assert.equal(con.mp, 3000);
  assert.equal(con.mpReal.retenciones, 1000);
  const k = 0.21 / 1.21;
  assert.ok(Math.abs((con.ganancia - sin.ganancia) - (sin.mp - 3000) * (1 - k)) < 1e-6);
  const serie = M.serieDiaria({ ...base, orders: M.vincularPagos([o1], [pay]), pays: [pay] }, "2026-10-10", "2026-10-10");
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

test("Anuncios: solo campañas de Impoluto (fuera Valmora)", () => {
  const ads = [{ can: "Impoluto chapa 24/10/2026", sp: 10 }, { can: "Valmora Gotero lumbar 4/10/2026", sp: 5 }, { can: "Testeo valmora crema azul", sp: 3 }, { can: "IMPOLUTO escala", sp: 2 }];
  assert.deepEqual(M.soloCampanasTienda(ads).map((a) => a.sp), [10, 2]);
});

test("Stock: conteo, ventas, entradas, conteos, reservas, ritmo y cuándo pedir", () => {
  const hoy = "2026-11-20";
  const li = (pid, q, extra = {}) => ({ pid, vid: "v", sku: "", ti: pid === "R" ? "Restaurador" : pid === "E" ? "E-book" : "Protección de envío", vt: "", q, cq: q, tot: 1000 * q, orig: 1000 * q, ...extra });
  const ord = (id, day, items, extra = {}) => ({ id, n: "#" + id, c: day + "T15:00:00Z", p: day + "T15:00:00Z", x: null, t: false, f: "PAID", g: "mercado_pago", s: "web", tot: 1, cur: 1, disc: 0, ship: 0, ref: 0, dc: [], li: items, ...extra });
  const orders = [];
  // 2 unidades por día del 1 al 19 de noviembre (38), más un e-book y una protección de envío
  for (let d = 1; d <= 19; d++) orders.push(ord("o" + d, `2026-11-${String(d).padStart(2, "0")}`, [li("R", 2), li("E", 1), li("P", 1)]));
  orders.push(ord("x1", "2026-11-10", [li("R", 5)], { x: "2026-11-10T16:00:00Z" })); // cancelado: no cuenta
  orders.push(ord("p1", "2026-11-19", [li("R", 3)], { f: "PENDING" }));          // sin pagar: reservado
  orders.push(ord("d1", "2026-11-12", [li("R", 2, { cq: 1 })]));                  // devolvió 1 de 2: cuenta 1
  orders.push(ord("t1", "2026-11-12", [li("R", 9)], { t: true }));                // prueba: no cuenta
  const prods = { R: { nombre: "Restaurador", stock: 100, stockFecha: "2026-11-05", costo: 6200, entregaDias: 15, coberturaDias: 30 }, E: { nombre: "E-book", tipo: "digital" }, P: { nombre: "Protección de envío" } };
  const stockMovs = [
    { pid: "R", fecha: "2026-11-10", tipo: "ingreso", cant: 50 },
    { pid: "R", fecha: "2026-11-15", tipo: "ajuste", cant: -3 },
    { pid: "R", fecha: "2026-11-16", tipo: "salida", cant: 2 },
    { pid: "R", fecha: "2026-11-01", tipo: "ingreso", cant: 999 },                // antes del conteo: no cuenta
  ];
  const L = M.stockDetalle({ orders, prods, stockMovs }, hoy, ["2026-11-01", "2026-11-10"]);
  const r = L.find((x) => x.pid === "R");
  // vendidas desde el 5: días 5..19 = 15 días × 2 = 30, + 1 del pedido con devolución = 31
  assert.equal(r.vendidas, 31);
  assert.equal(r.actual, 100 + 50 - 3 - 2 - 31);
  assert.equal(r.reservadas, 3);
  assert.equal(r.r7, 2); // 13..19 → 14 unidades / 7
  assert.equal(Math.round(r.dias), Math.round(114 / 2));
  assert.equal(r.quiebre, "2027-01-16");
  assert.equal(r.pedir.cant, 2 * 45 - 114 > 0 ? 2 * 45 - 114 : 0);
  assert.equal(r.estadoStock, "bien");
  assert.equal(r.valor, 114 * 6200);
  assert.equal(r.enRango, 20); // del 1 al 10: 10 días × 2 (el cancelado no cuenta)
  assert.equal(r.vendMes, 39);
  // proyección: 39 + 2 por día × 10 días que faltan (21..30) + 2 de hoy (todavía sin ventas)
  assert.equal(r.proyMes, 39 + 2 * 10 + 2);
  assert.ok(L.find((x) => x.pid === "E").sinStock);
  assert.ok(L.find((x) => x.pid === "P").sinStock);
  // Se termina: con 10 unidades y 2 por día quedan 5 días → crítico y hay que pedir ya
  const L2 = M.stockDetalle({ orders, prods: { ...prods, R: { ...prods.R, stock: 0 } }, stockMovs: stockMovs.filter((m) => m.cant !== 50 && m.cant !== 999).concat([{ pid: "R", fecha: "2026-11-18", tipo: "ingreso", cant: 46 }]) }, hoy);
  const r2 = L2.find((x) => x.pid === "R");
  assert.equal(r2.actual, 0 + 46 - 3 - 2 - 31);
  assert.equal(r2.estadoStock, "critico");
  assert.equal(r2.pedir.ya, true);
});

test("Costo por lote (FIFO): cada venta usa el costo de la compra de la que salió", () => {
  const li = (q) => ({ pid: "R", vid: "v", sku: "", ti: "Restaurador", vt: "", q, cq: q, tot: 40000 * q, orig: 40000 * q });
  const ord = (id, c, q) => ({ id, n: "#" + id, c, p: c, x: null, t: false, f: "PAID", g: "mercado_pago", s: "web", tot: 40000 * q, cur: 40000 * q, disc: 0, ship: 0, ref: 0, dc: [], li: [li(q)] });
  const orders = [
    ord("a", "2026-10-30T15:00:00Z", 3),  // antes del conteo: costo base
    ord("b", "2026-11-02T15:00:00Z", 8),  // 8 del stock inicial (10 a $6.000)
    ord("c", "2026-11-03T15:00:00Z", 4),  // 2 del inicial + 2 de la compra a $5.000 → $5.500 promedio
    ord("d", "2026-11-06T15:00:00Z", 2),  // de la compra a $5.000
  ];
  const prods = { R: { nombre: "Restaurador", costo: 6000, stock: 10, stockFecha: "2026-11-01" } };
  const movs = [
    { pid: "R", fecha: "2026-11-03", tipo: "ingreso", cant: 20, costo: 5000, proveedor: "Proveedor B" },
    { pid: "R", fecha: "2026-11-05", tipo: "salida", cant: 1 },
    { pid: "R", fecha: "2026-11-07", tipo: "ingreso", cant: 10, costo: 7000, proveedor: "Proveedor C" },
  ];
  const F = M.costeoFIFO(orders, prods, movs);
  assert.equal(orders[0].li[0]._cu, undefined); // usa el costo base
  assert.equal(orders[1].li[0]._cu, 6000);
  assert.equal(orders[2].li[0]._cu, 5500);
  assert.equal(orders[3].li[0]._cu, 5000);
  // Quedan: 20 − 2 − 1 − 2 = 15 de la compra a $5.000 y 10 a $7.000
  assert.deepEqual(F.R.lotes.map((l) => [l.quedan, l.costo, l.proveedor]), [[15, 5000, "Proveedor B"], [10, 7000, "Proveedor C"]]);
  assert.equal(F.R.proximo, 5000);
  // La ganancia de cada pedido usa ese costo
  const costos = { regimen: "mono", mpPctSin: 0, mpCuotas: false, shopifyPct: 0, iibbPct: 0 };
  assert.equal(M.costoPedido(orders[2], costos, prods).producto, 4 * 5500);
  assert.equal(M.costoPedido(orders[0], costos, prods).producto, 3 * 6000);
  // El stock valuado sale de los lotes
  const r = M.stockDetalle({ orders, prods, stockMovs: movs, fifo: F }, "2026-11-08").find((x) => x.pid === "R");
  assert.equal(r.actual, 25);
  assert.equal(r.valor, 15 * 5000 + 10 * 7000);
});

test("Envío gratis a sucursal y dólar del día", () => {
  const li = (q) => ({ pid: "R", vid: "v", sku: "", ti: "Restaurador", vt: "", q, cq: q, tot: 30000 * q, orig: 30000 * q });
  const o = (id, q, extra) => ({ id, n: id, c: "2026-11-02T15:00:00Z", p: "2026-11-02T15:00:00Z", x: null, t: false, f: "PAID", g: "mp", s: "web", tot: 30000 * q, cur: 30000 * q, disc: 0, ship: 0, ref: 0, dc: [], li: [li(q)], ...extra });
  const cfg = { regimen: "mono", mpPctSin: 0, mpCuotas: false, shopifyPct: 0, iibbPct: 0, envioSucursal: 5000, armadoPedido: 0 };
  assert.equal(M.costoPedido(o("a", 2, { sl: "Envío gratis a sucursal Andreani" }), cfg, {}).envio, 5000); // sin destino: respaldo
  assert.equal(M.costoPedido(o("a2", 2, { sl: "Andreani- Envío a sucursal · X", cp: "8300", prov: "Neuquén" }), cfg, {}).envio, 10603);
  assert.equal(M.costoPedido(o("a3", 3, { sl: "Andreani- Envío a sucursal · X", cp: "1832" }), cfg, {}).envio, 7887);
  assert.equal(M.costoPedido(o("a4", 2, { sl: "Andreani- Envío a sucursal · X", cp: "9999", prov: "Salta" }), cfg, {}).envio, 10631); // CP no cotizado: zona
  assert.equal(M.costoPedido(o("b", 1, { sl: "Andreani a domicilio", ship: 4500 }), cfg, {}).envio, 0); // lo pagó el cliente
  assert.equal(M.costoPedido(o("c", 2, { sl: "Envío a domicilio", cp: "1832" }), cfg, {}).envio, 7887); // gratis: lo pagás vos, a sucursal
  assert.equal(M.costoPedido(o("c2", 1, { sl: "Envío a domicilio", ship: 5000, cp: "1832" }), cfg, {}).envio, 0); // lo pagó el cliente: no se resta
  assert.equal(M.costoPedido(o("d", 3, {}), cfg, {}).envio, 5000);  // pedido viejo sin método: pack y gratis
  assert.equal(M.costoPedido(o("e", 1, { ship: 4000 }), cfg, {}).envio, 0);
  // Dólar por día: cada fila de Meta con su cotización
  const ads = [{ d: "2026-11-01", ad: "A", can: "Impoluto", sp: 10, k: 1600 }, { d: "2026-11-02", ad: "A", can: "Impoluto", sp: 10 }];
  const r = M.resumen({ orders: [], ads, meta: { currency: "USD" }, costos: { dolar: 1500 }, prods: {} }, "2026-11-01", "2026-11-02");
  assert.equal(r.anuncios, 10 * 1600 + 10 * 1500);
});

test("Ventas sin el envío que pagó el cliente; solo se resta el envío gratis", () => {
  const li = { pid: "R", vid: "v", sku: "", ti: "Restaurador", vt: "", q: 3, cq: 3, tot: 67990, orig: 128970 };
  const o = { id: "1165", n: "#1165", c: "2026-11-05T05:23:00Z", p: "2026-11-05T05:23:00Z", x: null, t: false, f: "PAID", g: "mp", s: "web", tot: 81440, cur: 81440, disc: 60967, ship: 13450, ref: 0, dc: [], li: [li], sl: "Andreani — Envío a domicilio", cp: "5539", prov: "Mendoza" };
  const cfg = { regimen: "mono", mpPctSin: 0, mpCuotas: false, shopifyPct: 0, iibbPct: 0, armadoPedido: 0 };
  const c = M.costoPedido(o, cfg, {});
  assert.equal(c.venta, 67990);
  assert.equal(c.envio, 0);
  const g = M.costoPedido({ ...o, tot: 67990, cur: 67990, ship: 0, sl: "Andreani- Envío a sucursal", cp: "1824" }, cfg, {});
  assert.equal(g.venta, 67990);
  assert.equal(g.envio, 7887);
});

test("Anuncios: Meta da el valor de compra en dólares; ROAS y ganancia en el mismo idioma", () => {
  const ads = [{ d: "2026-11-04", ad: "A1", an: "AD 1", ca: "C1", can: "Impoluto chapa", sp: 100, imp: 1000, clk: 30, atc: 5, pu: 4, pv: 300, k: 1600 }];
  const li = { pid: "R", vid: "v", sku: "", ti: "R", vt: "", q: 1, cq: 1, tot: 120000, orig: 120000 };
  const orders = [1, 2, 3, 4].map((i) => ({ id: "o" + i, n: "#" + i, c: "2026-11-04T15:00:00Z", p: "2026-11-04T15:00:00Z", x: null, t: false, f: "PAID", g: "mp", s: "web", tot: 120000, cur: 120000, disc: 0, ship: 4000, ref: 0, dc: [], li: [li] }));
  const ctx = { orders, ads, meta: { currency: "USD" }, costos: { regimen: "mono", mpPctSin: 0, mpCuotas: false, shopifyPct: 0, iibbPct: 0, armadoPedido: 0 }, prods: {} };
  const camp = M.campanas(ctx, "2026-11-04", "2026-11-04")[0];
  assert.equal(Math.round(camp.roas * 100) / 100, 3); // 300 / 100 dólares
  const sem = M.anunciosSemaforo(ctx, "2026-11-04", "2026-11-04").lista[0];
  assert.equal(Math.round(sem.roas * 100) / 100, 3);
  assert.ok(sem.ganancia > 0.5); // vende 480.000 de pv en pesos contra 160.000 de gasto: gana
  const r = M.resumen(ctx, "2026-11-04", "2026-11-04");
  assert.equal(Math.round(r.meta.roasPixel * 100) / 100, 3);
});

test("Auditoría: MP sin vincular usa el % real; equilibrio del píxel incluye el envío del cliente", () => {
  const li = { pid: "R", vid: "v", sku: "", ti: "R", vt: "", q: 1, cq: 1, tot: 50000, orig: 50000 };
  const o = { id: "z", n: "#z", c: "2026-11-04T15:00:00Z", p: "2026-11-04T15:00:00Z", x: null, t: false, f: "PAID", g: "mp", s: "web", tot: 60000, cur: 60000, disc: 0, ship: 10000, ref: 0, dc: [], li: [li] };
  const c = M.costoPedido(o, { _mpProm: 4.8, regimen: "ri", beneficioIva: 50, shopifyPct: 1, iibbPct: 3, armadoPedido: 0 }, {});
  assert.equal(c.venta, 50000);
  assert.ok(Math.abs(c.mp - 60000 * 0.048) < 1e-6);   // sobre el total cobrado, con el % real
  assert.ok(Math.abs(c.shopify - 600) < 1e-6);
  const r = M.resumen({ orders: [o], ads: [], meta: {}, costos: { _mpProm: 4.8, armadoPedido: 0 }, prods: {} }, "2026-11-04", "2026-11-04");
  assert.ok(r.beRoasPixel > r.beRoas);
  assert.ok(Math.abs(r.beRoasPixel / r.beRoas - 60000 / 50000) < 1e-9);
});

test("envío que paga el cliente: IVA de venta (con beneficio) y crédito por la factura de Andreani", () => {
  const sin = M.costoPedido(order(4, "2026-10-10", 1, 42990), costos, prods);
  const con = M.costoPedido(order(5, "2026-10-10", 1, 42990 + 13450, { ship: 13450 }), costos, prods);
  assert.equal(con.venta, sin.venta);
  const ivaEnvio = (13450 / 1.21) * 0.21;
  assert.ok(Math.abs(con.ivaDebito - sin.ivaDebito - ivaEnvio * 0.5) < 1e-6);
  // La comisión de MP también cobra sobre el envío; descontando eso, el envío deja medio IVA a favor.
  const difMp = (con.mp - sin.mp) / 1.21 * 0.21;
  assert.ok(Math.abs(con.ivaCredito - sin.ivaCredito - ivaEnvio - difMp) < 1e-6);
});

test("producto con Factura A del proveedor: su IVA es crédito", () => {
  const p2 = { ...prods, PAD: { costo: 1210, tipo: "agregado", factura: true } };
  const o = order(6, "2026-10-10", 1, 42990);
  o.li.push({ pid: "PAD", vid: "V2", sku: "", ti: "Pad", vt: "", q: 1, cq: 1, tot: 0, orig: 0 });
  const sin = M.costoPedido(o, costos, prods);
  const con = M.costoPedido(o, costos, p2);
  assert.ok(Math.abs(con.ivaCredito - sin.ivaCredito - 210) < 1e-6);
});

test("Ingresos brutos también sobre el envío que pagó el cliente", () => {
  const c = M.costoPedido(order(7, "2026-10-10", 1, 42990 + 10000, { ship: 10000 }), costos, prods);
  assert.ok(Math.abs(c.iibb - ((42990 + 10000) / 1.21) * (costos.iibbPct / 100)) < 1e-6);
});
