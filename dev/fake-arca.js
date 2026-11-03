// ARCA simulado para probar la pantalla de facturación en local (FAKE_ARCA=1). No llama a ARCA de verdad.
export function instalarArcaFalso() {
  const st = { last: 41, comps: {} };
  const tagv = (x, n) => (String(x).match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (!/afip\.gov\.ar/.test(url)) return real(url, opts);
    const body = String(opts.body || "");
    const xml = (i) => new Response(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${i}</soap:Body></soap:Envelope>`);
    if (url.includes("LoginCms")) return xml(`<loginCmsReturn>${`<loginTicketResponse><credentials><token>T</token><sign>S</sign></credentials><header><expirationTime>${new Date(Date.now() + 432e5).toISOString()}</expirationTime></header></loginTicketResponse>`.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</loginCmsReturn>`);
    const a = String(opts.headers.SOAPAction).split("/").pop();
    if (a === "FEParamGetPtosVenta") return xml(`<ResultGet><PtoVenta><Nro>5</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta></ResultGet>`);
    if (a === "FECompUltimoAutorizado") return xml(`<CbteNro>${st.last}</CbteNro>`);
    if (a === "FECompConsultar") { const c = st.comps[tagv(body, "CbteNro")]; return xml(c ? `<ResultGet><CbteFch>${c.fecha}</CbteFch><ImpTotal>${c.total}</ImpTotal><CodAutorizacion>${c.cae}</CodAutorizacion><FchVto>20261120</FchVto></ResultGet>` : `<Errors><Err><Code>602</Code><Msg>Sin resultados</Msg></Err></Errors>`); }
    if (a === "FECAESolicitar") {
      const nro = Number(tagv(body, "CbteDesde"));
      st.last = nro; st.comps[nro] = { total: Number(tagv(body, "ImpTotal")), fecha: tagv(body, "CbteFch"), cae: "76" + String(nro).padStart(12, "0") };
      return xml(`<FECAEDetResponse><Resultado>A</Resultado><CAE>${st.comps[nro].cae}</CAE><CAEFchVto>20261120</CAEFchVto></FECAEDetResponse>`);
    }
    throw new Error("ARCA falso: " + a);
  };
}
