import { useEffect, useState, useCallback, useMemo } from 'react';
import api, { apiErrorMessage } from '../lib/api';
import LocationPicker from './LocationPicker';

const MAX_DESCRIPTION_LENGTH = 300;

// Trois types de signalement, alignés sur backend/src/pricing.js
// (ALERT_TYPES). resolveLabel/resolveEmoji personnalisent le bouton "lever
// l'alerte" selon le type (l'eau se retire, une voie rouvre, une panne est
// réparée...).
const ALERT_TYPES = {
  inondation: { label: 'Route inondée', emoji: '🌊', resolveLabel: "L'eau s'est retirée", resolveEmoji: '💧' },
  voie_barree: { label: 'Voie barrée (travaux)', emoji: '🚧', resolveLabel: 'Voie rouverte', resolveEmoji: '✅' },
  panne_electrique: { label: 'Panne électrique / poteau tombé', emoji: '⚡', resolveLabel: 'Panne réparée', resolveEmoji: '✅' },
};
const ALERT_TYPE_KEYS = Object.keys(ALERT_TYPES);

const VILLES = ['Cotonou', 'Abomey-Calavi', 'Porto-Novo', 'Sèmè-Podji', 'Autre'];

function timeAgo(iso) {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `il y a ${diffH} h`;
}

// Heure du constat, affichée publiquement en toutes lettres (pas seulement
// "il y a X min") — c'est l'heure exacte à laquelle la personne a signalé
// l'incident, utile pour juger si l'information est encore fraîche.
function heureSignalement(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}h${m}`;
}

const EMPTY_FORM = { type: 'inondation', ville: VILLES[0], quartier: '', description: '' };

// Signalements route/voirie : inondation, voie barrée, panne électrique —
// manuel, partagé entre clients et livreurs (aucune donnée fiable
// disponible automatiquement à Cotonou). Composant partagé entre l'espace
// client et l'espace livreur — voir backend/src/routes/inondations.js.
export default function FloodAlertPanel({ user, onAlertsChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pos, setPos] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  // Recherche + filtres pour retrouver vite les signalements d'une zone.
  const [search, setSearch] = useState('');
  const [villeFilter, setVilleFilter] = useState('Toutes');
  const [typeFilter, setTypeFilter] = useState('tous');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

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
      setError('Placez le point sur la carte où se trouve l’incident.');
      return;
    }
    if (!form.quartier.trim()) {
      setError('Indiquez le quartier exact.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/inondations', {
        type: form.type,
        lat: pos[0],
        lng: pos[1],
        ville: form.ville,
        quartier: form.quartier.trim(),
        description: form.description.trim() || undefined,
      });
      setPos(null);
      setForm(EMPTY_FORM);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (typeFilter !== 'tous' && a.type !== typeFilter) return false;
      if (villeFilter !== 'Toutes' && a.ville !== villeFilter) return false;
      if (!q) return true;
      return [a.quartier, a.ville, a.description].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [alerts, search, villeFilter, typeFilter]);

  return (
    <div className="mt-5 space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">🚧 Signalements route & incidents</h2>
            <p className="text-sm text-slate-500 mt-1">
              Signalement manuel par les clients et les livreurs : route inondée, voie barrée pour travaux, panne
              électrique ou poteau tombé. Chaque alerte reste affichée un temps limité selon son type, ou jusqu'à ce
              que son auteur la lève.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="shrink-0 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition"
          >
            {showForm ? 'Annuler' : '🚧 Signaler un incident'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleReport} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Type d'incident</label>
              <div className="flex flex-wrap gap-2">
                {ALERT_TYPE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => update('type', key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                      form.type === key
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {ALERT_TYPES[key].emoji} {ALERT_TYPES[key].label}
                  </button>
                ))}
              </div>
            </div>

            <LocationPicker value={pos} onChange={setPos} height={200} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ville</label>
                <select
                  value={form.ville}
                  onChange={(e) => update('ville', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  {VILLES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quartier exact</label>
                <input
                  type="text"
                  value={form.quartier}
                  onChange={(e) => update('quartier', e.target.value)}
                  placeholder="Ex: Fidjrossè Kpota"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            </div>

            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 Chercher un quartier, une ville..."
          className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <select
          value={villeFilter}
          onChange={(e) => setVilleFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="Toutes">Toutes les villes</option>
          {VILLES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="tous">Tous les types</option>
          {ALERT_TYPE_KEYS.map((key) => (
            <option key={key} value={key}>{ALERT_TYPES[key].emoji} {ALERT_TYPES[key].label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Chargement...</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">
            {alerts.length === 0 ? 'Aucun incident signalé actuellement.' : 'Aucun résultat pour cette recherche.'}
          </p>
        )}
        {filtered.map((a) => {
          const canResolve = user && (user.id === a.reporter_id || user.role === 'admin');
          const cfg = ALERT_TYPES[a.type] || ALERT_TYPES.inondation;
          return (
            <div key={a.id} className="bg-white rounded-xl border border-sky-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                      {cfg.emoji} {cfg.label}
                    </span>
                    {(a.quartier || a.ville) && (
                      <span className="text-xs font-medium text-slate-500">
                        📍 {[a.quartier, a.ville].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 mt-1.5">{a.description || 'Signalé sans détail supplémentaire.'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Signalé par {a.reporter_role === 'livreur' ? 'un livreur' : 'un client'} à{' '}
                    <span className="font-semibold text-slate-500">{heureSignalement(a.created_at)}</span> ({timeAgo(a.created_at)})
                  </p>
                </div>
                {canResolve && (
                  <button
                    onClick={() => handleResolve(a.id)}
                    disabled={resolvingId === a.id}
                    className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    {resolvingId === a.id ? '...' : `${cfg.resolveEmoji} ${cfg.resolveLabel}`}
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
