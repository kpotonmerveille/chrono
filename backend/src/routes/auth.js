import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken } from '../auth.js';

const router = Router();

// Inscription client ou livreur
router.post('/register', (req, res) => {
  const { role, name, phone, email, password, zone, vehicle } = req.body;

  if (!['client', 'livreur'].includes(role)) {
    return res.status(400).json({ error: "Rôle invalide" });
  }
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec ce numéro' });
  }

  const hash = bcrypt.hashSync(password, 10);
  // Les livreurs doivent être vérifiés par un admin avant de pouvoir accepter des courses (sécurité)
  const verified = role === 'client' ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO users (role, name, phone, email, password_hash, zone, vehicle, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(role, name, phone, email || null, hash, zone || null, vehicle || null, verified);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken(user);
  delete user.password_hash;
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
  }
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const token = signToken(user);
  delete user.password_hash;
  res.json({ token, user });
});

// Connexion admin par email
router.post('/login-admin', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'admin');
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const token = signToken(user);
  delete user.password_hash;
  res.json({ token, user });
});

export default router;
