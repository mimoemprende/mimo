"""Capa SEO de MIMO: páginas públicas renderizadas en el servidor, sitemap.xml y robots.txt.

Todo se deriva de la base de datos real (lavaderos/servicios activos). No inventa datos:
sin reseñas, sin coordenadas, sin precios en datos estructurados (los precios son de referencia).
"""
import os, re, json, unicodedata
from flask import Blueprint, render_template, request, redirect, abort, Response
from .db import conn

bp = Blueprint("seo", __name__, template_folder="templates")
FRONT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
MIN_ZONA = 3   # una página de zona solo se indexa si tiene >= N lavaderos indexables (evita páginas vacías)

ZONA_TXT = {"Centro": "el Centro", "Rodadero": "El Rodadero", "Gaira": "Gaira", "Bastidas": "Bastidas",
            "Comuna 1": "la Comuna 1", "Comuna 2": "la Comuna 2", "Comuna 4": "la Comuna 4",
            "Sur": "el sur", "Oriente": "el oriente", "Troncal / Minca": "la Troncal y Minca", "Taganga": "Taganga"}

def site_url():
    u = os.environ.get("SITE_URL", "").strip().rstrip("/")
    return u or request.url_root.rstrip("/")

def slugify(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:70] or "lavadero"

def slug_lav(l): return slugify(l["nombre"])
def zona_txt(z): return ZONA_TXT.get(z, z)

def indexable(l):
    """Una ficha solo se indexa si tiene datos propios suficientes (dirección real + teléfono u horario publicado)."""
    txt = ((l["nombre"] or "") + " " + (l["direccion"] or "")).lower()
    if "sin direcci" in txt or "sin nombre" in txt or not (l["direccion"] or "").strip(): return False
    return bool(l["telefono"] or l["horario_publicado"])

def _rows(q, a=()):
    c = conn()
    try: return [dict(r) for r in c.execute(q, a).fetchall()]
    finally: c.close()

def lavaderos_activos():
    L = _rows("SELECT * FROM lavaderos WHERE activo=1 ORDER BY nombre COLLATE NOCASE")
    for l in L: l["slug"] = slug_lav(l); l["idx"] = indexable(l)
    return L

def zonas_indexables(L):
    out = {}
    for l in L:
        if l["idx"]: out.setdefault(l["zona"], []).append(l)
    return {z: v for z, v in out.items() if len(v) >= MIN_ZONA}

def js(obj):  # JSON-LD seguro dentro de <script>
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")

ORG = lambda base: {"@type": "Organization", "@id": base + "/#org", "name": "MIMO", "url": base + "/",
                    "logo": base + "/assets/imagotipo.jpeg"}
def crumbs(base, items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": base + u} for i, (n, u) in enumerate(items)]}

def autowash(base, l, url):
    """Marcado de negocio de terceros: SOLO si SEO_LOCALBUSINESS=1 y el propietario verificó los datos del listado."""
    d = {"@type": "AutoWash", "name": l["nombre"], "url": url,
         "address": {"@type": "PostalAddress", "streetAddress": l["direccion"], "addressLocality": "Santa Marta",
                     "addressRegion": "Magdalena", "addressCountry": "CO"}}
    if l["telefono"]: d["telephone"] = l["telefono"]
    return d

# ---------- páginas ----------
HEAD_MARK = "<!--SEO-HEAD-->"; FOOT_MARK = "<!--SEO-FOOT-->"

@bp.get("/")
def home():
    base = site_url(); L = lavaderos_activos(); Z = zonas_indexables(L)
    head = (f'<link rel="canonical" href="{base}/">'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="MIMO">'
            f'<meta property="og:locale" content="es_CO"><meta property="og:url" content="{base}/">'
            f'<meta property="og:title" content="MIMO · Reserva tu lavadero en Santa Marta">'
            f'<meta property="og:description" content="Encuentra, compara y reserva lavaderos de autos en Santa Marta. Recordatorios de tu próximo lavado.">'
            f'<meta property="og:image" content="{base}/assets/imagotipo.jpeg"><meta property="og:image:width" content="1600"><meta property="og:image:height" content="1600">'
            f'<meta name="twitter:card" content="summary">'
            f'<script type="application/ld+json">{js({"@context": "https://schema.org", "@graph": [ORG(base), {"@type": "WebSite", "@id": base + "/#web", "url": base + "/", "name": "MIMO", "inLanguage": "es-CO", "publisher": {"@id": base + "/#org"}}]})}</script>')
    foot = ('<nav aria-label="Lavaderos por zona"><b>Lavaderos por zona:</b> ' +
            " · ".join(f'<a href="/zona/{slugify(z)}">{z}</a>' for z in sorted(Z)) + "</nav>") if Z else ""
    with open(os.path.join(FRONT, "index.html"), encoding="utf-8") as f: html = f.read()
    r = Response(html.replace(HEAD_MARK, head).replace(FOOT_MARK, foot), mimetype="text/html")
    r.headers["Cache-Control"] = "public, max-age=300"; return r

@bp.get("/lavaderos/<int:lid>")
def ficha_sin_slug(lid):
    l = next((x for x in lavaderos_activos() if x["id"] == lid), None)
    if not l: abort(404)
    return redirect(f"/lavaderos/{lid}-{l['slug']}", 301)

@bp.get("/lavaderos/<int:lid>-<slug>")
def ficha(lid, slug):
    base = site_url(); L = lavaderos_activos()
    l = next((x for x in L if x["id"] == lid), None)
    if not l: abort(404)
    if slug != l["slug"]: return redirect(f"/lavaderos/{lid}-{l['slug']}", 301)   # una sola URL canónica
    S = _rows("SELECT * FROM servicios WHERE lavadero_id=? AND activo=1 ORDER BY duracion_min", (lid,))
    Z = zonas_indexables(L); url = f"{base}/lavaderos/{lid}-{l['slug']}"
    graph = [crumbs(base, [("Inicio", "/")] + ([(f"Lavaderos en {zona_txt(l['zona'])}", f"/zona/{slugify(l['zona'])}")] if l["zona"] in Z else []) + [(l["nombre"], f"/lavaderos/{lid}-{l['slug']}")])]
    if l["idx"] and os.environ.get("SEO_LOCALBUSINESS") == "1": graph.append(autowash(base, l, url))
    otros = [x for x in L if x["zona"] == l["zona"] and x["idx"] and x["id"] != lid][:6]
    desc = f"{l['nombre']}: dirección, horario y servicios de este lavadero en {l['barrio'] or l['zona']}, Santa Marta. Reserva en MIMO."
    if len(desc) > 158: desc = desc[:158].rsplit(" ", 1)[0] + "…"
    return render_template("ficha.html", base=base, l=l, S=S, url=url, desc=desc, otros=otros, zonas=Z, slugify=slugify,
                           zona_txt=zona_txt, ld=js({"@context": "https://schema.org", "@graph": graph}),
                           zona_idx=l["zona"] in Z, atiende=("carros" if "C" in l["vehiculos"] else "") + (" y " if "C" in l["vehiculos"] and "M" in l["vehiculos"] else "") + ("motos" if "M" in l["vehiculos"] else ""))

@bp.get("/zona/<slug>")
def zona(slug):
    base = site_url(); L = lavaderos_activos(); Z = zonas_indexables(L)
    z = next((k for k in Z if slugify(k) == slug), None)
    if not z: abort(404)
    items = Z[z]; url = f"{base}/zona/{slug}"
    srv = sorted({s["nombre"] for s in _rows("SELECT DISTINCT nombre FROM servicios WHERE activo=1 AND lavadero_id IN (%s)" % ",".join("?" * len(items)), [x["id"] for x in items])})
    ld = js({"@context": "https://schema.org", "@graph": [crumbs(base, [("Inicio", "/"), (f"Lavaderos en {zona_txt(z)}", f"/zona/{slug}")]),
             {"@type": "CollectionPage", "name": f"Lavaderos de carros en {zona_txt(z)}, Santa Marta", "url": url, "inLanguage": "es-CO"}]})
    return render_template("zona.html", base=base, z=z, zt=zona_txt(z), items=items, srv=srv, url=url, zonas=Z, slugify=slugify, ld=ld,
                           desc=f"{len(items)} lavaderos de vehículos en {zona_txt(z)}, Santa Marta: direcciones, horarios y servicios. Compara y reserva en MIMO.")

# ---------- robots y sitemap ----------
@bp.get("/robots.txt")
def robots():
    body = f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {site_url()}/sitemap.xml\n"
    return Response(body, mimetype="text/plain")

@bp.get("/sitemap.xml")
def sitemap():
    base = site_url(); L = lavaderos_activos(); Z = zonas_indexables(L)
    urls = [base + "/"] + [f"{base}/zona/{slugify(z)}" for z in sorted(Z)] + [f"{base}/lavaderos/{l['id']}-{l['slug']}" for l in L if l["idx"]]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
          "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n"   # sin lastmod: no hay fecha de edición confiable
    r = Response(xml, mimetype="application/xml"); r.headers["Cache-Control"] = "public, max-age=3600"; return r
