/* Adaptateur Firebase : connexion avec le compte Google UVCI et base Firestore (hors ligne). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, where, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let app, auth, fs;
const ERR = e => ({ code: e?.code==="permission-denied" ? "invalid_argument" : (e?.code==="unavailable"||e?.code==="failed-precondition") ? "unavailable" : (e?.code||"unavailable"), message: e?.message||"" });

/* Aperçu « voir comme » : aucune écriture n'est envoyée au serveur */
const lectureSeule = () => { try { return !!sessionStorage.getItem("cvpb-apercu"); } catch(e){ return false; } };
const REFUS = () => Promise.reject({ code: "apercu", message: "Aperçu en lecture seule : aucune modification n'est enregistrée." });
/* Une écriture hors ligne reste en attente côté serveur : on la considère enregistrée localement. */
const ecrire = p => new Promise((res, rej) => {
  let fini = false;
  p.then(() => { fini = true; res(); }, e => { fini = true; rej(ERR(e)); });
  setTimeout(() => { if (!fini && !navigator.onLine) res({ horsLigne: true }); }, 2500);
});
/* update() fusionne les objets imbriqués champ par champ (rapports.R1.suivi…) au lieu d'écraser la carte entière. */
function aplatir(o, pre = "", out = {}){
  for (const [k, v] of Object.entries(o)){
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length) aplatir(v, key, out); else out[key] = v;
  }
  return out;
}
const snapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const snapQ = s => ({ docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data(), metadata: d.metadata })), size: s.size, empty: s.empty, metadata: s.metadata, docChanges: () => s.docChanges() });
function dref(ref){
  return {
    id: ref.id, path: ref.path,
    get: async () => { try { return snapDoc(await getDoc(ref)); } catch(e){ throw ERR(e); } },
    set: d => lectureSeule() ? REFUS() : ecrire(setDoc(ref, d)),
    update: d => lectureSeule() ? REFUS() : ecrire(updateDoc(ref, aplatir(d))),
    delete: () => lectureSeule() ? REFUS() : ecrire(deleteDoc(ref)),
    onSnapshot: (n, e) => onSnapshot(ref, s => n(snapDoc(s)), x => e && e(ERR(x))),
    collection: p => qref(collection(ref, p), collection(ref, p))
  };
}
function qref(q, col){
  const o = {
    orderBy: (f, d) => qref(query(q, orderBy(f, d||"asc")), col),
    limit: n => qref(query(q, limit(n)), col),
    where: (f, op, v) => qref(query(q, where(f, op, v)), col),
    get: async () => { try { return snapQ(await getDocs(q)); } catch(e){ throw ERR(e); } },
    onSnapshot: (n, e) => onSnapshot(q, s => n(snapQ(s)), x => e && e(ERR(x)))
  };
  if (col){ o.path = col.path; o.doc = id => dref(id ? doc(col, id) : doc(col)); o.add = async d => { if (lectureSeule()) return REFUS(); const r = doc(col); await ecrire(setDoc(r, d)); return dref(r); }; }
  return o;
}

export function demarrer(config){
  app = initializeApp(config);
  auth = getAuth(app);
  auth.languageCode = "fr";
  try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch(e){ fs = initializeFirestore(app, {}); }
  const db = {
    collection: p => { const c = collection(fs, p); return qref(c, c); },
    doc: p => dref(doc(fs, p)),
    /* Écritures groupées (tout ou rien), 450 par lot */
    lots: async ops => {
      if (lectureSeule()) return REFUS();
      for (let i = 0; i < ops.length; i += 450){
        const b = writeBatch(fs);
        for (const o of ops.slice(i, i+450)) b.set(doc(fs, o.path), o.data);
        try { await b.commit(); } catch(e){ throw ERR(e); }
      }
    },
    /* Numérotation séquentielle sûre (ENC-0001…) : nécessite une connexion */
    numeroter: async (colPath, prefixe, depart, fabrique) => {
      if (lectureSeule()) return REFUS();
      if (!navigator.onLine) throw { code: "hors_ligne" };
      try {
        return await runTransaction(fs, async t => {
          for (let n = depart; n < depart + 30; n++){
            const id = prefixe + String(n).padStart(4, "0"), ref = doc(fs, colPath, id);
            if (!(await t.get(ref)).exists()){ t.set(ref, fabrique(id)); return id; }
          }
          throw { code: "unavailable" };
        });
      } catch(e){ throw e.code === "hors_ligne" ? e : ERR(e); }
    }
  };
  const fournisseur = () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ hd: config.domaine || "uvci.edu.ci", prompt: "select_account" });
    return p;
  };
  const compte = {
    surChangement: cb => onAuthStateChanged(auth, cb),
    /* Fenêtre Google ; si le téléphone la bloque, on passe par une redirection */
    connexionGoogle: async () => {
      try { await signInWithPopup(auth, fournisseur()); }
      catch(e){
        if (["auth/popup-blocked","auth/operation-not-supported-in-this-environment","auth/cancelled-popup-request"].includes(e?.code)) await signInWithRedirect(auth, fournisseur());
        else throw e;
      }
    },
    retourRedirection: () => getRedirectResult(auth).catch(e => { throw e; }),
    deconnexion: () => signOut(auth),
    actuel: () => auth.currentUser
  };
  return { db, compte };
}
