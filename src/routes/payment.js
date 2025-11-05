const express = require('express');
const { 
  createPayment, 
  getPaymentStatus, 
  approvePayment, 
  getAllPayments,
  handleMTNWebhook,
  checkPaymentStatus
} = require('../controllers/paymentController');
const { 
  authenticateToken, 
  requireClient, 
  requireManagerOrAdmin 
} = require('../middlewares/auth');

const router = express.Router();

// Client routes
router.post('/', authenticateToken, requireClient, createPayment);
router.get('/status/:orderId', authenticateToken, requireClient, getPaymentStatus);
router.get('/check/:orderId', authenticateToken, requireClient, checkPaymentStatus);

// Manager/Admin routes
router.get('/all', authenticateToken, requireManagerOrAdmin, getAllPayments);
router.put('/:paymentId/approve', authenticateToken, requireManagerOrAdmin, approvePayment);

// Webhook routes (no authentication required)
router.post('/webhook/mtn', handleMTNWebhook);

module.exports = router;
