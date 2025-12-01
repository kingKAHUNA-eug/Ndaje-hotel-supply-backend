const { z } = require('zod');
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
    // Determine appropriate status code based on error type
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
    res.status(500).json({ success: false, message: error.message });
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
      data: { quotes }
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
  getClientQuotes
};
