import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import TextField from '../../components/TextField';
import PrimaryButton from '../../components/PrimaryButton';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(phone.trim(), password);
      // Le RootNavigator réagit automatiquement au changement d'utilisateur
      // (voir src/navigation/RootNavigator.js) et bascule vers l'espace
      // client ou livreur — pas de navigation manuelle nécessaire ici.
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.logo}>
              <Text style={styles.logoEmoji}>⏱️</Text>
            </View>
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>Client ou livreur</Text>

            <View style={styles.form}>
              <TextField
                label="Numéro de téléphone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+229 XX XX XX XX"
                keyboardType="phone-pad"
                autoCapitalize="none"
              />
              <TextField
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={{ marginTop: 12 }}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton
                title={loading ? 'Connexion...' : 'Se connecter'}
                onPress={handleSubmit}
                loading={loading}
                disabled={!phone || !password}
                style={{ marginTop: 16 }}
              />
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkRow}>
              <Text style={styles.linkText}>
                Pas encore de compte ? <Text style={styles.linkAccent}>Créer un compte</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.orange50 },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 28,
    shadowColor: colors.slate900,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  logo: {
    alignSelf: 'center',
    height: 48,
    width: 48,
    borderRadius: 14,
    backgroundColor: colors.orange500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoEmoji: { fontSize: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.slate500, textAlign: 'center', marginTop: 4 },
  form: { marginTop: 22 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13, marginTop: 12 },
  linkRow: { marginTop: 20, alignItems: 'center' },
  linkText: { fontSize: 13, color: colors.slate500 },
  linkAccent: { color: colors.orange600, fontWeight: '600' },
});
