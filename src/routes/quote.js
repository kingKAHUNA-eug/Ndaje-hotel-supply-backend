const express = require('express');
const router = express.Router();
const {
  authenticateToken,
  requireClient,
  requireManager
} = require('../middlewares/auth');

const {
  createEmptyQuote,
  addQuoteItems,
  updateQuoteItems,
  finalizeQuote,
  approveQuote,
  rejectQuote,
  convertQuoteToOrder,
  getQuoteById,
  getManagerQuotes,
  getClientQuotes
} = require('../controllers/quoteController');

// All routes require authentication
router.use(authenticateToken);

// Client routes
router.post('/', requireClient, createEmptyQuote);
router.post('/:quoteId/add-items', requireClient, addQuoteItems);
router.put('/:quoteId/finalize', requireClient, finalizeQuote);
router.post('/approve', requireClient, approveQuote);
router.post('/reject', requireClient, rejectQuote);
router.post('/convert/:quoteId', requireClient, convertQuoteToOrder);

// Manager routes
router.put('/:quoteId/update-pricing', requireManager, updateQuoteItems);
router.post('/:quoteId/approve', requireManager, approveQuote);
router.post('/:quoteId/reject', requireManager, rejectQuote);
router.get('/manager/pending', requireManager, getManagerQuotes);

// Client routes for quotes
router.get('/client/my-quotes', requireClient, getClientQuotes);

// Shared route
router.get('/:quoteId', getQuoteById);

module.exports = router;
