// Datos inventados con la forma real de Impoluto para probar las pantallas.
import { DOCS, ORDERS, ADS, ADMETA, SECRETS, STATUS } from "../api/_lib.js";

let s = 7;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const iso = (d) => d.toISOString().slice(0, 10);

export async function seed(redis) {
  const today = new Date();
  const orders = {};
  let id = 5000;
  const OFF = { 1: 42990, 2: 56990, 3: 67990 };
  for (let back = 59; back >= 0; back--) {
    const day = new Date(today.getTime() - back * 864e5);
    const ramp = back > 40 ? 0.6 : back > 20 ? 2.5 : 4.5;
    const n = Math.round(ramp + rnd() * ramp);
    for (let k = 0; k < n; k++) {
      const hour = 11 + Math.floor(rnd() * 14);
      const c = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour % 24, Math.floor(rnd() * 59)));
      if (c > today) continue;
      const u = rnd() < 0.35 ? 1 : rnd() < 0.8 ? 2 : 3;
      const li = [{ pid: "1001", vid: "2001", sku: "IMP-RP", ti: "Impoluto · Restaurador de Pintura", vt: "", q: u, cq: u, tot: OFF[u], orig: OFF[u] }];
      if (u >= 2) li.push({ pid: "1002", vid: "2002", sku: "IMP-PAD", ti: "Impoluto · Pad Aplicador Profesional", vt: "", q: u, cq: u, tot: 0, orig: 7999 * u });
      let tot = OFF[u];
      if (rnd() < 0.55) { li.push({ pid: "1003", vid: "2003", sku: "", ti: "E-book · Los 8 errores que te están quemando la pintura", vt: "", q: 1, cq: 1, tot: 0, orig: 15990 }); }
      if (rnd() < 0.07) { li.push({ pid: "1004", vid: "2004", sku: "", ti: "Protección de envío", vt: "", q: 1, cq: 1, tot: 5000, orig: 5000 }); tot += 5000; }
      const r = rnd();
      const f = r < 0.93 ? "PAID" : r < 0.96 ? "PENDING" : r < 0.98 ? "EXPIRED" : "PAID";
      const x = r >= 0.98 ? c.toISOString() : null;
      const oid = String(id++);
      orders[oid] = { id: oid, n: "#" + (1000 + id - 5000), c: c.toISOString(), p: c.toISOString(), u: c.toISOString(), x, t: false, f, g: rnd() < 0.08 ? "manual" : "mercado_pago_cuotas", s: "web", tot, cur: tot, disc: Math.round(OFF[u] * 0.3), ship: 0, ref: 0, dc: rnd() < 0.05 ? ["BIENVENIDO10"] : [], li };
    }
  }
  const ads = {};
  const ADS_DEF = [
    ["111", "AD 1", "C1", "Impoluto chapa 24/10/2026", "AS1", "Conjunto amplio", 0.35, 1.0],
    ["112", "AD 2", "C1", "Impoluto chapa 24/10/2026", "AS1", "Conjunto amplio", 0.08, 0.55],
    ["113", "AD 3", "C1", "Impoluto chapa 24/10/2026", "AS2", "Intereses autos", 0.12, 1.5],
    ["114", "AD 7", "C1", "Impoluto chapa 24/10/2026", "AS2", "Intereses autos", 0.18, 0.75],
    ["115", "AD 8", "C1", "Impoluto chapa 24/10/2026", "AS3", "Advantage+", 0.04, 2.2],
    ["116", "AD 6", "C1", "Impoluto chapa 24/10/2026", "AS3", "Advantage+", 0.04, 0],
    ["117", "AD 4 7.1", "C1", "Impoluto chapa 24/10/2026", "AS3", "Advantage+", 0.03, 0],
    ["118", "AD 1", "C2", "Escala Impoluto CBO", "AS4", "Bidcap 17", 0.16, 1.2],
  ];
  for (let back = 59; back >= 0; back--) {
    const d = iso(new Date(today.getTime() - back * 864e5));
    const dayTotal = back > 40 ? 15 : back > 20 ? 45 : 70;
    for (const [ad, an, ca, can, as, asn, share, quality] of ADS_DEF) {
      if (ca === "C2" && back > 12) continue;
      const sp = +(dayTotal * share * (0.7 + rnd() * 0.6)).toFixed(2);
      const imp = Math.round(sp * 350 * (0.8 + rnd() * 0.4));
      const clk = Math.round(imp * 0.028 * (0.7 + rnd() * 0.6));
      const pu = Math.round((sp / 14) * quality * (0.6 + rnd() * 0.8));
      ads[d + "|" + ad] = { d, acc: "act_123", ad, an, as, asn, ca, can, sp, imp, clk, lpv: Math.round(clk * 0.8), atc: Math.round(clk * 0.07), ic: Math.round(clk * 0.045), pu, pv: pu * 56990 };
    }
  }
  const docs = {
    "config/app": { socios: ["Francisco", "Martín"], saldoInicial: 500000, metaVentas: 30000000 },
    "config/costos": { dolar: 1670, mpCuotas: true, mpPctCuotas: 17, mpPctSin: 7, mpDesde: 2, shopifyPct: 1, iibbPct: 4.5, regimen: "ri", beneficioIva: 50, envioPedido: 0, armadoPedido: 1200, envioOk: true, ganPct: 15, fijos: [{ nombre: "Shopify", monto: 65000 }, { nombre: "Kaching Bundles", monto: 25000 }, { nombre: "Contador", monto: 80000 }], cpaObjetivo: { 1: 16, 2: 18, 3: 20 }, repartoPct: 50, metaPaga: "Caja" },
    "prods/1001": { nombre: "Impoluto · Restaurador de Pintura", costo: 6500, tipo: "principal", clave: "impoluto", stock: 600, stockFecha: iso(new Date(today.getTime() - 20 * 864e5)) },
    "prods/1002": { nombre: "Impoluto · Pad Aplicador Profesional", costo: 1350, tipo: "agregado" },
    "prods/1003": { nombre: "E-book", costo: 0, tipo: "digital" },
    "prods/1004": { nombre: "Protección de envío", costo: 0, tipo: "digital" },
    "gastos/g1": { fecha: iso(new Date(today.getTime() - 25 * 864e5)), mes: "", catId: "stock", cat: "Stock / Producto", concepto: "600 unidades restaurador", moneda: "ARS", monto: 3900000, montoOrig: 3900000, quien: "Martín", pago: "Transferencia", facturaA: false },
    "gastos/g2": { fecha: iso(new Date(today.getTime() - 10 * 864e5)), mes: "", catId: "envios", cat: "Envíos y logística", concepto: "Andreani semana", moneda: "ARS", monto: 420000, montoOrig: 420000, quien: "Caja Impoluto", pago: "Mercado Pago", facturaA: true },
    "gastos/g3": { fecha: iso(new Date(today.getTime() - 3 * 864e5)), mes: "", catId: "packaging", cat: "Packaging", concepto: "Cajas y etiquetas", moneda: "ARS", monto: 180000, montoOrig: 180000, quien: "Caja Impoluto", pago: "Mercado Pago", facturaA: true },
    "movimientos/m1": { tipo: "aporte", socio: "Martín", monto: 1000000, fecha: iso(new Date(today.getTime() - 40 * 864e5)), nota: "Capital inicial" },
    "movimientos/m2": { tipo: "retiro", socio: "Francisco", monto: 300000, fecha: iso(new Date(today.getTime() - 2 * 864e5)), nota: "" },
  };
  for (const v of Object.values(docs)) if (v.fecha) v.mes = v.fecha.slice(0, 7);
  const j = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)]));
  await redis.hset(ORDERS, j(orders));
  await redis.hset(ADS, j(ads));
  await redis.hset(DOCS, j(docs));
  await redis.hset(ADMETA, j({ currency: "USD", freq: { ad: { 111: 1.29, 112: 1.33, 113: 1.28, 114: 1.22, 115: 1.12, 116: 1.37, 117: 1.13, 118: 1.46 }, camp: { C1: 1.56, C2: 1.3 } }, campaigns: { C1: { n: "Impoluto chapa 24/10/2026", st: "ACTIVE" }, C2: { n: "Escala Impoluto CBO", st: "ACTIVE" } } }));
  await redis.hset(SECRETS, j({ shopify: { shop: "impolutocar.myshopify.com", clientId: "x".repeat(32), clientSecret: "dev" }, meta: { token: "dev", accounts: ["act_123"] } }));
  const now = new Date().toISOString();
  await redis.hset(STATUS, j({ shopify: { ok: true, name: "Impoluto", currency: "ARS", at: now }, meta: { ok: true, names: ["Impoluto Ads"], currency: "USD", at: now }, sync: { shopify: { lastUpdated: now, at: now }, meta: { lastDay: iso(today), at: now } } }));
  console.log("seed:", Object.keys(orders).length, "pedidos ·", Object.keys(ads).length, "filas de anuncios");
}
