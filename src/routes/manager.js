// routes/manager.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const { authenticateToken, requireManager } = require('../middlewares/auth');
const managerController = require('../controllers/managerController');

// Protect all manager routes
router.use(authenticateToken);
router.use(requireManager);

// New endpoints for the frontend dashboard
router.get('/quotes', managerController.getManagerQuotes);                 // GET /api/quotes/manager/quotes
router.get('/available', managerController.getAvailableQuotes);           // GET /api/quotes/manager/available
router.get('/locked', managerController.getLockedQuotes);                 // GET /api/quotes/manager/locked
router.get('/awaiting-approval', managerController.getAwaitingApprovalQuotes); // GET /api/quotes/manager/awaiting-approval
router.post('/lock', managerController.lockQuote);                       // POST /api/quotes/manager/lock
router.put('/:id/update-pricing', managerController.updatePricing);      // PUT /api/quotes/manager/:id/update-pricing
// FIXED DELETE ROUTE - Remove duplicate prefix and use correct middleware
router.delete('/:id/delete', authenticateToken, requireManager, managerController.deleteQuote); // DELETE /api/quotes/manager/:id/delete

// Original endpoints (keep for backward compatibility if needed)
router.get('/quotes/pending', managerController.getPendingQuotes);       // GET /api/quotes/manager/quotes/pending
router.post('/quotes/:id/price', managerController.priceAndApproveQuote); // POST /api/quotes/manager/quotes/:id/price
router.get('/orders', managerController.getMyPricedOrders);              // GET /api/quotes/manager/orders

module.exports = router;