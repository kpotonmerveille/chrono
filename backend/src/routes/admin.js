import { Router } from 'express';
import fs from 'fs';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { VEHICLE_DOCUMENT_TYPES, getVehicleDocumentsSummary, recomputeVerified } from '../vehicleDocuments.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

// Une course est considérée "impayée" si elle n'a pas été annulée, que le
// paiement n'est pas confirmé, et qu'elle a été créée il y a plus de 15
// minutes — le temps normal d'un paiement (immédiat pour l'expéditeur, ou le
// temps que le destinataire ouvre le lien de suivi) est donc laissé passer
// avant d'alerter l'admin, pour ne pas signaler des courses juste créées.
const IMPAYEE_DELAI_MINUTES = 15;
const IMPAYEES_WHERE = `d.payment_status != 'paye' AND d.status != 'annulee' AND datetime(d.created_at) < datetime('now', '-${IMPAYEE_DELAI_MINUTES} minutes')`;

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
  const reclamationsEnCours = db.prepare(`SELECT COUNT(*) as n FROM deliveries WHERE claim_status = 'en_cours'`).get().n;
  const avancesEnAttente = db.prepare(`SELECT COUNT(*) as n FROM livreur_advances WHERE status = 'en_attente'`).get().n;
  const livraisonsImpayees = db.prepare(`SELECT COUNT(*) as n FROM deliveries d WHERE ${IMPAYEES_WHERE}`).get().n;

  res.json({
    totalLivraisons, enCours, enAttente, livrees, annulees, revenus,
    clients, livreurs, livreursEnAttenteVerif, reclamationsEnCours, avancesEnAttente,
    livraisonsImpayees,
  });
});

// Liste détaillée des courses impayées depuis plus de 15 minutes, pour que
// l'admin puisse relancer le client/destinataire ou annuler la course.
router.get('/impayees', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.pickup_address, d.dropoff_address, d.price, d.payer_type, d.payment_status,
           d.status, d.share_token, d.created_at,
           c.name as client_name, c.phone as client_phone
    FROM deliveries d
    LEFT JOIN users c ON c.id = d.client_id
    WHERE ${IMPAYEES_WHERE}
    ORDER BY d.created_at ASC
  `).all();
  res.json({ impayees: rows, delai_minutes: IMPAYEE_DELAI_MINUTES });
});

// --- Réclamations (livraisons assurées signalées cassées/perdues) ---
router.get('/reclamations', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.claim_status, d.claim_description, d.claim_note, d.claim_created_at, d.claim_resolved_at,
           d.price, d.insurance_fee, d.pickup_address, d.dropoff_address,
           c.name as client_name, c.phone as client_phone, l.name as livreur_name
    FROM deliveries d
    LEFT JOIN users c ON c.id = d.client_id
    LEFT JOIN users l ON l.id = d.livreur_id
    WHERE d.claim_status != 'aucun'
    ORDER BY d.claim_created_at DESC
  `).all();
  res.json({ reclamations: rows });
});

router.patch('/reclamations/:id/decision', (req, res) => {
  const { decision, note } = req.body; // 'rembourse' | 'refuse'
  if (!['rembourse', 'refuse'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  if (delivery.claim_status !== 'en_cours') return res.status(409).json({ error: 'Aucune réclamation en cours pour cette livraison' });

  db.prepare(`
    UPDATE deliveries SET claim_status = ?, claim_note = ?, claim_resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(decision, note || null, delivery.id);
  res.json({ ok: true });
});

// --- Avances sur gains des livreurs (versement Mobile Money manuel) ---
router.get('/avances', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name as livreur_name, u.phone as livreur_phone
    FROM livreur_advances a LEFT JOIN users u ON u.id = a.livreur_id
    ORDER BY a.requested_at DESC
  `).all();
  res.json({ avances: rows });
});

router.patch('/avances/:id/decision', (req, res) => {
  const { decision } = req.body; // 'approuvee' | 'refusee' | 'versee'
  if (!['approuvee', 'refusee', 'versee'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide' });
  }
  const avance = db.prepare('SELECT * FROM livreur_advances WHERE id = ?').get(req.params.id);
  if (!avance) return res.status(404).json({ error: 'Demande introuvable' });
  db.prepare(`UPDATE livreur_advances SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(decision, avance.id);
  res.json({ ok: true });
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
    SELECT u.id, u.name, u.phone, u.email, u.zone, u.vehicle, u.available, u.verified,
           u.rating_avg, u.rating_count,
           u.id_document_status, u.id_document_uploaded_at, u.id_document_note, u.created_at,
           (SELECT COUNT(*) FROM livreur_documents ld WHERE ld.user_id = u.id AND ld.status = 'approuve') as vehicule_documents_approuves,
           (SELECT COUNT(*) FROM livreur_documents ld WHERE ld.user_id = u.id) as vehicule_documents_envoyes
    FROM users u WHERE u.role = 'livreur' ORDER BY u.created_at DESC
  `).all();
  res.json({ livreurs: rows, vehicule_documents_requis: VEHICLE_DOCUMENT_TYPES.length });
});

// L'admin consulte l'état complet des documents d'un livreur : pièce
// d'identité + les 4 documents véhicule (chacun 'non_soumis' si rien
// envoyé pour ce type).
router.get('/livreurs/:id/documents', (req, res) => {
  const livreur = db.prepare(`
    SELECT id, id_document_status, id_document_uploaded_at, id_document_note
    FROM users WHERE id = ? AND role = 'livreur'
  `).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  res.json({
    identite: {
      status: livreur.id_document_status,
      uploaded_at: livreur.id_document_uploaded_at,
      note: livreur.id_document_note,
    },
    vehicule: getVehicleDocumentsSummary(db, livreur.id),
  });
});

// L'admin consulte la pièce d'identité envoyée par un livreur
router.get('/livreurs/:id/document', (req, res) => {
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur || !livreur.id_document_path) return res.status(404).json({ error: 'Aucun document envoyé' });
  if (!fs.existsSync(livreur.id_document_path)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });
  res.sendFile(livreur.id_document_path);
});

// L'admin approuve ou rejette la pièce d'identité. Le livreur n'est activé
// (verified = 1) que lorsque la pièce d'identité ET les 4 documents véhicule
// sont TOUS approuvés (voir recomputeVerified) — un rejet désactive
// immédiatement le compte tant qu'il ne renvoie pas un document valide.
router.patch('/livreurs/:id/document/decision', (req, res) => {
  const { decision, note } = req.body; // 'approuve' | 'rejete'
  if (!['approuve', 'rejete'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide' });
  }
  const livreur = db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  if (!livreur.id_document_path) return res.status(409).json({ error: "Ce livreur n'a envoyé aucun document" });

  db.prepare(`
    UPDATE users SET id_document_status = ?, id_document_note = ?
    WHERE id = ?
  `).run(decision, note || null, livreur.id);
  const verified = recomputeVerified(db, livreur.id);

  res.json({ ok: true, verified });
});

// L'admin consulte un document véhicule précis (carte grise, assurance...)
router.get('/livreurs/:id/vehicule/:type', (req, res) => {
  const { type } = req.params;
  if (!VEHICLE_DOCUMENT_TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  const livreur = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  const doc = db.prepare('SELECT file_path FROM livreur_documents WHERE user_id = ? AND type = ?').get(livreur.id, type);
  if (!doc) return res.status(404).json({ error: 'Aucun document envoyé pour ce type' });
  if (!fs.existsSync(doc.file_path)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });
  res.sendFile(doc.file_path);
});

// L'admin approuve ou rejette un document véhicule précis.
router.patch('/livreurs/:id/vehicule/:type/decision', (req, res) => {
  const { type } = req.params;
  const { decision, note } = req.body; // 'approuve' | 'rejete'
  if (!VEHICLE_DOCUMENT_TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  if (!['approuve', 'rejete'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide' });
  }
  const livreur = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'livreur'`).get(req.params.id);
  if (!livreur) return res.status(404).json({ error: 'Livreur introuvable' });
  const doc = db.prepare('SELECT id FROM livreur_documents WHERE user_id = ? AND type = ?').get(livreur.id, type);
  if (!doc) return res.status(409).json({ error: "Ce livreur n'a envoyé aucun document de ce type" });

  db.prepare(`
    UPDATE livreur_documents SET status = ?, note = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND type = ?
  `).run(decision, note || null, livreur.id, type);
  const verified = recomputeVerified(db, livreur.id);

  res.json({ ok: true, verified });
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
