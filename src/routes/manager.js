const express = require('express');
const router = express.Router();
const { authenticateToken, requireManager } = require('../middlewares/auth');
const managerController = require('../controllers/managerController');

router.use(authenticateToken);
router.use(requireManager);

// Main endpoints
router.get('/quotes', managerController.getManagerQuotes);
router.get('/available', managerController.getAvailableQuotes);
router.get('/locked', managerController.getLockedQuotes);
router.get('/awaiting-approval', managerController.getAwaitingApprovalQuotes);
router.get('/notifications', managerController.getManagerNotifications);

// Actions
router.post('/lock', managerController.lockQuote);
router.put('/:id/update-pricing', managerController.updatePricing);
router.delete('/:id/delete', managerController.deleteQuote);

// Legacy
router.get('/quotes/pending', managerController.getPendingQuotes);
router.post('/quotes/:id/price', managerController.priceAndApproveQuote);
router.get('/orders', managerController.getMyPricedOrders);


// Notification endpoint
router.get('/notifications', managerController.getManagerNotifications);

module.exports = router;