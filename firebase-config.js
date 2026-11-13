/* Configuration du projet Firebase de la CVPB (cvpb-gestion-001). */
export const firebaseConfig = {
  apiKey: "AIzaSyAKX7yyLiZc5ffBSHK0r3uAsYDUmuuZm4o",
  // Après la mise en ligne sur Firebase Hosting, remplacer par "cvpb-gestion-001.web.app"
  // (connexion Google plus fiable sur iPhone), puis redéployer.
  authDomain: "cvpb-gestion-001.firebaseapp.com",
  projectId: "cvpb-gestion-001",
  storageBucket: "cvpb-gestion-001.firebasestorage.app",
  messagingSenderId: "359098791087",
  appId: "1:359098791087:web:2c9aa6200e912046b4905a",

  /* Réglages CVPB : seules les adresses de ce domaine peuvent se connecter */
  domaine: "uvci.edu.ci"
  /* Le compte de la Présidence est défini uniquement dans les règles du serveur (firestore.rules). */
};
