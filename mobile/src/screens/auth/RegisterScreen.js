import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import TextField from '../../components/TextField';
import PrimaryButton from '../../components/PrimaryButton';

const VEHICLES = [
  { key: 'moto', label: 'Moto' },
  { key: 'voiture', label: 'Voiture' },
  { key: 'tricycle', label: 'Tricycle' },
  { key: 'velo', label: 'Vélo' },
];

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [role, setRole] = useState('client');
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', zone: '', vehicle: 'moto' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const payload = {
        role,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      };
      if (role === 'livreur') {
        payload.zone = form.zone.trim();
        payload.vehicle = form.vehicle;
      }
      await register(payload);
      // Le RootNavigator bascule automatiquement vers l'espace correspondant.
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    form.name && form.phone && form.password.length >= 6 && (role === 'client' || (form.zone && form.vehicle));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Créer un compte</Text>

            <View style={styles.roleSwitch}>
              {[
                { key: 'client', label: 'Client' },
                { key: 'livreur', label: 'Livreur' },
              ].map((r) => (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setRole(r.key)}
                  style={[styles.roleBtn, role === r.key && styles.roleBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleBtnText, role === r.key && styles.roleBtnTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.form}>
              <TextField label="Nom complet" value={form.name} onChangeText={(v) => update('name', v)} />
              <TextField
                label="Téléphone"
                value={form.phone}
                onChangeText={(v) => update('phone', v)}
                placeholder="+229 XX XX XX XX"
                keyboardType="phone-pad"
                style={{ marginTop: 12 }}
              />
              <TextField
                label="Email (optionnel)"
                value={form.email}
                onChangeText={(v) => update('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{ marginTop: 12 }}
              />

              {role === 'livreur' && (
                <>
                  <TextField
                    label="Zone d'activité"
                    value={form.zone}
                    onChangeText={(v) => update('zone', v)}
                    placeholder="Ex: Cotonou, Akpakpa, Fidjrossè..."
                    style={{ marginTop: 12 }}
                  />
                  <Text style={[styles.label, { marginTop: 12 }]}>Véhicule</Text>
                  <View style={styles.vehicleRow}>
                    {VEHICLES.map((v) => (
                      <TouchableOpacity
                        key={v.key}
                        onPress={() => update('vehicle', v.key)}
                        style={[styles.vehicleChip, form.vehicle === v.key && styles.vehicleChipActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.vehicleChipText, form.vehicle === v.key && styles.vehicleChipTextActive]}>
                          {v.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.notice}>
                    Votre compte devra être vérifié par notre équipe avant de pouvoir accepter des courses.
                  </Text>
                </>
              )}

              <TextField
                label="Mot de passe"
                value={form.password}
                onChangeText={(v) => update('password', v)}
                secureTextEntry
                style={{ marginTop: 12 }}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                title={loading ? 'Création...' : 'Créer mon compte'}
                onPress={handleSubmit}
                loading={loading}
                disabled={!canSubmit}
                style={{ marginTop: 16 }}
              />
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkRow}>
              <Text style={styles.linkText}>
                Déjà un compte ? <Text style={styles.linkAccent}>Se connecter</Text>
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
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, paddingVertical: 36 },
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
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  roleSwitch: { flexDirection: 'row', backgroundColor: colors.slate100, borderRadius: radius.lg, padding: 4, marginTop: 18, gap: 4 },
  roleBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
  roleBtnActive: { backgroundColor: colors.white, shadowColor: colors.slate900, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: colors.slate500 },
  roleBtnTextActive: { color: colors.orange600 },
  form: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 5 },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleChip: { borderWidth: 1, borderColor: colors.slate300, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  vehicleChipActive: { backgroundColor: colors.orange500, borderColor: colors.orange500 },
  vehicleChipText: { fontSize: 13, color: colors.slate700, fontWeight: '500' },
  vehicleChipTextActive: { color: colors.white },
  notice: { fontSize: 12, color: colors.amber800, backgroundColor: colors.amber50, borderRadius: radius.sm, padding: 10, marginTop: 12 },
  error: { color: colors.red600, backgroundColor: colors.red50, borderRadius: radius.sm, padding: 10, fontSize: 13, marginTop: 12 },
  linkRow: { marginTop: 18, alignItems: 'center' },
  linkText: { fontSize: 13, color: colors.slate500 },
  linkAccent: { color: colors.orange600, fontWeight: '600' },
});
