import os, sqlite3, secrets
from werkzeug.security import generate_password_hash
from .seed_data import LAVADEROS, ZONAS, CATALOGO

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "mimo.db"))

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS lavaderos(
 id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, direccion TEXT, barrio TEXT, zona TEXT, telefono TEXT,
 horario_txt TEXT, horario_cod TEXT, horario_publicado INTEGER DEFAULT 1, tipo TEXT, cap TEXT,
 vehiculos TEXT DEFAULT 'C', puestos INTEGER DEFAULT 1, lat REAL, lng REAL, activo INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS servicios(
 id INTEGER PRIMARY KEY AUTOINCREMENT, lavadero_id INTEGER NOT NULL REFERENCES lavaderos(id) ON DELETE CASCADE,
 nombre TEXT NOT NULL, descripcion TEXT, duracion_min INTEGER NOT NULL,
 precio_auto INTEGER, precio_camioneta INTEGER, precio_suv INTEGER, precio_moto INTEGER, activo INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS clientes(
 id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, whatsapp TEXT NOT NULL UNIQUE,
 pass_hash TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now','-5 hours')));
CREATE TABLE IF NOT EXISTS vehiculos(
 id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
 tipo TEXT NOT NULL CHECK(tipo IN ('auto','camioneta','suv','moto')), placa TEXT, alias TEXT,
 ultimo_lavado_declarado TEXT, frecuencia_dias INTEGER NOT NULL DEFAULT 15);
CREATE TABLE IF NOT EXISTS reservas(
 id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,
 cliente_id INTEGER NOT NULL REFERENCES clientes(id), vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
 lavadero_id INTEGER NOT NULL REFERENCES lavaderos(id), servicio_id INTEGER NOT NULL REFERENCES servicios(id),
 fecha TEXT NOT NULL, ini INTEGER NOT NULL, fin INTEGER NOT NULL, precio INTEGER NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmada','completada','cancelada')),
 nota TEXT, creado TEXT NOT NULL DEFAULT (datetime('now','-5 hours')));
CREATE INDEX IF NOT EXISTS ix_res ON reservas(lavadero_id,fecha,estado);
CREATE TABLE IF NOT EXISTS lavados(
 id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
 vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id), lavadero_id INTEGER NOT NULL REFERENCES lavaderos(id),
 servicio_id INTEGER REFERENCES servicios(id), reserva_id INTEGER UNIQUE REFERENCES reservas(id),
 fecha TEXT NOT NULL, precio INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS recordatorios(
 id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
 vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id), fecha_programada TEXT NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','enviado','cancelado')),
 actualizado TEXT, UNIQUE(vehiculo_id, fecha_programada));
CREATE TABLE IF NOT EXISTS admins(
 id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL);
"""

def conn():
    c = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    c = conn(); c.executescript(SCHEMA)
    if not c.execute("SELECT 1 FROM lavaderos LIMIT 1").fetchone():
        seed(c)
    user = os.environ.get("ADMIN_USER", "admin")
    pw = os.environ.get("ADMIN_PASSWORD")
    if not c.execute("SELECT 1 FROM admins").fetchone():
        if not pw:
            pw = secrets.token_urlsafe(12)
            print(f"[MIMO] ADMIN_PASSWORD no definido. Contraseña temporal para '{user}': {pw}")
        c.execute("INSERT INTO admins(usuario,pass_hash) VALUES(?,?)", (user, generate_password_hash(pw)))
    c.close()

def seed(c):
    c.execute("BEGIN")
    for (i, nom, dr, ba, zo, tel, ht, hc, tipo, cap, veh) in LAVADEROS:
        lat, lng = ZONAS[zo]
        lat += ((i * 37) % 17 - 8) * 0.0004   # pequeño desplazamiento para no apilar marcadores
        lng += ((i * 53) % 17 - 8) * 0.0004
        try: puestos = max(1, int(str(cap)[0]) // 2)
        except ValueError: puestos = 1
        c.execute("INSERT INTO lavaderos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
          (i, nom, dr, ba, zo, tel, ht or "No publicado", hc or "L-D 7-18", 1 if hc else 0, tipo, cap, veh, puestos, lat, lng))
        t = tipo.lower(); keys = ["general"]
        if "combo" in t: keys.append("combo")
        if "polich" in t: keys.append("polich")
        if any(k in t for k in ("tapic", "alfombr", "tapete")): keys.append("tapiz")
        if "motor" in t: keys.append("motor")
        if "chasis" in t: keys.append("chasis")
        if "detail" in t or "detallado" in t: keys.append("detail")
        for k in keys:
            n, d, m, a, ca, s, mo = CATALOGO[k]
            if "C" not in veh: a = ca = s = None
            if "M" not in veh: mo = None
            if k == "general" and "C" in veh and "M" in veh and mo is None: mo = None
            if a is None and mo is None: continue
            c.execute("INSERT INTO servicios(lavadero_id,nombre,descripcion,duracion_min,precio_auto,precio_camioneta,precio_suv,precio_moto) VALUES(?,?,?,?,?,?,?,?)",
                      (i, n, d, m, a, ca, s, mo))
    c.execute("COMMIT")

if __name__ == "__main__":
    init_db(); print("Base de datos lista en", os.path.abspath(DB_PATH))
