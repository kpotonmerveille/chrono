import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors, radius } from '../lib/theme';

const COTONOU_REGION = { latitude: 6.3654, longitude: 2.4183, latitudeDelta: 0.06, longitudeDelta: 0.06 };

// Carte tactile pour placer un point de retrait ou de livraison : équivalent
// mobile de frontend/src/components/LocationPicker.jsx (Leaflet côté web).
// `value` est au format { latitude, longitude } (convention react-native-maps).
export default function LocationPickerMap({ value, onChange, height = 180 }) {
  const initialRegion = useMemo(
    () => (value ? { ...value, latitudeDelta: 0.02, longitudeDelta: 0.02 } : COTONOU_REGION),
    // On ne veut recalculer la région initiale qu'une fois, pas à chaque tap
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <View>
      <MapView
        style={[styles.map, { height }]}
        initialRegion={initialRegion}
        onPress={(e) => onChange(e.nativeEvent.coordinate)}
      >
        {value && <Marker coordinate={value} pinColor={colors.orange500} />}
      </MapView>
      <Text style={styles.hint}>Touchez la carte pour placer le point précis (recommandé pour un tarif exact).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', borderRadius: radius.md },
  hint: { fontSize: 12, color: colors.slate500, marginTop: 6 },
});
