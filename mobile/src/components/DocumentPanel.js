import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api, { apiErrorMessage } from '../lib/api';
import { colors, radius } from '../lib/theme';

const STATUS_LABEL = {
  non_soumis: { text: 'Non envoyé', bg: colors.slate200, color: colors.slate600 },
  en_attente: { text: 'En examen', bg: colors.amber100, color: colors.amber800 },
  approuve: { text: 'Approuvé', bg: colors.green100, color: colors.green800 },
  rejete: { text: 'Refusé', bg: colors.red50, color: colors.red700 },
};

// Une ligne d'envoi de document (photo/scan) : la pièce d'identité et les 4
// documents véhicule utilisent ce même composant, seul `uploadUrl` change —
// équivalent mobile de DocumentRow dans
// frontend/src/pages/livreur/LivreurDashboard.jsx, mais avec appareil photo /
// galerie (expo-image-picker) au lieu d'un <input type="file">.
function DocumentRow({ label, status, note, uploadUrl, defaultFileName, onUpdated }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const badge = STATUS_LABEL[status] || STATUS_LABEL.non_soumis;

  async function uploadAsset(asset) {
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', {
        uri: asset.uri,
        name: asset.fileName || `${defaultFileName}-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      await api.post(uploadUrl, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await onUpdated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function pickFromCamera() {
    const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre cette photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) uploadAsset(result.assets[0]);
  }

  async function pickFromLibrary() {
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission requise', "L'accès à vos photos est nécessaire pour envoyer ce document.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) uploadAsset(result.assets[0]);
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
        </View>
      </View>
      {status === 'rejete' && note ? <Text style={styles.rejected}>Motif : {note}</Text> : null}
      {status !== 'en_attente' && (
        <View style={styles.actions}>
          {uploading ? (
            <ActivityIndicator color={colors.amber700} />
          ) : (
            <>
              <TouchableOpacity onPress={pickFromCamera} style={styles.actionBtn} activeOpacity={0.8}>
                <Text style={styles.actionText}>📷 Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickFromLibrary} style={styles.actionBtn} activeOpacity={0.8}>
                <Text style={styles.actionText}>🖼️ Galerie</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Panneau complet de vérification du livreur : pièce d'identité + les 4
// documents véhicule (carte grise, assurance, permis, photo de la moto).
// Le compte n'est activé par l'administration (user.verified) que lorsque
// les 5 sont approuvés — voir backend/src/vehicleDocuments.js.
export default function DocumentPanel({ user, onUpdated }) {
  const vehicleDocs = user.vehicle_documents || [];
  const totalRequired = 1 + vehicleDocs.length;
  const totalApproved = (user.id_document_status === 'approuve' ? 1 : 0) + vehicleDocs.filter((d) => d.status === 'approuve').length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vérification de votre compte ({totalApproved}/{totalRequired} approuvés)</Text>
      <Text style={styles.intro}>
        Envoyez votre pièce d'identité et les documents de votre moto (carte grise, assurance, permis, photo).
        L'administration doit approuver les {totalRequired} pour activer votre compte et vous laisser accepter des courses.
      </Text>
      <DocumentRow
        label="Pièce d'identité"
        status={user.id_document_status}
        note={user.id_document_note}
        uploadUrl="/users/me/document"
        defaultFileName="piece-identite"
        onUpdated={onUpdated}
      />
      {vehicleDocs.map((doc) => (
        <DocumentRow
          key={doc.type}
          label={doc.label}
          status={doc.status}
          note={doc.note}
          uploadUrl={`/users/me/vehicule/${doc.type}`}
          defaultFileName={doc.type}
          onUpdated={onUpdated}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.amber50, borderWidth: 1, borderColor: colors.amber100, borderRadius: radius.lg, padding: 14, gap: 10 },
  title: { fontSize: 13, fontWeight: '700', color: colors.amber800 },
  intro: { fontSize: 12, color: colors.amber700, lineHeight: 17 },
  row: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.amber100, borderRadius: radius.md, padding: 10, gap: 6 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: colors.slate800 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  rejected: { fontSize: 12, color: colors.red700 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { backgroundColor: colors.amber700, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  error: { fontSize: 12, color: colors.red600 },
});
