// Libellés partagés, alignés sur les mêmes textes que le site web
// (frontend/src/components/StatusBadge.jsx et ZoneBadge.jsx) pour rester
// cohérent avec le reste du produit.

export const STATUS_CONFIG = {
  en_attente: { label: 'En attente', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  acceptee: { label: 'Acceptée', bg: '#dbeafe', fg: '#1e40af', border: '#bfdbfe' },
  recuperee: { label: 'Colis récupéré', bg: '#e0e7ff', fg: '#4338ca', border: '#c7d2fe' },
  en_route: { label: 'En route', bg: '#f3e8ff', fg: '#6b21a8', border: '#e9d5ff' },
  livree: { label: 'Livrée', bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' },
  annulee: { label: 'Annulée', bg: '#fee2e2', fg: '#b91c1c', border: '#fecaca' },
};

export function paymentBadge(status) {
  if (status === 'paye') return { label: 'Payé', bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' };
  if (status === 'echoue') return { label: 'Paiement échoué', bg: '#fee2e2', fg: '#b91c1c', border: '#fecaca' };
  return { label: 'Paiement en attente', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
}

export const ZONE_LABELS = {
  courte: 'Courte distance',
  moyenne: 'Moyenne distance',
  longue: 'Longue distance',
};

export const STEPS = [
  { key: 'en_attente', label: 'Demande créée' },
  { key: 'acceptee', label: 'Livreur assigné' },
  { key: 'recuperee', label: 'Colis récupéré' },
  { key: 'en_route', label: 'En route' },
  { key: 'livree', label: 'Livrée' },
];

// Commission fixe prélevée par la plateforme sur chaque course (voir
// backend/src/pricing.js) — le solde revient intégralement au livreur.
// L'estimation de prix renvoie déjà `livreurShare` ; cette constante ne sert
// que de repli pour les livraisons déjà créées (dont l'API ne renvoie que
// `price`).
export const PLATFORM_COMMISSION = 100;

export const ROLE_LABEL = { client: 'Client', livreur: 'Livreur' };
