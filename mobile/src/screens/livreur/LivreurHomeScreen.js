import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { PLATFORM_COMMISSION } from '../../lib/labels';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import DocumentPanel from '../../components/DocumentPanel';
import PrimaryButton from '../../components/PrimaryButton';
import { StatusBadge, ZoneBadge, DelaiBadge, Badge } from '../../components/Badge';
import FloodAlertPanel from '../../components/FloodAlertPanel';
import { haversineKm } from '../../lib/geo';

const TABS = [
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'mes-courses', label: 'Mes courses' },
  { key: 'historique', label: 'Historique' },
  { key: 'avance', label: '💸 Avance' },
  { key: 'inondations', label: '🌊 Routes' },
];

// Doit rester synchronisé avec FLOOD_ALERT_RADIUS_KM dans
// backend/src/pricing.js — utilisé uniquement pour signaler visuellement une
// course proche d'une alerte déjà chargée, pas pour une décision serveur.
const FLOOD_ALERT_RADIUS_KM = 1.5;

// "Avance sur gains" : demander un retrait sur des gains déjà réalisés,
// avant la fin de la journée — versement Mobile Money géré manuellement par
// l'admin. Équivalent mobile de AvancePanel dans
// frontend/src/pages/livreur/LivreurDashboard.jsx.
const AVANCE_STATUS_LABEL = {
  en_attente: { text: 'En attente', bg: colors.amber100, color: colors.amber800 },
  approuvee: { text: 'Approuvée', bg: colors.blue100, color: colors.blue800 },
  versee: { text: 'Versée', bg: colors.green100, color: colors.green800 },
  refusee: { text: 'Refusée', bg: colors.red50, color: colors.red700 },
};

function AvancePanel({ gains, onRequested }) {
  const [amount, setAmount] = useState('');
  const [avances, setAvances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAvances = useCallback(async () => {
    try {
      const res = await api.get('/users/me/avances');
      setAvances(res.data.avances);
    } catch {
      /* l'historique n'est pas critique */
    }
  }, []);

  useEffect(() => {
    loadAvances();
  }, [loadAvances]);

  async function handleSubmit() {
    setError('');
    setSuccess('');
    const value = parseInt(amount, 10);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Montant invalide');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users/me/avance', { amount: value });
      setAmount('');
      setSuccess("Demande envoyée. Le versement Mobile Money sera confirmé par l'administration.");
      await loadAvances();
      await onRequested();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const disponible = gains?.disponible_pour_avance ?? 0;

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.subText}>
          Vous pouvez demander une avance sur vos gains déjà réalisés, avant la fin de la journée.
        </Text>
        <View style={styles.avanceStatsRow}>
          <View style={styles.avanceStatBox}>
            <Text style={styles.statLabel}>Déjà demandé</Text>
            <Text style={styles.statValue}>{gains?.deja_avance ?? 0} F</Text>
          </View>
          <View style={[styles.avanceStatBox, { backgroundColor: colors.emerald50 }]}>
            <Text style={[styles.statLabel, { color: colors.emerald700 }]}>Disponible pour avance</Text>
            <Text style={[styles.statValue, { color: colors.emerald700 }]}>{disponible} F</Text>
          </View>
        </View>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Montant (FCFA)"
          placeholderTextColor={colors.slate400}
          keyboardType="number-pad"
          style={styles.amountInput}
        />
        <PrimaryButton
          title={loading ? 'Envoi...' : 'Demander une avance'}
          onPress={handleSubmit}
          loading={loading}
          disabled={disponible <= 0}
        />
        {disponible <= 0 && <Text style={styles.subText}>Aucun montant disponible pour le moment.</Text>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={{ color: colors.green700, fontSize: 13 }}>{success}</Text> : null}
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>Historique de vos demandes</Text>
        {avances.length === 0 && <EmptyBox text="Aucune demande d'avance pour le moment." />}
        {avances.map((a) => {
          const badge = AVANCE_STATUS_LABEL[a.status] || AVANCE_STATUS_LABEL.en_attente;
          return (
            <View key={a.id} style={[styles.card, styles.acceptRow]}>
              <View>
                <Text style={styles.route}>{a.amount} FCFA</Text>
                <Text style={styles.subText}>{new Date(a.requested_at).toLocaleString('fr-FR')}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function LivreurHomeScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('disponibles');
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [gains, setGains] = useState(null);
  const [floodAlerts, setFloodAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [avRes, mineRes, gainsRes, floodRes] = await Promise.all([
        api.get('/deliveries/disponibles').catch(() => ({ data: { deliveries: [] } })),
        api.get('/deliveries/assignees'),
        api.get('/users/me/gains'),
        api.get('/inondations').catch(() => ({ data: { alertes: [] } })),
      ]);
      setAvailable(avRes.data.deliveries);
      setMine(mineRes.data.deliveries);
      setGains(gainsRes.data);
      setFloodAlerts(floodRes.data.alertes);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Signale une course dont le retrait ou la livraison tombe à proximité
  // d'une alerte route inondée active — purement informatif côté livreur,
  // calculé avec les alertes déjà chargées (pas d'appel réseau par course).
  function floodNear(d) {
    return floodAlerts.some((a) => {
      const distPickup = haversineKm(d.pickup_lat, d.pickup_lng, a.lat, a.lng);
      const distDropoff = haversineKm(d.dropoff_lat, d.dropoff_lng, a.lat, a.lng);
      return (distPickup !== null && distPickup <= FLOOD_ALERT_RADIUS_KM) || (distDropoff !== null && distDropoff <= FLOOD_ALERT_RADIUS_KM);
    });
  }

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    const interval = setInterval(loadAll, 8000);
    return () => clearInterval(interval);
  }, [loadAll]);

  async function toggleAvailability() {
    setToggling(true);
    try {
      await api.patch('/users/me/disponibilite', { available: !user.available });
      await refreshUser();
      loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  async function accept(id) {
    try {
      await api.post(`/deliveries/${id}/accepter`);
      await loadAll();
      setTab('mes-courses');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const activeCourses = mine.filter((d) => !['livree', 'annulee'].includes(d.status));
  const historyCourses = mine.filter((d) => ['livree', 'annulee'].includes(d.status));

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={colors.orange500} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Espace livreur</Text>
          <TouchableOpacity
            onPress={toggleAvailability}
            disabled={toggling || !user.verified}
            style={[styles.availBtn, user.available ? styles.availBtnOn : styles.availBtnOff, (toggling || !user.verified) && styles.disabled]}
          >
            <Text style={[styles.availText, user.available && styles.availTextOn]}>
              {user.available ? '🟢 Disponible' : '⚪ Indisponible'}
            </Text>
          </TouchableOpacity>
        </View>

        {!user.verified && <DocumentPanel user={user} onUpdated={refreshUser} />}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Gains totaux</Text>
            <Text style={styles.statValue}>{gains ? `${gains.total} F` : '—'}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Livraisons</Text>
            <Text style={styles.statValue}>{gains ? gains.nb_livraisons : '—'}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Note</Text>
            <Text style={styles.statValue}>⭐ {user.rating_avg}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.key === 'disponibles' ? `${t.label} (${available.length})` : t.key === 'mes-courses' ? `${t.label} (${activeCourses.length})` : t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator color={colors.orange500} style={{ marginTop: 20 }} />}

        {!loading && tab === 'disponibles' && (
          <View style={{ gap: 10 }}>
            {!user.available && <EmptyBox text='Passez en "Disponible" pour voir les courses proposées.' />}
            {!!user.available && available.length === 0 && <EmptyBox text="Aucune demande en attente pour le moment." />}
            {available.map((d) => (
              <View key={d.id} style={styles.card}>
                <Text style={styles.route}>
                  {d.pickup_address} → {d.dropoff_address}
                </Text>
                <Text style={styles.subText}>
                  Client: {d.client_name} · {d.package_description || 'Colis'} ({d.package_size})
                </Text>
                <View style={styles.badgeRow}>
                  <ZoneBadge zone={d.zone} />
                  <DelaiBadge delaiGaranti={!!d.delai_garanti} />
                  {d.group_size > 1 && <Badge label={`🔗 Groupée (${d.group_size} colis)`} bg="#f3e8ff" fg="#6b21a8" border="#e9d5ff" />}
                  {floodNear(d) && <Badge label="🌊 Route inondée signalée à proximité" bg="#e0f2fe" fg="#075985" border="#bae6fd" />}
                </View>
                {d.group_size > 1 && (
                  <Text style={styles.subText}>Accepter cette course vous attribue les {d.group_size} colis du groupe.</Text>
                )}
                <View style={styles.acceptRow}>
                  <View>
                    <Text style={styles.share}>{d.price - PLATFORM_COMMISSION} FCFA</Text>
                    <Text style={styles.shareHint}>pour vous (prix total {d.price} F)</Text>
                  </View>
                  <TouchableOpacity onPress={() => accept(d.id)} style={styles.acceptBtn}>
                    <Text style={styles.acceptText}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && tab === 'mes-courses' && (
          <View style={{ gap: 10 }}>
            {activeCourses.length === 0 && <EmptyBox text="Aucune course en cours." />}
            {activeCourses.map((d) => (
              <TouchableOpacity key={d.id} style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('LivreurDeliveryDetail', { id: d.id })}>
                <View style={styles.acceptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.route}>
                      {d.pickup_address} → {d.dropoff_address}
                    </Text>
                    <Text style={styles.subText}>Client: {d.client_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.share}>{d.price - PLATFORM_COMMISSION} FCFA</Text>
                    <View style={styles.badgeRow}>
                      <StatusBadge status={d.status} />
                      {!d.delai_garanti && <DelaiBadge delaiGaranti={false} />}
                      {d.group_size > 1 && <Badge label="🔗 Groupée" bg="#f3e8ff" fg="#6b21a8" border="#e9d5ff" />}
                      {d.return_status === 'demande' && <Badge label="↩️ Retour" bg="#fee2e2" fg="#991b1b" border="#fecaca" />}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && tab === 'historique' && (
          <View style={{ gap: 10 }}>
            {historyCourses.length === 0 && <EmptyBox text="Aucun historique pour le moment." />}
            {historyCourses.map((d) => (
              <View key={d.id} style={[styles.card, styles.acceptRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.route}>
                    {d.pickup_address} → {d.dropoff_address}
                  </Text>
                  <Text style={styles.subText}>{new Date(d.created_at).toLocaleDateString('fr-FR')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.share}>{d.price - PLATFORM_COMMISSION} FCFA</Text>
                  <StatusBadge status={d.status} />
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && tab === 'avance' && <AvancePanel gains={gains} onRequested={loadAll} />}

        {!loading && tab === 'inondations' && <FloodAlertPanel user={user} onAlertsChanged={setFloodAlerts} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyBox({ text }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900 },
  availBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md },
  availBtnOn: { backgroundColor: colors.green500 },
  availBtnOff: { backgroundColor: colors.slate200 },
  disabled: { opacity: 0.5 },
  availText: { fontSize: 13, fontWeight: '700', color: colors.slate700 },
  availTextOn: { color: colors.white },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.slate100, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 11, color: colors.slate400 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.slate900, marginTop: 2 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.slate100, borderRadius: radius.lg, padding: 4, gap: 4, alignSelf: 'flex-start' },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  tabBtnActive: { backgroundColor: colors.white, shadowColor: colors.slate900, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.slate500 },
  tabTextActive: { color: colors.orange600 },
  emptyBox: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate100, padding: 24, alignItems: 'center' },
  emptyText: { color: colors.slate400, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate100, padding: 14, gap: 8 },
  route: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  subText: { fontSize: 12, color: colors.slate500 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  acceptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  share: { fontSize: 15, fontWeight: '800', color: colors.orange600 },
  shareHint: { fontSize: 11, color: colors.slate400 },
  acceptBtn: { backgroundColor: colors.orange500, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 9 },
  acceptText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.slate700 },
  avanceStatsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  avanceStatBox: { flex: 1, backgroundColor: colors.slate100, borderRadius: radius.sm, padding: 10, alignItems: 'center' },
  amountInput: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 12, color: colors.slate900, backgroundColor: colors.white },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
