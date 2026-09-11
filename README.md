# Chrono — Livraison express en 30 min à Cotonou

Application web (MVP) de livraison express à Cotonou et ses environs,
pensée pour concurrencer Yango et Gozem : prix fixe et transparent par zone
(pas de négociation), commission plateforme fixe, sécurité par code de
confirmation.

Trois espaces, disponibles sur le site web et sur l'application mobile
(`mobile/`, React Native/Expo, pour client et livreur — l'administrateur
reste sur le site web) :
- **Client** : crée une demande de livraison, voit immédiatement le prix fixe
  de sa zone (calculé sur la distance **routière réelle**, pas à vol
  d'oiseau), paie via FedaPay (Mobile Money / carte), suit le livreur **en
  direct sur la carte** pendant la course, reçoit un code de confirmation,
  note le livreur.
- **Livreur** : envoie sa pièce d'identité **et les documents de sa moto**
  (carte grise, assurance, permis de conduire, photo de la moto) — les 5
  doivent être approuvés par l'administration avant de pouvoir travailler —
  se déclare disponible, accepte des courses (avec le montant net qu'il
  touchera affiché clairement), fait progresser le statut, partage sa
  position GPS en direct pendant la course, confirme la remise avec le code
  donné par le destinataire.
- **Administrateur** : tableau de bord (statistiques, revenus, répartition
  par zone), examine et approuve/refuse individuellement la pièce
  d'identité et chaque document véhicule d'un livreur, supervise toutes les
  livraisons, est alerté dès qu'une course reste impayée plus de 15
  minutes (bandeau + onglet dédié avec numéro à appeler), et reçoit une
  **alarme sonore + la position GPS exacte en temps réel** dès qu'un
  livreur déclenche une alerte SOS (danger ou panne).

## Fonctionnalités différenciantes (jamais vues au Bénin / en Afrique francophone)

Onze fonctionnalités conçues pour démarquer Chrono de Yango/Gozem, disponibles
sur le web **et** sur l'application mobile :

1. **Suivi sans app** : chaque livraison génère un lien public
   (`/suivi/<token>`) que le client partage par SMS/WhatsApp à qui il veut —
   suivi en direct sur la carte, sans compte ni installation. Voir
   `backend/src/routes/public.js`.
2. **Adressage par repères + note vocale** : les champs d'adresse acceptent un
   repère écrit ("en face de la pharmacie du carrefour") et une courte note
   vocale enregistrée depuis le téléphone peut être jointe au retrait et/ou à
   la livraison, pour guider le livreur.
3. **Paiement à la réception** : le client choisit qui paie — lui à la
   création, ou le destinataire au moment de la livraison via le lien de
   suivi public.
4. **Garantie colis** : assurance optionnelle (+150 FCFA) avec réclamation en
   un clic si le colis arrive cassé ou perdu, examinée par l'admin
   (remboursement ou refus).
5. **Chrono Pro pour commerçants** : un client peut se déclarer commerçant
   (site web, onglet "Mon compte") pour préremplir son adresse de retrait en
   un clic à chaque nouvelle livraison, avec un carnet d'adresses favorites.
   Une vitrine publique (`/boutique/<slug>`) affiche ses infos de retrait.
6. **Avance sur gains livreur** : un livreur peut demander une avance sur ce
   qu'il a déjà gagné dans la journée, avant la fin de journée — le
   versement Mobile Money réel reste géré manuellement par l'admin (pas
   d'API de paiement sortant intégrée pour l'instant).
7. **Alerte SOS livreur** : bouton "🚨 SOS" toujours visible pour un livreur
   connecté (danger ou panne), qui envoie instantanément sa position GPS
   exacte à l'administrateur — alarme sonore continue (Web Audio API, sans
   fichier audio à héberger) et bandeau rouge persistant sur le tableau de
   bord admin, avec un lien Google Maps vers la position et le numéro du
   livreur à appeler, pour envoyer la police ou une équipe de dépannage.
   Voir `backend/src/routes/alertes.js`.
8. **Livraison groupée (course partagée)** : quand un client crée une demande,
   l'app détecte automatiquement si un autre client a déjà une demande
   compatible en attente (même zone, points de retrait à moins de 1,2 km,
   créée il y a moins de 20 min) et propose de la rejoindre pour **30% de
   réduction** — jusqu'à 3 colis par groupe. Le prix de la première demande
   n'est jamais recalculé : seul celui qui rejoint profite de la réduction. Le
   livreur qui accepte une course groupée récupère automatiquement tous les
   colis payés du groupe. Voir `findGroupableCandidate` dans
   `backend/src/routes/deliveries.js`.
9. **Retour automatique si le destinataire refuse** : le livreur peut signaler
   en un clic (avec motif) qu'un destinataire refuse son colis une fois qu'il
   l'a récupéré ; l'app calcule des frais de retour (50% du prix), affichés
   au client et au livreur, **à régler en espèces au livreur** (pas encore
   intégrés à FedaPay). La livraison est alors clôturée comme "retournée"
   plutôt que "livrée".
10. **Portefeuille Chrono (solde prépayé)** : le client peut recharger un
    solde une fois (Mobile Money/carte, via le même circuit FedaPay que les
    livraisons) puis payer ses livraisons suivantes instantanément avec ce
    solde, sans repasser par Mobile Money à chaque course — pratique pour un
    client Chrono Pro qui envoie plusieurs colis par jour.
11. **Alerte route inondée** : en saison des pluies, certains axes de
    Cotonou deviennent impraticables — aucune donnée fiable n'existe pour le
    détecter automatiquement, donc client et livreur peuvent signaler
    manuellement un point inondé (position sur la carte + motif). L'alerte
    est visible de tous (onglet "🌊 Routes"), reste affichée quelques heures
    (voir `FLOOD_ALERT_TTL_HOURS`) ou jusqu'à ce que son auteur la lève, et
    déclenche un avertissement non bloquant à la création d'une livraison
    si le retrait ou la livraison passe à proximité (rayon de 1,5 km, voir
    `FLOOD_ALERT_RADIUS_KM`). Voir `backend/src/routes/inondations.js`.

## Le modèle économique (validé le 08/09/2026)

Grille de prix par zone, sans négociation entre client et livreur :

| Zone | Distance retrait → livraison | Prix client | Commission plateforme | Part du livreur | Délai 30 min garanti |
|---|---|---|---|---|---|
| Courte | Même quartier, < 2 km | 500 FCFA | 100 FCFA | 400 FCFA | ✅ Oui |
| Moyenne | Quartiers voisins, 2-5 km | 800 FCFA | 100 FCFA | 700 FCFA | ✅ Oui |
| Longue | > 5 km | 1 400 FCFA | 100 FCFA | 1 300 FCFA | ❌ Non |

La zone est déterminée à partir de la **distance routière réelle** entre les
coordonnées GPS placées par le client sur la carte (moteur d'itinéraire
OSRM ; si OSRM est injoignable, l'app bascule sur une estimation qui tient
compte des détours de ville et de la traversée de la lagune de Cotonou plutôt
que la ligne droite — voir `backend/src/pricing.js`). Si aucune coordonnée
n'est fournie, la zone "moyenne" est utilisée par défaut. Toute la logique
est centralisée dans `backend/src/pricing.js` — c'est le seul fichier à
modifier pour ajuster les tarifs ou ajouter une zone.

Un abonnement mensuel livreur (1 500 à 2 500 FCFA) a été envisagé mais n'est
**pas encore implémenté** : le risque identifié est qu'il freine le
recrutement des tout premiers livreurs tant que le volume de commandes n'est
pas prouvé. À réintroduire plus tard, une fois qu'il y a un flux de commandes
réel, en option ("livreur premium") plutôt qu'en passage obligé.

## Comment ça répond aux problèmes identifiés

| Problème | Réponse dans l'app |
|---|---|
| Sécurité | Pièce d'identité **et documents de la moto** (carte grise, assurance, permis, photo) obligatoires, examinés et approuvés individuellement par l'admin avant activation du livreur ; code de confirmation à 4 chiffres obligatoire pour clôturer chaque livraison (évite vol/erreur de destinataire) ; paiement en ligne via FedaPay (moins de manipulation de cash) ; **alerte SOS livreur** (danger/panne) avec position GPS exacte envoyée en direct à l'admin |
| Disponibilité | Les livreurs basculent leur statut disponible/indisponible ; le client ne voit que des livreurs vérifiés et actifs |
| Rapidité | Mise en relation immédiate : dès qu'une demande est payée, elle apparaît chez tous les livreurs disponibles, premier arrivé premier servi ; prix fixe affiché instantanément (distance routière réelle), aucune négociation |
| Promptitude | Suivi de statut **et de position GPS en direct** (créée → acceptée → récupérée → en route → livrée), avec horodatage à chaque étape ; garantie 30 min affichée uniquement quand elle est tenable (zones courte et moyenne) |
| Organisation | Historique complet côté client et livreur, tableau de bord admin avec statistiques, revenus et répartition par zone |

## Stack technique

- **Backend** : Node.js + Express + SQLite (better-sqlite3), authentification JWT, Socket.io (position/statut en direct), Multer (upload de pièce d'identité)
- **Frontend web** : React + Vite + Tailwind CSS v4, cartes avec Leaflet/OpenStreetMap (gratuit, sans clé API)
- **Application mobile** (dossier `mobile/`) : React Native + Expo, pour les profils client et livreur — voir `mobile/README.md`
- **Distance/tarification** : distance routière réelle via OSRM (avec repli local si injoignable) — voir `backend/src/pricing.js`
- **Paiement** : FedaPay (Mobile Money / carte) — bascule automatiquement en simulateur si aucune clé n'est configurée (pratique pour démo/dev)
- **Déploiement** : service unique (le backend sert le frontend web construit), voir `DEPLOIEMENT.md`

## Installation et démarrage

Prérequis : Node.js 18+ installé sur votre machine.

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:4000`. Un compte administrateur est
créé automatiquement au premier démarrage (voir `backend/.env`) :

- Email : `admin@chrono.bj`
- Mot de passe : `Admin@2026`

**Important : changez ces identifiants et le `JWT_SECRET` dans `backend/.env`
avant toute mise en ligne réelle.**

### 2. Frontend

Dans un autre terminal :

```bash
cd frontend
npm install
npm run dev
```

L'application s'ouvre sur `http://localhost:5173` (le serveur de
développement redirige automatiquement les appels `/api` vers le backend).

### 3. Utilisation

1. Créez un compte **livreur** (`/inscription?role=livreur`), puis envoyez depuis son tableau de bord sa pièce d'identité et les 4 documents de sa moto (carte grise, assurance, permis, photo).
2. Connectez-vous en tant qu'**admin**, ouvrez l'onglet "Livreurs", cliquez "Voir détails" pour examiner chaque document ("Voir") et cliquez "Approuver" (ou "Refuser" avec un motif) — le compte n'est activé que lorsque les 5 documents sont approuvés.
3. Le livreur se connecte et passe en "Disponible".
4. Créez un compte **client**, faites une demande de livraison (placez les points sur la carte pour une zone précise et une distance routière réelle), payez.
5. Le livreur voit la course dans "Disponibles" avec le montant net qu'il touchera, l'accepte, met à jour le statut. Sa position GPS est alors partagée en direct.
6. Le client suit la position du livreur en direct sur la carte, puis transmet le code de confirmation affiché sur son écran au livreur, qui le saisit pour clôturer la livraison.
7. Le client peut ensuite noter le livreur.

## Paiement FedaPay

Le fichier `backend/src/routes/payments.js` intègre FedaPay (SDK officiel
`fedapay`). Tant que `FEDAPAY_SECRET_KEY` n'est pas renseignée dans
`backend/.env`, le paiement reste **simulé** (succès immédiat, pratique en
dev/démo). Pour activer le vrai paiement :

1. Récupérez vos clés (sandbox puis live) sur votre tableau de bord FedaPay.
2. Renseignez `FEDAPAY_SECRET_KEY` et `FEDAPAY_ENV` (`sandbox` ou `live`) dans `backend/.env`.
3. Configurez un webhook FedaPay pointant vers `<votre-url>/api/payments/webhook` et renseignez `FEDAPAY_WEBHOOK_SECRET` — c'est ce webhook, pas la redirection du client, qui confirme réellement le paiement.

Voir `DEPLOIEMENT.md` pour la configuration sur Render.

### Comment circule l'argent aujourd'hui (à lire avant de compter dessus)

Que ce soit l'expéditeur (paiement à la création) ou le destinataire
(paiement à la réception via le lien de suivi public), **tout paiement
atterrit intégralement sur le compte FedaPay de Chrono** — il n'y a **aucune
répartition ni versement automatique vers le livreur**. Le montant "pour
vous" affiché au livreur (prix moins la commission de 100 F) est un chiffre
calculé pour son information, pas un virement réel.

Le seul mécanisme qui fait bouger de l'argent vers un livreur est l'avance
sur gains (`livreur_advances`) : le livreur demande, l'admin approuve dans le
tableau de bord, puis **l'admin envoie manuellement** le Mobile Money en
dehors de l'app et marque la demande "versée". Un vrai virement automatique
vers les livreurs nécessiterait de connecter une API de paiement **sortant**
(et pas seulement entrant) — à valider avec FedaPay ou un opérateur Mobile
Money avant de l'implémenter.

Le **portefeuille Chrono** (solde prépayé client) réutilise exactement ce
même circuit FedaPay/simulateur pour la recharge (`createWalletRecharge` dans
`backend/src/routes/payments.js`) — une recharge suit donc les mêmes règles
que ci-dessus, et payer une livraison avec le solde ne fait que débiter une
ligne dans `wallet_transactions`, sans mouvement d'argent supplémentaire.

Les **frais de retour** (destinataire qui refuse un colis) ne passent **pas**
par FedaPay : ils sont affichés à titre indicatif au client et au livreur,
et se règlent **en espèces, directement entre le livreur et le client**,
en dehors de l'app.

## Prochaines étapes suggérées

- **Abonnement livreur** : à réintroduire une fois le volume de commandes prouvé (voir plus haut).
- **Notifications** : SMS/push au client et au livreur à chaque changement de statut (l'app mobile n'a pas encore les notifications push configurées — nécessite un projet EAS lié à un compte Expo).
- **Publier l'app mobile** sur les stores (Apple App Store / Google Play) — voir `mobile/README.md` pour les étapes (comptes développeur requis).
- **Affiner les zones** : passer d'un rayon de distance à un vrai découpage par quartier une fois que les tarifs auront été validés sur le terrain ; affiner la frontière approximative de la lagune posée dans `backend/src/pricing.js` avec de vrais trajets.
- **Héberger sa propre instance OSRM** en production plutôt que le serveur public partagé (voir `DEPLOIEMENT.md`).
- **Preuve de livraison photo** en plus du code de confirmation.

## Structure du projet

```
colis-cotonou/
├── backend/
│   ├── src/
│   │   ├── db.js            # schéma SQLite + compte admin
│   │   ├── auth.js          # JWT, middlewares
│   │   ├── pricing.js       # zones, distance routière (OSRM), prix, commission, délai garanti, réduction groupe, frais de retour
│   │   ├── socket.js        # Socket.io : position live du livreur, statuts en direct
│   │   ├── vehicleDocuments.js  # types de documents véhicule requis, calcul du statut "vérifié"
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js     # profil + upload pièce d'identité/véhicule + Chrono Pro + avances livreur
│   │   │   ├── deliveries.js  # + notes vocales, réclamations garantie colis, livraison groupée, retour destinataire
│   │   │   ├── payments.js  # FedaPay (+ simulateur de repli), logique partagée avec le paiement public, portefeuille Chrono
│   │   │   ├── public.js    # suivi sans app, paiement destinataire, vitrine boutique (sans authentification)
│   │   │   ├── admin.js     # stats, revue documents, réclamations, avances livreur, courses impayées
│   │   │   ├── alertes.js   # alertes SOS livreur (danger/panne), diffusées en direct à l'admin
│   │   │   └── inondations.js  # alertes route inondée (signalement manuel client/livreur)
│   │   └── server.js
│   ├── uploads/documents/   # pièces d'identité envoyées (non versionné, voir .gitignore)
│   └── .env
├── frontend/                # site web (client, livreur, admin)
│   └── src/
│       ├── pages/
│       │   ├── client/
│       │   ├── livreur/
│       │   └── admin/
│       ├── components/
│       │   ├── ZoneBadge.jsx     # badges zone + garantie de délai
│       │   ├── TrackingMap.jsx   # carte + position live du livreur
│       │   └── SOSButton.jsx     # bouton SOS livreur (danger/panne)
│       ├── hooks/
│       │   ├── useLivePosition.js  # côté client : reçoit la position en direct
│       │   └── useSendPosition.js  # côté livreur : envoie sa position GPS
│       └── context/AuthContext.jsx
└── mobile/                  # application mobile React Native/Expo (client + livreur)
    └── README.md            # lancement, configuration, publication sur les stores
```
