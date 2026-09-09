import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import TrackingMap from '../../components/TrackingMap';
import useSendPosition from '../../hooks/useSendPosition';

const PLATFORM_COMMISSION = 100;

const NEXT_STATUS = {
  acceptee: { key: 'recuperee', label: 'Marquer le colis comme récupéré' },
  recuperee: { key: 'en_route', label: 'Marquer en route vers le destinataire' },
};

export default function LivreurDeliveryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/deliveries/${id}`);
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isActive = !!delivery && ['acceptee', 'recuperee', 'en_route'].includes(delivery.status);
  useSendPosition(id, isActive);

  async function advanceStatus() {
    const next = NEXT_STATUS[delivery.status];
    if (!next) return;
    setUpdating(true);
    setError('');
    try {
      const res = await api.patch(`/deliveries/${id}/statut`, { statut: next.key });
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  async function confirmDelivery(e) {
    e.preventDefault();
    setCodeError('');
    setUpdating(true);
    try {
      const res = await api.post(`/deliveries/${id}/livrer`, { code });
      setDelivery(res.data.delivery);
    } catch (err) {
      setCodeError(apiErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  if (error) return (
    <div className="min-h-screen bg-slate-50"><Navbar /><main className="max-w-2xl mx-auto px-4 py-10 text-center text-red-600">{error}</main></div>
  );
  if (!delivery) return (
    <div className="min-h-screen bg-slate-50"><Navbar /><main className="max-w-2xl mx-auto px-4 py-10 text-slate-400">Chargement...</main></div>
  );

  const next = NEXT_STATUS[delivery.status];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <Link to="/livreur" className="text-sm text-slate-500 hover:text-orange-600">← Retour</Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{delivery.pickup_address} → {delivery.dropoff_address}</h1>
              <p className="text-sm text-slate-400">Client: {delivery.client_name} · {delivery.client_phone}</p>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              <StatusBadge status={delivery.status} />
              <ZoneBadge zone={delivery.zone} />
              <DelaiBadge delaiGaranti={!!delivery.delai_garanti} />
            </div>
          </div>

          <TrackingMap delivery={delivery} />
          {isActive && (
            <p className="text-[11px] text-slate-400 -mt-2">📍 Votre position est partagée en direct avec le client pendant cette course.</p>
          )}

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400">Destinataire</p>
              <p className="font-medium text-slate-800">{delivery.recipient_name} · {delivery.recipient_phone}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400">Colis</p>
              <p className="font-medium text-slate-800">{delivery.package_description || '—'} ({delivery.package_size})</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
              <p className="text-slate-400">Ce que vous touchez</p>
              <p className="font-medium text-slate-800">{delivery.price - PLATFORM_COMMISSION} FCFA <span className="text-slate-400 font-normal">(prix total {delivery.price} F, commission plateforme {PLATFORM_COMMISSION} F)</span></p>
            </div>
          </div>

          {next && (
            <button onClick={advanceStatus} disabled={updating} className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
              {updating ? 'Mise à jour...' : next.label}
            </button>
          )}

          {delivery.status === 'en_route' && (
            <form onSubmit={confirmDelivery} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-indigo-900">Saisissez le code remis par le destinataire pour confirmer la livraison</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={4} placeholder="Code à 4 chiffres" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              {codeError && <p className="text-sm text-red-600">{codeError}</p>}
              <button disabled={updating} type="submit" className="w-full rounded-lg bg-indigo-600 text-white font-semibold py-2.5 hover:bg-indigo-700 transition disabled:opacity-60">
                {updating ? 'Vérification...' : 'Confirmer la livraison'}
              </button>
            </form>
          )}

          {delivery.status === 'livree' && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 text-center font-medium">✅ Livraison terminée avec succès !</p>
          )}
        </div>
      </main>
    </div>
  );
}
