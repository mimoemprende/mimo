# SEO de MIMO — auditoría e implementación

## 1. Diagnóstico (basado en el código real del repo)
**Arquitectura:** Flask sirve API + `frontend/` estático. El frontend es una SPA con rutas por hash (`#/l/12`, `#/reservar/12`, `#/cuenta`).

| # | Hallazgo | Gravedad |
|---|---|---|
| 1 | Todo el contenido (fichas, listado, textos) se pinta con JS y las fichas viven en `#/l/N`. Google ignora el fragmento `#`: **las 50 fichas no tienen URL propia indexable** y solo existe una URL (`/`). | Bloquea indexación |
| 2 | `errorhandler(404)` devolvía `index.html` con **HTTP 200** (soft-404: cualquier URL inventada "existe"). | Alta |
| 3 | No existían `robots.txt`, `sitemap.xml`, canonical, Open Graph ni JSON-LD. | Alta |
| 4 | `/` y `/index.html` servían el mismo contenido sin redirección. | Media |
| 5 | `document.title` igual en todas las vistas de la SPA. | Media (UX) |
| 6 | Logo de 1600×1600 px / 136 KB usado como logo de 44 px, favicon y placeholder de cada tarjeta. Imágenes sin `width/height` (riesgo CLS). | Media (rendimiento) |
| 7 | Sin `Referrer-Policy`, `Permissions-Policy`, HSTS; sin caché para estáticos. | Baja/Media |
| 8 | `/fotos/` está vacía (solo `.gitkeep`): las fichas no tienen fotos propias. | Contenido |
| 9 | 9 de 50 lavaderos sin horario, 22 sin teléfono, 2 sin dirección real; zona "Domicilio" con 1 solo registro. | Contenido |

Lo que **ya estaba bien:** `lang="es"`, viewport, `title`/`description` en el home, `noindex` en `admin.html`, `alt` vacío en imágenes decorativas, `aria-pressed` en chips, `font-display:swap`, sin secretos en el frontend, `prefers-reduced-motion`.

## 2. Qué se implementó (ya aplicado en este repo)
- **`backend/seo.py`** (blueprint nuevo, sin dependencias nuevas; usa Jinja2 de Flask):
  - `/lavaderos/<id>-<slug>`: ficha renderizada en servidor (HTML completo sin JS), un H1, breadcrumb, tabla de servicios, enlaces a hermanos de la zona, Open Graph, canonical. 301 desde `/lavaderos/<id>` o slug erróneo.
  - `/zona/<slug>`: páginas de zona **solo si hay ≥ 3 lavaderos indexables** (hoy: Bastidas, Centro, Comuna 1, Comuna 4, Sur, Troncal/Minca).
  - **Regla de indexación de fichas** (`indexable()`): dirección real + (teléfono u horario publicado). Hoy 41 indexables y 9 con `noindex,follow` (excluidas del sitemap). Evita páginas pobres.
  - `/sitemap.xml` generado desde la BD (home + zonas + fichas indexables; sin `lastmod` porque no hay fecha de edición fiable) y `/robots.txt` (bloquea `/api/`, referencia el sitemap).
  - JSON-LD: `Organization` + `WebSite` (home), `BreadcrumbList` (fichas/zonas), `CollectionPage` (zonas). Sin precios, reseñas, coordenadas ni `SearchAction` (la búsqueda no tiene URL).
  - `AutoWash` (negocio de terceros) **desactivado por defecto**; actívalo con `SEO_LOCALBUSINESS=1` solo cuando verifiques los datos del listado.
- **`app.py`:** 404 real con página útil (`noindex`), `/index.html`→301 a `/`, `X-Robots-Tag: noindex` en `/api/*` y `/admin.html`, `Referrer-Policy`, `Permissions-Policy` (geolocalización permitida), HSTS si `COOKIE_SECURE=1`, caché de estáticos (JS/CSS 1 h, assets/fotos 7 días), `slug` en `/api/lavaderos`.
- **Frontend:** las tarjetas enlazan a `/lavaderos/<id>-<slug>` (los `#/l/N` antiguos redirigen), título dinámico por vista, enlace "Saltar al contenido", enlaces de zona rastreables en el pie, logos livianos (`imagotipo-400.webp` 7 KB, `icon-192.png`) con `width/height`. El original 1600 px se conserva para Open Graph/Organization.
- **Pruebas:** `python tests_seo.py` (32 comprobaciones) y `python tests_api.py` pasan.

## 3. Puesta en marcha (obligatorio)
1. Define **`SITE_URL=https://tu-dominio`** (dominio definitivo, sin barra final) en el hosting. Sin ella, canonical/sitemap usan el host de la petición y podrías indexar el dominio `*.onrender.com`.
2. Despliega como **un solo servicio** (Procfile actual). **Esta capa no funciona en GitHub Pages**: Pages es estático y no ejecuta Flask; además las rutas son absolutas (`/css/…`). Si mantienes Pages, solo sirve el SPA y la indexación de fichas no es posible.
3. Redirecciones http→https y www→dominio canónico: configúralas en el hosting/DNS (no en la app).
4. En Google Search Console: verifica el dominio, envía `/sitemap.xml`, inspecciona `/`, una ficha y una zona ("Probar URL activa") y vigila el informe de páginas.
5. Mide con PageSpeed Insights/CrUX (datos reales de usuarios; solo disponibles con tráfico) y Lighthouse (laboratorio). Revisa LCP, INP, CLS antes/después. **No medí estas métricas aquí:** no hay red ni sitio publicado.

## 4. Pendiente / requiere tu decisión (no lo inventé)
- **Fotos:** sube `frontend/fotos/<id>.png`. Recomendado: WebP/AVIF ≤ 150 KB, 1280×800. Crea además `assets/og-mimo.jpg` (1200×630) y cámbialo en `seo.py`/`base.html`.
- **Verificar datos del listado** (direcciones, horarios, teléfonos) antes de activar `AutoWash`. Las coordenadas son aproximadas por zona: **no** se publican como `geo`.
- **Compresión gzip/brotli:** gunicorn no comprime; actívala en el proxy/CDN (Render/Cloudflare lo hacen) o añade `flask-compress`.
- **CSP:** no la añadí porque el frontend usa `onerror=` y estilos inline; requiere refactor previo.
- **Manifest/PWA:** no hay necesidad real de instalación; no se crea.
- **Ficha con poco texto:** hoy el contenido propio por ficha es breve (datos + servicios). Con descripciones reales aportadas por cada lavadero (servicios, fotos, métodos de pago) mejora mucho.
- **Google Business Profile:** MIMO es un marketplace, no el negocio: **no** crees perfil con la dirección de terceros. Sí tiene sentido un perfil de MIMO solo si MIMO tiene sede/atención al público; los lavaderos gestionan su propio perfil (puedes invitarlos y enlazar a su ficha).
- **Reservas/cuenta** (`#/reservar`, `#/cuenta`) quedan fuera de índice por diseño (son hash y requieren sesión).

## 5. Palabras clave — HIPÓTESIS (sin validar; contrastar con Search Console / Google Keyword Planner)
| Intención | Consulta hipotética | Página |
|---|---|---|
| Local-comercial | lavadero de carros en Santa Marta | `/` |
| Local-comercial | lavadero de carros en El Rodadero | `/zona/…` (hoy Rodadero tiene 4 lavaderos pero solo 3 sin datos suficientes → no indexa; revisar) |
| Comercial | lavadero 24 horas Santa Marta | `/` (filtro) o página futura "24 horas" si hay ≥3 con horario 24 h verificado |
| Transaccional | reservar lavado de carro Santa Marta | `/` |
| Comercial | precio lavado de carro Santa Marta | contenido nuevo, solo con tarifas confirmadas |
| Informativa | cada cuánto lavar el carro | blog (ver calendario) |
| Local | lavado a domicilio Santa Marta | solo si se confirma cobertura real (hoy: ids 10 y 50 mencionan domicilio) |

## 6. Calendario editorial inicial (requiere crear páginas nuevas)
1. "Cada cuánto lavar el carro en clima costero" → enlaza a `/` y recordatorios. *(informativa)*
2. "Tipos de lavado: general, combo, polichado, detallado" → enlaza a fichas por servicio. *(comercial)*
3. "Cómo reservar tu lavado en MIMO paso a paso" → `/`. *(conversión)*
4. "Cómo preparar tu carro antes del lavado" *(informativa)*
5. "Lavaderos 24 horas en Santa Marta" — solo con horarios verificados. *(local)*
