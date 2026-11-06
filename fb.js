// Connexion Firebase (Google + Firestore hors ligne) exposée à l'application sous la même forme que l'ancienne base Claude.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, updateDoc, getDoc,
  getDocFromServer, getDocsFromServer, getDocs, query, where, orderBy, limit, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const gate = document.getElementById("gate"), gmsg = document.getElementById("gmsg");
const say = t => { if (gmsg) gmsg.textContent = t; };
const errCode = e => (e && e.code === "permission-denied") ? Object.assign(new Error("Accès refusé"), { code: "invalid_argument" }) : e;
// une écriture est gardée par Firestore sur le téléphone (même hors connexion) : on n'attend la confirmation du serveur que 2,5 s
const soft = p => Promise.race([p.catch(e => { throw errCode(e); }), new Promise(r => setTimeout(r, 2500))]);

function wrapQuery(q) {
  return { onSnapshot: (cb, onErr) => onSnapshot(q, s => cb({ docs: s.docs, docChanges: () => s.docChanges() }), e => onErr && onErr(e)) };
}
function coll(name) {
  const c = collection(fs, name);
  return {
    doc: id => { const ref = id ? doc(c, id) : doc(c); return { id: ref.id, set: data => soft(setDoc(ref, data)), update: data => soft(updateDoc(ref, data)) }; },
    where: (f, op, v) => wrapQuery(query(c, where(f, op, v))),
    orderBy: (f, dir) => ({ limit: n => wrapQuery(query(c, orderBy(f, dir || "asc"), limit(n))) }),
  };
}
const NAMES = {};
async function loadNames() {
  try { (await getDocs(collection(fs, "users"))).forEach(d => { NAMES[d.id] = d.data().name || d.id; }); } catch (e) {}
}
const toDataUrl = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(""); fr.readAsDataURL(b); });
async function smallPhoto(blob) {
  try {
    const img = await createImageBitmap(blob); const s = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.7, 0.55, 0.4]) { const u = c.toDataURL("image/jpeg", q); if (u.length < 600000) return u; }
  } catch (e) {}
  const u = await toDataUrl(blob); return u.length < 900000 ? u : "";
}
function caps(u) {
  return {
    db: { collection: coll },
    user: { id: async () => u.email, can: async () => true,
            profiles: async ids => Object.fromEntries(ids.map(id => [id, { name: NAMES[id] || (String(id).startsWith("u_") ? "historique Claude" : String(id).split("@")[0]) }])) },
    assets: { upload: async blob => ({ id: null, url: await smallPhoto(blob) }) },
    downloads: { save: async ({ filename, data }) => {
      const url = URL.createObjectURL(data); const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } },
  };
}
// reprise unique des pointages faits dans l'ancienne application Claude
async function seedOnce() {
  try {
    const m = await getDocFromServer(doc(fs, "meta", "seed"));
    if (m.exists()) return;
    const seed = await (await fetch("seed_pointages.json", { cache: "no-store" })).json();
    const have = new Set((await getDocsFromServer(collection(fs, "pointages"))).docs.map(d => d.id));
    let b = writeBatch(fs), n = 0, added = 0;
    for (const d of seed) {
      if (have.has(d.code)) continue;
      b.set(doc(fs, "pointages", d.code), d); n++; added++;
      if (n >= 400) { await b.commit(); b = writeBatch(fs); n = 0; }
    }
    b.set(doc(fs, "meta", "seed"), { at: new Date().toISOString(), by: auth.currentUser.email, count: added });
    await b.commit();
    console.log("historique repris :", added);
  } catch (e) { console.warn("reprise de l'historique reportée", e && e.code); }
}
let started = false;
async function start(u) {
  // compte autorisé ? (les règles Firestore n'acceptent que les adresses listées)
  try { await getDoc(doc(fs, "meta", "seed")); }
  catch (e) {
    if (e && e.code === "permission-denied") {
      say(`Le compte ${u.email} n'est pas autorisé. Demandez au responsable de l'ajouter, ou connectez-vous avec un autre compte.`);
      document.getElementById("gout").hidden = false; return;
    }
  }
  if (started) return; started = true;
  gate.hidden = true;
  setDoc(doc(fs, "users", u.email), { name: u.displayName || u.email, at: new Date().toISOString() }, { merge: true }).catch(() => {});
  await loadNames();
  seedOnce();
  const acct = document.getElementById("acct"); if (acct) acct.textContent = "Connecté : " + (u.displayName ? u.displayName + " · " : "") + u.email;
  window.__fbResolve({ use: async n => { const c = caps(u)[n]; if (!c) throw new Error("indisponible"); return c; } });
}
onAuthStateChanged(auth, u => {
  if (u) { say("Connexion…"); start(u); }
  else { gate.hidden = false; say(navigator.onLine === false ? "Première connexion : il faut du réseau une seule fois." : ""); }
});
document.getElementById("gin").onclick = async () => {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return signInWithRedirect(auth, p);
    say("Connexion impossible : " + (e && e.code ? e.code : "erreur") + (e && e.code === "auth/unauthorized-domain" ? " — ajoutez ce domaine dans Firebase › Authentication › Domaines autorisés." : ""));
  }
};
const out = () => signOut(auth).then(() => location.reload());
document.getElementById("gout").onclick = out;
const so = document.getElementById("signout"); if (so) so.onclick = out;
