import { Router } from 'express';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { getRoadDistanceKm, estimatePrice, generateConfirmationCode } from '../pricing.js';
import { broadcastPosition, broadcastStatus } from '../socket.js';

const router = Router();

function toPublic(delivery) {
  // Le code de confirmation n'est visible que par le client (pour le transmettre au livreur à la remise)
  return delivery;
}

// Estimation de prix avant de créer la demande
router.post('/estimer', authRequired, async (req, res) => {
  const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
  const { distanceKm, source } = await getRoadDistanceKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const estimation = estimatePrice({ distanceKm });
  res.json({
    distance_km: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
    distance_source: source,
    ...estimation,
  });
});

// Le client crée une demande de livraison
router.post('/', authRequired, requireRole('client'), async (req, res) => {
  const {
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    recipient_name, recipient_phone,
    package_description, package_size
  } = req.body;

  if (!pickup_address || !dropoff_address || !recipient_name || !recipient_phone) {
    return res.status(400).json({ error: 'Adresses et informations du destinataire requises' });
  }

  const { distanceKm, source } = await getRoadDistanceKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const estimation = estimatePrice({ distanceKm });
  const code = generateConfirmationCode();

  const result = db.prepare(`
    INSERT INTO deliveries (
      client_id, pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone, package_description, package_size,
      distance_km, distance_source, zone, delai_garanti, price, confirmation_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, pickup_address, pickup_lat ?? null, pickup_lng ?? null,
    dropoff_address, dropoff_lat ?? null, dropoff_lng ?? null,
    recipient_name, recipient_phone, package_description || null, package_size || 'petit',
    distanceKm, source, estimation.zone, estimation.delaiGaranti ? 1 : 0, estimation.price, code
  );

  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ delivery });
});

// Livraisons du client connecté
router.get('/mine', authRequired, requireRole('client'), (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, u.name as livreur_name, u.phone as livreur_phone, u.rating_avg as livreur_rating
    FROM deliveries d LEFT JOIN users u ON u.id = d.livreur_id
    WHERE d.client_id = ? ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json({ deliveries: rows });
});

// Livraisons assignées au livreur connecté
router.get('/assignees', authRequired, requireRole('livreur'), (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, u.name as client_name, u.phone as client_phone
    FROM deliveries d LEFT JOIN users u ON u.id = d.client_id
    WHERE d.livreur_id = ? ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json({ deliveries: rows });
});

// Demandes en attente, disponibles pour un livreur vérifié et disponible
router.get('/disponibles', authRequired, requireRole('livreur'), (req, res) => {
  const livreur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!livreur.verified) {
    return res.status(403).json({ error: "Compte non encore vérifié par l'administration" });
  }
  if (!livreur.available) {
    return res.json({ deliveries: [] });
  }
  const rows = db.prepare(`
    SELECT d.*, u.name as client_name
    FROM deliveries d LEFT JOIN users u ON u.id = d.client_id
    WHERE d.status = 'en_attente' AND d.payment_status = 'paye'
    ORDER BY d.created_at ASC
  `).all();
  res.json({ deliveries: rows });
});

router.get('/:id', authRequired, (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  const isOwner = req.user.role === 'client' && delivery.client_id === req.user.id;
  const isLivreur = req.user.role === 'livreur' && delivery.livreur_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isLivreur && !isAdmin) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  // Le code de confirmation n'est renvoyé qu'au client (le livreur doit se le faire donner en main propre)
  const payload = { ...delivery };
  if (!isOwner && !isAdmin) delete payload.confirmation_code;
  res.json({ delivery: payload });
});

// Un livreur disponible et vérifié accepte une course
router.post('/:id/accepter', authRequired, requireRole('livreur'), (req, res) => {
  const livreur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!livreur.verified) return res.status(403).json({ error: "Compte non vérifié" });
  if (!livreur.available) return res.status(403).json({ error: "Vous devez être disponible pour accepter une course" });

  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  if (delivery.status !== 'en_attente') {
    return res.status(409).json({ error: 'Cette livraison a déjà été prise en charge ou annulée' });
  }
  if (delivery.payment_status !== 'paye') {
    return res.status(409).json({ error: "Le paiement n'a pas encore été confirmé" });
  }

  db.prepare(`UPDATE deliveries SET livreur_id = ?, status = 'acceptee', accepted_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(req.user.id, delivery.id);

  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Le livreur envoie sa position GPS pendant une course active (repli REST en
// plus du canal temps réel Socket.io, utile pour l'app mobile ou en cas de
// coupure du socket).
router.post('/:id/position', authRequired, requireRole('livreur'), (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Coordonnées invalides' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.livreur_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (!['acceptee', 'recuperee', 'en_route'].includes(delivery.status)) {
    return res.status(409).json({ error: "Cette livraison n'est pas active" });
  }
  db.prepare('UPDATE users SET last_lat = ?, last_lng = ?, last_position_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(lat, lng, req.user.id);
  const payload = { lat, lng, at: new Date().toISOString() };
  broadcastPosition(delivery.id, payload);
  res.json({ ok: true, position: payload });
});

// Le client (ou l'admin) récupère la dernière position connue du livreur
router.get('/:id/position', authRequired, (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  const isOwner = req.user.role === 'client' && delivery.client_id === req.user.id;
  const isLivreur = req.user.role === 'livreur' && delivery.livreur_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isLivreur && !isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  if (!delivery.livreur_id) return res.json({ position: null });
  const livreur = db.prepare('SELECT last_lat, last_lng, last_position_at FROM users WHERE id = ?').get(delivery.livreur_id);
  if (livreur.last_lat === null || livreur.last_lng === null) return res.json({ position: null });
  res.json({ position: { lat: livreur.last_lat, lng: livreur.last_lng, at: livreur.last_position_at } });
});

const STATUS_FLOW = ['acceptee', 'recuperee', 'en_route'];

// Le livreur fait progresser le statut (récupéré -> en route)
router.patch('/:id/statut', authRequired, requireRole('livreur'), (req, res) => {
  const { statut } = req.body;
  if (!STATUS_FLOW.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.livreur_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  const currentIdx = STATUS_FLOW.indexOf(delivery.status);
  const nextIdx = STATUS_FLOW.indexOf(statut);
  if (nextIdx !== currentIdx + 1) {
    return res.status(409).json({ error: 'Transition de statut invalide' });
  }
  const timestampCol = statut === 'recuperee' ? 'picked_up_at' : null;
  if (timestampCol) {
    db.prepare(`UPDATE deliveries SET status = ?, ${timestampCol} = CURRENT_TIMESTAMP WHERE id = ?`).run(statut, delivery.id);
  } else {
    db.prepare(`UPDATE deliveries SET status = ? WHERE id = ?`).run(statut, delivery.id);
  }
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Livraison finale : le livreur doit saisir le code de confirmation donné par le destinataire/client
router.post('/:id/livrer', authRequired, requireRole('livreur'), (req, res) => {
  const { code } = req.body;
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.livreur_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (delivery.status !== 'en_route') {
    return res.status(409).json({ error: 'La livraison doit être en route avant confirmation' });
  }
  if (code !== delivery.confirmation_code) {
    return res.status(400).json({ error: 'Code de confirmation incorrect' });
  }
  db.prepare(`UPDATE deliveries SET status = 'livree', delivered_at = CURRENT_TIMESTAMP WHERE id = ?`).run(delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Le client annule tant que personne n'a accepté
router.post('/:id/annuler', authRequired, requireRole('client'), (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.client_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (!['en_attente', 'acceptee'].includes(delivery.status)) {
    return res.status(409).json({ error: 'Impossible d\'annuler à ce stade' });
  }
  db.prepare(`UPDATE deliveries SET status = 'annulee', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Avis du client sur le livreur après livraison
router.post('/:id/avis', authRequired, requireRole('client'), (req, res) => {
  const { rating, comment } = req.body;
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.client_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (delivery.status !== 'livree') {
    return res.status(409).json({ error: 'La livraison doit être terminée' });
  }
  const already = db.prepare('SELECT id FROM reviews WHERE delivery_id = ?').get(delivery.id);
  if (already) return res.status(409).json({ error: 'Avis déjà laissé pour cette livraison' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Note invalide (1 à 5)' });
  }

  db.prepare(`INSERT INTO reviews (delivery_id, client_id, livreur_id, rating, comment) VALUES (?, ?, ?, ?, ?)`)
    .run(delivery.id, req.user.id, delivery.livreur_id, rating, comment || null);

  const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE livreur_id = ?').get(delivery.livreur_id);
  db.prepare('UPDATE users SET rating_avg = ?, rating_count = ? WHERE id = ?')
    .run(Math.round(stats.avg * 10) / 10, stats.count, delivery.livreur_id);

  res.status(201).json({ ok: true });
});

export default router;
