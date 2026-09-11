import { useState } from 'react';
import api, { apiErrorMessage } from '../lib/api';

// Bouton SOS livreur : danger (agression, situation menaçante) ou panne
// (moto en panne, accident matériel). Envoie la position GPS exacte à
// l'instant du déclenchement — l'admin reçoit une alarme sonore + la
// position en direct sur son tableau de bord pour pouvoir envoyer la
// police ou une équipe de dépannage.
const ALERT_TYPES = [
  { type: 'danger', label: '🚨 Je suis en danger', desc: 'Agression, situation menaçante, personne me suit...', color: 'bg-red-600 hover:bg-red-700' },
  { type: 'panne', label: '🔧 Je suis en panne', desc: 'Moto en panne, accident matériel...', color: 'bg-amber-600 hover:bg-amber-700' },
];

export default function SOSButton() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function trigger(type) {
    setError('');
    if (!navigator.geolocation) {
      setError("Votre appareil ne permet pas la géolocalisation : impossible d'envoyer votre position.");
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.post('/alertes', {
            type,
            message: message.trim() || null,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setSent({ type });
          setOpen(false);
          setMessage('');
        } catch (err) {
          setError(apiErrorMessage(err));
        } finally {
          setSending(false);
        }
      },
      () => {
        setError("Impossible d'obtenir votre position. Activez la localisation et réessayez.");
        setSending(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSent(null); setError(''); }}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 animate-pulse"
        title="Alerte SOS"
      >
        🚨 SOS
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Déclencher une alerte</h2>
            <p className="text-sm text-slate-600">
              Votre position exacte sera envoyée immédiatement à l'administrateur, qui pourra
              envoyer la police ou une équipe de dépannage.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Précision (facultatif) : ce qui se passe..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              disabled={sending}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-2">
              {ALERT_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => trigger(t.type)}
                  disabled={sending}
                  className={`w-full text-white font-bold rounded-xl px-4 py-3 text-left transition disabled:opacity-60 ${t.color}`}
                >
                  <div>{t.label}</div>
                  <div className="text-xs font-normal opacity-90">{t.desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setOpen(false)}
              disabled={sending}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
            >
              {sending ? 'Envoi de votre position en cours...' : 'Annuler'}
            </button>
          </div>
        </div>
      )}

      {sent && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white rounded-xl px-4 py-3 shadow-lg max-w-sm text-sm flex items-center gap-2">
          <span>✅</span>
          <span>Alerte envoyée. L'administrateur a été notifié avec votre position.</span>
          <button onClick={() => setSent(null)} className="ml-2 text-white/80 hover:text-white">✕</button>
        </div>
      )}
    </>
  );
}
