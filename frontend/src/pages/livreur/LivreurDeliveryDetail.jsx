import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import TrackingMap from '../../components/TrackingMap';
import useSendPosition from '../../hooks/useSendPosition';

const PLATFORM_COMMISSION = 100;

// Lecture d'une note vocale laissée par le client (repère, instructions) —
// fichier protégé, donc récupéré en blob via une requête authentifiée.
function VoiceNotePlayer({ deliveryId, point, label, existingPath }) {
  const [audioUrl, setAudioUrl] = useState(null);

  useEffect(() => {
    if (!existingPath) { setAudioUrl(null); return undefined; }
    let cancelled = false;
    let objectUrl;
    api.get(`/deliveries/${deliveryId}/note-vocale/${point}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setAudioUrl(objectUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [deliveryId, point, existingPath]);

  if (!existingPath) return null;

  return (
    <div className="bg-indigo-50 rounded-lg p-3">
      <p className="text-indigo-900 text-sm mb-1">🎙️ {label}</p>
      {audioUrl ? <audio controls src={audioUrl} className="w-full h-9" /> : <p className="text-xs text-indigo-700/70">Chargement...</p>}
    </div>
  );
}

const NEXT_STATUS = {
  acceptee: { key: 'recuperee', label: 'Marquer le colis comme récupéré' },
  recuperee: { key: 'en_route', label: 'Marquer en route vers le destinataire' },
};

// Retour automatique : le destinataire refuse le colis à la remise (ne veut
// plus, ne peut pas payer, mauvaise adresse...) — évite de rester bloqué
// sans code de confirmation.
function ReturnPanel({ delivery, onUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signaler(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/retour`, { reason });
      onUpdated(res.data.delivery);
      setShowForm(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function terminer() {
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/retour/termine`);
      onUpdated(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (delivery.return_status === 'demande') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
        <p className="text-sm font-medium text-red-900">↩️ Retour en cours</p>
        <p className="text-sm text-red-800">Motif : {delivery.return_reason}</p>
        <p className="text-xs text-red-700/80">Rapportez le colis à l'expéditeur, puis confirmez ci-dessous. Frais de retour à faire régler en espèces : <strong>{delivery.return_fee} FCFA</strong>.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={terminer} disabled={loading} className="w-full rounded-lg bg-slate-800 text-white font-semibold py-2 hover:bg-slate-900 transition disabled:opacity-60 text-sm">
          {loading ? 'Mise à jour...' : "Retour terminé — colis rapporté à l'expéditeur"}
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button onClick={() => setShowForm(true)} className="w-full text-sm text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50 transition">
        Le destinataire refuse le colis
      </button>
    );
  }

  return (
    <form onSubmit={signaler} className="bg-white border border-red-200 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-slate-900">Motif du refus</p>
      <textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: le destinataire ne répond pas, ne veut plus du colis..." rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={loading} type="submit" className="flex-1 rounded-lg bg-red-600 text-white font-semibold py-2 hover:bg-red-700 transition disabled:opacity-60 text-sm">
          {loading ? 'Envoi...' : 'Confirmer le retour'}
        </button>
        <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:underline">Annuler</button>
      </div>
    </form>
  );
}

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
              {delivery.group_size > 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">🔗 Groupée ({delivery.group_size} colis)</span>}
            </div>
          </div>

          <TrackingMap delivery={delivery} />
          {isActive && (
            <p className="text-[11px] text-slate-400 -mt-2">📍 Votre position est partagée en direct avec le client pendant cette course.</p>
          )}

          {(delivery.pickup_voice_note_path || delivery.dropoff_voice_note_path) && (
            <div className="grid sm:grid-cols-2 gap-3">
              <VoiceNotePlayer deliveryId={delivery.id} point="retrait" label="Repère — retrait" existingPath={delivery.pickup_voice_note_path} />
              <VoiceNotePlayer deliveryId={delivery.id} point="livraison" label="Repère — livraison" existingPath={delivery.dropoff_voice_note_path} />
            </div>
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

          {next && delivery.return_status === 'aucun' && (
            <button onClick={advanceStatus} disabled={updating} className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
              {updating ? 'Mise à jour...' : next.label}
            </button>
          )}

          {['recuperee', 'en_route'].includes(delivery.status) && (
            <ReturnPanel delivery={delivery} onUpdated={setDelivery} />
          )}

          {delivery.status === 'en_route' && delivery.return_status === 'aucun' && (
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
          {delivery.status === 'annulee' && delivery.return_status === 'retournee' && (
            <p className="text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2 text-center font-medium">↩️ Colis retourné à l'expéditeur.</p>
          )}
        </div>
      </main>
    </div>
  );
}
