# Déployer Chrono en ligne (gratuit, via Render)

Ce guide t'emmène du code que tu as reçu jusqu'à un lien public que tu peux
partager, en environ 10 minutes. Deux étapes : mettre le code sur GitHub,
puis le connecter à Render.

Le projet est déjà préparé pour tourner en **un seul service** : Render
construira le site (React) et l'API (Node) ensemble, et tout sera servi
depuis une seule adresse (`https://colis-cotonou-xxxx.onrender.com`).

> **Note sur cette version démo** : sur le plan gratuit de Render, les
> données (utilisateurs, livraisons, **et les documents (pièce d'identité, papiers de la moto) envoyés par
> les livreurs**) sont réinitialisées à chaque redéploiement, et le service
> se met en veille après 15 minutes d'inactivité (le premier chargement après
> une pause peut prendre 30-50 secondes). C'est très bien pour montrer
> l'application ; on passera à une base de données durable et à un plan
> payant (avec un disque persistant pour les documents) quand tu voudras
> l'utiliser en vrai.

## Étape 1 — Mettre le code sur GitHub

1. Va sur [github.com](https://github.com) et crée un compte gratuit si tu n'en as pas.
2. Clique sur **"New repository"** (bouton vert "New" en haut à gauche, ou icône `+` en haut à droite → "New repository").
3. Donne-lui un nom, par exemple `colis-cotonou`. Laisse-le "Public". Ne coche aucune case d'initialisation. Clique **"Create repository"**.
4. Sur la page suivante, clique sur le lien **"uploading an existing file"**.
5. Sur ton ordinateur ou ton téléphone, dézippe le fichier `colis-cotonou.zip` que je t'ai envoyé. **Supprime d'abord les dossiers `node_modules` s'ils existent** (backend/node_modules, frontend/node_modules) — ils ne sont pas nécessaires et sont trop volumineux.
6. Glisse-dépose tout le contenu du dossier `colis-cotonou` (les dossiers `backend`, `frontend`, et les fichiers `render.yaml`, `.gitignore`, `README.md`) dans la zone d'upload de GitHub.
7. En bas de page, clique **"Commit changes"**.

Ton code est maintenant en ligne sur GitHub.

## Étape 2 — Déployer sur Render

1. Va sur [render.com](https://render.com) et crée un compte gratuit (tu peux t'inscrire avec ton compte GitHub, c'est le plus rapide).
2. Une fois connecté, clique sur **"New +"** puis **"Blueprint"**.
3. Autorise Render à accéder à ton compte GitHub, puis sélectionne le dépôt `colis-cotonou` que tu viens de créer.
4. Render détecte automatiquement le fichier `render.yaml` et te propose de créer le service **colis-cotonou**.
5. Il te demandera de renseigner la variable `ADMIN_PASSWORD` : choisis un mot de passe solide pour ton compte administrateur (tu t'en serviras pour te connecter sur `/admin-connexion` avec l'email `admin@chrono.bj`).
6. Clique **"Apply"** / **"Create"**. Render installe et démarre l'application (~2-3 minutes la première fois).
7. Une fois le déploiement terminé, ton lien apparaît en haut de la page du service, du type `https://colis-cotonou-xxxx.onrender.com`. C'est ton application, accessible à tous.

## Après le déploiement

- Connecte-toi en admin (`/admin-connexion`) avec l'email `admin@chrono.bj` et le mot de passe que tu as choisi à l'étape 5.
- Crée un compte livreur de test, vérifie-le depuis l'espace admin, puis crée un compte client pour tester une livraison complète.
- Pour tout changement de code : modifie les fichiers dans ton dépôt GitHub (ou demande-moi de te fournir une nouvelle version), Render redéploie automatiquement à chaque mise à jour du dépôt.

## Activer le vrai paiement FedaPay

Par défaut, le paiement est **simulé** (succès immédiat) tant que la clé
FedaPay n'est pas configurée — pratique pour démontrer l'app sans compte
actif. Pour activer le vrai paiement :

1. Dans le tableau de bord Render de ton service, va dans **Environment**.
2. Renseigne `FEDAPAY_SECRET_KEY` avec ta clé secrète FedaPay (commence par
   tester avec ta clé **sandbox**, disponible sur https://sandbox.fedapay.com,
   avant de passer en clé **live**).
3. Mets `FEDAPAY_ENV` à `sandbox` ou `live` selon la clé utilisée.
4. Dans ton tableau de bord FedaPay, configure un webhook pointant vers
   `https://<ton-service>.onrender.com/api/payments/webhook`, récupère le
   secret de signature du webhook et renseigne-le dans `FEDAPAY_WEBHOOK_SECRET`
   sur Render.
5. Redéploie (Render redémarre automatiquement après un changement de
   variable d'environnement).

`FRONTEND_URL` n'a pas besoin d'être renseignée manuellement sur Render : le
code utilise automatiquement l'URL publique du service.

## Distance routière réelle (OSRM)

Le calcul du prix utilise désormais la distance **routière réelle** (et non
plus à vol d'oiseau), via le serveur public OSRM par défaut
(`OSRM_URL=https://router.project-osrm.org`, gratuit, sans clé). Ce serveur
public n'a pas de garantie de service (limite de débit partagée) : pour un
usage en production avec du volume, il est recommandé d'héberger sa propre
instance OSRM (voir la documentation officielle OSRM) et de changer
`OSRM_URL` en conséquence. Si OSRM est injoignable, l'application bascule
automatiquement sur une estimation (facteur de détour + traversée de la
lagune) plutôt que de bloquer.

## Application mobile (livreur et client)

Une vraie application mobile (React Native / Expo) existe dans le dossier
`mobile/`, avec ses propres instructions dans `mobile/README.md`. Une fois
ton service déployé sur Render, mets à jour `EXPO_PUBLIC_API_URL` dans
`mobile/.env` avec l'URL de ton service (`https://<ton-service>.onrender.com/api`)
avant de builder l'app.

## Pour aller plus loin (quand tu seras prêt à passer en vrai)

- **Base de données durable** : remplacer SQLite par une base PostgreSQL managée (Render en propose une gratuite pendant 90 jours, puis payante) pour ne plus perdre les données à chaque redéploiement.
- **Disque persistant pour les documents** : ajouter un disque Render persistant monté sur `backend/uploads` pour que les documents des livreurs (pièce d'identité, papiers de la moto) survivent aux redéploiements.
- **Nom de domaine personnalisé** : Render permet de brancher un domaine comme `www.coliscotonou.bj` sur le service (payant, dépend du plan).
- **Publier l'app mobile sur les stores** : voir `mobile/README.md` pour les étapes (comptes développeur Apple/Google requis, à créer par toi).

---

Si tu préfères que je m'occupe directement du déploiement à ta place (sans
passer par ces étapes manuelles), dis-le-moi : il faudra alors connecter le
connecteur **Render** (et éventuellement **GitHub**) à Claude depuis les
paramètres de connecteurs, et je pourrai créer et gérer le service
directement depuis notre conversation.
