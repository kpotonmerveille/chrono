import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { VEHICLE_DOCUMENT_TYPES, getVehicleDocumentsSummary } from '../vehicleDocuments.js';
import { PLATFORM_COMMISSION } from '../pricing.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'documents');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `livreur-${req.user.id}-${Date.now()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Format non autorisé (photo JPEG/PNG/WEBP ou PDF uniquement)'));
    }
    cb(null, true);
  },
});

// Même configuration, fichiers nommés avec leur type (carte-grise, etc.)
// pour rester lisibles côté serveur.
const vehicleDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `livreur-${req.user.id}-${req.params.type}-${Date.now()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Format non autorisé (photo JPEG/PNG/WEBP ou PDF uniquement)'));
    }
    cb(null, true);
  },
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT id, role, name, phone, email, zone, vehicle, available, verified,
           rating_avg, rating_count, id_document_status, id_document_uploaded_at,
           id_document_note, is_merchant, merchant_slug, merchant_shop_name,
           merchant_pickup_address, merchant_pickup_lat, merchant_pickup_lng, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (user.role === 'livreur') {
    user.vehicle_documents = getVehicleDocumentsSummary(db, user.id);
  }
  res.json({ user });
});

// --- "Chrono Pro" : profil commerçant + adresses favorites ---
// Un client se déclare commerçant pour que son adresse de boutique soit
// préremplie à chaque nouvelle demande, au lieu de la retaper. `merchant_slug`
// sert de base à un futur lien de boutique public (voir routes/public.js).
router.patch('/me/commerce', authRequired, requireRole('client'), (req, res) => {
  const { shop_name, pickup_address, pickup_lat, pickup_lng } = req.body;
  if (!shop_name || !pickup_address) {
    return res.status(400).json({ error: 'Nom de la boutique et adresse de retrait requis' });
  }
  const user = db.prepare('SELECT merchant_slug FROM users WHERE id = ?').get(req.user.id);
  let slug = user.merchant_slug;
  if (!slug) {
    const base = shop_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'boutique';
    slug = `${base}-${req.user.id}`;
  }
  db.prepare(`
    UPDATE users SET is_merchant = 1, merchant_slug = ?, merchant_shop_name = ?,
      merchant_pickup_address = ?, merchant_pickup_lat = ?, merchant_pickup_lng = ?
    WHERE id = ?
  `).run(slug, shop_name, pickup_address, pickup_lat ?? null, pickup_lng ?? null, req.user.id);
  res.json({ ok: true, merchant_slug: slug });
});

router.get('/me/adresses', authRequired, requireRole('client'), (req, res) => {
  const rows = db.prepare('SELECT * FROM client_addresses WHERE client_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ adresses: rows });
});

router.post('/me/adresses', authRequired, requireRole('client'), (req, res) => {
  const { label, address, lat, lng } = req.body;
  if (!label || !address) return res.status(400).json({ error: 'Libellé et adresse requis' });
  const result = db.prepare(`
    INSERT INTO client_addresses (client_id, label, address, lat, lng) VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, label, address, lat ?? null, lng ?? null);
  const row = db.prepare('SELECT * FROM client_addresses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ adresse: row });
});

router.delete('/me/adresses/:id', authRequired, requireRole('client'), (req, res) => {
  const row = db.prepare('SELECT * FROM client_addresses WHERE id = ? AND client_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Adresse introuvable' });
  db.prepare('DELETE FROM client_addresses WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Le livreur envoie une photo/scan de sa pièce d'identité (CNI, permis de
// conduire...) pour vérification par l'administration. Toute nouvelle
// soumission repasse le statut à "en_attente" ; c'est l'admin qui valide
// (voir routes/admin.js).
router.post('/me/document', authRequired, requireRole('livreur'), (req, res) => {
  documentUpload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    db.prepare(`
      UPDATE users SET id_document_path = ?, id_document_status = 'en_attente',
        id_document_uploaded_at = CURRENT_TIMESTAMP, id_document_note = NULL
      WHERE id = ?
    `).run(req.file.path, req.user.id);
    res.status(201).json({ ok: true, status: 'en_attente' });
  });
});

// Le livreur envoie un document lié à sa moto : carte grise, assurance,
// permis de conduire, ou une photo de la moto. Un type = un document actif ;
// un nouvel envoi remplace le précédent (fichier supprimé du disque) et
// repasse son statut à 'en_attente' pour une nouvelle relecture admin.
router.post('/me/vehicule/:type', authRequired, requireRole('livreur'), (req, res) => {
  const { type } = req.params;
  if (!VEHICLE_DOCUMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  vehicleDocumentUpload.single('document')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const existing = db.prepare(
      'SELECT file_path FROM livreur_documents WHERE user_id = ? AND type = ?'
    ).get(req.user.id, type);

    db.prepare(`
      INSERT INTO livreur_documents (user_id, type, file_path, status, note, uploaded_at, reviewed_at)
      VALUES (?, ?, ?, 'en_attente', NULL, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(user_id, type) DO UPDATE SET
        file_path = excluded.file_path, status = 'en_attente',
        note = NULL, uploaded_at = CURRENT_TIMESTAMP, reviewed_at = NULL
    `).run(req.user.id, type, req.file.path);

    if (existing && existing.file_path && existing.file_path !== req.file.path && fs.existsSync(existing.file_path)) {
      fs.unlink(existing.file_path, () => {});
    }

    res.status(201).json({ ok: true, type, status: 'en_attente' });
  });
});

// Le livreur bascule sa disponibilité
router.patch('/me/disponibilite', authRequired, requireRole('livreur'), (req, res) => {
  const { available } = req.body;
  const livreur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!livreur.verified) {
    return res.status(403).json({ error: "Votre compte livreur n'est pas encore vérifié par l'administration" });
  }
  db.prepare('UPDATE users SET available = ? WHERE id = ?').run(available ? 1 : 0, req.user.id);
  res.json({ ok: true, available: !!available });
});

// Gains d'un livreur : somme de sa VRAIE part (prix - commission plateforme)
// sur les livraisons terminées, pas le prix total payé par le client.
function getLivreurEarnings(livreurId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(price), 0) as total_price, COUNT(*) as nb_livraisons
    FROM deliveries WHERE livreur_id = ? AND status = 'livree'
  `).get(livreurId);
  const total = row.total_price - row.nb_livraisons * PLATFORM_COMMISSION;
  const dejaAvance = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM livreur_advances
    WHERE livreur_id = ? AND status IN ('en_attente', 'approuvee', 'versee')
  `).get(livreurId).total;
  return { total, nb_livraisons: row.nb_livraisons, deja_avance: dejaAvance, disponible_pour_avance: Math.max(0, total - dejaAvance) };
}

router.get('/me/gains', authRequired, requireRole('livreur'), (req, res) => {
  res.json(getLivreurEarnings(req.user.id));
});

// --- Avance sur gains ---
// Le livreur demande à retirer une partie de ce qu'il a déjà gagné avant la
// fin de la journée. Le versement réel (Mobile Money) reste manuel côté
// admin pour l'instant (pas d'API de paiement sortant intégrée) — cette
// route ne fait que suivre la demande.
router.post('/me/avance', authRequired, requireRole('livreur'), (req, res) => {
  const { amount } = req.body;
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }
  const earnings = getLivreurEarnings(req.user.id);
  if (amount > earnings.disponible_pour_avance) {
    return res.status(409).json({ error: `Montant supérieur à ce qui est disponible (${earnings.disponible_pour_avance} F)` });
  }
  const result = db.prepare(`
    INSERT INTO livreur_advances (livreur_id, amount, status) VALUES (?, ?, 'en_attente')
  `).run(req.user.id, amount);
  const row = db.prepare('SELECT * FROM livreur_advances WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ avance: row });
});

router.get('/me/avances', authRequired, requireRole('livreur'), (req, res) => {
  const rows = db.prepare('SELECT * FROM livreur_advances WHERE livreur_id = ? ORDER BY requested_at DESC').all(req.user.id);
  res.json({ avances: rows });
});

export default router;
