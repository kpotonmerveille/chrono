import { useEffect, useState, useCallback, useRef } from 'react';
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

// "Suivi sans app" : lien public à partager par SMS/WhatsApp, sans compte ni
// installation pour la personne qui le reçoit.
function ShareTrackingPanel({ delivery }) {
  const [copied, setCopied] = useState(false);
  if (!delivery.share_token) return null;
  const url = `${window.location.origin}/suivi/${delivery.share_token}`;
  const waText = encodeURIComponent(`Suivez votre colis Chrono en direct, sans app : ${url}`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copie manuelle si l'API presse-papier est indisponible */
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-emerald-900">📤 Partager le suivi (sans app, sans compte)</p>
      <p className="text-xs text-emerald-700/80">Envoyez ce lien au destinataire ou à un proche pour qu'il suive la course en direct.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyLink} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
          {copied ? '✅ Copié !' : '🔗 Copier le lien'}
        </button>
        <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition">
          WhatsApp
        </a>
        <a href={`sms:?body=${waText}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition">
          SMS
        </a>
      </div>
    </div>
  );
}

// Enregistrement d'une note vocale (repère, instructions) via le micro du
// navigateur — remplace/complète une adresse écrite précise. Lecture de la
// note existante via une requête authentifiée (fichier protégé, d'où le blob).
function VoiceNoteRecorder({ deliveryId, point, label, existingPath, onUploaded }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

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

  async function upload(blob) {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('note', blob, `note-${point}.webm`);
      await api.post(`/deliveries/${deliveryId}/note-vocale/${point}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await onUploaded();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        upload(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Impossible d'accéder au micro. Vérifiez les autorisations de votre navigateur.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <p className="text-sm text-slate-600">🎙️ {label}</p>
      {audioUrl && <audio controls src={audioUrl} className="w-full h-9" />}
      <div className="flex items-center gap-2 flex-wrap">
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={uploading} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition disabled:opacity-50">
            {audioUrl ? '🔴 Réenregistrer' : '🔴 Enregistrer une note vocale'}
          </button>
        ) : (
          <button type="button" onClick={stopRecording} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition animate-pulse">
            ⏹️ Arrêter l'enregistrement
          </button>
        )}
        {uploading && <span className="text-xs text-slate-400">Envoi...</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Garantie colis : le client peut signaler un problème (cassé, perdu) une
// fois la livraison terminée, uniquement si elle était assurée.
function ClaimPanel({ delivery, onDone }) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!delivery.insured) return null;

  if (delivery.claim_status === 'en_cours') {
    return <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">🛡️ Réclamation en cours d'examen par l'équipe Chrono.</p>;
  }
  if (delivery.claim_status === 'rembourse') {
    return <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">🛡️ Réclamation acceptée : remboursement en cours.{delivery.claim_note ? ` (${delivery.claim_note})` : ''}</p>;
  }
  if (delivery.claim_status === 'refuse') {
    return <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">🛡️ Réclamation refusée.{delivery.claim_note ? ` Motif : ${delivery.claim_note}` : ''}</p>;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/reclamation`, { description });
      onDone(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <p className="text-sm font-medium text-slate-900">🛡️ Un souci avec ce colis assuré (cassé, perdu...) ?</p>
      <textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Décrivez le problème rencontré" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" rows={2} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={loading} type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-60">
        {loading ? 'Envoi...' : 'Signaler un problème'}
      </button>
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
              {!!delivery.group_id && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">🔗 Groupée</span>}
            </div>
          </div>

          {delivery.return_status === 'demande' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium text-red-900">↩️ Retour en cours — le destinataire a refusé le colis</p>
              <p className="text-sm text-red-800">Motif indiqué par le livreur : {delivery.return_reason}</p>
              <p className="text-xs text-red-700/80">
                Le livreur vous rapporte le colis. Frais de retour à régler en espèces au livreur : <strong>{delivery.return_fee} FCFA</strong>.
              </p>
            </div>
          )}
          {delivery.return_status === 'retournee' && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              ↩️ Ce colis a été retourné le {delivery.return_completed_at ? new Date(delivery.return_completed_at).toLocaleString('fr-FR') : ''} — le destinataire l'avait refusé.
            </p>
          )}

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
              {!!delivery.group_discount && (
                <p className="text-xs text-purple-700 mt-1">🔗 Dont {delivery.group_discount} FCFA économisés en rejoignant une livraison compagnon</p>
              )}
            </div>
            {delivery.livreur_name && (
              <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
                <p className="text-slate-400">Livreur</p>
                <p className="font-medium text-slate-800">{delivery.livreur_name} · {delivery.livreur_phone} {delivery.livreur_rating ? `· ⭐ ${delivery.livreur_rating}` : ''}</p>
              </div>
            )}
          </div>

          {delivery.status !== 'annulee' && <ShareTrackingPanel delivery={delivery} />}

          {delivery.payer_type === 'expediteur' && delivery.payment_status !== 'paye' && delivery.status === 'en_attente' && (
            <PayPanel delivery={delivery} onPaid={setDelivery} />
          )}

          {delivery.payer_type === 'destinataire' && delivery.payment_status !== 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">💰 Paiement à la réception : le destinataire règle via le lien de suivi partagé ci-dessus.</p>
          )}

          {delivery.payment_status === 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-sm font-medium text-indigo-900">Code de confirmation à remettre au livreur</p>
              <p className="text-3xl font-extrabold tracking-widest text-indigo-700 mt-1">{delivery.confirmation_code}</p>
              <p className="text-xs text-indigo-700/70 mt-1">Communiquez ce code uniquement au moment de la remise réelle du colis, pour votre sécurité.</p>
            </div>
          )}

          {!['livree', 'annulee'].includes(delivery.status) && (
            <div className="grid sm:grid-cols-2 gap-3">
              <VoiceNoteRecorder deliveryId={delivery.id} point="retrait" label="Note vocale — retrait" existingPath={delivery.pickup_voice_note_path} onUploaded={load} />
              <VoiceNoteRecorder deliveryId={delivery.id} point="livraison" label="Note vocale — livraison" existingPath={delivery.dropoff_voice_note_path} onUploaded={load} />
            </div>
          )}

          {['en_attente', 'acceptee'].includes(delivery.status) && (
            <button onClick={handleCancel} disabled={cancelling} className="text-sm text-red-600 hover:underline disabled:opacity-60">
              {cancelling ? 'Annulation...' : 'Annuler la livraison'}
            </button>
          )}

          {delivery.status === 'livree' && <ClaimPanel delivery={delivery} onDone={setDelivery} />}
          {delivery.status === 'livree' && <ReviewPanel delivery={delivery} onDone={load} />}
        </div>
      </main>
    </div>
  );
}
