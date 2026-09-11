import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { API_URL, TOKEN_KEY, apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { STEPS } from '../../lib/labels';
import TopBar from '../../components/TopBar';
import { StatusBadge, PaymentBadge, ZoneBadge, DelaiBadge, Badge } from '../../components/Badge';
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

// Retour destinataire : le livreur a signalé un refus de réception —
// équivalent mobile du panneau rouge/gris de
// frontend/src/pages/client/DeliveryDetail.jsx. Les frais de retour se
// règlent en espèces auprès du livreur (non intégrés à FedaPay).
function ReturnStatusPanel({ delivery }) {
  if (delivery.return_status === 'demande') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.red50 }]}>
        <Text style={{ color: colors.red700, fontSize: 13, fontWeight: '700' }}>↩️ Retour en cours</Text>
        <Text style={{ color: colors.red700, fontSize: 12.5, marginTop: 4 }}>
          Le destinataire a refusé le colis. Motif : {delivery.return_reason || '—'}
        </Text>
        <Text style={{ color: colors.red700, fontSize: 12.5, marginTop: 4 }}>
          Frais de retour : {delivery.return_fee} FCFA, à régler en espèces au livreur.
        </Text>
      </View>
    );
  }
  if (delivery.return_status === 'retournee') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.slate100 }]}>
        <Text style={{ color: colors.slate600, fontSize: 13 }}>
          ↩️ Colis retourné à l'expéditeur — le destinataire avait refusé la réception.
        </Text>
      </View>
    );
  }
  return null;
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

// "Suivi sans app" : ouvre le sélecteur de partage natif (WhatsApp, SMS,
// etc.) avec le lien public de suivi — équivalent mobile de
// ShareTrackingPanel dans frontend/src/pages/client/DeliveryDetail.jsx.
function ShareTrackingPanel({ delivery }) {
  if (!delivery.share_token) return null;
  const url = `${API_URL.replace(/\/api\/?$/, '')}/suivi/${delivery.share_token}`;

  async function share() {
    try {
      await Share.share({ message: `Suivez votre colis Chrono en direct, sans app : ${url}` });
    } catch {
      /* l'utilisateur a annulé le partage, rien à faire */
    }
  }

  return (
    <View style={styles.sharePanel}>
      <Text style={styles.shareTitle}>📤 Partager le suivi (sans app, sans compte)</Text>
      <Text style={styles.shareHintText}>Envoyez ce lien au destinataire ou à un proche pour qu'il suive la course en direct.</Text>
      <TouchableOpacity onPress={share} style={styles.shareBtn} activeOpacity={0.85}>
        <Text style={styles.shareBtnText}>🔗 Partager le lien</Text>
      </TouchableOpacity>
    </View>
  );
}

// Enregistrement d'une note vocale (repère, instructions) via le micro du
// téléphone (expo-audio) — équivalent mobile de VoiceNoteRecorder dans
// frontend/src/pages/client/DeliveryDetail.jsx. La note existante (si
// présente) est téléchargée dans le cache local (authentification requise)
// avant lecture, car expo-audio joue depuis un fichier, pas depuis une
// requête HTTP protégée.
function VoiceNoteRecorder({ deliveryId, point, label, existingPath, onUploaded }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [localUri, setLocalUri] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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
        /* la note pourra être réécoutée après un rafraîchissement */
      } finally {
        if (!cancelled) setDownloading(false);
      }
    }
    downloadNote();
    return () => { cancelled = true; };
  }, [deliveryId, point, existingPath]);

  async function startRecording() {
    setError('');
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission requise', "L'accès au micro est nécessaire pour enregistrer une note vocale.");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError("Impossible d'accéder au micro.");
    }
  }

  async function stopRecording() {
    try {
      await recorder.stop();
      if (recorder.uri) await upload(recorder.uri);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function upload(uri) {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('note', { uri, name: `note-${point}.m4a`, type: 'audio/m4a' });
      await api.post(`/deliveries/${deliveryId}/note-vocale/${point}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLocalUri(uri);
      await onUploaded();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.voiceBox}>
      <Text style={styles.voiceLabel}>🎙️ {label}</Text>
      {downloading && <ActivityIndicator color={colors.slate400} />}
      {localUri && !downloading && (
        <TouchableOpacity onPress={() => player.play()} style={styles.playBtn} activeOpacity={0.85}>
          <Text style={styles.playBtnText}>▶️ Écouter</Text>
        </TouchableOpacity>
      )}
      <View style={styles.voiceActions}>
        {!recorderState.isRecording ? (
          <TouchableOpacity onPress={startRecording} disabled={uploading} style={[styles.recordBtn, uploading && styles.disabled]} activeOpacity={0.85}>
            <Text style={styles.recordBtnText}>{localUri ? '🔴 Réenregistrer' : '🔴 Enregistrer une note vocale'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={stopRecording} style={styles.stopBtn} activeOpacity={0.85}>
            <Text style={styles.stopBtnText}>⏹️ Arrêter l'enregistrement</Text>
          </TouchableOpacity>
        )}
        {uploading && <ActivityIndicator color={colors.slate600} />}
      </View>
      {error ? <Text style={styles.voiceError}>{error}</Text> : null}
    </View>
  );
}

// Garantie colis : signaler un problème (cassé, perdu) une fois la livraison
// terminée, uniquement si elle était assurée — équivalent mobile de
// ClaimPanel dans frontend/src/pages/client/DeliveryDetail.jsx.
function ClaimPanel({ delivery, onDone }) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!delivery.insured) return null;

  if (delivery.claim_status === 'en_cours') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.amber50 }]}>
        <Text style={{ color: colors.amber800, fontSize: 13 }}>🛡️ Réclamation en cours d'examen par l'équipe Chrono.</Text>
      </View>
    );
  }
  if (delivery.claim_status === 'rembourse') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.green50 }]}>
        <Text style={{ color: colors.green700, fontSize: 13 }}>
          🛡️ Réclamation acceptée : remboursement en cours.{delivery.claim_note ? ` (${delivery.claim_note})` : ''}
        </Text>
      </View>
    );
  }
  if (delivery.claim_status === 'refuse') {
    return (
      <View style={[styles.notice, { backgroundColor: colors.red50 }]}>
        <Text style={{ color: colors.red700, fontSize: 13 }}>
          🛡️ Réclamation refusée.{delivery.claim_note ? ` Motif : ${delivery.claim_note}` : ''}
        </Text>
      </View>
    );
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const res = await api.post(`/deliveries/${delivery.id}/reclamation`, { description });
      onDone(res.data.delivery);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.claimPanel}>
      <Text style={styles.payTitle}>🛡️ Un souci avec ce colis assuré (cassé, perdu...) ?</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Décrivez le problème rencontré"
        placeholderTextColor={colors.slate400}
        multiline
        style={styles.commentInput}
      />
      {error ? <Text style={{ color: colors.red600, fontSize: 13 }}>{error}</Text> : null}
      <PrimaryButton title={loading ? 'Envoi...' : 'Signaler un problème'} onPress={handleSubmit} loading={loading} variant="dark" disabled={!description.trim()} />
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
          {!!delivery.group_id && <Badge label="🔗 Groupée" bg="#f3e8ff" fg="#6b21a8" border="#e9d5ff" />}
        </View>

        <StepTimeline status={delivery.status} />

        <ReturnStatusPanel delivery={delivery} />

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
            {!!delivery.group_discount && (
              <Text style={{ fontSize: 11, color: '#6b21a8', marginTop: 4 }}>
                🔗 Livraison groupée : {delivery.group_discount} FCFA économisés.
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

        {delivery.status !== 'annulee' && <ShareTrackingPanel delivery={delivery} />}

        {delivery.payer_type === 'expediteur' && delivery.payment_status !== 'paye' && delivery.status === 'en_attente' && (
          <PayPanel delivery={delivery} onPaid={setDelivery} onNeedsPolling={pollAfterPayment} />
        )}

        {delivery.payer_type === 'destinataire' && delivery.payment_status !== 'paye' && !['livree', 'annulee'].includes(delivery.status) && (
          <View style={[styles.notice, { backgroundColor: colors.slate100 }]}>
            <Text style={{ color: colors.slate600, fontSize: 13 }}>
              💰 Paiement à la réception : le destinataire règle via le lien de suivi partagé ci-dessus.
            </Text>
          </View>
        )}

        {delivery.payment_status === 'paye' && delivery.return_status === 'aucun' && !['livree', 'annulee'].includes(delivery.status) && (
          <View style={styles.codeBox}>
            <Text style={styles.codeTitle}>Code de confirmation à remettre au livreur</Text>
            <Text style={styles.codeValue}>{delivery.confirmation_code}</Text>
            <Text style={styles.codeHint}>
              Communiquez ce code uniquement au moment de la remise réelle du colis, pour votre sécurité.
            </Text>
          </View>
        )}

        {!['livree', 'annulee'].includes(delivery.status) && (
          <View style={{ gap: 10 }}>
            <VoiceNoteRecorder deliveryId={delivery.id} point="retrait" label="Note vocale — retrait" existingPath={delivery.pickup_voice_note_path} onUploaded={load} />
            <VoiceNoteRecorder deliveryId={delivery.id} point="livraison" label="Note vocale — livraison" existingPath={delivery.dropoff_voice_note_path} onUploaded={load} />
          </View>
        )}

        {['en_attente', 'acceptee'].includes(delivery.status) && (
          <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{cancelling ? 'Annulation...' : 'Annuler la livraison'}</Text>
          </TouchableOpacity>
        )}

        {delivery.status === 'livree' && <ClaimPanel delivery={delivery} onDone={setDelivery} />}
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
  sharePanel: { backgroundColor: colors.emerald50, borderWidth: 1, borderColor: colors.emerald100, borderRadius: radius.lg, padding: 14, gap: 8 },
  shareTitle: { fontSize: 13, fontWeight: '700', color: colors.emerald900 },
  shareHintText: { fontSize: 11, color: colors.emerald700 },
  shareBtn: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.emerald100, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: colors.emerald700 },
  voiceBox: { backgroundColor: colors.slate100, borderRadius: radius.sm, padding: 12, gap: 8 },
  voiceLabel: { fontSize: 13, color: colors.slate600 },
  voiceActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  recordBtn: { backgroundColor: colors.slate800, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  recordBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  stopBtn: { backgroundColor: colors.red600, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  stopBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  playBtn: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7 },
  playBtnText: { fontSize: 12, fontWeight: '700', color: colors.slate700 },
  voiceError: { fontSize: 11, color: colors.red600 },
  claimPanel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.lg, padding: 14, gap: 10 },
});
