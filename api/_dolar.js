// Dólar que usa Francisco para pagar Meta: el de ARQ (ex DolarApp), comprando USDc.
// Fuente: CriptoYa (ARQ figura como "dolarapp"). Para días sin dato de ARQ, el dólar cripto de ese día (ArgentinaDatos).
import { redis } from "./_lib.js";
export const DOLAR = "impoluto:dolar"; // "AAAA-MM-DD" → { v, src }

const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

export async function dolarArqAhora() {
  const r = await fetch("https://criptoya.com/api/dolarapp/usdc/ars/1", { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("CriptoYa respondió " + r.status);
  const j = await r.json();
  const v = Number(j.totalAsk || j.ask);
  if (!(v > 100 && v < 100000)) throw new Error("Cotización de ARQ inválida");
  return v;
}

export async function historicoCripto() {
  const r = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/cripto", { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("ArgentinaDatos respondió " + r.status);
  const j = await r.json();
  const out = {};
  (Array.isArray(j) ? j : []).forEach((x) => { const v = Number(x.venta); if (x.fecha && v > 100) out[x.fecha.slice(0, 10)] = v; });
  return out;
}

// Guarda el de hoy (ARQ) y completa los días que falten desde `desde` con el cripto del día. Nunca pisa un dato de ARQ.
export async function actualizarDolares(desde) {
  const guardado = (await redis.hgetall(DOLAR)) || {};
  const tiene = (d) => guardado[d] != null;
  const set = {};
  let arq = null, error = null;
  try { arq = await dolarArqAhora(); set[hoyAR()] = JSON.stringify({ v: arq, src: "arq" }); } catch (e) { error = e.message; }
  try {
    const h = await historicoCripto();
    for (const [d, v] of Object.entries(h)) if (d >= desde && d < hoyAR() && !tiene(d)) set[d] = JSON.stringify({ v, src: "cripto" });
  } catch (e) { error = (error ? error + " · " : "") + e.message; }
  if (Object.keys(set).length) await redis.hset(DOLAR, set);
  return { arq, guardados: Object.keys(set).length, error };
}
