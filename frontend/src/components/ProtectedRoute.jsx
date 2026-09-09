import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Chargement...</div>;
  }
  if (!user) return <Navigate to="/connexion" replace />;
  if (role && user.role !== role) {
    const fallback = { client: '/client', livreur: '/livreur', admin: '/admin' }[user.role] || '/';
    return <Navigate to={fallback} replace />;
  }
  return children;
}
