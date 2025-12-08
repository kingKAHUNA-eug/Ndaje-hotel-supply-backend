// Add these validation schemas
const lockQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required')
});

// New: Manager locks quote for pricing
const lockQuoteForPricing = async (req, res) => {
  try {
    const { quoteId } = lockQuoteSchema.parse(req.body);
    const managerId = req.user.userId;

    const quote = await QuoteService.lockQuoteForPricing(quoteId, managerId);

    res.status(200).json({
      success: true,
      message: 'Quote locked for pricing',
      data: { quote }
    });
  } catch (error) {
    let statusCode = 500;
    if (error.message.includes('Quote not found')) {
      statusCode = 404;
    } else if (error.message.includes('being handled by another manager')) {
      statusCode = 409;
      error.message = 'This quote is currently being handled by another manager. Please try another quote.';
    } else if (error.message.includes('not ready for pricing')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// New: Manager releases lock
const releaseQuoteLock = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = req.user.userId;

    await QuoteService.releaseQuoteLock(quoteId, managerId);

    res.status(200).json({
      success: true,
      message: 'Quote lock released'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update the updateQuoteItems function to check for lock
const updateQuoteItems = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = req.user.userId;
    const { items, sourcingNotes } = updateQuoteItemsSchema.parse(req.body);

    const quote = await QuoteService.updateQuotePricing(quoteId, managerId, items, sourcingNotes);

    res.status(200).json({
      success: true,
      message: 'Quote pricing updated',
      data: { quote }
    });
  } catch (error) {
    let statusCode = 500;
    if (error.message.includes('do not have a lock')) {
      statusCode = 403;
      error.message = 'You do not have an active lock on this quote. Please lock it first.';
    } else if (error.message.includes('not in pricing state')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// Add new function to check quote lock status
const checkQuoteLockStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = req.user.userId;

    const quote = await QuoteService.getQuoteById(quoteId);

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    const isLocked = quote.lockedById && quote.lockedById !== managerId;
    const isLockedByMe = quote.lockedById === managerId;
    const isExpired = quote.lockExpiresAt && new Date() > quote.lockExpiresAt;

    res.json({
      success: true,
      data: {
        isLocked,
        isLockedByMe,
        isExpired,
        lockedById: quote.lockedById,
        lockedAt: quote.lockedAt,
        lockExpiresAt: quote.lockExpiresAt,
        status: quote.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update module.exports to include new functions
module.exports = {
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
  lockQuoteForPricing,     // New
  releaseQuoteLock,        // New
  checkQuoteLockStatus     // New
};