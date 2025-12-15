const express = require('express');
const router = express.Router();
const { authenticateToken, requireManager } = require('../middlewares/auth');
const managerController = require('../controllers/managerController');

// Protect all manager routes
router.use(authenticateToken);
router.use(requireManager);

// Dashboard endpoints (under /api/quotes/manager)
router.get('/quotes', managerController.getManagerQuotes);
router.get('/available', managerController.getAvailableQuotes);
router.get('/locked', managerController.getLockedQuotes);
router.get('/awaiting-approval', managerController.getAwaitingApprovalQuotes);

// Action endpoints
router.post('/lock', managerController.lockQuote);
router.put('/:id/update-pricing', managerController.updatePricing);
router.delete('/:id/delete', managerController.deleteQuote);

// Legacy endpoints for backward compatibility
router.get('/quotes/pending', managerController.getPendingQuotes);
router.post('/quotes/:id/price', managerController.priceAndApproveQuote);
router.get('/orders', managerController.getMyPricedOrders);

// Notification endpoint (ADD THIS)
router.get('/notifications', managerController.getManagerNotifications);

module.exports = router;