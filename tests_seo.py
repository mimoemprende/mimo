"""Pruebas SEO: python tests_seo.py"""
import os, re, json, tempfile
os.environ["DATABASE_PATH"] = tempfile.mktemp(suffix=".db"); os.environ["ADMIN_PASSWORD"] = "Test-1234!"; os.environ["SECRET_KEY"] = "x"
os.environ["SITE_URL"] = "https://mimo.example"
from backend.app import app
from backend.seo import lavaderos_activos, zonas_indexables
def ok(c, m): print(("OK   " if c else "FALLO"), m); assert c, m
cl = app.test_client()
L = lavaderos_activos(); Z = zonas_indexables(L); idx = [l for l in L if l["idx"]]; no = [l for l in L if not l["idx"]]
print(f"   {len(idx)} fichas indexables, {len(no)} con noindex, {len(Z)} zonas indexables: {sorted(Z)}")

h = cl.get("/"); t = h.get_data(as_text=True)
ok(h.status_code == 200 and '<link rel="canonical" href="https://mimo.example/">' in t, "home: 200 y canonical absoluto")
ok("<!--SEO-HEAD-->" not in t and "<!--SEO-FOOT-->" not in t, "home: marcadores sustituidos")
ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', t, re.S); g = json.loads(ld.group(1))["@graph"]
ok({x["@type"] for x in g} == {"Organization", "WebSite"}, "home: JSON-LD válido (Organization + WebSite)")
ok('href="/zona/' in t, "home: enlaces rastreables a zonas sin JS")
ok(cl.get("/index.html").status_code == 301, "/index.html redirige a /")

r = cl.get("/robots.txt").get_data(as_text=True)
ok("Disallow: /api/" in r and "Sitemap: https://mimo.example/sitemap.xml" in r and "admin" not in r, "robots.txt correcto")
sm = cl.get("/sitemap.xml").get_data(as_text=True)
ok(sm.count("<loc>") == 1 + len(Z) + len(idx), "sitemap: home + zonas + fichas indexables")
ok(all(f"/lavaderos/{l['id']}-" not in sm for l in no), "sitemap: excluye fichas noindex")
ok("admin" not in sm and "#" not in sm and "/api/" not in sm, "sitemap: sin admin, hashes ni API")

l = idx[0]; u = f"/lavaderos/{l['id']}-{l['slug']}"; f = cl.get(u); t = f.get_data(as_text=True)
ok(f.status_code == 200 and f'rel="canonical" href="https://mimo.example{u}"' in t, "ficha: 200 y canonical")
ok(t.count("<h1") == 1 and "index,follow" in t, "ficha: un solo H1 e indexable")
for blk in re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S): json.loads(blk)
ok("price" not in t.split("application/ld+json")[1], "ficha: JSON-LD sin precios/reseñas inventadas")
ok(cl.get(f"/lavaderos/{l['id']}").status_code == 301, "ficha sin slug -> 301 a la canónica")
ok(cl.get(f"/lavaderos/{l['id']}-slug-incorrecto").status_code == 301, "slug incorrecto -> 301")
ok(cl.get("/lavaderos/99999-x").status_code == 404, "ficha inexistente -> 404 real")
if no:
    n = no[0]; t = cl.get(f"/lavaderos/{n['id']}-{n['slug']}").get_data(as_text=True)
    ok("noindex,follow" in t, f"ficha pobre (id {n['id']}) lleva noindex")
z = sorted(Z)[0]; zr = cl.get("/zona/" + z.lower().replace(" / ", "-").replace(" ", "-"))
ok(zr.status_code == 200 and "<h1" in zr.get_data(as_text=True), "página de zona: 200")
ok(cl.get("/zona/no-existe").status_code == 404, "zona inexistente -> 404")
e = cl.get("/ruta-que-no-existe"); ok(e.status_code == 404 and "noindex" in e.get_data(as_text=True), "404 real (antes devolvía 200 con la home)")
ok(cl.get("/api/zonas").headers.get("X-Robots-Tag") == "noindex, nofollow", "API con X-Robots-Tag noindex")
ok(cl.get("/admin.html").headers.get("X-Robots-Tag") == "noindex, nofollow", "admin.html con X-Robots-Tag noindex")
ok("max-age" in cl.get("/js/app.js").headers.get("Cache-Control", ""), "caché en JS/CSS")
ok(cl.get("/api/lavaderos").get_json()[0].get("slug"), "API de listado incluye slug")
print("\nPRUEBAS SEO OK")
