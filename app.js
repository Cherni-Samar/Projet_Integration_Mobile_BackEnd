require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// 1. Initialize App First
const app = express();

// 2. Middlewares (CORS & Body Parsers)
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import des Routes
const authRoutes = require('./routes/authRoutes');
const employeeAuthRoutes = require('./routes/employeeAuth');
const heraRoutes = require('./routes/heraRoutes');
const emailRoutes = require('./routes/emailRoutes');
const agentRoutes = require('./routes/agentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');
const staffingWatcher = require('./services/staffingWatcher');
const kashRoutes = require('./routes/kashRoutes');
const timoRoutes = require('./routes/timoRoutes');
const dexoRoutes = require('./routes/dexoRoutes');

// Import Kash Cron
const { startKashCron, triggerDailyEmailNow, triggerWeeklyEmailNow } = require('./cron/kashCron');

// Démarrer la surveillance autonome
staffingWatcher.watchStaffing();

// 3. Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// 4. Routes API
app.get('/', (req, res) => res.json({ status: 'running', service: 'Hera Assistant API' }));
app.get('/health', (req, res) => res.json({ status: 'OK', db: mongoose.connection.readyState === 1 }));

// ✅ Auth routes (User registration & login)
app.use('/api/auth', authRoutes);

// ✅ Employee Auth routes (Employee portal login)
app.use('/api/employees', employeeAuthRoutes); 

app.use('/api/hera', heraRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/kash', kashRoutes);
app.use('/api/timo', timoRoutes);
app.use('/api/dexo', dexoRoutes);

// ✅ KASH CRON TEST ROUTES
app.get('/api/kash/test-daily', async (req, res) => {
  try {
    await triggerDailyEmailNow();
    res.json({ success: true, message: 'Daily email triggered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/kash/test-weekly', async (req, res) => {
  try {
    await triggerWeeklyEmailNow();
    res.json({ success: true, message: 'Weekly email triggered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Error Handling & Extra Services
app.use((req, res) => res.status(404).json({ success: false, message: "Route non trouvée" }));
app.use(errorHandler);

require('./services/automatedBriefing');

// 6. Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Serveur lancé sur le port ${PORT}
📍 URL: http://localhost:${PORT}
🤖 Mode: ${process.env.NODE_ENV || 'production'}
  `);

  // Start Kash Cron Job
  startKashCron();
});

module.exports = app;