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
  deleteQuoteByManager
} = require('../controllers/quoteController');

// Import ActivityService for logging
const ActivityService = require('../services/activityService');

// All routes require authentication
router.use(authenticateToken);

// Client routes
router.post('/', requireClient, createEmptyQuote);
router.post('/:quoteId/add-items', requireClient, addQuoteItems);
router.put('/:quoteId/finalize', requireClient, finalizeQuote);
router.put('/:quoteId/approve', requireClient, async (req, res, next) => {
  try {
    // Get current quote status before approving
    const { quoteId } = req.params;
    const { prisma } = require('../index');
    
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    // Call the original controller
    await approveQuote(req, res, next);
    
    // Log activity if successful
    if (res.statusCode === 200) {
      await ActivityService.logQuoteStatusChange(
        quoteId,
        quote.status,
        'APPROVED',
        req.user.userId
      );
    }
  } catch (error) {
    next(error);
  }
});
router.put('/:quoteId/reject', requireClient, async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const { prisma } = require('../index');
    
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    await rejectQuote(req, res, next);
    
    if (res.statusCode === 200) {
      await ActivityService.logQuoteStatusChange(
        quoteId,
        quote.status,
        'REJECTED',
        req.user.userId
      );
    }
  } catch (error) {
    next(error);
  }
});
router.post('/:quoteId/convert-to-order', requireClient, convertQuoteToOrder);

// Manager routes
router.get('/manager/pending', requireManager, getAvailableQuotes);
router.get('/manager/quotes', requireManager, getManagerQuotes);
router.get('/manager/available', requireManager, getQuotesForLocking);
router.get('/manager/locked', requireManager, getMyLockedQuotes);
router.get('/manager/awaiting-approval', requireManager, getQuotesAwaitingApproval);
router.get('/debug/db', debugDatabase);

// Lock routes with activity logging
router.post('/lock', requireManager, async (req, res, next) => {
  try {
    await lockQuoteForPricing(req, res, next);
    
    if (res.statusCode === 200) {
      const { quoteId } = req.body;
      await ActivityService.logActivity({
        type: 'quote',
        description: `Manager locked quote #${quoteId?.slice(-8)} for pricing`,
        userId: req.user.userId,
        metadata: { quoteId }
      });
    }
  } catch (error) {
    next(error);
  }
});

router.put('/:quoteId/release-lock', requireManager, async (req, res, next) => {
  try {
    await releaseQuoteLock(req, res, next);
    
    if (res.statusCode === 200) {
      const { quoteId } = req.params;
      await ActivityService.logActivity({
        type: 'quote',
        description: `Manager released lock on quote #${quoteId.slice(-8)}`,
        userId: req.user.userId,
        metadata: { quoteId }
      });
    }
  } catch (error) {
    next(error);
  }
});

router.get('/:quoteId/lock-status', requireManager, checkQuoteLockStatus);

// Update pricing with activity logging
router.put('/:quoteId/update-pricing', requireManager, async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const { prisma } = require('../index');
    
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    await updateQuoteItems(req, res, next);
    
    if (res.statusCode === 200) {
      await ActivityService.logQuoteStatusChange(
        quoteId,
        quote.status,
        'AWAITING_CLIENT_APPROVAL',
        req.user.userId
      );
    }
  } catch (error) {
    next(error);
  }
});

// Delete quote with activity logging
router.delete('/:quoteId/delete', requireManagerOrAdmin, async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    
    // Log before deletion
    await ActivityService.logActivity({
      type: 'quote',
      description: `Quote #${quoteId.slice(-8)} deleted by ${req.user.role}`,
      userId: req.user.userId,
      metadata: { quoteId, deletedBy: req.user.role }
    });
    
    await deleteQuoteByManager(req, res, next);
  } catch (error) {
    next(error);
  }
});

// Client quotes route
router.get('/client/my-quotes', requireClient, getClientQuotes);

// Shared route
router.get('/:quoteId', getQuoteById);

module.exports = router;