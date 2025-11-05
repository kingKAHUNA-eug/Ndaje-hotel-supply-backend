const { z } = require('zod');
const prisma = require('../config/prisma');

// Validation schemas
const createOrderSchema = z.object({
  addressId: z.string().min(1, 'Address ID is required'),
  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1')
  })).min(1, 'At least one item is required'),
  notes: z.string().optional()
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING_QUOTE', 'AWAITING_CLIENT_APPROVAL', 'AWAITING_PAYMENT', 'PAID_AND_APPROVED', 'IN_TRANSIT', 'DELIVERED', 'CANCELED', 'REJECTED'])
});

// Create a new order (Client) - DEPRECATED: Use quote flow instead
const createOrder = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Direct order creation is deprecated. Please use the quote-based flow: 1) Create quote, 2) Add items, 3) Manager prices, 4) Client approves, 5) Convert to order with address.'
  });
};

// Get orders for client
const getClientOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { clientId: req.user.userId },
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
        address: true,
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: { orders }
    });

  } catch (error) {
    console.error('Get client orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get orders for manager/admin
const getManagerOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
        address: true,
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: { orders }
    });

  } catch (error) {
    console.error('Get manager orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update order status (Manager/Admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = updateOrderStatusSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order status and assign manager
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status,
        managerId: req.user.userId
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
        address: true,
        payment: true
      }
    });

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order: updatedOrder }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
        address: true,
        payment: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check permissions
    if (req.user.role === 'CLIENT' && order.clientId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { order }
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createOrder,
  getClientOrders,
  getManagerOrders,
  updateOrderStatus,
  getOrder
};
