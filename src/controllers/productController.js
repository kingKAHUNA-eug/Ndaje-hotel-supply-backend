const { z } = require('zod');
const prisma = require('../config/prisma');

// Validation schema for no-inventory product catalog
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().positive('Price must be positive'), // Reference price only - actual pricing done in quotes
  description: z.string().optional(),
  category: z.string().optional(),
  active: z.boolean().optional().default(true)
});

// Get all products (Catalog browsing - no inventory tracking)
const getProducts = async (req, res) => {
  try {
    const { active, category } = req.query;

    const whereClause = {};
    if (active !== undefined) {
      whereClause.active = active === 'true';
    }
    if (category) {
      whereClause.category = category;
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        sku: true,
        price: true, // Reference price - actual pricing done in quotes
        description: true,
        category: true,
        active: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      message: 'Product catalog retrieved. Note: Prices shown are reference prices. Actual pricing will be provided in quotes.',
      data: { products }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: { product }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create product (Admin only) - Adds to catalog for sourcing
const createProduct = async (req, res) => {
  try {
    const productData = productSchema.parse(req.body);

    const product = await prisma.product.create({
      data: productData
    });

    res.status(201).json({
      success: true,
      message: 'Product added to catalog successfully. This product can now be sourced on-demand for quotes.',
      data: { product }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Product with this SKU already exists'
      });
    }

    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update product (Admin only)
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productData = productSchema.parse(req.body);

    const product = await prisma.product.update({
      where: { id },
      data: productData
    });

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Product with this SKU already exists'
      });
    }

    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete product (Admin only)
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if product is used in any orders
    const orderItems = await prisma.orderItem.findFirst({
      where: { productId: id }
    });

    if (orderItems) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete product that is used in orders'
      });
    }

    await prisma.product.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
};
