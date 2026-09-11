// Calcul de distance (formule de Haversine) et tarification par zones
// adaptée à Cotonou et environs (Abomey-Calavi, Porto-Novo, Sèmè-Podji...)

export function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || Number.isNaN(v))) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Commission fixe de la plateforme, prélevée sur chaque course quelle que
// soit la zone. Le reste va intégralement au livreur.
export const PLATFORM_COMMISSION = 100;

// Garantie colis optionnelle : petit supplément forfaitaire, quelle que soit
// la zone, payé par l'expéditeur à la création. En cas de colis cassé ou
// perdu, le client peut ouvrir une réclamation (voir routes/deliveries.js).
export const INSURANCE_FEE = 150;

// Grille de tarifs par zone (validée avec Merveille le 08/09/2026).
// La garantie "livraison en 30 minutes" ne s'applique qu'aux zones courte
// et moyenne : au-delà de 5 km, le délai n'est plus promis au client.
export const ZONES = [
  { key: 'courte', label: 'Courte distance', description: 'Même quartier', maxKm: 2, price: 500, delaiGaranti: true },
  { key: 'moyenne', label: 'Moyenne distance', description: 'Quartiers voisins', maxKm: 5, price: 800, delaiGaranti: true },
  { key: 'longue', label: 'Longue distance', description: 'Traversée de ville', maxKm: Infinity, price: 1400, delaiGaranti: false },
];

// Distance utilisée par défaut quand les coordonnées précises ne sont pas
// fournies (le client n'a pas placé les points sur la carte) : on retient
// la zone moyenne, un choix médian raisonnable.
const DEFAULT_ZONE_KEY = 'moyenne';

export function resolveZone(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || Number.isNaN(distanceKm)) {
    return ZONES.find((z) => z.key === DEFAULT_ZONE_KEY);
  }
  return ZONES.find((z) => distanceKm <= z.maxKm) || ZONES[ZONES.length - 1];
}

export function estimatePrice({ distanceKm }) {
  const zone = resolveZone(distanceKm);
  return {
    zone: zone.key,
    zoneLabel: zone.label,
    price: zone.price,
    livreurShare: zone.price - PLATFORM_COMMISSION,
    delaiGaranti: zone.delaiGaranti,
  };
}

// --- Distance routière réelle (et non plus à vol d'oiseau) ---
//
// Pourquoi : à Cotonou, la lagune (le chenal qui relie le lac Nokoué à
// l'océan) sépare le centre-ville (Ganhi, Cadjehoun, Haie Vive...) du côté
// d'Akpakpa et de la route vers Sèmè/Porto-Novo. Deux points proches à vol
// d'oiseau mais de part et d'autre du chenal obligent en réalité à un détour
// par un pont. De même, certains trajets suivent un axe précis plutôt qu'une
// ligne droite. On calcule donc la vraie distance routière via un moteur
// d'itinéraire (OSRM), avec un repli réaliste si ce service est injoignable
// (pour ne jamais bloquer une estimation de prix).
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 4000;

// Facteur de détour moyen ville (route réelle / ligne droite), utilisé en
// secours si OSRM est injoignable.
const URBAN_DETOUR_FACTOR = 1.35;

// Frontière approximative du chenal de Cotonou (longitude). À l'ouest =
// centre-ville, à l'est = Akpakpa / route de Porto-Novo. C'est une
// approximation posée pour le MVP : à affiner sur le terrain avec de vrais
// trajets (c'est le seul réglage à ajuster ici, pas de sortir de ce fichier).
const LAGOON_BOUNDARY_LNG = 2.435;
const LAGOON_LAT_MIN = 6.30;
const LAGOON_LAT_MAX = 6.45;
const LAGOON_CROSSING_EXTRA_KM = 2.5; // détour supplémentaire estimé via le pont

function crossesLagoon(lat1, lng1, lat2, lng2) {
  const bothInRange = [lat1, lat2].every((lat) => lat > LAGOON_LAT_MIN && lat < LAGOON_LAT_MAX);
  if (!bothInRange) return false;
  return (lng1 < LAGOON_BOUNDARY_LNG) !== (lng2 < LAGOON_BOUNDARY_LNG);
}

function fallbackRoadDistanceKm(lat1, lng1, lat2, lng2) {
  const straight = haversineKm(lat1, lng1, lat2, lng2);
  if (straight === null) return null;
  let distance = straight * URBAN_DETOUR_FACTOR;
  if (crossesLagoon(lat1, lng1, lat2, lng2)) distance += LAGOON_CROSSING_EXTRA_KM;
  return distance;
}

// Retourne { distanceKm, source } où source vaut :
//  - 'osrm'       : distance routière réelle obtenue via OSRM
//  - 'estimation' : repli (détour + traversée lagune) car OSRM injoignable
//  - null         : pas de coordonnées fournies
export async function getRoadDistanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || Number.isNaN(v))) {
    return { distanceKm: null, source: null };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    const url = `${OSRM_URL}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      const meters = data?.routes?.[0]?.distance;
      if (typeof meters === 'number' && meters > 0) {
        return { distanceKm: meters / 1000, source: 'osrm' };
      }
    }
  } catch {
    // OSRM injoignable, en timeout, ou hors service : on bascule sur le repli
  }
  return { distanceKm: fallbackRoadDistanceKm(lat1, lng1, lat2, lng2), source: 'estimation' };
}

export function generateConfirmationCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// --- Livraison groupée ("course partagée") ---
//
// Deux livraisons dans la même zone, avec un point de retrait proche, pas
// encore prises en charge : rejoindre un groupe compagnon fait économiser
// (le livreur ne fait qu'un seul trajet pour les deux). Seule la livraison
// qui REJOINT profite de la réduction — le prix d'une livraison, une fois
// fixé à sa création, n'est jamais recalculé rétroactivement.
export const GROUP_DISCOUNT_RATIO = 0.3; // -30% pour la livraison qui rejoint
export const GROUP_MAX_MEMBERS = 3;
export const GROUP_MATCH_RADIUS_KM = 1.2;
export const GROUP_MATCH_WINDOW_MINUTES = 20;

export function computeGroupDiscount(price) {
  return Math.round((price * GROUP_DISCOUNT_RATIO) / 10) * 10; // arrondi à la dizaine la plus proche
}

// --- Retour automatique (destinataire refuse) ---
//
// Tarif réduit pour le trajet retour vers l'expéditeur, à régler en espèces
// au livreur (pas encore intégré à FedaPay).
export const RETURN_FEE_RATIO = 0.5;

export function computeReturnFee(price) {
  return Math.round((price * RETURN_FEE_RATIO) / 10) * 10;
}

// --- Alerte route inondée (saison des pluies) ---
//
// Signalement manuel par un client ou un livreur : aucune donnée fiable sur
// l'état réel des routes de Cotonou en saison des pluies n'est disponible
// automatiquement, donc l'alerte repose entièrement sur ce que les
// utilisateurs signalent eux-mêmes. Une alerte reste "active" un temps
// limité (l'eau se retire en quelques heures) et peut être levée plus tôt
// par son auteur ou par l'admin. Rayon large exprès : un axe inondé gêne
// tout le monde à proximité, pas seulement le point exact signalé.
export const FLOOD_ALERT_RADIUS_KM = 1.5;
export const FLOOD_ALERT_TTL_HOURS = 6;
