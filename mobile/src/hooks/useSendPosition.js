import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { TOKEN_KEY } from '../lib/api';
import { createSocket } from '../lib/socket';

const MIN_INTERVAL_MS = 7000;

// Le livreur envoie sa position GPS pendant une course active, au fil de ses
// déplacements, via Socket.io — avec repli REST si le socket est
// momentanément indisponible (équivalent de
// frontend/src/hooks/useSendPosition.js). La permission de localisation
// n'est demandée qu'ici, au moment où une course devient active (donc
// typiquement quand le livreur accepte sa première course), jamais au
// lancement de l'app.
export default function useSendPosition(deliveryId, active) {
  const socketRef = useRef(null);
  const watchRef = useRef(null);
  const lastSentRef = useRef(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!deliveryId || !active) return undefined;

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);

      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (cancelled) return;
      const socket = createSocket();
      socketRef.current = socket;

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: MIN_INTERVAL_MS,
          distanceInterval: 20, // mètres
        },
        (loc) => {
          const now = Date.now();
          if (now - lastSentRef.current < MIN_INTERVAL_MS) return;
          lastSentRef.current = now;
          const { latitude: lat, longitude: lng } = loc.coords;
          if (socket.connected) {
            socket.emit('position_livreur', { deliveryId: Number(deliveryId), token, lat, lng });
          } else {
            api.post(`/deliveries/${deliveryId}/position`, { lat, lng }).catch(() => {});
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      watchRef.current?.remove?.();
      watchRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [deliveryId, active]);

  return { permissionDenied };
}
