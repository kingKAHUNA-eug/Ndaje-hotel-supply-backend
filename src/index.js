// src/index.js
require('dotenv').config();
console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

// ────── ADDED: Export prisma for other files (authController, etc.) ──────
const prisma = new PrismaClient();
module.exports.prisma = prisma;   // <── NEW LINE
// ────────────────────────────────────────────────────────────────────────

const authRoutes = require('./routes/auth');

// Import routes
const addressRoutes = require('./routes/address');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const quoteRoutes = require('./routes/quote');
const deliveryRoutes = require('./routes/delivery');
//const verificationRoutes = require('./routes/verification');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// ────── ADDED: Health-check at root (optional, nice to have) ──────
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Hotel Supply API Running' });
});
// ────────────────────────────────────────────────────────────────────────

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('dev'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
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
//app.use('/api/verification', verificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Prisma errors
  if (error.code === 'P2002') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found'
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

const port = process.env.PORT || 4000;

// Connect to database and start server
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Root check:   http://localhost:${port}/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();