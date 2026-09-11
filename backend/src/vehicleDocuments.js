// Documents du véhicule (moto) qu'un livreur doit fournir en plus de sa
// pièce d'identité, avant de pouvoir être activé (verified = 1) et accepter
// des courses. Centralisé ici pour que routes/users.js et routes/admin.js
// restent cohérents.
export const VEHICLE_DOCUMENT_TYPES = ['carte_grise', 'assurance', 'permis', 'moto_photo'];

export const VEHICLE_DOCUMENT_LABELS = {
  carte_grise: 'Carte grise de la moto',
  assurance: 'Assurance moto',
  permis: 'Permis de conduire',
  moto_photo: 'Photo de la moto',
};

// Renvoie les 4 types dans un ordre stable, chacun avec son statut actuel
// ('non_soumis' si le livreur n'a encore rien envoyé pour ce type).
export function getVehicleDocumentsSummary(db, userId) {
  const rows = db.prepare(
    'SELECT type, status, note, uploaded_at, reviewed_at FROM livreur_documents WHERE user_id = ?'
  ).all(userId);
  const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
  return VEHICLE_DOCUMENT_TYPES.map((type) => ({
    type,
    label: VEHICLE_DOCUMENT_LABELS[type],
    status: byType[type]?.status || 'non_soumis',
    note: byType[type]?.note || null,
    uploaded_at: byType[type]?.uploaded_at || null,
    reviewed_at: byType[type]?.reviewed_at || null,
  }));
}

// Un livreur est "vérifié" seulement quand sa pièce d'identité ET les 4
// documents véhicule sont tous approuvés. Appelée après chaque décision
// admin (identité ou véhicule) pour tenir `users.verified` à jour.
export function recomputeVerified(db, userId) {
  const user = db.prepare('SELECT id_document_status FROM users WHERE id = ?').get(userId);
  if (!user) return false;
  const docs = getVehicleDocumentsSummary(db, userId);
  const allApproved = user.id_document_status === 'approuve' && docs.every((d) => d.status === 'approuve');
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(allApproved ? 1 : 0, userId);
  return allApproved;
}
