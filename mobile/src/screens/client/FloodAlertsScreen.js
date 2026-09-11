import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import TopBar from '../../components/TopBar';
import FloodAlertPanel from '../../components/FloodAlertPanel';
import { colors } from '../../lib/theme';

export default function FloodAlertsScreen() {
  const { user } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Routes</Text>
        <FloodAlertPanel user={user} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  container: { padding: 16, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900, marginBottom: 2 },
});
