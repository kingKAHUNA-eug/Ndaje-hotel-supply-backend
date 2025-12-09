const { z } = require('zod');  // Make sure this is at the top!
const QuoteService = require('../services/quoteService');

// Validation schemas
const createEmptyQuoteSchema = z.object({
  notes: z.string().optional()
});

const addQuoteItemsSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1')
  })).min(1, 'At least one item is required')
});

const updateQuoteItemsSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().positive('Unit price must be positive')
  })).min(1, 'At least one item is required'),
  sourcingNotes: z.string().optional()
});

const approveQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required')
});

const rejectQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required'),
  reason: z.string().optional()
});

// Add this new schema for locking
const lockQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required')
});

// Client creates empty quote
const createEmptyQuote = async (req, res) => {
  try {
    const { notes } = createEmptyQuoteSchema.parse(req.body);
    const clientId = req.user.userId;

    const quote = await QuoteService.createEmptyQuote(clientId, notes);

    res.status(201).json({
      success: true,
      message: 'Quote created',
      data: { quote }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Client adds items to quote
const addQuoteItems = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const clientId = req.user.userId;
    const { items } = addQuoteItemsSchema.parse(req.body);

    const quote = await QuoteService.addItemsToQuote(quoteId, clientId, items);

    res.status(200).json({
      success: true,
      message: 'Items added to quote',
      data: { quote }
    });
  } catch (error) {
    let statusCode = 500;
    if (error.message.includes('Quote not found') || error.message.includes('access denied')) {
      statusCode = 404;
    } else if (error.message.includes('cannot be modified') || error.message.includes('cannot add more items')) {
      statusCode = 409; // Conflict - resource cannot be modified in current state
    } else if (error.message.includes('not found') || error.message.includes('inactive')) {
      statusCode = 400; // Bad Request - invalid data
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};
// NEW: Get manager's locked quotes only
const getLockedQuotes = async (req, res) => {
  try {
    const managerId = req.user.userId;
    
    console.log(`🔒 API: Fetching locked quotes for manager: ${managerId}`);
    
    // Call getManagerQuotes with 'locked' status
    const quotes = await QuoteService.getManagerQuotes(managerId, 'locked');
    
    console.log(`🔒 API: Found ${quotes.length} locked quotes`);
    
    res.json({
      success: true,
      message: 'Locked quotes retrieved',
      data: quotes
    });
  } catch (error) {
    console.error('Error in getLockedQuotes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DEBUG: Test if manager quotes endpoint works
const testManagerQuotes = async (req, res) => {
  try {
    const managerId = req.user.userId;
    console.log(`🛠️ Testing manager quotes endpoint for manager: ${managerId}`);
    
    // Call the service function directly
    const quotes = await QuoteService.getAvailableQuotes(managerId);
    
    res.json({
      success: true,
      message: 'Test endpoint working',
      endpoint: '/api/quotes/manager/pending',
      count: quotes.length,
      data: quotes,
      stats: {
        locked: quotes.filter(q => q.status === 'IN_PRICING' && q.lockedById === managerId).length,
        pending: quotes.filter(q => q.status === 'PENDING_PRICING').length,
        awaiting_approval: quotes.filter(q => q.status === 'AWAITING_CLIENT_APPROVAL').length
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// DEBUG: Check all quotes in database
const debugAllQuotes = async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { status: 'PENDING_PRICING' },
          { status: 'IN_PRICING' },
          { status: 'AWAITING_CLIENT_APPROVAL' }
        ]
      },
      select: {
        id: true,
        status: true,
        lockedById: true,
        managerId: true,
        lockExpiresAt: true,
        clientId: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Get manager name for lockedById
    const quotesWithDetails = await Promise.all(
      quotes.map(async (quote) => {
        let lockedBy = null;
        if (quote.lockedById) {
          lockedBy = await prisma.user.findUnique({
            where: { id: quote.lockedById },
            select: { name: true, email: true }
          });
        }
        
        return {
          ...quote,
          lockedBy: lockedBy?.name || 'Unknown',
          isLockExpired: quote.lockExpiresAt && new Date() > new Date(quote.lockExpiresAt)
        };
      })
    );
    
    res.json({
      success: true,
      message: 'Debug: All quotes in database',
      count: quotesWithDetails.length,
      data: quotesWithDetails
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Manager updates pricing
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
    if (error.message.includes('do not have an active lock')) {
      statusCode = 403;
      error.message = 'You do not have an active lock on this quote. Please lock it first.';
    } else if (error.message.includes('not in pricing state')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// Client finalizes quote (sends to manager)
const finalizeQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const clientId = req.user.userId;

    const quote = await QuoteService.submitQuoteToManager(quoteId, clientId);

    res.status(200).json({
      success: true,
      message: 'Quote finalized and sent to manager',
      data: { quote }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Client approves quote
const approveQuote = async (req, res) => {
  try {
    const { quoteId } = req.params.quoteId ? { quoteId: req.params.quoteId } : approveQuoteSchema.parse(req.body);
    const clientId = req.user.userId;

    const quote = await QuoteService.approveQuote(quoteId, clientId);

    res.status(200).json({
      success: true,
      message: 'Quote approved',
      data: { quote }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Client rejects quote
const rejectQuote = async (req, res) => {
  try {
    const { quoteId, reason } = rejectQuoteSchema.parse(req.body);
    const clientId = req.user.userId;

    const quote = await QuoteService.rejectQuote(quoteId, clientId, reason);

    res.status(200).json({
      success: true,
      message: 'Quote rejected',
      data: { quote }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Client converts quote to order
const convertQuoteToOrder = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const clientId = req.user.userId;
    const { addressId, paymentMethod } = req.body;

    const order = await QuoteService.convertToOrder(quoteId, clientId, addressId, paymentMethod);

    res.status(201).json({
      success: true,
      message: 'Order created from quote',
      data: { order }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get quote by ID
const getQuoteById = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const quote = await QuoteService.getQuoteById(quoteId);

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    res.json({ success: true, data: { quote } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get manager quotes
const getManagerQuotes = async (req, res) => {
  try {
    const managerId = req.user.userId;
    const { status } = req.query;
    
    const quotes = await QuoteService.getManagerQuotes(managerId, status);

    res.json({
      success: true,
      message: 'Manager quotes retrieved',
      data:  quotes 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get client quotes
const getClientQuotes = async (req, res) => {
  try {
    const clientId = req.user.userId;
    const { status } = req.query;
    
    const quotes = await QuoteService.getClientQuotes(clientId, status);

    res.json({
      success: true,
      message: 'Client quotes retrieved',
      data: quotes
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Manager locks quote for pricing
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
    } else if (error.message.includes('being handled by')) {
      statusCode = 409; // Conflict - quote is being handled by another manager
    } else if (error.message.includes('not ready for pricing')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// NEW: Manager releases quote lock
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
    let statusCode = 500;
    if (error.message.includes('Quote not found')) {
      statusCode = 404;
    } else if (error.message.includes('do not have a lock')) {
      statusCode = 403;
    }
    
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// NEW: Check quote lock status
const checkQuoteLockStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = req.user.userId;

    const lockStatus = await QuoteService.checkQuoteLockStatus(quoteId, managerId);

    res.status(200).json({
      success: true,
      data: lockStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// In quoteController.js - update the getAvailableQuotes function:
const getAvailableQuotes = async (req, res) => {
  try {
    const managerId = req.user.userId;
    
    const quotes = await QuoteService.getAvailableQuotes(managerId);

    res.json({
      success: true,
      message: 'Available quotes retrieved',
      data: quotes  // Make sure this is an array, not { quotes: [...] }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
  lockQuoteForPricing,    
  releaseQuoteLock,  
  checkQuoteLockStatus,    
  getAvailableQuotes,
  getLockedQuotes,
  debugAllQuotes
};