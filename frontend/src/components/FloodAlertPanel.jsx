import { useEffect, useState, useCallback } from 'react';
import api, { apiErrorMessage } from '../lib/api';
import LocationPicker from './LocationPicker';

const MAX_DESCRIPTION_LENGTH = 300;

function timeAgo(iso) {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `il y a ${diffH} h`;
}

// Alerte route inondée : signalement manuel partagé entre clients et
// livreurs (aucune donnée fiable disponible automatiquement en saison des
// pluies à Cotonou). Composant partagé entre l'espace client et l'espace
// livreur — voir backend/src/routes/inondations.js.
export default function FloodAlertPanel({ user, onAlertsChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pos, setPos] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inondations');
      setAlerts(res.data.alertes);
      onAlertsChanged?.(res.data.alertes);
    } catch {
      /* liste non critique, on réessaiera au prochain rafraîchissement */
    } finally {
      setLoading(false);
    }
  }, [onAlertsChanged]);

  useEffect(() => { load(); }, [load]);

  async function handleReport(e) {
    e.preventDefault();
    setError('');
    if (!pos) {
      setError('Placez le point sur la carte où la route est inondée.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/inondations', { lat: pos[0], lng: pos[1], description: description.trim() || undefined });
      setPos(null);
      setDescription('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(id) {
    setResolvingId(id);
    try {
      await api.post(`/inondations/${id}/resoudre`);
      await load();
    } catch {
      /* silencieux : l'utilisateur peut réessayer */
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">🌊 Alertes route inondée</h2>
            <p className="text-sm text-slate-500 mt-1">
              Signalement manuel par les clients et les livreurs — en saison des pluies, certains axes de Cotonou
              deviennent impraticables. Une alerte reste affichée {' '}
              <span className="font-medium">quelques heures</span>, ou jusqu'à ce que son auteur la lève.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="shrink-0 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition"
          >
            {showForm ? 'Annuler' : '🌊 Signaler une route inondée'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleReport} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <LocationPicker value={pos} onChange={setPos} height={200} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder="Ex: eau au niveau du guidon près du pont, moto ne passe plus (optionnel)"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button disabled={submitting} type="submit" className="rounded-lg bg-sky-600 text-white font-semibold px-4 py-2 hover:bg-sky-700 transition disabled:opacity-60 text-sm">
              {submitting ? 'Envoi...' : "Confirmer le signalement"}
            </button>
          </form>
        )}
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Chargement...</p>}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">
            Aucune route inondée signalée actuellement.
          </p>
        )}
        {alerts.map((a) => {
          const canResolve = user && (user.id === a.reporter_id || user.role === 'admin');
          return (
            <div key={a.id} className="bg-white rounded-xl border border-sky-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-800">{a.description || 'Route signalée comme inondée, sans détail.'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Signalé par {a.reporter_role === 'livreur' ? 'un livreur' : 'un client'} · {timeAgo(a.created_at)}
                  </p>
                </div>
                {canResolve && (
                  <button
                    onClick={() => handleResolve(a.id)}
                    disabled={resolvingId === a.id}
                    className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    {resolvingId === a.id ? '...' : "💧 L'eau s'est retirée"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
