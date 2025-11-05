const express = require('express');
const router = express.Router();
const { authenticateToken, requireManagerOrAdmin, requireDeliveryAgent, requireClient, requireAdmin } = require('../middlewares/auth');
const {
  assignDeliveryAgent,
  updateDeliveryStatus,
  getDeliveryById,
  getAgentDeliveries,
  getClientDeliveries,
  getAllDeliveries,
  getDeliveryTracking,
  verifyDeliveryByClient,
  confirmDeliveryByManager,
  getDeliveryCode
} = require('../controllers/deliveryController');

// Apply authentication to all routes
router.use(authenticateToken);

// Manager/Admin routes
router.post('/assign', requireManagerOrAdmin, assignDeliveryAgent);
router.post('/:deliveryId/confirm', requireManagerOrAdmin, confirmDeliveryByManager);

// Delivery Agent routes
router.put('/:deliveryId/status', requireDeliveryAgent, updateDeliveryStatus);
router.get('/agent', requireDeliveryAgent, getAgentDeliveries);
router.get('/:deliveryId/code', requireDeliveryAgent, getDeliveryCode);

// Client routes
router.get('/client', requireClient, getClientDeliveries);
router.get('/tracking/:orderId', requireClient, getDeliveryTracking);
router.post('/:deliveryId/verify', requireClient, verifyDeliveryByClient);

// Admin routes
router.get('/admin/all', requireAdmin, getAllDeliveries);

// General routes (accessible by all authenticated users with proper permissions)
router.get('/:deliveryId', getDeliveryById);

module.exports = router;
