import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

const ROLE_HOME = { client: '/client', livreur: '/livreur', admin: '/admin' };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(phone, password);
      navigate(ROLE_HOME[user.role]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Connexion</h1>
        <p className="text-sm text-slate-500 text-center mt-1">Client ou livreur</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">Numéro de téléphone</label>
            <input
              id="phone"
              type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+229 XX XX XX XX"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
            <input
              id="password"
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button disabled={loading} type="submit" className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-sm text-slate-500 text-center mt-5">
          Pas encore de compte ? <Link to="/inscription" className="text-orange-600 font-medium hover:underline">Créer un compte</Link>
        </p>
        <p className="text-xs text-slate-400 text-center mt-2">
          <Link to="/admin-connexion" className="hover:underline">Connexion administrateur</Link>
        </p>
      </div>
    </div>
  );
}
