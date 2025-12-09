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
  //getManagerQuotes, // Remove if not working
  getClientQuotes,
  lockQuoteForPricing,
  releaseQuoteLock,
  checkQuoteLockStatus,
  getAvailableQuotes,
  getQuotesForLocking,      // NEW
  getMyLockedQuotes,        // NEW
  getQuotesAwaitingApproval // NEW
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

// Manager routes - CLEAR SEPARATION
router.get('/manager/available', requireManager, getQuotesForLocking);     // PENDING_PRICING
router.get('/manager/locked', requireManager, getMyLockedQuotes);          // IN_PRICING (locked by me)
router.get('/manager/awaiting-approval', requireManager, getQuotesAwaitingApproval); // AWAITING_CLIENT_APPROVAL
router.get('/manager/all', requireManager, getAvailableQuotes);            // All manager quotes (all statuses)

// Lock routes
router.post('/lock', requireManager, lockQuoteForPricing);
router.put('/:quoteId/release-lock', requireManager, releaseQuoteLock);
router.get('/:quoteId/lock-status', requireManager, checkQuoteLockStatus);

// Update pricing
router.put('/:quoteId/update-pricing', requireManager, updateQuoteItems);

// Client quotes route
router.get('/client/my-quotes', requireClient, getClientQuotes);

// Shared route
router.get('/:quoteId', getQuoteById);

module.exports = router;