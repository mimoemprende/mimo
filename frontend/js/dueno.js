const A = document.getElementById("adm"); const $ = (s, r = document) => r.querySelector(s);
let tab = "reservas", yo = null;
const flash = (t, k = "ok") => { const d = document.createElement("div"); d.className = "msg " + k; d.textContent = t; d.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:50;box-shadow:0 4px 20px #0003"; document.body.append(d); setTimeout(() => d.remove(), 3500); };
const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.status === 401) return login(); flash(e.message, "err"); } };
const wa = (n) => "https://wa.me/57" + n;

async function iniciar() { const r = await API.get("/dueno/yo").catch(() => ({})); yo = r.dueno; yo ? panel() : login(); }
function login() {
  $("#salir").classList.add("hide");
  A.innerHTML = `<div class="panel" style="max-width:380px;margin:40px auto"><h2>Ingreso para lavaderos</h2><p class="meta">Usuario y contraseña entregados por MIMO.</p><form id="lf" class="grid-f" style="grid-template-columns:1fr"><label class="f">Usuario<input name="u" autocomplete="username" required></label><label class="f">Contraseña<input name="p" type="password" autocomplete="current-password" required></label><div id="lm"></div><button class="btn">Entrar</button></form></div>`;
  $("#lf").onsubmit = async (e) => { e.preventDefault(); try { await API.post("/dueno/login", { usuario: e.target.u.value, password: e.target.p.value }); iniciar(); } catch (er) { $("#lm").innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } };
}
function panel() {
  const s = $("#salir"); s.classList.remove("hide"); s.onclick = async (e) => { e.preventDefault(); await API.post("/logout"); yo = null; login(); };
  A.innerHTML = `<h2 style="margin-bottom:4px">${esc(yo.lavadero)}</h2><p class="meta" style="margin-top:0">Sesión: ${esc(yo.usuario)}</p><div class="tabs">${[["reservas", "Reservas"], ["lavadero", "Mi lavadero y precios"]].map(([k, v]) => `<button class="chip ${tab === k ? "on" : ""}" data-t="${k}">${v}</button>`).join("")}</div><div id="cont"></div>`;
  A.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { tab = b.dataset.t; panel(); });
  tab === "reservas" ? tReservas() : tLav();
}
function tReservas() { guard(async () => {
  const s = await API.get("/dueno/resumen");
  $("#cont").innerHTML = `<div class="stats">${[["Pendientes", s.pendientes], ["Confirmadas", s.confirmadas], ["Completadas", s.completadas], ["Lavados del mes", s.lavados_mes]].map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>
  <div class="panel"><div class="row"><h3 style="margin:0">Reservas</h3><select id="fe" style="width:auto"><option value="">Todas</option><option>pendiente</option><option>confirmada</option><option>completada</option><option>cancelada</option></select></div><div class="scroll" id="rt"></div></div>`;
  const cargar = async () => { const r = await API.get("/dueno/reservas" + ($("#fe").value ? "?estado=" + $("#fe").value : ""));
    $("#rt").innerHTML = `<table><thead><tr><th>Código</th><th>Cliente</th><th>Servicio</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${r.map((x) => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.cliente)}<br><a target="_blank" rel="noopener" href="${wa(x.whatsapp)}">${esc(x.whatsapp)}</a></td><td>${esc(x.servicio)}<br><span class="meta">${VEH[x.vehiculo]}${x.placa ? " · " + esc(x.placa) : ""} · ${COP(x.precio)}</span></td><td>${fechaLarga(x.fecha)}<br>${x.hora}–${x.hora_fin}</td><td><span class="tag ${x.estado === "pendiente" ? "amar" : x.estado === "cancelada" ? "gris" : "verde"}">${x.estado}</span></td><td class="row">${{ pendiente: [["confirmada", "Confirmar", "ok"], ["cancelada", "Rechazar", "mal"]], confirmada: [["completada", "Lavado realizado", ""], ["cancelada", "Cancelar", "mal"]] }[x.estado]?.map(([e, t, k]) => `<button class="btn sm ${k}" data-id="${x.id}" data-e="${e}">${t}</button>`).join("") || ""}</td></tr>`).join("") || '<tr><td colspan="6" class="meta">Sin reservas</td></tr>'}</tbody></table>`;
    $("#rt").querySelectorAll("[data-e]").forEach((b) => b.onclick = () => guard(async () => { await API.post(`/dueno/reservas/${b.dataset.id}/estado`, { estado: b.dataset.e }); flash("Estado actualizado"); tReservas(); })); };
  $("#fe").onchange = cargar; cargar(); }); }
function tLav() { guard(async () => {
  const l = await API.get("/dueno/lavadero");
  $("#cont").innerHTML = `<div class="panel"><h3>Datos de contacto y horario</h3><form id="lf2" class="grid-f">${[["telefono", "Teléfono"], ["horario_txt", "Horario (texto visible)"], ["horario_cod", "Horario (código: L-S 6-22;D 6-19.5)"], ["puestos", "Puestos de lavado simultáneos"]].map(([k, t]) => `<label class="f">${t}<input name="${k}" value="${esc(l[k])}"></label>`).join("")}<label class="f">Horario publicado<select name="horario_publicado"><option value="1" ${l.horario_publicado ? "selected" : ""}>Sí</option><option value="0" ${l.horario_publicado ? "" : "selected"}>No</option></select></label><div style="align-self:end"><button class="btn sm">Guardar</button></div></form>
   <p class="meta">Código de horario: días L M X J V S D, horas en formato 24 h, «x» = cerrado. Ej.: <code>L-S 7-18;D x</code></p></div>
  <div class="panel"><h3>Servicios y precios (COP; vacío = no disponible)</h3><div class="scroll"><table><thead><tr><th>Nombre</th><th>Min</th><th>Auto</th><th>Camioneta</th><th>SUV</th><th>Moto</th><th>Activo</th><th></th></tr></thead><tbody>
  ${l.servicios.concat([{ id: 0, nombre: "", descripcion: "", duracion_min: 30, activo: 1 }]).map((s) => `<tr data-s="${s.id}"><td><input name="nombre" value="${esc(s.nombre)}" placeholder="Nuevo servicio"><input name="descripcion" value="${esc(s.descripcion)}" placeholder="Descripción"></td><td><input name="duracion_min" type="number" value="${s.duracion_min}" style="width:70px"></td>${["auto", "camioneta", "suv", "moto"].map((c) => `<td><input name="precio_${c}" type="number" value="${s["precio_" + c] ?? ""}" style="width:100px"></td>`).join("")}<td><input name="activo" type="checkbox" ${s.activo ? "checked" : ""} style="width:auto"></td><td><button class="btn sm">${s.id ? "Guardar" : "Agregar"}</button></td></tr>`).join("")}</tbody></table></div></div>`;
  $("#lf2").onsubmit = (e) => { e.preventDefault(); guard(async () => { const b = {}; new FormData(e.target).forEach((v, k) => b[k] = v); await API.put("/dueno/lavadero", b); flash("Datos guardados"); }); };
  A.querySelectorAll("tr[data-s]").forEach((tr) => tr.querySelector("button").onclick = () => guard(async () => {
    const b = {}; tr.querySelectorAll("input").forEach((i) => b[i.name] = i.type === "checkbox" ? (i.checked ? 1 : 0) : i.value);
    tr.dataset.s === "0" ? await API.post("/dueno/servicios", b) : await API.put("/dueno/servicios/" + tr.dataset.s, b);
    flash("Servicio guardado"); tLav(); })); }); }
iniciar();
