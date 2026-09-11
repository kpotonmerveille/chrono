import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api, { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import TopBar from '../../components/TopBar';
import Card from '../../components/Card';
import TextField from '../../components/TextField';
import PrimaryButton from '../../components/PrimaryButton';

// Portefeuille Chrono : équivalent mobile de la section "Portefeuille" de
// frontend/src/pages/client/ClientDashboard.jsx — rechargez une fois, payez
// vos livraisons instantanément ensuite (option "Payer avec mon solde
// Chrono" dans NewDeliveryScreen).
const METHODS = [
  { key: 'mtn_momo', label: 'MTN Mobile Money' },
  { key: 'moov_money', label: 'Moov Money' },
  { key: 'carte', label: 'Carte bancaire' },
];

const TX_LABEL = {
  recharge: { text: 'Recharge', color: colors.emerald700 },
  debit: { text: 'Paiement livraison', color: colors.slate700 },
  remboursement: { text: 'Remboursement', color: '#4338ca' },
};

export default function WalletScreen() {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('2000');
  const [method, setMethod] = useState('mtn_momo');
  const [momoNumber, setMomoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    api.get('/payments/wallet').then((res) => setWallet(res.data)).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function recharger() {
    setError(''); setSuccess('');
    const amountNum = Number(amount);
    if (!Number.isInteger(amountNum) || amountNum < 500) {
      setError('Montant minimum de recharge : 500 FCFA');
      return;
    }
    if (method !== 'carte' && !momoNumber) {
      setError('Numéro Mobile Money requis');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/payments/wallet/recharger', { amount: amountNum, method, momo_number: momoNumber || undefined });
      if (res.data.checkout_url) {
        setError('Paiement FedaPay : ouvrez le lien depuis un navigateur pour finaliser (intégration en cours côté mobile).');
        return;
      }
      setSuccess(`Portefeuille rechargé de ${amountNum} FCFA.`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Portefeuille Chrono</Text>

        <Card>
          <Text style={styles.helper}>
            Rechargez une fois, payez vos livraisons instantanément ensuite — pratique si vous envoyez
            plusieurs colis par jour (Chrono Pro).
          </Text>
          <Text style={styles.balance}>{wallet ? wallet.balance : '...'} FCFA</Text>

          <TextField
            label="Montant à recharger"
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
            style={{ marginTop: 14 }}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Méthode</Text>
          <View style={styles.methodRow}>
            {METHODS.map((m) => (
              <Text
                key={m.key}
                onPress={() => setMethod(m.key)}
                style={[styles.methodChip, method === m.key && styles.methodChipActive]}
              >
                {m.label}
              </Text>
            ))}
          </View>
          {method !== 'carte' && (
            <TextField
              label="Numéro Mobile Money"
              keyboardType="phone-pad"
              placeholder="+229 XX XX XX XX"
              value={momoNumber}
              onChangeText={setMomoNumber}
              style={{ marginTop: 12 }}
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <PrimaryButton title={loading ? 'Recharge...' : 'Recharger mon portefeuille'} onPress={recharger} loading={loading} style={{ marginTop: 12 }} />
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.sectionTitle}>Historique</Text>
          {(!wallet || wallet.transactions.length === 0) && (
            <Text style={styles.helper}>Aucune transaction pour le moment.</Text>
          )}
          {wallet?.transactions.map((t) => {
            const label = TX_LABEL[t.type] || TX_LABEL.recharge;
            const sign = t.type === 'debit' ? '−' : '+';
            return (
              <View key={t.id} style={styles.txRow}>
                <View>
                  <Text style={[styles.txLabel, { color: label.color }]}>{label.text}</Text>
                  <Text style={styles.txDate}>{new Date(t.created_at).toLocaleString('fr-FR')}</Text>
                </View>
                <Text style={[styles.txAmount, { color: t.type === 'debit' ? colors.slate700 : colors.emerald700 }]}>{sign}{t.amount} FCFA</Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900, marginBottom: 12 },
  helper: { fontSize: 12.5, color: colors.slate500, lineHeight: 18 },
  balance: { fontSize: 30, fontWeight: '800', color: colors.emerald700, marginTop: 10 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 5 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    fontSize: 12.5, fontWeight: '600', color: colors.slate600,
    borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 7, overflow: 'hidden',
  },
  methodChipActive: { backgroundColor: colors.orange50, borderColor: colors.orange400, color: colors.orange700 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13, marginTop: 10 },
  success: { color: colors.green700, backgroundColor: colors.green50, borderRadius: radius.sm, padding: 10, fontSize: 13, marginTop: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.slate900, marginBottom: 8 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.slate50, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  txLabel: { fontSize: 13, fontWeight: '600' },
  txDate: { fontSize: 11, color: colors.slate400, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '700' },
});
