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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT
);

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
`);

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
