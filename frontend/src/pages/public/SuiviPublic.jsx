import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import TrackingMap from '../../components/TrackingMap';

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

// Note vocale du client (repère / instructions), écoutable sans compte via le
// lien de suivi public — même route que côté authentifié mais avec le token.
function VoiceNote({ token, point, label }) {
  const src = `/api/public/suivi/${token}/note-vocale/${point}`;
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-slate-400 text-sm mb-1">🎙️ {label}</p>
      <audio controls src={src} className="w-full h-9" />
    </div>
  );
}

function PayPanel({ token, price, onPaid }) {
  const [method, setMethod] = useState('mtn_momo');
  const [momoNumber, setMomoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/public/suivi/${token}/payer`, { method, momo_number: momoNumber || undefined });
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      onPaid();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="bg-orange-50 border border-orange-100 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-orange-900">Paiement à la réception — c'est vous qui réglez ce colis</p>
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
        {loading ? 'Paiement en cours...' : `Payer ${price} FCFA`}
      </button>
      <p className="text-[11px] text-orange-700/70">Paiement sécurisé via FedaPay (Mobile Money / carte).</p>
    </form>
  );
}

// Page de "suivi sans app" : accessible via un lien partagé par SMS/WhatsApp,
// sans compte ni connexion. Utilise le share_token de la livraison, pas un
// JWT — voir backend/src/routes/public.js.
export default function SuiviPublic() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [livreurPosition, setLivreurPosition] = useState(null);
  const socketRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/public/suivi/${token}`);
      setData(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || ['livree', 'annulee'].includes(data.delivery.status)) return;
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [data, load]);

  // Rejoint le canal Socket.io de la livraison pour la position en direct,
  // dès qu'on connaît son id (renvoyé par la première lecture REST).
  useEffect(() => {
    if (!data?.delivery?.id) return;
    if (!['acceptee', 'recuperee', 'en_route'].includes(data.delivery.status)) return;
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('rejoindre_suivi_public', { deliveryId: data.delivery.id, shareToken: token });
    socket.on('position', (pos) => setLivreurPosition(pos));
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.delivery?.id, data?.delivery?.status, token]);

  if (error) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 text-center text-red-600">{error}</main>
    </div>
  );
  if (!data) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10 text-slate-400">Chargement...</main>
    </div>
  );

  const { delivery, livreur } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-bold text-slate-900">📦 Suivi de votre colis</h1>
              <p className="text-sm text-slate-400">{delivery.pickup_address} → {delivery.dropoff_address}</p>
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
              <p className="font-medium text-slate-800">{delivery.recipient_name}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400">Prix</p>
              <p className="font-medium text-slate-800">{delivery.price} FCFA</p>
            </div>
            {livreur && (
              <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
                <p className="text-slate-400">Livreur</p>
                <p className="font-medium text-slate-800">{livreur.name} · {livreur.phone} {livreur.rating_avg ? `· ⭐ ${livreur.rating_avg}` : ''}</p>
              </div>
            )}
          </div>

          {(delivery.has_pickup_voice_note || delivery.has_dropoff_voice_note) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {delivery.has_pickup_voice_note && <VoiceNote token={token} point="retrait" label="Instructions de retrait" />}
              {delivery.has_dropoff_voice_note && <VoiceNote token={token} point="livraison" label="Instructions de livraison" />}
            </div>
          )}

          {delivery.payer_type === 'destinataire' && delivery.payment_status !== 'paye' && (
            <PayPanel token={token} price={delivery.price} onPaid={load} />
          )}

          {delivery.payment_status === 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-sm font-medium text-indigo-900">Code de confirmation à remettre au livreur</p>
              <p className="text-3xl font-extrabold tracking-widest text-indigo-700 mt-1">{delivery.confirmation_code}</p>
              <p className="text-xs text-indigo-700/70 mt-1">Donnez ce code au livreur uniquement au moment de la remise réelle du colis.</p>
            </div>
          )}

          {delivery.status === 'livree' && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 text-center font-medium">✅ Ce colis a été livré avec succès.</p>
          )}

          <p className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
            Suivi propulsé par Chrono — livraison express à Cotonou. Aucun compte requis.
          </p>
        </div>
      </main>
    </div>
  );
}
