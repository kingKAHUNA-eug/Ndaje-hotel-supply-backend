// controllers/managerController.js
const { prisma } = require('../config/prisma');

// ======================== NEW ENDPOINTS FOR FRONTEND ========================

// Get all manager quotes (for /api/quotes/manager/quotes)
const getManagerQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { managerId },
          { lockedById: managerId },
          { status: 'PENDING_PRICING' }
        ]
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: quotes 
    });
  } catch (err) {
    console.error('Get manager quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch quotes' 
    });
  }
};

// Get available quotes for locking (for /api/quotes/manager/available)
const getAvailableQuotes = async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'PENDING_PRICING',
        OR: [
          { lockedById: null },
          { 
            AND: [
              { lockedById: { not: null } },
              { lockExpiresAt: { lt: new Date() } }
            ]
          }
        ]
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: quotes 
    });
  } catch (err) {
    console.error('Get available quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch available quotes' 
    });
  }
};

// Get locked quotes by current manager (for /api/quotes/manager/locked)
const getLockedQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    const quotes = await prisma.quote.findMany({
      where: {
        lockedById: managerId,
        status: 'IN_PRICING',
        lockExpiresAt: { gt: new Date() }
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: quotes 
    });
  } catch (err) {
    console.error('Get locked quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch locked quotes' 
    });
  }
};

// Get quotes awaiting client approval (for /api/quotes/manager/awaiting-approval)
const getAwaitingApprovalQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    const quotes = await prisma.quote.findMany({
      where: {
        managerId: managerId,
        status: 'AWAITING_CLIENT_APPROVAL'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: quotes 
    });
  } catch (err) {
    console.error('Get awaiting approval quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch quotes awaiting approval' 
    });
  }
};

// Lock a quote (for /api/quotes/lock)
const lockQuote = async (req, res) => {
  try {
    const { quoteId } = req.body;
    const managerId = req.user.id;
    
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    // Check if quote exists and is available for locking
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Check if quote is already locked by someone else
    if (quote.lockedById && quote.lockedById !== managerId) {
      // Check if lock is expired
      if (quote.lockExpiresAt && quote.lockExpiresAt > new Date()) {
        return res.status(409).json({
          success: false,
          message: 'Quote is already locked by another manager'
        });
      }
    }
    
    // Set lock for 30 minutes
    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        lockedById: managerId,
        lockExpiresAt: lockExpiresAt,
        status: 'IN_PRICING'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Quote locked successfully',
      data: updatedQuote
    });
  } catch (err) {
    console.error('Lock quote error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to lock quote'
    });
  }
};

// Update pricing for a quote (for /api/quotes/:id/update-pricing)
const updatePricing = async (req, res) => {
  const { id } = req.params;
  const { items, sourcingNotes } = req.body;
  
  try {
    const managerId = req.user.id;
    
    // Find the quote
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { items: true }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Check if manager has locked this quote
    if (quote.lockedById !== managerId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to price this quote'
      });
    }
    
    // Check if lock is expired
    if (quote.lockExpiresAt && quote.lockExpiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Your lock on this quote has expired'
      });
    }
    
    // Calculate total amount
    let totalAmount = 0;
    
    // Update each item with final price
    for (const item of items) {
      const { productId, quantity, unitPrice } = item;
      
      // Find the quote item
      const quoteItem = quote.items.find(qi => qi.productId === productId);
      if (!quoteItem) {
        return res.status(400).json({
          success: false,
          message: `Item with productId ${productId} not found in quote`
        });
      }
      
      // Update the quote item
      await prisma.quoteItem.update({
        where: { id: quoteItem.id },
        data: { unitPrice: Number(unitPrice) }
      });
      
      totalAmount += Number(unitPrice) * quoteItem.quantity;
    }
    
    // Update the quote
    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        totalAmount: totalAmount,
        managerId: managerId,
        sourcingNotes: sourcingNotes || '',
        status: 'AWAITING_CLIENT_APPROVAL',
        // Clear lock since pricing is complete
        lockedById: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: updatedQuote
    });
  } catch (err) {
    console.error('Update pricing error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to update pricing'
    });
  }
};

// Delete a quote (for managers)
const deleteQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user.id;
    
    const quote = await prisma.quote.findUnique({
      where: { id }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Only allow deleting if manager has locked this quote
    if (quote.lockedById !== managerId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete quotes that you have locked'
      });
    }
    
    // First delete quote items
    await prisma.quoteItem.deleteMany({
      where: { quoteId: id }
    });
    
    // Then delete the quote
    await prisma.quote.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (err) {
    console.error('Delete quote error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete quote'
    });
  }
};

// ======================== EXISTING FUNCTIONS (KEEP) ========================

const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { 
        status: 'PENDING_PRICING',
        OR: [
          { lockedById: null },
          { lockExpiresAt: { lt: new Date() } }
        ]
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: quotes 
    });
  } catch (err) {
    console.error('Get pending quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending quotes' 
    });
  }
};

const priceAndApproveQuote = async (req, res) => {
  const { id } = req.params;
  const { prices, sourcingNotes } = req.body;

  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Prices array required' 
    });
  }

  try {
    const managerId = req.user.id;
    
    // Fetch the quote with items
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!quote) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quote not found' 
      });
    }

    if (quote.status !== 'PENDING_PRICING' && quote.status !== 'IN_PRICING') {
      return res.status(400).json({ 
        success: false, 
        message: 'Quote cannot be priced in current status' 
      });
    }

    let totalAmount = 0;

    // Update each quote item with final price
    for (const item of quote.items) {
      const priced = prices.find(p => p.productId === item.productId);
      if (!priced) {
        throw new Error(`Price missing for product ${item.productId}`);
      }

      const finalPrice = Number(priced.finalPrice);
      totalAmount += finalPrice * item.quantity;

      await prisma.quoteItem.update({
        where: { id: item.id },
        data: { unitPrice: finalPrice }
      });
    }

    // Update the quote
    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        totalAmount: totalAmount,
        managerId: managerId,
        sourcingNotes: sourcingNotes || '',
        status: 'AWAITING_CLIENT_APPROVAL',
        lockedById: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      }
    });

    res.json({ 
      success: true, 
      data: updatedQuote 
    });
  } catch (err) {
    console.error('Price and approve quote error:', err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

const getMyPricedOrders = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    const orders = await prisma.quote.findMany({
      where: {
        managerId: managerId,
        OR: [
          { status: 'AWAITING_CLIENT_APPROVAL' },
          { status: 'APPROVED' },
          { status: 'REJECTED' }
        ]
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                referencePrice: true,
                price: true,
                sku: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ 
      success: true, 
      data: orders 
    });
  } catch (err) {
    console.error('Get my priced orders error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch your orders' 
    });
  }
};

module.exports = {
  // New endpoints for frontend
  getManagerQuotes,
  getAvailableQuotes,
  getLockedQuotes,
  getAwaitingApprovalQuotes,
  lockQuote,
  updatePricing,
  deleteQuote,
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
};