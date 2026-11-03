// Pantalla «Facturación»: conectar ARCA, revisar los pedidos pagados y emitir las facturas B cuando el usuario lo pide.
let H = null; // helpers de app.js: { api, toast, render, esc, money }
const F = { data: null, loading: false, sel: new Set(), confirm: false, emitiendo: false, csr: null, puntos: null, edit: false, err: null };

export function initFacturas(helpers) { H = helpers; }
export async function cargarFacturas(force) {
  if (F.loading || (F.data && !force)) return;
  F.loading = true;
  try { F.data = await H.api("/api/factura"); F.err = null; } catch (e) { F.err = e.message; }
  F.loading = false; H.render();
}

const fecha = (iso) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const fch = (s) => (s ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : "");
const nro = (f) => `${String(f.pto).padStart(5, "0")}-${String(f.nro).padStart(8, "0")}`;

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
  h += step(4, "Creá un punto de venta para la app", `<div>En ARCA → <b>Administración de puntos de venta y domicilios</b> → <b>Agregar</b>. Sistema: <b>«Factura Electrónica - Monotributo / Responsable Inscripto - Web Services»</b>. Un número que no uses en otro lado (por ejemplo, el 5).</div>`, false);
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
    ${row("IVA del restaurador", alic ? "" : "<span class='down'>Confirmalo con tu contador: hasta que no lo elijas no se emite nada.</span>", `<div class="seg" style="width:100%"><button data-fact="alic" data-val="10.5" aria-pressed="${alic === "10.5"}">10,5 %</button><button data-fact="alic" data-val="21" aria-pressed="${alic === "21"}">21 %</button><button data-fact="alic" data-val="" aria-pressed="${!alic}">Sin definir</button></div>`)}
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
  const revisar = d.facturas.filter((f) => f.estado !== "emitida");

  if (!listo) h += `<p class="banner warn">Antes de emitir: ${[!a.ptoVta && "elegí el punto de venta", !a.alicuota && "definí el IVA con tu contador", !(a.emisor && a.emisor.razon && a.emisor.domicilio && a.emisor.inicio) && "completá tus datos"].filter(Boolean).join(", ")}.</p>`;
  revisar.forEach((f) => (h += `<p class="banner bad">La factura ${esc(nro(f))} del pedido ${esc(f.pedido)} quedó a medio emitir. ${esc(f.aviso || "")} La próxima vez que emitas se revisa sola en ARCA.</p>`));

  // Para facturar
  h += `<section class="block"><div class="bh"><h2>Para facturar</h2><span class="note">${fact.length} pedidos pagados desde el ${esc(new Date(d.desde + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }))}</span></div>`;
  if (fact.length) {
    h += `<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:28px"><input type="checkbox" data-fact-all ${F.sel.size === fact.length ? "checked" : ""}></th><th>Pedido</th><th>Fecha</th><th class="r">Total</th></tr></thead><tbody>
      ${fact.map((p) => `<tr><td><input type="checkbox" data-fact-sel="${esc(p.id)}" ${F.sel.has(p.id) ? "checked" : ""}></td><td>${esc(p.n)}</td><td>${esc(fecha(p.c))}</td><td class="r">${money(p.total)}</td></tr>`).join("")}</tbody></table></div>
      <div class="actions" style="margin-top:10px">
      ${F.confirm ? `<button class="ctl pri" data-fact="emitir" ${F.emitiendo ? "disabled" : ""}>${F.emitiendo ? "Emitiendo…" : `Sí, emitir ${F.sel.size} factura${F.sel.size === 1 ? "" : "s"} por ${money(selTot)}`}</button><button class="ctl" data-fact="cancelar">Cancelar</button><span class="note">Una factura emitida no se borra: si hay que corregirla se hace una nota de crédito.</span>`
      : `<button class="ctl pri" data-fact="pre-emitir" ${listo && F.sel.size ? "" : "disabled"}>Emitir ${F.sel.size || ""} factura${F.sel.size === 1 ? "" : "s"}</button><span class="note">${F.sel.size > 10 ? "Se emiten de a 10 por vez." : "Factura B a consumidor final" + (a.alicuota ? ", IVA " + a.alicuota.replace(".", ",") + " %" : "") + "."}</span>`}</div>`;
  } else h += `<div class="card empty">No hay pedidos pagados sin factura.</div>`;
  if (noFact.length) h += `<p class="note">No se pueden facturar todavía: ${noFact.map((p) => `${esc(p.n)} (${esc(p.motivo)})`).join(" · ")}</p>`;
  h += `</section>`;

  // Emitidas
  const em = d.facturas.filter((f) => f.estado === "emitida");
  h += `<section class="block"><div class="bh"><h2>Facturas emitidas</h2><span class="note">${em.length}</span></div>`;
  h += em.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Factura</th><th>Pedido</th><th>Fecha</th><th class="r">Total</th><th>CAE</th><th></th></tr></thead><tbody>
    ${em.slice(0, 200).map((f) => `<tr><td>B ${esc(nro(f))}</td><td>${esc(f.pedido)}</td><td>${esc(fch(f.fecha))}</td><td class="r">${money(f.total)}</td><td><code>${esc(f.cae)}</code></td>
      <td class="r" style="white-space:nowrap"><a class="ctl" href="/api/factura?pdf=${encodeURIComponent(f.orderId)}" target="_blank" rel="noopener" style="text-decoration:none">PDF</a> ${d.mail ? `<button class="ctl" data-fact="email" data-id="${esc(f.orderId)}">${f.emailAt ? "Reenviar" : "Mandar"}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="card empty">Todavía no emitiste facturas.</div>`;
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
    else if (act === "pto") { await post({ action: "config", ptoVta: Number(t.dataset.val) }); await cargarFacturas(true); }
    else if (act === "alic") { await post({ action: "config", alicuota: t.dataset.val || null }); await cargarFacturas(true); }
    else if (act === "guardar-emisor") {
      const emisor = {}; document.querySelectorAll("[data-emisor]").forEach((i) => (emisor[i.dataset.emisor] = i.value));
      await post({ action: "config", emisor, desde: document.getElementById("fa-desde").value }); await cargarFacturas(true); toast("Datos guardados");
    } else if (act === "edit-mail") { F.editMail = !F.editMail; render(); }
    else if (act === "mail") {
      await post({ action: "mail", resendKey: document.getElementById("fa-rk").value, from: document.getElementById("fa-from").value, replyTo: document.getElementById("fa-reply").value });
      F.editMail = false; await cargarFacturas(true); toast("Email configurado");
    } else if (act === "pre-emitir") { F.confirm = true; render(); }
    else if (act === "cancelar") { F.confirm = false; render(); }
    else if (act === "emitir") {
      F.emitiendo = true; render();
      const ids = [...F.sel].slice(0, 10);
      const r = await post({ action: "emitir", ids });
      const ok = r.resultados.filter((x) => x.ok && !x.ya), mal = r.resultados.filter((x) => !x.ok);
      const mailMal = ok.filter((x) => typeof x.mail === "string");
      ok.forEach((x) => F.sel.delete(x.id));
      toast(`${ok.length} factura${ok.length === 1 ? "" : "s"} emitida${ok.length === 1 ? "" : "s"}${mal.length ? ` · ${mal.length} con error: ${mal[0].error}` : ""}${mailMal.length ? ` · email: ${mailMal[0].mail}` : ""}`);
      F.emitiendo = false; F.confirm = false; await cargarFacturas(true);
    } else if (act === "email") {
      t.disabled = true; t.textContent = "Mandando…";
      await post({ action: "email", id: t.dataset.id }); toast("Factura enviada"); await cargarFacturas(true);
    }
  } catch (err) { F.emitiendo = false; F.confirm = false; toast(err.message || String(err)); render(); }
  return true;
}

// Archivo .crt arrastrado o elegido → al cuadro de texto.
export function onFactChange(e) {
  if (e.target.id === "fa-crt-file" && e.target.files[0]) { e.target.files[0].text().then((txt) => { document.getElementById("fa-crt").value = txt; }); return true; }
  return false;
}
