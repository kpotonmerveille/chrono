import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors } from '../lib/theme';
import { ROLE_LABEL } from '../lib/labels';

// Bandeau supérieur affiché sur chaque écran, équivalent de
// frontend/src/components/Navbar.jsx (logo Chrono + utilisateur + déconnexion).
export default function TopBar({ backLabel, onBack }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        <View style={styles.brand}>
          <View style={styles.logoDot}>
            <Text style={styles.logoEmoji}>⏱️</Text>
          </View>
          <Text style={styles.brandText}>Chrono</Text>
        </View>
        {user && (
          <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>
        )}
      </View>
      {user && (
        <Text style={styles.userLine}>
          {user.name} <Text style={styles.userRole}>· {ROLE_LABEL[user.role] || user.role}</Text>
        </Text>
      )}
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.6}>
          <Text style={styles.backText}>{backLabel || '← Retour'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.orange100,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot: {
    height: 30,
    width: 30,
    borderRadius: 10,
    backgroundColor: colors.orange500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 15 },
  brandText: { fontSize: 18, fontWeight: '800', color: colors.orange600 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: { fontSize: 13, fontWeight: '600', color: colors.slate700 },
  userLine: { marginTop: 6, fontSize: 13, color: colors.slate500 },
  userRole: { color: colors.slate400 },
  backBtn: { marginTop: 10 },
  backText: { fontSize: 13, color: colors.slate500, fontWeight: '500' },
});
