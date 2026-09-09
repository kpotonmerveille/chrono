import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
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
};

const SIZES = [
  { key: 'petit', label: 'Petit' },
  { key: 'moyen', label: 'Moyen' },
  { key: 'grand', label: 'Grand' },
];

export default function NewDeliveryScreen({ navigation }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pickupPos, setPickupPos] = useState(null);
  const [dropoffPos, setDropoffPos] = useState(null);
  const [estimation, setEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Estimation de prix en direct dès que les deux points sont placés, avec un
  // debounce de 400ms (même comportement que frontend/src/pages/client/ClientDashboard.jsx).
  useEffect(() => {
    if (!pickupPos || !dropoffPos) {
      setEstimation(null);
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
      } catch {
        /* ignore, l'utilisateur peut réessayer en repositionnant les points */
      } finally {
        setEstimating(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pickupPos, dropoffPos]);

  async function handleSubmit() {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        pickup_lat: pickupPos?.latitude,
        pickup_lng: pickupPos?.longitude,
        dropoff_lat: dropoffPos?.latitude,
        dropoff_lng: dropoffPos?.longitude,
      };
      const res = await api.post('/deliveries', payload);
      setSuccess('Demande créée ! Vous pouvez maintenant la payer et suivre la course.');
      setForm(EMPTY_FORM);
      setPickupPos(null);
      setDropoffPos(null);
      setEstimation(null);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Nouvelle livraison</Text>

          <View style={styles.section}>
            <TextField
              label="Adresse de retrait"
              value={form.pickup_address}
              onChangeText={(v) => update('pickup_address', v)}
              placeholder="Ex: Marché Dantokpa, Cotonou"
            />
            <View style={{ marginTop: 8 }}>
              <LocationPickerMap value={pickupPos} onChange={setPickupPos} height={160} />
            </View>
          </View>

          <View style={styles.section}>
            <TextField
              label="Adresse de livraison"
              value={form.dropoff_address}
              onChangeText={(v) => update('dropoff_address', v)}
              placeholder="Ex: Fidjrossè, Cotonou"
            />
            <View style={{ marginTop: 8 }}>
              <LocationPickerMap value={dropoffPos} onChange={setDropoffPos} height={160} />
            </View>
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

          <View style={styles.priceBox}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Prix (tarif fixe par zone)</Text>
              <Text style={styles.priceValue}>
                {estimating ? '...' : estimation ? `${estimation.price} FCFA` : 'Placez les points sur la carte'}
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
  sizeRow: { flexDirection: 'row', gap: 8 },
  sizeChip: { flex: 1, borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  sizeChipActive: { backgroundColor: colors.orange500, borderColor: colors.orange500 },
  sizeChipText: { fontSize: 13, fontWeight: '600', color: colors.slate600 },
  sizeChipTextActive: { color: colors.white },
  priceBox: { backgroundColor: colors.orange50, borderWidth: 1, borderColor: colors.orange100, borderRadius: radius.lg, padding: 14, gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontSize: 13, color: colors.amber800 },
  priceValue: { fontSize: 17, fontWeight: '800', color: colors.orange700 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  distanceText: { fontSize: 11, color: colors.orange700 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
  success: { color: colors.green700, backgroundColor: colors.green50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
});
