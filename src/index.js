// src/index.js — FIXED FOR NETLIFY + CORS BLOCKS
require('dotenv').config();
console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
//const adminGuard = require('./middlewares/adminGuard');
const { authenticateToken, requireAdmin } = require('./middlewares/auth');
// ────── Prisma export ──────
const prisma = new PrismaClient();
module.exports.prisma = prisma;

// Import routes
const authRoutes = require('./routes/auth');
const addressRoutes = require('./routes/address');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const quoteRoutes = require('./routes/quote');
const deliveryRoutes = require('./routes/delivery');

const app = express();

// FIXED CORS — RENDER.COM PROOF
app.use(cors({
  origin: [
    'https://ndaje-admin.vercel.app',
    'https://ndaje-hotel-supply.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors()); // THIS FIXES PREFLIGHT ON RENDER

// Security & logging
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health & root
app.get('/', (req, res) => {
  res.json({ success: true, message: 'NDAJE Backend Running — King KAHUNA Empire' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'NDAJE Backend Running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ────── ROUTES ──────
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/deliveries', deliveryRoutes);

// ADMIN ROUTES — LOCKED TO role:ADMIN ONLY
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);
app.use('/api/manager', require('./routes/manager'));
// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error.message);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
});

// ────── START SERVER ──────
const PORT = process.env.PORT || 10000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NDAJE Backend Running on port ${PORT}`);
      console.log(`Netlify Client → https://agent-691c6fc90f8b02212de--ndaje-client-frontend.netlify.app`);
      console.log(`Health check → https://ndaje-hotel-supply-backend.onrender.com/health`);
      console.log(`Rwanda belongs to NDAJE.`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();