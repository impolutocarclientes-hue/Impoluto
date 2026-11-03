// Mercado Pago: leemos los cobros para tener la comisión real, las retenciones y cuándo se libera la plata.
// Solo leemos (GET). Mercado Pago no tiene tokens de solo lectura, así que la app nunca llama a nada que cree o devuelva pagos.
const API = "https://api.mercadopago.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(token, path) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error("Mercado Pago no aceptó el Access Token. Fijate que sea el de producción (empieza con APP_USR-).");
    if (!r.ok) throw new Error("Mercado Pago: " + (j.message || j.error || r.status));
    return j;
  }
  throw new Error("Mercado Pago no respondió después de varios intentos.");
}

export async function me(token) {
  const j = await get(token, "/users/me");
  return { id: j.id, nickname: j.nickname, site: j.site_id };
}

// Fecha en el formato que pide Mercado Pago: yyyy-MM-ddTHH:mm:ss.SSSZ
const mpDate = (d) => d.toISOString().replace("Z", "-00:00");

export function compactPayment(p) {
  const fees = (p.fee_details || []).filter((f) => !f.fee_payer || f.fee_payer === "collector");
  const comision = fees.reduce((a, f) => a + (Number(f.amount) || 0), 0);
  const monto = Number(p.transaction_amount) || 0;
  const neto = Number(p.transaction_details && p.transaction_details.net_received_amount) || 0;
  const devuelto = Number(p.transaction_amount_refunded) || 0;
  // Lo que falta entre el monto y el neto que no es comisión son retenciones de impuestos (pagos a cuenta).
  const retenciones = Math.max(0, monto - devuelto - neto - comision);
  return {
    id: String(p.id),
    c: p.date_created, a: p.date_approved || null, u: p.date_last_updated,
    rel: p.money_release_date || null, rs: p.money_release_status || null,
    st: p.status, sd: p.status_detail, op: p.operation_type,
    pm: p.payment_method_id, pt: p.payment_type_id, cu: Number(p.installments) || 1,
    monto, neto, devuelto, comision, retenciones,
    fees: fees.map((f) => ({ t: f.type, m: Number(f.amount) || 0 })),
    ref: p.external_reference || "", desc: String(p.description || "").slice(0, 80),
  };
}

// Trae los cobros actualizados en un rango, en ventanas cortas para no pasar el límite de resultados de la búsqueda.
export async function fetchPayments(token, since, until = new Date(), windowDays = 3) {
  const out = [];
  for (let from = new Date(since); from < until; ) {
    const to = new Date(Math.min(until.getTime(), from.getTime() + windowDays * 864e5));
    for (let offset = 0; offset < 1000; offset += 50) {
      const q = new URLSearchParams({ sort: "date_last_updated", criteria: "asc", range: "date_last_updated", begin_date: mpDate(from), end_date: mpDate(to), limit: "50", offset: String(offset) });
      const j = await get(token, "/v1/payments/search?" + q);
      (j.results || []).forEach((p) => out.push(compactPayment(p)));
      const total = (j.paging && j.paging.total) || 0;
      if (offset + 50 >= total) break;
    }
    from = to;
  }
  return out;
}
