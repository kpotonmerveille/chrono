// Distance à vol d'oiseau (formule de Haversine), copie côté frontend de
// backend/src/pricing.js — utilisée uniquement pour des vérifications
// d'affichage côté client (ex: signaler une course proche d'une alerte route
// inondée déjà chargée), jamais pour calculer un prix (le prix reste
// toujours calculé et validé côté serveur).
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
