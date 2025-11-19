// routes/manager.js
const express = require('express');
const router = express.Router();

// IMPORT EVERYTHING YOU NEED
const { authenticateToken, requireManager } = require('../middlewares/auth');

const {
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
} = require('../controllers/managerController');

// Protect all manager routes
router.use(authenticateToken);
router.use(requireManager);  // NOW IT WORKS — requireManager IS IMPORTED!

// Manager routes
router.get('/quotes/pending', getPendingQuotes);
router.post('/quotes/:id/price', priceAndApproveQuote);
router.get('/orders', getMyPricedOrders);

module.exports = router;