import { demarrer } from "./fb.js";
import { firebaseConfig } from "./firebase-config.js";

/*CALC-START*/
/* ======== Référentiels et calculs (fonctions pures) ======== */
const TOUS = ["encaissement","caisse","tresorerie","formation","pedagogie"];
const ROLES = {
  president:{l:"Présidence", perms:["*"], partage:"Propriétaire"},
  encaissement:{l:"Responsable des encaissements", perms:["fin.voir","enc.saisir","enc.annuler","etu.gerer","tel.voir","depot.declarer","export"], partage:"Éditeur"},
  caisse:{l:"Responsable de la caisse", perms:["fin.voir","depot.valider","op.saisir","export"], partage:"Éditeur"},
  tresorerie:{l:"Trésorerie (contrôle)", perms:["fin.voir","tel.voir","export"], partage:"Éditeur"},
  formation:{l:"Commission Formation (suivi des tuteurs)", perms:["peda.voir","peda.saisir","tut.voir","tut.suivre","export"], partage:"Éditeur"},
  pedagogie:{l:"Formateur de l'Académie", perms:["peda.voir","peda.saisir"], partage:"Contributeur"},
  tuteur:{l:"Tuteur", perms:["tut.saisir"], partage:"Contributeur"}
};
const SPECS_FORM = ["IAN-BD : Informatique et Sciences du Numérique – Bases de Données","IAN-RSI : Informatique et Sciences du Numérique – Réseaux et Sécurité Informatique","IAN-MMX : Informatique et Sciences du Numérique – Multimédia et Arts Numériques","HSN-COM : Humanités et Sciences Numériques – Communication Digitale","GEN-CMD : Gestion, Économie et Numérique – E-commerce et Marketing Digital","ADN-ATD : Administration et Droit du Numérique – E-Administration et Transformations","IAN-STG : Sciences Géospatiales (Géomatique)"];
const TYPES_ACT = ["Séance de tutorat académique","Révision de cours","Exercices et travaux pratiques","Assistance aux plateformes pédagogiques","Accompagnement individuel","Préparation aux évaluations","Atelier pratique"];
const NATURES_DIF = ["Absences répétées","Difficultés de compréhension","Difficultés d’utilisation des plateformes pédagogiques","Manque de matériel ou de ressources","Problèmes de connexion","Faible motivation ou participation","Difficultés d’organisation du travail"];
const PARTICIPATION = {1:"Faible",2:"Moyen",3:"Satisfaisant",4:"Très satisfaisant",5:"Excellent"};

/* Rapports de tutorat : un document par tuteur, rapports indexés par identifiant */
function statsTutorat(docs, comptes, today){
  const L = [];
  for (const d of docs) for (const [id,r] of Object.entries(d.rapports||{})) L.push({...r, id, doc:d.id, tuteurNom: r.tuteurNom || d.tuteurNom || ""});
  L.sort((a,b)=>String(b.dateActivite||b.deposeLe).localeCompare(String(a.dateActivite||a.deposeLe)));
  const jour = r => String(r.dateActivite||r.deposeLe||"").slice(0,10);
  const parTuteur = {};
  for (const r of L){ const t = (parTuteur[normNom(r.tuteurNom)] ||= {doc:normNom(r.tuteurNom), nom:r.tuteurNom, n:0, att:0, pres:0, partSum:0, dernier:null, prochaine:null, interventions:0}); t.n++; t.att += Number(r.attendus)||0; t.pres += Number(r.presents)||0; t.partSum += Number(r.participation)||0; if (!t.dernier || jour(r) > t.dernier) t.dernier = jour(r); if (r.prochaineSeance && (!t.prochaine || r.prochaineSeance > t.prochaine)) t.prochaine = r.prochaineSeance; if (r.intervention==="Oui") t.interventions++; }
  const tutComptes = new Set(Object.values(comptes||{}).filter(c=>c.role==="tuteur" && c.actif!==false).map(c=>normNom(c.nom)));
  for (const c of Object.values(comptes||{})) if (c.role==="tuteur" && c.actif!==false && !parTuteur[normNom(c.nom)]) parTuteur[normNom(c.nom)] = {doc:normNom(c.nom), nom:c.nom, n:0, att:0, pres:0, partSum:0, dernier:null, prochaine:null, interventions:0};
  for (const t of Object.values(parTuteur)){ t.taux = t.att ? t.pres/t.att : null; t.partMoy = t.n ? t.partSum/t.n : null; t.joursSans = t.dernier ? joursEntre(t.dernier, today) : null; t.compte = tutComptes.has(t.doc); }
  const il30 = isoD(new Date(parseD(today).getTime()-30*86400000));
  const recents = L.filter(r=>jour(r) >= il30);
  const att = recents.reduce((a,r)=>a+(Number(r.attendus)||0),0), pres = recents.reduce((a,r)=>a+(Number(r.presents)||0),0);
  const A = [];
  const aTraiter = L.filter(r=>r.intervention==="Oui" && (r.suivi?.statut||"Nouveau")!=="Traité");
  if (aTraiter.length) A.push({niv:"bad", titre:`${aTraiter.length} demande(s) d'intervention des tuteurs`, detail:aTraiter.slice(0,3).map(r=>`${r.tuteurNom} : ${r.interventionDetail||r.theme}`).join(" · "), pour:["president","formation","bureau"], lien:"#tutorat"});
  const nouveaux = L.filter(r=>(r.suivi?.statut||"Nouveau")==="Nouveau");
  if (nouveaux.length) A.push({niv:"info", titre:`${nouveaux.length} rapport(s) de tutorat non lu(s)`, detail:[...new Set(nouveaux.map(r=>r.tuteurNom))].slice(0,4).join(", "), pour:["president","formation"], lien:"#tutorat"});
  const silencieux = Object.values(parTuteur).filter(t=>t.compte && (t.joursSans==null || t.joursSans > 10));
  if (silencieux.length) A.push({niv:"warn", titre:`${silencieux.length} tuteur(s) sans rapport depuis plus de 10 jours`, detail:silencieux.map(t=>t.nom).join(", "), pour:["president","formation"], lien:"#tutorat"});
  const faibles = Object.values(parTuteur).filter(t=>t.n && t.taux!=null && t.taux < 0.5);
  if (faibles.length) A.push({niv:"warn", titre:"Présence faible aux séances de tutorat", detail:faibles.map(t=>`${t.nom} : ${Math.round(t.taux*100)} %`).join(" · "), pour:["president","formation","bureau"], lien:"#tutorat"});
  return {rapports:L, parTuteur, recents, tauxRecents: att ? pres/att : null, aTraiter, nouveaux, alertes:A};
}
const NATURES = ["Inscription (T-shirt inclus)","Cotisation mensuelle","Vente de T-shirt (hors inscription)","Don / Sponsoring","Participation à une activité","Autre recette"];
const N_INSC = NATURES[0], N_COTI = NATURES[1];
const PARAM_DEFAUT = {
  annee:"2026-2027", prefixe:"CVPB-26-",
  tshirt:5000, inscription:7000, mensualite:5000,
  soldeOuverture:0, dateReference:"",
  seuils:{soldeMin:10000, plafondEspeces:100000, approbation:20000, delaiDepot:14, delaiValidation:2},
  noteMin:10, assiduiteMin:0.75,
  mois:[], formations:[], specialites:[],
  modes:["Espèces","Wave","Orange Money","MTN MoMo","Moov Money","Virement bancaire","Autre"],
  encaisseurs:[], niveaux:["Licence 1","Licence 2","Licence 3"],
  categoriesEntree:["Don ou sponsoring","Subvention","Recette d'activité","Remboursement reçu","Autre entrée"],
  categoriesSortie:["Formations et tutorat","Événements et accueil","Matériel et équipement","T-shirts et production","Communication et impression","Transport et logistique","Restauration","Abonnements et connexion","Aide et solidarité","Remboursement versé","Autre sortie"]
};
const pad = n => String(n).padStart(2,"0");
const isoD = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y,(m||1)-1,d||1); };
const joursEntre = (a,b) => Math.round((parseD(b)-parseD(a))/86400000);
const finMois = debut => { const d = parseD(debut); return isoD(new Date(d.getFullYear(), d.getMonth()+1, 0)); };
const normNom = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const valide = e => e && e.statut !== "Annulée" && e.statut !== "Annulé";

function calculer(D, ref){
  const P = {...PARAM_DEFAUT, ...(D.params||{})}; P.seuils = {...PARAM_DEFAUT.seuils, ...((D.params||{}).seuils||{})};
  const today = P.dateReference || ref;
  const mois = (P.mois||[]).map(m => ({...m, fin: finMois(m.debut)}));
  const echus = mois.filter(m => m.fin < today);
  const courant = mois.find(m => m.debut <= today && today <= m.fin) || null;
  const encV = D.encaissements.filter(valide);
  const parMat = {};
  for (const e of encV){ if (e.matricule) (parMat[e.matricule] ||= []).push(e); }

  /* --- Situation financière par étudiant --- */
  const etu = {};
  for (const s of D.etudiants){
    const L = parMat[s.matricule] || [];
    const inscPayee = L.filter(e=>e.nature===N_INSC).reduce((a,e)=>a+e.montant,0);
    const tshirtVendu = L.filter(e=>e.nature===NATURES[2]).reduce((a,e)=>a+e.montant,0);
    const imputation = Math.max(0, inscPayee - P.tshirt);
    const cotiDirect = L.filter(e=>e.nature===N_COTI).reduce((a,e)=>a+e.montant,0);
    const pool = imputation + cotiDirect;
    let reste = pool; const parMois = {};
    for (const m of mois){ const p = Math.min(P.mensualite, Math.max(0,reste)); reste -= p; parMois[m.code] = p; }
    const avance = Math.max(0, reste);
    const concerne = s.statut !== "Inactif";
    const dueEchus = concerne ? echus.length * P.mensualite : 0;
    const arriere = Math.max(0, dueEchus - pool);
    const resteCourant = concerne && courant ? Math.max(0, P.mensualite - (parMois[courant.code]||0)) : 0;
    const inscOk = inscPayee >= P.inscription;
    let situation, niv;
    if (!concerne){ situation = "Inactif"; niv = "mute"; }
    else if (inscPayee === 0 && !L.length){ situation = "Aucun paiement"; niv = "bad"; }
    else if (!inscOk){ situation = "Inscription incomplète"; niv = "warn"; }
    else if (arriere > 0){ situation = "En retard"; niv = "bad"; }
    else if (resteCourant > 0){ situation = "Mois en cours"; niv = "info"; }
    else { situation = "À jour"; niv = "ok"; }
    etu[s.matricule] = {inscPayee, inscOk, tshirtVendu, imputation, cotiDirect, pool, parMois, avance, dueEchus, arriere, resteCourant, situation, niv, totalVerse: L.reduce((a,e)=>a+e.montant,0), versements: L};
  }

  /* --- Totaux registre --- */
  const totalEncaisse = encV.reduce((a,e)=>a+e.montant,0);
  const parNature = {}; for (const e of encV) parNature[e.nature] = (parNature[e.nature]||0) + e.montant;
  const refs = {}; for (const e of encV){ if (e.ref){ const k = e.ref.trim().toUpperCase(); (refs[k] ||= []).push(e.num); } }
  const refsDoubles = Object.entries(refs).filter(([,v])=>v.length>1);
  const matsConnus = new Set(D.etudiants.map(s=>s.matricule));
  const matsInconnus = encV.filter(e=>e.matricule && !matsConnus.has(e.matricule));

  /* --- Caisse --- */
  const depV = D.depots.filter(d=>d.statut==="Validé");
  const depA = D.depots.filter(d=>d.statut==="En attente");
  const opsV = D.operations.filter(valide);
  const entrees = opsV.filter(o=>o.type==="Entrée");
  const sortiesOk = opsV.filter(o=>o.type==="Sortie" && o.approuve !== false);
  const sortiesAttente = opsV.filter(o=>o.type==="Sortie" && o.approuve === false);
  const sum = (L,k) => L.reduce((a,x)=>a+(Number(x[k])||0),0);
  const recuDepots = sum(depV,"montantNet"), frais = sum(depV,"frais");
  const solde = (P.soldeOuverture||0) + recuDepots + sum(entrees,"montant") - sum(sortiesOk,"montant");
  const engage = sum(sortiesAttente,"montant");
  const esp = L => L.filter(x=>x.mode==="Espèces");
  const especes = (P.soldeOuverture||0) + sum(esp(depV),"montantNet") + sum(esp(entrees),"montant") - sum(esp(sortiesOk),"montant");
  const remisRegistre = sum(depV,"montantRegistre") + sum(depA,"montantRegistre");
  const nonRemis = totalEncaisse - remisRegistre;
  const dernierDepot = D.depots.filter(d=>d.statut!=="Annulé").map(d=>d.date).sort().pop() || null;
  const joursSansDepot = dernierDepot ? joursEntre(dernierDepot, today) : null;

  /* Livre de caisse chronologique */
  const mvts = [
    ...depV.map(d=>({date:d.date, ref:d.num, libelle:`Dépôt des encaissements (${d.remisPar||"—"})`, entree:d.montantNet, sortie:0, mode:d.mode})),
    ...entrees.map(o=>({date:o.date, ref:o.num, libelle:o.libelle, entree:o.montant, sortie:0, mode:o.mode})),
    ...sortiesOk.map(o=>({date:o.date, ref:o.num, libelle:o.libelle, entree:0, sortie:o.montant, mode:o.mode}))
  ].sort((a,b)=>(a.date+a.ref).localeCompare(b.date+b.ref));
  let run = P.soldeOuverture||0; for (const m of mvts){ run += m.entree - m.sortie; m.solde = run; }

  /* --- Pédagogie --- */
  const forms = Object.fromEntries((P.formations||[]).map(f=>[f.code,f]));
  const peda = {};
  for (const s of D.etudiants) peda[s.matricule] = {par:{}, pres:0, total:0};
  for (const se of D.seances){
    for (const [mat,code] of Object.entries(se.presences||{})){
      if (!peda[mat] || !code) continue;
      const f = (peda[mat].par[se.formation] ||= {pres:0,total:0,note:null});
      f.total++; peda[mat].total++;
      if (code==="P"||code==="R"){ f.pres++; peda[mat].pres++; }
    }
  }
  for (const n of D.notes){
    for (const [mat,v] of Object.entries(n.notes||{})){
      if (!peda[mat] || v===""||v==null) continue;
      (peda[mat].par[n.id] ||= {pres:0,total:0,note:null}).note = v;
    }
  }
  for (const mat in peda){
    const p = peda[mat]; p.assiduite = p.total ? p.pres/p.total : null;
    for (const code in p.par){
      const f = p.par[code]; f.assiduite = f.total ? f.pres/f.total : null;
      const noteOk = typeof f.note === "number" && f.note >= P.noteMin;
      f.valide = f.note == null ? null : (noteOk && (f.assiduite == null || f.assiduite >= P.assiduiteMin));
    }
  }

  /* --- Alertes --- */
  const A = [];
  const fmt = n => Math.round(n).toLocaleString("fr-FR").replace(/ | /g," ") + " FCFA";
  const add = (niv, titre, detail, pour, lien) => A.push({niv, titre, detail, pour, lien});
  const actifs = D.etudiants.filter(s=>s.statut!=="Inactif");
  const retard = actifs.filter(s=>etu[s.matricule].arriere>0);
  const inscInc = actifs.filter(s=>!etu[s.matricule].inscOk);
  if (retard.length) add("bad", `${retard.length} étudiant(s) en retard de cotisation`, `Arriéré total : ${fmt(retard.reduce((a,s)=>a+etu[s.matricule].arriere,0))}`, ["president","encaissement","tresorerie"], "#cotisations");
  if (inscInc.length) add("warn", `${inscInc.length} inscription(s) non soldée(s)`, inscInc.slice(0,4).map(s=>s.nom).join(", ") + (inscInc.length>4?"…":""), ["president","encaissement","tresorerie"], "#cotisations");
  if (D.params && solde < P.seuils.soldeMin) add("bad", "Solde de caisse sous le minimum", `Solde ${fmt(solde)} pour un minimum de ${fmt(P.seuils.soldeMin)}`, ["president","caisse","tresorerie"], "#caisse");
  if (especes > P.seuils.plafondEspeces) add("warn", "Trop d'espèces en caisse", `${fmt(especes)} en espèces, plafond ${fmt(P.seuils.plafondEspeces)} : déposer sur un compte mobile`, ["president","caisse","tresorerie"], "#caisse");
  for (const d of depA){ const j = joursEntre(d.date, today); if (j > P.seuils.delaiValidation) add("bad", `Dépôt ${d.num} en attente depuis ${j} jours`, `${fmt(d.montantNet)} remis par ${d.remisPar||"—"} : à valider ou rejeter`, ["president","caisse","encaissement"], "#caisse"); else add("info", `Dépôt ${d.num} à valider`, `${fmt(d.montantNet)} remis par ${d.remisPar||"—"}`, ["caisse"], "#caisse"); }
  if (joursSansDepot != null && joursSansDepot > P.seuils.delaiDepot && nonRemis > 0) add("warn", `Aucun dépôt depuis ${joursSansDepot} jours`, `${fmt(nonRemis)} encaissés à remettre à la caisse`, ["president","encaissement","caisse","tresorerie"], "#caisse");
  else if (nonRemis > 0) add("info", "Encaissements à remettre à la caisse", `${fmt(nonRemis)} encaissés pas encore déclarés en dépôt`, ["encaissement","president"], "#caisse");
  if (nonRemis < 0) add("warn", "Dépôts supérieurs au registre", `Les dépôts déclarent ${fmt(-nonRemis)} de plus que les encaissements enregistrés : vérifier les périodes et les montants`, ["president","encaissement","tresorerie"], "#caisse");
  if (sortiesAttente.length) add("warn", `${sortiesAttente.length} sortie(s) à approuver`, `Montant engagé : ${fmt(engage)}`, ["president","caisse"], "#caisse");
  const sansJustif = sortiesOk.filter(o=>!o.justificatif);
  if (sansJustif.length) add("warn", `${sansJustif.length} sortie(s) sans justificatif`, sansJustif.map(o=>o.num).join(", "), ["president","caisse","tresorerie"], "#caisse");
  if (refsDoubles.length) add("bad", "Références de transaction en double", refsDoubles.map(([k,v])=>`${k} : ${v.join(", ")}`).join(" · "), ["president","encaissement","tresorerie"], "#registre");
  if (matsInconnus.length) add("warn", "Encaissements liés à un matricule inconnu", matsInconnus.map(e=>e.num).join(", "), ["president","encaissement"], "#registre");
  const noms = {}; for (const s of D.etudiants){ const k = normNom(s.nom); (noms[k] ||= []).push(s.matricule); }
  const doublons = Object.values(noms).filter(v=>v.length>1);
  if (doublons.length) add("warn", "Doublons possibles dans les étudiants", doublons.map(v=>v.join(" = ")).join(" · "), ["president","encaissement"], "#etudiants");
  const faibles = actifs.filter(s=>peda[s.matricule].total>=3 && peda[s.matricule].assiduite < P.assiduiteMin);
  if (faibles.length) add("warn", `${faibles.length} apprenant(s) sous ${Math.round(P.assiduiteMin*100)} % d'assiduité`, faibles.slice(0,4).map(s=>s.nom).join(", ")+(faibles.length>4?"…":""), ["president","pedagogie","bureau"], "#pedagogie");
  const echecs = []; for (const s of actifs) for (const [c,f] of Object.entries(peda[s.matricule].par)) if (f.valide===false) echecs.push(`${s.nom} (${c})`);
  if (echecs.length) add("info", `${echecs.length} formation(s) non validée(s)`, echecs.slice(0,4).join(", ")+(echecs.length>4?"…":""), ["president","pedagogie"], "#pedagogie");
  if (!mois.length) add("warn", "Calendrier des cotisations non renseigné", "Renseignez les mois du programme dans les Paramètres", ["president"], "#admin");

  return {P, today, mois, echus, courant, etu, peda, totalEncaisse, parNature, refsDoubles, caisse:{solde, engage, dispo:solde-engage, especes, recuDepots, frais, nonRemis, dernierDepot, joursSansDepot, depA, sortiesAttente, mvts, entreesTot:sum(entrees,"montant"), sortiesTot:sum(sortiesOk,"montant")}, alertes:A};
}
/*CALC-END*/

/* ======== Utilitaires d'interface ======== */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const F = n => (n==null||isNaN(n)) ? "—" : Math.round(n).toLocaleString("fr-FR").replace(/ | /g," ");
const FC = n => F(n) + " FCFA";
const today = () => isoD(new Date());
const dFR = s => s ? parseD(s).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
const dLong = s => s ? parseD(s).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}) : "—";
const pct = v => v==null ? "—" : Math.round(v*100)+" %";
const nowISO = () => new Date().toISOString();
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),3200); }
function openSheet(html){ $("#sheet").innerHTML = html; $("#overlay").classList.add("open"); $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeSheet); const f=$("#sheet").querySelector("input,select,textarea"); f && f.focus(); }
function closeSheet(){ $("#overlay").classList.remove("open"); $("#sheet").innerHTML=""; queueRender(); }
$("#overlay").addEventListener("click", e => { if (e.target.id==="overlay") closeSheet(); });
addEventListener("keydown", e => { if (e.key==="Escape" && $("#overlay").classList.contains("open")) closeSheet(); });
const opts = (L, sel, ph) => (ph!=null?`<option value="">${esc(ph)}</option>`:"") + L.map(v => { const [val,lab] = Array.isArray(v)?v:[v,v]; return `<option value="${esc(val)}" ${String(val)===String(sel??"")?"selected":""}>${esc(lab)}</option>`; }).join("");
function confirmBtn(btn, label, fn){ btn.onclick = () => { if (btn.dataset.sure!=="1"){ btn.dataset.sure="1"; btn.textContent=label; return; } fn(); }; }

/* ======== État ======== */
const S = {
  db:null, fb:null, uid:null, email:null, moi:null, sansConfig:false, authPret:false, stale:false, jA:[], jB:[],
  etudiants:[], prive:{}, encaissements:[], depots:[], operations:[], seances:[], notes:[], params:null, comptes:{}, demandes:{}, journal:[], journalPub:[], journalFin:[], tut:[], T:null, etat:{}, tf:{tuteur:"", statut:"", spec:""},
  loaded:{}, C:null, sub:{caisse:"synthese", pedagogie:"seances", admin:"comptes", etudiants:""},
  f:{q:"", niveau:"", situation:"", spec:""}, rf:{q:"", nature:"", mois:"", statut:"valides"},
  firstJournal:true
};
const compte = () => S.moi;
const role = () => compte()?.role || null;
const can = p => { const r = ROLES[role()]; return !!r && (r.perms.includes("*") || r.perms.includes(p)); };
const P = () => S.C?.P || PARAM_DEFAUT;
const etuBy = m => S.etudiants.find(s=>s.matricule===m);

async function write(fn, ok){
  try { const r = await fn(); if (ok) toast(r?.horsLigne ? ok + " (hors ligne : envoi automatique au retour du réseau)" : ok); return true; }
  catch(e){
    if (e?.code==="hors_ligne") toast("Connexion internet nécessaire pour attribuer un numéro. Réessayez une fois connecté.");
    else if (e?.code==="invalid_argument") toast("Action refusée : votre rôle ne permet pas cette modification.");
    else if (e?.code==="quota_exceeded") toast("Capacité de la base atteinte : contactez le président.");
    else toast("Enregistrement impossible pour l'instant. Réessayez dans un instant.");
    return false;
  }
}
/* Notifications : chaque action est déposée dans le canal de chaque destinataire (rôle ou personne) ; la Présidence reçoit tout. */
async function log(action, texte, pour, extra){
  const canaux = new Set(["president"]);
  for (const p of pour||[]){ if (p==="tous") TOUS.forEach(r=>canaux.add(r)); else if (String(p).startsWith("u:")) canaux.add("u_"+p.slice(2)); else if (ROLES[p]) canaux.add(p); }
  const id = "J" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const data = {le:nowISO(), par:S.uid, parNom:compte()?.nom||"", role:role(), action, texte, pour:[...canaux], ...(extra||{})};
  S.db.lots([...canaux].map(c=>({path:`notifs/${c}/items/${id}`, data}))).catch(()=>{});
}
function fusionJournal(){
  const avant = new Set(S.journal.map(j=>j.id));
  const m = new Map(); for (const j of [...S.jA, ...S.jB]) m.set(j.id, j);
  S.journal = [...m.values()].sort((a,b)=>String(b.le).localeCompare(String(a.le))).slice(0,300);
  if (S.journalPret){
    const neuf = S.journal.filter(j=>!avant.has(j.id) && j.par!==S.uid);
    if (neuf.length){ toast("🔔 " + neuf[0].texte); notifierSysteme(neuf[0].texte); }
  } else setTimeout(()=>{ S.journalPret = true; }, 4000);
}
/* Notification du téléphone (application ouverte ou en arrière-plan) */
function notifierSysteme(texte){
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    navigator.serviceWorker?.ready.then(r => r.showNotification("CVPB Gestion", {body:texte, icon:"icon-192.png", badge:"badge-96.png", tag:"cvpb", renotify:true}));
  } catch(e){}
}

/* Numéro suivant (ENC-0031, DEP-0004, CVPB-26-0033…) attribué par le serveur sans doublon */
function numero(col, prefixe, liste, champ, fabrique){
  const n = liste.reduce((m,x)=>{ const v = parseInt(String(x[champ]||x.id||"").replace(prefixe,""),10); return isNaN(v)?m:Math.max(m,v); },0);
  return S.db.numeroter(col, prefixe, n+1, fabrique);
}

/* ======== Navigation ======== */
const R = (...l) => () => l.includes(role()) || role()==="president";
const VIEWS = [
  {id:"accueil", l:"Tableau de bord", ok:()=>true},
  {id:"etudiants", l:"Étudiants", ok:R("encaissement","tresorerie")},
  {id:"registre", l:"Registre des encaissements", ok:R("encaissement","tresorerie")},
  {id:"cotisations", l:"Suivi des cotisations", ok:R("encaissement","tresorerie")},
  {id:"caisse", l:"Caisse", ok:R("caisse","tresorerie")},
  {id:"depots", l:"Mes dépôts à la caisse", ok:()=>role()==="encaissement"},
  {id:"pedagogie", l:"Suivi pédagogique", ok:R("formation","pedagogie")},
  {id:"tutorat", l:"Rapports des tuteurs", ok:R("formation")},
  {id:"notifications", l:"Alertes et notifications", ok:()=>true},
  {id:"admin", l:"Administration", ok:R()},
  {id:"compte", l:"Mon compte", ok:()=>true}
];
function view(){ const h = location.hash.slice(1); const v = VIEWS.find(x=>x.id===h && x.ok()); return v ? v.id : "accueil"; }
addEventListener("hashchange", () => { render(); scrollTo(0,0); });
$("#bell").onclick = () => { location.hash = role()==="tuteur" ? "t-notifs" : "notifications"; };

/* ======== Notifications ======== */
function mesNotifs(){
  const r = role(); if (!r) return [];
  return S.journal.filter(j => j.par !== S.uid);
}
function nonLues(){ const seen = S.etat.vu || ""; return mesNotifs().filter(j => j.le > seen); }
function mesAlertes(){ const r = role(); return (S.C?.alertes||[]).filter(a => r==="president" || a.pour.includes(r)); }
function majBadge(){
  const n = nonLues().length + mesAlertes().filter(a=>a.niv==="bad").length;
  const b = $("#badge"); b.hidden = !n; b.textContent = n>99?"99+":n;
}
async function marquerLu(){
  const le = S.journal[0]?.le; if (!le || !S.uid || (S.etat.vu||"") >= le) return;
  S.etat = {...S.etat, vu:le};
  try { await S.db.doc(`etat/${S.uid}`).set({vu:le}); } catch(e){}
}

/* ======== Rendu ======== */
let rq=false;
function queueRender(){ if (rq) return; rq=true; requestAnimationFrame(()=>{ rq=false; if (!$("#overlay").classList.contains("open")) render(); else majBadge(); }); }
function recalc(){
  S.C = calculer({params:S.params, etudiants:S.etudiants, encaissements:S.encaissements, depots:S.depots, operations:S.operations, seances:S.seances, notes:S.notes}, today());
  S.T = statsTutorat(S.tut, S.comptes, S.C.today);
  if (can("tut.voir")) S.C.alertes.push(...S.T.alertes);
}
function render(){
  const main = $("#main");
  if (S.sansConfig){ $("#tabs").innerHTML=""; main.innerHTML = gate("Configuration à terminer", "Le fichier <b>firebase-config.js</b> contient encore les valeurs d'exemple. Remplacez-les par la configuration de votre projet Firebase (voir le guide LISEZ-MOI)."); return; }
  if (!S.authPret){ main.innerHTML = `<div class="empty">Chargement de l'application…</div>`; return; }
  if (!S.uid){ $("#tabs").innerHTML=""; $("#who").innerHTML=""; $("#bell").hidden = true; espace(false); renderLogin(main); return; }
  $("#bell").hidden = false;
  if (!S.loaded.moi){ main.innerHTML = `<div class="empty">Ouverture de votre espace…</div>`; return; }
  const c = compte();
  if (!c){ $("#tabs").innerHTML=""; main.innerHTML = gate("Accès non autorisé", `Le compte <b>${esc(S.email)}</b> n'a pas encore été ajouté à l'application. Demandez au président de la CVPB de vous ajouter avec cette adresse.`, btnDeco()); bindDeco(); return; }
  if (c.actif === false){ $("#tabs").innerHTML=""; main.innerHTML = gate("Accès suspendu", "Votre accès a été suspendu par la Présidence. Contactez le président pour le rétablir.", btnDeco()); bindDeco(); return; }
  $("#who").innerHTML = `<b>${esc(c.nom)}</b>${esc(ROLES[c.role]?.l||"")}`;
  espace(c.role==="tuteur");
  if (!S.loaded.params){ main.innerHTML = `<div class="empty">${S.stale?"Les données ne répondent pas encore. Vérifiez votre connexion.":"Chargement des données de la CVPB…"}</div>`; return; }
  recalc();
  if (c.role==="tuteur"){ renderTuteur(main); majBadge(); return; }
  const v = view();
  const lab = x => x.id==="accueil" ? (c.role==="president" ? "Tableau général" : "Mon espace") : x.l;
  $("#tabs").innerHTML = VIEWS.filter(x=>x.ok()).map(x=>`<a href="#${x.id}" ${x.id===v?'aria-current="page"':""}>${esc(lab(x))}${x.id==="notifications"&&nonLues().length?` (${nonLues().length})`:""}${x.id==="tutorat"&&S.T.nouveaux.length&&can("tut.suivre")?` (${S.T.nouveaux.length})`:""}</a>`).join("");
  majBadge();
  if (v==="depots") S.sub.caisse = "depots";
  main.innerHTML = ({accueil:vAccueil, etudiants:vEtudiants, registre:vRegistre, cotisations:vCotisations, caisse:vCaisse, depots:vCaisse, pedagogie:vPedagogie, tutorat:vTutorat, notifications:vNotifs, admin:vAdmin, compte:vCompte}[v])();
  bind(v==="depots" ? "caisse" : v);
  if (v==="compte") bindCompte();
  if (v==="notifications") marquerLu();
}
function espace(tut){
  document.body.classList.toggle("tut", !!tut);
  $("#appTitle").textContent = tut ? "Espace Tuteurs CVPB" : "CVPB Gestion";
  $("#appSub").textContent = tut ? "Rapports de tutorat · CVPB Académie 2026-2027" : "Encaissements · Caisse · Suivi des étudiants";
}
function gate(t, msg, extra){ return `<div class="gate"><img src="${document.querySelector(".brand img").src}" alt=""><h2>${esc(t)}</h2><p class="muted">${msg}</p>${extra||""}</div>`; }

/* ---- Connexion avec le compte Google UVCI ---- */
const DOMAINE = () => firebaseConfig.domaine || "uvci.edu.ci";
const estUVCI = e => String(e||"").toLowerCase().endsWith("@" + DOMAINE());
const btnDeco = () => `<button class="btn" id="deco">Se déconnecter</button>`;
function bindDeco(){ $("#deco") && ($("#deco").onclick = () => S.fb.compte.deconnexion().then(()=>location.reload())); }
const MSG_AUTH = c => ({"auth/popup-closed-by-user":"Connexion annulée.","auth/network-request-failed":"Pas de connexion internet. La connexion nécessite le réseau.","auth/unauthorized-domain":"Cette adresse n'est pas autorisée dans Firebase (Authentication > Paramètres > Domaines autorisés).","auth/operation-not-allowed":"La connexion Google n'est pas activée dans Firebase (Authentication > Sign-in method > Google).","auth/too-many-requests":"Trop de tentatives. Patientez quelques minutes.","auth/user-disabled":"Ce compte Google a été désactivé."}[c] || "Connexion impossible pour l'instant. Réessayez.");
const G_ICONE = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function renderLogin(main){
  main.innerHTML = `<div class="gate"><img src="icon-512.png" alt="Logo de la Communauté Virtuelle de Port-Bouët"><h2>Connexion</h2>
    <p class="muted">Communauté Virtuelle de Port-Bouët · CVPB Académie</p>
    <div class="form card" style="width:100%;text-align:left">
      <button class="btn" id="gLogin" type="button" style="justify-content:center;min-height:48px;font-weight:600;gap:10px">${G_ICONE} Se connecter avec Google UVCI</button>
      <p class="small muted">Utilisez votre adresse <b>@${esc(DOMAINE())}</b>. Les autres comptes Google sont refusés.</p>
      <p class="small" id="l_err" style="color:var(--bad)" role="alert">${esc(S.erreurConnexion||"")}</p>
      <p class="small muted">Pas encore d'accès ? Demandez au président de la CVPB de vous ajouter avec votre adresse UVCI.</p>
    </div>
    ${installHTML()}</div>`;
  bindInstall();
  $("#gLogin").onclick = async () => {
    $("#l_err").textContent = ""; $("#gLogin").disabled = true;
    try { await S.fb.compte.connexionGoogle(); }
    catch(err){ $("#l_err").textContent = MSG_AUTH(err?.code); $("#gLogin").disabled = false; }
  };
}
/* ---- Installation sur le téléphone ---- */
let invite = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); invite = e; queueRender(); });
addEventListener("appinstalled", () => { invite = null; toast("Application installée sur votre téléphone"); });
const estInstallee = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function installHTML(){
  if (estInstallee()) return "";
  if (invite) return `<button class="btn vert" id="inst" type="button">Installer l'application sur ce téléphone</button>`;
  if (estIOS()) return `<p class="small muted">Pour installer l'application sur iPhone : touchez le bouton Partager de Safari, puis « Sur l'écran d'accueil ».</p>`;
  return `<p class="small muted">Pour installer l'application : ouvrez le menu de Chrome (⋮) puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p>`;
}
function bindInstall(){ $("#inst") && ($("#inst").onclick = async () => { invite.prompt(); await invite.userChoice; invite = null; queueRender(); }); }
/* ---- Mon compte ---- */
function vCompte(){
  const c = compte(), perm = "Notification" in window ? Notification.permission : "indisponible";
  return `<h2>Mon compte</h2>
  <div class="card"><dl class="dl"><dt>Nom</dt><dd>${esc(c.nom)}</dd><dt>Compte Google</dt><dd class="num" style="overflow-wrap:anywhere">${esc(S.email)}</dd><dt>Rôle</dt><dd>${esc(ROLES[c.role]?.l)}</dd>${c.role==="tuteur"?`<dt>Groupe encadré</dt><dd>${esc(codeSp(c.specialite))} · ${esc(c.niveau||"")}</dd>`:""}</dl></div>
  <div class="card"><h3>Application sur le téléphone</h3>${estInstallee()?'<p class="small">L\'application est installée sur cet appareil.</p>':installHTML()}
    <h3>Notifications du téléphone</h3>
    ${perm==="granted"?'<p class="small">Activées : vous serez prévenu des nouvelles actions qui vous concernent.</p>':perm==="denied"?'<p class="small">Bloquées dans les réglages du navigateur. Autorisez les notifications pour ce site pour les recevoir.</p>':perm==="indisponible"?'<p class="small muted">Non disponibles sur cet appareil.</p>':'<button class="btn" id="notifOn" type="button">Activer les notifications</button>'}
    <p class="small muted">Elles arrivent quand l'application est ouverte ou en arrière-plan. Ouvrez-la au moins une fois par jour pour rester à jour.</p></div>
  <div class="card"><h3>Session</h3><p class="small muted">Vous restez connecté sur cet appareil. Déconnectez-vous si le téléphone est partagé.</p><div class="row">${btnDeco()}</div></div>`;
}
function bindCompte(){
  bindInstall(); bindDeco();
  $("#notifOn") && ($("#notifOn").onclick = async () => { try { await Notification.requestPermission(); } catch(e){} render(); });
}

/* ---- Tableau de bord ---- */
function alertesHTML(L, max){
  if (!L.length) return `<div class="empty">Aucune alerte. Tout est en ordre.</div>`;
  const ord = {bad:0,warn:1,info:2};
  return `<div class="alerts">${L.slice().sort((a,b)=>ord[a.niv]-ord[b.niv]).slice(0,max||99).map(a=>`<div class="alert ${a.niv}"><div><b>${esc(a.titre)}</b><span>${esc(a.detail)}</span></div>${a.lien?`<a class="btn sm" href="${a.lien}">Voir</a>`:""}</div>`).join("")}</div>`;
}
function feedHTML(L, max){
  const seen = S.etat.vu || "";
  if (!L.length) return `<div class="empty">Aucune activité récente.</div>`;
  return `<div class="feed">${L.slice(0,max||30).map(j=>`<div class="it ${j.le>seen?"new":""}"><span class="dot"></span><div><b class="small">${esc(j.texte)}</b><div class="small muted">${esc(j.parNom||"")} · ${new Date(j.le).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div></div></div>`).join("")}</div>`;
}
const kpi = (v, l, cls) => `<div class="kpi ${cls||""}"><span class="v">${v}</span><span class="l">${l}</span></div>`;
function barreActions(){
  return [
    can("enc.saisir") && `<button class="btn primary" data-act="enc">+ Encaissement</button>`,
    can("etu.gerer") && `<button class="btn" data-act="etu">+ Étudiant</button>`,
    can("depot.declarer") && `<button class="btn" data-act="dep">Déclarer un dépôt</button>`,
    can("op.saisir") && `<button class="btn" data-act="op">+ Entrée ou sortie de caisse</button>`,
    can("peda.saisir") && `<button class="btn vert" data-act="sea">Pointer une séance</button>`
  ].filter(Boolean).join("");
}
function entete(titre){
  const C = S.C;
  return `<div class="spread"><div><h2>${titre}</h2><p class="small muted">${esc(compte().nom)} · ${esc(ROLES[role()]?.l)} · ${new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}${C.courant?` · cotisation en cours : ${esc(C.courant.libelle)}`:""}</p></div><div class="row">${barreActions()}</div></div>`;
}
const aRelancer = () => S.etudiants.filter(s=>s.statut!=="Inactif").map(s=>({s, e:S.C.etu[s.matricule]})).filter(x=>x.e.arriere||x.e.resteCourant||!x.e.inscOk).sort((a,b)=>(b.e.arriere-a.e.arriere)||((P().inscription-b.e.inscPayee)-(P().inscription-a.e.inscPayee)));
function relanceListe(max){
  const L = aRelancer();
  if (!L.length) return `<div class="empty">Personne à relancer.</div>`;
  return `<div class="plist">${L.slice(0,max).map(({s,e})=>{ const du = (e.inscOk?0:P().inscription-e.inscPayee)+e.arriere+e.resteCourant; const tel = can("tel.voir") && S.prive[s.matricule]?.tel; return `<div class="prow"><span><a href="#" data-fiche="${esc(s.matricule)}"><b>${esc(s.nom)}</b></a><br><span class="small muted">${esc(e.situation)} · reste ${FC(du)}</span></span>${tel?`<a class="btn sm vert" href="${waLink(tel, relanceMsg(s,e))}" target="_blank" rel="noopener">WhatsApp</a>`:""}</div>`; }).join("")}</div>${L.length>max?`<a class="btn ghost" href="#cotisations">Voir les ${L.length}</a>`:""}`;
}
function vAccueil(){
  const r = role();
  if (r==="president") return vGeneral();
  return ({encaissement:vDashEnc, caisse:vDashCaisse, tresorerie:vDashTreso, formation:vDashFormation, pedagogie:vDashPeda}[r] || vGeneral)();
}

/* Tableau général de la Présidence */
function vGeneral(){
  const C = S.C, K = C.caisse, T = S.T, pres = role()==="president";
  const actifs = S.etudiants.filter(s=>s.statut!=="Inactif");
  const n = k => actifs.filter(s=>C.etu[s.matricule].situation===k).length;
  const arr = actifs.reduce((a,s)=>a+C.etu[s.matricule].arriere,0);
  const avec = actifs.filter(s=>C.peda[s.matricule].assiduite!=null);
  const assid = avec.length ? avec.reduce((a,s)=>a+C.peda[s.matricule].assiduite,0)/avec.length : null;
  const tuteurs = Object.values(T.parTuteur);
  const tutActifs = tuteurs.filter(t=>t.joursSans!=null && t.joursSans<=10).length;
  const todo = pres ? [
    K.sortiesAttente.length && `<a class="btn" href="#caisse" data-goto="operations">${K.sortiesAttente.length} sortie(s) à approuver</a>`,
    K.depA.length && `<a class="btn" href="#caisse" data-goto="depots">${K.depA.length} dépôt(s) en attente</a>`,
    T.aTraiter.length && `<a class="btn" href="#tutorat">${T.aTraiter.length} intervention(s) demandée(s) par les tuteurs</a>`,
    T.nouveaux.length && `<a class="btn" href="#tutorat">${T.nouveaux.length} rapport(s) de tutorat non lu(s)</a>`
  ].filter(Boolean) : [];
  const equipe = Object.entries(S.comptes).filter(([,c])=>c.role!=="tuteur" && c.actif!==false).map(([u,c])=>{ const J = S.journal.filter(j=>j.par && j.par===c.uid); const il7 = Date.now()-7*86400000; return {u, c, dernier:J[0]?.le, n7:J.filter(j=>new Date(j.le).getTime()>il7).length}; });
  return `${entete(pres?"Tableau général de la CVPB":"Vue d'ensemble de la CVPB")}
  ${pres?`<div class="card"><h3>À traiter par la Présidence</h3>${todo.length?`<div class="row">${todo.join("")}</div>`:`<div class="empty">Rien en attente de votre décision.</div>`}</div>`:""}
  <h3>Finances</h3>
  <div class="kpis">${kpi(F(C.totalEncaisse),"FCFA encaissés (registre)")}${kpi(F(K.solde),`FCFA en caisse${K.engage?` · ${F(K.engage)} engagés`:""}`, "g "+(K.solde<P().seuils.soldeMin?"bad":""))}${kpi(F(K.nonRemis),"FCFA encaissés non remis à la caisse", K.nonRemis<0?"warn":"")}${kpi(F(arr),"FCFA d'arriérés de cotisation", arr?"bad":"g")}</div>
  <h3>Étudiants et CVPB Académie</h3>
  <div class="kpis">${kpi(actifs.length,"étudiants actifs")}${kpi(`${n("À jour")+n("Mois en cours")} / ${actifs.length}`,"inscription soldée et sans arriéré","g")}${kpi(pct(assid),"assiduité moyenne aux formations")}${kpi(S.seances.length,"séances de formation pointées","g")}</div>
  <h3>Tutorat</h3>
  <div class="kpis">${kpi(T.recents.length,"rapports de tutorat sur 30 jours")}${kpi(pct(T.tauxRecents),"présence aux séances de tutorat (30 j)","g")}${kpi(`${tutActifs} / ${tuteurs.length}`,"tuteurs ayant rendu un rapport depuis moins de 10 jours", tuteurs.length&&tutActifs<tuteurs.length?"warn":"")}${kpi(T.aTraiter.length,"interventions demandées non traitées", T.aTraiter.length?"bad":"g")}</div>
  <div class="cols">
    <div class="card"><div class="spread"><h3>Toutes les alertes</h3><a class="btn ghost" href="#notifications">Notifications</a></div>${alertesHTML(mesAlertes())}</div>
    <div class="card"><h3>Activité des responsables</h3>
      ${equipe.length?`<div class="plist">${equipe.map(x=>`<div class="prow"><span><b>${esc(x.c.nom)}</b><br><span class="small muted">${esc(ROLES[x.c.role]?.l)}</span></span><span class="small" style="text-align:right">${x.dernier?`Dernière action ${new Date(x.dernier).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`:'<span class="pill warn">Aucune action</span>'}<br><span class="muted">${x.n7} action(s) sur 7 jours</span></span></div>`).join("")}</div>`:`<div class="empty">Aucun responsable connecté pour l'instant.</div>`}
      <p class="small muted">Les tâches, réunions et rapports hebdomadaires des responsables sont suivis dans l'Espace Responsables.</p>
      <a class="btn" href="https://claude.ai/artifact/19vzXEk4X8mXSJsuTWjhqh" target="_blank" rel="noopener">Ouvrir l'Espace Responsables</a>
    </div>
  </div>`;
}

/* Espace de la responsable des encaissements */
function vDashEnc(){
  const C = S.C, K = C.caisse, mid = isoD(new Date(Date.now()-6*86400000));
  const sem = S.encaissements.filter(e=>valide(e) && e.date>=mid);
  const auj = sem.filter(e=>e.date===today());
  const derniers = S.encaissements.filter(valide).sort((a,b)=>b.num.localeCompare(a.num)).slice(0,8);
  return `${entete("Mon espace · Encaissements")}
  <div class="kpis">${kpi(F(auj.reduce((a,e)=>a+e.montant,0)),`FCFA encaissés aujourd'hui (${auj.length})`)}${kpi(F(sem.reduce((a,e)=>a+e.montant,0)),"FCFA sur les 7 derniers jours","g")}${kpi(F(K.nonRemis),"FCFA à remettre à la caisse", K.nonRemis<0?"warn":"")}${kpi(aRelancer().length,"étudiants à relancer", aRelancer().length?"warn":"g")}</div>
  ${K.depA.length?`<div class="banner">${K.depA.length} dépôt(s) déclaré(s) en attente de validation par la caisse.</div>`:""}
  <div class="cols">
    <div class="card"><h3>À relancer en priorité</h3>${relanceListe(8)}</div>
    <div class="card"><h3>Mes alertes</h3>${alertesHTML(mesAlertes(),5)}</div>
  </div>
  <div class="card"><div class="spread"><h3>Derniers encaissements</h3><a class="btn ghost" href="#registre">Registre complet</a></div>
  <div class="tablewrap"><table><tbody>${derniers.map(e=>`<tr><td class="num">${esc(e.num)}</td><td>${dFR(e.date)}</td><td>${esc(e.nom||e.payeur)}</td><td class="small">${esc(e.nature)}</td><td class="r">${F(e.montant)}</td><td>${esc(e.mode)}</td></tr>`).join("")}</tbody></table></div></div>`;
}

/* Espace de la responsable de la caisse */
function vDashCaisse(){
  const C = S.C, K = C.caisse;
  const mv = K.mvts.slice(-8).reverse();
  return `${entete("Mon espace · Caisse")}
  <div class="kpis">${kpi(F(K.solde),"FCFA solde de caisse","g "+(K.solde<P().seuils.soldeMin?"bad":""))}${kpi(F(K.dispo),"FCFA disponibles après engagements")}${kpi(F(K.especes),"FCFA en espèces (estimation)", K.especes>P().seuils.plafondEspeces?"warn":"g")}${kpi(K.depA.length,"dépôt(s) à valider", K.depA.length?"warn":"")}</div>
  <div class="cols">
    <div class="card"><h3>Dépôts à valider</h3>${K.depA.length?`<div class="plist">${K.depA.map(d=>`<div class="prow"><span><b>${esc(d.num)} · ${FC(d.montantNet)}</b><br><span class="small muted">${esc(d.remisPar)} · ${dFR(d.date)} · ${esc(d.mode)} ${esc(d.ref)} · frais ${F(d.frais)}</span></span><span class="row" style="flex-wrap:nowrap"><button class="btn sm vert" data-dval="${esc(d.num)}">Valider</button><button class="btn sm ghost" data-drej="${esc(d.num)}">Rejeter</button></span></div>`).join("")}</div>`:`<div class="empty">Aucun dépôt en attente.</div>`}
      ${K.sortiesAttente.length?`<p class="small" style="color:var(--warn)">${K.sortiesAttente.length} sortie(s) attendent l'approbation de la Présidence avant décaissement.</p>`:""}</div>
    <div class="card"><h3>Mes alertes</h3>${alertesHTML(mesAlertes(),5)}</div>
  </div>
  <div class="card"><div class="spread"><h3>Derniers mouvements</h3><a class="btn ghost" href="#caisse" data-goto="livre">Livre de caisse</a></div>
  <div class="tablewrap"><table><tbody>${mv.map(m=>`<tr><td>${dFR(m.date)}</td><td class="num">${esc(m.ref)}</td><td>${esc(m.libelle)}</td><td class="r" style="color:var(--ok)">${m.entree?"+"+F(m.entree):""}</td><td class="r" style="color:var(--bad)">${m.sortie?"−"+F(m.sortie):""}</td><td class="r"><b>${F(m.solde)}</b></td></tr>`).join("")||'<tr><td>Aucun mouvement.</td></tr>'}</tbody></table></div></div>`;
}

/* Espace de contrôle de la Trésorerie */
function vDashTreso(){
  const C = S.C, K = C.caisse;
  const arr = S.etudiants.reduce((a,s)=>a+C.etu[s.matricule].arriere,0);
  const fin = mesAlertes();
  return `${entete("Mon espace · Contrôle de la trésorerie")}
  <div class="kpis">${kpi(F(C.totalEncaisse),"FCFA encaissés (registre)")}${kpi(F(K.solde),"FCFA en caisse","g")}${kpi(F(K.nonRemis),"FCFA d'écart registre / dépôts", K.nonRemis?"warn":"g")}${kpi(F(arr),"FCFA d'arriérés", arr?"bad":"g")}</div>
  <div class="cols">
    <div class="card"><h3>Points de contrôle</h3>${alertesHTML(fin)}</div>
    <div class="card"><h3>Rapprochement</h3><div class="tablewrap"><table class="wrap"><tbody>
      <tr><td>Solde d'ouverture</td><td class="r">${FC(P().soldeOuverture)}</td></tr>
      <tr><td>+ Dépôts reçus (net)</td><td class="r">${FC(K.recuDepots)}</td></tr>
      <tr><td>+ Autres entrées</td><td class="r">${FC(K.entreesTot)}</td></tr>
      <tr><td>− Sorties approuvées</td><td class="r">${FC(K.sortiesTot)}</td></tr>
      <tr><td><b>= Solde</b></td><td class="r"><b>${FC(K.solde)}</b></td></tr>
      <tr><td>Frais de transaction cumulés</td><td class="r">${FC(K.frais)}</td></tr></tbody></table></div>
      <div class="row"><a class="btn" href="#registre">Registre</a><a class="btn" href="#caisse">Caisse</a><a class="btn" href="#cotisations">Cotisations</a></div></div>
  </div>`;
}

/* Espace de la Commission Formation */
function vDashFormation(){
  const T = S.T, derniers = T.rapports.slice(0,6);
  const silencieux = Object.values(T.parTuteur).filter(t=>t.compte && (t.joursSans==null||t.joursSans>10));
  return `${entete("Mon espace · Commission Formation")}
  <div class="kpis">${kpi(T.nouveaux.length,"rapports de tutorat non lus", T.nouveaux.length?"warn":"")}${kpi(T.aTraiter.length,"interventions demandées", T.aTraiter.length?"bad":"g")}${kpi(pct(T.tauxRecents),"présence aux séances de tutorat (30 j)")}${kpi(silencieux.length,"tuteurs sans rapport depuis 10 jours", silencieux.length?"warn":"g")}</div>
  <div class="cols">
    <div class="card"><div class="spread"><h3>Derniers rapports des tuteurs</h3><a class="btn ghost" href="#tutorat">Tous les rapports</a></div>${rapListe(derniers)}</div>
    <div class="card"><h3>Mes alertes</h3>${alertesHTML(mesAlertes(),6)}</div>
  </div>`;
}

/* Espace du formateur de l'Académie */
function vDashPeda(){
  const C = S.C;
  const mes = S.seances.filter(s=>s.par===S.uid).sort((a,b)=>b.date.localeCompare(a.date));
  const faibles = S.etudiants.filter(s=>s.academie && s.statut!=="Inactif" && C.peda[s.matricule].total>=3 && C.peda[s.matricule].assiduite<P().assiduiteMin);
  const avec = S.etudiants.filter(s=>C.peda[s.matricule].assiduite!=null);
  return `${entete("Mon espace · Formation")}
  <div class="kpis">${kpi(S.etudiants.filter(s=>s.academie&&s.statut!=="Inactif").length,"apprenants de l'Académie")}${kpi(mes.length,"séances pointées par moi","g")}${kpi(pct(avec.length?avec.reduce((a,s)=>a+C.peda[s.matricule].assiduite,0)/avec.length:null),"assiduité moyenne")}${kpi(faibles.length,`apprenants sous ${pct(P().assiduiteMin)}`, faibles.length?"warn":"g")}</div>
  <div class="cols">
    <div class="card"><h3>Mes dernières séances</h3>${mes.length?`<div class="plist">${mes.slice(0,6).map(s=>{ const v=Object.values(s.presences||{}); return `<div class="prow"><span><b>${esc(s.formation)} · ${esc(nomForm(s.formation))}</b><br><span class="small muted">${dLong(s.date)}</span></span><span class="small">${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents</span></div>`; }).join("")}</div>`:`<div class="empty">Aucune séance pointée. Utilisez « Pointer une séance ».</div>`}</div>
    <div class="card"><h3>Apprenants à suivre</h3>${faibles.length?`<div class="plist">${faibles.map(s=>`<div class="prow"><a href="#" data-fiche="${esc(s.matricule)}">${esc(s.nom)}</a><span class="pill warn">${pct(C.peda[s.matricule].assiduite)}</span></div>`).join("")}</div>`:`<div class="empty">Aucun apprenant sous le seuil d'assiduité.</div>`}</div>
  </div>`;
}

/* ---- Étudiants ---- */
function vEtudiants(){
  const C = S.C, f = S.f, fin = can("fin.voir"), tel = can("tel.voir");
  let L = S.etudiants.slice().sort((a,b)=>a.matricule.localeCompare(b.matricule));
  const q = normNom(f.q);
  if (q) L = L.filter(s => normNom(s.nom+" "+s.matricule).includes(q));
  if (f.niveau) L = L.filter(s=>s.niveau===f.niveau);
  if (f.spec) L = L.filter(s=>s.specialite===f.spec);
  if (f.situation) L = L.filter(s=>C.etu[s.matricule].situation===f.situation);
  const specs = [...new Set(S.etudiants.map(s=>s.specialite).filter(Boolean))].sort();
  return `<div class="spread"><h2>Étudiants <span class="muted small">(${S.etudiants.length})</span></h2><div class="row">${can("export")?`<button class="btn" id="expEtu">Exporter (CSV)</button>`:""}${can("etu.gerer")?`<button class="btn primary" id="newEtu">+ Nouvel étudiant</button>`:""}</div></div>
  <div class="filters">
    <input type="search" id="fq" placeholder="Rechercher un nom ou un matricule" value="${esc(f.q)}" aria-label="Recherche">
    <select id="fniv" aria-label="Niveau">${opts(P().niveaux, f.niveau, "Tous les niveaux")}</select>
    <select id="fspec" aria-label="Spécialité">${opts(specs, f.spec, "Toutes spécialités")}</select>
    ${fin?`<select id="fsit" aria-label="Situation">${opts(["À jour","Mois en cours","En retard","Inscription incomplète","Aucun paiement","Inactif"], f.situation, "Toutes situations")}</select>`:"<span></span>"}
  </div>
  <div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom et prénoms</th><th>Niveau</th><th>Spécialité</th>${tel?"<th>Téléphone</th>":""}${fin?'<th class="r">Versé</th><th>Situation</th>':""}<th class="r">Assiduité</th></tr></thead><tbody>
  ${L.map(s=>{ const e = C.etu[s.matricule], p = C.peda[s.matricule]; return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${esc(s.niveau)}</td><td class="small">${esc(codeSpec(s.specialite))}</td>${tel?`<td class="num">${esc(S.prive[s.matricule]?.tel||"—")}</td>`:""}${fin?`<td class="r">${F(e.totalVerse)}</td><td><span class="pill ${e.niv}">${esc(e.situation)}</span>${e.arriere?` <span class="small" style="color:var(--bad)">−${F(e.arriere)}</span>`:""}</td>`:""}<td class="r">${pct(p.assiduite)}</td></tr>`; }).join("") || `<tr><td colspan="9"><div class="empty">Aucun étudiant ne correspond.</div></td></tr>`}
  </tbody></table></div>`;
}
const codeSpec = s => { const m = String(s||"").match(/\(([^)]+)\)\s*$/); return m ? m[1] : (s||"—"); };
function ficheEtu(mat){
  const s = etuBy(mat); if (!s) return;
  const C = S.C, e = C.etu[mat], p = C.peda[mat], fin = can("fin.voir");
  const moisCells = C.mois.map(m => { const v = e.parMois[m.code]||0; const st = v>=P().mensualite?"ok": m.fin<C.today?(v?"part":"due"): (m.debut<=C.today?"cur":(v?"part":"fut")); return `<div class="row" style="justify-content:space-between"><span class="small">${esc(m.libelle)}</span><span class="cell ${st}">${v>=P().mensualite?"Soldé":v?F(v):(st==="fut"?"À venir":"0")}</span></div>`; }).join("");
  const wa = S.prive[mat]?.tel && waLink(S.prive[mat].tel, relanceMsg(s, e));
  openSheet(`<div class="spread"><div><h2>${esc(s.nom)}</h2><p class="small muted num">${esc(s.matricule)} · ${esc(s.niveau)} · ${esc(s.specialite)}</p></div>${fin?`<span class="pill ${e.niv}">${esc(e.situation)}</span>`:""}</div>
    <dl class="dl"><dt>Académie</dt><dd>${s.academie?"Inscrit(e)":"Non inscrit(e)"}</dd><dt>Statut</dt><dd>${esc(s.statut||"Actif")}</dd>${can("tel.voir")?`<dt>Téléphone</dt><dd class="num">${esc(S.prive[mat]?.tel||"Non renseigné")}</dd>`:""}</dl>
    ${fin?`<div class="card"><h3>Situation financière</h3>
      <dl class="dl"><dt>Inscription</dt><dd>${F(e.inscPayee)} / ${F(P().inscription)} FCFA ${e.inscOk?'<span class="pill ok">Soldée</span>':'<span class="pill warn">À compléter</span>'}</dd>
      <dt>Part imputée aux cotisations</dt><dd>${F(e.imputation)} FCFA</dd><dt>Cotisations versées</dt><dd>${F(e.cotiDirect)} FCFA</dd>
      <dt>Arriéré (mois échus)</dt><dd style="color:${e.arriere?"var(--bad)":"inherit"}">${F(e.arriere)} FCFA</dd>${C.courant?`<dt>Reste du mois en cours</dt><dd>${F(e.resteCourant)} FCFA</dd>`:""}</dl>
      <div class="plist">${moisCells}</div>
      <details><summary>Versements (${e.versements.length})</summary><div class="tablewrap"><table><tbody>${e.versements.map(v=>`<tr><td class="num">${esc(v.num)}</td><td>${dFR(v.date)}</td><td class="small">${esc(v.nature)}</td><td class="r">${F(v.montant)}</td><td class="small">${esc(v.mode)}</td></tr>`).join("")||'<tr><td>Aucun versement</td></tr>'}</tbody></table></div></details>
    </div>`:""}
    ${can("peda.voir")||can("*")?`<div class="card"><h3>Suivi pédagogique</h3><p class="small">Assiduité globale : <b>${pct(p.assiduite)}</b> (${p.pres}/${p.total} séances)</p>
      ${Object.keys(p.par).length?`<div class="tablewrap"><table><thead><tr><th>Formation</th><th class="r">Assiduité</th><th class="r">Note</th><th>Résultat</th></tr></thead><tbody>${Object.entries(p.par).map(([c,f])=>`<tr><td>${esc(c)} · <span class="small">${esc(nomForm(c))}</span></td><td class="r">${pct(f.assiduite)}</td><td class="r">${f.note==null?"—":esc(f.note)}</td><td>${f.valide==null?'<span class="pill mute">En cours</span>':f.valide?'<span class="pill ok">Validée</span>':'<span class="pill bad">Non validée</span>'}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Aucune séance ni note pour l'instant.</div>`}</div>`:""}
    <div class="row">${can("enc.saisir")?`<button class="btn primary" id="fEnc">+ Encaissement</button>`:""}${can("etu.gerer")?`<button class="btn" id="fEdit">Modifier la fiche</button>`:""}${wa&&fin&&(e.arriere||e.resteCourant||!e.inscOk)?`<a class="btn vert" href="${wa}" target="_blank" rel="noopener">Relancer sur WhatsApp</a>`:""}<button class="btn" data-close>Fermer</button></div>`);
  $("#fEnc") && ($("#fEnc").onclick = () => formEnc(mat));
  $("#fEdit") && ($("#fEdit").onclick = () => formEtu(mat));
}
const nomForm = c => (P().formations||[]).find(f=>f.code===c)?.intitule || "";
function waLink(tel, msg){ let t = String(tel).replace(/\D/g,""); if (t.length===10) t = "225"+t; return `https://wa.me/${t}?text=${encodeURIComponent(msg)}`; }
function relanceMsg(s, e){
  const prenom = s.nom.split(" ").slice(1).join(" ") || s.nom;
  const parts = [];
  if (!e.inscOk) parts.push(`le solde de votre inscription (${F(P().inscription - e.inscPayee)} FCFA)`);
  if (e.arriere) parts.push(`un arriéré de cotisation de ${F(e.arriere)} FCFA`);
  if (e.resteCourant && S.C.courant) parts.push(`${F(e.resteCourant)} FCFA pour la cotisation de ${S.C.courant.libelle}`);
  return `Bonjour ${prenom}, ici la Communauté Virtuelle de Port-Bouët (CVPB). Selon notre registre, il reste ${parts.join(", ")}. Merci de régulariser auprès de la responsable des encaissements dès que possible. Si vous avez déjà payé, signalez-le-nous pour que nous vérifiions. Bonne journée !`;
}
async function formEtu(mat){
  const isNew = !mat, s = isNew ? {niveau:"Licence 1", academie:true, statut:"Actif"} : etuBy(mat);
  const specs = (P().specialites||[]).map(x=>`${x.intitule} (${x.code})`);
  openSheet(`<h2>${isNew?"Nouvel étudiant":"Modifier "+esc(s.nom)}</h2>
  <form id="ef" class="form">
    ${isNew?`<p class="small muted">Le matricule sera généré automatiquement (${esc(P().prefixe)}XXXX).</p>`:`<p class="small num">Matricule : <b>${esc(s.matricule)}</b> (définitif)</p>`}
    <label class="f" for="e_n">Nom et prénoms<input type="text" id="e_n" required maxlength="80" value="${esc(s.nom)}"></label>
    <div class="g2">
      <label class="f" for="e_niv">Niveau<select id="e_niv">${opts(P().niveaux, s.niveau)}</select></label>
      <label class="f" for="e_sp">Spécialité<select id="e_sp">${opts(specs.includes(s.specialite)||!s.specialite?specs:[s.specialite,...specs], s.specialite, "Choisir…")}</select></label>
      <label class="f" for="e_tel">Téléphone / WhatsApp<input type="text" id="e_tel" inputmode="tel" maxlength="20" value="${esc(S.prive[mat]?.tel||"")}" placeholder="07 00 00 00 00"></label>
      <label class="f" for="e_st">Statut<select id="e_st">${opts(["Actif","Inactif"], s.statut||"Actif")}</select></label>
    </div>
    <label class="row small"><input type="checkbox" id="e_ac" ${s.academie?"checked":""}> Inscrit(e) à la CVPB Académie</label>
    <div id="dup"></div>
    <div class="row"><button class="btn primary" type="submit">${isNew?"Enregistrer et générer le matricule":"Enregistrer"}</button><button class="btn" type="button" data-close>Annuler</button></div>
  </form>`);
  const chk = () => { const n = normNom($("#e_n").value), t = $("#e_tel").value.replace(/\D/g,"");
    const d = S.etudiants.filter(x => x.matricule!==mat && ((n && normNom(x.nom)===n) || (t.length>=8 && (S.prive[x.matricule]?.tel||"").replace(/\D/g,"").endsWith(t.slice(-8)))));
    $("#dup").innerHTML = d.length ? `<div class="banner">Doublon possible : ${d.map(x=>esc(x.matricule+" · "+x.nom)).join(", ")}. Vérifiez avant d'enregistrer.</div>` : ""; };
  $("#e_n").oninput = chk; $("#e_tel").oninput = chk; chk();
  $("#ef").onsubmit = async ev => {
    ev.preventDefault();
    const data = {nom:$("#e_n").value.trim().replace(/\s+/g," "), niveau:$("#e_niv").value, specialite:$("#e_sp").value, statut:$("#e_st").value, academie:$("#e_ac").checked, majLe:nowISO()};
    if (!data.nom){ toast("Le nom est obligatoire."); return; }
    const tel = $("#e_tel").value.trim();
    let id = mat;
    const ok = await write(async () => {
      if (isNew){ id = await numero("etudiants", P().prefixe, S.etudiants, "matricule", id => ({...data, matricule:id, creeLe:nowISO()})); }
      else await S.db.doc("etudiants/"+id).update(data);
      if (tel !== (S.prive[id]?.tel||"")) await S.db.doc("prive/"+id).set({tel});
    }, isNew ? "Étudiant enregistré" : "Fiche mise à jour");
    if (ok){ if (isNew){ log("etudiant", `Nouvel étudiant ${id} · ${data.nom}`, ["president","pedagogie","tresorerie"]); toast(`Matricule attribué : ${id}`); } closeSheet(); }
  };
}

/* ---- Registre des encaissements ---- */
function vRegistre(){
  const f = S.rf, C = S.C;
  let L = S.encaissements.slice().sort((a,b)=>(b.num).localeCompare(a.num));
  if (f.statut==="valides") L = L.filter(valide); else if (f.statut==="annulees") L = L.filter(e=>!valide(e));
  if (f.nature) L = L.filter(e=>e.nature===f.nature);
  if (f.mois) L = L.filter(e=>e.mois===f.mois);
  const q = normNom(f.q); if (q) L = L.filter(e=>normNom(e.num+" "+e.matricule+" "+e.nom+" "+e.payeur+" "+e.ref).includes(q));
  const tot = L.filter(valide).reduce((a,e)=>a+e.montant,0);
  return `<div class="spread"><h2>Registre des encaissements</h2><div class="row">${can("export")?`<button class="btn" id="expReg">Exporter (CSV)</button>`:""}${can("enc.saisir")?`<button class="btn primary" id="newEnc">+ Encaissement</button>`:""}</div></div>
  <div class="kpis">${Object.entries(C.parNature).map(([k,v],i)=>`<div class="kpi ${i%2?"g":""}"><span class="v">${F(v)}</span><span class="l">${esc(k)}</span></div>`).join("")}</div>
  <div class="filters">
    <input type="search" id="rq" placeholder="N°, matricule, nom ou référence" value="${esc(f.q)}" aria-label="Recherche">
    <select id="rnat" aria-label="Nature">${opts(NATURES, f.nature, "Toutes natures")}</select>
    <select id="rmois" aria-label="Mois">${opts(C.mois.map(m=>[m.code,m.libelle]), f.mois, "Tous les mois")}</select>
    <select id="rst" aria-label="Écriture">${opts([["valides","Écritures valides"],["annulees","Écritures annulées"],["toutes","Toutes"]], f.statut)}</select>
  </div>
  <p class="small muted">${L.length} écriture(s) · total des écritures valides affichées : <b>${FC(tot)}</b>. Aucune écriture ne se supprime : une erreur s'annule avec motif.</p>
  <div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Matricule</th><th>Nom / payeur</th><th>Nature</th><th>Mois</th><th class="r">Montant</th><th>Mode</th><th>Référence</th><th>Encaissé par</th><th></th></tr></thead><tbody>
  ${L.map(e=>`<tr class="${valide(e)?"":"annule"}"><td class="num keep">${esc(e.num)}</td><td>${dFR(e.date)}</td><td class="num">${esc(e.matricule||"—")}</td><td>${esc(e.nom||e.payeur||"—")}</td><td class="small">${esc(e.nature)}</td><td class="small">${esc(moisLib(e.mois))}</td><td class="r">${F(e.montant)}</td><td>${esc(e.mode)}</td><td class="num small">${esc(e.ref)}</td><td>${esc(e.encaissePar)}</td><td class="keep">${valide(e)?(can("enc.annuler")?`<button class="btn sm ghost" data-ann="${esc(e.num)}">Annuler</button>`:""):`<span class="pill bad" title="${esc(e.motif||"")}">Annulée</span>`}</td></tr>`).join("") || `<tr><td colspan="11"><div class="empty">Aucune écriture.</div></td></tr>`}
  </tbody></table></div>`;
}
const moisLib = c => S.C.mois.find(m=>m.code===c)?.libelle || c || "—";
function formEnc(matInit){
  const C = S.C, c = compte();
  const encs = [...new Set([...(P().encaisseurs||[]), c.nom])].filter(Boolean);
  openSheet(`<h2>Nouvel encaissement</h2>
  <form id="nf" class="form">
    <label class="f" for="n_m">Étudiant (matricule ou nom)<input type="text" id="n_m" list="dl_etu" autocomplete="off" value="${matInit?esc(matInit+" · "+etuBy(matInit).nom):""}" placeholder="Tapez un nom ou CVPB-26-…"><span class="hint">Laissez vide pour un payeur hors liste (don, sponsor, tiers).</span></label>
    <datalist id="dl_etu">${S.etudiants.map(s=>`<option value="${esc(s.matricule+" · "+s.nom)}"></option>`).join("")}</datalist>
    <div id="n_sit"></div>
    <label class="f" for="n_py" id="n_pyw" hidden>Payeur hors liste<input type="text" id="n_py" maxlength="80"></label>
    <div class="g2">
      <label class="f" for="n_na">Nature<select id="n_na">${opts(NATURES)}</select></label>
      <label class="f" for="n_mo">Mois concerné<select id="n_mo">${opts(C.mois.map(m=>[m.code,m.libelle]), C.courant?.code, "—")}</select></label>
      <label class="f" for="n_mt">Montant encaissé (FCFA)<input type="number" id="n_mt" min="1" step="1" required></label>
      <label class="f" for="n_d">Date<input type="date" id="n_d" value="${today()}" max="${today()}" required></label>
      <label class="f" for="n_md">Mode de paiement<select id="n_md">${opts(P().modes)}</select></label>
      <label class="f" for="n_rf">Référence de la transaction<input type="text" id="n_rf" maxlength="40" placeholder="Ex. WV-NV-014"></label>
      <label class="f" for="n_by">Encaissé par<select id="n_by">${opts(encs, c.nom)}</select></label>
      <label class="f" for="n_ob">Observations<input type="text" id="n_ob" maxlength="200"></label>
    </div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer l'encaissement</button><button class="btn" type="button" data-close>Annuler</button></div>
  </form>`);
  const matOf = () => { const v = $("#n_m").value.trim(); const m = v.split("·")[0].trim().toUpperCase(); return etuBy(m) ? m : null; };
  const suggest = () => {
    const m = matOf(), e = m && C.etu[m], na = $("#n_na").value;
    $("#n_pyw").hidden = !!m;
    $("#n_sit").innerHTML = e ? `<div class="banner" style="border-color:var(--line);background:var(--violet-soft)">Inscription ${e.inscOk?"soldée":"à compléter : reste "+F(P().inscription-e.inscPayee)+" FCFA"} · arriéré ${F(e.arriere)} FCFA${C.courant?` · reste ${esc(C.courant.libelle)} : ${F(e.resteCourant)} FCFA`:""}</div>` : ($("#n_m").value.trim()?`<div class="banner">Étudiant introuvable : choisissez dans la liste ou laissez vide pour un payeur hors liste.</div>`:"");
    if (!$("#n_mt").dataset.touched){
      let v = "";
      if (na===N_INSC) v = e ? Math.max(0, P().inscription - e.inscPayee) || P().inscription : P().inscription;
      else if (na===N_COTI) v = e ? (e.arriere + e.resteCourant) || P().mensualite : P().mensualite;
      else if (na===NATURES[2]) v = P().tshirt;
      $("#n_mt").value = v || "";
    }
  };
  $("#n_mt").oninput = () => $("#n_mt").dataset.touched = "1";
  $("#n_m").oninput = suggest; $("#n_na").onchange = suggest; suggest();
  $("#nf").onsubmit = async ev => {
    ev.preventDefault();
    const m = matOf(), s = m && etuBy(m), montant = Math.round(Number($("#n_mt").value));
    const payeur = $("#n_py").value.trim();
    if ($("#n_m").value.trim() && !m){ toast("Étudiant introuvable : sélectionnez-le dans la liste."); return; }
    if (!m && !payeur){ toast("Indiquez l'étudiant ou le payeur hors liste."); return; }
    if (!(montant>0)){ toast("Le montant doit être supérieur à 0."); return; }
    const na = $("#n_na").value, mo = $("#n_mo").value;
    if ((na===N_COTI) && !mo){ toast("Indiquez le mois concerné par la cotisation."); return; }
    const ref = $("#n_rf").value.trim();
    if ($("#n_md").value!=="Espèces" && !ref){ toast("La référence est obligatoire pour un paiement mobile ou bancaire."); return; }
    if (ref && S.encaissements.some(e=>valide(e) && (e.ref||"").trim().toUpperCase()===ref.toUpperCase())){ toast("Cette référence de transaction existe déjà dans le registre."); return; }
    let id;
    const ok = await write(async () => {
      id = await numero("encaissements", "ENC-", S.encaissements, "num", id => ({num:id, date:$("#n_d").value, matricule:m||"", nom:s?.nom||"", payeur:m?"":payeur, niveau:s?.niveau||"", nature:na, mois:mo, montant, mode:$("#n_md").value, ref, encaissePar:$("#n_by").value, statut:"Valide", obs:$("#n_ob").value.trim(), saisiPar:S.uid, saisiLe:nowISO()}));
    }, "Encaissement enregistré");
    if (ok){ log("encaissement", `${id} · ${FC(montant)} · ${na} · ${s?.nom||payeur}`, ["president","tresorerie"], {montant}); closeSheet(); }
  };
}
function annulerEnc(num){
  const e = S.encaissements.find(x=>x.num===num);
  openSheet(`<h2>Annuler ${esc(num)}</h2><p class="small">${esc(e.nom||e.payeur)} · ${FC(e.montant)} · ${esc(e.nature)}. L'écriture reste visible, barrée, et sort des totaux.</p>
    <label class="f" for="an_m">Motif de l'annulation<textarea id="an_m" maxlength="300" required></textarea></label>
    <div class="row"><button class="btn danger" id="anOk">Confirmer l'annulation</button><button class="btn" data-close>Retour</button></div>`);
  $("#anOk").onclick = async () => { const motif = $("#an_m").value.trim(); if (!motif){ toast("Le motif est obligatoire."); return; }
    if (await write(()=>S.db.doc("encaissements/"+num).update({statut:"Annulée", motif, annulePar:compte().nom, annuleLe:nowISO()}), "Écriture annulée")){ log("annulation", `${num} annulé (${FC(e.montant)}) : ${motif}`, ["president","tresorerie","caisse"]); closeSheet(); } };
}

/* ---- Suivi des cotisations ---- */
function vCotisations(){
  const C = S.C, f = S.f, tel = can("tel.voir");
  let L = S.etudiants.slice().sort((a,b)=>(C.etu[b.matricule].arriere-C.etu[a.matricule].arriere)||a.matricule.localeCompare(b.matricule));
  if (f.situation) L = L.filter(s=>C.etu[s.matricule].situation===f.situation);
  const actifs = S.etudiants.filter(s=>s.statut!=="Inactif");
  const tot = k => actifs.reduce((a,s)=>a+C.etu[s.matricule][k],0);
  const attenduCourant = C.courant ? actifs.length*P().mensualite : 0;
  const recuCourant = C.courant ? actifs.reduce((a,s)=>a+(C.etu[s.matricule].parMois[C.courant.code]||0),0) : 0;
  return `<div class="spread"><h2>Suivi des inscriptions et cotisations</h2>${can("export")?`<button class="btn" id="expCot">Exporter (CSV)</button>`:""}</div>
  <div class="kpis">
    <div class="kpi"><span class="v">${actifs.filter(s=>C.etu[s.matricule].inscOk).length} / ${actifs.length}</span><span class="l">inscriptions soldées</span></div>
    <div class="kpi g"><span class="v">${C.courant?pct(attenduCourant?recuCourant/attenduCourant:null):"—"}</span><span class="l">${C.courant?`collecté pour ${esc(C.courant.libelle)} (${F(recuCourant)} / ${F(attenduCourant)})`:"aucun mois de cotisation en cours"}</span></div>
    <div class="kpi ${tot("arriere")?"bad":""}"><span class="v">${F(tot("arriere"))}</span><span class="l">FCFA d'arriérés (mois échus)</span></div>
    <div class="kpi g"><span class="v">${F(tot("pool"))}</span><span class="l">FCFA affectés aux cotisations</span></div>
  </div>
  <div class="row"><select id="csit" style="width:auto" aria-label="Situation">${opts(["À jour","Mois en cours","En retard","Inscription incomplète","Aucun paiement","Inactif"], f.situation, "Toutes situations")}</select>
  <span class="small muted">Règle : l'inscription (${F(P().inscription)} FCFA) comprend le T-shirt (${F(P().tshirt)}) ; tout montant au-delà du T-shirt est imputé aux cotisations, affectées mois après mois. Un mois devient un arriéré une fois terminé.</span></div>
  <div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom et prénoms</th><th>Inscription</th>${C.mois.map(m=>`<th title="${esc(m.libelle)}">${esc(m.code)}</th>`).join("")}<th class="r">Arriéré</th><th>Situation</th>${tel?"<th></th>":""}</tr></thead><tbody>
  ${L.map(s=>{ const e = C.etu[s.matricule]; return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${e.inscOk?'<span class="cell ok">Soldée</span>':e.inscPayee?`<span class="cell part">${F(e.inscPayee)}</span>`:e.tshirtVendu?'<span class="cell part" title="T-shirt acheté hors inscription">T-shirt seul</span>':'<span class="cell due">Non payée</span>'}</td>
    ${C.mois.map(m=>{ const v = e.parMois[m.code]||0, full = v>=P().mensualite; const st = full?"ok": m.fin<C.today?(v?"part":"due"): m.debut<=C.today?"cur":(v?"part":"fut"); return `<td><span class="cell ${st}">${full?"✓":v?F(v):st==="fut"?"·":"0"}</span></td>`; }).join("")}
    <td class="r" style="color:${e.arriere?"var(--bad)":"inherit"}">${F(e.arriere)}</td><td><span class="pill ${e.niv}">${esc(e.situation)}</span></td>
    ${tel?`<td>${S.prive[s.matricule]?.tel && (e.arriere||e.resteCourant||!e.inscOk) && s.statut!=="Inactif" ?`<a class="btn sm" href="${waLink(S.prive[s.matricule].tel, relanceMsg(s,e))}" target="_blank" rel="noopener" data-stop="1">Relancer</a>`:""}</td>`:""}</tr>`; }).join("")}
  </tbody></table></div>
  <p class="small muted">✓ mois soldé · montant = paiement partiel · 0 en rouge = mois échu impayé · violet = mois en cours · · = à venir.</p>`;
}

/* ---- Caisse ---- */
function vCaisse(){
  const C = S.C, K = C.caisse, enc = role()==="encaissement", reg = ["president","tresorerie"].includes(role());
  const sub = enc ? "depots" : S.sub.caisse;
  const tabs = enc ? [] : [["synthese","Synthèse"],["depots","Dépôts des encaissements"],["operations","Entrées et sorties"],["livre","Livre de caisse"]];
  let body = "";
  if (sub==="synthese") body = `
    <div class="kpis">
      <div class="kpi g ${K.solde<P().seuils.soldeMin?"bad":""}"><span class="v">${F(K.solde)}</span><span class="l">FCFA solde de caisse</span></div>
      <div class="kpi"><span class="v">${F(K.dispo)}</span><span class="l">FCFA disponibles après engagements (${F(K.engage)})</span></div>
      <div class="kpi ${K.especes>P().seuils.plafondEspeces?"warn":""}"><span class="v">${F(K.especes)}</span><span class="l">FCFA en espèces (estimation)</span></div>
      <div class="kpi g"><span class="v">${F(K.frais)}</span><span class="l">FCFA de frais de transaction</span></div>
    </div>
    <div class="card"><h3>${reg?"Rapprochement registre ↔ caisse":"Calcul du solde"}</h3>
      <div class="tablewrap"><table class="wrap"><tbody>
        ${reg?`<tr><td>Total encaissé au registre (écritures valides)</td><td class="r">${FC(C.totalEncaisse)}</td></tr>
        <tr><td>Montants du registre couverts par des dépôts (validés + en attente)</td><td class="r">${FC(C.totalEncaisse-K.nonRemis)}</td></tr>
        <tr><td><b>Encaissé non encore remis à la caisse</b></td><td class="r" style="color:${K.nonRemis<0?"var(--bad)":"inherit"}"><b>${FC(K.nonRemis)}</b></td></tr>`:""}
        <tr><td>Solde d'ouverture</td><td class="r">${FC(P().soldeOuverture)}</td></tr>
        <tr><td>+ Dépôts reçus (net de frais)</td><td class="r">${FC(K.recuDepots)}</td></tr>
        <tr><td>+ Autres entrées</td><td class="r">${FC(K.entreesTot)}</td></tr>
        <tr><td>− Sorties approuvées</td><td class="r">${FC(K.sortiesTot)}</td></tr>
        <tr><td><b>= Solde de caisse</b></td><td class="r"><b>${FC(K.solde)}</b></td></tr>
      </tbody></table></div>
      <p class="small muted">Dernier dépôt : ${K.dernierDepot?dFR(K.dernierDepot)+` (il y a ${K.joursSansDepot} jour(s))`:"aucun"}. Les montants prévus ou engagés ne sont jamais comptés comme encaissés.</p>
    </div>
    <div class="card"><h3>Alertes de caisse</h3>${alertesHTML(mesAlertes().filter(a=>a.lien==="#caisse"))}</div>`;
  if (sub==="depots"){
    const L = S.depots.slice().sort((a,b)=>b.num.localeCompare(a.num));
    body = `<div class="spread"><p class="small muted">Une ligne = une remise de fonds de la responsable des encaissements à la caisse. Frais = montant du registre − montant net reçu.</p>${can("depot.declarer")?`<button class="btn primary" id="newDep">Déclarer un dépôt</button>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Remis par</th><th>Période</th><th class="r">Registre</th><th class="r">Net reçu</th><th class="r">Frais</th><th>Mode</th><th>Référence</th><th>Statut</th><th></th></tr></thead><tbody>
    ${L.map(d=>`<tr class="${d.statut==="Annulé"?"annule":""}"><td class="num keep">${esc(d.num)}</td><td>${dFR(d.date)}</td><td>${esc(d.remisPar)}</td><td class="small">${dFR(d.du)} → ${dFR(d.au)}</td><td class="r">${F(d.montantRegistre)}</td><td class="r">${F(d.montantNet)}</td><td class="r">${F(d.frais)}</td><td>${esc(d.mode)}</td><td class="small num">${esc(d.ref)}</td><td class="keep"><span class="pill ${d.statut==="Validé"?"ok":d.statut==="Annulé"?"bad":"warn"}">${esc(d.statut)}</span>${d.recuPar?`<div class="small muted">${esc(d.recuPar)}</div>`:""}</td><td class="keep">${d.statut==="En attente"&&can("depot.valider")?`<button class="btn sm vert" data-dval="${esc(d.num)}">Valider</button> <button class="btn sm ghost" data-drej="${esc(d.num)}">Rejeter</button>`:""}</td></tr>`).join("") || `<tr><td colspan="11"><div class="empty">Aucun dépôt.</div></td></tr>`}
    </tbody></table></div>`;
  }
  if (sub==="operations"){
    const L = S.operations.slice().sort((a,b)=>b.num.localeCompare(a.num));
    body = `<div class="spread"><p class="small muted">Sorties à partir de ${FC(P().seuils.approbation)} : approbation de la Présidence obligatoire avant décaissement.</p>${can("op.saisir")?`<button class="btn primary" id="newOp">+ Entrée ou sortie</button>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Catégorie</th><th>Libellé</th><th>Bénéficiaire / source</th><th class="r">Montant</th><th>Mode</th><th>Justificatif</th><th>Approbation</th><th></th></tr></thead><tbody>
    ${L.map(o=>`<tr class="${valide(o)?"":"annule"}"><td class="num keep">${esc(o.num)}</td><td>${dFR(o.date)}</td><td><span class="pill ${o.type==="Entrée"?"ok":"mute"}">${esc(o.type)}</span></td><td class="small">${esc(o.categorie)}</td><td>${esc(o.libelle)}</td><td>${esc(o.beneficiaire)}</td><td class="r">${o.type==="Sortie"?"−":"+"}${F(o.montant)}</td><td>${esc(o.mode)}</td><td>${o.justificatif?'<span class="pill ok">Oui</span>':'<span class="pill warn">Non</span>'}</td><td class="keep">${o.type==="Entrée"?"—":o.approuve===false?'<span class="pill warn">En attente</span>':'<span class="pill ok">Approuvée</span>'}</td><td class="keep">${valide(o)&&o.approuve===false&&can("*")?`<button class="btn sm vert" data-oapp="${esc(o.num)}">Approuver</button> <button class="btn sm ghost" data-orej="${esc(o.num)}">Refuser</button>`:""}${valide(o)&&(can("*")||can("op.saisir"))&&o.approuve!==false?`<button class="btn sm ghost" data-oann="${esc(o.num)}">Annuler</button>`:""}</td></tr>`).join("") || `<tr><td colspan="11"><div class="empty">Aucune opération.</div></td></tr>`}
    </tbody></table></div>`;
  }
  if (sub==="livre"){
    body = `<div class="spread"><p class="small muted">Mouvements effectifs de la caisse, du plus ancien au plus récent, avec le solde après chaque opération.</p>${can("export")?`<button class="btn" id="expLivre">Exporter (CSV)</button>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th>Mode</th><th class="r">Entrée</th><th class="r">Sortie</th><th class="r">Solde</th></tr></thead><tbody>
      <tr><td></td><td></td><td><i>Solde d'ouverture</i></td><td></td><td></td><td></td><td class="r">${F(P().soldeOuverture)}</td></tr>
      ${K.mvts.map(m=>`<tr><td>${dFR(m.date)}</td><td class="num">${esc(m.ref)}</td><td>${esc(m.libelle)}</td><td>${esc(m.mode)}</td><td class="r">${m.entree?F(m.entree):""}</td><td class="r">${m.sortie?F(m.sortie):""}</td><td class="r"><b>${F(m.solde)}</b></td></tr>`).join("")}
    </tbody></table></div>`;
  }
  return `<h2>${enc?"Mes dépôts à la caisse":"Caisse"}</h2><div class="subtabs" role="group" aria-label="Sections de la caisse">${tabs.map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}${k==="depots"&&K.depA.length?` (${K.depA.length})`:""}${k==="operations"&&K.sortiesAttente.length?` (${K.sortiesAttente.length})`:""}</button>`).join("")}</div>${body}`;
}
function formDepot(){
  const c = compte();
  const lastAu = S.depots.filter(d=>d.statut!=="Annulé").map(d=>d.au).sort().pop();
  const du = lastAu ? isoD(new Date(parseD(lastAu).getTime()+86400000)) : (S.encaissements.map(e=>e.date).sort()[0]||today());
  openSheet(`<h2>Déclarer un dépôt à la caisse</h2>
  <form id="df" class="form">
    <div class="g2">
      <label class="f" for="d_du">Période du registre : du<input type="date" id="d_du" value="${du}"></label>
      <label class="f" for="d_au">au<input type="date" id="d_au" value="${today()}"></label>
      <label class="f" for="d_reg">Montant selon le registre (FCFA)<input type="number" id="d_reg" min="1" step="1" required><span class="hint" id="d_hint"></span></label>
      <label class="f" for="d_net">Montant net envoyé à la caisse (FCFA)<input type="number" id="d_net" min="1" step="1" required></label>
      <label class="f" for="d_d">Date du dépôt<input type="date" id="d_d" value="${today()}" max="${today()}"></label>
      <label class="f" for="d_md">Mode de remise<select id="d_md">${opts(P().modes, "Wave")}</select></label>
      <label class="f" for="d_rf">Référence de la transaction<input type="text" id="d_rf" maxlength="40"></label>
      <label class="f" for="d_by">Remis par<input type="text" id="d_by" value="${esc(c.nom)}" maxlength="80"></label>
    </div>
    <p class="small" id="d_frais"></p>
    <div class="row"><button class="btn primary" type="submit">Déclarer le dépôt</button><button class="btn" type="button" data-close>Annuler</button></div>
  </form>`);
  const up = () => {
    const a = $("#d_du").value, b = $("#d_au").value;
    const t = S.encaissements.filter(e=>valide(e) && e.date>=a && e.date<=b).reduce((x,e)=>x+e.montant,0);
    $("#d_hint").textContent = `Le registre totalise ${FC(t)} sur cette période.`;
    if (!$("#d_reg").dataset.t) $("#d_reg").value = t || "";
    const fr = (Number($("#d_reg").value)||0) - (Number($("#d_net").value)||0);
    $("#d_frais").innerHTML = $("#d_net").value ? `Frais de transaction calculés : <b>${FC(fr)}</b>${fr<0?' <span style="color:var(--bad)">(négatif : vérifiez les montants)</span>':""}` : "";
  };
  $("#d_reg").oninput = () => { $("#d_reg").dataset.t="1"; up(); };
  ["#d_du","#d_au","#d_net"].forEach(s=>$(s).oninput = up); up();
  $("#df").onsubmit = async ev => {
    ev.preventDefault();
    const reg = Math.round(Number($("#d_reg").value)), net = Math.round(Number($("#d_net").value));
    if (!(reg>0 && net>0)){ toast("Renseignez les deux montants."); return; }
    if (net > reg){ toast("Le montant net ne peut pas dépasser le montant du registre."); return; }
    if ($("#d_md").value!=="Espèces" && !$("#d_rf").value.trim()){ toast("La référence est obligatoire pour un dépôt mobile ou bancaire."); return; }
    let id;
    const ok = await write(async()=>{ id = await numero("depots", "DEP-", S.depots, "num", id => ({num:id, date:$("#d_d").value, remisPar:$("#d_by").value.trim(), du:$("#d_du").value, au:$("#d_au").value, montantRegistre:reg, montantNet:net, frais:reg-net, mode:$("#d_md").value, ref:$("#d_rf").value.trim(), statut:"En attente", recuPar:"", dateValidation:"", saisiPar:S.uid, saisiLe:nowISO()})); }, "Dépôt déclaré : la caisse est notifiée");
    if (ok){ log("depot", `Dépôt ${id} déclaré : ${FC(net)} net (registre ${FC(reg)})`, ["caisse","president","tresorerie"]); closeSheet(); }
  };
}
async function validerDepot(num, ok){
  const d = S.depots.find(x=>x.num===num);
  if (ok){
    if (await write(()=>S.db.doc("depots/"+num).update({statut:"Validé", recuPar:compte().nom, dateValidation:today()}), "Dépôt validé"))
      log("depot_valide", `Dépôt ${num} validé : ${FC(d.montantNet)} reçus en caisse`, ["encaissement","president","tresorerie"]);
  } else {
    openSheet(`<h2>Rejeter le dépôt ${esc(num)}</h2><label class="f" for="rj">Motif (montant non reçu, écart, référence introuvable…)<textarea id="rj" maxlength="300"></textarea></label><div class="row"><button class="btn danger" id="rjOk">Rejeter</button><button class="btn" data-close>Retour</button></div>`);
    $("#rjOk").onclick = async () => { const m = $("#rj").value.trim(); if (!m){ toast("Le motif est obligatoire."); return; }
      if (await write(()=>S.db.doc("depots/"+num).update({statut:"Annulé", motif:m, recuPar:compte().nom, dateValidation:today()}), "Dépôt rejeté")){ log("depot_rejete", `Dépôt ${num} rejeté : ${m}`, ["encaissement","president","tresorerie"]); closeSheet(); } };
  }
}
function formOp(){
  openSheet(`<h2>Entrée ou sortie de caisse</h2>
  <form id="of" class="form">
    <div class="g2">
      <label class="f" for="o_t">Type<select id="o_t">${opts(["Sortie","Entrée"])}</select></label>
      <label class="f" for="o_c">Catégorie<select id="o_c"></select></label>
      <label class="f" for="o_l">Libellé<input type="text" id="o_l" required maxlength="140" placeholder="Ex. Transport du formateur"></label>
      <label class="f" for="o_b">Bénéficiaire ou source<input type="text" id="o_b" maxlength="80"></label>
      <label class="f" for="o_m">Montant (FCFA)<input type="number" id="o_m" min="1" step="1" required></label>
      <label class="f" for="o_d">Date<input type="date" id="o_d" value="${today()}" max="${today()}"></label>
      <label class="f" for="o_md">Mode<select id="o_md">${opts(P().modes)}</select></label>
      <label class="f" for="o_rf">Référence ou n° de pièce<input type="text" id="o_rf" maxlength="40"></label>
      <label class="f" for="o_a">Autorisé par<input type="text" id="o_a" maxlength="80" value="${esc(compte().nom)}"></label>
    </div>
    <label class="row small"><input type="checkbox" id="o_j"> Justificatif fourni (reçu, capture de transaction, facture)</label>
    <p class="small" id="o_info"></p>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn" type="button" data-close>Annuler</button></div>
  </form>`);
  const up = () => { const t = $("#o_t").value; const cur = $("#o_c").value;
    $("#o_c").innerHTML = opts(t==="Entrée"?P().categoriesEntree:P().categoriesSortie, cur);
    const m = Number($("#o_m").value)||0;
    $("#o_info").innerHTML = t==="Sortie" && m>=P().seuils.approbation && !can("*") ? `<span style="color:var(--warn)">Montant ≥ ${FC(P().seuils.approbation)} : la sortie sera mise en attente d'approbation de la Présidence.</span>` : (t==="Sortie" && m > S.C.caisse.dispo ? `<span style="color:var(--bad)">Attention : montant supérieur au disponible (${FC(S.C.caisse.dispo)}).</span>` : ""); };
  $("#o_t").onchange = up; $("#o_m").oninput = up; up();
  $("#of").onsubmit = async ev => {
    ev.preventDefault();
    const t = $("#o_t").value, m = Math.round(Number($("#o_m").value));
    if (!$("#o_l").value.trim() || !(m>0)){ toast("Libellé et montant sont obligatoires."); return; }
    const attente = t==="Sortie" && m>=P().seuils.approbation && !can("*");
    let id;
    const ok = await write(async()=>{ id = await numero("operations", "OP-", S.operations, "num", id => ({num:id, date:$("#o_d").value, type:t, categorie:$("#o_c").value, libelle:$("#o_l").value.trim(), beneficiaire:$("#o_b").value.trim(), montant:m, mode:$("#o_md").value, ref:$("#o_rf").value.trim(), justificatif:$("#o_j").checked, autorisePar:$("#o_a").value.trim(), approuve: t==="Sortie" ? !attente : true, statut:"Valide", saisiPar:S.uid, saisiLe:nowISO()})); }, attente ? "Sortie en attente d'approbation de la Présidence" : "Opération enregistrée");
    if (ok){ log(attente?"approbation":"operation", `${id} · ${t} ${FC(m)} · ${$("#o_l")?.value||""}${attente?" · à approuver":""}`, attente?["president"]:["president","tresorerie"]); closeSheet(); }
  };
}
async function decisionOp(num, act){
  const o = S.operations.find(x=>x.num===num);
  if (act==="app"){ if (await write(()=>S.db.doc("operations/"+num).update({approuve:true, approuvePar:compte().nom, approuveLe:nowISO()}), "Sortie approuvée")) log("op_app", `Sortie ${num} approuvée (${FC(o.montant)})`, ["caisse","tresorerie"]); return; }
  openSheet(`<h2>${act==="rej"?"Refuser":"Annuler"} ${esc(num)}</h2><p class="small">${esc(o.libelle)} · ${FC(o.montant)}</p><label class="f" for="om">Motif<textarea id="om" maxlength="300"></textarea></label><div class="row"><button class="btn danger" id="omOk">Confirmer</button><button class="btn" data-close>Retour</button></div>`);
  $("#omOk").onclick = async () => { const m = $("#om").value.trim(); if (!m){ toast("Le motif est obligatoire."); return; }
    if (await write(()=>S.db.doc("operations/"+num).update({statut:"Annulée", motif:m, annulePar:compte().nom, annuleLe:nowISO()}), act==="rej"?"Sortie refusée":"Opération annulée")){ log("op_ann", `${num} ${act==="rej"?"refusée":"annulée"} : ${m}`, ["caisse","president","tresorerie"]); closeSheet(); } };
}

/* ---- Suivi pédagogique ---- */
function apprenantsPour(code){
  const f = (P().formations||[]).find(x=>x.code===code);
  const nivs = f ? (f.niveau.includes("2 et 3") ? ["Licence 2","Licence 3"] : [f.niveau]) : null;
  return S.etudiants.filter(s=>s.academie && s.statut!=="Inactif" && (!nivs || nivs.includes(s.niveau))).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
}
function vPedagogie(){
  const C = S.C, sub = S.sub.pedagogie, edit = can("peda.saisir");
  const forms = P().formations||[];
  let body = "";
  if (sub==="seances"){
    const L = S.seances.slice().sort((a,b)=>b.date.localeCompare(a.date));
    body = `<div class="spread"><p class="small muted">P présent · R retard · J absent justifié · A absent non justifié. Le retard compte comme présent.</p>${edit?`<button class="btn vert" id="newSea">Pointer une séance</button>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Formation</th><th class="r">Présents</th><th class="r">Retards</th><th class="r">Absents</th><th class="r">Taux</th><th>Pointé par</th><th></th></tr></thead><tbody>
    ${L.map(se=>{ const v = Object.values(se.presences||{}).filter(Boolean); const c = k=>v.filter(x=>x===k).length; return `<tr><td>${dLong(se.date)}</td><td>${esc(se.formation)} · <span class="small">${esc(nomForm(se.formation))}</span></td><td class="r">${c("P")}</td><td class="r">${c("R")}</td><td class="r">${c("J")+c("A")}</td><td class="r">${v.length?pct((c("P")+c("R"))/v.length):"—"}</td><td class="small">${esc(se.parNom||"")}</td><td>${edit?`<button class="btn sm ghost" data-sea="${esc(se.id)}">Modifier</button>`:""}</td></tr>`; }).join("") || `<tr><td colspan="8"><div class="empty">Aucune séance pointée.</div></td></tr>`}
    </tbody></table></div>`;
  }
  if (sub==="notes"){
    const code = S.sub.noteForm || forms[0]?.code;
    const L = apprenantsPour(code), N = S.notes.find(n=>n.id===code)?.notes || {};
    body = `<div class="row"><label class="f" for="nfo" style="min-width:260px">Formation<select id="nfo">${opts(forms.map(f=>[f.code,`${f.code} · ${f.intitule}`]), code)}</select></label></div>
    <p class="small muted">Note sur 20 (décimales autorisées) ou ABS pour un absent à l'évaluation. Validation : note ≥ ${P().noteMin} et assiduité ≥ ${pct(P().assiduiteMin)}.</p>
    <div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom</th><th class="r">Assiduité</th><th>Note /20</th><th>Résultat</th></tr></thead><tbody>
    ${L.map(s=>{ const f = C.peda[s.matricule].par[code]||{}; const v = N[s.matricule]; return `<tr><td class="num">${esc(s.matricule)}</td><td>${esc(s.nom)}</td><td class="r">${pct(f.assiduite)}</td><td style="width:120px">${edit?`<input type="text" inputmode="decimal" class="noteIn" data-mat="${esc(s.matricule)}" value="${v==null?"":esc(String(v).replace(".",","))}" aria-label="Note de ${esc(s.nom)}" style="min-height:32px;padding:4px 8px">`:esc(v??"—")}</td><td>${f.valide==null?'<span class="pill mute">—</span>':f.valide?'<span class="pill ok">Validée</span>':'<span class="pill bad">Non validée</span>'}</td></tr>`; }).join("") || `<tr><td colspan="5"><div class="empty">Aucun apprenant pour ce niveau.</div></td></tr>`}
    </tbody></table></div>${edit&&L.length?`<div class="row"><button class="btn primary" id="saveNotes">Enregistrer les notes</button></div>`:""}`;
  }
  if (sub==="assiduite"){
    const L = S.etudiants.filter(s=>s.academie && s.statut!=="Inactif").sort((a,b)=>(C.peda[a.matricule].assiduite??2)-(C.peda[b.matricule].assiduite??2));
    body = `<div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom</th><th>Niveau</th><th class="r">Séances</th><th>Assiduité</th><th class="r">Formations validées</th></tr></thead><tbody>
    ${L.map(s=>{ const p = C.peda[s.matricule]; const vals = Object.values(p.par).filter(f=>f.valide!=null); return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${esc(s.niveau)}</td><td class="r">${p.pres}/${p.total}</td><td>${p.assiduite==null?'<span class="muted">—</span>':`<div class="row" style="flex-wrap:nowrap"><span class="bar" style="width:90px"><i style="width:${Math.round(p.assiduite*100)}%;${p.assiduite<P().assiduiteMin?"background:var(--bad)":""}"></i></span><span class="num small">${pct(p.assiduite)}</span></div>`}</td><td class="r">${vals.filter(f=>f.valide).length}/${vals.length}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  }
  return `<h2>Suivi pédagogique · CVPB Académie</h2><div class="subtabs" role="group" aria-label="Sections pédagogiques">${[["seances","Présences"],["notes","Notes"],["assiduite","Assiduité et résultats"]].map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function formSeance(id){
  const se = id ? S.seances.find(x=>x.id===id) : {date:today(), formation:(P().formations||[])[0]?.code, presences:{}};
  const pr = {...(se.presences||{})};
  const draw = () => {
    const L = apprenantsPour($("#s_f").value);
    $("#s_list").innerHTML = L.map(s=>`<div class="prow"><span>${esc(s.nom)} <span class="small muted num">${esc(s.matricule)}</span></span><span class="seg" data-who="${esc(s.matricule)}">${["P","R","J","A"].map(v=>`<button type="button" data-v="${v}" aria-pressed="${pr[s.matricule]===v}">${v}</button>`).join("")}</span></div>`).join("") || `<div class="empty">Aucun apprenant de ce niveau.</div>`;
    $("#s_list").querySelectorAll(".seg button").forEach(b => b.onclick = () => { const w = b.parentElement.dataset.who; pr[w] = pr[w]===b.dataset.v ? "" : b.dataset.v; b.parentElement.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", pr[w]===x.dataset.v)); });
  };
  openSheet(`<h2>${id?"Modifier la séance":"Pointer une séance"}</h2>
    <div class="g2"><label class="f" for="s_d">Date<input type="date" id="s_d" value="${esc(se.date)}" max="${today()}"></label>
    <label class="f" for="s_f">Formation<select id="s_f">${opts((P().formations||[]).map(f=>[f.code,`${f.code} · ${f.intitule}`]), se.formation)}</select></label></div>
    <div class="row"><button class="btn sm" type="button" id="s_all">Tous présents</button><span class="small muted">Laisser vide = non concerné par la séance.</span></div>
    <div class="plist" id="s_list"></div>
    <div class="row"><button class="btn primary" id="s_ok">Enregistrer le pointage</button><button class="btn" data-close>Annuler</button></div>`);
  $("#s_f").onchange = draw; draw();
  $("#s_all").onclick = () => { apprenantsPour($("#s_f").value).forEach(s=>pr[s.matricule]="P"); draw(); };
  $("#s_ok").onclick = async () => {
    const mats = new Set(apprenantsPour($("#s_f").value).map(s=>s.matricule));
    const presences = Object.fromEntries(Object.entries(pr).filter(([k,v])=>v && mats.has(k)));
    if (!Object.keys(presences).length){ toast("Pointez au moins un apprenant."); return; }
    const data = {date:$("#s_d").value, formation:$("#s_f").value, presences, par:S.uid, parNom:compte().nom, majLe:nowISO()};
    const ref = id ? S.db.doc("seances/"+id) : S.db.collection("seances").doc();
    if (await write(()=>ref.set(data), "Présences enregistrées")){ const v=Object.values(presences); log("seance", `Séance ${data.formation} du ${dFR(data.date)} : ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents`, ["president","bureau"]); closeSheet(); }
  };
}
async function saveNotes(code){
  const cur = {...(S.notes.find(n=>n.id===code)?.notes||{})}; let bad = 0;
  document.querySelectorAll(".noteIn").forEach(i => { const raw = i.value.trim().toUpperCase().replace(",","."); if (raw===""){ delete cur[i.dataset.mat]; return; } if (raw==="ABS"){ cur[i.dataset.mat]="ABS"; return; } const n = Number(raw); if (isNaN(n)||n<0||n>20){ bad++; i.style.borderColor="var(--bad)"; return; } cur[i.dataset.mat] = n; });
  if (bad){ toast(`${bad} note(s) invalide(s) : saisissez un nombre entre 0 et 20 ou ABS.`); return; }
  if (await write(()=>S.db.doc("notes/"+code).set({notes:cur, majLe:nowISO(), par:S.uid}), "Notes enregistrées")) log("notes", `Notes ${code} mises à jour (${Object.keys(cur).length} apprenants)`, ["president"]);
}

/* ---- Rapports de tutorat : vue Présidence / Commission Formation ---- */
const statutPill = r => { const s = r.suivi?.statut || "Nouveau"; return `<span class="pill ${s==="Traité"?"ok":s==="Lu"?"mute":"warn"}">${esc(s)}</span>`; };
const jourRap = r => String(r.dateActivite||r.deposeLe||"").slice(0,10);
const codeSp = s => String(s||"").split(" :")[0];
function rapListe(L){
  if (!L.length) return `<div class="empty">Aucun rapport pour l'instant.</div>`;
  return `<div class="plist">${L.map(r=>`<div class="prow"><span><a href="#" data-rap="${esc(r.doc)}|${esc(r.id)}"><b>${esc(r.tuteurNom)}</b></a> <span class="small muted">· ${esc(codeSp(r.specialite))} · ${esc(r.niveau)}</span><br><span class="small muted">${dFR(jourRap(r))} · ${esc(r.theme)} · ${esc(r.presents)}/${esc(r.attendus)} présents</span></span><span class="row" style="flex-wrap:nowrap">${r.intervention==="Oui"?'<span class="pill bad">Intervention</span>':""}${statutPill(r)}</span></div>`).join("")}</div>`;
}
function vTutorat(){
  const T = S.T, f = S.tf;
  let L = T.rapports;
  if (f.tuteur) L = L.filter(r=>normNom(r.tuteurNom)===f.tuteur);
  if (f.spec) L = L.filter(r=>codeSp(r.specialite)===f.spec);
  if (f.statut==="intervention") L = L.filter(r=>r.intervention==="Oui" && (r.suivi?.statut||"Nouveau")!=="Traité");
  else if (f.statut) L = L.filter(r=>(r.suivi?.statut||"Nouveau")===f.statut);
  const tuteurs = Object.values(T.parTuteur).sort((a,b)=>String(a.nom).localeCompare(String(b.nom),"fr"));
  const att = L.reduce((a,r)=>a+(Number(r.attendus)||0),0), pres = L.reduce((a,r)=>a+(Number(r.presents)||0),0);
  return `<div class="spread"><h2>Rapports des tuteurs</h2>${can("export")?`<button class="btn" id="expTut">Exporter (CSV)</button>`:""}</div>
  <div class="kpis">${kpi(T.rapports.length,"rapports reçus")}${kpi(T.nouveaux.length,"non lus", T.nouveaux.length?"warn":"g")}${kpi(T.aTraiter.length,"interventions à traiter", T.aTraiter.length?"bad":"g")}${kpi(pct(T.tauxRecents),"présence aux séances (30 j)","g")}</div>
  <div class="card"><h3>Suivi par tuteur</h3><div class="tablewrap"><table><thead><tr><th>Tuteur</th><th class="r">Rapports</th><th>Dernier rapport</th><th class="r">Présence</th><th class="r">Participation /5</th><th>Prochaine séance</th><th>Compte</th></tr></thead><tbody>
  ${tuteurs.map(t=>`<tr class="click" data-tut="${esc(t.doc)}"><td><b>${esc(t.nom)}</b></td><td class="r">${t.n}</td><td>${t.dernier?`${dFR(t.dernier)} ${t.joursSans>10?'<span class="pill warn">'+t.joursSans+' j</span>':""}`:'<span class="pill warn">Aucun</span>'}</td><td class="r">${pct(t.taux)}</td><td class="r">${t.partMoy==null?"—":t.partMoy.toFixed(1).replace(".",",")}</td><td>${t.prochaine?dLong(t.prochaine.slice(0,10)):"—"}</td><td>${t.compte?'<span class="pill ok">Espace Tuteurs</span>':'<span class="pill mute">Formulaire Google</span>'}</td></tr>`).join("")||'<tr><td colspan="7"><div class="empty">Aucun tuteur.</div></td></tr>'}
  </tbody></table></div></div>
  <div class="filters">
    <select id="tfT" aria-label="Tuteur">${opts(tuteurs.map(t=>[t.doc,t.nom]), f.tuteur, "Tous les tuteurs")}</select>
    <select id="tfS" aria-label="Spécialité">${opts(SPECS_FORM.map(s=>[codeSp(s),codeSp(s)]), f.spec, "Toutes spécialités")}</select>
    <select id="tfst" aria-label="Statut">${opts([["Nouveau","Non lus"],["Lu","Lus"],["Traité","Traités"],["intervention","Interventions à traiter"]], f.statut, "Tous les statuts")}</select>
    <span class="small muted" style="align-self:center">${L.length} rapport(s) · ${pres}/${att} étudiants présents</span>
  </div>
  <div class="tablewrap"><table><thead><tr><th>Date</th><th>Tuteur</th><th>Spécialité</th><th>Niveau</th><th>Thème</th><th class="r">Présents</th><th class="r">Particip.</th><th>Difficultés</th><th>Suivi</th></tr></thead><tbody>
  ${L.map(r=>`<tr class="click" data-rap="${esc(r.doc)}|${esc(r.id)}"><td>${dFR(jourRap(r))}</td><td><b>${esc(r.tuteurNom)}</b></td><td>${esc(codeSp(r.specialite))}</td><td>${esc(r.niveau)}</td><td style="white-space:normal;min-width:180px">${esc(r.theme)}</td><td class="r">${esc(r.presents)}/${esc(r.attendus)}</td><td class="r">${esc(r.participation||"—")}</td><td>${r.difficultes==="Oui"?'<span class="pill warn">Oui</span>':'<span class="pill mute">Non</span>'}${r.intervention==="Oui"?' <span class="pill bad">Intervention</span>':""}</td><td>${statutPill(r)}</td></tr>`).join("")||'<tr><td colspan="9"><div class="empty">Aucun rapport ne correspond.</div></td></tr>'}
  </tbody></table></div>
  <p class="small muted">Les tuteurs se connectent avec leur compte Google UVCI, une fois ajoutés dans Administration.</p>`;
}
function rapportHTML(r){
  const sec = (t, rows) => `<h4>${t}</h4>${rows.filter(([,v])=>v!=null&&v!=="").map(([k,v])=>`<div><span class="small muted">${k}</span><p>${esc(v)}</p></div>`).join("")}`;
  const dt = s => s ? new Date(String(s).replace(" ","T")).toLocaleString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
  const ets = (r.etudiantsPresents||[]).map(m=>etuBy(m)?.nom||m).join(", ");
  return `<div class="rep">
    ${sec("Identification du tuteur",[["Tuteur",r.tuteurNom],["Filière ou spécialité encadrée",r.specialite],["Niveau d'étude encadré",r.niveau],["Période couverte",r.periode]])}
    ${sec("Séance ou activité",[["Date de l'activité",dt(r.dateActivite)],["Type d'activité",(r.types||[]).join(" · ")],["Thème ou contenu",r.theme],["Compte rendu",r.compteRendu]])}
    ${sec("Participation et assiduité",[["Étudiants présents / attendus",`${r.presents} / ${r.attendus}${Number(r.attendus)?` (${Math.round(r.presents/r.attendus*100)} %)`:""}`],["Niveau de participation",r.participation?`${r.participation}/5 · ${PARTICIPATION[r.participation]||""}`:""],["Étudiants présents (liste)",ets],["Observations",r.obsParticipation]])}
    ${sec("Difficultés et besoins",[["Difficultés rencontrées",r.difficultes],["Nature",(r.natures||[]).join(" · ")],["Description",r.descDifficultes],["Intervention des responsables nécessaire",r.intervention],["Situation à traiter",r.intervention==="Oui"?r.interventionDetail:""]])}
    ${sec("Actions et recommandations",[["Actions déjà entreprises",r.actionsEntreprises],["Actions prévues pour la prochaine séance",r.actionsPrevues],["Recommandations à l'administration",r.recommandations],["Prochaine séance prévue",dt(r.prochaineSeance)]])}
    ${sec("Validation",[["Commentaire final",r.commentaire],["Confirmation",r.confirme?"Le tuteur confirme l'exactitude des informations.":""],["Déposé le",dt(r.deposeLe)],["Origine",r.source==="google"?"Importé du formulaire Google":"Espace Tuteurs"]])}
  </div>`;
}
function ficheRapport(doc, id){
  const r = S.T.rapports.find(x=>x.doc===doc && x.id===id); if (!r) return;
  const s = r.suivi || {};
  openSheet(`<div class="spread"><h2>Rapport de tutorat</h2>${statutPill(r)}</div>${rapportHTML(r)}
    ${can("tut.suivre")?`<div class="card"><h3>Suivi de la Commission</h3>
      <label class="f" for="su_s">Statut<select id="su_s">${opts(["Nouveau","Lu","Traité"], s.statut||"Lu")}</select></label>
      <label class="f" for="su_r">Réponse au tuteur (visible dans son espace)<textarea id="su_r" maxlength="1500">${esc(s.reponse||"")}</textarea></label>
      <div class="row"><button class="btn primary" id="su_ok">Enregistrer le suivi</button><button class="btn" data-close>Fermer</button></div></div>`
    : `${s.reponse?`<div class="banner">Réponse : ${esc(s.reponse)}</div>`:""}<div class="row"><button class="btn" data-close>Fermer</button></div>`}`);
  if (can("tut.suivre") && (s.statut||"Nouveau")==="Nouveau") S.db.doc("rapports_tuteurs/"+doc).update({rapports:{[id]:{suivi:{statut:"Lu", par:compte().nom, le:nowISO()}}}}).catch(()=>{});
  $("#su_ok") && ($("#su_ok").onclick = async () => {
    const suivi = {statut:$("#su_s").value, reponse:$("#su_r").value.trim(), par:compte().nom, le:nowISO()};
    if (await write(()=>S.db.doc("rapports_tuteurs/"+doc).update({rapports:{[id]:{suivi}}}), "Suivi enregistré")){
      log("tut_suivi", `Rapport du ${dFR(jourRap(r))} (${r.theme}) : ${suivi.statut}${suivi.reponse?" · réponse de la Commission":""}`, ["u:"+doc, "president", "formation"]); closeSheet();
    }
  });
}

/* ---- Espace Tuteurs ---- */
const TVIEWS = [{id:"t-accueil", l:"Mon tableau de bord"},{id:"t-nouveau", l:"Nouveau rapport"},{id:"t-rapports", l:"Mes rapports"},{id:"t-notifs", l:"Notifications"},{id:"t-compte", l:"Mon compte"}];
function tview(){ const h = location.hash.slice(1); return TVIEWS.some(v=>v.id===h) ? h : "t-accueil"; }
const mesRapports = () => S.T.rapports.filter(r=>r.doc===S.uid);
function renderTuteur(main){
  const v = tview();
  $("#tabs").innerHTML = TVIEWS.map(x=>`<a href="#${x.id}" ${x.id===v?'aria-current="page"':""}>${esc(x.l)}${x.id==="t-notifs"&&nonLues().length?` (${nonLues().length})`:""}</a>`).join("");
  if (v==="t-nouveau"){ main.innerHTML = formRapportHTML(S.editRap ? mesRapports().find(r=>r.id===S.editRap) : null); bindFormRapport(); return; }
  if (v==="t-notifs"){ main.innerHTML = `<h2>Notifications</h2><div class="card">${feedHTML(mesNotifs(),60)}</div>`; marquerLu(); return; }
  if (v==="t-compte"){ main.innerHTML = vCompte(); bindCompte(); return; }
  const L = mesRapports(), c = compte();
  const t = (() => { const st = statsTutorat(S.tut.filter(d=>d.id===S.uid), {}, today()); return Object.values(st.parTuteur)[0] || {}; })();
  if (v==="t-rapports"){
    main.innerHTML = `<div class="spread"><h2>Mes rapports</h2><a class="btn vert" href="#t-nouveau" id="tNew">+ Nouveau rapport</a></div>
    ${L.length?`<div class="tablewrap"><table><thead><tr><th>Date</th><th>Thème</th><th class="r">Présents</th><th>Suivi</th><th></th></tr></thead><tbody>${L.map(r=>`<tr><td>${dFR(jourRap(r))}</td><td style="white-space:normal">${esc(r.theme)}</td><td class="r">${esc(r.presents)}/${esc(r.attendus)}</td><td>${statutPill(r)}${r.suivi?.reponse?' <span class="pill">Réponse</span>':""}</td><td><button class="btn sm" data-voir="${esc(r.id)}">Voir</button>${(r.suivi?.statut||"Nouveau")==="Nouveau"?` <button class="btn sm ghost" data-modif="${esc(r.id)}">Modifier</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Vous n'avez encore déposé aucun rapport.</div>`}`;
  } else {
    const sans = t.joursSans;
    main.innerHTML = `<div class="spread"><div><h2>Bonjour ${esc(c.nom)}</h2><p class="small muted">Tuteur · ${esc(codeSp(c.specialite)||"")} ${esc(c.niveau||"")}</p></div><a class="btn vert" href="#t-nouveau" id="tNew">+ Déposer un rapport</a></div>
    ${sans==null?`<div class="banner">Aucun rapport déposé pour l'instant. Après chaque séance, déposez votre rapport ici (environ 5 minutes).</div>`:sans>7?`<div class="banner">Votre dernier rapport date de ${sans} jours. Pensez à rendre compte de vos dernières séances.</div>`:""}
    <div class="kpis">${kpi(t.n||0,"rapports déposés")}${kpi(pct(t.taux),"présence moyenne de vos étudiants","g")}${kpi(t.partMoy==null?"—":t.partMoy.toFixed(1).replace(".",",")+" /5","participation moyenne")}${kpi(t.prochaine?dLong(t.prochaine.slice(0,10)):"—","prochaine séance prévue","g")}</div>
    <div class="cols"><div class="card"><div class="spread"><h3>Mes derniers rapports</h3><a class="btn ghost" href="#t-rapports">Tout voir</a></div>${L.length?`<div class="plist">${L.slice(0,5).map(r=>`<div class="prow"><span><a href="#" data-voir="${esc(r.id)}"><b>${esc(r.theme)}</b></a><br><span class="small muted">${dFR(jourRap(r))} · ${esc(r.presents)}/${esc(r.attendus)} présents</span></span>${statutPill(r)}</div>`).join("")}</div>`:`<div class="empty">Aucun rapport.</div>`}</div>
    <div class="card"><h3>Réponses de la Commission</h3>${L.filter(r=>r.suivi?.reponse).length?`<div class="plist">${L.filter(r=>r.suivi?.reponse).slice(0,5).map(r=>`<div class="prow"><span><b class="small">${esc(r.theme)} · ${dFR(jourRap(r))}</b><br><span class="small">${esc(r.suivi.reponse)}</span></span></div>`).join("")}</div>`:`<div class="empty">Aucune réponse pour l'instant.</div>`}</div></div>`;
  }
  main.querySelectorAll("[data-voir]").forEach(b => b.onclick = e => { e.preventDefault(); const r = L.find(x=>x.id===b.dataset.voir); openSheet(`<div class="spread"><h2>Mon rapport</h2>${statutPill(r)}</div>${r.suivi?.reponse?`<div class="banner">Réponse de la Commission : ${esc(r.suivi.reponse)}</div>`:""}${rapportHTML(r)}<div class="row"><button class="btn" data-close>Fermer</button></div>`); });
  main.querySelectorAll("[data-modif]").forEach(b => b.onclick = () => { S.editRap = b.dataset.modif; location.hash = "t-nouveau"; render(); });
  $("#tNew") && ($("#tNew").onclick = () => { S.editRap = null; });
}
function formRapportHTML(r){
  const c = compte(); r = r || {tuteurNom:c.nom, specialite:c.specialite||"", niveau:c.niveau||"Licence 1", types:[], natures:[], etudiantsPresents:[]};
  const autreT = (r.types||[]).find(x=>!TYPES_ACT.includes(x))||"", autreN = (r.natures||[]).find(x=>!NATURES_DIF.includes(x))||"";
  const dtv = s => s ? String(s).replace(" ","T").slice(0,16) : "";
  const req = '<span class="req" aria-hidden="true"> *</span>';
  return `<div class="spread"><h2>${S.editRap?"Modifier mon rapport":"Rapport de tutorat — CVPB 2026-2027"}</h2><a class="btn ghost" href="#t-rapports">Annuler</a></div>
  <p class="small muted">Les champs marqués <span class="req">*</span> sont obligatoires. Mentionnez uniquement ce qui a effectivement été fait.</p>
  <form id="rf" class="form" novalidate>
   <fieldset><legend>Identification du tuteur</legend>
    <label class="f" for="r_nom">Nom et prénoms du tuteur${req}<input type="text" id="r_nom" value="${esc(r.tuteurNom)}" maxlength="80"></label>
    <div class="g2"><label class="f" for="r_sp">Filière ou spécialité encadrée${req}<select id="r_sp">${opts(SPECS_FORM, r.specialite, "Choisir…")}</select></label>
    <label class="f" for="r_niv">Niveau d’étude encadré${req}<select id="r_niv">${opts(["Licence 1","Licence 2","Licence 3"], r.niveau)}</select></label></div>
    <label class="f" for="r_per">Période couverte par le rapport${req}<input type="text" id="r_per" value="${esc(r.periode)}" maxlength="120" placeholder="Ex. : semaine du 10 au 16 novembre 2026"></label>
   </fieldset>
   <fieldset><legend>Informations sur la séance ou l’activité</legend>
    <label class="f" for="r_dt">Date de l’activité${req}<input type="datetime-local" id="r_dt" value="${dtv(r.dateActivite)}" max="${today()}T23:59"><span class="hint">Date à laquelle l'activité a effectivement eu lieu.</span></label>
    <div class="f">Type d’activité réalisée${req}<div class="checks">${TYPES_ACT.map((t,i)=>`<label><input type="checkbox" name="r_ty" value="${esc(t)}" ${(r.types||[]).includes(t)?"checked":""}> ${esc(t)}</label>`).join("")}<label><input type="checkbox" id="r_tyA" ${autreT?"checked":""}> Autre : <input type="text" id="r_tyAt" value="${esc(autreT)}" maxlength="80" style="min-height:30px;padding:4px 8px"></label></div></div>
    <label class="f" for="r_th">Thème ou contenu abordé${req}<input type="text" id="r_th" value="${esc(r.theme)}" maxlength="200" placeholder="Ex. : Révision des algorithmes"></label>
    <label class="f" for="r_cr">Compte rendu de l’activité${req}<textarea id="r_cr" maxlength="3000" style="min-height:120px" placeholder="Notions expliquées, exercices traités, méthodes utilisées, travaux réalisés par les étudiants.">${esc(r.compteRendu)}</textarea></label>
   </fieldset>
   <fieldset><legend>Participation et assiduité des étudiants</legend>
    <div class="g2"><label class="f" for="r_att">Nombre d’étudiants attendus${req}<input type="number" id="r_att" min="0" step="1" value="${esc(r.attendus)}"></label>
    <label class="f" for="r_pre">Nombre d’étudiants présents${req}<input type="number" id="r_pre" min="0" step="1" value="${esc(r.presents)}"><span class="hint">Ne comptez pas les absents, même excusés.</span></label></div>
    <details id="r_lst"><summary class="small">Cocher les étudiants présents (facultatif, remplit le nombre automatiquement)</summary><div class="checks" id="r_ets" style="margin-top:8px"></div></details>
    <div class="f">Niveau général de participation${req}<div class="scale">${Object.entries(PARTICIPATION).map(([k,l])=>`<label><input type="radio" name="r_pa" value="${k}" ${String(r.participation)===k?"checked":""}><b>${k}</b>${l}</label>`).join("")}</div></div>
    <label class="f" for="r_obs">Observations sur la participation<textarea id="r_obs" maxlength="1500">${esc(r.obsParticipation)}</textarea></label>
   </fieldset>
   <fieldset><legend>Difficultés et besoins d’accompagnement</legend>
    <div class="f">Des difficultés ont-elles été rencontrées ?${req}<div class="row">${["Oui","Non"].map(v=>`<label class="row small"><input type="radio" name="r_df" value="${v}" ${r.difficultes===v?"checked":""}> ${v}</label>`).join("")}</div></div>
    <div id="r_difs" class="form">
     <div class="f">Nature des difficultés${req}<div class="checks">${NATURES_DIF.map(t=>`<label><input type="checkbox" name="r_na" value="${esc(t)}" ${(r.natures||[]).includes(t)?"checked":""}> ${esc(t)}</label>`).join("")}<label><input type="checkbox" id="r_naA" ${autreN?"checked":""}> Autre : <input type="text" id="r_naAt" value="${esc(autreN)}" maxlength="80" style="min-height:30px;padding:4px 8px"></label></div></div>
     <label class="f" for="r_dd">Description des difficultés<textarea id="r_dd" maxlength="2000" placeholder="Faits observés, fréquence, conséquences, premières mesures. Évitez les jugements personnels.">${esc(r.descDifficultes)}</textarea></label>
    </div>
    <div class="f">Une intervention des Responsables est-elle nécessaire ?${req}<div class="row">${["Oui","Non"].map(v=>`<label class="row small"><input type="radio" name="r_in" value="${v}" ${r.intervention===v?"checked":""}> ${v}</label>`).join("")}</div></div>
    <label class="f" for="r_ind" id="r_indw">Situation nécessitant une décision, une ressource ou une intervention${req}<textarea id="r_ind" maxlength="1500" placeholder="Besoin de matériel, difficulté persistante, problème d'organisation, accompagnement supplémentaire…">${esc(r.interventionDetail)}</textarea></label>
   </fieldset>
   <fieldset><legend>Actions correctives et recommandations</legend>
    <label class="f" for="r_ae">Actions déjà entreprises<textarea id="r_ae" maxlength="1500">${esc(r.actionsEntreprises)}</textarea></label>
    <label class="f" for="r_ap">Actions prévues pour la prochaine séance${req}<textarea id="r_ap" maxlength="1500">${esc(r.actionsPrevues)}</textarea></label>
    <label class="f" for="r_rec">Recommandations à l’administration<textarea id="r_rec" maxlength="1500">${esc(r.recommandations)}</textarea></label>
    <label class="f" for="r_next">Date prévue de la prochaine séance<input type="datetime-local" id="r_next" value="${dtv(r.prochaineSeance)}"></label>
   </fieldset>
   <fieldset><legend>Validation du rapport</legend>
    <label class="f" for="r_com">Commentaire final<textarea id="r_com" maxlength="1000">${esc(r.commentaire)}</textarea></label>
    <label class="row small"><input type="checkbox" id="r_conf" ${r.confirme?"checked":""}> Je confirme que les informations fournies dans ce rapport sont exactes et correspondent aux activités réalisées.<span class="req">*</span></label>
   </fieldset>
   <div class="row"><button class="btn vert" type="submit">${S.editRap?"Enregistrer les modifications":"Envoyer mon rapport"}</button><a class="btn" href="#t-rapports">Annuler</a></div>
  </form>`;
}
function bindFormRapport(){
  const r0 = S.editRap ? mesRapports().find(r=>r.id===S.editRap) : null;
  const sel = new Set(r0?.etudiantsPresents||[]);
  const drawEts = () => {
    const sp = codeSp($("#r_sp").value), nv = $("#r_niv").value;
    const L = S.etudiants.filter(s=>s.statut!=="Inactif" && (!sp || codeSpec(s.specialite)===sp) && s.niveau===nv).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
    $("#r_ets").innerHTML = L.length ? L.map(s=>`<label><input type="checkbox" name="r_et" value="${esc(s.matricule)}" ${sel.has(s.matricule)?"checked":""}> ${esc(s.nom)}</label>`).join("") : `<span class="small muted">Aucun étudiant enregistré pour cette spécialité et ce niveau.</span>`;
    $("#r_ets").querySelectorAll("input").forEach(i => i.onchange = () => { i.checked ? sel.add(i.value) : sel.delete(i.value); $("#r_pre").value = sel.size; });
  };
  const tog = () => { const d = document.querySelector('input[name="r_df"]:checked')?.value; $("#r_difs").hidden = d!=="Oui"; const i = document.querySelector('input[name="r_in"]:checked')?.value; $("#r_indw").hidden = i!=="Oui"; };
  $("#r_sp").onchange = drawEts; $("#r_niv").onchange = drawEts; drawEts();
  document.querySelectorAll('input[name="r_df"],input[name="r_in"]').forEach(i=>i.onchange = tog); tog();
  $("#rf").onsubmit = async ev => {
    ev.preventDefault();
    const val = s => $(s).value.trim(), radio = n => document.querySelector(`input[name="${n}"]:checked`)?.value || "";
    const types = [...document.querySelectorAll('input[name="r_ty"]:checked')].map(i=>i.value); if ($("#r_tyA").checked && val("#r_tyAt")) types.push(val("#r_tyAt"));
    const natures = [...document.querySelectorAll('input[name="r_na"]:checked')].map(i=>i.value); if ($("#r_naA").checked && val("#r_naAt")) natures.push(val("#r_naAt"));
    const d = {tuteurNom:val("#r_nom"), specialite:$("#r_sp").value, niveau:$("#r_niv").value, periode:val("#r_per"), dateActivite:$("#r_dt").value, types, theme:val("#r_th"), compteRendu:val("#r_cr"),
      attendus:$("#r_att").value===""?"":Math.round(Number($("#r_att").value)), presents:$("#r_pre").value===""?"":Math.round(Number($("#r_pre").value)), participation:radio("r_pa"), obsParticipation:val("#r_obs"), etudiantsPresents:[...sel],
      difficultes:radio("r_df"), natures: radio("r_df")==="Oui"?natures:[], descDifficultes: radio("r_df")==="Oui"?val("#r_dd"):"", intervention:radio("r_in"), interventionDetail: radio("r_in")==="Oui"?val("#r_ind"):"",
      actionsEntreprises:val("#r_ae"), actionsPrevues:val("#r_ap"), recommandations:val("#r_rec"), prochaineSeance:$("#r_next").value, commentaire:val("#r_com"), confirme:$("#r_conf").checked, source:"app"};
    const manque = [];
    if (!d.tuteurNom) manque.push("nom"); if (!d.specialite) manque.push("spécialité"); if (!d.periode) manque.push("période"); if (!d.dateActivite) manque.push("date de l'activité");
    if (!types.length) manque.push("type d'activité"); if (!d.theme) manque.push("thème"); if (!d.compteRendu) manque.push("compte rendu");
    if (d.attendus==="" || d.attendus<0) manque.push("étudiants attendus"); if (d.presents==="" || d.presents<0) manque.push("étudiants présents"); if (!d.participation) manque.push("niveau de participation");
    if (!d.difficultes) manque.push("difficultés (oui/non)"); if (d.difficultes==="Oui" && !natures.length) manque.push("nature des difficultés");
    if (!d.intervention) manque.push("intervention (oui/non)"); if (d.intervention==="Oui" && !d.interventionDetail) manque.push("situation à traiter");
    if (!d.actionsPrevues) manque.push("actions prévues"); if (!d.confirme) manque.push("confirmation");
    if (manque.length){ toast("À compléter : " + manque.join(", ")); return; }
    if (d.presents > d.attendus){ toast("Le nombre de présents ne peut pas dépasser le nombre d'étudiants attendus."); return; }
    if (d.dateActivite.slice(0,10) > today()){ toast("La date de l'activité ne peut pas être dans le futur."); return; }
    const id = S.editRap || ("R" + Date.now().toString(36));
    const ref = S.db.doc("rapports_tuteurs/"+S.uid), existe = S.tut.some(x=>x.id===S.uid);
    const rap = {...d, deposeLe: r0?.deposeLe || nowISO(), majLe: nowISO(), ...(r0?{}:{suivi:{statut:"Nouveau"}})};
    const ok = await write(() => existe ? ref.update({tuteurNom:d.tuteurNom, rapports:{[id]:rap}}) : ref.set({tuteurNom:d.tuteurNom, rapports:{[id]:rap}}), S.editRap ? "Rapport modifié" : "Rapport envoyé. Merci pour votre engagement !");
    if (ok){
      log("tut_rapport", `${S.editRap?"Rapport modifié":"Nouveau rapport"} de ${d.tuteurNom} : ${d.theme} (${d.presents}/${d.attendus} présents)${d.intervention==="Oui"?" · INTERVENTION DEMANDÉE":""}`, ["president","formation","bureau"]);
      S.editRap = null; location.hash = "t-rapports";
    }
  };
}

/* ---- Notifications ---- */
function vNotifs(){
  return `<h2>Alertes et notifications</h2>
  <div class="cols"><div class="card"><h3>Alertes en cours</h3><p class="small muted">Calculées en continu à partir des données : elles disparaissent quand la situation est réglée.</p>${alertesHTML(mesAlertes())}</div>
  <div class="card"><h3>Notifications</h3><p class="small muted">Actions des autres responsables qui vous concernent. Les nouvelles sont marquées d'un point vert.</p>${feedHTML(mesNotifs(), 60)}</div></div>`;
}

/* ---- Administration ---- */
function vAdmin(){
  const sub = S.sub.admin;
  let body = "";
  if (sub==="comptes"){
    const resp = Object.entries(S.comptes).filter(([,c])=>c.role!=="tuteur").sort((a,b)=>a[1].nom.localeCompare(b[1].nom,"fr")), tut = Object.entries(S.comptes).filter(([,c])=>c.role==="tuteur").sort((a,b)=>a[1].nom.localeCompare(b[1].nom,"fr"));
    const ligne = ([u,c]) => `<div class="prow"><span><b>${esc(c.nom)}</b> ${c.actif===false?'<span class="pill bad">Suspendu</span>':""}${!c.uid&&c.role!=="president"?' <span class="pill warn">Jamais connecté</span>':""}<br><span class="small muted">${esc(ROLES[c.role]?.l)}${c.role==="tuteur"?` · ${esc(codeSp(c.specialite))} ${esc(c.niveau||"")}`:""} · <span class="num" style="overflow-wrap:anywhere">${esc(u)}</span>${c.derniereConnexion?` · vu le ${new Date(c.derniereConnexion).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`:""}</span></span>${u!==S.email?`<button class="btn sm ghost" data-cpt="${esc(u)}">Modifier</button>`:'<span class="pill">Vous</span>'}</div>`;
    body = `<div class="spread"><p class="small muted">Ajoutez chaque personne avec son adresse Google UVCI. Elle se connecte ensuite avec « Se connecter avec Google UVCI », sans mot de passe à retenir.</p><button class="btn primary" id="newCpt">+ Ajouter une personne</button></div>
      <div class="card"><h3>Responsables (${resp.length})</h3>${resp.map(ligne).join("")||'<div class="empty">Aucun.</div>'}</div>
      <div class="card"><h3>Tuteurs (${tut.length})</h3>${tut.map(ligne).join("")||'<div class="empty">Aucun tuteur. Créez leurs comptes avec le rôle Tuteur.</div>'}</div>
      <details class="card"><summary>Ce que voit chaque rôle</summary>
      <div class="tablewrap"><table class="wrap"><thead><tr><th>Rôle</th><th>Son interface (et rien d'autre)</th></tr></thead><tbody>
      <tr><td>Présidence</td><td class="small">Tout : tableau général, toutes les sections, comptes, paramètres, journal</td></tr>
      <tr><td>Responsable des encaissements</td><td class="small">Étudiants (avec téléphones), registre, cotisations, ses dépôts à la caisse</td></tr>
      <tr><td>Responsable de la caisse</td><td class="small">Caisse : dépôts à valider, entrées et sorties, livre de caisse</td></tr>
      <tr><td>Trésorerie (contrôle)</td><td class="small">Lecture du registre, des cotisations et de la caisse, rapprochement</td></tr>
      <tr><td>Commission Formation</td><td class="small">Rapports des tuteurs (lecture, réponse), présences et notes de l'Académie</td></tr>
      <tr><td>Formateur de l'Académie</td><td class="small">Présences et notes de l'Académie</td></tr>
      <tr><td>Tuteur</td><td class="small">Espace Tuteurs : ses propres rapports et les réponses reçues</td></tr>
      </tbody></table></div>
      <p class="small muted">Ces limites sont appliquées par le serveur (règles de sécurité Firebase), pas seulement par l'affichage : un compte ne peut pas lire les données d'un autre rôle, même avec des connaissances techniques.</p></details>`;
  }
  if (sub==="import"){
    body = `<div class="card"><h3>Importer les données initiales</h3>
      <p class="small">Choisissez le fichier <b>donnees-initiales-cvpb.json</b> fourni avec l'application (étudiants, téléphones, encaissements, dépôts, sorties, paramètres, rapports de tutorat). À faire une seule fois, juste après la première installation.</p>
      <p class="small muted">Ce fichier contient des données personnelles : ne le publiez jamais sur internet et supprimez-le du téléphone ou de l'ordinateur après l'import.</p>
      <input type="file" id="impF" accept=".json,application/json">
      <p class="small" id="impInfo"></p>
      <div class="row"><button class="btn primary" id="impOk" disabled>Importer</button></div></div>`;
  }
  if (sub==="parametres"){
    const p = P(), s = p.seuils;
    body = `<form id="pf" class="form card">
      <h3>Barème (FCFA)</h3>
      <div class="g2">
        <label class="f" for="p_ins">Inscription (T-shirt inclus)<input type="number" id="p_ins" value="${p.inscription}" min="0"></label>
        <label class="f" for="p_ts">Prix du T-shirt<input type="number" id="p_ts" value="${p.tshirt}" min="0"></label>
        <label class="f" for="p_mens">Cotisation mensuelle<input type="number" id="p_mens" value="${p.mensualite}" min="0"></label>
        <label class="f" for="p_so">Solde d'ouverture de la caisse<input type="number" id="p_so" value="${p.soldeOuverture}" min="0"></label>
        <label class="f" for="p_pre">Préfixe du matricule<input type="text" id="p_pre" value="${esc(p.prefixe)}" maxlength="12"></label>
        <label class="f" for="p_dr">Date de référence des alertes<input type="date" id="p_dr" value="${esc(p.dateReference)}"><span class="hint">Vide = aujourd'hui (suivi en temps réel).</span></label>
      </div>
      <h3>Seuils d'alerte</h3>
      <div class="g2">
        <label class="f" for="p_smin">Solde minimal de caisse<input type="number" id="p_smin" value="${s.soldeMin}"></label>
        <label class="f" for="p_plaf">Plafond d'espèces<input type="number" id="p_plaf" value="${s.plafondEspeces}"></label>
        <label class="f" for="p_app">Seuil d'approbation des sorties<input type="number" id="p_app" value="${s.approbation}"></label>
        <label class="f" for="p_dd">Délai max sans dépôt (jours)<input type="number" id="p_dd" value="${s.delaiDepot}"></label>
        <label class="f" for="p_dv">Délai max de validation d'un dépôt (jours)<input type="number" id="p_dv" value="${s.delaiValidation}"></label>
        <label class="f" for="p_nm">Note minimale (sur 20)<input type="number" id="p_nm" value="${p.noteMin}" step="0.5"></label>
        <label class="f" for="p_am">Assiduité minimale (%)<input type="number" id="p_am" value="${Math.round(p.assiduiteMin*100)}"></label>
      </div>
      <label class="f" for="p_mois">Mois de cotisation (un par ligne : code | libellé | 1er jour AAAA-MM-JJ)<textarea id="p_mois" style="min-height:170px">${esc(p.mois.map(m=>`${m.code} | ${m.libelle} | ${m.debut}`).join("\n"))}</textarea></label>
      <label class="f" for="p_enc">Personnes qui encaissent (séparées par des virgules)<input type="text" id="p_enc" value="${esc((p.encaisseurs||[]).join(", "))}"></label>
      <label class="f" for="p_form">Formations (code | intitulé | niveau)<textarea id="p_form" style="min-height:170px">${esc((p.formations||[]).map(f=>`${f.code} | ${f.intitule} | ${f.niveau}`).join("\n"))}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">Enregistrer les paramètres</button></div>
    </form>`;
  }
  if (sub==="journal"){
    body = `<div class="card"><div class="spread"><h3>Journal des actions</h3>${can("export")?`<button class="btn" id="expJ">Exporter (CSV)</button>`:""}</div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Par</th><th>Rôle</th><th>Action</th></tr></thead><tbody>${S.journal.map(j=>`<tr><td class="small">${new Date(j.le).toLocaleString("fr-FR")}</td><td>${esc(j.parNom)}</td><td class="small">${esc(ROLES[j.role]?.l||"")}</td><td style="white-space:normal">${esc(j.texte)}</td></tr>`).join("")||`<tr><td colspan="4"><div class="empty">Aucune action enregistrée.</div></td></tr>`}</tbody></table></div><p class="small muted">Les 200 dernières actions. Chaque saisie, validation, annulation et changement de droits est tracé.</p></div>`;
  }
  return `<h2>Administration</h2><div class="subtabs" role="group" aria-label="Administration">${[["comptes","Comptes et accès"],["parametres","Paramètres"],["journal","Journal"],["import","Import des données"]].map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function formCompte(uid){
  const isNew = !uid, c = isNew ? {role:"encaissement", actif:true} : S.comptes[uid];
  openSheet(`<h2>${isNew?"Ajouter une personne":"Modifier "+esc(c.nom)}</h2>
    <label class="f" for="c_n">Nom et prénoms<input type="text" id="c_n" value="${esc(c.nom)}" maxlength="80"></label>
    ${isNew?`<label class="f" for="c_em">Adresse Google UVCI<input type="email" id="c_em" autocapitalize="none" spellcheck="false" maxlength="80" placeholder="prenom.nom@${esc(DOMAINE())}"><span class="hint">L'adresse exacte avec laquelle la personne se connecte à l'UVCI.</span></label>`:`<p class="small">Compte : <b class="num" style="overflow-wrap:anywhere">${esc(uid)}</b></p>`}
    <label class="f" for="c_r">Rôle<select id="c_r">${opts(Object.entries(ROLES).filter(([k])=>k!=="president").map(([k,r])=>[k,r.l]), c.role)}</select></label>
    <div class="g2" id="c_tw"><label class="f" for="c_sp">Spécialité encadrée<select id="c_sp">${opts(SPECS_FORM, c.specialite, "—")}</select></label><label class="f" for="c_nv">Niveau encadré<select id="c_nv">${opts(["Licence 1","Licence 2","Licence 3"], c.niveau)}</select></label></div>
    ${isNew?"":`<label class="row small"><input type="checkbox" id="c_a" ${c.actif!==false?"checked":""}> Accès actif (décocher pour bloquer immédiatement ce compte)</label>`}
    <p class="small" id="c_err" style="color:var(--bad)" role="alert"></p>
    <div class="row"><button class="btn primary" id="c_ok">${isNew?"Ajouter":"Enregistrer"}</button><button class="btn" data-close>Annuler</button></div>`);
  const upR = () => { $("#c_tw").hidden = $("#c_r").value!=="tuteur"; };
  $("#c_r").onchange = upR; upR();
  $("#c_ok").onclick = async () => {
    const data = {nom:$("#c_n").value.trim().replace(/\s+/g," "), role:$("#c_r").value, majLe:nowISO()};
    if (data.role==="tuteur"){ data.specialite = $("#c_sp").value; data.niveau = $("#c_nv").value; }
    if (!data.nom){ $("#c_err").textContent = "Le nom est obligatoire."; return; }
    if (!isNew){
      data.actif = $("#c_a").checked;
      if (await write(()=>S.db.doc("users/"+uid).update(data), "Compte mis à jour")){ if (c.uid) log("compte", `${data.nom} : ${ROLES[data.role].l}${data.actif?"":" (accès suspendu)"}`, ["u:"+c.uid]); closeSheet(); }
      return;
    }
    const em = $("#c_em").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(em) || !estUVCI(em)){ $("#c_err").textContent = `Saisissez une adresse se terminant par @${DOMAINE()}.`; return; }
    if (S.comptes[em] || em === S.email){ $("#c_err").textContent = "Cette adresse a déjà un accès."; return; }
    if (await write(()=>S.db.doc("users/"+em).set({...data, email:em, actif:true, creeLe:nowISO(), creePar:S.email}), "Personne ajoutée")){
      const lien = location.origin + location.pathname;
      const msg = `Bonjour ${data.nom}, votre accès à l'application CVPB Gestion est prêt (${ROLES[data.role].l}).\nOuvrez ce lien : ${lien}\nTouchez « Se connecter avec Google UVCI » et choisissez votre compte ${em}.\nPensez à installer l'application sur votre téléphone (menu du navigateur > Installer l'application).`;
      openSheet(`<h2>Accès créé</h2><p><b>${esc(data.nom)}</b> peut maintenant se connecter avec <b class="num" style="overflow-wrap:anywhere">${esc(em)}</b>.</p>
        <div class="row"><a class="btn vert" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Prévenir par WhatsApp</a><button class="btn" id="cpMsg">Copier le message</button><button class="btn" data-close>Terminé</button></div>`);
      $("#cpMsg").onclick = async () => { try { await navigator.clipboard.writeText(msg); toast("Message copié"); } catch(e){ toast("Copie impossible : sélectionnez le texte à la main."); } };
    }
  };
}
async function importer(json){
  const cols = ["parametres","etudiants","prive","encaissements","depots","operations","seances","notes","rapports_tuteurs"];
  const ops = [];
  for (const c of cols) for (const [id, data] of Object.entries(json[c]||{})) ops.push({path:`${c}/${id}`, data});
  await S.db.lots(ops);
  return ops.length;
}
async function saveParams(){
  const num = s => Number($(s).value)||0;
  const mois = $("#p_mois").value.split("\n").map(l=>l.split("|").map(x=>x.trim())).filter(a=>a.length>=3 && /^\d{4}-\d{2}-\d{2}$/.test(a[2])).map(([code,libelle,debut])=>({code,libelle,debut}));
  const formations = $("#p_form").value.split("\n").map(l=>l.split("|").map(x=>x.trim())).filter(a=>a.length>=3&&a[0]).map(([code,intitule,niveau])=>({code,intitule,niveau}));
  const data = {...S.params, inscription:num("#p_ins"), tshirt:num("#p_ts"), mensualite:num("#p_mens"), soldeOuverture:num("#p_so"), prefixe:$("#p_pre").value.trim()||PARAM_DEFAUT.prefixe, dateReference:$("#p_dr").value,
    seuils:{soldeMin:num("#p_smin"), plafondEspeces:num("#p_plaf"), approbation:num("#p_app"), delaiDepot:num("#p_dd"), delaiValidation:num("#p_dv")},
    noteMin:num("#p_nm"), assiduiteMin:num("#p_am")/100, mois, formations, encaisseurs:$("#p_enc").value.split(",").map(x=>x.trim()).filter(Boolean), majLe:nowISO()};
  if (data.tshirt > data.inscription){ toast("Le prix du T-shirt ne peut pas dépasser l'inscription."); return; }
  if (await write(()=>S.db.doc("parametres/general").set(data), "Paramètres enregistrés")) log("parametres", "Paramètres de l'application modifiés", ["tous"]);
}

/* ======== Exports CSV ======== */
async function exportCSV(nom, entetes, lignes){
  const cell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv = "\ufeff" + [entetes, ...lignes].map(r=>r.map(cell).join(";")).join("\r\n");
  const fichier = `${nom}_${today()}.csv`, blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  try { const f = new File([blob], fichier, {type:"text/csv"}); if (navigator.canShare?.({files:[f]}) && /android|iphone|ipad/i.test(navigator.userAgent)){ await navigator.share({files:[f], title:fichier}); return; } } catch(e){ if (e?.name==="AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fichier; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ======== Liaisons ======== */
function bind(v){
  const main = $("#main");
  main.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { S.sub[v] = b.dataset.sub; render(); });
  main.querySelectorAll("tr.click[data-mat]").forEach(tr => tr.onclick = e => { if (e.target.closest("[data-stop]")) return; ficheEtu(tr.dataset.mat); });
  main.querySelectorAll("[data-act]").forEach(b => b.onclick = () => ({enc:()=>formEnc(), etu:()=>formEtu(), dep:formDepot, op:formOp, sea:()=>formSeance()}[b.dataset.act])());
  main.querySelectorAll("[data-fiche]").forEach(a => a.onclick = e => { e.preventDefault(); ficheEtu(a.dataset.fiche); });
  main.querySelectorAll("[data-rap]").forEach(a => a.onclick = e => { e.preventDefault(); const [d,i] = a.dataset.rap.split("|"); ficheRapport(d,i); });
  main.querySelectorAll("[data-goto]").forEach(a => a.addEventListener("click", () => { S.sub.caisse = a.dataset.goto; }));
  main.querySelectorAll("[data-dval]").forEach(b=>b.onclick=()=>validerDepot(b.dataset.dval,true));
  main.querySelectorAll("[data-drej]").forEach(b=>b.onclick=()=>validerDepot(b.dataset.drej,false));
  const on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  if (v==="etudiants"){
    on("#newEtu","onclick",()=>formEtu());
    on("#fq","oninput",e=>{ S.f.q=e.target.value; clearTimeout(bind.t); bind.t=setTimeout(()=>{ render(); const i=$("#fq"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); },250); });
    on("#fniv","onchange",e=>{S.f.niveau=e.target.value;render();}); on("#fspec","onchange",e=>{S.f.spec=e.target.value;render();}); on("#fsit","onchange",e=>{S.f.situation=e.target.value;render();});
    on("#expEtu","onclick",()=>exportCSV("CVPB_etudiants",["Matricule","Nom et prénoms","Niveau","Spécialité","Académie","Statut",...(can("tel.voir")?["Téléphone"]:[]),...(can("fin.voir")?["Total versé","Arriéré","Situation"]:[]),"Assiduité"],
      S.etudiants.map(s=>{ const e=S.C.etu[s.matricule], p=S.C.peda[s.matricule]; return [s.matricule,s.nom,s.niveau,s.specialite,s.academie?"Oui":"Non",s.statut||"Actif",...(can("tel.voir")?[S.prive[s.matricule]?.tel||""]:[]),...(can("fin.voir")?[e.totalVerse,e.arriere,e.situation]:[]),p.assiduite==null?"":Math.round(p.assiduite*100)+"%"]; })));
  }
  if (v==="registre"){
    on("#newEnc","onclick",()=>formEnc());
    on("#rq","oninput",e=>{ S.rf.q=e.target.value; clearTimeout(bind.t); bind.t=setTimeout(()=>{ render(); const i=$("#rq"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); },250); });
    on("#rnat","onchange",e=>{S.rf.nature=e.target.value;render();}); on("#rmois","onchange",e=>{S.rf.mois=e.target.value;render();}); on("#rst","onchange",e=>{S.rf.statut=e.target.value;render();});
    main.querySelectorAll("[data-ann]").forEach(b=>b.onclick=()=>annulerEnc(b.dataset.ann));
    on("#expReg","onclick",()=>exportCSV("CVPB_registre_encaissements",["N°","Date","Matricule","Nom","Payeur hors liste","Nature","Mois","Montant","Mode","Référence","Encaissé par","Écriture","Motif d'annulation","Observations"],
      S.encaissements.slice().sort((a,b)=>a.num.localeCompare(b.num)).map(e=>[e.num,dFR(e.date),e.matricule,e.nom,e.payeur,e.nature,moisLib(e.mois),e.montant,e.mode,e.ref,e.encaissePar,e.statut,e.motif||"",e.obs||""])));
  }
  if (v==="cotisations"){
    on("#csit","onchange",e=>{S.f.situation=e.target.value;render();});
    on("#expCot","onclick",()=>exportCSV("CVPB_suivi_cotisations",["Matricule","Nom","Niveau","Inscription payée",...S.C.mois.map(m=>m.libelle),"Arriéré","Reste du mois en cours","Situation"],
      S.etudiants.map(s=>{ const e=S.C.etu[s.matricule]; return [s.matricule,s.nom,s.niveau,e.inscPayee,...S.C.mois.map(m=>e.parMois[m.code]||0),e.arriere,e.resteCourant,e.situation]; })));
  }
  if (v==="caisse"){
    on("#newDep","onclick",formDepot); on("#newOp","onclick",formOp);
    main.querySelectorAll("[data-oapp]").forEach(b=>b.onclick=()=>decisionOp(b.dataset.oapp,"app"));
    main.querySelectorAll("[data-orej]").forEach(b=>b.onclick=()=>decisionOp(b.dataset.orej,"rej"));
    main.querySelectorAll("[data-oann]").forEach(b=>b.onclick=()=>decisionOp(b.dataset.oann,"ann"));
    on("#expLivre","onclick",()=>exportCSV("CVPB_livre_de_caisse",["Date","Pièce","Libellé","Mode","Entrée","Sortie","Solde"],[["","","Solde d'ouverture","","","",P().soldeOuverture],...S.C.caisse.mvts.map(m=>[dFR(m.date),m.ref,m.libelle,m.mode,m.entree||"",m.sortie||"",m.solde])]));
  }
  if (v==="tutorat"){
    on("#tfT","onchange",e=>{S.tf.tuteur=e.target.value;render();}); on("#tfS","onchange",e=>{S.tf.spec=e.target.value;render();}); on("#tfst","onchange",e=>{S.tf.statut=e.target.value;render();});
    main.querySelectorAll("tr[data-tut]").forEach(tr=>tr.onclick=()=>{ S.tf.tuteur = tr.dataset.tut; render(); });
    on("#expTut","onclick",()=>exportCSV("CVPB_rapports_tutorat",["Date de l'activité","Tuteur","Spécialité","Niveau","Période","Types d'activité","Thème","Compte rendu","Attendus","Présents","Participation (1-5)","Observations","Difficultés","Nature des difficultés","Description","Intervention nécessaire","Situation à traiter","Actions entreprises","Actions prévues","Recommandations","Prochaine séance","Commentaire","Suivi","Réponse de la Commission"],
      S.T.rapports.map(r=>[String(r.dateActivite||"").replace("T"," "),r.tuteurNom,r.specialite,r.niveau,r.periode,(r.types||[]).join("; "),r.theme,r.compteRendu,r.attendus,r.presents,r.participation,r.obsParticipation,r.difficultes,(r.natures||[]).join("; "),r.descDifficultes,r.intervention,r.interventionDetail,r.actionsEntreprises,r.actionsPrevues,r.recommandations,String(r.prochaineSeance||"").replace("T"," "),r.commentaire,r.suivi?.statut||"Nouveau",r.suivi?.reponse||""])));
  }
  if (v==="pedagogie"){
    on("#newSea","onclick",()=>formSeance());
    main.querySelectorAll("[data-sea]").forEach(b=>b.onclick=()=>formSeance(b.dataset.sea));
    on("#nfo","onchange",e=>{S.sub.noteForm=e.target.value;render();});
    on("#saveNotes","onclick",()=>saveNotes($("#nfo").value));
  }
  if (v==="admin"){
    on("#newCpt","onclick",()=>formCompte());
    main.querySelectorAll("[data-cpt]").forEach(b=>b.onclick=()=>formCompte(b.dataset.cpt));
    if ($("#impF")){ let J = null;
      $("#impF").onchange = async e => { try { J = JSON.parse(await e.target.files[0].text()); const n = k => Object.keys(J[k]||{}).length; $("#impInfo").textContent = `${n("etudiants")} étudiants, ${n("encaissements")} encaissements, ${n("depots")} dépôts, ${n("operations")} opérations, ${Object.values(J.rapports_tuteurs||{}).reduce((a,d)=>a+Object.keys(d.rapports||{}).length,0)} rapports de tutorat.${S.etudiants.length?" Attention : des données existent déjà ; les fiches de même numéro seront remplacées.":""}`; $("#impOk").disabled = false; } catch(err){ J = null; $("#impInfo").textContent = "Fichier illisible : choisissez donnees-initiales-cvpb.json."; } };
      $("#impOk").onclick = async () => { if (!J) return; $("#impOk").disabled = true; $("#impInfo").textContent = "Import en cours…"; try { const n = await importer(J); $("#impInfo").textContent = `Import terminé : ${n} fiches enregistrées. Vous pouvez supprimer le fichier.`; log("import", `Données initiales importées (${n} fiches)`, ["tous"]); } catch(err){ $("#impInfo").textContent = "Import interrompu : vérifiez la connexion et réessayez."; $("#impOk").disabled = false; } };
    }
    main.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(b.dataset.copy); toast("Lien copié"); }catch(e){ toast("Copie impossible : sélectionnez le lien à la main."); } });
    on("#pf","onsubmit",e=>{e.preventDefault();saveParams();});
    on("#expJ","onclick",()=>exportCSV("CVPB_journal",["Date","Par","Rôle","Action"],S.journal.map(j=>[new Date(j.le).toLocaleString("fr-FR"),j.parNom,ROLES[j.role]?.l||"",j.texte])));
  }
}

/* ======== Données en direct ======== */
function sub(path, key, fn, q){
  const timer = setTimeout(()=>{ S.stale=true; queueRender(); }, 10000);
  (q || S.db.collection(path)).onSnapshot(snap => { if (!snap.metadata.fromCache) clearTimeout(timer); fn(snap); S.loaded[key]=true; queueRender(); },
    () => { clearTimeout(timer); S.loaded[key]=true; queueRender(); });
}
const rows = snap => snap.docs.map(d=>({id:d.id, ...d.data()}));
/* Chaque rôle ne s'abonne qu'aux données qu'il a le droit de lire (les règles du serveur refusent le reste). */
function abonner(){
  if (S.abonne) return; S.abonne = true;
  const r = role(), db = S.db, has = (...l) => r==="president" || l.includes(r);
  db.doc("parametres/general").onSnapshot(d => { S.params = d.exists ? d.data() : {}; S.loaded.params = true; queueRender(); }, () => { S.params = {}; S.loaded.params = true; queueRender(); });
  if (has("formation")) sub("users","comptes", s => { S.comptes = Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); }); else S.comptes = {[S.email]: S.moi};
  if (has("encaissement","tresorerie","formation","pedagogie","tuteur")) sub("etudiants","etudiants", s => { S.etudiants = rows(s); });
  if (has("encaissement","tresorerie")){ sub("prive","prive", s => { S.prive = Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); }); sub("encaissements","encaissements", s => { S.encaissements = rows(s); }); }
  if (has("encaissement","caisse","tresorerie")) sub("depots","depots", s => { S.depots = rows(s); });
  if (has("caisse","tresorerie")) sub("operations","operations", s => { S.operations = rows(s); });
  if (has("formation","pedagogie")){ sub("seances","seances", s => { S.seances = rows(s); }); sub("notes","notes", s => { S.notes = rows(s); }); }
  if (has("formation")) sub("rapports_tuteurs","tut", s => { S.tut = rows(s); });
  else if (r==="tuteur") db.doc("rapports_tuteurs/"+S.uid).onSnapshot(d => { S.tut = d.exists ? [{id:d.id, ...d.data()}] : []; queueRender(); }, ()=>{});
  const canaux = r==="president" ? ["president"] : [r, "u_"+S.uid];
  canaux.forEach((c, i) => db.collection(`notifs/${c}/items`).orderBy("le","desc").limit(150).onSnapshot(s => { S[i?"jB":"jA"] = rows(s); fusionJournal(); queueRender(); }, ()=>{}));
  db.doc(`etat/${S.uid}`).onSnapshot(d => { S.etat = d.exists ? d.data() : {}; queueRender(); }, ()=>{});
}
(async function init(){
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey==="A_REMPLACER"){ S.sansConfig = true; render(); return; }
  S.fb = demarrer(firebaseConfig); S.db = S.fb.db;
  S.fb.compte.retourRedirection().catch(e => { S.erreurConnexion = MSG_AUTH(e?.code); render(); });
  S.fb.compte.surChangement(async u => {
    S.authPret = true;
    if (!u){ if (S.uid) location.reload(); render(); return; }
    const em = String(u.email||"").toLowerCase();
    if (!estUVCI(em)){ S.erreurConnexion = `Le compte ${em} n'est pas une adresse @${DOMAINE()}. Connectez-vous avec votre compte UVCI.`; await S.fb.compte.deconnexion(); render(); return; }
    if (S.uid === u.uid) return;
    S.uid = u.uid; S.email = em;
    let premier = true, essaiPresident = false, presid = false;
    S.db.doc("users/"+em).onSnapshot(d => {
      if (essaiPresident && !presid && d.metadata?.hasPendingWrites) return; // attendre la réponse du serveur
      const avant = S.moi?.role; S.moi = d.exists ? d.data() : null;
      /* Fiche absente : on tente de créer la fiche Présidence ; seul le compte inscrit dans les règles du serveur y parvient. */
      if (!d.exists && !essaiPresident){ essaiPresident = true;
        S.db.doc("users/"+em).set({nom:u.displayName||"Présidence", email:em, role:"president", actif:true, uid:u.uid, creeLe:nowISO(), derniereConnexion:nowISO()})
          .then(()=>{ presid = true; }).catch(()=>{ S.loaded.moi = true; queueRender(); });
        return; }
      if (S.moi?.role === "president") presid = true;
      if (presid && S.moi) S.moi = {...S.moi, role:"president", actif:true};
      S.loaded.moi = true;
      if (premier && S.moi && S.moi.actif !== false){ premier = false; S.db.doc("users/"+em).update({uid:u.uid, derniereConnexion:nowISO()}).catch(()=>{}); }
      if (avant && S.moi && S.moi.role !== avant) location.reload();
      if (S.moi && S.moi.actif !== false){ if (!S.abonne) abonner(); else if (!["president","formation"].includes(role())) S.comptes = {[S.email]: S.moi}; }
      queueRender();
    }, () => { S.loaded.moi = true; queueRender(); });
    render();
  });
})();
