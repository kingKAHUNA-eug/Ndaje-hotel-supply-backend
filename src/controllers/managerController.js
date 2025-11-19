// controllers/managerController.js
const { prisma } = require('../config/prisma');

const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { status: 'pending' },
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
                referencePrice: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: quotes });
  } catch (err) {
    console.error('Get pending quotes error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const priceAndApproveQuote = async (req, res) => {
  const { id } = req.params;
  const { prices } = req.body; // [{ productId: "xxx", finalPrice: 55000 }]

  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ success: false, message: 'Prices array required' });
  }

  try {
    // Fetch the quote with items
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    if (quote.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Quote already processed' });
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
        data: { finalPrice }
      });
    }

    // Update the quote with approval info
    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: {
        finalPrice: totalAmount,
        status: 'approved',
        approvedBy: req.user.userId, // Using firebaseUid from auth middleware
        approvedAt: new Date()
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
                referencePrice: true
              }
            }
          }
        }
      }
    });

    res.json({ success: true, data: updatedQuote });
  } catch (err) {
    console.error('Price and approve quote error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const getMyPricedOrders = async (req, res) => {
  try {
    const orders = await prisma.quote.findMany({
      where: {
        status: 'approved',
        approvedBy: req.user.userId // Using firebaseUid from auth middleware
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
                referencePrice: true
              }
            }
          }
        }
      },
      orderBy: { approvedAt: 'desc' }
    });

    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Get my priced orders error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getPendingQuotes,
  priceAndApproveQuote,
  getMyPricedOrders
};