import { Router } from 'express';
import db from '../db.js';
import { authRequired } from '../auth.js';
import { haversineKm, FLOOD_ALERT_RADIUS_KM, ALERT_TYPES } from '../pricing.js';

const router = Router();

const MAX_DESCRIPTION_LENGTH = 300;
const ALERT_TYPE_KEYS = Object.keys(ALERT_TYPES);

// Une alerte est "active" si elle n'a pas été levée et qu'elle n'a pas
// dépassé la durée de vie propre à SON type (voir ALERT_TYPES dans
// pricing.js — une voie barrée pour travaux dure plus longtemps qu'une route
// inondée, par exemple). Le calcul se fait côté SQL pour rester exact même
// si le serveur tourne plusieurs jours sans redémarrer.
const ACTIVE_CLAUSE = `resolved_at IS NULL AND (${ALERT_TYPE_KEYS
  .map((key) => `(type = '${key}' AND created_at > datetime('now', '-${ALERT_TYPES[key].ttlHours} hours'))`)
  .join(' OR ')})`;

function attachReporter(alert) {
  if (!alert) return alert;
  const reporter = db.prepare('SELECT name, role FROM users WHERE id = ?').get(alert.reporter_id);
  return { ...alert, reporter_name: reporter?.name || null, reporter_role: reporter?.role || null };
}

// Un client ou un livreur signale un incident (route inondée, voie barrée
// pour travaux, panne électrique/poteau tombé) à un endroit précis, avec la
// ville, le quartier exact et une courte description optionnelle. Purement
// déclaratif : aucune vérification automatique de l'information.
router.post('/', authRequired, (req, res) => {
  const { type, lat, lng, ville, quartier, description } = req.body;
  if (!ALERT_TYPE_KEYS.includes(type)) {
    return res.status(400).json({ error: `Type de signalement invalide (attendu : ${ALERT_TYPE_KEYS.join(', ')})` });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Position (lat/lng) requise pour signaler un incident' });
  }
  if (!quartier || !quartier.trim()) {
    return res.status(400).json({ error: 'Le quartier exact est requis' });
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `Description trop longue (max ${MAX_DESCRIPTION_LENGTH} caractères)` });
  }

  const result = db.prepare(`
    INSERT INTO flood_alerts (reporter_id, type, lat, lng, ville, quartier, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, type, lat, lng, ville?.trim() || null, quartier.trim(), description?.trim() || null);

  const alert = db.prepare('SELECT * FROM flood_alerts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ alerte: attachReporter(alert) });
});

// Liste des alertes actives, pour affichage sur une carte ou en liste (client
// et livreur, la sécurité routière concerne tout le monde). Les plus
// récentes d'abord. Le filtrage par ville/quartier/type et la recherche se
// font côté client (peu de volume, pas besoin d'aller-retour serveur à
// chaque frappe).
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
// alerte active, quel que soit son type — appelé pendant l'estimation d'une
// nouvelle demande, sur le même principe que GET /deliveries/groupable : un
// simple avertissement informatif, qui ne bloque jamais la création de la
// demande.
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

// L'auteur du signalement (l'incident est résolu) ou l'admin (nettoyage/faux
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
