import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { STEPS } from '../../lib/labels';
import TopBar from '../../components/TopBar';
import { StatusBadge, PaymentBadge, ZoneBadge, DelaiBadge } from '../../components/Badge';
import TrackingMap from '../../components/TrackingMap';
import PrimaryButton from '../../components/PrimaryButton';
import useLivePosition from '../../hooks/useLivePosition';

function StepTimeline({ status }) {
  if (status === 'annulee') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.red50 }]}>
        <Text style={{ color: colors.red700, fontSize: 13 }}>Cette livraison a été annulée.</Text>
      </View>
    );
  }
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  return (
    <View style={styles.timeline}>
      {STEPS.map((s, idx) => (
        <View key={s.key} style={styles.timelineItem}>
          <View style={[styles.timelineDot, idx <= currentIdx && styles.timelineDotActive]}>
            <Text style={[styles.timelineDotText, idx <= currentIdx && styles.timelineDotTextActive]}>{idx + 1}</Text>
          </View>
          <Text style={[styles.timelineLabel, idx <= currentIdx && styles.timelineLabelActive]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const PAYMENT_METHODS = [
  { key: 'mtn_momo', label: 'MTN MoMo' },
  { key: 'moov_money', label: 'Moov Money' },
  { key: 'carte', label: 'Carte' },
];

function PayPanel({ delivery, onPaid, onNeedsPolling }) {
  const [method, setMethod] = useState('mtn_momo');
  const [momoNumber, setMomoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/payments/deliveries/${delivery.id}/payer`, {
        method,
        momo_number: momoNumber || undefined,
      });
      if (res.data.checkout_url) {
        // Paiement réel FedaPay : on ouvre la page de paiement hébergée dans
        // le navigateur du téléphone. La confirmation définitive arrive par
        // webhook côté serveur ; au retour, on relance un court polling pour
        // détecter le changement de statut sans attendre le prochain
        // rafraîchissement automatique.
        await WebBrowser.openBrowserAsync(res.data.checkout_url);
        onNeedsPolling();
      } else {
        // Mode simulateur (démo) : paiement immédiat.
        onPaid(res.data.delivery);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.payPanel}>
      <Text style={styles.payTitle}>Paiement requis avant l'attribution d'un livreur</Text>
      <View style={styles.methodRow}>
        {PAYMENT_METHODS.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => setMethod(m.key)}
            style={[styles.methodChip, method === m.key && styles.methodChipActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.methodChipText, method === m.key && styles.methodChipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {method !== 'carte' && (
        <TextInput
          value={momoNumber}
          onChangeText={setMomoNumber}
          placeholder="Numéro Mobile Money"
          placeholderTextColor={colors.slate400}
          keyboardType="phone-pad"
          style={styles.momoInput}
        />
      )}
      {error ? <Text style={{ color: colors.red600, fontSize: 13 }}>{error}</Text> : null}
      <PrimaryButton
        title={loading ? 'Paiement en cours...' : `Payer ${delivery.price} FCFA`}
        onPress={handlePay}
        loading={loading}
        disabled={method !== 'carte' && !momoNumber}
      />
      <Text style={styles.payHint}>
        Paiement sécurisé via FedaPay (Mobile Money / carte). La page de paiement s'ouvre dans votre navigateur.
      </Text>
    </View>
  );
}

function ReviewPanel({ delivery, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await api.post(`/deliveries/${delivery.id}/avis`, { rating, comment: comment || undefined });
      setSent(true);
      onDone?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={[styles.notice, { backgroundColor: colors.green50 }]}>
        <Text style={{ color: colors.green700, fontSize: 13, fontWeight: '600' }}>Merci pour votre avis !</Text>
      </View>
    );
  }

  return (
    <View style={styles.reviewPanel}>
      <Text style={styles.payTitle}>Notez votre livreur</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => setRating(n)}>
            <Text style={{ fontSize: 26, color: n <= rating ? '#fbbf24' : colors.slate200 }}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Un commentaire (optionnel)"
        placeholderTextColor={colors.slate400}
        multiline
        style={styles.commentInput}
      />
      {error ? <Text style={{ color: colors.red600, fontSize: 13 }}>{error}</Text> : null}
      <PrimaryButton title={loading ? 'Envoi...' : "Envoyer l'avis"} onPress={handleSubmit} loading={loading} variant="dark" />
    </View>
  );
}

export default function DeliveryDetailScreen({ route }) {
  const { id } = route.params;
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

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

  // Repli par polling toutes les 5s tant que la course n'est pas terminée
  // (au cas où le socket serait momentanément indisponible), en plus des
  // mises à jour temps réel reçues via useLivePosition ci-dessous.
  useEffect(() => {
    if (!delivery || ['livree', 'annulee'].includes(delivery.status)) return undefined;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [delivery, load]);

  const isTrackable = !!delivery && ['acceptee', 'recuperee', 'en_route'].includes(delivery.status);
  const livreurPosition = useLivePosition(id, isTrackable, { withPosition: true, onUpdate: setDelivery });

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await api.post(`/deliveries/${id}/annuler`);
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  // Après le retour du navigateur de paiement, on relance le statut de la
  // livraison toutes les 3s pendant 30s (la confirmation définitive arrive
  // par webhook côté serveur, donc pas toujours instantanée).
  async function pollAfterPayment() {
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await api.get(`/deliveries/${id}`);
        setDelivery(res.data.delivery);
        if (res.data.delivery.payment_status === 'paye') return;
      } catch {
        /* on retente au prochain tour */
      }
    }
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar />
        <Text style={styles.centerError}>{error}</Text>
      </SafeAreaView>
    );
  }
  if (!delivery) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar />
        <Text style={styles.centerMuted}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.route}>
              {delivery.pickup_address} → {delivery.dropoff_address}
            </Text>
            <Text style={styles.date}>{new Date(delivery.created_at).toLocaleString('fr-FR')}</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          <StatusBadge status={delivery.status} />
          <PaymentBadge status={delivery.payment_status} />
          <ZoneBadge zone={delivery.zone} />
          <DelaiBadge delaiGaranti={!!delivery.delai_garanti} />
        </View>

        <StepTimeline status={delivery.status} />

        <TrackingMap delivery={delivery} livreurPosition={livreurPosition} />

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Destinataire</Text>
            <Text style={styles.infoValue}>
              {delivery.recipient_name} · {delivery.recipient_phone}
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Prix</Text>
            <Text style={styles.infoValue}>
              {delivery.price} FCFA{delivery.distance_km ? ` · ${Math.round(delivery.distance_km * 10) / 10} km` : ''}
            </Text>
            {!delivery.delai_garanti && (
              <Text style={styles.warnText}>
                Zone longue distance : la livraison en 30 min n'est pas garantie sur ce trajet.
              </Text>
            )}
          </View>
          {delivery.livreur_name && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Livreur</Text>
              <Text style={styles.infoValue}>
                {delivery.livreur_name} · {delivery.livreur_phone}
                {delivery.livreur_rating ? ` · ⭐ ${delivery.livreur_rating}` : ''}
              </Text>
            </View>
          )}
        </View>

        {delivery.payment_status !== 'paye' && delivery.status === 'en_attente' && (
          <PayPanel delivery={delivery} onPaid={setDelivery} onNeedsPolling={pollAfterPayment} />
        )}

        {delivery.payment_status === 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
          <View style={styles.codeBox}>
            <Text style={styles.codeTitle}>Code de confirmation à remettre au livreur</Text>
            <Text style={styles.codeValue}>{delivery.confirmation_code}</Text>
            <Text style={styles.codeHint}>
              Communiquez ce code uniquement au moment de la remise réelle du colis, pour votre sécurité.
            </Text>
          </View>
        )}

        {['en_attente', 'acceptee'].includes(delivery.status) && (
          <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{cancelling ? 'Annulation...' : 'Annuler la livraison'}</Text>
          </TouchableOpacity>
        )}

        {delivery.status === 'livree' && <ReviewPanel delivery={delivery} onDone={load} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  centerError: { color: colors.red600, textAlign: 'center', marginTop: 40 },
  centerMuted: { color: colors.slate400, textAlign: 'center', marginTop: 40 },
  headerRow: { flexDirection: 'row' },
  route: { fontSize: 17, fontWeight: '700', color: colors.slate900 },
  date: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 8 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timelineDot: { height: 22, width: 22, borderRadius: 11, backgroundColor: colors.slate200, alignItems: 'center', justifyContent: 'center' },
  timelineDotActive: { backgroundColor: colors.orange500 },
  timelineDotText: { fontSize: 11, fontWeight: '700', color: colors.slate500 },
  timelineDotTextActive: { color: colors.white },
  timelineLabel: { fontSize: 12, color: colors.slate400 },
  timelineLabelActive: { color: colors.slate900, fontWeight: '600' },
  notice: { borderRadius: radius.md, padding: 12 },
  infoGrid: { gap: 10 },
  infoBox: { backgroundColor: colors.slate100, borderRadius: radius.sm, padding: 12 },
  infoLabel: { fontSize: 12, color: colors.slate400 },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.slate800, marginTop: 2 },
  warnText: { fontSize: 11, color: colors.amber700, marginTop: 4 },
  payPanel: { backgroundColor: colors.orange50, borderWidth: 1, borderColor: colors.orange100, borderRadius: radius.lg, padding: 14, gap: 10 },
  payTitle: { fontSize: 13, fontWeight: '700', color: '#7c2d12' },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodChip: { flex: 1, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.white },
  methodChipActive: { backgroundColor: colors.orange500, borderColor: colors.orange500 },
  methodChipText: { fontSize: 12, fontWeight: '600', color: colors.slate600 },
  methodChipTextActive: { color: colors.white },
  momoInput: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, backgroundColor: colors.white, color: colors.slate900 },
  payHint: { fontSize: 11, color: '#9a3412' },
  codeBox: { backgroundColor: colors.indigo50, borderWidth: 1, borderColor: colors.indigo100, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  codeTitle: { fontSize: 13, fontWeight: '600', color: colors.indigo900, textAlign: 'center' },
  codeValue: { fontSize: 34, fontWeight: '800', color: colors.indigo700, letterSpacing: 6, marginTop: 6 },
  codeHint: { fontSize: 11, color: colors.indigo700, textAlign: 'center', marginTop: 6 },
  cancelBtn: { alignSelf: 'center', paddingVertical: 6 },
  cancelText: { color: colors.red600, fontSize: 13, fontWeight: '600' },
  reviewPanel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate100, borderRadius: radius.lg, padding: 14, gap: 10 },
  commentInput: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, minHeight: 60, textAlignVertical: 'top', color: colors.slate900 },
});
