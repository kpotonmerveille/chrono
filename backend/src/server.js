import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import './db.js'; // initialise la base de données et le compte admin
import { initSocket } from './socket.js';
import { fedapayWebhookHandler } from './routes/payments.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import deliveryRoutes from './routes/deliveries.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

// Webhook FedaPay : monté AVANT express.json() car il a besoin du corps brut
// (non parsé) pour vérifier la signature de la requête.
app.post('/api/payments/webhook', express.raw({ type: '*/*' }), fedapayWebhookHandler);

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'chrono-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Sert le frontend déjà construit (frontend/dist) s'il est présent, pour un
// déploiement en un seul service (une seule URL pour le site + l'API).
// En développement local, le frontend tourne séparément via "npm run dev"
// (voir vite.config.js) et ce bloc est simplement ignoré.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);
initSocket(httpServer); // géolocalisation et statuts en temps réel (Socket.io)
httpServer.listen(PORT, () => console.log(`API Chrono démarrée sur http://localhost:${PORT}`));
