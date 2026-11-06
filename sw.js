// Fonctionnement hors connexion : l'application, le modèle Excel, les plans et les bibliothèques restent sur le téléphone.
const V = "pointage-573336045f";
const PRECACHE = ["./", "./index.html", "./fb.js", "./firebase-config.js", "./modele_classeur.b64.txt", "./seed_pointages.json", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./plans/plan_R1.jpg", "./plans/plan_R2.jpg", "./plans/plan_SS1.jpg", "./plans/plan_RDC.jpg"];
const HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const EXT_CORS = [FB + "firebase-app.js", FB + "firebase-auth.js", FB + "firebase-firestore.js"];
const EXT_NC = ["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(async c => {
  await c.addAll(PRECACHE);
  await Promise.all([...EXT_CORS.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r)).catch(() => {})),
                     ...EXT_NC.map(u => fetch(u, { mode: "no-cors" }).then(r => c.put(u, r)).catch(() => {}))]);
}).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  const same = u.origin === location.origin, lib = HOSTS.includes(u.hostname);
  if (!same && !lib) return;                                  // Firebase (base, connexion) : jamais mis en cache
  if (same && u.pathname.endsWith("seed_pointages.json")) return;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(r, { ignoreSearch: same });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === "opaque")) c.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }             // réponse immédiate depuis le téléphone, mise à jour en arrière-plan
    const res = await net; return res || (same && r.mode === "navigate" ? c.match("./index.html") : Response.error());
  }));
});
