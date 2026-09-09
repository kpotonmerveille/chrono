import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

const ROLE_HOME = { client: '/client', livreur: '/livreur' };

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'livreur' ? 'livreur' : 'client';

  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', zone: '', vehicle: 'moto' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { role, name: form.name, phone: form.phone, email: form.email || undefined, password: form.password };
      if (role === 'livreur') {
        payload.zone = form.zone;
        payload.vehicle = form.vehicle;
      }
      const user = await register(payload);
      navigate(ROLE_HOME[user.role]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50 px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Créer un compte</h1>

        <div className="mt-5 grid grid-cols-2 gap-2 bg-slate-100 rounded-xl p-1">
          {[
            { key: 'client', label: 'Client' },
            { key: 'livreur', label: 'Livreur' },
          ].map((r) => (
            <button
              key={r.key} type="button" onClick={() => setRole(r.key)}
              className={`py-2 rounded-lg text-sm font-medium transition ${role === r.key ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
            <input id="reg-name" required value={form.name} onChange={update('name')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label htmlFor="reg-phone" className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
            <input id="reg-phone" required type="tel" value={form.phone} onChange={update('phone')} placeholder="+229 XX XX XX XX" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1">Email (optionnel)</label>
            <input id="reg-email" type="email" value={form.email} onChange={update('email')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          {role === 'livreur' && (
            <>
              <div>
                <label htmlFor="reg-zone" className="block text-sm font-medium text-slate-700 mb-1">Zone d'activité</label>
                <input id="reg-zone" required value={form.zone} onChange={update('zone')} placeholder="Ex: Cotonou, Akpakpa, Fidjrossè..." className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label htmlFor="reg-vehicle" className="block text-sm font-medium text-slate-700 mb-1">Véhicule</label>
                <select id="reg-vehicle" value={form.vehicle} onChange={update('vehicle')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="moto">Moto</option>
                  <option value="voiture">Voiture</option>
                  <option value="tricycle">Tricycle</option>
                  <option value="velo">Vélo</option>
                </select>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Votre compte devra être vérifié par notre équipe avant de pouvoir accepter des courses.
              </p>
            </>
          )}
          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
            <input id="reg-password" required type="password" minLength={6} value={form.password} onChange={update('password')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button disabled={loading} type="submit" className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-sm text-slate-500 text-center mt-5">
          Déjà un compte ? <Link to="/connexion" className="text-orange-600 font-medium hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
