require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');
const heraRoutes = require('./routes/heraRoutes');
const agentRoutes = require('./routes/agentRoutes');
const kashRoutes = require('./routes/kashRoutes');
const { startContractCron } = require('./services/contractCron');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/api/employees', require('./routes/employeeAuth'));

// ✅ MongoDB Connection (sans les options obsolètes)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    startContractCron(); // ← le cron démarre après MongoDB
  })
  .catch((err) => console.error('❌ MongoDB Error:', err.message));

  
// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Flutter Auth API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth'
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
// ✅ AJOUTER
app.use('/api/hera',heraRoutes)
app.use('/api/agents', agentRoutes);
app.use('/api/kash', kashRoutes);

// Error Handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} déjà utilisé (EADDRINUSE).`);
    console.error(`➡️  Stoppe l'ancien process ou lance avec: PORT=3001 node app.js`);
    process.exit(1);
  }

  console.error('❌ Server error:', err);
  process.exit(1);
});

module.exports = app;