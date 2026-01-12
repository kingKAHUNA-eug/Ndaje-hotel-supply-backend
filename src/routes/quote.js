const express = require('express');
const router = express.Router();
const {
  authenticateToken,
  requireClient,
  requireManager,
  requireManagerOrAdmin
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
  getQuotesForLocking,
  getMyLockedQuotes,
  getQuotesAwaitingApproval,
  debugDatabase,
  deleteQuoteByManager  // Make sure this is imported
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

// Manager routes - KEEP BOTH OLD AND NEW
router.get('/manager/pending', requireManager, getAvailableQuotes); // KEEP THIS for frontend compatibility
router.get('/manager/quotes', requireManager, getManagerQuotes); // Keep this too

// New endpoints
router.get('/manager/available', requireManager, getQuotesForLocking);     // NEW: PENDING_PRICING
router.get('/manager/locked', requireManager, getMyLockedQuotes);          // NEW: IN_PRICING (locked by me)
router.get('/manager/awaiting-approval', requireManager, getQuotesAwaitingApproval); // NEW: AWAITING_CLIENT_APPROVAL
router.get('/debug/db', debugDatabase);

// Lock routes
router.post('/lock', requireManager, lockQuoteForPricing);
router.put('/:quoteId/release-lock', requireManager, releaseQuoteLock);
router.get('/:quoteId/lock-status', requireManager, checkQuoteLockStatus);

// Update pricing
router.put('/:quoteId/update-pricing', requireManager, updateQuoteItems);

// Delete quote (Manager/Admin)
router.delete('/:quoteId/delete', requireManagerOrAdmin, deleteQuoteByManager);

// Client quotes route
router.get('/client/my-quotes', requireClient, getClientQuotes);

// Shared route
router.get('/:quoteId', getQuoteById);

module.exports = router;