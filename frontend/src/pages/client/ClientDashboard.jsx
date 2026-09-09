import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import LocationPicker from '../../components/LocationPicker';

const EMPTY_FORM = {
  pickup_address: '', dropoff_address: '',
  recipient_name: '', recipient_phone: '',
  package_description: '', package_size: 'petit',
};

export default function ClientDashboard() {
  const [tab, setTab] = useState('nouvelle');
  const [deliveries, setDeliveries] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [pickupPos, setPickupPos] = useState(null);
  const [dropoffPos, setDropoffPos] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  async function loadDeliveries() {
    setLoadingList(true);
    try {
      const res = await api.get('/deliveries/mine');
      setDeliveries(res.data.deliveries);
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadDeliveries(); }, []);

  useEffect(() => {
    if (!pickupPos || !dropoffPos) { setEstimation(null); return; }
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/deliveries/estimer', {
          pickup_lat: pickupPos[0], pickup_lng: pickupPos[1],
          dropoff_lat: dropoffPos[0], dropoff_lng: dropoffPos[1],
        });
        setEstimation(res.data);
      } catch { /* ignore */ } finally { setEstimating(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [pickupPos, dropoffPos]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        pickup_lat: pickupPos?.[0], pickup_lng: pickupPos?.[1],
        dropoff_lat: dropoffPos?.[0], dropoff_lng: dropoffPos?.[1],
      };
      await api.post('/deliveries', payload);
      setSuccess('Demande créée ! Rendez-vous dans "Mes livraisons" pour payer et suivre la course.');
      setForm(EMPTY_FORM);
      setPickupPos(null);
      setDropoffPos(null);
      setEstimation(null);
      loadDeliveries();
      setTab('mes-livraisons');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">Espace client</h1>

        <div className="mt-4 flex gap-2 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { key: 'nouvelle', label: 'Nouvelle livraison' },
            { key: 'mes-livraisons', label: `Mes livraisons (${deliveries.length})` },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'nouvelle' && (
          <form onSubmit={handleSubmit} className="mt-5 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pickup_address" className="block text-sm font-medium text-slate-700 mb-1">Adresse de retrait</label>
                <input id="pickup_address" required value={form.pickup_address} onChange={update('pickup_address')} placeholder="Ex: Marché Dantokpa, Cotonou" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <div className="mt-2">
                  <LocationPicker value={pickupPos} onChange={setPickupPos} height={180} />
                </div>
              </div>
              <div>
                <label htmlFor="dropoff_address" className="block text-sm font-medium text-slate-700 mb-1">Adresse de livraison</label>
                <input id="dropoff_address" required value={form.dropoff_address} onChange={update('dropoff_address')} placeholder="Ex: Fidjrossè, Cotonou" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <div className="mt-2">
                  <LocationPicker value={dropoffPos} onChange={setDropoffPos} height={180} />
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="recipient_name" className="block text-sm font-medium text-slate-700 mb-1">Nom du destinataire</label>
                <input id="recipient_name" required value={form.recipient_name} onChange={update('recipient_name')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label htmlFor="recipient_phone" className="block text-sm font-medium text-slate-700 mb-1">Téléphone du destinataire</label>
                <input id="recipient_phone" required type="tel" value={form.recipient_phone} onChange={update('recipient_phone')} placeholder="+229 XX XX XX XX" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="package_description" className="block text-sm font-medium text-slate-700 mb-1">Description du colis</label>
                <input id="package_description" value={form.package_description} onChange={update('package_description')} placeholder="Ex: Documents, vêtements..." className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label htmlFor="package_size" className="block text-sm font-medium text-slate-700 mb-1">Taille du colis</label>
                <select id="package_size" value={form.package_size} onChange={update('package_size')} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="petit">Petit</option>
                  <option value="moyen">Moyen</option>
                  <option value="grand">Grand</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-800">Prix (tarif fixe par zone)</span>
                <span className="text-lg font-bold text-orange-700">
                  {estimating ? '...' : estimation ? `${estimation.price} FCFA` : 'Placez les points sur la carte'}
                </span>
              </div>
              {estimation && !estimating && (
                <div className="flex gap-2 flex-wrap items-center">
                  <ZoneBadge zone={estimation.zone} />
                  <DelaiBadge delaiGaranti={estimation.delaiGaranti} />
                  {estimation.distance_km != null && (
                    <span className="text-xs text-orange-700/70">≈ {estimation.distance_km} km par la route</span>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

            <button disabled={submitting} type="submit" className="w-full rounded-lg bg-orange-500 text-white font-semibold py-2.5 hover:bg-orange-600 transition disabled:opacity-60">
              {submitting ? 'Envoi...' : 'Demander la livraison'}
            </button>
          </form>
        )}

        {tab === 'mes-livraisons' && (
          <div className="mt-5 space-y-3">
            {loadingList && <p className="text-slate-400 text-sm">Chargement...</p>}
            {!loadingList && deliveries.length === 0 && (
              <p className="text-slate-400 text-sm bg-white rounded-xl p-6 border border-slate-100 text-center">Aucune livraison pour le moment.</p>
            )}
            {deliveries.map((d) => (
              <Link key={d.id} to={`/client/livraisons/${d.id}`} className="block bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-orange-200 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{d.pickup_address} → {d.dropoff_address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(d.created_at).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-semibold text-slate-900">{d.price} FCFA</p>
                    <div className="mt-1 flex gap-1 justify-end flex-wrap">
                      <StatusBadge status={d.status} />
                      <PaymentBadge status={d.payment_status} />
                      {!d.delai_garanti && <DelaiBadge delaiGaranti={false} />}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
