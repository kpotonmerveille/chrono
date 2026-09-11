import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import FloodAlertPanel from '../../components/FloodAlertPanel';
import { haversineKm } from '../../lib/geo';
import { useAuth } from '../../context/AuthContext';

const PLATFORM_COMMISSION = 100;
// Doit rester synchronisé avec FLOOD_ALERT_RADIUS_KM dans
// backend/src/pricing.js — utilisé uniquement pour signaler visuellement une
// course proche d'une alerte déjà chargée, pas pour une décision serveur.
const FLOOD_ALERT_RADIUS_KM = 1.5;

const STATUS_LABEL = {
  non_soumis: { text: 'Non envoyé', className: 'bg-slate-200 text-slate-600' },
  en_attente: { text: 'En examen', className: 'bg-amber-200 text-amber-800' },
  approuve: { text: 'Approuvé', className: 'bg-green-200 text-green-800' },
  rejete: { text: 'Refusé', className: 'bg-red-200 text-red-800' },
};

// Une ligne d'envoi de document : la pièce d'identité (endpoint historique
// /users/me/document) et les 4 documents véhicule (/users/me/vehicule/:type)
// utilisent exactement le même composant, seul l'endpoint change.
function DocumentRow({ label, status, note, uploadUrl, onUpdated }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const badge = STATUS_LABEL[status] || STATUS_LABEL.non_soumis;

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      await api.post(uploadUrl, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null);
      await onUpdated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg bg-white border border-amber-100 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.text}</span>
      </div>
      {status === 'rejete' && note && <p className="text-xs text-red-700">Motif : {note}</p>}
      {status !== 'en_attente' && (
        <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-2">
          <input type="file" accept="image/jpeg,image/png,image/webp,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} className="text-xs text-slate-600" />
          <button disabled={!file || uploading} type="submit" className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition disabled:opacity-50">
            {uploading ? 'Envoi...' : status === 'non_soumis' ? 'Envoyer' : 'Renvoyer'}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DocumentPanel({ user, onUpdated }) {
  const vehicleDocs = user.vehicle_documents || [];
  const totalRequired = 1 + vehicleDocs.length;
  const totalApproved = (user.id_document_status === 'approuve' ? 1 : 0) + vehicleDocs.filter((d) => d.status === 'approuve').length;

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-amber-900">Vérification de votre compte ({totalApproved}/{totalRequired} approuvés)</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Envoyez votre pièce d'identité et les documents de votre moto (carte grise, assurance, permis, photo). L'administration doit approuver les {totalRequired} pour activer votre compte et vous laisser accepter des courses.
        </p>
      </div>
      <DocumentRow
        label="Pièce d'identité"
        status={user.id_document_status}
        note={user.id_document_note}
        uploadUrl="/users/me/document"
        onUpdated={onUpdated}
      />
      {vehicleDocs.map((doc) => (
        <DocumentRow
          key={doc.type}
          label={doc.label}
          status={doc.status}
          note={doc.note}
          uploadUrl={`/users/me/vehicule/${doc.type}`}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}

// "Avance sur gains" : le livreur peut demander à retirer une partie de ce
// qu'il a déjà gagné avant la fin de la journée. Versement Mobile Money réel
// géré manuellement par l'admin (pas d'API de paiement sortant intégrée) —
// voir routes/users.js et routes/admin.js.
const AVANCE_STATUS_LABEL = {
  en_attente: { text: 'En attente', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  approuvee: { text: 'Approuvée', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  versee: { text: 'Versée', className: 'bg-green-100 text-green-800 border-green-300' },
  refusee: { text: 'Refusée', className: 'bg-red-100 text-red-800 border-red-300' },
};

function AvancePanel({ gains, onRequested }) {
  const [amount, setAmount] = useState('');
  const [avances, setAvances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAvances = useCallback(async () => {
    try {
      const res = await api.get('/users/me/avances');
      setAvances(res.data.avances);
    } catch {
      /* silencieux : l'historique n'est pas critique */
    }
  }, []);

  useEffect(() => { loadAvances(); }, [loadAvances]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const value = parseInt(amount, 10);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Montant invalide');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/me/avance', { amount: value });
      setAmount('');
      setSuccess('Demande envoyée. Le versement Mobile Money sera confirmé par l\'administration.');
      await loadAvances();
      await onRequested();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const disponible = gains?.disponible_pour_avance ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-sm text-slate-500">Vous pouvez demander une avance sur vos gains déjà réalisés, avant la fin de la journée.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-400">Déjà demandé</p>
            <p className="text-lg font-bold text-slate-900">{gains?.deja_avance ?? 0} F</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-xs text-emerald-600">Disponible pour avance</p>
            <p className="text-lg font-bold text-emerald-700">{disponible} F</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 mt-3">
          <input
            type="number"
            min={1}
            max={disponible || undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant (FCFA)"
            className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button disabled={loading || disponible <= 0} type="submit" className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50">
            {loading ? 'Envoi...' : 'Demander une avance'}
          </button>
        </form>
        {disponible <= 0 && <p className="text-xs text-slate-400 mt-2">Aucun montant disponible pour le moment.</p>}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {success && <p className="text-sm text-green-700 mt-2">{success}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Historique de vos demandes</p>
        {avances.length === 0 && <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune demande d'avance pour le moment.</p>}
        {avances.map((a) => {
          const badge = AVANCE_STATUS_LABEL[a.status] || AVANCE_STATUS_LABEL.en_attente;
          return (
            <div key={a.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">{a.amount} FCFA</p>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(a.requested_at).toLocaleString('fr-FR')}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badge.className}`}>{badge.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LivreurDashboard() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('disponibles');
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [gains, setGains] = useState(null);
  const [floodAlerts, setFloodAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [avRes, mineRes, gainsRes, floodRes] = await Promise.all([
        api.get('/deliveries/disponibles').catch((e) => ({ data: { deliveries: [] }, error: e })),
        api.get('/deliveries/assignees'),
        api.get('/users/me/gains'),
        api.get('/inondations').catch(() => ({ data: { alertes: [] } })),
      ]);
      setAvailable(avRes.data.deliveries);
      setMine(mineRes.data.deliveries);
      setGains(gainsRes.data);
      setFloodAlerts(floodRes.data.alertes);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Signale une course dont le retrait ou la livraison tombe à proximité
  // d'une alerte route inondée active — purement informatif côté livreur,
  // calculé ici avec les alertes déjà chargées (pas d'appel réseau par
  // course).
  function floodNear(d) {
    return floodAlerts.some((a) => {
      const distPickup = haversineKm(d.pickup_lat, d.pickup_lng, a.lat, a.lng);
      const distDropoff = haversineKm(d.dropoff_lat, d.dropoff_lng, a.lat, a.lng);
      return (distPickup !== null && distPickup <= FLOOD_ALERT_RADIUS_KM) || (distDropoff !== null && distDropoff <= FLOOD_ALERT_RADIUS_KM);
    });
  }

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [loadAll]);

  async function toggleAvailability() {
    setToggling(true);
    try {
      await api.patch('/users/me/disponibilite', { available: !user.available });
      await refreshUser();
      loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  async function accept(id) {
    try {
      await api.post(`/deliveries/${id}/accepter`);
      loadAll();
      setTab('mes-courses');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const activeCourses = mine.filter((d) => !['livree', 'annulee'].includes(d.status));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Espace livreur</h1>
          <button
            onClick={toggleAvailability}
            disabled={toggling || !user.verified}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${user.available ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
          >
            {user.available ? '🟢 Disponible' : '⚪ Indisponible'}
          </button>
        </div>

        {!user.verified && <DocumentPanel user={user} onUpdated={refreshUser} />}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
            <p className="text-xs text-slate-400">Gains totaux</p>
            <p className="text-lg font-bold text-slate-900">{gains ? `${gains.total} F` : '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
            <p className="text-xs text-slate-400">Livraisons</p>
            <p className="text-lg font-bold text-slate-900">{gains ? gains.nb_livraisons : '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
            <p className="text-xs text-slate-400">Note</p>
            <p className="text-lg font-bold text-slate-900">⭐ {user.rating_avg}</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { key: 'disponibles', label: `Disponibles (${available.length})` },
            { key: 'mes-courses', label: `Mes courses (${activeCourses.length})` },
            { key: 'historique', label: 'Historique' },
            { key: 'avance', label: '💸 Avance' },
            { key: 'inondations', label: '🌊 Routes' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-400 text-sm">Chargement...</p>}

        {!loading && tab === 'disponibles' && (
          <div className="space-y-3">
            {!user.available && <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Passez en "Disponible" pour voir les courses proposées.</p>}
            {!!user.available && available.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune demande en attente pour le moment.</p>
            )}
            {available.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                <p className="text-sm text-slate-500 mt-1">Client: {d.client_name} · {d.package_description || 'Colis'} ({d.package_size})</p>
                <div className="flex gap-1 flex-wrap mt-2">
                  <ZoneBadge zone={d.zone} />
                  <DelaiBadge delaiGaranti={!!d.delai_garanti} />
                  {d.group_size > 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">🔗 Groupée ({d.group_size} colis)</span>}
                  {floodNear(d) && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">🌊 Route inondée signalée à proximité</span>}
                </div>
                {d.group_size > 1 && (
                  <p className="text-xs text-purple-700 mt-1.5">Un seul trajet pour {d.group_size} colis proches — accepter celle-ci vous assigne tout le groupe.</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <span className="font-bold text-orange-600">{d.price - PLATFORM_COMMISSION} FCFA</span>
                    <span className="text-xs text-slate-400 ml-1">pour vous (prix total {d.price} F)</span>
                  </div>
                  <button onClick={() => accept(d.id)} className="px-4 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition">Accepter</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'mes-courses' && (
          <div className="space-y-3">
            {activeCourses.length === 0 && <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune course en cours.</p>}
            {activeCourses.map((d) => (
              <Link key={d.id} to={`/livreur/livraisons/${d.id}`} className="block bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-orange-200 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Client: {d.client_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{d.price - PLATFORM_COMMISSION} FCFA</p>
                    <div className="flex gap-1 justify-end flex-wrap mt-1">
                      <StatusBadge status={d.status} />
                      {!d.delai_garanti && <DelaiBadge delaiGaranti={false} />}
                      {d.group_size > 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">🔗 Groupée</span>}
                      {d.return_status === 'demande' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">↩️ Retour</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && tab === 'historique' && (
          <div className="space-y-3">
            {mine.filter((d) => ['livree', 'annulee'].includes(d.status)).length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucun historique pour le moment.</p>
            )}
            {mine.filter((d) => ['livree', 'annulee'].includes(d.status)).map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{d.price - PLATFORM_COMMISSION} FCFA</p>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'avance' && <AvancePanel gains={gains} onRequested={loadAll} />}

        {!loading && tab === 'inondations' && <FloodAlertPanel user={user} onAlertsChanged={setFloodAlerts} />}
      </main>
    </div>
  );
}
