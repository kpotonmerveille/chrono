import { Router } from 'express';
import fs from 'fs';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

router.get('/stats', (req, res) => {
  const totalLivraisons = db.prepare('SELECT COUNT(*) as n FROM deliveries').get().n;
  const enCours = db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE status IN ('acceptee','recuperee','en_route')`).get().n;
  const enAttente = db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE status = 'en_attente'`).get().n;
  const livrees = db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE status = 'livree'`).get().n;
  const annulees = db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE status = 'annulee'`).get().n;
  const revenus = db.prepare(`SELECT COALESCE(SUM(price),0) as total FROM deliveries WHERE payment_status = 'paye'`).get().total;
  const clients = db.prepare(`SELECT COUNT(*) as n FROM users WHERE role = 'client'`).get().n;
  const livreurs = db.prepare(`SELECT COUNT(*) as n FROM users WHERE role = 'livreur'`).get().n;
  const livreursEnAttenteVerif = db.prepare(`SELECT COUNT(*) as n FROM users WHERE role = 'livreur' AND verified = 0`).get().n;

  res.json({
    totalLivraisons, enCours, enAttente, livrees, annulees, revenus,
    clients, livreurs, livreursEnAttenteVerif
  });
});

router.get('/deliveries', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.name as client_name, l.name as livreur_name
    FROM deliveries d
    LEFT JOIN users c ON c.id = d.client_id
    LEFT JOIN users l ON l.id = d.livreur_id
    ORDER BY d.created_at DESC LIMIT 200
  `).all();
  res.json({ deliveries: rows });
});

router.get('/livreurs', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, phone, email, zone, vehicle, available, verified, rating_avg, rating_count,
           id_document_status, id_document_uploaded_at, id_document_note, created_at
    FROM users WHERE role = 'livreur' ORDER BY created_at DESC
  `).all();
  res.json({ livreurs: rows });
});

// L'admin consulte la pièce d'identité envoyée par un livreur
router.get('/livreurs/:id/document', (req, res) => {
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur || !livreur.id_document_path) return res.status(404).json({ error: 'Aucun document envoyé' });
  if (!fs.existsSync(livreur.id_document_path)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });
  res.sendFile(livreur.id_document_path);
});

// L'admin approuve ou rejette la pièce d'identité — l'approbation active le
// livreur (verified = 1) ; le rejet le garde inactif tant qu'il ne renvoie
// pas un document valide.
router.patch('/livreurs/:id/document/decision', (req, res) => {
  const { decision, note } = req.body; // 'approuve' | 'rejete'
  if (!['approuve', 'rejete'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide' });
  }
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  if (!livreur.id_document_path) return res.status(409).json({ error: "Ce livreur n'a envoyé aucun document" });

  db.prepare(`
    UPDATE users SET id_document_status = ?, id_document_note = ?, verified = ?
    WHERE id = ?
  `).run(decision, note || null, decision === 'approuve' ? 1 : 0, livreur.id);

  res.json({ ok: true });
});

router.get('/clients', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, phone, email, zone, created_at
    FROM users WHERE role = 'client' ORDER BY created_at DESC
  `).all();
  res.json({ clients: rows });
});

// Vérifier / activer un livreur (contrôle d'identité côté admin, exigence de sécurité)
router.patch('/livreurs/:id/verifier', (req, res) => {
  const { verified } = req.body;
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(verified ? 1 : 0, livreur.id);
  res.json({ ok: true });
});

// Suspendre / réactiver un livreur
router.patch('/livreurs/:id/suspendre', (req, res) => {
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  db.prepare('UPDATE users SET verified = 0, available = 0 WHERE id = ?').run(livreur.id);
  res.json({ ok: true });
});

export default router;
