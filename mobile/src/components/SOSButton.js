import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import api, { apiErrorMessage } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';

// Bouton SOS livreur (mobile), équivalent de
// frontend/src/components/SOSButton.jsx : déclenche une alerte danger/panne
// avec la position GPS exacte, envoyée immédiatement à l'admin (alarme
// sonore + carte sur le tableau de bord admin, resté web pour l'instant).
const ALERT_TYPES = [
  { type: 'danger', label: '🚨 Je suis en danger', desc: 'Agression, situation menaçante, personne me suit...', color: colors.red600 },
  { type: 'panne', label: '🔧 Je suis en panne', desc: 'Moto en panne, accident matériel...', color: colors.amber700 },
];

export default function SOSButton() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function trigger(type) {
    setError('');
    setSending(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError("Autorisez la localisation pour envoyer votre position exacte à l'administrateur.");
        setSending(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await api.post('/alertes', {
        type,
        message: message.trim() || null,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      setSent(true);
      setOpen(false);
      setMessage('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => { setOpen(true); setSent(false); setError(''); }}
        style={styles.sosBtn}
        activeOpacity={0.8}
      >
        <Text style={styles.sosBtnText}>🚨 SOS</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => !sending && setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>Déclencher une alerte</Text>
            <Text style={styles.subtitle}>
              Votre position exacte sera envoyée immédiatement à l'administrateur, qui pourra
              envoyer la police ou une équipe de dépannage.
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Précision (facultatif) : ce qui se passe..."
              placeholderTextColor={colors.slate400}
              multiline
              editable={!sending}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ gap: spacing.sm }}>
              {ALERT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.type}
                  onPress={() => trigger(t.type)}
                  disabled={sending}
                  style={[styles.typeBtn, { backgroundColor: t.color, opacity: sending ? 0.6 : 1 }]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.typeBtnLabel}>{t.label}</Text>
                  <Text style={styles.typeBtnDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => !sending && setOpen(false)} style={styles.cancelBtn}>
              {sending ? (
                <View style={styles.sendingRow}>
                  <ActivityIndicator size="small" color={colors.slate500} />
                  <Text style={styles.cancelText}>Envoi de votre position en cours...</Text>
                </View>
              ) : (
                <Text style={styles.cancelText}>Annuler</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {sent && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>✅ Alerte envoyée. L'administrateur a été notifié avec votre position.</Text>
          <TouchableOpacity onPress={() => setSent(false)}>
            <Text style={styles.toastClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sosBtn: {
    backgroundColor: colors.red600,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sosBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 380, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '800', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate600 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.slate800,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, color: colors.red600 },
  typeBtn: { borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 12 },
  typeBtnLabel: { color: colors.white, fontWeight: '800', fontSize: 14 },
  typeBtnDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { fontSize: 13, color: colors.slate500 },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.green600 || '#16a34a',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toastText: { color: colors.white, fontSize: 13, flex: 1 },
  toastClose: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700' },
});
