// src/index.js — CLEAN FIXED VERSION
require('dotenv').config();
console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');

// ────── Firebase Admin ──────
const admin = require('firebase-admin');
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
  console.log('Firebase Admin → LOADED FROM RENDER SECRET FILE — NDAJE IS ALIVE');
}

// ────── Core Dependencies ──────
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireAdmin } = require('./middlewares/auth');
const { setupCronJobs } = require('./services/cronService');

// ────── Prisma Client ──────
const prisma = new PrismaClient();
module.exports.prisma = prisma;

// ────── Import Routes ──────
const authRoutes = require('./routes/auth');
const addressRoutes = require('./routes/address');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const quoteRoutes = require('./routes/quote');
const deliveryRoutes = require('./routes/delivery');
const managerRoutes = require('./routes/manager');
const errorHandler = require('./middlewares/errorHandler');
const notificationRoutes = require('./routes/notification');
const driverRoutes = require('./routes/driver');
const productWishRoutes = require('./routes/productWishRoutes');

// ────── Create Express App ──────
const app = express();

// ────── CORS Middleware (MUST BE FIRST) ──────
const corsMiddleware = require('./middlewares/cors');
app.use(corsMiddleware);
app.options('*', corsMiddleware);

// ────── Security & Logging ──────
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ────── Debug Logging (remove in production) ──────
app.use((req, res, next) => {
  console.log('📥 Request:', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin
  });
  next();
});

// ────── Setup Cron Jobs ──────
setupCronJobs();

// ────── Health & Root ──────
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

// ────── Manager Profile Endpoint ──────
app.get('/api/managers/me', authenticateToken, async (req, res) => {
  try {
    const manager = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        role: true,
        phone: true
      }
    });

    if (!manager || manager.role !== 'MANAGER') {
      return res.status(404).json({ success: false, message: 'Manager not found' });
    }

    res.json({
      success: true,
      data: {
        _id: manager.id,
        id: manager.firebaseUid || manager.id,
        name: manager.name,
        email: manager.email,
        role: manager.role,
        phone: manager.phone
      }
    });
  } catch (error) {
    console.error('Error fetching manager:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────── API ROUTES ──────
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/quotes/manager', managerRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/product-wishes', productWishRoutes);

// ADMIN ROUTES — LOCKED TO role:ADMIN ONLY
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);

// ────── Error Handler ──────
app.use(errorHandler);

// ────── 404 Handler ──────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ────── Global Error Handler ──────
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
    console.log('✅ Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 NDAJE Backend Running on port ${PORT}`);
      console.log(`📍 Health check → https://ndaje-hotel-supply-backend.onrender.com/health`);
      console.log(`🇷🇼 Rwanda belongs to NDAJE.`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();