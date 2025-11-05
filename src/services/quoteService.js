const prisma = require('../config/prisma');

class QuoteService {
  /**
   * Create an empty quote (Client only) - NEW FLOW
   *\ @param {string} clientId - Client ID
   * @param {string} notes - Optional notes
   * @returns {Object} Created empty quote
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
   * Add items to quote (Client only) - NEW FLOW
   * @param {string} quoteId - Quote ID
   * @param {string} clientId - Client ID
   * @param {Array} items - Array of items with productId and quantity
   * @returns {Object} Updated quote
   */
  static async addItemsToQuote(quoteId, clientId, items) {
  try {
    // First check if quote exists and belongs to client
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        clientId
      }
    });

    if (!quote) {
      throw new Error('Quote not found or access denied');
    }

    // Check if quote is in the correct status for modification
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
      unitPrice: 0, // Will be set by manager
      subtotal: 0   // Will be calculated by manager
    }));

    await prisma.quoteItem.createMany({
      data: quoteItemsData
    });

    // Fetch updated quote without changing status
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
   * Update quote pricing (Manager only) - NEW FLOW
   * @param {string} quoteId - Quote ID
   * @param {string} managerId - Manager ID
   * @param {Array} items - Array of items with pricing
   * @param {string} sourcingNotes - Optional sourcing notes
   * @returns {Object} Updated quote
   */
  static async updateQuotePricing(quoteId, managerId, items, sourcingNotes = null) {
    try {
      // Verify quote exists and is ready for pricing
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          status: 'PENDING_PRICING'
        }
      });

      if (!quote) {
        throw new Error('Quote not found or not ready for pricing');
      }

      // Verify all products exist first
      const productIds = items.map(item => item.productId);
      const existingProducts = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true }
      });
      
      const existingProductIds = existingProducts.map(p => p.id);
      const missingProducts = productIds.filter(id => !existingProductIds.includes(id));
      
      if (missingProducts.length > 0) {
        throw new Error(`Products not found: ${missingProducts.join(', ')}`);
      }

      // Calculate total amount
      let totalAmount = 0;
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

      // Delete existing items
      await prisma.quoteItem.deleteMany({
        where: { quoteId }
      });

      // Create new items with pricing
      await prisma.quoteItem.createMany({
        data: quoteItemsData
      });

      // Update quote with pricing and assign manager
      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: {
          managerId,
          totalAmount,
          status: 'AWAITING_CLIENT_APPROVAL',
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          sourcingNotes: sourcingNotes || null
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
   * Submit quote to manager (Client only) - NEW FLOW
   * @param {string} quoteId - Quote ID
   * @param {string} clientId - Client ID
   * @returns {Object} Submitted quote
   */
  static async submitQuoteToManager(quoteId, clientId) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          clientId,
          status: 'PENDING_ITEMS'
        },
        include: {
          items: true
        }
      });

      if (!quote) {
        throw new Error('Quote not found or cannot be submitted');
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

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.submitQuoteToManager error:', error);
      throw error;
    }
  }

  /**
   * Finalize quote (Manager only) - NEW FLOW
   * @param {string} quoteId - Quote ID
   * @param {string} managerId - Manager ID
   * @returns {Object} Finalized quote
   */
  static async finalizeQuote(quoteId, managerId) {
    try {
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          managerId,
          status: 'AWAITING_CLIENT_APPROVAL'
        }
      });

      if (!quote) {
        throw new Error('Quote not found or cannot be finalized');
      }

      // Quote is already in AWAITING_CLIENT_APPROVAL status
      // This method can be used for additional manager actions if needed
      return quote;
    } catch (error) {
      console.error('QuoteService.finalizeQuote error:', error);
      throw error;
    }
  }

  /**
   * Convert quote to order (Client only) - NEW FLOW
   * @param {string} quoteId - Quote ID
   * @param {string} clientId - Client ID
   * @param {string} addressId - Address ID
   * @param {string} paymentMethod - Payment method
   * @returns {Object} Created order
   */
  static async convertToOrder(quoteId, clientId, addressId, paymentMethod = 'MTN_MOMO') {
    try {
      // Verify quote exists and is approved
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

      // Verify address belongs to client
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
      const order = await prisma.order.create({
        data: {
          clientId,
          addressId,
          total: quote.totalAmount,
          status: 'AWAITING_PAYMENT',
          notes: quote.sourcingNotes,
          quoteId,
          items: {
            create: quote.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal
            }))
          }
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  price: true
                }
              }
            }
          },
          address: true
        }
      });

      // Update quote status
      await prisma.quote.update({
        where: { id: quoteId },
        data: { 
          status: 'CONVERTED_TO_ORDER',
          orderId: order.id
        }
      });

      return order;
    } catch (error) {
      console.error('QuoteService.convertToOrder error:', error);
      throw error;
    }
  }

  /**
   * Get quote by ID
   * @param {string} quoteId - Quote ID
   * @returns {Object} Quote details
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
          order: {
            include: {
              address: true
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
   * Create a quote for an order (Manager only) - LEGACY METHOD
   * @param {string} orderId - Order ID
   * @param {string} managerId - Manager ID
   * @param {Array} quoteItems - Array of items with manager-set prices
   * @param {string} sourcingNotes - Optional sourcing notes
   * @returns {Object} Created quote
   */
  static async createQuote(orderId, managerId, quoteItems, sourcingNotes = null) {
    try {
      // Verify order exists and is in PENDING_QUOTE status
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true
            }
          },
          quote: true
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'PENDING_QUOTE') {
        throw new Error('Order is not in pending quote status');
      }

      if (order.quote) {
        throw new Error('Quote already exists for this order');
      }

      // Calculate total amount
      let totalAmount = 0;
      const quoteItemsData = quoteItems.map(item => {
        const subtotal = item.quantity * item.unitPrice;
        totalAmount += subtotal;
        
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal
        };
      });

      // Create quote with items
      const quote = await prisma.quote.create({
        data: {
          orderId,
          managerId,
          totalAmount,
          sourcingNotes,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: 'GENERATED',
          items: {
            create: quoteItemsData
          }
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

      // Update order status to AWAITING_CLIENT_APPROVAL
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'AWAITING_CLIENT_APPROVAL',
          total: totalAmount,
          managerId
        }
      });

      return quote;
    } catch (error) {
      console.error('QuoteService.createQuote error:', error);
      throw error;
    }
  }

  /**
   * Get quote by order ID
   * @param {string} orderId - Order ID
   * @returns {Object} Quote details
   */
  static async getQuoteByOrderId(orderId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { orderId },
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
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              address: true
            }
          }
        }
      });

      return quote;
    } catch (error) {
      console.error('QuoteService.getQuoteByOrderId error:', error);
      throw error;
    }
  }

  /**
   * Approve quote by client
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @returns {Object} Updated quote
   */
  static async approveQuote(orderId, clientId) {
    try {
      // Verify order belongs to client
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          clientId
        },
        include: {
          quote: true
        }
      });

      if (!order) {
        throw new Error('Order not found or access denied');
      }

      if (!order.quote) {
        throw new Error('No quote found for this order');
      }

      if (order.quote.status !== 'GENERATED') {
        throw new Error('Quote has already been processed');
      }

      if (order.status !== 'AWAITING_CLIENT_APPROVAL') {
        throw new Error('Order is not awaiting client approval');
      }

      // Update quote status
      const updatedQuote = await prisma.quote.update({
        where: { orderId },
        data: {
          status: 'APPROVED'
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

      // Update order status to AWAITING_PAYMENT
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'AWAITING_PAYMENT'
        }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.approveQuote error:', error);
      throw error;
    }
  }

  /**
   * Reject quote by client
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @param {string} reason - Rejection reason
   * @returns {Object} Updated quote
   */
  static async rejectQuote(orderId, clientId, reason = null) {
    try {
      // Verify order belongs to client
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          clientId
        },
        include: {
          quote: true
        }
      });

      if (!order) {
        throw new Error('Order not found or access denied');
      }

      if (!order.quote) {
        throw new Error('No quote found for this order');
      }

      if (order.quote.status !== 'GENERATED') {
        throw new Error('Quote has already been processed');
      }

      // Update quote status
      const updatedQuote = await prisma.quote.update({
        where: { orderId },
        data: {
          status: 'REJECTED',
          sourcingNotes: reason ? `${order.quote.sourcingNotes || ''}\nRejection reason: ${reason}`.trim() : order.quote.sourcingNotes
        }
      });

      // Update order status to REJECTED
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED'
        }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.rejectQuote error:', error);
      throw error;
    }
  }

  /**
   * Get all quotes for a manager
   * @param {string} managerId - Manager ID
   * @param {string} status - Optional status filter
   * @returns {Array} List of quotes
   */
  static async getManagerQuotes(managerId, status = null) {
    try {
      const whereClause = { managerId };
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
                  description: true,
                  category: true
                }
              }
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              address: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return quotes;
    } catch (error) {
      console.error('QuoteService.getManagerQuotes error:', error);
      throw error;
    }
  }

  /**
   * Get all quotes for a client
   * @param {string} clientId - Client ID
   * @param {string} status - Optional status filter
   * @returns {Array} List of quotes
   */
  static async getClientQuotes(clientId, status = null) {
    try {
      const whereClause = {
        order: {
          clientId
        }
      };
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
          order: {
            include: {
              address: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return quotes;
    } catch (error) {
      console.error('QuoteService.getClientQuotes error:', error);
      throw error;
    }
  }

  /**
   * Update quote items (Manager only)
   * @param {string} quoteId - Quote ID
   * @param {string} managerId - Manager ID
   * @param {Array} quoteItems - Updated quote items
   * @returns {Object} Updated quote
   */
  static async updateQuoteItems(quoteId, managerId, quoteItems) {
    try {
      // Verify quote exists and belongs to manager
      const quote = await prisma.quote.findFirst({
        where: {
          id: quoteId,
          managerId,
          status: 'GENERATED'
        }
      });

      if (!quote) {
        throw new Error('Quote not found or cannot be updated');
      }

      // Delete existing quote items
      await prisma.quoteItem.deleteMany({
        where: { quoteId }
      });

      // Calculate new total
      let totalAmount = 0;
      const quoteItemsData = quoteItems.map(item => {
        const subtotal = item.quantity * item.unitPrice;
        totalAmount += subtotal;
        
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal
        };
      });

      // Create new quote items
      await prisma.quoteItem.createMany({
        data: quoteItemsData
      });

      // Update quote total
      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: { totalAmount },
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

      // Update order total
      await prisma.order.update({
        where: { id: quote.orderId },
        data: { total: totalAmount }
      });

      return updatedQuote;
    } catch (error) {
      console.error('QuoteService.updateQuoteItems error:', error);
      throw error;
    }
  }
}

module.exports = QuoteService;
