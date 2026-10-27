const $app = document.getElementById("app");
const S = { yo: null, tipo: localStorage.getItem("mimo_tipo") || "", coords: null, f: {} };
const SERVICIOS = ["Lavado general", "Combo", "Polichado", "tapicería", "motor", "chasis", "Detallado"];

async function cargarYo() { try { S.yo = (await API.get("/yo")).cliente; } catch { S.yo = null; } document.getElementById("navCuenta").textContent = S.yo ? "Hola, " + S.yo.nombre.split(" ")[0] : "Mi cuenta"; }
const msg = (el, t, k = "err") => { el.innerHTML = t ? `<div class="msg ${k}" role="alert">${esc(t)}</div>` : ""; };
const $ = (s, r = document) => r.querySelector(s);

/* ---------- INICIO / BUSCADOR ---------- */
async function vistaInicio() {
  const zonas = await API.get("/zonas").catch(() => []);
  $app.innerHTML = `
  <section class="hero"><div class="wrap">
    
    <h1>Tu carro limpio, sin dar vueltas por Santa Marta.</h1>
    <p>Compara 50 lavaderos por zona, precio y disponibilidad. Reserva en minutos y MIMO te avisa cuándo te toca volver.</p>
  </div></section>
  <div class="wrap">
    <form class="buscador" id="fb" role="search">
      <div class="chips" role="group" aria-label="Tipo de vehículo">
        ${Object.entries(VEH).map(([k, v]) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${S.tipo === k}">${v}</button>`).join("")}
      </div>
      <div class="grid-f">
        <label class="f">Buscar<input name="q" placeholder="Nombre, barrio o servicio" value="${esc(S.f.q || "")}"></label>
        <label class="f">Zona<select name="zona"><option value="">Toda la ciudad</option>${zonas.map((z) => `<option ${S.f.zona === z ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
        <label class="f">Servicio<select name="servicio"><option value="">Todos</option>${SERVICIOS.map((z) => `<option ${S.f.servicio === z ? "selected" : ""}>${z}</option>`).join("")}</select></label>
        <label class="f">Precio máximo<select name="precio_max"><option value="">Sin límite</option>${[20000, 30000, 50000, 100000].map((p) => `<option value="${p}" ${S.f.precio_max == p ? "selected" : ""}>${COP(p)}</option>`).join("")}</select></label>
        <label class="f">Fecha<input type="date" name="fecha" min="${hoyISO()}" value="${esc(S.f.fecha || "")}"></label>
        <label class="f">Ordenar por<select name="orden"><option value="nombre">Nombre</option><option value="precio" ${S.f.orden === "precio" ? "selected" : ""}>Precio más bajo</option><option value="cercania" ${S.f.orden === "cercania" ? "selected" : ""}>Cercanía</option></select></label>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn cta" type="submit">Buscar lavaderos</button>
        <button class="btn ghost" type="button" id="geo">📍 Usar mi ubicación</button>
        <label class="row" style="font-weight:600"><input type="checkbox" name="disponible" style="width:auto" ${S.f.disponible ? "checked" : ""}> Solo con horarios libres (requiere fecha)</label>
      </div>
      <div id="geoMsg"></div>
    </form>
    <div class="res-head"><h2 id="resTitulo">Lavaderos</h2></div>
    <div class="cards" id="res"><div class="vacio">Cargando…</div></div>
  </div>`;
  const form = $("#fb");
  form.querySelectorAll(".chip").forEach((c) => c.onclick = () => {
    S.tipo = S.tipo === c.dataset.v ? "" : c.dataset.v; localStorage.setItem("mimo_tipo", S.tipo);
    form.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === S.tipo)); buscar();
  });
  form.onsubmit = (e) => { e.preventDefault(); buscar(); };
  $("#geo").onclick = () => {
    if (!navigator.geolocation) return msg($("#geoMsg"), "Tu navegador no permite geolocalización. Usa la búsqueda manual por zona.");
    navigator.geolocation.getCurrentPosition((p) => {
      S.coords = { lat: p.coords.latitude, lng: p.coords.longitude }; form.orden.value = "cercania";
      msg($("#geoMsg"), "Ubicación activada: ordenando por cercanía (distancias aproximadas por zona).", "ok"); buscar();
    }, () => msg($("#geoMsg"), "No autorizaste la ubicación. Puedes buscar manualmente por zona."), { timeout: 8000 });
  };
  buscar();
}
async function buscar() {
  const fd = new FormData($("#fb")); const p = new URLSearchParams();
  S.f = Object.fromEntries(fd.entries());
  for (const [k, v] of fd.entries()) if (v) p.set(k, v);
  if (S.tipo) p.set("vehiculo", S.tipo);
  if (S.coords) { p.set("lat", S.coords.lat); p.set("lng", S.coords.lng); }
  if (p.get("orden") === "cercania" && !S.coords) p.delete("orden");
  const box = $("#res");
  try {
    const L = await API.get("/lavaderos?" + p);
    $("#resTitulo").textContent = `${L.length} lavadero${L.length === 1 ? "" : "s"} encontrado${L.length === 1 ? "" : "s"}`;
    box.innerHTML = L.length ? L.map((l) => cardLavadero(l, S.tipo)).join("") : `<div class="vacio" style="grid-column:1/-1">No hay lavaderos con esos filtros. Prueba quitar alguno.</div>`;
  } catch (e) { box.innerHTML = `<div class="msg err" style="grid-column:1/-1">${esc(e.message)}</div>`; }
}

/* ---------- FICHA ---------- */
async function vistaFicha(id) {
  let l; try { l = await API.get("/lavaderos/" + id); } catch (e) { return $app.innerHTML = `<div class="wrap"><div class="msg err">${esc(e.message)}</div></div>`; }
  const cols = ["auto", "camioneta", "suv", "moto"];
  $app.innerHTML = `<div class="wrap" style="padding-top:22px">
   <a href="#/">← Volver a lavaderos</a>
   <div class="cols" style="margin-top:12px"><div>
    <div class="panel"><div class="foto card" style="box-shadow:none"><div class="foto" style="border-radius:12px"><img class="ph" src="assets/imagotipo-400.webp" alt=""><img class="real" src="${fotoUrl(l.id)}" alt="Foto de ${esc(l.nombre)}" onerror="this.remove()"></div></div>
     <h2 style="margin-top:14px">${esc(l.nombre)}</h2>
     <p class="meta">${esc(l.tipo)}</p>
     ${l.horario_publicado ? "" : `<div class="msg info">El listado no publica el horario de este lavadero. Las reservas quedan pendientes hasta que se confirme.</div>`}
    </div>
    <div class="panel"><h3>Servicios y precios (COP)</h3><div class="scroll"><table><thead><tr><th>Servicio</th><th>Duración</th>${cols.map((c) => `<th>${VEH[c]}</th>`).join("")}</tr></thead><tbody>
     ${l.servicios.map((s) => `<tr><td><b>${esc(s.nombre)}</b><div class="meta">${esc(s.descripcion)}</div></td><td>${s.duracion_min} min</td>${cols.map((c) => `<td>${COP(s["precio_" + c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
     <p class="meta">Precios de referencia; el lavadero puede confirmar la tarifa final.</p></div></div>
    <aside class="panel"><h3>Información</h3>
     <p>📍 ${esc(l.direccion)}<br><span class="meta">${esc(l.barrio)} · ${esc(l.zona)}</span></p>
     <p>🕒 ${esc(l.horario_txt)} ${l.horario_publicado ? (l.abierto ? '<span class="tag verde">Abierto ahora</span>' : '<span class="tag gris">Cerrado ahora</span>') : ""}</p>
     <p>📞 ${l.telefono ? `<a href="tel:${esc(l.telefono.replace(/[^\d+]/g, ""))}">${esc(l.telefono)}</a>` : "Teléfono no publicado"}</p>
     <p class="meta">Capacidad estimada: ${esc(l.cap)} vehículos · Atiende: ${l.vehiculos.includes("C") ? "carros" : ""}${l.vehiculos.includes("M") ? (l.vehiculos.includes("C") ? ", motos" : "motos") : ""}</p>
     <div class="row"><a class="btn cta" href="#/reservar/${l.id}">Reservar</a><a class="btn ghost" target="_blank" rel="noopener" href="${mapsUrl(l)}">Abrir en Google Maps</a></div>
    </aside></div></div>`;
}

/* ---------- RESERVA ---------- */
const R = {};
async function vistaReserva(id, q) {
  await cargarYo();
  if (R.id !== id) { Object.assign(R, { id, sid: null, vid: null, tipo: q.get("v") || S.tipo || "auto", fecha: "", hora: "", nota: "" }); }
  let l; try { l = await API.get("/lavaderos/" + id); } catch (e) { return $app.innerHTML = `<div class="wrap"><div class="msg err">${esc(e.message)}</div></div>`; }
  R.l = l;
  const veh = S.yo ? S.yo.vehiculos : [];
  if (S.yo) { if (!veh.find((v) => v.id === R.vid)) R.vid = veh[0]?.id; R.tipo = veh.find((v) => v.id === R.vid)?.tipo || R.tipo; }
  const svs = l.servicios.filter((s) => s["precio_" + R.tipo]);
  if (!svs.find((s) => s.id === R.sid)) R.sid = svs[0]?.id || null;
  const s = svs.find((x) => x.id === R.sid);
  const dias = Array.from({ length: 10 }, (_, i) => new Date(Date.now() - 5 * 3600e3 + i * 864e5).toISOString().slice(0, 10));
  if (!R.fecha) R.fecha = dias[0];
  $app.innerHTML = `<div class="wrap" style="padding-top:22px"><a href="#/l/${l.id}">← ${esc(l.nombre)}</a><h2 style="margin-top:10px">Reservar en ${esc(l.nombre)}</h2>
  <div class="cols"><div>
   <div class="panel"><h3>1. Vehículo</h3>
    ${S.yo ? `<div class="chips">${veh.map((v) => `<button class="chip ${v.id === R.vid ? "on" : ""}" data-vid="${v.id}">${VEH[v.tipo]}${v.placa ? " · " + esc(v.placa) : ""}</button>`).join("")}<a class="chip" href="#/cuenta">+ Agregar</a></div>`
      : `<div class="chips">${Object.entries(VEH).map(([k, v]) => `<button class="chip ${R.tipo === k ? "on" : ""}" data-tipo="${k}">${v}</button>`).join("")}</div>`}</div>
   <div class="panel"><h3>2. Servicio</h3>${svs.length ? svs.map((x) => `<button class="opt ${x.id === R.sid ? "on" : ""}" data-sid="${x.id}"><span><b>${esc(x.nombre)}</b><br><span class="meta">${x.duracion_min} min · ${esc(x.descripcion)}</span></span><span class="precio">${COP(x["precio_" + R.tipo])}</span></button>`).join("") : `<div class="msg info">Este lavadero no ofrece servicios para ${VEH[R.tipo]}. Elige otro tipo de vehículo.</div>`}</div>
   <div class="panel"><h3>3. Fecha y hora</h3>
    <div class="chips" style="margin-bottom:12px">${dias.map((d) => `<button class="chip ${d === R.fecha ? "on" : ""}" data-f="${d}">${fechaLarga(d).replace(/\.? de /g, " ")}</button>`).join("")}</div>
    <div id="slots" class="slots"><span class="meta">Cargando horarios…</span></div>
    ${l.horario_publicado ? "" : `<div class="msg info">Horario no publicado: usamos un horario de referencia (7:00–18:00). La reserva queda pendiente hasta confirmación.</div>`}</div>
  </div>
  <aside><div class="panel" id="lado"></div></aside></div></div>`;
  $app.querySelectorAll("[data-vid]").forEach((b) => b.onclick = () => { R.vid = +b.dataset.vid; R.hora = ""; vistaReserva(id, q); });
  $app.querySelectorAll("[data-tipo]").forEach((b) => b.onclick = () => { R.tipo = b.dataset.tipo; R.sid = null; R.hora = ""; vistaReserva(id, q); });
  $app.querySelectorAll("[data-sid]").forEach((b) => b.onclick = () => { R.sid = +b.dataset.sid; R.hora = ""; vistaReserva(id, q); });
  $app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { R.fecha = b.dataset.f; R.hora = ""; vistaReserva(id, q); });
  if (s) cargarSlots(s); else $("#slots").innerHTML = "";
  panelLado(s);
}
async function cargarSlots(s) {
  const box = $("#slots");
  try {
    const d = await API.get(`/disponibilidad?lavadero_id=${R.l.id}&servicio_id=${s.id}&fecha=${R.fecha}`);
    box.innerHTML = d.slots.length ? d.slots.map((x) => `<button class="slot ${x.hora === R.hora ? "on" : ""}" ${x.libre ? "" : "disabled"} data-h="${x.hora}">${x.hora}</button>`).join("") : `<span class="meta">El lavadero está cerrado ese día.</span>`;
    box.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { R.hora = b.dataset.h; box.querySelectorAll(".slot").forEach((x) => x.classList.toggle("on", x === b)); panelLado(s); });
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function panelLado(s) {
  const el = $("#lado"); if (!el) return;
  const resumen = s ? `<h3>Resumen</h3><p><b>${esc(s.nombre)}</b><br>${fechaLarga(R.fecha)} ${R.hora ? "· " + R.hora : "· elige una hora"}<br><span class="precio">${COP(s["precio_" + R.tipo])}</span></p>` : "<h3>Resumen</h3>";
  if (!S.yo) {
    el.innerHTML = resumen + authForm("Crea tu cuenta para reservar");
    wireAuth(el, () => vistaReserva(R.id, new URLSearchParams()));
    return;
  }
  el.innerHTML = resumen + `<label class="f">Nota para el lavadero (opcional)<textarea id="nota" rows="2" maxlength="200">${esc(R.nota)}</textarea></label><div id="rm"></div>
   <button class="btn cta" id="conf" style="width:100%;margin-top:10px" ${s && R.hora ? "" : "disabled"}>Solicitar reserva</button>
   <p class="meta">Tu reserva quedará <b>pendiente</b> hasta que sea confirmada.</p>`;
  $("#nota").oninput = (e) => R.nota = e.target.value;
  $("#conf").onclick = async () => {
    try {
      const r = await API.post("/reservas", { vehiculo_id: R.vid, servicio_id: R.sid, fecha: R.fecha, hora: R.hora, nota: R.nota });
      R.id = null; $app.innerHTML = `<div class="wrap" style="padding-top:30px"><div class="panel"><h2>¡Solicitud enviada!</h2><div class="msg info">Estado: PENDIENTE — aún no está confirmada.</div><p>Código: <b>${esc(r.codigo)}</b></p><p>${esc(r.mensaje)}</p><a class="btn" href="#/cuenta">Ver mis reservas</a></div></div>`;
    } catch (e) { msg($("#rm"), e.message); if (e.status === 409) cargarSlots(s); if (e.status === 401) { await cargarYo(); vistaReserva(R.id, new URLSearchParams()); } }
  };
}

/* ---------- AUTENTICACIÓN ---------- */
function authForm(titulo) {
  return `<h3>${titulo}</h3><div class="tabs"><button class="chip on" data-m="reg" type="button">Registrarme</button><button class="chip" data-m="log" type="button">Ya tengo cuenta</button></div>
  <form id="af" class="grid-f" style="grid-template-columns:1fr">
   <div data-reg class="grid-f" style="grid-template-columns:1fr;margin:0"><label class="f">Nombre<input name="nombre" autocomplete="name" required></label></div>
   <label class="f">WhatsApp<input name="whatsapp" inputmode="tel" placeholder="300 123 4567" autocomplete="tel" required></label>
   <label class="f">Contraseña (mín. 6)<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
   <div data-reg class="grid-f" style="grid-template-columns:1fr;margin:0">
    <label class="f">Tipo de vehículo<select name="tipo">${Object.entries(VEH).map(([k, v]) => `<option value="${k}" ${k === (R.tipo || S.tipo) ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="f">Placa (opcional)<input name="placa" maxlength="7"></label>
    <label class="f">Fecha de tu último lavado<input type="date" name="ultimo" max="${hoyISO()}"></label>
    <label class="f">¿Cada cuánto lavas tu vehículo?<select name="frec"><option value="7">Cada semana</option><option value="15" selected>Cada 15 días</option><option value="30">Cada mes</option><option value="45">Cada 45 días</option></select></label></div>
   <div id="am"></div><button class="btn cta" type="submit">Continuar</button></form>`;
}
function wireAuth(el, done) {
  let modo = "reg"; const f = $("#af", el);
  el.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { modo = b.dataset.m; el.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b)); el.querySelectorAll("[data-reg]").forEach((x) => x.classList.toggle("hide", modo === "log")); f.nombre.required = modo === "reg"; });
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (modo === "log") await API.post("/login", { whatsapp: f.whatsapp.value, password: f.password.value });
      else await API.post("/registro", { nombre: f.nombre.value, whatsapp: f.whatsapp.value, password: f.password.value,
        vehiculo: { tipo: f.tipo.value, placa: f.placa.value, ultimo_lavado_declarado: f.ultimo.value || null, frecuencia_dias: +f.frec.value } });
      await cargarYo(); done();
    } catch (er) { msg($("#am", el), er.message); }
  };
}

/* ---------- MI CUENTA ---------- */
async function vistaCuenta() {
  await cargarYo();
  if (!S.yo) { $app.innerHTML = `<div class="wrap" style="padding-top:26px;max-width:520px"><div class="panel">${authForm("Entra a tu cuenta MIMO")}</div></div>`; wireAuth($app, vistaCuenta); return; }
  const y = S.yo; let rs = []; try { rs = await API.get("/reservas"); } catch {}
  const f = y.fidelizacion; const hoy = hoyISO();
  const estadoTag = (e) => `<span class="tag ${e === "confirmada" || e === "completada" ? "verde" : e === "pendiente" ? "amar" : "gris"}">${e.toUpperCase()}</span>`;
  const prox = rs.filter((r) => r.fecha >= hoy && ["pendiente", "confirmada"].includes(r.estado));
  $app.innerHTML = `<div class="wrap" style="padding-top:22px"><div class="row" style="justify-content:space-between"><h2>Hola, ${esc(y.nombre)}</h2><button class="btn ghost sm" id="out">Cerrar sesión</button></div>
  <div class="cols"><div>
   <div class="panel"><h3>Próximas reservas</h3>${prox.length ? `<div class="scroll"><table><tbody>${prox.map((r) => `<tr><td><b>${esc(r.lavadero)}</b><br><span class="meta">${esc(r.servicio)} · ${VEH[r.vehiculo]}</span></td><td>${fechaLarga(r.fecha)}<br>${r.hora}</td><td>${estadoTag(r.estado)}<br><span class="meta">${esc(r.codigo)}</span></td><td><button class="btn sm mal" data-c="${r.id}">Cancelar</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="meta">No tienes reservas próximas. <a href="#/">Busca un lavadero</a>.</p>`}</div>
   <div class="panel"><h3>Mis vehículos y próximo lavado</h3>${y.vehiculos.map((v) => `<div class="panel" style="background:var(--gris);box-shadow:none;padding:14px"><b>${VEH[v.tipo]}${v.placa ? " · " + esc(v.placa) : ""}</b>
     <p class="meta" style="margin:4px 0">Último lavado: ${v.ultimo_lavado ? fechaLarga(v.ultimo_lavado) + (v.lavado_registrado ? " (realizado)" : " (declarado por ti)") : "sin registrar"}<br>Frecuencia: cada ${v.frecuencia_dias} días</p>
     <p style="margin:4px 0"><b>Próximo lavado recomendado: ${v.proxima_fecha ? fechaLarga(v.proxima_fecha) : "agrega la fecha de tu último lavado"}</b> ${v.proxima_fecha && v.proxima_fecha <= hoy ? '<span class="tag amar">Ya te toca</span>' : ""}</p>
     <div class="row"><select data-fr="${v.id}" style="width:auto">${[7, 15, 30, 45, 60].map((d) => `<option value="${d}" ${d === v.frecuencia_dias ? "selected" : ""}>Cada ${d} días</option>`).join("")}</select><a class="btn sm cta" href="#/?v=${v.tipo}" data-go="${v.tipo}">Reservar</a></div></div>`).join("")}
     <details><summary><b>+ Agregar otro vehículo</b></summary><form id="nv" class="grid-f"><label class="f">Tipo<select name="tipo">${Object.entries(VEH).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label><label class="f">Placa<input name="placa" maxlength="7"></label><label class="f">Último lavado<input type="date" name="ul" max="${hoy}"></label><label class="f">Frecuencia (días)<input type="number" name="fr" min="7" max="90" value="15"></label><div><button class="btn sm">Guardar</button></div></form><div id="nvm"></div></details></div>
   <div class="panel"><h3>Historial de lavados realizados</h3>${y.historial.length ? `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Lavadero</th><th>Servicio</th><th>Valor</th></tr></thead><tbody>${y.historial.map((h) => `<tr><td>${fechaLarga(h.fecha)}</td><td>${esc(h.lavadero)}</td><td>${esc(h.servicio || "—")} · ${VEH[h.vehiculo]}</td><td>${COP(h.precio)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="meta">Aún no tienes lavados completados. Una reserva futura no cuenta hasta que el lavado se realice.</p>`}</div>
   <div class="panel"><h3>Todas mis reservas</h3><div class="scroll"><table><tbody>${rs.map((r) => `<tr><td>${esc(r.lavadero)}<br><span class="meta">${esc(r.servicio)}</span></td><td>${fechaLarga(r.fecha)} ${r.hora}</td><td>${estadoTag(r.estado)}</td></tr>`).join("") || '<tr><td class="meta">Sin reservas</td></tr>'}</tbody></table></div></div>
  </div><aside><div class="tarjeta"><h3>Tarjeta MIMO</h3><div>${f.lavados} lavados completados</div>
   <div class="sellos">${Array.from({ length: 10 }, (_, i) => `<div class="sello ${i < f.progreso ? "on" : ""}">${i === 9 ? "🎁" : i + 1}</div>`).join("")}</div>
   <p style="margin:0">Te faltan <b>${f.faltan}</b> para tu lavado gratis. ${f.gratis_ganados ? `Recompensas ganadas: ${f.gratis_ganados}.` : ""}</p><p class="meta" style="color:#e6f6ff">${esc(f.recompensa)}</p></div></aside></div></div>`;
  $("#out").onclick = async () => { await API.post("/logout"); S.yo = null; location.hash = "#/"; vistaRoute(); };
  $app.querySelectorAll("[data-c]").forEach((b) => b.onclick = async () => { if (confirm("¿Cancelar esta reserva?")) { try { await API.post(`/reservas/${b.dataset.c}/cancelar`); } catch (e) { alert(e.message); } vistaCuenta(); } });
  $app.querySelectorAll("[data-go]").forEach((a) => a.onclick = () => { S.tipo = a.dataset.go; localStorage.setItem("mimo_tipo", S.tipo); });
  $app.querySelectorAll("[data-fr]").forEach((s) => s.onchange = async () => { const v = y.vehiculos.find((x) => x.id == s.dataset.fr); try { await API.put("/vehiculos/" + v.id, { tipo: v.tipo, placa: v.placa, alias: v.alias, ultimo_lavado_declarado: v.ultimo_lavado_declarado, frecuencia_dias: +s.value }); } catch (e) { alert(e.message); } vistaCuenta(); });
  $("#nv").onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await API.post("/vehiculos", { tipo: f.tipo.value, placa: f.placa.value, ultimo_lavado_declarado: f.ul.value || null, frecuencia_dias: +f.fr.value }); vistaCuenta(); } catch (er) { msg($("#nvm"), er.message); } };
}

/* ---------- BENEFICIOS ---------- */
function vistaBeneficios() {
  $app.innerHTML = `<div class="wrap" style="padding-top:26px;max-width:760px"><div class="panel"><h2>Beneficios MIMO</h2>
  <p><b>Tarjeta de fidelización:</b> cada lavado completado suma un sello. Al llegar a 10, tu siguiente lavado es gratis.</p>
  <p><b>Recordatorios:</b> con la fecha de tu último lavado y la frecuencia que elijas, MIMO calcula cuándo te toca volver y te avisa por WhatsApp.</p>
  <p><b>Historial:</b> consulta todos tus lavados realizados y tus próximas reservas.</p>
  <a class="btn cta" href="#/cuenta">Crear mi cuenta</a></div></div>`;
}

/* ---------- ROUTER ---------- */
function vistaRoute() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?"); const q = new URLSearchParams(qs || ""); window.scrollTo(0, 0);
  const m = path.match(/^\/(l|reservar)\/(\d+)$/);
  if (q.get("v") && path === "/") { S.tipo = q.get("v"); }
  const T = { "/cuenta": "Mi cuenta", "/beneficios": "Beneficios" };
  document.title = (m ? (m[1] === "l" ? "Ficha del lavadero" : "Reservar lavado") : T[path] ? T[path] : "Reserva tu lavadero en Santa Marta") + " · MIMO";
  if (m && m[1] === "l" && !window.MIMO_API) { location.replace("/lavaderos/" + m[2]); return; }   // enlaces antiguos #/l/N -> ficha indexable
  if (m && m[1] === "l") vistaFicha(+m[2]);
  else if (m) vistaReserva(+m[2], q);
  else if (path === "/cuenta") vistaCuenta();
  else if (path === "/beneficios") vistaBeneficios();
  else vistaInicio();
}
window.addEventListener("hashchange", vistaRoute);
cargarYo().then(vistaRoute);
