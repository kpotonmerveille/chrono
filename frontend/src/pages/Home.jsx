import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const ROLE_HOME = { client: '/client', livreur: '/livreur', admin: '/admin' };

export default function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white text-3xl mb-6 shadow-lg shadow-orange-200">⏱️</span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Chrono, la livraison <span className="text-orange-600">express en 30 min</span> à Cotonou
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Prix fixe et clair par zone, pas de négociation. Suivez votre colis en temps réel et payez en ligne.
          Des livreurs vérifiés, un code de confirmation à chaque remise pour votre sécurité.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/inscription?role=client" className="px-6 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition shadow-md shadow-orange-200">
            Envoyer un colis
          </Link>
          <Link to="/inscription?role=livreur" className="px-6 py-3 rounded-xl bg-white border border-orange-200 text-orange-700 font-semibold hover:bg-orange-50 transition">
            Devenir livreur
          </Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Déjà un compte ? <Link to="/connexion" className="text-orange-600 font-medium hover:underline">Se connecter</Link>
        </p>

        <div className="mt-16 grid sm:grid-cols-4 gap-4 text-left">
          {[
            { icon: '⏱️', title: 'Rapidité', text: 'Mise en relation immédiate avec un livreur disponible près de vous.' },
            { icon: '🔒', title: 'Sécurité', text: 'Livreurs vérifiés et code de confirmation obligatoire à la remise.' },
            { icon: '📍', title: 'Suivi en direct', text: 'Statut de la course visible à chaque étape, du retrait à la livraison.' },
            { icon: '✅', title: 'Disponibilité', text: 'Des livreurs actifs à Cotonou et ses environs, à toute heure.' },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{f.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-slate-400">
          <Link to="/admin-connexion" className="hover:underline">Accès administrateur</Link>
        </p>
      </div>
    </div>
  );
}
