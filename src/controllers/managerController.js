// controllers/managerController.js - 100% WORKING VERSION
const prisma = require('../config/prisma');

// Helper function to safely fetch client data
const getClientData = async (clientId) => {
  try {
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true
      }
    });
    return client || {
      id: clientId,
      name: 'Unknown Client',
      email: null,
      phone: null
    };
  } catch (error) {
    console.error(`Error fetching client ${clientId}:`, error);
    return {
      id: clientId,
      name: 'Unknown Client',
      email: null,
      phone: null
    };
  }
};

// ==================== LOCK QUOTE ====================
const lockQuote = async (req, res) => {
  try {
    const { quoteId } = req.body;
    const managerId = req.user?.id;
    
    console.log(`🔒 Lock request: quoteId=${quoteId}, managerId=${managerId}`);
    
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    if (!managerId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Manager ID not found'
      });
    }
    
    // Find the quote DIRECTLY - no .quote access
    const existingQuote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!existingQuote) {
      console.log(`❌ Quote ${quoteId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    console.log(`📋 Found quote: ${existingQuote.id}`);
    
    // Check if already locked by another manager
    if (existingQuote.lockedById && existingQuote.lockedById !== managerId) {
      const lockExpired = existingQuote.lockExpiresAt && 
                         new Date(existingQuote.lockExpiresAt) < new Date();
      
      if (!lockExpired) {
        console.log(`🔐 Quote already locked by another manager`);
        return res.status(409).json({
          success: false,
          message: 'Quote is already locked by another manager'
        });
      }
    }
    
    // Set lock expiration (30 minutes)
    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    // Update the quote DIRECTLY - no .quote access
    const updatedQuote = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        lockedById: managerId,
        lockExpiresAt: lockExpiresAt,
        status: 'IN_PRICING',
        managerId: managerId,
        lockedAt: new Date()
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                price: true,
                sku: true
              }
            }
          }
        }
      }
    });
    
    // Get client data
    const client = await getClientData(updatedQuote.clientId);
    
    console.log(`✅ Quote locked successfully: ${quoteId}`);
    
    // Return DIRECTLY - no .quote wrapping
    return res.json({
      success: true,
      message: 'Quote locked successfully',
      data: {
        ...updatedQuote,
        client
      }
    });
    
  } catch (err) {
    console.error('❌ Lock quote error:', err.message);
    
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to lock quote'
    });
  }
};

// ==================== DELETE QUOTE ====================
const deleteQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user?.id;
    
    console.log(`🗑️ Delete request: quoteId=${id}, managerId=${managerId}`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    if (!managerId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    // Find the quote DIRECTLY - no .quote access
    const foundQuote = await prisma.quote.findUnique({
      where: { id }
    });
    
    if (!foundQuote) {
      console.log(`❌ Quote ${id} not found`);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    console.log(`📋 Found quote: ${foundQuote.id}, status: ${foundQuote.status}`);
    
    // Check if lock expired
    const isLockExpired = foundQuote.lockExpiresAt && 
                         new Date(foundQuote.lockExpiresAt) < new Date();
    
    // Check permissions
    const canDelete = 
      (foundQuote.lockedById === managerId && foundQuote.status === 'IN_PRICING') ||
      (foundQuote.status === 'PENDING_PRICING' && (!foundQuote.lockedById || isLockExpired)) ||
      (foundQuote.managerId === managerId);
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this quote'
      });
    }
    
    // Check status
    if (foundQuote.status === 'APPROVED' || foundQuote.status === 'CONVERTED_TO_ORDER') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved or converted quotes'
      });
    }
    
    console.log(`🗑️ Deleting items...`);
    
    // Delete quote items first
    await prisma.quoteItem.deleteMany({
      where: { quoteId: id }
    });
    
    console.log(`🗑️ Deleting quote...`);
    
    // Delete the quote DIRECTLY - no .quote access
    await prisma.quote.delete({
      where: { id }
    });
    
    console.log(`✅ Quote deleted successfully`);
    
    return res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
    
  } catch (err) {
    console.error('❌ Delete quote error:', err.message);
    
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete quote'
    });
  }
};

// ==================== GET AVAILABLE QUOTES ====================
const getAvailableQuotes = async (req, res) => {
  try {
    console.log('🔓 [getAvailableQuotes] Fetching');
    
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
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return { ...quote, client };
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

// ==================== GET LOCKED QUOTES ====================
const getLockedQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    console.log(`🔒 [getLockedQuotes] for manager: ${managerId}`);
    
    const quotes = await prisma.quote.findMany({
      where: {
        lockedById: managerId,
        status: 'IN_PRICING',
        lockExpiresAt: { gt: new Date() }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return { ...quote, client };
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

// ==================== GET AWAITING APPROVAL ====================
const getAwaitingApprovalQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    console.log(`⏳ [getAwaitingApprovalQuotes] for manager: ${managerId}`);
    
    const quotes = await prisma.quote.findMany({
      where: {
        managerId: managerId,
        status: 'AWAITING_CLIENT_APPROVAL'
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return { ...quote, client };
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
      message: 'Failed to fetch quotes' 
    });
  }
};

// ==================== GET MANAGER QUOTES ====================
const getManagerQuotes = async (req, res) => {
  try {
    const managerId = req.user.id;

    console.log(`📊 [getManagerQuotes] for manager: ${managerId}`);

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
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return { ...quote, client };
      })
    );

    console.log(`✅ Returning ${quotesWithClients.length} quotes`);

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

// ==================== UPDATE PRICING ====================
const updatePricing = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, sourcingNotes } = req.body;
    const managerId = req.user?.id;

    console.log(`💰 Update pricing: quoteId=${id}`);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required'
      });
    }

    const quote = await prisma.quote.findUnique({
      where: { id }
    });

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    if (quote.lockedById !== managerId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have a lock on this quote'
      });
    }

    if (quote.lockExpiresAt && new Date() > quote.lockExpiresAt) {
      return res.status(403).json({
        success: false,
        message: 'Your lock has expired'
      });
    }

    let totalAmount = 0;

    await prisma.quoteItem.deleteMany({
      where: { quoteId: id }
    });

    const quoteItemsData = items.map(item => {
      const subtotal = item.quantity * item.unitPrice;
      totalAmount += subtotal;
      
      return {
        quoteId: id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal
      };
    });

    await prisma.quoteItem.createMany({
      data: quoteItemsData
    });

    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        totalAmount,
        status: 'AWAITING_CLIENT_APPROVAL',
        sourcingNotes: sourcingNotes || null,
        lockedById: null,
        lockedAt: null,
        lockExpiresAt: null
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    const client = await getClientData(updatedQuote.clientId);

    console.log(`✅ Pricing updated`);

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      data: { ...updatedQuote, client }
    });

  } catch (err) {
    console.error('❌ Update pricing error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to update pricing'
    });
  }
};

// ==================== LEGACY ENDPOINTS ====================
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
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        const client = await getClientData(quote.clientId);
        return { ...quote, client };
      })
    );

    res.json({ success: true, data: quotesWithClients });
  } catch (err) {
    console.error('Get pending quotes error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch pending quotes' });
  }
};

const priceAndApproveQuote = async (req, res) => {
  const { id } = req.params;
  const { prices, sourcingNotes } = req.body;

  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ success: false, message: 'Prices array required' });
  }

  try {
    const managerId = req.user.id;
    
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    if (quote.status !== 'PENDING_PRICING' && quote.status !== 'IN_PRICING') {
      return res.status(400).json({ success: false, message: 'Quote cannot be priced in current status' });
    }

    let totalAmount = 0;

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
            product: true
          }
        }
      }
    });

    const client = await getClientData(updatedQuote.clientId);

    res.json({ success: true, data: { ...updatedQuote, client } });
  } catch (err) {
    console.error('Price and approve quote error:', err);
    res.status(400).json({ success: false, message: err.message });
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
            product: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const ordersWithClients = await Promise.all(
      orders.map(async (order) => {
        const client = await getClientData(order.clientId);
        return { ...order, client };
      })
    );

    res.json({ success: true, data: ordersWithClients });
  } catch (err) {
    console.error('Get my priced orders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your orders' });
  }
};

const getManagerNotifications = async (req, res) => {
  try {
    const managerId = req.user.id;
    
    console.log(`🔔 [getManagerNotifications] for manager: ${managerId}`);
    
    const newQuotes = await prisma.quote.findMany({
      where: {
        status: 'PENDING_PRICING',
        OR: [
          { lockedById: null },
          { lockExpiresAt: { lt: new Date() } }
        ]
      },
      select: {
        id: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    const awaitingApproval = await prisma.quote.findMany({
      where: {
        managerId: managerId,
        status: 'AWAITING_CLIENT_APPROVAL'
      },
      select: {
        id: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    const expiredLocks = await prisma.quote.findMany({
      where: {
        lockedById: managerId,
        status: 'IN_PRICING',
        lockExpiresAt: { lt: new Date() }
      },
      select: {
        id: true,
        lockExpiresAt: true
      }
    });
    
    const notifications = {
      newQuotesCount: newQuotes.length,
      newQuotes: newQuotes.map(q => ({
        id: q.id,
        type: 'NEW_QUOTE',
        message: 'New quote available for pricing',
        createdAt: q.createdAt
      })),
      awaitingApprovalCount: awaitingApproval.length,
      awaitingApproval: awaitingApproval.map(q => ({
        id: q.id,
        type: 'AWAITING_APPROVAL',
        message: 'Quote awaiting client approval',
        createdAt: q.updatedAt
      })),
      expiredLocksCount: expiredLocks.length,
      expiredLocks: expiredLocks.map(q => ({
        id: q.id,
        type: 'EXPIRED_LOCK',
        message: 'Your lock on a quote has expired',
        createdAt: q.lockExpiresAt
      }))
    };
    
    console.log(`✅ [getManagerNotifications] Returning notifications`);
    
    res.json({
      success: true,
      data: notifications
    });
    
  } catch (err) {
    console.error('❌ Get manager notifications error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

module.exports = {
  getManagerQuotes,
  getAvailableQuotes,
  getLockedQuotes,
  getAwaitingApprovalQuotes,
  lockQuote,
  updatePricing,
  deleteQuote,
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders,
  getManagerNotifications
};