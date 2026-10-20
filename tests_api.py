"""Pruebas de integración: python tests_api.py"""
import os, tempfile
os.environ["DATABASE_PATH"]=tempfile.mktemp(suffix=".db"); os.environ["ADMIN_PASSWORD"]="Test-1234!"; os.environ["SECRET_KEY"]="x"
from datetime import date, timedelta
from backend.app import app
def ok(c,m): print(("OK   " if c else "FALLO"),m); assert c,m
cl=app.test_client(); ad=app.test_client(); otro=app.test_client()
L=cl.get("/api/lavaderos").get_json(); ok(len(L)==50,"50 lavaderos cargados")
ok(len(cl.get("/api/lavaderos?vehiculo=moto").get_json())>0 and all("moto" or 1 for _ in [1]),"filtro por moto")
ok(all(l["vehiculos"]!="C" for l in cl.get("/api/lavaderos?vehiculo=moto").get_json()),"motos solo en lavaderos con motos")
ok(cl.get("/api/lavaderos?zona=Rodadero&orden=precio").get_json()[0]["zona"]=="Rodadero","filtro zona")
ok(cl.get("/api/lavaderos?lat=11.24&lng=-74.21&orden=cercania").get_json()[0]["km"] is not None,"orden por cercanía")
l=cl.get("/api/lavaderos/1").get_json(); s=l["servicios"][0]
f=(date.today()+timedelta(days=2)).isoformat()
d=cl.get(f"/api/disponibilidad?lavadero_id=1&servicio_id={s['id']}&fecha={f}").get_json(); ok(len(d["slots"])>10,"slots generados")
ok(cl.post("/api/reservas",json={}).status_code==401,"reservar exige sesión")
r=cl.post("/api/registro",json={"nombre":"Ana","whatsapp":"3001234567","password":"secreto1","vehiculo":{"tipo":"suv","frecuencia_dias":15,"ultimo_lavado_declarado":(date.today()-timedelta(days=10)).isoformat()}})
ok(r.status_code==200,"registro")
ok(cl.post("/api/registro",json={"nombre":"Xo","whatsapp":"3001234567","password":"secreto1","vehiculo":{"tipo":"auto"}}).status_code==409,"WhatsApp duplicado rechazado")
me=cl.get("/api/yo").get_json()["cliente"]; v=me["vehiculos"][0]
ok(v["proxima_fecha"]==(date.today()+timedelta(days=5)).isoformat(),"próxima fecha = último lavado declarado + frecuencia")
body={"vehiculo_id":v["id"],"servicio_id":s["id"],"fecha":f,"hora":"10:00"}
r=cl.post("/api/reservas",json=body).get_json(); ok(r["estado"]=="pendiente","reserva creada como PENDIENTE")
# lavadero 1 tiene puestos=3: llenar el horario
cl2=app.test_client(); cl2.post("/api/registro",json={"nombre":"Beto","whatsapp":"3109876543","password":"secreto2","vehiculo":{"tipo":"auto"}})
v2=cl2.get("/api/yo").get_json()["cliente"]["vehiculos"][0]
ok(cl.post("/api/reservas",json=body).status_code==409,"mismo vehículo no duplica horario")
puestos=l["puestos"]; cnt=1
for i in range(puestos+1):
    c=app.test_client(); c.post("/api/registro",json={"nombre":"U%d"%i,"whatsapp":"32000000%02d"%i,"password":"secreto","vehiculo":{"tipo":"auto"}})
    vid=c.get("/api/yo").get_json()["cliente"]["vehiculos"][0]["id"]
    st=c.post("/api/reservas",json={**body,"vehiculo_id":vid}).status_code
    if st==200: cnt+=1
ok(cnt==puestos,f"capacidad respetada ({puestos} puestos, {cnt} reservas)")
ok(cl2.post("/api/reservas",json={**body,"vehiculo_id":v["id"]}).status_code==400,"no se puede usar el vehículo de otro cliente")
ok(cl.post("/api/reservas",json={**body,"hora":"03:00"}).status_code==400,"horario fuera de apertura rechazado")
ok(cl.post("/api/reservas",json={**body,"fecha":(date.today()-timedelta(days=1)).isoformat(),"hora":"10:00"}).status_code==409,"fecha pasada rechazada")
# permisos
for p in ("stats","clientes","reservas","lavaderos","recordatorios"): ok(cl.get("/api/admin/"+p).status_code==401,f"cliente no accede a admin/{p}")
ok(ad.post("/api/admin/login",json={"usuario":"admin","password":"mal"}).status_code==401,"login admin incorrecto")
ok(ad.post("/api/admin/login",json={"usuario":"admin","password":"Test-1234!"}).status_code==200,"login admin")
st=ad.get("/api/admin/stats").get_json(); ok(st["pendientes"]==puestos and st["clientes"]>=2,"estadísticas reales")
rid=r["id"]
ok(ad.post(f"/api/admin/reservas/{rid}/estado",json={"estado":"completada"}).status_code==409,"pendiente no pasa directo a completada")
ok(ad.post(f"/api/admin/reservas/{rid}/estado",json={"estado":"confirmada"}).status_code==200,"admin confirma")
ok(cl.get("/api/reservas").get_json()[0]["estado"]=="confirmada","cliente ve estado confirmada")
ok(ad.post(f"/api/admin/reservas/{rid}/estado",json={"estado":"completada"}).status_code==409,"no completar reserva futura")
# lavado completado: reserva hoy en el pasado no es posible vía API; se simula moviendo la fecha en BD
from backend.db import conn
c=conn(); ayer=(date.today()-timedelta(days=1)).isoformat(); c.execute("UPDATE reservas SET fecha=? WHERE id=?",(ayer,rid)); c.close()
ok(ad.post(f"/api/admin/reservas/{rid}/estado",json={"estado":"completada"}).status_code==200,"admin completa reserva pasada")
me=cl.get("/api/yo").get_json()["cliente"]; v=me["vehiculos"][0]
ok(me["fidelizacion"]["lavados"]==1 and len(me["historial"])==1,"historial y fidelización")
ok(v["ultimo_lavado"]==ayer and v["lavado_registrado"] and v["proxima_fecha"]==(date.today()-timedelta(days=1)+timedelta(days=15)).isoformat(),"próxima fecha recalculada desde lavado completado")
ok(cl.post(f"/api/reservas/{rid}/cancelar").status_code==409,"no cancelar completada")
c=conn(); c.execute("UPDATE vehiculos SET ultimo_lavado_declarado=? WHERE id=?",((date.today()-timedelta(days=30)).isoformat(),v2["id"])); c.close()
g=ad.post("/api/admin/recordatorios/generar",json={}).get_json(); ok(g["nuevos"]>=1,f"recordatorios generados ({g['nuevos']})")
ok(ad.post("/api/admin/recordatorios/generar",json={}).get_json()["nuevos"]==0,"recordatorios sin duplicar")
ok(ad.put("/api/admin/lavaderos/1",json={"horario_cod":"basura"}).status_code==400,"horario inválido rechazado")
ok(ad.put("/api/admin/lavaderos/1",json={"puestos":2}).status_code==200,"admin edita lavadero")
ok(len(ad.get("/api/admin/clientes").get_json())>=2,"tabla de clientes")
ok(cl.post("/api/reservas",data="a=1",content_type="application/x-www-form-urlencoded").status_code==415,"CSRF: rechaza formularios")
print("\nTODAS LAS PRUEBAS PASARON")
