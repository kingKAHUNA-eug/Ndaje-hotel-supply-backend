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
  getClientQuotes,
  lockQuoteForPricing,
  releaseQuoteLock,
  checkQuoteLockStatus,
  getAvailableQuotes,
  getLockedQuotes,  // ADD THIS IMPORT
  
  //debugAllQuotes,    
} = require('../controllers/quoteController');

// All routes require authentication
router.use(authenticateToken);

// Client routes
router.post('/', requireClient, createEmptyQuote);
router.post('/:quoteId/add-items', requireClient, addQuoteItems);
router.put('/:quoteId/finalize', requireClient, finalizeQuote);
router.put('/:quoteId/approve', requireClient, approveQuote);
router.put('/:quoteId/reject', requireClient, rejectQuote);
router.post('/:quoteId/convert-to-order', requireClient, convertQuoteToOrder);

// Manager routes
router.get('/manager/pending', requireManager, getAvailableQuotes);
router.get('/manager/available', requireManager, getAvailableQuotes);
router.get('/manager/quotes', getManagerQuotes);
router.post('/lock', requireManager, lockQuoteForPricing);
router.put('/:quoteId/release-lock', requireManager, releaseQuoteLock);
router.get('/:quoteId/lock-status', requireManager, checkQuoteLockStatus);
router.put('/:quoteId/update-pricing', requireManager, updateQuoteItems);
router.get('/manager/locked', requireManager, getLockedQuotes);
//router.get('/manager/debug', requireManager, debugAllQuotes);
// Client quotes route
router.get('/client/my-quotes', requireClient, getClientQuotes);

// Shared route
router.get('/:quoteId', getQuoteById);

module.exports = router;