import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../lib/api';

// Position en direct du livreur pendant une course active : on rejoint le
// canal Socket.io de la livraison pour recevoir les mises à jour en temps
// réel, avec une lecture REST initiale en repli le temps que le socket se
// connecte (ou si le socket est momentanément coupé).
export default function useLivePosition(deliveryId, active) {
  const [position, setPosition] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!deliveryId || !active) {
      setPosition(null);
      return;
    }

    let cancelled = false;

    api.get(`/deliveries/${deliveryId}/position`)
      .then((res) => { if (!cancelled && res.data.position) setPosition(res.data.position); })
      .catch(() => {});

    const token = localStorage.getItem('cc_token');
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.emit('rejoindre_livraison', { deliveryId: Number(deliveryId), token });
    socket.on('position', (data) => { if (!cancelled) setPosition(data); });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [deliveryId, active]);

  return position;
}
