import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SOSButton from './SOSButton';

const ROLE_HOME = { client: '/client', livreur: '/livreur', admin: '/admin' };
const ROLE_LABEL = { client: 'Client', livreur: 'Livreur', admin: 'Administrateur' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white border-b border-orange-100 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to={user ? ROLE_HOME[user.role] : '/'} className="flex items-center gap-2 font-bold text-lg text-orange-600">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white">⏱️</span>
          <span>Chrono</span>
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">
              {user.name} <span className="text-slate-400">· {ROLE_LABEL[user.role]}</span>
            </span>
            {user.role === 'livreur' && <SOSButton />}
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-600 hover:text-orange-600 border border-slate-200 rounded-lg px-3 py-1.5 transition"
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
