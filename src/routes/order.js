const express = require('express');
const { 
  createOrder, 
  getClientOrders, 
  getManagerOrders, 
  updateOrderStatus, 
  getOrder 
} = require('../controllers/orderController');
const { 
  authenticateToken, 
  requireClient, 
  requireManagerOrAdmin 
} = require('../middlewares/auth');

const router = express.Router();

// Client routes
router.post('/', authenticateToken, requireClient, createOrder);
router.get('/my-orders', authenticateToken, requireClient, getClientOrders);

// Manager/Admin routes
router.get('/all', authenticateToken, requireManagerOrAdmin, getManagerOrders);
router.put('/:id/status', authenticateToken, requireManagerOrAdmin, updateOrderStatus);

// General routes (authenticated users can view their own orders)
router.get('/:id', authenticateToken, getOrder);

module.exports = router;
