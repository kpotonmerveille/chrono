import { Router } from 'express';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { broadcastAlerte } from '../socket.js';

const router = Router();

// Le livreur déclenche une alerte SOS (danger) ou signale une panne, avec sa
// position exacte au moment du déclenchement. Diffusée immédiatement à
// l'admin (alarme sonore + position) via Socket.io, en plus d'être stockée
// pour que l'admin la voie même si elle n'était pas connectée à l'instant T.
router.post('/', authRequired, requireRole('livreur'), (req, res) => {
  const { type, message, lat, lng, deliveryId } = req.body;
  if (!['danger', 'panne'].includes(type)) {
    return res.status(400).json({ error: 'Type d\'alerte invalide (danger ou panne attendu)' });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Position (lat/lng) requise pour déclencher une alerte' });
  }

  let deliveryIdToStore = null;
  if (deliveryId) {
    const delivery = db.prepare('SELECT id FROM deliveries WHERE id = ? AND livreur_id = ?').get(deliveryId, req.user.id);
    if (delivery) deliveryIdToStore = delivery.id;
  }

  const result = db.prepare(`
    INSERT INTO livreur_alerts (livreur_id, delivery_id, type, message, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, deliveryIdToStore, type, message || null, lat, lng);

  const alert = db.prepare(`
    SELECT a.*, u.name as livreur_name, u.phone as livreur_phone, u.vehicle as livreur_vehicle
    FROM livreur_alerts a
    JOIN users u ON u.id = a.livreur_id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  broadcastAlerte(alert);

  res.status(201).json({ alert });
});

// Liste des alertes pour l'admin — les actives d'abord, puis les plus
// récentes résolues, pour garder un historique consultable.
router.get('/', authRequired, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name as livreur_name, u.phone as livreur_phone, u.vehicle as livreur_vehicle
    FROM livreur_alerts a
    JOIN users u ON u.id = a.livreur_id
    ORDER BY (a.status = 'active') DESC, a.created_at DESC
    LIMIT 100
  `).all();
  res.json({ alertes: rows });
});

// L'admin marque une alerte comme résolue (police/dépannage envoyés, ou
// fausse alerte), avec une note optionnelle pour garder une trace.
router.patch('/:id/resoudre', authRequired, requireRole('admin'), (req, res) => {
  const alert = db.prepare('SELECT * FROM livreur_alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alerte introuvable' });
  if (alert.status === 'resolue') return res.status(400).json({ error: 'Alerte déjà résolue' });

  db.prepare(`
    UPDATE livreur_alerts SET status = 'resolue', resolved_note = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.body.note || null, req.params.id);

  const updated = db.prepare(`
    SELECT a.*, u.name as livreur_name, u.phone as livreur_phone, u.vehicle as livreur_vehicle
    FROM livreur_alerts a
    JOIN users u ON u.id = a.livreur_id
    WHERE a.id = ?
  `).get(req.params.id);

  broadcastAlerte(updated);

  res.json({ alerte: updated });
});

export default router;
