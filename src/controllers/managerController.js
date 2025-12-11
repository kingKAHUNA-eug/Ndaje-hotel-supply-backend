// controllers/managerController.js
const { prisma } = require('../config/prisma');

// Helper function to safely fetch client data
const getClientData = async (clientId) => {
  try {
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        hotelName: true
      }
    });
    return client || {
      id: clientId,
      name: 'Unknown Client',
      email: null,
      phone: null,
      hotelName: null
    };
  } catch (error) {
    console.error(`Error fetching client ${clientId}:`, error);
    return {
      id: clientId,
      name: 'Unknown Client',
      email: null,
      phone: null,
      hotelName: null
    };
  }
};

// Get all manager quotes (for /api/quotes/manager/quotes)
const getManagerQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    console.log(`📊 [getManagerQuotes] Fetching for manager: ${managerId}`);
    
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { managerId },
          { lockedById: managerId },
          { status: 'PENDING_PRICING' },
          { status: 'IN_PRICING' },
          { 
            status: 'AWAITING_CLIENT_APPROVAL',
            managerId: managerId
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

    // Fetch client data for each quote
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return {
          ...quote,
          client
        };
      })
    );

    console.log(`✅ [getManagerQuotes] Returning ${quotesWithClients.length} quotes`);

    res.json({ 
      success: true, 
      data: quotesWithClients 
    });
  } catch (err) {
    console.error('❌ Get manager quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch quotes' 
    });
  }
};

// Get available quotes for locking (for /api/quotes/manager/available)
const getAvailableQuotes = async (req, res) => {
  try {
    console.log('🔓 [getAvailableQuotes] Fetching available quotes');
    
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

    // Fetch client data
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return {
          ...quote,
          client
        };
      })
    );

    console.log(`✅ Found ${quotesWithClients.length} available quotes`);

    res.json({ 
      success: true, 
      data: quotesWithClients 
    });
  } catch (err) {
    console.error('❌ Get available quotes error:', err);
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
    
    console.log(`🔒 [getLockedQuotes] Fetching for manager: ${managerId}`);
    
    const quotes = await prisma.quote.findMany({
      where: {
        lockedById: managerId,
        status: 'IN_PRICING',
        lockExpiresAt: { gt: new Date() }
      },
      include: {
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

    // Fetch client data
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return {
          ...quote,
          client
        };
      })
    );

    console.log(`✅ Found ${quotesWithClients.length} locked quotes`);

    res.json({ 
      success: true, 
      data: quotesWithClients 
    });
  } catch (err) {
    console.error('❌ Get locked quotes error:', err);
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
    
    console.log(`⏳ [getAwaitingApprovalQuotes] Fetching for manager: ${managerId}`);
    
    const quotes = await prisma.quote.findMany({
      where: {
        managerId: managerId,
        status: 'AWAITING_CLIENT_APPROVAL'
      },
      include: {
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

    // Fetch client data
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return {
          ...quote,
          client
        };
      })
    );

    console.log(`✅ Found ${quotesWithClients.length} quotes awaiting approval`);

    res.json({ 
      success: true, 
      data: quotesWithClients 
    });
  } catch (err) {
    console.error('❌ Get awaiting approval quotes error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch quotes awaiting approval' 
    });
  }
};

// Lock a quote (for /api/quotes/manager/lock) - FIXED VERSION
const lockQuote = async (req, res) => {
  try {
    const { quoteId } = req.body;
    const managerId = req.user.id;
    
    console.log(`🔒 Lock request: quoteId=${quoteId}, managerId=${managerId}`);
    
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

    // Fetch client data
    const client = await getClientData(updatedQuote.clientId);
    
    console.log(`✅ Quote locked successfully: ${quoteId}`);
    
    res.json({
      success: true,
      message: 'Quote locked successfully',
      data: {
        ...updatedQuote,
        client
      }
    });
  } catch (err) {
    console.error('❌ Lock quote error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to lock quote'
    });
  }
};

// Update pricing for a quote (for /api/quotes/manager/:id/update-pricing)
const updatePricing = async (req, res) => {
  const { id } = req.params;
  const { items, sourcingNotes } = req.body;
  
  try {
    const managerId = req.user.id;
    
    console.log(`💰 [updatePricing] Updating quote: ${id}`);
    
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
        data: { 
          unitPrice: Number(unitPrice),
          subtotal: Number(unitPrice) * quoteItem.quantity
        }
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

    // Fetch client data
    const client = await getClientData(updatedQuote.clientId);
    
    console.log(`✅ Pricing updated successfully: ${id}`);
    
    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: {
        ...updatedQuote,
        client
      }
    });
  } catch (err) {
    console.error('❌ Update pricing error:', err);
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
    
    console.log(`🗑️ Delete request: quoteId=${id}, managerId=${managerId}`);
    
    const quote = await prisma.quote.findUnique({
      where: { id }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Allow deletion if:
    // 1. Manager has locked the quote, OR
    // 2. Quote is available (PENDING_PRICING with no lock or expired lock), OR
    // 3. Manager assigned to the quote
    const isLockExpired = quote.lockExpiresAt && quote.lockExpiresAt < new Date();
    const canDelete = 
      (quote.lockedById === managerId && quote.status === 'IN_PRICING') ||
      (quote.status === 'PENDING_PRICING' && (!quote.lockedById || isLockExpired)) ||
      (quote.managerId === managerId);
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete quotes that you have locked or that are available'
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
    
    console.log(`✅ Quote deleted: ${id}`);
    
    res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (err) {
    console.error('❌ Delete quote error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete quote'
    });
  }
};

// ======================== LEGACY ENDPOINTS (KEEP FOR COMPATIBILITY) ========================

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

    // Fetch client data
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return {
          ...quote,
          client
        };
      })
    );

    res.json({ 
      success: true, 
      data: quotesWithClients 
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
        data: { 
          unitPrice: finalPrice,
          subtotal: finalPrice * item.quantity
        }
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

    // Fetch client data
    const client = await getClientData(updatedQuote.clientId);

    res.json({ 
      success: true, 
      data: {
        ...updatedQuote,
        client
      }
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

    // Fetch client data
    const ordersWithClients = await Promise.all(
      orders.map(async (order) => {
        const client = await getClientData(order.clientId);
        return {
          ...order,
          client
        };
      })
    );

    res.json({ 
      success: true, 
      data: ordersWithClients 
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
  // Legacy endpoints
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
};