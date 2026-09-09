import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import { useAuth } from '../../context/AuthContext';

const PLATFORM_COMMISSION = 100;

function DocumentPanel({ user, onUpdated }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      await api.post('/users/me/document', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null);
      await onUpdated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-3">
      {user.id_document_status === 'non_soumis' && (
        <p className="text-sm text-amber-800">
          Envoyez une photo lisible de votre pièce d'identité (CNI, permis de conduire...) pour être vérifié par l'administration et pouvoir accepter des courses.
        </p>
      )}
      {user.id_document_status === 'en_attente' && (
        <p className="text-sm text-amber-800">📄 Document envoyé, en cours d'examen par l'administration.</p>
      )}
      {user.id_document_status === 'rejete' && (
        <div>
          <p className="text-sm text-red-700 font-medium">Document refusé{user.id_document_note ? ` : ${user.id_document_note}` : ''}</p>
          <p className="text-sm text-amber-800 mt-1">Merci d'envoyer un nouveau document lisible.</p>
        </div>
      )}
      {user.id_document_status !== 'en_attente' && (
        <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-2">
          <input type="file" accept="image/jpeg,image/png,image/webp,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} className="text-xs text-amber-900" />
          <button disabled={!file || uploading} type="submit" className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition disabled:opacity-50">
            {uploading ? 'Envoi...' : 'Envoyer le document'}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function LivreurDashboard() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('disponibles');
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [gains, setGains] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [avRes, mineRes, gainsRes] = await Promise.all([
        api.get('/deliveries/disponibles').catch((e) => ({ data: { deliveries: [] }, error: e })),
        api.get('/deliveries/assignees'),
        api.get('/users/me/gains'),
      ]);
      setAvailable(avRes.data.deliveries);
      setMine(mineRes.data.deliveries);
      setGains(gainsRes.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

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
                </div>
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
      </main>
    </div>
  );
}
