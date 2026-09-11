import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import {
  getRoadDistanceKm, estimatePrice, generateConfirmationCode, INSURANCE_FEE,
  haversineKm, computeGroupDiscount, computeReturnFee,
  GROUP_MAX_MEMBERS, GROUP_MATCH_RADIUS_KM, GROUP_MATCH_WINDOW_MINUTES,
} from '../pricing.js';
import { broadcastPosition, broadcastStatus } from '../socket.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const voiceNotesDir = path.join(__dirname, '..', '..', 'uploads', 'notes-vocales');
fs.mkdirSync(voiceNotesDir, { recursive: true });

const ALLOWED_AUDIO_MIME = ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/3gpp', 'audio/ogg'];
const voiceNoteUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, voiceNotesDir),
    filename: (req, file, cb) => cb(null, `livraison-${req.params.id}-${req.params.point}-${Date.now()}${path.extname(file.originalname) || '.m4a'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo, largement assez pour une note de quelques dizaines de secondes
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AUDIO_MIME.includes(file.mimetype)) {
      return cb(new Error('Format audio non autorisé'));
    }
    cb(null, true);
  },
});

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
    insurance_fee: INSURANCE_FEE,
    price_avec_assurance: estimation.price + INSURANCE_FEE,
  });
});

// Le client crée une demande de livraison
router.post('/', authRequired, requireRole('client'), async (req, res) => {
  const {
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    recipient_name, recipient_phone,
    package_description, package_size,
    payer_type, insured,
    join_group_delivery_id,
    payment_method,
  } = req.body;

  if (!pickup_address || !dropoff_address || !recipient_name || !recipient_phone) {
    return res.status(400).json({ error: 'Adresses et informations du destinataire requises' });
  }
  const resolvedPayerType = payer_type === 'destinataire' ? 'destinataire' : 'expediteur';
  const isInsured = insured === true || insured === 'true' || insured === 1 ? 1 : 0;

  const { distanceKm, source } = await getRoadDistanceKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const estimation = estimatePrice({ distanceKm });
  const insuranceFee = isInsured ? INSURANCE_FEE : 0;

  // Livraison groupée : on revalide le candidat au moment de la création
  // (il peut avoir été pris entre-temps) plutôt que de faire confiance à
  // l'aperçu affiché plus tôt dans le formulaire.
  let groupId = null;
  let groupDiscount = 0;
  let groupJoinFailed = false;
  if (join_group_delivery_id) {
    const candidate = findGroupableCandidate({
      clientId: req.user.id, zone: estimation.zone, pickupLat: pickup_lat, pickupLng: pickup_lng,
    });
    if (candidate && candidate.id === Number(join_group_delivery_id)) {
      groupId = candidate.group_id;
      if (!groupId) {
        const groupResult = db.prepare('INSERT INTO delivery_groups (zone) VALUES (?)').run(estimation.zone);
        groupId = groupResult.lastInsertRowid;
        db.prepare('UPDATE deliveries SET group_id = ? WHERE id = ?').run(groupId, candidate.id);
      }
      groupDiscount = computeGroupDiscount(estimation.price);
    } else {
      groupJoinFailed = true; // le candidat n'est plus disponible (déjà pris, groupe complet...)
    }
  }

  const totalPrice = Math.max(0, estimation.price - groupDiscount) + insuranceFee;

  // Portefeuille Chrono : le client peut payer directement avec son solde
  // prépayé (uniquement quand c'est lui qui paie — pas pour le paiement à
  // la réception par le destinataire).
  const useWallet = payment_method === 'wallet' && resolvedPayerType === 'expediteur';
  if (useWallet) {
    const client = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.user.id);
    if (client.wallet_balance < totalPrice) {
      return res.status(409).json({ error: `Solde insuffisant (${client.wallet_balance} F disponible pour ${totalPrice} F) — rechargez votre portefeuille ou choisissez un autre moyen de paiement.` });
    }
  }

  const code = generateConfirmationCode();
  const shareToken = crypto.randomBytes(12).toString('hex');

  const createDelivery = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO deliveries (
        client_id, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng,
        recipient_name, recipient_phone, package_description, package_size,
        distance_km, distance_source, zone, delai_garanti, price, confirmation_code,
        share_token, payer_type, insured, insurance_fee, group_id, group_discount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, pickup_address, pickup_lat ?? null, pickup_lng ?? null,
      dropoff_address, dropoff_lat ?? null, dropoff_lng ?? null,
      recipient_name, recipient_phone, package_description || null, package_size || 'petit',
      distanceKm, source, estimation.zone, estimation.delaiGaranti ? 1 : 0, totalPrice, code,
      shareToken, resolvedPayerType, isInsured, insuranceFee, groupId, groupDiscount
    );
    const newId = result.lastInsertRowid;

    if (useWallet) {
      db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(totalPrice, req.user.id);
      db.prepare(`
        INSERT INTO wallet_transactions (user_id, type, amount, delivery_id, status)
        VALUES (?, 'debit', ?, ?, 'reussie')
      `).run(req.user.id, totalPrice, newId);
      db.prepare(`UPDATE deliveries SET payment_status = 'paye' WHERE id = ?`).run(newId);
    }

    return newId;
  });

  const newId = createDelivery();
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(newId);
  res.status(201).json({ delivery, group_join_failed: groupJoinFailed });
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
    SELECT d.*, u.name as client_name, u.phone as client_phone,
      CASE WHEN d.group_id IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM deliveries d2 WHERE d2.group_id = d.group_id) END as group_size
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
    SELECT d.*, u.name as client_name,
      CASE WHEN d.group_id IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM deliveries d2 WHERE d2.group_id = d.group_id) END as group_size
    FROM deliveries d LEFT JOIN users u ON u.id = d.client_id
    WHERE d.status = 'en_attente' AND d.payment_status = 'paye'
    ORDER BY d.created_at ASC
  `).all();
  res.json({ deliveries: rows });
});

// Cherche une livraison compagnon "rejoignable" (même zone, point de
// retrait proche, encore en attente, groupe pas déjà plein, pas la sienne)
// pour proposer au client un prix réduit AVANT qu'il crée sa demande — la
// grille de prix reste fixée à la création, sans négociation ni recalcul
// après coup.
function findGroupableCandidate({ clientId, zone, pickupLat, pickupLng }) {
  if (typeof pickupLat !== 'number' || typeof pickupLng !== 'number') return null;
  const candidates = db.prepare(`
    SELECT * FROM deliveries
    WHERE status = 'en_attente' AND client_id != ? AND zone = ?
      AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL
      AND datetime(created_at) > datetime('now', ?)
    ORDER BY created_at DESC
  `).all(clientId, zone, `-${GROUP_MATCH_WINDOW_MINUTES} minutes`);

  for (const candidate of candidates) {
    const distanceKm = haversineKm(pickupLat, pickupLng, candidate.pickup_lat, candidate.pickup_lng);
    if (distanceKm === null || distanceKm > GROUP_MATCH_RADIUS_KM) continue;
    const memberCount = candidate.group_id
      ? db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE group_id = ?`).get(candidate.group_id).n
      : 1;
    if (memberCount >= GROUP_MAX_MEMBERS) continue;
    return candidate;
  }
  return null;
}

// Le client vérifie, avant de créer sa demande, s'il peut rejoindre une
// livraison compagnon (économie affichée en direct dans le formulaire).
router.get('/groupable', authRequired, requireRole('client'), (req, res) => {
  const zone = req.query.zone;
  const pickupLat = req.query.pickup_lat !== undefined ? Number(req.query.pickup_lat) : null;
  const pickupLng = req.query.pickup_lng !== undefined ? Number(req.query.pickup_lng) : null;
  if (!zone || pickupLat === null || pickupLng === null || Number.isNaN(pickupLat) || Number.isNaN(pickupLng)) {
    return res.json({ candidate: null });
  }
  const candidate = findGroupableCandidate({ clientId: req.user.id, zone, pickupLat, pickupLng });
  if (!candidate) return res.json({ candidate: null });
  const discount = computeGroupDiscount(candidate.price);
  res.json({
    candidate: {
      delivery_id: candidate.id,
      pickup_address: candidate.pickup_address,
      dropoff_address_zone: candidate.zone,
      discount_fcfa: discount,
    },
  });
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
  if (delivery.group_id) {
    delivery.group_size = db.prepare('SELECT COUNT(*) as n FROM deliveries WHERE group_id = ?').get(delivery.group_id).n;
  } else {
    delivery.group_size = 1;
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

  // Livraison groupée : accepter l'une accepte tout le groupe en un seul
  // trajet — mais uniquement les livraisons du groupe déjà payées et encore
  // en attente (une livraison compagnon pas encore payée par son client
  // n'est jamais assignée à un livreur, groupée ou non).
  const memberIds = delivery.group_id
    ? db.prepare(`SELECT id FROM deliveries WHERE group_id = ? AND status = 'en_attente' AND payment_status = 'paye'`).all(delivery.group_id).map((r) => r.id)
    : [delivery.id];

  const acceptGroup = db.transaction(() => {
    const stmt = db.prepare(`UPDATE deliveries SET livreur_id = ?, status = 'acceptee', accepted_at = CURRENT_TIMESTAMP WHERE id = ?`);
    for (const id of memberIds) stmt.run(req.user.id, id);
  });
  acceptGroup();

  for (const id of memberIds) {
    const updatedMember = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
    broadcastStatus(id, updatedMember);
  }

  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  res.json({ delivery: updated, group_members_accepted: memberIds.length });
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

// Le client joint une note vocale (10-30s) aux instructions de retrait ou de
// livraison — utile quand un repère ("en face du carrefour X") vaut mieux
// qu'une adresse écrite précise. Remplace la note précédente si renvoyée.
router.post('/:id/note-vocale/:point', authRequired, requireRole('client'), (req, res) => {
  const { point } = req.params;
  if (!['retrait', 'livraison'].includes(point)) {
    return res.status(400).json({ error: 'Point invalide (retrait ou livraison)' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.client_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  voiceNoteUpload.single('note')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const column = point === 'retrait' ? 'pickup_voice_note_path' : 'dropoff_voice_note_path';
    const previous = delivery[column];
    db.prepare(`UPDATE deliveries SET ${column} = ? WHERE id = ?`).run(req.file.path, delivery.id);
    if (previous && previous !== req.file.path && fs.existsSync(previous)) fs.unlink(previous, () => {});
    res.status(201).json({ ok: true });
  });
});

// Écoute d'une note vocale — accessible au client, au livreur assigné et à
// l'admin (comme le reste des détails d'une livraison).
router.get('/:id/note-vocale/:point', authRequired, (req, res) => {
  const { point } = req.params;
  if (!['retrait', 'livraison'].includes(point)) return res.status(400).json({ error: 'Point invalide' });
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  const isOwner = req.user.role === 'client' && delivery.client_id === req.user.id;
  const isLivreur = req.user.role === 'livreur' && delivery.livreur_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isLivreur && !isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const filePath = point === 'retrait' ? delivery.pickup_voice_note_path : delivery.dropoff_voice_note_path;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Aucune note vocale' });
  res.sendFile(filePath);
});

// Le client ouvre une réclamation sur un colis assuré (cassé, perdu...).
// Examinée ensuite par l'admin (voir routes/admin.js).
router.post('/:id/reclamation', authRequired, requireRole('client'), (req, res) => {
  const { description } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Merci de décrire le problème rencontré' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.client_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (!delivery.insured) return res.status(409).json({ error: "Cette livraison n'est pas assurée" });
  if (delivery.claim_status !== 'aucun') return res.status(409).json({ error: 'Une réclamation existe déjà pour cette livraison' });

  db.prepare(`
    UPDATE deliveries SET claim_status = 'en_cours', claim_description = ?, claim_created_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(description.trim(), delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  res.status(201).json({ delivery: updated });
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
  if (delivery.return_status !== 'aucun') {
    return res.status(409).json({ error: 'Cette livraison est en retour — le destinataire a refusé le colis' });
  }
  if (code !== delivery.confirmation_code) {
    return res.status(400).json({ error: 'Code de confirmation incorrect' });
  }
  db.prepare(`UPDATE deliveries SET status = 'livree', delivered_at = CURRENT_TIMESTAMP WHERE id = ?`).run(delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Retour automatique : le destinataire refuse le colis à la livraison (ne
// veut plus, ne peut pas payer, mauvaise adresse...). Le livreur signale le
// retour avec un motif au lieu de rester bloqué sans code de confirmation.
router.post('/:id/retour', authRequired, requireRole('livreur'), (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Merci de préciser le motif du refus' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.livreur_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (!['recuperee', 'en_route'].includes(delivery.status)) {
    return res.status(409).json({ error: 'Le colis doit avoir été récupéré avant de signaler un retour' });
  }
  if (delivery.return_status !== 'aucun') {
    return res.status(409).json({ error: 'Un retour est déjà en cours pour cette livraison' });
  }
  const returnFee = computeReturnFee(delivery.price);
  db.prepare(`
    UPDATE deliveries SET return_status = 'demande', return_reason = ?, return_fee = ?, return_requested_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reason.trim(), returnFee, delivery.id);
  const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
  broadcastStatus(delivery.id, updated);
  res.json({ delivery: updated });
});

// Le livreur confirme avoir rapporté le colis à l'expéditeur — clôture la
// livraison (jamais remise au destinataire, donc annulée) et le retour.
router.post('/:id/retour/termine', authRequired, requireRole('livreur'), (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.livreur_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (delivery.return_status !== 'demande') {
    return res.status(409).json({ error: 'Aucun retour en cours pour cette livraison' });
  }
  db.prepare(`
    UPDATE deliveries SET return_status = 'retournee', return_completed_at = CURRENT_TIMESTAMP,
      status = 'annulee', cancelled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(delivery.id);
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
