// Motor de métricas: toma los pedidos de Shopify, los anuncios de Meta y la configuración,
// y devuelve todas las cuentas del sistema (ganancia, ROAS, ofertas, anuncios, caja, impuestos, socios).
// No toca la red ni la pantalla: se puede probar suelto.

export const DEF_COSTOS = {
  dolar: 1500,
  mpCuotas: true,         // ¿ofrecés cuotas sin interés?
  mpPctCuotas: 17,        // % que se queda Mercado Pago con cuotas
  mpPctSin: 7,            // % sin cuotas
  mpDesde: 1,             // las cuotas aplican desde la oferta de N unidades
  shopifyPct: 1,          // comisión de Shopify por venta
  iibbPct: 4.5,           // ingresos brutos sobre la venta
  regimen: "ri",          // ri | mono | sa
  beneficioIva: 50,       // % de beneficio de IVA (pagás el resto del IVA de venta)
  provFactura: false,     // ¿el proveedor te da factura?
  armadoFactura: false,   // ¿el fulfillment te da factura?
  envioPedido: 0,         // envío que pagás vos por pedido
  armadoPedido: 0,        // caja, etiqueta, depósito por pedido
  recargoAds: 0,          // % extra sobre el gasto en Meta (impuestos de la tarjeta, etc.)
  ganPct: 15,             // provisión de Ganancias sobre la ganancia
  fijos: [],              // [{nombre, monto}] por mes
  cpaObjetivo: { 1: 16, 2: 18, 3: 20 },
  metaPaga: "Caja",       // quién paga la tarjeta de Meta (para la caja)
  repartoPct: 50,         // % de la ganancia para el primer socio
};

const TZ_OFFSET_H = -3; // Argentina, sin horario de verano
export const dayOf = (iso) => new Date(Date.parse(iso) + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
export const todayAR = () => dayOf(new Date().toISOString());
export function addDays(d, n) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function daysBetween(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5) + 1; }
export function daysInMonth(d) { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function eachDay(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const iva = (x) => (x / 1.21) * 0.21;

export function costosCfg(c) { return { ...DEF_COSTOS, ...(c || {}), cpaObjetivo: { ...DEF_COSTOS.cpaObjetivo, ...((c && c.cpaObjetivo) || {}) } }; }

// ---------- Pedidos ----------
export function estado(o) {
  if (o.t) return "test";
  if (o.x) return "cancelado";
  const f = String(o.f || "").toUpperCase();
  if (f === "REFUNDED") return "devuelto";
  if (["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"].includes(f)) return "pagado";
  if (["EXPIRED", "VOIDED"].includes(f)) return "vencido";
  return "pendiente";
}
export const esTransferencia = (o) => /manual|bank|transfer|deposit|cash|efectivo|contra/i.test(o.g || "");
export const ingreso = (o) => Math.max(0, n(o.tot) - n(o.ref));

export function prodCfg(prods, pid) { return (prods && prods[pid]) || {}; }
export function unidadesPrincipales(o, prods) {
  return sum(o.li.filter((l) => (prodCfg(prods, l.pid).tipo || "principal") === "principal" && n(l.tot) > 0), (l) => n(l.cq));
}

// Cuánto se lleva cada cosa de un pedido pagado (la cuenta de ESA, pedido por pedido).
export function costoPedido(o, cfgIn, prods) {
  const cfg = costosCfg(cfgIn);
  const venta = ingreso(o);
  const transfer = esTransferencia(o);
  const units = unidadesPrincipales(o, prods);
  // Costo por unidad: el del lote del que salió (FIFO) si está calculado; si no, el costo base del producto.
  const producto = sum(o.li, (l) => n(l.cq) * (l._cu != null ? l._cu : n(prodCfg(prods, l.pid).costo)));
  const fisico = o.li.some((l) => n(l.cq) > 0 && prodCfg(prods, l.pid).tipo !== "digital");
  const envio = fisico ? n(cfg.envioPedido) : 0;
  const armado = fisico ? n(cfg.armadoPedido) : 0;
  const mpPct = transfer ? 0 : cfg.mpCuotas && units >= n(cfg.mpDesde || 1) ? n(cfg.mpPctCuotas) : n(cfg.mpPctSin);
  // Si el pedido está vinculado a su cobro de Mercado Pago, usamos la comisión real de ese cobro.
  const mp = o._mp ? n(o._mp.com) : (venta * mpPct) / 100;
  const shopify = (venta * n(cfg.shopifyPct)) / 100;
  const iibb = (venta * n(cfg.iibbPct)) / 100;
  let ivaDebito = 0, ivaCredito = 0, ivaPagar = 0;
  if (cfg.regimen !== "mono") {
    ivaDebito = iva(venta) * (1 - n(cfg.beneficioIva) / 100);
    ivaCredito = iva(mp + shopify) + iva(envio) + (cfg.armadoFactura ? iva(armado) : 0) + (cfg.provFactura ? iva(producto) : 0);
    ivaPagar = ivaDebito - ivaCredito;
  }
  const cobroImp = mp + shopify + iibb + ivaPagar;
  const margen = venta - producto - envio - armado - cobroImp;
  return { venta, units, transfer, producto, envio, armado, mp, shopify, iibb, ivaDebito, ivaCredito, ivaPagar, cobroImp, margen };
}

// ---------- Anuncios ----------
// La cuenta ECOM tiene campañas de otras marcas (Valmora): solo cuentan las que dicen "Impoluto" en el nombre.
export const CAMPANA_TIENDA = /impoluto/i;
export const soloCampanasTienda = (ads) => (ads || []).filter((a) => CAMPANA_TIENDA.test(a.can || ""));
export function adsArs(rows, meta, cfgIn) {
  const cfg = costosCfg(cfgIn);
  const usd = String((meta && meta.currency) || "USD").toUpperCase() === "USD";
  const k = usd ? n(cfg.dolar) : 1;
  return { k, usd, recargo: 1 + n(cfg.recargoAds) / 100 };
}

function fijosEnRango(cfg, from, to) {
  const mensual = sum(cfg.fijos || [], (f) => n(f.monto));
  if (!mensual) return { total: 0, porDia: () => 0, mensual };
  const porDia = (d) => mensual / daysInMonth(d);
  return { total: sum(eachDay(from, to), porDia), porDia, mensual };
}

// ---------- Mercado Pago ----------
// Cobros aprobados de ventas (no transferencias entre cuentas ni cargas de saldo).
// Solo ventas online por Checkout Pro: fuera los cobros en persona (Point, QR, caja) y las transferencias o cargas de saldo.
// Las ventas y liquidaciones de Mercado Libre que entran a la misma cuenta NO son de la tienda: se excluyen siempre.
export const esMeli = (p) => /MELI|MERCADOLIBRE/i.test(p.mk || "") || /mercadolibre/i.test(p.ot || "") || /^MELI/i.test(p.ref || "");
// Un cobro es de la tienda si viene del checkout de Shopify: la descripción dice "Impoluto" (o "Compra en Impoluto")
// o la referencia es el código de checkout de Shopify (r + 24 letras y números).
export const esDeLaTienda = (p) => /impoluto/i.test(p.desc || "") || /^r[A-Za-z0-9]{20,}$/.test(p.ref || "");
export const esCheckoutOnline = (p) => !esMeli(p) && !p.pid && !/POINT|INSTORE|MONEY_TRANSFER|ACCOUNT_FUND/i.test(p.poi || "") && esDeLaTienda(p);
export const esCobroVenta = (p) => (p.op === "regular_payment" || !p.op) && esCheckoutOnline(p) && (p.st === "approved" || p.st === "refunded" || p.st === "charged_back");
export function mpCobros(pays, from, to) {
  if (!pays || !pays.length) return null;
  const l = pays.filter((p) => esCobroVenta(p) && (() => { const d = dayOf(p.a || p.c); return d >= from && d <= to; })());
  return {
    n: l.length,
    monto: sum(l, (p) => n(p.monto)), devuelto: sum(l, (p) => n(p.devuelto)), neto: sum(l, (p) => n(p.neto)),
    comision: sum(l, (p) => n(p.comision)), retenciones: sum(l, (p) => n(p.retenciones)),
    pct: (() => { const m = sum(l, (p) => n(p.monto)); return m ? sum(l, (p) => n(p.comision)) / m : 0; })(),
    cuotas: l.filter((p) => n(p.cu) > 1).length,
  };
}
// % real que cobra Mercado Pago, separado en 1 pago y cuotas (para estimar cada pedido y las ofertas).
export function mpPctReales(pays, desde) {
  if (!pays || !pays.length) return null;
  const l = pays.filter((p) => esCobroVenta(p) && p.st === "approved" && dayOf(p.a || p.c) >= desde);
  const grupo = (f) => { const g = l.filter(f); const m = sum(g, (p) => n(p.monto)); return { n: g.length, pct: m ? (sum(g, (p) => n(p.comision)) / m) * 100 : null }; };
  const uno = grupo((p) => n(p.cu) <= 1), cuotas = grupo((p) => n(p.cu) > 1);
  return l.length ? { uno, cuotas, n: l.length } : null;
}

// Vincula cada pedido de Shopify con su cobro de Mercado Pago (mismo monto, pocos minutos de diferencia).
export function vincularPagos(orders, pays) {
  if (!pays || !pays.length) return orders;
  const libres = pays.filter((p) => esCobroVenta(p) && p.st === "approved").map((p) => ({ p, t: Date.parse(p.a || p.c), usado: false }));
  return orders.map((o) => {
    if (estado(o) !== "pagado" || esTransferencia(o)) return o;
    const t = Date.parse(o.p || o.c), monto = n(o.tot);
    let mejor = null, dist = Infinity;
    for (const x of libres) {
      if (x.usado || Math.abs(n(x.p.monto) - monto) > 1) continue;
      const d = Math.abs(x.t - t);
      if (d < dist && d < 3 * 3600e3) { mejor = x; dist = d; }
    }
    if (!mejor) return o;
    mejor.usado = true;
    return { ...o, _mp: { id: mejor.p.id, com: n(mejor.p.comision), ret: n(mejor.p.retenciones), neto: n(mejor.p.neto), cu: n(mejor.p.cu), rel: mejor.p.rel } };
  });
}

// Plata cobrada que Mercado Pago todavía no liberó.
export function mpALiberar(pays, ahoraISO = new Date().toISOString()) {
  if (!pays || !pays.length) return null;
  const ahora = Date.parse(ahoraISO);
  const l = pays.filter((p) => p.st === "approved" && esCobroVenta(p) && p.rel && Date.parse(p.rel) > ahora && p.rs !== "released");
  const porDia = {};
  l.forEach((p) => { const d = dayOf(p.rel); porDia[d] = (porDia[d] || 0) + n(p.neto); });
  return { total: sum(l, (p) => n(p.neto)), n: l.length, porDia: Object.entries(porDia).sort().map(([d, v]) => ({ d, v })) };
}

// ---------- Resumen de un período ----------
export function resumen({ orders, ads, meta, costos, prods, pays }, from, to) {
  const cfg = costosCfg(costos);
  const enRango = orders.filter((o) => { const d = dayOf(o.c); return d >= from && d <= to && !o.t; });
  const por = { pagado: [], pendiente: [], vencido: [], cancelado: [], devuelto: [] };
  enRango.forEach((o) => (por[estado(o)] || por.pendiente).push(o));
  const pagados = por.pagado;
  const filas = pagados.map((o) => ({ o, c: costoPedido(o, cfg, prods) }));
  const T = (k) => sum(filas, (f) => f.c[k]);
  const ventas = T("venta");
  const conv = adsArs(ads, meta, cfg);
  const adsR = ads.filter((a) => a.d >= from && a.d <= to);
  const spendCuenta = sum(adsR, (a) => n(a.sp));
  const spendBase = spendCuenta * conv.k;
  const anuncios = spendBase * conv.recargo;
  const fijos = fijosEnRango(cfg, from, to);
  // Con Mercado Pago conectado usamos la comisión real de los cobros en vez del % estimado.
  // Cada pedido vinculado a su cobro ya trae la comisión real (costoPedido); el resto, la estimada.
  const real = mpCobros(pays, from, to);
  const mpEst = T("mp");
  const mpUsado = mpEst;
  const ajusteMp = 0;
  const ivaCredito = T("ivaCredito");
  const ivaPagar = T("ivaDebito") - ivaCredito;
  const cobroImp = mpUsado + T("shopify") + T("iibb") + ivaPagar;
  const margenAntes = T("margen");
  const ganancia = margenAntes - anuncios - fijos.total;
  const netas = ventas - T("producto") - T("envio") - T("armado") - mpUsado - T("shopify");
  const nPag = pagados.length;
  const units = sum(filas, (f) => sum(f.o.li, (l) => n(l.cq)));
  const dineroPor = margenAntes - fijos.total; // lo que queda para pagar anuncios
  const purch = sum(adsR, (a) => n(a.pu));
  const out = {
    from, to, dias: daysBetween(from, to),
    pedidos: enRango.length, pagados: nPag,
    pendientes: { n: por.pendiente.length, monto: sum(por.pendiente, (o) => n(o.tot)) },
    vencidos: { n: por.vencido.length, monto: sum(por.vencido, (o) => n(o.tot)) },
    cancelados: { n: por.cancelado.length, monto: sum(por.cancelado, (o) => n(o.tot)) },
    devueltos: { n: por.devuelto.length, monto: sum(por.devuelto, (o) => n(o.tot)) },
    ventas, netas, units,
    producto: T("producto"), envio: T("envio"), armado: T("armado"),
    mp: mpUsado, mpEstimado: mpEst, mpReal: real, shopify: T("shopify"), iibb: T("iibb"),
    ivaDebito: T("ivaDebito"), ivaCredito, ivaPagar,
    cobroImp, margenAntes,
    spendCuenta, spendBase, anuncios, monedaAds: conv.usd ? "USD" : "ARS",
    fijos: fijos.total, fijosMensual: fijos.mensual,
    ganancia, margen: ventas ? ganancia / ventas : 0,
    aov: nPag ? ventas / nPag : 0,
    unidadesPorPedido: nPag ? units / nPag : 0,
    roas: spendBase ? ventas / spendBase : 0,
    trueRoas: anuncios ? netas / anuncios : 0,
    beRoas: dineroPor > 0 ? ventas / dineroPor : 0,
    cpa: nPag ? anuncios / nPag : 0,
    cpaUsd: nPag ? anuncios / nPag / n(cfg.dolar) : 0,
    cpaMax: nPag ? dineroPor / nPag : 0,
    cpaMaxUsd: nPag ? dineroPor / nPag / n(cfg.dolar) : 0,
    mer: ventas ? anuncios / ventas : 0,
    descuentos: sum(pagados, (o) => n(o.disc)),
    conDescuento: pagados.filter((o) => n(o.disc) > 0).length,
    codigos: (() => { const m = {}; pagados.forEach((o) => (o.dc || []).forEach((c) => (m[c] = (m[c] || 0) + 1))); return m; })(),
    transferencias: filas.filter((f) => f.c.transfer).length,
    meta: {
      imp: sum(adsR, (a) => n(a.imp)), clk: sum(adsR, (a) => n(a.clk)), lpv: sum(adsR, (a) => n(a.lpv)),
      atc: sum(adsR, (a) => n(a.atc)), ic: sum(adsR, (a) => n(a.ic)), pu: purch, pv: sum(adsR, (a) => n(a.pv)),
    },
    filas,
  };
  out.meta.ctr = out.meta.imp ? out.meta.clk / out.meta.imp : 0;
  out.meta.cpm = out.meta.imp ? (spendCuenta / out.meta.imp) * 1000 : 0;
  out.meta.cpaPixel = purch ? spendCuenta / purch : 0;
  out.meta.roasPixel = spendBase ? out.meta.pv / spendBase : 0;
  return out;
}

// Día por día: ventas, ganancia, pedidos y anuncios.
export function serieDiaria(ctx, from, to) {
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const fijos = fijosEnRango(cfg, from, to);
  const dias = {};
  eachDay(from, to).forEach((d) => (dias[d] = { d, ventas: 0, margen: 0, pedidos: 0, anuncios: 0, fijos: fijos.porDia(d) }));
  ctx.orders.forEach((o) => {
    const d = dayOf(o.c);
    if (!dias[d] || estado(o) !== "pagado") return;
    const c = costoPedido(o, cfg, ctx.prods);
    dias[d].ventas += c.venta; dias[d].margen += c.margen; dias[d].pedidos++;
  });
  ctx.ads.forEach((a) => { if (dias[a.d]) dias[a.d].anuncios += n(a.sp) * conv.k * conv.recargo; });
  return Object.values(dias).map((x) => ({ ...x, ganancia: x.margen - x.anuncios - x.fijos }));
}

// ---------- Productos ----------
export function porProducto(ctx, from, to) {
  const r = resumen(ctx, from, to);
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const m = {};
  r.filas.forEach(({ o, c }) => {
    const totLineas = sum(o.li, (l) => n(l.tot)) || 1;
    const principales = o.li.filter((l) => (prodCfg(ctx.prods, l.pid).tipo || "principal") === "principal" && n(l.tot) > 0);
    const totPrin = sum(principales, (l) => n(l.tot)) || 1;
    o.li.forEach((l) => {
      const key = l.pid || l.ti;
      const p = (m[key] = m[key] || { pid: l.pid, titulo: l.ti, ventas: 0, unidades: 0, pedidos: 0, costo: 0, quedo: 0, anuncios: 0 });
      const share = n(l.tot) / totLineas;
      const prin = principales.includes(l);
      const costoLinea = n(l.cq) * n(prodCfg(ctx.prods, l.pid).costo);
      const logistica = prin ? ((c.envio + c.armado) * n(l.tot)) / totPrin : 0;
      p.ventas += n(l.tot) * (c.venta / (totLineas || 1));
      p.unidades += n(l.cq); p.pedidos++;
      p.costo += costoLinea;
      p.quedo += n(l.tot) * (c.venta / totLineas) - costoLinea - c.cobroImp * share - logistica;
    });
  });
  // Anuncios: cada campaña va al producto cuya palabra clave aparece en el nombre de la campaña.
  const lista = Object.values(m);
  let sinAsignar = 0;
  ctx.ads.filter((a) => a.d >= from && a.d <= to).forEach((a) => {
    const ars = n(a.sp) * conv.k * conv.recargo;
    const nombre = String(a.can || "").toLowerCase();
    const p = lista.find((x) => { const kw = String(prodCfg(ctx.prods, x.pid).clave || "").toLowerCase().trim(); return kw && nombre.includes(kw); });
    if (p) p.anuncios += ars; else sinAsignar += ars;
  });
  lista.forEach((p) => { p.ganancia = p.quedo - p.anuncios; p.roas = p.anuncios ? p.ventas / (p.anuncios / conv.recargo) : 0; });
  lista.sort((a, b) => b.ventas - a.ventas);
  return { lista, sinAsignar, total: r.ventas };
}

// ---------- Ofertas: cuánto le podés pagar a Meta por venta ----------
export function ofertas(ctx, from, to) {
  const cfg = costosCfg(ctx.costos);
  const r = resumen(ctx, from, to);
  const fijosPorPedido = r.pagados ? r.fijos / r.pagados : 0;
  const grupos = {};
  r.filas.forEach(({ o, c }) => {
    if (!c.units) return;
    const of = Math.min(3, c.units);
    const g = (grupos[of] = grupos[of] || { oferta: of, pedidos: 0, venta: 0, margen: 0, ej: o });
    g.pedidos++; g.venta += c.venta; g.margen += c.margen;
  });
  return Object.values(grupos).sort((a, b) => a.oferta - b.oferta).map((g) => {
    const precio = g.venta / g.pedidos;
    const antes = g.margen / g.pedidos - fijosPorPedido;
    const maxUsd = antes / n(cfg.dolar);
    const objetivo = n(cfg.cpaObjetivo[g.oferta]);
    // El margen es lineal en el precio: lo evaluamos en dos precios y despejamos el que llega al objetivo.
    const f = (P) => { const fake = { ...g.ej, tot: P, ref: 0, li: g.ej.li.map((l) => ({ ...l, tot: n(l.tot) > 0 ? P : 0 })) }; return costoPedido(fake, cfg, ctx.prods).margen - fijosPorPedido; };
    const m1 = f(precio), m2 = f(precio + 1000), pend = (m2 - m1) / 1000;
    const precioObjetivo = objetivo && pend > 0 ? precio + (objetivo * n(cfg.dolar) - m1) / pend : 0;
    return { ...g, precio, antes, maxUsd, maxArs: antes, objetivo, falta: objetivo ? objetivo - maxUsd : 0, precioObjetivo, ok: !objetivo || maxUsd >= objetivo };
  });
}

// ---------- Anuncios con el semáforo ----------
export const SEMAFORO = [
  { id: "bidcap", t: "Para BidCap", d: "Dejan más de 25 % de ganancia y ya gastaron más de US$70: listos para escalar.", tone: "good" },
  { id: "futuro", t: "Futuros ganadores", d: "Dejan más de 25 %, pero gastaron menos de US$70: todavía no alcanza para decir que son muy buenos. Dejalos correr.", tone: "good" },
  { id: "renovar", t: "Para renovar", d: "Dejan entre 20 y 25 %. Sacales renovaciones (versiones nuevas) y mejoralos.", tone: "info" },
  { id: "ojo", t: "Ojo", d: "Dejan entre 15 y 20 %. Mirálos de cerca.", tone: "warn" },
  { id: "apagarrenovar", t: "Apagar y renovar", d: "Dejan entre 10 y 15 %. Apagalos y hacé una versión nueva.", tone: "warn" },
  { id: "apagar", t: "Apagar", d: "Dejan menos de 10 % o pierden plata. Apagalos.", tone: "bad" },
  { id: "sinventas", t: "Todavía sin ventas", d: "Gastaron poco y todavía no vendieron: es pronto para juzgarlos. Esperá.", tone: "muted" },
];

export function anunciosSemaforo(ctx, from, to, refFrom, refTo) {
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const ref = resumen(ctx, refFrom || from, refTo || to);
  const ratio = ref.ventas ? (ref.margenAntes - ref.fijos) / ref.ventas : 0; // de cada $ vendido, cuánto queda antes del anuncio
  const freq = (ctx.meta && ctx.meta.freq) || { ad: {}, camp: {} };
  const m = {};
  ctx.ads.filter((a) => a.d >= from && a.d <= to).forEach((a) => {
    const x = (m[a.ad] = m[a.ad] || { ad: a.ad, nombre: a.an, conjunto: a.asn, campana: a.can, ca: a.ca, sp: 0, imp: 0, clk: 0, atc: 0, pu: 0, pv: 0 });
    x.sp += n(a.sp); x.imp += n(a.imp); x.clk += n(a.clk); x.atc += n(a.atc); x.pu += n(a.pu); x.pv += n(a.pv);
  });
  const toUsd = (cuenta) => (conv.usd ? cuenta : cuenta / n(cfg.dolar));
  const lista = Object.values(m).filter((x) => x.sp > 0).map((x) => {
    const spArs = x.sp * conv.k * conv.recargo;
    const ganancia = x.pv ? (x.pv * ratio - spArs) / x.pv : null;
    const gastoUsd = toUsd(x.sp);
    const cpaUsd = x.pu ? gastoUsd / x.pu : null;
    const roas = x.sp ? x.pv / (x.sp * conv.k) : 0;
    const fq = freq.ad[x.ad] || 0;
    let grupo;
    if (!x.pu) grupo = "sinventas";
    else if (ganancia > 0.25) grupo = gastoUsd > 70 ? "bidcap" : "futuro";
    else if (ganancia > 0.2) grupo = "renovar";
    else if (ganancia > 0.15) grupo = "ojo";
    else if (ganancia > 0.1) grupo = "apagarrenovar";
    else grupo = "apagar";
    const bidcap = grupo === "bidcap" && cpaUsd ? [0, 1, 2, 3, 4].map((i) => 2 * cpaUsd + i) : null;
    const audiencia = fq >= 1.4 ? "caliente" : fq >= 1.2 ? "tibia" : "prospeccion";
    return { ...x, spArs, gastoUsd, ganancia, cpaUsd, roas, frecuencia: fq, grupo, bidcap, audiencia, ctr: x.imp ? x.clk / x.imp : 0 };
  });
  const grupos = {};
  SEMAFORO.forEach((s) => (grupos[s.id] = lista.filter((a) => a.grupo === s.id).sort((a, b) => b.sp - a.sp)));
  const audiencias = { prospeccion: [], tibia: [], caliente: [] };
  lista.forEach((a) => audiencias[a.audiencia].push(a));
  Object.values(audiencias).forEach((l) => l.sort((a, b) => (a.cpaUsd == null ? 1e9 : a.cpaUsd) - (b.cpaUsd == null ? 1e9 : b.cpaUsd)));
  return { lista, grupos, audiencias, ratio, beRoas: ref.beRoas };
}

export function campanas(ctx, from, to) {
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const ref = resumen(ctx, from, to);
  const info = (ctx.meta && ctx.meta.campaigns) || {};
  const freq = (ctx.meta && ctx.meta.freq && ctx.meta.freq.camp) || {};
  const m = {};
  ctx.ads.filter((a) => a.d >= from && a.d <= to).forEach((a) => {
    const x = (m[a.ca] = m[a.ca] || { ca: a.ca, nombre: a.can, sp: 0, imp: 0, clk: 0, atc: 0, pu: 0, pv: 0 });
    x.sp += n(a.sp); x.imp += n(a.imp); x.clk += n(a.clk); x.atc += n(a.atc); x.pu += n(a.pu); x.pv += n(a.pv);
  });
  return Object.values(m).filter((x) => x.sp > 0).map((x) => {
    const usd = conv.usd ? x.sp : x.sp / n(cfg.dolar);
    const roas = x.pv / (x.sp * conv.k);
    const st = (info[x.ca] && info[x.ca].st) || "";
    const pausada = st && st !== "ACTIVE";
    const fase = /test|testeo|prueba/i.test(x.nombre) ? "Testeo" : "Escala";
    const ctr = x.imp ? x.clk / x.imp : 0;
    const be = ref.beRoas;
    let consejo;
    if (pausada) consejo = "Está pausada en Meta: ya no gasta. Los números son de lo que gastó en estos días.";
    else if (!x.pu) consejo = ctr < 0.01 ? "Sin ventas y con CTR bajo: el anuncio no está enganchando. Probá otro gancho." : "Todavía sin ventas: dale más tiempo antes de juzgarla.";
    else if (roas >= be * 1.3) consejo = "Va bien arriba del equilibrio: es candidata a escalar (subí presupuesto de a poco o armá BidCap).";
    else if (roas >= be) consejo = "Está arriba del equilibrio pero justo: dejala y renová los anuncios que menos dejan.";
    else consejo = "Está debajo del equilibrio: pierde plata. Apagá los anuncios que más pierden o bajá el costo.";
    return {
      ...x, usd, roas, be, ctr, fase, pausada, estado: st, frecuencia: freq[x.ca] || 0,
      costoCarrito: x.atc ? usd / x.atc : 0, costoCompra: x.pu ? usd / x.pu : 0, consejo,
    };
  }).sort((a, b) => b.sp - a.sp);
}

// ---------- Embudo ----------
export function embudo(ctx, from, to) {
  const r = resumen(ctx, from, to);
  const ses = ((ctx.meta && ctx.meta.sessions) || []).filter((s) => s.d >= from && s.d <= to);
  const shop = ses.length ? { ses: sum(ses, (s) => s.ses), cart: sum(ses, (s) => s.cart), chk: sum(ses, (s) => s.chk), buy: sum(ses, (s) => s.buy) } : null;
  const pasos = [
    { k: "imp", t: "Vieron tu anuncio", v: r.meta.imp },
    { k: "clk", t: "Tocaron el anuncio", v: r.meta.clk },
    { k: "lpv", t: "Entraron a la tienda", v: shop ? shop.ses : r.meta.lpv, sub: shop ? "visitas de Shopify" : "según Meta" },
    { k: "atc", t: "Agregaron al carrito", v: shop ? shop.cart : r.meta.atc },
    { k: "ic", t: "Fueron a pagar", v: shop ? shop.chk : r.meta.ic },
    { k: "compra", t: "Compraron", v: r.pedidos - r.cancelados.n },
    { k: "pago", t: "Pagaron de verdad", v: r.pagados },
  ];
  pasos.forEach((p, i) => {
    const prev = i ? pasos[i - 1].v : 0;
    p.sigue = i && prev ? p.v / prev : null;
    p.pierde = i ? Math.max(0, prev - p.v) : 0;
  });
  const peor = pasos.slice(1, 5).reduce((a, b) => (b.sigue != null && (a == null || b.sigue < a.sigue) ? b : a), null);
  return { pasos, peor, fuente: shop ? "shopify" : "meta", conversion: pasos[2].v ? r.pagados / pasos[2].v : 0 };
}

// ---------- Proyección del mes ----------
export function proyeccionMes(ctx, hoy) {
  const ini = hoy.slice(0, 8) + "01";
  const fin = hoy.slice(0, 8) + String(daysInMonth(hoy)).padStart(2, "0");
  const mes = resumen(ctx, ini, hoy);
  const ult7 = resumen(ctx, addDays(hoy, -7), addDays(hoy, -1));
  const porDia = ult7.ventas / 7;
  const gDia = ult7.ganancia / 7;
  const quedan = daysBetween(hoy, fin) - 1;
  return {
    llevas: mes.ventas, ganancia: mes.ganancia, dia: Number(hoy.slice(8)), dias: daysInMonth(hoy), porDia,
    ventasFin: mes.ventas + porDia * quedan,
    gananciaFin: mes.ganancia + gDia * quedan,
  };
}

// ---------- Stock ----------
export function stock(ctx, hoy) {
  const out = [];
  Object.entries(ctx.prods || {}).forEach(([pid, p]) => {
    if (p.stock == null || p.stock === "" || !p.stockFecha) return;
    let vendidas = 0, ult30 = 0;
    const desde30 = addDays(hoy, -30);
    ctx.orders.forEach((o) => {
      const st = estado(o);
      if (st !== "pagado" && st !== "pendiente") return;
      const d = dayOf(o.c);
      o.li.forEach((l) => {
        if (l.pid !== pid) return;
        if (d >= p.stockFecha) vendidas += n(l.cq);
        if (d >= desde30 && st === "pagado") ult30 += n(l.cq);
      });
    });
    const actual = n(p.stock) - vendidas;
    const porDia = ult30 / 30;
    out.push({ pid, nombre: p.nombre || pid, actual, porDia, dias: porDia ? actual / porDia : null, alerta: n(p.alertaDias) || 7 });
  });
  return out;
}

// ---------- Stock (seguimiento, proyección y control) ----------
// Productos que no llevan stock: digitales, seguros de envío y los que el usuario marque.
export const sinStock = (p, titulo = "") => !!(p && (p.sinStock === true || (p.sinStock !== false && (p.tipo === "digital" || /protecci[oó]n de env[ií]o|seguro de env|e-?book|\bpdf\b|gu[ií]a digital|curso/i.test(p.nombre || titulo)))));
export const STOCK_DEF = { entregaDias: 15, coberturaDias: 30, alertaDias: 7 };

// Unidades que salieron por día (pedidos pagados, sin cancelados ni devueltos), por producto.
export function unidadesPorDia(orders) {
  const out = {};
  (orders || []).forEach((o) => {
    if (o.t || estado(o) !== "pagado") return;
    const d = dayOf(o.c);
    o.li.forEach((l) => { if (!l.pid || !(n(l.cq) > 0)) return; const m = (out[l.pid] = out[l.pid] || {}); m[d] = (m[d] || 0) + n(l.cq); });
  });
  return out;
}

// Por producto: stock actual = conteo inicial + entradas/ajustes/salidas cargadas − unidades vendidas desde el conteo.
// El ritmo sale de los últimos 7 días completos (hoy todavía no terminó) y se muestra también el de 30.
export function stockDetalle(ctx, hoy, rango) {
  const porDia = unidadesPorDia(ctx.orders);
  const movs = ctx.stockMovs || [];
  const titulos = {};
  (ctx.orders || []).forEach((o) => o.li.forEach((l) => { if (l.pid && !titulos[l.pid]) titulos[l.pid] = l.ti; }));
  const pids = [...new Set([...Object.keys(titulos), ...Object.keys(ctx.prods || {})])];
  const ayer = addDays(hoy, -1);
  const suma = (m, a, b) => Object.entries(m || {}).reduce((t, [d, u]) => (d >= a && d <= b ? t + u : t), 0);
  const mesIni = hoy.slice(0, 8) + "01";
  const diasMes = daysInMonth(hoy);
  const quedanMes = diasMes - Number(hoy.slice(8, 10)) + 1; // incluye hoy
  const mesPasIni = addDays(mesIni, -1).slice(0, 8) + "01", mesPasFin = addDays(mesIni, -1);
  return pids.map((pid) => {
    const p = (ctx.prods || {})[pid] || {};
    const nombre = titulos[pid] || p.nombre || pid;
    const m = porDia[pid] || {};
    const r7 = suma(m, addDays(hoy, -7), ayer) / 7, r30 = suma(m, addDays(hoy, -30), ayer) / 30;
    const ritmo = r7 || r30;
    const vendMes = suma(m, mesIni, hoy);
    const out = {
      pid, nombre, sinStock: sinStock(p, titulos[pid]), costo: p.costo == null || p.costo === "" ? null : n(p.costo),
      r7, r30, ritmo, vendMes, mesPasado: suma(m, mesPasIni, mesPasFin),
      // Lo vendido en el mes + el ritmo por los días que faltan (hoy cuenta lo que falte para llegar al ritmo).
      proyMes: Math.round(vendMes + ritmo * (quedanMes - 1) + Math.max(0, ritmo - suma(m, hoy, hoy))),
      enRango: rango ? suma(m, rango[0], rango[1]) : null,
      serie: eachDay(addDays(hoy, -29), hoy).map((d) => ({ d, u: m[d] || 0 })),
      entregaDias: n(p.entregaDias) || STOCK_DEF.entregaDias, coberturaDias: n(p.coberturaDias) || STOCK_DEF.coberturaDias, alertaDias: n(p.alertaDias) || STOCK_DEF.alertaDias,
      conteo: null, actual: null, reservadas: 0, dias: null, quiebre: null, pedir: null, estadoStock: "sin-conteo",
    };
    if (out.sinStock) { out.estadoStock = "no-lleva"; return out; }
    if (p.stock == null || p.stock === "" || !p.stockFecha) return out;
    const desde = p.stockFecha;
    const mv = movs.filter((x) => x.pid === pid && x.fecha >= desde);
    const entradas = mv.filter((x) => x.tipo === "ingreso").reduce((t, x) => t + n(x.cant), 0);
    const ajustes = mv.filter((x) => x.tipo === "ajuste").reduce((t, x) => t + n(x.cant), 0);
    const salidas = mv.filter((x) => x.tipo === "salida").reduce((t, x) => t + n(x.cant), 0);
    const vendidas = suma(m, desde, hoy);
    // Pedidos todavía sin pagar: no se descuentan, pero se muestran como reservados.
    let reservadas = 0;
    (ctx.orders || []).forEach((o) => { if (!o.t && estado(o) === "pendiente" && dayOf(o.c) >= desde) o.li.forEach((l) => { if (l.pid === pid) reservadas += n(l.cq); }); });
    const actual = n(p.stock) + entradas + ajustes - salidas - vendidas;
    Object.assign(out, { conteo: { cant: n(p.stock), fecha: desde }, entradas, ajustes, salidas, vendidas, reservadas, actual });
    const fifo = ctx.fifo && ctx.fifo[pid];
    if (fifo) {
      out.lotes = fifo.lotes; out.costoProximo = fifo.proximo; out.costoUltimo = fifo.ultimo;
      out.valor = fifo.lotes.every((lt) => lt.costo != null) ? fifo.lotes.reduce((t, lt) => t + lt.quedan * lt.costo, 0) : null;
    } else out.valor = out.costo != null ? Math.max(0, actual) * out.costo : null;
    if (ritmo > 0) {
      out.dias = Math.max(0, actual) / ritmo;
      out.quiebre = addDays(hoy, Math.floor(out.dias));
      const sugerido = Math.ceil(ritmo * (out.entregaDias + out.coberturaDias) - Math.max(0, actual));
      out.pedir = { ya: out.dias <= out.entregaDias, cuando: addDays(hoy, Math.max(0, Math.floor(out.dias - out.entregaDias))), cant: Math.max(0, sugerido) };
    }
    out.estadoStock = actual <= 0 ? "sin-stock" : out.dias != null && out.dias <= out.alertaDias ? "critico" : out.pedir && out.pedir.ya ? "pedir" : "bien";
    return out;
  }).sort((a, b) => (a.sinStock - b.sinStock) || (b.r30 - a.r30));
}

// ---------- Costo por lotes (FIFO: lo primero que entra es lo primero que sale) ----------
// Lotes: el conteo inicial (al costo base del producto) y cada «Entró mercadería» con su costo y proveedor.
// Cada venta pagada (y cada salida o ajuste negativo) consume del lote más viejo. Marca en cada línea de pedido
// l._cu = costo por unidad promedio de lo que consumió. Devuelve los lotes que quedan por producto.
export function costeoFIFO(orders, prods, stockMovs) {
  const out = {};
  const porPid = {};
  (stockMovs || []).forEach((m) => { (porPid[m.pid] = porPid[m.pid] || []).push(m); });
  (orders || []).forEach((o) => o.li.forEach((l) => { delete l._cu; }));
  Object.entries(prods || {}).forEach(([pid, p]) => {
    if (p.stock == null || p.stock === "" || !p.stockFecha) return;
    const base = p.costo == null || p.costo === "" ? null : n(p.costo);
    // Eventos ordenados por fecha: entradas primero dentro del mismo día.
    const ev = [];
    ev.push({ t: p.stockFecha + "T00:00:00", k: 0, tipo: "lote", cant: n(p.stock), costo: base, proveedor: "Stock inicial", fecha: p.stockFecha });
    (porPid[pid] || []).filter((m) => m.fecha >= p.stockFecha).forEach((m) => {
      const cant = n(m.cant);
      if (m.tipo === "ingreso" || (m.tipo === "ajuste" && cant > 0)) ev.push({ t: m.fecha + "T00:00:01", k: 0, tipo: "lote", cant, costo: m.costo == null || m.costo === "" ? null : n(m.costo), proveedor: m.proveedor || (m.tipo === "ajuste" ? "Ajuste por conteo" : ""), fecha: m.fecha });
      else if (m.tipo === "salida" || (m.tipo === "ajuste" && cant < 0)) ev.push({ t: m.fecha + "T23:59:58", k: 1, tipo: "consumo", cant: Math.abs(cant) });
    });
    (orders || []).forEach((o) => {
      if (o.t || estado(o) !== "pagado" || dayOf(o.c) < p.stockFecha) return;
      o.li.forEach((l) => { if (l.pid === pid && n(l.cq) > 0) ev.push({ t: o.c, k: 1, tipo: "venta", cant: n(l.cq), linea: l }); });
    });
    ev.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.k - b.k));
    const lotes = [];
    let ultimo = base;
    for (const e of ev) {
      if (e.tipo === "lote") {
        const costo = e.costo != null ? e.costo : ultimo; // ajuste o compra sin costo: el último conocido
        lotes.push({ fecha: e.fecha, proveedor: e.proveedor, costo, inicial: e.cant, quedan: e.cant });
        if (e.costo != null) ultimo = e.costo;
        continue;
      }
      let falta = e.cant, plata = 0, conCosto = 0;
      for (const lt of lotes) {
        if (!falta) break;
        if (lt.quedan <= 0) continue;
        const usa = Math.min(lt.quedan, falta);
        lt.quedan -= usa; falta -= usa;
        if (lt.costo != null) { plata += usa * lt.costo; conCosto += usa; }
      }
      // Si se vendió más de lo que había cargado, lo que falta va al último costo conocido.
      if (falta > 0 && ultimo != null) { plata += falta * ultimo; conCosto += falta; }
      if (e.linea && conCosto === e.cant) e.linea._cu = plata / e.cant;
    }
    out[pid] = { lotes: lotes.filter((lt) => lt.quedan > 0), todos: lotes, proximo: (lotes.find((lt) => lt.quedan > 0) || {}).costo ?? ultimo, ultimo };
  });
  return out;
}

// ---------- Caja (semana por semana) ----------
export function caja(ctx, hoy, semanas = 8, CAJA = "Caja Impoluto") {
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const metaAuto = !!(ctx.ads && ctx.ads.length);
  const lunes = (d) => { const x = new Date(d + "T12:00:00Z"); const wd = (x.getUTCDay() + 6) % 7; return addDays(d, -wd); };
  const desde = addDays(lunes(hoy), -7 * (semanas - 1));
  const W = {};
  for (let i = 0; i < semanas; i++) { const s = addDays(desde, 7 * i); W[s] = { desde: s, hasta: addDays(s, 6), entro: 0, salio: 0, det: { ventas: 0, comisiones: 0, gastos: 0, anuncios: 0, aportes: 0, retiros: 0 } }; }
  const wk = (d) => W[lunes(d)];
  const pagaCaja = cfg.metaPaga === CAJA || cfg.metaPaga === "Caja";
  const conMp = !!(ctx.pays && ctx.pays.length);
  // Entra: lo que cobrás. Con Mercado Pago conectado, lo que liberó de verdad (neto, el día que se libera);
  // si no, lo que cobra Shopify ya sin comisiones (suponiendo que Mercado Pago acredita al toque).
  ctx.orders.forEach((o) => {
    if (estado(o) !== "pagado") return;
    const d = dayOf(o.p || o.c), w = wk(d);
    if (!w || d > hoy) return;
    const c = costoPedido(o, cfg, ctx.prods);
    if (conMp && !c.transfer) { w.salio += c.shopify; w.det.comisiones += c.shopify; return; }
    w.entro += c.venta - c.mp - c.shopify; w.det.ventas += c.venta; w.det.comisiones += c.mp + c.shopify;
  });
  if (conMp) ctx.pays.forEach((p) => {
    if (p.st !== "approved" || !esCobroVenta(p)) return;
    const d = dayOf(p.rel || p.a || p.c), w = wk(d);
    if (!w || d > hoy) return;
    w.entro += n(p.neto); w.det.ventas += n(p.monto); w.det.comisiones += n(p.monto) - n(p.neto);
  });
  (ctx.gastos || []).forEach((g) => {
    const w = wk(g.fecha); if (!w || g.fecha > hoy) return;
    if (g.quien !== CAJA) return; // lo que paga un socio de su bolsillo no sale de la caja
    if (metaAuto && pagaCaja && g.catId === "meta") return; // Meta ya entra solo desde la conexión
    w.salio += n(g.monto); w.det.gastos += n(g.monto);
  });
  if (metaAuto && pagaCaja) ctx.ads.forEach((a) => { const w = wk(a.d); if (!w || a.d > hoy) return; const v = n(a.sp) * conv.k * conv.recargo; w.salio += v; w.det.anuncios += v; });
  (ctx.movs || []).forEach((m) => {
    const w = wk(m.fecha); if (!w || m.fecha > hoy) return;
    if (m.tipo === "retiro") { w.salio += n(m.monto); w.det.retiros += n(m.monto); } else { w.entro += n(m.monto); w.det.aportes += n(m.monto); }
  });
  const lista = Object.values(W).map((w) => ({ ...w, neto: w.entro - w.salio })).reverse();
  // Proyección a 30 días con el ritmo de los últimos 14 (sin aportes ni retiros): es un supuesto.
  const r14 = resumen(ctx, addDays(hoy, -14), addDays(hoy, -1));
  const g14 = sum((ctx.gastos || []).filter((g) => g.fecha >= addDays(hoy, -14) && g.fecha < hoy && g.quien === CAJA && !(metaAuto && pagaCaja && g.catId === "meta")), (g) => n(g.monto));
  const entra30 = ((r14.ventas - r14.mp - r14.shopify) / 14) * 30;
  const sale30 = (((pagaCaja ? r14.anuncios : 0) + g14) / 14) * 30;
  return { semanas: lista, proy: { entra: entra30, sale: sale30, neto: entra30 - sale30 } };
}

export function saldoCaja(ctx, hoy, saldoInicial = 0, CAJA = "Caja Impoluto") {
  const cfg = costosCfg(ctx.costos);
  const conv = adsArs(ctx.ads, ctx.meta, cfg);
  const metaAuto = !!(ctx.ads && ctx.ads.length);
  const pagaCaja = cfg.metaPaga === CAJA || cfg.metaPaga === "Caja";
  let s = n(saldoInicial);
  const conMp = !!(ctx.pays && ctx.pays.length);
  ctx.orders.forEach((o) => { if (estado(o) === "pagado" && dayOf(o.p || o.c) <= hoy) { const c = costoPedido(o, cfg, ctx.prods); s += conMp && !c.transfer ? -c.shopify : c.venta - c.mp - c.shopify; } });
  if (conMp) ctx.pays.forEach((p) => { if (p.st === "approved" && esCobroVenta(p) && dayOf(p.rel || p.a || p.c) <= hoy) s += n(p.neto); });
  (ctx.gastos || []).forEach((g) => { if (g.fecha <= hoy && g.quien === CAJA && !(metaAuto && pagaCaja && g.catId === "meta")) s -= n(g.monto); });
  if (metaAuto && pagaCaja) ctx.ads.forEach((a) => { if (a.d <= hoy) s -= n(a.sp) * conv.k * conv.recargo; });
  (ctx.movs || []).forEach((m) => { if (m.fecha <= hoy) s += m.tipo === "retiro" ? -n(m.monto) : n(m.monto); });
  return s;
}

// ---------- Impuestos del mes ----------
export function impuestosMes(ctx, mes /* AAAA-MM */) {
  const cfg = costosCfg(ctx.costos);
  const from = mes + "-01", to = mes + "-" + String(daysInMonth(from)).padStart(2, "0");
  const r = resumen(ctx, from, to);
  const ivaDeGasto = (g) => (g.facturaA ? n(g.monto) - n(g.monto) / 1.21 : 0);
  const gastosMes = (ctx.gastos || []).filter((g) => g.fecha >= from && g.fecha <= to);
  const creditoGastos = sum(gastosMes, ivaDeGasto);
  const ri = cfg.regimen !== "mono";
  const debitoTotal = ri ? iva(r.ventas) : 0;
  const debito = debitoTotal * (1 - n(cfg.beneficioIva) / 100);
  const creditoComisiones = ri ? iva(r.mp + r.shopify) : 0; // con Mercado Pago conectado, r.mp es la comisión real
  const ivaPagar = ri ? debito - creditoComisiones - creditoGastos : 0;
  const gananciaAntes = r.ganancia;
  const ganancias = Math.max(0, gananciaAntes) * (n(cfg.ganPct) / 100);
  return {
    mes, from, to, ventas: r.ventas, regimen: cfg.regimen,
    debitoTotal, beneficio: debitoTotal - debito, debito,
    creditoComisiones, creditoGastos, ivaPagar,
    iibb: r.iibb, ganancias, gananciaAntes, gananciaNeta: gananciaAntes - ganancias,
    estimadoEnDashboard: r.ivaPagar,
    retencionesMp: r.mpReal ? r.mpReal.retenciones : null,
  };
}

// ---------- Socios: reparto de la ganancia neta ----------
export function socios(ctx, from, to, nombres, CAJA = "Caja Impoluto") {
  const cfg = costosCfg(ctx.costos);
  const r = resumen(ctx, from, to);
  const ganancias = Math.max(0, r.ganancia) * (n(cfg.ganPct) / 100);
  const neta = r.ganancia - ganancias;
  const pct = [n(cfg.repartoPct), 100 - n(cfg.repartoPct)];
  const inR = (d) => d >= from && d <= to;
  const filas = nombres.map((s, i) => {
    const pagoGastos = sum((ctx.gastos || []).filter((g) => g.quien === s && inR(g.fecha)), (g) => n(g.monto));
    const aportes = sum((ctx.movs || []).filter((m) => m.socio === s && m.tipo === "aporte" && inR(m.fecha)), (m) => n(m.monto));
    const retiros = sum((ctx.movs || []).filter((m) => m.socio === s && m.tipo === "retiro" && inR(m.fecha)), (m) => n(m.monto));
    const corresponde = (neta * pct[i]) / 100;
    return { socio: s, pct: pct[i], corresponde, pusoGastos: pagoGastos, aportes, retiros, saldo: pagoGastos + aportes + corresponde - retiros };
  });
  return { ganancia: r.ganancia, ganancias, neta, filas };
}
