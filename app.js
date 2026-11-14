import { demarrer } from "./fb.js";
import { firebaseConfig } from "./firebase-config.js";

/*CALC-START*/
/* ======== Référentiels et calculs (fonctions pures) ======== */
const TOUS = ["encaissement","caisse","tresorerie","formation","pedagogie","secretaire","tuteurs","accompagnement"];
/* Rôles qui voient tout en lecture (sans rien valider) */
const LECTURE_TOTALE = ["vicepresident"];
/* Le/la trésorier(e) tient aussi la caisse : le rôle « caisse » cumule les accès de la trésorerie */
const mesRoles = r => r==="caisse" ? ["caisse","tresorerie"] : [r];
const inclut = (l, r) => mesRoles(r).some(x=>l.includes(x));
const ROLES = {
  president:{l:"Présidence", perms:["*"], partage:"Propriétaire"},
  vicepresident:{l:"Vice-présidence (lecture de tout)", perms:["fin.voir","tel.voir","peda.voir","tut.voir","export"], partage:"Lecteur"},
  secretaire:{l:"Secrétariat général", perms:["peda.voir","tut.voir","export","controle"], partage:"Contrôleur"},
  encaissement:{l:"Responsable des encaissements", perms:["fin.voir","enc.saisir","enc.annuler","etu.gerer","tel.voir","depot.declarer","export","msg.fin"], partage:"Éditeur"},
  caisse:{l:"Trésorier(e) · responsable de la caisse", perms:["fin.voir","depot.valider","op.saisir","tel.voir","export","msg.fin"], partage:"Éditeur"},
  tresorerie:{l:"Trésorerie (ancien rôle, remplacé par Trésorier · caisse)", perms:["fin.voir","tel.voir","export"], partage:"Éditeur"},
  formation:{l:"Responsable Formation", perms:["peda.voir","peda.saisir","peda.valider","cat.gerer","tut.voir","export","tel.voir","msg.peda"], partage:"Éditeur"},
  tuteurs:{l:"Responsable des Tuteurs", perms:["tut.voir","tut.suivre","tut.valider","export","tel.voir"], partage:"Éditeur"},
  accompagnement:{l:"Responsable Suivi et Accompagnement", perms:["peda.voir","tut.voir","acc.gerer","export","tel.voir","msg.peda"], partage:"Éditeur"},
  pedagogie:{l:"Formateur de l'Académie", perms:["peda.voir","peda.saisir","tel.voir","msg.peda"], partage:"Contributeur"},
  tuteur:{l:"Tuteur", perms:["tut.saisir"], partage:"Contributeur"}
};
const SPECS_FORM = ["IAN-BD : Informatique et Sciences du Numérique – Bases de Données","IAN-RSI : Informatique et Sciences du Numérique – Réseaux et Sécurité Informatique","IAN-DAS : Informatique et Sciences du Numérique – Développement d'Applications et e-Services","IAN-MMX : Informatique et Sciences du Numérique – Multimédia et Arts Numériques","HSN-COM : Humanités et Sciences Numériques – Communication Digitale","GEN-CMD : Gestion, Économie et Numérique – E-commerce et Marketing Digital","ADN-ATD : Administration et Droit du Numérique – E-Administration et Transformations","IAN-STG : Sciences Géospatiales (Géomatique)"];
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
  firstJournal:true,
  consignes:[], evaluations:[], messages:[], formations:[], affectations:[], rapportsHebdo:[], dossiers:[], rapportsResp:[], syntheses:[], sf:{sem:"", st:""}, df:{st:"ouverts"}, cf2:{st:"", q:""}, editRH:null, mf:{onglet:"attente", type:""}, classements:[], cf:{statut:"", dest:""}, evalP:"", classP:"", rp:{type:"", mois:"", a:"", b:"", tut:""}
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
  const canaux = new Set(["president", ...LECTURE_TOTALE]);
  if ((pour||[]).some(p=>["bureau","formation","pedagogie"].includes(p))) canaux.add("secretaire");
  if ((pour||[]).includes("tresorerie")) canaux.add("caisse");
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
    navigator.serviceWorker?.ready.then(r => r.showNotification("CVPB Manager", {body:texte, icon:"icon-192.png", badge:"badge-96.png", tag:"cvpb", renotify:true}));
  } catch(e){}
}

/* Numéro suivant (ENC-0031, DEP-0004, CVPB-26-0033…) attribué par le serveur sans doublon */
function numero(col, prefixe, liste, champ, fabrique){
  const n = liste.reduce((m,x)=>{ const v = parseInt(String(x[champ]||x.id||"").replace(prefixe,""),10); return isNaN(v)?m:Math.max(m,v); },0);
  return S.db.numeroter(col, prefixe, n+1, fabrique);
}

/* ======== Navigation ======== */
const R = (...l) => () => inclut(l, role()) || role()==="president";
const RL = (...l) => () => inclut(l, role()) || role()==="president" || LECTURE_TOTALE.includes(role());
const VIEWS = [
  {id:"accueil", l:"Tableau de bord", ok:()=>true},
  {id:"consignes", l:"Consignes", ok:()=>true},
  {id:"suivi", l:"Suivi des étudiants", ok:RL("tuteurs","accompagnement","secretaire","formation")},
  {id:"synthese", l:"Synthèses et rapports", ok:RL("secretaire","formation","tuteurs","accompagnement")},
  {id:"catalogue", l:"Catalogue des formations", ok:RL("formation","secretaire","pedagogie")},
  {id:"messages", l:"WhatsApp étudiants", ok:()=>domainesMsg().length>0 || lectureTotale()},
  {id:"etudiants", l:"Étudiants", ok:RL("encaissement","tresorerie","secretaire")},
  {id:"registre", l:"Registre des encaissements", ok:RL("encaissement","tresorerie")},
  {id:"cotisations", l:"Suivi des cotisations", ok:RL("encaissement","tresorerie")},
  {id:"caisse", l:"Caisse", ok:RL("caisse","tresorerie")},
  {id:"depots", l:"Mes dépôts à la caisse", ok:()=>role()==="encaissement"},
  {id:"pedagogie", l:"Suivi pédagogique", ok:RL("formation","pedagogie","secretaire","accompagnement")},
  {id:"tutorat", l:"Anciens rapports de séance", ok:RL("formation","tuteurs","secretaire")},
  {id:"rapports", l:"Rapports PDF", ok:()=>can("fin.voir")||can("tut.voir")},
  {id:"evaluations", l:"Évaluations", ok:()=>presidence()||LECTURE_TOTALE.includes(role())},
  {id:"classement", l:"Classement", ok:()=>!presidence()&&!LECTURE_TOTALE.includes(role())},
  {id:"notifications", l:"Alertes et notifications", ok:()=>true},
  {id:"admin", l:"Administration", ok:R()},
  {id:"compte", l:"Mon compte", ok:()=>true}
];
function view(){ const h = location.hash.slice(1); const v = VIEWS.find(x=>x.id===h && x.ok()); return v ? v.id : "accueil"; }
addEventListener("hashchange", () => { render(); scrollTo(0,0); });
$("#search") && ($("#search").onclick = () => rechercheGlobale());
addEventListener("keydown", e => { if (!S.uid || $("#overlay").classList.contains("open")) return; if ((e.key==="k" && (e.ctrlKey||e.metaKey)) || (e.key==="/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||""))){ e.preventDefault(); rechercheGlobale(); } });
$("#bell").onclick = () => { location.hash = role()==="tuteur" ? "t-notifs" : "notifications"; };

/* ======== Notifications ======== */
function mesNotifs(){
  const r = role(); if (!r) return [];
  return S.journal.filter(j => j.par !== S.uid);
}
function nonLues(){ const seen = S.etat.vu || ""; return mesNotifs().filter(j => j.le > seen); }
function mesAlertes(){ const r = role(); return (S.C?.alertes||[]).filter(a => r==="president" || LECTURE_TOTALE.includes(r) || inclut(a.pour, r) || (r==="secretaire" && a.pour.includes("bureau"))); }
function majBadge(){
  const n = nonLues().length + mesAlertes().filter(a=>a.niv==="bad").length + consignesNonLues();
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
  if (can("tut.voir")) S.C.alertes.push(...S.T.alertes.filter(a=>!/sans rapport depuis/.test(a.titre)));
  try { S.C.alertes.push(...alertesSuivi()); } catch(e){ console.error(e); }
  const mesRet = mesConsignes().filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today());
  if (mesRet.length) S.C.alertes.push({niv:"bad", titre:`${mesRet.length} consigne(s) de la Présidence en retard`, detail:mesRet.slice(0,3).map(k=>k.titre).join(" · "), pour:[role()], lien:"#consignes"});
  if (consignesNonLues()) S.C.alertes.push({niv:"warn", titre:`${consignesNonLues()} nouvelle(s) consigne(s) de la Présidence`, detail:mesConsignes().filter(k=>k.statut==="Envoyée").slice(0,3).map(k=>k.titre).join(" · "), pour:[role()], lien:role()==="tuteur"?"#t-consignes":"#consignes"});
  if (lectureTotale()){ const ret = S.consignes.filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today()); if (ret.length) S.C.alertes.push({niv:"warn", titre:`${ret.length} consigne(s) non exécutée(s) à l'échéance`, detail:[...new Set(ret.map(k=>k.destNom))].slice(0,4).join(", "), pour:["president"], lien:"#consignes"}); }
}
function render(){
  const main = $("#main");
  $("#bnav").hidden = true; if ($("#avatar")) $("#avatar").hidden = true;
  if (S.sansConfig){ $("#tabs").innerHTML=""; main.innerHTML = gate("Configuration à terminer", "Le fichier <b>firebase-config.js</b> contient encore les valeurs d'exemple. Remplacez-les par la configuration de votre projet Firebase (voir le guide LISEZ-MOI)."); return; }
  if (!S.authPret){ main.innerHTML = `<div class="empty">Chargement de l'application…</div>`; return; }
  if (!S.uid){ $("#tabs").innerHTML=""; $("#who").innerHTML=""; $("#bell").hidden = true; if ($("#search")) $("#search").hidden = true; espace(false); renderLogin(main); return; }
  $("#bell").hidden = false; if ($("#search")) $("#search").hidden = false;
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
  const nb = x => x.id==="notifications" ? nonLues().length : x.id==="tutorat" && can("tut.suivre") ? S.T.nouveaux.length : x.id==="suivi" ? (role()==="tuteurs" ? S.rapportsHebdo.filter(r=>r.statut==="Soumis").length : role()==="accompagnement" ? S.rapportsHebdo.filter(r=>r.statut==="Validé").length : role()==="secretaire" ? etatSuivi().aControler : 0) : x.id==="synthese" ? (role()==="secretaire" ? S.rapportsResp.filter(r=>r.statut==="Transmis").length : presidence() ? S.syntheses.filter(s=>s.statut==="Transmise" && !s.luLe).length : S.rapportsResp.filter(r=>r.auteurEmail===S.email && r.statut==="Complément demandé").length) : x.id==="messages" ? S.messages.filter(m=>m.statut==="À envoyer" && (lectureTotale() || domainesMsg().includes(m.domaine))).length : x.id==="consignes" ? (lectureTotale() ? S.consignes.filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today()).length : consignesNonLues()) : 0;
  navigation(VIEWS.filter(x=>x.ok()).map(x=>({id:x.id, l:x.id==="consignes"&&!lectureTotale()?"Mes consignes":lab(x), n:nb(x)})), v, principauxDe(c.role));
  majBadge();
  if (v==="depots") S.sub.caisse = "depots";
  main.innerHTML = (v==="accueil" ? blocConsignes() : "") + ({suivi:vSuivi, synthese:vSynthese, catalogue:vCatalogue, messages:vMessages, consignes:vConsignes, rapports:vRapports, evaluations:vEvaluations, classement:vClassement, accueil:vAccueil, etudiants:vEtudiants, registre:vRegistre, cotisations:vCotisations, caisse:vCaisse, depots:vCaisse, pedagogie:vPedagogie, tutorat:vTutorat, notifications:vNotifs, admin:vAdmin, compte:vCompte}[v])();
  bind(v==="depots" ? "caisse" : v);
  if (v==="compte") bindCompte();
  if (v==="notifications") marquerLu();
  ({suivi:bindSuivi, synthese:bindSynthese, catalogue:bindCatalogue, messages:bindMessages, consignes:bindConsignes, rapports:bindRapports, evaluations:bindEvaluations, classement:bindClassement}[v]||(()=>{}))();
  $("#main").querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons));
  if (!["suivi","synthese"].includes(v)){ $("#main").querySelectorAll("[data-rh]").forEach(b => b.onclick = e => { e.preventDefault(); ficheHebdo(b.dataset.rh); }); $("#main").querySelectorAll("[data-dos]").forEach(b => b.onclick = () => ficheDossier(b.dataset.dos)); $("#main").querySelectorAll("[data-syn]").forEach(b => b.onclick = () => ficheSynthese(b.dataset.syn)); }
  $("#main").querySelectorAll("[data-seav]").forEach(b => b.onclick = () => validerSeance(b.dataset.seav, true));
  $("#main").querySelectorAll("[data-sear]").forEach(b => b.onclick = () => validerSeance(b.dataset.sear, false));
}
function espace(tut){
  document.body.classList.toggle("tut", !!tut);
  $("#appTitle").textContent = tut ? "Espace Tuteurs CVPB" : "CVPB Manager";
  $("#appSub").textContent = tut ? "Rapports hebdomadaires · CVPB Académie 2026-2027" : "Gouvernance · Finances · Suivi des étudiants";
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
  if (r==="president" || LECTURE_TOTALE.includes(r)) return vGeneral();
  return ({tuteurs:vDashTuteurs, accompagnement:vDashAccomp, secretaire:vDashSG, encaissement:vDashEnc, caisse:vDashCaisse, tresorerie:vDashTreso, formation:vDashFormation, pedagogie:vDashPeda}[r] || vGeneral)();
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
    S.syntheses.filter(x=>x.statut==="Transmise" && !x.luLe).length && `<a class="btn primary" href="#synthese">${S.syntheses.filter(x=>x.statut==="Transmise" && !x.luLe).length} synthèse(s) du Secrétariat général à lire</a>`,
    etatAccomp().intervention.length && `<a class="btn" href="#suivi">${etatAccomp().intervention.length} suivi(s) nécessitant une intervention</a>`
  ].filter(Boolean) : [];
  const equipe = Object.entries(S.comptes).filter(([,c])=>c.role!=="tuteur" && c.actif!==false).map(([u,c])=>{ const J = S.journal.filter(j=>j.par && j.par===c.uid); const il7 = Date.now()-7*86400000; return {u, c, dernier:J[0]?.le, n7:J.filter(j=>new Date(j.le).getTime()>il7).length}; });
  return `${entete(pres?"Tableau général de la CVPB":"Vue d'ensemble de la CVPB")}
  ${pres?`<div class="card"><h3>À traiter par la Présidence</h3>${todo.length?`<div class="row">${todo.join("")}</div>`:`<div class="empty">Rien en attente de votre décision.</div>`}</div>`:""}
  ${blocSuiviDirection()}
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

/* Espace du Secrétariat général : membres et activités, sans aucune donnée financière */
function vDashSG(){
  const E = etatSuivi(), X = etatAccomp(), aCtl = S.rapportsHebdo.filter(r=>["Validé","Exploité"].includes(r.statut) && !r.controle?.le);
  const rr = S.rapportsResp, rec = recurrents(), sem = derniereSemaineDue(), syn = sem && S.syntheses.find(s=>s.id===sem);
  const incomplets = E.retournes + X.sansAction.length + (E.sem ? E.nonSuivis.length : 0);
  return `${entete("Mon espace · Secrétariat général")}
  <div class="kpis">${kpi(`${E.soumis} / ${E.attendus}`,`rapports soumis${E.sem?` (${parseD(E.sem).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})})`:""}`, E.retard?"warn":"g")}${kpi(E.valides,"rapports validés")}${kpi(aCtl.length,"à contrôler", aCtl.length?"warn":"g")}${kpi(E.controles,"contrôlés","g")}${kpi(rr.length,"rapports des responsables reçus")}${kpi(rr.filter(r=>r.statut==="Transmis").length,"en attente d'examen", rr.some(r=>r.statut==="Transmis")?"warn":"g")}${kpi(incomplets,"dossiers incomplets ou non traités", incomplets?"bad":"g")}${kpi(rec.length,"difficultés récurrentes")}</div>
  <div class="card"><div class="spread"><div><h3>Synthèse hebdomadaire</h3><p class="small muted">${sem?esc(semLib(sem)):"Aucune semaine échue"}${syn?` · ${esc(syn.statut)}`:" · à préparer"}</p></div><a class="btn primary" href="#synthese">${syn?.statut==="Transmise"?"Voir":"Préparer la synthèse"}</a></div></div>
  <div class="cols"><div class="card"><div class="spread"><h3>Rapports validés à contrôler</h3><a class="btn ghost" href="#suivi">Suivi</a></div>${aCtl.length?`<div class="clist">${aCtl.slice(0,8).map(r=>`<button class="citem" data-rh="${esc(r.id)}"><span class="t">${esc(r.tuteurNom)} ${pillRH(r.statut)}</span><span class="m"><span>${esc(semLib(r.semaine))}</span><span>· validé par ${esc(r.validation?.par||"")}</span></span></button>`).join("")}</div>`:`<div class="empty">Rien à contrôler.</div>`}</div>
  <div class="card"><h3>Difficultés récurrentes</h3>${rec.length?`<div class="plist">${rec.map(x=>`<div class="prow"><span>${esc(nomEtu(x.m))}</span><span class="pill warn">${x.n} semaines</span></div>`).join("")}</div>`:`<div class="empty">Aucun étudiant signalé plusieurs semaines.</div>`}<h3>Mes alertes</h3>${alertesHTML(mesAlertes(),5)}</div></div>`;
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
    ${histoMessages(mat)}
    <div class="row">${can("enc.saisir")?`<button class="btn primary" id="fEnc">+ Encaissement</button>`:""}${can("etu.gerer")?`<button class="btn" id="fEdit">Modifier la fiche</button>`:""}${wa&&fin&&(e.arriere||e.resteCourant||!e.inscOk)?`<a class="btn vert" href="${wa}" target="_blank" rel="noopener">Relancer sur WhatsApp</a>`:""}<button class="btn" id="fPdf">PDF</button><button class="btn" data-close>Fermer</button></div>`);
  $("#fPdf").onclick = () => rptEtudiant(mat);
  $("#fMsg") && ($("#fMsg").onclick = () => formMessage(mat));
  $("#sheet").querySelectorAll("[data-fmenv]").forEach(b => b.onclick = () => { envoyerMsg(S.messages.find(x=>x.id===b.dataset.fmenv)); closeSheet(); });
  $("#fEnc") && ($("#fEnc").onclick = () => formEnc(mat));
  $("#fEdit") && ($("#fEdit").onclick = () => formEtu(mat));
}
const toutesFormations = () => S.formations.length ? S.formations : (P().formations||[]);
const nomForm = c => toutesFormations().find(f=>f.code===c)?.intitule || "";
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
    if (ok){
      log("encaissement", `${id} · ${FC(montant)} · ${na} · ${s?.nom||payeur}`, ["president","tresorerie"], {montant}); closeSheet();
      if (m){ const [msg] = await preparerMessages("recu", [{matricule:m, ref:id}]);
        if (msg) openSheet(`<h2>Encaissement ${esc(id)} enregistré</h2><p>Envoyer la confirmation de paiement à <b>${esc(s.nom)}</b> sur WhatsApp ?</p>${telDe(m)?"":'<div class="banner">Pas de numéro enregistré pour cet étudiant : le message reste dans « WhatsApp étudiants ».</div>'}
          <div class="row">${telDe(m)?'<button class="btn vert" id="rcOk">Envoyer maintenant</button>':""}<button class="btn" data-close>Plus tard</button></div>`), $("#rcOk") && ($("#rcOk").onclick = () => { envoyerMsg(msg); closeSheet(); }); }
    }
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
  const C = S.C, K = C.caisse, enc = role()==="encaissement", reg = ["president","tresorerie","caisse",...LECTURE_TOTALE].includes(role());
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
  const f = toutesFormations().find(x=>x.code===code), nv = String(f?.niveau||"");
  const nivs = f && nv && !/Tous/.test(nv) ? (nv.includes("2 et 3") ? ["Licence 2","Licence 3"] : [nv]) : null;
  return S.etudiants.filter(s=>s.academie && s.statut!=="Inactif" && (!nivs || nivs.includes(s.niveau))).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
}
function vPedagogie(){
  const C = S.C, sub = S.sub.pedagogie, edit = can("peda.saisir"), valide = can("peda.valider");
  const forms = mesFormations();
  let body = "";
  if (sub==="seances"){
    const L = S.seances.slice().sort((a,b)=>b.date.localeCompare(a.date));
    body = `<div class="spread"><p class="small muted">P présent · R retard · J absent justifié · A absent non justifié. Le retard compte comme présent.</p>${edit?`<button class="btn vert" id="newSea">Pointer une séance</button>`:""}</div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Formation</th><th class="r">Présents</th><th class="r">Retards</th><th class="r">Absents</th><th class="r">Taux</th><th>Pointé par</th><th>Validation</th><th></th></tr></thead><tbody>
    ${L.map(se=>{ const v = Object.values(se.presences||{}).filter(Boolean); const c = k=>v.filter(x=>x===k).length; return `<tr><td>${dLong(se.date)}</td><td>${esc(se.formation)} · <span class="small">${esc(nomForm(se.formation))}</span></td><td class="r">${c("P")}</td><td class="r">${c("R")}</td><td class="r">${c("J")+c("A")}</td><td class="r">${v.length?pct((c("P")+c("R"))/v.length):"—"}</td><td class="small">${esc(se.parNom||"")}</td><td>${(()=>{ const st = se.validation?.statut || "Soumise"; return `<span class="pill ${st==="Validée"?"ok":st==="Retournée"?"bad":"warn"}" title="${esc(se.validation?.obs||"")}">${esc(st)}</span>`; })()}</td><td class="row">${valide && (se.validation?.statut||"Soumise")!=="Validée"?`<button class="btn sm vert" data-seav="${esc(se.id)}">Valider</button><button class="btn sm" data-sear="${esc(se.id)}">Retourner</button>`:""}${edit && (valide || se.validation?.statut!=="Validée")?`<button class="btn sm ghost" data-sea="${esc(se.id)}">Modifier</button>`:""}</td></tr>`; }).join("") || `<tr><td colspan="9"><div class="empty">Aucune séance pointée.</div></td></tr>`}
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
  const se = id ? S.seances.find(x=>x.id===id) : {date:today(), formation:mesFormations()[0]?.code, presences:{}};
  const pr = {...(se.presences||{})};
  const draw = () => {
    const L = apprenantsPour($("#s_f").value);
    $("#s_list").innerHTML = L.map(s=>`<div class="prow"><span>${esc(s.nom)} <span class="small muted num">${esc(s.matricule)}</span></span><span class="seg" data-who="${esc(s.matricule)}">${["P","R","J","A"].map(v=>`<button type="button" data-v="${v}" aria-pressed="${pr[s.matricule]===v}">${v}</button>`).join("")}</span></div>`).join("") || `<div class="empty">Aucun apprenant de ce niveau.</div>`;
    $("#s_list").querySelectorAll(".seg button").forEach(b => b.onclick = () => { const w = b.parentElement.dataset.who; pr[w] = pr[w]===b.dataset.v ? "" : b.dataset.v; b.parentElement.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", pr[w]===x.dataset.v)); });
  };
  openSheet(`<h2>${id?"Modifier la séance":"Pointer une séance"}</h2>
    <div class="g2"><label class="f" for="s_d">Date<input type="date" id="s_d" value="${esc(se.date)}" max="${today()}"></label>
    <label class="f" for="s_f">Formation<select id="s_f">${opts(mesFormations().map(f=>[f.code,`${f.code} · ${f.intitule}`]), se.formation)}</select></label></div>
    <div class="row"><button class="btn sm" type="button" id="s_all">Tous présents</button><span class="small muted">Laisser vide = non concerné par la séance.</span></div>
    <div class="plist" id="s_list"></div>
    <div class="row"><button class="btn primary" id="s_ok">Enregistrer le pointage</button><button class="btn" data-close>Annuler</button></div>`);
  $("#s_f").onchange = draw; draw();
  $("#s_all").onclick = () => { apprenantsPour($("#s_f").value).forEach(s=>pr[s.matricule]="P"); draw(); };
  $("#s_ok").onclick = async () => {
    const mats = new Set(apprenantsPour($("#s_f").value).map(s=>s.matricule));
    const presences = Object.fromEntries(Object.entries(pr).filter(([k,v])=>v && mats.has(k)));
    if (!Object.keys(presences).length){ toast("Pointez au moins un apprenant."); return; }
    const data = {date:$("#s_d").value, formation:$("#s_f").value, presences, par:id ? (se.par||S.uid) : S.uid, parNom:id ? (se.parNom||compte().nom) : compte().nom, majLe:nowISO(), validation:{statut:"Soumise"}, historique: ajoute(se.historique, trace(id ? (se.validation?.statut==="Retournée" ? "Séance corrigée et soumise à nouveau" : "Séance modifiée") : "Séance pointée", "Soumise"))};
    const ref = id ? S.db.doc("seances/"+id) : S.db.collection("seances").doc();
    if (await write(()=>ref.set(data), "Présences enregistrées")){ const v=Object.values(presences); log("seance", `Séance ${data.formation} du ${dFR(data.date)} : ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents`, ["president","bureau"]);
      const abs = Object.entries(presences).filter(([,x])=>x==="A").map(([k])=>({matricule:k, ref:ref.id}));
      if (abs.length) preparerMessages("absence", abs).then(L => L.length && toast(`${L.length} message(s) d'absence préparé(s) dans « WhatsApp étudiants »`)); closeSheet(); }
  };
}
async function saveNotes(code){
  const cur = {...(S.notes.find(n=>n.id===code)?.notes||{})}; let bad = 0;
  document.querySelectorAll(".noteIn").forEach(i => { const raw = i.value.trim().toUpperCase().replace(",","."); if (raw===""){ delete cur[i.dataset.mat]; return; } if (raw==="ABS"){ cur[i.dataset.mat]="ABS"; return; } const n = Number(raw); if (isNaN(n)||n<0||n>20){ bad++; i.style.borderColor="var(--bad)"; return; } cur[i.dataset.mat] = n; });
  if (bad){ toast(`${bad} note(s) invalide(s) : saisissez un nombre entre 0 et 20 ou ABS.`); return; }
  const avant = S.notes.find(n=>n.id===code)?.notes || {};
  const changes = Object.entries(cur).filter(([k,v])=>String(avant[k])!==String(v)).map(([k,v])=>({matricule:k, ref:`${code}|${v}`}));
  if (changes.length) setTimeout(() => preparerMessages("note", changes).then(L => L.length && toast(`${L.length} message(s) de note préparé(s) dans « WhatsApp étudiants »`)), 800);
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
const TVIEWS = [{id:"t-accueil", l:"Mon tableau de bord"},{id:"t-hebdo", l:"Rapport de la semaine"},{id:"t-rapports", l:"Mes rapports"},{id:"t-etudiants", l:"Mes étudiants"},{id:"t-consignes", l:"Consignes"},{id:"t-classement", l:"Classement"},{id:"t-notifs", l:"Notifications"},{id:"t-compte", l:"Mon compte"}];
function tview(){ const h = location.hash.slice(1); return TVIEWS.some(v=>v.id===h) ? h : "t-accueil"; }
const mesRapports = () => S.T.rapports.filter(r=>r.doc===S.uid);
function renderTuteur(main){
  const v = tview();
  navigation(TVIEWS.map(x=>({id:x.id, l:x.l, n:x.id==="t-notifs"?nonLues().length:x.id==="t-consignes"?consignesNonLues():0})), v, principauxDe("tuteur"));
  if (v==="t-consignes"){ main.innerHTML = vConsignes(); bindConsignes(); return; }
  if (v==="t-classement"){ main.innerHTML = vClassement(); bindClassement(); return; }
  if (v==="t-hebdo"){ const r = S.editRH ? rhDe(S.email, S.editRH) : null; S.editRH = null; main.innerHTML = formHebdoHTML(r && ["Brouillon","Retourné"].includes(r.statut) ? r : null); bindFormHebdo(r && ["Brouillon","Retourné"].includes(r.statut) ? r : null); return; }
  if (v==="t-rapports"){ main.innerHTML = vTuteurHebdoListe(); main.querySelectorAll("[data-rh]").forEach(b => b.onclick = () => ficheHebdo(b.dataset.rh)); return; }
  if (v==="t-etudiants"){ main.innerHTML = vTuteurEtudiants(); return; }
  if (v==="t-accueil"){ main.innerHTML = vTuteurAccueil(); main.querySelectorAll("[data-rh]").forEach(b => b.onclick = () => ficheHebdo(b.dataset.rh)); main.querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons)); return; }
  if (v==="t-notifs"){ main.innerHTML = `<h2>Notifications</h2><div class="card">${feedHTML(mesNotifs(),60)}</div>`; marquerLu(); return; }
  if (v==="t-compte"){ main.innerHTML = vCompte(); bindCompte(); return; }
  const L = mesRapports(), c = compte();
  const t = (() => { const st = statsTutorat(S.tut.filter(d=>d.id===S.uid), {}, today()); return Object.values(st.parTuteur)[0] || {}; })();
  if (v==="t-rapports"){
    main.innerHTML = `<div class="spread"><h2>Mes rapports</h2><div class="row"><button class="btn" id="tPdf">PDF</button><a class="btn vert" href="#t-nouveau" id="tNew">+ Nouveau rapport</a></div></div>
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
  $("#tPdf") && ($("#tPdf").onclick = () => { const d = L.map(r=>jourRap(r)).sort(); rptTutorat(d[0]||today(), d[d.length-1]||today()); });
  if (v==="t-accueil") main.insertAdjacentHTML("afterbegin", blocConsignes()), main.querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons));
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
      <tr><td>Vice-présidence</td><td class="small">Tout en lecture (finances, téléphones, pédagogie, tutorat, consignes, évaluations), sans rien valider ni administrer</td></tr>
      <tr><td>Secrétariat général</td><td class="small">Membres sans montants ni téléphones, présences et notes, rapports des tuteurs en lecture, classement</td></tr>
      <tr><td>Responsable des encaissements</td><td class="small">Étudiants (avec téléphones), registre, cotisations, ses dépôts à la caisse</td></tr>
      <tr><td>Trésorier(e) · responsable de la caisse</td><td class="small">Caisse (dépôts à valider, entrées et sorties, livre de caisse), registre et cotisations, téléphones, messages WhatsApp de paiement</td></tr>
      
      <tr><td>Responsable des Tuteurs</td><td class="small">Affecte les étudiants aux tuteurs, valide ou retourne les rapports hebdomadaires, signale les interventions</td></tr>
      <tr><td>Responsable Suivi et Accompagnement</td><td class="small">Exploite les rapports validés, ouvre et pilote les suivis d'accompagnement, valide leur résolution</td></tr>
      <tr><td>Responsable Formation (ex-Commission Formation)</td><td class="small">Gère le catalogue des formations (création, modules, formateurs, statuts), valide les séances, transmet ses rapports au Secrétariat général</td></tr>
      <tr><td>Formateur de l'Académie</td><td class="small">Uniquement les formations, modules et apprenants qui lui sont attribués : pointage et notes</td></tr>
      <tr><td>Tuteur</td><td class="small">Espace Tuteurs : rapport hebdomadaire obligatoire, ses étudiants, ses consignes, le classement</td></tr>
      </tbody></table></div>
      <p class="small muted">Ces limites sont appliquées par le serveur (règles de sécurité Firebase), pas seulement par l'affichage : un compte ne peut pas lire les données d'un autre rôle, même avec des connaissances techniques.</p></details>`;
  }
  if (sub==="import"){
    body = `<div class="card"><h3>Importer les données initiales</h3>
      <p class="small">Choisissez le fichier <b>donnees-initiales-cvpb.json</b> fourni avec l'application (étudiants, téléphones, encaissements, dépôts, sorties, paramètres, rapports de tutorat). À faire une seule fois, juste après la première installation.</p>
      <p class="small muted">Ce fichier contient des données personnelles : ne le publiez jamais sur internet et supprimez-le du téléphone ou de l'ordinateur après l'import.</p>
      <input type="file" id="impF" accept=".json,application/json">
      <p class="small" id="impInfo">${esc(S.imp?.info||"")}</p>
      <div class="row"><button class="btn primary" id="impOk" ${S.imp?.J && !S.imp?.busy ? "" : "disabled"}>${S.imp?.busy?"Import en cours…":"Importer"}</button></div></div>`;
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
    <label class="f" for="c_r">Rôle<select id="c_r">${opts(Object.entries(ROLES).filter(([k])=>k!=="president" && (k!=="tresorerie" || c.role==="tresorerie")).map(([k,r])=>[k,r.l]), c.role)}</select></label>
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
      const msg = `Bonjour ${data.nom}, votre accès à l'application CVPB Manager est prête (${ROLES[data.role].l}).\nOuvrez ce lien : ${lien}\nTouchez « Se connecter avec Google UVCI » et choisissez votre compte ${em}.\nPensez à installer l'application sur votre téléphone (menu du navigateur > Installer l'application).`;
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
    /* L'état de l'import est gardé dans S.imp : l'écran se redessine à chaque mise à jour en direct */
    if ($("#impF")){
      const info = t => { S.imp.info = t; const el = $("#impInfo"); if (el) el.textContent = t; };
      S.imp = S.imp || {J:null, info:"", busy:false};
      $("#impF").onchange = async e => { try { const J = JSON.parse(await e.target.files[0].text()); S.imp.J = J; const n = k => Object.keys(J[k]||{}).length; info(`Fichier prêt : ${n("etudiants")} étudiants, ${n("encaissements")} encaissements, ${n("depots")} dépôts, ${n("operations")} opérations, ${Object.values(J.rapports_tuteurs||{}).reduce((a,d)=>a+Object.keys(d.rapports||{}).length,0)} rapports de tutorat.${S.etudiants.length?" Des données existent déjà : les fiches de même numéro seront remplacées.":""} Cliquez sur « Importer ».`); const b = $("#impOk"); if (b) b.disabled = false; } catch(err){ S.imp.J = null; info("Fichier illisible : choisissez donnees-initiales-cvpb.json."); } };
      $("#impOk").onclick = async () => {
        if (!S.imp.J || S.imp.busy) return; S.imp.busy = true; info("Import en cours… ne fermez pas la page."); const b = $("#impOk"); if (b){ b.disabled = true; b.textContent = "Import en cours…"; }
        try { const n = await importer(S.imp.J); S.imp = {J:null, busy:false, info:`Import terminé : ${n} fiches enregistrées. Supprimez maintenant le fichier de l'ordinateur.`}; toast("Import terminé"); log("import", `Données initiales importées (${n} fiches)`, ["tous"]); render(); }
        catch(err){ S.imp.busy = false; info(err?.code==="invalid_argument" ? "Import refusé par les règles de sécurité : publiez les dernières règles dans Firebase, puis réessayez." : "Import interrompu : vérifiez la connexion et réessayez."); render(); }
      };
    }
    main.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(b.dataset.copy); toast("Lien copié"); }catch(e){ toast("Copie impossible : sélectionnez le lien à la main."); } });
    on("#pf","onsubmit",e=>{e.preventDefault();saveParams();});
    on("#expJ","onclick",()=>exportCSV("CVPB_journal",["Date","Par","Rôle","Action"],S.journal.map(j=>[new Date(j.le).toLocaleString("fr-FR"),j.parNom,ROLES[j.role]?.l||"",j.texte])));
  }
}

/* =====================================================================
   Navigation (onglets sur ordinateur, barre basse sur téléphone)
   ===================================================================== */
const ICO = (() => {
  const s = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  return {
    accueil: s('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'),
    consignes: s('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
    etudiants: s('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>'),
    registre: s('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
    cotisations: s('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>'),
    caisse: s('<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M16.5 12.5h2"/><path d="M2.5 9.5h19"/>'),
    depots: s('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>'),
    pedagogie: s('<path d="m2 8 10-5 10 5-10 5z"/><path d="M6 10.5V16c2 2 10 2 12 0v-5.5"/>'),
    tutorat: s('<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'),
    rapports: s('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 17v-3M12 17v-5M15 17v-2"/>'),
    evaluations: s('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    classement: s('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
    notifications: s('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    admin: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    compte: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
    nouveau: s('<path d="M12 5v14M5 12h14"/>'),
    suivi: s('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    synthese: s('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    catalogue: s('<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
    hebdo: s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 15h5"/>'),
    messages: s('<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.4a8.4 8.4 0 1 1 15.4-4.5z"/><path d="M9 9.5c.3 2 2.2 4.2 5.2 5l1-1.2-1.6-1-.8.6c-.9-.4-1.8-1.3-2.2-2.2l.6-.8-1-1.6z"/>'),
    menu: s('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')
  };
})();
const icoDe = id => ICO[String(id).replace(/^t-/,"")] || ICO[{nouveau:"nouveau", rapports:"registre", notifs:"notifications"}[String(id).replace(/^t-/,"")]] || ICO.menu;
function initiales(n){ return String(n||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase(); }

/* items : [{id, l, n}] ; principaux : identifiants à mettre dans la barre basse */
function navigation(items, courant, principaux){
  $("#tabs").innerHTML = items.map(x=>`<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${esc(x.l)}${x.n?` (${x.n})`:""}</a>`).join("");
  const bn = $("#bnav"); bn.hidden = false;
  const pr = principaux.map(id=>items.find(x=>x.id===id)).filter(Boolean).slice(0,4);
  const court = l => ({"Tableau de bord":"Accueil","Tableau général":"Accueil","Mon espace":"Accueil","Mon tableau de bord":"Accueil","Alertes et notifications":"Alertes","Notifications":"Alertes","Registre des encaissements":"Registre","Suivi des cotisations":"Cotisations","Suivi pédagogique":"Pédagogie","Rapports des tuteurs":"Tutorat","Mes consignes":"Consignes","Nouveau rapport":"Rapport","Mes rapports":"Rapports","Mes dépôts à la caisse":"Dépôts","WhatsApp étudiants":"WhatsApp","Suivi des étudiants":"Suivi","Synthèses et rapports":"Synthèses","Catalogue des formations":"Catalogue","Rapport de la semaine":"Rapport","Mes étudiants":"Étudiants"}[l] || l);
  bn.innerHTML = pr.map(x=>`<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${icoDe(x.id)}<span>${esc(court(x.l))}</span>${x.n?`<b class="nb">${x.n>99?"99+":x.n}</b>`:""}</a>`).join("")
    + `<button type="button" id="bMenu" ${pr.some(x=>x.id===courant)?"":'aria-current="page"'}>${ICO.menu}<span>Menu</span></button>`;
  $("#bMenu").onclick = () => {
    openSheet(`<div class="spread"><h2>Menu</h2><button class="btn ghost" data-close>Fermer</button></div>
      <div class="menu">${items.map(x=>`<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${icoDe(x.id)}<span>${esc(x.l)}${x.n?` (${x.n})`:""}</span></a>`).join("")}</div>`);
    $("#sheet").querySelectorAll(".menu a").forEach(a => a.addEventListener("click", () => closeSheet()));
  };
  const av = $("#avatar"); if (av && compte()){ av.hidden = false; av.textContent = initiales(compte().nom); }
}
function principauxDe(r){
  return ({
    president:["accueil","synthese","consignes","caisse"], vicepresident:["accueil","synthese","suivi","notifications"], tuteurs:["accueil","suivi","consignes","notifications"], accompagnement:["accueil","suivi","messages","consignes"],
    encaissement:["accueil","registre","messages","consignes"], caisse:["accueil","caisse","messages","consignes"],
    tresorerie:["accueil","consignes","cotisations","notifications"], formation:["accueil","catalogue","pedagogie","consignes"],
    pedagogie:["accueil","pedagogie","catalogue","messages"], secretaire:["accueil","suivi","synthese","consignes"],
    tuteur:["t-accueil","t-hebdo","t-rapports","t-consignes"]
  })[r] || ["accueil","consignes","notifications"];
}

/* =====================================================================
   Consignes de la Présidence (ordres suivis : échéance, lecture, exécution)
   ===================================================================== */
const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const moisLibelle = p => { const [y,m] = String(p).split("-").map(Number); return `${MOIS_FR[(m||1)-1]} ${y}`; };
const moisCourant = () => today().slice(0,7);
const derniersMois = n => { const d = parseD(today()); return Array.from({length:n}, (_,i) => { const x = new Date(d.getFullYear(), d.getMonth()-i, 1); return `${x.getFullYear()}-${pad(x.getMonth()+1)}`; }); };
const presidence = () => role()==="president";
const lectureTotale = () => presidence() || LECTURE_TOTALE.includes(role());

function etatC(c){
  if (c.statut==="Annulée") return {k:"Annulée", cls:"mute"};
  if (c.statut==="Faite") return (c.faitLe||"").slice(0,10) <= c.echeance ? {k:"Faite", cls:"ok"} : {k:"Faite en retard", cls:"warn"};
  if (c.echeance < today()) return {k:"En retard", cls:"bad"};
  return {k: c.statut==="Envoyée" ? "Non lue" : c.statut, cls: c.statut==="En cours" ? "" : c.statut==="Lue" ? "" : "warn"};
}
const mesConsignes = () => S.consignes.filter(c => c.dest===S.email);
const consignesNonLues = () => mesConsignes().filter(c => c.statut==="Envoyée").length;

function vConsignes(){
  const f = S.cf, pres = presidence(), tout = lectureTotale();
  let L = (tout ? S.consignes : mesConsignes()).slice().sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe)));
  const actives = L.filter(c=>c.statut!=="Annulée");
  const aFaire = actives.filter(c=>c.statut!=="Faite"), retard = aFaire.filter(c=>c.echeance<today());
  const faites = actives.filter(c=>c.statut==="Faite"), aTemps = faites.filter(c=>(c.faitLe||"").slice(0,10)<=c.echeance);
  if (f.dest) L = L.filter(c=>c.dest===f.dest);
  if (f.statut==="afaire") L = L.filter(c=>c.statut!=="Faite" && c.statut!=="Annulée");
  else if (f.statut==="retard") L = L.filter(c=>c.statut!=="Faite" && c.statut!=="Annulée" && c.echeance<today());
  else if (f.statut==="faites") L = L.filter(c=>c.statut==="Faite");
  else if (!f.statut) L = L.filter(c=>c.statut!=="Annulée");
  const dests = [...new Map(S.consignes.map(c=>[c.dest, c.destNom])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"fr"));
  return `<div class="spread"><div><h2>${tout?"Consignes de la Présidence":"Mes consignes"}</h2><p class="small muted">${tout?"Ordres transmis à l'équipe, avec échéance, accusé de lecture et compte rendu d'exécution.":"Les consignes reçues de la Présidence. Marquez-les « en cours » puis « faite » avec un compte rendu."}</p></div>${pres?`<button class="btn primary" id="newC">${ICO.nouveau} Nouvelle consigne</button>`:""}</div>
  <div class="kpis">${kpi(aFaire.length, tout?"consignes en cours":"à exécuter", aFaire.length?"":"g")}${kpi(retard.length,"en retard", retard.length?"bad":"g")}${kpi(faites.length,"exécutées","g")}${kpi(pct(faites.length?aTemps.length/faites.length:null),"exécutées dans les délais")}</div>
  <div class="filters">
    <select id="cfs" aria-label="Statut">${opts([["","Toutes (hors annulées)"],["afaire","À exécuter"],["retard","En retard"],["faites","Exécutées"],["toutes","Toutes, annulées comprises"]], f.statut)}</select>
    ${tout?`<select id="cfd" aria-label="Destinataire">${opts(dests, f.dest, "Tous les destinataires")}</select>`:"<span></span>"}
  </div>
  ${L.length?`<div class="clist">${L.map(c=>{ const e = etatC(c); return `<button class="citem ${c.priorite==="Urgente"&&!["Faite","Annulée"].includes(c.statut)?"urg":""} ${c.statut==="Faite"?"done":""} ${e.k==="En retard"?"late":""}" data-cons="${esc(c.id)}">
      <span class="t">${c.priorite==="Urgente"?'<span class="pill bad">Urgent</span> ':""}${esc(c.titre)}</span>
      <span class="m"><span class="pill ${e.cls}">${esc(e.k)}</span>${tout?`<span>→ <b>${esc(c.destNom)}</b></span>`:""}<span>Échéance ${dFR(c.echeance)}</span><span>· envoyée le ${dFR(String(c.creeLe).slice(0,10))}</span></span>
    </button>`; }).join("")}</div>`:`<div class="empty">${tout?"Aucune consigne pour ce filtre.":"Aucune consigne reçue pour l'instant."}</div>`}`;
}
function bindConsignes(){
  const on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  on("#newC","onclick",()=>formConsigne());
  on("#cfs","onchange",e=>{ S.cf.statut=e.target.value; render(); });
  on("#cfd","onchange",e=>{ S.cf.dest=e.target.value; render(); });
  $("#main").querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons));
}
function formConsigne(){
  const actifs = Object.entries(S.comptes).filter(([em,c])=>c.actif!==false && em!==S.email);
  const resp = actifs.filter(([,c])=>c.role!=="tuteur").sort((a,b)=>a[1].nom.localeCompare(b[1].nom,"fr"));
  const tut = actifs.filter(([,c])=>c.role==="tuteur").sort((a,b)=>a[1].nom.localeCompare(b[1].nom,"fr"));
  const ch = ([em,c]) => `<label><input type="checkbox" name="cd" value="${esc(em)}" data-g="${c.role==="tuteur"?"t":"r"}"> ${esc(c.nom)} <span class="muted small">· ${esc(ROLES[c.role]?.l||"")}</span></label>`;
  const ech = isoD(new Date(Date.now()+3*86400000));
  openSheet(`<h2>Nouvelle consigne</h2>
  <form id="cfm" class="form" novalidate>
    <label class="f" for="c_t">Objet<input type="text" id="c_t" maxlength="90" placeholder="Ex. : Relancer les étudiants en retard de cotisation"></label>
    <label class="f" for="c_x">Instructions<textarea id="c_x" maxlength="2000" placeholder="Ce qui est attendu, le résultat à livrer, les précisions utiles."></textarea></label>
    <div class="g2"><label class="f" for="c_e">Échéance<input type="date" id="c_e" value="${ech}" min="${today()}"></label>
    <label class="f" for="c_p">Priorité<select id="c_p">${opts(["Normale","Urgente"],"Normale")}</select></label></div>
    <fieldset><legend>Destinataires</legend>
      <div class="row"><button type="button" class="btn sm" data-tous="r">Tous les responsables</button><button type="button" class="btn sm" data-tous="t">Tous les tuteurs</button></div>
      ${resp.length?`<div class="checks"><b class="small">Responsables</b>${resp.map(ch).join("")}</div>`:""}
      ${tut.length?`<div class="checks"><b class="small">Tuteurs</b>${tut.map(ch).join("")}</div>`:""}
      ${!resp.length&&!tut.length?`<div class="empty">Aucun compte à qui envoyer une consigne. Ajoutez d'abord l'équipe dans Administration.</div>`:""}
    </fieldset>
    <p class="hint">Chaque destinataire reçoit sa propre consigne, notifiée sur son téléphone, et doit la marquer « faite » avec un compte rendu.</p>
    <div class="row"><button type="submit" class="btn primary">Envoyer la consigne</button><button type="button" class="btn" data-close>Annuler</button></div>
  </form>`);
  $("#sheet").querySelectorAll("[data-tous]").forEach(b => b.onclick = () => { const L = [...$("#sheet").querySelectorAll(`input[data-g="${b.dataset.tous}"]`)]; const tous = L.every(i=>i.checked); L.forEach(i=>i.checked=!tous); });
  $("#cfm").onsubmit = async e => {
    e.preventDefault();
    const titre = $("#c_t").value.trim(), texte = $("#c_x").value.trim(), echeance = $("#c_e").value, priorite = $("#c_p").value;
    const dest = [...$("#sheet").querySelectorAll('input[name="cd"]:checked')].map(i=>i.value);
    if (!titre) return toast("Indiquez l'objet de la consigne.");
    if (!echeance) return toast("Indiquez une échéance.");
    if (!dest.length) return toast("Choisissez au moins un destinataire.");
    const groupe = "G" + Date.now().toString(36), maintenant = nowISO();
    const docs = dest.map((em,i) => { const c = S.comptes[em]; return {id:`C${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2,5)}`, data:{groupe, titre, texte, echeance, priorite, dest:em, destNom:c.nom, destRole:c.role, destUid:c.uid||null, par:S.uid, parNom:compte().nom, creeLe:maintenant, statut:"Envoyée"}}; });
    const ok = await write(() => Promise.all(docs.map(d => S.db.doc("consignes/"+d.id).set(d.data))).then(r => r.find(x=>x?.horsLigne)), dest.length>1 ? `Consigne envoyée à ${dest.length} personnes` : "Consigne envoyée");
    if (ok){
      for (const d of docs) if (d.data.destUid) log("consigne", `${priorite==="Urgente"?"URGENT · ":""}Consigne de la Présidence : ${titre} (échéance ${dFR(echeance)})`, ["u:"+d.data.destUid]);
      closeSheet();
    }
  };
}
function ficheConsigne(id){
  const c = S.consignes.find(x=>x.id===id); if (!c) return;
  const e = etatC(c), moi = c.dest===S.email, pres = presidence();
  if (moi && c.statut==="Envoyée") S.db.doc("consignes/"+id).update({statut:"Lue", luLe:nowISO()}).then(()=>{ if (!c.luNotif) log("consigne_lue", `${compte().nom} a lu la consigne « ${c.titre} »`, []); }).catch(()=>{});
  const h = (lab, d) => `<div class="${d?"on":""}">${lab}${d?` · <span class="muted">${new Date(d).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>`:""}</div>`;
  openSheet(`<div class="spread"><h2>${esc(c.titre)}</h2><span class="pill ${e.cls}">${esc(e.k)}</span></div>
    <dl class="dl"><dt>De</dt><dd>${esc(c.parNom||"Présidence")}</dd><dt>À</dt><dd>${esc(c.destNom)} <span class="muted small">· ${esc(ROLES[c.destRole]?.l||"")}</span></dd><dt>Échéance</dt><dd>${dLong(c.echeance)}${c.priorite==="Urgente"?' <span class="pill bad">Urgent</span>':""}</dd></dl>
    ${c.texte?`<div class="quote">${esc(c.texte)}</div>`:""}
    <div class="timeline">${h("Envoyée", c.creeLe)}${h("Lue", c.luLe || (moi&&c.statut==="Envoyée"?nowISO():null))}${h("En cours", c.enCoursLe)}${h(c.statut==="Faite"?"Exécutée":"Exécution", c.faitLe)}</div>
    ${c.reponse?`<div><h3>Compte rendu</h3><div class="quote">${esc(c.reponse)}</div></div>`:""}
    ${moi && !["Faite","Annulée"].includes(c.statut)?`<label class="f" for="c_r">Compte rendu d'exécution<textarea id="c_r" maxlength="1500" placeholder="Ce qui a été fait, le résultat, les difficultés éventuelles.">${esc(c.reponse||"")}</textarea></label>
      <div class="row">${c.statut!=="En cours"?`<button class="btn" id="cEnc">Je m'en occupe</button>`:""}<button class="btn vert" id="cFait">Marquer comme faite</button><button class="btn ghost" data-close>Fermer</button></div>`
    : pres ? `<div class="row">${!["Faite","Annulée"].includes(c.statut)?`<button class="btn" id="cRel">Relancer</button>`:""}${c.statut==="Faite"?`<button class="btn" id="cRouv">Rouvrir (travail insuffisant)</button>`:""}${c.statut!=="Annulée"?`<button class="btn danger" id="cAnn">Annuler la consigne</button>`:""}<button class="btn ghost" data-close>Fermer</button></div>`
    : `<div class="row"><button class="btn" data-close>Fermer</button></div>`}`);
  const maj = async (data, msg, txt) => { if (await write(() => S.db.doc("consignes/"+id).update(data), msg)){ if (txt) log("consigne_suivi", txt, c.destUid&&!moi?["u:"+c.destUid]:[]); closeSheet(); } };
  $("#cEnc") && ($("#cEnc").onclick = () => maj({statut:"En cours", enCoursLe:nowISO(), reponse:$("#c_r").value.trim()}, "Consigne en cours", `${compte().nom} a commencé la consigne « ${c.titre} »`));
  $("#cFait") && ($("#cFait").onclick = () => { const r = $("#c_r").value.trim(); if (r.length<10) return toast("Rédigez un compte rendu (au moins une phrase) avant de marquer la consigne comme faite."); maj({statut:"Faite", faitLe:nowISO(), reponse:r}, "Consigne marquée comme faite", `${compte().nom} a exécuté la consigne « ${c.titre} »${today()>c.echeance?" (en retard)":""}`); });
  $("#cRel") && ($("#cRel").onclick = () => { if (c.destUid) log("consigne_relance", `Relance de la Présidence : « ${c.titre} » (échéance ${dFR(c.echeance)})`, ["u:"+c.destUid]); toast(c.destUid ? "Relance envoyée" : "Cette personne ne s'est pas encore connectée : la consigne l'attend à sa première connexion."); closeSheet(); });
  $("#cRouv") && confirmBtn($("#cRouv"), "Confirmer la réouverture", () => maj({statut:"En cours", faitLe:null}, "Consigne rouverte", `Consigne « ${c.titre} » rouverte par la Présidence : travail à compléter`));
  $("#cAnn") && confirmBtn($("#cAnn"), "Confirmer l'annulation", () => maj({statut:"Annulée"}, "Consigne annulée", `Consigne « ${c.titre} » annulée par la Présidence`));
}

/* =====================================================================
   Évaluation des responsables et des tuteurs
   Score = 60 % automatique (faits enregistrés) + 40 % appréciation du président
   ===================================================================== */
const CRITERES = [["disponibilite","Disponibilité et assiduité"],["qualite","Qualité du travail"],["delais","Respect des délais"],["initiative","Initiative"],["equipe","Esprit d'équipe et attitude"]];
const NOTA = () => ({objActions:8, objRapports:4, ...(P().notation||{})});
const ROLES_PRODUCTIFS = ["encaissement","caisse","formation","pedagogie"];
const dansMois = (d, p) => String(d||"").slice(0,7) === p;
const clsScore = v => v==null ? "n" : v>=80 ? "a" : v>=60 ? "b" : v>=40 ? "c" : "d";
const scoreHTML = v => `<span class="score ${clsScore(v)}">${v==null?"—":Math.round(v)}</span>`;

function scoreAuto(em, c, p){
  const parts = [];
  const cs = S.consignes.filter(x => x.dest===em && x.statut!=="Annulée" && dansMois(x.echeance, p) && (x.statut==="Faite" || x.echeance < today()));
  if (cs.length){
    const pts = cs.reduce((a,x) => a + (x.statut!=="Faite" ? 0 : (x.faitLe||"").slice(0,10) <= x.echeance ? 1 : .5), 0);
    parts.push({k:"Consignes exécutées dans les délais", v:pts/cs.length*100, d:`${cs.filter(x=>x.statut==="Faite").length}/${cs.length} exécutée(s)`});
  }
  if (c.role==="tuteur"){
    const d = S.tut.find(x=>x.id===c.uid);
    const n = d ? Object.values(d.rapports||{}).filter(r=>dansMois(jourRap(r), p)).length : 0;
    parts.push({k:"Rapports de tutorat rendus", v:Math.min(100, n/NOTA().objRapports*100), d:`${n} rapport(s) / objectif ${NOTA().objRapports}`});
  } else if (ROLES_PRODUCTIFS.includes(c.role) && c.uid){
    const n = S.journal.filter(j => j.par===c.uid && dansMois(j.le, p)).length;
    parts.push({k:"Activité enregistrée dans l'application", v:Math.min(100, n/NOTA().objActions*100), d:`${n} action(s) / objectif ${NOTA().objActions}`});
  }
  return {v: parts.length ? parts.reduce((a,x)=>a+x.v,0)/parts.length : null, parts};
}
const evalDe = (em, p) => S.evaluations.find(e => e.email===em && e.periode===p);
function scoreManuel(ev){ if (!ev?.notes) return null; const v = CRITERES.map(([k])=>Number(ev.notes[k])).filter(n=>n>0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length/5*100 : null; }
function scoreTotal(a, m){ if (a==null && m==null) return null; if (a==null) return m; if (m==null) return a; return .6*a + .4*m; }
function lignesEval(p){
  return Object.entries(S.comptes).filter(([em,c]) => c.actif!==false && c.role!=="president").map(([em,c]) => {
    const a = scoreAuto(em, c, p), m = scoreManuel(evalDe(em, p));
    return {em, c, a, m, t: scoreTotal(a.v, m)};
  }).sort((x,y) => (y.t??-1)-(x.t??-1) || x.c.nom.localeCompare(y.c.nom,"fr"));
}

function vEvaluations(){
  const p = S.evalP, pres = presidence(), L = lignesEval(p), pub = S.classements.find(x=>x.id===p);
  const ligne = (x,i) => `<button class="erow" data-ev="${esc(x.em)}"><span class="rk">${x.t==null?"—":i+1}</span><span class="nm"><b>${esc(x.c.nom)}</b><span class="small muted">${esc(ROLES[x.c.role]?.l||"")} · auto ${x.a.v==null?"—":Math.round(x.a.v)} · présidence ${x.m==null?"à noter":Math.round(x.m)}</span></span>${scoreHTML(x.t)}</button>`;
  const resp = L.filter(x=>x.c.role!=="tuteur"), tut = L.filter(x=>x.c.role==="tuteur");
  const table = (T, titre) => `<div class="card"><h3>${titre} (${T.length})</h3>${T.length?`<div class="elist">${T.map(ligne).join("")}</div>`:`<div class="empty">Aucun compte.</div>`}</div>`;
  return `<div class="spread"><div><h2>Évaluation de l'équipe</h2><p class="small muted">Score sur 100 = 60 % automatique (consignes exécutées à temps, rapports ou activité dans l'application) + 40 % appréciation de la Présidence sur 5 critères.</p></div>
    <div class="row"><select id="evP" aria-label="Mois">${opts(derniersMois(12).map(m=>[m, moisLibelle(m)]), p)}</select>${pres?`<button class="btn primary" id="evPub">${pub?"Mettre à jour le classement publié":"Publier le classement"}</button>`:""}</div></div>
  ${pub?`<div class="banner" style="border-color:var(--vert);background:var(--vert-soft)">Classement de ${moisLibelle(p)} publié le ${new Date(pub.publieLe).toLocaleDateString("fr-FR",{day:"numeric",month:"long"})} : visible par toute l'équipe (scores seulement, sans vos commentaires).</div>`:`<div class="banner">Classement de ${moisLibelle(p)} non publié : l'équipe ne voit encore rien. Notez chaque personne, puis publiez.</div>`}
  ${table(resp, "Responsables")}${table(tut, "Tuteurs")}
  ${pres?`<details class="card"><summary>Objectifs utilisés pour le score automatique</summary>
    <p class="small muted">Ces objectifs mensuels sont des hypothèses de départ, à ajuster selon la réalité de la CVPB.</p>
    <div class="g2"><label class="f" for="nObjA">Actions attendues par mois (encaissements, caisse, formation)<input type="number" id="nObjA" min="1" value="${NOTA().objActions}"></label>
    <label class="f" for="nObjR">Rapports de tutorat attendus par mois<input type="number" id="nObjR" min="1" value="${NOTA().objRapports}"></label></div>
    <div class="row"><button class="btn" id="nSave">Enregistrer les objectifs</button></div></details>`:""}
  <div class="row"><button class="btn" id="evPdf">${ICO.rapports} Classement en PDF</button></div>`;
}
function bindEvaluations(){
  const on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  on("#evP","onchange",e=>{ S.evalP = e.target.value; render(); });
  $("#main").querySelectorAll("[data-ev]").forEach(tr => tr.onclick = () => ficheEval(tr.dataset.ev, S.evalP));
  on("#evPub","onclick", publierClassement);
  on("#nSave","onclick", async () => { const a = Number($("#nObjA").value), r = Number($("#nObjR").value); if (!(a>0 && r>0)) return toast("Saisissez des objectifs supérieurs à zéro."); await write(()=>S.db.doc("parametres/general").update({notation:{objActions:a, objRapports:r}}), "Objectifs enregistrés"); });
  on("#evPdf","onclick",()=>rptClassement(S.evalP));
}
function ficheEval(em, p){
  const c = S.comptes[em]; if (!c) return;
  const a = scoreAuto(em, c, p), ev = evalDe(em, p), m = scoreManuel(ev), t = scoreTotal(a.v, m), pres = presidence();
  openSheet(`<div class="spread"><div><h2>${esc(c.nom)}</h2><p class="small muted">${esc(ROLES[c.role]?.l||"")} · ${moisLibelle(p)}</p></div>${scoreHTML(t)}</div>
    <div class="card"><h3>Score automatique ${scoreHTML(a.v)}</h3>${a.parts.length?`<div class="plist">${a.parts.map(x=>`<div class="prow"><span>${esc(x.k)}<br><span class="small muted">${esc(x.d)}</span></span>${scoreHTML(x.v)}</div>`).join("")}</div>`:`<div class="empty">Pas encore de données ce mois-ci (aucune consigne échue${c.role==="tuteur"?", aucun rapport":""}).</div>`}</div>
    ${pres?`<form id="evf" class="form"><h3>Appréciation de la Présidence (1 = insuffisant, 5 = excellent)</h3>
      ${CRITERES.map(([k,l])=>`<div class="crit"><b class="small">${l}</b><div class="stars">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="${k}" value="${n}" ${Number(ev?.notes?.[k])===n?"checked":""}>${n}</label>`).join("")}</div></div>`).join("")}
      <label class="f" for="evc">Commentaire (visible uniquement par la personne et la Présidence)<textarea id="evc" maxlength="1200" placeholder="Points forts, points à améliorer, attentes pour le mois prochain.">${esc(ev?.commentaire||"")}</textarea></label>
      <div class="row"><button type="submit" class="btn primary">Enregistrer l'évaluation</button><button type="button" class="btn" id="evFp">Fiche PDF</button><button type="button" class="btn ghost" data-close>Fermer</button></div></form>`
    : `${ev?`<div class="card"><h3>Appréciation de la Présidence ${scoreHTML(m)}</h3><div class="plist">${CRITERES.map(([k,l])=>`<div class="prow"><span>${l}</span><b>${ev.notes?.[k]||"—"} / 5</b></div>`).join("")}</div>${ev.commentaire?`<div class="quote">${esc(ev.commentaire)}</div>`:""}</div>`:`<div class="empty">Pas encore d'appréciation de la Présidence ce mois-ci.</div>`}
      <div class="row"><button type="button" class="btn" id="evFp">Fiche PDF</button><button class="btn ghost" data-close>Fermer</button></div>`}`);
  $("#evFp").onclick = () => rptFicheEval(em, p);
  $("#evf") && ($("#evf").onsubmit = async e => {
    e.preventDefault();
    const notes = Object.fromEntries(CRITERES.map(([k]) => [k, Number($("#evf").querySelector(`input[name="${k}"]:checked`)?.value||0)]));
    if (Object.values(notes).some(v=>!v)) return toast("Notez les 5 critères.");
    const data = {periode:p, email:em, nom:c.nom, role:c.role, notes, commentaire:$("#evc").value.trim(), par:S.uid, le:nowISO()};
    if (await write(() => S.db.doc(`evaluations/${p}_${em}`).set(data), "Évaluation enregistrée")){ if (c.uid) log("evaluation", `Votre évaluation de ${moisLibelle(p)} a été enregistrée par la Présidence`, ["u:"+c.uid]); closeSheet(); }
  });
}
async function publierClassement(){
  const p = S.evalP, L = lignesEval(p).filter(x=>x.t!=null);
  if (!L.length) return toast("Aucun score à publier pour ce mois : notez au moins une personne.");
  const lignes = L.map((x,i) => ({rang:i+1, nom:x.c.nom, role:x.c.role, email:x.em, auto:x.a.v==null?null:Math.round(x.a.v), manuel:x.m==null?null:Math.round(x.m), total:Math.round(x.t)}));
  if (await write(() => S.db.doc("classement/"+p).set({periode:p, publieLe:nowISO(), lignes}), "Classement publié")) log("classement", `Classement de l'équipe de ${moisLibelle(p)} publié`, ["tous","tuteur","vicepresident"]);
}
function vClassement(){
  const pubs = S.classements.slice().sort((a,b)=>b.id.localeCompare(a.id));
  const p = pubs.some(x=>x.id===S.classP) ? S.classP : pubs[0]?.id;
  const cl = pubs.find(x=>x.id===p);
  const moi = cl?.lignes.find(l=>l.email===S.email), ev = S.evaluations.find(e=>e.email===S.email && e.periode===p);
  const top = cl ? cl.lignes.slice(0,3) : [];
  const pod = top.length ? `<div class="podium">${[top[1],top[0],top[2]].map((l,i)=>l?`<div class="${l.rang===1?"p1":""}"><span class="rk">${l.rang===1?"🥇":l.rang===2?"🥈":"🥉"}</span><b>${esc(l.nom)}</b><span class="muted">${esc(ROLES[l.role]?.l||"")}</span>${scoreHTML(l.total)}</div>`:"<div style='visibility:hidden'></div>").join("")}</div>` : "";
  return `<div class="spread"><div><h2>Classement de l'équipe</h2><p class="small muted">Score sur 100 : consignes exécutées à temps, travail rendu et appréciation de la Présidence.</p></div>${pubs.length?`<select id="clP" aria-label="Mois">${opts(pubs.map(x=>[x.id, moisLibelle(x.id)]), p)}</select>`:""}</div>
  ${!cl?`<div class="empty">Aucun classement publié pour l'instant.</div>`:`
  ${moi?`<div class="kpis">${kpi(`${moi.rang}<span class="small muted"> / ${cl.lignes.length}</span>`,"mon rang")}${kpi(moi.total,"mon score /100","g")}${kpi(moi.auto??"—","part automatique")}${kpi(moi.manuel??"—","appréciation de la Présidence")}</div>`:""}
  <div class="card">${pod}<div class="elist">${cl.lignes.map(l=>`<div class="erow ${l.email===S.email?"moi":""}"><span class="rk">${l.rang}</span><span class="nm"><b>${esc(l.nom)}${l.email===S.email?' <span class="pill">Vous</span>':""}</b><span class="small muted">${esc(ROLES[l.role]?.l||"")}</span></span>${scoreHTML(l.total)}</div>`).join("")}</div></div>
  ${ev?`<div class="card"><h3>Mon évaluation de ${moisLibelle(p)}</h3><div class="plist">${CRITERES.map(([k,l])=>`<div class="prow"><span>${l}</span><b>${ev.notes?.[k]||"—"} / 5</b></div>`).join("")}</div>${ev.commentaire?`<h3>Commentaire de la Présidence</h3><div class="quote">${esc(ev.commentaire)}</div>`:""}<p class="small muted">Ce commentaire n'est visible que par vous et la Présidence.</p></div>`:""}`}`;
}
function bindClassement(){ const el = $("#clP"); if (el) el.onchange = e => { S.classP = e.target.value; render(); }; }

/* =====================================================================
   Rapports PDF (mise en page A4 imprimable, « Enregistrer au format PDF »)
   ===================================================================== */
function imprimer(titre, sousTitre, corps, nomFichier){
  const logo = document.querySelector(".brand img").src;
  $("#print").innerHTML = `<div class="doc">
    <div class="hd"><img src="${logo}" alt=""><div><h1>${esc(titre)}</h1><div class="org">Communauté Virtuelle de Port-Bouët (CVPB) · Université Virtuelle de Côte d'Ivoire<br>${esc(sousTitre||"")}</div></div></div>
    <div class="meta"><span>Établi par ${esc(compte()?.nom||"")} · ${esc(ROLES[role()]?.l||"")}</span><span>Édité le ${new Date().toLocaleString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span></div>
    ${corps}
    <div class="ft">Document interne de la CVPB, généré par l'application CVPB Manager. Il contient des données personnelles d'étudiants : ne pas diffuser hors des instances de la communauté.</div></div>`;
  const avant = document.title; document.title = nomFichier || titre;
  const fin = () => { document.title = avant; $("#print").innerHTML = ""; removeEventListener("afterprint", fin); };
  addEventListener("afterprint", fin);
  toast("Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».");
  setTimeout(() => { try { window.print(); } catch(e){ toast("Impression impossible sur cet appareil. Ouvrez l'application dans Chrome."); fin(); } }, 350);
}
const T_ = (entetes, lignes, vide) => lignes.length ? `<table><thead><tr>${entetes.map(h=>`<th class="${h.startsWith("#")?"r":""}">${esc(h.replace(/^#/,""))}</th>`).join("")}</tr></thead><tbody>${lignes.map(l=>`<tr>${l.map((v,i)=>`<td class="${entetes[i].startsWith("#")?"r":""}">${v==null?"—":esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="note">${esc(vide||"Aucune donnée sur la période.")}</p>`;
const KP = L => `<div class="kp">${L.map(([v,l])=>`<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
const SIG = (g, d) => `<div class="sig"><div>${esc(g)}</div><div>${esc(d)}</div></div>`;
const entre = (d, a, b) => { const x = String(d||"").slice(0,10); return x >= a && x <= b; };
const periodeTxt = (a, b) => `Période du ${dFR(a)} au ${dFR(b)}`;
const bornesMois = p => [`${p}-01`, finMois(`${p}-01`)];

function sectionFinance(a, b){
  const C = S.C, K = C.caisse;
  const enc = S.encaissements.filter(e=>valide(e) && entre(e.date,a,b)).sort((x,y)=>x.num.localeCompare(y.num));
  const parNat = {}, parMode = {}; enc.forEach(e=>{ parNat[e.nature]=(parNat[e.nature]||0)+e.montant; parMode[e.mode]=(parMode[e.mode]||0)+e.montant; });
  const mv = K.mvts.filter(m=>entre(m.date,a,b));
  const avant = K.mvts.filter(m=>String(m.date)<a); const soldeDebut = avant.length ? avant[avant.length-1].solde : (P().soldeOuverture||0);
  const soldeFin = mv.length ? mv[mv.length-1].solde : soldeDebut;
  const dep = S.depots.filter(d=>entre(d.date,a,b));
  const tot = enc.reduce((s,e)=>s+e.montant,0), ent = mv.reduce((s,m)=>s+m.entree,0), sor = mv.reduce((s,m)=>s+m.sortie,0);
  return {tot, ent, sor, soldeDebut, soldeFin, html:`
    ${KP([[FC(tot),"encaissés sur la période"],[FC(ent),"entrées en caisse"],[FC(sor),"sorties de caisse"],[FC(soldeFin),"solde de caisse en fin de période"]])}
    <h3>Encaissements par nature</h3>${T_(["Nature","#Montant (FCFA)"], Object.entries(parNat).map(([k,v])=>[k,F(v)]))}
    <h3>Encaissements par mode de paiement</h3>${T_(["Mode","#Montant (FCFA)"], Object.entries(parMode).map(([k,v])=>[k,F(v)]))}
    <h3>Dépôts à la caisse</h3>${T_(["N°","Date","Remis par","#Registre","#Net reçu","Statut"], dep.map(d=>[d.num,dFR(d.date),d.remisPar,F(d.montantRegistre),F(d.montantNet),d.statut]))}
    <h3>Livre de caisse</h3>${T_(["Date","Pièce","Libellé","#Entrée","#Sortie","#Solde"], [["", "", "Solde en début de période", "", "", F(soldeDebut)], ...mv.map(m=>[dFR(m.date),m.ref,m.libelle,m.entree?F(m.entree):"",m.sortie?F(m.sortie):"",F(m.solde)])])}`, enc};
}
function rptFinancier(a, b){
  const f = sectionFinance(a, b), C = S.C;
  const actifs = S.etudiants.filter(s=>s.statut!=="Inactif");
  const retard = actifs.filter(s=>C.etu[s.matricule].arriere>0);
  imprimer("Rapport financier", periodeTxt(a,b), `
    <h2>1. Synthèse</h2>${f.html}
    <h2>2. Registre des encaissements</h2>${T_(["N°","Date","Étudiant ou payeur","Nature","Mode","#Montant"], f.enc.map(e=>[e.num,dFR(e.date),e.nom||e.payeur,e.nature,e.mode,F(e.montant)]))}
    <h2>3. Situation des cotisations à ce jour</h2>
    ${KP([[FC(C.totalEncaisse),"encaissé depuis le début"],[`${retard.length} / ${actifs.length}`,"étudiants en retard"],[FC(retard.reduce((s,x)=>s+C.etu[x.matricule].arriere,0)),"arriéré total"],[FC(C.caisse.engage||0),"sorties engagées non payées"]])}
    ${T_(["Matricule","Nom","Situation","#Versé","#Arriéré"], retard.map(s=>[s.matricule,s.nom,C.etu[s.matricule].situation,F(C.etu[s.matricule].totalVerse),F(C.etu[s.matricule].arriere)]), "Aucun étudiant en retard.")}
    ${SIG("Le Trésorier / la Trésorière","Le Président")}`, `CVPB_rapport_financier_${a}_${b}`);
}
function sectionTutorat(a, b, tut){
  let L = S.T.rapports.filter(r=>entre(jourRap(r),a,b));
  if (tut) L = L.filter(r=>normNom(r.tuteurNom)===tut);
  const par = {}; L.forEach(r=>{ const k = r.tuteurNom||"—"; (par[k] ||= {n:0,att:0,pres:0,part:0,np:0}); par[k].n++; par[k].att+=Number(r.attendus)||0; par[k].pres+=Number(r.presents)||0; if (r.participation){ par[k].part+=Number(r.participation); par[k].np++; } });
  const att = L.reduce((s,r)=>s+(Number(r.attendus)||0),0), pr = L.reduce((s,r)=>s+(Number(r.presents)||0),0);
  return {L, html:`${KP([[L.length,"rapports de séance"],[Object.keys(par).length,"tuteurs actifs"],[pct(att?pr/att:null),"présence des étudiants"],[L.filter(r=>r.intervention==="Oui").length,"interventions demandées"]])}
    <h3>Synthèse par tuteur</h3>${T_(["Tuteur","#Rapports","#Attendus","#Présents","#Présence","#Participation /5"], Object.entries(par).sort((x,y)=>x[0].localeCompare(y[0],"fr")).map(([k,v])=>[k,v.n,v.att,v.pres,pct(v.att?v.pres/v.att:null),v.np?(v.part/v.np).toFixed(1).replace(".",","):"—"]))}`};
}
function rptTutorat(a, b, tut){
  const t = sectionTutorat(a, b, tut);
  imprimer("Rapport de tutorat", periodeTxt(a,b) + (tut?` · ${t.L[0]?.tuteurNom||""}`:""), `
    <h2>1. Synthèse</h2>${t.html}
    <h2>2. Détail des séances</h2>${T_(["Date","Tuteur","Groupe","Thème","#Prés./att.","Difficultés","Intervention"], t.L.map(r=>[dFR(jourRap(r)),r.tuteurNom,`${codeSp(r.specialite)} ${r.niveau||""}`,r.theme,`${r.presents}/${r.attendus}`,r.difficultes==="Oui"?(r.natures||[]).join(", "):"Non",r.intervention==="Oui"?(r.interventionDetail||"Oui"):"Non"]))}
    ${t.L.length?`<h2>3. Comptes rendus</h2>${t.L.map(r=>`<h3>${esc(dFR(jourRap(r)))} · ${esc(r.tuteurNom)} · ${esc(r.theme)}</h3><p>${esc(r.compteRendu||"")}</p>${r.actionsPrevues?`<p class="note">Actions prévues : ${esc(r.actionsPrevues)}</p>`:""}`).join("")}`:""}
    ${SIG("Le/la responsable de la Commission Formation","Le Président")}`, `CVPB_rapport_tutorat_${a}_${b}`);
}
function rptGlobal(p){
  const [a, b] = bornesMois(p), C = S.C, f = sectionFinance(a, b), t = sectionTutorat(a, b);
  const actifs = S.etudiants.filter(s=>s.statut!=="Inactif");
  const sea = S.seances.filter(s=>entre(s.date,a,b)).sort((x,y)=>x.date.localeCompare(y.date));
  const pres = sea.reduce((s,x)=>{ const v=Object.values(x.presences||{}).filter(Boolean); return {p:s.p+v.filter(c=>c==="P"||c==="R").length, t:s.t+v.length}; },{p:0,t:0});
  const cons = S.consignes.filter(c=>c.statut!=="Annulée" && (dansMois(c.creeLe,p) || dansMois(c.echeance,p)));
  const cl = S.classements.find(x=>x.id===p);
  const parNiv = {}; actifs.forEach(s=>{ parNiv[s.niveau||"—"]=(parNiv[s.niveau||"—"]||0)+1; });
  imprimer(`Rapport d'activité · ${moisLibelle(p)}`, periodeTxt(a,b), `
    <h2>1. Vue d'ensemble</h2>
    ${KP([[actifs.length,"membres actifs"],[actifs.filter(s=>s.academie).length,"apprenants de l'Académie"],[FC(f.tot),"encaissés dans le mois"],[FC(C.caisse.solde),"solde de caisse actuel"],[sea.length,"séances de formation"],[pct(pres.t?pres.p/pres.t:null),"présence aux formations"],[t.L.length,"rapports de tutorat"],[`${cons.filter(c=>c.statut==="Faite").length} / ${cons.length}`,"consignes exécutées"]])}
    <h2>2. Membres</h2>${T_(["Niveau","#Membres actifs"], Object.entries(parNiv).sort())}
    <h2>3. Finances</h2>${f.html}
    <h2>4. CVPB Académie</h2>${T_(["Date","Formation","#Présents","#Effectif"], sea.map(s=>{ const v=Object.values(s.presences||{}).filter(Boolean); return [dFR(s.date),`${s.formation} · ${nomForm(s.formation)}`,v.filter(c=>c==="P"||c==="R").length,v.length]; }))}
    <h2>5. Tutorat</h2>${t.html}
    <h2>6. Consignes de la Présidence</h2>${T_(["Consigne","Destinataire","Échéance","État"], cons.map(c=>[c.titre,c.destNom,dFR(c.echeance),etatC(c).k]))}
    <h2>7. Évaluation de l'équipe</h2>${cl?T_(["#Rang","Nom","Rôle","#Score /100"], cl.lignes.map(l=>[l.rang,l.nom,ROLES[l.role]?.l||"",l.total])):`<p class="note">Classement du mois non publié.</p>`}
    <h2>8. Points d'attention en cours</h2>${T_(["Niveau","Alerte","Détail"], mesAlertes().map(x=>[{bad:"Urgent",warn:"À surveiller",info:"Information"}[x.niv],x.titre,x.detail]), "Aucune alerte en cours.")}
    ${SIG("Le Secrétaire général","Le Président")}`, `CVPB_rapport_activite_${p}`);
}
function rptEtudiant(mat){
  const s = etuBy(mat); if (!s) return; const C = S.C, e = C.etu[mat], p = C.peda[mat], fin = can("fin.voir");
  imprimer("Fiche individuelle de l'étudiant", `${s.nom} · ${s.matricule}`, `
    <h2>1. Identification</h2>${T_(["Matricule","Nom et prénoms","Niveau","Spécialité","Académie","Statut"], [[s.matricule,s.nom,s.niveau,s.specialite,s.academie?"Inscrit(e)":"Non inscrit(e)",s.statut||"Actif"]])}
    ${fin?`<h2>2. Situation financière</h2>${KP([[FC(e.inscPayee),`inscription payée / ${F(P().inscription)}`],[FC(e.totalVerse),"total versé"],[FC(e.arriere),"arriéré"],[e.situation,"situation"]])}
    ${T_(["Mois","#Versé"], C.mois.map(m=>[m.libelle, F(e.parMois[m.code]||0)]))}
    <h3>Versements</h3>${T_(["N°","Date","Nature","Mode","#Montant"], e.versements.map(v=>[v.num,dFR(v.date),v.nature,v.mode,F(v.montant)]))}`:""}
    <h2>${fin?3:2}. Suivi pédagogique</h2><p>Assiduité globale : <b>${pct(p.assiduite)}</b> (${p.pres}/${p.total} séances)</p>
    ${T_(["Formation","#Assiduité","#Note","Résultat"], Object.entries(p.par).map(([c,x])=>[`${c} · ${nomForm(c)}`,pct(x.assiduite),x.note,x.valide==null?"En cours":x.valide?"Validée":"Non validée"]), "Aucune séance ni note.")}`, `CVPB_fiche_${s.matricule}`);
}
function rptFicheEval(em, p){
  const c = S.comptes[em] || {nom:em, role:""}; const a = scoreAuto(em, c, p), ev = evalDe(em, p), m = scoreManuel(ev), t = scoreTotal(a.v, m);
  const cs = S.consignes.filter(x=>x.dest===em && x.statut!=="Annulée" && (dansMois(x.echeance,p)||dansMois(x.creeLe,p)));
  imprimer("Fiche d'évaluation individuelle", `${c.nom} · ${ROLES[c.role]?.l||""} · ${moisLibelle(p)}`, `
    ${KP([[t==null?"—":Math.round(t)+" / 100","score global"],[a.v==null?"—":Math.round(a.v),"score automatique (60 %)"],[m==null?"—":Math.round(m),"appréciation (40 %)"],[`${cs.filter(x=>x.statut==="Faite").length} / ${cs.length}`,"consignes exécutées"]])}
    <h2>1. Indicateurs automatiques</h2>${T_(["Indicateur","Détail","#Score"], a.parts.map(x=>[x.k,x.d,Math.round(x.v)]), "Pas de données sur le mois.")}
    <h2>2. Appréciation de la Présidence</h2>${ev?T_(["Critère","#Note /5"], CRITERES.map(([k,l])=>[l, ev.notes?.[k]||"—"])) + (ev.commentaire?`<h3>Commentaire</h3><p>${esc(ev.commentaire)}</p>`:""):`<p class="note">Pas d'appréciation enregistrée.</p>`}
    <h2>3. Consignes du mois</h2>${T_(["Consigne","Échéance","État","Compte rendu"], cs.map(x=>[x.titre,dFR(x.echeance),etatC(x).k,x.reponse||""]))}
    ${SIG("L'intéressé(e)","Le Président")}`, `CVPB_evaluation_${normNom(c.nom).replace(/ /g,"_")}_${p}`);
}
function rptClassement(p){
  const L = lignesEval(p);
  imprimer(`Classement de l'équipe · ${moisLibelle(p)}`, "Score sur 100 : 60 % automatique + 40 % appréciation de la Présidence", T_(["#Rang","Nom","Rôle","#Auto","#Président","#Score"], L.map((x,i)=>[x.t==null?"—":i+1,x.c.nom,ROLES[x.c.role]?.l||"",x.a.v==null?"—":Math.round(x.a.v),x.m==null?"—":Math.round(x.m),x.t==null?"—":Math.round(x.t)])) + SIG("Le Secrétaire général","Le Président"), `CVPB_classement_${p}`);
}

function vRapports(){
  const types = [
    lectureTotale() && ["global","Rapport d'activité mensuel (global)"],
    can("fin.voir") && ["financier","Rapport financier"],
    can("tut.voir") && ["tutorat","Rapport de tutorat"],
    lectureTotale() && ["classement","Classement de l'équipe"]
  ].filter(Boolean);
  const r = S.rp; if (!types.some(t=>t[0]===r.type)) r.type = types[0]?.[0];
  const mensuel = ["global","classement"].includes(r.type);
  const tuteurs = Object.values(S.T?.parTuteur||{}).sort((a,b)=>String(a.nom).localeCompare(String(b.nom),"fr"));
  return `<div><h2>Rapports PDF</h2><p class="small muted">Générez un rapport mis en page (format A4, logo CVPB, zones de signature). Dans la fenêtre qui s'ouvre, choisissez « Enregistrer au format PDF », puis partagez-le sur WhatsApp ou par e-mail.</p></div>
  <div class="card form">
    <label class="f" for="rpT">Type de rapport<select id="rpT">${opts(types, r.type)}</select></label>
    ${mensuel?`<label class="f" for="rpM">Mois<select id="rpM">${opts(derniersMois(12).map(m=>[m, moisLibelle(m)]), r.mois)}</select></label>`
    :`<div class="g2"><label class="f" for="rpA">Du<input type="date" id="rpA" value="${r.a}"></label><label class="f" for="rpB">Au<input type="date" id="rpB" value="${r.b}"></label></div>`}
    ${r.type==="tutorat"?`<label class="f" for="rpU">Tuteur<select id="rpU">${opts(tuteurs.map(t=>[t.doc,t.nom]), r.tut, "Tous les tuteurs")}</select></label>`:""}
    <div class="row"><button class="btn primary" id="rpGo">${ICO.rapports} Générer le PDF</button></div>
  </div>
  <div class="card"><h3>Autres documents PDF</h3><p class="small">La <b>fiche individuelle d'un étudiant</b> se télécharge depuis sa fiche (bouton « PDF »). La <b>fiche d'évaluation d'un responsable ou d'un tuteur</b> se télécharge depuis Évaluations.</p></div>`;
}
function bindRapports(){
  const r = S.rp, on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  on("#rpT","onchange",e=>{ r.type=e.target.value; render(); });
  on("#rpM","onchange",e=>{ r.mois=e.target.value; });
  on("#rpA","onchange",e=>{ r.a=e.target.value; }); on("#rpB","onchange",e=>{ r.b=e.target.value; });
  on("#rpU","onchange",e=>{ r.tut=e.target.value; });
  on("#rpGo","onclick",()=>{
    if (!["global","classement"].includes(r.type) && (!r.a || !r.b || r.a > r.b)) return toast("Vérifiez les dates de la période.");
    ({global:()=>rptGlobal(r.mois), classement:()=>rptClassement(r.mois), financier:()=>rptFinancier(r.a, r.b), tutorat:()=>rptTutorat(r.a, r.b, r.tut)})[r.type]();
  });
}

/* Bloc « consignes » en tête du tableau de bord */
function blocConsignes(){
  if (lectureTotale()){
    const enc = S.consignes.filter(k=>!["Faite","Annulée"].includes(k.statut)), ret = enc.filter(k=>k.echeance<today());
    const recentes = S.consignes.filter(k=>k.statut==="Faite").sort((a,b)=>String(b.faitLe).localeCompare(String(a.faitLe))).slice(0,3);
    if (!S.consignes.length) return presidence() ? `<div class="card"><div class="spread"><div><h3>Consignes à l'équipe</h3><p class="small muted">Donnez vos ordres depuis l'application : chaque destinataire est notifié et doit rendre compte.</p></div><a class="btn primary" href="#consignes">${ICO.nouveau} Donner une consigne</a></div></div>` : "";
    return `<div class="card"><div class="spread"><h3>Consignes de la Présidence</h3><a class="btn ghost" href="#consignes">Tout voir</a></div>
      <div class="kpis">${kpi(enc.length,"en cours")}${kpi(ret.length,"en retard", ret.length?"bad":"g")}</div>
      ${ret.length?`<div class="clist">${ret.slice(0,3).map(k=>`<button class="citem late" data-cons="${esc(k.id)}"><span class="t">${esc(k.titre)}</span><span class="m"><span class="pill bad">En retard</span><span>→ <b>${esc(k.destNom)}</b></span><span>échéance ${dFR(k.echeance)}</span></span></button>`).join("")}</div>`:""}
      ${recentes.length?`<p class="small muted">Dernières exécutées : ${recentes.map(k=>`${esc(k.destNom)} (${esc(k.titre)})`).join(" · ")}</p>`:""}</div>`;
  }
  const L = mesConsignes().filter(k=>!["Faite","Annulée"].includes(k.statut)).sort((a,b)=>a.echeance.localeCompare(b.echeance));
  if (!L.length) return "";
  return `<div class="card"><div class="spread"><h3>Consignes de la Présidence à exécuter (${L.length})</h3><a class="btn ghost" href="#${role()==="tuteur"?"t-consignes":"consignes"}">Tout voir</a></div>
    <div class="clist">${L.slice(0,3).map(k=>{ const e = etatC(k); return `<button class="citem ${k.priorite==="Urgente"?"urg":""} ${e.k==="En retard"?"late":""}" data-cons="${esc(k.id)}"><span class="t">${esc(k.titre)}</span><span class="m"><span class="pill ${e.cls}">${esc(e.k)}</span><span>échéance ${dFR(k.echeance)}</span></span></button>`; }).join("")}</div></div>`;
}


/* =====================================================================
   Messages WhatsApp aux étudiants (file d'envoi)
   Les étudiants n'ont pas de compte : chaque message est préparé par l'application
   et envoyé en un geste depuis le WhatsApp du responsable (lien wa.me).
   domaine "fin" : encaissements, trésorerie-caisse ; domaine "peda" : formation.
   ===================================================================== */
const TYPES_MSG = {
  recu:{l:"Confirmation de paiement", d:"fin"}, relance:{l:"Rappel de paiement", d:"fin"}, echange:{l:"Message après échange", d:"fin"},
  absence:{l:"Absence", d:"peda"}, assiduite:{l:"Bilan d'assiduité", d:"peda"}, note:{l:"Note de formation", d:"peda"}, info:{l:"Information Académie", d:"peda"}
};
const domainesMsg = () => [can("msg.fin") && "fin", can("msg.peda") && "peda"].filter(Boolean);
const prenomDe = s => (s?.nom||"").split(" ").slice(1).join(" ") || s?.nom || "";
const signature = () => `${compte()?.nom||""}, ${ROLES[role()]?.l||"CVPB"} · Communauté Virtuelle de Port-Bouët`;
const telDe = mat => S.prive[mat]?.tel || "";

function situationTxt(e){
  const parts = [];
  if (!e.inscOk) parts.push(`solde d'inscription ${F(P().inscription - e.inscPayee)} FCFA`);
  if (e.arriere) parts.push(`arriéré de cotisation ${F(e.arriere)} FCFA`);
  if (e.resteCourant && S.C.courant) parts.push(`cotisation de ${S.C.courant.libelle} : ${F(e.resteCourant)} FCFA`);
  return parts.length ? `Il vous reste à payer : ${parts.join(" ; ")}.` : "Vous êtes à jour de vos paiements. Merci !";
}
/* Texte calculé au moment de l'envoi, pour refléter la situation la plus récente */
function texteMsg(m){
  if (m.edite || ["echange","info"].includes(m.type)) return m.texte || "";
  const s = etuBy(m.matricule), e = S.C.etu[m.matricule], p = S.C.peda[m.matricule], pr = prenomDe(s);
  if (!s) return m.texte || "";
  if (m.type==="recu"){
    const x = S.encaissements.find(k=>k.num===m.ref);
    if (!x) return m.texte || "";
    return `Bonjour ${pr}, la CVPB confirme la réception de votre paiement de ${F(x.montant)} FCFA (${x.nature}${x.mois?` · ${moisLib(x.mois)}`:""}) du ${dFR(x.date)}, par ${x.mode}${x.ref?` (réf. ${x.ref})`:""}. Reçu n° ${x.num}.\n${situationTxt(e)}\n${signature()}`;
  }
  if (m.type==="relance") return relanceMsg(s, e) + `\n${signature()}`;
  if (m.type==="absence"){
    const se = S.seances.find(k=>k.id===m.ref);
    const f = p.par[se?.formation] || {};
    return `Bonjour ${pr}, vous avez été noté(e) absent(e) à la séance ${se?`${se.formation} · ${nomForm(se.formation)} du ${dLong(se.date)}`:"de formation"} de la CVPB Académie.\nVotre assiduité${se?" dans cette formation":""} est de ${pct(f.assiduite ?? p.assiduite)} (${f.pres ?? p.pres}/${f.total ?? p.total} séances). Le minimum requis pour valider est ${pct(P().assiduiteMin)}.\nSi votre absence était justifiée, répondez à ce message pour nous le signaler.\n${signature()}`;
  }
  if (m.type==="assiduite"){
    const lignes = Object.entries(p.par).map(([c,f])=>`• ${c} · ${nomForm(c)} : ${pct(f.assiduite)} (${f.pres}/${f.total})`).join("\n");
    const sous = p.assiduite!=null && p.assiduite < P().assiduiteMin;
    return `Bonjour ${pr}, voici le point sur votre assiduité à la CVPB Académie au ${dFR(today())} :\n${lignes||"Aucune séance enregistrée."}\nAssiduité globale : ${pct(p.assiduite)}. ${sous?`Attention : le minimum pour valider une formation est ${pct(P().assiduiteMin)}. Nous comptons sur votre présence aux prochaines séances.`:"Continuez ainsi !"}\n${signature()}`;
  }
  if (m.type==="note"){
    const code = String(m.ref).split("|")[0], f = p.par[code] || {};
    return `Bonjour ${pr}, votre résultat en ${code} · ${nomForm(code)} : ${f.note==="ABS"?"absent(e) à l'évaluation":`${String(f.note).replace(".",",")}/20`}. Assiduité : ${pct(f.assiduite)}.\nRésultat : ${f.valide==null?"en cours":f.valide?"formation validée. Félicitations !":`formation non validée (il faut ${P().noteMin}/20 et ${pct(P().assiduiteMin)} d'assiduité).`}\n${signature()}`;
  }
  return m.texte || "";
}
/* Ajoute des messages « à envoyer » ; évite les doublons (même type, même étudiant, même référence) */
async function preparerMessages(type, liste){
  const deja = new Set(S.messages.filter(x=>x.statut!=="Annulé").map(x=>`${x.type}|${x.matricule}|${x.ref||""}`));
  const nouveaux = liste.filter(x => !deja.has(`${type}|${x.matricule}|${x.ref||""}`));
  const base = {type, domaine:TYPES_MSG[type].d, statut:"À envoyer", creeLe:nowISO(), par:S.uid, parNom:compte().nom};
  const crees = nouveaux.map((x,i) => { const m = {...base, id:`M${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2,5)}`, matricule:x.matricule, nom:etuBy(x.matricule)?.nom||"", ref:x.ref||"", texte:""}; try { m.texte = texteMsg(m); } catch(e){} return m; });
  await Promise.all(crees.map(({id, ...d}) => S.db.doc("messages/"+id).set(d))).catch(()=>{});
  return crees;
}
/* Ouvre WhatsApp puis marque le message comme envoyé */
function envoyerMsg(m){
  const tel = telDe(m.matricule);
  if (!tel){ toast("Pas de numéro de téléphone pour cet étudiant : complétez sa fiche."); return; }
  const texte = texteMsg(m);
  window.open(waLink(tel, texte), "_blank", "noopener");
  S.db.doc("messages/"+m.id).update({statut:"Envoyé", envoyeLe:nowISO(), envoyePar:compte().nom, texte}).catch(()=>{});
}

function vMessages(){
  const f = S.mf, doms = lectureTotale() ? ["fin","peda"] : domainesMsg(), lecture = !presidence() && LECTURE_TOTALE.includes(role());
  let L = S.messages.filter(m=>doms.includes(m.domaine));
  const att = L.filter(m=>m.statut==="À envoyer");
  const env = L.filter(m=>m.statut==="Envoyé");
  if (f.type) L = L.filter(m=>m.type===f.type);
  L = L.filter(m => f.onglet==="envoyes" ? m.statut==="Envoyé" : f.onglet==="ignores" ? m.statut==="Annulé" : m.statut==="À envoyer").sort((a,b)=>String(f.onglet==="envoyes"?b.envoyeLe:a.creeLe).localeCompare(String(f.onglet==="envoyes"?a.envoyeLe:b.creeLe)));
  const types = Object.entries(TYPES_MSG).filter(([,t])=>doms.includes(t.d));
  const fin = doms.includes("fin") && !lecture, peda = doms.includes("peda") && !lecture;
  const sansTel = att.filter(m=>!telDe(m.matricule)).length;
  return `<div class="spread"><div><h2>Messages WhatsApp aux étudiants</h2><p class="small muted">L'application prépare chaque message avec les données à jour. Touchez « Envoyer » : WhatsApp s'ouvre avec le texte prêt, il ne reste qu'à appuyer sur la flèche d'envoi.</p></div></div>
  <div class="kpis">${kpi(att.length,"à envoyer", att.length?"warn":"g")}${kpi(env.filter(m=>dansMois(m.envoyeLe, moisCourant())).length,"envoyés ce mois-ci","g")}${kpi(sansTel,"sans numéro", sansTel?"bad":"g")}${kpi(env.length,"envoyés au total")}</div>
  ${fin||peda?`<div class="card"><h3>Préparer des messages</h3><div class="row">
    ${fin?`<button class="btn" id="pRel">Rappels de paiement (${aRelancer().length})</button>`:""}
    ${peda?`<button class="btn" id="pAss">Bilan d'assiduité (sous ${pct(P().assiduiteMin)})</button><button class="btn" id="pAssT">Bilan d'assiduité (tous)</button>`:""}
    <button class="btn" id="pLibre">Message libre</button></div>
    <p class="small muted">Les confirmations de paiement${peda?", absences et notes":""} sont préparées automatiquement à chaque saisie.</p></div>`:""}
  <div class="row"><div class="subtabs" role="group" aria-label="Messages">${[["attente",`À envoyer (${att.length})`],["envoyes","Envoyés"],["ignores","Ignorés"]].map(([k,l])=>`<button data-mo="${k}" aria-pressed="${(f.onglet||"attente")===k}">${l}</button>`).join("")}</div>
  <select id="mft" aria-label="Type" style="max-width:240px">${opts(types.map(([k,t])=>[k,t.l]), f.type, "Tous les types")}</select></div>
  ${L.length?`<div class="clist">${L.slice(0,150).map(m=>{ const tel = telDe(m.matricule); return `<div class="citem" style="cursor:default">
    <span class="t">${esc(m.nom||m.matricule)} <span class="pill ${TYPES_MSG[m.type]?.d==="fin"?"":"ok"}">${esc(TYPES_MSG[m.type]?.l||m.type)}</span>${tel?"":' <span class="pill bad">Pas de numéro</span>'}</span>
    <span class="small" style="white-space:pre-wrap;color:var(--ink)">${esc((m.statut==="À envoyer"?texteMsg(m):m.texte).slice(0,260))}${(m.statut==="À envoyer"?texteMsg(m):m.texte).length>260?"…":""}</span>
    <span class="m">${m.statut==="Envoyé"?`Envoyé le ${new Date(m.envoyeLe).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} par ${esc(m.envoyePar||"")}`:`Préparé le ${dFR(String(m.creeLe).slice(0,10))} par ${esc(m.parNom||"")}`}</span>
    ${m.statut==="À envoyer"&&!lecture?`<span class="row"><button class="btn sm vert" data-menv="${esc(m.id)}" ${tel?"":"disabled"}>Envoyer sur WhatsApp</button><button class="btn sm" data-mmod="${esc(m.id)}">Modifier</button><button class="btn sm ghost" data-mign="${esc(m.id)}">Ignorer</button></span>`:""}
  </div>`; }).join("")}</div>`:`<div class="empty">${(f.onglet||"attente")==="attente"?"Aucun message en attente.":"Aucun message."}</div>`}`;
}
function bindMessages(){
  const main = $("#main"), on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  const parId = id => S.messages.find(m=>m.id===id);
  main.querySelectorAll("[data-mo]").forEach(b => b.onclick = () => { S.mf.onglet = b.dataset.mo; render(); });
  on("#mft","onchange",e=>{ S.mf.type = e.target.value; render(); });
  main.querySelectorAll("[data-menv]").forEach(b => b.onclick = () => envoyerMsg(parId(b.dataset.menv)));
  main.querySelectorAll("[data-mign]").forEach(b => b.onclick = () => S.db.doc("messages/"+b.dataset.mign).update({statut:"Annulé"}).catch(()=>{}));
  main.querySelectorAll("[data-mmod]").forEach(b => b.onclick = () => { const m = parId(b.dataset.mmod); formMessage(m.matricule, m); });
  on("#pRel","onclick", async () => { const n = (await preparerMessages("relance", aRelancer().map(x=>({matricule:x.s.matricule, ref:"R"+today()})))).length; toast(n ? `${n} rappel(s) de paiement préparé(s)` : "Rien de nouveau à préparer."); });
  const bilan = async tous => { const L = S.etudiants.filter(s=>s.academie && s.statut!=="Inactif" && S.C.peda[s.matricule].total>0 && (tous || S.C.peda[s.matricule].assiduite < P().assiduiteMin)); const n = (await preparerMessages("assiduite", L.map(s=>({matricule:s.matricule, ref:"A"+today()})))).length; toast(n ? `${n} bilan(s) d'assiduité préparé(s)` : "Aucun étudiant concerné."); };
  on("#pAss","onclick",()=>bilan(false)); on("#pAssT","onclick",()=>bilan(true));
  on("#pLibre","onclick",()=>formMessage(""));
}
/* Message libre ou modification d'un message préparé */
function formMessage(mat, existant){
  const fin = can("msg.fin"), types = existant ? [[existant.type, TYPES_MSG[existant.type]?.l]] : [fin && ["echange","Message après échange"], can("msg.peda") && ["info","Information Académie"]].filter(Boolean);
  const s = mat && etuBy(mat);
  openSheet(`<h2>${existant?"Modifier le message":"Message WhatsApp à un étudiant"}</h2>
  <form id="mfm" class="form">
    ${existant?`<p class="small"><b>${esc(existant.nom)}</b></p>`:`<label class="f" for="m_e">Étudiant<input type="text" id="m_e" list="dl_m" autocomplete="off" value="${s?esc(s.matricule+" · "+s.nom):""}" placeholder="Tapez un nom ou un matricule"></label>
    <datalist id="dl_m">${S.etudiants.map(x=>`<option value="${esc(x.matricule+" · "+x.nom)}"></option>`).join("")}</datalist>`}
    <label class="f" for="m_t">Type<select id="m_t">${opts(types, existant?.type)}</select></label>
    <label class="f" for="m_x">Message<textarea id="m_x" rows="7" maxlength="1500">${esc(existant ? texteMsg(existant) : s ? `Bonjour ${prenomDe(s)}, suite à notre échange de ce jour, ` : "")}</textarea><span class="hint">Restez factuel et courtois. Le message part depuis votre WhatsApp.</span></label>
    <div class="row"><button type="submit" class="btn vert">Envoyer sur WhatsApp</button><button type="button" class="btn" id="m_later">Garder pour plus tard</button><button type="button" class="btn ghost" data-close>Annuler</button></div>
  </form>`);
  const go = async envoyer => {
    const texte = $("#m_x").value.trim(); if (texte.length < 5) return toast("Rédigez le message.");
    if (existant){ await S.db.doc("messages/"+existant.id).update({texte, edite:true}).catch(()=>{}); const m = {...existant, texte, edite:true}; closeSheet(); if (envoyer) envoyerMsg(m); return; }
    const v = $("#m_e").value.trim(), m0 = v.split("·")[0].trim().toUpperCase(); if (!etuBy(m0)) return toast("Sélectionnez l'étudiant dans la liste.");
    if (envoyer && !telDe(m0)) return toast("Pas de numéro de téléphone pour cet étudiant.");
    const type = $("#m_t").value, id = `M${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    const m = {type, domaine:TYPES_MSG[type].d, matricule:m0, nom:etuBy(m0).nom, ref:"", texte, edite:true, statut:"À envoyer", creeLe:nowISO(), par:S.uid, parNom:compte().nom};
    if (await write(()=>S.db.doc("messages/"+id).set(m), envoyer ? "" : "Message gardé dans « À envoyer »")){ closeSheet(); if (envoyer) envoyerMsg({...m, id}); }
  };
  $("#mfm").onsubmit = e => { e.preventDefault(); go(true); };
  $("#m_later").onclick = () => go(false);
}
/* Historique des messages d'un étudiant (fiche) */
function histoMessages(mat){
  const L = S.messages.filter(m=>m.matricule===mat && m.statut!=="Annulé").sort((a,b)=>String(b.envoyeLe||b.creeLe).localeCompare(String(a.envoyeLe||a.creeLe)));
  if (!domainesMsg().length && !lectureTotale()) return "";
  return `<div class="card"><div class="spread"><h3>Messages WhatsApp (${L.length})</h3>${domainesMsg().length&&!(LECTURE_TOTALE.includes(role()))?`<button class="btn sm vert" id="fMsg">Écrire un message</button>`:""}</div>
    ${L.length?`<div class="plist">${L.slice(0,8).map(m=>`<div class="prow"><span><b class="small">${esc(TYPES_MSG[m.type]?.l||m.type)}</b><br><span class="small muted">${m.statut==="Envoyé"?`Envoyé le ${dFR(String(m.envoyeLe).slice(0,10))} par ${esc(m.envoyePar||"")}`:"À envoyer"}</span></span>${m.statut==="À envoyer"&&domainesMsg().includes(m.domaine)?`<button class="btn sm" data-fmenv="${esc(m.id)}">Envoyer</button>`:""}</div>`).join("")}</div>`:`<div class="empty">Aucun message pour cet étudiant.</div>`}</div>`;
}


/* =====================================================================
   CVPB MANAGER · Suivi des étudiants à trois niveaux, rapports hebdomadaires
   des tuteurs, accompagnement, catalogue des formations, synthèses
   Niveau 1 : responsables opérationnels (valident) · Niveau 2 : Secrétariat
   général (contrôle, consolide) · Niveau 3 : Présidence (oriente)
   ===================================================================== */
const TUT = () => ({debut:"2026-11-16", delai:2, ...(P().tutorat||{})});
const addJ = (d, n) => { const x = parseD(d); x.setDate(x.getDate()+n); return isoD(x); };
const lundiDe = d => { const x = parseD(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return isoD(x); };
const semLib = s => `semaine du ${parseD(s).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} au ${parseD(addJ(s,6)).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}`;
const echeanceSem = s => addJ(s, 6 + Number(TUT().delai||0));
/* Semaines dont l'échéance de rapport est passée, de la plus récente à la plus ancienne */
function semainesDues(){
  const L = []; let s = lundiDe(TUT().debut);
  while (echeanceSem(s) < today() && L.length < 60){ L.unshift(s); s = addJ(s, 7); }
  return L;
}
const derniereSemaineDue = () => semainesDues()[0] || null;
const fonctionDe = r => ROLES[r]?.l || r || "";
const trace = (action, statut, obs) => ({le:nowISO(), par:compte()?.nom||"", uid:S.uid, email:S.email, fonction:fonctionDe(role()), action, statut:statut||"", obs:obs||""});
const ajoute = (h, e) => [...(h||[]), e];
const tuteursActifs = () => Object.entries(S.comptes).filter(([,c])=>c.role==="tuteur" && c.actif!==false).map(([em,c])=>({em, ...c})).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
const affDe = em => S.affectations.find(a=>a.id===em)?.etudiants || [];
const rhId = (em, s) => `${em}_${s}`;
const rhDe = (em, s) => S.rapportsHebdo.find(r=>r.id===rhId(em,s));
const STATUT_RH = {Brouillon:"mute", "Soumis":"warn", "Retourné":"bad", "Validé":"", "Exploité":"", "Contrôlé":"ok"};
const pillRH = st => `<span class="pill ${STATUT_RH[st]??"mute"}">${esc(st)}</span>`;
const nomEtu = m => etuBy(m)?.nom || m;
function histoHTML(h){
  if (!(h||[]).length) return `<div class="empty">Aucun historique.</div>`;
  return `<div class="timeline">${h.slice().reverse().map(e=>`<div class="on"><b class="small">${esc(e.action)}</b>${e.statut?` · ${pillRH(e.statut)}`:""}<br><span class="small muted">${new Date(e.le).toLocaleString("fr-FR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})} · ${esc(e.par)} (${esc(e.fonction)})</span>${e.obs?`<div class="small" style="white-space:pre-wrap">${esc(e.obs)}</div>`:""}</div>`).join("")}</div>`;
}

/* ---------- Indicateurs (calculés à la volée) ---------- */
function etatSuivi(sem){
  sem = sem || derniereSemaineDue();
  const tut = tuteursActifs();
  const lignes = tut.map(t => { const r = sem && rhDe(t.em, sem); return {t, r, st: r ? r.statut : (sem ? "Non soumis" : "—")}; });
  const R = S.rapportsHebdo.filter(r=>r.semaine===sem);
  const soumis = R.filter(r=>r.statut!=="Brouillon");
  const affectes = new Set(S.affectations.flatMap(a=>a.etudiants||[]));
  const suivis = new Set(soumis.flatMap(r=>r.etudiants||[]));
  const actifs = S.etudiants.filter(s=>s.statut!=="Inactif" && s.academie);
  const nonSuivis = actifs.filter(s=>!suivis.has(s.matricule));
  const sansTuteur = actifs.filter(s=>!affectes.has(s.matricule));
  const difficulte = new Set(soumis.flatMap(r=>(r.accompagnement||[]).map(x=>x.matricule)));
  return {sem, lignes, attendus: tut.length, soumis: soumis.length, valides: R.filter(r=>["Validé","Exploité","Contrôlé"].includes(r.statut)).length,
    retard: lignes.filter(l=>l.st==="Non soumis").length, enAttente: S.rapportsHebdo.filter(r=>r.statut==="Soumis").length, retournes: S.rapportsHebdo.filter(r=>r.statut==="Retourné").length,
    aExploiter: S.rapportsHebdo.filter(r=>r.statut==="Validé").length, aControler: S.rapportsHebdo.filter(r=>["Validé","Exploité"].includes(r.statut) && !r.controle?.le).length,
    controles: S.rapportsHebdo.filter(r=>r.statut==="Contrôlé").length, affectes: affectes.size, suivis: suivis.size, nonSuivis, sansTuteur, difficulte,
    difficultesSignalees: soumis.filter(r=>(r.difficultes||"").trim().length>2).length};
}
function etatAccomp(){
  const D = S.dossiers;
  const ouverts = D.filter(d=>!["Résolu","Clos"].includes(d.statut));
  const actions = D.flatMap(d=>d.actions||[]);
  return {D, ouverts, suivis: new Set(ouverts.map(d=>d.matricule)).size, identifiees: D.length, engagees: actions.length, terminees: actions.filter(a=>a.statut==="Terminée").length,
    nonResolues: ouverts.length, intervention: D.filter(d=>d.statut==="Intervention requise"), sansAction: ouverts.filter(d=>!(d.actions||[]).length)};
}
/* Difficultés récurrentes : étudiants signalés au moins deux semaines différentes */
function recurrents(){
  const n = {};
  S.rapportsHebdo.filter(r=>r.statut!=="Brouillon").forEach(r=>(r.accompagnement||[]).forEach(x=>{ (n[x.matricule] ||= new Set()).add(r.semaine); }));
  return Object.entries(n).filter(([,s])=>s.size>=2).map(([m,s])=>({m, n:s.size}));
}
function alertesSuivi(){
  const A = [], add = (niv, titre, detail, pour, lien) => A.push({niv, titre, detail, pour, lien});
  const E = etatSuivi(), X = etatAccomp();
  if (E.sem && E.retard) add("bad", `${E.retard} rapport(s) hebdomadaire(s) non soumis`, `${semLib(E.sem)} : ${E.lignes.filter(l=>l.st==="Non soumis").map(l=>l.t.nom).join(", ")}`, ["tuteurs","secretaire","president"], "#suivi");
  if (E.enAttente) add("warn", `${E.enAttente} rapport(s) en attente de validation`, "À examiner par le Responsable des Tuteurs", ["tuteurs","president"], "#suivi");
  if (E.retournes) add("info", `${E.retournes} rapport(s) retourné(s) pour correction`, "En attente de la correction du tuteur", ["tuteurs","secretaire"], "#suivi");
  if (E.aExploiter) add("warn", `${E.aExploiter} rapport(s) validé(s) à exploiter`, "Identifier les étudiants en difficulté et ouvrir les suivis", ["accompagnement"], "#suivi");
  if (E.aControler) add("info", `${E.aControler} rapport(s) validé(s) à contrôler`, "Contrôle et consolidation du Secrétariat général", ["secretaire"], "#suivi");
  if (E.sem && E.nonSuivis.length) add("warn", `${E.nonSuivis.length} étudiant(s) non suivi(s) la ${semLib(E.sem)}`, E.nonSuivis.slice(0,5).map(s=>s.nom).join(", ")+(E.nonSuivis.length>5?"…":""), ["tuteurs","accompagnement","secretaire"], "#suivi");
  if (E.sansTuteur.length && S.affectations.length) add("info", `${E.sansTuteur.length} apprenant(s) sans tuteur affecté`, E.sansTuteur.slice(0,5).map(s=>s.nom).join(", "), ["tuteurs"], "#suivi");
  if (X.intervention.length) add("bad", `${X.intervention.length} suivi(s) nécessitant une intervention`, X.intervention.slice(0,4).map(d=>`${d.nom} : ${d.difficulte}`).join(" · "), ["accompagnement","secretaire","president","tuteurs"], "#suivi");
  const signales = X.ouverts.filter(d=>d.priorite==="Haute");
  if (signales.length) add("warn", `${signales.length} étudiant(s) signalé(s) en difficulté`, signales.slice(0,4).map(d=>d.nom).join(", "), ["accompagnement","secretaire","president"], "#suivi");
  const rr = S.rapportsResp.filter(r=>r.statut==="Transmis");
  if (rr.length) add("info", `${rr.length} rapport(s) de responsable à examiner`, rr.map(r=>r.auteurNom).join(", "), ["secretaire"], "#synthese");
  const syn = S.syntheses.filter(s=>s.statut==="Transmise" && !s.luLe);
  if (syn.length) add("info", `${syn.length} synthèse(s) hebdomadaire(s) non lue(s)`, syn.map(s=>semLib(s.semaine)).join(" · "), ["president"], "#synthese");
  /* Tuteur : son propre rapport */
  if (role()==="tuteur"){
    const s = derniereSemaineDue(), r = s && rhDe(S.email, s);
    if (s && (!r || r.statut==="Brouillon")) add("bad", "Rapport hebdomadaire en retard", `${semLib(s)} : à soumettre sans attendre`, ["tuteur"], "#t-hebdo");
    S.rapportsHebdo.filter(x=>x.tuteurEmail===S.email && x.statut==="Retourné").forEach(x=>add("warn", "Rapport retourné pour correction", `${semLib(x.semaine)} : ${x.validation?.obs||""}`, ["tuteur"], "#t-rapports"));
  }
  return A;
}

/* ---------- Rapport hebdomadaire : saisie par le tuteur ---------- */
function mesEtudiantsTuteur(){
  const aff = affDe(S.email);
  if (aff.length) return aff.map(etuBy).filter(Boolean);
  const c = compte(), code = codeSp(c.specialite);
  return S.etudiants.filter(s=>s.statut!=="Inactif" && (!c.niveau || s.niveau===c.niveau) && (!code || String(s.specialite).includes(`(${code})`))).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
}
function semainesSaisissables(){
  const cur = lundiDe(today()), L = [cur, addJ(cur,-7), addJ(cur,-14), addJ(cur,-21)];
  return L.filter(s => s >= lundiDe(TUT().debut) || rhDe(S.email, s));
}
function formHebdoHTML(r){
  const c = compte(), L = mesEtudiantsTuteur(), sel = new Set(r?.etudiants || L.map(s=>s.matricule));
  const acc = Object.fromEntries((r?.accompagnement||[]).map(x=>[x.matricule, x.motif]));
  const sems = semainesSaisissables(); const sem = r?.semaine || sems.find(s=>!rhDe(S.email,s) || ["Brouillon","Retourné"].includes(rhDe(S.email,s).statut)) || sems[0];
  const req = '<span class="req" aria-hidden="true"> *</span>';
  return `<div class="spread"><h2>Rapport hebdomadaire de tutorat</h2><a class="btn ghost" href="#t-rapports">Annuler</a></div>
  ${r?.statut==="Retourné"?`<div class="banner"><b>Retourné pour correction</b> par ${esc(r.validation?.par||"")} : ${esc(r.validation?.obs||"")}</div>`:""}
  <p class="small muted">Un rapport par semaine, obligatoire. Échéance : ${TUT().delai} jour(s) après la fin de la semaine. Un rapport validé ne se modifie plus.</p>
  <form id="hf" class="form" novalidate>
   <fieldset><legend>1-2. Tuteur et semaine</legend>
    <dl class="dl"><dt>Tuteur</dt><dd>${esc(c.nom)} · ${esc(codeSp(c.specialite)||"")} ${esc(c.niveau||"")}</dd></dl>
    <label class="f" for="h_s">Semaine concernée${req}<select id="h_s" ${r?"disabled":""}>${opts(sems.map(s=>[s, semLib(s) + (rhDe(S.email,s)?` · ${rhDe(S.email,s).statut}`:"")]), sem)}</select></label>
   </fieldset>
   <fieldset><legend>3. Étudiants suivis${req}</legend>
    ${L.length?`<div class="checks">${L.map(s=>`<label><input type="checkbox" name="h_e" value="${esc(s.matricule)}" ${sel.has(s.matricule)?"checked":""}> ${esc(s.nom)} <span class="small muted num">${esc(s.matricule)}</span></label>`).join("")}</div>`:`<div class="empty">Aucun étudiant affecté. Le Responsable des Tuteurs doit vous affecter vos étudiants.</div>`}
   </fieldset>
   <fieldset><legend>4-5. Séances</legend>
    <label class="f" for="h_n">Nombre de séances réalisées${req}<input type="number" id="h_n" min="0" max="14" value="${esc(r?.nbSeances ?? "")}"></label>
    <label class="f" for="h_d">Dates des séances<input type="text" id="h_d" placeholder="Ex. : 17/11, 19/11" value="${esc((r?.datesSeances||[]).join(", "))}"><span class="hint">Séparez les dates par une virgule.</span></label>
   </fieldset>
   <fieldset><legend>6-7. Contenu</legend>
    <label class="f" for="h_m">Matières et thèmes abordés${req}<textarea id="h_m" maxlength="1500">${esc(r?.matieres||"")}</textarea></label>
    <div class="checks"><b class="small">Activités réalisées${req}</b>${TYPES_ACT.map(t=>`<label><input type="checkbox" name="h_t" value="${esc(t)}" ${(r?.types||[]).includes(t)?"checked":""}> ${esc(t)}</label>`).join("")}</div>
    <label class="f" for="h_a">Détail des activités<textarea id="h_a" maxlength="2000">${esc(r?.activites||"")}</textarea></label>
   </fieldset>
   <fieldset><legend>8. Présences et absences</legend>
    <p class="hint">Pour chaque étudiant suivi : nombre de séances auxquelles il a assisté.</p>
    <div class="plist" id="h_pr">${L.map(s=>`<div class="prow"><span>${esc(s.nom)}</span><input type="number" min="0" max="14" data-pr="${esc(s.matricule)}" value="${esc(r?.presences?.[s.matricule] ?? "")}" style="width:80px" aria-label="Présences de ${esc(s.nom)}"></div>`).join("")}</div>
   </fieldset>
   <fieldset><legend>9-10. Bilan</legend>
    <label class="f" for="h_df">Difficultés rencontrées<textarea id="h_df" maxlength="1500" placeholder="Laisser vide si aucune">${esc(r?.difficultes||"")}</textarea></label>
    <label class="f" for="h_pg">Progression constatée${req}<textarea id="h_pg" maxlength="1500">${esc(r?.progression||"")}</textarea></label>
   </fieldset>
   <fieldset><legend>11. Étudiants nécessitant un accompagnement particulier</legend>
    <div class="plist">${L.map(s=>`<div class="crit"><label><input type="checkbox" name="h_acc" value="${esc(s.matricule)}" ${acc[s.matricule]!=null?"checked":""}> ${esc(s.nom)}</label><input type="text" data-motif="${esc(s.matricule)}" placeholder="Motif (difficulté observée)" value="${esc(acc[s.matricule]||"")}" maxlength="200"></div>`).join("")}</div>
   </fieldset>
   <fieldset><legend>12-13. Recommandations et justificatifs</legend>
    <label class="f" for="h_r">Recommandations<textarea id="h_r" maxlength="1500">${esc(r?.recommandations||"")}</textarea></label>
    <label class="f" for="h_j">Justificatifs éventuels<input type="text" id="h_j" maxlength="300" placeholder="Lien Google Drive, capture partagée…" value="${esc(r?.justificatifs||"")}"></label>
   </fieldset>
   <div class="row"><button type="submit" class="btn vert">Soumettre le rapport</button><button type="button" class="btn" id="h_br">Enregistrer le brouillon</button></div>
  </form>`;
}
function bindFormHebdo(r0){
  const lire = () => {
    const f = $("#hf"), etudiants = [...f.querySelectorAll('input[name="h_e"]:checked')].map(i=>i.value);
    const presences = {}; f.querySelectorAll("[data-pr]").forEach(i => { if (i.value!=="" && etudiants.includes(i.dataset.pr)) presences[i.dataset.pr] = Number(i.value); });
    const accompagnement = [...f.querySelectorAll('input[name="h_acc"]:checked')].map(i=>({matricule:i.value, nom:nomEtu(i.value), motif:(f.querySelector(`[data-motif="${i.value}"]`)?.value||"").trim()}));
    return {semaine: r0?.semaine || $("#h_s").value, etudiants, nbSeances: $("#h_n").value==="" ? "" : Number($("#h_n").value), datesSeances: $("#h_d").value.split(",").map(x=>x.trim()).filter(Boolean),
      matieres:$("#h_m").value.trim(), types:[...f.querySelectorAll('input[name="h_t"]:checked')].map(i=>i.value), activites:$("#h_a").value.trim(), presences,
      difficultes:$("#h_df").value.trim(), progression:$("#h_pg").value.trim(), accompagnement, recommandations:$("#h_r").value.trim(), justificatifs:$("#h_j").value.trim()};
  };
  const enreg = async soumettre => {
    const d = lire(), manque = [];
    if (soumettre){
      if (!d.etudiants.length) manque.push("étudiants suivis"); if (d.nbSeances==="" || d.nbSeances<0) manque.push("nombre de séances");
      if (!d.matieres) manque.push("matières et thèmes"); if (!d.types.length) manque.push("activités réalisées"); if (!d.progression) manque.push("progression constatée");
      if (d.accompagnement.some(x=>!x.motif)) manque.push("motif de chaque accompagnement");
      if (Object.values(d.presences).some(v=>v>d.nbSeances)) return toast("Une présence dépasse le nombre de séances de la semaine.");
      if (manque.length) return toast("À compléter : " + manque.join(", "));
    }
    const c = compte(), id = rhId(S.email, d.semaine), ex = rhDe(S.email, d.semaine);
    if (ex && !["Brouillon","Retourné"].includes(ex.statut)) return toast(`Le rapport de cette semaine est déjà ${ex.statut.toLowerCase()} : il ne peut plus être modifié.`);
    const statut = soumettre ? "Soumis" : "Brouillon";
    const data = {...d, tuteurEmail:S.email, tuteurUid:S.uid, tuteurNom:c.nom, specialite:c.specialite||"", niveau:c.niveau||"", statut, majLe:nowISO(),
      ...(soumettre?{soumisLe:nowISO()}:{}), creeLe: ex?.creeLe || nowISO(),
      historique: ajoute(ex?.historique, trace(soumettre ? (ex?.statut==="Retourné" ? "Rapport corrigé et soumis à nouveau" : "Rapport soumis") : "Brouillon enregistré", statut))};
    if (ex?.validation) data.validation = ex.validation;
    if (await write(() => S.db.doc("rapports_hebdo/"+id).set(data), soumettre ? "Rapport soumis au Responsable des Tuteurs" : "Brouillon enregistré")){
      if (soumettre) log("rh_soumis", `Rapport hebdomadaire de ${c.nom} soumis (${semLib(d.semaine)})${d.accompagnement.length?` · ${d.accompagnement.length} étudiant(s) à accompagner`:""}`, ["tuteurs","secretaire"]);
      location.hash = "t-rapports";
    }
  };
  $("#hf").onsubmit = e => { e.preventDefault(); enreg(true); };
  $("#h_br").onclick = () => enreg(false);
  const ns = $("#h_s"); if (ns && !r0) ns.onchange = () => { const ex = rhDe(S.email, ns.value); if (ex){ S.editRH = ex.semaine; render(); } };
}
function rapportHebdoHTML(r){
  const row = (l, v) => v ? `<h4>${l}</h4><p>${esc(v)}</p>` : "";
  return `<div class="rep">
    <dl class="dl"><dt>Tuteur</dt><dd>${esc(r.tuteurNom)} · ${esc(codeSp(r.specialite))} ${esc(r.niveau||"")}</dd><dt>Semaine</dt><dd>${esc(semLib(r.semaine))}</dd><dt>Séances</dt><dd>${esc(r.nbSeances)}${(r.datesSeances||[]).length?` (${esc(r.datesSeances.join(", "))})`:""}</dd><dt>Statut</dt><dd>${pillRH(r.statut)}</dd></dl>
    <h4>Étudiants suivis (${(r.etudiants||[]).length})</h4>
    <div class="tablewrap"><table><thead><tr><th>Étudiant</th><th class="r">Présences</th><th class="r">Absences</th></tr></thead><tbody>${(r.etudiants||[]).map(m=>{ const p = r.presences?.[m]; return `<tr><td>${esc(nomEtu(m))}</td><td class="r">${p??"—"}</td><td class="r">${p==null||r.nbSeances===""?"—":Math.max(0, r.nbSeances - p)}</td></tr>`; }).join("")}</tbody></table></div>
    ${row("Matières et thèmes", r.matieres)}${(r.types||[]).length?`<h4>Activités</h4><p>${esc(r.types.join(" · "))}</p>`:""}${row("Détail des activités", r.activites)}
    ${row("Difficultés rencontrées", r.difficultes)}${row("Progression constatée", r.progression)}
    ${(r.accompagnement||[]).length?`<h4>Accompagnement particulier</h4><div class="plist">${r.accompagnement.map(x=>`<div class="prow"><span><b>${esc(x.nom||nomEtu(x.matricule))}</b><br><span class="small muted">${esc(x.motif)}</span></span>${S.dossiers.some(d=>d.source?.ref===r.id && d.matricule===x.matricule)?'<span class="pill ok">Suivi ouvert</span>':""}</div>`).join("")}</div>`:""}
    ${row("Recommandations", r.recommandations)}${r.justificatifs?`<h4>Justificatifs</h4><p>${/^https?:\/\//.test(r.justificatifs)?`<a href="${esc(r.justificatifs)}" target="_blank" rel="noopener">${esc(r.justificatifs)}</a>`:esc(r.justificatifs)}</p>`:""}
  </div>`;
}
/* ---------- Fiche d'un rapport hebdomadaire : circuit de validation ---------- */
function ficheHebdo(id){
  const r = S.rapportsHebdo.find(x=>x.id===id); if (!r) return;
  const R = role(), pres = presidence();
  const peutValider = (R==="tuteurs" || pres) && r.statut==="Soumis";
  const peutExploiter = (R==="accompagnement" || pres) && r.statut==="Validé";
  const peutControler = (R==="secretaire" || pres) && ["Validé","Exploité"].includes(r.statut);
  const peutModifier = r.tuteurEmail===S.email && ["Brouillon","Retourné"].includes(r.statut);
  openSheet(`<div class="spread"><h2>Rapport hebdomadaire</h2>${pillRH(r.statut)}</div>
    ${rapportHebdoHTML(r)}
    ${r.controle?.demande?`<div class="banner">Explication demandée par le Secrétariat général : ${esc(r.controle.obs)}</div>`:""}
    ${peutValider||peutExploiter||peutControler?`<label class="f" for="v_o">Observations<textarea id="v_o" maxlength="1000" placeholder="Obligatoires pour un retour ou une demande d'explication"></textarea></label>`:""}
    <div class="row">
      ${peutValider?`<button class="btn vert" id="v_ok">Valider</button><button class="btn" id="v_ret">Retourner pour correction</button><button class="btn danger" id="v_sig">Signaler une intervention</button>`:""}
      ${peutExploiter?`<button class="btn vert" id="v_exp">Exploiter (ouvrir les suivis)</button>`:""}
      ${peutControler?`<button class="btn vert" id="v_ctl">Contrôlé</button><button class="btn" id="v_dem">Demander une explication</button>`:""}
      ${peutModifier?`<button class="btn vert" id="v_mod">${r.statut==="Retourné"?"Corriger":"Compléter"}</button>`:""}
      <button class="btn" id="v_pdf">PDF</button><button class="btn ghost" data-close>Fermer</button></div>
    <details class="card"><summary>Historique (${(r.historique||[]).length})</summary>${histoHTML(r.historique)}</details>`);
  const obs = () => ($("#v_o")?.value||"").trim();
  const maj = async (data, msg, action, statut, pour) => {
    const o = obs();
    if (await write(() => S.db.doc("rapports_hebdo/"+id).update({...data, historique: ajoute(r.historique, trace(action, statut, o))}), msg)){
      log("rh_"+statut, `${action} : rapport de ${r.tuteurNom} (${semLib(r.semaine)})${o?` · ${o}`:""}`, pour); closeSheet();
    }
  };
  const sig = () => ({par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:obs()});
  $("#v_ok") && ($("#v_ok").onclick = () => maj({statut:"Validé", validation:{...sig(), statut:"Validé"}}, "Rapport validé", "Rapport validé", "Validé", ["accompagnement","secretaire", ...(r.tuteurUid?["u:"+r.tuteurUid]:[])]));
  $("#v_ret") && ($("#v_ret").onclick = () => { if (obs().length<5) return toast("Précisez ce qu'il faut corriger."); maj({statut:"Retourné", validation:{...sig(), statut:"Retourné"}}, "Rapport retourné au tuteur", "Retourné pour correction", "Retourné", r.tuteurUid?["u:"+r.tuteurUid]:[]); });
  $("#v_sig") && ($("#v_sig").onclick = () => formDossier({matricule:(r.accompagnement||[])[0]?.matricule||"", difficulte:obs(), priorite:"Haute", statut:"Intervention requise", domaine:"Tutorat", source:{type:"rapport", ref:r.id, lib:`Rapport de ${r.tuteurNom}, ${semLib(r.semaine)}`}}));
  $("#v_exp") && ($("#v_exp").onclick = () => exploiterHebdo(r));
  $("#v_ctl") && ($("#v_ctl").onclick = () => maj({statut:"Contrôlé", controle:{...sig(), demande:false}}, "Rapport contrôlé", "Contrôle du Secrétariat général", "Contrôlé", ["tuteurs"]));
  $("#v_dem") && ($("#v_dem").onclick = () => { if (obs().length<5) return toast("Précisez l'explication demandée."); maj({controle:{...sig(), demande:true}}, "Demande d'explication envoyée", "Explication demandée par le Secrétariat général", r.statut, ["tuteurs","accompagnement"]); });
  $("#v_mod") && ($("#v_mod").onclick = () => { S.editRH = r.semaine; closeSheet(); location.hash = "t-hebdo"; });
  $("#v_pdf").onclick = () => imprimer("Rapport hebdomadaire de tutorat", `${r.tuteurNom} · ${semLib(r.semaine)}`, rapportHebdoHTML(r).replace(/class="rep"/,"") + `<h2>Historique</h2>` + T_(["Date","Par","Fonction","Action","Observations"], (r.historique||[]).map(e=>[new Date(e.le).toLocaleString("fr-FR"), e.par, e.fonction, e.action, e.obs])) + SIG("Le Responsable des Tuteurs","Le Secrétaire général"), `CVPB_rapport_hebdo_${normNom(r.tuteurNom).replace(/ /g,"_")}_${r.semaine}`);
}
/* Étape 3 : exploitation par le Responsable Suivi et Accompagnement */
function exploiterHebdo(r){
  const L = r.accompagnement || [];
  openSheet(`<h2>Exploiter le rapport</h2><p class="small muted">${esc(r.tuteurNom)} · ${esc(semLib(r.semaine))}</p>
    ${L.length?`<p class="small">Cochez les étudiants pour lesquels ouvrir un suivi d'accompagnement.</p><div class="plist">${L.map(x=>{ const ouvert = S.dossiers.some(d=>d.matricule===x.matricule && !["Résolu","Clos"].includes(d.statut)); return `<div class="crit"><label><input type="checkbox" name="ex" value="${esc(x.matricule)}" ${ouvert?"":"checked"}> <b>${esc(x.nom||nomEtu(x.matricule))}</b> ${ouvert?'<span class="pill">Suivi déjà ouvert</span>':""}</label><span class="small muted">${esc(x.motif)}</span></div>`; }).join("")}</div>`:`<div class="empty">Le tuteur n'a signalé aucun étudiant à accompagner.</div>`}
    <label class="f" for="ex_o">Observations<textarea id="ex_o" maxlength="1000"></textarea></label>
    <div class="row"><button class="btn vert" id="ex_ok">Marquer comme exploité</button><button class="btn ghost" data-close>Annuler</button></div>`);
  $("#ex_ok").onclick = async () => {
    const mats = [...$("#sheet").querySelectorAll('input[name="ex"]:checked')].map(i=>i.value), o = $("#ex_o").value.trim();
    const dossiers = mats.map((m,i) => { const x = L.find(y=>y.matricule===m); return {id:`D${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2,5)}`, data:{matricule:m, nom:nomEtu(m), domaine:"Pédagogique", difficulte:x?.motif||"", priorite:"Normale", statut:"Ouvert", source:{type:"rapport", ref:r.id, lib:`Rapport de ${r.tuteurNom}, ${semLib(r.semaine)}`}, actions:[], creeLe:nowISO(), creePar:compte().nom, creeParEmail:S.email, historique:[trace("Suivi ouvert à partir du rapport hebdomadaire", "Ouvert", x?.motif||"")]}}; });
    const ok = await write(async () => { await Promise.all(dossiers.map(d=>S.db.doc("dossiers/"+d.id).set(d.data))); return S.db.doc("rapports_hebdo/"+r.id).update({statut:"Exploité", exploitation:{par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:o, dossiers:dossiers.map(d=>d.id)}, historique: ajoute(r.historique, trace(`Rapport exploité · ${dossiers.length} suivi(s) ouvert(s)`, "Exploité", o))}); }, `Rapport exploité · ${dossiers.length} suivi(s) ouvert(s)`);
    if (ok){ log("rh_exploite", `Rapport de ${r.tuteurNom} exploité : ${dossiers.length} suivi(s) d'accompagnement ouvert(s)`, ["secretaire","tuteurs"]); closeSheet(); }
  };
}

/* ---------- Dossiers d'accompagnement ---------- */
const DOMAINES_ACC = ["Pédagogique","Tutorat","Assiduité","Méthodologie et organisation","Numérique et plateformes","Personnel ou social","Autre"];
const STATUTS_DOS = ["Ouvert","En cours","Intervention requise","Résolu","Clos"];
const pillDos = st => `<span class="pill ${st==="Intervention requise"?"bad":st==="Résolu"||st==="Clos"?"ok":st==="En cours"?"":"warn"}">${esc(st)}</span>`;
function formDossier(init){
  const d = init || {};
  openSheet(`<h2>${d.id?"Modifier le suivi":"Ouvrir un suivi d'accompagnement"}</h2>
  <form id="dfm" class="form">
    <label class="f" for="d_e">Étudiant<input type="text" id="d_e" list="dl_d" autocomplete="off" value="${d.matricule?esc(d.matricule+" · "+nomEtu(d.matricule)):""}" placeholder="Nom ou matricule"></label>
    <datalist id="dl_d">${S.etudiants.map(x=>`<option value="${esc(x.matricule+" · "+x.nom)}"></option>`).join("")}</datalist>
    <div class="g2"><label class="f" for="d_dm">Domaine<select id="d_dm">${opts(DOMAINES_ACC, d.domaine||"Pédagogique")}</select></label>
    <label class="f" for="d_p">Priorité<select id="d_p">${opts(["Normale","Haute"], d.priorite||"Normale")}</select></label></div>
    <label class="f" for="d_df">Difficulté constatée<textarea id="d_df" maxlength="1000">${esc(d.difficulte||"")}</textarea></label>
    ${d.source?.lib?`<p class="small muted">Origine : ${esc(d.source.lib)}</p>`:""}
    <div class="row"><button class="btn primary" type="submit">${d.statut==="Intervention requise"?"Signaler (intervention requise)":"Enregistrer"}</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
  </form>`);
  $("#dfm").onsubmit = async e => {
    e.preventDefault();
    const m = $("#d_e").value.split("·")[0].trim().toUpperCase(); if (!etuBy(m)) return toast("Sélectionnez l'étudiant dans la liste.");
    const dif = $("#d_df").value.trim(); if (dif.length<5) return toast("Décrivez la difficulté.");
    const statut = d.statut || "Ouvert", id = `D${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;
    const data = {matricule:m, nom:nomEtu(m), domaine:$("#d_dm").value, difficulte:dif, priorite:$("#d_p").value, statut, source:d.source||{type:"manuel"}, actions:[], creeLe:nowISO(), creePar:compte().nom, creeParEmail:S.email, historique:[trace(statut==="Intervention requise"?"Difficulté signalée : intervention requise":"Suivi ouvert", statut, dif)]};
    if (await write(() => S.db.doc("dossiers/"+id).set(data), "Suivi enregistré")){ log("dossier", `${statut==="Intervention requise"?"INTERVENTION REQUISE · ":""}Suivi ouvert pour ${data.nom} (${data.domaine})`, ["accompagnement","secretaire", ...(statut==="Intervention requise"?["president"]:[])]); closeSheet(); }
  };
}
function ficheDossier(id){
  const d = S.dossiers.find(x=>x.id===id); if (!d) return;
  const R = role(), gere = R==="accompagnement" || presidence(), sg = R==="secretaire" || presidence(), ouvert = !["Résolu","Clos"].includes(d.statut);
  const acts = d.actions || [];
  openSheet(`<div class="spread"><div><h2>${esc(d.nom)}</h2><p class="small muted num">${esc(d.matricule)} · ${esc(d.domaine)} · priorité ${esc(d.priorite)}</p></div>${pillDos(d.statut)}</div>
    <div class="quote">${esc(d.difficulte)}</div>
    ${d.source?.lib?`<p class="small muted">Origine : ${esc(d.source.lib)}</p>`:""}
    <div class="card"><h3>Actions d'accompagnement (${acts.filter(a=>a.statut==="Terminée").length}/${acts.length} terminées)</h3>
      ${acts.length?`<div class="plist">${acts.map(a=>`<div class="prow"><span><b class="small">${esc(a.libelle)}</b><br><span class="small muted">${a.echeance?`échéance ${dFR(a.echeance)} · `:""}${esc(a.par)}${a.termineLe?` · terminée le ${dFR(a.termineLe.slice(0,10))}`:""}</span></span>${a.statut==="Terminée"?'<span class="pill ok">Terminée</span>':gere?`<button class="btn sm" data-afin="${esc(a.id)}">Terminer</button>`:'<span class="pill warn">À faire</span>'}</div>`).join("")}</div>`:`<div class="empty">Aucune action engagée.</div>`}
      ${gere&&ouvert?`<div class="g2"><input type="text" id="a_l" maxlength="200" placeholder="Nouvelle action (ex. : entretien individuel)"><input type="date" id="a_e" min="${today()}"></div><div class="row"><button class="btn sm" id="a_ok">Ajouter l'action</button></div>`:""}
    </div>
    ${gere||sg?`<label class="f" for="do_o">Observations<textarea id="do_o" maxlength="1000"></textarea></label>`:""}
    <div class="row">
      ${gere&&ouvert?`<button class="btn" data-dst="En cours">En cours</button><button class="btn danger" data-dst="Intervention requise">Intervention requise</button><button class="btn vert" data-dst="Résolu">Valider le suivi (résolu)</button>`:""}
      ${gere&&d.statut==="Résolu"?`<button class="btn" data-dst="En cours">Rouvrir</button><button class="btn" data-dst="Clos">Clore</button>`:""}
      ${sg&&R!=="accompagnement"?`<button class="btn vert" id="do_ctl">Contrôlé</button><button class="btn" id="do_dem">Demander une explication</button>`:""}
      <button class="btn ghost" data-close>Fermer</button></div>
    ${d.controle?`<p class="small muted">Dernier contrôle : ${esc(d.controle.par)} le ${new Date(d.controle.le).toLocaleDateString("fr-FR")}${d.controle.demande?" · explication demandée":""}</p>`:""}
    <details class="card"><summary>Historique (${(d.historique||[]).length})</summary>${histoHTML(d.historique)}</details>`);
  const obs = () => ($("#do_o")?.value||"").trim();
  const maj = async (data, msg, action, statut, pour) => { if (await write(() => S.db.doc("dossiers/"+id).update({...data, historique: ajoute(d.historique, trace(action, statut, obs()))}), msg)){ log("dossier", `${action} · ${d.nom}`, pour); closeSheet(); } };
  $("#sheet").querySelectorAll("[data-dst]").forEach(b => b.onclick = () => { const st = b.dataset.dst; if (st==="Résolu" && acts.some(a=>a.statut!=="Terminée")) return toast("Terminez d'abord toutes les actions engagées."); maj({statut:st, ...(st==="Résolu"?{validation:{par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:obs()}}:{})}, `Suivi : ${st}`, st==="Résolu"?"Suivi validé (résolu)":`Statut : ${st}`, st, st==="Intervention requise"?["president","secretaire"]:["secretaire"]); });
  $("#a_ok") && ($("#a_ok").onclick = () => { const l = $("#a_l").value.trim(); if (l.length<3) return toast("Décrivez l'action."); const a = {id:"A"+Date.now().toString(36), libelle:l, echeance:$("#a_e").value||"", statut:"À faire", par:compte().nom, le:nowISO()}; maj({actions:[...acts, a], ...(d.statut==="Ouvert"?{statut:"En cours"}:{})}, "Action ajoutée", `Action engagée : ${l}`, d.statut==="Ouvert"?"En cours":d.statut, ["secretaire"]); });
  $("#sheet").querySelectorAll("[data-afin]").forEach(b => b.onclick = () => { const L = acts.map(a=>a.id===b.dataset.afin?{...a, statut:"Terminée", termineLe:nowISO()}:a); maj({actions:L}, "Action terminée", `Action terminée : ${acts.find(a=>a.id===b.dataset.afin)?.libelle}`, d.statut, ["secretaire"]); });
  $("#do_ctl") && ($("#do_ctl").onclick = () => maj({controle:{par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:obs(), demande:false}}, "Contrôle enregistré", "Contrôle du Secrétariat général", d.statut, ["accompagnement"]));
  $("#do_dem") && ($("#do_dem").onclick = () => { if (obs().length<5) return toast("Précisez l'explication demandée."); maj({controle:{par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:obs(), demande:true}}, "Explication demandée", "Explication demandée par le Secrétariat général", d.statut, ["accompagnement"]); });
}

/* ---------- Vue « Suivi des étudiants » ---------- */
function vSuivi(){
  const R = role(), sub = S.sub.suivi || "rapports", E = etatSuivi(), X = etatAccomp();
  const tabs = [["rapports","Rapports hebdomadaires"],["dossiers","Accompagnement"],["etudiants","Étudiants non suivis"], (R==="tuteurs"||presidence())&&["affectations","Affectations"], ["tuteurs","Par tuteur"]].filter(Boolean);
  let body = "";
  if (sub==="rapports"){
    const f = S.sf; let L = S.rapportsHebdo.filter(r=>r.statut!=="Brouillon").slice().sort((a,b)=>b.semaine.localeCompare(a.semaine) || a.tuteurNom.localeCompare(b.tuteurNom,"fr"));
    if (f.sem) L = L.filter(r=>r.semaine===f.sem); if (f.st) L = L.filter(r=>r.statut===f.st);
    const sems = [...new Set([...semainesDues(), ...S.rapportsHebdo.map(r=>r.semaine)])].sort().reverse();
    body = `<div class="filters"><select id="sfS" aria-label="Semaine">${opts(sems.map(s=>[s, semLib(s)]), f.sem, "Toutes les semaines")}</select><select id="sfT" aria-label="Statut">${opts(["Soumis","Retourné","Validé","Exploité","Contrôlé"], f.st, "Tous les statuts")}</select></div>
    ${L.length?`<div class="clist">${L.map(r=>`<button class="citem ${r.statut==="Retourné"?"late":r.statut==="Contrôlé"?"done":""}" data-rh="${esc(r.id)}"><span class="t">${esc(r.tuteurNom)} ${pillRH(r.statut)}${r.controle?.demande?' <span class="pill bad">Explication demandée</span>':""}</span><span class="m"><span>${esc(semLib(r.semaine))}</span><span>· ${(r.etudiants||[]).length} étudiant(s) · ${esc(r.nbSeances)} séance(s)</span>${(r.accompagnement||[]).length?`<span class="pill warn">${r.accompagnement.length} à accompagner</span>`:""}</span></button>`).join("")}</div>`:`<div class="empty">Aucun rapport pour ce filtre.</div>`}`;
  }
  if (sub==="dossiers"){
    const f = S.df; let L = X.D.slice().sort((a,b)=>(a.statut==="Intervention requise"?-1:0)-(b.statut==="Intervention requise"?-1:0) || String(b.creeLe).localeCompare(String(a.creeLe)));
    if (f.st==="ouverts") L = L.filter(d=>!["Résolu","Clos"].includes(d.statut)); else if (f.st) L = L.filter(d=>d.statut===f.st);
    const peutOuvrir = ["accompagnement","tuteurs","formation"].includes(R) || presidence();
    body = `<div class="kpis">${kpi(X.suivis,"étudiants suivis")}${kpi(X.identifiees,"difficultés identifiées")}${kpi(`${X.terminees}/${X.engagees}`,"actions terminées / engagées","g")}${kpi(X.nonResolues,"situations non résolues", X.intervention.length?"bad":"")}</div>
    <div class="spread"><select id="dfS" aria-label="Statut" style="max-width:260px">${opts([["ouverts","Suivis non résolus"],...STATUTS_DOS.map(s=>[s,s])], f.st, "Tous les suivis")}</select>${peutOuvrir?`<button class="btn primary" id="newDos">${ICO.nouveau} ${R==="accompagnement"||presidence()?"Ouvrir un suivi":"Signaler un étudiant"}</button>`:""}</div>
    ${L.length?`<div class="clist">${L.map(d=>`<button class="citem ${d.statut==="Intervention requise"?"urg":["Résolu","Clos"].includes(d.statut)?"done":d.priorite==="Haute"?"late":""}" data-dos="${esc(d.id)}"><span class="t">${esc(d.nom)} ${pillDos(d.statut)}${d.priorite==="Haute"?' <span class="pill bad">Priorité haute</span>':""}</span><span class="small">${esc(d.difficulte.slice(0,140))}</span><span class="m"><span>${esc(d.domaine)}</span><span>· ${(d.actions||[]).filter(a=>a.statut==="Terminée").length}/${(d.actions||[]).length} action(s)</span><span>· ouvert le ${dFR(String(d.creeLe).slice(0,10))}</span>${d.controle?'<span class="pill ok">Contrôlé</span>':""}</span></button>`).join("")}</div>`:`<div class="empty">Aucun suivi pour ce filtre.</div>`}`;
  }
  if (sub==="etudiants"){
    body = E.sem ? `<p class="small muted">${esc(semLib(E.sem))} : apprenants de l'Académie absents de tout rapport hebdomadaire soumis.</p>
      ${E.nonSuivis.length?`<div class="tablewrap"><table><thead><tr><th>Étudiant</th><th>Niveau</th><th>Tuteur affecté</th></tr></thead><tbody>${E.nonSuivis.map(s=>{ const t = S.affectations.find(a=>(a.etudiants||[]).includes(s.matricule)); return `<tr class="click" data-mat="${esc(s.matricule)}"><td>${esc(s.nom)}</td><td>${esc(s.niveau)}</td><td>${t?esc(S.comptes[t.id]?.nom||t.tuteurNom||t.id):'<span class="pill warn">Aucun</span>'}</td></tr>`; }).join("")}</tbody></table></div>`:`<div class="empty">Tous les apprenants ont été suivis cette semaine.</div>`}`
      : `<div class="empty">Aucune semaine échue depuis le début des rapports hebdomadaires (${dFR(TUT().debut)}).</div>`;
  }
  if (sub==="affectations"){
    const T = tuteursActifs(), affectes = new Set(S.affectations.flatMap(a=>a.etudiants||[]));
    body = `<p class="small muted">Affectez à chaque tuteur les étudiants qu'il suit. ${affectes.size} étudiant(s) affecté(s), ${E.sansTuteur.length} sans tuteur.</p>
      ${T.length?`<div class="plist">${T.map(t=>`<div class="prow"><span><b>${esc(t.nom)}</b><br><span class="small muted">${esc(codeSp(t.specialite)||"")} ${esc(t.niveau||"")} · ${affDe(t.em).length} étudiant(s)</span></span><button class="btn sm" data-aff="${esc(t.em)}">Affecter</button></div>`).join("")}</div>`:`<div class="empty">Aucun tuteur actif. Créez les comptes des tuteurs dans Administration.</div>`}`;
  }
  if (sub==="tuteurs"){
    const sems = semainesDues().slice(0,6);
    body = sems.length ? `<div class="tablewrap"><table><thead><tr><th>Tuteur</th>${sems.map(s=>`<th>${parseD(s).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</th>`).join("")}<th class="r">Étudiants</th></tr></thead><tbody>${tuteursActifs().map(t=>`<tr><td>${esc(t.nom)}</td>${sems.map(s=>{ const r = rhDe(t.em, s); return `<td>${r&&r.statut!=="Brouillon"?`<a href="#" data-rh="${esc(r.id)}">${pillRH(r.statut)}</a>`:'<span class="pill bad">Non soumis</span>'}</td>`; }).join("")}<td class="r">${affDe(t.em).length}</td></tr>`).join("")}</tbody></table></div><p class="small muted">Semaines échues, de la plus récente à la plus ancienne.</p>`
      : `<div class="empty">Aucune semaine échue depuis le début des rapports hebdomadaires (${dFR(TUT().debut)}).</div>`;
  }
  return `<div class="spread"><div><h2>Suivi des étudiants</h2><p class="small muted">Rapports hebdomadaires des tuteurs (obligatoires), validation par les responsables, contrôle du Secrétariat général, synthèse à la Présidence.</p></div></div>
  <div class="kpis">${kpi(E.attendus,`rapports attendus${E.sem?` (${parseD(E.sem).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})})`:""}`)}${kpi(E.soumis,"soumis","g")}${kpi(E.valides,"validés")}${kpi(E.retard,"en retard", E.retard?"bad":"g")}</div>
  <div class="subtabs" role="group" aria-label="Suivi">${tabs.map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}
  ${presidence()?`<details class="card"><summary>Règles des rapports hebdomadaires</summary><p class="small muted">Semaine du lundi au dimanche. Le rapport est en retard quand l'échéance (fin de semaine + délai) est dépassée.</p>
    <div class="g2"><label class="f" for="tu_d">Première semaine concernée (lundi)<input type="date" id="tu_d" value="${esc(TUT().debut)}"></label><label class="f" for="tu_j">Délai après la fin de la semaine (jours)<input type="number" id="tu_j" min="0" max="7" value="${esc(TUT().delai)}"></label></div>
    <div class="row"><button class="btn" id="tu_ok">Enregistrer</button></div></details>`:""}`;
}
function bindSuivi(){
  const main = $("#main"), on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  main.querySelectorAll("[data-rh]").forEach(b => b.onclick = e => { e.preventDefault(); ficheHebdo(b.dataset.rh); });
  main.querySelectorAll("[data-dos]").forEach(b => b.onclick = () => ficheDossier(b.dataset.dos));
  main.querySelectorAll("[data-aff]").forEach(b => b.onclick = () => formAffectation(b.dataset.aff));
  on("#sfS","onchange",e=>{ S.sf.sem=e.target.value; render(); }); on("#sfT","onchange",e=>{ S.sf.st=e.target.value; render(); });
  on("#dfS","onchange",e=>{ S.df.st=e.target.value; render(); });
  on("#tu_ok","onclick", async () => { const d = $("#tu_d").value, j = Number($("#tu_j").value); if (!d || !(j>=0)) return toast("Vérifiez la date et le délai."); if (await write(()=>S.db.doc("parametres/general").update({tutorat:{debut:lundiDe(d), delai:j}}), "Règles enregistrées")) log("parametres", `Rapports hebdomadaires : à partir de la semaine du ${dFR(lundiDe(d))}, délai ${j} jour(s)`, ["tuteurs","secretaire","tuteur"]); });
  on("#newDos","onclick",()=>formDossier(role()==="accompagnement"||presidence() ? {} : {priorite:"Haute"}));
}
function formAffectation(em){
  const t = S.comptes[em], cur = new Set(affDe(em)), autres = new Map(S.affectations.filter(a=>a.id!==em).flatMap(a=>(a.etudiants||[]).map(m=>[m, S.comptes[a.id]?.nom||a.id])));
  const L = S.etudiants.filter(s=>s.statut!=="Inactif").sort((a,b)=>(b.niveau===t.niveau)-(a.niveau===t.niveau) || a.nom.localeCompare(b.nom,"fr"));
  openSheet(`<h2>Étudiants de ${esc(t.nom)}</h2><p class="small muted">${esc(codeSp(t.specialite)||"")} ${esc(t.niveau||"")}</p>
    <input type="search" id="af_q" placeholder="Filtrer par nom" aria-label="Filtrer">
    <div class="checks" id="af_l">${L.map(s=>`<label data-n="${esc(normNom(s.nom))}"><input type="checkbox" value="${esc(s.matricule)}" ${cur.has(s.matricule)?"checked":""}> ${esc(s.nom)} <span class="small muted">${esc(s.niveau)} · ${esc((String(s.specialite).match(/\(([^)]+)\)/)||[])[1]||"")}${autres.has(s.matricule)?` · déjà chez ${esc(autres.get(s.matricule))}`:""}</span></label>`).join("")}</div>
    <div class="row"><button class="btn primary" id="af_ok">Enregistrer</button><button class="btn ghost" data-close>Annuler</button></div>`);
  $("#af_q").oninput = e => { const q = normNom(e.target.value); $("#af_l").querySelectorAll("label").forEach(l => l.hidden = q && !l.dataset.n.includes(q)); };
  $("#af_ok").onclick = async () => {
    const etudiants = [...$("#af_l").querySelectorAll("input:checked")].map(i=>i.value);
    const ex = S.affectations.find(a=>a.id===em);
    if (await write(() => S.db.doc("affectations/"+em).set({tuteurNom:t.nom, etudiants, majLe:nowISO(), par:compte().nom, historique: ajoute(ex?.historique, trace(`Affectation mise à jour : ${etudiants.length} étudiant(s)`, ""))}), "Affectation enregistrée")){ if (t.uid) log("affectation", `${etudiants.length} étudiant(s) vous sont affectés`, ["u:"+t.uid]); closeSheet(); }
  };
}

/* ---------- Catalogue des formations (gouvernance) ---------- */
const STATUTS_FORM = ["Brouillon","Ouverte","En cours","Suspendue","Clôturée","Archivée"];
const pillForm = st => `<span class="pill ${st==="Suspendue"?"warn":st==="Clôturée"||st==="Archivée"?"mute":st==="Brouillon"?"mute":"ok"}">${esc(st||"Ouverte")}</span>`;
const gereCatalogue = () => role()==="formation";
const formationsVues = () => role()==="pedagogie" ? S.formations.filter(f=>(f.formateurs||[]).includes(S.email)) : S.formations;
/* Formations utilisables pour le pointage et les notes */
function mesFormations(){
  const base = S.formations.length ? S.formations.filter(f=>!["Archivée","Brouillon"].includes(f.statut)) : (S.params?.formations||[]);
  return role()==="pedagogie" && S.formations.length ? base.filter(f=>(f.formateurs||[]).includes(S.email)) : base;
}
function vCatalogue(){
  const f = S.cf2, gere = gereCatalogue();
  let L = formationsVues().slice().sort((a,b)=>a.code.localeCompare(b.code));
  if (f.st) L = L.filter(x=>(x.statut||"Ouverte")===f.st); else L = L.filter(x=>x.statut!=="Archivée");
  if (f.q){ const q = normNom(f.q); L = L.filter(x=>normNom(x.code+" "+x.intitule).includes(q)); }
  const init = !S.formations.length && (gere || presidence()) && (S.params?.formations||[]).length;
  const formateurs = c => (c.formateurs||[]).map(em=>S.comptes[em]?.nom||em.split("@")[0]).join(", ");
  return `<div class="spread"><div><h2>Catalogue des formations</h2><p class="small muted">${gere?"Vous gérez le catalogue de la CVPB Académie : chaque modification importante est historisée.":role()==="pedagogie"?"Les formations qui vous sont attribuées.":"Consultation du catalogue de la CVPB Académie."}</p></div>${gere?`<button class="btn primary" id="newForm">${ICO.nouveau} Nouvelle formation</button>`:""}</div>
  ${init?`<div class="card"><h3>Initialiser le catalogue</h3><p class="small">Le catalogue est vide. Il peut être créé à partir des ${(S.params.formations||[]).length} formations des paramètres actuels (statut « Ouverte », sans formateur ni module). Les formateurs ne pourront pointer qu'une fois affectés à une formation.</p><div class="row"><button class="btn vert" id="initCat">Créer le catalogue</button></div></div>`:""}
  <div class="kpis">${kpi(formationsVues().filter(x=>["Ouverte","En cours"].includes(x.statut||"Ouverte")).length,"formations actives","g")}${kpi(formationsVues().filter(x=>x.statut==="Suspendue").length,"suspendues")}${kpi(formationsVues().filter(x=>!(x.formateurs||[]).length && !["Clôturée","Archivée"].includes(x.statut)).length,"sans formateur", "warn")}${kpi(formationsVues().reduce((a,x)=>a+(x.modules||[]).length,0),"modules")}</div>
  <div class="filters"><input type="search" id="cq" placeholder="Rechercher une formation" value="${esc(f.q)}" aria-label="Recherche"><select id="cst" aria-label="Statut">${opts(STATUTS_FORM, f.st, "Toutes (hors archivées)")}</select></div>
  ${L.length?`<div class="clist">${L.map(x=>`<button class="citem ${x.statut==="Suspendue"?"late":["Clôturée","Archivée"].includes(x.statut)?"done":""}" data-form="${esc(x.code)}"><span class="t">${esc(x.code)} · ${esc(x.intitule)} ${pillForm(x.statut)}</span><span class="m"><span>${esc(x.niveau||"")}</span><span>· ${(x.modules||[]).length} module(s)</span><span>· ${apprenantsPour(x.code).length} apprenant(s)</span><span>· ${(x.formateurs||[]).length?esc(formateurs(x)):'<span class="pill warn">Sans formateur</span>'}</span></span></button>`).join("")}</div>`:`<div class="empty">${S.formations.length?"Aucune formation pour ce filtre.":"Catalogue non initialisé."}</div>`}`;
}
function bindCatalogue(){
  const on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  $("#main").querySelectorAll("[data-form]").forEach(b => b.onclick = () => ficheFormation(b.dataset.form));
  on("#newForm","onclick",()=>formFormation());
  on("#cst","onchange",e=>{ S.cf2.st=e.target.value; render(); });
  on("#cq","oninput",e=>{ S.cf2.q=e.target.value; clearTimeout(bindCatalogue.t); bindCatalogue.t=setTimeout(()=>{ render(); const i=$("#cq"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); },250); });
  on("#initCat","onclick", async () => {
    const L = S.params.formations||[];
    const ok = await write(() => S.db.lots(L.map(x=>({path:"formations/"+x.code, data:{code:x.code, intitule:x.intitule, niveau:x.niveau||"", description:"", formateurs:[], modules:[], statut:"Ouverte", dateDebut:"", dateFin:"", creeLe:nowISO(), historique:[trace("Formation reprise des paramètres lors de la création du catalogue", "Ouverte")]}}))), `Catalogue créé : ${L.length} formations`);
    if (ok) log("catalogue", `Catalogue des formations initialisé (${L.length} formations)`, ["formation","secretaire"]);
  });
}
function formFormation(code){
  const x = code ? S.formations.find(f=>f.code===code) : {statut:"Brouillon", niveau:"Licence 1", formateurs:[], modules:[]};
  openSheet(`<h2>${code?"Modifier "+esc(code):"Nouvelle formation"}</h2>
  <form id="ff" class="form">
    <div class="g2"><label class="f" for="f_c">Code<input type="text" id="f_c" maxlength="12" value="${esc(x.code||"")}" ${code?"disabled":""} placeholder="Ex. : L1-08"></label>
    <label class="f" for="f_n">Niveau<select id="f_n">${opts([...P().niveaux, "Licence 2 et 3", "Tous niveaux"], x.niveau)}</select></label></div>
    <label class="f" for="f_i">Intitulé<input type="text" id="f_i" maxlength="100" value="${esc(x.intitule||"")}"></label>
    <label class="f" for="f_d">Description et objectifs<textarea id="f_d" maxlength="1500">${esc(x.description||"")}</textarea></label>
    <div class="g2"><label class="f" for="f_db">Début<input type="date" id="f_db" value="${esc(x.dateDebut||"")}"></label><label class="f" for="f_fn">Fin<input type="date" id="f_fn" value="${esc(x.dateFin||"")}"></label></div>
    ${code?`<label class="f" for="f_m">Motif de la modification<input type="text" id="f_m" maxlength="200" placeholder="Enregistré dans l'historique"></label>`:""}
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
  </form>`);
  $("#ff").onsubmit = async e => {
    e.preventDefault();
    const c = (code || $("#f_c").value.trim().toUpperCase()), intitule = $("#f_i").value.trim();
    if (!/^[A-Z0-9-]{2,12}$/.test(c)) return toast("Code invalide : lettres, chiffres et tirets (ex. L1-08).");
    if (!code && S.formations.some(f=>f.code===c)) return toast("Ce code existe déjà.");
    if (intitule.length<3) return toast("Indiquez l'intitulé.");
    const data = {intitule, niveau:$("#f_n").value, description:$("#f_d").value.trim(), dateDebut:$("#f_db").value, dateFin:$("#f_fn").value};
    if (code){
      const chg = Object.entries(data).filter(([k,v])=>String(x[k]||"")!==String(v)).map(([k])=>({intitule:"intitulé",niveau:"niveau",description:"description",dateDebut:"date de début",dateFin:"date de fin"}[k]));
      if (!chg.length) return closeSheet();
      if (await write(()=>S.db.doc("formations/"+c).update({...data, majLe:nowISO(), historique: ajoute(x.historique, trace(`Modification : ${chg.join(", ")}`, x.statut, $("#f_m").value.trim()))}), "Formation modifiée")){ log("catalogue", `Formation ${c} modifiée (${chg.join(", ")})`, ["secretaire"]); closeSheet(); }
    } else if (await write(()=>S.db.doc("formations/"+c).set({code:c, ...data, formateurs:[], modules:[], statut:"Brouillon", creeLe:nowISO(), historique:[trace("Formation créée", "Brouillon")]}), "Formation créée (brouillon)")){ log("catalogue", `Nouvelle formation ${c} · ${intitule}`, ["secretaire"]); closeSheet(); setTimeout(()=>ficheFormation(c), 500); }
  };
}
function ficheFormation(code){
  const x = S.formations.find(f=>f.code===code); if (!x) return;
  const gere = gereCatalogue(), sg = role()==="secretaire", st = x.statut||"Ouverte";
  const mods = x.modules||[], apps = apprenantsPour(code), sea = S.seances.filter(s=>s.formation===code);
  const transitions = {Brouillon:["Ouverte"], Ouverte:["En cours","Suspendue","Clôturée"], "En cours":["Suspendue","Clôturée"], Suspendue:["Ouverte","En cours","Clôturée"], "Clôturée":["Archivée","Ouverte"], "Archivée":[]}[st]||[];
  const libT = {Ouverte:"Ouvrir", "En cours":"Démarrer", Suspendue:"Suspendre", "Clôturée":"Clôturer", "Archivée":"Archiver"};
  openSheet(`<div class="spread"><div><h2>${esc(x.code)} · ${esc(x.intitule)}</h2><p class="small muted">${esc(x.niveau||"")}${x.dateDebut?` · du ${dFR(x.dateDebut)}`:""}${x.dateFin?` au ${dFR(x.dateFin)}`:""}</p></div>${pillForm(st)}</div>
    ${x.description?`<div class="quote">${esc(x.description)}</div>`:""}
    <div class="card"><div class="spread"><h3>Formateurs</h3>${gere?`<button class="btn sm" id="ffo">Affecter</button>`:""}</div>${(x.formateurs||[]).length?`<div class="plist">${x.formateurs.map(em=>`<div class="prow"><span>${esc(S.comptes[em]?.nom||em)}</span><span class="small muted">${esc(em)}</span></div>`).join("")}</div>`:`<div class="empty">Aucun formateur affecté : le pointage est impossible.</div>`}</div>
    <div class="card"><div class="spread"><h3>Modules (${mods.length})</h3>${gere?`<button class="btn sm" id="fmo">Ajouter un module</button>`:""}</div>${mods.length?`<div class="plist">${mods.map((m,i)=>`<div class="prow"><span><b class="small">${i+1}. ${esc(m.titre)}</b><br><span class="small muted">${m.duree?esc(m.duree)+" · ":""}${esc(m.objectifs||"")}</span></span>${gere?`<span class="row"><button class="btn sm ghost" data-mup="${i}" ${i?"":"disabled"} aria-label="Monter">↑</button><button class="btn sm ghost" data-mdel="${i}" aria-label="Retirer">✕</button></span>`:""}</div>`).join("")}</div>`:`<div class="empty">Aucun module défini.</div>`}</div>
    <div class="card"><h3>Apprenants (${apps.length}) · séances (${sea.length})</h3>${apps.length?`<p class="small">${apps.slice(0,40).map(s=>esc(s.nom)).join(", ")}${apps.length>40?"…":""}</p>`:`<div class="empty">Aucun apprenant pour ce niveau.</div>`}</div>
    ${gere||sg?`<label class="f" for="fx_o">${sg?"Observation de contrôle":"Motif (enregistré dans l'historique)"}<textarea id="fx_o" maxlength="800"></textarea></label>`:""}
    <div class="row">${gere?`<button class="btn" id="fed">Modifier</button>${transitions.map(t=>`<button class="btn ${t==="Suspendue"||t==="Archivée"?"danger":t==="Clôturée"?"":"vert"}" data-ft="${t}">${libT[t]}</button>`).join("")}`:""}${sg?`<button class="btn vert" id="fctl">Contrôle administratif</button>`:""}<button class="btn ghost" data-close>Fermer</button></div>
    <details class="card"><summary>Historique (${(x.historique||[]).length})</summary>${histoHTML(x.historique)}</details>`);
  const obs = () => ($("#fx_o")?.value||"").trim();
  const maj = async (data, msg, action, statut, pour) => { if (await write(()=>S.db.doc("formations/"+code).update({...data, majLe:nowISO(), historique: ajoute(x.historique, trace(action, statut||st, obs()))}), msg)){ log("catalogue", `${x.code} : ${action}`, pour||["secretaire"]); closeSheet(); } };
  $("#fed") && ($("#fed").onclick = () => formFormation(code));
  $("#sheet").querySelectorAll("[data-ft]").forEach(b => b.onclick = () => { const t = b.dataset.ft; if (["Suspendue","Clôturée","Archivée"].includes(t) && obs().length<3) return toast("Indiquez le motif."); if (t!=="Brouillon" && t==="Ouverte" && !(x.formateurs||[]).length) toast("Attention : aucun formateur affecté."); maj({statut:t}, `Formation : ${t}`, `${libT[t]||t} la formation`, t, ["secretaire","pedagogie"]); });
  $("#sheet").querySelectorAll("[data-mup]").forEach(b => b.onclick = () => { const i = Number(b.dataset.mup), L = mods.slice(); [L[i-1], L[i]] = [L[i], L[i-1]]; maj({modules:L}, "Ordre des modules modifié", `Module « ${mods[i].titre} » déplacé`); });
  $("#sheet").querySelectorAll("[data-mdel]").forEach(b => confirmBtn(b, "Retirer ?", () => { const i = Number(b.dataset.mdel); maj({modules:mods.filter((_,k)=>k!==i)}, "Module retiré", `Module retiré : ${mods[i].titre}`); }));
  $("#fmo") && ($("#fmo").onclick = () => { openSheet(`<h2>Nouveau module · ${esc(code)}</h2><form id="fm" class="form"><label class="f" for="m_t">Titre<input type="text" id="m_t" maxlength="100"></label><label class="f" for="m_o">Objectifs d'apprentissage<textarea id="m_o" maxlength="600"></textarea></label><label class="f" for="m_d">Durée prévue<input type="text" id="m_d" maxlength="30" placeholder="Ex. : 2 séances de 2 h"></label><div class="row"><button class="btn primary" type="submit">Ajouter</button><button class="btn ghost" type="button" data-close>Annuler</button></div></form>`);
    $("#fm").onsubmit = async e => { e.preventDefault(); const t = $("#m_t").value.trim(); if (t.length<3) return toast("Indiquez le titre du module."); const m = {id:"MD"+Date.now().toString(36), titre:t, objectifs:$("#m_o").value.trim(), duree:$("#m_d").value.trim()}; if (await write(()=>S.db.doc("formations/"+code).update({modules:[...mods, m], majLe:nowISO(), historique: ajoute(x.historique, trace(`Module ajouté : ${t}`, st))}), "Module ajouté")){ log("catalogue", `${code} : module ajouté (${t})`, ["secretaire"]); closeSheet(); setTimeout(()=>ficheFormation(code), 500); } }; });
  $("#ffo") && ($("#ffo").onclick = () => {
    const F = Object.entries(S.comptes).filter(([,c])=>c.role==="pedagogie" && c.actif!==false).sort((a,b)=>a[1].nom.localeCompare(b[1].nom,"fr")), cur = new Set(x.formateurs||[]);
    openSheet(`<h2>Formateurs · ${esc(code)}</h2>${F.length?`<div class="checks">${F.map(([em,c])=>`<label><input type="checkbox" value="${esc(em)}" ${cur.has(em)?"checked":""}> ${esc(c.nom)}</label>`).join("")}</div>`:`<div class="empty">Aucun compte « Formateur de l'Académie ». Créez-le dans Administration.</div>`}<div class="row"><button class="btn primary" id="fo_ok">Enregistrer</button><button class="btn ghost" data-close>Annuler</button></div>`);
    $("#fo_ok").onclick = async () => { const L = [...$("#sheet").querySelectorAll("input:checked")].map(i=>i.value); const noms = L.map(em=>S.comptes[em]?.nom||em).join(", ")||"aucun"; if (await write(()=>S.db.doc("formations/"+code).update({formateurs:L, majLe:nowISO(), historique: ajoute(x.historique, trace(`Formateurs affectés : ${noms}`, st))}), "Formateurs enregistrés")){ L.forEach(em=>{ const u = S.comptes[em]?.uid; if (u && !cur.has(em)) log("catalogue", `La formation ${code} · ${x.intitule} vous est attribuée`, ["u:"+u]); }); log("catalogue", `${code} : formateurs ${noms}`, ["secretaire"]); closeSheet(); } };
  });
  $("#fctl") && ($("#fctl").onclick = () => maj({controle:{par:compte().nom, le:nowISO(), obs:obs()}}, "Contrôle enregistré", "Contrôle administratif du Secrétariat général", st, ["formation"]));
}

/* ---------- Validation du suivi pédagogique (séances) ---------- */
function validerSeance(id, ok){
  const se = S.seances.find(s=>s.id===id); if (!se) return;
  const v = Object.values(se.presences||{}).filter(Boolean);
  openSheet(`<h2>${ok?"Valider":"Retourner"} la séance</h2><p class="small muted">${esc(se.formation)} · ${esc(nomForm(se.formation))} · ${dLong(se.date)} · ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents · pointée par ${esc(se.parNom||"")}</p>
    <label class="f" for="sv_o">${ok?"Observation (facultative)":"Motif du retour au formateur"}<textarea id="sv_o" maxlength="600"></textarea></label>
    <div class="row"><button class="btn ${ok?"vert":"primary"}" id="sv_ok">${ok?"Valider la séance":"Retourner au formateur"}</button><button class="btn ghost" data-close>Annuler</button></div>
    <details class="card"><summary>Historique</summary>${histoHTML(se.historique)}</details>`);
  $("#sv_ok").onclick = async () => {
    const o = $("#sv_o").value.trim(); if (!ok && o.length<3) return toast("Indiquez le motif du retour.");
    const st = ok ? "Validée" : "Retournée";
    if (await write(()=>S.db.doc("seances/"+id).update({validation:{statut:st, par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:o}, historique: ajoute(se.historique, trace(`Séance ${st.toLowerCase()}`, st, o))}), `Séance ${st.toLowerCase()}`)){
      const u = Object.values(S.comptes).find(c=>c.uid===se.par)?.uid; log("seance_val", `Séance ${se.formation} du ${dFR(se.date)} ${st.toLowerCase()}${o?` : ${o}`:""}`, u?["u:"+u, "secretaire"]:["secretaire"]); closeSheet();
    }
  };
}

/* ---------- Rapports des responsables et synthèses hebdomadaires ---------- */
const AUTEURS_RAPPORT = ["formation","tuteurs","accompagnement"];
function chiffresDomaine(r){
  const E = etatSuivi(), X = etatAccomp();
  if (r==="tuteurs") return {"Tuteurs actifs":tuteursActifs().length, "Étudiants affectés":E.affectes, "Rapports attendus":E.attendus, "Rapports soumis":E.soumis, "Rapports validés":E.valides, "Rapports en retard":E.retard, "Difficultés signalées":E.difficultesSignalees};
  if (r==="accompagnement") return {"Étudiants suivis":X.suivis, "Difficultés identifiées":X.identifiees, "Actions engagées":X.engagees, "Actions terminées":X.terminees, "Situations non résolues":X.nonResolues};
  if (r==="formation"){ const F = S.formations; return {"Formations actives":F.filter(f=>["Ouverte","En cours"].includes(f.statut)).length, "Formations suspendues":F.filter(f=>f.statut==="Suspendue").length, "Séances (7 derniers jours)":S.seances.filter(s=>s.date>=addJ(today(),-7)).length, "Séances à valider":S.seances.filter(s=>!s.validation || s.validation.statut==="Soumise").length}; }
  return {};
}
function syntheseAuto(sem){
  const E = etatSuivi(sem), X = etatAccomp(), fin = addJ(sem, 6);
  const sea = S.seances.filter(s=>s.date>=sem && s.date<=fin);
  const v = sea.flatMap(s=>Object.values(s.presences||{}).filter(Boolean));
  const cons = S.consignes.filter(c=>c.statut!=="Annulée" && c.echeance>=sem && c.echeance<=fin);
  return {"Rapports attendus":E.attendus, "Rapports soumis":E.soumis, "Rapports validés":E.valides, "Rapports en retard":E.retard, "Tuteurs sans rapport":E.lignes.filter(l=>l.st==="Non soumis").map(l=>l.t.nom).join(", ")||"aucun",
    "Étudiants suivis par les tuteurs":E.suivis, "Étudiants non suivis":E.nonSuivis.length, "Étudiants signalés en difficulté":E.difficulte.size, "Suivis d'accompagnement ouverts":X.nonResolues, "Interventions requises":X.intervention.length,
    "Actions d'accompagnement terminées / engagées":`${X.terminees} / ${X.engagees}`, "Séances de formation":sea.length, "Présence aux formations":pct(v.length ? v.filter(c=>c==="P"||c==="R").length/v.length : null), "Consignes exécutées / échues":`${cons.filter(c=>c.statut==="Faite").length} / ${cons.length}`};
}
function vSynthese(){
  const R = role(), sub = S.sub.synthese || (AUTEURS_RAPPORT.includes(R) ? "rapports" : "syntheses"), sg = R==="secretaire", lecteur = lectureTotale() || sg;
  const tabs = [lecteur && ["syntheses","Synthèses hebdomadaires"], ["rapports", AUTEURS_RAPPORT.includes(R)?"Mes rapports":"Rapports des responsables"], lecteur && ["controles","Historique des contrôles"]].filter(Boolean);
  let body = "";
  if (sub==="syntheses"){
    const L = S.syntheses.slice().sort((a,b)=>b.semaine.localeCompare(a.semaine)).filter(s=>sg || s.statut==="Transmise");
    body = `${sg?`<div class="row"><button class="btn primary" id="newSyn">${ICO.nouveau} Préparer la synthèse de la semaine</button></div>`:""}
    ${L.length?`<div class="clist">${L.map(s=>`<button class="citem ${s.statut==="Transmise"?"done":""}" data-syn="${esc(s.id)}"><span class="t">Synthèse · ${esc(semLib(s.semaine))} <span class="pill ${s.statut==="Transmise"?"ok":"mute"}">${esc(s.statut)}</span>${s.luLe?' <span class="pill">Lue par la Présidence</span>':""}</span><span class="small">${esc((s.faits||"").slice(0,160))}</span><span class="m"><span>${esc(s.parNom||"")}</span>${s.transmisLe?`<span>· transmise le ${dFR(s.transmisLe.slice(0,10))}</span>`:""}${s.orientations?'<span class="pill">Orientations données</span>':""}</span></button>`).join("")}</div>`:`<div class="empty">${sg?"Aucune synthèse. Préparez celle de la semaine écoulée.":"Aucune synthèse transmise pour l'instant."}</div>`}`;
  }
  if (sub==="rapports"){
    const mine = AUTEURS_RAPPORT.includes(R), L = S.rapportsResp.filter(r=>!mine || r.auteurEmail===S.email).sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe)));
    body = `${mine?`<div class="row"><button class="btn primary" id="newRR">${ICO.nouveau} Transmettre un rapport</button></div>`:""}
    ${L.length?`<div class="clist">${L.map(r=>`<button class="citem ${r.statut==="Complément demandé"?"late":r.statut==="Examiné"?"done":""}" data-rr="${esc(r.id)}"><span class="t">${esc(r.titre)} <span class="pill ${r.statut==="Examiné"?"ok":r.statut==="Complément demandé"?"bad":"warn"}">${esc(r.statut)}</span></span><span class="m"><span>${esc(r.auteurNom)} · ${esc(fonctionDe(r.fonction))}</span><span>· ${esc(r.periode)}</span><span>· ${dFR(String(r.creeLe).slice(0,10))}</span></span></button>`).join("")}</div>`:`<div class="empty">Aucun rapport.</div>`}`;
  }
  if (sub==="controles"){
    const H = [...S.rapportsHebdo.flatMap(r=>(r.historique||[]).filter(e=>/Secrétariat|Contrôle/.test(e.action)).map(e=>({...e, objet:`Rapport de ${r.tuteurNom}, ${semLib(r.semaine)}`}))),
      ...S.dossiers.flatMap(d=>(d.historique||[]).filter(e=>/Secrétariat/.test(e.action)).map(e=>({...e, objet:`Suivi de ${d.nom}`}))),
      ...S.formations.flatMap(f=>(f.historique||[]).filter(e=>/Secrétariat/.test(e.action)).map(e=>({...e, objet:`Formation ${f.code}`}))),
      ...S.rapportsResp.flatMap(r=>(r.historique||[]).filter(e=>/Examiné|Complément/.test(e.action)).map(e=>({...e, objet:r.titre})))].sort((a,b)=>b.le.localeCompare(a.le));
    body = H.length ? `<div class="tablewrap"><table class="wrap"><thead><tr><th>Date</th><th>Objet</th><th>Contrôle</th><th>Par</th><th>Observations</th></tr></thead><tbody>${H.slice(0,200).map(e=>`<tr><td class="small">${new Date(e.le).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</td><td>${esc(e.objet)}</td><td class="small">${esc(e.action)}</td><td class="small">${esc(e.par)}</td><td class="small">${esc(e.obs)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Aucun contrôle enregistré.</div>`;
  }
  return `<div><h2>Synthèses et rapports</h2><p class="small muted">Les responsables transmettent leurs rapports au Secrétariat général, qui les examine, consolide la synthèse hebdomadaire et la transmet à la Présidence.</p></div>
  <div class="subtabs" role="group" aria-label="Synthèses">${tabs.map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function bindSynthese(){
  const main = $("#main"), on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
  main.querySelectorAll("[data-syn]").forEach(b => b.onclick = () => ficheSynthese(b.dataset.syn));
  main.querySelectorAll("[data-rr]").forEach(b => b.onclick = () => ficheRapportResp(b.dataset.rr));
  on("#newSyn","onclick",()=>formSynthese()); on("#newRR","onclick",()=>formRapportResp());
}
function formRapportResp(ex){
  const R = role(), c = chiffresDomaine(R);
  openSheet(`<h2>${ex?"Compléter le rapport":"Transmettre un rapport au Secrétariat général"}</h2>
  ${ex?.examen?.obs?`<div class="banner">Complément demandé : ${esc(ex.examen.obs)}</div>`:""}
  <form id="rrf" class="form">
    <div class="g2"><label class="f" for="rr_p">Période<select id="rr_p">${opts([...derniersMois(3).map(m=>moisLibelle(m)), ...[lundiDe(today()), addJ(lundiDe(today()),-7)].map(s=>semLib(s))], ex?.periode)}</select></label>
    <label class="f" for="rr_t">Titre<input type="text" id="rr_t" maxlength="100" value="${esc(ex?.titre || `Rapport ${fonctionDe(R)}`)}"></label></div>
    <label class="f" for="rr_c">Activités, résultats, difficultés et recommandations<textarea id="rr_c" rows="8" maxlength="4000">${esc(ex?.contenu||"")}</textarea></label>
    <div class="card"><h3>Indicateurs joints automatiquement</h3><div class="plist">${Object.entries(c).map(([k,v])=>`<div class="prow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>
    <div class="row"><button class="btn primary" type="submit">Transmettre</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
  </form>`);
  $("#rrf").onsubmit = async e => {
    e.preventDefault(); const contenu = $("#rr_c").value.trim(); if (contenu.length<20) return toast("Rédigez le rapport (au moins quelques lignes).");
    const id = ex?.id || `RR${Date.now().toString(36)}`;
    const data = {auteurEmail:S.email, auteurNom:compte().nom, fonction:R, periode:$("#rr_p").value, titre:$("#rr_t").value.trim(), contenu, chiffres:c, statut:"Transmis", creeLe:ex?.creeLe||nowISO(), majLe:nowISO(), ...(ex?.examen?{examen:ex.examen}:{}), historique: ajoute(ex?.historique, trace(ex?"Rapport complété et transmis à nouveau":"Rapport transmis au Secrétariat général", "Transmis"))};
    if (await write(()=>S.db.doc("rapports_resp/"+id).set(data), "Rapport transmis")){ log("rapport_resp", `${compte().nom} a transmis « ${data.titre} » (${data.periode})`, ["secretaire"]); closeSheet(); }
  };
}
function ficheRapportResp(id){
  const r = S.rapportsResp.find(x=>x.id===id); if (!r) return;
  const sg = role()==="secretaire" || presidence(), auteur = r.auteurEmail===S.email;
  const corps = `<dl class="dl"><dt>Auteur</dt><dd>${esc(r.auteurNom)} · ${esc(fonctionDe(r.fonction))}</dd><dt>Période</dt><dd>${esc(r.periode)}</dd></dl><div class="quote">${esc(r.contenu)}</div>${Object.keys(r.chiffres||{}).length?`<div class="plist">${Object.entries(r.chiffres).map(([k,v])=>`<div class="prow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`:""}`;
  openSheet(`<div class="spread"><h2>${esc(r.titre)}</h2><span class="pill">${esc(r.statut)}</span></div>${corps}
    ${r.examen?.obs?`<div class="banner">Secrétariat général : ${esc(r.examen.obs)}</div>`:""}
    ${sg&&r.statut==="Transmis"?`<label class="f" for="rr_o">Observations<textarea id="rr_o" maxlength="1000"></textarea></label>`:""}
    <div class="row">${sg&&r.statut==="Transmis"?`<button class="btn vert" id="rr_ok">Examiné</button><button class="btn" id="rr_cp">Demander un complément</button>`:""}${auteur&&r.statut==="Complément demandé"?`<button class="btn vert" id="rr_mod">Compléter</button>`:""}<button class="btn" id="rr_pdf">PDF</button><button class="btn ghost" data-close>Fermer</button></div>
    <details class="card"><summary>Historique</summary>${histoHTML(r.historique)}</details>`);
  const exam = async (st, msg) => { const o = ($("#rr_o")?.value||"").trim(); if (st==="Complément demandé" && o.length<5) return toast("Précisez le complément demandé."); if (await write(()=>S.db.doc("rapports_resp/"+id).update({statut:st, examen:{par:compte().nom, le:nowISO(), obs:o}, historique: ajoute(r.historique, trace(st==="Examiné"?"Rapport examiné":"Complément demandé", st, o))}), msg)){ const u = Object.values(S.comptes).find(c=>c.email===r.auteurEmail)?.uid || S.comptes[r.auteurEmail]?.uid; log("rapport_resp", `« ${r.titre} » : ${st.toLowerCase()}`, u?["u:"+u]:[]); closeSheet(); } };
  $("#rr_ok") && ($("#rr_ok").onclick = () => exam("Examiné", "Rapport examiné"));
  $("#rr_cp") && ($("#rr_cp").onclick = () => exam("Complément demandé", "Complément demandé"));
  $("#rr_mod") && ($("#rr_mod").onclick = () => formRapportResp(r));
  $("#rr_pdf").onclick = () => imprimer(r.titre, `${r.auteurNom} · ${fonctionDe(r.fonction)} · ${r.periode}`, `<p style="white-space:pre-wrap">${esc(r.contenu)}</p>` + T_(["Indicateur","#Valeur"], Object.entries(r.chiffres||{})) + SIG(fonctionDe(r.fonction), "Le Secrétaire général"), `CVPB_rapport_${normNom(r.titre).replace(/ /g,"_")}`);
}
function formSynthese(ex){
  const sems = [...new Set([derniereSemaineDue(), lundiDe(today()), addJ(lundiDe(today()),-7)].filter(Boolean))];
  const sem = ex?.semaine || sems[0];
  const rec = recurrents().map(x=>`${nomEtu(x.m)} (signalé ${x.n} semaines)`).join(", ");
  const recos = S.rapportsHebdo.filter(r=>r.semaine===sem && r.recommandations).map(r=>`${r.tuteurNom} : ${r.recommandations}`).join("\n");
  openSheet(`<h2>Synthèse hebdomadaire</h2>
  <form id="syf" class="form">
    <label class="f" for="sy_s">Semaine<select id="sy_s" ${ex?"disabled":""}>${opts(sems.map(s=>[s, semLib(s)]), sem)}</select></label>
    <div class="card"><h3>Chiffres de la semaine (calculés)</h3><div class="plist" id="sy_c"></div></div>
    <label class="f" for="sy_f">Faits marquants<textarea id="sy_f" maxlength="2000">${esc(ex?.faits||"")}</textarea></label>
    <label class="f" for="sy_d">Difficultés récurrentes<textarea id="sy_d" maxlength="2000">${esc(ex?.difficultes ?? rec)}</textarea></label>
    <label class="f" for="sy_r">Recommandations à la Présidence<textarea id="sy_r" maxlength="2000">${esc(ex?.recommandations ?? recos)}</textarea></label>
    <div class="row"><button class="btn primary" type="submit">Transmettre à la Présidence</button><button class="btn" type="button" id="sy_br">Enregistrer le brouillon</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
  </form>`);
  const drawC = () => { $("#sy_c").innerHTML = Object.entries(syntheseAuto($("#sy_s").value)).map(([k,v])=>`<div class="prow"><span class="small">${esc(k)}</span><b class="small">${esc(v)}</b></div>`).join(""); };
  $("#sy_s").onchange = drawC; drawC();
  const go = async transmettre => {
    const s = $("#sy_s").value, id = s, prev = S.syntheses.find(x=>x.id===id);
    if (prev?.statut==="Transmise") return toast("La synthèse de cette semaine a déjà été transmise.");
    const data = {semaine:s, chiffres:syntheseAuto(s), faits:$("#sy_f").value.trim(), difficultes:$("#sy_d").value.trim(), recommandations:$("#sy_r").value.trim(), statut: transmettre?"Transmise":"Brouillon", parNom:compte().nom, par:S.uid, majLe:nowISO(), ...(transmettre?{transmisLe:nowISO()}:{}), historique: ajoute(prev?.historique, trace(transmettre?"Synthèse transmise à la Présidence":"Brouillon enregistré", transmettre?"Transmise":"Brouillon"))};
    if (transmettre && data.faits.length<10) return toast("Rédigez les faits marquants de la semaine.");
    if (await write(()=>S.db.doc("syntheses/"+id).set(data), transmettre?"Synthèse transmise à la Présidence":"Brouillon enregistré")){ if (transmettre) log("synthese", `Synthèse hebdomadaire transmise (${semLib(s)})`, ["president","vicepresident"]); closeSheet(); }
  };
  $("#syf").onsubmit = e => { e.preventDefault(); go(true); };
  $("#sy_br").onclick = () => go(false);
}
function ficheSynthese(id){
  const s = S.syntheses.find(x=>x.id===id); if (!s) return;
  const pres = presidence(), sg = role()==="secretaire";
  if (pres && s.statut==="Transmise" && !s.luLe) S.db.doc("syntheses/"+id).update({luLe:nowISO(), historique: ajoute(s.historique, trace("Synthèse lue par la Présidence", "Transmise"))}).catch(()=>{});
  const corps = `<div class="plist">${Object.entries(s.chiffres||{}).map(([k,v])=>`<div class="prow"><span class="small">${esc(k)}</span><b class="small">${esc(v)}</b></div>`).join("")}</div>
    ${s.faits?`<h3>Faits marquants</h3><div class="quote">${esc(s.faits)}</div>`:""}${s.difficultes?`<h3>Difficultés récurrentes</h3><div class="quote">${esc(s.difficultes)}</div>`:""}${s.recommandations?`<h3>Recommandations</h3><div class="quote">${esc(s.recommandations)}</div>`:""}`;
  openSheet(`<div class="spread"><h2>Synthèse · ${esc(semLib(s.semaine))}</h2><span class="pill ${s.statut==="Transmise"?"ok":"mute"}">${esc(s.statut)}</span></div>${corps}
    ${s.orientations?`<h3>Orientations de la Présidence</h3><div class="quote">${esc(s.orientations)}</div>`:""}
    ${pres&&s.statut==="Transmise"?`<label class="f" for="sy_o">Orientations de la Présidence<textarea id="sy_o" maxlength="2000">${esc(s.orientations||"")}</textarea></label>`:""}
    <div class="row">${pres&&s.statut==="Transmise"?`<button class="btn primary" id="sy_ok">Enregistrer les orientations</button><a class="btn" href="#consignes" id="sy_c2">Donner une consigne</a>`:""}${sg&&s.statut==="Brouillon"?`<button class="btn primary" id="sy_ed">Reprendre</button>`:""}<button class="btn" id="sy_pdf">PDF</button><button class="btn ghost" data-close>Fermer</button></div>
    <details class="card"><summary>Historique</summary>${histoHTML(s.historique)}</details>`);
  $("#sy_ok") && ($("#sy_ok").onclick = async () => { const o = $("#sy_o").value.trim(); if (o.length<5) return toast("Rédigez les orientations."); if (await write(()=>S.db.doc("syntheses/"+id).update({orientations:o, orientationsLe:nowISO(), historique: ajoute(s.historique, trace("Orientations de la Présidence", "Transmise", o))}), "Orientations enregistrées")){ log("synthese", `Orientations de la Présidence sur la synthèse (${semLib(s.semaine)})`, ["secretaire","vicepresident"]); closeSheet(); } });
  $("#sy_c2") && ($("#sy_c2").onclick = () => closeSheet());
  $("#sy_ed") && ($("#sy_ed").onclick = () => formSynthese(s));
  $("#sy_pdf").onclick = () => imprimer(`Synthèse hebdomadaire · ${semLib(s.semaine)}`, "Suivi des étudiants · consolidation du Secrétariat général", T_(["Indicateur","#Valeur"], Object.entries(s.chiffres||{})) + (s.faits?`<h2>Faits marquants</h2><p style="white-space:pre-wrap">${esc(s.faits)}</p>`:"") + (s.difficultes?`<h2>Difficultés récurrentes</h2><p style="white-space:pre-wrap">${esc(s.difficultes)}</p>`:"") + (s.recommandations?`<h2>Recommandations</h2><p style="white-space:pre-wrap">${esc(s.recommandations)}</p>`:"") + (s.orientations?`<h2>Orientations de la Présidence</h2><p style="white-space:pre-wrap">${esc(s.orientations)}</p>`:"") + SIG("Le Secrétaire général","Le Président"), `CVPB_synthese_${s.semaine}`);
}

/* ---------- Tableaux de bord des nouveaux rôles ---------- */
function vDashTuteurs(){
  const E = etatSuivi(), aValider = S.rapportsHebdo.filter(r=>r.statut==="Soumis");
  return `${entete("Mon espace · Responsable des Tuteurs")}
  <div class="kpis">${kpi(tuteursActifs().length,"tuteurs actifs")}${kpi(E.affectes,"étudiants affectés")}${kpi(E.attendus,"rapports attendus (semaine échue)")}${kpi(E.soumis,"rapports soumis","g")}${kpi(E.valides,"rapports validés","g")}${kpi(E.retard,"rapports en retard", E.retard?"bad":"g")}${kpi(aValider.length,"à valider", aValider.length?"warn":"g")}${kpi(E.difficultesSignalees,"difficultés signalées")}</div>
  <div class="cols"><div class="card"><div class="spread"><h3>Rapports à valider</h3><a class="btn ghost" href="#suivi">Tout voir</a></div>${aValider.length?`<div class="clist">${aValider.map(r=>`<button class="citem" data-rh="${esc(r.id)}"><span class="t">${esc(r.tuteurNom)}</span><span class="m"><span>${esc(semLib(r.semaine))}</span><span>· soumis le ${dFR(String(r.soumisLe).slice(0,10))}</span></span></button>`).join("")}</div>`:`<div class="empty">Aucun rapport en attente.</div>`}</div>
  <div class="card"><h3>Mes alertes</h3>${alertesHTML(mesAlertes(),6)}</div></div>`;
}
function vDashAccomp(){
  const X = etatAccomp(), aExp = S.rapportsHebdo.filter(r=>r.statut==="Validé");
  return `${entete("Mon espace · Suivi et Accompagnement")}
  <div class="kpis">${kpi(X.suivis,"étudiants suivis")}${kpi(X.identifiees,"difficultés identifiées")}${kpi(X.engagees,"actions engagées")}${kpi(X.terminees,"actions terminées","g")}${kpi(X.nonResolues,"situations non résolues", X.intervention.length?"bad":"")}${kpi(aExp.length,"rapports à exploiter", aExp.length?"warn":"g")}</div>
  <div class="cols"><div class="card"><div class="spread"><h3>Rapports validés à exploiter</h3><a class="btn ghost" href="#suivi">Suivi</a></div>${aExp.length?`<div class="clist">${aExp.map(r=>`<button class="citem" data-rh="${esc(r.id)}"><span class="t">${esc(r.tuteurNom)}</span><span class="m"><span>${esc(semLib(r.semaine))}</span>${(r.accompagnement||[]).length?`<span class="pill warn">${r.accompagnement.length} étudiant(s) signalé(s)</span>`:""}</span></button>`).join("")}</div>`:`<div class="empty">Rien à exploiter.</div>`}</div>
  <div class="card"><h3>Suivis prioritaires</h3>${X.ouverts.filter(d=>d.statut==="Intervention requise"||d.priorite==="Haute").length?`<div class="clist">${X.ouverts.filter(d=>d.statut==="Intervention requise"||d.priorite==="Haute").map(d=>`<button class="citem urg" data-dos="${esc(d.id)}"><span class="t">${esc(d.nom)} ${pillDos(d.statut)}</span><span class="small">${esc(d.difficulte.slice(0,100))}</span></button>`).join("")}</div>`:`<div class="empty">Aucun suivi prioritaire.</div>`}</div></div>`;
}
function blocSuiviDirection(){
  const E = etatSuivi(), X = etatAccomp(), syn = S.syntheses.filter(s=>s.statut==="Transmise").sort((a,b)=>b.semaine.localeCompare(a.semaine))[0];
  const actions = S.dossiers.flatMap(d=>(d.actions||[]).filter(a=>a.statut!=="Terminée").map(a=>({...a, nom:d.nom})));
  return `<h3>Suivi des étudiants${E.sem?` · ${esc(semLib(E.sem))}`:""}</h3>
  <div class="kpis">${kpi(`${E.soumis} / ${E.attendus}`,"rapports de tuteurs soumis", E.retard?"warn":"g")}${kpi(E.valides,"rapports validés")}${kpi(X.suivis,"étudiants accompagnés")}${kpi(X.intervention.length,"interventions requises", X.intervention.length?"bad":"g")}</div>
  <div class="cols"><div class="card"><div class="spread"><h3>Dernière synthèse du Secrétariat général</h3><a class="btn ghost" href="#synthese">Toutes</a></div>${syn?`<button class="citem" data-syn="${esc(syn.id)}"><span class="t">${esc(semLib(syn.semaine))} ${syn.luLe?"":'<span class="pill warn">Non lue</span>'}</span><span class="small">${esc((syn.faits||"").slice(0,180))}</span>${syn.recommandations?`<span class="small"><b>Recommandations :</b> ${esc(syn.recommandations.slice(0,160))}</span>`:""}</button>`:`<div class="empty">Aucune synthèse transmise.</div>`}</div>
  <div class="card"><h3>Actions restant à exécuter (${actions.length})</h3>${actions.length?`<div class="plist">${actions.slice(0,6).map(a=>`<div class="prow"><span class="small"><b>${esc(a.nom)}</b> · ${esc(a.libelle)}</span><span class="small muted">${a.echeance?dFR(a.echeance):""}</span></div>`).join("")}</div>`:`<div class="empty">Aucune action d'accompagnement en cours.</div>`}</div></div>`;
}

/* ---------- Recherche globale ---------- */
function rechercheGlobale(){
  openSheet(`<h2>Rechercher</h2><input type="search" id="rg_q" placeholder="Étudiant, matricule, formation, tuteur…" aria-label="Rechercher" autocomplete="off"><div id="rg_r" class="plist"></div>`);
  const draw = () => {
    const q = normNom($("#rg_q").value); if (q.length<2){ $("#rg_r").innerHTML = `<p class="small muted">Tapez au moins 2 lettres.</p>`; return; }
    const res = [
      ...S.etudiants.filter(s=>normNom(s.nom+" "+s.matricule).includes(q)).slice(0,8).map(s=>({t:s.nom, d:`Étudiant · ${s.matricule} · ${s.niveau}`, go:()=>ficheEtu(s.matricule)})),
      ...S.formations.filter(f=>normNom(f.code+" "+f.intitule).includes(q)).slice(0,6).map(f=>({t:`${f.code} · ${f.intitule}`, d:`Formation · ${f.statut||"Ouverte"}`, go:()=>ficheFormation(f.code)})),
      ...Object.entries(S.comptes).filter(([em,c])=>normNom(c.nom+" "+em).includes(q)).slice(0,6).map(([em,c])=>({t:c.nom, d:fonctionDe(c.role), go:()=>{ if (c.role==="tuteur" && S.rapportsHebdo.length){ S.sf = {sem:"", st:""}; S.sub.suivi = "tuteurs"; location.hash = "suivi"; } closeSheet(); }})),
      ...S.dossiers.filter(d=>normNom(d.nom+" "+d.difficulte).includes(q)).slice(0,5).map(d=>({t:`Suivi · ${d.nom}`, d:d.statut, go:()=>ficheDossier(d.id)})),
      ...S.rapportsHebdo.filter(r=>normNom(r.tuteurNom).includes(q)).slice(0,5).map(r=>({t:`Rapport de ${r.tuteurNom}`, d:`${semLib(r.semaine)} · ${r.statut}`, go:()=>ficheHebdo(r.id)}))
    ];
    $("#rg_r").innerHTML = res.length ? res.map((x,i)=>`<button class="erow" data-rg="${i}"><span class="rk">›</span><span class="nm"><b>${esc(x.t)}</b><span class="small muted">${esc(x.d)}</span></span><span></span></button>`).join("") : `<div class="empty">Aucun résultat.</div>`;
    $("#rg_r").querySelectorAll("[data-rg]").forEach(b => b.onclick = () => res[Number(b.dataset.rg)].go());
  };
  $("#rg_q").oninput = draw; draw(); setTimeout(()=>$("#rg_q").focus(), 50);
}

/* ---------- Espace tuteur : rapports hebdomadaires ---------- */
function vTuteurHebdoListe(){
  const L = S.rapportsHebdo.filter(r=>r.tuteurEmail===S.email).sort((a,b)=>b.semaine.localeCompare(a.semaine));
  const dues = semainesDues().slice(0,8), manquants = dues.filter(s=>!L.some(r=>r.semaine===s && r.statut!=="Brouillon"));
  return `<div class="spread"><h2>Mes rapports hebdomadaires</h2><a class="btn vert" href="#t-hebdo" id="tH">${ICO.nouveau} Rapport de la semaine</a></div>
  ${manquants.length?`<div class="banner"><b>${manquants.length} rapport(s) en retard :</b> ${manquants.map(s=>esc(semLib(s))).join(" · ")}</div>`:""}
  ${L.length?`<div class="clist">${L.map(r=>`<button class="citem ${r.statut==="Retourné"?"late":["Validé","Exploité","Contrôlé"].includes(r.statut)?"done":""}" data-rh="${esc(r.id)}"><span class="t">${esc(semLib(r.semaine))} ${pillRH(r.statut)}</span><span class="m"><span>${(r.etudiants||[]).length} étudiant(s) · ${esc(r.nbSeances)} séance(s)</span>${r.statut==="Retourné"?`<span>· ${esc(r.validation?.obs||"")}</span>`:""}</span></button>`).join("")}</div>`:`<div class="empty">Aucun rapport hebdomadaire pour l'instant.</div>`}
  ${mesRapports().length?`<details class="card"><summary>Anciens rapports de séance (${mesRapports().length})</summary><div class="plist">${mesRapports().map(r=>`<div class="prow"><span class="small">${dFR(jourRap(r))} · ${esc(r.theme)}</span>${statutPill(r)}</div>`).join("")}</div></details>`:""}`;
}
function vTuteurEtudiants(){
  const L = mesEtudiantsTuteur(), aff = affDe(S.email).length;
  return `<h2>Mes étudiants (${L.length})</h2><p class="small muted">${aff?"Étudiants qui vous sont affectés par le Responsable des Tuteurs.":"Aucune affectation enregistrée : liste proposée d'après votre niveau et votre spécialité."}</p>
  ${L.length?`<div class="plist">${L.map(s=>{ const n = S.rapportsHebdo.filter(r=>r.tuteurEmail===S.email && (r.etudiants||[]).includes(s.matricule) && r.statut!=="Brouillon").length; return `<div class="prow"><span><b>${esc(s.nom)}</b><br><span class="small muted">${esc(s.matricule)} · ${esc(s.niveau)}</span></span><span class="small muted">${n} rapport(s)</span></div>`; }).join("")}</div>`:`<div class="empty">Aucun étudiant.</div>`}`;
}


function vTuteurAccueil(){
  const c = compte(), mes = S.rapportsHebdo.filter(r=>r.tuteurEmail===S.email), cur = lundiDe(today()), due = derniereSemaineDue();
  const rCur = rhDe(S.email, cur), rDue = due && rhDe(S.email, due);
  const etat = (r, s) => r ? pillRH(r.statut) : (s && echeanceSem(s) < today() ? '<span class="pill bad">Non soumis · en retard</span>' : '<span class="pill warn">À rédiger</span>');
  return `<div class="spread"><div><h2>Bonjour ${esc(c.nom)}</h2><p class="small muted">Tuteur · ${esc(codeSp(c.specialite)||"")} ${esc(c.niveau||"")} · ${mesEtudiantsTuteur().length} étudiant(s)</p></div><a class="btn vert" href="#t-hebdo">${ICO.nouveau} Rapport de la semaine</a></div>
  ${blocConsignes()}
  <div class="card"><h3>Mes rapports hebdomadaires (obligatoires)</h3><div class="plist">
    ${due && due!==cur?`<div class="prow"><span>${esc(semLib(due))}<br><span class="small muted">échéance ${dFR(echeanceSem(due))}</span></span>${rDue&&rDue.statut!=="Brouillon"?`<button class="btn sm ghost" data-rh="${esc(rDue.id)}">${pillRH(rDue.statut)}</button>`:etat(rDue&&rDue.statut!=="Brouillon"?rDue:null, due)}</div>`:""}
    <div class="prow"><span>${esc(semLib(cur))}<br><span class="small muted">échéance ${dFR(echeanceSem(cur))}</span></span>${rCur?`<button class="btn sm ghost" data-rh="${esc(rCur.id)}">${pillRH(rCur.statut)}</button>`:etat(null, cur)}</div>
  </div></div>
  <div class="kpis">${kpi(mes.filter(r=>r.statut!=="Brouillon").length,"rapports soumis")}${kpi(mes.filter(r=>["Validé","Exploité","Contrôlé"].includes(r.statut)).length,"validés","g")}${kpi(mes.filter(r=>r.statut==="Retourné").length,"à corriger", mes.some(r=>r.statut==="Retourné")?"bad":"g")}${kpi(semainesDues().filter(s=>!mes.some(r=>r.semaine===s && r.statut!=="Brouillon")).length,"semaines en retard", "warn")}</div>
  <div class="card"><h3>Mes alertes</h3>${alertesHTML(mesAlertes(),5)}</div>`;
}
/* Abonnements du formateur : séances et notes de ses seules formations */
function abonnerFormateur(){
  const codes = S.formations.map(f=>f.code).sort(), cle = codes.join(",");
  if (S.formCle === cle) return; S.formCle = cle;
  (S.formSubs||[]).forEach(u => { try { u(); } catch(e){} }); S.formSubs = [];
  S.seances = []; S.notes = []; S.loaded.seances = true;
  if (!codes.length){ queueRender(); return; }
  for (let i = 0; i < codes.length; i += 30){
    const lot = codes.slice(i, i+30);
    S.formSubs.push(S.db.collection("seances").where("formation","in",lot).onSnapshot(s => { const ids = new Set(lot); S.seances = [...S.seances.filter(x=>!ids.has(x.formation)), ...rows(s)]; queueRender(); }, ()=>{}));
  }
  const N = {};
  codes.forEach(c => S.formSubs.push(S.db.doc("notes/"+c).onSnapshot(d => { if (d.exists) N[c] = {id:c, ...d.data()}; else delete N[c]; S.notes = Object.values(N); queueRender(); }, ()=>{})));
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
  S.evalP = moisCourant(); S.rp.mois = moisCourant(); S.rp.a = moisCourant()+"-01"; S.rp.b = today();
  const r = role(), db = S.db, has = (...l) => r==="president" || LECTURE_TOTALE.includes(r) || inclut(l, r);
  db.doc("parametres/general").onSnapshot(d => { S.params = d.exists ? d.data() : {}; S.loaded.params = true; queueRender(); }, () => { S.params = {}; S.loaded.params = true; queueRender(); });
  if (has("formation","secretaire","tuteurs","accompagnement")) sub("users","comptes", s => { S.comptes = Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); }); else S.comptes = {[S.email]: S.moi};
  if (has("encaissement","tresorerie","formation","pedagogie","tuteur","secretaire","tuteurs","accompagnement")) sub("etudiants","etudiants", s => { S.etudiants = rows(s); });
  if (has("encaissement","tresorerie","formation","pedagogie","accompagnement","tuteurs")) sub("prive","prive", s => { S.prive = Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); });
  if (has("encaissement","tresorerie")){ sub("encaissements","encaissements", s => { S.encaissements = rows(s); }); }
  if (has("encaissement","caisse","tresorerie")) sub("depots","depots", s => { S.depots = rows(s); });
  if (has("caisse","tresorerie")) sub("operations","operations", s => { S.operations = rows(s); });
  if (has("formation","secretaire","accompagnement")){ sub("seances","seances", s => { S.seances = rows(s); }); sub("notes","notes", s => { S.notes = rows(s); }); }
  /* Formateur : uniquement les formations qui lui sont attribuées, leurs séances et leurs notes */
  if (r==="pedagogie") sub("formations","formations", s => { S.formations = rows(s); abonnerFormateur(); }, db.collection("formations").where("formateurs","array-contains",S.email));
  else sub("formations","formations", s => { S.formations = rows(s); });
  if (has("tuteurs","accompagnement","secretaire","formation")){ sub("affectations","affectations", s => { S.affectations = rows(s); }); sub("rapports_hebdo","rapportsHebdo", s => { S.rapportsHebdo = rows(s); }); sub("dossiers","dossiers", s => { S.dossiers = rows(s); }); }
  else if (r==="tuteur"){ db.doc("affectations/"+S.email).onSnapshot(d => { S.affectations = d.exists ? [{id:d.id, ...d.data()}] : []; queueRender(); }, ()=>{}); sub("rapports_hebdo","rapportsHebdo", s => { S.rapportsHebdo = rows(s); }, db.collection("rapports_hebdo").where("tuteurEmail","==",S.email)); }
  if (has("secretaire")){ sub("rapports_resp","rapportsResp", s => { S.rapportsResp = rows(s); }); sub("syntheses","syntheses", s => { S.syntheses = rows(s); }); }
  else if (["formation","tuteurs","accompagnement"].includes(r)) sub("rapports_resp","rapportsResp", s => { S.rapportsResp = rows(s); }, db.collection("rapports_resp").where("auteurEmail","==",S.email));
  if (has("formation","secretaire","tuteurs")) sub("rapports_tuteurs","tut", s => { S.tut = rows(s); });
  else if (r==="tuteur") db.doc("rapports_tuteurs/"+S.uid).onSnapshot(d => { S.tut = d.exists ? [{id:d.id, ...d.data()}] : []; queueRender(); }, ()=>{});
  const canaux = r==="president" ? ["president"] : [r, "u_"+S.uid];
  canaux.forEach((c, i) => db.collection(`notifs/${c}/items`).orderBy("le","desc").limit(lectureTotale()?400:150).onSnapshot(s => { S[i?"jB":"jA"] = rows(s); fusionJournal(); queueRender(); }, ()=>{}));
  if (lectureTotale()){ sub("consignes","consignes", s => { S.consignes = rows(s); }); sub("evaluations","evaluations", s => { S.evaluations = rows(s); }); }
  else { sub("consignes","consignes", s => { S.consignes = rows(s); }, db.collection("consignes").where("dest","==",S.email)); sub("evaluations","evaluations", s => { S.evaluations = rows(s); }, db.collection("evaluations").where("email","==",S.email)); }
  sub("classement","classements", s => { S.classements = rows(s); });
  if (lectureTotale()) sub("messages","messages", s => { S.messages = rows(s); });
  else domainesMsg().forEach(d => sub("messages","msg_"+d, s => { S["msg_"+d] = rows(s); S.messages = [...(S.msg_fin||[]), ...(S.msg_peda||[])]; }, db.collection("messages").where("domaine","==",d)));
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
      if (S.moi && S.moi.actif !== false){ if (!S.abonne) abonner(); else if (!["president","formation","secretaire","tuteurs","accompagnement",...LECTURE_TOTALE].includes(role())) S.comptes = {[S.email]: S.moi}; }
      queueRender();
    }, () => { S.loaded.moi = true; queueRender(); });
    render();
  });
})();
