# MIMO · Reservas de lavaderos en Santa Marta

Plataforma web tipo Booking para lavaderos de autos: buscar por zona/precio/servicio/vehículo/disponibilidad/cercanía, reservar, historial, próximo lavado recomendado, recordatorios, fidelización y panel admin.

**Stack:** HTML/CSS/JS (frontend) · Python Flask (API) · SQLite (base de datos). Sin dependencias de build.

## Estructura
```
backend/      app.py (API), db.py (esquema + inicialización), seed_data.py (los 50 lavaderos y catálogo)
frontend/     index.html, admin.html, css/, js/ (cards.js = tarjeta editable), assets/ (imagotipo), fotos/
tests_api.py  pruebas de integración
```

## Ejecutar en local
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # edita valores; luego: export $(grep -v '^#' .env | xargs)   (o define las variables en tu terminal)
python -m backend.app                                   # http://localhost:5000
```
La base se crea y se llena sola en el primer arranque (`python -m backend.db` la inicializa explícitamente). El admin se crea con `ADMIN_USER` / `ADMIN_PASSWORD` (se guarda con hash; si no defines contraseña, se imprime una temporal en consola). Panel: `/admin.html`.

## Fotos de los lavaderos
Sube a `frontend/fotos/` un archivo por lavadero llamado `<N.º del listado>.png` (`1.png`, `2.png`, …). Sin archivo se muestra el imagotipo. La tarjeta se edita en `frontend/js/cards.js`; los datos, en el panel admin o en `backend/seed_data.py` (solo aplica con base nueva).

## Desplegar
**Opción simple (recomendada):** un solo servicio (Render, Railway, Fly.io, un VPS) que sirve API y frontend juntos.
- Build: `pip install -r requirements.txt` · Start: `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4` (ver `Procfile`).
- Variables: `SECRET_KEY`, `ADMIN_USER`, `ADMIN_PASSWORD`, `COOKIE_SECURE=1`, `DATABASE_PATH` en un **disco persistente** (si no, SQLite se borra en cada despliegue).
- Usa 1 worker (SQLite con escritura serializada) o migra a PostgreSQL si necesitas escalar.

**Frontend en GitHub Pages + backend aparte:** publica la carpeta `frontend/`, edita `frontend/js/config.js` (`MIMO_API = "https://tu-backend"`) y en el backend define `ALLOWED_ORIGIN=https://tuusuario.github.io`, `COOKIE_SAMESITE=None`, `COOKIE_SECURE=1`. Las cookies cross-site pueden ser bloqueadas por algunos navegadores: por eso se recomienda la opción simple.

## Reglas de negocio
- Reserva nueva = **pendiente**. Solo el admin la pasa a **confirmada**, y luego a **completada** (solo si la fecha ya llegó). Solo las completadas entran al historial, a la fidelización y al cálculo de la próxima fecha.
- Anti-duplicados en servidor: transacción `BEGIN IMMEDIATE` + conteo de reservas solapadas ≤ puestos del lavadero (puestos ≈ mitad de la capacidad del listado; editable). Un mismo vehículo no puede tener dos reservas cruzadas.
- Próxima fecha = (último lavado completado, o la fecha declarada por el cliente) + frecuencia elegida.
- Fidelización: cada 10 lavados completados, el siguiente es gratis (el descuento se aplica manualmente en el lavadero).

## Seguridad
Contraseñas con hash (werkzeug), sesiones en cookie HttpOnly firmada, rutas admin protegidas en servidor, validación de entradas, consultas parametrizadas, bloqueo de peticiones no-JSON (CSRF), límite de intentos de login, cabeceras de seguridad. Ningún secreto está en el frontend.

## Pruebas
`python tests_api.py` (45 comprobaciones de API: búsqueda, reservas duplicadas/capacidad, estados, permisos, historial, recordatorios).

## Pendiente / requiere credenciales
- **Datos del listado:** no trae precios, coordenadas ni todos los horarios. Los precios son de **referencia** (editables en admin) y las coordenadas son **aproximadas por zona**. 13 lavaderos sin horario usan 7:00–18:00 como referencia y se marcan «por confirmar».
- **WhatsApp automático:** hoy el envío es manual (enlace `wa.me` con mensaje listo). Para automatizarlo hace falta cuenta de WhatsApp Business API.
- Cuentas de lavadero (dueños) para confirmar reservas por su cuenta: hoy confirma el admin MIMO.
- Notificaciones por correo/SMS, recuperación de contraseña, mapa embebido.
