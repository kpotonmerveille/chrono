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
      client/                NewDeliveryScreen, MyDeliveriesScreen, DeliveryDetailScreen
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
  compte n'est pas vérifié), envoi de la pièce d'identité (photo caméra ou
  galerie), gains totaux, liste des courses disponibles avec acceptation,
  suivi des courses actives, historique, avancement du statut
  (récupéré → en route), saisie du code de confirmation, partage de
  position en direct pendant la course (avec demande de permission de
  localisation au moment de la première course active, pas au lancement de
  l'app).
- Mises à jour en temps réel via Socket.io (position du livreur, statut de
  la livraison) avec repli par polling REST si le socket est indisponible.

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
  (953 modules) et **iOS** (958 modules), sans erreur de syntaxe ni
  d'import manquant.
