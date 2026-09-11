import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import TopBar from '../../components/TopBar';
import { StatusBadge, PaymentBadge, DelaiBadge, Badge } from '../../components/Badge';

export default function MyDeliveriesScreen({ navigation }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/deliveries/mine');
      setDeliveries(res.data.deliveries);
    } catch {
      /* ignore, l'utilisateur peut tirer pour rafraîchir */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recharge la liste à chaque fois que l'onglet reprend le focus (ex: après
  // avoir créé une nouvelle livraison depuis l'autre onglet).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <View style={styles.header}>
        <Text style={styles.title}>Mes livraisons ({deliveries.length})</Text>
      </View>
      <FlatList
        data={deliveries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.orange500} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucune livraison pour le moment.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('DeliveryDetail', { id: item.id })}
          >
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.route} numberOfLines={2}>
                  {item.pickup_address} → {item.dropoff_address}
                </Text>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString('fr-FR')}</Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={styles.price}>{item.price} FCFA</Text>
                <View style={styles.badges}>
                  <StatusBadge status={item.status} />
                  <PaymentBadge status={item.payment_status} />
                  {!item.delai_garanti && <DelaiBadge delaiGaranti={false} />}
                  {!!item.group_id && <Badge label="🔗 Groupée" bg="#f3e8ff" fg="#6b21a8" border="#e9d5ff" />}
                  {item.return_status === 'demande' && <Badge label="↩️ Retour" bg="#fee2e2" fg="#991b1b" border="#fecaca" />}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: colors.slate900 },
  listContent: { padding: 16, paddingTop: 4, gap: 10 },
  empty: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate100, padding: 28, alignItems: 'center', marginTop: 20 },
  emptyText: { color: colors.slate400, fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.slate100, padding: 14 },
  cardRow: { flexDirection: 'row', gap: 10 },
  route: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  date: { fontSize: 11, color: colors.slate400, marginTop: 3 },
  priceCol: { alignItems: 'flex-end', gap: 6 },
  price: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
});
