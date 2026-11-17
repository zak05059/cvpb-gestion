import { demarrer } from "./fb.js";
import { firebaseConfig } from "./firebase-config.js";
/* CVPB Manager v22 (17/11/2026) : évaluations créées par les formateurs (TP, séances pratiques…), notes validées publiées dans CVPB Académie, référence d'encaissement automatique, T-shirt hors inscription retiré des natures.
   v21 : programmation par formateurs et tuteurs, tutorat multi-spécialités, pointage des activités de la communauté. */

/*CALC-START*/
/* ======== Référentiels et calculs (fonctions pures) ======== */
const TOUS = ["encaissement","caisse","tresorerie","formation","pedagogie","secretaire","tuteurs","accompagnement","responsable","membre","delegue"];
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
  tuteur:{l:"Tuteur", perms:["tut.saisir"], partage:"Contributeur"},
  responsable:{l:"Responsable de commission", perms:[], partage:"Contributeur"},
  membre:{l:"Membre d'équipe (collaborateur)", perms:[], partage:"Contributeur"},
  delegue:{l:"Délégué de spécialité", perms:[], partage:"Contributeur"}
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
  const tutComptes = new Set(Object.values(comptes||{}).filter(c=>(c.role==="tuteur" || (c.rolesSup||[]).includes("tuteur")) && c.actif!==false).map(c=>normNom(c.nom)));
  for (const c of Object.values(comptes||{})) if ((c.role==="tuteur" || (c.rolesSup||[]).includes("tuteur")) && c.actif!==false && !parTuteur[normNom(c.nom)]) parTuteur[normNom(c.nom)] = {doc:normNom(c.nom), nom:c.nom, n:0, att:0, pres:0, partSum:0, dernier:null, prochaine:null, interventions:0};
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
/* v22 : « Vente de T-shirt (hors inscription) » n'est plus proposée à la saisie (le T-shirt passe par l'inscription) ; les anciennes écritures restent lues */
const NATURES_SAISIE = NATURES.filter((_,i)=>i!==2);
/* v22 : référence générée automatiquement : MODE-AAMM-N° (ex. WV-2611-0038) */
const CODE_MODE = {"Espèces":"ES","Wave":"WV","Orange Money":"OM","MTN MoMo":"MM","Moov Money":"MV","Virement bancaire":"VB"};
const refAuto = (num, mode, date) => `${CODE_MODE[mode]||"AU"}-${String(date||"").slice(2,4)}${String(date||"").slice(5,7)}-${String(num||"").replace(/^ENC-/,"")}`;
const refDe = e => e.ref || refAuto(e.num, e.mode, e.date);
/* v22 : types d'évaluation proposés aux formateurs */
const TYPES_EVAL = ["Devoir","Interrogation","Travaux pratiques","Séance pratique","Travail de groupe","Projet","Exposé","Participation","Examen","Autre"];
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

/* Évaluations d'une formation : définies dans le catalogue ; à défaut, une seule « Note finale » (compatibilité) */
const EVAL_DEFAUT = [{id:"final", libelle:"Note finale", type:"Examen", coef:1}];
const evalsDe = f => (f?.evaluations||[]).length ? f.evaluations : EVAL_DEFAUT;
/* Notes d'un document : nouvelle forme {evals:{id:{mat:v}}} ; ancienne forme {notes:{mat:v}} lue comme « Note finale » */
const notesParEval = n => ({...(n?.notes && !n?.evals?.final ? {final:n.notes} : {}), ...(n?.evals||{})});
/* ABS = absent non justifié, compte 0 ; EXC = excusé, n'entre pas dans la moyenne */
function moyennePonderee(notes, evs){
  let som = 0, coefs = 0, attendus = 0, saisis = 0;
  for (const ev of evs){ const c = Number(ev.coef)||1; attendus++; const v = notes[ev.id]; if (v==null || v==="") continue; saisis++; if (v==="EXC") { attendus--; saisis--; continue; } som += (v==="ABS" ? 0 : Number(v))*c; coefs += c; }
  return {moyenne: coefs ? Math.round(som/coefs*100)/100 : null, complet: attendus>0 && saisis>=attendus};
}
const MENTIONS = [[16,"Très bien"],[14,"Bien"],[12,"Assez bien"],[10,"Passable"]];
const mentionDe = (m, min) => m==null ? "" : m < (min??10) ? "Ajourné" : (MENTIONS.find(([s])=>m>=s)||[0,"Passable"])[1];
const n20 = v => v==null ? "—" : v==="ABS" ? "ABS" : v==="EXC" ? "Excusé" : String(Math.round(Number(v)*100)/100).replace(".",",");

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
    /* Exonération décidée par la Présidence (membres de l'équipe apprenants) : mensualités, ou mensualités et inscription */
    const exoM = ["mensualites","tout"].includes(s.exonere), exoI = s.exonere==="tout";
    const dueEchus = concerne && !exoM ? echus.length * P.mensualite : 0;
    const arriere = Math.max(0, dueEchus - pool);
    const resteCourant = concerne && !exoM && courant ? Math.max(0, P.mensualite - (parMois[courant.code]||0)) : 0;
    const inscOk = exoI || inscPayee >= P.inscription;
    let situation, niv;
    if (!concerne){ situation = "Inactif"; niv = "mute"; }
    else if (exoM && inscOk){ situation = "Exonéré"; niv = "ok"; }
    else if (inscPayee === 0 && !L.length){ situation = "Aucun paiement"; niv = "bad"; }
    else if (!inscOk){ situation = "Inscription incomplète"; niv = "warn"; }
    else if (arriere > 0){ situation = "En retard"; niv = "bad"; }
    else if (resteCourant > 0){ situation = "Mois en cours"; niv = "info"; }
    else { situation = "À jour"; niv = "ok"; }
    /* Paiement échelonné : une mensualité peut être réglée en plusieurs tranches, affectées au plus ancien mois non soldé */
    const prochainM = mois.find(m => (parMois[m.code]||0) < P.mensualite);
    const prochain = prochainM ? {code:prochainM.code, libelle:prochainM.libelle, paye:parMois[prochainM.code]||0, reste:P.mensualite-(parMois[prochainM.code]||0)} : null;
    const nbTranches = L.filter(e=>e.nature===N_COTI && e.montant < P.mensualite).length;
    const enEchelonnement = mois.some(m => { const v = parMois[m.code]||0; return v>0 && v<P.mensualite; }) || (inscPayee>0 && !inscOk);
    etu[s.matricule] = {exoM, exoI, prochain, nbTranches, enEchelonnement, inscPayee, inscOk, tshirtVendu, imputation, cotiDirect, pool, parMois, avance, dueEchus, arriere, resteCourant, situation, niv, totalVerse: L.reduce((a,e)=>a+e.montant,0), versements: L};
  }

  /* --- Totaux registre --- */
  const totalEncaisse = encV.reduce((a,e)=>a+e.montant,0);
  const parNature = {}; for (const e of encV) parNature[e.nature] = (parNature[e.nature]||0) + e.montant;
  const refs = {}; for (const e of encV){ for (const r of new Set([e.ref, e.refOp].filter(Boolean).map(x=>x.trim().toUpperCase()))) (refs[r] ||= []).push(e.num); }
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

  /* --- Pédagogie : présences détaillées, notes par évaluation, moyenne pondérée, mention, rang, tutorat --- */
  const catalogue = Object.fromEntries((D.formations||[]).map(f=>[f.code,f]));
  const peda = {};
  for (const s of D.etudiants) peda[s.matricule] = {par:{}, pres:0, total:0, tut:{pres:0, total:0, liste:[]}};
  const fiche = (mat, code) => (peda[mat].par[code] ||= {pres:0, total:0, c:{P:0,R:0,J:0,A:0}, note:null, notes:{}, moyenne:null, complet:false});
  for (const se of D.seances){
    for (const [mat,code] of Object.entries(se.presences||{})){
      if (!peda[mat] || !code) continue;
      const f = fiche(mat, se.formation);
      f.total++; peda[mat].total++; if (f.c[code]!=null) f.c[code]++;
      if (code==="P"||code==="R"){ f.pres++; peda[mat].pres++; }
    }
  }
  for (const pt of (D.pointagesTut||[])){
    for (const [mat,code] of Object.entries(pt.presences||{})){
      if (!peda[mat] || !code) continue;
      const t = peda[mat].tut; t.total++; if (code==="P"||code==="R") t.pres++;
      t.liste.push({date:pt.date, titre:pt.titre||"", code, id:pt.id});
    }
  }
  for (const n of D.notes){
    const evs = evalsDe(catalogue[n.id]), parEval = notesParEval(n);
    for (const ev of evs) for (const [mat,v] of Object.entries(parEval[ev.id]||{})){
      if (!peda[mat] || v===""||v==null) continue;
      fiche(mat, n.id).notes[ev.id] = v;
    }
    for (const mat in peda){ const f = peda[mat].par[n.id]; if (!f || !Object.keys(f.notes).length) continue;
      const m = moyennePonderee(f.notes, evs); f.moyenne = m.moyenne; f.complet = m.complet; f.note = m.moyenne; }
  }
  for (const mat in peda){
    const p = peda[mat]; p.assiduite = p.total ? p.pres/p.total : null; p.tut.assiduite = p.tut.total ? p.tut.pres/p.tut.total : null;
    p.tut.liste.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    for (const code in p.par){
      const f = p.par[code]; f.assiduite = f.total ? f.pres/f.total : null;
      f.mention = mentionDe(f.moyenne, P.noteMin);
      const noteOk = typeof f.moyenne === "number" && f.moyenne >= P.noteMin;
      /* résultat définitif seulement quand toutes les évaluations sont notées */
      f.valide = f.moyenne == null || !f.complet ? null : (noteOk && (f.assiduite == null || f.assiduite >= P.assiduiteMin));
    }
    const ms = Object.values(p.par).map(f=>f.moyenne).filter(v=>typeof v==="number");
    p.moyenneGenerale = ms.length ? ms.reduce((a,b)=>a+b,0)/ms.length : null;
  }
  /* rang par formation (ex aequo au même rang) */
  const parForm = {};
  for (const mat in peda) for (const [code,f] of Object.entries(peda[mat].par)) if (typeof f.moyenne==="number") (parForm[code] ||= []).push(f);
  for (const L of Object.values(parForm)){ L.sort((a,b)=>b.moyenne-a.moyenne); L.forEach(f => { f.rang = L.findIndex(x=>x.moyenne===f.moyenne)+1; f.effectif = L.length; }); }

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
function openSheet(html){ $("#sheet").classList.remove("flot"); document.body.classList.remove("menu-ouvert"); $("#sheet").innerHTML = html; $("#overlay").classList.add("open"); $("#sheet").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeSheet); const f=$("#sheet").querySelector("input,select,textarea"); f && f.focus(); }
function closeSheet(){ $("#overlay").classList.remove("open"); $("#sheet").classList.remove("flot"); document.body.classList.remove("menu-ouvert"); $("#sheet").innerHTML=""; queueRender(); }
$("#overlay").addEventListener("click", e => { if (e.target.id==="overlay") closeSheet(); });
addEventListener("keydown", e => { if (e.key==="Escape" && $("#overlay").classList.contains("open")) closeSheet(); });
const opts = (L, sel, ph) => (ph!=null?`<option value="">${esc(ph)}</option>`:"") + L.map(v => { const [val,lab] = Array.isArray(v)?v:[v,v]; return `<option value="${esc(val)}" ${String(val)===String(sel??"")?"selected":""}>${esc(lab)}</option>`; }).join("");
function confirmBtn(btn, label, fn){ btn.onclick = () => { if (btn.dataset.sure!=="1"){ btn.dataset.sure="1"; btn.textContent=label; return; } fn(); }; }

/* ======== État ======== */
const S = {
  db:null, fb:null, uid:null, email:null, moi:null, sansConfig:false, authPret:false, stale:false, jx:[], rapportsEquipe:[], demandesCours:[], rapportsDelegues:[], notesTuteurs:[], decisions:[], taches:[], reunions:[], audit:[],
  etudiants:[], prive:{}, encaissements:[], depots:[], operations:[], seances:[], notes:[], programme:[], pointagesTut:[], pointagesCom:[], params:null, comptes:{}, demandes:{}, journal:[], journalPub:[], journalFin:[], tut:[], T:null, etat:{}, tf:{tuteur:"", statut:"", spec:""},
  loaded:{}, C:null, pf:{types:["academie","tutorat","communaute","reunion"], vue:"semaine", ref:"", miens:false}, sub:{equipe:"", delegues:"demandes", caisse:"synthese", pedagogie:"seances", admin:"comptes", etudiants:""},
  f:{q:"", niveau:"", situation:"", spec:""}, rf:{q:"", nature:"", mois:"", statut:"valides"},
  firstJournal:true,
  consignes:[], evaluations:[], messages:[], formations:[], affectations:[], rapportsHebdo:[], dossiers:[], rapportsResp:[], syntheses:[], sf:{sem:"", st:""}, df:{st:"ouverts"}, cf2:{st:"", q:""}, editRH:null, mf:{onglet:"attente", type:""}, classements:[], cf:{statut:"", dest:""}, evalP:"", classP:"", rp:{type:"", mois:"", a:"", b:"", tut:""}
};
const compte = () => S.moi;
/* Une personne = un compte ; elle peut cumuler plusieurs rôles (rolesSup) et choisit l'espace affiché. */
const rolesDe = c => c ? [c.role, ...(c.rolesSup||[])].filter((r,i,a)=>r && ROLES[r] && a.indexOf(r)===i) : [];
const role = () => { const c = compte(); if (!c) return null; if (c.role==="president") return "president"; const a = localStorage.getItem("cvpb-espace"); return rolesDe(c).includes(a) ? a : c.role; };
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
  for (const p of pour||[]){ if (p==="tous") TOUS.forEach(r=>canaux.add(r)); else if (String(p).startsWith("u:")) canaux.add("u_"+p.slice(2)); else if (String(p).startsWith("e:")) canaux.add("e_"+p.slice(2)); else if (ROLES[p]) canaux.add(p); }
  const id = "J" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const data = {le:nowISO(), par:S.uid, parNom:compte()?.nom||"", role:role(), action, texte, pour:[...canaux], ...(extra||{})};
  S.db.lots([...canaux].map(c=>({path:`notifs/${c}/items/${id}`, data}))).catch(()=>{});
}
function fusionJournal(){
  const avant = new Set(S.journal.map(j=>j.id));
  const m = new Map(); for (const j of S.jx.flat()) m.set(j.id, j);
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
  {id:"programme", l:"Programme", ok:()=>true},
  {id:"consignes", l:"Consignes", ok:()=>true},
  {id:"delegues", l:"Délégués de spécialité", ok:()=>estDelegue() || supDelegues()},
  {id:"equipe", l:"Espace responsables", ok:()=>jeSuisEquipe() || gouvSup()},
  {id:"taches", l:"Tâches", ok:()=>true},
  {id:"decisions", l:"Décisions", ok:()=>gouvSup() || S.decisions.length>0},
  {id:"reunions", l:"Réunions", ok:()=>true},
  {id:"organigramme", l:"Organigramme", ok:()=>true},
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
  {id:"audit", l:"Journal d'audit", ok:()=>gouvSup()},
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
  S.C = calculer({params:S.params, etudiants:S.etudiants, encaissements:S.encaissements, depots:S.depots, operations:S.operations, seances:S.seances, notes:S.notes, formations:S.formations, pointagesTut:S.pointagesTut}, today());
  S.T = statsTutorat(S.tut, S.comptes, S.C.today);
  if (can("tut.voir")) S.C.alertes.push(...S.T.alertes.filter(a=>!/sans rapport depuis/.test(a.titre)));
  try { S.C.alertes.push(...alertesSuivi()); } catch(e){ console.error(e); }
  try { S.C.alertes.push(...alertesDelegues()); } catch(e){ console.error(e); }
  try { S.C.alertes.push(...alertesEquipe()); } catch(e){ console.error(e); }
  const mesRet = mesConsignes().filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today());
  if (mesRet.length) S.C.alertes.push({niv:"bad", titre:`${mesRet.length} consigne(s) de la Présidence en retard`, detail:mesRet.slice(0,3).map(k=>k.titre).join(" · "), pour:[role()], lien:"#consignes"});
  if (consignesNonLues()) S.C.alertes.push({niv:"warn", titre:`${consignesNonLues()} nouvelle(s) consigne(s) de la Présidence`, detail:mesConsignes().filter(k=>k.statut==="Envoyée").slice(0,3).map(k=>k.titre).join(" · "), pour:[role()], lien:role()==="tuteur"?"#t-consignes":"#consignes"});
  if (lectureTotale()){ const ret = S.consignes.filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today()); if (ret.length) S.C.alertes.push({niv:"warn", titre:`${ret.length} consigne(s) non exécutée(s) à l'échéance`, detail:[...new Set(ret.map(k=>k.destNom))].slice(0,4).join(", "), pour:["president"], lien:"#consignes"}); }
}
function render(){
  try { rendu(); }
  catch(e){ console.error(e); $("#main").innerHTML = `<div class="card"><h3>Un écran n'a pas pu s'afficher</h3><p class="small muted">${esc(e?.message||e)}</p><div class="row"><a class="btn" href="#accueil">Revenir à l'accueil</a><button class="btn" onclick="location.reload()">Recharger</button></div></div>`; }
  finally { try { finRendu(); } catch(e){ const sp = document.getElementById("splash"); if (sp) sp.remove(); } }
}
function rendu(){
  const main = $("#main");
  $("#bnav").hidden = true; if ($("#avatar")) $("#avatar").hidden = true;
  if (S.sansConfig){ $("#tabs").innerHTML=""; main.innerHTML = gate("Configuration à terminer", "Le fichier <b>firebase-config.js</b> contient encore les valeurs d'exemple. Remplacez-les par la configuration de votre projet Firebase (voir le guide LISEZ-MOI)."); return; }
  if (!S.authPret){ main.innerHTML = skel(); return; }
  if (!S.uid){ $("#tabs").innerHTML=""; $("#who").innerHTML=""; $("#bell").hidden = true; if ($("#search")) $("#search").hidden = true; espace(false); renderLogin(main); return; }
  $("#bell").hidden = false; if ($("#search")) $("#search").hidden = false;
  if (!S.loaded.moi){ main.innerHTML = skel(); return; }
  const c = compte();
  if (!c){ $("#tabs").innerHTML=""; main.innerHTML = gate("Accès non autorisé", `Le compte <b>${esc(S.email)}</b> n'a pas encore été ajouté à l'application. Demandez au président de la CVPB de vous ajouter avec cette adresse.`, btnDeco()); bindDeco(); return; }
  if (c.actif === false){ $("#tabs").innerHTML=""; main.innerHTML = gate("Accès suspendu", "Votre accès a été suspendu par la Présidence. Contactez le président pour le rétablir.", btnDeco()); bindDeco(); return; }
  $("#who").innerHTML = `<b>${esc(c.nom)}</b>${esc(ROLES[role()]?.l||"")}${rolesDe(c).length>1 && c.role!=="president"?" · changer d'espace dans Mon compte":""}`;
  espace(role()==="tuteur");
  if (!S.loaded.params){ main.innerHTML = S.stale ? `<div class="empty">Les données ne répondent pas encore. Vérifiez votre connexion.</div>` : skel(); return; }
  recalc();
  if (role()==="tuteur"){ renderTuteur(main); majBadge(); return; }
  const v = view();
  const lab = x => x.id==="accueil" ? (c.role==="president" ? "Tableau général" : "Mon espace") : x.l;
  const nb = x => x.id==="notifications" ? nonLues().length : x.id==="tutorat" && can("tut.suivre") ? S.T.nouveaux.length : x.id==="suivi" ? (role()==="tuteurs" ? S.rapportsHebdo.filter(r=>r.statut==="Soumis").length : role()==="accompagnement" ? S.rapportsHebdo.filter(r=>r.statut==="Validé").length : role()==="secretaire" ? etatSuivi().aControler : 0) : x.id==="synthese" ? (role()==="secretaire" ? S.rapportsResp.filter(r=>r.statut==="Transmis").length : presidence() ? S.syntheses.filter(s=>s.statut==="Transmise" && !s.luLe).length : S.rapportsResp.filter(r=>r.auteurEmail===S.email && r.statut==="Complément demandé").length) : x.id==="messages" ? S.messages.filter(m=>m.statut==="À envoyer" && (lectureTotale() || domainesMsg().includes(m.domaine))).length : x.id==="consignes" ? (lectureTotale() ? S.consignes.filter(k=>!["Faite","Annulée"].includes(k.statut) && k.echeance<today()).length : consignesNonLues()) : x.id==="delegues" ? S.rapportsDelegues.filter(r=>r.statut==="Soumis" && mesVisas(r).some(k=>!r.visas?.[k])).length + (aRole("formation","tuteurs") && !presidence() ? S.demandesCours.filter(d=>d.statut==="Soumise").length : 0) : x.id==="taches" ? S.taches.filter(t=>executeur(t) && t.statut==="À faire").length : x.id==="decisions" ? mesDecisions().filter(d=>(d.exec?.[ek(S.email)]?.statut||"À démarrer")==="À démarrer" && !["Exécutée","Annulée"].includes(d.statut)).length : 0;
  navigation(VIEWS.filter(x=>x.ok()).map(x=>({id:x.id, l:x.id==="consignes"&&!lectureTotale()?"Mes consignes":lab(x), n:nb(x)})), v, principauxDe(role()));
  majBadge();
  if (v==="depots") S.sub.caisse = "depots";
  main.innerHTML = (v==="accueil" ? heroAccueil() + anneaux() + (lectureTotale() ? blocActivite() : "") + blocGouv() + blocConsignes() : "") + (v==="accueil" ? blocProgramme() + blocEquipe() : "") + ({programme:vProgramme, equipe:vEquipe, delegues:vDelegues, taches:vTaches, decisions:vDecisions, reunions:vReunions, organigramme:vOrganigramme, audit:vAudit, suivi:vSuivi, synthese:vSynthese, catalogue:vCatalogue, messages:vMessages, consignes:vConsignes, rapports:vRapports, evaluations:vEvaluations, classement:vClassement, accueil:vAccueil, etudiants:vEtudiants, registre:vRegistre, cotisations:vCotisations, caisse:vCaisse, depots:vCaisse, pedagogie:vPedagogie, tutorat:vTutorat, notifications:vNotifs, admin:vAdmin, compte:vCompte}[v])();
  bind(v==="depots" ? "caisse" : v);
  if (v==="compte") bindCompte();
  if (v==="notifications") marquerLu();
  if (v==="accueil"){ bindEvs($("#main")); bindGouvCommun(); bindDeleguesCommun(); bindActivite(); $("#main").querySelectorAll("[data-ego]").forEach(a => a.addEventListener("click", () => { S.sub.equipe = a.dataset.ego; })); }
  ({programme:bindProgramme, equipe:bindEquipe, delegues:bindDelegues, taches:bindTaches, decisions:bindDecisions, reunions:bindReunions, organigramme:bindOrganigramme, audit:bindAudit, suivi:bindSuivi, synthese:bindSynthese, catalogue:bindCatalogue, messages:bindMessages, consignes:bindConsignes, rapports:bindRapports, evaluations:bindEvaluations, classement:bindClassement}[v]||(()=>{}))();
  $("#main").querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons));
  if (!["suivi","synthese"].includes(v)){ $("#main").querySelectorAll("[data-rh]").forEach(b => b.onclick = e => { e.preventDefault(); ficheHebdo(b.dataset.rh); }); $("#main").querySelectorAll("[data-dos]").forEach(b => b.onclick = () => ficheDossier(b.dataset.dos)); $("#main").querySelectorAll("[data-syn]").forEach(b => b.onclick = () => ficheSynthese(b.dataset.syn)); }
  $("#main").querySelectorAll("[data-goto-sub]").forEach(a => a.addEventListener("click", () => { S.sub.synthese = a.dataset.gotoSub; }));
  $("#main").querySelectorAll("[data-seav]").forEach(b => b.onclick = () => validerSeance(b.dataset.seav, true));
  $("#main").querySelectorAll("[data-sear]").forEach(b => b.onclick = () => validerSeance(b.dataset.sear, false));
  $("#main").querySelectorAll("[data-seao]").forEach(b => b.onclick = () => validerSeance(b.dataset.seao, "o"));
  $("#main").querySelectorAll("[data-seac]").forEach(b => b.onclick = () => validerSeance(b.dataset.seac, "c"));
  [["notev","v"],["noter","r"],["noteo","o"],["notec","c"]].forEach(([k,a]) => $("#main").querySelectorAll(`[data-${k}]`).forEach(b => b.onclick = () => decisionNotes(b.dataset[k], a)));
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
  main.innerHTML = `<div class="login"><img class="lg" src="icon-512.png" alt="Logo de la Communauté Virtuelle de Port-Bouët">
    <div><h2>Bienvenue</h2><p class="muted">CVPB Manager · Communauté Virtuelle de Port-Bouët · CVPB Académie</p></div>
    <div class="form card">
      <button class="btn gbtn" id="gLogin" type="button">${G_ICONE} Se connecter avec Google UVCI</button>
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
  <div class="card"><dl class="dl"><dt>Nom</dt><dd>${esc(c.nom)}</dd><dt>Compte Google</dt><dd class="num" style="overflow-wrap:anywhere">${esc(S.email)}</dd><dt>Fonctions</dt><dd>${esc((c.fonctions||[]).map(titreFonction).join(", ") || "—")}</dd><dt>Rôles</dt><dd>${esc(rolesDe(c).map(r=>ROLES[r]?.l).join(" + "))}</dd>${c.role==="tuteur"?`<dt>Groupe encadré</dt><dd>${esc(codeSp(c.specialite))} · ${esc(c.niveau||"")}</dd>`:""}</dl></div>
  ${rolesDe(c).length>1 && c.role!=="president"?`<div class="card"><h3>Espace affiché</h3><p class="small muted">Vous cumulez plusieurs fonctions avec un seul compte. Choisissez l'espace de travail à afficher ; vos tâches, décisions et réunions restent visibles partout.</p><div class="subtabs" role="group" aria-label="Espace">${rolesDe(c).map(r=>`<button data-espace="${r}" aria-pressed="${role()===r}">${esc(ROLES[r].l)}</button>`).join("")}</div></div>`:""}
  <div class="card"><h3>Application sur le téléphone</h3>${estInstallee()?'<p class="small">L\'application est installée sur cet appareil.</p>':installHTML()}
    <h3>Notifications du téléphone</h3>
    ${perm==="granted"?'<p class="small">Activées : vous serez prévenu des nouvelles actions qui vous concernent.</p>':perm==="denied"?'<p class="small">Bloquées dans les réglages du navigateur. Autorisez les notifications pour ce site pour les recevoir.</p>':perm==="indisponible"?'<p class="small muted">Non disponibles sur cet appareil.</p>':'<button class="btn" id="notifOn" type="button">Activer les notifications</button>'}
    <p class="small muted">Elles arrivent quand l'application est ouverte ou en arrière-plan. Ouvrez-la au moins une fois par jour pour rester à jour.</p></div>
  <div class="card"><h3>Apparence</h3><div class="subtabs" role="group" aria-label="Thème">${[["dark","Sombre"],["light","Clair"],["auto","Automatique"]].map(([k,l])=>`<button data-theme-set="${k}" aria-pressed="${(localStorage.getItem("cvpb-theme")||"dark")===k}">${l}</button>`).join("")}</div></div>
  <div class="card"><h3>Session</h3><p class="small muted">Vous restez connecté sur cet appareil. Déconnectez-vous si le téléphone est partagé.</p><div class="row">${btnDeco()}</div></div>`;
}
function bindCompte(){
  bindInstall(); bindDeco();
  document.querySelectorAll("[data-espace]").forEach(b => b.onclick = () => { localStorage.setItem("cvpb-espace", b.dataset.espace); location.hash = b.dataset.espace==="tuteur" ? "t-accueil" : "accueil"; location.reload(); });
  document.querySelectorAll("[data-theme-set]").forEach(b => b.onclick = () => { try { localStorage.setItem("cvpb-theme", b.dataset.themeSet); } catch(e){} appliquerTheme(); render(); });
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
  return ({tuteurs:vDashTuteurs, accompagnement:vDashAccomp, secretaire:vDashSG, encaissement:vDashEnc, caisse:vDashCaisse, tresorerie:vDashTreso, formation:vDashFormation, pedagogie:vDashPeda, delegue:vDashDelegue}[r] || vDashEquipe)();
}

/* Responsables de commission et membres d'équipe : leur travail (bloc « Mon travail ») et leur commission */
function vDashEquipe(){
  const coms = mesComs();
  if (!coms.length) return `<div class="card"><p class="small muted">Aucune commission rattachée à votre compte. La Présidence l'indique dans vos fonctions.</p></div>`;
  return coms.map(c => { const M = membresDe(c), T = S.taches.filter(t=>t.commission===c);
    return `<div class="card"><div class="spread"><h3>${esc(comNom(c))}</h3>${mesComsResp().includes(c)?'<span class="pill">Responsable</span>':""}</div>
      <div class="kpis">${kpi(T.filter(t=>TACHE_OUV.includes(t.statut)).length,"tâches ouvertes")}${kpi(T.filter(tRetard).length,"en retard",T.some(tRetard)?"bad":"g")}${kpi(T.filter(t=>t.statut==="Terminée").length,"terminées","g")}</div>
      <p class="small muted">Équipe : ${esc(M.map(x=>x.nom).join(", ") || "—")}</p></div>`; }).join("");
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
  <div class="kpis">${kpi(actifs.length,"étudiants actifs")}${kpi(`${n("À jour")+n("Mois en cours")+n("Exonéré")} / ${actifs.length}`,"inscription soldée et sans arriéré","g")}${kpi(pct(assid),"assiduité moyenne aux formations")}${kpi(S.seances.length,"séances de formation pointées","g")}</div>
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
  <div class="row"><a class="btn" href="#synthese" data-goto-sub="rapports">Rapports des responsables</a><a class="btn" href="#synthese" data-goto-sub="controles">Historique des contrôles</a><a class="btn" href="#suivi">État des suivis</a></div>
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
    ${fin?`<select id="fsit" aria-label="Situation">${opts(["À jour","Mois en cours","En retard","Inscription incomplète","Aucun paiement","Exonéré","Inactif"], f.situation, "Toutes situations")}</select>`:"<span></span>"}
  </div>
  <div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom et prénoms</th><th>Niveau</th><th>Spécialité</th>${tel?"<th>Téléphone</th>":""}${fin?'<th class="r">Versé</th><th>Situation</th>':""}<th class="r">Assiduité</th></tr></thead><tbody>
  ${L.map(s=>{ const e = C.etu[s.matricule], p = C.peda[s.matricule]; return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${esc(s.niveau)}</td><td class="small">${esc(codeSpec(s.specialite))}</td>${tel?`<td class="num">${esc(S.prive[s.matricule]?.tel||"—")}</td>`:""}${fin?`<td class="r">${F(e.totalVerse)}</td><td><span class="pill ${e.niv}">${esc(e.situation)}</span>${e.arriere?` <span class="small" style="color:var(--bad)">−${F(e.arriere)}</span>`:""}</td>`:""}<td class="r">${pct(p.assiduite)}</td></tr>`; }).join("") || `<tr><td colspan="9"><div class="empty">Aucun étudiant ne correspond.</div></td></tr>`}
  </tbody></table></div>`;
}
const codeSpec = s => { const m = String(s||"").match(/\(([^)]+)\)\s*$/); return m ? m[1] : (s||"—"); };
function ficheEtu(mat){
  const s = etuBy(mat); if (!s) return;
  const C = S.C, e = C.etu[mat], p = C.peda[mat], fin = can("fin.voir");
  const moisCells = e.exoM ? `<p class="small"><span class="pill ok">Exonéré(e) des mensualités</span> ${esc(s.motifExo||"")}</p>` : C.mois.map(m => { const v = e.parMois[m.code]||0; const st = v>=P().mensualite?"ok": m.fin<C.today?(v?"part":"due"): (m.debut<=C.today?"cur":(v?"part":"fut")); return `<div class="row" style="justify-content:space-between"><span class="small">${esc(m.libelle)}</span><span class="cell ${st}">${v>=P().mensualite?"Soldé":v?`${F(v)} / ${F(P().mensualite)} · reste ${F(P().mensualite-v)}`:(st==="fut"?"À venir":"0")}</span></div>`; }).join("");
  const wa = S.prive[mat]?.tel && waLink(S.prive[mat].tel, relanceMsg(s, e));
  openSheet(`<div class="spread"><div><h2>${esc(s.nom)}</h2><p class="small muted num">${esc(s.matricule)} · ${esc(s.niveau)} · ${esc(s.specialite)}</p></div>${fin?`<span class="pill ${e.niv}">${esc(e.situation)}</span>`:""}</div>
    <dl class="dl"><dt>Académie</dt><dd>${s.academie?"Inscrit(e)":"Non inscrit(e)"}</dd>${s.compte?`<dt>Membre de l'équipe</dt><dd>${esc(nomDe(s.compte))} · ${esc(fonctionsTxt(s.compte))}</dd>`:""}${s.exonere?`<dt>Exonération</dt><dd>${esc(EXO[s.exonere]||"")}${s.motifExo?` · ${esc(s.motifExo)}`:""}</dd>`:""}<dt>Statut</dt><dd>${esc(s.statut||"Actif")}</dd>${can("tel.voir")?`<dt>Téléphone</dt><dd class="num">${esc(S.prive[mat]?.tel||"Non renseigné")}</dd>`:""}</dl>
    ${fin?`<div class="card"><h3>Situation financière</h3>
      <dl class="dl"><dt>Inscription</dt><dd>${F(e.inscPayee)} / ${F(P().inscription)} FCFA ${e.inscOk?'<span class="pill ok">Soldée</span>':'<span class="pill warn">À compléter</span>'}</dd>
      <dt>Part imputée aux cotisations</dt><dd>${F(e.imputation)} FCFA</dd><dt>Cotisations versées</dt><dd>${F(e.cotiDirect)} FCFA</dd>
      <dt>Arriéré (mois échus)</dt><dd style="color:${e.arriere?"var(--bad)":"inherit"}">${F(e.arriere)} FCFA</dd>${C.courant?`<dt>Reste du mois en cours</dt><dd>${F(e.resteCourant)} FCFA</dd>`:""}</dl>
      <div class="plist">${moisCells}</div>
      <details><summary>Versements (${e.versements.length})</summary><div class="tablewrap"><table><tbody>${e.versements.map(v=>`<tr><td class="num">${esc(v.num)}</td><td>${dFR(v.date)}</td><td class="small">${esc(v.nature)}</td><td class="r">${F(v.montant)}</td><td class="small">${esc(v.mode)}</td></tr>`).join("")||'<tr><td>Aucun versement</td></tr>'}</tbody></table></div></details>
    </div>`:""}
    ${can("peda.voir")||can("*")||LECTURE_TOTALE.includes(role())?blocPedaEtu(mat):""}
    ${histoMessages(mat)}
    <div class="row">${can("enc.saisir")?`<button class="btn primary" id="fEnc">+ Encaissement</button>`:""}${can("etu.gerer")?`<button class="btn" id="fEdit">Modifier la fiche</button>`:""}${wa&&fin&&(e.arriere||e.resteCourant||!e.inscOk)?`<a class="btn vert" href="${wa}" target="_blank" rel="noopener">Relancer sur WhatsApp</a>`:""}<button class="btn" id="fPdf">PDF</button><button class="btn" data-close>Fermer</button></div>`);
  $("#fPdf").onclick = () => rptEtudiant(mat);
  bindEvs($("#sheet"));
  $("#fMsg") && ($("#fMsg").onclick = () => formMessage(mat));
  $("#sheet").querySelectorAll("[data-fmenv]").forEach(b => b.onclick = () => { envoyerMsg(S.messages.find(x=>x.id===b.dataset.fmenv)); closeSheet(); });
  $("#fEnc") && ($("#fEnc").onclick = () => formEnc(mat));
  $("#fEdit") && ($("#fEdit").onclick = () => formEtu(mat));
}
const EXO = {mensualites:"Exonéré(e) des mensualités", tout:"Exonéré(e) des mensualités et de l'inscription"};
const fonctionsTxt = em => { const c = S.comptes[em]; if (!c) return ""; return [ROLES[c.role]?.l, ...(c.rolesSup||[]).map(r=>ROLES[r]?.l)].filter(Boolean).join(" + "); };
/* Spécialité d'un compte (« IAN-RSI : … ») convertie au format des fiches étudiants (« … (IAN-RSI) ») */
const specEtuDe = sp => { const code = codeSp(sp); const L = (P().specialites||[]).map(x=>`${x.intitule} (${x.code})`); return L.find(x=>codeSpec(x)===code) || ""; };
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
async function formEtu(mat, pre){
  const isNew = !mat, s = isNew ? {niveau:"Licence 1", academie:true, statut:"Actif", ...(pre||{})} : etuBy(mat);
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
    ${presidence() ? `<fieldset class="f"><legend>Membre de l'équipe apprenant (réservé à la Présidence)</legend>
      <label class="f" for="e_cp">Compte lié (tuteur, responsable…)<select id="e_cp">${opts(actifsTous().filter(c=>c.role!=="president").map(c=>[c.em, `${c.nom} · ${fonctionsTxt(c.em)}`]), s.compte||"", "— Aucun —")}</select></label>
      <div class="g2"><label class="f" for="e_ex">Exonération<select id="e_ex">${opts(Object.entries(EXO), s.exonere||"", "Aucune (paie normalement)")}</select></label>
      <label class="f" for="e_mx">Motif<input type="text" id="e_mx" maxlength="80" value="${esc(s.motifExo||"")}" placeholder="Ex. : tuteur IAN-RSI L1"></label></div></fieldset>`
    : s.exonere ? `<p class="small"><span class="pill ok">${esc(EXO[s.exonere])}</span> décidée par la Présidence.</p>` : ""}
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
    if (presidence()){ data.compte = $("#e_cp").value; data.exonere = $("#e_ex").value; data.motifExo = $("#e_mx").value.trim();
      if (data.compte){ const dj = S.etudiants.find(x=>x.compte===data.compte && x.matricule!==mat); if (dj) return toast(`Ce compte est déjà lié à ${dj.matricule} · ${dj.nom}.`); } }
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
  const q = normNom(f.q); if (q) L = L.filter(e=>normNom(e.num+" "+e.matricule+" "+e.nom+" "+e.payeur+" "+refDe(e)+" "+(e.refOp||"")).includes(q));
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
  ${L.map(e=>`<tr class="${valide(e)?"":"annule"}"><td class="num keep">${esc(e.num)}</td><td>${dFR(e.date)}</td><td class="num">${esc(e.matricule||"—")}</td><td>${esc(e.nom||e.payeur||"—")}</td><td class="small">${esc(e.nature)}</td><td class="small">${esc(moisLib(e.mois))}</td><td class="r">${F(e.montant)}</td><td>${esc(e.mode)}</td><td class="num small">${esc(refDe(e))}${e.refOp?`<br><span class="muted">${esc(e.refOp)}</span>`:""}</td><td>${esc(e.encaissePar)}</td><td class="keep">${valide(e)?(can("enc.annuler")?`<button class="btn sm ghost" data-ann="${esc(e.num)}">Annuler</button>`:""):`<span class="pill bad" title="${esc(e.motif||"")}">Annulée</span>`}</td></tr>`).join("") || `<tr><td colspan="11"><div class="empty">Aucune écriture.</div></td></tr>`}
  </tbody></table></div>`;
}
const moisLib = c => S.C.mois.find(m=>m.code===c)?.libelle || c || "—";
/* Échelonnement : décrit comment un montant sera affecté (tranche, mois soldés, reste) */
function trancheDe(e, na, mt){
  if (na===N_INSC) return mt < Math.max(0, P().inscription - e.inscPayee);
  if (na===N_COTI) return !!e.prochain && mt < e.prochain.reste;
  return false;
}
function affectationTxt(e, na, mt){
  const mens = P().mensualite;
  if (na===N_INSC){
    const reste = Math.max(0, P().inscription - e.inscPayee), ts = P().tshirt;
    if (!reste) return `Inscription déjà soldée : ce montant s'ajoutera aux cotisations.`;
    if (e.inscPayee < ts && e.inscPayee + mt < ts) return `<b style="color:var(--bad)">Refusé : le T-shirt (${F(ts)} FCFA) se paie en une seule fois.</b> Le premier versement de l'inscription doit être d'au moins ${F(ts - e.inscPayee)} FCFA.`;
    const tsTxt = e.inscPayee < ts ? `T-shirt payé (${F(ts)} FCFA)` : "T-shirt déjà payé";
    return mt < reste ? `${tsTxt} · <b>paiement échelonné de l'inscription</b> : il restera ${F(reste-mt)} FCFA à payer (part cotisation, payable en plusieurs fois).` : `${tsTxt} · inscription soldée${mt>reste?` ; ${F(mt-reste)} FCFA imputés aux cotisations`:""}.`;
  }
  if (na===NATURES[2]) return mt < P().tshirt ? `<b style="color:var(--bad)">Refusé : le T-shirt (${F(P().tshirt)} FCFA) se paie en une seule fois.</b>` : "";
  if (na!==N_COTI) return "";
  const C = S.C; let reste = mt; const L = [];
  for (const m of C.mois){
    const deja = e.parMois[m.code]||0, manque = mens - deja; if (manque <= 0) continue;
    const apport = Math.min(manque, reste); if (apport <= 0) break;
    L.push(apport === manque ? `${esc(m.libelle)} soldé${deja?` (complément de ${F(apport)})`:""}` : `<b>tranche de ${F(apport)} FCFA sur ${esc(m.libelle)}</b> (reste ${F(manque-apport)} FCFA à payer)`);
    reste -= apport;
  }
  if (reste > 0) L.push(`${F(reste)} FCFA d'avance`);
  return (L.length && trancheDe(e, na, mt) ? "Paiement échelonné : " : "Affectation : ") + L.join(" · ");
}
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
      <label class="f" for="n_na">Nature<select id="n_na">${opts(NATURES_SAISIE)}</select></label>
      <label class="f" for="n_mo">Mois concerné<select id="n_mo">${opts(C.mois.map(m=>[m.code,m.libelle]), C.courant?.code, "—")}</select></label>
      <label class="f" for="n_mt">Montant encaissé (FCFA)<input type="number" id="n_mt" min="1" step="1" required><span class="hint">Mensualité de ${F(P().mensualite)} FCFA payable en plusieurs fois. Inscription ${F(P().inscription)} FCFA : le T-shirt obligatoire (${F(P().tshirt)} FCFA) se paie en une seule fois, le reste peut être échelonné.</span></label>
      <label class="f" for="n_d">Date<input type="date" id="n_d" value="${today()}" max="${today()}" required></label>
      <label class="f" for="n_md">Mode de paiement<select id="n_md">${opts(P().modes)}</select></label>
      <div class="f"><span>Référence</span><b class="num" id="n_rfa" style="padding:8px 0">générée à l'enregistrement</b><span class="hint">Attribuée automatiquement : MODE-AAMM-N° (ex. WV-2611-0038).</span></div>
      <label class="f" for="n_rf">N° de transaction de l'opérateur (facultatif)<input type="text" id="n_rf" maxlength="40" placeholder="ID Wave / Orange Money du SMS"></label>
      <label class="f" for="n_by">Encaissé par<select id="n_by">${opts(encs, c.nom)}</select></label>
      <label class="f" for="n_ob">Observations<input type="text" id="n_ob" maxlength="200"></label>
    </div>
    <div id="n_prev"></div>
    <div class="row"><button class="btn primary" type="submit">Enregistrer l'encaissement</button><button class="btn" type="button" data-close>Annuler</button></div>
  </form>`);
  const matOf = () => { const v = $("#n_m").value.trim(); const m = v.split("·")[0].trim().toUpperCase(); return etuBy(m) ? m : null; };
  const suggest = () => {
    const m = matOf(), e = m && C.etu[m], na = $("#n_na").value;
    $("#n_pyw").hidden = !!m;
    $("#n_sit").innerHTML = e ? `<div class="banner" style="border-color:var(--line);background:var(--violet-soft)">Inscription ${e.inscOk?"soldée":"à compléter : reste "+F(P().inscription-e.inscPayee)+" FCFA"} · arriéré ${F(e.arriere)} FCFA${e.prochain?` · prochain mois à solder : <b>${esc(e.prochain.libelle)}</b> (${e.prochain.paye?`${F(e.prochain.paye)} déjà versés, `:""}reste ${F(e.prochain.reste)} FCFA)`:" · toutes les mensualités sont soldées"}</div>` : ($("#n_m").value.trim()?`<div class="banner">Étudiant introuvable : choisissez dans la liste ou laissez vide pour un payeur hors liste.</div>`:"");
    if (!$("#n_mt").dataset.touched){
      let v = "";
      if (na===N_INSC) v = e ? Math.max(0, P().inscription - e.inscPayee) || P().inscription : P().inscription;
      else if (na===N_COTI) v = e?.prochain ? e.prochain.reste : P().mensualite;
      else if (na===NATURES[2]) v = P().tshirt;
      $("#n_mt").value = v || "";
    }
    if (na===N_COTI && e?.prochain && !$("#n_mo").dataset.touched) $("#n_mo").value = e.prochain.code;
    apercu();
  };
  /* Aperçu de l'affectation : tranche, mois soldé(s), reste à payer */
  const apercu = () => {
    const m = matOf(), e = m && C.etu[m], na = $("#n_na").value, mt = Math.round(Number($("#n_mt").value)) || 0;
    const txt = mt > 0 ? (e ? affectationTxt(e, na, mt) : na===NATURES[2] && mt < P().tshirt ? `<b style="color:var(--bad)">Refusé : le T-shirt (${F(P().tshirt)} FCFA) se paie en une seule fois.</b>` : "") : "";
    $("#n_prev").innerHTML = txt ? `<div class="banner" style="border-color:var(--line)">${txt}</div>` : "";
  };
  const majRef = () => { const n = S.encaissements.reduce((m,x)=>{ const v = parseInt(String(x.num||"").replace("ENC-",""),10); return isNaN(v)?m:Math.max(m,v); },0)+1; $("#n_rfa").textContent = refAuto("ENC-"+String(n).padStart(4,"0"), $("#n_md").value, $("#n_d").value) + " (prévisionnelle)"; };
  $("#n_md").addEventListener("change", majRef); $("#n_d").addEventListener("change", majRef); majRef();
  $("#n_mt").oninput = () => { $("#n_mt").dataset.touched = "1"; apercu(); };
  $("#n_mo").onchange = () => { $("#n_mo").dataset.touched = "1"; };
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
    /* Le T-shirt obligatoire se paie en une seule fois */
    const ts = P().tshirt, eS = m && C.etu[m];
    if (na===N_INSC && eS && eS.inscPayee < ts && eS.inscPayee + montant < ts){ toast(`Le T-shirt (${F(ts)} FCFA) se paie en une seule fois : versement minimum ${F(ts - eS.inscPayee)} FCFA.`); return; }
    if (na===NATURES[2] && montant < ts){ toast(`Le T-shirt (${F(ts)} FCFA) se paie en une seule fois.`); return; }
    const refOp = $("#n_rf").value.trim();
    if (refOp && S.encaissements.some(e=>valide(e) && [e.refOp, e.ref].some(r=>(r||"").trim().toUpperCase()===refOp.toUpperCase()))){ toast("Ce numéro de transaction existe déjà dans le registre."); return; }
    let id;
    const ok = await write(async () => {
      id = await numero("encaissements", "ENC-", S.encaissements, "num", id => ({num:id, date:$("#n_d").value, matricule:m||"", nom:s?.nom||"", payeur:m?"":payeur, niveau:s?.niveau||"", nature:na, mois:mo, montant, tranche:!!(m && trancheDe(C.etu[m], na, montant)), affectation:m ? affectationTxt(C.etu[m], na, montant).replace(/<[^>]+>/g,"") : "", mode:$("#n_md").value, ref:refAuto(id, $("#n_md").value, $("#n_d").value), refOp, encaissePar:$("#n_by").value, statut:"Valide", obs:$("#n_ob").value.trim(), saisiPar:S.uid, saisiLe:nowISO()}));
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
  const attenduCourant = C.courant ? actifs.filter(s=>!C.etu[s.matricule].exoM).length*P().mensualite : 0;
  const recuCourant = C.courant ? actifs.reduce((a,s)=>a+(C.etu[s.matricule].parMois[C.courant.code]||0),0) : 0;
  return `<div class="spread"><h2>Suivi des inscriptions et cotisations</h2>${can("export")?`<button class="btn" id="expCot">Exporter (CSV)</button>`:""}</div>
  <div class="kpis">
    <div class="kpi"><span class="v">${actifs.filter(s=>C.etu[s.matricule].inscOk).length} / ${actifs.length}</span><span class="l">inscriptions soldées</span></div>
    <div class="kpi g"><span class="v">${C.courant?pct(attenduCourant?recuCourant/attenduCourant:null):"—"}</span><span class="l">${C.courant?`collecté pour ${esc(C.courant.libelle)} (${F(recuCourant)} / ${F(attenduCourant)})`:"aucun mois de cotisation en cours"}</span></div>
    <div class="kpi ${tot("arriere")?"bad":""}"><span class="v">${F(tot("arriere"))}</span><span class="l">FCFA d'arriérés (mois échus)</span></div>
    <div class="kpi g"><span class="v">${F(tot("pool"))}</span><span class="l">FCFA affectés aux cotisations</span></div>
    <div class="kpi"><span class="v">${actifs.filter(s=>C.etu[s.matricule].enEchelonnement).length}</span><span class="l">étudiant(s) en paiement échelonné</span></div>
  </div>
  <div class="row"><select id="csit" style="width:auto" aria-label="Situation">${opts(["À jour","Mois en cours","En retard","Inscription incomplète","Aucun paiement","Exonéré","Inactif"], f.situation, "Toutes situations")}</select>
  <span class="small muted">Règle : l'inscription (${F(P().inscription)} FCFA) comprend le T-shirt (${F(P().tshirt)}) ; tout montant au-delà du T-shirt est imputé aux cotisations, affectées mois après mois. Un mois devient un arriéré une fois terminé. Le T-shirt obligatoire se paie en une seule fois ; le reste de l'inscription et les mensualités peuvent être payés en plusieurs tranches, chaque tranche complétant le plus ancien mois non soldé (case orange = mois payé en partie).</span></div>
  <div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom et prénoms</th><th>Inscription</th>${C.mois.map(m=>`<th title="${esc(m.libelle)}">${esc(m.code)}</th>`).join("")}<th class="r">Arriéré</th><th>Situation</th>${tel?"<th></th>":""}</tr></thead><tbody>
  ${L.map(s=>{ const e = C.etu[s.matricule]; return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${e.exoI?'<span class="cell ok">Exonéré</span>':e.inscOk?'<span class="cell ok">Soldée</span>':e.inscPayee?`<span class="cell part">${F(e.inscPayee)}</span>`:e.tshirtVendu?'<span class="cell part" title="T-shirt acheté hors inscription">T-shirt seul</span>':'<span class="cell due">Non payée</span>'}</td>
    ${C.mois.map(m=>{ if (e.exoM) return `<td><span class="cell ok" title="Exonéré(e) des mensualités">Exo</span></td>`; const v = e.parMois[m.code]||0, full = v>=P().mensualite; const st = full?"ok": m.fin<C.today?(v?"part":"due"): m.debut<=C.today?"cur":(v?"part":"fut"); return `<td><span class="cell ${st}" ${v&&!full?`title="${F(v)} / ${F(P().mensualite)} FCFA versés"`:""}>${full?"✓":v?F(v):st==="fut"?"·":"0"}</span></td>`; }).join("")}
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
    ${L.map(se=>{ const v = Object.values(se.presences||{}).filter(Boolean); const c = k=>v.filter(x=>x===k).length; return `<tr><td>${dLong(se.date)}</td><td>${esc(se.formation)} · <span class="small">${esc(nomForm(se.formation))}</span></td><td class="r">${c("P")}</td><td class="r">${c("R")}</td><td class="r">${c("J")+c("A")}</td><td class="r">${v.length?pct((c("P")+c("R"))/v.length):"—"}</td><td class="small">${esc(se.parNom||"")}</td><td>${(()=>{ const st = se.validation?.statut || "Soumise"; return `<span class="pill ${st==="Validée"?"ok":st==="Retournée"?"bad":"warn"}" title="${esc(se.validation?.obs||"")}">${esc(st)}</span>`; })()}</td><td class="row">${valide && (se.validation?.statut||"Soumise")!=="Validée"?`<button class="btn sm vert" data-seav="${esc(se.id)}">Valider</button><button class="btn sm" data-sear="${esc(se.id)}">Retourner</button>`:""}${valide && se.validation?.statut==="Validée"?`<button class="btn sm" data-seao="${esc(se.id)}">Rouvrir</button>`:""}${role()==="secretaire" && se.validation?.statut==="Validée" && !se.controle?`<button class="btn sm" data-seac="${esc(se.id)}">Contrôler</button>`:""}${se.controle?'<span class="pill ok">Contrôlée</span>':""}${edit && se.validation?.statut!=="Validée"?`<button class="btn sm ghost" data-sea="${esc(se.id)}">Modifier</button>`:""}</td></tr>`; }).join("") || `<tr><td colspan="9"><div class="empty">Aucune séance pointée.</div></td></tr>`}
    </tbody></table></div>`;
  }
  if (sub==="notes"){
    const code = forms.some(f=>f.code===S.sub.noteForm) ? S.sub.noteForm : forms[0]?.code;
    const FX = toutesFormations().find(f=>f.code===code), evs = evalsDe(FX);
    const ev = evs.find(e=>e.id===S.sub.noteEval) || null;
    const L = apprenantsPour(code), ND = S.notes.find(n=>n.id===code), PE = notesParEval(ND), vst = ND?.validation?.statut || (ND ? "Soumises" : "");
    const verrou = vst==="Validées", editN = edit && !verrou && ev;
    const sansEval = !(FX?.evaluations||[]).length;
    body = `<div class="row"><label class="f" for="nfo" style="min-width:240px">Formation<select id="nfo">${opts(forms.map(f=>[f.code,`${f.code} · ${f.intitule}`]), code)}</select></label>
    <label class="f" for="nev" style="min-width:200px">Affichage<select id="nev">${opts([["","Récapitulatif et moyennes"], ...evs.map(e=>[e.id, `Saisir : ${e.libelle} (coef. ${e.coef||1})`])], ev?.id||"")}</select></label>
    ${vst?`<span class="pill ${vst==="Validées"?"ok":vst==="Retournées"?"bad":"warn"}" title="${esc(ND?.validation?.obs||"")}">Notes ${esc(vst.toLowerCase())}</span>`:""}
    ${valide && ND && vst!=="Validées"?`<button class="btn sm vert" data-notev="${esc(code)}">Valider les notes</button><button class="btn sm" data-noter="${esc(code)}">Retourner</button>`:""}
    ${valide && vst==="Validées"?`<button class="btn sm" data-noteo="${esc(code)}">Rouvrir pour rectification</button><button class="btn sm vert" id="notePub" data-code="${esc(code)}">Publier dans l'Académie</button>`:""}
    ${role()==="secretaire" && vst==="Validées"?`<button class="btn sm" data-notec="${esc(code)}">Contrôler</button>`:""}
    ${code && (gereCatalogue() || (estFormateurR() && (FX?.formateurs||[]).includes(S.email))) && S.formations.some(f=>f.code===code)?`<button class="btn sm primary" id="nevNew">+ Nouvelle évaluation</button>`:""}</div>
    ${sansEval?`<div class="banner">Aucune évaluation définie pour cette formation : une seule « Note finale » est utilisée. Ajoutez vos devoirs, travaux pratiques, séances pratiques… avec « + Nouvelle évaluation ». ${gereCatalogue()?`Définissez devoirs, TP et examens avec leurs coefficients dans <a href="#catalogue">Catalogue › fiche de la formation</a>.`:"Le Responsable Formation ou la Présidence peut définir les évaluations dans le catalogue."}</div>`:""}
    ${vst==="Retournées"?`<div class="banner">Retournées par ${esc(ND.validation.par||"")} : ${esc(ND.validation.obs||"")}</div>`:""}
    ${verrou?`<p class="small muted">Notes validées le ${new Date(ND.validation.le).toLocaleDateString("fr-FR")} par ${esc(ND.validation.par)} : elles ne se modifient plus, sauf réouverture pour rectification.</p>`:""}
    <p class="small muted">Notes sur 20 · ABS = absent non justifié (compte 0) · EXC = excusé (hors moyenne). Moyenne pondérée par les coefficients. Formation validée si moyenne ≥ ${P().noteMin} et assiduité ≥ ${pct(P().assiduiteMin)}.</p>
    ${ev ? `<div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom</th><th class="r">Assiduité</th><th>${esc(ev.libelle)} /20</th></tr></thead><tbody>
      ${L.map(s=>{ const f = C.peda[s.matricule].par[code]||{}; const v = (PE[ev.id]||{})[s.matricule]; return `<tr><td class="num">${esc(s.matricule)}</td><td>${esc(s.nom)}</td><td class="r">${pct(f.assiduite)}</td><td style="width:130px">${editN?`<input type="text" inputmode="decimal" class="noteIn" data-mat="${esc(s.matricule)}" value="${v==null?"":esc(String(v).replace(".",","))}" aria-label="Note de ${esc(s.nom)}" style="min-height:32px;padding:4px 8px">`:esc(n20(v))}</td></tr>`; }).join("") || `<tr><td colspan="4"><div class="empty">Aucun apprenant pour ce niveau.</div></td></tr>`}
      </tbody></table></div>${editN&&L.length?`<div class="row"><button class="btn primary" id="saveNotes">Soumettre les notes « ${esc(ev.libelle)} »</button></div>`:""}`
    : `<div class="tablewrap"><table><thead><tr><th>Nom</th><th class="r">Séances</th><th class="r">Assid.</th>${evs.map(e=>`<th class="r" title="${esc(e.type||"")}">${esc(e.libelle)}<br><span class="small muted">coef. ${esc(e.coef||1)}</span></th>`).join("")}<th class="r">Moyenne</th><th>Mention</th><th class="r">Rang</th><th>Résultat</th></tr></thead><tbody>
      ${L.map(s=>{ const f = C.peda[s.matricule].par[code]||{}; return `<tr class="click" data-mat="${esc(s.matricule)}"><td><b>${esc(s.nom)}</b><br><span class="small muted num">${esc(s.matricule)}</span></td><td class="r">${f.pres||0}/${f.total||0}</td><td class="r">${pct(f.assiduite)}</td>${evs.map(e=>`<td class="r">${esc(n20((PE[e.id]||{})[s.matricule]))}</td>`).join("")}<td class="r"><b>${esc(n20(f.moyenne))}</b>${f.moyenne!=null&&!f.complet?'<br><span class="small muted">provisoire</span>':""}</td><td class="small">${esc(f.mention||"—")}</td><td class="r">${f.rang?`${f.rang}/${f.effectif}`:"—"}</td><td>${f.valide==null?'<span class="pill mute">En cours</span>':f.valide?'<span class="pill ok">Validée</span>':'<span class="pill bad">Non validée</span>'}</td></tr>`; }).join("") || `<tr><td colspan="${evs.length+7}"><div class="empty">Aucun apprenant pour ce niveau.</div></td></tr>`}
      </tbody></table></div>${edit&&!verrou?`<p class="small muted">Pour saisir, choisissez une évaluation dans « Affichage ».</p>`:""}`}
    ${ND?.historique?.length?`<details class="card"><summary>Historique des notes (${ND.historique.length})</summary>${histoHTML(ND.historique)}</details>`:""}`;
  }
  if (sub==="assiduite"){
    const L = S.etudiants.filter(s=>s.academie && s.statut!=="Inactif").sort((a,b)=>(C.peda[a.matricule].assiduite??2)-(C.peda[b.matricule].assiduite??2));
    body = `<div class="tablewrap"><table><thead><tr><th>Matricule</th><th>Nom</th><th>Niveau</th><th class="r">Séances</th><th>Assiduité</th><th class="r">Formations validées</th></tr></thead><tbody>
    ${L.map(s=>{ const p = C.peda[s.matricule]; const vals = Object.values(p.par).filter(f=>f.valide!=null); return `<tr class="click" data-mat="${esc(s.matricule)}"><td class="num">${esc(s.matricule)}</td><td><b>${esc(s.nom)}</b></td><td>${esc(s.niveau)}</td><td class="r">${p.pres}/${p.total}</td><td>${p.assiduite==null?'<span class="muted">—</span>':`<div class="row" style="flex-wrap:nowrap"><span class="bar" style="width:90px"><i style="width:${Math.round(p.assiduite*100)}%;${p.assiduite<P().assiduiteMin?"background:var(--bad)":""}"></i></span><span class="num small">${pct(p.assiduite)}</span></div>`}</td><td class="r">${vals.filter(f=>f.valide).length}/${vals.length}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  }
  return `<h2>Suivi pédagogique · CVPB Académie</h2><div class="subtabs" role="group" aria-label="Sections pédagogiques">${[["seances","Présences"],["notes","Notes"],["assiduite","Assiduité et résultats"]].map(([k,l])=>`<button data-sub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function formSeance(id, pre){
  const se = id ? S.seances.find(x=>x.id===id) : {date:pre?.date||today(), formation:pre?.formation||mesFormations()[0]?.code, presences:{}, programme:pre?.programme||""};
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
    const data = {date:$("#s_d").value, formation:$("#s_f").value, presences, programme:se.programme||"", par:id ? (se.par||S.uid) : S.uid, parNom:id ? (se.parNom||compte().nom) : compte().nom, majLe:nowISO(), validation:{statut:"Soumise"}, historique: ajoute(se.historique, trace(id ? (se.validation?.statut==="Retournée" ? "Séance corrigée et soumise à nouveau" : "Séance modifiée") : "Séance pointée", "Soumise"))};
    const ref = id ? S.db.doc("seances/"+id) : S.db.collection("seances").doc();
    if (await write(()=>ref.set(data), "Présences enregistrées")){ const v=Object.values(presences);
      if (data.programme){ const ev = S.programme.find(x=>x.id===data.programme); if (ev) S.db.doc("programme/"+ev.id).update({statut:"Tenue", seanceId:ref.id, pointeLe:nowISO(), pointePar:compte().nom, historique:ajoute(ev.historique, trace("Séance pointée", "Tenue"))}).catch(()=>{}); } log("seance", `Séance ${data.formation} du ${dFR(data.date)} : ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents`, ["president","bureau"]);
      const abs = Object.entries(presences).filter(([,x])=>x==="A").map(([k])=>({matricule:k, ref:ref.id}));
      if (abs.length) preparerMessages("absence", abs).then(L => L.length && toast(`${L.length} message(s) d'absence préparé(s) dans « WhatsApp étudiants »`)); closeSheet(); }
  };
}
async function saveNotes(code, evId){
  const FX = toutesFormations().find(f=>f.code===code), ev = evalsDe(FX).find(e=>e.id===evId); if (!ev) return toast("Choisissez l'évaluation à saisir.");
  const ND = S.notes.find(n=>n.id===code);
  if (ND?.validation?.statut==="Validées") return toast("Ces notes sont validées : demandez au Responsable Formation de les rouvrir pour rectification.");
  const PE = notesParEval(ND), avant = PE[ev.id] || {}, cur = {...avant}; let bad = 0;
  document.querySelectorAll(".noteIn").forEach(i => { const raw = i.value.trim().toUpperCase().replace(",","."); if (raw===""){ delete cur[i.dataset.mat]; return; } if (raw==="ABS"||raw==="EXC"){ cur[i.dataset.mat]=raw; return; } const n = Number(raw); if (isNaN(n)||n<0||n>20){ bad++; i.style.borderColor="var(--bad)"; return; } cur[i.dataset.mat] = n; });
  if (bad){ toast(`${bad} note(s) invalide(s) : un nombre entre 0 et 20, ABS ou EXC.`); return; }
  const nb = new Set([...Object.keys(cur), ...Object.keys(avant)].filter(k=>String(avant[k])!==String(cur[k]))).size;
  const evals = {...PE, [ev.id]: cur};
  if (await write(()=>S.db.doc("notes/"+code).set({evals, majLe:nowISO(), par:S.uid, parNom:compte().nom, validation:{statut:"Soumises"}, historique: ajoute(ND?.historique, trace(`${ev.libelle} : ${ND?.validation?.statut==="Retournées" ? "notes corrigées et soumises à nouveau" : "notes soumises"} (${nb} modification(s))`, "Soumises"))}), "Notes soumises au Responsable Formation")) log("notes", `Notes ${code} · ${ev.libelle} soumises pour validation (${Object.keys(cur).length} apprenants)`, ["formation"]);
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
const TVIEWS = [{id:"t-accueil", l:"Mon tableau de bord"},{id:"t-programme", l:"Programme"},{id:"t-hebdo", l:"Rapport de la semaine"},{id:"t-rapports", l:"Mes rapports"},{id:"t-etudiants", l:"Mes étudiants"},{id:"t-consignes", l:"Consignes"},{id:"t-delegues", l:"Délégués de mon groupe"},{id:"t-taches", l:"Tâches"},{id:"t-reunions", l:"Réunions"},{id:"t-organigramme", l:"Organigramme"},{id:"t-classement", l:"Classement"},{id:"t-notifs", l:"Notifications"},{id:"t-compte", l:"Mon compte"}];
function tview(){ const h = location.hash.slice(1); return TVIEWS.some(v=>v.id===h) ? h : "t-accueil"; }
const mesRapports = () => S.T.rapports.filter(r=>r.doc===S.uid);
function renderTuteur(main){
  const v = tview();
  navigation(TVIEWS.map(x=>({id:x.id, l:x.l, n:x.id==="t-delegues"?S.rapportsDelegues.filter(r=>r.statut==="Soumis" && mesVisas(r).some(k=>!r.visas?.[k])).length:x.id==="t-notifs"?nonLues().length:x.id==="t-consignes"?consignesNonLues():0})), v, principauxDe("tuteur"));
  if (v==="t-programme"){ main.innerHTML = vProgramme(); bindProgramme(); return; }
  if (v==="t-consignes"){ main.innerHTML = vConsignes(); bindConsignes(); return; }
  if (v==="t-delegues"){ main.innerHTML = vDelegues(); bindDelegues(); return; }
  if (v==="t-taches"){ main.innerHTML = vTaches(); bindTaches(); return; }
  if (v==="t-reunions"){ main.innerHTML = vReunions(); bindReunions(); return; }
  if (v==="t-organigramme"){ main.innerHTML = vOrganigramme(); bindOrganigramme(); return; }
  if (v==="t-classement"){ main.innerHTML = vClassement(); bindClassement(); return; }
  if (v==="t-hebdo"){ const r = S.editRH ? rhDe(S.email, S.editRH) : null; S.editRH = null; main.innerHTML = formHebdoHTML(r && ["Brouillon","Retourné"].includes(r.statut) ? r : null); bindFormHebdo(r && ["Brouillon","Retourné"].includes(r.statut) ? r : null); return; }
  if (v==="t-rapports"){ main.innerHTML = vTuteurHebdoListe(); main.querySelectorAll("[data-rh]").forEach(b => b.onclick = () => ficheHebdo(b.dataset.rh)); return; }
  if (v==="t-etudiants"){ main.innerHTML = vTuteurEtudiants(); return; }
  if (v==="t-accueil"){ main.innerHTML = vTuteurAccueil() + blocProgramme(); bindEvs(main); main.querySelectorAll("[data-rh]").forEach(b => b.onclick = () => ficheHebdo(b.dataset.rh)); main.querySelectorAll("[data-cons]").forEach(b => b.onclick = () => ficheConsigne(b.dataset.cons)); return; }
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
    const ligne = ([u,c]) => `<div class="prow"><span><b>${esc(c.nom)}</b> ${c.actif===false?'<span class="pill bad">Suspendu</span>':""}${!c.uid&&c.role!=="president"?' <span class="pill warn">Jamais connecté</span>':""}<br><span class="small muted">${esc([ROLES[c.role]?.l, ...(c.rolesSup||[]).map(r=>ROLES[r]?.l)].filter(Boolean).join(" + "))}${(c.fonctions||[]).length?` · ${esc(c.fonctions.map(titreFonction).join(", "))}`:""}${c.role==="tuteur"?` · ${esc(codeSp(c.specialite))} ${esc(c.niveau||"")}`:""} · <span class="num" style="overflow-wrap:anywhere">${esc(u)}</span>${c.derniereConnexion?` · vu le ${new Date(c.derniereConnexion).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`:""}</span></span><span class="row" style="flex-wrap:nowrap">${(()=>{ const et = S.etudiants.find(x=>x.compte===u); return et ? `<button class="btn sm ghost" data-fiche-etu="${esc(et.matricule)}" title="Fiche apprenant">${esc(et.matricule)}</button>` : c.role!=="president" && presidence() ? `<button class="btn sm ghost" data-app="${esc(u)}" title="Créer sa fiche d'apprenant">+ Apprenant</button>` : ""; })()}${u!==S.email?`<button class="btn sm ghost" data-cpt="${esc(u)}">Modifier</button>`:'<span class="pill">Vous</span>'}</span></div>`;
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
function formCompte(uid, pre){
  const isNew = !uid, c = isNew ? {role:(pre?.fonctions?.[0] && roleDeFonction(pre.fonctions[0]) && roleDeFonction(pre.fonctions[0])!=="president") ? roleDeFonction(pre.fonctions[0]) : "membre", actif:true, nom:pre?.nom||"", fonctions:pre?.fonctions||[]} : S.comptes[uid];
  const F = (c.fonctions||[]).map(f=>({...f}));
  const rolesListe = Object.entries(ROLES).filter(([k])=>k!=="president" && (k!=="tresorerie" || c.role==="tresorerie"));
  openSheet(`<h2>${isNew?"Ajouter une personne":"Modifier "+esc(c.nom)}</h2>
    <label class="f" for="c_n">Nom et prénoms<input type="text" id="c_n" value="${esc(c.nom)}" maxlength="80"></label>
    ${isNew?`<label class="f" for="c_em">Adresse Google UVCI<input type="email" id="c_em" autocapitalize="none" spellcheck="false" maxlength="80" placeholder="prenom.nom@${esc(DOMAINE())}"><span class="hint">L'adresse exacte avec laquelle la personne se connecte à l'UVCI. Une seule adresse par personne, même si elle cumule plusieurs fonctions.</span></label>`:`<p class="small">Compte : <b class="num" style="overflow-wrap:anywhere">${esc(uid)}</b></p>`}
    <fieldset><legend>Fonctions dans l'organigramme</legend><div id="c_fx"></div><button type="button" class="btn sm" id="c_fadd">+ Ajouter une fonction</button>
      <p class="hint">Chaque fonction donne automatiquement le rôle correspondant dans l'application. Les responsables de commission attribuent des tâches et convoquent des réunions pour leur commission uniquement.</p></fieldset>
    <label class="f" for="c_r">Rôle principal (espace affiché à la connexion)<select id="c_r">${opts(rolesListe.map(([k,r])=>[k,r.l]), c.role)}</select></label>
    <details ${(c.rolesSup||[]).length?"open":""}><summary class="small">Rôles supplémentaires (cumul de fonctions)</summary><div class="checks">${rolesListe.map(([k,r])=>`<label><input type="checkbox" name="c_rs" value="${k}" ${(c.rolesSup||[]).includes(k)?"checked":""}> ${esc(r.l)}</label>`).join("")}</div></details>
    <div class="g2" id="c_tw"><label class="f" for="c_sp">Spécialité (tuteur ou délégué)<select id="c_sp">${opts(SPECS_FORM, c.specialite, "—")}</select></label><label class="f" for="c_nv">Niveau<select id="c_nv">${opts(["Licence 1","Licence 2","Licence 3"], c.niveau)}</select></label></div>
    ${isNew?"":`<label class="row small"><input type="checkbox" id="c_a" ${c.actif!==false?"checked":""}> Accès actif (décocher pour bloquer immédiatement ce compte)</label>`}
    <p class="small" id="c_err" style="color:var(--bad)" role="alert"></p>
    <div class="row"><button class="btn primary" id="c_ok">${isNew?"Ajouter":"Enregistrer"}</button><button class="btn" data-close>Annuler</button></div>`);
  const dessineF = () => {
    $("#c_fx").innerHTML = F.map((f,i)=>`<div class="g2" style="align-items:end"><label class="f">Fonction<select data-fc="${i}">${opts(Object.entries(FONCTIONS).map(([k,x])=>[k,x.t]), f.code, "Choisir…")}</select></label><label class="f">Commission<select data-fm="${i}" ${FONCTIONS[f.code]?.bureau?"disabled":""}>${opts(COMMISSIONS.map(x=>[x[0], comCourt(x[0])]), f.com, "—")}</select></label><button type="button" class="btn sm ghost" data-fdel="${i}">Retirer</button></div>`).join("") || '<p class="small muted">Aucune fonction.</p>';
    $("#c_fx").querySelectorAll("[data-fc]").forEach(s => s.onchange = () => { F[s.dataset.fc].code = s.value; if (FONCTIONS[s.value]?.bureau) F[s.dataset.fc].com = null; dessineF(); });
    $("#c_fx").querySelectorAll("[data-fm]").forEach(s => s.onchange = () => { F[s.dataset.fm].com = s.value || null; });
    $("#c_fx").querySelectorAll("[data-fdel]").forEach(b => b.onclick = () => { F.splice(Number(b.dataset.fdel),1); dessineF(); });
  };
  dessineF();
  $("#c_fadd").onclick = () => { F.push({code:"MEMBRE", com:null}); dessineF(); };
  const upR = () => { const g = ["tuteur","delegue"]; $("#c_tw").hidden = !(g.includes($("#c_r").value) || [...$("#sheet").querySelectorAll('input[name="c_rs"]:checked')].some(i=>g.includes(i.value)) || F.some(f=>["TUTEUR","DELEGUE"].includes(f.code))); };
  $("#c_r").onchange = upR; $("#sheet").querySelectorAll('input[name="c_rs"]').forEach(i=>i.onchange=upR); upR();
  $("#c_ok").onclick = async () => {
    const data = {nom:$("#c_n").value.trim().replace(/\s+/g," "), role:$("#c_r").value, majLe:nowISO()};
    if (!data.nom){ $("#c_err").textContent = "Le nom est obligatoire."; return; }
    const fonctions = [...new Map(F.filter(f=>FONCTIONS[f.code]).map(f=>({code:f.code, com:FONCTIONS[f.code].bureau ? null : (f.com||null), depuis:f.depuis||today()})).map(f=>[f.code+"|"+(f.com||""), f])).values()];
    const manque = fonctions.find(f=>!FONCTIONS[f.code].bureau && ["RESP_COM","MEMBRE","ENCADREMENT"].includes(f.code) && !f.com);
    if (manque){ $("#c_err").textContent = `Indiquez la commission pour la fonction « ${FONCTIONS[manque.code].t} ».`; return; }
    const coches = [...$("#sheet").querySelectorAll('input[name="c_rs"]:checked')].map(i=>i.value);
    const deFonctions = fonctions.map(roleDeFonction).filter(r=>r && r!=="president");
    data.rolesSup = [...new Set([...coches, ...deFonctions])].filter(r=>r!==data.role && ROLES[r]);
    data.fonctions = fonctions;
    data.commissions = [...new Set(fonctions.map(f=>f.com).filter(Boolean))];
    data.commissionsResp = [...new Set(fonctions.filter(f=>f.code==="RESP_COM").map(f=>f.com).filter(Boolean))];
    if (rolesDe(data).some(r=>["tuteur","delegue"].includes(r))){ data.specialite = $("#c_sp").value; data.niveau = $("#c_nv").value; if (!data.specialite){ $("#c_err").textContent = "Indiquez la spécialité et le niveau (tuteur ou délégué)."; return; } }
    const resume = [ROLES[data.role].l, ...data.rolesSup.map(r=>ROLES[r].l)].join(" + ");
    if (!isNew){
      data.actif = $("#c_a").checked;
      if (await write(()=>S.db.doc("users/"+uid).update(data), "Compte mis à jour")){
        audit(data.actif===false && c.actif!==false ? "suspension" : "modification", "compte", uid, {avant:{role:c.role, rolesSup:c.rolesSup||[], fonctions:(c.fonctions||[]).map(titreFonction), actif:c.actif!==false}, apres:{role:data.role, rolesSup:data.rolesSup, fonctions:fonctions.map(titreFonction), actif:data.actif}});
        log("compte", `${data.nom} : ${resume}${data.actif?"":" (accès suspendu)"}`, ["e:"+uid]); closeSheet();
      }
      return;
    }
    const em = $("#c_em").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(em) || !estUVCI(em)){ $("#c_err").textContent = `Saisissez une adresse se terminant par @${DOMAINE()}.`; return; }
    if (S.comptes[em] || em === S.email){ $("#c_err").textContent = "Cette adresse a déjà un accès : modifiez son compte pour lui ajouter une fonction."; return; }
    const homonyme = Object.entries(S.comptes).find(([,x])=>normNom(x.nom)===normNom(data.nom));
    if (homonyme && $("#c_ok").dataset.sure!=="1"){ $("#c_ok").dataset.sure = "1"; $("#c_ok").textContent = "Créer quand même"; $("#c_err").textContent = `${homonyme[1].nom} a déjà un compte (${homonyme[0]}). Une personne = un compte : ajoutez plutôt la fonction sur son compte existant. Touchez « Créer quand même » seulement s'il s'agit d'une autre personne.`; return; }
    if (await write(()=>S.db.doc("users/"+em).set({...data, email:em, actif:true, creeLe:nowISO(), creePar:S.email}), "Personne ajoutée")){
      audit("creation", "compte", em, {nom:data.nom, role:data.role, rolesSup:data.rolesSup, fonctions:fonctions.map(titreFonction)});
      const lien = location.origin + location.pathname;
      const msg = `Bonjour ${data.nom}, votre accès à l'application CVPB Manager est prêt (${fonctions.length ? fonctions.map(titreFonction).join(", ") : ROLES[data.role].l}).\nOuvrez ce lien : ${lien}\nTouchez « Se connecter avec Google UVCI » et choisissez votre compte ${em}.\nPensez à installer l'application sur votre téléphone (menu du navigateur > Installer l'application).`;
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
      S.encaissements.slice().sort((a,b)=>a.num.localeCompare(b.num)).map(e=>[e.num,dFR(e.date),e.matricule,e.nom,e.payeur,e.nature,moisLib(e.mois),e.montant,e.mode,refDe(e)+(e.refOp?" / "+e.refOp:""),e.encaissePar,e.statut,e.motif||"",e.obs||""])));
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
    on("#nfo","onchange",e=>{S.sub.noteForm=e.target.value;S.sub.noteEval="";render();});
    on("#saveNotes","onclick",()=>saveNotes($("#nfo").value, $("#nev").value));
    on("#nev","onchange",e=>{S.sub.noteEval=e.target.value;render();});
    on("#nevNew","onclick",()=>nouvelleEvaluation($("#nfo").value));
    on("#notePub","onclick",e=>publierNotes(e.currentTarget.dataset.code).then(n=>toast(n?`${n} relevé(s) publié(s) dans CVPB Académie`:"Aucune note à publier.")).catch(()=>toast("Publication impossible : vérifiez la connexion et les règles Firebase.")));
  }
  if (v==="admin"){
    on("#newCpt","onclick",()=>formCompte());
    main.querySelectorAll("[data-cpt]").forEach(b=>b.onclick=()=>formCompte(b.dataset.cpt));
    main.querySelectorAll("[data-fiche-etu]").forEach(b=>b.onclick=()=>ficheEtu(b.dataset.ficheEtu));
    main.querySelectorAll("[data-app]").forEach(b=>b.onclick=()=>{ const c = S.comptes[b.dataset.app]||{}; formEtu(null, {nom:c.nom||"", niveau:c.niveau||"Licence 2", specialite:specEtuDe(c.specialite), compte:b.dataset.app, exonere:"mensualites", motifExo:fonctionsTxt(b.dataset.app)}); });
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
    equipe: s('<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>'),
    delegues: s('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.8-4 3.5-6 7-6s6.2 2 7 6"/><path d="m17.5 3 .9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>'),
    taches: s('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 4-4M8 16h8"/>'),
    decisions: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    reunions: s('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.6-3 2.8-4.5 5.5-4.5S12.9 16 13.5 19M10.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/>'),
    organigramme: s('<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2.5" y="16" width="6" height="5" rx="1"/><rect x="15.5" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/>'),
    audit: s('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    menu: s('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')
  };
})();
ICO.programme = ICO.hebdo;
const icoDe = id => ICO[String(id).replace(/^t-/,"")] || ICO[{nouveau:"nouveau", rapports:"registre", notifs:"notifications"}[String(id).replace(/^t-/,"")]] || ICO.menu;
function initiales(n){ return String(n||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase(); }

/* items : [{id, l, n}] ; principaux : identifiants à mettre dans la barre basse */
function navigation(items, courant, principaux){
  $("#tabs").innerHTML = items.map(x=>`<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${esc(x.l)}${x.n?` (${x.n})`:""}</a>`).join("");
  const bn = $("#bnav"); bn.hidden = false;
  const pr = principaux.map(id=>items.find(x=>x.id===id)).filter(Boolean).slice(0,4);
  const court = l => ({"Tableau de bord":"Accueil","Tableau général":"Accueil","Mon espace":"Accueil","Mon tableau de bord":"Accueil","Alertes et notifications":"Alertes","Notifications":"Alertes","Registre des encaissements":"Registre","Suivi des cotisations":"Cotisations","Suivi pédagogique":"Pédagogie","Rapports des tuteurs":"Tutorat","Mes consignes":"Consignes","Nouveau rapport":"Rapport","Mes rapports":"Rapports","Mes dépôts à la caisse":"Dépôts","WhatsApp étudiants":"WhatsApp","Suivi des étudiants":"Suivi","Synthèses et rapports":"Synthèses","Catalogue des formations":"Catalogue","Rapport de la semaine":"Rapport","Mes étudiants":"Étudiants","Journal d'audit":"Audit","Délégués de spécialité":"Délégués","Espace responsables":"Équipe","Programme":"Programme"}[l] || l);
  const lien = x => `<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${icoDe(x.id)}<span>${esc(court(x.l))}</span>${x.n?`<b class="nb">${x.n>99?"99+":x.n}</b>`:""}</a>`;
  const p3 = pr.slice(0,3);
  bn.innerHTML = p3.slice(0,2).map(lien).join("") + `<button type="button" class="fab" id="bFab" aria-label="Actions rapides">${ICO.nouveau}</button>` + (p3[2] ? lien(p3[2]) : "<span></span>")
    + `<button type="button" id="bMenu" ${p3.some(x=>x.id===courant)?"":'aria-current="page"'}>${ICO.menu}<span>Menu</span></button>`;
  $("#bFab").onclick = () => document.body.classList.contains("menu-ouvert") ? closeSheet() : actionsRapides();
  $("#bMenu").onclick = () => {
    openSheet(`<div class="spread"><h2>Menu</h2><button class="btn ghost" data-close>Fermer</button></div>
      <div class="menu">${items.map(x=>`<a href="#${x.id}" ${x.id===courant?'aria-current="page"':""}>${icoDe(x.id)}<span>${esc(x.l)}${x.n?` (${x.n})`:""}</span></a>`).join("")}</div>`);
    volant();
    $("#sheet").querySelectorAll(".menu a").forEach(a => a.addEventListener("click", () => closeSheet()));
  };
  const av = $("#avatar"); if (av && compte()){ av.hidden = false; av.textContent = initiales(compte().nom); }
}
function principauxDe(r){
  return ({
    president:["accueil","synthese","consignes","caisse"], vicepresident:["accueil","synthese","suivi","notifications"], tuteurs:["accueil","programme","suivi","notifications"], accompagnement:["accueil","suivi","messages","consignes"],
    encaissement:["accueil","registre","messages","consignes"], caisse:["accueil","caisse","messages","consignes"],
    tresorerie:["accueil","consignes","cotisations","notifications"], formation:["accueil","programme","pedagogie","catalogue"],
    pedagogie:["accueil","programme","pedagogie","messages"], secretaire:["accueil","suivi","synthese","consignes"],
    tuteur:["t-accueil","t-programme","t-hebdo","t-consignes"],
    delegue:["accueil","delegues","programme","consignes"],
    responsable:["accueil","programme","taches","equipe"], membre:["accueil","programme","taches","equipe"]
  })[r] || ["accueil","taches","consignes","notifications"];
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
    <h2>${fin?3:2}. Suivi pédagogique · CVPB Académie</h2>${KP([[`${p.pres}/${p.total}`,"séances Académie suivies"],[pct(p.assiduite),"assiduité"],[`${p.tut.pres}/${p.tut.total}`,"séances de tutorat"],[p.moyenneGenerale==null?"—":n20(p.moyenneGenerale)+" /20","moyenne générale"]])}
    ${T_(["Formation","#Séances","#Assiduité","#Moyenne /20","Mention","#Rang","Résultat"], Object.entries(p.par).map(([c,x])=>[`${c} · ${nomForm(c)}`,`${x.pres}/${x.total}`,pct(x.assiduite),n20(x.moyenne)+(x.moyenne!=null&&!x.complet?" (prov.)":""),x.mention||"—",x.rang?`${x.rang}/${x.effectif}`:"—",x.valide==null?"En cours":x.valide?"Validée":"Non validée"]), "Aucune séance ni note.")}
    ${Object.entries(p.par).filter(([,x])=>Object.keys(x.notes||{}).length).map(([c,x])=>{ const evs = evalsDe(toutesFormations().find(f=>f.code===c)); return `<h3>Détail des notes · ${esc(c)}</h3>${T_(["Évaluation","Type","#Coef.","#Note /20"], evs.map(e=>[e.libelle, e.type||"", e.coef||1, n20(x.notes[e.id])]))}`; }).join("")}
    ${SIG("Le Responsable Formation","Le Président")}`, `CVPB_fiche_${s.matricule}`);
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
    return `Bonjour ${pr}, la CVPB confirme la réception de votre paiement de ${F(x.montant)} FCFA (${x.nature}${x.mois?` · ${moisLib(x.mois)}`:""}) du ${dFR(x.date)}, par ${x.mode}${x.ref?` (réf. ${x.ref})`:""}. Reçu n° ${x.num}.${x.tranche && e.prochain ? `\nPaiement échelonné : il reste ${F(e.prochain.reste)} FCFA à régler pour ${e.prochain.libelle}.` : ""}\n${situationTxt(e)}\n${signature()}`;
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
const tuteursActifs = () => Object.entries(S.comptes).filter(([,c])=>(c.role==="tuteur" || (c.rolesSup||[]).includes("tuteur")) && c.actif!==false).map(([em,c])=>({em, ...c})).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
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
  const retournes = D.filter(d=>d.statut==="Retourné");
  const actions = D.flatMap(d=>d.actions||[]);
  return {D, ouverts, suivis: new Set(ouverts.map(d=>d.matricule)).size, identifiees: D.length, engagees: actions.length, terminees: actions.filter(a=>a.statut==="Terminée").length,
    nonResolues: ouverts.length, retournes, intervention: D.filter(d=>d.statut==="Intervention requise"), sansAction: ouverts.filter(d=>!(d.actions||[]).length)};
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
  const signales = new Set([...E.difficulte, ...X.ouverts.map(d=>d.matricule)]);
  if (signales.size) add("warn", `${signales.size} étudiant(s) signalé(s) en difficulté`, [...signales].slice(0,5).map(nomEtu).join(", "), ["accompagnement","secretaire","president","tuteurs"], "#suivi");
  if (E.sem && E.valides) add("info", `${E.valides} rapport(s) validé(s) · ${semLib(E.sem)}`, `${E.valides} sur ${E.attendus} attendus`, ["tuteurs","secretaire","president"], "#suivi");
  if (X.retournes.length) add("warn", `${X.retournes.length} signalement(s) retourné(s) pour correction`, X.retournes.map(d=>d.nom).join(", "), ["tuteurs","formation","accompagnement"], "#suivi");
  const seaAttente = S.seances.filter(x=>(x.validation?.statut||"Soumise")==="Soumise").length;
  if (seaAttente) add("info", `${seaAttente} séance(s) en attente de validation`, "Suivi pédagogique · Présences", ["formation"], "#pedagogie");
  const notesAttente = S.notes.filter(n=>n.validation?.statut==="Soumises");
  if (notesAttente.length) add("info", `Notes à valider : ${notesAttente.map(n=>n.id).join(", ")}`, "Suivi pédagogique · Notes", ["formation"], "#pedagogie");
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
const STATUTS_DOS = ["Ouvert","Retourné","En cours","Intervention requise","Résolu","Clos"];
const pillDos = st => `<span class="pill ${st==="Intervention requise"||st==="Retourné"?"bad":st==="Résolu"||st==="Clos"?"ok":st==="En cours"?"":"warn"}">${esc(st)}</span>`;
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
    ${d.statut==="Retourné"?`<div class="banner">Retourné pour correction par ${esc(d.retour?.par||"")} : ${esc(d.retour?.obs||"")}</div>`:""}
    ${d.statut==="Retourné" && d.creeParEmail===S.email?`<label class="f" for="do_df">Difficulté (à compléter)<textarea id="do_df" maxlength="1000">${esc(d.difficulte)}</textarea></label><div class="row"><button class="btn vert" id="do_rs">Compléter et renvoyer</button></div>`:""}
    ${gere||sg?`<label class="f" for="do_o">Observations<textarea id="do_o" maxlength="1000"></textarea></label>`:""}
    <div class="row">
      ${gere&&ouvert&&d.statut==="Ouvert"&&d.creeParEmail&&d.creeParEmail!==S.email?`<button class="btn" id="do_ret">Retourner pour correction</button>`:""}
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
  $("#do_ret") && ($("#do_ret").onclick = () => { if (obs().length<5) return toast("Précisez ce qu'il faut compléter."); maj({statut:"Retourné", retour:{par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:obs()}}, "Signalement retourné à son auteur", "Retourné pour correction", "Retourné", Object.values(S.comptes).filter(c=>c.email===d.creeParEmail && c.uid).map(c=>"u:"+c.uid)); });
  $("#do_rs") && ($("#do_rs").onclick = async () => { const df = $("#do_df").value.trim(); if (df.length<5) return toast("Décrivez la difficulté."); if (await write(() => S.db.doc("dossiers/"+id).update({difficulte:df, statut:"Ouvert", historique: ajoute(d.historique, trace("Signalement complété et renvoyé", "Ouvert", df))}), "Signalement renvoyé")){ log("dossier", `Signalement complété pour ${d.nom}`, ["accompagnement"]); closeSheet(); } });
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
    if (f.st==="ouverts") L = L.filter(d=>!["Résolu","Clos"].includes(d.statut)); else if (f.st==="miens") L = L.filter(d=>d.creeParEmail===S.email); else if (f.st) L = L.filter(d=>d.statut===f.st);
    const peutOuvrir = ["accompagnement","tuteurs","formation"].includes(R) || presidence();
    body = `<div class="kpis">${kpi(X.suivis,"étudiants suivis")}${kpi(X.identifiees,"difficultés identifiées")}${kpi(`${X.terminees}/${X.engagees}`,"actions terminées / engagées","g")}${kpi(X.nonResolues,"situations non résolues", X.intervention.length?"bad":"")}</div>
    <div class="spread"><select id="dfS" aria-label="Statut" style="max-width:260px">${opts([["ouverts","Suivis non résolus"],["miens","Mes signalements"],...STATUTS_DOS.map(s=>[s,s])], f.st, "Tous les suivis")}</select>${peutOuvrir?`<button class="btn primary" id="newDos">${ICO.nouveau} ${R==="accompagnement"||presidence()?"Ouvrir un suivi":"Signaler un étudiant"}</button>`:""}</div>
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
const gereCatalogue = () => role()==="formation" || presidence();
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
    <div class="card"><div class="spread"><h3>Évaluations et coefficients</h3>${gere?`<button class="btn sm" id="fev">Ajouter une évaluation</button>`:""}</div>${(x.evaluations||[]).length?`<div class="plist">${x.evaluations.map((e,i)=>`<div class="prow"><span><b class="small">${esc(e.libelle)}</b> <span class="pill mute">${esc(e.type||"")}</span><br><span class="small muted">Coefficient ${esc(e.coef||1)}${e.date?` · prévue le ${dFR(e.date)}`:""}</span></span>${gere?`<span class="row"><button class="btn sm ghost" data-eved="${i}">Modifier</button><button class="btn sm ghost" data-evdel="${i}" aria-label="Retirer">✕</button></span>`:""}</div>`).join("")}</div><p class="small muted">Somme des coefficients : ${x.evaluations.reduce((a,e)=>a+(Number(e.coef)||1),0)}</p>`:`<div class="empty">Aucune évaluation définie : une seule « Note finale » sera utilisée.</div>`}</div>
    <div class="card"><h3>Apprenants (${apps.length}) · séances (${sea.length})</h3>${apps.length?`<p class="small">${apps.slice(0,40).map(s=>esc(s.nom)).join(", ")}${apps.length>40?"…":""}</p>`:`<div class="empty">Aucun apprenant pour ce niveau.</div>`}</div>
    ${gere||sg?`<label class="f" for="fx_o">${sg?"Observation de contrôle":"Motif (enregistré dans l'historique)"}<textarea id="fx_o" maxlength="800"></textarea></label>`:""}
    <div class="row">${gere?`<button class="btn" id="fed">Modifier</button>${transitions.map(t=>`<button class="btn ${t==="Suspendue"||t==="Archivée"?"danger":t==="Clôturée"?"":"vert"}" data-ft="${t}">${libT[t]}</button>`).join("")}`:""}${sg?`<button class="btn vert" id="fctl">Contrôle administratif</button>`:""}<button class="btn ghost" data-close>Fermer</button></div>
    <details class="card"><summary>Historique (${(x.historique||[]).length})</summary>${histoHTML(x.historique)}</details>`);
  const obs = () => ($("#fx_o")?.value||"").trim();
  const maj = async (data, msg, action, statut, pour) => { if (await write(()=>S.db.doc("formations/"+code).update({...data, majLe:nowISO(), historique: ajoute(x.historique, trace(action, statut||st, obs()))}), msg)){ log("catalogue", `${x.code} : ${action}`, pour||["secretaire"]); closeSheet(); } };
  const formEval = i => { const e = i==null ? {type:"Devoir", coef:1} : x.evaluations[i];
    openSheet(`<h2>${i==null?"Nouvelle évaluation":"Modifier l'évaluation"} · ${esc(code)}</h2><form id="fe" class="form"><label class="f" for="e_l">Intitulé<input type="text" id="e_l" maxlength="60" value="${esc(e.libelle||"")}" placeholder="Ex. : Devoir 1, TP Excel, Examen final"></label>
      <div class="g2"><label class="f" for="e_t">Type<select id="e_t">${opts(TYPES_EVAL, e.type)}</select></label><label class="f" for="e_c">Coefficient<input type="number" id="e_c" min="0.5" max="10" step="0.5" value="${esc(e.coef||1)}"></label></div>
      <label class="f" for="e_d">Date prévue (facultatif)<input type="date" id="e_d" value="${esc(e.date||"")}"></label>
      <div class="row"><button class="btn primary" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-close>Annuler</button></div></form>`);
    $("#fe").onsubmit = async ev => { ev.preventDefault(); const libelle = $("#e_l").value.trim(), coef = Number($("#e_c").value);
      if (libelle.length<2) return toast("Indiquez l'intitulé."); if (!(coef>0 && coef<=10)) return toast("Coefficient entre 0,5 et 10.");
      const L = (x.evaluations||[]).slice(), n = {id: e.id || "EV"+Date.now().toString(36), libelle, type:$("#e_t").value, coef, date:$("#e_d").value||""};
      if (i==null) L.push(n); else L[i] = n;
      if (await write(()=>S.db.doc("formations/"+code).update({evaluations:L, majLe:nowISO(), historique: ajoute(x.historique, trace(`${i==null?"Évaluation ajoutée":"Évaluation modifiée"} : ${libelle} (coef. ${coef})`, st))}), "Évaluation enregistrée")){ log("catalogue", `${code} : évaluation ${libelle} (coef. ${coef})`, ["secretaire","pedagogie"]); closeSheet(); setTimeout(()=>ficheFormation(code), 400); } };
  };
  $("#fev") && ($("#fev").onclick = () => formEval(null));
  $("#sheet").querySelectorAll("[data-eved]").forEach(b => b.onclick = () => formEval(Number(b.dataset.eved)));
  $("#sheet").querySelectorAll("[data-evdel]").forEach(b => confirmBtn(b, "Retirer ?", () => { const i = Number(b.dataset.evdel), e = x.evaluations[i];
    const dejà = Object.keys(notesParEval(S.notes.find(n=>n.id===code))[e.id]||{}).length; if (dejà) return toast(`Impossible : ${dejà} note(s) déjà saisie(s) pour « ${e.libelle} ».`);
    maj({evaluations:x.evaluations.filter((_,k)=>k!==i)}, "Évaluation retirée", `Évaluation retirée : ${e.libelle}`); }));
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
  const act = ok===true ? "v" : ok===false ? "r" : ok;
  const v = Object.values(se.presences||{}).filter(Boolean);
  const titres = {v:"Valider la séance", r:"Retourner la séance", o:"Rouvrir pour rectification", c:"Contrôle du Secrétariat général"};
  openSheet(`<h2>${titres[act]}</h2><p class="small muted">${esc(se.formation)} · ${esc(nomForm(se.formation))} · ${dLong(se.date)} · ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents · pointée par ${esc(se.parNom||"")}</p>
    <label class="f" for="sv_o">${act==="v"||act==="c"?"Observation (facultative)":"Motif (obligatoire)"}<textarea id="sv_o" maxlength="600"></textarea></label>
    <div class="row"><button class="btn ${act==="v"||act==="c"?"vert":"primary"}" id="sv_ok">Confirmer</button>${act!=="c"?`<button class="btn danger" id="sv_sig">Signaler une intervention</button>`:""}<button class="btn ghost" data-close>Annuler</button></div>
    <details class="card"><summary>Historique</summary>${histoHTML(se.historique)}</details>`);
  $("#sv_sig") && ($("#sv_sig").onclick = () => formDossier({priorite:"Haute", statut:"Intervention requise", domaine:"Assiduité", difficulte:$("#sv_o").value.trim(), source:{type:"seance", ref:id, lib:`Séance ${se.formation} du ${dFR(se.date)}`}}));
  $("#sv_ok").onclick = async () => {
    const o = $("#sv_o").value.trim(); if ((act==="r"||act==="o") && o.length<3) return toast("Indiquez le motif.");
    const sig = {par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:o};
    const st = {v:"Validée", r:"Retournée", o:"Retournée"}[act];
    const lib = {v:"Séance validée", r:"Séance retournée pour correction", o:"Séance rouverte pour rectification", c:"Contrôle du Secrétariat général"}[act];
    const data = act==="c" ? {controle:sig} : {validation:{...sig, statut:st}};
    if (await write(()=>S.db.doc("seances/"+id).update({...data, historique: ajoute(se.historique, trace(lib, st || se.validation?.statut || "", o))}), lib)){
      const u = Object.values(S.comptes).find(c=>c.uid===se.par)?.uid; log("seance_val", `Séance ${se.formation} du ${dFR(se.date)} : ${lib.toLowerCase()}${o?` · ${o}`:""}`, act==="c" ? ["formation"] : u?["u:"+u, "secretaire"]:["secretaire"]); closeSheet();
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
  const suivis = new Set([...S.rapportsHebdo.filter(r=>r.semaine===E.sem && r.statut!=="Brouillon").flatMap(r=>r.etudiants||[]), ...X.ouverts.map(d=>d.matricule)]);
  const parDomaine = {}; X.ouverts.forEach(d => { (parDomaine[d.domaine] ||= new Set()).add(d.matricule); });
  const sem7 = addJ(today(), -7), seaS = S.seances.filter(x=>x.date>=sem7), resolus = X.D.filter(d=>["Résolu","Clos"].includes(d.statut)).length;
  const consEnCours = S.consignes.filter(c=>!["Faite","Annulée"].includes(c.statut));
  const difficultes = S.rapportsHebdo.filter(r=>r.semaine===E.sem && (r.difficultes||"").trim().length>2);
  const recos = [
    ...(syn?.recommandations ? [{de:"Secrétariat général", t:syn.recommandations}] : []),
    ...S.rapportsHebdo.filter(r=>r.semaine===E.sem && r.recommandations).map(r=>({de:r.tuteurNom, t:r.recommandations})),
    ...S.rapportsResp.filter(r=>r.statut!=="Complément demandé").sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe))).slice(0,2).map(r=>({de:`${r.auteurNom} (${fonctionDe(r.fonction)})`, t:r.contenu}))
  ].slice(0,5);
  return `<h3>Suivi des étudiants${E.sem?` · ${esc(semLib(E.sem))}`:""}</h3>
  <div class="kpis">${kpi(suivis.size,"étudiants suivis")}${kpi(`${E.soumis} / ${E.attendus}`,"rapports de tuteurs soumis", E.retard?"warn":"g")}${kpi(`${seaS.length} · ${E.soumis}`,"séances (7 j) · rapports de tutorat")}${kpi(difficultes.length + E.difficulte.size,"difficultés signalées", E.difficulte.size?"warn":"")}${kpi(`${resolus} / ${X.D.length}`,"suivis résolus","g")}${(()=>{ const n = X.ouverts.filter(d=>d.statut==="Intervention requise"||d.priorite==="Haute").length; return kpi(n,"situations nécessitant une attention", n?"bad":"g"); })()}${kpi(actions.length + consEnCours.length,"actions restant à exécuter")}${kpi(E.controles,"rapports contrôlés par le SG")}</div>
  <div class="cols">
    <div class="card"><h3>Étudiants accompagnés par domaine</h3>${Object.keys(parDomaine).length?`<div class="plist">${Object.entries(parDomaine).sort((a,b)=>b[1].size-a[1].size).map(([k,v])=>`<div class="prow"><span>${esc(k)}</span><b>${v.size}</b></div>`).join("")}</div>`:`<div class="empty">Aucun accompagnement en cours.</div>`}
      <h3>Situations nécessitant une attention</h3>${X.intervention.length || X.ouverts.some(d=>d.priorite==="Haute")?`<div class="clist">${X.ouverts.filter(d=>d.statut==="Intervention requise"||d.priorite==="Haute").slice(0,4).map(d=>`<button class="citem urg" data-dos="${esc(d.id)}"><span class="t">${esc(d.nom)} ${pillDos(d.statut)}</span><span class="small">${esc(d.difficulte.slice(0,110))}</span></button>`).join("")}</div>`:`<div class="empty">Aucune situation prioritaire.</div>`}</div>
    <div class="card"><div class="spread"><h3>Dernière synthèse du Secrétariat général</h3><a class="btn ghost" href="#synthese">Toutes</a></div>${syn?`<button class="citem" data-syn="${esc(syn.id)}"><span class="t">${esc(semLib(syn.semaine))} ${syn.luLe?"":'<span class="pill warn">Non lue</span>'}${syn.orientations?' <span class="pill ok">Orientations données</span>':""}</span><span class="small">${esc((syn.faits||"").slice(0,180))}</span></button>`:`<div class="empty">Aucune synthèse transmise.</div>`}
      <h3>Recommandations des responsables</h3>${recos.length?`<div class="plist">${recos.map(r=>`<div class="prow"><span class="small"><b>${esc(r.de)}</b><br>${esc(String(r.t).slice(0,180))}${String(r.t).length>180?"…":""}</span></div>`).join("")}</div>`:`<div class="empty">Aucune recommandation transmise.</div>`}
      <h3>Actions restant à exécuter (${actions.length + consEnCours.length})</h3>${actions.length||consEnCours.length?`<div class="plist">${[...consEnCours.slice(0,3).map(c=>`<div class="prow"><span class="small"><b>Consigne</b> · ${esc(c.titre)} → ${esc(c.destNom)}</span><span class="small muted">${dFR(c.echeance)}</span></div>`), ...actions.slice(0,4).map(a=>`<div class="prow"><span class="small"><b>${esc(a.nom)}</b> · ${esc(a.libelle)}</span><span class="small muted">${a.echeance?dFR(a.echeance):""}</span></div>`)].join("")}</div>`:`<div class="empty">Rien en attente.</div>`}</div>
  </div>`;
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
  return `${heroAccueil(`Tuteur · ${codeSp(c.specialite)||""} ${c.niveau||""} · ${mesEtudiantsTuteur().length} étudiant(s)`)}${anneaux()}<div class="row"><a class="btn vert" href="#t-hebdo">${ICO.nouveau} Rapport de la semaine</a></div>
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


/* ======== Design : thème, accueil, anneaux, actions rapides, animations ======== */
function appliquerTheme(){
  let t = "dark"; try { t = localStorage.getItem("cvpb-theme") || "dark"; } catch(e){}
  if (t==="auto") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t==="light" ? "#f5f2f7" : "#0e0812";
}
const skel = () => `<div class="skel" aria-label="Chargement" role="status"><i></i><i></i><i></i></div>`;
function heroAccueil(sousTitre){
  const c = compte(), h = new Date().getHours(), salut = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const prenom = String(c?.nom||"").trim().split(/\s+/)[0] || "";
  const date = new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  return `<section class="hero"><img class="wm" src="icon-512.png" alt=""><div><p>${esc(date.charAt(0).toUpperCase()+date.slice(1))}</p><h2>${salut}, ${esc(prenom)} 👋</h2><p>${esc(sousTitre || ROLES[role()]?.l || "")}</p></div>
    <button class="srch" type="button" data-rech><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Rechercher un étudiant, une formation, un rapport…</button></section>`;
}
function ringHTML(frac, centre, label, violet){
  const r = 34, C = 2*Math.PI*r, f = frac==null || isNaN(frac) ? 0 : Math.max(0, Math.min(1, frac));
  return `<div class="ring ${violet?"v":""}"><div class="c"><svg viewBox="0 0 84 84" aria-hidden="true"><circle class="tr" cx="42" cy="42" r="${r}" fill="none" stroke-width="8"/><circle class="pr" cx="42" cy="42" r="${r}" fill="none" stroke-width="8" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-f)).toFixed(1)}" style="--off:${(C*(1-f)).toFixed(1)};--C:${C.toFixed(1)}"/></svg><b>${esc(centre)}</b></div><span class="l">${esc(label)}</span></div>`;
}
const ratio = (a, b) => b ? a/b : null;
function anneaux(){
  try {
    const r = role(), C = S.C, rr = [];
    const actifs = S.etudiants.filter(s=>s.statut!=="Inactif");
    const assid = (() => { const L = actifs.filter(s=>C.peda[s.matricule]?.assiduite!=null); return L.length ? L.reduce((a,s)=>a+C.peda[s.matricule].assiduite,0)/L.length : null; })();
    const consMois = S.consignes.filter(c=>c.statut!=="Annulée" && dansMois(c.echeance, moisCourant()) && (c.statut==="Faite" || c.echeance < today()));
    const consOk = consMois.filter(c=>c.statut==="Faite" && (c.faitLe||"").slice(0,10)<=c.echeance).length;
    const E = etatSuivi(), X = etatAccomp();
    const add = (num, den, label, violet) => rr.push(ringHTML(ratio(num, den), den ? `${num}/${den}` : "—", label, violet));
    const addP = (f, label, violet) => rr.push(ringHTML(f, f==null ? "—" : Math.round(f*100)+" %", label, violet));
    if (["president","vicepresident"].includes(r)){ add(E.soumis, E.attendus, "rapports des tuteurs"); add(consOk, consMois.length, "consignes à temps (mois)", true); add(actifs.filter(s=>["À jour","Mois en cours","Exonéré"].includes(C.etu[s.matricule]?.situation)).length, actifs.length, "étudiants à jour"); }
    else if (r==="secretaire"){ add(E.soumis, E.attendus, "rapports soumis"); add(S.rapportsHebdo.filter(x=>x.statut==="Contrôlé").length, S.rapportsHebdo.filter(x=>["Validé","Exploité","Contrôlé"].includes(x.statut)).length, "rapports contrôlés", true); add(X.D.filter(d=>["Résolu","Clos"].includes(d.statut)).length, X.D.length, "suivis résolus"); }
    else if (r==="tuteurs"){ add(E.soumis, E.attendus, "rapports soumis"); add(E.valides, E.soumis, "rapports validés", true); add(E.affectes, actifs.filter(s=>s.academie).length, "étudiants affectés"); }
    else if (r==="accompagnement"){ add(X.terminees, X.engagees, "actions terminées"); add(X.D.filter(d=>["Résolu","Clos"].includes(d.statut)).length, X.D.length, "suivis résolus", true); add(S.rapportsHebdo.filter(x=>["Exploité","Contrôlé"].includes(x.statut)).length, S.rapportsHebdo.filter(x=>["Validé","Exploité","Contrôlé"].includes(x.statut)).length, "rapports exploités"); }
    else if (["encaissement","caisse","tresorerie"].includes(r)){ add(actifs.filter(s=>C.etu[s.matricule]?.inscOk).length, actifs.length, "inscriptions soldées"); add(actifs.filter(s=>["À jour","Mois en cours","Exonéré"].includes(C.etu[s.matricule]?.situation)).length, actifs.length, "étudiants à jour", true); add(S.depots.filter(d=>d.statut==="Validé").length, S.depots.filter(d=>d.statut!=="Annulé").length, "dépôts validés"); }
    else if (r==="formation"){ add(S.seances.filter(x=>x.validation?.statut==="Validée").length, S.seances.length, "séances validées"); addP(assid, "assiduité moyenne", true); const act = S.formations.filter(f=>["Ouverte","En cours"].includes(f.statut)); add(act.filter(f=>(f.formateurs||[]).length).length, act.length, "formations avec formateur"); }
    else if (r==="pedagogie"){ const mes = S.seances; add(mes.filter(x=>x.validation?.statut==="Validée").length, mes.length, "séances validées"); addP(assid, "assiduité moyenne", true); add(S.formations.filter(f=>["Ouverte","En cours"].includes(f.statut)).length, S.formations.length, "formations actives"); }
    else if (r==="tuteur"){ const mes = S.rapportsHebdo.filter(x=>x.tuteurEmail===S.email && x.statut!=="Brouillon"), dues = semainesDues(); add(dues.filter(s=>mes.some(x=>x.semaine===s)).length, dues.length, "semaines rendues"); add(mes.filter(x=>["Validé","Exploité","Contrôlé"].includes(x.statut)).length, mes.length, "rapports validés", true); const pres = mes.reduce((a,x)=>{ const n = Number(x.nbSeances)||0; Object.values(x.presences||{}).forEach(v=>{ a.p+=Number(v)||0; a.t+=n; }); return a; },{p:0,t:0}); addP(ratio(pres.p, pres.t), "présence de mes étudiants"); }
    return rr.length ? `<div class="rings">${rr.join("")}</div>` : "";
  } catch(e){ console.error(e); return ""; }
}
/* Menu volant : le panneau flotte au-dessus de la barre, ses boutons jaillissent un à un */
function volant(){ $("#sheet").classList.add("flot"); document.body.classList.add("menu-ouvert"); $("#sheet").querySelectorAll(".actions button,.menu a").forEach((b,i)=>b.style.setProperty("--k", i)); }
let dernierY = 0;
addEventListener("scroll", () => { const y = scrollY, bn = $("#bnav"); if (!bn || Math.abs(y - dernierY) < 10) return; bn.classList.toggle("cache", y > dernierY && y > 160 && innerHeight + y < document.documentElement.scrollHeight - 40); dernierY = y; }, {passive:true});
function actionsRapides(){
  const r = role(), go = h => () => { closeSheet(); location.hash = h; };
  const A = [
    can("enc.saisir") && ["Nouvel encaissement", ICO.registre, () => formEnc()],
    can("etu.gerer") && ["Nouvel étudiant", ICO.etudiants, () => formEtu()],
    can("depot.declarer") && ["Déclarer un dépôt", ICO.depots, () => formDepot()],
    can("op.saisir") && ["Entrée ou sortie de caisse", ICO.caisse, () => formOp()],
    can("peda.saisir") && ["Pointer une séance", ICO.pedagogie, () => formSeance()],
    r==="formation" && ["Nouvelle formation", ICO.catalogue, () => formFormation()],
    presidence() && ["Donner une consigne", ICO.consignes, () => formConsigne()],
    estDelegue() && !presidence() && ["Demande de cours", ICO.delegues, () => formDemandeCours("demande")],
    estDelegue() && !presidence() && ["Déposer un cours à expliquer", ICO.catalogue, () => formDemandeCours("cours")],
    estDelegue() && !presidence() && ["Rapport de la semaine", ICO.hebdo, () => formRapportDelegue()],
    presidence() && ["Nouvelle décision", ICO.decisions, () => formDecision()],
    jeSuisEquipe() && ["Mon rapport de la semaine", ICO.equipe, () => { S.sub.equipe = "rapport"; location.hash = "equipe"; }],
    peutCreerTache() && ["Attribuer une tâche", ICO.taches, () => formTache()],
    peutConvoquer() && ["Programmer une réunion", ICO.reunions, () => formReunion()],
    r==="tuteur" && ["Rapport de la semaine", ICO.hebdo, go("t-hebdo")],
    r==="tuteurs" && ["Rapports à valider", ICO.suivi, go("suivi")],
    ["accompagnement","tuteurs","formation"].includes(r) && ["Ouvrir un suivi", ICO.suivi, () => formDossier(r==="accompagnement" ? {} : {priorite:"Haute"})],
    r==="secretaire" && ["Préparer la synthèse", ICO.synthese, () => formSynthese()],
    ["formation","tuteurs","accompagnement"].includes(r) && ["Transmettre un rapport", ICO.synthese, () => formRapportResp()],
    domainesMsg().length && !LECTURE_TOTALE.includes(r) && ["Message WhatsApp", ICO.messages, () => formMessage("")],
    ["Rechercher", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`, () => rechercheGlobale()]
  ].filter(Boolean);
  openSheet(`<div class="spread"><h2>Actions rapides</h2><button class="btn ghost" data-close>Fermer</button></div><div class="actions">${A.map((a,i)=>`<button type="button" data-ar="${i}">${a[1]}<span>${esc(a[0])}</span></button>`).join("")}</div>`);
  volant();
  $("#sheet").querySelectorAll("[data-ar]").forEach(b => b.onclick = () => { const f = A[Number(b.dataset.ar)][2]; closeSheet(); setTimeout(f, 60); });
}
/* Après chaque rendu : animations à l'arrivée sur une page seulement (pas à chaque mise à jour en direct) */
function finRendu(){
  const sp = $("#splash"); if (sp && S.authPret && !sp.classList.contains("out") && (!S.uid || S.loaded.params || S.loaded.moi && !compte())){ sp.classList.add("out"); setTimeout(()=>sp.remove(), 600); }
  const main = $("#main"), cle = location.hash + "|" + (S.uid||"") + "|" + (S.loaded.params?1:0);
  main.querySelectorAll("[data-rech]").forEach(b => b.onclick = rechercheGlobale);
  if (cle === S.derniereVue) return;
  S.derniereVue = cle;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  [...main.children].forEach((c,i)=>c.style.setProperty("--i", Math.min(i, 10)));
  main.querySelectorAll(".kpis,.rings,.clist").forEach(g => [...g.children].forEach((c,j)=>c.style.setProperty("--j", Math.min(j, 8))));
  main.classList.remove("anim"); void main.offsetWidth; main.classList.add("anim");
  clearTimeout(finRendu.t); finRendu.t = setTimeout(()=>main.classList.remove("anim"), 1400);
  /* anneaux : tracé progressif ; chiffres clés : comptage */
  main.querySelectorAll(".ring .pr").forEach(c => { const off = c.getAttribute("stroke-dashoffset"); c.style.transition = "none"; c.setAttribute("stroke-dashoffset", c.getAttribute("stroke-dasharray")); requestAnimationFrame(()=>requestAnimationFrame(()=>{ c.style.transition = ""; c.setAttribute("stroke-dashoffset", off); })); });
  main.querySelectorAll(".kpi .v").forEach(el => {
    const t = el.textContent.trim(), m = t.match(/^(-?)([\d\s  ]+)(\s?%)?$/); if (!m) return;
    const fin = Number(m[2].replace(/\D/g,"")); if (!(fin > 0) || fin > 10000000) return;
    const t0 = performance.now(), d = 700, fmt = n => m[1] + Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g," ") + (m[3]||"");
    const pas = now => { const k = Math.min(1, (now - t0)/d), e = 1 - Math.pow(1-k, 3); el.textContent = fmt(fin*e); if (k < 1) requestAnimationFrame(pas); else el.textContent = t; };
    requestAnimationFrame(pas);
  });
}
setTimeout(() => { const sp = $("#splash"); if (sp){ sp.classList.add("out"); setTimeout(()=>sp.remove(), 600); } }, 6000);


/* v22 : le formateur affecté (ou le Responsable Formation) ajoute une évaluation : devoir, TP, séance pratique, autre… */
function nouvelleEvaluation(code){
  const x = S.formations.find(f=>f.code===code); if (!x) return toast("Formation introuvable dans le catalogue.");
  openSheet(`<h2>Nouvelle évaluation · ${esc(code)}</h2><p class="small muted">${esc(x.intitule)}</p><form id="fne" class="form">
    <label class="f" for="ne_l">Intitulé<input type="text" id="ne_l" maxlength="60" placeholder="Ex. : TP Excel n°2, Séance pratique Canva, Exposé"></label>
    <div class="g2"><label class="f" for="ne_t">Type<select id="ne_t">${opts(TYPES_EVAL, "Travaux pratiques")}</select></label><label class="f" for="ne_c">Coefficient<input type="number" id="ne_c" min="0.5" max="10" step="0.5" value="1"></label></div>
    <label class="f" for="ne_d">Date (facultatif)<input type="date" id="ne_d" value="${today()}"></label>
    <p class="small muted">Les notes sont sur 20. Après saisie, elles sont soumises au Responsable Formation ; une fois validées, chaque apprenant les voit dans son espace CVPB Académie.</p>
    <div class="row"><button class="btn primary" type="submit">Créer l'évaluation</button><button class="btn ghost" type="button" data-close>Annuler</button></div></form>`);
  $("#fne").onsubmit = async ev => { ev.preventDefault();
    const libelle = $("#ne_l").value.trim(), coef = Number($("#ne_c").value), type = $("#ne_t").value;
    if (libelle.length<2) return toast("Indiquez l'intitulé."); if (!(coef>0 && coef<=10)) return toast("Coefficient entre 0,5 et 10.");
    if ((x.evaluations||[]).some(e=>normNom(e.libelle)===normNom(libelle))) return toast("Une évaluation porte déjà cet intitulé.");
    const n = {id:"EV"+Date.now().toString(36), libelle, type, coef, date:$("#ne_d").value||"", creePar:compte().nom};
    if (await write(()=>S.db.doc("formations/"+code).update({evaluations:[...(x.evaluations||[]), n], majLe:nowISO(), historique: ajoute(x.historique, trace(`Évaluation ajoutée par ${compte().nom} : ${libelle} (${type}, coef. ${coef})`, x.statut||"Ouverte"))}), "Évaluation créée")){
      log("catalogue", `${code} : évaluation ${libelle} (${type}, coef. ${coef})`, ["formation"]); S.sub.noteForm = code; S.sub.noteEval = n.id; closeSheet(); render(); }
  };
}
/* v22 : publication des notes validées vers l'espace CVPB Académie : une fiche par apprenant (il ne voit que la sienne) */
async function publierNotes(code, retirer){
  const FX = toutesFormations().find(f=>f.code===code), evs = evalsDe(FX), PE = notesParEval(S.notes.find(n=>n.id===code));
  const mats = new Set(Object.values(PE).flatMap(m=>Object.keys(m)));
  const ops = [...mats].map(mat => { const f = S.C.peda[mat]?.par?.[code] || {}, s = etuBy(mat) || {};
    return {path:`notes_eleves/${code}_${mat}`, data: retirer ? {matricule:mat, formation:code, retire:true, majLe:nowISO()} : {
      matricule:mat, nom:s.nom||"", formation:code, intitule:FX?.intitule||code, niveau:FX?.niveau||"",
      evals: evs.map(e=>({id:e.id, libelle:e.libelle, type:e.type||"", coef:Number(e.coef)||1, date:e.date||"", note:(PE[e.id]||{})[mat] ?? null})).filter(e=>e.note!=null),
      moyenne:f.moyenne ?? null, complet:!!f.complet, mention:f.mention||"", rang:f.rang||null, effectif:f.effectif||null, valide:f.valide ?? null,
      retire:false, publieLe:nowISO(), publiePar:compte().nom}}; });
  if (!ops.length) return 0;
  await S.db.lots(ops); return ops.length;
}
/* Notes : validation par le Responsable Formation ; les messages aux étudiants partent après validation */
function decisionNotes(code, act){
  const ND = S.notes.find(n=>n.id===code); if (!ND) return;
  const titres = {v:"Valider les notes", r:"Retourner les notes au formateur", o:"Rouvrir pour rectification", c:"Contrôle du Secrétariat général"};
  openSheet(`<h2>${titres[act]}</h2><p class="small muted">${esc(code)} · ${esc(nomForm(code))} · ${Object.values(notesParEval(ND)).reduce((a,m)=>a+Object.keys(m).length,0)} note(s) saisie(s)</p>
    <label class="f" for="nd_o">${act==="v"||act==="c"?"Observation (facultative)":"Motif (obligatoire)"}<textarea id="nd_o" maxlength="600"></textarea></label>
    <div class="row"><button class="btn ${act==="v"||act==="c"?"vert":"primary"}" id="nd_ok">Confirmer</button><button class="btn ghost" data-close>Annuler</button></div>`);
  $("#nd_ok").onclick = async () => {
    const o = $("#nd_o").value.trim(); if ((act==="r"||act==="o") && o.length<3) return toast("Indiquez le motif.");
    const sig = {par:compte().nom, fonction:fonctionDe(role()), le:nowISO(), obs:o};
    const data = act==="c" ? {controle:sig} : {validation:{...sig, statut: act==="v" ? "Validées" : "Retournées"}};
    const lib = {v:"Notes validées", r:"Notes retournées pour correction", o:"Notes rouvertes pour rectification", c:"Contrôle du Secrétariat général"}[act];
    if (await write(()=>S.db.doc("notes/"+code).update({...data, historique: ajoute(ND.historique, trace(lib, act==="c" ? (ND.validation?.statut||"") : data.validation.statut, o))}), lib)){
      log("notes", `${code} : ${lib.toLowerCase()}${o?` · ${o}`:""}`, act==="c" ? ["formation"] : ["secretaire","pedagogie"]);
      if (act==="v" || act==="o") publierNotes(code, act==="o").then(n => n && toast(act==="v" ? `${n} relevé(s) de notes publié(s) dans CVPB Académie` : "Notes retirées de CVPB Académie pendant la rectification")).catch(()=>toast("Notes validées, mais la publication vers CVPB Académie a échoué : réessayez « Valider ». "));
      if (act==="v"){ const L = Object.entries(S.C.peda).filter(([,p])=>p.par[code]?.moyenne!=null).map(([k,p])=>({matricule:k, ref:`${code}|${n20(p.par[code].moyenne)}`})); preparerMessages("note", L).then(M => M.length && toast(`${M.length} message(s) de note préparé(s) dans « WhatsApp étudiants »`)); }
      closeSheet();
    }
  };
}

/* ======== Données en direct ======== */
/* =====================================================================
   GOUVERNANCE — Cahier des charges 2026-2027, phases 1 et 2
   Organigramme, fonctions multiples (un seul compte), commissions,
   décisions de la présidence, tâches, réunions, journal d'audit.
   ===================================================================== */
const COMMISSIONS = [
  ["FORMATION","Formation, Projets et Accompagnement Académique — CVPB Académie"],
  ["COMMUNICATION","Communication"],
  ["CAISSE","Caisse et Encadrement Financier"],
  ["TUTORAT","Tutorat"],
  ["LOGISTIQUE","Organisation et Logistique"],
  ["SOCIAL","Affaires Sociales"]
];
const comNom = c => c ? ((COMMISSIONS.find(x=>x[0]===c)||[])[1] || c) : "Bureau";
const comCourt = c => c ? comNom(c).split(" — ")[0].replace("Formation, Projets et Accompagnement Académique","Formation") : "Bureau";
/* Fonctions de l'organigramme et rôle qu'elles confèrent dans l'application */
const FONCTIONS = {
  PRESIDENT:{t:"Président", r:"president", rang:1, bureau:true},
  VICE_PRESIDENT:{t:"Vice-président", r:"vicepresident", rang:2, bureau:true},
  SG1:{t:"Secrétaire général 1 — Coordination générale", r:"secretaire", rang:3, bureau:true},
  SG2:{t:"Secrétaire général 2 — Supervision et suivi", r:"secretaire", rang:4, bureau:true},
  SG3:{t:"Secrétaire général 3 — Opérations et vie communautaire", r:"secretaire", rang:5, bureau:true},
  RESP_SUIVI:{t:"Responsable Suivi et Accompagnement", r:"accompagnement", rang:8, bureau:true},
  RESP_COM:{t:"Responsable", resp:true, rang:10},
  ENCADREMENT:{t:"Encadrement", r:"membre", rang:20},
  MEMBRE:{t:"Membre d'équipe", r:"membre", rang:21},
  FORMATEUR:{t:"Formateur de l'Académie", r:"pedagogie", rang:30},
  DELEGUE:{t:"Délégué de spécialité", r:"delegue", rang:32},
  TUTEUR:{t:"Tuteur", r:"tuteur", rang:31}
};
const roleDeFonction = f => f.code==="RESP_COM" ? ({FORMATION:"formation", TUTORAT:"tuteurs", CAISSE:"caisse"}[f.com] || "responsable") : FONCTIONS[f.code]?.r;
const titreFonction = f => (FONCTIONS[f.code]?.t || f.code) + (f.code==="RESP_COM" && f.com==="TUTORAT" ? " des Tuteurs" : "") + (f.com && !FONCTIONS[f.code]?.bureau ? " — " + comCourt(f.com) : "");
/* Organigramme transmis dans le cahier des charges (noms à confirmer avant l'ouverture des comptes) */
const ORGA_CDC = [
  ["Zak","PRESIDENT",null],["Kossonou Abo Henaï","VICE_PRESIDENT",null],
  ["KONAN Jean Nathanaël","SG1",null],["Koadoha Koffi Jonathan","SG2",null],["Ko Nadre Evan","SG3",null],
  ["KOFFI Boris","RESP_COM","FORMATION"],["Kadjo Christ","MEMBRE","FORMATION"],["Bilé Yann Eddy","MEMBRE","FORMATION"],
  ["OUEDRAOGO Ibrahim","RESP_COM","COMMUNICATION"],["KONAN Candy","MEMBRE","COMMUNICATION"],["Yao Adjoua","MEMBRE","COMMUNICATION"],["N'Zi Yao Emmanuel","MEMBRE","COMMUNICATION"],
  ["Gaëlle Alingué","RESP_COM","CAISSE"],["Sebré Hanifa","ENCADREMENT","CAISSE"],
  ["Dadzie Crédot","RESP_COM","TUTORAT"],["Yamyaogo Inoussa","RESP_COM","TUTORAT"],
  ["Boli Bi Junior","RESP_COM","LOGISTIQUE"],["OUATTARA Abdoul Aziz","RESP_COM","LOGISTIQUE"],
  ["Assandé Anne","RESP_COM","SOCIAL"],["Sylla Salimata","RESP_COM","SOCIAL"],["Koné Ramatoulaye","RESP_COM","SOCIAL"]
];

/* ---- Droits cumulés (tous les rôles de la personne, comme les règles du serveur) ---- */
const tousMesRoles = () => { const c = compte(); if (!c) return []; return presidence() ? ["president"] : rolesDe(c); };
const aRole = (...l) => presidence() || tousMesRoles().some(r=>l.includes(r));
const gouvSup = () => aRole("vicepresident","secretaire");          // voit toutes les décisions, tâches et réunions
const pilote = () => aRole("secretaire");                           // attribue à tous, convoque toute réunion (Présidence incluse)
const mesComs = () => compte()?.commissions || [];
const mesComsResp = () => compte()?.commissionsResp || [];
const membresDe = com => Object.entries(S.comptes).filter(([,c])=>c.actif!==false && (c.commissions||[]).includes(com)).map(([em,c])=>({em, ...c})).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
const actifsTous = () => Object.entries(S.comptes).filter(([,c])=>c.actif!==false).map(([em,c])=>({em, ...c})).sort((a,b)=>String(a.nom).localeCompare(String(b.nom),"fr"));
const nomDe = em => S.comptes[em]?.nom || em;
const ek = em => String(em).replace(/[.@]/g,"_");
const gid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const dtFR = s => s ? new Date(s).toLocaleString("fr-FR",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
const notifier = (emails, texte, action) => { const L = [...new Set((emails||[]).filter(e=>e && e!==S.email))]; log(action||"gouvernance", texte, [...L.map(e=>"e:"+e), "secretaire"]); };

/* Journal d'audit : ajouts seulement, aucune modification ni suppression possible (règles du serveur) */
function audit(action, objet, ref, details){
  if (!S.db || !S.uid) return;
  S.db.doc("audit/"+gid("A")).set({le:nowISO(), par:S.uid, parEmail:S.email, parNom:compte()?.nom||"", role:role(), action, objet, ref:ref||null, details:details||null}).catch(()=>{});
}

/* ---------------------------- Organigramme ---------------------------- */
function vOrganigramme(){
  const L = actifsTous().flatMap(c => ((c.fonctions||[]).length ? c.fonctions : c.role==="president" ? [{code:"PRESIDENT", com:null}] : []).map(f => ({...f, em:c.em, nom:c.nom, connecte:!!c.uid || c.role==="president"})));
  /* Une seule ligne par personne et par bloc, même si elle cumule plusieurs fonctions */
  const regrouper = X => { const m = new Map(); for (const x of X){ const g = m.get(x.em) || {...x, titres:[], rang:99}; const t = titreFonction(x); if (!g.titres.includes(t)) g.titres.push(t); g.rang = Math.min(g.rang, FONCTIONS[x.code]?.rang||99); m.set(x.em, g); } return [...m.values()].sort((a,b)=>a.rang-b.rang || a.nom.localeCompare(b.nom,"fr")); };
  const carte = x => `<div class="prow"><span><b>${esc(x.nom)}</b><br><span class="small muted">${esc(x.titres.join(" · "))}</span></span>${x.connecte?"":'<span class="pill warn">Jamais connecté</span>'}</div>`;
  const bureau = regrouper(L.filter(x=>FONCTIONS[x.code]?.bureau));
  let cdc = "";
  if (presidence()){
    const noms = new Map(Object.entries(S.comptes).map(([em,c])=>[normNom(c.nom), em]));
    noms.set(normNom("Zak"), S.email);
    const restants = ORGA_CDC.map((x,i)=>[...x,i]).filter(([n])=>!noms.has(normNom(n)));
    /* Comptes en double : même nom sous deux adresses différentes */
    const parNom = {}; for (const [em,c] of Object.entries(S.comptes)) (parNom[normNom(c.nom)] ||= []).push(em);
    const doubles = Object.values(parNom).filter(v=>v.length>1);
    cdc = (doubles.length ? `<div class="banner"><b>Comptes en double possibles</b> : ${doubles.map(v=>esc(v.map(em=>`${S.comptes[em].nom} (${em})`).join(" = "))).join(" · ")}. Gardez une seule adresse par personne et suspendez l'autre dans Administration › Comptes.</div>` : "")
      + (restants.length ? `<details class="card" open><summary><b>Comptes à ouvrir</b> · ${ORGA_CDC.length-restants.length}/${ORGA_CDC.length} déjà ouverts</summary>
      <p class="small muted">Noms repris du cahier des charges 2026-2027, à confirmer. Touchez « Ouvrir » pour créer le compte avec sa fonction : il ne reste qu'à saisir l'adresse UVCI. Si la personne a déjà un compte sous un autre nom, ajoutez-lui plutôt la fonction depuis Administration › Comptes.</p>
      ${restants.map(([n,code,com,i])=>`<div class="prow"><span><b>${esc(n)}</b><br><span class="small muted">${esc(titreFonction({code,com}))}</span></span><button class="btn sm" data-orga="${i}">Ouvrir</button></div>`).join("")}</details>` : "");
  }
  return `<div class="spread"><div><h2>Organigramme ${esc(P().annee||"")}</h2><p class="small muted">Fonctions actives. Une personne peut cumuler plusieurs fonctions avec un seul compte.</p></div></div>
    ${cdc}
    <div class="card"><h3>Bureau exécutif</h3>${bureau.map(carte).join("") || '<div class="empty">Aucune fonction de bureau renseignée. La Présidence les attribue dans Administration › Comptes.</div>'}</div>
    <div class="cards2">${COMMISSIONS.map(([code]) => { const M = regrouper(L.filter(x=>x.com===code && !FONCTIONS[x.code]?.bureau)).map(x=>({...x, titres:x.titres.map(t=>t.replace(" — "+comCourt(code),""))})); return `<div class="card"><h3>${esc(comNom(code))}</h3>${M.map(carte).join("") || '<p class="small muted">Titulaires à nommer.</p>'}</div>`; }).join("")}</div>`;
}
function bindOrganigramme(){
  $("#main").querySelectorAll("[data-orga]").forEach(b => b.onclick = () => { const [nom, code, com] = ORGA_CDC[Number(b.dataset.orga)]; formCompte(null, {nom, fonctions:[{code, com}]}); });
}

/* ------------------------------ Décisions ------------------------------ */
const DEC_ST = ["Brouillon","Émise","Examen SG","Confiée","En cours","Exécutée","Suspendue","Annulée"];
const DEC_OUVERTES = ["Émise","Examen SG","Confiée","En cours","Suspendue"];
const EXEC_ST = ["À démarrer","En cours","Bloquée","Terminée"];
const clsSt = s => ({"Exécutée":"ok","Terminée":"ok","Tenue":"ok","Présent":"ok","Annulée":"mute","Brouillon":"mute","Bloquée":"bad","Suspendue":"warn","Reportée":"warn","Absent":"bad","Excusé":"warn","Urgente":"bad","Haute":"warn"}[s] || "");
const decRetard = d => d.echeance && d.echeance < today() && DEC_OUVERTES.includes(d.statut);
const mesDecisions = () => S.decisions.filter(d => (d.executants||[]).includes(S.email) && d.statut!=="Brouillon");

function vDecisions(){
  const f = S.decf ||= {st:"ouvertes"};
  let L = (gouvSup() ? S.decisions : mesDecisions()).slice().sort((a,b)=>String(b.ref).localeCompare(String(a.ref)));
  const ouv = L.filter(d=>DEC_OUVERTES.includes(d.statut)), ret = L.filter(decRetard);
  if (f.st==="ouvertes") L = L.filter(d=>DEC_OUVERTES.includes(d.statut) || d.statut==="Brouillon");
  else if (f.st==="retard") L = L.filter(decRetard);
  else if (f.st) L = L.filter(d=>d.statut===f.st);
  return `<div class="spread"><div><h2>Décisions de la Présidence</h2><p class="small muted">${gouvSup()?"Le Secrétariat général examine la formalisation, formule des observations et suit l'exécution, sans droit de veto.":"Les décisions dont vous êtes responsable d'exécution."}</p></div>${presidence()?`<button class="btn primary" id="newDec">${ICO.nouveau} Nouvelle décision</button>`:""}</div>
  <div class="kpis">${kpi(ouv.length,"en cours d'exécution")}${kpi(ret.length,"échéance dépassée",ret.length?"bad":"g")}${kpi(L.filter(d=>["Émise","Examen SG"].includes(d.statut)).length,"sans responsable")}${kpi(S.decisions.filter(d=>d.statut==="Exécutée").length,"exécutées","g")}</div>
  <div class="filters"><select id="decf">${opts([["ouvertes","À suivre"],["retard","Échéance dépassée"],["","Toutes"],...DEC_ST.map(s=>[s,s])], f.st)}</select><span></span></div>
  ${L.length?`<div class="clist">${L.map(d=>{ const me = d.exec?.[ek(S.email)]; return `<button class="citem ${decRetard(d)?"late":""} ${d.statut==="Exécutée"?"done":""}" data-dec="${esc(d.id)}">
    <span class="t"><b>${esc(d.ref)}</b> · ${esc(d.titre)}</span>
    <span class="m"><span class="pill ${clsSt(d.statut)}">${esc(d.statut)}</span>${d.priorite!=="Normale"?`<span class="pill ${clsSt(d.priorite)}">${esc(d.priorite)}</span>`:""}<span>Échéance ${dFR(d.echeance)}</span>${(d.executants||[]).length?`<span>→ ${esc(d.executants.map(nomDe).join(", "))}</span>`:""}${me?`<span class="pill ${clsSt(me.statut)}">Ma part : ${esc(me.statut)}</span>`:""}</span></button>`; }).join("")}</div>`:`<div class="empty">Aucune décision pour ce filtre.</div>`}`;
}
function bindDecisions(){
  $("#newDec") && ($("#newDec").onclick = () => formDecision());
  $("#decf") && ($("#decf").onchange = e => { S.decf.st = e.target.value; render(); });
  $("#main").querySelectorAll("[data-dec]").forEach(b => b.onclick = () => ficheDecision(b.dataset.dec));
}
function formDecision(d, prefill){
  const isNew = !d; d = d || {priorite:"Normale", date:today(), ...(prefill||{})};
  openSheet(`<h2>${isNew?"Nouvelle décision":"Modifier "+esc(d.ref)}</h2>
    <label class="f" for="d_t">Objet<input type="text" id="d_t" maxlength="150" value="${esc(d.titre)}"></label>
    <label class="f" for="d_x">Description<textarea id="d_x" maxlength="3000" placeholder="Ce qui est décidé, le résultat attendu, les moyens.">${esc(d.description)}</textarea></label>
    <div class="g2"><label class="f" for="d_d">Date<input type="date" id="d_d" value="${esc(d.date)}"></label><label class="f" for="d_e">Échéance<input type="date" id="d_e" value="${esc(d.echeance||"")}"></label></div>
    <label class="f" for="d_p">Priorité<select id="d_p">${opts(["Basse","Normale","Haute","Urgente"], d.priorite)}</select></label>
    ${d.reunion?`<p class="small muted">Décision issue de la réunion « ${esc(d.reunionTitre||"")} ».</p>`:""}
    <p class="hint">La décision est d'abord enregistrée en brouillon. Vous l'émettez, puis vous désignez les responsables d'exécution.</p>
    <div class="row"><button class="btn primary" id="d_ok">Enregistrer</button><button class="btn" data-close>Annuler</button></div>`);
  $("#d_ok").onclick = async () => {
    const data = {titre:$("#d_t").value.trim(), description:$("#d_x").value.trim(), date:$("#d_d").value||today(), echeance:$("#d_e").value||"", priorite:$("#d_p").value};
    if (!data.titre || !data.description) return toast("L'objet et la description sont obligatoires.");
    if (data.echeance && data.echeance < data.date) return toast("L'échéance ne peut pas précéder la date de la décision.");
    if (isNew){
      const an = data.date.slice(0,4), n = S.decisions.filter(x=>String(x.ref).startsWith(`DEC-${an}-`)).reduce((m,x)=>Math.max(m, parseInt(String(x.ref).split("-")[2],10)||0),0) + 1;
      const ref = `DEC-${an}-${String(n).padStart(3,"0")}`, id = ref;
      const doc = {...data, ref, statut:"Brouillon", executants:[], exec:{}, observations:[], reunion:d.reunion||null, reunionTitre:d.reunionTitre||null, creePar:S.email, creeParNom:compte().nom, creeLe:nowISO(), historique:[trace("Création","Brouillon")]};
      if (await write(()=>S.db.doc("decisions/"+id).set(doc), `Décision ${ref} enregistrée en brouillon`)){ audit("creation","decision",ref,{titre:data.titre}); closeSheet(); setTimeout(()=>ficheDecision(id), 300); }
    } else if (await write(()=>S.db.doc("decisions/"+d.id).update({...data, historique:ajoute(d.historique, trace("Modification", d.statut))}), "Décision modifiée")){ audit("modification","decision",d.ref,data); closeSheet(); }
  };
}
function ficheDecision(id){
  const d = S.decisions.find(x=>x.id===id); if (!d) return toast("Décision introuvable.");
  const pres = presidence(), sg = aRole("secretaire") && !pres, moi = (d.executants||[]).includes(S.email), me = d.exec?.[ek(S.email)];
  const actions = [];
  if (pres){
    if (d.statut==="Brouillon") actions.push(`<button class="btn" id="dEdit">Modifier</button><button class="btn primary" data-dst="Émise">Émettre</button>`);
    if (["Émise","Examen SG","Confiée","En cours","Suspendue"].includes(d.statut)) actions.push(`<button class="btn primary" id="dAss">Désigner les responsables</button>`);
    if (["Confiée","En cours"].includes(d.statut)) actions.push(`<button class="btn vert" data-dst="Exécutée">Clore : exécutée</button>`);
    if (d.statut==="Suspendue") actions.push(`<button class="btn" data-dst="${(d.executants||[]).length?"Confiée":"Émise"}">Reprendre</button>`);
    if (DEC_OUVERTES.includes(d.statut) && d.statut!=="Suspendue") actions.push(`<button class="btn" data-dst="Suspendue">Suspendre</button>`);
    if (!["Exécutée","Annulée"].includes(d.statut)) actions.push(`<button class="btn danger" data-dst="Annulée">Annuler</button>`);
  }
  if (sg && d.statut==="Émise") actions.push(`<button class="btn" data-dst="Examen SG">Ouvrir l'examen du Secrétariat général</button>`);
  openSheet(`<div class="spread"><h2>${esc(d.ref)}</h2><span class="pill ${clsSt(d.statut)}">${esc(d.statut)}</span></div>
    <h3>${esc(d.titre)}</h3><div class="quote">${esc(d.description)}</div>
    <dl class="dl"><dt>Décidée le</dt><dd>${dFR(d.date)} par ${esc(d.creeParNom||"la Présidence")}</dd><dt>Échéance</dt><dd>${dFR(d.echeance)}${decRetard(d)?' <span class="pill bad">dépassée</span>':""}</dd><dt>Priorité</dt><dd>${esc(d.priorite)}</dd>${d.reunionTitre?`<dt>Réunion</dt><dd>${esc(d.reunionTitre)}</dd>`:""}</dl>
    <h3>Responsables d'exécution</h3>
    ${(d.executants||[]).map(em=>{ const x = d.exec?.[ek(em)]||{statut:"À démarrer"}; return `<div class="prow"><span><b>${esc(nomDe(em))}</b>${x.attendu?`<br><span class="small muted">${esc(x.attendu)}</span>`:""}${x.note?`<br><span class="small">${esc(x.note)}</span>`:""}</span><span class="pill ${clsSt(x.statut)}">${esc(x.statut)}</span></div>`; }).join("") || '<p class="small muted">Aucun responsable désigné.</p>'}
    ${moi && !["Exécutée","Annulée","Suspendue"].includes(d.statut)?`<div class="card"><h3>Ma part</h3><label class="f" for="d_ms">Avancement<select id="d_ms">${opts(EXEC_ST, me?.statut||"À démarrer")}</select></label><label class="f" for="d_mn">Point d'avancement<textarea id="d_mn" maxlength="1000" placeholder="Obligatoire si l'exécution est bloquée.">${esc(me?.note||"")}</textarea></label><button class="btn primary" id="dMe">Enregistrer mon avancement</button></div>`:""}
    <h3>Observations et contrôle</h3>
    ${(d.observations||[]).map(o=>`<div class="quote"><span class="small"><b>${esc(o.type)}</b> · ${esc(o.nom)} · ${dtFR(o.le)}</span><br>${esc(o.texte)}</div>`).join("") || '<p class="small muted">Aucune observation.</p>'}
    ${(sg || pres) && d.statut!=="Brouillon"?`<label class="f" for="d_ob">${pres?"Réponse de la Présidence":"Observation du Secrétariat général"}<textarea id="d_ob" maxlength="1500"></textarea></label>${sg?`<label class="f" for="d_ot">Type<select id="d_ot">${opts(["Observation du Secrétariat général","Contrôle d'exécution"])}</select></label>`:""}<button class="btn" id="dObs">Ajouter</button>`:""}
    <details><summary class="small">Historique (${(d.historique||[]).length})</summary>${(d.historique||[]).map(h=>`<div class="small">${dtFR(h.le)} · ${esc(h.par)} · ${esc(h.action)}${h.obs?` : ${esc(h.obs)}`:""}</div>`).join("")}</details>
    <div class="row">${actions.join("")}<button class="btn ghost" data-close>Fermer</button></div>`);
  const maj = async (data, msg, act, dests) => { if (await write(()=>S.db.doc("decisions/"+id).update(data), msg)){ audit(act, "decision", d.ref, data.statut?{statut:data.statut}:null); if (dests) notifier(dests, `Décision ${d.ref} : ${msg.toLowerCase()} — ${d.titre}`, "decision"); closeSheet(); } };
  $("#dEdit") && ($("#dEdit").onclick = () => { closeSheet(); setTimeout(()=>formDecision(d), 60); });
  $("#dAss") && ($("#dAss").onclick = () => { closeSheet(); setTimeout(()=>formExecutants(d), 60); });
  $("#sheet").querySelectorAll("[data-dst]").forEach(b => {
    const st = b.dataset.dst, run = () => {
      const motif = ["Suspendue","Annulée"].includes(st) ? prompt("Motif (obligatoire) :") : "";
      if (["Suspendue","Annulée"].includes(st) && !motif) return toast("Le motif est obligatoire.");
      const data = {statut:st, historique:ajoute(d.historique, trace(st, st, motif||""))};
      if (st==="Émise") data.emiseLe = nowISO(); if (st==="Exécutée") data.executeeLe = nowISO();
      maj(data, `Décision ${st.toLowerCase()}`, "statut_"+st, d.executants);
    };
    if (["Annulée","Exécutée"].includes(st)) confirmBtn(b, "Confirmer", run); else b.onclick = run;
  });
  $("#dMe") && ($("#dMe").onclick = () => {
    const statut = $("#d_ms").value, note = $("#d_mn").value.trim();
    if (statut==="Bloquée" && !note) return toast("Expliquez le blocage.");
    const data = {exec:{[ek(S.email)]:{statut, note, le:nowISO()}}, historique:ajoute(d.historique, trace("Avancement : "+statut, d.statut, note))};
    if (statut==="En cours" && d.statut==="Confiée") data.statut = "En cours";
    maj(data, "Avancement enregistré", "execution", ["Terminée","Bloquée"].includes(statut) ? [d.creePar] : null);
  });
  $("#dObs") && ($("#dObs").onclick = () => {
    const texte = $("#d_ob").value.trim(); if (!texte) return toast("Rédigez l'observation.");
    const type = pres ? "Réponse de la Présidence" : $("#d_ot").value;
    maj({observations:[...(d.observations||[]), {type, texte, nom:compte().nom, email:S.email, le:nowISO()}], historique:ajoute(d.historique, trace(type, d.statut))}, "Observation ajoutée", "observation", pres ? [] : [d.creePar]);
  });
}
function formExecutants(d){
  const P0 = actifsTous().filter(c=>c.role!=="tuteur" || (c.rolesSup||[]).length);
  openSheet(`<h2>Responsables d'exécution · ${esc(d.ref)}</h2>
    <div class="checks">${P0.map(c=>`<label><input type="checkbox" name="dx" value="${esc(c.em)}" ${(d.executants||[]).includes(c.em)?"checked":""}> ${esc(c.nom)} <span class="muted small">· ${esc((c.fonctions||[]).map(titreFonction).join(", ") || ROLES[c.role]?.l || "")}</span></label>`).join("")}</div>
    <label class="f" for="dx_a">Ce qui est attendu (pour les nouveaux désignés)<textarea id="dx_a" maxlength="1000"></textarea></label>
    <div class="row"><button class="btn primary" id="dx_ok">Désigner</button><button class="btn" data-close>Annuler</button></div>`);
  $("#dx_ok").onclick = async () => {
    const L = [...$("#sheet").querySelectorAll('input[name="dx"]:checked')].map(i=>i.value);
    if (!L.length) return toast("Choisissez au moins une personne.");
    const nouveaux = L.filter(em=>!(d.executants||[]).includes(em)), attendu = $("#dx_a").value.trim();
    const exec = {...(d.exec||{})}; for (const em of nouveaux) exec[ek(em)] = {statut:"À démarrer", attendu, le:nowISO()};
    for (const k of Object.keys(exec)) if (!L.some(em=>ek(em)===k)) delete exec[k];
    const data = {executants:L, exec, historique:ajoute(d.historique, trace("Désignation : "+L.map(nomDe).join(", "), d.statut))};
    if (["Émise","Examen SG"].includes(d.statut)) data.statut = "Confiée";
    const {id:_id, ...reste} = d;
    if (await write(()=>S.db.doc("decisions/"+d.id).set({...reste, ...data}), "Responsables désignés")){
      audit("designation","decision",d.ref,{executants:L}); notifier(nouveaux, `Décision à exécuter : ${d.ref} — ${d.titre}${d.echeance?` (échéance ${dFR(d.echeance)})`:""}`, "decision"); closeSheet();
    }
  };
}

/* -------------------------------- Tâches -------------------------------- */
const TACHE_OUV = ["À faire","En cours","Bloquée"];
const tRetard = t => t.echeance && t.echeance < today() && TACHE_OUV.includes(t.statut);
const executeur = t => t.dest===S.email || (!t.dest && !!t.commission && mesComs().includes(t.commission));
const peutCreerTache = () => pilote() || mesComsResp().length > 0;
function vTaches(){
  const f = S.taf ||= {st:"ouvertes", qui: gouvSup() ? "" : "moi"};
  let L = S.taches.slice();
  if (f.qui==="moi") L = L.filter(t=>executeur(t) || t.auteurEmail===S.email);
  if (f.st==="ouvertes") L = L.filter(t=>TACHE_OUV.includes(t.statut)); else if (f.st==="retard") L = L.filter(tRetard); else if (f.st) L = L.filter(t=>t.statut===f.st);
  L.sort((a,b)=>(TACHE_OUV.indexOf(a.statut)+1||9)-(TACHE_OUV.indexOf(b.statut)+1||9) || String(a.echeance||"9").localeCompare(String(b.echeance||"9")));
  const mes = S.taches.filter(t=>executeur(t) && TACHE_OUV.includes(t.statut));
  return `<div class="spread"><div><h2>Tâches</h2><p class="small muted">Tâches attribuées à une personne ou à une équipe (commission), avec échéance et compte rendu.</p></div>${peutCreerTache()?`<button class="btn primary" id="newT">${ICO.nouveau} Nouvelle tâche</button>`:""}</div>
  <div class="kpis">${kpi(mes.length,"tâches à faire pour moi")}${kpi(mes.filter(tRetard).length,"en retard",mes.filter(tRetard).length?"bad":"g")}${gouvSup()?kpi(S.taches.filter(tRetard).length,"en retard (toute l'équipe)",S.taches.filter(tRetard).length?"bad":"g"):""}${kpi(S.taches.filter(t=>t.statut==="Terminée").length,"terminées","g")}</div>
  <div class="filters"><select id="taf">${opts([["ouvertes","Ouvertes"],["retard","En retard"],["Terminée","Terminées"],["","Toutes"]], f.st)}</select>${gouvSup()?`<select id="taq">${opts([["","Toute l'équipe"],["moi","Les miennes"]], f.qui)}</select>`:"<span></span>"}</div>
  ${L.length?`<div class="clist">${L.map(t=>`<button class="citem ${tRetard(t)?"late":""} ${t.statut==="Terminée"?"done":""}" data-tache="${esc(t.id)}">
    <span class="t">${["Urgente","Haute"].includes(t.priorite)?`<span class="pill ${clsSt(t.priorite)}">${esc(t.priorite)}</span> `:""}${esc(t.titre)}</span>
    <span class="m"><span class="pill ${clsSt(t.statut)}">${esc(t.statut)}</span><span>→ ${esc(t.dest ? (t.destNom||nomDe(t.dest)) : "Équipe " + comCourt(t.commission))}</span><span>Échéance ${dFR(t.echeance)}</span><span>· par ${esc(t.auteurNom)}</span></span></button>`).join("")}</div>`:`<div class="empty">Aucune tâche pour ce filtre.</div>`}`;
}
function bindTaches(){
  $("#newT") && ($("#newT").onclick = () => formTache());
  $("#taf") && ($("#taf").onchange = e => { S.taf.st = e.target.value; render(); });
  $("#taq") && ($("#taq").onchange = e => { S.taf.qui = e.target.value; render(); });
  $("#main").querySelectorAll("[data-tache]").forEach(b => b.onclick = () => ficheTache(b.dataset.tache));
}
function formTache(prefill){
  const pre = prefill || {}, coms = pilote() ? COMMISSIONS.map(c=>c[0]) : mesComsResp();
  const gens = pilote() ? actifsTous() : [...new Map(mesComsResp().flatMap(membresDe).map(c=>[c.em,c])).values()];
  const restreint = pre.convoques ? gens.filter(c=>pre.convoques.includes(c.em)) : gens;
  openSheet(`<h2>Nouvelle tâche</h2>
    <label class="f" for="t_t">Intitulé<input type="text" id="t_t" maxlength="150" value="${esc(pre.titre||"")}"></label>
    <label class="f" for="t_x">Description<textarea id="t_x" maxlength="2000"></textarea></label>
    <label class="f" for="t_m">Attribuer à<select id="t_m">${opts([["p","Une personne"],["e","Une équipe (commission)"]],"p")}</select></label>
    <label class="f" id="t_pw" for="t_d">Personne<select id="t_d">${opts(restreint.filter(c=>c.em!==S.email || pilote()).map(c=>[c.em, c.nom + ((c.fonctions||[]).length?" · "+titreFonction(c.fonctions[0]):"")]), "", "Choisir…")}</select></label>
    <label class="f" id="t_cw" for="t_c" hidden>Commission<select id="t_c">${opts(coms.map(c=>[c, comNom(c)]), "", "Choisir…")}</select></label>
    <div class="g2"><label class="f" for="t_e">Échéance<input type="date" id="t_e" min="${today()}"></label><label class="f" for="t_p">Priorité<select id="t_p">${opts(["Basse","Normale","Haute","Urgente"],"Normale")}</select></label></div>
    ${!pilote()?'<p class="hint">En tant que responsable, vous attribuez des tâches à votre commission et à ses membres.</p>':""}
    <div class="row"><button class="btn primary" id="t_ok">Attribuer</button><button class="btn" data-close>Annuler</button></div>`);
  const up = () => { const e = $("#t_m").value==="e"; $("#t_pw").hidden = e; $("#t_cw").hidden = !e; };
  $("#t_m").onchange = up; up();
  $("#t_ok").onclick = async () => {
    const equipe = $("#t_m").value==="e", dest = equipe ? null : $("#t_d").value, com = equipe ? $("#t_c").value : null;
    const titre = $("#t_t").value.trim();
    if (!titre) return toast("Indiquez l'intitulé.");
    if (!equipe && !dest) return toast("Choisissez la personne.");
    if (equipe && !com) return toast("Choisissez la commission.");
    /* Un responsable rattache la tâche à sa commission (contrôlé par le serveur) */
    const commission = com || (pilote() ? null : (mesComsResp().find(c=>(S.comptes[dest]?.commissions||[]).includes(c)) || null));
    const id = gid("T"), data = {titre, description:$("#t_x").value.trim(), dest, destNom:dest?nomDe(dest):null, commission, echeance:$("#t_e").value||"", priorite:$("#t_p").value, statut:"À faire", note:"", auteurEmail:S.email, auteurNom:compte().nom, decision:pre.decision||null, reunion:pre.reunion||null, reunionTitre:pre.reunionTitre||null, creeLe:nowISO(), historique:[trace("Attribution","À faire")]};
    if (await write(()=>S.db.doc("taches/"+id).set(data), "Tâche attribuée")){
      audit("creation","tache",id,{titre, dest, commission});
      notifier(dest ? [dest] : membresDe(com).map(c=>c.em), `Nouvelle tâche : ${titre}${data.echeance?` (échéance ${dFR(data.echeance)})`:""}`, "tache");
      closeSheet();
    }
  };
}
function ficheTache(id){
  const t = S.taches.find(x=>x.id===id); if (!t) return toast("Tâche introuvable.");
  const ex = executeur(t), auteur = t.auteurEmail===S.email || pilote();
  openSheet(`<div class="spread"><h2>${esc(t.titre)}</h2><span class="pill ${clsSt(t.statut)}">${esc(t.statut)}</span></div>
    ${t.description?`<div class="quote">${esc(t.description)}</div>`:""}
    <dl class="dl"><dt>Pour</dt><dd>${esc(t.dest ? (t.destNom||nomDe(t.dest)) : "Équipe " + comNom(t.commission))}</dd><dt>Par</dt><dd>${esc(t.auteurNom)}</dd><dt>Échéance</dt><dd>${dFR(t.echeance)}${tRetard(t)?' <span class="pill bad">en retard</span>':""}</dd>${t.reunionTitre?`<dt>Réunion</dt><dd>${esc(t.reunionTitre)}</dd>`:""}</dl>
    ${t.note?`<h3>Compte rendu</h3><div class="quote">${esc(t.note)}</div>`:""}
    ${ex && TACHE_OUV.includes(t.statut)?`<label class="f" for="t_n">Compte rendu / point d'avancement<textarea id="t_n" maxlength="1500">${esc(t.note||"")}</textarea></label>
      <div class="row">${["En cours","Bloquée","Terminée"].filter(s=>s!==t.statut).map(s=>`<button class="btn ${s==="Terminée"?"vert":s==="Bloquée"?"danger":""}" data-tst="${s}">${{"En cours":"Je m'en occupe","Bloquée":"Signaler un blocage","Terminée":"Marquer comme terminée"}[s]}</button>`).join("")}</div>`:""}
    <details><summary class="small">Historique</summary>${(t.historique||[]).map(h=>`<div class="small">${dtFR(h.le)} · ${esc(h.par)} · ${esc(h.action)}${h.obs?` : ${esc(h.obs)}`:""}</div>`).join("")}</details>
    <div class="row">${auteur && TACHE_OUV.includes(t.statut)?`<button class="btn danger" id="tAnn">Annuler la tâche</button>`:""}${auteur && ["Terminée","Annulée"].includes(t.statut)?`<button class="btn" id="tRouv">Rouvrir</button>`:""}<button class="btn ghost" data-close>Fermer</button></div>`);
  const maj = async (data, msg, txt) => { if (await write(()=>S.db.doc("taches/"+id).update({...data, majLe:nowISO()}), msg)){ audit("statut_"+data.statut,"tache",id,{titre:t.titre, note:data.note||""}); if (txt) notifier([t.auteurEmail], txt, "tache"); closeSheet(); } };
  $("#sheet").querySelectorAll("[data-tst]").forEach(b => b.onclick = () => {
    const st = b.dataset.tst, note = $("#t_n").value.trim();
    if (st==="Bloquée" && !note) return toast("Expliquez le blocage.");
    if (st==="Terminée" && note.length < 5) return toast("Rédigez un court compte rendu avant de terminer la tâche.");
    maj({statut:st, note, historique:ajoute(t.historique, trace(st, st, note))}, "Tâche mise à jour", ["Terminée","Bloquée"].includes(st) ? `${compte().nom} : tâche « ${t.titre} » ${st==="Terminée"?"terminée":"bloquée"}` : null);
  });
  $("#tAnn") && confirmBtn($("#tAnn"), "Confirmer l'annulation", () => maj({statut:"Annulée", historique:ajoute(t.historique, trace("Annulée","Annulée"))}, "Tâche annulée"));
  $("#tRouv") && ($("#tRouv").onclick = () => maj({statut:"À faire", historique:ajoute(t.historique, trace("Rouverte","À faire"))}, "Tâche rouverte"));
}

/* ------------------------------- Réunions ------------------------------- */
const gereReunion = r => pilote() || r.auteurEmail===S.email || (r.commission && mesComsResp().includes(r.commission));
const peutConvoquer = () => pilote() || mesComsResp().length > 0;
function vReunions(){
  const f = S.ruf ||= {quand:"avenir"}, now = new Date().toISOString().slice(0,16);
  let L = S.reunions.slice();
  if (f.quand==="avenir") L = L.filter(r=>String(r.debut) >= now.slice(0,10)).sort((a,b)=>String(a.debut).localeCompare(String(b.debut)));
  else L = L.filter(r=>f.quand==="passees" ? String(r.debut) < now.slice(0,10) : true).sort((a,b)=>String(b.debut).localeCompare(String(a.debut)));
  const sansCR = S.reunions.filter(r=>String(r.debut) < now.slice(0,10) && r.statut!=="Annulée" && !r.compteRendu);
  return `<div class="spread"><div><h2>Réunions</h2><p class="small muted">Convocation, feuille de présence, compte rendu et suites. Chaque réunion doit déboucher sur des décisions, des responsables et des échéances.</p></div>${peutConvoquer()?`<button class="btn primary" id="newR">${ICO.nouveau} Programmer</button>`:""}</div>
  <div class="kpis">${kpi(S.reunions.filter(r=>String(r.debut)>=now.slice(0,10) && ["Programmée","Reportée"].includes(r.statut)).length,"à venir")}${kpi(sansCR.length,"sans compte rendu",sansCR.length?"warn":"g")}</div>
  <div class="subtabs" role="group">${[["avenir","À venir"],["passees","Passées"],["toutes","Toutes"]].map(([k,l])=>`<button data-ruq="${k}" aria-pressed="${f.quand===k}">${l}</button>`).join("")}</div>
  ${L.length?`<div class="clist">${L.map(r=>`<button class="citem ${r.statut==="Annulée"?"done":""}" data-reu="${esc(r.id)}"><span class="t">${esc(r.titre)}</span>
    <span class="m"><span class="pill ${clsSt(r.statut)}">${esc(r.statut)}</span><span>${dtFR(r.debut)}</span><span>${esc(r.lieu||"Lieu à préciser")}</span><span>· ${esc(comCourt(r.commission))} · ${(r.convoques||[]).length} convoqué(s)${r.compteRendu?" · compte rendu ✓":""}</span></span></button>`).join("")}</div>`:`<div class="empty">Aucune réunion.</div>`}`;
}
function bindReunions(){
  $("#newR") && ($("#newR").onclick = () => formReunion());
  $("#main").querySelectorAll("[data-ruq]").forEach(b => b.onclick = () => { S.ruf.quand = b.dataset.ruq; render(); });
  $("#main").querySelectorAll("[data-reu]").forEach(b => b.onclick = () => ficheReunion(b.dataset.reu));
}
function formReunion(r){
  const isNew = !r; r = r || {};
  const coms = pilote() ? COMMISSIONS.map(c=>c[0]) : mesComsResp();
  const gens = actifsTous().filter(c=>c.em!==S.email);
  openSheet(`<h2>${isNew?"Programmer une réunion":"Reporter ou modifier"}</h2>
    <label class="f" for="r_t">Objet<input type="text" id="r_t" maxlength="150" value="${esc(r.titre||"")}"></label>
    <div class="g2"><label class="f" for="r_d">Début<input type="datetime-local" id="r_d" value="${esc(r.debut||"")}"></label><label class="f" for="r_f">Fin<input type="datetime-local" id="r_f" value="${esc(r.fin||"")}"></label></div>
    <label class="f" for="r_l">Lieu ou lien<input type="text" id="r_l" maxlength="300" value="${esc(r.lieu||"")}" placeholder="Salle, ou lien Google Meet"></label>
    ${isNew?`<label class="f" for="r_c">Commission<select id="r_c">${pilote()?opts([["","Bureau (aucune commission)"], ...coms.map(c=>[c, comNom(c)])], ""):opts(coms.map(c=>[c, comNom(c)]), coms[0])}</select></label>
    <label class="f" for="r_o">Ordre du jour<textarea id="r_o" maxlength="3000" placeholder="1. …&#10;2. …"></textarea></label>
    <fieldset><legend>Convoquer</legend><div class="row">${COMMISSIONS.map(([c])=>`<button type="button" class="btn sm" data-rc="${c}">${esc(comCourt(c))}</button>`).join("")}<button type="button" class="btn sm" data-rc="*">Bureau</button></div>
      <div class="checks">${gens.map(c=>`<label><input type="checkbox" name="rv" value="${esc(c.em)}"> ${esc(c.nom)} <span class="muted small">· ${esc((c.fonctions||[]).map(titreFonction).join(", ") || ROLES[c.role]?.l || "")}</span></label>`).join("")}</div></fieldset>`:""}
    <div class="row"><button class="btn primary" id="r_ok">${isNew?"Programmer et convoquer":"Enregistrer et prévenir"}</button><button class="btn" data-close>Annuler</button></div>`);
  $("#sheet").querySelectorAll("[data-rc]").forEach(b => b.onclick = () => {
    const c = b.dataset.rc, cible = c==="*" ? actifsTous().filter(x=>(x.fonctions||[]).some(f=>FONCTIONS[f.code]?.bureau)).map(x=>x.em) : membresDe(c).map(x=>x.em);
    $("#sheet").querySelectorAll('input[name="rv"]').forEach(i => { if (cible.includes(i.value)) i.checked = true; });
  });
  $("#r_ok").onclick = async () => {
    const titre = $("#r_t").value.trim(), debut = $("#r_d").value, fin = $("#r_f").value, lieu = $("#r_l").value.trim();
    if (!titre || !debut) return toast("L'objet et la date de début sont obligatoires.");
    if (fin && fin <= debut) return toast("La fin doit être après le début.");
    if (!isNew){
      if (await write(()=>S.db.doc("reunions/"+r.id).update({titre, debut, fin, lieu, statut:"Programmée", historique:ajoute(r.historique, trace("Report / modification","Programmée", `${dtFR(debut)} · ${lieu}`))}), "Réunion mise à jour")){
        audit("modification","reunion",r.id,{debut, lieu}); notifier(r.convoques, `Réunion modifiée : ${titre} — ${dtFR(debut)}${lieu?" · "+lieu:""}`, "reunion"); closeSheet();
      }
      return;
    }
    const conv = [...new Set([S.email, ...[...$("#sheet").querySelectorAll('input[name="rv"]:checked')].map(i=>i.value)])];
    if (conv.length < 2) return toast("Convoquez au moins une personne.");
    const commission = $("#r_c").value || null;
    if (!pilote() && !commission) return toast("Choisissez votre commission.");
    const id = gid("R"), data = {titre, debut, fin:fin||"", lieu, commission, ordre:$("#r_o").value.trim(), convoques:conv, noms:Object.fromEntries(conv.map(e=>[ek(e), nomDe(e)])), presences:{}, statut:"Programmée", compteRendu:"", auteurEmail:S.email, auteurNom:compte().nom, creeLe:nowISO(), historique:[trace("Convocation","Programmée")]};
    if (await write(()=>S.db.doc("reunions/"+id).set(data), "Réunion programmée, convocations envoyées")){
      audit("creation","reunion",id,{titre, debut, convoques:conv.length}); notifier(conv, `Convocation : ${titre} — ${dtFR(debut)}${lieu?" · "+lieu:""}`, "reunion"); closeSheet();
    }
  };
}
function ficheReunion(id){
  const r = S.reunions.find(x=>x.id===id); if (!r) return toast("Réunion introuvable.");
  const g = gereReunion(r), suites = S.taches.filter(t=>t.reunion===id), decs = S.decisions.filter(d=>d.reunion===id);
  const PRES = ["Convoqué","Présent","Absent","Excusé"];
  openSheet(`<div class="spread"><h2>${esc(r.titre)}</h2><span class="pill ${clsSt(r.statut)}">${esc(r.statut)}</span></div>
    <dl class="dl"><dt>Quand</dt><dd>${dtFR(r.debut)}${r.fin?" → "+dtFR(r.fin):""}</dd><dt>Où</dt><dd>${esc(r.lieu||"À préciser")}</dd><dt>Commission</dt><dd>${esc(comNom(r.commission))}</dd><dt>Convoquée par</dt><dd>${esc(r.auteurNom)}</dd></dl>
    ${r.ordre?`<h3>Ordre du jour</h3><div class="quote">${esc(r.ordre)}</div>`:""}
    <h3>Présences</h3>
    ${(r.convoques||[]).map(em=>{ const st = r.presences?.[ek(em)] || "Convoqué"; return `<div class="prow"><span>${esc(r.noms?.[ek(em)] || nomDe(em))}</span>${g?`<select data-pr="${esc(ek(em))}">${opts(PRES, st)}</select>`:`<span class="pill ${clsSt(st)}">${esc(st)}</span>`}</div>`; }).join("")}
    ${g?`<button class="btn" id="rPres">Enregistrer les présences</button>`:""}
    <h3>Compte rendu</h3>
    ${g?`<textarea id="r_cr" maxlength="10000" placeholder="Points discutés, décisions prises, responsables et échéances.">${esc(r.compteRendu||"")}</textarea><button class="btn primary" id="rCR">Enregistrer le compte rendu</button>`:r.compteRendu?`<div class="quote">${esc(r.compteRendu)}</div>`:'<p class="small muted">Pas encore de compte rendu.</p>'}
    ${r.crLe?`<p class="small muted">Rédigé par ${esc(r.crPar)} le ${dtFR(r.crLe)}</p>`:""}
    <h3>Suites</h3>
    ${decs.map(d=>`<div class="prow"><span><b>${esc(d.ref)}</b> ${esc(d.titre)}</span><span class="pill ${clsSt(d.statut)}">${esc(d.statut)}</span></div>`).join("")}
    ${suites.map(t=>`<div class="prow"><span>${esc(t.titre)} <span class="small muted">→ ${esc(t.destNom||comCourt(t.commission))} · ${dFR(t.echeance)}</span></span><span class="pill ${clsSt(t.statut)}">${esc(t.statut)}</span></div>`).join("") || (decs.length?"":'<p class="small muted">Aucune suite enregistrée.</p>')}
    <div class="row">${g && peutCreerTache()?`<button class="btn" id="rTache">+ Tâche issue de la réunion</button>`:""}${presidence()?`<button class="btn" id="rDec">+ Décision issue de la réunion</button>`:""}${g && r.statut!=="Annulée"?`<button class="btn" id="rMod">Reporter / modifier</button><button class="btn danger" id="rAnn">Annuler</button>`:""}<button class="btn ghost" data-close>Fermer</button></div>`);
  const maj = async (data, msg, txt) => { if (await write(()=>S.db.doc("reunions/"+id).update(data), msg)){ audit(msg, "reunion", id, null); if (txt) notifier(r.convoques, txt, "reunion"); closeSheet(); } };
  $("#rPres") && ($("#rPres").onclick = () => {
    const pres = {}; $("#sheet").querySelectorAll("[data-pr]").forEach(s => pres[s.dataset.pr] = s.value);
    maj({presences:pres, statut:r.statut==="Programmée" && r.debut <= new Date().toISOString().slice(0,16) ? "Tenue" : r.statut, historique:ajoute(r.historique, trace("Présences enregistrées", r.statut))}, "Présences enregistrées");
  });
  $("#rCR") && ($("#rCR").onclick = () => { const cr = $("#r_cr").value.trim(); if (cr.length < 10) return toast("Le compte rendu est trop court."); maj({compteRendu:cr, crPar:compte().nom, crLe:nowISO(), statut:r.statut==="Programmée" ? "Tenue" : r.statut, historique:ajoute(r.historique, trace("Compte rendu", "Tenue"))}, "Compte rendu enregistré", `Compte rendu disponible : ${r.titre}`); });
  $("#rTache") && ($("#rTache").onclick = () => { closeSheet(); setTimeout(()=>formTache({reunion:id, reunionTitre:r.titre, convoques:r.convoques}), 60); });
  $("#rDec") && ($("#rDec").onclick = () => { closeSheet(); setTimeout(()=>formDecision(null, {reunion:id, reunionTitre:r.titre}), 60); });
  $("#rMod") && ($("#rMod").onclick = () => { closeSheet(); setTimeout(()=>formReunion(r), 60); });
  $("#rAnn") && confirmBtn($("#rAnn"), "Confirmer l'annulation", () => { const m = prompt("Motif de l'annulation :"); if (!m) return toast("Le motif est obligatoire."); maj({statut:"Annulée", historique:ajoute(r.historique, trace("Annulée","Annulée", m))}, "Réunion annulée", `Réunion annulée : ${r.titre} (${m})`); });
}

/* ---------------------------- Journal d'audit ---------------------------- */
function vAudit(){
  const f = S.auf ||= {objet:""};
  const L = S.audit.filter(a=>!f.objet || a.objet===f.objet);
  return `<div class="spread"><div><h2>Journal d'audit</h2><p class="small muted">Toutes les créations, modifications, validations et changements de droits, horodatés et attribués. Ce journal ne peut être ni modifié ni effacé.</p></div></div>
  <div class="filters"><select id="auf">${opts([["","Tous les objets"],["compte","Comptes et fonctions"],["decision","Décisions"],["tache","Tâches"],["reunion","Réunions"]], f.objet)}</select><span></span></div>
  <div class="tablewrap"><table><thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Objet</th><th>Détail</th></tr></thead><tbody>
  ${L.map(a=>`<tr><td class="small">${new Date(a.le).toLocaleString("fr-FR")}</td><td>${esc(a.parNom)}</td><td class="small">${esc(a.action)}</td><td class="small">${esc(a.objet)} ${esc(a.ref||"")}</td><td class="small" style="white-space:normal">${esc(a.details ? JSON.stringify(a.details).slice(0,200) : "")}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">Aucune entrée.</div></td></tr>`}
  </tbody></table></div><p class="small muted">Les 300 dernières entrées.</p>`;
}
function bindAudit(){ $("#auf") && ($("#auf").onchange = e => { S.auf.objet = e.target.value; render(); }); }

/* --------------------- Bloc « Mon travail » de l'accueil --------------------- */
function blocGouv(){
  try {
    const mesT = S.taches.filter(t=>executeur(t) && TACHE_OUV.includes(t.statut)).sort((a,b)=>String(a.echeance||"9").localeCompare(String(b.echeance||"9")));
    const mesD = mesDecisions().filter(d=>!["Exécutée","Annulée"].includes(d.statut) && (d.exec?.[ek(S.email)]?.statut||"À démarrer")!=="Terminée");
    const proch = S.reunions.filter(r=>String(r.debut) >= today() && ["Programmée","Reportée"].includes(r.statut)).sort((a,b)=>String(a.debut).localeCompare(String(b.debut))).slice(0,3);
    const sup = gouvSup() ? `<div class="kpis">${kpi(S.decisions.filter(d=>DEC_OUVERTES.includes(d.statut)).length,"décisions en cours")}${kpi(S.decisions.filter(decRetard).length,"décisions en retard",S.decisions.some(decRetard)?"bad":"g")}${kpi(S.taches.filter(tRetard).length,"tâches en retard (équipe)",S.taches.some(tRetard)?"bad":"g")}${kpi(S.reunions.filter(r=>String(r.debut)<today() && r.statut!=="Annulée" && !r.compteRendu).length,"réunions sans compte rendu")}</div>` : "";
    if (!mesT.length && !mesD.length && !proch.length && !sup) return "";
    return `<div class="card"><div class="spread"><h3>Mon travail</h3><a class="small" href="#taches">Toutes les tâches</a></div>${sup}
      ${mesD.map(d=>`<button class="citem ${decRetard(d)?"late":""}" data-dec="${esc(d.id)}"><span class="t">Décision ${esc(d.ref)} · ${esc(d.titre)}</span><span class="m"><span class="pill">${esc(d.exec?.[ek(S.email)]?.statut||"À démarrer")}</span><span>Échéance ${dFR(d.echeance)}</span></span></button>`).join("")}
      ${mesT.slice(0,5).map(t=>`<button class="citem ${tRetard(t)?"late":""}" data-tache="${esc(t.id)}"><span class="t">${esc(t.titre)}</span><span class="m"><span class="pill ${clsSt(t.statut)}">${esc(t.statut)}</span><span>Échéance ${dFR(t.echeance)}</span></span></button>`).join("")}
      ${proch.map(r=>`<button class="citem" data-reu="${esc(r.id)}"><span class="t">📅 ${esc(r.titre)}</span><span class="m"><span>${dtFR(r.debut)}</span><span>${esc(r.lieu||"")}</span></span></button>`).join("")}
      ${!mesT.length && !mesD.length && !proch.length ? '<p class="small muted">Aucune tâche, décision ou réunion en attente pour vous.</p>' : ""}</div>`;
  } catch(e){ console.error(e); return ""; }
}
function bindGouvCommun(){
  $("#main").querySelectorAll("[data-dec]").forEach(b => b.onclick = () => ficheDecision(b.dataset.dec));
  $("#main").querySelectorAll("[data-tache]").forEach(b => b.onclick = () => ficheTache(b.dataset.tache));
  $("#main").querySelectorAll("[data-reu]").forEach(b => b.onclick = () => ficheReunion(b.dataset.reu));
}

/* ---- Abonnements : chacun ne lit que ce que les règles du serveur lui permettent ---- */
function abonnerGouv(){
  const db = S.db;
  if (gouvSup()){
    sub("decisions","decisions", s => { S.decisions = rows(s); });
    sub("taches","taches", s => { S.taches = rows(s); });
    sub("reunions","reunions", s => { S.reunions = rows(s); });
    sub("audit","audit", s => { S.audit = rows(s); }, db.collection("audit").orderBy("le","desc").limit(300));
    return;
  }
  const fusion = (cle, part) => s => { S["_"+cle] ||= {}; S["_"+cle][part] = rows(s); S[cle] = [...new Map(Object.values(S["_"+cle]).flat().map(x=>[x.id,x])).values()]; };
  sub("decisions","decisions", s => { S.decisions = rows(s); }, db.collection("decisions").where("executants","array-contains",S.email));
  sub("taches","taches", fusion("taches","dest"), db.collection("taches").where("dest","==",S.email));
  sub("taches","taches", fusion("taches","auteur"), db.collection("taches").where("auteurEmail","==",S.email));
  mesComs().forEach(c => sub("taches","taches", fusion("taches","c_"+c), db.collection("taches").where("commission","==",c)));
  sub("reunions","reunions", fusion("reunions","conv"), db.collection("reunions").where("convoques","array-contains",S.email));
}

/* =====================================================================
   DÉLÉGUÉS DE SPÉCIALITÉ
   Demandes de cours, cours à faire expliquer (dépôt du lundi), rapport
   hebdomadaire de la spécialité (4 visas de contrôle), notation des tuteurs.
   ===================================================================== */
const groupeDe = c => `${c?.specialite||""} · ${c?.niveau||""}`;
const groupeLib = g => { const [sp, nv] = String(g||"").split(" · "); return `${codeSp(sp)} ${nv||""}`.trim(); };
const semCourante = () => lundiDe(today());
const estDelegue = () => tousMesRoles().includes("delegue");
const estTuteurR = () => tousMesRoles().includes("tuteur");
const supDelegues = () => aRole("formation","tuteurs","accompagnement","secretaire","vicepresident");
const voitNotesTut = () => aRole("tuteurs","secretaire","vicepresident");
const tuteursDuGroupe = g => actifsTous().filter(c => rolesDe(c).includes("tuteur") && groupeDe(c)===g);
const deleguesActifs = () => actifsTous().filter(c => rolesDe(c).includes("delegue"));
/* Visas de contrôle du rapport hebdomadaire : les 4 contrôleurs prévus */
const VISAS = [["tuteur","Tuteur du groupe"],["tuteurs","Responsable des Tuteurs"],["accompagnement","Responsable Suivi et Accompagnement"],["formation","Responsable Formation"]];
const mesVisas = r => VISAS.map(v=>v[0]).filter(k => k==="tuteur" ? (estTuteurR() && r.groupe===groupeDe(compte())) : (!presidence() && tousMesRoles().includes(k)));
const nbVisas = r => VISAS.filter(([k])=>r.visas?.[k]).length;
const CRIT_TUT = [["ponctualite","Ponctualité et régularité des séances"],["clarte","Clarté des explications"],["disponibilite","Disponibilité et écoute"],["suivi","Suivi des difficultés du groupe"]];
const DC_ST = ["Soumise","Prise en charge","Traitée","Refusée"];
const dcType = t => t==="cours" ? "Cours à expliquer" : "Demande de cours";

function etatDelegue(){
  const sem = semCourante(), moi = S.email;
  const rap = S.rapportsDelegues.find(r=>r.delegueEmail===moi && r.semaine===sem);
  const cours = S.demandesCours.filter(d=>d.delegueEmail===moi && d.type==="cours" && d.semaine===sem);
  const tuts = tuteursDuGroupe(groupeDe(compte()));
  const notes = S.notesTuteurs.filter(n=>n.delegueEmail===moi && n.semaine===sem);
  return {sem, rap, cours, tuts, notes, resteNotes: tuts.filter(t=>!notes.some(n=>n.tuteurEmail===t.em))};
}

function vDelegues(){
  const del = estDelegue() && !presidence(), sup = supDelegues(), tut = estTuteurR() && !sup;
  const onglets = [["demandes","Demandes de cours"],["cours","Cours à expliquer"],["rapports","Rapports hebdomadaires"], ...((del || voitNotesTut()) ? [["notes", del ? "Noter les tuteurs" : "Notes des tuteurs"]] : [])];
  const sub = onglets.some(o=>o[0]===S.sub.delegues) ? S.sub.delegues : "demandes";
  const monG = groupeDe(compte());
  const filtre = L => del && !sup ? L.filter(x=>x.delegueEmail===S.email) : tut ? L.filter(x=>x.groupe===monG) : L;
  let body = "";
  if (sub==="demandes" || sub==="cours"){
    const type = sub==="cours" ? "cours" : "demande";
    const L = filtre(S.demandesCours).filter(d=>(d.type||"demande")===type).sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe)));
    const att = L.filter(d=>d.statut==="Soumise").length;
    body = `<div class="spread"><p class="small muted">${type==="cours"?"Chaque lundi, le délégué dépose les cours que son groupe veut se faire expliquer, avec le détail des points à traiter.":"Les demandes de cours formulées par les délégués selon les besoins de leur groupe."}</p>${del?`<button class="btn primary" id="newDC" data-type="${type}">${ICO.nouveau} ${type==="cours"?"Déposer un cours":"Nouvelle demande"}</button>`:""}</div>
      <div class="kpis">${kpi(att,"en attente de prise en charge",att?"warn":"g")}${kpi(L.filter(d=>d.statut==="Prise en charge").length,"prises en charge")}${kpi(L.filter(d=>d.statut==="Traitée").length,"traitées","g")}</div>
      ${L.length?`<div class="clist">${L.map(d=>`<button class="citem ${d.statut==="Traitée"?"done":""}" data-dc="${esc(d.id)}"><span class="t">${d.urgence==="Urgente"?'<span class="pill bad">Urgent</span> ':""}${esc(d.matiere)}</span>
        <span class="m"><span class="pill ${({"Traitée":"ok","Refusée":"mute","Soumise":"warn"})[d.statut]||""}">${esc(d.statut)}</span><span>${esc(groupeLib(d.groupe))}</span><span>· ${esc(d.delegueNom)}</span><span>· ${dFR(String(d.creeLe).slice(0,10))}</span>${d.lien?"<span>· 📎 document</span>":""}</span></button>`).join("")}</div>`:`<div class="empty">${type==="cours"?"Aucun cours déposé.":"Aucune demande de cours."}</div>`}`;
  }
  if (sub==="rapports"){
    const L = filtre(S.rapportsDelegues).filter(r=>r.statut!=="Brouillon" || r.delegueEmail===S.email).sort((a,b)=>String(b.semaine).localeCompare(String(a.semaine)));
    const mv = r => mesVisas(r).filter(k=>!r.visas?.[k]);
    const aViser = L.filter(r=>r.statut==="Soumis" && mv(r).length);
    const sem = semCourante(), manquants = sup ? deleguesActifs().filter(c=>!S.rapportsDelegues.some(r=>r.delegueEmail===c.em && r.semaine===addJ(sem,-7) && r.statut!=="Brouillon")) : [];
    body = `<div class="spread"><p class="small muted">Rapport hebdomadaire de chaque délégué sur sa spécialité. Il est contrôlé par le tuteur du groupe, le Responsable des Tuteurs, le Responsable Suivi et Accompagnement et le Responsable Formation.</p>${del?`<button class="btn primary" id="newRD">${ICO.nouveau} Rapport de la semaine</button>`:""}</div>
      ${!del||sup?`<div class="kpis">${kpi(aViser.length,"à contrôler par moi",aViser.length?"warn":"g")}${kpi(L.filter(r=>r.statut==="Soumis" && nbVisas(r)===4).length,"contrôlés par les 4")}${sup?kpi(manquants.length,`délégué(s) sans rapport (${semLib(addJ(sem,-7)).replace("semaine du ","sem. du ")})`,manquants.length?"bad":"g"):""}</div>${manquants.length?`<p class="small muted">Sans rapport : ${esc(manquants.map(c=>`${c.nom} (${groupeLib(groupeDe(c))})`).join(", "))}</p>`:""}`:""}
      ${L.length?`<div class="clist">${L.map(r=>`<button class="citem ${r.statut==="Retourné"?"late":""}" data-rd="${esc(r.id)}"><span class="t">${esc(groupeLib(r.groupe))} · ${esc(semLib(r.semaine))}</span>
        <span class="m"><span class="pill ${({"Retourné":"bad","Brouillon":"mute"})[r.statut]||""}">${esc(r.statut)}</span><span class="pill ${nbVisas(r)===4?"ok":""}">${nbVisas(r)}/4 visas</span><span>${esc(r.delegueNom)}</span>${mv(r).length&&r.statut==="Soumis"?'<span class="pill warn">À contrôler</span>':""}</span></button>`).join("")}</div>`:`<div class="empty">Aucun rapport de délégué.</div>`}`;
  }
  if (sub==="notes"){
    if (del && !voitNotesTut()){
      const E = etatDelegue();
      body = `<p class="small muted">Chaque semaine, notez les tuteurs de votre groupe (${esc(groupeLib(monG))}). Vos notes sont lues par le Responsable des Tuteurs, le Secrétariat général et la Présidence ; les tuteurs ne voient pas votre note individuelle.</p>
        ${E.tuts.length?E.tuts.map(t=>{ const n = E.notes.find(x=>x.tuteurEmail===t.em); return `<div class="prow"><span><b>${esc(t.nom)}</b><br><span class="small muted">${esc(semLib(E.sem))}</span></span>${n?`<span class="pill ok">${String(n.note.toFixed(1)).replace(".",",")} /5</span> <button class="btn sm ghost" data-nt="${esc(t.em)}">Modifier</button>`:`<button class="btn sm primary" data-nt="${esc(t.em)}">Noter</button>`}</div>`; }).join(""):`<div class="empty">Aucun tuteur n'est rattaché à votre groupe (${esc(groupeLib(monG))}). Signalez-le au Responsable des Tuteurs.</div>`}
        <h3>Mes notes précédentes</h3>${S.notesTuteurs.filter(n=>n.delegueEmail===S.email && n.semaine!==E.sem).sort((a,b)=>String(b.semaine).localeCompare(String(a.semaine))).slice(0,12).map(n=>`<div class="prow"><span>${esc(n.tuteurNom)} <span class="small muted">· ${esc(semLib(n.semaine))}</span></span><span class="pill">${String(n.note.toFixed(1)).replace(".",",")} /5</span></div>`).join("") || '<p class="small muted">Aucune.</p>'}`;
    } else {
      const par = {}; for (const n of S.notesTuteurs){ const t = (par[n.tuteurEmail] ||= {nom:n.tuteurNom, groupe:n.groupe, n:0, s:0, c:{}, der:null, com:[]}); t.n++; t.s += n.note; for (const [k] of CRIT_TUT) t.c[k] = (t.c[k]||0) + (Number(n.criteres?.[k])||0); if (!t.der || n.semaine > t.der) t.der = n.semaine; if (n.commentaire) t.com.push(n); }
      const L = Object.entries(par).sort((a,b)=>a[1].s/a[1].n - b[1].s/b[1].n);
      body = `<p class="small muted">Notes hebdomadaires données aux tuteurs par les délégués de spécialité (moyenne sur 5). Les tuteurs les moins bien notés apparaissent en premier.</p>
        ${L.length?`<div class="tablewrap"><table><thead><tr><th>Tuteur</th><th>Groupe</th><th class="r">Moyenne</th>${CRIT_TUT.map(([,l])=>`<th class="r small">${esc(l.split(" ")[0])}</th>`).join("")}<th class="r">Notes</th><th>Dernière</th></tr></thead><tbody>${L.map(([em,t])=>`<tr class="click" data-ntv="${esc(em)}"><td><b>${esc(t.nom)}</b></td><td class="small">${esc(groupeLib(t.groupe))}</td><td class="r"><span class="pill ${t.s/t.n<2.5?"bad":t.s/t.n<3.5?"warn":"ok"}">${(t.s/t.n).toFixed(1).replace(".",",")}</span></td>${CRIT_TUT.map(([k])=>`<td class="r">${(t.c[k]/t.n).toFixed(1).replace(".",",")}</td>`).join("")}<td class="r">${t.n}</td><td class="small">${dFR(t.der)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Aucune note pour l'instant.</div>`}`;
    }
  }
  return `<h2>${del&&!sup?"Mon espace délégué":"Délégués de spécialité"}</h2>${del&&!sup?`<p class="small muted">${esc(groupeLib(monG) || "Groupe non renseigné")}</p>`:""}
    <div class="subtabs" role="group" aria-label="Délégués">${onglets.map(([k,l])=>`<button data-dsub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function bindDelegues(){
  const M = $("#main");
  M.querySelectorAll("[data-dsub]").forEach(b => b.onclick = () => { S.sub.delegues = b.dataset.dsub; render(); });
  $("#newDC") && ($("#newDC").onclick = () => formDemandeCours($("#newDC").dataset.type));
  $("#newRD") && ($("#newRD").onclick = () => formRapportDelegue());
  M.querySelectorAll("[data-dc]").forEach(b => b.onclick = () => ficheDemandeCours(b.dataset.dc));
  M.querySelectorAll("[data-rd]").forEach(b => b.onclick = () => ficheRapportDelegue(b.dataset.rd));
  M.querySelectorAll("[data-nt]").forEach(b => b.onclick = () => formNoteTuteur(b.dataset.nt));
  M.querySelectorAll("[data-ntv]").forEach(b => b.onclick = () => ficheNotesTuteur(b.dataset.ntv));
}

/* ---------------- Demandes de cours et cours à expliquer ---------------- */
function formDemandeCours(type){
  const c = compte(), cours = type==="cours";
  if (!c.specialite) return toast("Votre spécialité n'est pas renseignée : demandez à la Présidence de compléter votre compte.");
  openSheet(`<h2>${cours?"Déposer un cours à expliquer":"Nouvelle demande de cours"}</h2><p class="small muted">${esc(groupeLib(groupeDe(c)))} · ${esc(semLib(semCourante()))}</p>
    <label class="f" for="dc_m">${cours?"Cours / matière concerné(e)":"Cours demandé"}<input type="text" id="dc_m" maxlength="120" placeholder="Ex. : Algorithmique — les boucles"></label>
    <label class="f" for="dc_b">${cours?"Points à expliquer, en détail":"Besoin du groupe"}<textarea id="dc_b" maxlength="3000" style="min-height:140px" placeholder="${cours?"Chapitres, pages, exercices précis, ce qui n'a pas été compris…":"Pourquoi ce cours, ce que le groupe attend, le niveau actuel…"}"></textarea></label>
    <label class="f" for="dc_l">Lien vers le document du cours${cours?"":" (facultatif)"}<input type="url" id="dc_l" maxlength="500" placeholder="https://drive.google.com/…"><span class="hint">Déposez le fichier (PDF, photo, document) dans Google Drive, choisissez « Partager › Toute personne disposant du lien », puis collez le lien ici.</span></label>
    <div class="g2"><label class="f" for="dc_n">Étudiants concernés<input type="number" id="dc_n" min="1" max="500"></label><label class="f" for="dc_u">Urgence<select id="dc_u">${opts(["Normale","Urgente"],"Normale")}</select></label></div>
    <label class="f" for="dc_d">Date souhaitée (facultatif)<input type="date" id="dc_d" min="${today()}"></label>
    <div class="row"><button class="btn primary" id="dc_ok">Envoyer</button><button class="btn" data-close>Annuler</button></div>`);
  $("#dc_ok").onclick = async () => {
    const matiere = $("#dc_m").value.trim(), besoin = $("#dc_b").value.trim(), lien = $("#dc_l").value.trim();
    if (!matiere) return toast("Indiquez le cours concerné.");
    if (besoin.length < 20) return toast("Détaillez le besoin (au moins une ou deux phrases).");
    if (cours && !lien) return toast("Collez le lien vers le document du cours.");
    if (lien && !/^https?:\/\//i.test(lien)) return toast("Le lien doit commencer par https://");
    const id = gid("DC"), g = groupeDe(c);
    const data = {type:cours?"cours":"demande", matiere, besoin, lien, nbEtudiants:Number($("#dc_n").value)||null, urgence:$("#dc_u").value, dateSouhaitee:$("#dc_d").value||"", semaine:semCourante(), groupe:g, specialite:c.specialite, niveau:c.niveau||"", delegueEmail:S.email, delegueNom:c.nom, statut:"Soumise", reponse:"", creeLe:nowISO(), historique:[trace("Soumission","Soumise")]};
    if (await write(()=>S.db.doc("demandes_cours/"+id).set(data), cours?"Cours déposé":"Demande envoyée")){
      log("delegue", `${cours?"Cours à expliquer":"Demande de cours"} · ${groupeLib(g)} : ${matiere}`, ["formation","tuteurs","accompagnement", ...tuteursDuGroupe(g).map(t=>"e:"+t.em)]);
      closeSheet();
    }
  };
}
function ficheDemandeCours(id){
  const d = S.demandesCours.find(x=>x.id===id); if (!d) return toast("Introuvable.");
  const traite = aRole("formation","tuteurs") || (estTuteurR() && d.groupe===groupeDe(compte()));
  const ouverte = ["Soumise","Prise en charge"].includes(d.statut);
  openSheet(`<div class="spread"><h2>${esc(d.matiere)}</h2><span class="pill">${esc(d.statut)}</span></div>
    <p class="small muted">${esc(dcType(d.type))} · ${esc(groupeLib(d.groupe))} · ${esc(d.delegueNom)} · ${dtFR(d.creeLe)}</p>
    <div class="quote">${esc(d.besoin)}</div>
    <dl class="dl">${d.nbEtudiants?`<dt>Étudiants concernés</dt><dd>${esc(d.nbEtudiants)}</dd>`:""}<dt>Urgence</dt><dd>${esc(d.urgence)}</dd>${d.dateSouhaitee?`<dt>Date souhaitée</dt><dd>${dFR(d.dateSouhaitee)}</dd>`:""}</dl>
    ${d.lien?`<div class="row"><a class="btn" href="${esc(d.lien)}" target="_blank" rel="noopener noreferrer">📎 Ouvrir le document</a></div>`:""}
    ${d.reponse?`<h3>Réponse</h3><div class="quote">${esc(d.reponse)}</div>`:""}
    ${traite && ouverte?`<label class="f" for="dc_r">Réponse au délégué<textarea id="dc_r" maxlength="1500" placeholder="Qui assure le cours, quand, où ; ou le motif du refus.">${esc(d.reponse||"")}</textarea></label>
      <div class="row">${d.statut==="Soumise"?`<button class="btn primary" data-dcs="Prise en charge">Prendre en charge</button>`:""}<button class="btn vert" data-dcs="Traitée">Marquer comme traitée</button>${aRole("formation","tuteurs")?`<button class="btn danger" data-dcs="Refusée">Refuser</button>`:""}</div>`:""}
    <details><summary class="small">Historique</summary>${(d.historique||[]).map(h=>`<div class="small">${dtFR(h.le)} · ${esc(h.par)} (${esc(h.fonction)}) · ${esc(h.action)}${h.obs?` : ${esc(h.obs)}`:""}</div>`).join("")}</details>
    <div class="row"><button class="btn ghost" data-close>Fermer</button></div>`);
  $("#sheet").querySelectorAll("[data-dcs]").forEach(b => b.onclick = async () => {
    const st = b.dataset.dcs, rep = $("#dc_r").value.trim();
    if (st!=="Prise en charge" && rep.length < 5) return toast(st==="Refusée" ? "Indiquez le motif du refus." : "Indiquez comment la demande a été traitée.");
    if (await write(()=>S.db.doc("demandes_cours/"+id).update({statut:st, reponse:rep, majLe:nowISO(), historique:ajoute(d.historique, trace(st, st, rep))}), "Demande mise à jour")){
      log("delegue", `${dcType(d.type)} « ${d.matiere} » : ${st.toLowerCase()}`, ["e:"+d.delegueEmail]); closeSheet();
    }
  });
}

/* ---------------- Rapport hebdomadaire du délégué ---------------- */
const RD_CHAMPS = [["cours","Cours suivis cette semaine et avancement","Matières vues, chapitres, devoirs et évaluations en cours."],["besoins","Besoins du groupe","Cours à expliquer, ressources, matériel, connexion…"],["difficultes","Difficultés rencontrées","Matières difficiles, étudiants en difficulté ou absents (sans détail personnel sensible)."],["tutorat","Déroulement du tutorat","Séances tenues ou non, participation, ce qui a bien ou mal fonctionné."],["propositions","Propositions du groupe","Ce que le groupe suggère pour la semaine prochaine."]];
function formRapportDelegue(r){
  const c = compte(), sem = r?.semaine || semCourante();
  if (!c.specialite) return toast("Votre spécialité n'est pas renseignée : demandez à la Présidence de compléter votre compte.");
  const ex = r || S.rapportsDelegues.find(x=>x.delegueEmail===S.email && x.semaine===sem);
  if (ex && !["Brouillon","Retourné"].includes(ex.statut)) return ficheRapportDelegue(ex.id);
  const retour = ex?.statut==="Retourné" ? (ex.historique||[]).filter(h=>h.statut==="Retourné").pop() : null;
  openSheet(`<h2>Rapport de la ${esc(semLib(sem))}</h2><p class="small muted">${esc(groupeLib(groupeDe(c)))}</p>
    ${retour?`<div class="banner"><b>Rapport retourné par ${esc(retour.par)}</b> : ${esc(retour.obs)}</div>`:""}
    <div class="g2"><label class="f" for="rd_e">Effectif du groupe<input type="number" id="rd_e" min="1" max="500" value="${esc(ex?.effectif||"")}"></label><label class="f" for="rd_p">Étudiants actifs cette semaine<input type="number" id="rd_p" min="0" max="500" value="${esc(ex?.actifs??"")}"></label></div>
    <label class="f" for="rd_a">Ambiance et motivation du groupe<select id="rd_a">${opts(Object.entries(PARTICIPATION).map(([k,l])=>[k,`${k} · ${l}`]), ex?.ambiance||3)}</select></label>
    ${RD_CHAMPS.map(([k,l,ph])=>`<label class="f" for="rd_${k}">${l}<textarea id="rd_${k}" maxlength="2500" placeholder="${esc(ph)}">${esc(ex?.[k]||"")}</textarea></label>`).join("")}
    <label class="f" for="rd_l">Lien vers une pièce jointe (facultatif)<input type="url" id="rd_l" maxlength="500" value="${esc(ex?.lien||"")}" placeholder="https://drive.google.com/…"></label>
    <div class="row"><button class="btn primary" id="rd_ok">Soumettre le rapport</button><button class="btn" id="rd_br">Enregistrer le brouillon</button><button class="btn ghost" data-close>Annuler</button></div>`);
  const envoyer = async statut => {
    const data = {semaine:sem, groupe:groupeDe(c), specialite:c.specialite, niveau:c.niveau||"", delegueEmail:S.email, delegueNom:c.nom, effectif:Number($("#rd_e").value)||null, actifs:$("#rd_p").value===""?null:Number($("#rd_p").value), ambiance:Number($("#rd_a").value), lien:$("#rd_l").value.trim(), statut, visas:{}, creeLe:ex?.creeLe||nowISO(), majLe:nowISO(), historique:ajoute(ex?.historique, trace(statut==="Soumis"?(ex?.statut==="Retourné"?"Nouvelle soumission":"Soumission"):"Brouillon", statut))};
    for (const [k] of RD_CHAMPS) data[k] = $("#rd_"+k).value.trim();
    if (statut==="Soumis"){
      if (!data.effectif) return toast("Indiquez l'effectif du groupe.");
      if (data.cours.length < 15 || data.besoins.length < 15) return toast("Renseignez au moins les cours suivis et les besoins du groupe.");
      if (data.lien && !/^https?:\/\//i.test(data.lien)) return toast("Le lien doit commencer par https://");
    }
    if (await write(()=>S.db.doc(`rapports_delegues/${S.email}_${sem}`).set(data), statut==="Soumis"?"Rapport soumis pour contrôle":"Brouillon enregistré")){
      if (statut==="Soumis") log("delegue", `Rapport du délégué ${c.nom} · ${groupeLib(data.groupe)} · ${semLib(sem)} à contrôler`, ["tuteurs","accompagnement","formation", ...tuteursDuGroupe(data.groupe).map(t=>"e:"+t.em)]);
      closeSheet();
    }
  };
  $("#rd_ok").onclick = () => envoyer("Soumis"); $("#rd_br").onclick = () => envoyer("Brouillon");
}
function ficheRapportDelegue(id){
  const r = S.rapportsDelegues.find(x=>x.id===id); if (!r) return toast("Rapport introuvable.");
  const moi = r.delegueEmail===S.email;
  if (moi && ["Brouillon","Retourné"].includes(r.statut)) return formRapportDelegue(r);
  const aFaire = r.statut==="Soumis" ? mesVisas(r).filter(k=>!r.visas?.[k]) : [];
  openSheet(`<div class="spread"><h2>${esc(groupeLib(r.groupe))}</h2><span class="pill ${nbVisas(r)===4?"ok":""}">${esc(r.statut)} · ${nbVisas(r)}/4 visas</span></div>
    <p class="small muted">Rapport de ${esc(r.delegueNom)} · ${esc(semLib(r.semaine))}</p>
    <dl class="dl"><dt>Effectif</dt><dd>${esc(r.effectif??"—")}${r.actifs!=null?` · ${esc(r.actifs)} actifs cette semaine`:""}</dd><dt>Ambiance</dt><dd>${esc(r.ambiance)} /5 · ${esc(PARTICIPATION[r.ambiance]||"")}</dd></dl>
    ${RD_CHAMPS.map(([k,l])=>r[k]?`<h3>${l}</h3><div class="quote">${esc(r[k])}</div>`:"").join("")}
    ${r.lien?`<div class="row"><a class="btn" href="${esc(r.lien)}" target="_blank" rel="noopener noreferrer">📎 Pièce jointe</a></div>`:""}
    <h3>Contrôle</h3>
    ${VISAS.map(([k,l])=>{ const v = r.visas?.[k]; return `<div class="prow"><span><b>${l}</b>${v?`<br><span class="small muted">${esc(v.par)} · ${dtFR(v.le)}</span>${v.obs?`<br><span class="small">${esc(v.obs)}</span>`:""}`:""}</span><span class="pill ${v?"ok":"warn"}">${v?"Contrôlé":"En attente"}</span></div>`; }).join("")}
    ${aFaire.length?`<label class="f" for="rd_o">Mes observations<textarea id="rd_o" maxlength="1500" placeholder="Obligatoire pour retourner le rapport."></textarea></label>
      <div class="row"><button class="btn vert" id="rdVisa">Contrôlé : apposer mon visa${aFaire.length>1?` (${aFaire.length} fonctions)`:""}</button><button class="btn danger" id="rdRet">Retourner au délégué</button></div>`:""}
    <details><summary class="small">Historique</summary>${(r.historique||[]).map(h=>`<div class="small">${dtFR(h.le)} · ${esc(h.par)} (${esc(h.fonction)}) · ${esc(h.action)}${h.obs?` : ${esc(h.obs)}`:""}</div>`).join("")}</details>
    <div class="row"><button class="btn ghost" data-close>Fermer</button></div>`);
  $("#rdVisa") && ($("#rdVisa").onclick = async () => {
    const obs = $("#rd_o").value.trim(), visas = {...(r.visas||{})};
    for (const k of aFaire) visas[k] = {par:compte().nom, email:S.email, le:nowISO(), obs};
    if (await write(()=>S.db.doc("rapports_delegues/"+id).update({visas, historique:ajoute(r.historique, trace("Visa : "+aFaire.map(k=>VISAS.find(v=>v[0]===k)[1]).join(", "), "Soumis", obs))}), "Visa apposé")){
      if (obs) log("delegue", `Observation sur votre rapport (${semLib(r.semaine)}) : ${obs}`, ["e:"+r.delegueEmail]); closeSheet();
    }
  });
  $("#rdRet") && ($("#rdRet").onclick = async () => {
    const obs = $("#rd_o").value.trim(); if (obs.length < 10) return toast("Expliquez ce qui doit être corrigé.");
    if (await write(()=>S.db.doc("rapports_delegues/"+id).update({statut:"Retourné", historique:ajoute(r.historique, trace("Retour au délégué", "Retourné", obs))}), "Rapport retourné")){
      log("delegue", `Votre rapport (${semLib(r.semaine)}) est retourné : ${obs}`, ["e:"+r.delegueEmail]); closeSheet();
    }
  });
}

/* ---------------- Notation hebdomadaire des tuteurs ---------------- */
function formNoteTuteur(em){
  const t = S.comptes[em], c = compte(), sem = semCourante(); if (!t) return;
  const ex = S.notesTuteurs.find(n=>n.delegueEmail===S.email && n.tuteurEmail===em && n.semaine===sem);
  openSheet(`<h2>Noter ${esc(t.nom)}</h2><p class="small muted">${esc(semLib(sem))} · de 1 (insuffisant) à 5 (excellent)</p>
    ${CRIT_TUT.map(([k,l])=>`<label class="f" for="nt_${k}">${l}<select id="nt_${k}">${opts([1,2,3,4,5].map(v=>[v,`${v} · ${PARTICIPATION[v]}`]), ex?.criteres?.[k], "Choisir…")}</select></label>`).join("")}
    <label class="f" for="nt_s">Séances tenues cette semaine<input type="number" id="nt_s" min="0" max="14" value="${esc(ex?.seances??"")}"></label>
    <label class="f" for="nt_c">Commentaire<textarea id="nt_c" maxlength="1000" placeholder="Obligatoire si une note est inférieure à 3 : des faits précis.">${esc(ex?.commentaire||"")}</textarea></label>
    <p class="hint">Notez au nom du groupe, sur des faits. Le tuteur ne voit pas votre note individuelle.</p>
    <div class="row"><button class="btn primary" id="nt_ok">Enregistrer la note</button><button class="btn" data-close>Annuler</button></div>`);
  $("#nt_ok").onclick = async () => {
    const criteres = {}; for (const [k] of CRIT_TUT){ const v = Number($("#nt_"+k).value); if (!v) return toast("Notez chaque critère."); criteres[k] = v; }
    const vals = Object.values(criteres), note = vals.reduce((a,b)=>a+b,0)/vals.length, commentaire = $("#nt_c").value.trim();
    if (vals.some(v=>v<3) && commentaire.length < 15) return toast("Une note inférieure à 3 doit être justifiée par un commentaire précis.");
    const tuteurKey = ek(em), data = {delegueEmail:S.email, delegueNom:c.nom, tuteurEmail:em, tuteurKey, tuteurNom:t.nom, groupe:groupeDe(c), semaine:sem, criteres, note, seances:$("#nt_s").value===""?null:Number($("#nt_s").value), commentaire, le:nowISO()};
    if (await write(()=>S.db.doc(`notes_tuteurs/${S.email}_${tuteurKey}_${sem}`).set(data), "Note enregistrée")){
      if (!ex) log("delegue", `Note hebdomadaire d'un tuteur par le délégué ${groupeLib(data.groupe)} : ${t.nom} ${note.toFixed(1).replace(".",",")}/5`, ["tuteurs"]);
      closeSheet();
    }
  };
}
function ficheNotesTuteur(em){
  const L = S.notesTuteurs.filter(n=>n.tuteurEmail===em).sort((a,b)=>String(b.semaine).localeCompare(String(a.semaine)));
  openSheet(`<h2>${esc(L[0]?.tuteurNom||nomDe(em))}</h2><p class="small muted">Notes hebdomadaires des délégués</p>
    ${L.map(n=>`<div class="card"><div class="spread"><b>${esc(semLib(n.semaine))}</b><span class="pill ${n.note<2.5?"bad":n.note<3.5?"warn":"ok"}">${n.note.toFixed(1).replace(".",",")} /5</span></div>
      <p class="small muted">Par ${esc(n.delegueNom)} · ${esc(groupeLib(n.groupe))}${n.seances!=null?` · ${esc(n.seances)} séance(s) tenue(s)`:""}</p>
      <p class="small">${CRIT_TUT.map(([k,l])=>`${esc(l.split(" ")[0])} ${esc(n.criteres?.[k]??"—")}`).join(" · ")}</p>${n.commentaire?`<div class="quote">${esc(n.commentaire)}</div>`:""}</div>`).join("")}
    <div class="row"><button class="btn ghost" data-close>Fermer</button></div>`);
}

/* ---------------- Tableau de bord du délégué ---------------- */
function vDashDelegue(){
  const E = etatDelegue(), c = compte(), jour = (parseD(today()).getDay()+6)%7;
  const ligne = (ok, titre, detail, sub, bouton) => `<div class="prow"><span><b>${ok?"✅":"⬜"} ${titre}</b><br><span class="small muted">${detail}</span></span><a class="btn sm ${ok?"ghost":"primary"}" href="#delegues" data-dgo="${sub}">${bouton}</a></div>`;
  const ret = S.rapportsDelegues.find(r=>r.delegueEmail===S.email && r.statut==="Retourné");
  return `${ret?`<div class="banner"><b>Rapport retourné</b> (${esc(semLib(ret.semaine))}) : corrigez-le et soumettez-le de nouveau. <a href="#delegues" data-dgo="rapports">Ouvrir</a></div>`:""}
    <div class="card"><h3>Mes obligations de la ${esc(semLib(E.sem))}</h3><p class="small muted">Délégué · ${esc(groupeLib(groupeDe(c)) || "groupe non renseigné")}</p>
    ${ligne(E.cours.length>0, "Cours à faire expliquer (dépôt du lundi)", E.cours.length ? `${E.cours.length} cours déposé(s) cette semaine` : jour===0 ? "À déposer aujourd'hui" : "Aucun cours déposé cette semaine", "cours", "Déposer")}
    ${ligne(E.rap && E.rap.statut!=="Brouillon", "Rapport hebdomadaire de la spécialité", E.rap ? `${E.rap.statut}${E.rap.statut==="Soumis"?` · ${nbVisas(E.rap)}/4 visas`:""}` : "À soumettre avant dimanche soir", "rapports", E.rap?"Voir":"Rédiger")}
    ${ligne(E.tuts.length>0 && !E.resteNotes.length, "Noter les tuteurs du groupe", E.tuts.length ? `${E.tuts.length-E.resteNotes.length}/${E.tuts.length} tuteur(s) noté(s)` : "Aucun tuteur rattaché à votre groupe", "notes", "Noter")}
    </div>
    <div class="card"><div class="spread"><h3>Mes demandes de cours</h3><a class="small" href="#delegues" data-dgo="demandes">Tout voir</a></div>
    ${S.demandesCours.filter(d=>d.delegueEmail===S.email).sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe))).slice(0,4).map(d=>`<button class="citem" data-dc="${esc(d.id)}"><span class="t">${esc(d.matiere)}</span><span class="m"><span class="pill">${esc(d.statut)}</span><span>${esc(dcType(d.type))}</span>${d.reponse?"<span>· réponse reçue</span>":""}</span></button>`).join("") || '<p class="small muted">Aucune demande pour l\'instant.</p>'}</div>`;
}
function bindDeleguesCommun(){
  const M = $("#main");
  M.querySelectorAll("[data-dgo]").forEach(a => a.addEventListener("click", () => { S.sub.delegues = a.dataset.dgo; }));
  M.querySelectorAll("[data-dc]").forEach(b => b.onclick = () => ficheDemandeCours(b.dataset.dc));
}
/* Alertes : rapports de délégués à contrôler, demandes en attente, obligations du délégué */
function alertesDelegues(){
  const A = [], r = role();
  const aViser = S.rapportsDelegues.filter(x=>x.statut==="Soumis" && mesVisas(x).some(k=>!x.visas?.[k]));
  if (aViser.length) A.push({niv:"warn", titre:`${aViser.length} rapport(s) de délégué à contrôler`, detail:aViser.slice(0,3).map(x=>`${groupeLib(x.groupe)} (${x.delegueNom})`).join(" · "), pour:[r], lien:r==="tuteur"?"#t-delegues":"#delegues"});
  if (aRole("formation","tuteurs") && !presidence()){ const att = S.demandesCours.filter(d=>d.statut==="Soumise"); if (att.length) A.push({niv:"warn", titre:`${att.length} demande(s) de cours de délégués en attente`, detail:att.slice(0,3).map(d=>`${groupeLib(d.groupe)} : ${d.matiere}`).join(" · "), pour:[r], lien:"#delegues"}); }
  if (estDelegue() && !presidence()){ const E = etatDelegue(), j = (parseD(today()).getDay()+6)%7;
    if (!E.cours.length) A.push({niv:j===0?"warn":"info", titre:"Cours à faire expliquer : dépôt du lundi", detail:"Aucun cours déposé cette semaine.", pour:[r], lien:"#delegues"});
    if (j>=4 && (!E.rap || E.rap.statut==="Brouillon")) A.push({niv:"warn", titre:"Rapport hebdomadaire de la spécialité à soumettre", detail:semLib(E.sem), pour:[r], lien:"#delegues"});
    if (j>=4 && E.resteNotes.length) A.push({niv:"info", titre:`${E.resteNotes.length} tuteur(s) à noter cette semaine`, detail:E.resteNotes.map(t=>t.nom).join(", "), pour:[r], lien:"#delegues"});
  }
  return A;
}
function abonnerDelegues(){
  const db = S.db, fusion = (cle, part) => s => { S["_"+cle] ||= {}; S["_"+cle][part] = rows(s); S[cle] = [...new Map(Object.values(S["_"+cle]).flat().map(x=>[x.id,x])).values()]; };
  const cols = [["demandes_cours","demandesCours"],["rapports_delegues","rapportsDelegues"]];
  if (supDelegues()) cols.forEach(([p,k]) => sub(p, k, s => { S[k] = rows(s); }));
  else {
    if (estDelegue()) cols.forEach(([p,k]) => sub(p, k, fusion(k,"moi"), db.collection(p).where("delegueEmail","==",S.email)));
    if (estTuteurR()) cols.forEach(([p,k]) => sub(p, k, fusion(k,"groupe"), db.collection(p).where("groupe","==",groupeDe(compte()))));
  }
  if (voitNotesTut()) sub("notes_tuteurs","notesTuteurs", s => { S.notesTuteurs = rows(s); });
  else if (estDelegue()) sub("notes_tuteurs","notesTuteurs", s => { S.notesTuteurs = rows(s); }, db.collection("notes_tuteurs").where("delegueEmail","==",S.email));
}

/* =====================================================================
   Activité de l'équipe (Présidence et Vice-présidence) : qui a fait quoi
   ===================================================================== */
const CAT_ACT = {resp:["Responsables",["secretaire","vicepresident","encaissement","caisse","tresorerie","formation","tuteurs","accompagnement","responsable"]], tut:["Tuteurs",["tuteur"]], del:["Délégués",["delegue"]], aut:["Autres",["pedagogie","membre"]]};
const catDeRole = r => Object.keys(CAT_ACT).find(k=>CAT_ACT[k][1].includes(r)) || "aut";
const heureFR = d => new Date(d).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function etatActivite(){
  const f = S.act ||= {cat:"", per:7};
  const depuis = f.per===1 ? today() : addJ(today(), -(f.per-1));
  const J = S.journal.filter(j=>j.par!==S.uid && j.role!=="president" && String(j.le).slice(0,10) >= depuis && (!f.cat || catDeRole(j.role)===f.cat));
  const gens = actifsTous().filter(c=>c.role!=="president" && c.em!==S.email && (!f.cat || rolesDe(c).some(r=>catDeRole(r)===f.cat)));
  const par = new Map();
  for (const j of J){ const p = par.get(j.par) || {uid:j.par, nom:j.parNom, role:j.role, n:0, der:j}; p.n++; if (j.le > p.der.le) p.der = j; par.set(j.par, p); }
  const inactifs = gens.filter(c=>!c.uid || !par.has(c.uid));
  return {f, J, gens, par:[...par.values()].sort((a,b)=>b.n-a.n), inactifs};
}
function blocActivite(){
  try {
    const E = etatActivite(), f = E.f;
    return `<div class="card" id="actEq"><div class="spread"><h3>Activité de l'équipe</h3><a class="small" href="#admin" data-goto-journal>Journal complet</a></div>
      <p class="small muted">Les actions de chacun dans l'application : responsables, tuteurs, délégués et autres membres.</p>
      <div class="subtabs" role="group" aria-label="Catégorie">${[["","Tous"],...Object.entries(CAT_ACT).map(([k,v])=>[k,v[0]])].map(([k,l])=>`<button data-actc="${k}" aria-pressed="${f.cat===k}">${l}</button>`).join("")}</div>
      <div class="subtabs" role="group" aria-label="Période">${[[1,"Aujourd'hui"],[7,"7 jours"],[30,"30 jours"]].map(([k,l])=>`<button data-actp="${k}" aria-pressed="${f.per===k}">${l}</button>`).join("")}</div>
      <div class="kpis">${kpi(E.J.length,"actions")}${kpi(`${E.par.length} / ${E.gens.length}`,"personnes actives","g")}${kpi(E.inactifs.length,"sans aucune action",E.inactifs.length?"bad":"g")}</div>
      ${E.par.length?`<h3>Par personne</h3>${E.par.map(p=>`<button class="citem" data-actu="${esc(p.uid)}"><span class="t">${esc(p.nom)} <span class="pill">${p.n} action${p.n>1?"s":""}</span></span><span class="m"><span>${esc(ROLES[p.role]?.l||"")}</span><span>· dernière : ${heureFR(p.der.le)}</span></span><span class="m"><span style="white-space:normal">${esc(p.der.texte)}</span></span></button>`).join("")}`:`<div class="empty">Aucune action sur cette période.</div>`}
      ${E.inactifs.length?`<details><summary class="small"><b>Sans aucune action sur la période (${E.inactifs.length})</b></summary>${E.inactifs.map(c=>`<div class="prow"><span>${esc(c.nom)}<br><span class="small muted">${esc(ROLES[c.role]?.l||"")}</span></span><span class="pill ${c.uid?"warn":"bad"}">${c.uid ? (c.derniereConnexion ? "vu le "+new Date(c.derniereConnexion).toLocaleDateString("fr-FR",{day:"numeric",month:"short"}) : "connecté") : "Jamais connecté"}</span></div>`).join("")}</details>`:""}
      ${E.J.length?`<details open><summary class="small"><b>Dernières actions</b></summary>${E.J.slice(0,15).map(j=>`<div class="prow"><span style="white-space:normal"><b>${esc(j.parNom)}</b> <span class="small muted">· ${esc(ROLES[j.role]?.l||"")} · ${heureFR(j.le)}</span><br><span class="small">${esc(j.texte)}</span></span></div>`).join("")}</details>`:""}
      <p class="small muted">Calculé sur les ${S.journal.length} dernières actions enregistrées. « Vu le » indique la dernière connexion.</p></div>`;
  } catch(e){ console.error(e); return ""; }
}
function bindActivite(){
  const M = $("#main"), garder = () => { const y = scrollY; render(); scrollTo(0, y); };
  M.querySelectorAll("[data-actc]").forEach(b => b.onclick = () => { S.act.cat = b.dataset.actc; garder(); });
  M.querySelectorAll("[data-actp]").forEach(b => b.onclick = () => { S.act.per = Number(b.dataset.actp); garder(); });
  M.querySelectorAll("[data-goto-journal]").forEach(a => a.addEventListener("click", () => { S.sub.admin = "journal"; }));
  M.querySelectorAll("[data-actu]").forEach(b => b.onclick = () => {
    const L = S.journal.filter(j=>j.par===b.dataset.actu); if (!L.length) return;
    openSheet(`<div class="spread"><h2>${esc(L[0].parNom)}</h2><button class="btn ghost" data-close>Fermer</button></div><p class="small muted">${esc(ROLES[L[0].role]?.l||"")} · ${L.length} action(s) enregistrée(s)</p>
      ${L.map(j=>`<div class="prow"><span style="white-space:normal"><span class="small muted">${heureFR(j.le)}</span><br>${esc(j.texte)}</span></div>`).join("")}`);
  });
}

/* =====================================================================
   ESPACE RESPONSABLES (intégré) : rapport hebdomadaire de chaque
   responsable et score d'implication mensuel
   (tâches à temps 50 %, présence aux réunions 30 %, rapports 20 %)
   ===================================================================== */
const ROLES_EQUIPE = ["secretaire","vicepresident","encaissement","caisse","formation","tuteurs","accompagnement","responsable","membre"];
const dansEquipe = c => !!c && c.role!=="president" && rolesDe(c).some(r=>ROLES_EQUIPE.includes(r));
const equipeActive = () => actifsTous().filter(dansEquipe);
const jeSuisEquipe = () => !presidence() && dansEquipe(compte());
const reId = (em, s) => `${em}_${s}`;
const POIDS_IMP = {taches:.5, presence:.3, rapports:.2};
/* Première semaine où le rapport hebdomadaire des responsables est exigé (les semaines antérieures ne comptent pas) */
const debutRE = () => P().equipeDebut || "2026-11-16";
function scoreImplication(em, ym){
  const [y,m] = ym.split("-").map(Number), debut = isoD(new Date(y,m-1,1)), fin = isoD(new Date(y,m,0)), t = today(), finEff = fin < t ? fin : t;
  let tn=0, tv=0, pn=0, pv=0, rn=0, rv=0;
  if (debut <= t){
    for (const x of S.taches){
      if (x.dest!==em || !x.echeance || x.statut==="Annulée") continue;
      const fait = x.statut==="Terminée" ? String(((x.historique||[]).filter(h=>h.statut==="Terminée").pop()||{}).le || x.majLe || "").slice(0,10) : null;
      if (x.echeance >= debut && x.echeance <= finEff){ tn++; if (fait) tv += fait <= x.echeance ? 1 : .5; }
      else if (x.echeance > finEff && fait && fait >= debut && fait <= finEff){ tn++; tv++; }
    }
    for (const r of S.reunions){
      const d = String(r.debut||"").slice(0,10);
      if (!d || d < debut || d > finEff || r.statut==="Annulée" || !(r.convoques||[]).includes(em)) continue;
      const p = r.presences?.[ek(em)]; if (!p || p==="Convoqué") continue;
      pn++; pv += p==="Présent" ? 1 : p==="Excusé" ? .5 : 0;
    }
    let lun = lundiDe(debut); if (lun < debut) lun = addJ(lun, 7);
    while (lun <= fin){ if (addJ(lun,6) < t && lun >= debutRE()){ rn++; if (S.rapportsEquipe.some(r=>r.email===em && r.semaine===lun)) rv++; } lun = addJ(lun, 7); }
  }
  const c = {taches: tn ? tv/tn : null, presence: pn ? pv/pn : null, rapports: rn ? rv/rn : null};
  let sw=0, s=0; for (const k in POIDS_IMP) if (c[k]!=null){ s += c[k]*POIDS_IMP[k]; sw += POIDS_IMP[k]; }
  return {...c, global: sw ? s/sw : null, n:{tn, tv, pn, pv, rn, rv}};
}
const niveauImp = v => v==null ? {l:"Pas de données", c:"mute"} : v>=.8 ? {l:"Très impliqué", c:"ok"} : v>=.6 ? {l:"Impliqué", c:"ok"} : v>=.4 ? {l:"À relancer", c:"warn"} : {l:"Alerte", c:"bad"};

function vEquipe(){
  const moi = jeSuisEquipe(), sup = gouvSup(), chef = mesComsResp().length>0;
  const onglets = [...(moi?[["rapport","Mon rapport"]]:[]), ...((sup||chef)?[["rapports","Rapports de l'équipe"]]:[]), ["implication", sup?"Implication":"Mon implication"]];
  const sub = onglets.some(o=>o[0]===S.sub.equipe) ? S.sub.equipe : onglets[0][0];
  const sem = semCourante(), prec = addJ(sem,-7);
  let body = "";
  if (sub==="rapport"){
    const r = S.rapportsEquipe.find(x=>x.email===S.email && x.semaine===sem);
    const anciens = S.rapportsEquipe.filter(x=>x.email===S.email && x.semaine!==sem).sort((a,b)=>String(b.semaine).localeCompare(String(a.semaine))).slice(0,6);
    body = `<form id="ref" class="form card"><div class="spread"><h3>Mon rapport · ${esc(semLib(sem))}</h3>${r?'<span class="pill ok">Déposé</span>':'<span class="pill bad">À déposer avant dimanche</span>'}</div>
      <label class="f" for="re1">Ce que j'ai fait cette semaine<textarea id="re1" maxlength="1500" placeholder="Actions menées, résultats obtenus.">${esc(r?.fait||"")}</textarea></label>
      <label class="f" for="re2">Difficultés ou besoins<textarea id="re2" maxlength="1000">${esc(r?.difficultes||"")}</textarea></label>
      <label class="f" for="re3">Ce que je prévois la semaine prochaine<textarea id="re3" maxlength="1000">${esc(r?.prevu||"")}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">${r?"Mettre à jour":"Déposer mon rapport"}</button></div></form>
      ${anciens.length?`<div class="card"><h3>Mes rapports précédents</h3>${anciens.map(x=>`<details><summary class="small"><b>${esc(semLib(x.semaine))}</b></summary><p class="small"><b>Fait :</b> ${esc(x.fait)}</p>${x.difficultes?`<p class="small"><b>Difficultés :</b> ${esc(x.difficultes)}</p>`:""}${x.prevu?`<p class="small"><b>Prévu :</b> ${esc(x.prevu)}</p>`:""}</details>`).join("")}</div>`:""}`;
  }
  if (sub==="rapports"){
    const E = sup ? equipeActive() : equipeActive().filter(c=>(c.commissions||[]).some(k=>mesComsResp().includes(k)));
    const etat = w => E.map(c=>{ const ok = S.rapportsEquipe.some(r=>r.email===c.em && r.semaine===w); return `<span class="pill ${ok?"ok":"bad"}">${ok?"✓":"✗"} ${esc(c.nom)}</span>`; }).join(" ");
    const L = S.rapportsEquipe.filter(r=>E.some(c=>c.em===r.email)).sort((a,b)=>(String(b.semaine)+String(b.majLe)).localeCompare(String(a.semaine)+String(a.majLe))).slice(0,40);
    const manq = E.filter(c=>!S.rapportsEquipe.some(r=>r.email===c.em && r.semaine===prec));
    body = `${prec < debutRE() ? `<div class="banner">Le rapport hebdomadaire des responsables est exigé à partir de la ${esc(semLib(debutRE()))}. Les semaines précédentes ne comptent pas dans l'implication.</div>` : ""}<div class="kpis">${kpi(`${E.length-manq.length} / ${E.length}`,`rapports déposés · ${semLib(prec).replace("semaine du","sem. du")}`,"g")}${kpi(manq.length,"rapports manquants",manq.length?"bad":"g")}</div>
      <div class="card"><h3>Dépôts</h3><p class="small muted">Semaine en cours (${esc(semLib(sem))})</p><div class="row">${etat(sem) || '<span class="small muted">Aucun responsable.</span>'}</div><p class="small muted">Semaine précédente</p><div class="row">${etat(prec)}</div></div>
      <div class="card"><h3>Derniers rapports</h3>${L.map(r=>`<details><summary><b>${esc(r.nom)}</b> <span class="small muted">· ${esc(semLib(r.semaine))}</span></summary><p class="small"><b>Fait :</b> ${esc(r.fait)}</p>${r.difficultes?`<p class="small"><b>Difficultés :</b> ${esc(r.difficultes)}</p>`:""}${r.prevu?`<p class="small"><b>Prévu :</b> ${esc(r.prevu)}</p>`:""}</details>`).join("") || '<div class="empty">Aucun rapport déposé pour l\'instant.</div>'}</div>`;
  }
  if (sub==="implication"){
    const ym = S.impM ||= moisCourant();
    const E = sup ? equipeActive() : (moi ? [{em:S.email, ...compte()}] : []);
    const L = E.map(c=>({c, s:scoreImplication(c.em, ym)})).sort((a,b)=>(b.s.global??-1)-(a.s.global??-1));
    const avec = L.filter(x=>x.s.global!=null), moy = avec.length ? avec.reduce((a,x)=>a+x.s.global,0)/avec.length : null;
    const cell = (v,a,b) => `<td class="r">${v==null?'<span class="muted">—</span>':`${pct(v)}<br><span class="small muted">${String(a).replace(".",",")}/${b}</span>`}</td>`;
    body = `<div class="filters"><select id="impM" aria-label="Mois">${opts(derniersMois(8).map(m=>[m, moisLibelle(m)]), ym)}</select><span></span></div>
      ${sup?`<div class="kpis">${kpi(pct(moy),"implication moyenne")}${kpi(avec.filter(x=>x.s.global>=.6).length,"impliqués (60 % et plus)","g")}${kpi(avec.filter(x=>x.s.global<.4).length,"en alerte (moins de 40 %)",avec.some(x=>x.s.global<.4)?"bad":"g")}${kpi(L.length-avec.length,"sans données ce mois")}</div>`:""}
      <div class="tablewrap"><table><thead><tr>${sup?"<th>#</th>":""}<th>Responsable</th><th class="r">Tâches à temps</th><th class="r">Présence</th><th class="r">Rapports</th><th class="r">Score</th><th>Niveau</th></tr></thead><tbody>
      ${L.map((x,i)=>{ const n = niveauImp(x.s.global); return `<tr>${sup?`<td class="small muted">${x.s.global==null?"":i+1}</td>`:""}<td><b>${esc(x.c.nom)}</b><br><span class="small muted">${esc((x.c.fonctions||[]).map(titreFonction).join(", ") || ROLES[x.c.role]?.l || "")}</span></td>${cell(x.s.taches,x.s.n.tv,x.s.n.tn)}${cell(x.s.presence,x.s.n.pv,x.s.n.pn)}${cell(x.s.rapports,x.s.n.rv,x.s.n.rn)}<td class="r"><b>${pct(x.s.global)}</b></td><td><span class="pill ${n.c}">${n.l}</span></td></tr>`; }).join("") || `<tr><td colspan="7"><div class="empty">Aucun responsable.</div></td></tr>`}
      </tbody></table></div>
      <details class="card"><summary>Comment le score est calculé</summary><div class="small">
      <p><b>Tâches à temps (50 %)</b> : tâches personnelles dont l'échéance tombe dans le mois. Terminée à temps = 1 point, terminée en retard = 0,5, non terminée = 0. Les tâches confiées à une équipe entière ne comptent pas.</p>
      <p><b>Présence (30 %)</b> : réunions du mois où la personne était convoquée et pointée. Présent = 1, excusé = 0,5, absent = 0.</p>
      <p><b>Rapports (20 %)</b> : semaines écoulées du mois où le rapport hebdomadaire a été déposé.</p>
      <p>Un critère sans données est retiré du calcul. Niveaux : 80 % et plus très impliqué, 60 à 79 % impliqué, 40 à 59 % à relancer, moins de 40 % alerte.</p></div></details>`;
  }
  return `<h2>Espace responsables</h2><p class="small muted">Rapport hebdomadaire de chaque responsable et suivi de l'implication (tâches, réunions, rapports).</p>
    <div class="subtabs" role="group" aria-label="Espace responsables">${onglets.map(([k,l])=>`<button data-esub="${k}" aria-pressed="${sub===k}">${l}</button>`).join("")}</div>${body}`;
}
function bindEquipe(){
  $("#main").querySelectorAll("[data-esub]").forEach(b => b.onclick = () => { S.sub.equipe = b.dataset.esub; render(); });
  $("#impM") && ($("#impM").onchange = e => { S.impM = e.target.value; render(); });
  $("#ref") && ($("#ref").onsubmit = async e => {
    e.preventDefault();
    const c = compte(), sem = semCourante(), ex = S.rapportsEquipe.find(x=>x.email===S.email && x.semaine===sem), fait = $("#re1").value.trim();
    if (fait.length < 15) return toast("Décrivez ce que vous avez fait cette semaine.");
    const data = {email:S.email, nom:c.nom, semaine:sem, commissions:c.commissions||[], fait, difficultes:$("#re2").value.trim(), prevu:$("#re3").value.trim(), creeLe:ex?.creeLe||nowISO(), majLe:nowISO()};
    if (await write(()=>S.db.doc("rapports_equipe/"+reId(S.email, sem)).set(data), "Rapport enregistré")){ if (!ex) log("rapport_equipe", `Rapport hebdomadaire de ${c.nom} déposé (${semLib(sem)})`, ["secretaire"]); render(); }
  });
}
function blocEquipe(){
  if (!jeSuisEquipe()) return "";
  const sem = semCourante(), ok = S.rapportsEquipe.some(r=>r.email===S.email && r.semaine===sem), s = scoreImplication(S.email, moisCourant()), n = niveauImp(s.global);
  return `<div class="card"><div class="spread"><h3>Mon implication · ${esc(moisLibelle(moisCourant()))}</h3><span class="pill ${n.c}">${s.global==null?"—":pct(s.global)} · ${n.l}</span></div>
    <div class="prow"><span><b>${ok?"✅":"⬜"} Rapport de la semaine</b><br><span class="small muted">${ok?"Déposé":"À déposer avant dimanche soir"}</span></span><a class="btn sm ${ok?"ghost":"primary"}" href="#equipe" data-ego="rapport">${ok?"Voir":"Rédiger"}</a></div></div>`;
}
function alertesEquipe(){
  const A = [], r = role(), j = (parseD(today()).getDay()+6)%7, sem = semCourante();
  if (jeSuisEquipe() && j>=4 && !S.rapportsEquipe.some(x=>x.email===S.email && x.semaine===sem)) A.push({niv:"warn", titre:"Rapport hebdomadaire à déposer", detail:semLib(sem), pour:[r], lien:"#equipe"});
  if (gouvSup()){ const prec = addJ(sem,-7), manq = equipeActive().filter(c=>!S.rapportsEquipe.some(x=>x.email===c.em && x.semaine===prec)); if (manq.length && prec >= debutRE()) A.push({niv:"warn", titre:`${manq.length} responsable(s) sans rapport la semaine dernière`, detail:manq.slice(0,5).map(c=>c.nom).join(", "), pour:[r], lien:"#equipe"}); }
  return A;
}
function abonnerEquipe(){
  const db = S.db, fusion = part => s => { S._re ||= {}; S._re[part] = rows(s); S.rapportsEquipe = [...new Map(Object.values(S._re).flat().map(x=>[x.id,x])).values()]; };
  if (gouvSup()) return sub("rapports_equipe","rapportsEquipe", s => { S.rapportsEquipe = rows(s); });
  sub("rapports_equipe","rapportsEquipe", fusion("moi"), db.collection("rapports_equipe").where("email","==",S.email));
  mesComsResp().forEach(c => sub("rapports_equipe","rapportsEquipe", fusion("c_"+c), db.collection("rapports_equipe").where("commissions","array-contains",c)));
}

/* =====================================================================
   PROGRAMME DE LA COMMUNAUTÉ — calendrier commun visible par tous,
   programmation, pointage relié aux séances, fiche pédagogique.
   Académie : Présidence et Responsable Formation · Tutorat : Responsable des Tuteurs
   Communauté : Présidence et Secrétariat général · Réunions : reprises du module Réunions
   ===================================================================== */
const TYPES_PROG = {academie:["CVPB Académie","#5fdc74"], tutorat:["Tutorat","#5aa9ff"], communaute:["Communauté","#f2b84b"], reunion:["Réunion","#b48cff"]};
const MODES_PROG = ["Présentiel","En ligne","Hybride"];
/* v21 : les formateurs programment les séances de LEURS formations, les tuteurs leurs séances de tutorat ;
   chacun ne modifie ensuite que ce qu'il a lui-même programmé. */
const estFormateurR = () => tousMesRoles().includes("pedagogie");
const peutProgrammer = (t, e) => presidence()
  || (t==="academie" && (aRole("formation") || (estFormateurR() && (!e || e.creeParEmail===S.email))))
  || (t==="tutorat" && (aRole("tuteurs") || (estTuteurR() && (!e || e.creeParEmail===S.email))))
  || (t==="communaute" && aRole("secretaire"));
/* v21 : une séance de tutorat peut réunir plusieurs spécialités (même niveau) */
const specsDe = e => (e?.specialites||[]).length ? e.specialites : [e?.specialite].filter(Boolean);
const groupesDe = e => specsDe(e).map(sp => `${sp} · ${e.niveau}`);
const libSpecs = e => `${specsDe(e).map(codeSp).join(" + ")} ${e.niveau||""}`.trim();
const typesProgrammables = () => ["academie","tutorat","communaute"].filter(t => peutProgrammer(t));
const addJours = (d, n) => { const x = parseD(d); x.setDate(x.getDate()+n); return isoD(x); };
const pillProg = st => `<span class="pill ${st==="Annulée"?"bad":st==="Reportée"?"warn":st==="Tenue"?"ok":"mute"}">${esc(st||"Programmée")}</span>`;
const heuresProg = e => e.hDebut ? `${e.hDebut.replace(":","h")}${e.hFin?"–"+e.hFin.replace(":","h"):""}` : "Toute la journée";
const jourLong = d => parseD(d).toLocaleDateString("fr-FR",{weekday:"long", day:"numeric", month:"long"});
/* Spécialité de l'étudiant (« … (IAN-RSI) ») rapprochée de celle du programme (« IAN-RSI : … ») par le code */
const memeSpec = (etu, sp) => !!sp && (etu===sp || codeSpec(etu)===codeSp(sp));
const delegsDuGroupe = g => actifsTous().filter(c => rolesDe(c).includes("delegue") && groupeDe(c)===g);

/* Tous les événements visibles : programme + réunions déjà lisibles par l'utilisateur */
function evenements(){
  const P1 = S.programme.map(e=>({...e}));
  const R1 = S.reunions.filter(r=>r.debut).map(r=>({id:"R:"+r.id, reunionId:r.id, type:"reunion", titre:r.titre, date:String(r.debut).slice(0,10), hDebut:String(r.debut).slice(11,16), hFin:String(r.fin||"").slice(11,16), lieu:r.lieu||"", statut:r.statut==="Tenue"?"Tenue":r.statut==="Annulée"?"Annulée":r.statut==="Reportée"?"Reportée":"Programmée", intervenants:r.convoques||[]}));
  return [...P1, ...R1].sort((a,b)=>(a.date+(a.hDebut||"")).localeCompare(b.date+(b.hDebut||"")));
}
/* « Mes séances » : j'interviens, je l'ai programmée, ou elle concerne mon groupe / mon niveau */
function meConcerne(e){
  const c = compte(); if (!c) return false;
  if ((e.intervenants||[]).includes(S.email) || e.creeParEmail===S.email) return true;
  if (e.type==="tutorat" && c.specialite && specsDe(e).includes(c.specialite) && (!e.niveau || e.niveau===c.niveau)) return true;
  if (e.type==="academie" && c.niveau){ const f = toutesFormations().find(x=>x.code===e.formation), nv = String(f?.niveau||""); return !nv || /Tous/.test(nv) || nv===c.niveau || (nv.includes("2 et 3") && /Licence [23]/.test(c.niveau)); }
  return e.type==="communaute";
}
function evFiltres(){ return evenements().filter(e => S.pf.types.includes(e.type) && (!S.pf.miens || meConcerne(e))); }

function carteEv(e){
  const [lib, col] = TYPES_PROG[e.type]||["",""];
  const sous = e.type==="academie" ? [e.formation && `${e.formation}`, e.module].filter(Boolean).join(" · ") : e.type==="tutorat" ? libSpecs(e) : "";
  const inter = (e.intervenants||[]).slice(0,3).map(nomDe).join(", ") + ((e.intervenants||[]).length>3?"…":"");
  return `<button type="button" class="evt ${e.statut==="Annulée"?"annule":""}" data-ev="${esc(e.id)}" style="--c:${col}"><span class="h">${esc(heuresProg(e))}</span><span class="t">${esc(e.titre)}</span><span class="m">${esc(lib)}${sous?` · ${esc(sous)}`:""}${e.type!=="reunion"&&inter?` · ${esc(inter)}`:""}${e.lieu?` · ${esc(e.lieu)}`:e.mode==="En ligne"?" · En ligne":""}</span>${e.statut&&e.statut!=="Programmée"?pillProg(e.statut):""}</button>`;
}

function vProgramme(){
  const f = S.pf, ref = f.ref || today(), L = evFiltres(), aujourd = today();
  const puce = t => `<button type="button" class="chip" data-pt="${t}" aria-pressed="${f.types.includes(t)}" style="--c:${TYPES_PROG[t][1]}"><i></i>${esc(TYPES_PROG[t][0])}</button>`;
  let corps = "", titrePer = "";
  if (f.vue==="semaine"){
    const l0 = lundiDe(ref), jours = Array.from({length:7}, (_,i)=>addJours(l0,i));
    titrePer = `Semaine du ${parseD(l0).toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`;
    corps = `<div class="semaine">${jours.map(d=>{ const E = L.filter(e=>e.date===d); return `<section class="jour ${d===aujourd?"auj":""} ${parseD(d).getDay()===6?"sam":""}"><h3>${esc(jourLong(d))}</h3>${E.length?E.map(carteEv).join(""):`<p class="small muted vide">—</p>`}</section>`; }).join("")}</div>`;
  } else if (f.vue==="mois"){
    const d0 = parseD(ref.slice(0,7)+"-01"), m = d0.getMonth(), debut = lundiDe(isoD(d0));
    titrePer = d0.toLocaleDateString("fr-FR",{month:"long", year:"numeric"});
    const cases = Array.from({length:42}, (_,i)=>addJours(debut,i)).filter((d,i)=> i<35 || parseD(d).getMonth()===m);
    corps = `<div class="mois"><div class="mh">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=>`<span>${j}</span>`).join("")}</div><div class="mg">${cases.map(d=>{ const E = L.filter(e=>e.date===d); return `<button type="button" class="mc ${parseD(d).getMonth()!==m?"hors":""} ${d===aujourd?"auj":""}" data-jour="${d}" aria-label="${esc(jourLong(d))} : ${E.length} événement(s)"><b>${parseD(d).getDate()}</b>${E.slice(0,3).map(e=>`<i style="--c:${TYPES_PROG[e.type][1]}" class="${e.statut==="Annulée"?"annule":""}">${esc(e.titre)}</i>`).join("")}${E.length>3?`<em>+${E.length-3}</em>`:""}</button>`; }).join("")}</div></div>`;
  } else {
    const fin = addJours(aujourd, 60), A = L.filter(e=>e.date>=aujourd && e.date<=fin && e.statut!=="Annulée");
    titrePer = "60 prochains jours";
    const jours = [...new Set(A.map(e=>e.date))];
    corps = jours.length ? `<div class="semaine liste">${jours.map(d=>`<section class="jour ${d===aujourd?"auj":""}"><h3>${esc(jourLong(d))}</h3>${A.filter(e=>e.date===d).map(carteEv).join("")}</section>`).join("")}</div>` : `<div class="empty">Rien de programmé dans les 60 prochains jours${f.miens?" pour vous":""}.</div>`;
  }
  const aVenir = evenements().filter(e=>e.date>=aujourd && e.statut!=="Annulée");
  const aPointer = S.programme.filter(e=>["academie","tutorat","communaute"].includes(e.type) && e.date<aujourd && e.statut!=="Annulée" && e.statut!=="Tenue" && peutPointer(e));
  return `<div class="spread"><div><h2>Programme de la communauté</h2><p class="small muted">Formations de la CVPB Académie, séances de tutorat, activités et réunions. ${typesProgrammables().length?`Vous pouvez programmer : ${typesProgrammables().map(t=>TYPES_PROG[t][0]).join(", ")}.`:"Consultation."}</p></div>
    <div class="row">${typesProgrammables().length?`<button class="btn primary" id="pgNew">${ICO.nouveau} Programmer</button>`:""}<button class="btn" id="pgIcs" title="Fichier à ouvrir avec Google Agenda ou l'agenda du téléphone">Ajouter à mon agenda</button></div></div>
  <div class="kpis">${kpi(aVenir.filter(e=>e.date<=addJours(aujourd,6)).length,"cette semaine","g")}${kpi(aVenir.filter(e=>e.type==="academie").length,"formations à venir")}${kpi(aVenir.filter(e=>e.type==="tutorat").length,"séances de tutorat à venir")}${aPointer.length?kpi(aPointer.length,"séances passées à pointer","warn"):""}</div>
  ${aPointer.length?`<div class="card"><h3>À pointer</h3><div class="clist">${aPointer.slice(0,6).map(carteEv).join("")}</div></div>`:""}
  <div class="filters chips">${["academie","tutorat","communaute","reunion"].map(puce).join("")}<button type="button" class="chip" id="pgMiens" aria-pressed="${f.miens}">Mes séances</button></div>
  <div class="spread"><div class="subtabs" role="group" aria-label="Vue">${[["semaine","Semaine"],["mois","Mois"],["liste","À venir"]].map(([k,l])=>`<button data-pv="${k}" aria-pressed="${f.vue===k}">${l}</button>`).join("")}</div>
  ${f.vue!=="liste"?`<div class="row"><button class="btn sm ghost" id="pgPrev" aria-label="Période précédente">‹</button><b class="small" style="min-width:150px;text-align:center">${esc(titrePer)}</b><button class="btn sm ghost" id="pgNext" aria-label="Période suivante">›</button><button class="btn sm" id="pgAuj">Aujourd'hui</button></div>`:""}</div>
  ${corps}`;
}
function bindProgramme(){
  const m = $("#main"), on = (s, fn) => { const el = $(s); if (el) el.onclick = fn; };
  m.querySelectorAll("[data-pt]").forEach(b => b.onclick = () => { const t = b.dataset.pt, T = S.pf.types; S.pf.types = T.includes(t) ? T.filter(x=>x!==t) : [...T, t]; render(); });
  m.querySelectorAll("[data-pv]").forEach(b => b.onclick = () => { S.pf.vue = b.dataset.pv; render(); });
  m.querySelectorAll("[data-jour]").forEach(b => b.onclick = () => { S.pf.ref = b.dataset.jour; S.pf.vue = "semaine"; render(); });
  on("#pgMiens", () => { S.pf.miens = !S.pf.miens; render(); });
  const pas = k => { const r = S.pf.ref || today(); if (S.pf.vue==="mois"){ const d = parseD(r.slice(0,7)+"-01"); d.setMonth(d.getMonth()+k); S.pf.ref = isoD(d); } else S.pf.ref = addJours(r, 7*k); render(); };
  on("#pgPrev", () => pas(-1)); on("#pgNext", () => pas(1)); on("#pgAuj", () => { S.pf.ref = ""; render(); });
  on("#pgNew", () => formProg());
  on("#pgIcs", () => exporterIcs(evFiltres().filter(e=>e.date>=addJours(today(),-7) && e.statut!=="Annulée"), "CVPB_programme"));
  bindEvs(m);
}
function bindEvs(root){ root.querySelectorAll("[data-ev]").forEach(b => b.onclick = e => { e.preventDefault(); ficheProg(b.dataset.ev); }); }

/* Bloc de l'accueil (tout le monde) : mes 5 prochaines séances */
function blocProgramme(){
  const auj = today(), L = evenements().filter(e=>e.date>=auj && e.statut!=="Annulée" && meConcerne(e)).slice(0,5);
  const pt = S.programme.filter(e=>["academie","tutorat"].includes(e.type) && e.date<auj && !["Annulée","Tenue"].includes(e.statut) && peutPointer(e)).length;
  return `<div class="card"><div class="spread"><h3>Mon programme</h3><a class="btn ghost" href="#${role()==="tuteur"?"t-programme":"programme"}">Calendrier</a></div>
  ${pt?`<div class="banner">${pt} séance(s) passée(s) à pointer.</div>`:""}
  ${L.length?`<div class="clist">${L.map(e=>carteEv(e).replace('<span class="h">', `<span class="h">${esc(dLong(e.date))} · `)).join("")}</div>`:`<div class="empty">Rien de programmé pour vous prochainement.</div>`}</div>`;
}

const peutPointer = e => {
  if (e.type==="academie") return presidence() || aRole("formation") || ((tousMesRoles().includes("pedagogie")) && (toutesFormations().find(f=>f.code===e.formation)?.formateurs||[]).includes(S.email));
  if (e.type==="tutorat") return presidence() || aRole("tuteurs") || (e.intervenants||[]).includes(S.email);
  if (e.type==="communaute") return presidence() || aRole("secretaire") || (e.intervenants||[]).includes(S.email);
  return false;
};

function ficheProg(id){
  const e = evenements().find(x=>x.id===id); if (!e) return toast("Événement introuvable.");
  if (e.type==="reunion") return ficheReunion(e.reunionId);
  const [lib, col] = TYPES_PROG[e.type], gere = peutProgrammer(e.type, e), passe = e.date <= today();
  const F = e.formation ? toutesFormations().find(f=>f.code===e.formation) : null;
  const dem = e.demande ? S.demandesCours.find(d=>d.id===e.demande) : null;
  const se = e.seanceId ? S.seances.find(x=>x.id===e.seanceId) : null, pt = S.pointagesTut.find(x=>x.id===e.id) || (S.pointagesCom||[]).find(x=>x.id===e.id);
  const resume = pres => { const v = Object.values(pres||{}).filter(Boolean), c = k=>v.filter(x=>x===k).length; return `${c("P")+c("R")}/${v.length} présents · ${c("R")} retard(s) · ${c("J")} absence(s) justifiée(s) · ${c("A")} absence(s)`; };
  openSheet(`<div class="spread"><div><span class="pill" style="background:${col}22;color:inherit;border:1px solid ${col}">${esc(lib)}</span><h2 style="margin-top:6px">${esc(e.titre)}</h2><p class="small muted">${esc(jourLong(e.date))} · ${esc(heuresProg(e))}</p></div>${pillProg(e.statut)}</div>
    <dl class="dl">
      ${F?`<dt>Formation</dt><dd>${esc(F.code)} · ${esc(F.intitule)}${e.module?`<br><span class="small">Module : ${esc(e.module)}</span>`:""}</dd>`:""}
      ${e.type==="tutorat"?`<dt>${specsDe(e).length>1?"Groupes":"Groupe"}</dt><dd>${esc(libSpecs(e))}</dd>`:""}
      ${e.type==="communaute"&&e.public?`<dt>Public</dt><dd>${esc(e.public)}</dd>`:""}
      <dt>${e.type==="tutorat"?"Tuteur(s)":"Intervenant(s)"}</dt><dd>${(e.intervenants||[]).map(nomDe).map(esc).join(", ")||"—"}</dd>
      <dt>Lieu</dt><dd>${esc(e.mode||"")}${e.lieu?` · ${esc(e.lieu)}`:""}${e.lien?`<br><a href="${esc(e.lien)}" target="_blank" rel="noopener">Rejoindre / ouvrir le lien</a>`:""}</dd>
      <dt>Programmé par</dt><dd>${esc(e.creeParNom||"")}</dd>
    </dl>
    ${e.description?`<div class="quote">${esc(e.description)}</div>`:""}
    ${dem?`<div class="card"><h3>Demande du délégué</h3><p class="small"><b>${esc(dem.matiere)}</b> · ${esc(dem.delegueNom||"")}</p><p class="small">${esc(dem.besoin||"")}</p>${dem.lien?`<a class="small" href="${esc(dem.lien)}" target="_blank" rel="noopener">Document du cours</a>`:""}</div>`:""}
    ${e.statut==="Annulée"&&e.motif?`<div class="banner">Annulée : ${esc(e.motif)}</div>`:""}
    ${se?`<div class="card"><h3>Pointage</h3><p class="small">${resume(se.presences)} · ${esc(se.validation?.statut||"Soumise")}</p></div>`:e.seanceId?`<p class="small muted">Séance pointée par ${esc(e.pointePar||"")}.</p>`:""}
    ${pt?`<div class="card"><h3>Pointage</h3><p class="small">${resume(pt.presences)} · par ${esc(pt.parNom||"")}</p></div>`:e.type==="tutorat"&&e.statut==="Tenue"&&!pt?`<p class="small muted">Séance pointée par ${esc(e.pointePar||"")}.</p>`:""}
    ${gere && e.statut!=="Annulée"?`<label class="f" for="pg_mo">Motif (pour un report ou une annulation)<input type="text" id="pg_mo" maxlength="200"></label>`:""}
    <div class="row">
      ${peutPointer(e) && passe && e.statut!=="Annulée"?`<button class="btn vert" id="pgPt">${e.statut==="Tenue"?"Modifier le pointage":"Pointer les présences"}</button>`:""}
      ${gere && e.statut!=="Annulée" && e.statut!=="Tenue"?`<button class="btn" id="pgEd">Modifier / reporter</button><button class="btn danger" id="pgAn">Annuler la séance</button>`:""}
      ${presidence() && e.statut!=="Tenue"?`<button class="btn ghost" id="pgDel">Supprimer</button>`:""}
      <button class="btn ghost" id="pgCal">Ajouter à mon agenda</button><button class="btn ghost" data-close>Fermer</button></div>
    ${(e.historique||[]).length?`<details class="card"><summary>Historique (${e.historique.length})</summary>${histoHTML(e.historique)}</details>`:""}`);
  const on = (s, fn) => { const el = $(s); if (el) el.onclick = fn; };
  on("#pgCal", () => exporterIcs([e], "CVPB_"+normNom(e.titre).replace(/ /g,"_")));
  on("#pgEd", () => formProg(e.id));
  on("#pgPt", () => e.type==="academie" ? (se ? formSeance(se.id) : formSeance(null, {date:e.date, formation:e.formation, programme:e.id})) : e.type==="communaute" ? formPointageCom(e.id) : formPointageTut(e.id));
  const an = $("#pgAn"); an && confirmBtn(an, "Confirmer l'annulation", async () => {
    const mo = ($("#pg_mo")?.value||"").trim(); if (mo.length<3) return toast("Indiquez le motif de l'annulation.");
    if (await write(()=>S.db.doc("programme/"+e.id).update({statut:"Annulée", motif:mo, majLe:nowISO(), historique:ajoute(e.historique, trace("Annulation","Annulée", mo))}), "Séance annulée")){ log("programme", `Annulé : ${e.titre} du ${dFR(e.date)} · ${mo}`, destinatairesProg(e)); closeSheet(); }
  });
  const del = $("#pgDel"); del && confirmBtn(del, "Supprimer définitivement ?", async () => { if (await write(()=>S.db.doc("programme/"+e.id).delete(), "Événement supprimé")) closeSheet(); });
}

/* Qui prévenir : intervenants, responsables du domaine, délégués du groupe ; tout le monde pour la communauté */
function destinatairesProg(e){
  const inter = (e.intervenants||[]).map(x=>"e:"+x);
  if (e.type==="communaute") return ["tous"];
  if (e.type==="tutorat") return ["tuteurs","accompagnement", ...inter, ...groupesDe(e).flatMap(g=>delegsDuGroupe(g).map(d=>"e:"+d.em))];
  return ["formation","pedagogie","accompagnement", ...inter];
}

function formProg(id){
  const ex = id ? S.programme.find(x=>x.id===id) : null;
  const types = ex ? [ex.type] : typesProgrammables(); if (!types.length) return;
  const st = {type: ex?.type || (types.includes("academie") ? "academie" : types[0]), ...ex};
  const forms = toutesFormations().filter(f=>!["Archivée","Brouillon","Clôturée"].includes(f.statut))
    .filter(f => presidence() || aRole("formation") || (f.formateurs||[]).includes(S.email));
  const tous = actifsTous();
  openSheet(`<h2>${ex?"Modifier ou reporter":"Programmer"}</h2>
  <form id="pgf" class="form">
    <label class="f" for="pg_ty">Type<select id="pg_ty" ${ex?"disabled":""}>${opts(types.map(t=>[t, TYPES_PROG[t][0]]), st.type)}</select></label>
    <div id="pg_spec"></div>
    <label class="f" for="pg_ti">Titre<input type="text" id="pg_ti" maxlength="120" value="${esc(st.titre||"")}" placeholder="Rempli automatiquement si vide"></label>
    <div class="g2"><label class="f" for="pg_da">Date<input type="date" id="pg_da" value="${esc(st.date||"")}"></label>
    <div class="g2"><label class="f" for="pg_hd">Début<input type="time" id="pg_hd" value="${esc(st.hDebut||"09:00")}"></label><label class="f" for="pg_hf">Fin<input type="time" id="pg_hf" value="${esc(st.hFin||"11:00")}"></label></div></div>
    <div class="row" id="pg_rap"><span class="small muted">Raccourci :</span><button type="button" class="btn sm" id="pg_sam">Samedi prochain</button></div>
    <div class="g2"><label class="f" for="pg_mo2">Mode<select id="pg_mo2">${opts(MODES_PROG, st.mode||"Présentiel")}</select></label><label class="f" for="pg_li">Lieu<input type="text" id="pg_li" maxlength="120" value="${esc(st.lieu||"")}" placeholder="Ex. : Maison des jeunes de Port-Bouët"></label></div>
    <label class="f" for="pg_ln">Lien (Google Meet, WhatsApp…) facultatif<input type="url" id="pg_ln" maxlength="400" value="${esc(st.lien||"")}" placeholder="https://meet.google.com/…"></label>
    <label class="f" for="pg_de">Contenu, consignes, matériel à prévoir<textarea id="pg_de" maxlength="1500">${esc(st.description||"")}</textarea></label>
    ${ex?`<label class="f" for="pg_mt">Motif de la modification (obligatoire en cas de report)<input type="text" id="pg_mt" maxlength="200"></label>`:`<label class="f" for="pg_rp">Répéter chaque semaine, même jour et même heure<select id="pg_rp">${opts(Array.from({length:16},(_,i)=>[i+1, i?`${i+1} semaines (${i+1} séances)`:"Non, une seule séance"]), 1)}</select></label>`}
    <div class="row"><button class="btn primary" type="submit">${ex?"Enregistrer et prévenir":"Programmer et prévenir"}</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
  </form>`);
  const coches = (sel, L, cur) => `<div class="checks" id="${sel}">${L.map(c=>`<label><input type="checkbox" value="${esc(c.em)}" ${cur.includes(c.em)?"checked":""}> ${esc(c.nom)} <span class="small muted">${esc(c.tag||"")}</span></label>`).join("")||'<div class="empty">Personne à proposer.</div>'}</div>`;
  const drawSpec = () => {
    const t = $("#pg_ty").value, z = $("#pg_spec"), cur = st.intervenants || [];
    if (t==="academie"){
      const fc = st.formation && forms.some(f=>f.code===st.formation) ? st.formation : forms[0]?.code;
      const F = forms.find(f=>f.code===fc) || {}, fo = F.formateurs||[];
      const L = [...tous.filter(c=>fo.includes(c.em)).map(c=>({...c, tag:"formateur de la formation"})), ...tous.filter(c=>!fo.includes(c.em) && rolesDe(c).some(r=>["pedagogie","formation","tuteur","president"].includes(r)))];
      /* v21 : le formateur qui programme figure toujours dans la liste */
      if (!L.some(c=>c.em===S.email) && (fo.includes(S.email) || estFormateurR())) L.unshift({em:S.email, nom:compte()?.nom||S.email, tag:"vous"});
      z.innerHTML = forms.length ? `<div class="g2"><label class="f" for="pg_fo">Formation<select id="pg_fo">${opts(forms.map(f=>[f.code, `${f.code} · ${f.intitule}`]), fc)}</select></label>
        <label class="f" for="pg_md">Module<select id="pg_md">${opts((F.modules||[]).map(m=>[m.titre, m.titre]), st.module||"", "— Aucun / plusieurs —")}</select></label></div>
        <fieldset class="f"><legend>Intervenant(s)</legend>${coches("pg_in", L, cur.length?cur:fo)}<span class="hint">Seuls les formateurs affectés à la formation (catalogue), le Responsable Formation et la Présidence peuvent pointer.</span></fieldset>`
        : `<div class="banner">Aucune formation active dans le catalogue. Créez d'abord la formation dans <a href="#catalogue">Catalogue des formations</a>.</div>`;
      $("#pg_fo") && ($("#pg_fo").onchange = e => { st.formation = e.target.value; st.module = ""; st.intervenants = []; drawSpec(); });
    } else if (t==="tutorat"){
      const sps = specsDe(st).length ? specsDe(st) : [compte()?.specialite && SPECS_FORM.includes(compte().specialite) ? compte().specialite : SPECS_FORM[0]];
      const sp = sps[0], nv = st.niveau || (estTuteurR() && compte()?.niveau) || (P().niveaux||[])[0] || "Licence 1", g = `${sp} · ${nv}`;
      const tutG = [...new Set(sps.flatMap(x=>tuteursDuGroupe(`${x} · ${nv}`).map(c=>c.em)))];
      const L = [...tous.filter(c=>tutG.includes(c.em)).map(c=>({...c, tag:"tuteur du groupe"})), ...tous.filter(c=>!tutG.includes(c.em) && rolesDe(c).includes("tuteur")).map(c=>({...c, tag:groupeLib(groupeDe(c))}))];
      if (estTuteurR() && !L.some(c=>c.em===S.email)) L.unshift({em:S.email, nom:compte()?.nom||S.email, tag:"vous"});
      const dems = S.demandesCours.filter(d=>d.groupe===g && !["Clôturée","Rejetée"].includes(d.statut));
      z.innerHTML = `<fieldset class="f"><legend>Spécialité(s) concernée(s)</legend><div class="checks" id="pg_sps">${SPECS_FORM.map(x=>`<label><input type="checkbox" value="${esc(x)}" ${sps.includes(x)?"checked":""}> ${esc(codeSp(x))}</label>`).join("")}</div><span class="hint">Cochez plusieurs spécialités pour une séance commune (ex. IAN-DAS + IAN-RSI).</span></fieldset>
        <label class="f" for="pg_nv">Niveau<select id="pg_nv">${opts(P().niveaux||["Licence 1","Licence 2","Licence 3"], nv)}</select></label>
        <label class="f" for="pg_dm">Répond à une demande de délégué (facultatif)<select id="pg_dm">${opts(dems.map(d=>[d.id, `${d.type==="cours"?"Cours à expliquer":"Demande"} · ${d.matiere} · ${d.delegueNom||""}`]), st.demande||"", dems.length?"— Aucune —":"— Aucune demande en cours pour ce groupe —")}</select></label>
        <fieldset class="f"><legend>Tuteur(s)</legend>${coches("pg_in", L, cur.length?cur:tutG)}<span class="hint">Les tuteurs cochés pourront pointer les présences de la séance.</span></fieldset>`;
      const re = () => { const ch = [...$("#pg_sps").querySelectorAll("input:checked")].map(i=>i.value); st.specialites = ch.length ? ch : [sp]; st.specialite = st.specialites[0]; st.niveau = $("#pg_nv").value; st.intervenants = []; st.demande = ""; drawSpec(); };
      $("#pg_sps").querySelectorAll("input").forEach(i => i.onchange = re); $("#pg_nv").onchange = re;
      $("#pg_dm").onchange = e => { const d = dems.find(x=>x.id===e.target.value); if (d && !$("#pg_ti").value.trim()) $("#pg_ti").value = `Tutorat · ${d.matiere}`; if (d && !$("#pg_de").value.trim()) $("#pg_de").value = d.besoin||""; };
    } else {
      z.innerHTML = `<label class="f" for="pg_pu">Public concerné<input type="text" id="pg_pu" maxlength="120" value="${esc(st.public||"")}" placeholder="Ex. : tous les membres, nouveaux bacheliers…"></label>
        <fieldset class="f"><legend>Responsable(s) de l'activité (facultatif)</legend>${coches("pg_in", tous.map(c=>({...c, tag:ROLES[c.role]?.l||""})), cur)}</fieldset>`;
    }
  };
  $("#pg_ty").onchange = () => { st.type = $("#pg_ty").value; st.intervenants = []; drawSpec(); };
  drawSpec();
  $("#pg_sam").onclick = () => { const d = parseD(today()); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); $("#pg_da").value = isoD(d); };
  $("#pgf").onsubmit = async ev => {
    ev.preventDefault();
    const t = $("#pg_ty").value, date = $("#pg_da").value, hDebut = $("#pg_hd").value, hFin = $("#pg_hf").value;
    if (!date) return toast("Indiquez la date.");
    if (!ex && date < today()) return toast("La date est déjà passée.");
    if (hDebut && hFin && hFin <= hDebut) return toast("L'heure de fin doit suivre l'heure de début.");
    const intervenants = [...$("#sheet").querySelectorAll("#pg_in input:checked")].map(i=>i.value);
    const d = {type:t, date, hDebut, hFin, mode:$("#pg_mo2").value, lieu:$("#pg_li").value.trim(), lien:$("#pg_ln").value.trim(), description:$("#pg_de").value.trim(), intervenants, intervenantsNoms:intervenants.map(nomDe)};
    if (d.lien && !/^https?:\/\//i.test(d.lien)) return toast("Le lien doit commencer par https://");
    if (!d.lieu && d.mode!=="En ligne") return toast("Indiquez le lieu.");
    if (t==="academie"){ if (!$("#pg_fo")) return toast("Aucune formation disponible."); d.formation = $("#pg_fo").value; d.module = $("#pg_md").value; if (!intervenants.length) return toast("Choisissez au moins un intervenant."); }
    if (t==="tutorat"){ d.specialites = [...$("#pg_sps").querySelectorAll("input:checked")].map(i=>i.value); if (!d.specialites.length) return toast("Cochez au moins une spécialité."); d.specialite = d.specialites[0]; d.niveau = $("#pg_nv").value; d.demande = $("#pg_dm").value; if (!intervenants.length) return toast("Choisissez au moins un tuteur."); }
    if (t==="communaute") d.public = $("#pg_pu").value.trim();
    const auto = t==="academie" ? `${nomForm(d.formation)||d.formation}${d.module?` · ${d.module}`:""}` : t==="tutorat" ? `Tutorat ${libSpecs(d)}` : "";
    d.titre = $("#pg_ti").value.trim() || auto; if (d.titre.length<3) return toast("Indiquez le titre.");
    if (ex){
      const reporte = ex.date!==date || ex.hDebut!==hDebut, mt = $("#pg_mt").value.trim();
      if (reporte && mt.length<3) return toast("Indiquez le motif du report.");
      const statut = reporte ? "Reportée" : ex.statut;
      if (await write(()=>S.db.doc("programme/"+ex.id).update({...d, statut, majLe:nowISO(), historique:ajoute(ex.historique, trace(reporte?`Reportée du ${dFR(ex.date)} ${ex.hDebut||""} au ${dFR(date)} ${hDebut}`:"Modification", statut, mt))}), reporte?"Séance reportée, participants prévenus":"Modifications enregistrées")){
        log("programme", reporte ? `Reporté : ${d.titre} → ${jourLong(date)} ${heuresProg(d)}${mt?` (${mt})`:""}` : `Modifié : ${d.titre} du ${dFR(date)}`, destinatairesProg(d)); closeSheet(); }
      return;
    }
    const n = Number($("#pg_rp").value)||1, serie = n>1 ? gid("S") : "";
    const ops = Array.from({length:n}, (_,i) => ({path:"programme/"+gid("PG")+i, data:{...d, date:addJours(date, 7*i), serie, statut:"Programmée", creeParEmail:S.email, creeParNom:compte().nom, creeLe:nowISO(), historique:[trace(n>1?`Programmation (série de ${n} séances)`:"Programmation","Programmée")]}}));
    if (await write(()=>S.db.lots(ops), n>1 ? `${n} séances programmées` : "Séance programmée")){
      log("programme", `${TYPES_PROG[t][0]} : ${d.titre} · ${jourLong(date)} ${heuresProg(d)}${n>1?` (puis chaque semaine, ${n} séances)`:""}`, destinatairesProg(d));
      if (t==="tutorat" && d.demande){ const dm = S.demandesCours.find(x=>x.id===d.demande); if (dm) S.db.doc("demandes_cours/"+dm.id).update({statut:"Programmée", reponse:`Séance programmée le ${dFR(date)} à ${hDebut.replace(":","h")}`, historique:ajoute(dm.historique, trace("Séance programmée","Programmée"))}).catch(()=>{}); }
      closeSheet();
    }
  };
}

/* Pointage d'une séance de tutorat : étudiants du groupe (spécialité + niveau) */
function formPointageTut(id){
  const e = S.programme.find(x=>x.id===id); if (!e) return;
  const ex = S.pointagesTut.find(x=>x.id===id), pr = {...(ex?.presences||{})};
  const L = S.etudiants.filter(s=>s.statut!=="Inactif" && specsDe(e).some(sp=>memeSpec(s.specialite, sp)) && s.niveau===e.niveau).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
  openSheet(`<h2>Pointage · ${esc(e.titre)}</h2><p class="small muted">${esc(jourLong(e.date))} · ${esc(libSpecs(e))} · P présent · R retard · J absent justifié · A absent</p>
    <div class="row"><button class="btn sm" type="button" id="pt_all">Tous présents</button><span class="small muted">Laisser vide = non concerné.</span></div>
    <div class="plist" id="pt_l">${L.map(s=>`<div class="prow"><span>${esc(s.nom)} <span class="small muted num">${esc(s.matricule)}</span></span><span class="seg" data-who="${esc(s.matricule)}">${["P","R","J","A"].map(v=>`<button type="button" data-v="${v}" aria-pressed="${pr[s.matricule]===v}">${v}</button>`).join("")}</span></div>`).join("") || `<div class="empty">Aucun étudiant enregistré pour ce groupe.</div>`}</div>
    <label class="f" for="pt_o">Observations (facultatif)<textarea id="pt_o" maxlength="800">${esc(ex?.obs||"")}</textarea></label>
    <div class="row"><button class="btn primary" id="pt_ok">Enregistrer le pointage</button><button class="btn" data-close>Annuler</button></div>`);
  const maj = () => $("#pt_l").querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", pr[sg.dataset.who]===x.dataset.v)));
  $("#pt_l").querySelectorAll(".seg button").forEach(b => b.onclick = () => { const w = b.parentElement.dataset.who; pr[w] = pr[w]===b.dataset.v ? "" : b.dataset.v; maj(); });
  $("#pt_all").onclick = () => { L.forEach(s=>pr[s.matricule]="P"); maj(); };
  $("#pt_ok").onclick = async () => {
    const presences = Object.fromEntries(Object.entries(pr).filter(([,v])=>v));
    if (!Object.keys(presences).length) return toast("Pointez au moins un étudiant.");
    const data = {programme:id, date:e.date, titre:e.titre, specialite:e.specialite, specialites:specsDe(e), niveau:e.niveau, tuteurs:e.intervenants||[], presences, obs:$("#pt_o").value.trim(), par:S.email, parNom:compte().nom, le:nowISO(), historique:ajoute(ex?.historique, trace(ex?"Pointage modifié":"Pointage","Tenue"))};
    if (await write(()=>S.db.doc("pointages_tutorat/"+id).set(data), "Présences enregistrées")){
      S.db.doc("programme/"+id).update({statut:"Tenue", pointeLe:nowISO(), pointePar:compte().nom, historique:ajoute(e.historique, trace("Séance pointée","Tenue"))}).catch(()=>{});
      const v = Object.values(presences); log("programme", `Tutorat pointé : ${e.titre} du ${dFR(e.date)} · ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents`, ["tuteurs","accompagnement"]); closeSheet();
    }
  };
}

/* v21 : pointage d'une activité de la communauté (tous les étudiants actifs, recherche par nom) */
function formPointageCom(id){
  const e = S.programme.find(x=>x.id===id); if (!e) return;
  const ex = (S.pointagesCom||[]).find(x=>x.id===id), pr = {...(ex?.presences||{})};
  const L = S.etudiants.filter(s=>s.statut!=="Inactif").sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
  openSheet(`<h2>Pointage · ${esc(e.titre)}</h2><p class="small muted">${esc(jourLong(e.date))} · Activité de la communauté · P présent · R retard · J absent justifié · A absent</p>
    <label class="f" for="pc_q">Rechercher<input type="search" id="pc_q" placeholder="Nom ou matricule"></label>
    <div class="row"><button class="btn sm" type="button" id="pc_all">Tous présents</button><span class="small muted">Laisser vide = non concerné.</span><span class="small muted" id="pc_n"></span></div>
    <div class="plist" id="pc_l">${L.map(s=>`<div class="prow" data-q="${esc((s.nom+" "+s.matricule).toLowerCase())}"><span>${esc(s.nom)} <span class="small muted num">${esc(s.matricule)} · ${esc(s.niveau||"")}</span></span><span class="seg" data-who="${esc(s.matricule)}">${["P","R","J","A"].map(v=>`<button type="button" data-v="${v}" aria-pressed="${pr[s.matricule]===v}">${v}</button>`).join("")}</span></div>`).join("") || `<div class="empty">Aucun étudiant enregistré.</div>`}</div>
    <label class="f" for="pc_o">Observations (facultatif)<textarea id="pc_o" maxlength="800">${esc(ex?.obs||"")}</textarea></label>
    <div class="row"><button class="btn primary" id="pc_ok">Enregistrer le pointage</button><button class="btn" data-close>Annuler</button></div>`);
  const compter = () => { const v = Object.values(pr).filter(Boolean); $("#pc_n").textContent = `${v.filter(x=>x==="P"||x==="R").length} présent(s) / ${v.length} pointé(s)`; };
  const maj = () => { $("#pc_l").querySelectorAll(".seg").forEach(sg => sg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", pr[sg.dataset.who]===x.dataset.v))); compter(); };
  $("#pc_l").querySelectorAll(".seg button").forEach(b => b.onclick = () => { const w = b.parentElement.dataset.who; pr[w] = pr[w]===b.dataset.v ? "" : b.dataset.v; maj(); });
  $("#pc_q").oninput = ev => { const q = ev.target.value.trim().toLowerCase(); $("#pc_l").querySelectorAll(".prow").forEach(r => r.style.display = !q || r.dataset.q.includes(q) ? "" : "none"); };
  $("#pc_all").onclick = () => { L.forEach(s=>pr[s.matricule]="P"); maj(); };
  compter();
  $("#pc_ok").onclick = async () => {
    const presences = Object.fromEntries(Object.entries(pr).filter(([,v])=>v));
    if (!Object.keys(presences).length) return toast("Pointez au moins un étudiant.");
    const data = {programme:id, type:"communaute", date:e.date, titre:e.titre, intervenants:e.intervenants||[], presences, obs:$("#pc_o").value.trim(), par:S.email, parNom:compte().nom, le:nowISO(), historique:ajoute(ex?.historique, trace(ex?"Pointage modifié":"Pointage","Tenue"))};
    if (await write(()=>S.db.doc("pointages_communaute/"+id).set(data), "Présences enregistrées")){
      S.db.doc("programme/"+id).update({statut:"Tenue", pointeLe:nowISO(), pointePar:compte().nom, historique:ajoute(e.historique, trace("Activité pointée","Tenue"))}).catch(()=>{});
      const v = Object.values(presences); log("programme", `Activité pointée : ${e.titre} du ${dFR(e.date)} · ${v.filter(x=>x==="P"||x==="R").length}/${v.length} présents`, ["secretaire","president"]); closeSheet();
    }
  };
}

/* Export iCalendar (.ics) : ouvre dans Google Agenda ou l'agenda du téléphone */
function exporterIcs(L, nom){
  if (!L.length) return toast("Aucun événement à exporter.");
  const t = (d, h) => d.replace(/-/g,"") + (h ? "T" + h.replace(":","") + "00" : "");
  const echap = v => String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/[,;]/g, m=>"\\"+m);
  const lignes = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//CVPB//CVPB Manager//FR","CALSCALE:GREGORIAN","X-WR-CALNAME:Programme CVPB","X-WR-TIMEZONE:Africa/Abidjan"];
  for (const e of L){
    lignes.push("BEGIN:VEVENT", `UID:${e.id}@cvpb`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").slice(0,15)}Z`);
    if (e.hDebut){ lignes.push(`DTSTART;TZID=Africa/Abidjan:${t(e.date,e.hDebut)}`, `DTEND;TZID=Africa/Abidjan:${t(e.date,e.hFin||e.hDebut)}`); }
    else lignes.push(`DTSTART;VALUE=DATE:${t(e.date)}`);
    lignes.push(`SUMMARY:${echap(`[${TYPES_PROG[e.type][0]}] ${e.titre}`)}`, `LOCATION:${echap([e.lieu, e.lien].filter(Boolean).join(" · "))}`, `DESCRIPTION:${echap([e.description, (e.intervenants||[]).length && e.type!=="reunion" ? "Intervenant(s) : "+(e.intervenants||[]).map(nomDe).join(", ") : ""].filter(Boolean).join("\n"))}`, "END:VEVENT");
  }
  lignes.push("END:VCALENDAR");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lignes.join("\r\n")], {type:"text/calendar"})); a.download = nom + ".ics"; document.body.appendChild(a); a.click(); a.remove();
  toast(`${L.length} événement(s) exporté(s) : ouvrez le fichier pour l'ajouter à votre agenda.`);
}

/* ---------- Fiche pédagogique de l'étudiant ---------- */
function blocPedaEtu(mat){
  const s = etuBy(mat), p = S.C.peda[mat]; if (!s || !p) return "";
  const forms = Object.entries(p.par), valides = forms.filter(([,f])=>f.valide===true).length;
  const ND = code => notesParEval(S.notes.find(n=>n.id===code));
  const prochains = evenements().filter(e=>e.date>=today() && e.statut!=="Annulée" && ((e.type==="tutorat" && specsDe(e).some(sp=>memeSpec(s.specialite, sp)) && e.niveau===s.niveau) || (e.type==="academie" && s.academie && apprenantsPour(e.formation).some(x=>x.matricule===mat)))).slice(0,4);
  return `<div class="card"><h3>Suivi pédagogique</h3>
    <div class="kpis">${kpi(`${p.pres}/${p.total}`,"séances Académie suivies","g")}${kpi(pct(p.assiduite),"assiduité Académie")}${kpi(`${p.tut.pres}/${p.tut.total}`,"séances de tutorat suivies")}${kpi(p.moyenneGenerale==null?"—":n20(p.moyenneGenerale),"moyenne générale /20")}${kpi(`${valides}/${forms.length}`,"formations validées")}</div>
    ${forms.length ? forms.map(([code,f])=>{ const evs = evalsDe(toutesFormations().find(x=>x.code===code)), PE = ND(code);
      return `<div class="card fp"><div class="spread"><b>${esc(code)} · ${esc(nomForm(code))}</b>${f.valide==null?'<span class="pill mute">En cours</span>':f.valide?'<span class="pill ok">Validée</span>':'<span class="pill bad">Non validée</span>'}</div>
      <p class="small">Séances : <b>${f.pres}/${f.total}</b> (présent ${f.c.P}, retard ${f.c.R}, justifié ${f.c.J}, absent ${f.c.A}) · assiduité <b>${pct(f.assiduite)}</b></p>
      <div class="tablewrap"><table><thead><tr>${evs.map(e=>`<th class="r">${esc(e.libelle)}<br><span class="small muted">coef. ${esc(e.coef||1)}</span></th>`).join("")}<th class="r">Moyenne</th><th>Mention</th><th class="r">Rang</th></tr></thead>
      <tbody><tr>${evs.map(e=>`<td class="r">${esc(n20((PE[e.id]||{})[mat]))}</td>`).join("")}<td class="r"><b>${esc(n20(f.moyenne))}</b>${f.moyenne!=null&&!f.complet?' <span class="small muted">(provisoire)</span>':""}</td><td>${esc(f.mention||"—")}</td><td class="r">${f.rang?`${f.rang}/${f.effectif}`:"—"}</td></tr></tbody></table></div></div>`; }).join("") : `<div class="empty">Aucune séance ni note à l'Académie pour l'instant.</div>`}
    ${p.tut.total?`<details class="card"><summary>Tutorat : ${p.tut.pres}/${p.tut.total} séances (${pct(p.tut.assiduite)})</summary><div class="plist">${p.tut.liste.slice(0,12).map(x=>`<div class="prow"><span class="small">${dFR(x.date)} · ${esc(x.titre)}</span><span class="pill ${x.code==="A"?"bad":x.code==="J"?"warn":"ok"}">${{P:"Présent",R:"Retard",J:"Justifié",A:"Absent"}[x.code]||x.code}</span></div>`).join("")}</div></details>`:""}
    ${prochains.length?`<div class="card"><h3>Prochaines séances</h3><div class="clist">${prochains.map(e=>carteEv(e).replace('<span class="h">', `<span class="h">${esc(dLong(e.date))} · `)).join("")}</div></div>`:""}
  </div>`;
}

function abonnerProgramme(){
  const r = role(), db = S.db, has = (...l) => r==="president" || LECTURE_TOTALE.includes(r) || inclut(l, r);
  sub("programme","programme", s => { S.programme = rows(s); });
  if (has("tuteurs","accompagnement","secretaire","formation")) sub("pointages_tutorat","pointagesTut", s => { S.pointagesTut = rows(s); });
  else if (tousMesRoles().includes("tuteur")) sub("pointages_tutorat","pointagesTut", s => { S.pointagesTut = rows(s); }, db.collection("pointages_tutorat").where("tuteurs","array-contains",S.email));
  if (has("secretaire","accompagnement")) sub("pointages_communaute","pointagesCom", s => { S.pointagesCom = rows(s); });
  else sub("pointages_communaute","pointagesCom", s => { S.pointagesCom = rows(s); }, db.collection("pointages_communaute").where("intervenants","array-contains",S.email));
}

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
  /* Annuaire de l'équipe (noms, fonctions) : lisible par tous les comptes actifs pour l'organigramme, les tâches et les réunions */
  sub("users","comptes", s => { S.comptes = Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); });
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
  const canaux = r==="president" ? ["president"] : [r, "u_"+S.uid, "e_"+S.email];
  canaux.forEach((c, i) => db.collection(`notifs/${c}/items`).orderBy("le","desc").limit(lectureTotale()?400:150).onSnapshot(s => { S.jx[i] = rows(s); fusionJournal(); queueRender(); }, ()=>{}));
  abonnerGouv(); abonnerDelegues(); abonnerEquipe(); abonnerProgramme();
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
      if (S.moi && S.moi.actif !== false && !S.abonne) abonner();
      if (S.abonne && S.moi && S.moi.role !== "president" && JSON.stringify([S.moi.rolesSup||[], S.moi.commissions||[]]) !== S.signatureDroits && S.signatureDroits) location.reload();
      if (S.moi) S.signatureDroits = JSON.stringify([S.moi.rolesSup||[], S.moi.commissions||[]]);
      queueRender();
    }, () => { S.loaded.moi = true; queueRender(); });
    render();
  });
})();
