// src/index.js — FINAL RENDER-READY VERSION (100% LIVE ON RENDER)
require('dotenv').config();
console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

// ────── Export prisma for other files (authController, etc.) ──────
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

// Security middleware
app.use(helmet());

// CORS configuration — allows localhost + future live domains
const allowedOrigins = (
  process.env.FRONTEND_URL || 'http://localhost:5173'
)
  .split(',')
  .map(origin => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('dev'));

// Root & Health check
app.get('/', (req, res) => {
  res.json({ success: true, message: 'NDAJE Backend Running — King KAHUNA Empire' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'NDAJE Backend Running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT || 10000,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/deliveries', deliveryRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  if (error.code === 'P2002') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found',
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
    });
  }

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// ────── RENDER PORT FIX: Force port + bind to 0.0.0.0 ──────
const PORT = process.env.PORT || 10000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NDAJE Backend Running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Health check: https://ndaje-backend.onrender.com/health`);
      console.log(`Root check:   https://ndaje-backend.onrender.com/`);
      console.log(`Rwanda belongs to NDAJE.`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();