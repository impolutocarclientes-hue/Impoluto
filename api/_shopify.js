// Conexión con Shopify usando el método de ESA: una app propia creada en dev.shopify.com,
// instalada en la tienda, con permisos de solo lectura. Con el Client ID y el Client secret
// pedimos un token (client credentials grant) que dura 24 horas y lo renovamos solo.
import { redis } from "./_lib.js";

export const API_VERSION = "2026-07";
const TOKEN_KEY = "impoluto:shopify_token";

export function shopHost(shop) {
  let s = String(shop || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s.endsWith(".myshopify.com")) s = s.replace(/\.myshopify\.com$/, "") + ".myshopify.com";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) throw new Error("El nombre de la tienda tiene que ser el que termina en .myshopify.com");
  return s;
}

export async function getToken(cfg, force = false) {
  if (!force) {
    const cached = await redis.get(TOKEN_KEY);
    const c = typeof cached === "string" ? JSON.parse(cached) : cached;
    if (c && c.shop === cfg.shop && c.exp > Date.now() + 5 * 60 * 1000) return c.token;
  }
  const host = shopHost(cfg.shop);
  const r = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  });
  const txt = await r.text();
  let j = {};
  try { j = JSON.parse(txt); } catch {}
  if (!r.ok || !j.access_token) {
    const why = j.error_description || j.error || txt.slice(0, 200) || r.status;
    throw new Error("Shopify no aceptó los códigos de la app: " + why);
  }
  const ttl = Number(j.expires_in) || 86399;
  await redis.set(TOKEN_KEY, JSON.stringify({ shop: cfg.shop, token: j.access_token, scope: j.scope, exp: Date.now() + ttl * 1000 }), { ex: ttl });
  return j.access_token;
}

export async function gql(cfg, query, variables = {}) {
  const host = shopHost(cfg.shop);
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await getToken(cfg, attempt === 1);
    const r = await fetch(`https://${host}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (r.status === 401 && attempt === 0) continue; // token vencido: pedimos otro
    if (r.status === 429) { await sleep(1500); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Shopify respondió ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    if (j.errors && j.errors.length) {
      if (j.errors.some((e) => e.extensions && e.extensions.code === "THROTTLED")) { await sleep(2000); continue; }
      throw new Error("Shopify: " + j.errors.map((e) => e.message).join(" · ").slice(0, 300));
    }
    return j.data;
  }
  throw new Error("Shopify no respondió después de varios intentos.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const amt = (m) => Number(m && m.shopMoney && m.shopMoney.amount) || 0;

const ORDER_FIELDS = `
      id name createdAt processedAt updatedAt cancelledAt test
      displayFinancialStatus paymentGatewayNames sourceName
      totalPriceSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}}
      totalDiscountsSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}}
      totalRefundedSet{shopMoney{amount}}
      discountCodes
      shippingLine{ title code originalPriceSet{shopMoney{amount}} }
      lineItems(first:50){ nodes{
        quantity currentQuantity sku name title variantTitle
        product{ id } variant{ id }
        discountedTotalSet{shopMoney{amount}} originalTotalSet{shopMoney{amount}}
      } }`;
const ORDERS_Q = `query($q:String,$after:String){
  orders(first:100, after:$after, query:$q, sortKey:UPDATED_AT){
    pageInfo{ hasNextPage endCursor }
    nodes{ ${ORDER_FIELDS} }
  }
}`;

// Un pedido recién leído de Shopify (para no facturar con datos viejos: cancelado o devuelto después del último sync).
export async function fetchOrder(cfg, orderId) {
  const d = await gql(cfg, `query($id:ID!){ order(id:$id){ ${ORDER_FIELDS} } }`, { id: "gid://shopify/Order/" + orderId });
  return d && d.order ? compactOrder(d.order) : null;
}

const gid = (s) => String(s || "").split("/").pop();

// Pedido compacto: lo mínimo para hacer las cuentas. Sin nombres, mails ni direcciones.
export function compactOrder(o) {
  return {
    id: gid(o.id),
    n: o.name,
    c: o.createdAt,
    p: o.processedAt || o.createdAt,
    u: o.updatedAt,
    x: o.cancelledAt || null,
    t: !!o.test,
    f: o.displayFinancialStatus || "",
    g: (o.paymentGatewayNames || []).join(","),
    s: o.sourceName || "",
    tot: amt(o.totalPriceSet),
    cur: amt(o.currentTotalPriceSet),
    disc: amt(o.totalDiscountsSet),
    ship: amt(o.totalShippingPriceSet),
    ref: amt(o.totalRefundedSet),
    dc: (o.discountCodes || []).slice(0, 5),
    // Método de envío que eligió el cliente (para saber si fue envío gratis a sucursal).
    sl: o.shippingLine ? String(o.shippingLine.title || o.shippingLine.code || "").slice(0, 120) : "",
    li: (o.lineItems && o.lineItems.nodes || []).map((l) => ({
      pid: gid(l.product && l.product.id) || null,
      vid: gid(l.variant && l.variant.id) || null,
      sku: l.sku || "",
      ti: l.title || l.name || "",
      vt: l.variantTitle || "",
      q: Number(l.quantity) || 0,
      cq: l.currentQuantity == null ? Number(l.quantity) || 0 : Number(l.currentQuantity) || 0,
      tot: amt(l.discountedTotalSet),
      orig: amt(l.originalTotalSet),
    })),
  };
}

// Trae todos los pedidos actualizados desde `sinceISO` (o creados en los últimos días si es la primera vez).
export async function fetchOrders(cfg, sinceISO, maxPages = 60) {
  const q = sinceISO ? `updated_at:>='${sinceISO}'` : null;
  const out = [];
  let after = null;
  for (let i = 0; i < maxPages; i++) {
    const d = await gql(cfg, ORDERS_Q, { q, after });
    const page = d.orders;
    for (const o of page.nodes) out.push(compactOrder(o));
    if (!page.pageInfo.hasNextPage) return { orders: out, complete: true };
    after = page.pageInfo.endCursor;
  }
  return { orders: out, complete: false, cursor: after };
}

export async function shopInfo(cfg) {
  const d = await gql(cfg, `{ shop{ name currencyCode ianaTimezone myshopifyDomain } }`);
  return d.shop;
}

// Embudo de la tienda (visitas, carrito, checkout). Necesita el permiso read_reports;
// si Shopify no lo deja (depende del plan), devolvemos null y el embudo sale de Meta.
export async function fetchSessions(cfg, days = 90) {
  const q = `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout TIMESERIES day SINCE -${days}d UNTIL today`;
  try {
    const d = await gql(cfg, `query($q:String!){ shopifyqlQuery(query:$q){ tableData{ columns{ name } rows } parseErrors } }`, { q });
    const r = d && d.shopifyqlQuery;
    if (!r || (r.parseErrors && r.parseErrors.length) || !r.tableData) return null;
    const cols = r.tableData.columns.map((c) => c.name);
    return r.tableData.rows.map((row) => {
      const vals = Array.isArray(row) ? row : cols.map((c) => row[c]);
      const o = {};
      cols.forEach((c, i) => (o[c] = vals[i]));
      return {
        d: String(o.day || o.date || "").slice(0, 10),
        ses: Number(o.sessions) || 0,
        cart: Number(o.sessions_with_cart_additions) || 0,
        chk: Number(o.sessions_that_reached_checkout) || 0,
        buy: Number(o.sessions_that_completed_checkout) || 0,
      };
    }).filter((x) => x.d);
  } catch {
    return null;
  }
}

// Email y nombre del cliente de UN pedido, solo para mandarle su factura (no se guarda en la base).
// Si la app de Shopify no tiene acceso a datos de clientes, devuelve null y la factura se descarga a mano.
export async function contactoPedido(cfg, orderId) {
  try {
    const d = await gql(cfg, `query($id:ID!){ order(id:$id){ email customer{ firstName lastName } billingAddress{ name } } }`, { id: "gid://shopify/Order/" + orderId });
    const o = d && d.order;
    if (!o) return null;
    const nombre = (o.billingAddress && o.billingAddress.name) || [o.customer && o.customer.firstName, o.customer && o.customer.lastName].filter(Boolean).join(" ");
    return { email: o.email || null, nombre: nombre || null };
  } catch { return null; }
}

// Nombre ACTUAL de cada producto (los pedidos guardan el nombre que tenía cuando se vendió).
// Necesita el permiso read_products; si no está, devuelve null y se usan los nombres de los pedidos.
export async function fetchProductTitles(cfg) {
  try {
    const out = {};
    let after = null;
    for (let i = 0; i < 10; i++) {
      const d = await gql(cfg, `query($after:String){ products(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ id title } } }`, { after });
      d.products.nodes.forEach((p) => (out[gid(p.id)] = p.title));
      if (!d.products.pageInfo.hasNextPage) break;
      after = d.products.pageInfo.endCursor;
    }
    return out;
  } catch (e) { return { _error: e.message }; }
}
