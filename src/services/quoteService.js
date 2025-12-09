const prisma = require('../config/prisma');
const LOCK_DURATION_MINUTES = 30;

class QuoteService {
  /**
   * Create an empty quote (Client only)
   */
  static async createEmptyQuote(clientId, notes = null) {
    try {
      const quote = await prisma.quote.create({
        data: {
          clientId,
          status: 'PENDING_ITEMS',
          totalAmount: 0,
          sourcingNotes: notes
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
                  category: true
                }
              }
            }
          }
        }
      });

      return quote;
    } catch (error) {
      console.error('QuoteService.createEmptyQuote error:', error);
      throw error;
    }
  }

  /**
   * Add items to quote (Client only)
   */
  static async addItemsToQuote(quoteId, clientId, items) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId
        }
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      if (quote.status !== 'PENDING_ITEMS') {
        const statusMessages = {
          'PENDING_PRICING': 'Quote is already submitted and awaiting manager pricing. You cannot add more items at this stage.',
          'AWAITING_CLIENT_APPROVAL': 'Quote is awaiting your approval. You cannot modify items at this stage.',
          'APPROVED': 'Quote has been approved. You cannot modify items at this stage.',
          'REJECTED': 'Quote has been rejected. You cannot modify items at this stage.',
          'CONVERTED_TO_ORDER': 'Quote has been converted to an order. You cannot modify items at this stage.'
        };
        
        throw new Error(statusMessages[quote.status] || 'Quote cannot be modified in its current status');
      }

      // Get products to verify they exist
      const productIds = items.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          active: true
        }
      });

      if (products.length !== productIds.length) {
        throw new Error('One or more products not found or inactive');
      }

      // Delete existing items
      await prisma.quoteItem.deleteMany({
        where: { quoteId }
      });

      // Create new items (no pricing yet)
      const quoteItemsData = items.map(item => ({
        quoteId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: 0,
        subtotal: 0
      }));

      await prisma.quoteItem.createMany({
        data: quoteItemsData
      });

      // Fetch updated quote
      const updatedQuote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  description: true,
                  category: true
                }
              }
            }
          }
        }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.addItemsToQuote error:', error);
      throw error;
    }
  }

  /**
   * Client submits quote to manager
   */
  static async submitQuoteToManager(quoteId, clientId) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId
        },
        include: {
          items: true
        }
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      if (quote.status !== 'PENDING_ITEMS') {
        throw new Error('Quote is not in the correct state for submission');
      }

      if (!quote.items || quote.items.length === 0) {
        throw new Error('Quote must have at least one item before submission');
      }

      // Update quote status to PENDING_PRICING
      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'PENDING_PRICING'
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
                  category: true
                }
              }
            }
          }
        }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.submitQuoteToManager error:', error);
      throw error;
    }
  }

  /**
   * Manager locks quote for pricing
   */
  static async lockQuoteForPricing(quoteId, managerId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      if (quote.status !== 'PENDING_PRICING' && quote.status !== 'IN_PRICING') {
        throw new Error('Quote is not ready for pricing');
      }

      // Check if quote is already locked by another manager
      if (quote.lockedById && quote.lockedById !== managerId) {
        // Check if lock has expired
        if (quote.lockExpiresAt && new Date() < quote.lockExpiresAt) {
          const lockedManager = await prisma.user.findUnique({
            where: { id: quote.lockedById },
            select: { name: true }
          });
          throw new Error(`Quote is being handled by ${lockedManager?.name || 'another manager'}. Please try another quote.`);
        }
      }

      const lockExpiresAt = new Date();
      lockExpiresAt.setMinutes(lockExpiresAt.getMinutes() + LOCK_DURATION_MINUTES);

      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'IN_PRICING',
          lockedById: managerId,
          lockedAt: new Date(),
          lockExpiresAt,
          managerId
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
                  category: true
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

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.lockQuoteForPricing error:', error);
      throw error;
    }
  }

  /**
   * Manager releases quote lock
   */
  static async releaseQuoteLock(quoteId, managerId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      if (quote.lockedById !== managerId) {
        throw new Error('You do not have a lock on this quote');
      }

      return await prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'PENDING_PRICING',
          lockedById: null,
          lockedAt: null,
          lockExpiresAt: null,
          managerId: null
        }
      });
    } catch (error) {
      console.error('QuoteService.releaseQuoteLock error:', error);
      throw error;
    }
  }

  /**
   * Check quote lock status
   */
  static async checkQuoteLockStatus(quoteId, managerId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          lockedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      const isLocked = quote.lockedById && quote.lockedById !== managerId;
      const isLockedByMe = quote.lockedById === managerId;
      const isExpired = quote.lockExpiresAt && new Date() > quote.lockExpiresAt;
      const canTakeOver = isLocked && isExpired;

      return {
        isLocked,
        isLockedByMe,
        isExpired,
        canTakeOver,
        lockedById: quote.lockedById,
        lockedAt: quote.lockedAt,
        lockExpiresAt: quote.lockExpiresAt,
        lockedBy: quote.lockedBy,
        status: quote.status
      };
    } catch (error) {
      console.error('QuoteService.checkQuoteLockStatus error:', error);
      throw error;
    }
  }

  /**
   * Manager updates pricing
   */
  static async updateQuotePricing(quoteId, managerId, items, sourcingNotes = null) {
    try {
      // First check lock status
      const lockStatus = await this.checkQuoteLockStatus(quoteId, managerId);
      
      if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
        if (!lockStatus.canTakeOver) {
          throw new Error('You do not have an active lock on this quote. Please lock it first.');
        }
        // If lock expired, manager can take over
        await this.lockQuoteForPricing(quoteId, managerId);
      } else if (!lockStatus.isLockedByMe) {
        // Quote is not locked by this manager at all
        throw new Error('You do not have a lock on this quote. Please lock it first.');
      }

      // Verify quote exists and is in correct status
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          status: 'IN_PRICING'
        },
        include: { items: true }
      });

      if (!quote) {
        throw new Error('Quote not found or not in pricing state');
      }

      // Verify all products exist
      const productIds = items.map(item => item.productId);
      const existingProducts = await prisma.product.findMany({
        where: { id: { in: productIds } }
      });
      
      if (existingProducts.length !== productIds.length) {
        throw new Error('One or more products not found');
      }

      // Calculate total amount
      let totalAmount = 0;
      
      // Delete existing items
      await prisma.quoteItem.deleteMany({
        where: { quoteId }
      });

      // Create new items with pricing
      const quoteItemsData = items.map(item => {
        const subtotal = item.quantity * item.unitPrice;
        totalAmount += subtotal;
        
        return {
          quoteId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal
        };
      });

      await prisma.quoteItem.createMany({
        data: quoteItemsData
      });

      // Update quote with pricing and release lock
      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: {
          totalAmount,
          status: 'AWAITING_CLIENT_APPROVAL',
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          sourcingNotes: sourcingNotes || null,
          lockedById: null,
          lockedAt: null,
          lockExpiresAt: null
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
                  category: true
                }
              }
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.updateQuotePricing error:', error);
      throw error;
    }
  }

  /**
   * Client approves quote
   */
  static async approveQuote(quoteId, clientId) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId
        }
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      if (quote.status !== 'AWAITING_CLIENT_APPROVAL') {
        throw new Error('Quote cannot be approved in current state');
      }

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      return await prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'APPROVED',
          validUntil
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
                  category: true
                }
              }
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
    } catch (error) {
      console.error('QuoteService.approveQuote error:', error);
      throw error;
    }
  }

  /**
   * Client rejects quote
   */
  static async rejectQuote(quoteId, clientId, reason = null) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId
        }
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      if (quote.status !== 'AWAITING_CLIENT_APPROVAL') {
        throw new Error('Quote cannot be rejected in current state');
      }

      return await prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'REJECTED',
          sourcingNotes: reason ? `${quote.sourcingNotes || ''}\nRejected: ${reason}`.trim() : quote.sourcingNotes
        }
      });
    } catch (error) {
      console.error('QuoteService.rejectQuote error:', error);
      throw error;
    }
  }

  /**
   * Convert quote to order
   */
  static async convertToOrder(quoteId, clientId, addressId, paymentMethod = 'MTN_MOMO') {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId,
          status: 'APPROVED'
        },
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      });

      if (!quote) {
        throw new Error('Quote not found or not approved');
      }

      // Verify address
      const address = await prisma.address.findFirst({
        where: {
          id: addressId,
          userId: clientId
        }
      });

      if (!address) {
        throw new Error('Address not found');
      }

      // Create order from quote
      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            clientId,
            addressId,
            total: quote.totalAmount,
            status: 'AWAITING_PAYMENT',
            notes: quote.sourcingNotes,
            quoteId
          }
        });

        // Create order items
        await Promise.all(
          quote.items.map(item =>
            tx.orderItem.create({
              data: {
                orderId: newOrder.id,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal
              }
            })
          )
        );

        // Update quote status
        await tx.quote.update({
          where: { id: quoteId },
          data: { 
            status: 'CONVERTED_TO_ORDER'
          }
        });

        return newOrder;
      });

      return order;
    } catch (error) {
      console.error('QuoteService.convertToOrder error:', error);
      throw error;
    }
  }

  /**
   * Get quote by ID
   */
  static async getQuoteById(quoteId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  description: true,
                  category: true
                }
              }
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          client: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return quote;
    } catch (error) {
      console.error('QuoteService.getQuoteById error:', error);
      throw error;
    }
  }

  /**
   * Get available quotes for manager
   */
 static async getAvailableQuotes(managerId) {
  try {
    console.log(`🔓 [getAvailableQuotes] Fetching ALL pending quotes for manager: ${managerId}`);
    
    // Get ALL pending pricing quotes (not filtered by manager)
    const quotes = await prisma.quote.findMany({
      where: {
        status: 'PENDING_PRICING'
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
                category: true
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

    console.log(`🔓 [getAvailableQuotes] Found ${quotes.length} PENDING_PRICING quotes total`);
    
    return quotes;
  } catch (error) {
    console.error('QuoteService.getAvailableQuotes error:', error);
    throw error;
  }
}
static async getManagerQuotes(managerId, status = null) {
  try {
    console.log(`📊 [getManagerQuotes] Fetching for manager: ${managerId}, status: ${status || 'all'}`);
    
    let whereClause = {};
    
    if (status === 'locked') {
      // Only quotes locked by this manager
      whereClause = {
        status: 'IN_PRICING',
        lockedById: managerId
      };
    } else {
      // All quotes this manager should see
      whereClause = {
        OR: [
          { status: 'PENDING_PRICING' },
          { 
            status: 'IN_PRICING',
            lockedById: managerId
          },
          {
            status: 'AWAITING_CLIENT_APPROVAL',
            managerId: managerId
          }
        ]
      };
    }

    const quotes = await prisma.quote.findMany({
      where: whereClause,
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
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 [getManagerQuotes] Found ${quotes.length} quotes for manager ${managerId}`);
    
    // Get client info
    const quotesWithClients = await Promise.all(
      quotes.map(async (quote) => {
        try {
          let client = null;
          if (quote.clientId) {
            client = await prisma.user.findUnique({
              where: { id: quote.clientId },
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            }).catch(() => null);
          }
          
          return {
            ...quote,
            client: client || {
              id: 'unknown',
              name: 'Unknown Client',
              email: null,
              phone: null
            }
          };
        } catch (error) {
          console.error(`Error fetching client for quote ${quote.id}:`, error);
          return {
            ...quote,
            client: {
              id: 'unknown',
              name: 'Unknown Client',
              email: null,
              phone: null
            }
          };
        }
      })
    );

    console.log(`✅ [getManagerQuotes] Returning ${quotesWithClients.length} quotes`);
    
    // Debug: Count by status
    const pendingCount = quotesWithClients.filter(q => q.status === 'PENDING_PRICING').length;
    const lockedCount = quotesWithClients.filter(q => q.status === 'IN_PRICING').length;
    const approvalCount = quotesWithClients.filter(q => q.status === 'AWAITING_CLIENT_APPROVAL').length;
    
    console.log(`📊 Breakdown: ${pendingCount} pending, ${lockedCount} locked, ${approvalCount} awaiting approval`);
    
    return quotesWithClients;

  } catch (error) {
    console.error('QuoteService.getManagerQuotes error:', error);
    return [];
  }
}
  /**
   * Get client quotes
   */
  static async getClientQuotes(clientId, status = null) {
    try {
      const whereClause = { clientId };
      if (status) {
        whereClause.status = status;
      }

      const quotes = await prisma.quote.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  price: true,
                  image: true,
                  description: true,
                  category: true,
                  icon: true
                }
              }
            }
          },
          manager: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Filter out items with null products
      const safeQuotes = quotes.map(quote => ({
        ...quote,
        items: quote.items
          .filter(item => item.product !== null)
          .map(item => ({
            ...item,
            product: item.product || { name: 'Product deleted', image: null }
          }))
      }));

      return safeQuotes;
    } catch (error) {
      console.error('QuoteService.getClientQuotes error:', error);
      throw error;
    }
  }

  /**
   * Clean up expired locks
   */
  static async cleanupExpiredLocks() {
    try {
      const result = await prisma.quote.updateMany({
        where: {
          status: 'IN_PRICING',
          lockExpiresAt: {
            lt: new Date()
          }
        },
        data: {
          status: 'PENDING_PRICING',
          lockedById: null,
          lockedAt: null,
          lockExpiresAt: null,
          managerId: null
        }
      });

      return { count: result.count };
    } catch (error) {
      console.error('QuoteService.cleanupExpiredLocks error:', error);
      throw error;
    }
  }
}

module.exports = QuoteService;