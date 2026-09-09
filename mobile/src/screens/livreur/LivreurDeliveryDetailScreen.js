import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { PLATFORM_COMMISSION } from '../../lib/labels';
import TopBar from '../../components/TopBar';
import { StatusBadge, ZoneBadge, DelaiBadge } from '../../components/Badge';
import TrackingMap from '../../components/TrackingMap';
import PrimaryButton from '../../components/PrimaryButton';
import useLivePosition from '../../hooks/useLivePosition';
import useSendPosition from '../../hooks/useSendPosition';

const NEXT_STATUS = {
  acceptee: { key: 'recuperee', label: 'Marquer le colis comme récupéré' },
  recuperee: { key: 'en_route', label: 'Marquer en route vers le destinataire' },
};

export default function LivreurDeliveryDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/deliveries/${id}`);
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = !!delivery && ['acceptee', 'recuperee', 'en_route'].includes(delivery.status);

  // Envoie la position GPS du livreur en direct pendant la course (la
  // permission de localisation n'est demandée qu'à ce moment-là, pas au
  // lancement de l'app).
  const { permissionDenied } = useSendPosition(id, isActive);
  // Écoute aussi les mises à jour de statut poussées par le serveur (ex: le
  // client annule, ou le paiement change) pour garder l'écran synchronisé.
  useLivePosition(id, isActive, { withPosition: false, onUpdate: setDelivery });

  async function advanceStatus() {
    const next = NEXT_STATUS[delivery.status];
    if (!next) return;
    setUpdating(true);
    setError('');
    try {
      const res = await api.patch(`/deliveries/${id}/statut`, { statut: next.key });
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  async function confirmDelivery() {
    setCodeError('');
    setUpdating(true);
    try {
      const res = await api.post(`/deliveries/${id}/livrer`, { code });
      setDelivery(res.data.delivery);
    } catch (err) {
      setCodeError(apiErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar onBack={() => navigation.goBack()} />
        <Text style={styles.centerError}>{error}</Text>
      </SafeAreaView>
    );
  }
  if (!delivery) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.orange500} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const next = NEXT_STATUS[delivery.status];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.route}>
            {delivery.pickup_address} → {delivery.dropoff_address}
          </Text>
          <Text style={styles.subText}>
            Client: {delivery.client_name} · {delivery.client_phone}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <StatusBadge status={delivery.status} />
          <ZoneBadge zone={delivery.zone} />
          <DelaiBadge delaiGaranti={!!delivery.delai_garanti} />
        </View>

        <TrackingMap delivery={delivery} />
        {isActive && !permissionDenied && (
          <Text style={styles.smallHint}>📍 Votre position est partagée en direct avec le client pendant cette course.</Text>
        )}
        {isActive && permissionDenied && (
          <Text style={styles.warnHint}>
            ⚠️ Localisation refusée : le client ne peut pas suivre votre position. Autorisez la localisation dans les
            réglages de votre téléphone pour activer le suivi en direct.
          </Text>
        )}

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Destinataire</Text>
            <Text style={styles.infoValue}>
              {delivery.recipient_name} · {delivery.recipient_phone}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Colis</Text>
            <Text style={styles.infoValue}>
              {delivery.package_description || '—'} ({delivery.package_size})
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Ce que vous touchez</Text>
            <Text style={styles.infoValue}>
              {delivery.price - PLATFORM_COMMISSION} FCFA{' '}
              <Text style={styles.infoMuted}>
                (prix total {delivery.price} F, commission plateforme {PLATFORM_COMMISSION} F)
              </Text>
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {next && (
          <PrimaryButton title={updating ? 'Mise à jour...' : next.label} onPress={advanceStatus} loading={updating} />
        )}

        {delivery.status === 'en_route' && (
          <View style={styles.codePanel}>
            <Text style={styles.codeTitle}>Saisissez le code remis par le destinataire pour confirmer la livraison</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              maxLength={4}
              keyboardType="number-pad"
              placeholder="Code à 4 chiffres"
              placeholderTextColor={colors.slate400}
              style={styles.codeInput}
            />
            {codeError ? <Text style={{ color: colors.red600, fontSize: 13 }}>{codeError}</Text> : null}
            <PrimaryButton
              title={updating ? 'Vérification...' : 'Confirmer la livraison'}
              onPress={confirmDelivery}
              loading={updating}
              disabled={code.length !== 4}
            />
          </View>
        )}

        {delivery.status === 'livree' && (
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>✅ Livraison terminée avec succès !</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  centerError: { color: colors.red600, textAlign: 'center', marginTop: 40 },
  route: { fontSize: 17, fontWeight: '700', color: colors.slate900 },
  subText: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallHint: { fontSize: 11, color: colors.slate400, marginTop: -6 },
  warnHint: { fontSize: 11, color: colors.amber700, marginTop: -6 },
  infoGrid: { gap: 10 },
  infoBox: { backgroundColor: colors.slate100, borderRadius: radius.sm, padding: 12 },
  infoLabel: { fontSize: 12, color: colors.slate400 },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.slate800, marginTop: 2 },
  infoMuted: { color: colors.slate400, fontWeight: '400' },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
  codePanel: { backgroundColor: colors.indigo50, borderWidth: 1, borderColor: colors.indigo100, borderRadius: radius.lg, padding: 14, gap: 10 },
  codeTitle: { fontSize: 13, fontWeight: '600', color: colors.indigo900 },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.sm,
    paddingVertical: 12,
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '800',
    color: colors.indigo700,
    backgroundColor: colors.white,
  },
  doneBox: { backgroundColor: colors.green50, borderRadius: radius.sm, padding: 12, alignItems: 'center' },
  doneText: { color: colors.green700, fontWeight: '700', fontSize: 14 },
});
