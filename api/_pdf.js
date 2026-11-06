// PDF de la factura B con el QR de ARCA.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { qrUrl } from "./_arca.js";

const pesos = (v) => "$ " + Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaAR = (yyyymmdd) => `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
const pad = (n, l) => String(n).padStart(l, "0");
// Helvetica estándar solo tiene Latin-1: sacamos lo que no entra (emojis, etc.).
const limpio = (s) => String(s || "").replace(/[^\x20-\x7E -ÿ]/g, "").trim();

export function numeroFactura(f) { return `${pad(f.pto, 5)}-${pad(f.nro, 8)}`; }

// emisor: {razon, cuit, domicilio, iibb, inicio, condicion}; f: factura guardada; items: [{ti, q, tot}]; envio, total
const cuitFmt = (c) => { const s = String(c || "").replace(/\D/g, ""); return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s; };

export async function facturaPdf(cfg, emisorIn, f) {
  const emisor = { ...emisorIn, cuit: cuitFmt(cfg.cuit) };
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gris = rgb(0.4, 0.4, 0.4), negro = rgb(0, 0, 0), linea = rgb(0.8, 0.8, 0.8);
  const W = 595.28, M = 40;
  const txt = (s, x, y, o = {}) => page.drawText(limpio(s), { x, y, size: o.size || 9, font: o.bold ? bold : font, color: o.color || negro });
  const right = (s, x, y, o = {}) => { const f2 = o.bold ? bold : font, sz = o.size || 9; txt(s, x - f2.widthOfTextAtSize(limpio(s), sz), y, o); };
  const hr = (y) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: linea });

  // Encabezado
  page.drawRectangle({ x: M, y: 690, width: W - 2 * M, height: 120, borderColor: linea, borderWidth: 0.8 });
  page.drawLine({ start: { x: W / 2, y: 690 }, end: { x: W / 2, y: 770 }, thickness: 0.8, color: linea });
  page.drawRectangle({ x: W / 2 - 24, y: 770, width: 48, height: 40, color: rgb(1, 1, 1), borderColor: negro, borderWidth: 1 });
  const esNC = f.tipo === 8 || f.tipo === 3;
  const esA = f.tipo === 1 || f.tipo === 3;
  const L = esA ? "A" : "B";
  txt(L, W / 2 - 8, 784, { size: 22, bold: true });
  txt("COD. " + pad(f.tipo, 3), W / 2 - 18, 773, { size: 6.5 });
  txt(emisor.razon, M + 12, 785, { size: 13, bold: true });
  txt(emisor.domicilio, M + 12, 760, { size: 8.5 });
  txt("Condición frente al IVA: " + (emisor.condicion || "IVA Responsable Inscripto"), M + 12, 746, { size: 8.5 });
  txt("ORIGINAL", W - M - 60, 795, { size: 8, bold: true, color: gris });
  txt(esNC ? "NOTA DE CRÉDITO" : "FACTURA", W / 2 + 34, 764, { size: 14, bold: true });
  txt("Punto de venta: " + pad(f.pto, 5) + "     Comp. Nro: " + pad(f.nro, 8), W / 2 + 34, 749, { size: 8.5, bold: true });
  txt("Fecha de emisión: " + fechaAR(f.fecha), W / 2 + 34, 736, { size: 8.5 });
  txt("CUIT: " + emisor.cuit, W / 2 + 34, 724, { size: 8.5 });
  txt("Ingresos Brutos: " + (emisor.iibb || emisor.cuit), W / 2 + 34, 712, { size: 8.5 });
  txt("Inicio de actividades: " + (emisor.inicio || "-"), W / 2 + 34, 700, { size: 8.5 });

  // Receptor
  let y = 670;
  const r = f.receptor;
  if (esA && r) {
    txt("Razón social: " + r.razon, M, y, { size: 9.5, bold: true });
    txt("Pedido: " + (f.pedido || ""), W - M - 110, y, { size: 9 });
    y -= 13; txt("CUIT: " + cuitFmt(r.cuit) + "     Condición frente al IVA: " + (r.cond === "mono" ? "Responsable Monotributo" : "IVA Responsable Inscripto"), M, y, { size: 8.5 });
    y -= 12; txt("Domicilio: " + r.domicilio, M, y, { size: 8.5 });
  } else {
    txt("A CONSUMIDOR FINAL", M, y, { size: 10, bold: true });
    if (f.cliente) txt("Cliente: " + f.cliente, M + 160, y, { size: 9 });
    txt("Pedido: " + (f.pedido || ""), W - M - 110, y, { size: 9 });
  }
  y -= 14; txt("Condición de venta: Contado / pago electrónico", M, y, { size: 8.5, color: gris });
  if (esNC && f.asociado) { y -= 12; txt(`Comprobante asociado: Factura ${f.asociado.tipo === 1 ? "A" : "B"} ${pad(f.asociado.pto, 5)}-${pad(f.asociado.nro, 8)} del ${fechaAR(f.asociado.fecha)}`, M, y, { size: 8.5, bold: true }); }
  y -= 12; hr(y);

  // Detalle
  y -= 16;
  txt("Producto", M, y, { bold: true }); right("Cant.", 380, y, { bold: true }); right("Precio unit.", 470, y, { bold: true }); right("Subtotal", W - M, y, { bold: true });
  y -= 6; hr(y);
  const k = esA ? 1 + Number(f.alicuota || 21) / 100 : 1; // en la A los precios van sin IVA
  // Cada producto a precio de lista (como Shopify) y después la línea de descuentos.
  const valorLinea = (it) => Math.max(Number(it.tot) || 0, Number(it.orig) || 0);
  const filas = [...(f.items || [])].map((it) => ({ ...it, tot: Math.round((valorLinea(it) / k) * 100) / 100 }));
  if (Number(f.envio) > 0) filas.push({ ti: "Envío", q: 1, tot: Math.round((Number(f.envio) / k) * 100) / 100 });
  if (esA) {
    // Los centavos de redondeo van a la línea más grande, así las líneas suman exacto el neto.
    const origBruto = [...(f.items || []).map(valorLinea), Number(f.envio) > 0 ? Number(f.envio) : 0].reduce((a, v) => a + v, 0);
    if (Math.abs(origBruto - f.total) < 0.01 && filas.length) {
      const dif = Math.round((f.neto - filas.reduce((a, it) => a + it.tot, 0)) * 100) / 100;
      const big = filas.reduce((m, it, i) => (it.tot > filas[m].tot ? i : m), 0);
      if (Math.abs(dif) < 1) filas[big].tot = Math.round((filas[big].tot + dif) * 100) / 100;
    }
  }
  for (const it of filas) {
    y -= 15;
    const nom = limpio(it.ti).slice(0, 62);
    txt(nom, M, y); right(String(it.q), 380, y);
    right(pesos(it.q ? Number(it.tot) / it.q : 0), 470, y); right(pesos(it.tot), W - M, y);
  }
  const bruto = filas.reduce((a, it) => a + Number(it.tot || 0), 0);
  const desc = Math.round((bruto - (esA ? f.neto : f.total)) * 100) / 100;
  if (desc > 0.009) { y -= 15; txt("Descuentos", M, y); right("- " + pesos(desc), W - M, y); }
  else if (desc < -0.009) { y -= 15; txt("Otros cargos", M, y); right(pesos(-desc), W - M, y); }
  y -= 10; hr(y);
  if (esA) {
    y -= 16; right("Subtotal (neto gravado)", 470, y); right(pesos(f.neto), W - M, y);
    y -= 14; right(`IVA ${String(f.alicuota || 21).replace(".", ",")} %`, 470, y); right(pesos(f.iva), W - M, y);
  }
  y -= 20; right("TOTAL", 470, y, { size: 12, bold: true }); right(pesos(f.total), W - M, y, { size: 12, bold: true });

  if (!esA) {
    // Transparencia fiscal (Ley 27.743)
    y -= 30;
    txt("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", M, y, { size: 8.5, bold: true });
    y -= 12; txt("IVA Contenido: " + pesos(f.iva), M, y, { size: 8.5 });
    y -= 12; txt("Otros Impuestos Nacionales Indirectos: $ 0,00", M, y, { size: 8.5 });

  } else if (r && r.cond === "mono") {
    y -= 30;
    txt("El crédito fiscal discriminado en el presente comprobante sólo podrá ser computado a efectos del Régimen de", M, y, { size: 7.5 });
    y -= 10; txt("Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618.", M, y, { size: 7.5 });
  }

  // QR + CAE
  const png = await QRCode.toBuffer(qrUrl(cfg, f), { margin: 0, width: 220, errorCorrectionLevel: "M" });
  const img = await pdf.embedPng(png);
  page.drawImage(img, { x: M, y: 60, width: 90, height: 90 });
  txt("Comprobante autorizado por ARCA", M + 105, 125, { size: 9, bold: true });
  txt("CAE: " + f.cae, M + 105, 110, { size: 9 });
  txt("Vencimiento del CAE: " + fechaAR(f.vto), M + 105, 96, { size: 9 });
  txt((esNC ? "Nota de crédito " : "Factura ") + numeroFactura(f), M + 105, 82, { size: 8, color: gris });

  return Buffer.from(await pdf.save());
}
