import { Router } from 'express';
import db from '../db.js';
import { authRequired } from '../auth.js';
import { haversineKm, FLOOD_ALERT_RADIUS_KM, FLOOD_ALERT_TTL_HOURS } from '../pricing.js';

const router = Router();

const MAX_DESCRIPTION_LENGTH = 300;

// Une alerte est "active" si elle n'a pas été levée et qu'elle n'a pas
// dépassé sa durée de vie (l'eau se retire en quelques heures en général) —
// voir FLOOD_ALERT_TTL_HOURS. Le calcul se fait côté SQL pour rester exact
// même si le serveur tourne plusieurs jours sans redémarrer.
const ACTIVE_CLAUSE = `resolved_at IS NULL AND created_at > datetime('now', '-${FLOOD_ALERT_TTL_HOURS} hours')`;

function attachReporter(alert) {
  if (!alert) return alert;
  const reporter = db.prepare('SELECT name, role FROM users WHERE id = ?').get(alert.reporter_id);
  return { ...alert, reporter_name: reporter?.name || null, reporter_role: reporter?.role || null };
}

// Un client ou un livreur signale qu'une route est inondée/impraticable à un
// endroit précis, avec une courte description optionnelle (repère, gravité).
// Purement déclaratif : aucune vérification automatique de l'information.
router.post('/', authRequired, (req, res) => {
  const { lat, lng, description } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Position (lat/lng) requise pour signaler une route inondée' });
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LENGTH} caractères)` });
  }

  const result = db.prepare(`
    INSERT INTO flood_alerts (reporter_id, lat, lng, description)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, lat, lng, description?.trim() || null);

  const alert = db.prepare('SELECT * FROM flood_alerts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ alerte: attachReporter(alert) });
});

// Liste des alertes actives, pour affichage sur une carte ou en liste (client
// et livreur, la sécurité routière concerne tout le monde). Les plus
// récentes d'abord.
router.get('/', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM flood_alerts
    WHERE ${ACTIVE_CLAUSE}
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  res.json({ alertes: rows.map(attachReporter) });
});

// Vérifie si un trajet (retrait et/ou livraison) passe à proximité d'une
// alerte active — appelé pendant l'estimation d'une nouvelle demande, sur le
// même principe que GET /deliveries/groupable : un simple avertissement
// informatif, qui ne bloque jamais la création de la demande.
router.get('/proximite', authRequired, (req, res) => {
  const pickupLat = req.query.pickup_lat !== undefined ? Number(req.query.pickup_lat) : null;
  const pickupLng = req.query.pickup_lng !== undefined ? Number(req.query.pickup_lng) : null;
  const dropoffLat = req.query.dropoff_lat !== undefined ? Number(req.query.dropoff_lat) : null;
  const dropoffLng = req.query.dropoff_lng !== undefined ? Number(req.query.dropoff_lng) : null;

  const rows = db.prepare(`SELECT * FROM flood_alerts WHERE ${ACTIVE_CLAUSE}`).all();

  const matches = [];
  for (const alert of rows) {
    const distPickup = haversineKm(pickupLat, pickupLng, alert.lat, alert.lng);
    const distDropoff = haversineKm(dropoffLat, dropoffLng, alert.lat, alert.lng);
    const nearPickup = distPickup !== null && distPickup <= FLOOD_ALERT_RADIUS_KM;
    const nearDropoff = distDropoff !== null && distDropoff <= FLOOD_ALERT_RADIUS_KM;
    if (nearPickup || nearDropoff) {
      matches.push({
        ...attachReporter(alert),
        near_pickup: nearPickup,
        near_dropoff: nearDropoff,
      });
    }
  }

  res.json({ alertes: matches });
});

// L'auteur du signalement (l'eau s'est retirée) ou l'admin (nettoyage/faux
// signalement) peut lever une alerte avant sa durée de vie normale.
router.post('/:id/resoudre', authRequired, (req, res) => {
  const alert = db.prepare('SELECT * FROM flood_alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alerte introuvable' });
  if (alert.resolved_at) return res.status(400).json({ error: 'Alerte déjà levée' });
  if (alert.reporter_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Seul l'auteur du signalement ou l'administrateur peut le lever" });
  }

  db.prepare('UPDATE flood_alerts SET resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?')
    .run(req.user.id, req.params.id);

  const updated = db.prepare('SELECT * FROM flood_alerts WHERE id = ?').get(req.params.id);
  res.json({ alerte: attachReporter(updated) });
});

export default router;
