import { Router } from 'express';
import db from '../db.js';
import { createPaymentForDelivery, FRONTEND_URL } from './payments.js';

const router = Router();

/**
 * "Suivi sans app" — le client partage ce lien (SMS/WhatsApp) avec le
 * destinataire ou un proche, qui peut suivre la course en direct sans
 * compte ni installation. Accès protégé uniquement par la connaissance du
 * token (aléatoire, 24 caractères hex) — comme un lien de partage classique.
 * On y montre le code de confirmation : c'est justement la personne qui
 * reçoit ce lien qui doit le donner au livreur à l'arrivée.
 */
router.get('/suivi/:token', (req, res) => {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE share_token = ?').get(req.params.token);
  if (!delivery) return res.status(404).json({ error: 'Lien de suivi invalide' });

  let livreur = null;
  if (delivery.livreur_id) {
    const l = db.prepare('SELECT name, phone, rating_avg, last_lat, last_lng, last_position_at FROM users WHERE id = ?').get(delivery.livreur_id);
    if (l) {
      livreur = {
        name: l.name,
        phone: l.phone,
        rating_avg: l.rating_avg,
        position: ['acceptee', 'recuperee', 'en_route'].includes(delivery.status) && l.last_lat !== null
          ? { lat: l.last_lat, lng: l.last_lng, at: l.last_position_at }
          : null,
      };
    }
  }

  res.json({
    delivery: {
      id: delivery.id,
      status: delivery.status,
      zone: delivery.zone,
      delai_garanti: !!delivery.delai_garanti,
      pickup_address: delivery.pickup_address,
      pickup_lat: delivery.pickup_lat,
      pickup_lng: delivery.pickup_lng,
      dropoff_address: delivery.dropoff_address,
      dropoff_lat: delivery.dropoff_lat,
      dropoff_lng: delivery.dropoff_lng,
      recipient_name: delivery.recipient_name,
      package_description: delivery.package_description,
      price: delivery.price,
      payment_status: delivery.payment_status,
      payer_type: delivery.payer_type,
      confirmation_code: delivery.confirmation_code,
      created_at: delivery.created_at,
      has_pickup_voice_note: !!delivery.pickup_voice_note_path,
      has_dropoff_voice_note: !!delivery.dropoff_voice_note_path,
    },
    livreur,
  });
});

// Le destinataire (sans compte) écoute une note vocale jointe à la livraison.
router.get('/suivi/:token/note-vocale/:point', (req, res) => {
  const { point } = req.params;
  if (!['retrait', 'livraison'].includes(point)) return res.status(400).json({ error: 'Point invalide' });
  const delivery = db.prepare('SELECT * FROM deliveries WHERE share_token = ?').get(req.params.token);
  if (!delivery) return res.status(404).json({ error: 'Lien de suivi invalide' });
  const filePath = point === 'retrait' ? delivery.pickup_voice_note_path : delivery.dropoff_voice_note_path;
  if (!filePath) return res.status(404).json({ error: 'Aucune note vocale' });
  res.sendFile(filePath);
});

// Le destinataire paie à la réception (uniquement si payer_type =
// 'destinataire' et pas déjà payé) — même logique FedaPay que le client,
// via la fonction partagée de routes/payments.js.
router.post('/suivi/:token/payer', async (req, res) => {
  const { method, momo_number } = req.body;
  if (!['mtn_momo', 'moov_money', 'carte'].includes(method)) {
    return res.status(400).json({ error: 'Méthode de paiement invalide' });
  }
  const delivery = db.prepare('SELECT * FROM deliveries WHERE share_token = ?').get(req.params.token);
  if (!delivery) return res.status(404).json({ error: 'Lien de suivi invalide' });
  if (delivery.payer_type !== 'destinataire') {
    return res.status(409).json({ error: "Cette livraison est payée par l'expéditeur, pas par le destinataire" });
  }
  if (delivery.payment_status === 'paye') return res.status(409).json({ error: 'Déjà payé' });
  if (method !== 'carte' && !momo_number) return res.status(400).json({ error: 'Numéro Mobile Money requis' });

  try {
    const result = await createPaymentForDelivery(delivery, {
      method, momoNumber: momo_number,
      payer: { name: delivery.recipient_name, phone: delivery.recipient_phone },
      callbackUrl: `${FRONTEND_URL}/suivi/${req.params.token}`,
    });
    res.json(result);
  } catch (err) {
    console.error('[FedaPay] Échec de création de transaction (destinataire) :', err?.message || err);
    res.status(502).json({ error: "Impossible de contacter FedaPay pour le moment. Réessayez dans un instant." });
  }
});

/**
 * "Chrono Pro" — commande rapide : un commerçant consulte ses propres infos
 * de retrait enregistrées pour préremplir le formulaire "Nouvelle
 * livraison" au lieu de retaper son adresse de boutique à chaque fois. La
 * création reste authentifiée (voir routes/deliveries.js) — cette route ne
 * sert qu'à afficher les infos publiques de la boutique si le commerçant
 * partage son lien.
 */
router.get('/boutique/:slug', (req, res) => {
  const merchant = db.prepare(`
    SELECT name, merchant_shop_name, merchant_pickup_address, merchant_pickup_lat, merchant_pickup_lng
    FROM users WHERE merchant_slug = ? AND is_merchant = 1
  `).get(req.params.slug);
  if (!merchant) return res.status(404).json({ error: 'Boutique introuvable' });
  res.json({ boutique: merchant });
});

export default router;
