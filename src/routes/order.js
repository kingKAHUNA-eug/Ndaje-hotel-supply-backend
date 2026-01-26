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

// Import ActivityService
const ActivityService = require('../services/activityService');

const router = express.Router();

// Client routes with activity logging
router.post('/', authenticateToken, requireClient, async (req, res, next) => {
  try {
    await createOrder(req, res, next);
    
    if (res.statusCode === 201) {
      const order = res.locals.order || (res.body?.data || res.body);
      if (order) {
        await ActivityService.logOrderCreated(
          order.id,
          req.user.userId,
          order.totalAmount || 0,
          req.user.userId
        );
      }
    }
  } catch (error) {
    next(error);
  }
});

router.get('/my-orders', authenticateToken, requireClient, getClientOrders);

// Manager/Admin routes with activity logging
router.get('/all', authenticateToken, requireManagerOrAdmin, getManagerOrders);

router.put('/:id/status', authenticateToken, requireManagerOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { prisma } = require('../index');
    
    // Get current order status
    const order = await prisma.order.findUnique({
      where: { id }
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    await updateOrderStatus(req, res, next);
    
    if (res.statusCode === 200) {
      await ActivityService.logActivity({
        type: 'order',
        description: `Order #${id.slice(-8)} status changed from ${order.status} to ${status}`,
        userId: req.user.userId,
        metadata: { orderId: id, oldStatus: order.status, newStatus: status }
      });
    }
  } catch (error) {
    next(error);
  }
});

// General routes (authenticated users can view their own orders)
router.get('/:id', authenticateToken, getOrder);

module.exports = router;