/* ===== MIMO · Onboarding interactivo por rol =====
   Se carga DESPUÉS de api.js (y de app.js / admin.js). No modifica ningún archivo existente:
   - Usa tus helpers globales: API, esc, VEH (api.js).
   - Detecta el rol con TUS endpoints reales:
       · /api/admin/yo -> { admin: true|false }      (sesión de administrador, cookie "aid")
       · /api/yo       -> { cliente: {...} | null }  (sesión de cliente, cookie "cid")
   - "Dueño" NO tiene login en el backend actual (README: "Cuentas de lavadero... hoy confirma el admin MIMO"),
     por eso su guía se ofrece como guía informativa a visitantes/clientes. Si algún día agregas ese rol,
     define window.MIMO_ONB_CONFIG.resolveRole (ver GUIA) y se activará solo.
*/
(function () {
  "use strict";
  if (window.MimoOnboarding) return;

  const CFG = Object.assign({ version: 1, autoStart: true, resolveRole: null }, window.MIMO_ONB_CONFIG || {});
  const IS_ADMIN = !!document.getElementById("adm");            // admin.html
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const E = (s) => (typeof esc === "function" ? esc(s) : String(s ?? ""));
  const VE = (k) => (typeof VEH !== "undefined" && VEH[k]) || k;
  const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";

  /* ---------- almacenamiento (recuerda quién ya vio su guía) ---------- */
  const store = {
    k: (key) => `mimo_onb_v${CFG.version}:${key}`,
    get(key) { try { return JSON.parse(localStorage.getItem(this.k(key))); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(this.k(key), JSON.stringify(val)); } catch {} },
    del(key) { try { localStorage.removeItem(this.k(key)); } catch {} },
  };

  async function waitFor(sel, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const el = $(sel); if (el) return el; await sleep(100); }
    return null;
  }
  const norm = (h) => (h || "#/").replace(/^#?\/?/, "#/");
  async function go(hash) {
    if (IS_ADMIN || !hash || norm(location.hash) === norm(hash)) return;
    const app = document.getElementById("app"); const old = app && app.firstElementChild;
    location.hash = hash;
    const t0 = Date.now();
    while (app && app.firstElementChild === old && Date.now() - t0 < 3000) await sleep(60);
    await sleep(80);
  }

  /* ---------- contexto / rol ---------- */
  const ctx = { role: null, logged: false, yo: null, nombre: "", vehiculos: [], lavId: null, key: "visitante" };

  async function resolveRole() {
    if (typeof CFG.resolveRole === "function") { try { const r = await CFG.resolveRole(); if (r && r.role) return r; } catch {} }
    if (IS_ADMIN) {
      try { const r = await API.get("/admin/yo"); return r.admin ? { role: "admin", key: "admin" } : { role: "admin-pendiente" }; }
      catch { return { role: "admin-pendiente" }; }
    }
    try {
      const c = (await API.get("/yo")).cliente;
      if (c) return { role: "cliente", key: "cliente:" + c.id, yo: c };
    } catch {}
    return { role: "visitante", key: "visitante" };
  }
  async function refreshCtx() {
    const r = await resolveRole();
    Object.assign(ctx, { role: r.role, key: r.key || "visitante", yo: r.yo || null, logged: !!r.yo });
    ctx.nombre = r.yo ? r.yo.nombre : ""; ctx.vehiculos = r.yo ? r.yo.vehiculos || [] : [];
    return ctx;
  }

  /* =====================================================================
     RECORRIDOS. Cada paso:
       target  selector CSS (o función) del elemento real a destacar; sin target = tarjeta centrada
       route   hash al que navegar antes (solo sitio público)
       before  acción previa (p. ej. abrir una pestaña del admin)
       interactive {event, selector, hint}  -> el usuario puede probarlo de verdad
       when    (ctx)=>bool  -> el paso solo aparece si se cumple
     ===================================================================== */
  const tag = (c, t) => `<span class="tag ${c}">${t}</span>`;
  const tabBtn = (k) => `.tabs [data-t="${k}"]`;
  const openTab = async (k) => {
    if (!$(`.tabs .chip.on[data-t="${k}"]`)) { const b = $(tabBtn(k)); if (b) b.click(); }
    await sleep(120);
  };

  const TOURS = {
    /* ---------------------------- CLIENTE ---------------------------- */
    cliente: { label: "Guía para clientes", icon: "🚗", steps: [
      { icon: "🚗", route: "#/",
        title: (c) => c.logged ? `¡Hola, ${E(first(c.nombre))}! 👋` : "¡Bienvenido a MIMO! 👋",
        body: (c) => `<p>En 1 minuto te muestro cómo <b>encontrar un lavadero en Santa Marta</b>, reservar y no olvidar tu próximo lavado.</p>` +
          (c.logged && c.vehiculos[0]
            ? `<p>Ya tienes guardado tu <b>${E(VE(c.vehiculos[0].tipo))}${c.vehiculos[0].placa ? " · " + E(c.vehiculos[0].placa) : ""}</b>; usaré tu cuenta de ejemplo real.</p>`
            : `<p>Puedes explorar <b>sin cuenta</b>: solo la necesitas para solicitar una reserva.</p>`) },
      { icon: "🚙", route: "#/", target: "#fb .chips", title: "1 · Elige tu tipo de vehículo",
        body: () => `<p>Automóvil, camioneta, SUV o moto. Los <b>servicios y precios cambian</b> según tu elección, y MIMO la recuerda para tu próxima visita.</p>`,
        interactive: { event: "click", selector: "#fb .chip", hint: "Pruébalo: toca un tipo de vehículo" } },
      { icon: "🔎", route: "#/", target: "#fb .grid-f", title: "2 · Afina tu búsqueda",
        body: () => `<p>Combina <b>nombre o barrio, zona, servicio</b> (lavado general, combo, polichado, tapicería, motor, chasis, detallado), <b>precio máximo</b> y <b>fecha</b>. Luego pulsa «Buscar lavaderos».</p>`,
        interactive: { event: "change", selector: "#fb .grid-f select, #fb .grid-f input", hint: "Prueba cambiar un filtro (por ejemplo la zona)" } },
      { icon: "📍", route: "#/", target: "#geo", title: "3 · Los más cercanos a ti",
        body: () => `<p>«Usar mi ubicación» ordena por cercanía. Los kilómetros son <b>aproximados por zona</b>, no exactos. Tu navegador te pedirá permiso: tú decides.</p><p>Con «Solo con horarios libres» necesitas elegir una fecha.</p>` },
      { icon: "🏷️", route: "#/", target: "#res .card", wait: 8000, title: "4 · Lee cada tarjeta",
        body: () => `<p>${tag("verde", "Abierto ahora")} según su horario · ${tag("amar", "Horario por confirmar")} si el listado no lo publica · ${tag("verde", "N horarios libres")} al elegir fecha.</p><p><b>«Desde»</b> es un precio de referencia para tu vehículo. Abajo: <b>Ver ficha</b> o <b>Reservar</b>.</p>` },
      { icon: "💲", when: (c) => !!c.lavId, route: (c) => "#/l/" + c.lavId, target: "main .panel table", wait: 8000, title: "5 · La ficha: servicios y precios",
        body: () => `<p>Cada servicio muestra su <b>duración</b> y el <b>precio por tipo de vehículo</b> (COP). Son precios de referencia: el lavadero puede confirmar la tarifa final.</p>` },
      { icon: "🕒", when: (c) => !!c.lavId, route: (c) => "#/l/" + c.lavId, target: "aside.panel", title: "Horario, teléfono y mapa",
        body: () => `<p>Dirección, <b>horario</b> con su estado abierto/cerrado, <b>teléfono</b> para llamar y «Abrir en Google Maps».</p>` },
      { icon: "🧭", when: (c) => !!c.lavId, route: (c) => "#/reservar/" + c.lavId, target: ".cols > div > .panel:nth-of-type(1)", title: "6 · Reservar en 3 pasos",
        body: (c) => c.logged
          ? `<p><b>Paso 1:</b> elige uno de tus vehículos guardados. <b>Paso 2:</b> el servicio — el precio se ajusta al vehículo.</p>`
          : `<p><b>Paso 1:</b> elige tu tipo de vehículo (al crear cuenta quedará guardado). <b>Paso 2:</b> el servicio, con su duración y precio.</p>` },
      { icon: "📅", when: (c) => !!c.lavId, route: (c) => "#/reservar/" + c.lavId, target: ".cols > div > .panel:nth-of-type(3)", title: "Día y hora",
        body: () => `<p>Elige entre los <b>próximos 10 días</b>. Las horas <s>tachadas</s> ya están ocupadas: el servidor evita reservas duplicadas y respeta la capacidad del lavadero.</p>`,
        interactive: { event: "click", selector: "#slots .slot:not([disabled])", hint: "Toca una hora libre (no se reserva nada todavía)" } },
      { icon: "✅", when: (c) => !!c.lavId, route: (c) => "#/reservar/" + c.lavId, target: "#lado", title: "Confirma tu solicitud",
        body: (c) => c.logged
          ? `<p>Revisa el resumen, añade una nota opcional y pulsa <b>«Solicitar reserva»</b>. Quedará <b>PENDIENTE</b> hasta que MIMO la confirme.</p>`
          : `<p>Aquí creas tu cuenta (nombre, WhatsApp, contraseña, vehículo, último lavado y frecuencia) o entras si ya tienes una. Tu reserva queda <b>PENDIENTE</b> hasta que sea confirmada.</p>` },
      { icon: "📋", when: (c) => c.logged, route: "#/cuenta", target: ".cols .panel", title: "7 · Tus reservas",
        body: () => `<p>En <b>Mi cuenta</b> ves tus próximas reservas con su estado (<b>pendiente</b>, <b>confirmada</b>, <b>completada</b>) y puedes <b>cancelarlas</b>.</p>` },
      { icon: "🎁", when: (c) => c.logged, route: "#/cuenta", target: ".tarjeta", title: "Tu Tarjeta MIMO",
        body: (c) => { const f = (c.yo && c.yo.fidelizacion) || {}; return `<p>Cada lavado <b>completado</b> suma un sello; al llegar a 10, el siguiente es <b>gratis</b> (el descuento se aplica en el lavadero).</p><p>Hoy llevas <b>${E(f.progreso ?? 0)}/10</b> sellos.</p>`; } },
      { icon: "🔔", when: (c) => c.logged, route: "#/cuenta", target: "select[data-fr]", title: "Tu próximo lavado",
        body: () => `<p>MIMO calcula la fecha con tu <b>último lavado + la frecuencia</b> que elijas (7 a 60 días) y te avisa por WhatsApp. Puedes cambiar la frecuencia aquí cuando quieras.</p>` },
      { icon: "👤", when: (c) => !c.logged, route: "#/", target: "#navCuenta", title: "7 · Tu cuenta MIMO",
        body: () => `<p>Regístrate con tu <b>WhatsApp</b> para guardar vehículos, ver tu <b>historial</b>, sumar sellos de la <b>Tarjeta MIMO</b> y recibir el aviso de tu próximo lavado.</p>` },
      { icon: "🎉", final: true, route: "#/", title: "¡Todo listo para lavar!",
        body: (c) => `<p>Resumen: <b>elige vehículo → filtra → compara → reserva → espera la confirmación</b>.</p><p>¿Dudas? Vuelve a esta guía con el botón <b>«Guía»</b> abajo a la izquierda.</p>`,
        cta: (c) => c.logged ? { label: "Buscar lavadero", href: "#/" } : { label: "Crear mi cuenta", href: "#/cuenta" } },
    ] },

    /* ----------------------------- DUEÑO ----------------------------- */
    dueno: { label: "Guía para dueños de lavaderos", icon: "🏪", steps: [
      { icon: "🏪", route: "#/", title: "Guía para dueños de lavaderos",
        body: () => `<p>Te muestro <b>cómo te ven los clientes</b> en MIMO y cómo funcionan las reservas de tu lavadero.</p><div class="onb-note">Las cuentas propias para dueños aún no están habilitadas: hoy el <b>equipo administrador de MIMO</b> confirma las reservas y edita los datos de cada lavadero.</div>` },
      { icon: "🪪", route: "#/", target: "#res .card", wait: 8000, title: "Así te ven en el buscador",
        body: () => `<p>Cada tarjeta muestra tu <b>nombre, dirección, barrio, horario, tipo de lavadero</b> y «Desde» (precio de referencia).</p><p>Si ves ${tag("amar", "Horario por confirmar")}, tu horario no está publicado: envíalo a MIMO para que lo publique.</p>` },
      { icon: "🔎", route: "#/", target: "#fb", title: "Cómo te encuentran",
        body: () => `<p>Los clientes filtran por <b>vehículo, zona, servicio, precio, cercanía y fecha con horarios libres</b>. Los servicios y precios que MIMO cargue para tu lavadero determinan cómo apareces en estas búsquedas.</p>` },
      { icon: "💲", when: (c) => !!c.lavId, route: (c) => "#/l/" + c.lavId, target: "main .panel table", wait: 8000, title: "Tu ficha: servicios y precios",
        body: () => `<p>Esta tabla (ejemplo de otro lavadero) es lo que verá tu cliente: <b>servicio, duración y precio por vehículo</b>. Un precio vacío significa «no disponible» para ese vehículo. Si cambias tu tarifa, avisa a MIMO.</p>` },
      { icon: "🧮", when: (c) => !!c.lavId, route: (c) => "#/reservar/" + c.lavId, target: ".cols > div > .panel:nth-of-type(3)", title: "Tus puestos y tu agenda",
        body: () => `<p>Cada lavadero tiene <b>puestos simultáneos</b> (por defecto, cerca de la mitad de su capacidad). Cuando se llenan, la hora se tacha y <b>no entran más reservas</b>: sin sobrecupos. Un mismo vehículo tampoco puede tener dos reservas cruzadas.</p>` },
      { icon: "🔄", title: "Ciclo de una reserva",
        body: () => `<div class="onb-flow">${tag("amar", "pendiente")} → ${tag("verde", "confirmada")} → ${tag("verde", "completada")}</div><ul><li>Toda reserva nueva nace <b>pendiente</b>.</li><li>Hoy la <b>confirma el admin MIMO</b> (contacta al cliente por WhatsApp).</li><li>Solo se marca <b>completada</b> cuando la fecha ya llegó.</li><li>Un cliente puede <b>cancelar</b> desde su cuenta.</li></ul>` },
      { icon: "🎁", title: "Fidelización de tus clientes",
        body: () => `<p>Cada <b>10 lavados completados</b>, el siguiente es gratis. <b>El descuento lo aplicas tú en el lavadero</b> (es manual): pide al cliente que te muestre su Tarjeta MIMO.</p><p>MIMO además recuerda al cliente su próximo lavado por WhatsApp.</p>` },
      { icon: "📨", final: true, title: "Qué enviar al equipo MIMO",
        body: () => `<ul><li><b>Horario real</b> (por día) y teléfono.</li><li><b>Puestos</b> que atienden al mismo tiempo.</li><li><b>Servicios</b> con duración y precio por vehículo.</li><li>Una <b>foto</b> del lavadero (PNG) para tu tarjeta.</li></ul><p>Con eso MIMO deja tu ficha completa y lista para recibir reservas.</p>`,
        cta: () => ({ label: "Ver cómo quedan los lavaderos", href: "#/" }) },
    ] },

    /* --------------------------- ADMINISTRADOR --------------------------- */
    admin: { label: "Guía del panel de administración", icon: "🛠️", steps: [
      { icon: "🛠️", title: (c) => "Panel de administración MIMO",
        body: () => `<p>Desde aquí controlas toda la operación: <b>clientes, reservas, lavaderos con sus servicios y recordatorios</b>. Te muestro cada zona con tus datos reales.</p>` },
      { icon: "🗂️", target: ".tabs", title: "Cuatro áreas de trabajo",
        body: () => `<p><b>Resumen y clientes · Reservas · Lavaderos y servicios · Recordatorios.</b> Cambias de área con estas pestañas.</p>` },
      { icon: "📊", before: () => openTab("resumen"), target: "#cont .stats", wait: 8000, title: "Indicadores del negocio",
        body: () => `<p>Clientes registrados, <b>reservas pendientes</b> (tu primera tarea del día), confirmadas, lavados del mes, clientes nuevos y recurrentes, y recordatorios pendientes.</p>` },
      { icon: "👥", before: () => openTab("resumen"), target: "#cont .panel", wait: 8000, title: "Tus clientes",
        body: () => `<p>Nombre, <b>WhatsApp</b> (el enlace abre el chat), último lavado, próxima fecha, visitas y avance de fidelización (<b>x/10</b>, con 🎁 cuando ganan un lavado gratis).</p>` },
      { icon: "👉", target: tabBtn("reservas"), title: "Entra a Reservas",
        body: () => `<p>Aquí gestionas el flujo principal de MIMO.</p>`,
        interactive: { event: "click", selector: tabBtn("reservas"), hint: "Haz clic en «Reservas»" } },
      { icon: "🔽", before: () => openTab("reservas"), target: "#fe", wait: 8000, title: "Filtra por estado",
        body: () => `<p>Mira <b>Todas</b> o solo <b>pendiente, confirmada, completada o cancelada</b>.</p>` },
      { icon: "✅", before: () => openTab("reservas"), target: "#rt", wait: 8000, title: "Confirma, completa o cancela",
        body: () => `<ul><li><b>Pendiente → Confirmar / Cancelar</b> (escríbele al cliente por WhatsApp).</li><li><b>Confirmada → Marcar completada</b>, solo cuando la fecha ya llegó.</li><li>Solo las <b>completadas</b> suman al historial, a la fidelización y al cálculo de la próxima fecha.</li></ul>` },
      { icon: "🏪", before: () => openTab("lavaderos"), target: "#flt", wait: 8000, title: "Lavaderos y servicios",
        body: () => `<p>Aquí viven los <b>50 lavaderos</b>. Usa el filtro para encontrar uno por nombre.</p>` },
      { icon: "✏️", before: () => openTab("lavaderos"), target: "#cont details.panel", wait: 8000, title: "Abre un lavadero",
        body: () => `<p>Cada lavadero se despliega con sus datos y servicios.</p>`,
        interactive: { event: "click", selector: "#cont details.panel summary", hint: "Haz clic para desplegar uno" } },
      { icon: "🧾", before: async () => { await openTab("lavaderos"); const d = $("#cont details.panel"); if (d) d.open = true; }, target: "#cont details.panel form", title: "Datos del lavadero",
        body: () => `<ul><li><b>Horario visible</b> (texto) y <b>horario en código</b>, ej. <code>L-S 6-22;D 6-19.5</code>.</li><li><b>Puestos simultáneos</b>: define cuántas reservas caben a la vez.</li><li><b>Activo</b> y <b>Horario publicado</b> controlan lo que ven los clientes.</li><li>Latitud/longitud alimentan el orden por cercanía.</li></ul>` },
      { icon: "💲", before: async () => { await openTab("lavaderos"); const d = $("#cont details.panel"); if (d) d.open = true; }, target: "#cont details.panel .scroll", title: "Servicios y precios",
        body: () => `<p>Edita <b>duración y precio por vehículo</b> (auto, camioneta, SUV, moto). <b>Precio vacío = no disponible</b>. La última fila vacía sirve para <b>agregar</b> un servicio nuevo.</p>` },
      { icon: "🔔", before: () => openTab("recordatorios"), target: "#gen", wait: 8000, title: "Recordatorios de próximo lavado",
        body: () => `<p>«Generar» crea recordatorios para clientes cuya próxima fecha está a <b>3 días o menos</b>.</p>` },
      { icon: "💬", before: () => openTab("recordatorios"), target: "#cont .scroll", wait: 8000, title: "Envío por WhatsApp (manual)",
        body: () => `<p>El botón <b>WhatsApp</b> abre el chat con el mensaje listo; luego marca <b>Enviado</b> o <b>Descartar</b>.</p><div class="onb-note">El envío automático requiere cuenta de WhatsApp Business API (pendiente).</div>` },
      { icon: "🎉", final: true, target: "#salir", title: "¡Listo, administrador!",
        body: () => `<p>Rutina sugerida: <b>1) Reservas pendientes → 2) Confirmar → 3) Completar lavados → 4) Generar recordatorios</b>.</p><p>Aquí cierras sesión, y esta guía siempre está en el botón <b>«Guía»</b>.</p>` },
    ] },
  };

  /* ---------- UI ---------- */
  let root, block, spot, card, sel = null, run = null, tick = null, off = [], token = 0;

  function mount() {
    if (root) return;
    root = document.createElement("div"); root.id = "mimo-onb";
    root.innerHTML = `<div class="onb-block dim"></div><div class="onb-spot"></div>
    <div class="onb-card" role="dialog" aria-modal="false" aria-labelledby="onb-t" aria-describedby="onb-b">
      <div class="onb-bar"><i></i></div><button class="onb-x" aria-label="Cerrar guía" type="button">×</button>
      <div class="onb-top"><span class="onb-badge" aria-hidden="true"></span><span class="onb-meta"><b></b><span></span></span></div>
      <h3 id="onb-t"></h3><div class="onb-body" id="onb-b" aria-live="polite"></div><div class="onb-hint" hidden></div>
      <div class="onb-foot"><button class="onb-link onb-skip" type="button">Omitir guía</button>
        <div class="grp"><button class="btn ghost sm onb-prev" type="button">Atrás</button><button class="btn cta sm onb-next" type="button">Siguiente</button></div></div>
    </div>`;
    document.body.append(root);
    block = $(".onb-block", root); spot = $(".onb-spot", root); card = $(".onb-card", root);
    $(".onb-x", root).onclick = () => finish("skipped");
    $(".onb-skip", root).onclick = () => finish("skipped");
    $(".onb-prev", root).onclick = () => step(run.i - 1, -1);
    $(".onb-next", root).onclick = () => (run.steps[run.i].final ? finish("done") : step(run.i + 1, 1));
    const upd = () => requestAnimationFrame(update);
    addEventListener("resize", upd); addEventListener("scroll", upd, true);
    off.push(() => { removeEventListener("resize", upd); removeEventListener("scroll", upd, true); });
    const key = (e) => {
      if (!run || /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName)) return;
      if (e.key === "Escape") finish("skipped");
      else if (run.picker) return;
      else if (e.key === "ArrowRight") $(".onb-next", root).click();
      else if (e.key === "ArrowLeft" && run.i > 0) $(".onb-prev", root).click();
    };
    document.addEventListener("keydown", key); off.push(() => document.removeEventListener("keydown", key));
    tick = setInterval(update, 300);
  }
  function unmount() {
    clearInterval(tick); off.forEach((f) => f()); off = []; if (root) root.remove(); root = null; sel = null;
  }

  function visibleSteps(role) { return TOURS[role].steps.filter((s) => !s.when || s.when(ctx)); }

  async function start(role) {
    if (run) finish(null, true);
    role = role || (ctx.role === "admin" ? "admin" : "cliente");
    if (!TOURS[role]) return;
    if (role === "admin" && !IS_ADMIN) return;
    if (role !== "admin" && IS_ADMIN) return;
    closeMenu(); closeToast();
    if (role !== "admin" && !ctx.lavId) {
      try { const L = await API.get("/lavaderos"); ctx.lavId = L[0] && L[0].id; } catch {}
    }
    mount();
    run = { role, steps: visibleSteps(role), i: 0, storeKey: role === "cliente" ? ctx.key : role === "dueno" ? "dueno" : "admin" };
    card.dataset.role = role;
    step(0, 1);
  }

  async function step(i, dir) {
    if (!run) return;
    i = Math.max(0, Math.min(run.steps.length - 1, i)); run.i = i;
    const my = ++token, st = run.steps[i];
    cleanupInteractive();
    $(".onb-next", root).disabled = true; $(".onb-prev", root).disabled = true;
    let el = null; sel = null;
    try {
      if (st.route) { const h = typeof st.route === "function" ? st.route(ctx) : st.route; await go(h); }
      if (st.before) await st.before(ctx);
      if (st.target) { const s = typeof st.target === "function" ? st.target(ctx) : st.target; el = await waitFor(s, st.wait || 5000); if (el) sel = s; }
    } catch (e) { /* si algo falla, mostramos el paso centrado: nunca rompemos el sitio */ }
    if (my !== token || !run) return;

    if (el) await reveal(el);
    if (my !== token) return;
    render(st, !!el, dir);
    update();
  }

  async function reveal(el) {
    if (el.closest("header.top")) return;
    const r = el.getBoundingClientRect(), dock = innerWidth <= 640 ? 270 : 0, avail = innerHeight - dock;
    if (r.top >= 80 && r.bottom <= avail - 20) return;
    const delta = r.height > avail - 120 ? r.top - 80 : r.top + r.height / 2 - avail * 0.4;
    scrollBy({ top: delta, behavior: REDUCED ? "auto" : "smooth" });
    await sleep(REDUCED ? 30 : 480);
  }

  function render(st, hasTarget, dir) {
    const n = run.steps.length, i = run.i;
    $(".onb-bar i", root).style.width = ((i + 1) / n) * 100 + "%";
    $(".onb-badge", root).textContent = st.icon || "✨";
    $(".onb-meta b", root).textContent = TOURS[run.role].label;
    $(".onb-meta span", root).textContent = `Paso ${i + 1} de ${n}`;
    $("#onb-t", root).innerHTML = typeof st.title === "function" ? st.title(ctx) : E(st.title);
    const bodyEl = $("#onb-b", root); bodyEl.innerHTML = st.body ? st.body(ctx) : "";
    if (st.final) {
      const c = document.createElement("div"); c.className = "onb-confetti";
      c.innerHTML = Array.from({ length: 22 }, (_, k) => `<i style="left:${(k * 4.7) % 100}%;background:${["#0A46BF", "#0CC8F2", "#F2CB07", "#FF8900"][k % 4]};animation-delay:${(k % 7) * 0.12}s"></i>`).join("");
      card.append(c); setTimeout(() => c.remove(), 3500);
    }
    const hint = $(".onb-hint", root); hint.hidden = true; hint.classList.remove("ok");
    const next = $(".onb-next", root), prev = $(".onb-prev", root);
    next.disabled = false; prev.disabled = i === 0; prev.hidden = i === 0;
    next.classList.remove("pulse");
    next.textContent = st.final ? "¡Terminar!" : "Siguiente";
    // CTA opcional del último paso
    const old = $(".onb-cta", root); if (old) old.remove();
    if (st.final && st.cta) {
      const cta = st.cta(ctx), a = document.createElement("button"); a.type = "button"; a.className = "btn sm onb-cta"; a.textContent = cta.label;
      a.onclick = () => { finish("done"); if (!IS_ADMIN && cta.href) location.hash = cta.href; };
      $(".onb-foot .grp", root).insertBefore(a, next);
    }
    $(".onb-skip", root).hidden = !!st.final;
    card.classList.toggle("center", !hasTarget);
    block.classList.toggle("dim", !hasTarget);
    block.classList.toggle("free", !!(st.interactive && hasTarget));
    spot.style.opacity = hasTarget ? 1 : 0;
    card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter");
    if (st.interactive && hasTarget) wireInteractive(st.interactive, hint, next);
    next.focus({ preventScroll: true });
  }

  let iaCleanup = null;
  function cleanupInteractive() { if (iaCleanup) { iaCleanup(); iaCleanup = null; } }
  function wireInteractive(ia, hint, next) {
    hint.hidden = false; hint.textContent = "👉 " + ia.hint;
    const h = (e) => {
      if (!e.target.closest || !e.target.closest(ia.selector)) return;
      hint.textContent = "✓ ¡Muy bien! Ya lo probaste. Pulsa «Siguiente»."; hint.classList.add("ok"); next.classList.add("pulse");
      document.removeEventListener(ia.event, h, true);
    };
    document.addEventListener(ia.event, h, true);
    iaCleanup = () => document.removeEventListener(ia.event, h, true);
  }

  /* Posiciona foco + tarjeta (se re-mide cada 300 ms para seguir contenido que carga después) */
  function update() {
    if (!run || !root) return;
    const el = sel ? $(sel) : null;
    if (!el) { if (sel) spot.style.opacity = 0; if (!sel) place(null); return; }
    const r = el.getBoundingClientRect(), pad = 6;
    const top = Math.max(r.top - pad, 4), left = Math.max(r.left - pad, 4);
    const w = Math.min(r.width + pad * 2, innerWidth - left - 4), h = Math.min(r.bottom + pad, innerHeight - 4) - top;
    Object.assign(spot.style, { top: top + "px", left: left + "px", width: Math.max(w, 10) + "px", height: Math.max(h, 10) + "px", opacity: 1 });
    place({ top, left, right: left + w, bottom: top + h, width: w, height: h });
  }
  function place(r) {
    const mobile = innerWidth <= 640;
    card.classList.toggle("dock", mobile);
    if (!r || mobile) { card.style.top = card.style.left = ""; if (!mobile) card.style.width = ""; return; }
    const w = Math.min(380, innerWidth - 24), ch = card.offsetHeight, gap = 16, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    card.style.width = w + "px";
    let t, l = cl(r.left + r.width / 2 - w / 2, 12, innerWidth - w - 12);
    if (r.bottom + gap + ch <= innerHeight - 8) t = r.bottom + gap;
    else if (r.top - gap - ch >= 8) t = r.top - gap - ch;
    else if (r.right + gap + w <= innerWidth - 8) { l = r.right + gap; t = cl(r.top, 8, innerHeight - ch - 8); }
    else if (r.left - gap - w >= 8) { l = r.left - gap - w; t = cl(r.top, 8, innerHeight - ch - 8); }
    else { t = innerHeight - ch - 12; l = innerWidth - w - 12; }
    card.style.top = t + "px"; card.style.left = l + "px";
  }

  function finish(status, silent) {
    if (!run) return;
    const r = run; run = null; token++; cleanupInteractive(); unmount();
    if (status) store.set(r.storeKey, { status, at: Date.now(), v: CFG.version });
    if (status && r.role === "dueno" && ctx.role === "visitante") store.set("visitante", { status, at: Date.now(), v: CFG.version });
    if (status === "skipped" && !silent) { showToast("Puedes volver a abrir la guía cuando quieras con el botón «Guía».", [["Entendido"]], 5000); pulseFab(); }
    renderFab();
  }

  /* ---------- botón flotante, menú y avisos ---------- */
  function renderFab() {
    let fab = document.getElementById("onb-fab");
    const show = IS_ADMIN ? ctx.role === "admin" : true;
    if (!show) { if (fab) fab.remove(); closeMenu(); return; }
    if (!fab) {
      fab = document.createElement("button"); fab.id = "onb-fab"; fab.type = "button"; fab.setAttribute("aria-haspopup", "true");
      fab.innerHTML = `<span class="q" aria-hidden="true">?</span><span class="t">Guía</span>`; fab.setAttribute("aria-label", "Abrir guía de uso");
      fab.onclick = () => (document.getElementById("onb-menu") ? closeMenu() : openMenu());
      document.body.append(fab);
    }
  }
  function pulseFab() { const f = document.getElementById("onb-fab"); if (f) { f.classList.add("pulse"); setTimeout(() => f.classList.remove("pulse"), 6000); } }
  function closeMenu() { const m = document.getElementById("onb-menu"); if (m) m.remove(); }
  function openMenu() {
    closeToast(); closeMenu();
    const items = IS_ADMIN ? [["admin", "🛠️", "Guía del panel de administración"]]
      : [["cliente", "🚗", "Guía para clientes"], ["dueno", "🏪", "Guía para dueños de lavaderos"]];
    const m = document.createElement("div"); m.id = "onb-menu"; m.setAttribute("role", "menu");
    m.innerHTML = `<small>¿Qué quieres repasar?</small>` + items.map(([k, i, t]) => `<button type="button" role="menuitem" data-k="${k}"><span>${i}</span>${t}</button>`).join("");
    m.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => start(b.dataset.k)));
    document.body.append(m);
    const away = (e) => { if (!m.contains(e.target) && e.target.id !== "onb-fab" && !e.target.closest("#onb-fab")) { closeMenu(); document.removeEventListener("click", away, true); } };
    setTimeout(() => document.addEventListener("click", away, true), 0);
    const f = m.querySelector("button"); if (f) f.focus();
  }
  function closeToast() { const t = document.getElementById("onb-toast"); if (t) t.remove(); }
  function showToast(text, btns, ms) {
    closeToast(); closeMenu();
    const t = document.createElement("div"); t.id = "onb-toast"; t.setAttribute("role", "status");
    t.innerHTML = `<p>${text}</p><div class="row">${btns.map(([l], i) => `<button type="button" class="btn sm ${i === 0 ? "cta" : "ghost"}" data-i="${i}">${l}</button>`).join("")}</div>`;
    t.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { const fn = btns[+b.dataset.i][1]; closeToast(); if (fn) fn(); }));
    document.body.append(t); if (ms) setTimeout(() => t.isConnected && t.remove(), ms);
  }

  /* ---------- selector de rol para visitantes (primer ingreso) ---------- */
  function showRolePicker() {
    mount(); run = { role: "cliente", steps: [], i: 0, picker: true, storeKey: "visitante" };
    card.dataset.role = "cliente"; card.classList.add("center", "enter"); card.classList.remove("dock");
    block.classList.add("dim"); block.classList.remove("free"); spot.style.opacity = 0; sel = null;
    $(".onb-bar i", root).style.width = "8%"; $(".onb-badge", root).textContent = "👋";
    $(".onb-meta b", root).textContent = "Bienvenido a MIMO"; $(".onb-meta span", root).textContent = "Elige tu guía";
    $("#onb-t", root).textContent = "¿Cómo vas a usar MIMO?";
    $("#onb-b", root).innerHTML = `<p>Te preparo un recorrido corto, a tu medida.</p><div class="onb-choices">
      <button class="onb-choice" data-k="cliente" type="button"><span class="ic">🚗</span><span><b>Quiero lavar mi vehículo</b><span class="s">Buscar, comparar y reservar</span></span></button>
      <button class="onb-choice" data-k="dueno" type="button"><span class="ic">🏪</span><span><b>Soy dueño de un lavadero</b><span class="s">Cómo te ven los clientes y cómo funcionan las reservas</span></span></button></div>`;
    $("#onb-b", root).querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => start(b.dataset.k)));
    $(".onb-hint", root).hidden = true; $(".onb-foot .grp", root).hidden = true; $(".onb-skip", root).textContent = "Ahora no, gracias";
    $(".onb-skip", root).hidden = false;
    const f = $(".onb-choice", root); if (f) f.focus();
    // reponer controles al iniciar un recorrido real
    const restore = () => { const g = $(".onb-foot .grp", root); if (g) g.hidden = false; const s = $(".onb-skip", root); if (s) s.textContent = "Omitir guía"; };
    root.addEventListener("click", (e) => { if (e.target.closest("[data-k]")) restore(); }, true);
  }

  /* ---------- arranque y detección de cambios de sesión ---------- */
  const seen = (key) => !!store.get(key);

  async function boot() {
    await refreshCtx(); renderFab();
    if (!CFG.autoStart) return;
    if (IS_ADMIN) { if (ctx.role === "admin" && !seen("admin")) setTimeout(() => start("admin"), 700); return; }
    const home = norm(location.hash) === "#/";
    if (ctx.role === "cliente" && !seen(ctx.key) && !seen("visitante")) {
      if (home) setTimeout(() => start("cliente"), 900);
      else { showToast("👋 ¿Primera vez en MIMO? Te muestro cómo funciona en 1 minuto.", [["Empezar", () => start("cliente")], ["Ahora no", () => store.set(ctx.key, { status: "skipped", at: Date.now(), v: CFG.version })]]); pulseFab(); }
    } else if (ctx.role === "visitante" && !seen("visitante")) {
      if (home) setTimeout(showRolePicker, 900);
      else { showToast("👋 ¿Primera vez en MIMO? Elige una guía rápida.", [["Ver guía", showRolePicker], ["Ahora no", () => store.set("visitante", { status: "skipped", at: Date.now(), v: CFG.version })]]); pulseFab(); }
    }
  }

  // Detecta login/registro/logout sin tocar app.js ni admin.js
  function watchSession() {
    let busy = false;
    const recheck = async () => {
      if (busy || run) return; busy = true; await sleep(250);
      const before = ctx.key; await refreshCtx(); renderFab(); busy = false;
      if (ctx.key === before) return;
      if (IS_ADMIN) { if (ctx.role === "admin" && !seen("admin")) setTimeout(() => start("admin"), 600); }
      else if (ctx.role === "cliente" && !seen(ctx.key) && !seen("visitante")) {
        showToast("🎉 ¡Cuenta lista! ¿Quieres un recorrido de 1 minuto por tu cuenta?", [["Empezar", () => start("cliente")], ["Ahora no", () => store.set(ctx.key, { status: "skipped", at: Date.now(), v: CFG.version })]]); pulseFab();
      }
    };
    const target = IS_ADMIN ? document.getElementById("salir") : document.getElementById("navCuenta");
    if (target) new MutationObserver(recheck).observe(target, IS_ADMIN ? { attributes: true, attributeFilter: ["class"] } : { childList: true, characterData: true, subtree: true });
  }

  // Cualquier enlace/botón con data-onb-start abre la guía (útil para el pie de página)
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("[data-onb-start]"); if (!a) return;
    e.preventDefault(); const k = a.getAttribute("data-onb-start");
    start(IS_ADMIN ? "admin" : (TOURS[k] ? k : "cliente"));
  });

  window.MimoOnboarding = {
    start: (r) => start(r), open: openMenu,
    reset() { Object.keys(localStorage).filter((k) => k.indexOf("mimo_onb_") === 0).forEach((k) => localStorage.removeItem(k)); },
    ctx, tours: TOURS,
  };

  const init = () => { boot(); watchSession(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
