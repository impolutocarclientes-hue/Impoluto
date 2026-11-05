// Pantalla «Facturación»: conectar ARCA, revisar los pedidos pagados y emitir las facturas B cuando el usuario lo pide.
let H = null; // helpers de app.js: { api, toast, render, esc, money }
const F = { facA: null, data: null, loading: false, sel: new Set(), confirm: false, emitiendo: false, csr: null, puntos: null, edit: false, err: null, anular: null, anulando: false, libroMes: null };

export function initFacturas(helpers) { H = helpers; }
export async function cargarFacturas(force) {
  if (F.loading || (F.data && !force)) return;
  F.loading = true;
  try { F.data = await H.api("/api/factura"); F.err = null; } catch (e) { F.err = e.message; }
  F.loading = false; H.render();
}

const cuitOk = (c) => { const s = String(c || ""); if (!/^\d{11}$/.test(s)) return false; const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; const r = 11 - (w.reduce((a, x, i) => a + x * Number(s[i]), 0) % 11); return (r === 11 ? 0 : r === 10 ? 9 : r) === Number(s[10]); };
const fecha = (iso) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const hoyISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const isoDe = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
// Rango de fechas que ARCA acepta: hasta 5 días atrás y no antes de la última factura del mismo tipo.
function rangoFecha(d, tipo) {
  const hoy = hoyISO();
  let min = new Date(new Date(hoy + "T12:00:00Z").getTime() - 5 * 864e5).toISOString().slice(0, 10);
  const ult = d.facturas.filter((f) => f.pto === d.arca.ptoVta && f.tipo === tipo && f.fecha).map((f) => isoDe(f.fecha)).sort().pop();
  if (ult && ult > min) min = ult;
  return { min, max: hoy };
}
const inputFecha = (id, d, tipo, ro) => { const r = rangoFecha(d, tipo); const v = F[id] && F[id] >= r.min && F[id] <= r.max ? F[id] : r.max; return `<label class="f" style="max-width:190px"><span>Fecha de la factura</span><input class="in" type="date" id="${id}" min="${r.min}" max="${r.max}" value="${v}" ${ro ? "readonly" : ""}></label>`; };
const fch = (s) => (s ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : "");
const nro = (f) => `${String(f.pto).padStart(5, "0")}-${String(f.nro).padStart(8, "0")}`;
const esNC = (f) => f.tipo === 8 || f.tipo === 3;
const letraDe = (t) => (t === 1 || t === 3 ? "A" : "B");
const nombre = (f) => (esNC(f) ? "NC " : "Factura ") + letraDe(f.tipo) + " " + nro(f);

function pasos(d) {
  const { esc } = H;
  const a = d.arca;
  const step = (n, title, body, done) => `<div class="step ${done ? "done" : ""}"><span class="num">${done ? "✓" : n}</span><div><b>${title}</b><div class="small" style="color:var(--n200);margin-top:4px;display:grid;gap:6px">${body}</div></div></div>`;
  const ext = (url, txt) => `<a class="ctl" href="${url}" target="_blank" rel="noopener" style="text-decoration:none;justify-self:start">${txt} ↗</a>`;
  const csr = F.csr || (a && a.csr);
  let h = `<div class="card" style="display:grid;gap:14px"><h3 style="margin:0">Conectar con ARCA</h3>
  <p class="note" style="margin:0">Se hace una sola vez. La app genera su propia clave y la guarda en el servidor: no la ve nadie, ni vos ni yo. ARCA solo le da permiso para hacer facturas.</p><div class="steps">`;
  h += step(1, "Tu CUIT", `<div>El que factura (el tuyo, sin guiones).</div>
    <div class="actions"><input class="in" id="fa-cuit" inputmode="numeric" placeholder="20123456789" value="${esc((a && a.cuit) || "")}" style="max-width:220px"><button class="ctl ${csr ? "" : "pri"}" data-fact="preparar">${csr ? "Generar otro pedido" : "Generar pedido de certificado"}</button></div>`, !!csr);
  h += step(2, "Subí el pedido a ARCA", `<div>Entrá a ARCA con tu clave fiscal → <b>Administración de Certificados Digitales</b> → <b>Agregar alias</b>. Alias: <code>impolutoapp</code>. Subí este archivo y después descargá el certificado que te da ARCA.</div>
    ${csr ? `<div class="actions"><button class="ctl pri" data-fact="bajar-csr">Descargar pedido (impolutoapp.csr)</button></div>` : ""}
    ${ext("https://auth.afip.gob.ar/contribuyente_/login.xhtml", "Abrir ARCA")}
    <div class="note">Si no te aparece el servicio, agregalo en <b>Administrador de Relaciones de Clave Fiscal → Adherir servicio → ARCA → Servicios interactivos → Administración de Certificados Digitales</b>.</div>`, false);
  h += step(3, "Dale permiso para facturar", `<div>En ARCA → <b>Administrador de Relaciones de Clave Fiscal</b> → <b>Nueva relación</b> → Buscar → <b>ARCA → WebServices → Facturación Electrónica</b>. En «Representante» elegí el alias <code>impolutoapp</code> y confirmá.</div>`, false);
  h += step(4, "Creá un punto de venta para la app", `<div>En ARCA → <b>Administración de puntos de venta y domicilios</b> → <b>Agregar</b>. Sistema: <b>«Factura Electrónica - Monotributo / Responsable Inscripto - Web Services»</b>. <b>Tiene que ser nuevo, solo para esta app</b>: no uses el que factura Mercado Libre (Ecomm-App). Si elegís uno que ya tiene facturas de otro sistema, la app no te deja.</div>`, false);
  h += step(5, "Pegá el certificado", `<div>Abrí el archivo que bajaste de ARCA (.crt) o arrastralo acá.</div>
    <div class="actions"><input type="file" id="fa-crt-file" accept=".crt,.pem,.cer,text/plain"></div>
    <textarea class="in" id="fa-crt" rows="4" placeholder="-----BEGIN CERTIFICATE-----" style="font-family:monospace;font-size:11px;width:100%"></textarea>
    <div class="actions"><button class="ctl pri" data-fact="certificado" ${a && a.tieneClave ? "" : "disabled"}>Conectar ARCA</button></div>
    <div class="note">La app solo pide autorizaciones de factura (y consulta las que ya hiciste). No ve tus otros datos de ARCA.</div>`, a && a.conectado);
  return h + "</div></div>";
}

function ajustes(d) {
  const { esc } = H;
  const a = d.arca, e = a.emisor || {};
  const pts = (F.puntos || []).filter((p) => !p.baja);
  const alic = a.alicuota;
  const row = (t, sub, ctl) => `<div class="qrow"><div><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</div><div>${ctl}</div></div>`;
  const inp = (k, v, ph = "") => `<input class="in" id="fa-e-${k}" data-emisor="${k}" value="${esc(v || "")}" placeholder="${esc(ph)}" style="width:100%">`;
  return `<div class="card qcard"><h3 style="margin:0 0 6px">Cómo salen tus facturas</h3>
    ${row("Punto de venta", "El que creaste para la app en ARCA.", pts.length ? `<div class="seg" style="width:100%">${pts.map((p) => `<button data-fact="pto" data-val="${p.nro}" aria-pressed="${a.ptoVta === p.nro}">${p.nro}</button>`).join("")}</div>` : `<div class="actions"><span class="note">${a.ptoVta ? "Punto " + a.ptoVta : "Todavía no hay puntos de venta web service."}</span><button class="ctl" data-fact="puntos">Buscar en ARCA</button></div>`)}
    ${row("IVA del restaurador", alic ? "Responsable inscripto, productos de alícuota general. El beneficio de IVA no cambia la factura: va el 21 % completo." : "<span class='down'>Elegilo: hasta que no lo elijas no se emite nada.</span>", `<div class="seg" style="width:100%"><button data-fact="alic" data-val="10.5" aria-pressed="${alic === "10.5"}">10,5 %</button><button data-fact="alic" data-val="21" aria-pressed="${alic === "21"}">21 %</button><button data-fact="alic" data-val="" aria-pressed="${!alic}">Sin definir</button></div>`)}
    ${row("Nombre o razón social", "Como figura en ARCA.", inp("razon", e.razon))}
    ${row("Domicilio comercial", "", inp("domicilio", e.domicilio, "Calle 123, Lomas de Zamora, Buenos Aires"))}
    ${row("Ingresos brutos", "Número de inscripción (si es Convenio Multilateral, el CM).", inp("iibb", e.iibb, a.cuit))}
    ${row("Inicio de actividades", "Está en tu constancia de inscripción.", inp("inicio", e.inicio, "01/03/2026"))}
    ${row("Facturar pedidos desde", "Los pedidos de antes no aparecen.", `<input class="in" type="date" id="fa-desde" data-fact-desde value="${esc(d.desde)}" style="width:100%">`)}
    <div class="actions" style="margin-top:10px"><button class="ctl" data-fact="guardar-emisor">Guardar datos</button><span class="note">CUIT ${esc(a.cuit)} · certificado vence ${a.vence ? new Date(a.vence).toLocaleDateString("es-AR") : "—"}${a.entorno === "homo" ? " · <b>modo prueba</b>" : ""}</span><button class="ctl" data-fact="reconectar" style="margin-left:auto">Cambiar certificado</button></div></div>`;
}

function mailCard(d) {
  const { esc } = H;
  if (d.mail && !F.editMail) return `<p class="note">Las facturas se le mandan al cliente desde <b>${esc(d.mail.from)}</b>. <a href="#" data-fact="edit-mail">Cambiar</a></p>`;
  return `<div class="card" style="display:grid;gap:10px"><h3 style="margin:0">Mandarle la factura al cliente</h3>
    <p class="note" style="margin:0">Se manda por <b>Resend</b> (gratis hasta 3.000 emails por mes). Creá la cuenta, agregá tu dominio <code>impolutocar.com</code> (te da 3 registros para cargar en Shopify → Dominios) y creá una clave.</p>
    <a class="ctl" href="https://resend.com/signup" target="_blank" rel="noopener" style="text-decoration:none;justify-self:start">Abrir Resend ↗</a>
    <div class="form"><label class="f"><span>Clave de Resend</span><input class="in" id="fa-rk" placeholder="re_…" autocomplete="off"></label>
    <label class="f"><span>Sale desde</span><input class="in" id="fa-from" value="Impoluto &lt;facturas@impolutocar.com&gt;"></label>
    <label class="f"><span>Si el cliente responde, le llega a</span><input class="in" id="fa-reply" placeholder="tu email"></label></div>
    <div class="actions"><button class="ctl pri" data-fact="mail">Guardar</button>${d.mail ? '<button class="ctl" data-fact="edit-mail">Cancelar</button>' : ""}<span class="note">Mientras tanto podés descargar cada factura y mandarla a mano.</span></div></div>`;
}

export function viewFacturas() {
  const { esc, money } = H;
  if (!F.data) { cargarFacturas(); return `<div class="content"><div class="card empty">${F.err ? esc(F.err) : "Cargando…"}</div></div>`; }
  const d = F.data, a = d.arca;
  let h = `<div class="content">`;
  if (!a || !a.conectado || F.edit) return h + pasos(d) + (a && a.conectado ? `<div class="actions"><button class="ctl" data-fact="reconectar">Cancelar</button></div>` : "") + "</div>";
  if (!F.puntos && !F.buscandoPts) { F.buscandoPts = true; H.api("/api/factura", { method: "POST", body: JSON.stringify({ action: "puntos" }) }).then((r) => { F.puntos = r.puntos; H.render(); }).catch(() => { F.puntos = []; }); }

  const listo = a.ptoVta && a.alicuota && a.emisor && a.emisor.razon && a.emisor.domicilio && a.emisor.inicio;
  const fact = d.pendientes.filter((p) => !p.motivo), noFact = d.pendientes.filter((p) => p.motivo);
  [...F.sel].forEach((id) => { if (!fact.some((p) => p.id === id)) F.sel.delete(id); });
  const selTot = fact.filter((p) => F.sel.has(p.id)).reduce((s, p) => s + p.total, 0);
  const revisar = d.facturas.filter((f) => f.estado === "enviando" || f.estado === "revisar");

  if (!listo) h += `<p class="banner warn">Antes de emitir: ${[!a.ptoVta && "elegí el punto de venta", !a.alicuota && "definí el IVA con tu contador", !(a.emisor && a.emisor.razon && a.emisor.domicilio && a.emisor.inicio) && "completá tus datos"].filter(Boolean).join(", ")}.</p>`;
  revisar.forEach((f) => (h += `<p class="banner bad">La ${esNC(f) ? "nota de crédito" : "factura"} ${esc(nro(f))} del pedido ${esc(f.pedido)} quedó a medio emitir. ${esc(f.aviso || "")} La próxima vez que emitas se revisa sola en ARCA.</p>`));

  // Facturas de pedidos que después se cancelaron o devolvieron
  if (d.aAnular && d.aAnular.length) {
    h += `<p class="banner warn"><b>${d.aAnular.length === 1 ? "Hay un pedido facturado que" : "Hay " + d.aAnular.length + " pedidos facturados que"} después se canceló o devolvió.</b> Necesita${d.aAnular.length === 1 ? "" : "n"} nota de crédito: ${d.aAnular.map((x) => `${esc(x.pedido)} (${esc(x.motivo.charAt(0).toLowerCase() + x.motivo.slice(1))}, factura ${esc(nro(x))})`).join(" · ")}. Usá «Anular» en la lista de abajo.</p>`;
  }

  // Formulario de factura A
  if (F.facA) {
    const p = fact.find((x) => x.id === F.facA);
    if (!p) F.facA = null;
    else h += `<div class="card" style="display:grid;gap:10px;border-color:var(--pink)"><h3 style="margin:0">Factura A · pedido ${esc(p.n)} · ${money(p.total)}</h3>
      <p class="note" style="margin:0">Para un cliente que te pidió factura con su CUIT. Copiá los datos tal cual figuran en su constancia de ARCA. La factura A discrimina el IVA y el cliente la puede usar como crédito fiscal.</p>
      <div class="form"><label class="f"><span>CUIT del cliente</span><input class="in" id="fa-a-cuit" inputmode="numeric" placeholder="30712345678" value="${esc((F.aDatos && F.aDatos.cuit) || "")}" ${F.confirmA ? "readonly" : ""}></label>
      <label class="f"><span>Condición frente al IVA</span><select class="in" id="fa-a-cond" ${F.confirmA ? "disabled" : ""}><option value="">Elegí…</option><option value="ri" ${F.aDatos && F.aDatos.cond === "ri" ? "selected" : ""}>Responsable inscripto</option><option value="mono" ${F.aDatos && F.aDatos.cond === "mono" ? "selected" : ""}>Monotributista</option></select></label>
      <label class="f" style="grid-column:1/-1"><span>Nombre o razón social</span><input class="in" id="fa-a-razon" value="${esc((F.aDatos && F.aDatos.razon) || "")}" ${F.confirmA ? "readonly" : ""}></label>
      <label class="f" style="grid-column:1/-1"><span>Domicilio</span><input class="in" id="fa-a-dom" placeholder="Calle 123, Localidad, Provincia" value="${esc((F.aDatos && F.aDatos.domicilio) || "")}" ${F.confirmA ? "readonly" : ""}></label></div>
      ${inputFecha("faFechaA", d, 1, F.confirmA)}
      <div class="actions">${F.confirmA ? `<button class="ctl pri" data-fact="facA-ok" data-id="${esc(p.id)}" ${F.emitiendo ? "disabled" : ""}>${F.emitiendo ? "Emitiendo…" : "Sí, emitir factura A por " + money(p.total) + " con fecha " + (F.faFechaA || hoyISO()).split("-").reverse().join("/")}</button><button class="ctl" data-fact="facA-volver">Revisar datos</button><span class="note">Una factura emitida no se borra: si hay un error se hace nota de crédito.</span>` : `<button class="ctl pri" data-fact="facA-pre">Emitir factura A</button><button class="ctl" data-fact="facA-no">Cancelar</button>`}</div></div>`;
  }

  // Para facturar
  h += `<section class="block"><div class="bh"><h2>Para facturar</h2><span class="note">${fact.length} pedidos pagados desde el</span><input class="in" type="date" id="fa-ver-desde" value="${esc(d.desde)}" style="width:150px"><button class="ctl" data-fact="ver-desde">Ver</button></div>
  <p class="note">Podés listar pedidos de meses anteriores, pero ARCA solo acepta facturas con fecha de hasta 5 días atrás: salen con la fecha que elijas dentro de ese rango.</p>`;
  if (fact.length) {
    h += `<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:28px"><input type="checkbox" data-fact-all ${F.sel.size === fact.length ? "checked" : ""}></th><th>Pedido</th><th>Fecha</th><th class="r">Total</th><th></th></tr></thead><tbody>
      ${fact.map((p) => `<tr><td><input type="checkbox" data-fact-sel="${esc(p.id)}" ${F.sel.has(p.id) ? "checked" : ""}></td><td>${esc(p.n)}</td><td>${esc(fecha(p.c))}</td><td class="r">${money(p.total)}</td><td class="r"><button class="ctl" data-fact="facA" data-id="${esc(p.id)}" ${listo ? "" : "disabled"} title="Para un cliente responsable inscripto o monotributista que te pide factura con su CUIT">Factura A</button></td></tr>`).join("")}</tbody></table></div>
      <div class="actions" style="margin-top:10px;align-items:flex-end">${inputFecha("faFechaB", d, 6, F.confirm)}
      ${F.confirm ? `<button class="ctl pri" data-fact="emitir" ${F.emitiendo ? "disabled" : ""}>${F.emitiendo ? "Emitiendo…" : `Sí, emitir ${Math.min(F.sel.size, 10)} factura${F.sel.size === 1 ? "" : "s"} con fecha ${(F.faFechaB || hoyISO()).split("-").reverse().join("/")}`}</button><button class="ctl" data-fact="cancelar">Cancelar</button><span class="note">Una factura emitida no se borra: si hay que corregirla se hace una nota de crédito.</span>`
      : `<button class="ctl pri" data-fact="pre-emitir" ${listo && F.sel.size ? "" : "disabled"}>Emitir ${F.sel.size || ""} factura${F.sel.size === 1 ? "" : "s"}</button><span class="note">${F.sel.size > 10 ? "Se emiten de a 10 por vez." : "Factura B a consumidor final" + (a.alicuota ? ", IVA " + a.alicuota.replace(".", ",") + " %" : "") + "."}</span>`}</div>`;
  } else h += `<div class="card empty">No hay pedidos pagados sin factura.</div>`;
  if (noFact.length) h += `<p class="note">No se pueden facturar todavía: ${noFact.map((p) => `${esc(p.n)} (${esc(p.motivo)})`).join(" · ")}</p>`;
  h += `</section>`;

  // Comprobantes emitidos (facturas, anuladas y notas de crédito)
  const em = d.facturas.filter((f) => f.estado === "emitida" || f.estado === "anulada");
  const aAnularIds = new Set((d.aAnular || []).map((x) => x.orderId));
  const acciones = (f) => {
    const pdf = `<a class="ctl" href="/api/factura?pdf=${encodeURIComponent(f.clave)}" target="_blank" rel="noopener" style="text-decoration:none">PDF</a>`;
    if (esNC(f) || f.estado !== "emitida") return pdf;
    const mail = d.mail ? ` <button class="ctl" data-fact="email" data-id="${esc(f.clave)}">${f.emailAt ? "Reenviar" : "Mandar"}</button>` : "";
    const an = F.anular === f.clave
      ? ` <button class="ctl pri" data-fact="anular-ok" data-id="${esc(f.clave)}" ${F.anulando ? "disabled" : ""}>${F.anulando ? "Emitiendo…" : "Sí, nota de crédito por " + money(f.total)}</button> <button class="ctl" data-fact="anular-no">No</button>`
      : ` <button class="ctl" data-fact="anular" data-id="${esc(f.clave)}">${aAnularIds.has(f.orderId) ? "⚠ Anular" : "Anular"}</button>`;
    return pdf + mail + an;
  };
  const estadoTxt = (f) => (esNC(f) ? `Anula la ${f.asociado ? letraDe(f.asociado.tipo) + " " + nro(f.asociado) : "factura"}` : f.estado === "anulada" ? `<span class="down">Anulada</span>` : f.receptor ? `<span class="muted small">${esc(f.receptor.razon)}</span>` : "");
  const meses = [...new Set(em.map((f) => f.fecha.slice(0, 6)))].sort().reverse();
  if (!F.libroMes || !meses.includes(F.libroMes)) F.libroMes = meses[0] || null;
  h += `<section class="block"><div class="bh"><h2>Comprobantes emitidos</h2>${meses.length ? `<div class="actions"><select class="in" data-fact-mes>${meses.map((m) => `<option value="${m}" ${m === F.libroMes ? "selected" : ""}>${m.slice(4, 6)}/${m.slice(0, 4)}</option>`).join("")}</select><button class="ctl" data-fact="libro">Libro IVA Ventas (Excel)</button></div>` : ""}</div>`;
  h += em.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Comprobante</th><th>Pedido</th><th>Fecha</th><th class="r">Total</th><th>Estado</th><th>CAE</th><th></th></tr></thead><tbody>
    ${em.slice(0, 300).map((f) => `<tr><td>${esc(nombre(f))}</td><td>${esc(f.pedido)}</td><td>${esc(fch(f.fecha))}</td><td class="r">${esNC(f) ? "−" : ""}${money(f.total)}</td><td>${estadoTxt(f)}</td><td><code>${esc(f.cae)}</code></td>
      <td class="r" style="white-space:nowrap">${acciones(f)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">«Anular» hace una nota de crédito por el total en ARCA: sirve para una factura mal hecha o una devolución. Si el pedido sigue pagado, vuelve a aparecer en «Para facturar».</p>` : `<div class="card empty">Todavía no emitiste comprobantes.</div>`;
  h += `</section>`;
  h += mailCard(d) + ajustes(d);
  return h + "</div>";
}

const post = (body) => H.api("/api/factura", { method: "POST", body: JSON.stringify(body) });
function bajar(nombre, texto) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: "application/pkcs10" })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

// Devuelve true si el evento era de esta pantalla.
export async function onFactClick(e) {
  const t = e.target.closest("[data-fact],[data-fact-sel],[data-fact-all]");
  if (!t) return false;
  const { toast, render } = H;
  if (t.dataset.factSel !== undefined) { t.checked ? F.sel.add(t.dataset.factSel) : F.sel.delete(t.dataset.factSel); F.confirm = false; render(); return true; }
  if (t.dataset.factAll !== undefined) { const ids = F.data.pendientes.filter((p) => !p.motivo).map((p) => p.id); F.sel = t.checked ? new Set(ids) : new Set(); F.confirm = false; render(); return true; }
  e.preventDefault();
  const act = t.dataset.fact;
  try {
    if (act === "preparar") {
      t.disabled = true; t.textContent = "Generando…";
      const r = await post({ action: "preparar", cuit: document.getElementById("fa-cuit").value });
      F.csr = r.csr; await cargarFacturas(true); toast("Listo: ahora descargá el pedido y subilo a ARCA");
    } else if (act === "bajar-csr") bajar("impolutoapp.csr", F.csr || F.data.arca.csr);
    else if (act === "certificado") {
      t.disabled = true; t.textContent = "Conectando con ARCA…";
      const r = await post({ action: "certificado", cert: document.getElementById("fa-crt").value });
      F.puntos = r.puntos; F.edit = false; F.csr = null; await cargarFacturas(true); toast("ARCA conectado");
    } else if (act === "reconectar") { F.edit = !F.edit; render(); }
    else if (act === "puntos") { const r = await post({ action: "puntos" }); F.puntos = r.puntos; if (!r.puntos.length) toast("ARCA todavía no tiene puntos de venta web service. Crealo (paso 4) y volvé a buscar."); render(); }
    else if (act === "pto") { const r = await post({ action: "config", ptoVta: Number(t.dataset.val) }); if (r.aviso) toast(r.aviso); await cargarFacturas(true); }
    else if (act === "alic") { await post({ action: "config", alicuota: t.dataset.val || null }); await cargarFacturas(true); }
    else if (act === "guardar-emisor") {
      const emisor = {}; document.querySelectorAll("[data-emisor]").forEach((i) => (emisor[i.dataset.emisor] = i.value));
      await post({ action: "config", emisor, desde: document.getElementById("fa-desde").value }); await cargarFacturas(true); toast("Datos guardados");
    } else if (act === "edit-mail") { F.editMail = !F.editMail; render(); }
    else if (act === "mail") {
      await post({ action: "mail", resendKey: document.getElementById("fa-rk").value, from: document.getElementById("fa-from").value, replyTo: document.getElementById("fa-reply").value });
      F.editMail = false; await cargarFacturas(true); toast("Email configurado");
    } else if (act === "pre-emitir") { F.faFechaB = (document.getElementById("faFechaB") || {}).value || null; F.confirm = true; render(); }
    else if (act === "ver-desde") { await post({ action: "config", desde: document.getElementById("fa-ver-desde").value || null }); F.sel = new Set(); await cargarFacturas(true); }
    else if (act === "cancelar") { F.confirm = false; render(); }
    else if (act === "emitir") {
      F.emitiendo = true; render();
      const ids = [...F.sel].slice(0, 10);
      const r = await post({ action: "emitir", ids, fecha: F.faFechaB || null });
      const ok = r.resultados.filter((x) => x.ok && !x.ya), mal = r.resultados.filter((x) => !x.ok);
      const mailMal = ok.filter((x) => typeof x.mail === "string");
      ok.forEach((x) => F.sel.delete(x.id));
      toast(`${ok.length} factura${ok.length === 1 ? "" : "s"} emitida${ok.length === 1 ? "" : "s"}${mal.length ? ` · ${mal.length} con error: ${mal[0].error}` : ""}${mailMal.length ? ` · email: ${mailMal[0].mail}` : ""}`);
      F.emitiendo = false; F.confirm = false; await cargarFacturas(true);
    } else if (act === "facA") { F.facA = t.dataset.id; F.confirmA = false; F.aDatos = null; render(); window.scrollTo(0, 0); }
    else if (act === "facA-no") { F.facA = null; F.confirmA = false; render(); }
    else if (act === "facA-volver") { F.confirmA = false; render(); }
    else if (act === "facA-pre") {
      const cuit = document.getElementById("fa-a-cuit").value.replace(/\D/g, ""), cond = document.getElementById("fa-a-cond").value;
      if (!cuitOk(cuit)) return toast("El CUIT no es válido: revisalo (11 números)."), true;
      if (!cond) return toast("Elegí la condición frente al IVA del cliente."), true;
      if (document.getElementById("fa-a-razon").value.trim().length < 2 || document.getElementById("fa-a-dom").value.trim().length < 4) return toast("Completá nombre y domicilio del cliente."), true;
      F.faFechaA = (document.getElementById("faFechaA") || {}).value || null;
      F.aDatos = { cuit, cond, razon: document.getElementById("fa-a-razon").value.trim(), domicilio: document.getElementById("fa-a-dom").value.trim() };
      F.confirmA = true; render();
    } else if (act === "facA-ok") {
      F.emitiendo = true; render();
      const r = await post({ action: "emitirA", id: t.dataset.id, ...F.aDatos, fecha: F.faFechaA || null });
      F.emitiendo = false; F.confirmA = false; F.facA = null; F.aDatos = null;
      toast(`Factura A ${nro(r.f)} emitida`); await cargarFacturas(true);
    } else if (act === "anular") { F.anular = t.dataset.id; render(); }
    else if (act === "anular-no") { F.anular = null; render(); }
    else if (act === "anular-ok") {
      F.anulando = true; render();
      const f = F.data.facturas.find((x) => x.clave === t.dataset.id);
      const r = await post({ action: "anular", id: f.orderId });
      F.anular = null; F.anulando = false;
      toast(`Nota de crédito ${nro(r.nc)} emitida: la factura ${nro(f)} quedó anulada`);
      await cargarFacturas(true);
    } else if (act === "libro") libroIva();
    else if (act === "email") {
      t.disabled = true; t.textContent = "Mandando…";
      await post({ action: "email", id: t.dataset.id }); toast("Factura enviada"); await cargarFacturas(true);
    }
  } catch (err) { F.emitiendo = false; F.confirm = false; F.confirmA = false; F.anulando = false; F.anular = null; toast(err.message || String(err)); await cargarFacturas(true); }
  return true;
}

// Archivo .crt arrastrado o elegido → al cuadro de texto.
export function onFactChange(e) {
  if (e.target.matches && e.target.matches("[data-fact-mes]")) { F.libroMes = e.target.value; return true; }
  if (e.target.id === "fa-crt-file" && e.target.files[0]) { e.target.files[0].text().then((txt) => { document.getElementById("fa-crt").value = txt; }); return true; }
  return false;
}

// Libro IVA Ventas del mes: facturas (también las anuladas, porque se emitieron) y notas de crédito en negativo.
function libroIva() {
  const mes = F.libroMes;
  const fil = F.data.facturas.filter((f) => (f.estado === "emitida" || f.estado === "anulada") && f.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo - b.tipo) || (a.nro - b.nro));
  const n2 = (v) => String(Math.round(Number(v || 0) * 100) / 100).replace(".", ",");
  const rows = [["Fecha", "Tipo", "Punto de venta", "Número", "CAE", "Cliente", "Pedido", "Alícuota IVA", "Neto gravado", "IVA", "Total", "Comprobante asociado"]];
  let tn = 0, ti = 0, tt = 0;
  for (const f of fil) {
    const sg = esNC(f) ? -1 : 1;
    tn += sg * f.neto; ti += sg * f.iva; tt += sg * f.total;
    rows.push([fch(f.fecha), (esNC(f) ? "Nota de crédito " : "Factura ") + letraDe(f.tipo), String(f.pto).padStart(5, "0"), String(f.nro).padStart(8, "0"), f.cae, f.receptor ? `${f.receptor.razon} (CUIT ${f.receptor.cuit})` : "Consumidor final", f.pedido, String(f.alicuota).replace(".", ",") + " %", n2(sg * f.neto), n2(sg * f.iva), n2(sg * f.total), f.asociado ? "Factura " + letraDe(f.asociado.tipo) + " " + nro(f.asociado) : ""]);
  }
  rows.push(["", "", "", "", "", "", "TOTAL", "", n2(tn), n2(ti), n2(tt), ""]);
  const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `libro-iva-ventas-impoluto-${mes.slice(0, 4)}-${mes.slice(4, 6)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
