import { Router } from 'express';
import db from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { FedaPay, Transaction, Webhook } from 'fedapay';
import { broadcastStatus } from '../socket.js';

const router = Router();

/**
 * PAIEMENT — FedaPay
 * ------------------
 * En production, le paiement passe par FedaPay (agrégateur Mobile Money /
 * carte utilisé au Bénin). Si aucune clé FEDAPAY_SECRET_KEY n'est définie
 * dans backend/.env, le système bascule automatiquement sur un simulateur
 * (paiement immédiat, pour développer/démontrer sans compte FedaPay actif).
 *
 * Flux réel :
 *  1. Le client choisit une méthode -> on crée une Transaction FedaPay puis
 *     on génère un lien de paiement (checkout_url) sur lequel on le redirige.
 *  2. Le client paie sur la page hébergée par FedaPay.
 *  3. FedaPay confirme via webhook (POST /api/payments/webhook, signé) —
 *     c'est cette confirmation, pas la redirection, qui fait foi et marque
 *     la livraison comme payée.
 */
const FEDAPAY_SECRET_KEY = process.env.FEDAPAY_SECRET_KEY || '';
const FEDAPAY_ENV = process.env.FEDAPAY_ENV || 'sandbox'; // 'sandbox' ou 'live'
const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET || '';
// RENDER_EXTERNAL_URL est fournie automatiquement par Render en production
// (l'URL publique du service) ; FRONTEND_URL prime si définie explicitement.
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
export const FEDAPAY_ENABLED = Boolean(FEDAPAY_SECRET_KEY);

if (FEDAPAY_ENABLED) {
  FedaPay.setApiKey(FEDAPAY_SECRET_KEY);
  FedaPay.setEnvironment(FEDAPAY_ENV);
  console.log(`[paiement] FedaPay activé (environnement: ${FEDAPAY_ENV})`);
} else {
  console.warn('[paiement] FEDAPAY_SECRET_KEY absente de backend/.env : paiement en mode SIMULATEUR (démo uniquement, ne pas utiliser en production).');
}

const PAID_STATUSES = ['approved', 'transferred', 'approved_partially_refunded', 'transferred_partially_refunded'];
const FAILED_STATUSES = ['declined', 'canceled'];

router.post('/deliveries/:id/payer', authRequired, requireRole('client'), async (req, res) => {
  const { method, momo_number } = req.body; // 'mtn_momo' | 'moov_money' | 'carte'
  if (!['mtn_momo', 'moov_money', 'carte'].includes(method)) {
    return res.status(400).json({ error: 'Méthode de paiement invalide' });
  }

  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery || delivery.client_id !== req.user.id) {
    return res.status(404).json({ error: 'Livraison introuvable' });
  }
  if (delivery.payment_status === 'paye') {
    return res.status(409).json({ error: 'Déjà payé' });
  }
  if (method !== 'carte' && !momo_number) {
    return res.status(400).json({ error: 'Numéro Mobile Money requis' });
  }

  if (!FEDAPAY_ENABLED) {
    // Mode simulateur : succès immédiat (aucune clé FedaPay configurée)
    const txResult = db.prepare(`
      INSERT INTO transactions (delivery_id, amount, method, status, provider_ref)
      VALUES (?, ?, ?, 'reussie', ?)
    `).run(delivery.id, delivery.price, method, `SIM-${Date.now()}`);
    db.prepare(`UPDATE deliveries SET payment_status = 'paye' WHERE id = ?`).run(delivery.id);
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txResult.lastInsertRowid);
    const updatedDelivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery.id);
    return res.json({ simulated: true, transaction, delivery: updatedDelivery });
  }

  try {
    const client = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const nameParts = (client.name || 'Client Chrono').trim().split(/\s+/);

    const fedaTransaction = await Transaction.create({
      description: `Livraison Chrono #${delivery.id} — ${delivery.pickup_address} vers ${delivery.dropoff_address}`,
      amount: delivery.price,
      currency: { iso: 'XOF' },
      callback_url: `${FRONTEND_URL}/client/livraisons/${delivery.id}`,
      customer: {
        firstname: nameParts[0],
        lastname: nameParts.slice(1).join(' ') || nameParts[0],
        email: client.email || undefined,
        phone_number: { number: momo_number || client.phone, country: 'bj' },
      },
    });

    const tokenObject = await fedaTransaction.generateToken();

    const txResult = db.prepare(`
      INSERT INTO transactions (delivery_id, amount, method, status, provider_ref, checkout_url)
      VALUES (?, ?, 'fedapay', 'en_attente', ?, ?)
    `).run(delivery.id, delivery.price, String(fedaTransaction.id), tokenObject.url);

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txResult.lastInsertRowid);
    res.json({ simulated: false, transaction, checkout_url: tokenObject.url });
  } catch (err) {
    console.error('[FedaPay] Échec de création de transaction :', err?.message || err);
    res.status(502).json({ error: "Impossible de contacter FedaPay pour le moment. Réessayez dans un instant." });
  }
});

router.get('/deliveries/:id/transactions', authRequired, (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  const isOwner = req.user.role === 'client' && delivery.client_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const rows = db.prepare('SELECT * FROM transactions WHERE delivery_id = ? ORDER BY created_at DESC').all(delivery.id);
  res.json({ transactions: rows });
});

// Le client peut relancer le statut de paiement sans attendre le webhook
// (utile juste après son retour depuis la page FedaPay).
router.get('/deliveries/:id/statut-paiement', authRequired, (req, res) => {
  const delivery = db.prepare('SELECT id, payment_status FROM deliveries WHERE id = ?').get(req.params.id);
  if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' });
  res.json({ payment_status: delivery.payment_status });
});

/**
 * Webhook FedaPay — appelé par FedaPay lui-même, pas par le frontend.
 * IMPORTANT : cette route doit recevoir le corps BRUT (pas parsé en JSON)
 * pour que la vérification de signature fonctionne ; elle est donc montée
 * directement dans server.js avec express.raw(), avant express.json().
 *
 * Nom d'en-tête de signature à confirmer dans le tableau de bord FedaPay au
 * moment de configurer le webhook (on essaie les variantes usuelles ici).
 */
export function fedapayWebhookHandler(req, res) {
  if (!FEDAPAY_ENABLED || !FEDAPAY_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Webhook FedaPay non configuré côté serveur' });
  }
  const signature =
    req.headers['x-fedapay-signature'] ||
    req.headers['x-fedapay-signatures'] ||
    req.headers['fedapay-signature'];

  let event;
  try {
    event = Webhook.constructEvent(req.body, signature, FEDAPAY_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[FedaPay webhook] Signature invalide :', err?.message || err);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  const entity = event.entity || {};
  const fedaTransactionId = String(entity.id || '');
  if (!fedaTransactionId) return res.json({ ok: true });

  const transaction = db.prepare(
    `SELECT * FROM transactions WHERE provider_ref = ? AND method = 'fedapay'`
  ).get(fedaTransactionId);
  if (!transaction) return res.json({ ok: true });

  if (PAID_STATUSES.includes(entity.status)) {
    db.prepare(`UPDATE transactions SET status = 'reussie' WHERE id = ?`).run(transaction.id);
    db.prepare(`UPDATE deliveries SET payment_status = 'paye' WHERE id = ?`).run(transaction.delivery_id);
    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(transaction.delivery_id);
    broadcastStatus(transaction.delivery_id, updated);
  } else if (FAILED_STATUSES.includes(entity.status)) {
    db.prepare(`UPDATE transactions SET status = 'echouee' WHERE id = ?`).run(transaction.id);
  }

  res.json({ ok: true });
}

export default router;
