/* ===== TARJETA DE LAVADERO (editable) =====
   Cambia aquí el diseño/campos de la tarjeta. Los datos vienen de la base de datos (admin) o de backend/seed_data.py.
   FOTOS: sube a la carpeta /fotos un archivo por lavadero llamado <ID>.png (1.png, 2.png, 3.png...).
   El ID es el número N.º del listado (Agua Bendita = 1, Lava Autos Wilson #2 = 2, ...). Sin foto, se muestra el imagotipo. */
const fotoUrl = (id) => `fotos/${id}.jpg`;

function cardLavadero(l, tipo) {
  const km = l.km != null ? `<span class="tag gris">${l.km} km</span>` : "";
  const estado = !l.horario_publicado ? `<span class="tag amar">Horario por confirmar</span>`
    : l.abierto ? `<span class="tag verde">Abierto ahora</span>` : `<span class="tag gris">Cerrado ahora</span>`;
  const libres = l.libres != null ? `<span class="tag ${l.libres ? "verde" : "gris"}">${l.libres} horarios libres</span>` : "";
  return `<article class="card">
    <div class="foto"><img class="ph" src="assets/imagotipo.jpeg" alt=""><img class="real" src="${fotoUrl(l.id)}" alt="Foto de ${esc(l.nombre)}" loading="lazy" onerror="this.remove()"></div>
    <div class="cuerpo">
      <div>${estado}${km}${libres}</div>
      <h3>${esc(l.nombre)}</h3>
      <div class="meta">📍 ${esc(l.direccion)} · ${esc(l.barrio)}</div>
      <div class="meta">🕒 ${esc(l.horario_txt)}</div>
      <div class="meta">${esc(l.tipo)}</div>
      <div class="pie"><div><span class="meta">Desde</span><div class="precio">${COP(l.desde)}</div></div>
        <div class="row"><a class="btn ghost sm" href="#/l/${l.id}">Ver ficha</a><a class="btn cta sm" href="#/reservar/${l.id}${tipo ? "?v=" + tipo : ""}">Reservar</a></div></div>
    </div></article>`;
}
