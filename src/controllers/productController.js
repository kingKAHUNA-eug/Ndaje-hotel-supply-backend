// controllers/productController.js — FINAL GOD VERSION
const { z } = require('zod');
const prisma = require('../config/prisma');

// NEW VALIDATION — supports image, icon, reference
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  price: z.number().positive('Price must be positive'),
  description: z.string().optional(),
  category: z.string().optional(),
  reference: z.string().optional(),     // ← NEW: e.g. BEER-001
  icon: z.string().min(1, 'Icon is required'), // ← NEW: emoji or name
  image: z.string().url().optional().or(z.literal('')), // ← NEW: optional image URL
  active: z.boolean().optional().default(true)
});

// GET ALL PRODUCTS — Public (clients see this)
const getProducts = async (req, res) => {
  try {
    const { active = 'true', category } = req.query;

    const where = {
      active: active === 'true'
    };
    if (category) where.category = category;

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        description: true,
        category: true,
        reference: true,
        icon: true,
        image: true,
        active: true,
        createdAt: true
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET SINGLE PRODUCT
const getProduct = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) return res.status(404).json({ success: false, message: 'Not found' });

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CREATE PRODUCT — Admin only
const createProduct = async (req, res) => {
  try {
    const data = productSchema.parse(req.body);

    const product = await prisma.product.create({
      data: {
        ...data,
        image: data.image || null,
        reference: data.reference || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Product added — clients can now order it!',
      data: product
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: error.errors });
    }
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'SKU';
      return res.status(400).json({ success: false, message: `${field} already exists` });
    }
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// UPDATE PRODUCT
const updateProduct = async (req, res) => {
  try {
    const data = productSchema.partial().parse(req.body); // allow partial updates

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...data,
        image: data.image === '' ? null : data.image
      }
    });

    res.json({ success: true, message: 'Product updated', data: product });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' });
    if (error.code === 'P2002') return res.status(400).json({ success: false, message: 'SKU or name already used' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// SOFT DELETE
const deleteProduct = async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { active: false }
    });
    res.json({ success: true, message: 'Product removed from catalog' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed' });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
};