import { io } from 'socket.io-client';
import { API_URL } from './api';

// Le serveur Socket.io du backend est exposé sur la même origine que l'API
// REST, mais SANS le suffixe "/api"
// (ex: API = http://192.168.1.10:4000/api -> socket = http://192.168.1.10:4000).
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

// On force le transport WebSocket (plus fiable que le "long polling" HTTP
// dans l'environnement React Native) pour rejoindre le canal temps réel
// d'une livraison (position du livreur, mises à jour de statut).
export function createSocket() {
  return io(SOCKET_URL, { path: '/socket.io', transports: ['websocket'] });
}
