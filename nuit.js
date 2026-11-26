/* =====================================================================
   CVPB · Design « Nuit violette » — script commun (CVPB Manager / CVPB Académie)
   0. Touche numérique (grille, flux de données, boot, HUD)  1. Logo 3D animé au démarrage   2. Ciel étoilé + aurores   3. Cartes en relief 3D
   4. Entrée animée des écrans      5. Mode guide : explication de chaque écran
   Paramètres : <script src="nuit.js" data-app="aca|mgr" data-logo="…" data-nom="…" data-sous="…">
   ===================================================================== */
(function () {
  'use strict';
  var me = document.currentScript || document.querySelector('script[src*="nuit.js"]');
  var APP = (me && me.dataset.app) || 'aca';
  var LOGO = (me && me.dataset.logo) || 'icon-512.png';
  var NOM = (me && me.dataset.nom) || 'CVPB';
  var SOUS = (me && me.dataset.sous) || 'Communauté Virtuelle de Port-Bouët';
  var H = document.documentElement;
  var REDUIT = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  H.classList.add(APP === 'mgr' ? 'nuit-mgr' : 'nuit-aca');

  /* ---------- Mode nuit actif ? (suit le bouton clair / sombre de chaque application) ---------- */
  function sombre() { return APP === 'mgr' ? H.getAttribute('data-theme') !== 'light' : document.body && document.body.classList.contains('dark'); }
  function majTheme() { H.classList.toggle('nuit-on', !!sombre()); }

  /* ---------- 1. Écran de démarrage : logo 3D ---------- */
  var cleSplash = 'nuit_splash_' + APP, splash = null, t0 = Date.now();
  var dejaVu = false; try { dejaVu = sessionStorage.getItem(cleSplash) === '1'; } catch (e) { }
  var LIGNES = APP === 'mgr' ? ['INIT CVPB_MANAGER_CORE', 'SYNCHRO DES REGISTRES', 'CANAL SÉCURISÉ UVCI'] : ['INIT CVPB_ACADÉMIE_CORE', 'CHARGEMENT DES FORMATIONS', 'CANAL SÉCURISÉ UVCI'];
  var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  /* Texte qui se « décode » lettre après lettre (effet terminal) */
  function decoder(el, texte, delai, duree, fin) {
    if (!el) return; var G = '01<>/{}#$%ABCDEF', t0 = null;
    if (REDUIT) { el.textContent = texte; if (fin) fin(); return; }
    setTimeout(function () {
      (function pas(t) { if (!el.isConnected) return; if (t0 === null) t0 = t; var p = Math.min(1, (t - t0) / duree), n = Math.floor(p * texte.length), o = '';
        for (var i = 0; i < texte.length; i++) o += i < n || texte[i] === ' ' ? texte[i] : G[Math.floor(Math.random() * G.length)];
        el.textContent = o; if (p < 1) requestAnimationFrame(pas); else { el.textContent = texte; if (fin) fin(); } })(performance.now());
    }, delai);
  }
  function creerSplash() {
    if (dejaVu || !document.body) return;
    splash = document.createElement('div'); splash.id = 'nuitSplash'; splash.setAttribute('aria-hidden', 'true');
    var pix = ''; for (var i = 0; i < 64; i++) pix += '<i style="animation-delay:' + (0.5 + Math.random() * 1.3).toFixed(2) + 's"></i>';
    var boot = LIGNES.map(function (l, i) { return '<div style="animation-delay:' + (1.0 + i * 0.5).toFixed(2) + 's"><b>&gt;</b>' + l + '<em>OK</em></div>'; }).join('');
    splash.innerHTML = '<canvas></canvas><div class="scanline"></div><div class="stage"><div class="scene"><div class="halo"></div><div class="ring r1"></div><div class="ring r2"></div><div class="coin"><div class="face back"></div><div class="edge"></div>' +
      '<div class="face logo" style="background-image:url(' + LOGO + ')"></div><div class="pix">' + pix + '</div></div></div><h1></h1><p>' + SOUS.replace(/[<>&]/g, '') + '</p><div class="boot">' + boot + '</div><div class="bar"><i></i></div><div class="pct">0%</div></div><small>Touchez pour passer</small>';
    document.body.appendChild(splash);
    pluie(splash.querySelector('canvas'), true);
    var h = splash.querySelector('h1'), nom = NOM.replace(/[<>&]/g, '');
    decoder(h, nom.toUpperCase(), 700, 1100, function () { h.insertAdjacentHTML('beforeend', '<span class="cur"></span>'); });
    var barre = splash.querySelector('.bar i'), pct = splash.querySelector('.pct'), d0 = performance.now();
    (function prog(t) { if (!splash) return; var p = Math.min(1, (t - d0) / (REDUIT ? 600 : 2500)); p = 1 - Math.pow(1 - p, 2); barre.style.width = (p * 100) + '%'; pct.textContent = Math.round(p * 100) + '%'; if (p < 1) requestAnimationFrame(prog); })(d0);
    splash.addEventListener('click', fermerSplash);
    setTimeout(fermerSplash, REDUIT ? 900 : 5200);
  }
  function fermerSplash() {
    if (!splash || splash.classList.contains('out')) return;
    var reste = Math.max(0, (REDUIT ? 700 : 3000) - (Date.now() - t0));
    setTimeout(function () { if (!splash) return; splash.classList.add('out'); try { sessionStorage.setItem(cleSplash, '1'); } catch (e) { } setTimeout(function () { if (splash) { splash.remove(); splash = null; } }, 800); }, reste);
  }

  /* ---------- 2. Ciel étoilé (canvas) ---------- */
  function etoiles(cv, rapide) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W, Hh, S = [], filante = null, dpr = Math.min(window.devicePixelRatio || 1, 2), last = 0;
    function taille() {
      W = cv.clientWidth || innerWidth; Hh = cv.clientHeight || innerHeight; cv.width = W * dpr; cv.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(rapide ? 180 : 140, Math.round(W * Hh / (rapide ? 6000 : 9000))); S = [];
      for (var i = 0; i < n; i++) S.push({ x: Math.random() * W, y: Math.random() * Hh, r: Math.random() * 1.3 + .2, a: Math.random(), v: Math.random() * .015 + .004, c: Math.random() < .12 ? '#A7F3D0' : Math.random() < .3 ? '#C4B5FD' : '#FFFFFF' });
    }
    function dessin(t) {
      if (!cv.isConnected) return;
      if (!rapide && (document.hidden || !H.classList.contains('nuit-on'))) { requestAnimationFrame(dessin); return; }
      if (t - last < 33) { requestAnimationFrame(dessin); return; } last = t;
      ctx.clearRect(0, 0, W, Hh);
      for (var i = 0; i < S.length; i++) { var s = S[i]; s.a += s.v; var o = .35 + Math.abs(Math.sin(s.a)) * .65;
        ctx.globalAlpha = o; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
        if (s.r > 1.2) { ctx.globalAlpha = o * .25; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, 6.283); ctx.fill(); } }
      if (!filante && Math.random() < (rapide ? .02 : .004)) filante = { x: Math.random() * W * .7 + W * .2, y: Math.random() * Hh * .3, l: 0 };
      if (filante) { filante.l += 1; var fx = filante.x - filante.l * 9, fy = filante.y + filante.l * 4.5;
        var g = ctx.createLinearGradient(fx, fy, fx + 90, fy - 45); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(167,139,250,0)');
        ctx.globalAlpha = Math.max(0, 1 - filante.l / 40); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 90, fy - 45); ctx.stroke();
        if (filante.l > 40) filante = null; }
      ctx.globalAlpha = 1;
      if (!REDUIT) requestAnimationFrame(dessin);
    }
    taille(); addEventListener('resize', taille); requestAnimationFrame(dessin);
  }
  /* ---------- Pluie de données (canvas) ---------- */
  function pluie(cv, dense) {
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), W, Hh, C = [], dpr = Math.min(window.devicePixelRatio || 1, 2), last = 0, G = '01ABCDEF<>/{}$#%+=', fs = dense ? 15 : 14;
    function taille() {
      W = cv.clientWidth || innerWidth; Hh = cv.clientHeight || innerHeight; cv.width = W * dpr; cv.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(6, Math.floor(W / (fs * (dense ? 1.6 : 3.4)))); C = [];
      for (var i = 0; i < n; i++) C.push({ x: (i + .5) * (W / n), y: -Math.random() * Hh, v: (.6 + Math.random()) * (dense ? 1.5 : 1), l: 7 + Math.floor(Math.random() * 9), c: Math.random() < .35 ? '57,255,138' : '167,139,250' });
    }
    function dessin(t) {
      if (!cv.isConnected) return;
      if (!dense && (document.hidden || !H.classList.contains('nuit-on'))) { requestAnimationFrame(dessin); return; }
      if (t - last < 55) { requestAnimationFrame(dessin); return; } last = t;
      ctx.clearRect(0, 0, W, Hh); ctx.font = fs + 'px ' + MONO;
      for (var i = 0; i < C.length; i++) { var c = C[i];
        for (var k = 0; k < c.l; k++) { var y = c.y - k * fs; if (y < -fs || y > Hh + fs) continue;
          ctx.fillStyle = 'rgba(' + c.c + ',' + (k === 0 ? .85 : (1 - k / c.l) * .38).toFixed(2) + ')'; ctx.fillText(G[Math.floor(Math.random() * G.length)], c.x, y); }
        c.y += c.v * 5; if (c.y - c.l * fs > Hh) { c.y = -Math.random() * Hh * .4; c.v = (.6 + Math.random()) * (dense ? 1.5 : 1); } }
      if (!REDUIT) requestAnimationFrame(dessin);
    }
    taille(); addEventListener('resize', taille); requestAnimationFrame(dessin);
  }
  function creerFond() {
    if (document.getElementById('nuitBg')) return;
    var bg = document.createElement('div'); bg.id = 'nuitBg'; bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<div class="aur a1"></div><div class="aur a2"></div><div class="aur a3"></div><div class="dots"></div><div class="grid"></div><canvas></canvas><canvas class="rain"></canvas><div class="scan"></div><div class="orb2"></div><div class="orb"></div>';
    document.body.insertBefore(bg, document.body.firstChild);
    etoiles(bg.querySelector('canvas:not(.rain)'), false); pluie(bg.querySelector('canvas.rain'), false);
  }

  /* ---------- 3. Cartes en relief 3D (souris) et effet d'appui (tactile) ---------- */
  var CIBLES = '.kpi,.tile,.promo,.hero,.hx,.ring,.stc,.evt,.fp,.qa-i,.podium > *';
  function cible(e) { var el = e.target.closest && e.target.closest(CIBLES); return el && el.offsetHeight < 420 && H.classList.contains('nuit-on') ? el : null; }
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || REDUIT) return; var el = cible(e); if (!el) return;
    var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.classList.add('n3d'); el.style.transform = 'perspective(900px) rotateX(' + ((.5 - y) * 9).toFixed(2) + 'deg) rotateY(' + ((x - .5) * 11).toFixed(2) + 'deg) translateZ(6px)';
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%'); el.style.setProperty('--mo', '1');
    if (el !== tiltEl && tiltEl) reset(tiltEl); tiltEl = el;
  }, { passive: true });
  var tiltEl = null;
  function reset(el) { el.style.transform = ''; el.style.setProperty('--mo', '0'); }
  document.addEventListener('pointerout', function (e) { if (tiltEl && !tiltEl.contains(e.relatedTarget)) { reset(tiltEl); tiltEl = null; } }, { passive: true });
  document.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') return; var el = cible(e); if (el) { el.style.transform = 'perspective(900px) translateZ(-14px) scale(.97)'; tiltEl = el; } }, { passive: true });
  ['pointerup', 'pointercancel'].forEach(function (t) { document.addEventListener(t, function (e) { if (e.pointerType !== 'mouse' && tiltEl) { reset(tiltEl); tiltEl = null; } }, { passive: true }); });

  /* ---------- 4. Entrée animée à chaque changement d'écran ---------- */
  var nouvelEcran = 0;
  function conteneur() { return document.getElementById(APP === 'mgr' ? 'main' : 'view'); }
  addEventListener('hashchange', function () { nouvelEcran = Date.now(); if (Guide.ouvert) Guide.fermer(); if (store.get('nuit_guide_auto') === '1') setTimeout(function () { Guide.ecran(); }, 1100); });
  function observer() {
    var c = conteneur(); if (!c) return;
    new MutationObserver(function () {
      if (Date.now() - nouvelEcran > 2000 && nouvelEcran) return;
      c.classList.remove('n-enter'); void c.offsetWidth; c.classList.add('n-enter');
      clearTimeout(c._nT); c._nT = setTimeout(function () { c.classList.remove('n-enter'); }, 1200);
      if (nouvelEcran) nouvelEcran = 0;
      numerique(c);
    }).observe(c, { childList: true });
    nouvelEcran = Date.now();
  }

  /* ---------- 5. Mode guide ---------- */
  var T = APP === 'mgr' ? {
    accueil: ['Tableau de bord', "Vue d'ensemble de la CVPB : indicateurs clés (étudiants, cotisations, caisse, assiduité), alertes à traiter et programme des prochains jours. Chaque responsable voit ce qui concerne son rôle.", [['.hero', 'En-tête', 'Votre nom, votre rôle et le résumé de la journée.'], ['.rings,.kpis', 'Indicateurs', 'Les chiffres clés, mis à jour en direct.'], ['.alerts', 'Alertes', 'Ce qui demande une action : retards, validations, demandes en attente.']]],
    programme: ['Programme', "Calendrier de toutes les activités : séances de l'Académie, tutorat, activités de la communauté et réunions. Les formateurs, tuteurs et le Secrétariat général y programment leurs séances ; une séance validée est annoncée aux étudiants dans CVPB Académie.", [['#pgNew', 'Programmer', 'Créer une séance : date, heure, lieu ou lien Meet, intervenants, spécialités concernées.']]],
    consignes: ['Consignes', "Instructions de la Présidence aux responsables, avec suivi : lue, en cours, faite. Chaque responsable rend compte ici.", []],
    delegues: ['Délégués de spécialité', "Demandes de cours, cours à expliquer déposés le lundi et rapports hebdomadaires des délégués, contrôlés par 4 visas.", []],
    equipe: ['Espace responsables', "Tâches, présences et rapports hebdomadaires des responsables : l'implication de chacun est suivie ici.", []],
    taches: ['Tâches', "Tâches confiées à une personne ou à une équipe, avec échéance et statut. Un responsable n'agit que dans sa commission.", []],
    decisions: ['Décisions', "Circuit des décisions du bureau : émise, examinée par le Secrétariat général, confiée, exécutée. Tout est historisé.", []],
    reunions: ['Réunions', "Convocations, présences, compte rendu et suites à donner : chaque réunion doit produire des décisions et des responsables.", []],
    organigramme: ['Organigramme', "Qui fait quoi dans la CVPB : fonctions, commissions et comptes ouverts.", []],
    suivi: ['Suivi des étudiants', "Rapports hebdomadaires des tuteurs, validation par le Responsable des Tuteurs, exploitation par l'Accompagnement et contrôle du Secrétariat général.", []],
    synthese: ['Synthèses et rapports', "Synthèse hebdomadaire consolidée pour la Présidence : tutorat, accompagnement, difficultés et propositions.", []],
    catalogue: ['Catalogue des formations', "Les formations de la CVPB Académie : formateurs affectés, modules, évaluations et coefficients. Géré par le Responsable Formation.", []],
    messages: ['WhatsApp étudiants', "Messages préparés automatiquement (reçus de paiement, absences, notes) à envoyer aux étudiants sur WhatsApp en un clic.", []],
    etudiants: ['Étudiants', "Registre des membres de la CVPB : matricule, niveau, spécialité, statut et situation. La fiche de chaque étudiant réunit paiements, assiduité et notes.", [['.filters', 'Recherche et filtres', 'Retrouver un étudiant par nom, matricule, niveau ou statut.']]],
    registre: ['Registre des encaissements', "Toutes les recettes, numérotées et inaltérables : une erreur s'annule avec motif puis se ressaisit. La référence (ex. WV-2611-0038) est générée automatiquement.", [['#newEnc', 'Nouvel encaissement', "Saisir un paiement : l'application calcule l'affectation (T-shirt, inscription, mois de cotisation)."], ['.filters', 'Filtres', 'Par nature, mois ou statut ; recherche par nom, matricule ou référence.']]],
    cotisations: ['Suivi des cotisations', "Situation de chaque étudiant mois par mois : inscription, mensualités payées, arriérés. Relance WhatsApp en un clic.", []],
    tshirts: ['T-shirts', "Tailles choisies par les étudiants dans CVPB Académie, bon de commande par taille, puis suivi de la remise.", [['#tsImp', 'Importer', 'Reprendre les tailles du formulaire Google.'], ['#tsCmd', 'Commander', 'Marquer les T-shirts commandés : les tailles se figent.']]],
    caisse: ['Caisse', "Solde, dépôts des encaissements, entrées et sorties justifiées, livre de caisse. Chaque sortie est approuvée par la Présidence.", []],
    depots: ['Mes dépôts à la caisse', "Déclarer la remise à la caisse de l'argent encaissé, pour que registre et caisse concordent.", []],
    pedagogie: ['Suivi pédagogique', "Pointage des séances, notes par évaluation (devoirs, TP, séances pratiques), validation par le Responsable Formation et publication dans CVPB Académie.", [['.subtabs', 'Onglets', 'Présences, Notes, Assiduité et résultats.']]],
    tutorat: ['Anciens rapports de séance', "Historique des rapports de séance des tuteurs (ancien format).", []],
    rapports: ['Rapports PDF', "Rapports prêts à imprimer ou à partager : activité, finances, fiches étudiants.", []],
    evaluations: ['Évaluations', "Évaluation mensuelle des responsables : 60 % automatique (travail réel), 40 % appréciation de la Présidence.", []],
    classement: ['Classement', "Classement de l'équipe selon l'évaluation du mois.", []],
    aides: ["Demandes d'aide", "Questions des étudiants envoyées depuis CVPB Académie à leur formateur ou aux tuteurs de leur spécialité. Répondez par écrit ou proposez une séance ; l'onglet Compréhension montre la note moyenne (0 à 10) de chaque séance.", [['.subtabs', 'Onglets', "Demandes d'aide et compréhension des séances."]]],
    notifications: ['Alertes et notifications', "Tout ce qui s'est passé et tout ce qui attend une action, filtré selon votre rôle.", []],
    audit: ["Journal d'audit", "Trace de toutes les actions importantes : qui, quoi, quand. Ajout seulement.", []],
    admin: ['Administration', "Comptes et rôles, paramètres (montants, mois de cotisation), journal, import, et l'éditeur de données réservé à la Présidence.", [['.subtabs', 'Rubriques', "Comptes, Paramètres, Journal, Import, Éditeur de données."]]],
    compte: ['Mon compte', "Votre profil, vos fonctions, l'espace affiché et le thème.", []],
    't-hebdo': ['Rapport de la semaine', "Le rapport hebdomadaire obligatoire du tuteur : activités, présences, difficultés des étudiants. Il est validé par le Responsable des Tuteurs.", []],
    't-rapports': ['Mes rapports', "Vos rapports hebdomadaires et leur statut : soumis, validé, retourné pour correction.", []],
    't-etudiants': ['Mes étudiants', "Les étudiants qui vous sont affectés et leur assiduité au tutorat.", []]
  } : {
    home: ['Tableau de bord', "Votre résumé : assiduité, moyenne, paiements, prochaines séances et alertes. Pour l'équipe : indicateurs de l'Académie et accès rapides.", [['.hx,.hero', 'En-tête', 'Votre nom, votre rôle et vos chiffres clés.'], ['.qa', 'Actions rapides', 'Les raccourcis les plus utilisés.'], ['.tiles', 'Services', 'Accès à chaque rubrique.'], ['.alert', 'Alertes', 'Ce qui demande votre attention.']]],
    calendrier: ['Calendrier', "Toutes les séances et activités programmées, validées et annoncées, jour par jour.", []],
    validations: ['Validation des séances', "Les séances programmées dans CVPB Manager attendent ici leur validation avant d'être annoncées aux étudiants concernés.", []],
    formations: ['Formations', "Les formations de l'Académie : formateur, horaires, apprenants inscrits et progression.", []],
    apprenants: ['Apprenants', "Les étudiants inscrits à l'Académie, reliés à la liste officielle de CVPB Manager : assiduité, moyenne, situation de paiement.", []],
    seances: ['Séances & appel', "Faire l'appel d'une séance (présent, retard, absent justifié ou non). Les séances pointées dans CVPB Manager s'ajoutent automatiquement.", []],
    exercices: ['Exercices & notes', "Exercices, devoirs et notes par formation ; les notes validées dans CVPB Manager apparaissent ici.", []],
    quiz: ['Quiz & évaluations', "Créer des évaluations en ligne chronométrées : QCM, vrai/faux, textes à trous, questions rédigées, devoirs à rendre par lien. Correction automatique et suivi des sorties de page.", []],
    aides: ["Demandes d'aide", "Les questions des apprenants et la compréhension moyenne (0 à 10) de chaque séance. Répondez pour aider l'apprenant : il est notifié.", []],
    assiduite: ['Assiduité', "Taux de présence par apprenant et par formation, y compris tutorat et activités de la communauté.", []],
    sanctions: ['Discipline & sanctions', "Avertissements et sanctions, avec motif et suivi. L'apprenant concerné est notifié.", []],
    paiements: ['Situation financière', "Paiements des apprenants calculés depuis le registre de CVPB Manager : T-shirt, cotisations, reste à payer.", []],
    informations: ['Informations', "Les informations officielles publiées par la commission Communication.", []],
    annonces: ['Annonces', "Messages envoyés aux apprenants ou à une formation.", []],
    notifications: ['Notifications', "Toutes vos notifications : activités, paiements, notes, évaluations, aide, discipline.", []],
    utilisateurs: ['Utilisateurs & accès', "Qui a accès à l'Académie et avec quel rôle (repris de CVPB Manager).", []],
    parametres: ['Paramètres', "Réglages de l'Académie : montants, seuil d'assiduité, valideurs des séances.", []],
    donnees: ['Éditeur de données', "Réservé à la Présidence : modifier, créer ou supprimer n'importe quelle donnée des deux applications. À utiliser pour les vraies corrections.", []],
    mesformations: ['Mes formations', "Vos formations, votre assiduité séance par séance et votre moyenne.", []],
    aide: ['Compréhension & aide', "Notez votre compréhension de chaque séance de 0 à 10, et demandez de l'aide à votre formateur ou aux tuteurs de votre spécialité : ils sont notifiés.", []],
    mesquiz: ['Mes évaluations', "Vos évaluations en ligne. Le chrono démarre à « Commencer » et ne s'arrête plus ; ne quittez pas la page pendant l'épreuve.", []],
    mesnotes: ['Mes notes', "Toutes vos notes par formation, avec votre moyenne.", []],
    mespaiements: ['Mes paiements', "Votre T-shirt (et le choix de sa taille), vos cotisations mois par mois et l'historique de vos paiements.", []],
    discipline: ['Discipline', "Vos éventuels avertissements ou sanctions et leur motif.", []]
  };
  var GEN = APP === 'mgr' ? [
    ['#tabs', 'Sections', "Toutes les rubriques auxquelles votre rôle donne accès."], ['#bnav', 'Barre rapide', "Les écrans principaux, le bouton + (actions rapides) et le Menu complet."],
    ['#search', 'Recherche', "Trouver un étudiant, une formation ou un rapport (Ctrl + K)."], ['#bell', 'Notifications', "Les nouveautés qui vous concernent."], ['#nSwBtn', 'Changer d\'interface', "Passer à l'autre application CVPB (Manager ↔ Académie) ou, pour le Président, voir l'espace d'un étudiant, d'un formateur ou d'un responsable en lecture seule."], ['#nGuideBtn', 'Mode guide', "Ce bouton explique l'écran affiché. En « Mode présentation », chaque écran s'explique tout seul."]
  ] : [
    ['#nav', 'Menu', "Toutes les rubriques de votre espace."], ['#bottom', 'Barre rapide', "Les écrans principaux et le Menu."], ['#btnBell', 'Notifications', "Activités, paiements, notes, aide…"],
    ['[data-theme]', 'Mode nuit / clair', "Basculer entre le design nuit et le mode clair."], ['#nSwBtn', 'Changer d\'interface', "Passer à l'autre application CVPB (Manager ↔ Académie) ou, pour le Président, voir l'espace d'un étudiant, d'un formateur ou d'un responsable en lecture seule."], ['#nGuideBtn', 'Mode guide', "Ce bouton explique l'écran affiché. En « Mode présentation », chaque écran s'explique tout seul."]
  ];
  function pageId() {
    if (APP === 'mgr') { var h = location.hash.slice(1); return h || (document.body.classList.contains('tut') ? 't-accueil' : 'accueil'); }
    return (location.hash.match(/^#\/(\w+)/) || [])[1] || 'home';
  }
  function visible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; }
  function premier(sel) { var L = document.querySelectorAll(sel); for (var i = 0; i < L.length; i++) if (visible(L[i])) return L[i]; return null; }
  function titreEcran() {
    var t = APP === 'mgr' ? document.querySelector('#tabs a[aria-current]') : document.getElementById('title');
    return (t && t.textContent.replace(/\s*\(\d+\)\s*$/, '').trim()) || '';
  }
  var Guide = {
    ouvert: false, etapes: [], i: 0,
    ecran: function (complet) {
      var id = pageId(), d = T[id] || T[id.replace(/^t-/, '')] || [titreEcran() || 'Cet écran', "Cet écran fait partie de votre espace. Utilisez les boutons et filtres affichés ; vos droits dépendent de votre rôle.", []];
      var E = [{ el: conteneur(), k: 'Écran', t: titreEcran() || d[0], x: d[1] }];
      (d[2] || []).forEach(function (s) { var el = premier(s[0]); if (el) E.push({ el: el, k: d[0], t: s[1], x: s[2] }); });
      if (complet) GEN.forEach(function (s) { var el = premier(s[0]); if (el) E.push({ el: el, k: 'Navigation', t: s[1], x: s[2] }); });
      this.lancer(E);
    },
    lancer: function (E) {
      this.fermer(); if (!E.length) return; this.etapes = E; this.i = 0; this.ouvert = true;
      var g = document.createElement('div'); g.id = 'nGuide'; g.innerHTML = '<div class="hole"></div><div class="tip" role="dialog" aria-live="polite"></div>'; document.body.appendChild(g);
      this.g = g; this.aff(); var self = this;
      this.kb = function (e) { if (e.key === 'Escape') self.fermer(); else if (e.key === 'ArrowRight') self.aller(1); else if (e.key === 'ArrowLeft') self.aller(-1); };
      document.addEventListener('keydown', this.kb); this.rs = function () { self.place(); }; addEventListener('resize', this.rs); addEventListener('scroll', this.rs, true);
    },
    aller: function (d) { var n = this.i + d; if (n < 0) return; if (n >= this.etapes.length) return this.fermer(); this.i = n; this.aff(); },
    aff: function () {
      var s = this.etapes[this.i], tip = this.g.querySelector('.tip'), self = this, n = this.etapes.length;
      tip.innerHTML = '<div class="k">' + s.k + ' · ' + (this.i + 1) + '/' + n + '</div><h4></h4><p></p><div class="nav"><div class="dots">' + this.etapes.map(function (_, j) { return '<i class="' + (j === self.i ? 'on' : '') + '"></i>'; }).join('') + '</div><span class="sp"></span>' +
        (this.i ? '<button data-g="-1">Précédent</button>' : '<button data-g="x">Fermer</button>') + '<button class="go" data-g="1">' + (this.i === n - 1 ? 'Terminer' : 'Suivant') + '</button></div>';
      tip.querySelector('h4').textContent = s.t; tip.querySelector('p').textContent = s.x;
      tip.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { var v = b.dataset.g; v === 'x' ? self.fermer() : self.aller(+v); }; });
      var r = s.el && s.el.getBoundingClientRect();
      if (r && (r.top < 60 || r.bottom > innerHeight - 40) && r.height < innerHeight * .8) { s.el.scrollIntoView({ behavior: REDUIT ? 'auto' : 'smooth', block: 'center' }); setTimeout(function () { self.place(); }, 420); }
      this.place();
    },
    place: function () {
      if (!this.ouvert) return; var s = this.etapes[this.i], hole = this.g.querySelector('.hole'), tip = this.g.querySelector('.tip');
      var r = s.el ? s.el.getBoundingClientRect() : null, m = 8;
      if (!r || r.width < 4) { hole.style.cssText = 'left:50%;top:50%;width:0;height:0'; tip.style.left = Math.max(12, (innerWidth - tip.offsetWidth) / 2) + 'px'; tip.style.top = Math.max(12, (innerHeight - tip.offsetHeight) / 2) + 'px'; return; }
      var top = Math.max(r.top, 64), bot = Math.min(r.bottom, innerHeight - 8);
      hole.style.left = (r.left - m) + 'px'; hole.style.top = (top - m) + 'px'; hole.style.width = (r.width + 2 * m) + 'px'; hole.style.height = Math.max(30, bot - top + 2 * m) + 'px';
      var th = tip.offsetHeight || 180, tw = tip.offsetWidth || 320, y;
      if (bot + m + th + 14 < innerHeight) y = bot + m + 12; else if (top - m - th - 12 > 0) y = top - m - th - 12; else y = innerHeight - th - 16;
      tip.style.top = Math.max(12, y) + 'px'; tip.style.left = Math.min(innerWidth - tw - 12, Math.max(12, r.left + r.width / 2 - tw / 2)) + 'px';
    },
    fermer: function () { if (this.g) this.g.remove(); this.g = null; this.ouvert = false; document.removeEventListener('keydown', this.kb); removeEventListener('resize', this.rs); removeEventListener('scroll', this.rs, true); }
  };
  window.NuitGuide = Guide; window.NuitSwitch = { ouvrir: function () { return ouvrirSw(); } };
  function bouton() {
    if (document.getElementById('nGuideBtn')) return;
    var b = document.createElement('button'); b.id = 'nGuideBtn'; b.type = 'button'; b.title = 'Mode guide : explication des écrans'; b.setAttribute('aria-label', 'Mode guide'); b.textContent = '?';
    if (store.get('nuit_guide_auto') === '1') b.classList.add('auto');
    b.onclick = function (e) { e.stopPropagation(); menu(); };
    document.body.appendChild(b);
  }
  function menu() {
    var ex = document.getElementById('nGuideMenu'); if (ex) { ex.remove(); return; }
    var auto = store.get('nuit_guide_auto') === '1', m = document.createElement('div'); m.id = 'nGuideMenu';
    m.innerHTML = '<button data-m="e"><span class="ic">💡</span><span>Expliquer cet écran<small>Ce que montre cette page et à quoi servent ses éléments</small></span></button>' +
      '<button data-m="c"><span class="ic">🧭</span><span>Visite complète<small>Cet écran, puis le menu, les notifications et les raccourcis</small></span></button>' +
      '<button data-m="a"><span class="ic">' + (auto ? '⏹' : '🎬') + '</span><span>' + (auto ? 'Arrêter le mode présentation' : 'Mode présentation') + '<small>' + (auto ? 'Les écrans ne s\'expliquent plus tout seuls' : 'Chaque écran ouvert s\'explique automatiquement : idéal pour une démonstration') + '</small></span></button>';
    document.body.appendChild(m);
    m.onclick = function (e) { var t = e.target.closest('[data-m]'); if (!t) return; m.remove();
      if (t.dataset.m === 'e') Guide.ecran(false); else if (t.dataset.m === 'c') Guide.ecran(true);
      else { var on = store.get('nuit_guide_auto') !== '1'; store.set('nuit_guide_auto', on ? '1' : '0'); document.getElementById('nGuideBtn').classList.toggle('auto', on); if (on) Guide.ecran(true); } };
    setTimeout(function () { document.addEventListener('click', function f(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', f); } }); }, 0);
  }
  /* Le bouton guide n'apparaît qu'une fois connecté (application affichée) */
  function majBouton() {
    var pret = APP === 'mgr' ? !!document.querySelector('#tabs a') : !!(document.getElementById('app') && !document.getElementById('app').classList.contains('hidden'));
    var b = document.getElementById('nGuideBtn'); if (pret && !b) bouton(); else if (!pret && b) b.remove();
    if (pret) { boutonSw(); bandeau(); } else { var q = document.getElementById('nSwBtn'); if (q) q.remove(); var z = document.getElementById('nApercu'); if (z) z.remove(); }
  }

  /* ---------- Touche numérique : titre décodé, chiffres qui défilent, barre de progression ---------- */
  function numerique(c) {
    var h = c.querySelector('h2'); if (h && !h.children.length && h.textContent.length < 60 && !h._d) { h._d = 1; var tx = h.textContent; decoder(h, tx, 60, 520); }
    var L = c.querySelectorAll('.kpi .v, .kpi b, .hx-val');
    for (var i = 0; i < L.length && i < 40; i++) compter(L[i]);
  }
  function compter(el) {
    if (el._c || el.children.length || REDUIT) return; el._c = 1;
    var tx = el.textContent, m = tx.match(/^(\s*)(\d{1,3}(?:[   ]\d{3})+|\d+)(.*)$/); if (!m) return;
    var sep = (m[2].match(/[   ]/) || [''])[0], n = parseInt(m[2].replace(/[   ]/g, ''), 10); if (!isFinite(n) || n < 2 || n > 1e9) return;
    var d0 = performance.now(), dur = 850;
    (function pas(t) { if (!el.isConnected) return; var p = Math.min(1, (t - d0) / dur), v = Math.round(n * (1 - Math.pow(1 - p, 3))), s = String(v);
      if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      el.textContent = p < 1 ? m[1] + s + m[3] : tx; if (p < 1) requestAnimationFrame(pas); })(d0);
  }
  function barreHaut() {
    var b = document.getElementById('nTop'); if (!b) { b = document.createElement('div'); b.id = 'nTop'; document.body.appendChild(b); }
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }
  addEventListener('hashchange', barreHaut);

  /* ---------- Centre des interfaces (changer d'application ou d'espace) + bandeau d'aperçu ---------- */
  var escH = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function fermerSw() { var e = document.getElementById('nSw'); if (e) e.remove(); }
  async function ouvrirSw() {
    fermerSw(); if (typeof window.CVPB_INTERFACES !== 'function') return;
    var cfg; try { cfg = await window.CVPB_INTERFACES(); } catch (e) { cfg = { apps: [], groupes: [] }; } if (!cfg) return;
    var w = document.createElement('div'); w.id = 'nSw'; document.body.appendChild(w);
    var P = null; w.onclick = function (e) { if (e.target === w) fermerSw(); };
    function entete(titre) { return '<header><h3>' + escH(titre) + '</h3><button type="button" data-x aria-label="Fermer">✕</button></header>'; }
    function accueil() {
      var h = '<div class="p">' + entete('⇄ CENTRE DES INTERFACES') + '<p class="note">' + escH(cfg.intro || 'Passez d\'une application à l\'autre ou changez d\'espace de travail.') + '</p>';
      h += '<h4>// APPLICATIONS</h4><div class="grid2">' + (cfg.apps || []).map(function (a, i) {
        return '<a class="it' + (a.ici ? ' on' : '') + '" ' + (a.ici ? 'data-ici' : 'href="' + escH(a.url) + '"') + ' style="animation-delay:' + (i * .06) + 's"><span class="ic">' + (a.ico || '▣') + '</span><span><b>' + escH(a.nom) + '</b><small>' + escH(a.sous || '') + '</small></span>' + (a.ici ? '<span class="tag">ICI</span>' : '') + '</a>'; }).join('') + '</div>';
      (cfg.groupes || []).forEach(function (g, gi) {
        h += '<h4>// ' + escH(g.titre).toUpperCase() + '</h4>' + (g.note ? '<p class="note">' + escH(g.note) + '</p>' : '') + '<div class="grid2">' + g.items.map(function (it, i) {
          return '<button type="button" class="it' + (it.actif ? ' on' : '') + '" data-g="' + gi + '" data-i="' + i + '" style="animation-delay:' + (.1 + i * .035) + 's"><span class="ic">' + (it.ico || '◈') + '</span><span><b>' + escH(it.nom) + '</b><small>' + escH(it.sous || '') + '</small></span>' + (it.actif ? '<span class="tag">ACTIF</span>' : '') + '</button>'; }).join('') + '</div>'; });
      w.innerHTML = h + '</div>'; lier();
    }
    function lier() {
      w.querySelector('[data-x]').onclick = fermerSw;
      var ici = w.querySelector('[data-ici]'); if (ici) ici.onclick = function (e) { e.preventDefault(); fermerSw(); };
      w.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { choix(cfg.groupes[+b.dataset.g].items[+b.dataset.i]); }; });
    }
    async function choix(it) {
      if (!it.choisir) { fermerSw(); it.appliquer && it.appliquer(null); return; }
      w.innerHTML = '<div class="p">' + entete(it.nom.toUpperCase()) + '<div class="vide">Chargement…</div></div>'; w.querySelector('[data-x]').onclick = fermerSw;
      var L = []; try { L = await it.choisir(); } catch (e) { L = []; }
      function liste(q) {
        q = (q || '').toLowerCase(); var F = L.filter(function (p) { return !q || (p.nom + ' ' + (p.sous || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 80);
        return (it.sansPersonne ? '<button type="button" class="it" data-p="-1"><span class="ic">👁</span><span><b>Aperçu général</b><small>Sans personne précise : voir le menu et les écrans de ce rôle</small></span></button>' : '') +
          (F.length ? F.map(function (p) { return '<button type="button" class="it" data-p="' + L.indexOf(p) + '"><span class="ic">' + escH((p.nom || '?').trim().charAt(0).toUpperCase()) + '</span><span><b>' + escH(p.nom) + '</b><small>' + escH(p.sous || '') + '</small></span></button>'; }).join('') : '<div class="vide">Aucune personne trouvée pour ce rôle.</div>');
      }
      w.innerHTML = '<div class="p">' + entete(it.nom.toUpperCase()) + '<button type="button" class="back" data-b>← RETOUR</button><p class="note">' + escH(it.note || 'Choisissez la personne dont vous voulez voir l\'interface. Lecture seule : rien ne sera modifié.') + '</p>' +
        (L.length > 6 ? '<input class="rech" placeholder="Rechercher…" autocomplete="off">' : '') + '<div class="liste">' + liste('') + '</div></div>';
      w.querySelector('[data-x]').onclick = fermerSw; w.querySelector('[data-b]').onclick = accueil;
      function brancher() { w.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.p; fermerSw(); it.appliquer && it.appliquer(i < 0 ? null : L[i]); }; }); }
      brancher(); var r = w.querySelector('.rech'); if (r) { r.oninput = function () { w.querySelector('.liste').innerHTML = liste(r.value); brancher(); }; r.focus(); }
    }
    accueil();
  }
  function boutonSw() {
    var ok = typeof window.CVPB_INTERFACES === 'function', b = document.getElementById('nSwBtn');
    if (ok && !b) { b = document.createElement('button'); b.id = 'nSwBtn'; b.type = 'button'; b.title = 'Changer d\'interface'; b.setAttribute('aria-label', 'Changer d\'interface'); b.textContent = '⇄'; b.onclick = function (e) { e.stopPropagation(); ouvrirSw(); }; document.body.appendChild(b); }
    else if (!ok && b) b.remove();
  }
  function bandeau() {
    var a = typeof window.CVPB_APERCU === 'function' ? window.CVPB_APERCU() : null, e = document.getElementById('nApercu');
    H.classList.toggle('n-apercu', !!a);
    if (a && !e) { e = document.createElement('div'); e.id = 'nApercu'; e.innerHTML = '<span class="eye">👁</span><span>' + escH(a.texte) + '<small>APERÇU · LECTURE SEULE</small></span><button type="button">Quitter</button>'; e.querySelector('button').onclick = function () { a.quitter && a.quitter(); }; document.body.appendChild(e); }
    else if (!a && e) e.remove();
  }

  /* ---------- Démarrage ---------- */
  function go() {
    majTheme(); creerSplash(); creerFond(); observer();
    new MutationObserver(majTheme).observe(H, { attributes: true, attributeFilter: ['data-theme'] });
    new MutationObserver(majTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setInterval(majBouton, 800); majBouton();
    if (document.readyState === 'complete') fermerSplash(); else addEventListener('load', fermerSplash);
  }
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
