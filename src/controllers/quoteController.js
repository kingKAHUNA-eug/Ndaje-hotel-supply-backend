const { z } = require('zod');
const QuoteService = require('../services/quoteService');
const prisma = require('../config/prisma');

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

const lockQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required')
});

const deleteQuoteSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required')
});

// Helper function to extract manager ID from composite string
const extractManagerId = (userId) => {
  if (!userId) return null;
  
  if (typeof userId === 'string' && userId.includes('_')) {
    const parts = userId.split('_');
    return parts[parts.length - 1]; // Get last part (32-char string)
  }
  
  return userId;
};

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

// Manager updates pricing
const updateQuoteItems = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = extractManagerId(req.user.id || req.user.userId);
    const { items, sourcingNotes } = updateQuoteItemsSchema.parse(req.body);
    
    console.log('🔧 Update pricing:', {
      quoteId,
      extractedManagerId: managerId,
      user: req.user
    });
    
    // Find quote
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quote not found' 
      });
    }
    
    // ✅ Check with extracted ID
    if (quote.lockedById !== managerId) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have an active lock on this quote' 
      });
    }
    
    // Check lock expiration
    if (quote.lockExpiresAt && new Date(quote.lockExpiresAt) < new Date()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your lock on this quote has expired' 
      });
    }
    
    if (quote.status !== 'IN_PRICING') {
      return res.status(400).json({ 
        success: false, 
        message: 'Quote is not in pricing state' 
      });
    }
    
    // Update items with new pricing
    const updatePromises = items.map(item => 
      prisma.quoteItem.updateMany({
        where: { 
          quoteId: quoteId,
          productId: item.productId 
        },
        data: { 
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * (quote.items.find(qi => qi.productId === item.productId)?.quantity || 1)
        }
      })
    );
    
    await Promise.all(updatePromises);
    
    // Calculate new total
    const updatedItems = await prisma.quoteItem.findMany({
      where: { quoteId: quoteId }
    });
    
    const totalAmount = updatedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Update quote with new total and status
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        sourcingNotes: sourcingNotes || quote.sourcingNotes,
        totalAmount: totalAmount,
        status: 'AWAITING_CLIENT_APPROVAL',
        // Clear the lock now that pricing is submitted
        lockedById: null,
        lockExpiresAt: null,
        lockedAt: null
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    
    console.log('✅ Quote pricing updated:', quoteId);
    
    res.status(200).json({
      success: true,
      message: 'Quote pricing updated',
      data: { quote: updatedQuote }
    });
    
  } catch (error) {
    console.error('Update pricing error:', error);
    
    let statusCode = 500;
    let message = 'Failed to update pricing';
    
    if (error instanceof z.ZodError) {
      statusCode = 400;
      message = 'Validation error';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('active lock') || error.message.includes('expired')) {
      statusCode = 403;
    } else if (error.message.includes('not in pricing state')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ success: false, message });
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

// Get manager quotes - UPDATED
const getManagerQuotes = async (req, res) => {
  try {
    const managerId = extractManagerId(req.user.id || req.user.userId);
    const { status } = req.query;
    
    console.log('🔧 Getting manager quotes for:', {
      extractedManagerId: managerId,
      user: req.user
    });
    
    // Call service with extracted ID
    const quotes = await QuoteService.getManagerQuotes(managerId, status);

    res.json({
      success: true,
      message: 'Manager quotes retrieved',
      data: quotes 
    });
  } catch (error) {
    console.error('Get manager quotes error:', error);
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

// Lock quote for pricing - UPDATED
const lockQuoteForPricing = async (req, res) => {
  try {
    const { quoteId } = lockQuoteSchema.parse(req.body);
    let managerId = req.user.id || req.user.userId;
    
    console.log('🔒 Starting lock process:', {
      quoteId,
      managerId,
      user: req.user
    });
    
    // ✅ Extract the LAST part (32-char string) from composite ID
    let extractedId = extractManagerId(managerId);
    
    console.log('✅ Extracted manager ID:', extractedId);
    
    // Verify quote exists
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Check status
    if (quote.status !== 'PENDING_PRICING') {
      return res.status(400).json({
        success: false,
        message: 'Quote is not ready for pricing'
      });
    }
    
    // Check if already locked
    if (quote.lockedById && quote.lockedById !== extractedId) {
      const isLockExpired = quote.lockExpiresAt && new Date() > new Date(quote.lockExpiresAt);
      
      if (!isLockExpired) {
        return res.status(409).json({
          success: false,
          message: 'Quote is already locked by another manager'
        });
      }
    }
    
    // Set lock expiration
    const lockExpiresAt = new Date();
    lockExpiresAt.setMinutes(lockExpiresAt.getMinutes() + 30);
    
    // ✅ Lock with EXTRACTED 32-CHAR STRING
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'IN_PRICING',
        lockedById: extractedId, // Store the 32-char string
        lockedAt: new Date(),
        lockExpiresAt: lockExpiresAt,
        managerId: extractedId
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });
    
    console.log(`✅ Quote locked with ID:`, {
      quoteId: updatedQuote.id,
      lockedById: updatedQuote.lockedById,
      lockedByIdLength: updatedQuote.lockedById?.length,
      lockExpiresAt: updatedQuote.lockExpiresAt
    });
    
    return res.json({
      success: true,
      message: 'Quote locked successfully',
      data: { quote: updatedQuote }
    });
    
  } catch (error) {
    console.error('❌ Lock quote error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to lock quote'
    });
  }
};

// Manager releases quote lock - UPDATED
const releaseQuoteLock = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = extractManagerId(req.user.id || req.user.userId);

    // Find quote first
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Check if manager has the lock
    if (quote.lockedById !== managerId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have a lock on this quote'
      });
    }
    
    // Release the lock
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        lockedById: null,
        lockExpiresAt: null,
        lockedAt: null,
        status: 'PENDING_PRICING'
      }
    });

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

// Check quote lock status - UPDATED
const checkQuoteLockStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = extractManagerId(req.user.id || req.user.userId);

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    const lockStatus = {
      isLocked: !!quote.lockedById,
      lockedByMe: quote.lockedById === managerId,
      lockExpiresAt: quote.lockExpiresAt,
      isLockExpired: quote.lockExpiresAt && new Date(quote.lockExpiresAt) < new Date(),
      status: quote.status
    };

    res.status(200).json({
      success: true,
      data: lockStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get available quotes - UPDATED
const getAvailableQuotes = async (req, res) => {
  try {
    const managerId = extractManagerId(req.user.id || req.user.userId);
    
    console.log('🔍 Getting available quotes for manager:', managerId);
    
    // Get quotes that are PENDING_PRICING and not locked, or locked but expired
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'PENDING_PRICING',
        OR: [
          { lockedById: null },
          {
            lockedById: { not: null },
            lockExpiresAt: { lt: new Date() }
          }
        ]
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      message: 'Available quotes retrieved',
      data: quotes
    });
  } catch (error) {
    console.error('Get available quotes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get quotes for locking (PENDING_PRICING only) - UPDATED
const getQuotesForLocking = async (req, res) => {
  try {
    const managerId = extractManagerId(req.user.id || req.user.userId);
    
    console.log('🔍 Getting quotes for locking for manager:', managerId);
    
    // Get quotes that are available for locking
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'PENDING_PRICING',
        OR: [
          { lockedById: null },
          {
            lockedById: { not: null },
            lockExpiresAt: { lt: new Date() }
          }
        ]
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      message: 'Quotes available for locking',
      data: quotes
    });
  } catch (error) {
    console.error('Error in getQuotesForLocking:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get quotes locked by current manager (IN_PRICING and locked by me) - UPDATED
const getMyLockedQuotes = async (req, res) => {
  try {
    const managerId = extractManagerId(req.user.id || req.user.userId);
    
    console.log('🔍 Getting locked quotes for manager:', managerId);
    
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'IN_PRICING',
        lockedById: managerId, // Match the 32-char string
        lockExpiresAt: { gt: new Date() } // Only active locks
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { lockedAt: 'desc' }
    });
    
    console.log(`✅ Found ${quotes.length} locked quotes for manager ${managerId}`);
    
    res.json({
      success: true,
      message: 'Quotes locked by you',
      data: quotes
    });
  } catch (error) {
    console.error('Error in getMyLockedQuotes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get quotes awaiting client approval (AWAITING_CLIENT_APPROVAL and assigned to me) - UPDATED
const getQuotesAwaitingApproval = async (req, res) => {
  try {
    const managerId = extractManagerId(req.user.id || req.user.userId);
    
    console.log('🔍 Getting quotes awaiting approval for manager:', managerId);
    
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'AWAITING_CLIENT_APPROVAL',
        managerId: managerId
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                description: true,
                category: true,
                price: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({
      success: true,
      message: 'Quotes awaiting client approval',
      data: quotes
    });
  } catch (error) {
    console.error('Error in getQuotesAwaitingApproval:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Temporary debug endpoint
const debugDatabase = async (req, res) => {
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
        createdAt: true,
        totalAmount: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Get manager names
    const quotesWithDetails = await Promise.all(
      quotes.map(async (quote) => {
        let lockedByName = null;
        if (quote.lockedById) {
          // Try to find user by extracted ID
          const lockedBy = await prisma.user.findFirst({
            where: {
              OR: [
                { id: quote.lockedById },
                { firebaseUid: quote.lockedById }
              ]
            },
            select: { name: true }
          }).catch(() => null);
          lockedByName = lockedBy?.name;
        }
        
        return {
          ...quote,
          lockedByName,
          isLockExpired: quote.lockExpiresAt && new Date() > new Date(quote.lockExpiresAt)
        };
      })
    );
    
    res.json({ 
      success: true, 
      count: quotesWithDetails.length, 
      quotes: quotesWithDetails 
    });
  } catch (error) {
    console.error('Debug database error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete quote by manager - UPDATED
const deleteQuoteByManager = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const managerId = extractManagerId(req.user.id || req.user.userId);
    
    console.log(`🗑️ Delete request:`, {
      quoteId,
      extractedManagerId: managerId,
      user: req.user
    });
    
    if (!quoteId || quoteId === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    // Check if quote exists
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      console.log(`❌ Quote ${quoteId} not found in database`);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    console.log(`📋 Found quote:`, {
      id: quote.id,
      status: quote.status,
      lockedById: quote.lockedById,
      managerId: quote.managerId,
      currentManagerId: managerId
    });
    
    // Check permissions - use extracted ID for comparison
    const canDelete = 
      quote.lockedById === managerId || 
      quote.managerId === managerId ||
      (quote.status === 'PENDING_PRICING' && !quote.lockedById);
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this quote'
      });
    }
    
    // Check if quote can be deleted based on status
    if (quote.status === 'APPROVED' || quote.status === 'CONVERTED_TO_ORDER') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved or converted quotes'
      });
    }
    
    console.log(`🗑️ Deleting related items for quote: ${quoteId}`);
    
    // Delete quote items first
    await prisma.quoteItem.deleteMany({
      where: { quoteId }
    });
    
    console.log(`🗑️ Deleting quote: ${quoteId}`);
    
    // Delete the quote
    await prisma.quote.delete({
      where: { id: quoteId }
    });
    
    console.log(`✅ Quote deleted successfully: ${quoteId}`);
    
    return res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Delete quote error:', error);
    console.error('Error stack:', error.stack);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    if (error.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete quote with existing references'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to delete quote. Please try again.'
    });
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
  getQuotesForLocking,
  getMyLockedQuotes,
  getQuotesAwaitingApproval,
  debugDatabase,
  deleteQuoteByManager,
  extractManagerId // Export if needed elsewhere
};