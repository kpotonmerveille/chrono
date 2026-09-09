import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../lib/api';

const MIN_INTERVAL_MS = 6000;

// Le livreur envoie sa position GPS pendant une course active, au fil de ses
// déplacements (avec un minimum de ~6s entre deux envois), via Socket.io —
// avec repli REST si le socket est momentanément indisponible.
export default function useSendPosition(deliveryId, active) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!deliveryId || !active) return;
    if (!('geolocation' in navigator)) return;

    const token = localStorage.getItem('cc_token');
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent < MIN_INTERVAL_MS) return;
        lastSent = now;
        const { latitude: lat, longitude: lng } = pos.coords;
        if (socket.connected) {
          socket.emit('position_livreur', { deliveryId: Number(deliveryId), token, lat, lng });
        } else {
          api.post(`/deliveries/${deliveryId}/position`, { lat, lng }).catch(() => {});
        }
      },
      () => { /* géolocalisation refusée ou indisponible : on ignore silencieusement */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      socket.disconnect();
    };
  }, [deliveryId, active]);
}
