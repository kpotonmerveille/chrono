import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { apiErrorMessage } from '../lib/api';
import { colors, radius } from '../lib/theme';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import LocationPickerMap from './LocationPickerMap';

const MAX_DESCRIPTION_LENGTH = 300;

function timeAgo(iso) {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  return `il y a ${Math.round(diffMin / 60)} h`;
}

// Alerte route inondée : signalement manuel partagé entre clients et
// livreurs, équivalent mobile de frontend/src/components/FloodAlertPanel.jsx
// — voir backend/src/routes/inondations.js. Aucune donnée fiable disponible
// automatiquement en saison des pluies à Cotonou, donc tout repose sur ce
// que les utilisateurs signalent eux-mêmes.
export default function FloodAlertPanel({ user, onAlertsChanged }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pos, setPos] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/inondations')
      .then((res) => {
        setAlerts(res.data.alertes);
        onAlertsChanged?.(res.data.alertes);
      })
      .catch(() => { /* liste non critique, on réessaiera au prochain focus */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleReport() {
    setError('');
    if (!pos) {
      setError('Placez le point sur la carte où la route est inondée.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/inondations', { lat: pos.latitude, lng: pos.longitude, description: description.trim() || undefined });
      setPos(null);
      setDescription('');
      setShowForm(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(id) {
    setResolvingId(id);
    try {
      await api.post(`/inondations/${id}/resoudre`);
      load();
    } catch {
      /* silencieux : l'utilisateur peut réessayer */
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.title}>🌊 Alertes route inondée</Text>
          <TouchableOpacity onPress={() => setShowForm((s) => !s)} style={styles.reportBtn} activeOpacity={0.85}>
            <Text style={styles.reportBtnText}>{showForm ? 'Annuler' : 'Signaler'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helper}>
          Signalement manuel par les clients et les livreurs — en saison des pluies, certains axes de Cotonou
          deviennent impraticables. Une alerte reste affichée quelques heures, ou jusqu'à ce que son auteur la lève.
        </Text>

        {showForm && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <LocationPickerMap value={pos} onChange={setPos} height={180} />
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder="Ex: eau au niveau du guidon près du pont (optionnel)"
              placeholderTextColor={colors.slate400}
              multiline
              style={styles.textarea}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              title={submitting ? 'Envoi...' : 'Confirmer le signalement'}
              onPress={handleReport}
              loading={submitting}
            />
          </View>
        )}
      </Card>

      {loading && <Text style={styles.helper}>Chargement...</Text>}
      {!loading && alerts.length === 0 && (
        <Card><Text style={styles.emptyText}>Aucune route inondée signalée actuellement.</Text></Card>
      )}
      {alerts.map((a) => {
        const canResolve = user && (user.id === a.reporter_id || user.role === 'admin');
        return (
          <Card key={a.id}>
            <View style={styles.alertRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertDesc}>{a.description || 'Route signalée comme inondée, sans détail.'}</Text>
                <Text style={styles.alertMeta}>
                  Signalé par {a.reporter_role === 'livreur' ? 'un livreur' : 'un client'} · {timeAgo(a.created_at)}
                </Text>
              </View>
              {canResolve && (
                <TouchableOpacity onPress={() => handleResolve(a.id)} disabled={resolvingId === a.id} style={styles.resolveBtn} activeOpacity={0.85}>
                  <Text style={styles.resolveBtnText}>{resolvingId === a.id ? '...' : "💧 Retirée"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: colors.slate900 },
  reportBtn: { backgroundColor: '#0284c7', borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  reportBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  helper: { fontSize: 12, color: colors.slate500, marginTop: 6, lineHeight: 17 },
  textarea: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, minHeight: 60, textAlignVertical: 'top', color: colors.slate900, backgroundColor: colors.white },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
  emptyText: { color: colors.slate400, fontSize: 13, textAlign: 'center' },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alertDesc: { fontSize: 13.5, color: colors.slate800 },
  alertMeta: { fontSize: 11, color: colors.slate400, marginTop: 3 },
  resolveBtn: { backgroundColor: colors.slate100, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  resolveBtnText: { fontSize: 11.5, fontWeight: '700', color: colors.slate600 },
});
