const { z } = require('zod');
const DeliveryService = require('../services/deliveryService');

// Validation schemas
const assignDeliverySchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  agentId: z.string().min(1, 'Agent ID is required')
});

const updateDeliveryStatusSchema = z.object({
  status: z.enum(['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']),
  location: z.object({
    latitude: z.number(),
    longitude: z.number()
  }).optional(),
  notes: z.string().optional()
});

const verifyDeliverySchema = z.object({
  verificationCode: z.string().min(1, 'Verification code is required')
});

// Assign delivery agent to an order (Manager/Admin only)
const assignDeliveryAgent = async (req, res) => {
  try {
    const { orderId, agentId } = assignDeliverySchema.parse(req.body);

    const delivery = await DeliveryService.assignDeliveryAgent(orderId, agentId);

    res.status(201).json({
      success: true,
      message: 'Delivery agent assigned successfully',
      data: { delivery }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Assign delivery agent error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Update delivery status (Delivery Agent only)
const updateDeliveryStatus = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { status, location, notes } = updateDeliveryStatusSchema.parse(req.body);
    const agentId = req.user.userId;

    const delivery = await DeliveryService.updateDeliveryStatus(deliveryId, agentId, status, location, notes);

    res.json({
      success: true,
      message: 'Delivery status updated successfully',
      data: { delivery }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Update delivery status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get delivery by ID
const getDeliveryById = async (req, res) => {
  try {
    const { deliveryId } = req.params;

    const delivery = await DeliveryService.getDeliveryById(deliveryId);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Check permissions
    if (req.user.role === 'CLIENT' && delivery.order.clientId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (req.user.role === 'DELIVERY_AGENT' && delivery.agentId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { delivery }
    });

  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get deliveries for delivery agent
const getAgentDeliveries = async (req, res) => {
  try {
    const { status } = req.query;
    const agentId = req.user.userId;

    const deliveries = await DeliveryService.getAgentDeliveries(agentId, status);

    res.json({
      success: true,
      data: { deliveries }
    });

  } catch (error) {
    console.error('Get agent deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get deliveries for client
const getClientDeliveries = async (req, res) => {
  try {
    const { status } = req.query;
    const clientId = req.user.userId;

    const deliveries = await DeliveryService.getClientDeliveries(clientId, status);

    res.json({
      success: true,
      data: { deliveries }
    });

  } catch (error) {
    console.error('Get client deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all deliveries (Admin only)
const getAllDeliveries = async (req, res) => {
  try {
    const { status, agentId } = req.query;

    const deliveries = await DeliveryService.getAllDeliveries(status, agentId);

    res.json({
      success: true,
      data: { deliveries }
    });

  } catch (error) {
    console.error('Get all deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get delivery tracking info for client
const getDeliveryTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const clientId = req.user.userId;

    const tracking = await DeliveryService.getDeliveryTracking(orderId, clientId);

    res.json({
      success: true,
      data: { tracking }
    });

  } catch (error) {
    console.error('Get delivery tracking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Verify delivery by client
const verifyDeliveryByClient = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { verificationCode } = verifyDeliverySchema.parse(req.body);
    const clientId = req.user.userId;

    const result = await DeliveryService.verifyDeliveryByClient(deliveryId, clientId, verificationCode);

    res.json({
      success: true,
      message: result.message,
      data: { delivery: result.delivery }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Verify delivery by client error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Confirm delivery by manager
const confirmDeliveryByManager = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const managerId = req.user.userId;

    const result = await DeliveryService.confirmDeliveryByManager(deliveryId, managerId);

    res.json({
      success: true,
      message: result.message,
      data: { delivery: result.delivery }
    });

  } catch (error) {
    console.error('Confirm delivery by manager error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get delivery code for agent
const getDeliveryCode = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const agentId = req.user.userId;

    const codeInfo = await DeliveryService.getDeliveryCode(deliveryId, agentId);

    res.json({
      success: true,
      data: { codeInfo }
    });

  } catch (error) {
    console.error('Get delivery code error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

module.exports = {
  assignDeliveryAgent,
  updateDeliveryStatus,
  getDeliveryById,
  getAgentDeliveries,
  getClientDeliveries,
  getAllDeliveries,
  getDeliveryTracking,
  verifyDeliveryByClient,
  confirmDeliveryByManager,
  getDeliveryCode
};
