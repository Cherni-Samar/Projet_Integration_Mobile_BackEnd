require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Import des Routes
const authRoutes = require('./routes/authRoutes');
const heraRoutes = require('./routes/heraRoutes');
const emailRoutes = require('./routes/emailRoutes');
const agentRoutes = require('./routes/agentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');

// Démarrer la surveillance autonome
staffingWatcher.watchStaffing();

const app = express();

// 1. Connexion MongoDB (Obligatoire)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// 2. Middlewares de base
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Routes API
app.get('/', (req, res) => res.json({ status: 'running', service: 'Hera Assistant API' }));
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', authRoutes);
app.use('/api/hera', heraRoutes);    // Route cruciale pour Vapi
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);

// 4. Gestion des erreurs (404 & Global)
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);

// 5. Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
🤖 Mode: ${process.env.NODE_ENV || 'production'}
  `);
});

module.exports = app;