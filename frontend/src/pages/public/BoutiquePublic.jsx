import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';

// Vitrine publique d'un commerçant "Chrono Pro" : montre son nom de boutique
// et son adresse de retrait, avec un lien pour lui commander une livraison
// (le client doit se connecter/s'inscrire pour créer la demande — cette page
// ne fait qu'afficher les infos de la boutique, voir routes/public.js).
export default function BoutiquePublic() {
  const { slug } = useParams();
  const [boutique, setBoutique] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/public/boutique/${slug}`)
      .then((res) => setBoutique(res.data.boutique))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-10">
        {error && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center space-y-3">
            <p className="text-red-600 text-sm">{error}</p>
            <Link to="/" className="text-orange-600 text-sm font-medium hover:underline">Retour à l'accueil</Link>
          </div>
        )}
        {!boutique && !error && <p className="text-slate-400 text-center">Chargement...</p>}
        {boutique && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-3xl mx-auto">🏪</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{boutique.merchant_shop_name}</h1>
              <p className="text-sm text-slate-400 mt-0.5">par {boutique.name}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-left">
              <p className="text-slate-400 text-sm">Adresse de retrait</p>
              <p className="font-medium text-slate-800">{boutique.merchant_pickup_address}</p>
            </div>
            <p className="text-sm text-slate-500">
              Pour commander une livraison depuis cette boutique, connectez-vous ou créez un compte Chrono, puis utilisez le raccourci "🏪 Ma boutique" (si vous êtes ce commerçant) ou saisissez l'adresse ci-dessus comme point de retrait.
            </p>
            <Link to="/connexion" className="inline-block w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition">
              Se connecter pour commander
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
