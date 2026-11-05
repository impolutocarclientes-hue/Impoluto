// Calculadora de costos: misma planilla y mismas cuentas que la "Calculadora de costos de Lauty" de ESA.
// Los % se cargan como en la pantalla (14.4 = 14,4 %).

const fin = (x) => (Number.isFinite(x) ? x : 0);
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

export const CALC_DEFAULTS = {
  tc: 1670, transferencia: false,
  costoProducto: 6500, ivaProducto: false,
  insumos: 1200, ivaInsumos: false,
  envio: 2000, envioComprador: 0, cpaUsd: 10,
  comision: 14.4, iibb: 2, facturado: 50,
  precio: 44999,
};

export function calcular(input) {
  const e = { ...CALC_DEFAULTS, ...input };
  const a = num(e.tc), o = !!e.transferencia, r = num(e.costoProducto), s = num(e.insumos), i = num(e.envio),
    c = num(e.cpaUsd), l = num(e.comision) / 100, d = num(e.iibb) / 100, u = num(e.facturado) / 100, m = num(e.precio);
  // Envío que paga el comprador: entra en la factura (IVA de venta, IIBB y comisión de cobro lo incluyen) y la
  // logística te lo cobra con factura (crédito de IVA). La plata va y viene: no es ingreso ni costo.
  const sc = num(e.envioComprador), hs = (sc / 1.21) * 0.21;

  const p = (r / 1.21) * 0.21, b = e.ivaProducto ? p : 0;           // IVA producto
  const x = (s / 1.21) * 0.21, f = e.ivaInsumos ? x : 0;            // IVA empaquetaje
  const h = (i / 1.21) * 0.21;                                      // IVA envío (siempre factura)
  const v = c * a;                                                  // CPA objetivo en pesos
  const j = (l / 1.21) * 0.21, g = (m + sc) * j;                           // IVA de las comisiones
  const N = r + i + v + m * l + s + m * d + sc * (l + d);                          // total costos
  const P = h + b + f + g + hs;                                          // total IVA compra
  const y = ((m + sc) / 1.21) * 0.21;                                      // total IVA venta
  const C = y * u - P;                                              // IVA a abonar
  const A = m - N - C;                                              // utilidad mínima (cuotas), RI
  const $ = 0.9 * m;                                                // precio con 10 % off por transferencia
  const k = r + s + i + v, S = 0.01 * $, U = $ * d, M = 0.9 * C - 0.9 * g;
  const I = $ - k - S - U - M, V = I / $;                           // transferencia, RI
  const E = $ - k - S - U, L = E / $;                               // transferencia, monotributo
  const G = A / m, B = o ? V : G, T = B * m, q = (A + T) / 2;
  const R = (v + q) / a;                                            // CPA break even USD, RI
  const w = r + i + v + m * (l + d) + s + sc * (l + d);                            // total costos monotributo
  const sug = 0.35 * w + w;                                         // precio sugerido (monotributo)
  const D = m - w, K = D / m;
  const O = (v + D) / a;                                            // CPA break even USD, monotributo
  const Y = o ? L : K, W = (K + Y) / 2, J = K * m, Z = $ * W, Q = (J + Z) / 2;

  return {
    cpaArs: v,
    iva: { producto: b, productoSiTuviera: p, empaquetaje: f, empaquetajeSiTuviera: x, envio: h, envioComprador: hs, comisiones: g },
    totalCostos: N,
    ri: {
      totalCostos: N, totalIvaCompra: P, totalIvaVenta: y, ivaAAbonar: C,
      utilidadMin: A, utilidadMax: fin(T), utilidadProm: fin(q),
      margenMin: fin(G), margenMax: fin(B), margenProm: fin((G + B) / 2),
      cpaBreakEvenUsd: fin(R), cpaBreakEvenArs: fin(R * a),
      roasBreak: fin(m / (m - (N - v + C))),
    },
    mono: {
      totalCostos: w, utilidadMin: fin(J), utilidadMax: fin(Z), utilidadProm: fin(Q),
      margenMin: fin(K), margenMax: fin(Y), margenProm: fin(W),
      cpaBreakEvenUsd: fin(O), cpaBreakEvenArs: fin(O * a),
      roasBreak: fin(m / (m - (w - v))), precioSugerido: sug, antesDelAnuncio: v + D,
    },
    transfer: { precio: $, costos: k, comision: S, iibb: U, iva: M, gananciaRi: I, margenRi: fin(V), gananciaMono: E, margenMono: fin(L) },
  };
}

// Hoja "Calculo": CPA por cliente potencial con 10 % de conversión.
export function cpaPotencial(cpaCliente, cantidad) {
  const inversion = num(cpaCliente) * num(cantidad);
  const ventas = num(cantidad) * 0.1;
  return { inversion, ventas, cpa: ventas ? inversion / ventas : 0 };
}
