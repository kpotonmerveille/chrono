import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';

const ALERT_TYPE_LABEL = {
  danger: { text: '🚨 Danger', className: 'bg-red-100 text-red-800 border-red-300' },
  panne: { text: '🔧 Panne', className: 'bg-amber-100 text-amber-800 border-amber-300' },
};

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

function minutesSince(dateStr) {
  // Les dates SQLite (CURRENT_TIMESTAMP) sont en UTC sans suffixe explicite ;
  // on le force pour que new Date() les interprète correctement quel que
  // soit le fuseau horaire du navigateur.
  const created = new Date(/Z$/.test(dateStr) ? dateStr : `${dateStr.replace(' ', 'T')}Z`);
  return Math.max(0, Math.round((Date.now() - created.getTime()) / 60000));
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

const CLAIM_STATUS_LABEL = {
  en_cours: { text: 'En cours', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  rembourse: { text: 'Remboursé', className: 'bg-green-100 text-green-800 border-green-300' },
  refuse: { text: 'Refusé', className: 'bg-red-100 text-red-800 border-red-300' },
};

const AVANCE_STATUS_LABEL = {
  en_attente: { text: 'En attente', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  approuvee: { text: 'Approuvée', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  versee: { text: 'Versée', className: 'bg-green-100 text-green-800 border-green-300' },
  refusee: { text: 'Refusée', className: 'bg-red-100 text-red-800 border-red-300' },
};

export default function AdminDashboard() {
  const [tab, setTab] = useState('vue-ensemble');
  const [stats, setStats] = useState(null);
  const [livreurs, setLivreurs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [reclamations, setReclamations] = useState([]);
  const [avances, setAvances] = useState([]);
  const [impayees, setImpayees] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [documentsById, setDocumentsById] = useState({});
  const [vehiculeDocsRequis, setVehiculeDocsRequis] = useState(4);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioCtxRef = useRef(null);
  const sirenIntervalRef = useRef(null);

  const alertesActives = alertes.filter((a) => a.status === 'active');

  const loadAll = useCallback(async () => {
    try {
      const [statsRes, livreursRes, deliveriesRes, reclamationsRes, avancesRes, impayeesRes, alertesRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/livreurs'),
        api.get('/admin/deliveries'),
        api.get('/admin/reclamations'),
        api.get('/admin/avances'),
        api.get('/admin/impayees'),
        api.get('/alertes'),
      ]);
      setStats(statsRes.data);
      setLivreurs(livreursRes.data.livreurs);
      setVehiculeDocsRequis(livreursRes.data.vehicule_documents_requis);
      setDeliveries(deliveriesRes.data.deliveries);
      setReclamations(reclamationsRes.data.reclamations);
      setAvances(avancesRes.data.avances);
      setImpayees(impayeesRes.data.impayees);
      setAlertes(alertesRes.data.alertes);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  // Reçoit les alertes SOS livreur en temps réel (nouvelle alerte ou
  // résolution) : on rejoint le canal admin dédié dès la connexion du socket.
  // La liste chargée par polling (loadAll, toutes les 10s) reste le filet de
  // sécurité si le socket est momentanément coupé.
  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    const socket = io({ path: '/socket.io' });
    socket.emit('rejoindre_admin', { token });
    socket.on('alerte_sos', (alert) => {
      setAlertes((prev) => {
        const idx = prev.findIndex((a) => a.id === alert.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = alert;
          return copy;
        }
        return [alert, ...prev];
      });
      if (alert.status === 'active') setTab('sos');
    });
    return () => socket.disconnect();
  }, []);

  // Alarme sonore (Web Audio API, pas de fichier audio à héberger) : sonne en
  // continu tant qu'au moins une alerte est active, s'arrête dès qu'il n'y en
  // a plus. Les navigateurs bloquent l'audio tant qu'aucun geste utilisateur
  // n'a eu lieu sur la page — d'où le bouton "Activer l'alarme sonore".
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioCtxRef.current = ctx;
    setAudioUnlocked(true);
  }

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !audioUnlocked) return undefined;

    function playBeep() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(1000, now + 0.5);
      osc.frequency.linearRampToValueAtTime(600, now + 1);
      gain.gain.setValueAtTime(0.15, now);
      osc.start(now);
      osc.stop(now + 1);
    }

    if (alertesActives.length > 0 && !sirenIntervalRef.current) {
      playBeep();
      sirenIntervalRef.current = setInterval(playBeep, 1100);
    } else if (alertesActives.length === 0 && sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }

    return () => {
      if (alertesActives.length === 0 && sirenIntervalRef.current) {
        clearInterval(sirenIntervalRef.current);
        sirenIntervalRef.current = null;
      }
    };
  }, [alertesActives.length, audioUnlocked]);

  async function resoudreAlerte(alert) {
    const note = window.prompt('Note de résolution (ex: police envoyée sur place, fausse alerte...) :') || '';
    setBusyId(`alerte-${alert.id}`);
    try {
      const res = await api.patch(`/alertes/${alert.id}/resoudre`, { note: note || undefined });
      setAlertes((prev) => prev.map((a) => (a.id === alert.id ? res.data.alerte : a)));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function decisionReclamation(id, decision) {
    let note;
    if (decision === 'refuse') {
      note = window.prompt('Motif du refus (optionnel) :') || '';
    }
    setBusyId(`reclamation-${id}`);
    try {
      await api.patch(`/admin/reclamations/${id}/decision`, { decision, note: note || undefined });
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function decisionAvance(id, decision) {
    setBusyId(`avance-${id}`);
    try {
      await api.patch(`/admin/avances/${id}/decision`, { decision });
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

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
      if (expandedId === livreur.id) await loadDocuments(livreur.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const loadDocuments = useCallback(async (livreurId) => {
    try {
      const res = await api.get(`/admin/livreurs/${livreurId}/documents`);
      setDocumentsById((prev) => ({ ...prev, [livreurId]: res.data }));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  async function toggleExpanded(livreur) {
    if (expandedId === livreur.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(livreur.id);
    if (!documentsById[livreur.id]) await loadDocuments(livreur.id);
  }

  async function voirDocumentVehicule(livreurId, type) {
    try {
      const res = await api.get(`/admin/livreurs/${livreurId}/vehicule/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function decisionDocumentVehicule(livreurId, type, decision) {
    let note;
    if (decision === 'rejete') {
      note = window.prompt('Motif du refus (visible par le livreur) :') || '';
    }
    setBusyId(livreurId);
    try {
      await api.patch(`/admin/livreurs/${livreurId}/vehicule/${type}/decision`, { decision, note: note || undefined });
      await loadAll();
      await loadDocuments(livreurId);
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

        {!audioUnlocked && (
          <button
            onClick={unlockAudio}
            className="w-full text-left text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 hover:bg-indigo-100 transition"
          >
            🔔 Activer l'alarme sonore SOS (obligatoire une fois par visite — votre navigateur bloque le son tant que vous n'avez pas cliqué ici)
          </button>
        )}

        {alertesActives.length > 0 && (
          <button
            onClick={() => setTab('sos')}
            className="w-full text-left text-white font-bold bg-red-600 hover:bg-red-700 rounded-xl px-4 py-3 animate-pulse"
          >
            🚨 {alertesActives.length} alerte(s) SOS active(s) — un livreur a besoin d'aide maintenant. Cliquez pour voir sa position.
          </button>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
          {[
            { key: 'sos', label: `🚨 SOS (${alertesActives.length})` },
            { key: 'vue-ensemble', label: "Vue d'ensemble" },
            { key: 'livreurs', label: `Livreurs (${livreurs.length})` },
            { key: 'livraisons', label: `Livraisons (${deliveries.length})` },
            { key: 'reclamations', label: `🛡️ Réclamations (${reclamations.filter((r) => r.claim_status === 'en_cours').length})` },
            { key: 'avances', label: `💸 Avances (${avances.filter((a) => a.status === 'en_attente').length})` },
            { key: 'impayees', label: `⏰ Impayées (${impayees.length})` },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sos' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Alertes déclenchées par un livreur en danger ou en panne, avec sa position exacte au moment de
              l'alerte. Marquez une alerte résolue une fois la police ou l'équipe de dépannage envoyée (ou si c'était
              une fausse alerte).
            </p>
            {alertes.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune alerte SOS pour le moment.</p>
            )}
            {alertes.map((a) => {
              const badge = ALERT_TYPE_LABEL[a.type] || ALERT_TYPE_LABEL.danger;
              const mapsUrl = `https://www.google.com/maps?q=${a.lat},${a.lng}`;
              return (
                <div
                  key={a.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 space-y-2 ${a.status === 'active' ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-100'}`}
                >
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{a.livreur_name} · {a.livreur_phone} {a.livreur_vehicle ? `· ${a.livreur_vehicle}` : ''}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(/Z$/.test(a.created_at) ? a.created_at : `${a.created_at.replace(' ', 'T')}Z`).toLocaleString('fr-FR')} · {minutesSince(a.created_at)} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badge.className}`}>{badge.text}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${a.status === 'active' ? 'bg-red-600 text-white border-red-600' : 'bg-green-100 text-green-800 border-green-300'}`}>
                        {a.status === 'active' ? 'Active' : 'Résolue'}
                      </span>
                    </div>
                  </div>
                  {a.message && (
                    <div className="bg-slate-50 rounded-lg p-3 text-sm">
                      <p className="text-slate-400 text-xs">Message du livreur</p>
                      <p className="text-slate-800">{a.message}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition">
                      📍 Voir sa position exacte sur la carte
                    </a>
                    <a href={`tel:${a.livreur_phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                      📞 Appeler {a.livreur_name}
                    </a>
                    {a.status === 'active' && (
                      <button disabled={busyId === `alerte-${a.id}`} onClick={() => resoudreAlerte(a)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">
                        Marquer résolue
                      </button>
                    )}
                  </div>
                  {a.status === 'resolue' && a.resolved_note && (
                    <p className="text-xs text-slate-500">Note de résolution : {a.resolved_note}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
            {stats.livraisonsImpayees > 0 && (
              <button onClick={() => setTab('impayees')} className="w-full text-left text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3 hover:bg-red-100 transition">
                ⏰ {stats.livraisonsImpayees} course(s) restent impayées depuis plus de 15 minutes. Rendez-vous dans l'onglet "Impayées".
              </button>
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
                  <th className="px-4 py-2 font-medium">Documents</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {livreurs.map((l) => {
                  const totalRequis = 1 + vehiculeDocsRequis;
                  const totalApprouves = (l.id_document_status === 'approuve' ? 1 : 0) + l.vehicule_documents_approuves;
                  const docs = documentsById[l.id];
                  return (
                  <Fragment key={l.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{l.name}</td>
                    <td className="px-4 py-2 text-slate-600">{l.phone}</td>
                    <td className="px-4 py-2 text-slate-600">⭐ {l.rating_avg} ({l.rating_count})</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${totalApprouves === totalRequis ? 'bg-green-100 text-green-800 border-green-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                          {totalApprouves}/{totalRequis} approuvés
                        </span>
                        <button onClick={() => toggleExpanded(l)} className="text-xs text-indigo-600 hover:underline">
                          {expandedId === l.id ? 'Fermer' : 'Voir détails'}
                        </button>
                      </div>
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
                  {expandedId === l.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        {!docs && <p className="text-xs text-slate-400">Chargement des documents...</p>}
                        {docs && (
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            <div className="bg-white rounded-lg border border-slate-100 p-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-700">Pièce d'identité</span>
                                <DocumentStatusBadge status={docs.identite.status} />
                              </div>
                              {docs.identite.status === 'rejete' && docs.identite.note && (
                                <p className="text-xs text-red-600 mt-1">Motif : {docs.identite.note}</p>
                              )}
                              <div className="flex gap-2 mt-2">
                                {docs.identite.status !== 'non_soumis' && (
                                  <button onClick={() => voirDocument(l)} className="text-xs text-indigo-600 hover:underline">Voir</button>
                                )}
                                {docs.identite.status === 'en_attente' && (
                                  <>
                                    <button disabled={busyId === l.id} onClick={() => decisionDocument(l, 'approuve')} className="text-xs font-semibold px-2 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">Approuver</button>
                                    <button disabled={busyId === l.id} onClick={() => decisionDocument(l, 'rejete')} className="text-xs font-semibold px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50">Refuser</button>
                                  </>
                                )}
                              </div>
                            </div>
                            {docs.vehicule.map((doc) => (
                              <div key={doc.type} className="bg-white rounded-lg border border-slate-100 p-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-700">{doc.label}</span>
                                  <DocumentStatusBadge status={doc.status} />
                                </div>
                                {doc.status === 'rejete' && doc.note && (
                                  <p className="text-xs text-red-600 mt-1">Motif : {doc.note}</p>
                                )}
                                <div className="flex gap-2 mt-2">
                                  {doc.status !== 'non_soumis' && (
                                    <button onClick={() => voirDocumentVehicule(l.id, doc.type)} className="text-xs text-indigo-600 hover:underline">Voir</button>
                                  )}
                                  {doc.status === 'en_attente' && (
                                    <>
                                      <button disabled={busyId === l.id} onClick={() => decisionDocumentVehicule(l.id, doc.type, 'approuve')} className="text-xs font-semibold px-2 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">Approuver</button>
                                      <button disabled={busyId === l.id} onClick={() => decisionDocumentVehicule(l.id, doc.type, 'rejete')} className="text-xs font-semibold px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50">Refuser</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
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

        {tab === 'reclamations' && (
          <div className="space-y-3">
            {reclamations.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune réclamation pour le moment.</p>
            )}
            {reclamations.map((r) => {
              const badge = CLAIM_STATUS_LABEL[r.claim_status] || CLAIM_STATUS_LABEL.en_cours;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{r.pickup_address} → {r.dropoff_address}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Client: {r.client_name} · {r.client_phone} {r.livreur_name ? `· Livreur: ${r.livreur_name}` : ''} · {new Date(r.claim_created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badge.className}`}>{badge.text}</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-sm">
                    <p className="text-slate-400 text-xs">Description du problème</p>
                    <p className="text-slate-800">{r.claim_description}</p>
                  </div>
                  <p className="text-xs text-slate-500">Prix colis {r.price} F · Assurance {r.insurance_fee} F</p>
                  {r.claim_note && <p className="text-xs text-slate-500">Note admin : {r.claim_note}</p>}
                  {r.claim_status === 'en_cours' && (
                    <div className="flex gap-2">
                      <button disabled={busyId === `reclamation-${r.id}`} onClick={() => decisionReclamation(r.id, 'rembourse')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">
                        Accepter (rembourser)
                      </button>
                      <button disabled={busyId === `reclamation-${r.id}`} onClick={() => decisionReclamation(r.id, 'refuse')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50">
                        Refuser
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'avances' && (
          <div className="space-y-3">
            {avances.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune demande d'avance pour le moment.</p>
            )}
            {avances.map((a) => {
              const badge = AVANCE_STATUS_LABEL[a.status] || AVANCE_STATUS_LABEL.en_attente;
              return (
                <div key={a.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{a.amount} FCFA</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {a.livreur_name} · {a.livreur_phone} · {new Date(a.requested_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badge.className}`}>{badge.text}</span>
                    {a.status === 'en_attente' && (
                      <>
                        <button disabled={busyId === `avance-${a.id}`} onClick={() => decisionAvance(a.id, 'approuvee')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50">
                          Approuver
                        </button>
                        <button disabled={busyId === `avance-${a.id}`} onClick={() => decisionAvance(a.id, 'refusee')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50">
                          Refuser
                        </button>
                      </>
                    )}
                    {a.status === 'approuvee' && (
                      <button disabled={busyId === `avance-${a.id}`} onClick={() => decisionAvance(a.id, 'versee')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-50">
                        Marquer versée (Mobile Money)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'impayees' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Courses non annulées dont le paiement n'est pas confirmé, créées il y a plus de 15 minutes — relancez le
              client (ou le destinataire, si c'est lui qui doit payer) par téléphone.
            </p>
            {impayees.length === 0 && (
              <p className="text-sm text-slate-400 bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune course impayée pour le moment.</p>
            )}
            {impayees.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-red-100 shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Créée le {new Date(d.created_at).toLocaleString('fr-FR')} · {minutesSince(d.created_at)} min
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-red-100 text-red-800 border-red-300">
                    {d.payer_type === 'destinataire' ? 'À payer par le destinataire' : "À payer par l'expéditeur"}
                  </span>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
                  <span className="font-semibold text-slate-900">{d.price} FCFA</span>
                  {d.client_phone && (
                    <a href={`tel:${d.client_phone}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                      📞 Appeler {d.client_name} ({d.client_phone})
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
