import test from "node:test";
import assert from "node:assert/strict";
import { calcular, cpaPotencial } from "../public/js/calc.js";

// Valores leídos de la calculadora de ESA con estos mismos datos.
const base = { tc: 1670, transferencia: false, costoProducto: 6500, ivaProducto: true, insumos: 1200, ivaInsumos: true, envio: 2000, cpaUsd: 10, comision: 14.4, iibb: 2, facturado: 50, precio: 44999 };
const r = (x) => Math.round(x);

test("calculadora igual a ESA, sin transferencia", () => {
  const c = calcular(base);
  assert.equal(r(c.ri.totalIvaCompra), 2808);
  assert.equal(r(c.ri.totalIvaVenta), 7810);
  assert.equal(r(c.ri.ivaAAbonar), 1097);
  assert.equal(r(c.totalCostos), 33780);
  assert.equal(r(c.ri.utilidadProm), 10122);
  assert.equal(r(c.mono.utilidadProm), 10658);
  assert.equal(r(c.mono.utilidadMin), 11219);
  assert.equal(r(c.mono.utilidadMax), 10097);
  assert.equal(c.ri.margenProm.toFixed(3), "0.225");
  assert.equal(c.ri.cpaBreakEvenUsd.toFixed(1), "16.1");
  assert.equal(r(c.ri.cpaBreakEvenArs), 26822);
  assert.equal(c.mono.cpaBreakEvenUsd.toFixed(1), "16.7");
  assert.equal(r(c.mono.cpaBreakEvenArs), 27919);
  assert.equal(c.ri.roasBreak.toFixed(2), "1.68");
  assert.equal(c.mono.roasBreak.toFixed(2), "1.61");
  assert.equal(r(c.mono.precioSugerido), 45603);
  assert.equal(r(c.iva.comisiones), 1125);
});

test("calculadora igual a ESA, con transferencia", () => {
  const c = calcular({ ...base, transferencia: true });
  assert.equal(r(c.ri.utilidadProm), 12233);
  assert.equal(r(c.ri.utilidadMax), 14344);
  assert.equal(r(c.mono.utilidadMax), 11491);
  assert.equal(r(c.mono.utilidadProm), 11355);
  assert.equal(c.ri.cpaBreakEvenUsd.toFixed(1), "17.3");
  assert.equal(r(c.ri.cpaBreakEvenArs), 28933);
  assert.equal(c.ri.margenMax.toFixed(3), "0.319");
});

test("CPA por cliente potencial", () => {
  assert.deepEqual(cpaPotencial(0.5, 2500), { inversion: 1250, ventas: 250, cpa: 5 });
});

test("envío que paga el comprador: crédito de IVA y también IVA de venta, IIBB y comisión", () => {
  const sin = calcular({ ...base, envio: 0 });
  const con = calcular({ ...base, envio: 0, envioComprador: 12100 });
  assert.ok(Math.abs(con.iva.envioComprador - 2100) < 1e-6);
  assert.ok(Math.abs(con.ri.totalIvaVenta - sin.ri.totalIvaVenta - 2100) < 1e-6);
  assert.ok(con.ri.totalIvaCompra > sin.ri.totalIvaCompra + 2100 - 1e-6);
});
