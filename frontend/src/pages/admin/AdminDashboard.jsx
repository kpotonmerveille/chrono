import { useEffect, useState, useCallback } from 'react';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';

const DOCUMENT_STATUS_LABELS = {
  non_soumis: { label: 'Aucun document', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  en_attente: { label: 'À examiner', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  approuve: { label: 'Approuvé', className: 'bg-green-100 text-green-800 border-green-300' },
  rejete: { label: 'Refusé', className: 'bg-red-100 text-red-700 border-red-300' },
};

function DocumentStatusBadge({ status }) {
  const info = DOCUMENT_STATUS_LABELS[status] || DOCUMENT_STATUS_LABELS.non_soumis;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${info.className}`}>
      {info.label}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('vue-ensemble');
  const [stats, setStats] = useState(null);
  const [livreurs, setLivreurs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [statsRes, livreursRes, deliveriesRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/livreurs'),
        api.get('/admin/deliveries'),
      ]);
      setStats(statsRes.data);
      setLivreurs(livreursRes.data.livreurs);
      setDeliveries(deliveriesRes.data.deliveries);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, [loadAll]);

  async function toggleVerified(livreur) {
    setBusyId(livreur.id);
    try {
      await api.patch(`/admin/livreurs/${livreur.id}/verifier`, { verified: !livreur.verified });
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function voirDocument(livreur) {
    try {
      const res = await api.get(`/admin/livreurs/${livreur.id}/document`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function decisionDocument(livreur, decision) {
    let note;
    if (decision === 'rejete') {
      note = window.prompt('Motif du refus (visible par le livreur) :') || '';
    }
    setBusyId(livreur.id);
    try {
      await api.patch(`/admin/livreurs/${livreur.id}/document/decision`, { decision, note: note || undefined });
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-bold text-slate-900">Tableau de bord administrateur</h1>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
          {[
            { key: 'vue-ensemble', label: "Vue d'ensemble" },
            { key: 'livreurs', label: `Livreurs (${livreurs.length})` },
            { key: 'livraisons', label: `Livraisons (${deliveries.length})` },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'vue-ensemble' && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total livraisons" value={stats.totalLivraisons} />
              <StatCard label="En attente" value={stats.enAttente} accent="text-amber-600" />
              <StatCard label="En cours" value={stats.enCours} accent="text-indigo-600" />
              <StatCard label="Livrées" value={stats.livrees} accent="text-green-600" />
              <StatCard label="Annulées" value={stats.annulees} accent="text-red-600" />
              <StatCard label="Revenus (payés)" value={`${stats.revenus} F`} accent="text-orange-600" />
              <StatCard label="Clients" value={stats.clients} />
              <StatCard label="Livreurs" value={stats.livreurs} />
            </div>
            {stats.livreursEnAttenteVerif > 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                {stats.livreursEnAttenteVerif} livreur(s) en attente de vérification. Rendez-vous dans l'onglet "Livreurs".
              </p>
            )}
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-400 mb-2">Répartition par zone (sur les 200 dernières livraisons)</p>
              <div className="flex gap-3 flex-wrap items-center">
                {['courte', 'moyenne', 'longue'].map((z) => (
                  <div key={z} className="flex items-center gap-1.5">
                    <ZoneBadge zone={z} />
                    <span className="text-sm font-semibold text-slate-700">{deliveries.filter((d) => d.zone === z).length}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'livreurs' && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Téléphone</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">Pièce d'identité</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {livreurs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{l.name}</td>
                    <td className="px-4 py-2 text-slate-600">{l.phone}</td>
                    <td className="px-4 py-2 text-slate-600">⭐ {l.rating_avg} ({l.rating_count})</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DocumentStatusBadge status={l.id_document_status} />
                        {l.id_document_status !== 'non_soumis' && (
                          <button onClick={() => voirDocument(l)} className="text-xs text-indigo-600 hover:underline">Voir</button>
                        )}
                      </div>
                      {l.id_document_status === 'en_attente' && (
                        <div className="flex gap-1 mt-1">
                          <button disabled={busyId === l.id} onClick={() => decisionDocument(l, 'approuve')} className="text-xs font-semibold px-2 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">Approuver</button>
                          <button disabled={busyId === l.id} onClick={() => decisionDocument(l, 'rejete')} className="text-xs font-semibold px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50">Refuser</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${l.verified ? 'bg-green-100 text-green-800 border-green-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                        {l.verified ? 'Vérifié' : 'En attente'}
                      </span>
                      {l.available ? <span className="ml-1 text-xs text-green-600">· dispo</span> : null}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        disabled={busyId === l.id}
                        onClick={() => toggleVerified(l)}
                        title="Forcer le statut sans passer par la revue de document"
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 ${l.verified ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {l.verified ? 'Suspendre' : 'Vérifier manuellement'}
                      </button>
                    </td>
                  </tr>
                ))}
                {livreurs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Aucun livreur inscrit.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'livraisons' && (
          <div className="space-y-3">
            {deliveries.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Client: {d.client_name} {d.livreur_name ? `· Livreur: ${d.livreur_name}` : ''} · {new Date(d.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="font-semibold text-slate-900">{d.price} FCFA</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      <StatusBadge status={d.status} />
                      <PaymentBadge status={d.payment_status} />
                      <ZoneBadge zone={d.zone} />
                      {!d.delai_garanti && <DelaiBadge delaiGaranti={false} />}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {deliveries.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune livraison pour le moment.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
