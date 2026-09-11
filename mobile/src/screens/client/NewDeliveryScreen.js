import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import TextField from '../../components/TextField';
import PrimaryButton from '../../components/PrimaryButton';
import LocationPickerMap from '../../components/LocationPickerMap';
import { ZoneBadge, DelaiBadge } from '../../components/Badge';

const EMPTY_FORM = {
  pickup_address: '',
  dropoff_address: '',
  recipient_name: '',
  recipient_phone: '',
  package_description: '',
  package_size: 'petit',
  payer_type: 'expediteur',
  insured: false,
  join_group: false,
  pay_with_wallet: false,
};

const SIZES = [
  { key: 'petit', label: 'Petit' },
  { key: 'moyen', label: 'Moyen' },
  { key: 'grand', label: 'Grand' },
];

export default function NewDeliveryScreen({ navigation }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pickupPos, setPickupPos] = useState(null);
  const [dropoffPos, setDropoffPos] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [groupCandidate, setGroupCandidate] = useState(null);
  const [floodWarnings, setFloodWarnings] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/payments/wallet').then((res) => setWallet(res.data)).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // "Chrono Pro" : préremplit l'adresse de retrait avec la boutique du
  // commerçant (renseignée depuis le site web, voir Mon compte côté web) —
  // équivalent mobile du bouton "🏪 Ma boutique" de ClientDashboard.jsx.
  function useShopAsPickup() {
    if (!user?.merchant_pickup_address) return;
    update('pickup_address', user.merchant_pickup_address);
    if (user.merchant_pickup_lat != null && user.merchant_pickup_lng != null) {
      setPickupPos({ latitude: user.merchant_pickup_lat, longitude: user.merchant_pickup_lng });
    }
  }

  // Estimation de prix en direct dès que les deux points sont placés, avec un
  // debounce de 400ms (même comportement que frontend/src/pages/client/ClientDashboard.jsx).
  useEffect(() => {
    if (!pickupPos || !dropoffPos) {
      setEstimation(null);
      setGroupCandidate(null);
      setFloodWarnings([]);
      return undefined;
    }
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.post('/deliveries/estimer', {
          pickup_lat: pickupPos.latitude,
          pickup_lng: pickupPos.longitude,
          dropoff_lat: dropoffPos.latitude,
          dropoff_lng: dropoffPos.longitude,
        });
        setEstimation(res.data);
        try {
          const groupRes = await api.get('/deliveries/groupable', {
            params: { zone: res.data.zone, pickup_lat: pickupPos.latitude, pickup_lng: pickupPos.longitude },
          });
          setGroupCandidate(groupRes.data.candidate);
          if (!groupRes.data.candidate) update('join_group', false);
        } catch { setGroupCandidate(null); }
      } catch {
        /* ignore, l'utilisateur peut réessayer en repositionnant les points */
      } finally {
        setEstimating(false);
      }
      try {
        const floodRes = await api.get('/inondations/proximite', {
          params: {
            pickup_lat: pickupPos.latitude, pickup_lng: pickupPos.longitude,
            dropoff_lat: dropoffPos.latitude, dropoff_lng: dropoffPos.longitude,
          },
        });
        setFloodWarnings(floodRes.data.alertes);
      } catch { setFloodWarnings([]); }
    }, 400);
    return () => clearTimeout(timer);
  }, [pickupPos, dropoffPos]);

  async function handleSubmit() {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { join_group, pay_with_wallet, ...rest } = form;
      const payload = {
        ...rest,
        pickup_lat: pickupPos?.latitude,
        pickup_lng: pickupPos?.longitude,
        dropoff_lat: dropoffPos?.latitude,
        dropoff_lng: dropoffPos?.longitude,
        join_group_delivery_id: join_group && groupCandidate ? groupCandidate.delivery_id : undefined,
        payment_method: pay_with_wallet && form.payer_type === 'expediteur' ? 'wallet' : undefined,
      };
      const res = await api.post('/deliveries', payload);
      setSuccess('Demande créée ! Vous pouvez maintenant la payer et suivre la course.');
      setForm(EMPTY_FORM);
      setPickupPos(null);
      setDropoffPos(null);
      setEstimation(null);
      setGroupCandidate(null);
      setFloodWarnings([]);
      if (pay_with_wallet) api.get('/payments/wallet').then((r) => setWallet(r.data)).catch(() => {});
      // On bascule vers l'onglet "Mes livraisons" et on ouvre directement le
      // détail de la course qui vient d'être créée.
      navigation.navigate('MesLivraisonsTab', { screen: 'DeliveryDetail', params: { id: res.data.delivery.id } });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = form.pickup_address && form.dropoff_address && form.recipient_name && form.recipient_phone;
  const groupDiscount = form.join_group && groupCandidate ? groupCandidate.discount_fcfa : 0;
  const displayedPrice = estimation
    ? Math.max(0, (form.insured ? estimation.price_avec_assurance : estimation.price) - groupDiscount)
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Nouvelle livraison</Text>

          <View style={styles.section}>
            <TextField
              label="Adresse ou repère de retrait"
              value={form.pickup_address}
              onChangeText={(v) => update('pickup_address', v)}
              placeholder="Ex: Marché Dantokpa, ou « en face de la pharmacie »"
            />
            {!!user?.is_merchant && (
              <TouchableOpacity onPress={useShopAsPickup} style={styles.quickFillChip} activeOpacity={0.8}>
                <Text style={styles.quickFillText}>🏪 Ma boutique</Text>
              </TouchableOpacity>
            )}
            <View style={{ marginTop: 8 }}>
              <LocationPickerMap value={pickupPos} onChange={setPickupPos} height={160} />
            </View>
          </View>

          <View style={styles.section}>
            <TextField
              label="Adresse ou repère de livraison"
              value={form.dropoff_address}
              onChangeText={(v) => update('dropoff_address', v)}
              placeholder="Ex: Fidjrossè, ou « portail bleu après le pont »"
            />
            <View style={{ marginTop: 8 }}>
              <LocationPickerMap value={dropoffPos} onChange={setDropoffPos} height={160} />
            </View>
            <Text style={styles.helperText}>
              Pas d'adresse précise ? Une fois la demande créée, joignez une courte note vocale pour guider le livreur.
            </Text>
          </View>

          <View style={styles.section}>
            <TextField
              label="Nom du destinataire"
              value={form.recipient_name}
              onChangeText={(v) => update('recipient_name', v)}
            />
            <TextField
              label="Téléphone du destinataire"
              value={form.recipient_phone}
              onChangeText={(v) => update('recipient_phone', v)}
              placeholder="+229 XX XX XX XX"
              keyboardType="phone-pad"
              style={{ marginTop: 12 }}
            />
          </View>

          <View style={styles.section}>
            <TextField
              label="Description du colis"
              value={form.package_description}
              onChangeText={(v) => update('package_description', v)}
              placeholder="Ex: Documents, vêtements..."
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Taille du colis</Text>
            <View style={styles.sizeRow}>
              {SIZES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => update('package_size', s.key)}
                  style={[styles.sizeChip, form.package_size === s.key && styles.sizeChipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sizeChipText, form.package_size === s.key && styles.sizeChipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Qui paie la livraison ?</Text>
            <View style={styles.sizeRow}>
              <TouchableOpacity
                onPress={() => update('payer_type', 'expediteur')}
                style={[styles.payerChip, form.payer_type === 'expediteur' && styles.payerChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.payerChipText, form.payer_type === 'expediteur' && styles.payerChipTextActive]}>
                  Moi (expéditeur)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => update('payer_type', 'destinataire')}
                style={[styles.payerChip, form.payer_type === 'destinataire' && styles.payerChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.payerChipText, form.payer_type === 'destinataire' && styles.payerChipTextActive]}>
                  Le destinataire
                </Text>
              </TouchableOpacity>
            </View>
            {form.payer_type === 'destinataire' && (
              <Text style={styles.helperText}>Le destinataire paiera via le lien de suivi que vous lui partagerez.</Text>
            )}

            <View style={styles.insuranceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Garantie colis</Text>
                <Text style={styles.helperText}>
                  Assurer ce colis {estimation ? `(+${estimation.insurance_fee} FCFA)` : ''} — remboursé s'il est cassé ou perdu
                </Text>
              </View>
              <Switch
                value={form.insured}
                onValueChange={(v) => update('insured', v)}
                trackColor={{ false: colors.slate300, true: colors.orange400 }}
                thumbColor={colors.white}
              />
            </View>
          </View>

          {floodWarnings.length > 0 && (
            <View style={styles.floodBanner}>
              {floodWarnings.map((a) => (
                <Text key={a.id} style={styles.floodBannerText}>
                  🌊 <Text style={{ fontWeight: '800' }}>Route potentiellement inondée</Text> près du point{' '}
                  {a.near_pickup && a.near_dropoff ? 'de retrait et de livraison' : a.near_pickup ? 'de retrait' : 'de livraison'}
                  {a.description ? ` — ${a.description}` : ''} (signalé par {a.reporter_role === 'livreur' ? 'un livreur' : 'un client'}).
                </Text>
              ))}
            </View>
          )}

          {groupCandidate && (
            <TouchableOpacity
              onPress={() => update('join_group', !form.join_group)}
              style={[styles.groupBanner, form.join_group && styles.groupBannerActive]}
              activeOpacity={0.85}
            >
              <Text style={styles.groupBannerText}>
                🔗 <Text style={{ fontWeight: '800' }}>Livraison compagnon disponible</Text> près de « {groupCandidate.pickup_address} » — rejoignez-la et économisez{' '}
                <Text style={{ fontWeight: '800' }}>{groupCandidate.discount_fcfa} FCFA</Text>.
              </Text>
              <View style={[styles.checkbox, form.join_group && styles.checkboxChecked]}>
                {form.join_group ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
            </TouchableOpacity>
          )}

          {form.payer_type === 'expediteur' && wallet && wallet.balance > 0 && (
            <TouchableOpacity
              onPress={() => update('pay_with_wallet', !form.pay_with_wallet)}
              disabled={displayedPrice != null && wallet.balance < displayedPrice}
              style={[styles.walletBanner, form.pay_with_wallet && styles.walletBannerActive]}
              activeOpacity={0.85}
            >
              <Text style={styles.walletBannerText}>
                💰 Payer maintenant avec mon solde Chrono ({wallet.balance} FCFA disponible)
                {displayedPrice != null && wallet.balance < displayedPrice ? ' — solde insuffisant' : ''}
              </Text>
              <View style={[styles.checkbox, form.pay_with_wallet && styles.checkboxChecked]}>
                {form.pay_with_wallet ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.priceBox}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Prix (tarif fixe par zone{form.insured ? ' + garantie' : ''}{groupDiscount ? ' − réduction groupée' : ''})</Text>
              <Text style={styles.priceValue}>
                {estimating ? '...' : displayedPrice ? `${displayedPrice} FCFA` : 'Placez les points sur la carte'}
              </Text>
            </View>
            {estimation && !estimating && (
              <View style={styles.badgeRow}>
                <ZoneBadge zone={estimation.zone} />
                <DelaiBadge delaiGaranti={estimation.delaiGaranti} />
                {estimation.distance_km != null && (
                  <Text style={styles.distanceText}>≈ {estimation.distance_km} km par la route</Text>
                )}
              </View>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <PrimaryButton
            title={submitting ? 'Envoi...' : 'Demander la livraison'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            style={{ marginTop: 4 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900 },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate100,
    padding: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 5 },
  helperText: { fontSize: 11, color: colors.slate400, marginTop: 4 },
  quickFillChip: { alignSelf: 'flex-start', backgroundColor: colors.orange50, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8 },
  quickFillText: { fontSize: 12, fontWeight: '600', color: colors.orange700 },
  payerChip: { flex: 1, borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  payerChipActive: { backgroundColor: colors.orange50, borderColor: colors.orange400 },
  payerChipText: { fontSize: 13, fontWeight: '600', color: colors.slate600 },
  payerChipTextActive: { color: colors.orange700 },
  insuranceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.slate100 },
  sizeRow: { flexDirection: 'row', gap: 8 },
  sizeChip: { flex: 1, borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  sizeChipActive: { backgroundColor: colors.orange500, borderColor: colors.orange500 },
  sizeChipText: { fontSize: 13, fontWeight: '600', color: colors.slate600 },
  sizeChipTextActive: { color: colors.white },
  floodBanner: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: radius.lg, padding: 12, gap: 6 },
  floodBannerText: { fontSize: 12.5, color: '#0c4a6e', lineHeight: 18 },
  groupBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: radius.lg, padding: 12 },
  groupBannerActive: { backgroundColor: '#e0e7ff', borderColor: '#a5b4fc' },
  groupBannerText: { flex: 1, fontSize: 12.5, color: '#3730a3' },
  walletBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.slate50, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.lg, padding: 12 },
  walletBannerActive: { backgroundColor: colors.emerald50, borderColor: '#6ee7b7' },
  walletBannerText: { flex: 1, fontSize: 12.5, color: colors.slate600 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.slate300, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.orange500, borderColor: colors.orange500 },
  checkboxMark: { color: colors.white, fontSize: 13, fontWeight: '800' },
  priceBox: { backgroundColor: colors.orange50, borderWidth: 1, borderColor: colors.orange100, borderRadius: radius.lg, padding: 14, gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontSize: 13, color: colors.amber800 },
  priceValue: { fontSize: 17, fontWeight: '800', color: colors.orange700 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  distanceText: { fontSize: 11, color: colors.orange700 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
  success: { color: colors.green700, backgroundColor: colors.green50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
});
