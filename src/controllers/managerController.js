// controllers/managerController.js - COMPLETE FIXED VERSION
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

// Get all manager quotes
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


// Get locked quotes by current manager
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

// Get quotes awaiting client approval
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

// Lock quote - COMPLETE FIX
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
    
    const existingQuote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!existingQuote) {
      console.log(`❌ Quote ${quoteId} not found in database`);
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    console.log(`📋 Found quote:`, {
      id: existingQuote.id,
      status: existingQuote.status,
      lockedById: existingQuote.lockedById,
      lockExpiresAt: existingQuote.lockExpiresAt
    });
    
    if (existingQuote.lockedById && existingQuote.lockedById !== managerId) {
      const lockExpired = existingQuote.lockExpiresAt && existingQuote.lockExpiresAt < new Date();
      
      if (!lockExpired) {
        console.log(`🔐 Quote ${quoteId} is already locked by another manager`);
        return res.status(409).json({
          success: false,
          message: 'Quote is already locked by another manager'
        });
      }
      console.log(`🔄 Quote ${quoteId} lock has expired, can be re-locked`);
    }
    
    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    console.log(`⏰ Setting lock until: ${lockExpiresAt}`);
    
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
    
    if (!updatedQuote) {
      console.log(`❌ Failed to update quote lock status for ${quoteId}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to update quote lock status'
      });
    }
    
    let client = null;
    if (updatedQuote.clientId) {
      client = await getClientData(updatedQuote.clientId);
    } else {
      client = {
        id: 'unknown',
        name: 'Unknown Client',
        email: null,
        phone: null,
        hotelName: null
      };
    }
    
    console.log(`✅ Quote locked successfully: ${quoteId}`);
    
    return res.json({
      success: true,
      message: 'Quote locked successfully',
      data: {
        ...updatedQuote,
        client
      }
    });
    
  } catch (err) {
    console.error('❌ Lock quote error:', err);
    console.error('Error stack:', err.stack);
    
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to lock quote'
    });
  }
};

// Update pricing
const updatePricing = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, sourcingNotes } = req.body;
    const managerId = req.user?.id;

    console.log(`💰 Update pricing request: quoteId=${id}, managerId=${managerId}`);

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
        message: 'Your lock on this quote has expired'
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

    console.log(`✅ Pricing updated for quote: ${id}`);

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

// Delete quote - COMPLETE FIX
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
        message: 'Unauthorized: Manager ID not found'
      });
    }
    
    const quote = await prisma.quote.findUnique({
      where: { id }
    });
    
    if (!quote) {
      console.log(`❌ Quote ${id} not found in database`);
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
      lockExpiresAt: quote.lockExpiresAt
    });
    
    const isLockExpired = quote.lockExpiresAt && new Date(quote.lockExpiresAt) < new Date();
    console.log(`⏰ Lock expired check: ${isLockExpired}`);
    
    const canDelete = 
      (quote.lockedById === managerId && quote.status === 'IN_PRICING') ||
      (quote.status === 'PENDING_PRICING' && (!quote.lockedById || isLockExpired)) ||
      (quote.managerId === managerId);
    
    console.log(`🔐 Permission check for delete:`, {
      canDelete,
      conditions: {
        isLockedByManager: quote.lockedById === managerId && quote.status === 'IN_PRICING',
        isAvailable: quote.status === 'PENDING_PRICING' && (!quote.lockedById || isLockExpired),
        isAssignedToManager: quote.managerId === managerId
      }
    });
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete quotes that you have locked, that are available, or that are assigned to you'
      });
    }
    
    console.log(`🗑️ Deleting related items for quote: ${id}`);
    
    const deleteItemsResult = await prisma.quoteItem.deleteMany({
      where: { quoteId: id }
    });
    console.log(`✅ Deleted ${deleteItemsResult.count} quote items`);
    
    console.log(`🗑️ Deleting quote: ${id}`);
    await prisma.quote.delete({
      where: { id }
    });
    
    console.log(`✅ Quote deleted successfully: ${id}`);
    
    return res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
    
  } catch (err) {
    console.error('❌ Delete quote error:', err);
    console.error('Error stack:', err.stack);
    
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Quote not found or already deleted'
      });
    }
    
    if (err.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete quote due to existing references'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete quote. Please try again.'
    });
  }
};

// Legacy endpoints
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
  getMyPricedOrders
};