import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import TrackingMap from '../../components/TrackingMap';
import useLivePosition from '../../hooks/useLivePosition';

const STEPS = [
  { key: 'en_attente', label: 'Demande créée' },
  { key: 'acceptee', label: 'Livreur assigné' },
  { key: 'recuperee', label: 'Colis récupéré' },
  { key: 'en_route', label: 'En route' },
  { key: 'livree', label: 'Livrée' },
];

function StepTimeline({ status }) {
  if (status === 'annulee') {
    return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Cette livraison a été annulée.</p>;
  }
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="flex flex-wrap gap-3">
      {STEPS.map((s, idx) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold
            ${idx <= currentIdx ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {idx + 1}
          </span>
          <span className={`text-sm ${idx <= currentIdx ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function PayPanel({ delivery, onPaid }) {
  const [method, setMethod] = useState('mtn_momo');
  const [momoNumber, setMomoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/payments/deliveries/${delivery.id}/payer`, { method, momo_number: momoNumber || undefined });
      if (res.data.checkout_url) {
        // Paiement réel FedaPay : on redirige vers la page de paiement hébergée.
        // La confirmation définitive arrive par webhook ; au retour, cette
        // page se remet à jour automatiquement (voir le polling dans load()).
        window.location.href = res.data.checkout_url;
        return;
      }
      onPaid(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="bg-orange-50 border border-orange-100 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-orange-900">Paiement requis avant l'attribution d'un livreur</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'mtn_momo', label: 'MTN MoMo' },
          { key: 'moov_money', label: 'Moov Money' },
          { key: 'carte', label: 'Carte' },
        ].map((m) => (
          <button type="button" key={m.key} onClick={() => setMethod(m.key)}
            className={`py-2 rounded-lg text-xs font-medium border transition ${method === m.key ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'}`}>
            {m.label}
          </button>
        ))}
      </div>
      {method !== 'carte' && (
        <input required value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="Numéro Mobile Money" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} type="submit" className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
        {loading ? 'Paiement en cours...' : `Payer ${delivery.price} FCFA`}
      </button>
      <p className="text-[11px] text-orange-700/70">Paiement sécurisé via FedaPay (Mobile Money / carte). Vous serez redirigé vers la page de paiement.</p>
    </form>
  );
}

function ReviewPanel({ delivery, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post(`/deliveries/${delivery.id}/avis`, { rating, comment: comment || undefined });
      setSent(true);
      onDone?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Merci pour votre avis !</p>;

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-slate-900">Notez votre livreur</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? 'text-amber-400' : 'text-slate-200'}`}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Un commentaire (optionnel)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" rows={2} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} type="submit" className="rounded-lg bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-800 transition disabled:opacity-60">
        {loading ? 'Envoi...' : 'Envoyer l\'avis'}
      </button>
    </form>
  );
}

export default function DeliveryDetail() {
  const { id } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/deliveries/${id}`);
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!delivery || ['livree', 'annulee'].includes(delivery.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [delivery, load]);

  const isTrackable = !!delivery && ['acceptee', 'recuperee', 'en_route'].includes(delivery.status);
  const livreurPosition = useLivePosition(id, isTrackable);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await api.post(`/deliveries/${id}/annuler`);
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  if (error) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 text-center text-red-600">{error}</main>
    </div>
  );
  if (!delivery) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 text-slate-400">Chargement...</main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <Link to="/client" className="text-sm text-slate-500 hover:text-orange-600">← Retour</Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{delivery.pickup_address} → {delivery.dropoff_address}</h1>
              <p className="text-sm text-slate-400">{new Date(delivery.created_at).toLocaleString('fr-FR')}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <StatusBadge status={delivery.status} />
              <PaymentBadge status={delivery.payment_status} />
              <ZoneBadge zone={delivery.zone} />
              <DelaiBadge delaiGaranti={!!delivery.delai_garanti} />
            </div>
          </div>

          <StepTimeline status={delivery.status} />

          <TrackingMap delivery={delivery} livreurPosition={livreurPosition} />

          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400">Destinataire</p>
              <p className="font-medium text-slate-800">{delivery.recipient_name} · {delivery.recipient_phone}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400">Prix</p>
              <p className="font-medium text-slate-800">{delivery.price} FCFA{delivery.distance_km ? ` · ${Math.round(delivery.distance_km * 10) / 10} km` : ''}</p>
              {!delivery.delai_garanti && (
                <p className="text-xs text-amber-700 mt-1">Zone longue distance : la livraison en 30 min n'est pas garantie sur ce trajet.</p>
              )}
            </div>
            {delivery.livreur_name && (
              <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
                <p className="text-slate-400">Livreur</p>
                <p className="font-medium text-slate-800">{delivery.livreur_name} · {delivery.livreur_phone} {delivery.livreur_rating ? `· ⭐ ${delivery.livreur_rating}` : ''}</p>
              </div>
            )}
          </div>

          {delivery.payment_status !== 'paye' && delivery.status === 'en_attente' && (
            <PayPanel delivery={delivery} onPaid={setDelivery} />
          )}

          {delivery.payment_status === 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-sm font-medium text-indigo-900">Code de confirmation à remettre au livreur</p>
              <p className="text-3xl font-extrabold tracking-widest text-indigo-700 mt-1">{delivery.confirmation_code}</p>
              <p className="text-xs text-indigo-700/70 mt-1">Communiquez ce code uniquement au moment de la remise réelle du colis, pour votre sécurité.</p>
            </div>
          )}

          {['en_attente', 'acceptee'].includes(delivery.status) && (
            <button onClick={handleCancel} disabled={cancelling} className="text-sm text-red-600 hover:underline disabled:opacity-60">
              {cancelling ? 'Annulation...' : 'Annuler la livraison'}
            </button>
          )}

          {delivery.status === 'livree' && <ReviewPanel delivery={delivery} onDone={load} />}
        </div>
      </main>
    </div>
  );
}
