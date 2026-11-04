// ARCA simulado para probar la pantalla de facturación en local (FAKE_ARCA=1). No llama a ARCA de verdad.
export function instalarArcaFalso() {
  const st = { last: 0, comps: {}, lastNC: 0, ncs: {} };
  const tagv = (x, n) => (String(x).match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (/myshopify\.com/.test(url)) {
      // Shopify simulado: devuelve el pedido tal como está guardado (solo para probar en local).
      if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: "dev", scope: "read_orders", expires_in: 86399 }));
      const { redis, ORDERS } = await import("../api/_lib.js");
      const { variables } = JSON.parse(opts.body);
      if (!variables || !variables.id) return new Response(JSON.stringify({ data: { order: null } }));
      const id = String(variables.id).split("/").pop();
      let o = await redis.hget(ORDERS, id); if (typeof o === "string") o = JSON.parse(o);
      const m = (v) => ({ shopMoney: { amount: String(v || 0) } });
      const raw = o && { id: "gid://shopify/Order/" + o.id, name: o.n, createdAt: o.c, processedAt: o.p, updatedAt: o.u, cancelledAt: o.x, test: o.t, displayFinancialStatus: o.f, paymentGatewayNames: [o.g], sourceName: o.s,
        totalPriceSet: m(o.tot), currentTotalPriceSet: m(o.cur), totalDiscountsSet: m(o.disc), totalShippingPriceSet: m(o.ship), totalRefundedSet: m(o.ref), discountCodes: o.dc || [],
        lineItems: { nodes: o.li.map((l) => ({ quantity: l.q, currentQuantity: l.cq, sku: l.sku, name: l.ti, title: l.ti, variantTitle: l.vt, product: { id: "gid://shopify/Product/" + l.pid }, variant: { id: "gid://shopify/ProductVariant/" + l.vid }, discountedTotalSet: m(l.tot), originalTotalSet: m(l.orig) })) } };
      return new Response(JSON.stringify({ data: { order: raw || null } }));
    }
    if (!/afip\.gov\.ar/.test(url)) return real(url, opts);
    const body = String(opts.body || "");
    const xml = (i) => new Response(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${i}</soap:Body></soap:Envelope>`);
    if (url.includes("LoginCms")) return xml(`<loginCmsReturn>${`<loginTicketResponse><credentials><token>T</token><sign>S</sign></credentials><header><expirationTime>${new Date(Date.now() + 432e5).toISOString()}</expirationTime></header></loginTicketResponse>`.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</loginCmsReturn>`);
    const a = String(opts.headers.SOAPAction).split("/").pop();
    if (a === "FEParamGetPtosVenta") return xml(`<ResultGet><PtoVenta><Nro>5</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta></ResultGet>`);
    const nc = tagv(body, "CbteTipo") === "8";
    if (a === "FECompUltimoAutorizado") return xml(`<CbteNro>${nc ? st.lastNC : st.last}</CbteNro>`);
    if (a === "FECompConsultar") { const c = (nc ? st.ncs : st.comps)[tagv(body, "CbteNro")]; return xml(c ? `<ResultGet><CbteFch>${c.fecha}</CbteFch><ImpTotal>${c.total}</ImpTotal><CodAutorizacion>${c.cae}</CodAutorizacion><FchVto>20261120</FchVto></ResultGet>` : `<Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors>`); }
    if (a === "FECAESolicitar") {
      const nro = Number(tagv(body, "CbteDesde"));
      const m = nc ? st.ncs : st.comps;
      if (nc) st.lastNC = nro; else st.last = nro;
      m[nro] = { total: Number(tagv(body, "ImpTotal")), fecha: tagv(body, "CbteFch"), cae: (nc ? "86" : "76") + String(nro).padStart(12, "0") };
      return xml(`<FECAEDetResponse><Resultado>A</Resultado><CAE>${m[nro].cae}</CAE><CAEFchVto>20261120</CAEFchVto></FECAEDetResponse>`);
    }
    throw new Error("ARCA falso: " + a);
  };
}
