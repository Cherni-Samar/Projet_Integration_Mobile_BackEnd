require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import des routes
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const errorHandler = require('./middleware/errorHandler');
const heraRoutes = require('./routes/heraRoutes');
const agentRoutes = require('./routes/agentRoutes');
const emailRoutes = require('./routes/emailRoutes');
const echoRoutes = require('./routes/echoroutes');
const dexoRoutes = require('./routes/dexoRoutes');

// Import DEXO Autonomous Service
const autonomousService = require('./services/autonomousService');

// Import des middlewares
const {
  validateMessage,
  quickSpamGuard,
  messageLogger,
  processingTimeout,
} = require('./middleware/messageMiddleware');

// Import de la configuration LangChain
const { langchainConfig, initializeConfig } = require('./config/langchainConfig');

const app = express();

// ─────────────────────────────────────────
// Création du dossier logs
// ─────────────────────────────────────────
if (process.env.LOG_TO_FILE === 'true') {
  const logDir = path.dirname(process.env.LOG_FILE_PATH || './logs/app.log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    console.log('📁 Created logs directory:', logDir);
  }
}

// ─────────────────────────────────────────
// Initialisation de la configuration
// ─────────────────────────────────────────
try {
  initializeConfig();
  console.log('✅ LangChain configuration loaded successfully');
} catch (error) {
  console.error('❌ Configuration error:', error.message);
}

// ─────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
  });
}

// ─────────────────────────────────────────
// MongoDB Connection
// ─────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined');
  process.exit(1);
}

const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

console.log('📡 Connecting to MongoDB...');
mongoose
  .connect(process.env.MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`📍 Host: ${mongoose.connection.host}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// ─────────────────────────────────────────
// Health Check Endpoints
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'Flutter Auth API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: '/api/auth',
      payment: '/api/payment',
      messages: '/api/messages',
      hera: '/api/hera',
      agents: '/api/agents',
      emails: '/api/emails',
      echo: '/api/echo',
      dexo: '/api/dexo',
    },
  });
});

app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      name: mongoose.connection.name || 'N/A'
    },
    config: {
      spamFilter: process.env.ENABLE_SPAM_FILTER === 'true',
      priority: process.env.ENABLE_PRIORITY === 'true',
      logging: process.env.ENABLE_LOGGING === 'true'
    }
  };
  
  const isHealthy = healthCheck.mongodb.status === 'connected';
  res.status(isHealthy ? 200 : 503).json(healthCheck);
});

// ─────────────────────────────────────────
// Routes API
// ─────────────────────────────────────────
console.log('\n📡 Registering API routes...');

app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/hera', heraRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/echo', echoRoutes);
app.use('/api/dexo', dexoRoutes);

app.use(
  '/api/messages',
  messageLogger,
  processingTimeout,
  validateMessage,
  quickSpamGuard,
  messageRoutes
);

console.log('✅ Routes registered:');
console.log('   - POST   /api/auth/register');
console.log('   - POST   /api/auth/login');
console.log('   - GET    /api/emails');
console.log('   - POST   /api/messages/process');
console.log('   - POST   /api/messages/spam-check');
console.log('   - POST   /api/messages/batch');
console.log('   - GET    /api/messages/history');
console.log('   - GET    /api/messages/stats');
console.log('   - GET    /api/agents/echo');
console.log('   - POST   /api/agents/echo');
console.log('   - POST   /api/echo/analyser');
console.log('   - POST   /api/echo/full-analysis');
console.log('   - POST   /api/echo/auto-reply');
console.log('   - POST   /api/echo/check-escalation');
console.log('   - POST   /api/echo/filter-noise');
console.log('   - POST   /api/echo/extract-tasks');
console.log('   - POST   /api/echo/batch');
console.log('   - POST   /api/echo/batch-advanced');
console.log('   - POST   /api/dexo/upload');
console.log('   - POST   /api/dexo/classify');
console.log('   - POST   /api/dexo/search');
console.log('   - POST   /api/dexo/security-check');
console.log('   - POST   /api/dexo/generate-document');
console.log('   - POST   /api/dexo/detect-duplicates');
console.log('   - POST   /api/dexo/create-version');
console.log('   - GET    /api/dexo/check-expirations');
console.log('   - GET    /api/dexo/health');

// ─────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

// ─────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, HOST, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SERVER STARTED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`📍 Host: ${HOST}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://${HOST}:${PORT}/api`);
  console.log(`❤️  Health Check: http://${HOST}:${PORT}/health`);
  console.log('='.repeat(60));
  
  console.log('\n📋 Active Features:');
  console.log(`   🔒 Authentication: ${process.env.JWT_SECRET ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   🛡️  Spam Filter: ${process.env.ENABLE_SPAM_FILTER === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   ⚡ Priority Engine: ${process.env.ENABLE_PRIORITY === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   📝 Summarization: ${process.env.ENABLE_SUMMARIZATION === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   💾 Message History: ${process.env.SAVE_MESSAGE_HISTORY === 'true' ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   📊 Logging: ${process.env.ENABLE_LOGGING === 'true' ? '✅ Enabled' : '❌ Disabled'}`);

  // Start DEXO Autonomous Service
  console.log('\n' + '='.repeat(60));
  console.log('🤖 STARTING DEXO AUTONOMOUS SERVICE');
  console.log('='.repeat(60));
  
  try {
    await autonomousService.start();
    console.log('✅ DEXO Autonomous Service: ACTIVE');
    console.log('📁 Auto-processing: Documents will be processed automatically');
    console.log('👁️  User interaction: MINIMAL - Just watch DEXO work!');
    console.log('🤖 AI Decision Making: 100% AUTONOMOUS');
  } catch (error) {
    console.error('❌ DEXO Autonomous Service: FAILED TO START');
    console.error('Error:', error.message);
  }
  
  console.log('='.repeat(60));  
  console.log('\n🤖 AI Models:');
  console.log(`   OpenAI: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Gemini: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   HuggingFace: ${process.env.HF_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  
  console.log('\n💡 Tip: Use POST http://localhost:3000/api/messages/process to send messages');
  console.log('='.repeat(60) + '\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

// ─────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (err) {
      console.error('❌ Error closing MongoDB connection:', err);
    }
    console.log('👋 Graceful shutdown completed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

module.exports = { app, server };