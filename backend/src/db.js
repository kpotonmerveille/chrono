import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data.sqlite');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('client','livreur','admin')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  zone TEXT,
  vehicle TEXT,
  available INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  rating_avg REAL DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  id_document_path TEXT,
  id_document_status TEXT NOT NULL DEFAULT 'non_soumis' CHECK(id_document_status IN ('non_soumis','en_attente','approuve','rejete')),
  id_document_uploaded_at TEXT,
  id_document_note TEXT,
  last_lat REAL,
  last_lng REAL,
  last_position_at TEXT,
  -- "Chrono Pro" : un client peut se déclarer commerçant pour préremplir son
  -- adresse de retrait à chaque nouvelle demande au lieu de la retaper.
  is_merchant INTEGER NOT NULL DEFAULT 0,
  merchant_slug TEXT UNIQUE,
  merchant_shop_name TEXT,
  merchant_pickup_address TEXT,
  merchant_pickup_lat REAL,
  merchant_pickup_lng REAL,
  -- Portefeuille Chrono : solde prépayé (FCFA) rechargeable via FedaPay,
  -- utilisable pour payer une livraison instantanément sans repasser par un
  -- paiement Mobile Money/carte à chaque fois — pratique pour un commerçant
  -- qui envoie plusieurs colis par jour. Voir wallet_transactions.
  wallet_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Livraison groupée ("course partagée") : quand une deuxième livraison
-- rejoint une livraison compagnon déjà en attente (même zone, point de
-- retrait proche, pas encore acceptée), les deux partagent le même groupe —
-- le livreur qui accepte l'une accepte tout le groupe en un seul trajet.
-- Seule la livraison qui REJOINT un groupe existant profite d'un prix
-- réduit (voir deliveries.group_discount) : le prix, une fois fixé à la
-- création, n'est jamais recalculé rétroactivement (cohérent avec la grille
-- de prix fixe sans négociation).
CREATE TABLE IF NOT EXISTS delivery_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  livreur_id INTEGER REFERENCES users(id),
  pickup_address TEXT NOT NULL,
  pickup_lat REAL,
  pickup_lng REAL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat REAL,
  dropoff_lng REAL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  package_description TEXT,
  package_size TEXT DEFAULT 'petit',
  distance_km REAL,
  distance_source TEXT,
  zone TEXT NOT NULL DEFAULT 'moyenne' CHECK(zone IN ('courte','moyenne','longue')),
  delai_garanti INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','acceptee','recuperee','en_route','livree','annulee')),
  confirmation_code TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'en_attente' CHECK(payment_status IN ('en_attente','paye','echoue')),
  -- Lien de suivi public ("suivi sans app") : token opaque permettant de
  -- consulter le statut/la position en direct sans compte, à partager par
  -- SMS/WhatsApp avec le destinataire ou un proche.
  share_token TEXT UNIQUE,
  -- Note vocale jointe aux instructions de retrait/livraison, en plus (pas à
  -- la place) de l'adresse texte — utile quand une adresse formelle précise
  -- n'existe pas vraiment.
  pickup_voice_note_path TEXT,
  dropoff_voice_note_path TEXT,
  -- Qui paie : l'expéditeur (comportement historique) ou le destinataire à
  -- la réception (utile pour les petits commerçants qui vendent à distance).
  payer_type TEXT NOT NULL DEFAULT 'expediteur' CHECK(payer_type IN ('expediteur','destinataire')),
  -- Garantie colis (optionnelle, petit supplément payé par l'expéditeur à la
  -- création) : en cas de colis cassé/perdu, le client peut ouvrir une
  -- réclamation examinée par l'admin.
  insured INTEGER NOT NULL DEFAULT 0,
  insurance_fee INTEGER NOT NULL DEFAULT 0,
  claim_status TEXT NOT NULL DEFAULT 'aucun' CHECK(claim_status IN ('aucun','en_cours','rembourse','refuse')),
  claim_description TEXT,
  claim_note TEXT,
  claim_created_at TEXT,
  claim_resolved_at TEXT,
  -- Livraison groupée : groupe rejoint (NULL si seule) + réduction obtenue
  -- (en FCFA) si cette livraison a rejoint un groupe compagnon existant.
  group_id INTEGER REFERENCES delivery_groups(id),
  group_discount INTEGER NOT NULL DEFAULT 0,
  -- Retour automatique : quand le destinataire refuse le colis à la
  -- livraison, le livreur signale un retour avec un motif au lieu de rester
  -- bloqué. return_fee est un tarif réduit à régler en espèces au livreur
  -- (pas encore intégré à FedaPay, voir README).
  return_status TEXT NOT NULL DEFAULT 'aucun' CHECK(return_status IN ('aucun','demande','retournee')),
  return_reason TEXT,
  return_fee INTEGER NOT NULL DEFAULT 0,
  return_requested_at TEXT,
  return_completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_deliveries_share_token ON deliveries(share_token);

-- Adresses favorites d'un client (domicile, boutique, fournisseur...), pour
-- ne plus avoir à retaper une adresse à chaque nouvelle demande.
CREATE TABLE IF NOT EXISTS client_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL,
  lng REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_addresses_client ON client_addresses(client_id);

-- Avance sur gains : un livreur peut demander à retirer une partie de ce
-- qu'il a déjà gagné (livraisons livrées et payées) avant la fin de la
-- journée. Le versement réel (Mobile Money) reste manuel côté admin pour
-- l'instant — cette table suit la demande et sa décision, pas un vrai appel
-- à une API de paiement sortant.
CREATE TABLE IF NOT EXISTS livreur_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  livreur_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','approuvee','refusee','versee')),
  note TEXT,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_livreur_advances_livreur ON livreur_advances(livreur_id);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('mtn_momo','moov_money','carte','fedapay')),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','reussie','echouee')),
  provider_ref TEXT,
  checkout_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Documents du véhicule (moto) d'un livreur : carte grise, assurance, permis
-- de conduire, photo de la moto. Un seul document "actif" par type et par
-- livreur (UNIQUE) — un nouvel envoi remplace le précédent et repasse son
-- statut à 'en_attente'. Distinct de la pièce d'identité (colonnes
-- id_document_* sur users), gérée séparément depuis le début du projet.
CREATE TABLE IF NOT EXISTS livreur_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('carte_grise','assurance','permis','moto_photo')),
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN ('en_attente','approuve','rejete')),
  note TEXT,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_livreur_documents_user ON livreur_documents(user_id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id),
  client_id INTEGER NOT NULL REFERENCES users(id),
  livreur_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_livreur ON deliveries(livreur_id);

-- Alertes SOS livreur : bouton "danger" / "panne" déclenché depuis l'app du
-- livreur (web ou mobile). Diffusée en temps réel à l'admin (alarme sonore +
-- position exacte) pour qu'elle puisse envoyer la police ou une équipe de
-- dépannage. delivery_id est optionnel (le livreur peut ne pas être en
-- pleine course au moment de l'alerte).
CREATE TABLE IF NOT EXISTS livreur_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  livreur_id INTEGER NOT NULL REFERENCES users(id),
  delivery_id INTEGER REFERENCES deliveries(id),
  type TEXT NOT NULL CHECK(type IN ('danger','panne')),
  message TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolue')),
  resolved_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_livreur_alerts_status ON livreur_alerts(status);
CREATE INDEX IF NOT EXISTS idx_livreur_alerts_livreur ON livreur_alerts(livreur_id);

-- Historique du portefeuille Chrono : recharge (FedaPay ou simulateur),
-- débit (paiement d'une livraison avec le solde) ou remboursement.
-- delivery_id est renseigné uniquement pour un débit lié à une livraison.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('recharge','debit','remboursement')),
  amount INTEGER NOT NULL,
  delivery_id INTEGER REFERENCES deliveries(id),
  status TEXT NOT NULL DEFAULT 'reussie' CHECK(status IN ('en_attente','reussie','echouee')),
  provider_ref TEXT,
  checkout_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id);

-- Alerte route inondée : signalement manuel (client ou livreur) d'un point
-- où la route est inondée/impraticable, en saison des pluies. Pas de
-- détection automatique (aucune donnée fiable disponible) — juste un
-- signalement partagé, actif un temps limité (voir FLOOD_ALERT_TTL_HOURS)
-- ou jusqu'à ce que son auteur ou l'admin le lève.
CREATE TABLE IF NOT EXISTS flood_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_flood_alerts_active ON flood_alerts(resolved_at, created_at);
`);

// Ajout défensif de colonnes sur une base déjà existante (pas de framework de
// migration dans ce projet — voir les commentaires plus haut). Sans effet si
// la base vient d'être créée (les colonnes sont déjà dans les CREATE TABLE
// ci-dessus) ; utile pour une base qui tournait déjà avant ces
// fonctionnalités (livraison groupée, retour automatique, portefeuille).
function ensureColumn(table, columnDef) {
  const columnName = columnDef.trim().split(/\s+/)[0];
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

ensureColumn('users', 'wallet_balance INTEGER NOT NULL DEFAULT 0');
ensureColumn('deliveries', 'group_id INTEGER REFERENCES delivery_groups(id)');
ensureColumn('deliveries', 'group_discount INTEGER NOT NULL DEFAULT 0');
ensureColumn('deliveries', "return_status TEXT NOT NULL DEFAULT 'aucun'");
ensureColumn('deliveries', 'return_reason TEXT');
ensureColumn('deliveries', 'return_fee INTEGER NOT NULL DEFAULT 0');
ensureColumn('deliveries', 'return_requested_at TEXT');
ensureColumn('deliveries', 'return_completed_at TEXT');

// Index sur les nouvelles colonnes : après ensureColumn (une base déjà
// existante n'a le groupe qu'à partir d'ici, pas dans le CREATE TABLE
// IF NOT EXISTS ci-dessus, qui ne s'applique qu'à une base neuve).
db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_group ON deliveries(group_id)');

// Seed admin account if not present
const adminEmail = process.env.ADMIN_EMAIL || 'admin@chrono.bj';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';
const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(`INSERT INTO users (role, name, phone, email, password_hash, verified, available)
    VALUES ('admin', 'Administrateur', '+22900000000', ?, ?, 1, 0)`).run(adminEmail, hash);
  console.log(`Compte admin créé -> email: ${adminEmail} / mot de passe: ${adminPassword}`);
}

export default db;
