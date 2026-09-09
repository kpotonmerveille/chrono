import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { PLATFORM_COMMISSION } from '../../lib/labels';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import DocumentPanel from '../../components/DocumentPanel';
import { StatusBadge, ZoneBadge, DelaiBadge } from '../../components/Badge';

const TABS = [
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'mes-courses', label: 'Mes courses' },
  { key: 'historique', label: 'Historique' },
];

export default function LivreurHomeScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('disponibles');
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [gains, setGains] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [avRes, mineRes, gainsRes] = await Promise.all([
        api.get('/deliveries/disponibles').catch(() => ({ data: { deliveries: [] } })),
        api.get('/deliveries/assignees'),
        api.get('/users/me/gains'),
      ]);
      setAvailable(avRes.data.deliveries);
      setMine(mineRes.data.deliveries);
      setGains(gainsRes.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

        {user.id_document_status !== 'approuve' && <DocumentPanel user={user} onUpdated={refreshUser} />}

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
                </View>
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
});
