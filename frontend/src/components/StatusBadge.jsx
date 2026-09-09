const STATUS_CONFIG = {
  en_attente: { label: 'En attente', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  acceptee: { label: 'Acceptée', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  recuperee: { label: 'Colis récupéré', className: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  en_route: { label: 'En route', className: 'bg-purple-100 text-purple-800 border-purple-300' },
  livree: { label: 'Livrée', className: 'bg-green-100 text-green-800 border-green-300' },
  annulee: { label: 'Annulée', className: 'bg-red-100 text-red-800 border-red-300' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-800 border-gray-300' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export function PaymentBadge({ status }) {
  const cfg = status === 'paye'
    ? { label: 'Payé', className: 'bg-green-100 text-green-800 border-green-300' }
    : status === 'echoue'
      ? { label: 'Paiement échoué', className: 'bg-red-100 text-red-800 border-red-300' }
      : { label: 'Paiement en attente', className: 'bg-amber-100 text-amber-800 border-amber-300' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
