import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../../lib/api';
import Navbar from '../../components/Navbar';
import StatusBadge, { PaymentBadge } from '../../components/StatusBadge';
import ZoneBadge, { DelaiBadge } from '../../components/ZoneBadge';
import LocationPicker from '../../components/LocationPicker';
import FloodAlertPanel from '../../components/FloodAlertPanel';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = {
  pickup_address: '', dropoff_address: '',
  recipient_name: '', recipient_phone: '',
  package_description: '', package_size: 'petit',
  payer_type: 'expediteur', insured: false,
  join_group: false, pay_with_wallet: false,
};

export default function ClientDashboard() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('nouvelle');
  const [deliveries, setDeliveries] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [addresses, setAddresses] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [pickupPos, setPickupPos] = useState(null);
  const [dropoffPos, setDropoffPos] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [groupCandidate, setGroupCandidate] = useState(null);
  const [floodWarnings, setFloodWarnings] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [wallet, setWallet] = useState(null);

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

  async function loadAddresses() {
    try {
      const res = await api.get('/users/me/adresses');
      setAddresses(res.data.adresses);
    } catch { /* ignore */ }
  }

  async function loadWallet() {
    try {
      const res = await api.get('/payments/wallet');
      setWallet(res.data);
    } catch { /* ignore */ }
  }

  useEffect(() => { loadDeliveries(); loadAddresses(); loadWallet(); }, []);

  useEffect(() => {
    if (!pickupPos || !dropoffPos) { setEstimation(null); setGroupCandidate(null); setFloodWarnings([]); return; }
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/deliveries/estimer', {
          pickup_lat: pickupPos[0], pickup_lng: pickupPos[1],
          dropoff_lat: dropoffPos[0], dropoff_lng: dropoffPos[1],
        });
        setEstimation(res.data);
        try {
          const groupRes = await api.get('/deliveries/groupable', {
            params: { zone: res.data.zone, pickup_lat: pickupPos[0], pickup_lng: pickupPos[1] },
          });
          setGroupCandidate(groupRes.data.candidate);
          if (!groupRes.data.candidate) setForm((f) => ({ ...f, join_group: false }));
        } catch { setGroupCandidate(null); }
      } catch { /* ignore */ } finally { setEstimating(false); }
      try {
        const floodRes = await api.get('/inondations/proximite', {
          params: {
            pickup_lat: pickupPos[0], pickup_lng: pickupPos[1],
            dropoff_lat: dropoffPos[0], dropoff_lng: dropoffPos[1],
          },
        });
        setFloodWarnings(floodRes.data.alertes);
      } catch { setFloodWarnings([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [pickupPos, dropoffPos]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function useShopAsPickup() {
    if (!user.merchant_pickup_address) return;
    setForm((f) => ({ ...f, pickup_address: user.merchant_pickup_address }));
    if (user.merchant_pickup_lat != null && user.merchant_pickup_lng != null) {
      setPickupPos([user.merchant_pickup_lat, user.merchant_pickup_lng]);
    }
  }

  function useSavedAddress(adresse, point) {
    if (point === 'pickup') {
      setForm((f) => ({ ...f, pickup_address: adresse.address }));
      if (adresse.lat != null && adresse.lng != null) setPickupPos([adresse.lat, adresse.lng]);
    } else {
      setForm((f) => ({ ...f, dropoff_address: adresse.address }));
      if (adresse.lat != null && adresse.lng != null) setDropoffPos([adresse.lat, adresse.lng]);
    }
  }

  const groupDiscount = form.join_group && groupCandidate ? groupCandidate.discount_fcfa : 0;
  const displayedPrice = estimation
    ? Math.max(0, (form.insured ? estimation.price_avec_assurance : estimation.price) - groupDiscount)
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { join_group, pay_with_wallet, ...rest } = form;
      const payload = {
        ...rest,
        pickup_lat: pickupPos?.[0], pickup_lng: pickupPos?.[1],
        dropoff_lat: dropoffPos?.[0], dropoff_lng: dropoffPos?.[1],
        join_group_delivery_id: join_group && groupCandidate ? groupCandidate.delivery_id : undefined,
        payment_method: pay_with_wallet && form.payer_type === 'expediteur' ? 'wallet' : undefined,
      };
      const res = await api.post('/deliveries', payload);
      const msg = res.data.group_join_failed
        ? 'Demande créée ! (La livraison compagnon n\'était plus disponible — prix normal appliqué.) Rendez-vous dans "Mes livraisons" pour payer et suivre la course.'
        : 'Demande créée ! Rendez-vous dans "Mes livraisons" pour payer et suivre la course.';
      setSuccess(msg);
      setForm(EMPTY_FORM);
      setPickupPos(null);
      setDropoffPos(null);
      setEstimation(null);
      setGroupCandidate(null);
      setFloodWarnings([]);
      loadDeliveries();
      if (pay_with_wallet) loadWallet();
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

        <div className="mt-4 flex gap-2 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
          {[
            { key: 'nouvelle', label: 'Nouvelle livraison' },
            { key: 'mes-livraisons', label: `Mes livraisons (${deliveries.length})` },
            { key: 'portefeuille', label: `💰 Portefeuille${wallet ? ` (${wallet.balance} F)` : ''}` },
            { key: 'inondations', label: '🌊 Routes' },
            { key: 'compte', label: 'Mon compte' },
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
                <label htmlFor="pickup_address" className="block text-sm font-medium text-slate-700 mb-1">Adresse ou repère de retrait</label>
                <input id="pickup_address" required value={form.pickup_address} onChange={update('pickup_address')} placeholder="Ex: Marché Dantokpa, ou « en face de la pharmacie du carrefour »" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  {!!user?.is_merchant && (
                    <button type="button" onClick={useShopAsPickup} className="text-xs px-2 py-1 rounded-md bg-orange-50 text-orange-700 hover:bg-orange-100 transition">🏪 Ma boutique</button>
                  )}
                  {addresses.map((a) => (
                    <button key={a.id} type="button" onClick={() => useSavedAddress(a, 'pickup')} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition">📍 {a.label}</button>
                  ))}
                </div>
                <div className="mt-2">
                  <LocationPicker value={pickupPos} onChange={setPickupPos} height={180} />
                </div>
              </div>
              <div>
                <label htmlFor="dropoff_address" className="block text-sm font-medium text-slate-700 mb-1">Adresse ou repère de livraison</label>
                <input id="dropoff_address" required value={form.dropoff_address} onChange={update('dropoff_address')} placeholder="Ex: Fidjrossè, ou « portail bleu après le pont »" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  {addresses.map((a) => (
                    <button key={a.id} type="button" onClick={() => useSavedAddress(a, 'dropoff')} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition">📍 {a.label}</button>
                  ))}
                </div>
                <div className="mt-2">
                  <LocationPicker value={dropoffPos} onChange={setDropoffPos} height={180} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Pas d'adresse précise ? Une fois la demande créée, vous pourrez joindre une courte note vocale pour guider le livreur.</p>
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

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1">Qui paie la livraison ?</span>
                <div className="flex gap-2">
                  <label className={`flex-1 text-sm rounded-lg border px-3 py-2 cursor-pointer text-center transition ${form.payer_type === 'expediteur' ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium' : 'border-slate-300 text-slate-600'}`}>
                    <input type="radio" name="payer_type" value="expediteur" checked={form.payer_type === 'expediteur'} onChange={update('payer_type')} className="sr-only" />
                    Moi (expéditeur)
                  </label>
                  <label className={`flex-1 text-sm rounded-lg border px-3 py-2 cursor-pointer text-center transition ${form.payer_type === 'destinataire' ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium' : 'border-slate-300 text-slate-600'}`}>
                    <input type="radio" name="payer_type" value="destinataire" checked={form.payer_type === 'destinataire'} onChange={update('payer_type')} className="sr-only" />
                    Le destinataire
                  </label>
                </div>
                {form.payer_type === 'destinataire' && (
                  <p className="text-xs text-slate-400 mt-1">Le destinataire paiera via le lien de suivi que vous lui partagerez.</p>
                )}
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1">Garantie colis</span>
                <label className="flex items-center gap-2 text-sm rounded-lg border border-slate-300 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={form.insured} onChange={(e) => setForm((f) => ({ ...f, insured: e.target.checked }))} className="rounded" />
                  <span>Assurer ce colis {estimation ? `(+${estimation.insurance_fee} FCFA)` : ''} — remboursé s'il est cassé ou perdu</span>
                </label>
              </div>
            </div>

            {floodWarnings.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 space-y-1">
                {floodWarnings.map((a) => (
                  <p key={a.id} className="text-sm text-sky-900">
                    🌊 <strong>Route potentiellement inondée</strong> près du point{' '}
                    {a.near_pickup && a.near_dropoff ? 'de retrait et de livraison' : a.near_pickup ? 'de retrait' : 'de livraison'}
                    {a.description ? ` — ${a.description}` : ''} (signalé par {a.reporter_role === 'livreur' ? 'un livreur' : 'un client'}).
                  </p>
                ))}
              </div>
            )}

            {groupCandidate && (
              <label className="flex items-start gap-2 text-sm rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={form.join_group} onChange={(e) => setForm((f) => ({ ...f, join_group: e.target.checked }))} className="rounded mt-0.5" />
                <span className="text-indigo-900">
                  🔗 <strong>Livraison compagnon disponible</strong> près de « {groupCandidate.pickup_address} » — rejoignez-la et économisez{' '}
                  <strong>{groupCandidate.discount_fcfa} FCFA</strong> (un seul trajet livreur pour les deux colis).
                </span>
              </label>
            )}

            {form.payer_type === 'expediteur' && wallet && wallet.balance > 0 && (
              <label className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2.5 cursor-pointer ${form.pay_with_wallet ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                <input
                  type="checkbox"
                  checked={form.pay_with_wallet}
                  disabled={displayedPrice != null && wallet.balance < displayedPrice}
                  onChange={(e) => setForm((f) => ({ ...f, pay_with_wallet: e.target.checked }))}
                  className="rounded mt-0.5"
                />
                <span className={form.pay_with_wallet ? 'text-emerald-900' : 'text-slate-600'}>
                  💰 Payer maintenant avec mon solde Chrono ({wallet.balance} FCFA disponible)
                  {displayedPrice != null && wallet.balance < displayedPrice && ' — solde insuffisant pour cette course'}
                </span>
              </label>
            )}

            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-800">Prix (tarif fixe par zone{form.insured ? ' + garantie' : ''}{groupDiscount ? ' − réduction groupée' : ''})</span>
                <span className="text-lg font-bold text-orange-700">
                  {estimating ? '...' : displayedPrice != null ? `${displayedPrice} FCFA` : 'Placez les points sur la carte'}
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
                      {!!d.insured && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">🛡️ Assuré</span>}
                      {!!d.group_id && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">🔗 Groupée</span>}
                      {d.return_status === 'demande' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">↩️ Retour en cours</span>}
                      {d.return_status === 'retournee' && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">↩️ Retournée</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {tab === 'portefeuille' && (
          <WalletPanel wallet={wallet} onWalletChanged={loadWallet} />
        )}

        {tab === 'inondations' && <FloodAlertPanel user={user} />}

        {tab === 'compte' && (
          <MonCompte user={user} addresses={addresses} onAddressesChanged={loadAddresses} onMerchantUpdated={refreshUser} />
        )}
      </main>
    </div>
  );
}

const WALLET_TX_LABEL = {
  recharge: { text: 'Recharge', className: 'text-emerald-700' },
  debit: { text: 'Paiement livraison', className: 'text-slate-700' },
  remboursement: { text: 'Remboursement', className: 'text-indigo-700' },
};

function WalletPanel({ wallet, onWalletChanged }) {
  const [amount, setAmount] = useState('2000');
  const [method, setMethod] = useState('mtn_momo');
  const [momoNumber, setMomoNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function recharger(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum < 500) {
      setError('Montant minimum de recharge : 500 FCFA');
      return;
    }
    if (method !== 'carte' && !momoNumber) {
      setError('Numéro Mobile Money requis');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/payments/wallet/recharger', { amount: amountNum, method, momo_number: momoNumber || undefined });
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      setSuccess(`Portefeuille rechargé de ${amountNum} FCFA.`);
      await onWalletChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-900">Portefeuille Chrono</h2>
        <p className="text-sm text-slate-500 mt-1">
          Rechargez une fois, payez vos livraisons instantanément ensuite — pratique si vous envoyez plusieurs
          colis par jour (Chrono Pro).
        </p>
        <p className="text-3xl font-bold text-emerald-700 mt-4">{wallet ? wallet.balance : '...'} FCFA</p>

        <form onSubmit={recharger} className="mt-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wallet-amount" className="block text-sm font-medium text-slate-700 mb-1">Montant à recharger</label>
              <input id="wallet-amount" type="number" min={500} step={100} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label htmlFor="wallet-method" className="block text-sm font-medium text-slate-700 mb-1">Méthode</label>
              <select id="wallet-method" value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="mtn_momo">MTN Mobile Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="carte">Carte bancaire</option>
              </select>
            </div>
          </div>
          {method !== 'carte' && (
            <div>
              <label htmlFor="wallet-momo" className="block text-sm font-medium text-slate-700 mb-1">Numéro Mobile Money</label>
              <input id="wallet-momo" type="tel" value={momoNumber} onChange={(e) => setMomoNumber(e.target.value)} placeholder="+229 XX XX XX XX" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>}
          <button disabled={submitting} type="submit" className="rounded-lg bg-orange-500 text-white font-semibold px-4 py-2 hover:bg-orange-600 transition disabled:opacity-60 text-sm">
            {submitting ? 'Recharge...' : 'Recharger mon portefeuille'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-900">Historique</h2>
        <div className="mt-3 space-y-2">
          {(!wallet || wallet.transactions.length === 0) && <p className="text-sm text-slate-400">Aucune transaction pour le moment.</p>}
          {wallet?.transactions.map((t) => {
            const label = WALLET_TX_LABEL[t.type] || WALLET_TX_LABEL.recharge;
            const sign = t.type === 'debit' ? '−' : '+';
            return (
              <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className={`font-medium ${label.className}`}>{label.text}</p>
                  <p className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString('fr-FR')} {t.status !== 'reussie' ? `· ${t.status}` : ''}</p>
                </div>
                <span className={`font-semibold ${t.type === 'debit' ? 'text-slate-700' : 'text-emerald-700'}`}>{sign}{t.amount} FCFA</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonCompte({ user, addresses, onAddressesChanged, onMerchantUpdated }) {
  const [shopForm, setShopForm] = useState({ shop_name: user?.merchant_shop_name || '', pickup_address: user?.merchant_pickup_address || '' });
  const [shopPos, setShopPos] = useState(user?.merchant_pickup_lat != null ? [user.merchant_pickup_lat, user.merchant_pickup_lng] : null);
  const [savingShop, setSavingShop] = useState(false);
  const [shopError, setShopError] = useState('');
  const [shopSuccess, setShopSuccess] = useState('');

  const [addrForm, setAddrForm] = useState({ label: '', address: '' });
  const [addrPos, setAddrPos] = useState(null);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrError, setAddrError] = useState('');

  async function saveShop(e) {
    e.preventDefault();
    setShopError(''); setShopSuccess('');
    if (!shopForm.shop_name || !shopForm.pickup_address) {
      setShopError('Nom de la boutique et adresse requis');
      return;
    }
    setSavingShop(true);
    try {
      await api.patch('/users/me/commerce', {
        shop_name: shopForm.shop_name, pickup_address: shopForm.pickup_address,
        pickup_lat: shopPos?.[0], pickup_lng: shopPos?.[1],
      });
      setShopSuccess('Profil boutique enregistré — votre adresse est maintenant proposée en un clic dans "Nouvelle livraison".');
      await onMerchantUpdated();
    } catch (err) {
      setShopError(apiErrorMessage(err));
    } finally {
      setSavingShop(false);
    }
  }

  async function saveAddress(e) {
    e.preventDefault();
    setAddrError('');
    if (!addrForm.label || !addrForm.address) {
      setAddrError('Libellé et adresse requis');
      return;
    }
    setSavingAddr(true);
    try {
      await api.post('/users/me/adresses', { ...addrForm, lat: addrPos?.[0], lng: addrPos?.[1] });
      setAddrForm({ label: '', address: '' });
      setAddrPos(null);
      await onAddressesChanged();
    } catch (err) {
      setAddrError(apiErrorMessage(err));
    } finally {
      setSavingAddr(false);
    }
  }

  async function deleteAddress(id) {
    try {
      await api.delete(`/users/me/adresses/${id}`);
      await onAddressesChanged();
    } catch { /* ignore */ }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-900">Chrono Pro — profil commerçant</h2>
        <p className="text-sm text-slate-500 mt-1">
          Renseignez votre boutique une fois : son adresse de retrait sera ensuite proposée en un clic à chaque
          nouvelle livraison, au lieu de la retaper.
        </p>
        <form onSubmit={saveShop} className="mt-4 space-y-3">
          <div>
            <label htmlFor="shop_name" className="block text-sm font-medium text-slate-700 mb-1">Nom de la boutique</label>
            <input id="shop_name" value={shopForm.shop_name} onChange={(e) => setShopForm((f) => ({ ...f, shop_name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label htmlFor="shop_address" className="block text-sm font-medium text-slate-700 mb-1">Adresse de retrait</label>
            <input id="shop_address" value={shopForm.pickup_address} onChange={(e) => setShopForm((f) => ({ ...f, pickup_address: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="mt-2">
              <LocationPicker value={shopPos} onChange={setShopPos} height={160} />
            </div>
          </div>
          {shopError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{shopError}</p>}
          {shopSuccess && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{shopSuccess}</p>}
          <button disabled={savingShop} type="submit" className="rounded-lg bg-orange-500 text-white font-semibold px-4 py-2 hover:bg-orange-600 transition disabled:opacity-60 text-sm">
            {savingShop ? 'Enregistrement...' : 'Enregistrer ma boutique'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-900">Adresses favorites</h2>
        <p className="text-sm text-slate-500 mt-1">Fournisseurs, clients réguliers, domicile... pour ne plus les retaper.</p>
        <div className="mt-3 space-y-2">
          {addresses.length === 0 && <p className="text-sm text-slate-400">Aucune adresse enregistrée.</p>}
          {addresses.map((a) => (
            <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{a.label}</p>
                <p className="text-xs text-slate-500">{a.address}</p>
              </div>
              <button onClick={() => deleteAddress(a.id)} className="text-xs text-red-600 hover:underline">Supprimer</button>
            </div>
          ))}
        </div>
        <form onSubmit={saveAddress} className="mt-4 grid sm:grid-cols-2 gap-3">
          <input value={addrForm.label} onChange={(e) => setAddrForm((f) => ({ ...f, label: e.target.value }))} placeholder="Libellé (ex: Fournisseur tissu)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <input value={addrForm.address} onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))} placeholder="Adresse ou repère" className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <div className="sm:col-span-2">
            <LocationPicker value={addrPos} onChange={setAddrPos} height={140} />
          </div>
          {addrError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 sm:col-span-2">{addrError}</p>}
          <button disabled={savingAddr} type="submit" className="sm:col-span-2 rounded-lg bg-slate-800 text-white font-semibold px-4 py-2 hover:bg-slate-900 transition disabled:opacity-60 text-sm">
            {savingAddr ? 'Ajout...' : 'Ajouter cette adresse'}
          </button>
        </form>
      </div>
    </div>
  );
}
