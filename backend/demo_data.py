"""Datos de DEMOSTRACIÓN (clientes, reservas y lavados ficticios).
Solo se cargan si la variable de entorno DEMO_DATA=1 y la base de datos es nueva.
Las fechas son relativas a "hoy", así el panel siempre se ve con actividad reciente.
Para producción real: NO definas DEMO_DATA."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from werkzeug.security import generate_password_hash

PASSWORD_DEMO = "demo1234"   # contraseña de TODOS los clientes de demo
# (nombre, whatsapp, tipo, placa, frecuencia_dias, ultimo_declarado_hace_dias, es_nuevo, [lavados: hace_N_dias])
CLIENTES = [
 ("Cliente Demo",     "3000000000", "auto",      "DEM001", 15, None, False, [20]),
 ("Camila Rojas",     "3001112201", "auto",      "KLM214", 15, None, False, [40, 25, 10]),
 ("Andrés Mejía",     "3001112202", "suv",       "NPQ550", 15, None, False, [30, 16]),
 ("Laura Pérez",      "3001112203", "camioneta", "RTS908", 30, None, False, [45, 14]),
 ("Jhon Díaz",        "3001112204", "moto",      "ABC12D", 7,  None, False, [20, 13, 6]),
 ("Marcela Torres",   "3001112205", "auto",      "UVW371", 15, None, False, [14]),
 ("Sebastián Vega",   "3001112206", "auto",      "XYZ640", 30, 35,   False, []),
 ("Paola Herrera",    "3001112207", "suv",       "GHJ123", 45, None, True,  [3]),
 ("Luis Castro",      "3001112208", "auto",      "LCA777", 15, None, False, [120 - 12 * i for i in range(10)]),
 ("Daniela Ruiz",     "3001112209", "camioneta", "DRZ456", 15, 5,    True,  []),
 ("Felipe Gómez",     "3001112210", "auto",      "FGM889", 30, None, True,  []),
 ("Natalia Soto",     "3001112211", "moto",      "NTS34E", 15, None, True,  [9]),
]
PREFERIDOS = {"moto": (4, 5, 2), "otros": (1, 5, 4)}
# (whatsapp, lavadero, dias_desde_hoy, hora_inicio_min, estado)
FUTURAS = [
 ("3001112209", 1, 1, 600, "pendiente"), ("3001112210", 5, 2, 870, "pendiente"),
 ("3001112207", 4, 3, 540, "pendiente"), ("3001112205", 5, 1, 960, "pendiente"),
 ("3000000000", 1, 2, 660, "confirmada"), ("3001112201", 5, 1, 480, "confirmada"),
 ("3001112202", 1, 3, 900, "confirmada"), ("3001112208", 4, 1, 720, "cancelada"),
]

def seed_demo(c):
    tz = ZoneInfo("America/Bogota"); hoy = datetime.now(tz).date(); mes0 = hoy.replace(day=1)
    iso = lambda d: d.isoformat()
    ph = generate_password_hash(PASSWORD_DEMO)
    n_res = [0]
    def servicio(lav_pref, tipo):
        for lid in lav_pref:
            s = c.execute(f"SELECT * FROM servicios WHERE lavadero_id=? AND precio_{tipo} IS NOT NULL ORDER BY id LIMIT 1", (lid,)).fetchone()
            if s: return lid, s
        raise RuntimeError("sin servicio demo para " + tipo)
    def reserva(cid, vid, lid, s, tipo, fecha, ini, estado):
        n_res[0] += 1; precio = s["precio_" + tipo]
        rid = c.execute("INSERT INTO reservas(codigo,cliente_id,vehiculo_id,lavadero_id,servicio_id,fecha,ini,fin,precio,estado,creado) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (f"DEMO-{n_res[0]:04d}", cid, vid, lid, s["id"], iso(fecha), ini, ini + s["duracion_min"], precio, estado, iso(min(fecha, hoy)) + " 08:00:00")).lastrowid
        if estado == "completada":
            c.execute("INSERT INTO lavados(cliente_id,vehiculo_id,lavadero_id,servicio_id,reserva_id,fecha,precio) VALUES(?,?,?,?,?,?,?)", (cid, vid, lid, s["id"], rid, iso(fecha), precio))
    c.execute("BEGIN")
    ids = {}
    for k, (nom, wa, tipo, placa, frec, decl, nuevo, lavados) in enumerate(CLIENTES):
        creado = mes0 + timedelta(days=min(k, hoy.day - 1)) if nuevo else hoy - timedelta(days=130 + k)
        cid = c.execute("INSERT INTO clientes(nombre,whatsapp,pass_hash,creado) VALUES(?,?,?,?)", (nom, wa, ph, iso(creado) + " 09:00:00")).lastrowid
        vid = c.execute("INSERT INTO vehiculos(cliente_id,tipo,placa,ultimo_lavado_declarado,frecuencia_dias) VALUES(?,?,?,?,?)",
                        (cid, tipo, placa, iso(hoy - timedelta(days=decl)) if decl else None, frec)).lastrowid
        ids[wa] = (cid, vid, tipo)
        pref = PREFERIDOS["moto"] if tipo == "moto" else PREFERIDOS["otros"]
        for j, hace in enumerate(lavados):
            lid, s = servicio((pref[j % len(pref)],) + pref, tipo)
            reserva(cid, vid, lid, s, tipo, hoy - timedelta(days=hace), 480 + 60 * (j % 6), "completada")
    for wa, lid, dias, ini, estado in FUTURAS:
        cid, vid, tipo = ids[wa]; lid, s = servicio((lid, 1, 5, 4, 2), tipo)
        reserva(cid, vid, lid, s, tipo, hoy + timedelta(days=dias), ini, estado)
    # recordatorios: clientes cuya próxima fecha ya llegó o llega en ≤3 días
    for cid, vid, tipo in ids.values():
        v = c.execute("SELECT frecuencia_dias f, ultimo_lavado_declarado d FROM vehiculos WHERE id=?", (vid,)).fetchone()
        u = c.execute("SELECT MAX(fecha) m FROM lavados WHERE vehiculo_id=?", (vid,)).fetchone()["m"] or v["d"]
        if not u: continue
        prox = datetime.strptime(u, "%Y-%m-%d").date() + timedelta(days=v["f"])
        if prox <= hoy + timedelta(days=3):
            c.execute("INSERT OR IGNORE INTO recordatorios(cliente_id,vehiculo_id,fecha_programada) VALUES(?,?,?)", (cid, vid, iso(prox)))
    c.execute("UPDATE recordatorios SET estado='enviado',actualizado=datetime('now') WHERE id=(SELECT MIN(id) FROM recordatorios)")
    c.execute("COMMIT")
    print("[MIMO] Datos de demostración cargados (DEMO_DATA=1). Cliente de prueba: 3000000000 / " + PASSWORD_DEMO)
