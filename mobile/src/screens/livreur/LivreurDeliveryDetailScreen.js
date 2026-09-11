import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { API_URL, TOKEN_KEY, apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { PLATFORM_COMMISSION } from '../../lib/labels';
import TopBar from '../../components/TopBar';
import { StatusBadge, ZoneBadge, DelaiBadge, Badge } from '../../components/Badge';
import TrackingMap from '../../components/TrackingMap';
import PrimaryButton from '../../components/PrimaryButton';
import useLivePosition from '../../hooks/useLivePosition';
import useSendPosition from '../../hooks/useSendPosition';

const NEXT_STATUS = {
  acceptee: { key: 'recuperee', label: 'Marquer le colis comme récupéré' },
  recuperee: { key: 'en_route', label: 'Marquer en route vers le destinataire' },
};

// Lecture d'une note vocale laissée par le client (repère, instructions) —
// téléchargée dans le cache local (authentification requise) avant lecture,
// équivalent mobile de VoiceNotePlayer dans
// frontend/src/pages/livreur/LivreurDeliveryDetail.jsx.
function VoiceNotePlayer({ deliveryId, point, label, existingPath }) {
  const [localUri, setLocalUri] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const player = useAudioPlayer(localUri || undefined);

  useEffect(() => {
    if (!existingPath) { setLocalUri(null); return undefined; }
    let cancelled = false;
    async function downloadNote() {
      setDownloading(true);
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const dest = `${FileSystem.cacheDirectory}note-${deliveryId}-${point}.m4a`;
        const result = await FileSystem.downloadAsync(`${API_URL}/deliveries/${deliveryId}/note-vocale/${point}`, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!cancelled) setLocalUri(result.uri);
      } catch {
        /* silencieux : le livreur peut relancer en rechargeant l'écran */
      } finally {
        if (!cancelled) setDownloading(false);
      }
    }
    downloadNote();
    return () => { cancelled = true; };
  }, [deliveryId, point, existingPath]);

  if (!existingPath) return null;

  return (
    <View style={styles.voiceBox}>
      <Text style={styles.voiceLabel}>🎙️ {label}</Text>
      {downloading ? (
        <ActivityIndicator color={colors.indigo600} />
      ) : (
        <TouchableOpacity onPress={() => player.play()} style={styles.playBtn} activeOpacity={0.85}>
          <Text style={styles.playBtnText}>▶️ Écouter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Retour destinataire : signaler que le destinataire refuse le colis, puis
// confirmer que le colis a bien été rapporté — équivalent mobile de
// ReturnPanel dans frontend/src/pages/livreur/LivreurDeliveryDetail.jsx. Les
// frais de retour se règlent en espèces (non intégrés à FedaPay).
function ReturnPanel({ delivery, onUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignal() {
    if (!reason.trim()) {
      setError('Le motif du refus est requis.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/retour`, { reason: reason.trim() });
      onUpdated(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/retour/termine`);
      onUpdated(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (delivery.return_status === 'demande') {
    return (
      <View style={styles.returnPanel}>
        <Text style={styles.returnTitle}>↩️ Retour en cours</Text>
        <Text style={styles.returnText}>Motif : {delivery.return_reason || '—'}</Text>
        <Text style={styles.returnText}>Frais de retour à percevoir en espèces : {delivery.return_fee} FCFA</Text>
        {error ? <Text style={{ color: colors.red600, fontSize: 13 }}>{error}</Text> : null}
        <PrimaryButton
          title={loading ? 'Mise à jour...' : 'Retour terminé (colis rapporté)'}
          onPress={handleFinish}
          loading={loading}
          variant="dark"
        />
      </View>
    );
  }

  if (!showForm) {
    return (
      <TouchableOpacity onPress={() => setShowForm(true)} style={styles.returnLinkBtn} activeOpacity={0.7}>
        <Text style={styles.returnLinkText}>↩️ Le destinataire refuse le colis</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.returnPanel}>
      <Text style={styles.returnTitle}>Motif du refus</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Ex : destinataire injoignable, colis refusé..."
        placeholderTextColor={colors.slate400}
        multiline
        style={styles.commentInput}
      />
      {error ? <Text style={{ color: colors.red600, fontSize: 13 }}>{error}</Text> : null}
      <PrimaryButton
        title={loading ? 'Envoi...' : 'Confirmer le retour'}
        onPress={handleSignal}
        loading={loading}
        variant="dark"
        disabled={!reason.trim()}
      />
    </View>
  );
}

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
          {delivery.group_size > 1 && <Badge label={`🔗 Groupée (${delivery.group_size} colis)`} bg="#f3e8ff" fg="#6b21a8" border="#e9d5ff" />}
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

        {(delivery.pickup_voice_note_path || delivery.dropoff_voice_note_path) && (
          <View style={{ gap: 10 }}>
            <VoiceNotePlayer deliveryId={delivery.id} point="retrait" label="Repère — retrait" existingPath={delivery.pickup_voice_note_path} />
            <VoiceNotePlayer deliveryId={delivery.id} point="livraison" label="Repère — livraison" existingPath={delivery.dropoff_voice_note_path} />
          </View>
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

        {next && delivery.return_status === 'aucun' && (
          <PrimaryButton title={updating ? 'Mise à jour...' : next.label} onPress={advanceStatus} loading={updating} />
        )}

        {delivery.status === 'en_route' && delivery.return_status === 'aucun' && (
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

        {['recuperee', 'en_route'].includes(delivery.status) && (
          <ReturnPanel delivery={delivery} onUpdated={setDelivery} />
        )}

        {delivery.status === 'livree' && (
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>✅ Livraison terminée avec succès !</Text>
          </View>
        )}

        {delivery.status === 'annulee' && delivery.return_status === 'retournee' && (
          <View style={styles.returnDoneBox}>
            <Text style={styles.returnDoneText}>↩️ Colis retourné à l'expéditeur.</Text>
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
  returnDoneBox: { backgroundColor: colors.slate100, borderRadius: radius.sm, padding: 12, alignItems: 'center' },
  returnDoneText: { color: colors.slate600, fontWeight: '600', fontSize: 13 },
  returnLinkBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  returnLinkText: { color: colors.red600, fontSize: 13, fontWeight: '600' },
  returnPanel: { backgroundColor: colors.red50, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.lg, padding: 14, gap: 10 },
  returnTitle: { fontSize: 13, fontWeight: '700', color: colors.red700 },
  returnText: { fontSize: 12.5, color: colors.red700 },
  commentInput: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, minHeight: 60, textAlignVertical: 'top', color: colors.slate900, backgroundColor: colors.white },
  voiceBox: { backgroundColor: colors.indigo50, borderRadius: radius.sm, padding: 12, gap: 8 },
  voiceLabel: { fontSize: 13, color: colors.indigo900 },
  playBtn: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.indigo100, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  playBtnText: { fontSize: 12, fontWeight: '700', color: colors.indigo700 },
});
