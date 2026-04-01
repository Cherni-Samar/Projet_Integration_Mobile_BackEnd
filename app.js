require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Routes
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const errorHandler = require('./middleware/errorHandler');
const heraRoutes = require('./routes/heraRoutes');
const agentRoutes = require('./routes/agentRoutes');
const emailRoutes = require('./routes/emailRoutes');

// Middlewares
const {
  validateMessage,
  quickSpamGuard,
  messageLogger,
  processingTimeout,
} = require('./middleware/messageMiddleware');

// LangChain
const { initializeConfig } = require('./config/langchainConfig');

const app = express();

// ─────────────────────────────────────────
// Logs directory
// ─────────────────────────────────────────
if (process.env.LOG_TO_FILE === 'true') {
  const logDir = path.dirname(process.env.LOG_FILE_PATH || './logs/app.log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// ─────────────────────────────────────────
// LangChain Init
// ─────────────────────────────────────────
try {
  initializeConfig();
  console.log('✅ LangChain initialized');
} catch (error) {
  console.error('❌ LangChain error:', error.message);
}

// ─────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
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

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch((err) => {
  console.error('❌ MongoDB Error:', err.message);
  process.exit(1);
});

// ─────────────────────────────────────────
// Routes
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'Flutter Auth API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      payment: '/api/payment',
      messages: '/api/messages',
      hera: '/api/hera',
      agents: '/api/agents',
      emails: '/api/emails',
      echo: '/api/echo',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    langchain: 'active'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/hera', heraRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/messages', messageLogger, processingTimeout, validateMessage, quickSpamGuard, messageRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: "Cannot ${req.method} ${req.url}",
  });
});

app.use(errorHandler);

// ─────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log("\n🚀 Server running on port ${PORT}");
  console.log("📍 http://localhost:${PORT}");
  console.log("❤️  Health: http://localhost:${PORT}/health");
  console.log("🤖 LangChain: ${process.env.OPENAI_API_KEY ? '✅ OpenAI' : '⚠️ No API key'}\n");
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error("❌ Port ${PORT} is already in use");
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

// ─────────────────────────────────────────
// Graceful Shutdown
// ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log("\n⚠️  ${signal} received. Shutting down...");
  server.close(async () => {
    await mongoose.connection.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('❌ Force shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
