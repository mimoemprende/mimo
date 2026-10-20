import os, re, math, time, secrets, sqlite3
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash
from .db import conn, init_db

FRONT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
TZ = ZoneInfo("America/Bogota")
app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.environ.get("COOKIE_SAMESITE", "Lax"),
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=14), MAX_CONTENT_LENGTH=64 * 1024)
if not os.environ.get("SECRET_KEY"):
    print("[MIMO] AVISO: define SECRET_KEY; sin ella las sesiones se pierden al reiniciar.")
init_db()

VEH = ("auto", "camioneta", "suv", "moto")
STEP = 30
ESTADOS_ACTIVOS = ("pendiente", "confirmada")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "")

# ---------- utilidades ----------
def now(): return datetime.now(TZ)
def err(msg, code=400): return jsonify(error=msg), code
def rows(q, a=()):
    c = conn()
    try: return [dict(r) for r in c.execute(q, a).fetchall()]
    finally: c.close()
def one(q, a=()):
    r = rows(q, a); return r[0] if r else None
def hm(m): return f"{m // 60:02d}:{m % 60:02d}"
def pdate(s):
    try: return datetime.strptime(s, "%Y-%m-%d").date()
    except (TypeError, ValueError): return None

@app.after_request
def hdrs(r):
    o = request.headers.get("Origin")
    if ALLOWED_ORIGIN and o == ALLOWED_ORIGIN:
        r.headers["Access-Control-Allow-Origin"] = o
        r.headers["Access-Control-Allow-Credentials"] = "true"
        r.headers["Access-Control-Allow-Headers"] = "Content-Type"
        r.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        r.headers["Vary"] = "Origin"
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["X-Frame-Options"] = "DENY"
    if request.path.startswith("/api/"): r.headers["Cache-Control"] = "no-store"
    return r

@app.before_request
def csrf_guard():
    if request.method == "OPTIONS": return "", 204
    if request.method in ("POST", "PUT", "DELETE") and request.path.startswith("/api/"):
        if not request.is_json and request.content_length:
            return err("Content-Type debe ser application/json", 415)   # bloquea formularios cross-site
        o = request.headers.get("Origin")
        if o and o != request.host_url.rstrip("/") and o != ALLOWED_ORIGIN:
            return err("Origen no permitido", 403)

@app.errorhandler(404)
def nf(e):
    if request.path.startswith("/api/"): return err("No encontrado", 404)
    return send_from_directory(FRONT, "index.html")
@app.errorhandler(500)
def se(e): return err("Error interno del servidor", 500)

_att = {}
def throttle(key, lim=8, win=300):
    t = time.time(); a = [x for x in _att.get(key, []) if t - x < win]
    _att[key] = a
    if len(a) >= lim: return True
    a.append(t); return False

def cliente_req(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get("cid"): return err("Inicia sesión para continuar", 401)
        return f(*a, **k)
    return w
def admin_req(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get("aid"): return err("No autorizado", 401)
        return f(*a, **k)
    return w

def dueno_req(f):
    @wraps(f)
    def w(*a, **k):
        d = one("SELECT * FROM duenos WHERE id=? AND activo=1", (session.get("oid"),)) if session.get("oid") else None
        if not d: return err("No autorizado", 401)
        g.lav = d["lavadero_id"]
        return f(*a, **k)
    return w

def norm_wa(s):
    d = re.sub(r"\D", "", str(s or ""))
    if len(d) == 12 and d.startswith("57"): d = d[2:]
    return d if re.fullmatch(r"3\d{9}", d) else None

# ---------- horarios y disponibilidad ----------
DIAS = "LMXJVSD"
def parse_horario(code):
    """'L-S 6-22;D 6-19.5' -> {0:(360,1320),...}; cerrado = None"""
    res = {i: None for i in range(7)}
    for part in (code or "").split(";"):
        part = part.strip()
        if not part: continue
        d, h = part.split(" ", 1)
        a, b = (d.split("-") + [d])[:2] if "-" in d else (d, d)
        for i in range(DIAS.index(a), DIAS.index(b) + 1):
            if h.strip() == "x": res[i] = None
            else:
                o, c = h.split("-"); res[i] = (int(float(o) * 60), int(float(c) * 60))
    return res

def servicio_precio(s, tipo):
    return s.get("precio_" + tipo)

def slots_dia(lav, srv, fecha, excluir_cliente=None):
    d = pdate(fecha)
    if not d: return []
    h = parse_horario(lav["horario_cod"])[d.weekday()]
    if not h: return []
    o, c = h; dur = srv["duracion_min"]
    n = now(); minimo = (n.hour * 60 + n.minute + 30) if d == n.date() else 0
    ocup = rows("SELECT ini,fin FROM reservas WHERE lavadero_id=? AND fecha=? AND estado IN ('pendiente','confirmada')", (lav["id"], fecha))
    out = []
    for ini in range(o, c - dur + 1, STEP):
        if d < n.date() or ini < minimo: libre = False
        else: libre = sum(1 for r in ocup if r["ini"] < ini + dur and r["fin"] > ini) < lav["puestos"]
        out.append({"hora": hm(ini), "libre": libre})
    return out

def dist_km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))

def abierto_ahora(lav):
    n = now(); h = parse_horario(lav["horario_cod"])[n.weekday()]
    return bool(h and h[0] <= n.hour * 60 + n.minute < h[1])

# ---------- público ----------
@app.get("/api/zonas")
def zonas():
    return jsonify([r["zona"] for r in rows("SELECT DISTINCT zona FROM lavaderos WHERE activo=1 ORDER BY zona")])

@app.get("/api/lavaderos")
def lavaderos():
    q = request.args; tipo = q.get("vehiculo") if q.get("vehiculo") in VEH else None
    L = rows("SELECT * FROM lavaderos WHERE activo=1")
    S = rows("SELECT * FROM servicios WHERE activo=1")
    pmax = int(q["precio_max"]) if q.get("precio_max", "").isdigit() else None
    txt = (q.get("q") or "").lower().strip(); fecha = q.get("fecha")
    try: lat, lng = float(q["lat"]), float(q["lng"])
    except (KeyError, ValueError): lat = lng = None
    out = []
    for l in L:
        if q.get("zona") and l["zona"] != q["zona"]: continue
        if txt and txt not in (l["nombre"] + l["barrio"] + l["direccion"] + l["tipo"]).lower(): continue
        if tipo and ("M" if tipo == "moto" else "C") not in l["vehiculos"]: continue
        ss = [s for s in S if s["lavadero_id"] == l["id"]]
        if q.get("servicio"): ss = [s for s in ss if q["servicio"].lower() in s["nombre"].lower()]
        if tipo: ss = [s for s in ss if servicio_precio(s, tipo)]
        if not ss: continue
        precios = [servicio_precio(s, tipo) if tipo else min(p for p in (s["precio_auto"], s["precio_moto"]) if p) for s in ss]
        mn = min(precios)
        if pmax and mn > pmax: continue
        l["desde"] = mn; l["servicios_n"] = len(ss); l["abierto"] = abierto_ahora(l)
        if fecha:
            l["libres"] = sum(1 for sl in slots_dia(l, min(ss, key=lambda s: s["duracion_min"]), fecha) if sl["libre"])
            if q.get("disponible") == "1" and not l["libres"]: continue
        l["km"] = round(dist_km(lat, lng, l["lat"], l["lng"]), 1) if lat is not None else None
        out.append(l)
    key = q.get("orden", "nombre")
    if key == "cercania" and lat is not None: out.sort(key=lambda l: l["km"])
    elif key == "precio": out.sort(key=lambda l: l["desde"])
    else: out.sort(key=lambda l: l["nombre"].lower())
    return jsonify(out)

@app.get("/api/lavaderos/<int:i>")
def lavadero(i):
    l = one("SELECT * FROM lavaderos WHERE id=? AND activo=1", (i,))
    if not l: return err("Lavadero no encontrado", 404)
    l["servicios"] = rows("SELECT * FROM servicios WHERE lavadero_id=? AND activo=1 ORDER BY duracion_min", (i,))
    l["abierto"] = abierto_ahora(l)
    return jsonify(l)

@app.get("/api/disponibilidad")
def disponibilidad():
    l = one("SELECT * FROM lavaderos WHERE id=? AND activo=1", (request.args.get("lavadero_id"),))
    s = one("SELECT * FROM servicios WHERE id=? AND activo=1", (request.args.get("servicio_id"),))
    if not l or not s or s["lavadero_id"] != l["id"]: return err("Servicio o lavadero inválido")
    f = pdate(request.args.get("fecha"))
    if not f: return err("Fecha inválida")
    return jsonify(slots=slots_dia(l, s, f.isoformat()), horario_publicado=bool(l["horario_publicado"]))

# ---------- clientes ----------
def proxima_info(vid):
    v = one("SELECT * FROM vehiculos WHERE id=?", (vid,))
    ul = one("SELECT MAX(fecha) f, COUNT(*) n FROM lavados WHERE vehiculo_id=?", (vid,))
    ultimo = ul["f"] or v["ultimo_lavado_declarado"]
    prox = None
    if ultimo: prox = (pdate(ultimo) + timedelta(days=v["frecuencia_dias"])).isoformat()
    return {"ultimo_lavado": ultimo, "lavado_registrado": bool(ul["f"]), "visitas": ul["n"], "proxima_fecha": prox}

def validar_vehiculo(d):
    tipo = d.get("tipo")
    if tipo not in VEH: return None, "Tipo de vehículo inválido"
    fr = d.get("frecuencia_dias", 15)
    if not isinstance(fr, int) or not 7 <= fr <= 90: return None, "La frecuencia debe estar entre 7 y 90 días"
    ul = d.get("ultimo_lavado_declarado") or None
    if ul and (not pdate(ul) or pdate(ul) > now().date()): return None, "Fecha de último lavado inválida"
    placa = re.sub(r"[^A-Z0-9]", "", str(d.get("placa") or "").upper())[:7] or None
    return (tipo, placa, str(d.get("alias") or "")[:40] or None, ul, fr), None

@app.post("/api/registro")
def registro():
    d = request.get_json(silent=True) or {}
    nombre = str(d.get("nombre", "")).strip()[:80]; wa = norm_wa(d.get("whatsapp")); pw = str(d.get("password", ""))
    if len(nombre) < 2: return err("Escribe tu nombre")
    if not wa: return err("WhatsApp inválido (celular colombiano de 10 dígitos)")
    if len(pw) < 6: return err("La contraseña debe tener mínimo 6 caracteres")
    v, e = validar_vehiculo(d.get("vehiculo") or {})
    if e: return err(e)
    c = conn()
    try:
        c.execute("BEGIN")
        cid = c.execute("INSERT INTO clientes(nombre,whatsapp,pass_hash) VALUES(?,?,?)", (nombre, wa, generate_password_hash(pw))).lastrowid
        c.execute("INSERT INTO vehiculos(cliente_id,tipo,placa,alias,ultimo_lavado_declarado,frecuencia_dias) VALUES(?,?,?,?,?,?)", (cid, *v))
        c.execute("COMMIT")
    except sqlite3.IntegrityError:
        c.execute("ROLLBACK"); return err("Ese WhatsApp ya está registrado. Inicia sesión.", 409)
    finally: c.close()
    session.clear(); session.permanent = True; session["cid"] = cid
    return jsonify(ok=True)

@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}; wa = norm_wa(d.get("whatsapp"))
    if throttle("c" + request.remote_addr): return err("Demasiados intentos. Espera unos minutos.", 429)
    c = one("SELECT * FROM clientes WHERE whatsapp=?", (wa,)) if wa else None
    if not c or not check_password_hash(c["pass_hash"], str(d.get("password", ""))): return err("WhatsApp o contraseña incorrectos", 401)
    session.clear(); session.permanent = True; session["cid"] = c["id"]
    return jsonify(ok=True)

@app.post("/api/logout")
def logout(): session.clear(); return jsonify(ok=True)

@app.get("/api/yo")
def yo():
    if not session.get("cid"): return jsonify(cliente=None)
    c = one("SELECT id,nombre,whatsapp,creado FROM clientes WHERE id=?", (session["cid"],))
    if not c: session.clear(); return jsonify(cliente=None)
    vs = rows("SELECT * FROM vehiculos WHERE cliente_id=?", (c["id"],))
    for v in vs: v.update(proxima_info(v["id"]))
    n = one("SELECT COUNT(*) n FROM lavados WHERE cliente_id=?", (c["id"],))["n"]
    c["vehiculos"] = vs
    c["fidelizacion"] = {"lavados": n, "meta": 10, "progreso": n % 10, "gratis_ganados": n // 10,
                         "faltan": 10 - (n % 10), "recompensa": "Cada 10 lavados completados, el siguiente es gratis."}
    c["historial"] = rows("""SELECT l.fecha,l.precio,v.tipo vehiculo,v.placa,w.nombre lavadero,s.nombre servicio FROM lavados l
        JOIN vehiculos v ON v.id=l.vehiculo_id JOIN lavaderos w ON w.id=l.lavadero_id LEFT JOIN servicios s ON s.id=l.servicio_id
        WHERE l.cliente_id=? ORDER BY l.fecha DESC,l.id DESC""", (c["id"],))
    return jsonify(cliente=c)

@app.post("/api/vehiculos")
@cliente_req
def add_vehiculo():
    v, e = validar_vehiculo(request.get_json(silent=True) or {})
    if e: return err(e)
    c = conn(); c.execute("INSERT INTO vehiculos(cliente_id,tipo,placa,alias,ultimo_lavado_declarado,frecuencia_dias) VALUES(?,?,?,?,?,?)", (session["cid"], *v)); c.close()
    return jsonify(ok=True)

@app.put("/api/vehiculos/<int:i>")
@cliente_req
def upd_vehiculo(i):
    if not one("SELECT 1 x FROM vehiculos WHERE id=? AND cliente_id=?", (i, session["cid"])): return err("No encontrado", 404)
    v, e = validar_vehiculo(request.get_json(silent=True) or {})
    if e: return err(e)
    c = conn(); c.execute("UPDATE vehiculos SET tipo=?,placa=?,alias=?,ultimo_lavado_declarado=?,frecuencia_dias=? WHERE id=?", (*v, i)); c.close()
    return jsonify(ok=True)

# ---------- reservas ----------
@app.post("/api/reservas")
@cliente_req
def crear_reserva():
    d = request.get_json(silent=True) or {}
    try: vid, sid = int(d.get("vehiculo_id")), int(d.get("servicio_id"))
    except (TypeError, ValueError): return err("Datos incompletos")
    v = one("SELECT * FROM vehiculos WHERE id=? AND cliente_id=?", (vid, session["cid"]))
    s = one("SELECT * FROM servicios WHERE id=? AND activo=1", (sid,))
    if not v or not s: return err("Vehículo o servicio inválido")
    l = one("SELECT * FROM lavaderos WHERE id=? AND activo=1", (s["lavadero_id"],))
    precio = servicio_precio(s, v["tipo"])
    if not precio: return err("Este servicio no está disponible para tu tipo de vehículo")
    f = pdate(d.get("fecha")); hora = str(d.get("hora", ""))
    if not f or not re.fullmatch(r"\d\d:\d\d", hora): return err("Fecha u hora inválida")
    libres = {x["hora"]: x["libre"] for x in slots_dia(l, s, f.isoformat())}
    if hora not in libres: return err("Ese horario no existe para este lavadero")
    ini = int(hora[:2]) * 60 + int(hora[3:]); fin = ini + s["duracion_min"]
    c = conn()
    try:
        c.execute("BEGIN IMMEDIATE")   # bloquea escrituras concurrentes: la validación es atómica
        if not libres[hora] and f < now().date(): raise ValueError("No puedes reservar en el pasado")
        n = c.execute("SELECT COUNT(*) FROM reservas WHERE lavadero_id=? AND fecha=? AND estado IN ('pendiente','confirmada') AND ini<? AND fin>?",
                      (l["id"], f.isoformat(), fin, ini)).fetchone()[0]
        mine = c.execute("SELECT COUNT(*) FROM reservas WHERE vehiculo_id=? AND fecha=? AND estado IN ('pendiente','confirmada') AND ini<? AND fin>?",
                         (vid, f.isoformat(), fin, ini)).fetchone()[0]
        n_now = now()
        pasado = f == n_now.date() and ini < n_now.hour * 60 + n_now.minute + 30
        if pasado: raise ValueError("Ese horario ya no está disponible")
        if n >= l["puestos"]: raise ValueError("Ese horario ya fue reservado. Elige otro.")
        if mine: raise ValueError("Tu vehículo ya tiene una reserva que se cruza con ese horario")
        cod = "MIMO-" + secrets.token_hex(3).upper()
        rid = c.execute("INSERT INTO reservas(codigo,cliente_id,vehiculo_id,lavadero_id,servicio_id,fecha,ini,fin,precio,nota) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (cod, session["cid"], vid, l["id"], sid, f.isoformat(), ini, fin, precio, str(d.get("nota", ""))[:200])).lastrowid
        c.execute("COMMIT")
    except ValueError as e:
        c.execute("ROLLBACK"); return err(str(e), 409)
    finally: c.close()
    return jsonify(ok=True, id=rid, codigo=cod, estado="pendiente",
                   mensaje="Solicitud recibida. Queda PENDIENTE hasta que el lavadero/MIMO la confirme.")

RES_SQL = """SELECT r.id,r.codigo,r.fecha,r.ini,r.fin,r.precio,r.estado,r.nota,r.creado,w.nombre lavadero,w.direccion,w.telefono lavadero_tel,w.id lavadero_id,
 s.nombre servicio,v.tipo vehiculo,v.placa,c.nombre cliente,c.whatsapp FROM reservas r JOIN lavaderos w ON w.id=r.lavadero_id
 JOIN servicios s ON s.id=r.servicio_id JOIN vehiculos v ON v.id=r.vehiculo_id JOIN clientes c ON c.id=r.cliente_id """
def fmt(rs):
    for r in rs: r["hora"] = hm(r["ini"]); r["hora_fin"] = hm(r["fin"])
    return rs

@app.get("/api/reservas")
@cliente_req
def mis_reservas():
    return jsonify(fmt(rows(RES_SQL + "WHERE r.cliente_id=? ORDER BY r.fecha DESC,r.ini DESC", (session["cid"],))))

@app.post("/api/reservas/<int:i>/cancelar")
@cliente_req
def cancelar(i):
    c = conn(); r = c.execute("UPDATE reservas SET estado='cancelada' WHERE id=? AND cliente_id=? AND estado IN ('pendiente','confirmada')", (i, session["cid"])).rowcount; c.close()
    return jsonify(ok=True) if r else err("No se puede cancelar esta reserva", 409)

# ---------- admin ----------
@app.post("/api/admin/login")
def admin_login():
    d = request.get_json(silent=True) or {}
    if throttle("a" + request.remote_addr, 5): return err("Demasiados intentos. Espera unos minutos.", 429)
    a = one("SELECT * FROM admins WHERE usuario=?", (str(d.get("usuario", "")),))
    if not a or not check_password_hash(a["pass_hash"], str(d.get("password", ""))): return err("Credenciales incorrectas", 401)
    session.clear(); session.permanent = True; session["aid"] = a["id"]
    return jsonify(ok=True)

@app.get("/api/admin/yo")
def admin_yo(): return jsonify(admin=bool(session.get("aid")))

@app.get("/api/admin/stats")
@admin_req
def stats():
    mes = now().strftime("%Y-%m"); g = lambda q, a=(): one(q, a)["n"]
    return jsonify(
        clientes=g("SELECT COUNT(*) n FROM clientes"),
        pendientes=g("SELECT COUNT(*) n FROM reservas WHERE estado='pendiente'"),
        confirmadas=g("SELECT COUNT(*) n FROM reservas WHERE estado='confirmada'"),
        lavados_mes=g("SELECT COUNT(*) n FROM lavados WHERE substr(fecha,1,7)=?", (mes,)),
        clientes_nuevos=g("SELECT COUNT(*) n FROM clientes WHERE substr(creado,1,7)=?", (mes,)),
        clientes_recurrentes=g("SELECT COUNT(*) n FROM (SELECT cliente_id FROM lavados GROUP BY cliente_id HAVING COUNT(*)>=2)"),
        recordatorios_pendientes=g("SELECT COUNT(*) n FROM recordatorios WHERE estado='pendiente'"))

@app.get("/api/admin/clientes")
@admin_req
def a_clientes():
    cs = rows("SELECT id,nombre,whatsapp,creado FROM clientes ORDER BY id DESC")
    for c in cs:
        vs = rows("SELECT id FROM vehiculos WHERE cliente_id=?", (c["id"],))
        info = [proxima_info(v["id"]) for v in vs]
        ult = [i["ultimo_lavado"] for i in info if i["ultimo_lavado"]]; pr = [i["proxima_fecha"] for i in info if i["proxima_fecha"]]
        c["ultimo_lavado"] = max(ult) if ult else None; c["proxima_fecha"] = min(pr) if pr else None
        c["visitas"] = sum(i["visitas"] for i in info); c["vehiculos"] = len(vs)
    return jsonify(cs)

@app.get("/api/admin/reservas")
@admin_req
def a_reservas():
    est = request.args.get("estado")
    q = RES_SQL + ("WHERE r.estado=? " if est else "") + "ORDER BY r.fecha DESC,r.ini DESC LIMIT 300"
    return jsonify(fmt(rows(q, (est,) if est else ())))

TRANS = {"pendiente": ("confirmada", "cancelada"), "confirmada": ("completada", "cancelada")}
def cambiar_estado(i, nuevo, lav=None):
    """Transición de estado de una reserva. lav = restringe a un lavadero (cuentas de dueño)."""
    c = conn()
    try:
        c.execute("BEGIN IMMEDIATE")
        r = c.execute("SELECT * FROM reservas WHERE id=?", (i,)).fetchone()
        if not r or (lav and r["lavadero_id"] != lav): raise ValueError("Reserva no encontrada")
        if nuevo not in TRANS.get(r["estado"], ()): raise ValueError(f"No se puede pasar de {r['estado']} a {nuevo}")
        if nuevo == "completada":
            if pdate(r["fecha"]) > now().date(): raise ValueError("No se puede completar una reserva futura")
            c.execute("INSERT INTO lavados(cliente_id,vehiculo_id,lavadero_id,servicio_id,reserva_id,fecha,precio) VALUES(?,?,?,?,?,?,?)",
                      (r["cliente_id"], r["vehiculo_id"], r["lavadero_id"], r["servicio_id"], r["id"], r["fecha"], r["precio"]))
        c.execute("UPDATE reservas SET estado=? WHERE id=?", (nuevo, i)); c.execute("COMMIT")
    except ValueError as e:
        c.execute("ROLLBACK"); return err(str(e), 409)
    finally: c.close()
    return jsonify(ok=True)

@app.post("/api/admin/reservas/<int:i>/estado")
@admin_req
def a_estado(i):
    return cambiar_estado(i, (request.get_json(silent=True) or {}).get("estado"))

@app.get("/api/admin/lavaderos")
@admin_req
def a_lavs():
    L = rows("SELECT * FROM lavaderos ORDER BY id")
    for l in L: l["servicios"] = rows("SELECT * FROM servicios WHERE lavadero_id=? ORDER BY id", (l["id"],))
    return jsonify(L)

@app.put("/api/admin/lavaderos/<int:i>")
@admin_req
def a_upd_lav(i):
    return actualizar_lavadero(i, request.get_json(silent=True) or {})

def actualizar_lavadero(i, d, permitidos=None):
    campos = {"nombre": str, "direccion": str, "barrio": str, "zona": str, "telefono": str, "horario_txt": str, "horario_cod": str,
              "tipo": str, "vehiculos": str, "puestos": int, "lat": float, "lng": float, "activo": int, "horario_publicado": int}
    if permitidos: campos = {k: v for k, v in campos.items() if k in permitidos}
    sets, vals = [], []
    for k, t in campos.items():
        if k in d:
            try: v = t(d[k])
            except (TypeError, ValueError): return err(f"Valor inválido: {k}")
            if k == "horario_cod":
                try: parse_horario(v)
                except Exception: return err("Formato de horario inválido. Ejemplo: L-S 6-22;D 6-19.5")
            if k == "puestos" and not 1 <= v <= 30: return err("Puestos entre 1 y 30")
            sets.append(f"{k}=?"); vals.append(v)
    if not sets: return err("Nada que actualizar")
    c = conn(); c.execute(f"UPDATE lavaderos SET {','.join(sets)} WHERE id=?", (*vals, i)); c.close()
    return jsonify(ok=True)

def serv_vals(d):
    try:
        nom = str(d["nombre"]).strip()[:80]; dur = int(d["duracion_min"]); assert nom and 10 <= dur <= 480
        pr = [(int(d[k]) if d.get(k) not in (None, "") else None) for k in ("precio_auto", "precio_camioneta", "precio_suv", "precio_moto")]
        assert all(p is None or p >= 0 for p in pr) and any(pr)
    except (KeyError, ValueError, TypeError, AssertionError): return None
    return (nom, str(d.get("descripcion", ""))[:200], dur, *pr, 1 if d.get("activo", 1) else 0)

@app.post("/api/admin/lavaderos/<int:i>/servicios")
@admin_req
def a_add_serv(i):
    v = serv_vals(request.get_json(silent=True) or {})
    if not v: return err("Datos de servicio inválidos (nombre, duración 10–480 min y al menos un precio)")
    c = conn(); c.execute("INSERT INTO servicios(lavadero_id,nombre,descripcion,duracion_min,precio_auto,precio_camioneta,precio_suv,precio_moto,activo) VALUES(?,?,?,?,?,?,?,?,?)", (i, *v)); c.close()
    return jsonify(ok=True)

@app.put("/api/admin/servicios/<int:i>")
@admin_req
def a_upd_serv(i):
    v = serv_vals(request.get_json(silent=True) or {})
    if not v: return err("Datos de servicio inválidos")
    c = conn(); c.execute("UPDATE servicios SET nombre=?,descripcion=?,duracion_min=?,precio_auto=?,precio_camioneta=?,precio_suv=?,precio_moto=?,activo=? WHERE id=?", (*v, i)); c.close()
    return jsonify(ok=True)

@app.get("/api/admin/recordatorios")
@admin_req
def a_rec():
    return jsonify(rows("""SELECT r.id,r.fecha_programada,r.estado,c.nombre,c.whatsapp,v.tipo,v.placa FROM recordatorios r
        JOIN clientes c ON c.id=r.cliente_id JOIN vehiculos v ON v.id=r.vehiculo_id ORDER BY r.estado='pendiente' DESC,r.fecha_programada"""))

@app.post("/api/admin/recordatorios/generar")
@admin_req
def a_gen():
    limite = (now().date() + timedelta(days=3)).isoformat(); nuevos = 0; c = conn()
    for v in rows("SELECT id,cliente_id FROM vehiculos"):
        p = proxima_info(v["id"])["proxima_fecha"]
        if p and p <= limite:
            nuevos += c.execute("INSERT OR IGNORE INTO recordatorios(cliente_id,vehiculo_id,fecha_programada) VALUES(?,?,?)", (v["cliente_id"], v["id"], p)).rowcount
    c.close(); return jsonify(ok=True, nuevos=nuevos)

@app.post("/api/admin/recordatorios/<int:i>/estado")
@admin_req
def a_rec_estado(i):
    e = (request.get_json(silent=True) or {}).get("estado")
    if e not in ("pendiente", "enviado", "cancelado"): return err("Estado inválido")
    c = conn(); c.execute("UPDATE recordatorios SET estado=?,actualizado=? WHERE id=?", (e, now().isoformat(timespec="seconds"), i)); c.close()
    return jsonify(ok=True)

# ---------- admin: cuentas de dueños de lavaderos ----------
@app.get("/api/admin/duenos")
@admin_req
def a_duenos():
    return jsonify(rows("SELECT d.id,d.usuario,d.activo,d.creado,d.lavadero_id,l.nombre lavadero FROM duenos d JOIN lavaderos l ON l.id=d.lavadero_id ORDER BY d.id DESC"))

@app.post("/api/admin/duenos")
@admin_req
def a_add_dueno():
    d = request.get_json(silent=True) or {}
    u = str(d.get("usuario", "")).strip().lower(); pw = str(d.get("password", ""))
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", u): return err("Usuario: 3-30 caracteres (letras, números, punto, guion)")
    if len(pw) < 8: return err("La contraseña debe tener mínimo 8 caracteres")
    if not one("SELECT 1 x FROM lavaderos WHERE id=?", (d.get("lavadero_id"),)): return err("Lavadero inválido")
    c = conn()
    try: c.execute("INSERT INTO duenos(usuario,pass_hash,lavadero_id) VALUES(?,?,?)", (u, generate_password_hash(pw), int(d["lavadero_id"])))
    except sqlite3.IntegrityError: return err("Ese usuario ya existe", 409)
    finally: c.close()
    return jsonify(ok=True)

@app.put("/api/admin/duenos/<int:i>")
@admin_req
def a_upd_dueno(i):
    d = request.get_json(silent=True) or {}; c = conn()
    try:
        if d.get("password"):
            if len(str(d["password"])) < 8: return err("La contraseña debe tener mínimo 8 caracteres")
            c.execute("UPDATE duenos SET pass_hash=? WHERE id=?", (generate_password_hash(str(d["password"])), i))
        if "activo" in d: c.execute("UPDATE duenos SET activo=? WHERE id=?", (1 if d["activo"] else 0, i))
    finally: c.close()
    return jsonify(ok=True)

# ---------- panel del dueño del lavadero (solo ve y edita SU lavadero) ----------
@app.post("/api/dueno/login")
def dueno_login():
    d = request.get_json(silent=True) or {}
    if throttle("o" + request.remote_addr, 6): return err("Demasiados intentos. Espera unos minutos.", 429)
    o = one("SELECT * FROM duenos WHERE usuario=? AND activo=1", (str(d.get("usuario", "")).strip().lower(),))
    if not o or not check_password_hash(o["pass_hash"], str(d.get("password", ""))): return err("Credenciales incorrectas", 401)
    session.clear(); session.permanent = True; session["oid"] = o["id"]
    return jsonify(ok=True)

@app.get("/api/dueno/yo")
def dueno_yo():
    o = one("SELECT d.usuario,l.nombre lavadero FROM duenos d JOIN lavaderos l ON l.id=d.lavadero_id WHERE d.id=? AND d.activo=1", (session.get("oid"),)) if session.get("oid") else None
    return jsonify(dueno=o)

@app.get("/api/dueno/resumen")
@dueno_req
def dueno_resumen():
    n = lambda e: one("SELECT COUNT(*) n FROM reservas WHERE lavadero_id=? AND estado=?", (g.lav, e))["n"]
    return jsonify(pendientes=n("pendiente"), confirmadas=n("confirmada"), completadas=n("completada"),
                   lavados_mes=one("SELECT COUNT(*) n FROM lavados WHERE lavadero_id=? AND substr(fecha,1,7)=?", (g.lav, now().strftime("%Y-%m")))["n"])

@app.get("/api/dueno/reservas")
@dueno_req
def dueno_reservas():
    est = request.args.get("estado")
    q = RES_SQL + "WHERE r.lavadero_id=? " + ("AND r.estado=? " if est else "") + "ORDER BY r.fecha DESC,r.ini DESC LIMIT 300"
    return jsonify(fmt(rows(q, (g.lav, est) if est else (g.lav,))))

@app.post("/api/dueno/reservas/<int:i>/estado")
@dueno_req
def dueno_estado(i):
    return cambiar_estado(i, (request.get_json(silent=True) or {}).get("estado"), g.lav)

@app.get("/api/dueno/lavadero")
@dueno_req
def dueno_lavadero():
    l = one("SELECT * FROM lavaderos WHERE id=?", (g.lav,))
    l["servicios"] = rows("SELECT * FROM servicios WHERE lavadero_id=? ORDER BY id", (g.lav,))
    return jsonify(l)

@app.put("/api/dueno/lavadero")
@dueno_req
def dueno_upd_lavadero():
    return actualizar_lavadero(g.lav, request.get_json(silent=True) or {}, {"telefono", "horario_txt", "horario_cod", "horario_publicado", "puestos"})

@app.post("/api/dueno/servicios")
@dueno_req
def dueno_add_serv():
    v = serv_vals(request.get_json(silent=True) or {})
    if not v: return err("Datos de servicio inválidos (nombre, duración 10–480 min y al menos un precio)")
    c = conn(); c.execute("INSERT INTO servicios(lavadero_id,nombre,descripcion,duracion_min,precio_auto,precio_camioneta,precio_suv,precio_moto,activo) VALUES(?,?,?,?,?,?,?,?,?)", (g.lav, *v)); c.close()
    return jsonify(ok=True)

@app.put("/api/dueno/servicios/<int:i>")
@dueno_req
def dueno_upd_serv(i):
    v = serv_vals(request.get_json(silent=True) or {})
    if not v: return err("Datos de servicio inválidos")
    c = conn(); n = c.execute("UPDATE servicios SET nombre=?,descripcion=?,duracion_min=?,precio_auto=?,precio_camioneta=?,precio_suv=?,precio_moto=?,activo=? WHERE id=? AND lavadero_id=?", (*v, i, g.lav)).rowcount; c.close()
    return jsonify(ok=True) if n else err("Servicio no encontrado", 404)

# ---------- frontend estático ----------
@app.get("/")
def home(): return send_from_directory(FRONT, "index.html")
@app.get("/<path:p>")
def static_files(p):
    if p.startswith("api/"): return err("No encontrado", 404)
    return send_from_directory(FRONT, p)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
