# Chrono — Application mobile (client & livreur)

Application mobile Expo (React Native, managed workflow) pour **Chrono**,
service de livraison express à Cotonou. Elle couvre uniquement les profils
**client** et **livreur** — l'administration reste sur le site web
(`../frontend`). Toute l'interface est en français, dans le même ton et la
même palette (orange `#f97316`) que le site.

Ce projet consomme l'API du backend existant (`../backend`) **sans le
modifier**. Voir le contrat d'API dans le code (`src/lib/api.js` et les
écrans) si besoin de retrouver un endpoint.

## Choix techniques

- **Navigation par fichier `App.js`**, pas Expo Router : l'app est petite (2
  profils, une poignée d'écrans), une navigation React Navigation classique
  (`src/navigation/`) reste plus simple à suivre qu'une arborescence de
  fichiers. Le reste du projet Chrono (frontend web) est déjà en
  JavaScript classique sans conventions de fichiers magiques, donc ce choix
  reste cohérent.
- **JavaScript**, pas TypeScript, pour rester cohérent avec le reste du
  dépôt.
- Token JWT stocké dans `@react-native-async-storage/async-storage`
  (équivalent mobile du `localStorage` utilisé côté web).
- `axios` + intercepteur (`src/lib/api.js`), sur le même principe que
  `frontend/src/lib/api.js`.
- `AuthContext` (`src/context/AuthContext.js`) avec les mêmes noms de
  fonctions que côté web (`login`, `register`, `logout`, `refreshUser`).
- Temps réel via `socket.io-client` (`src/lib/socket.js` +
  `src/hooks/useLivePosition.js` / `src/hooks/useSendPosition.js`),
  équivalents des hooks `frontend/src/hooks/*`.
- Cartes avec `react-native-maps` (provider par défaut : Google Maps sur
  Android, Apple Maps sur iOS).
- Notes vocales avec `expo-audio` (enregistrement) + `expo-file-system`
  (téléchargement local avant lecture, car un fichier de note vocale est
  protégé par authentification — voir plus bas).

## Structure

```
mobile/
  App.js                     Point d'entrée (SafeAreaProvider + AuthProvider + navigation)
  app.json                   Configuration Expo (icônes, permissions, plugins)
  .env.example                Variable d'environnement à copier en .env
  src/
    lib/                     api.js (axios), socket.js, theme.js (couleurs), labels.js (libellés FR)
    context/AuthContext.js   Session utilisateur partagée
    hooks/                   useLivePosition.js, useSendPosition.js (temps réel)
    components/              TopBar, Card, Badge, PrimaryButton, TextField,
                              LocationPickerMap, TrackingMap, DocumentPanel
    navigation/               RootNavigator, AuthNavigator, ClientNavigator, LivreurNavigator
    screens/
      auth/                  LoginScreen, RegisterScreen
      client/                NewDeliveryScreen, MyDeliveriesScreen, DeliveryDetailScreen, WalletScreen, FloodAlertsScreen
      livreur/               LivreurHomeScreen, LivreurDeliveryDetailScreen
```

## Lancer en développement (Expo Go)

Prérequis : Node.js installé, et l'app **Expo Go** sur votre téléphone
(disponible sur l'App Store / Google Play) — ou un émulateur Android / un
simulateur iOS avec Xcode installé.

```bash
cd mobile
npm install
npx expo start
```

Un QR code s'affiche dans le terminal : scannez-le avec l'appareil photo
(iOS) ou l'app Expo Go (Android). Le backend (`../backend`) doit tourner en
parallèle (`cd ../backend && npm run dev`).

### Configurer l'URL de l'API backend

L'app lit l'URL de l'API dans la variable d'environnement publique Expo
`EXPO_PUBLIC_API_URL` (voir `.env.example`). **Copiez le fichier** :

```bash
cp .env.example .env
```

puis éditez `.env` :

```
EXPO_PUBLIC_API_URL=http://VOTRE_IP_LOCALE:4000/api
```

**Important** : sur un téléphone physique (via Expo Go) ou un simulateur
iOS, `localhost` désigne l'appareil lui-même, **pas** votre ordinateur qui
fait tourner le backend. Remplacez par l'adresse IP locale de votre machine
sur le réseau Wi-Fi (ex: `192.168.1.23`), trouvable avec `ipconfig`
(Windows) ou `ifconfig` / `ip a` (Mac/Linux). Le téléphone et l'ordinateur
doivent être sur le même réseau. Un émulateur Android fait exception : il
peut utiliser `http://10.0.2.2:4000/api` pour joindre le "localhost" de la
machine hôte.

Après avoir modifié `.env`, relancez `npx expo start` (redémarrage
nécessaire pour recharger les variables `EXPO_PUBLIC_*`).

## Fonctionnel aujourd'hui

- Inscription / connexion client et livreur (JWT).
- **Client** : création d'une demande de livraison avec sélection des points
  de retrait/livraison sur une carte, estimation de prix en direct (zone,
  distance, délai garanti), liste et détail des livraisons, paiement
  (mode simulateur si `FEDAPAY_SECRET_KEY` n'est pas configurée côté
  backend, sinon ouverture du checkout FedaPay dans le navigateur du
  téléphone puis re-synchronisation du statut de paiement), suivi en direct
  du livreur sur la carte, code de confirmation, annulation, avis après
  livraison.
- **Livreur** : bascule disponible/indisponible (bloquée tant que le
  compte n'est pas vérifié), envoi de la pièce d'identité et des documents
  de la moto — carte grise, assurance, permis, photo (photo caméra ou
  galerie, un statut par document, approbation admin requise sur les 5),
  gains totaux, liste des courses disponibles avec acceptation,
  suivi des courses actives, historique, avancement du statut
  (récupéré → en route), saisie du code de confirmation, partage de
  position en direct pendant la course (avec demande de permission de
  localisation au moment de la première course active, pas au lancement de
  l'app).
- Mises à jour en temps réel via Socket.io (position du livreur, statut de
  la livraison) avec repli par polling REST si le socket est indisponible.
- **Les 11 fonctionnalités différenciantes** (voir `../README.md`), avec
  parité web/mobile :
  - **Suivi sans app** : bouton "Partager le lien" (client) qui ouvre le
    sélecteur de partage natif (WhatsApp, SMS...) avec le lien public
    `/suivi/<token>`.
  - **Adressage par repères + note vocale** : champs d'adresse avec
    placeholder orienté repère, enregistrement/réécoute d'une note vocale
    (retrait et livraison) côté client, réécoute côté livreur.
  - **Paiement à la réception** : sélecteur "Qui paie ?" à la création ; si
    "le destinataire", l'écran de détail affiche un rappel au lieu du
    formulaire de paiement (le destinataire paie depuis le lien public web).
  - **Garantie colis** : interrupteur "Assurer ce colis" à la création
    (majoration affichée en direct) et formulaire de réclamation une fois la
    livraison terminée.
  - **Chrono Pro pour commerçants** : bouton de préremplissage "🏪 Ma
    boutique" si le compte a un profil marchand (renseigné depuis le site
    web — la configuration du profil et le carnet d'adresses restent une
    fonctionnalité web pour l'instant, voir Limites connues).
  - **Avance sur gains livreur** : onglet "💸 Avance" (solde disponible,
    demande, historique des décisions admin).
  - **Alerte SOS livreur** : bouton "🚨 SOS" toujours visible en haut de
    l'écran pour un livreur connecté (danger ou panne), envoie la position
    GPS exacte du moment à l'administrateur — l'alarme sonore et la carte
    de réception restent côté tableau de bord admin (web), voir
    `../README.md`.
  - **Livraison groupée** : à la création d'une demande (client), un
    bandeau propose de rejoindre une livraison compagnon compatible avec
    30% de réduction ; badge "🔗 Groupée" dans les listes et le détail
    (client et livreur).
  - **Retour automatique** : bouton "↩️ Le destinataire refuse le colis"
    (livreur, une fois le colis récupéré) avec motif obligatoire, écran de
    frais de retour (à régler en espèces) puis "Retour terminé" ; badge et
    panneau d'information côté client.
  - **Portefeuille Chrono** : nouvel onglet "💰 Portefeuille" (client) —
    solde, recharge (Mobile Money/carte, même circuit FedaPay que les
    livraisons) et historique ; case à cocher "Payer avec mon solde Chrono"
    à la création d'une livraison quand le solde est suffisant.
  - **Alerte route inondée** : nouvel onglet "🌊 Routes" (client et
    livreur) — liste des alertes actives, bouton pour en signaler une
    (position sur la carte + motif), et bouton pour lever son propre
    signalement. À la création d'une livraison (client), un bandeau
    d'avertissement non bloquant apparaît si le retrait ou la livraison est
    proche d'une alerte active ; côté livreur, un badge signale les courses
    disponibles concernées.

## Limites connues (honnêtes)

- **Pas de notifications push** configurées. Les notifications push Expo
  nécessitent un projet lié à un compte Expo/EAS (identifiant de projet,
  clés push Apple/Google) — c'est une étape à faire plus tard, une fois
  qu'un compte EAS du fondateur existe.
- **Pas de mode hors-ligne** : l'app nécessite une connexion réseau pour
  fonctionner (comme le site web).
- Les icônes/splash screen sont ceux par défaut du template Expo — à
  remplacer par les visuels de marque Chrono avant publication.
- L'upload de pièce d'identité ne propose que photo (caméra/galerie), pas
  de sélection de PDF (le backend accepte pourtant les PDF) : ajouter
  `expo-document-picker` permettrait de couvrir ce cas si besoin.
- **Chrono Pro** : la configuration du profil marchand (nom de boutique,
  adresse de retrait) et le carnet d'adresses favorites se font uniquement
  depuis le site web (onglet "Mon compte") pour l'instant — le mobile ne
  fait que consommer ce profil (bouton de préremplissage "🏪 Ma boutique").
  Ajouter les écrans de gestion correspondants côté mobile est une suite
  logique.
- **Notes vocales** : l'enregistrement/lecture (`expo-audio` +
  `expo-file-system`) n'a pu être vérifié que par bundling statique
  (`expo export`, sans erreur) et relecture de code dans cet environnement —
  pas de simulateur/téléphone physique disponible ici pour un test
  d'enregistrement micro réel. À tester en priorité sur un vrai appareil
  avant mise en production.
- **Recharge du portefeuille Chrono par FedaPay réel (mobile)** : en mode
  simulateur (pas de `FEDAPAY_SECRET_KEY` côté backend), la recharge est
  immédiate. Avec FedaPay réel activé, le backend renvoie une URL de
  paiement hébergée (`checkout_url`) — côté web et sur l'écran de paiement
  d'une livraison mobile, cette URL s'ouvre automatiquement dans le
  navigateur du téléphone ; sur l'écran Portefeuille mobile, cette
  ouverture automatique n'est **pas encore branchée** (l'app affiche un
  message demandant d'ouvrir le lien depuis un navigateur) — à corriger
  avant de compter sur la recharge en conditions réelles depuis le mobile.

## Publier sur les stores (App Store / Google Play)

**Ces étapes ne peuvent pas être réalisées depuis cet environnement** : elles
nécessitent les comptes développeur personnels du fondateur (identité,
moyen de paiement, accès à la console). Voici le chemin complet et honnête :

1. **Créer les comptes développeur** (à faire par le fondateur, avec ses
   propres identifiants) :
   - [Apple Developer Program](https://developer.apple.com/programs/) :
     ~99 USD/an, nécessite un Apple ID et (pour publier en tant
     qu'organisation) un numéro D-U-N-S.
   - [Google Play Console](https://play.google.com/console/) : ~25 USD,
     paiement unique.

2. **Créer un compte Expo (EAS)** sur [expo.dev](https://expo.dev) — gratuit
   pour démarrer. Lier le projet :
   ```bash
   npx eas login
   npx eas build:configure
   ```

3. **Remplacer les identifiants d'application** dans `app.json` :
   `ios.bundleIdentifier` et `android.package` sont actuellement
   `com.chronocotonou.mobile` (à valider/adapter selon ce qui est
   disponible sur les stores).

4. **Ajouter une clé Google Maps API** pour la production Android : la
   carte fonctionne sans clé en développement (Expo Go / build de dev),
   mais une build de production Android nécessite une clé dans
   `app.json` → `expo.android.config.googleMaps.apiKey` (actuellement un
   texte de remplacement `REMPLACER_PAR_UNE_CLE_GOOGLE_MAPS_API_EN_PRODUCTION`).
   Clé à créer dans la [Google Cloud Console](https://console.cloud.google.com/)
   (API "Maps SDK for Android").

5. **Remplacer les icônes/splash** (`assets/`) par les visuels de marque
   Chrono.

6. **Configurer `EXPO_PUBLIC_API_URL`** pour pointer vers l'API de
   production (pas `localhost`), par exemple via les variables
   d'environnement du profil `eas build` dans `eas.json`.

7. **Builder** avec EAS Build (compile côté serveurs Expo, pas besoin de
   Mac pour Android ; un compte Apple payant est nécessaire pour signer
   l'app iOS même en mode build à distance) :
   ```bash
   npx eas build --platform android --profile production
   npx eas build --platform ios --profile production
   ```

8. **Soumettre** aux stores avec EAS Submit (ou manuellement via App Store
   Connect / Google Play Console) :
   ```bash
   npx eas submit --platform android
   npx eas submit --platform ios
   ```

9. Remplir les fiches store (captures d'écran, description, politique de
   confidentialité — obligatoire vu la géolocalisation collectée côté
   livreur), puis passer par la revue Apple/Google avant publication
   effective.

## Vérifications effectuées

- `npm install` : installation propre, aucune dépendance manquante.
- `npx expo-doctor` : 19/21 vérifications passent. Les 2 échecs
  (« Check Expo config schema » et « Validate packages against React
  Native Directory ») sont dus au fait que cet environnement de
  développement bloque les appels réseau sortants vers `api.expo.dev` et
  `reactnative.directory` (politique du bac à sable, pas un problème du
  projet) — toutes les vérifications locales (versions de dépendances
  compatibles avec le SDK Expo installé, absence de doublons, structure du
  projet, etc.) passent.
- `npx expo export` (avec `EXPO_OFFLINE=1` pour éviter le même blocage
  réseau au démarrage de la commande) : bundling réussi pour **Android**
  (987 modules) et **iOS** (992 modules), sans erreur de syntaxe ni
  d'import manquant — vérifié après l'ajout des 11 fonctionnalités
  différenciantes (`expo-audio`, `expo-asset`, `expo-file-system` pour les
  notes vocales, `expo-location` déjà présent pour l'alerte SOS ; livraison
  groupée, retour automatique, portefeuille Chrono et alerte route inondée
  n'ont ajouté aucune dépendance native, seulement des écrans/appels API
  supplémentaires — l'alerte route inondée réutilise `LocationPickerMap`,
  déjà présent pour le formulaire de nouvelle livraison).
