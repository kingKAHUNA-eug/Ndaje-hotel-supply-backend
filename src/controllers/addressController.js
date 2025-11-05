const { z } = require('zod');
const prisma = require('../config/prisma');

// Validation schema
const addressSchema = z.object({
  label: z.string().optional(),
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().min(1, 'Country is required')
});

// Get all addresses for the authenticated user
const getAddresses = async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: { addresses }
    });

  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get a specific address
const getAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await prisma.address.findFirst({
      where: {
        id,
        userId: req.user.userId
      }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: { address }
    });

  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create a new address
const createAddress = async (req, res) => {
  try {
    const addressData = addressSchema.parse(req.body);

    const address = await prisma.address.create({
      data: {
        ...addressData,
        userId: req.user.userId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      data: { address }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Create address error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update an address
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const addressData = addressSchema.parse(req.body);

    // Check if address exists and belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id,
        userId: req.user.userId
      }
    });

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: addressData
    });

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: { address }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete an address
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if address exists and belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id,
        userId: req.user.userId
      }
    });

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Check if address is used in any orders
    const ordersUsingAddress = await prisma.order.findFirst({
      where: { addressId: id }
    });

    if (ordersUsingAddress) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete address that is used in orders'
      });
    }

    await prisma.address.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress
};
