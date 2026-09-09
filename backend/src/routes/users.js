import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';

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

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT id, role, name, phone, email, zone, vehicle, available, verified,
           rating_avg, rating_count, id_document_status, id_document_uploaded_at,
           id_document_note, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user });
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

// Gains d'un livreur (somme des livraisons livrées et payées)
router.get('/me/gains', authRequired, requireRole('livreur'), (req, res) => {
  const row = db.prepare(`
    SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as nb_livraisons
    FROM deliveries WHERE livreur_id = ? AND status = 'livree'
  `).get(req.user.id);
  res.json(row);
});

export default router;
