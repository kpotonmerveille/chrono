import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api, { apiErrorMessage } from '../lib/api';
import { colors, radius } from '../lib/theme';

// Panneau d'envoi de la pièce d'identité pour vérification par l'administration,
// équivalent mobile de DocumentPanel dans
// frontend/src/pages/livreur/LivreurDashboard.jsx — mais avec appareil photo /
// galerie (expo-image-picker) au lieu d'un simple <input type="file">.
export default function DocumentPanel({ user, onUpdated }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function uploadAsset(asset) {
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', {
        uri: asset.uri,
        name: asset.fileName || `piece-identite-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      await api.post('/users/me/document', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await onUpdated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre une photo de votre pièce d'identité.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) uploadAsset(result.assets[0]);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', "L'accès à vos photos est nécessaire pour envoyer votre pièce d'identité.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) uploadAsset(result.assets[0]);
  }

  return (
    <View style={styles.container}>
      {user.id_document_status === 'non_soumis' && (
        <Text style={styles.text}>
          Envoyez une photo lisible de votre pièce d'identité (CNI, permis de conduire...) pour être vérifié par
          l'administration et pouvoir accepter des courses.
        </Text>
      )}
      {user.id_document_status === 'en_attente' && (
        <Text style={styles.text}>📄 Document envoyé, en cours d'examen par l'administration.</Text>
      )}
      {user.id_document_status === 'rejete' && (
        <View>
          <Text style={styles.rejected}>Document refusé{user.id_document_note ? ` : ${user.id_document_note}` : ''}</Text>
          <Text style={[styles.text, { marginTop: 4 }]}>Merci d'envoyer un nouveau document lisible.</Text>
        </View>
      )}

      {user.id_document_status !== 'en_attente' && (
        <View style={styles.actions}>
          {uploading ? (
            <ActivityIndicator color={colors.amber700} />
          ) : (
            <>
              <TouchableOpacity onPress={pickFromCamera} style={styles.actionBtn} activeOpacity={0.8}>
                <Text style={styles.actionText}>📷 Prendre une photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickFromLibrary} style={styles.actionBtn} activeOpacity={0.8}>
                <Text style={styles.actionText}>🖼️ Choisir dans la galerie</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.amber50, borderWidth: 1, borderColor: colors.amber100, borderRadius: radius.lg, padding: 14, gap: 10 },
  text: { fontSize: 13, color: colors.amber800, lineHeight: 18 },
  rejected: { fontSize: 13, color: colors.red700, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { backgroundColor: colors.amber700, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  error: { fontSize: 12, color: colors.red600 },
});
