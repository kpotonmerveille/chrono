import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors, radius } from '../lib/theme';

const COTONOU_REGION = { latitude: 6.3654, longitude: 2.4183, latitudeDelta: 0.08, longitudeDelta: 0.08 };

// Carte de suivi : points de retrait/livraison + position en direct du
// livreur, équivalent mobile de frontend/src/components/TrackingMap.jsx.
export default function TrackingMap({ delivery, livreurPosition, height = 220 }) {
  const mapRef = useRef(null);

  const pickup =
    delivery.pickup_lat != null && delivery.pickup_lng != null
      ? { latitude: delivery.pickup_lat, longitude: delivery.pickup_lng }
      : null;
  const dropoff =
    delivery.dropoff_lat != null && delivery.dropoff_lng != null
      ? { latitude: delivery.dropoff_lat, longitude: delivery.dropoff_lng }
      : null;
  const livreur = livreurPosition ? { latitude: livreurPosition.lat, longitude: livreurPosition.lng } : null;
  const points = [pickup, dropoff].filter(Boolean);

  // Recentre en douceur la carte sur la position du livreur quand elle change.
  useEffect(() => {
    if (livreur && mapRef.current) {
      mapRef.current.animateToRegion({ ...livreur, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    }
  }, [livreur?.latitude, livreur?.longitude]);

  if (!pickup && !dropoff) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Localisation non précisée pour cette livraison</Text>
      </View>
    );
  }

  const initialRegion = pickup
    ? { ...pickup, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : dropoff
      ? { ...dropoff, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : COTONOU_REGION;

  return (
    <View>
      <MapView ref={mapRef} style={[styles.map, { height }]} initialRegion={initialRegion}>
        {pickup && (
          <Marker coordinate={pickup} pinColor={colors.green600} title="Point de retrait" description={delivery.pickup_address} />
        )}
        {dropoff && (
          <Marker coordinate={dropoff} pinColor={colors.red600} title="Point de livraison" description={delivery.dropoff_address} />
        )}
        {points.length === 2 && <Polyline coordinates={points} strokeColor={colors.orange500} strokeWidth={3} lineDashPattern={[6, 8]} />}
        {livreur && (
          <Marker coordinate={livreur} title="Position du livreur (en direct)">
            <View style={styles.livreurMarker}>
              <Text style={styles.livreurEmoji}>🏍️</Text>
            </View>
          </Marker>
        )}
      </MapView>
      {livreurPosition && (
        <Text style={styles.updated}>
          📍 Position du livreur mise à jour {new Date(livreurPosition.at).toLocaleTimeString('fr-FR')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', borderRadius: radius.md },
  empty: {
    borderRadius: radius.md,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: colors.slate400, fontSize: 13 },
  livreurMarker: {
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.orange500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livreurEmoji: { fontSize: 16 },
  updated: { fontSize: 11, color: colors.slate400, marginTop: 4 },
});
