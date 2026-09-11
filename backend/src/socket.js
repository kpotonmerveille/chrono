import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

let io = null;

function deliveryRoom(deliveryId) {
  return `livraison:${deliveryId}`;
}

/**
 * Géolocalisation en direct pendant une course.
 * Le livreur envoie sa position (via l'app ou le site), on la diffuse en
 * temps réel à tous les abonnés de la livraison (le client qui suit sa
 * course, l'admin). On la stocke aussi en base pour un accès par polling
 * (utile si le socket se déconnecte un instant).
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    // Le client (ou l'admin, ou le livreur) rejoint le canal d'une livraison
    // pour recevoir les mises à jour de position/statut en direct.
    socket.on('rejoindre_livraison', ({ deliveryId, token }) => {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
        if (!delivery) return;
        const allowed =
          (payload.role === 'client' && delivery.client_id === payload.id) ||
          (payload.role === 'livreur' && delivery.livreur_id === payload.id) ||
          payload.role === 'admin';
        if (!allowed) return;
        socket.join(deliveryRoom(deliveryId));
      } catch {
        /* jeton invalide ou expiré : on ignore silencieusement */
      }
    });

    // Suivi public ("suivi sans app") : pas de JWT, juste le token de partage
    // de la livraison — voir routes/public.js.
    socket.on('rejoindre_suivi_public', ({ deliveryId, shareToken }) => {
      if (!shareToken) return;
      const delivery = db.prepare('SELECT id FROM deliveries WHERE id = ? AND share_token = ?').get(deliveryId, shareToken);
      if (!delivery) return;
      socket.join(deliveryRoom(deliveryId));
    });

    // L'admin rejoint le canal global des alertes SOS pour recevoir l'alarme
    // et la position exacte dès qu'un livreur déclenche une alerte, où qu'il
    // soit (pas forcément en pleine course suivie).
    socket.on('rejoindre_admin', ({ token }) => {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'admin') return;
        socket.join('admins');
      } catch {
        /* jeton invalide ou expiré : on ignore silencieusement */
      }
    });

    // Le livreur pousse sa position GPS pendant une course active
    socket.on('position_livreur', ({ deliveryId, token, lat, lng }) => {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'livreur') return;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
        if (!delivery || delivery.livreur_id !== payload.id) return;
        if (!['acceptee', 'recuperee', 'en_route'].includes(delivery.status)) return;

        db.prepare('UPDATE users SET last_lat = ?, last_lng = ?, last_position_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(lat, lng, payload.id);

        io.to(deliveryRoom(deliveryId)).emit('position', { lat, lng, at: new Date().toISOString() });
      } catch {
        /* jeton invalide ou expiré : on ignore silencieusement */
      }
    });
  });

  return io;
}

export function broadcastPosition(deliveryId, payload) {
  if (io) io.to(deliveryRoom(deliveryId)).emit('position', payload);
}

// Diffuse une livraison mise à jour (changement de statut, paiement confirmé...)
// à tous les abonnés du canal, pour un suivi en direct sans avoir à rafraîchir.
export function broadcastStatus(deliveryId, delivery) {
  if (io) io.to(deliveryRoom(deliveryId)).emit('livraison_mise_a_jour', delivery);
}

// Diffuse une nouvelle alerte SOS (ou une résolution) à tous les admins
// connectés, en temps réel — c'est ce qui déclenche l'alarme sonore et
// l'affichage de la position sur le tableau de bord admin.
export function broadcastAlerte(alert) {
  if (io) io.to('admins').emit('alerte_sos', alert);
}

export function getIo() {
  return io;
}
