import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { TOKEN_KEY } from '../lib/api';
import { createSocket } from '../lib/socket';

// Rejoint le canal temps réel Socket.io d'une livraison pendant qu'elle est
// active. Combine deux besoins pour n'ouvrir qu'une seule connexion par
// écran de détail :
//  - la position en direct du livreur (avec une lecture REST initiale en
//    repli, le temps que le socket se connecte) ;
//  - les mises à jour de statut/paiement (événement "livraison_mise_a_jour"),
//    pour rafraîchir l'écran sans avoir à faire du polling agressif.
//
// `withPosition` : mettre à true côté client (le livreur, lui, ENVOIE sa
// position via useSendPosition plutôt que de la recevoir).
// `onUpdate` : callback appelé avec la livraison à jour à chaque événement.
export default function useLivePosition(deliveryId, active, { withPosition = true, onUpdate } = {}) {
  const [position, setPosition] = useState(null);
  const socketRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!deliveryId || !active) {
      setPosition(null);
      return undefined;
    }

    let cancelled = false;

    if (withPosition) {
      api
        .get(`/deliveries/${deliveryId}/position`)
        .then((res) => {
          if (!cancelled && res.data.position) setPosition(res.data.position);
        })
        .catch(() => {});
    }

    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (cancelled) return;
      const socket = createSocket();
      socketRef.current = socket;
      socket.emit('rejoindre_livraison', { deliveryId: Number(deliveryId), token });
      if (withPosition) {
        socket.on('position', (data) => {
          if (!cancelled) setPosition(data);
        });
      }
      socket.on('livraison_mise_a_jour', (delivery) => {
        if (!cancelled) onUpdateRef.current?.(delivery);
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [deliveryId, active, withPosition]);

  return position;
}
