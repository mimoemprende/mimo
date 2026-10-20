const A = document.getElementById("adm"); const $ = (s, r = document) => r.querySelector(s);
let tab = "resumen";
const flash = (t, k = "ok") => { const d = document.createElement("div"); d.className = "msg " + k; d.textContent = t; d.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:50;box-shadow:0 4px 20px #0003"; document.body.append(d); setTimeout(() => d.remove(), 3500); };
const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.status === 401) return login(); flash(e.message, "err"); } };

async function iniciar() { const r = await API.get("/admin/yo").catch(() => ({})); r.admin ? panel() : login(); }
function login() {
  $("#salir").classList.add("hide");
  A.innerHTML = `<div class="panel" style="max-width:380px;margin:40px auto"><h2>Ingreso administradores</h2><form id="lf" class="grid-f" style="grid-template-columns:1fr"><label class="f">Usuario<input name="u" autocomplete="username" required></label><label class="f">Contraseña<input name="p" type="password" autocomplete="current-password" required></label><div id="lm"></div><button class="btn">Entrar</button></form></div>`;
  $("#lf").onsubmit = async (e) => { e.preventDefault(); try { await API.post("/admin/login", { usuario: e.target.u.value, password: e.target.p.value }); panel(); } catch (er) { $("#lm").innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } };
}
function panel() {
  const s = $("#salir"); s.classList.remove("hide"); s.onclick = async (e) => { e.preventDefault(); await API.post("/logout"); login(); };
  A.innerHTML = `<div class="tabs">${[["resumen", "Resumen y clientes"], ["reservas", "Reservas"], ["lavaderos", "Lavaderos y servicios"], ["recordatorios", "Recordatorios"], ["duenos", "Dueños de lavaderos"]].map(([k, v]) => `<button class="chip ${tab === k ? "on" : ""}" data-t="${k}">${v}</button>`).join("")}</div><div id="cont"></div>`;
  A.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { tab = b.dataset.t; panel(); });
  ({ resumen: tResumen, reservas: tReservas, lavaderos: tLavs, recordatorios: tRec, duenos: tDuenos })[tab]();
}
const wa = (n) => "https://wa.me/57" + n;

function tResumen() { guard(async () => {
  const [s, cs] = await Promise.all([API.get("/admin/stats"), API.get("/admin/clientes")]);
  const items = [["Clientes registrados", s.clientes], ["Reservas pendientes", s.pendientes], ["Reservas confirmadas", s.confirmadas], ["Lavados del mes", s.lavados_mes], ["Clientes nuevos (mes)", s.clientes_nuevos], ["Clientes recurrentes", s.clientes_recurrentes], ["Recordatorios pendientes", s.recordatorios_pendientes]];
  $("#cont").innerHTML = `<div class="stats">${items.map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>
  <div class="panel"><h3>Clientes</h3><div class="scroll"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Último lavado</th><th>Próxima fecha</th><th>Visitas</th><th>Fidelización</th></tr></thead><tbody>
  ${cs.map((c) => `<tr><td>${esc(c.nombre)}</td><td><a target="_blank" rel="noopener" href="${wa(c.whatsapp)}">${esc(c.whatsapp)}</a></td><td>${c.ultimo_lavado ? fechaLarga(c.ultimo_lavado) : "—"}</td><td>${c.proxima_fecha ? fechaLarga(c.proxima_fecha) : "—"}</td><td>${c.visitas}</td><td>${c.visitas % 10}/10${c.visitas >= 10 ? " · 🎁 " + Math.floor(c.visitas / 10) : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="meta">Sin clientes aún</td></tr>'}</tbody></table></div></div>`; }); }

function tReservas() { guard(async () => {
  $("#cont").innerHTML = `<div class="panel"><div class="row"><h3 style="margin:0">Reservas</h3><select id="fe" style="width:auto"><option value="">Todas</option><option>pendiente</option><option>confirmada</option><option>completada</option><option>cancelada</option></select></div><div class="scroll" id="rt"></div></div>`;
  const cargar = async () => { const r = await API.get("/admin/reservas" + ($("#fe").value ? "?estado=" + $("#fe").value : ""));
    $("#rt").innerHTML = `<table><thead><tr><th>Código</th><th>Cliente</th><th>Lavadero / servicio</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${r.map((x) => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.cliente)}<br><a target="_blank" rel="noopener" href="${wa(x.whatsapp)}">${esc(x.whatsapp)}</a></td><td>${esc(x.lavadero)}<br><span class="meta">${esc(x.servicio)} · ${VEH[x.vehiculo]} · ${COP(x.precio)}</span></td><td>${fechaLarga(x.fecha)}<br>${x.hora}–${x.hora_fin}</td><td><span class="tag ${x.estado === "pendiente" ? "amar" : x.estado === "cancelada" ? "gris" : "verde"}">${x.estado}</span></td><td class="row">${{ pendiente: [["confirmada", "Confirmar", "ok"], ["cancelada", "Cancelar", "mal"]], confirmada: [["completada", "Marcar completada", ""], ["cancelada", "Cancelar", "mal"]] }[x.estado]?.map(([e, t, k]) => `<button class="btn sm ${k}" data-id="${x.id}" data-e="${e}">${t}</button>`).join("") || ""}</td></tr>`).join("") || '<tr><td colspan="6" class="meta">Sin reservas</td></tr>'}</tbody></table>`;
    $("#rt").querySelectorAll("[data-e]").forEach((b) => b.onclick = () => guard(async () => { await API.post(`/admin/reservas/${b.dataset.id}/estado`, { estado: b.dataset.e }); flash("Estado actualizado"); cargar(); })); };
  $("#fe").onchange = cargar; cargar(); }); }

function tLavs() { guard(async () => {
  const L = await API.get("/admin/lavaderos");
  $("#cont").innerHTML = `<input id="flt" placeholder="Filtrar lavaderos…" style="margin-bottom:12px">` + L.map((l) => `<details class="panel" data-n="${esc(l.nombre.toLowerCase())}"><summary><b>${l.id}. ${esc(l.nombre)}</b> ${l.activo ? "" : '<span class="tag gris">Inactivo</span>'}</summary>
   <form class="grid-f" data-l="${l.id}">${[["nombre", "Nombre"], ["direccion", "Dirección"], ["barrio", "Barrio"], ["zona", "Zona"], ["telefono", "Teléfono"], ["horario_txt", "Horario (texto visible)"], ["horario_cod", "Horario (código: L-S 6-22;D 6-19.5)"], ["puestos", "Puestos simultáneos"], ["lat", "Latitud"], ["lng", "Longitud"]].map(([k, t]) => `<label class="f">${t}<input name="${k}" value="${esc(l[k])}"></label>`).join("")}
   <label class="f">Activo<select name="activo"><option value="1" ${l.activo ? "selected" : ""}>Sí</option><option value="0" ${l.activo ? "" : "selected"}>No</option></select></label>
   <label class="f">Horario publicado<select name="horario_publicado"><option value="1" ${l.horario_publicado ? "selected" : ""}>Sí</option><option value="0" ${l.horario_publicado ? "" : "selected"}>No</option></select></label>
   <div style="align-self:end"><button class="btn sm">Guardar lavadero</button></div></form>
   <h4>Servicios y precios (COP; vacío = no disponible)</h4><div class="scroll"><table><thead><tr><th>Nombre</th><th>Min</th><th>Auto</th><th>Camioneta</th><th>SUV</th><th>Moto</th><th>Activo</th><th></th></tr></thead><tbody>
   ${l.servicios.concat([{ id: 0, nombre: "", descripcion: "", duracion_min: 30, activo: 1 }]).map((s) => `<tr data-s="${s.id}" data-l="${l.id}"><td><input name="nombre" value="${esc(s.nombre)}" placeholder="Nuevo servicio"><input name="descripcion" value="${esc(s.descripcion)}" placeholder="Descripción"></td><td><input name="duracion_min" type="number" value="${s.duracion_min}" style="width:70px"></td>${["auto", "camioneta", "suv", "moto"].map((c) => `<td><input name="precio_${c}" type="number" value="${s["precio_" + c] ?? ""}" style="width:100px"></td>`).join("")}<td><input name="activo" type="checkbox" ${s.activo ? "checked" : ""} style="width:auto"></td><td><button class="btn sm">${s.id ? "Guardar" : "Agregar"}</button></td></tr>`).join("")}</tbody></table></div></details>`).join("");
  $("#flt").oninput = (e) => A.querySelectorAll("details").forEach((d) => d.classList.toggle("hide", !d.dataset.n.includes(e.target.value.toLowerCase())));
  A.querySelectorAll("form[data-l]").forEach((f) => f.onsubmit = (e) => { e.preventDefault(); guard(async () => { const b = {}; new FormData(f).forEach((v, k) => b[k] = v); await API.put("/admin/lavaderos/" + f.dataset.l, b); flash("Lavadero guardado"); }); });
  A.querySelectorAll("tr[data-s]").forEach((tr) => tr.querySelector("button").onclick = () => guard(async () => {
    const b = {}; tr.querySelectorAll("input").forEach((i) => b[i.name] = i.type === "checkbox" ? (i.checked ? 1 : 0) : i.value);
    tr.dataset.s === "0" ? await API.post(`/admin/lavaderos/${tr.dataset.l}/servicios`, b) : await API.put("/admin/servicios/" + tr.dataset.s, b);
    flash("Servicio guardado"); tLavs(); })); }); }

function tRec() { guard(async () => {
  const r = await API.get("/admin/recordatorios");
  $("#cont").innerHTML = `<div class="panel"><div class="row"><h3 style="margin:0">Recordatorios</h3><button class="btn sm cta" id="gen">Generar recordatorios (clientes con próxima fecha ≤ 3 días)</button></div>
  <p class="meta">El envío es manual: abre WhatsApp con el mensaje listo y luego marca el recordatorio como enviado. (Envío automático por la API de WhatsApp Business: pendiente de credenciales.)</p>
  <div class="scroll"><table><thead><tr><th>Cliente</th><th>Vehículo</th><th>Fecha recomendada</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${r.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${VEH[x.tipo]}${x.placa ? " · " + esc(x.placa) : ""}</td><td>${fechaLarga(x.fecha_programada)}</td><td><span class="tag ${x.estado === "pendiente" ? "amar" : x.estado === "enviado" ? "verde" : "gris"}">${x.estado}</span></td><td class="row"><a class="btn sm" target="_blank" rel="noopener" href="${wa(x.whatsapp)}?text=${encodeURIComponent(`Hola ${x.nombre.split(" ")[0]}, desde MIMO te recordamos que ya toca lavar tu ${VEH[x.tipo].toLowerCase()}. Reserva en minutos en nuestra web.`)}">WhatsApp</a><button class="btn sm ok" data-id="${x.id}" data-e="enviado">Enviado</button><button class="btn sm mal" data-id="${x.id}" data-e="cancelado">Descartar</button></td></tr>`).join("") || '<tr><td colspan="5" class="meta">Sin recordatorios. Pulsa «Generar».</td></tr>'}</tbody></table></div></div>`;
  $("#gen").onclick = () => guard(async () => { const g = await API.post("/admin/recordatorios/generar"); flash(`${g.nuevos} recordatorio(s) nuevos`); tRec(); });
  A.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => guard(async () => { await API.post(`/admin/recordatorios/${b.dataset.id}/estado`, { estado: b.dataset.e }); tRec(); })); }); }
function tDuenos() { guard(async () => {
  const [D, L] = await Promise.all([API.get("/admin/duenos"), API.get("/admin/lavaderos")]);
  $("#cont").innerHTML = `<div class="panel"><h3>Crear cuenta de dueño</h3><p class="meta">Entrega al dueño el usuario y la contraseña. Entrará en <b>/lavadero.html</b> y solo verá su lavadero.</p>
   <form id="df" class="grid-f"><label class="f">Lavadero<select name="lavadero_id">${L.map((l) => `<option value="${l.id}">${l.id}. ${esc(l.nombre)}</option>`).join("")}</select></label>
   <label class="f">Usuario<input name="usuario" required placeholder="ej: wilson.centro"></label><label class="f">Contraseña (mín. 8)<input name="password" type="text" minlength="8" required></label><div style="align-self:end"><button class="btn">Crear cuenta</button></div></form></div>
  <div class="panel"><h3>Cuentas existentes</h3><div class="scroll"><table><thead><tr><th>Usuario</th><th>Lavadero</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${D.map((d) => `<tr><td>${esc(d.usuario)}</td><td>${esc(d.lavadero)}</td><td><span class="tag ${d.activo ? "verde" : "gris"}">${d.activo ? "activa" : "desactivada"}</span></td><td class="row"><button class="btn sm" data-pw="${d.id}">Nueva contraseña</button><button class="btn sm ${d.activo ? "mal" : "ok"}" data-act="${d.id}" data-v="${d.activo ? 0 : 1}">${d.activo ? "Desactivar" : "Activar"}</button></td></tr>`).join("") || '<tr><td colspan="4" class="meta">Aún no hay cuentas de dueños</td></tr>'}</tbody></table></div></div>`;
  $("#df").onsubmit = (e) => { e.preventDefault(); guard(async () => { const b = {}; new FormData(e.target).forEach((v, k) => b[k] = v); await API.post("/admin/duenos", b); flash("Cuenta creada"); tDuenos(); }); };
  A.querySelectorAll("[data-pw]").forEach((b) => b.onclick = () => { const p = prompt("Nueva contraseña (mín. 8 caracteres):"); if (p) guard(async () => { await API.put("/admin/duenos/" + b.dataset.pw, { password: p }); flash("Contraseña actualizada"); }); });
  A.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => guard(async () => { await API.put("/admin/duenos/" + b.dataset.act, { activo: +b.dataset.v }); tDuenos(); })); }); }
iniciar();
