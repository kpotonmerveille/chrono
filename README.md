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
- **Livreur** : envoie une pièce d'identité (photo/scan) qui doit être
  approuvée par l'administration avant de pouvoir travailler, se déclare
  disponible, accepte des courses (avec le montant net qu'il touchera
  affiché clairement), fait progresser le statut, partage sa position GPS
  en direct pendant la course, confirme la remise avec le code donné par le
  destinataire.
- **Administrateur** : tableau de bord (statistiques, revenus, répartition
  par zone), examine et approuve/refuse les pièces d'identité des livreurs,
  supervise toutes les livraisons.

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
| Sécurité | Pièce d'identité obligatoire, examinée et approuvée par l'admin avant activation du livreur ; code de confirmation à 4 chiffres obligatoire pour clôturer chaque livraison (évite vol/erreur de destinataire) ; paiement en ligne via FedaPay (moins de manipulation de cash) |
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

1. Créez un compte **livreur** (`/inscription?role=livreur`), puis envoyez une pièce d'identité depuis son tableau de bord (photo/scan).
2. Connectez-vous en tant qu'**admin**, ouvrez l'onglet "Livreurs", consultez le document ("Voir") et cliquez "Approuver" (ou "Refuser" avec un motif).
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
│   │   ├── pricing.js       # zones, distance routière (OSRM), prix, commission, délai garanti
│   │   ├── socket.js        # Socket.io : position live du livreur, statuts en direct
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js     # profil + upload pièce d'identité livreur
│   │   │   ├── deliveries.js
│   │   │   ├── payments.js  # FedaPay (+ simulateur de repli)
│   │   │   └── admin.js     # stats, revue des pièces d'identité
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
│       │   └── TrackingMap.jsx   # carte + position live du livreur
│       ├── hooks/
│       │   ├── useLivePosition.js  # côté client : reçoit la position en direct
│       │   └── useSendPosition.js  # côté livreur : envoie sa position GPS
│       └── context/AuthContext.jsx
└── mobile/                  # application mobile React Native/Expo (client + livreur)
    └── README.md            # lancement, configuration, publication sur les stores
```
