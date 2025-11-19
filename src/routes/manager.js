// routes/manager.js  (new file)
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middlewares/auth');
const {
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
} = require('../controllers/managerController');

router.use(authenticateToken);
router.use(requireManager);

router.get('/quotes/pending', getPendingQuotes);           // Manager sees all pending quotes
router.post('/quotes/:id/price', priceAndApproveQuote);    // Manager sets prices → turns into Order
router.get('/orders', getMyPricedOrders);                  // Manager sees orders he created

module.exports = router;