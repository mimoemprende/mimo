const API = {
  async call(method, path, body) {
    let r;
    try {
      r = await fetch((window.MIMO_API || "") + "/api" + path, {
        method, credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error("Sin conexión con el servidor"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "Error inesperado"); e.status = r.status; throw e; }
    return d;
  },
  get: (p) => API.call("GET", p), post: (p, b) => API.call("POST", p, b || {}), put: (p, b) => API.call("PUT", p, b),
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COP = (n) => n == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const VEH = { auto: "Automóvil", camioneta: "Camioneta", suv: "SUV", moto: "Moto" };
const fechaLarga = (f) => f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Colombia (UTC-5)
const mapsUrl = (l) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${l.nombre} ${l.direccion} Santa Marta Colombia`);
