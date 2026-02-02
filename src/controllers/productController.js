// controllers/productController.js - UPDATED FOR MULTIPLE IMAGES
const { z } = require('zod');
const prisma = require('../config/prisma');

// Updated validation schema for multiple images
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').transform(val => val?.trim() || ''),
  sku: z.string().min(1, 'SKU is required').transform(val => val?.trim() || ''),
  price: z.union([
    z.number().positive('Price must be positive'),
    z.string().transform(val => parseFloat(val))
  ]).refine(val => !isNaN(val) && val > 0, 'Price must be a positive number'),
  description: z.string().optional().nullable().transform(val => val?.trim() || null),
  category: z.string().optional().nullable().transform(val => val?.trim() || null),
  reference: z.string().optional().nullable().transform(val => val?.trim() || null),
  icon: z.string().min(1, 'Icon is required').transform(val => val?.trim() || ''),
  // CHANGE: Handle array of images
  images: z.array(z.string().url('Invalid image URL')).max(6, 'Maximum 6 images allowed').optional().default([]),
  active: z.boolean().optional().default(true)
});

// Schema for partial updates
const productUpdateSchema = z.object({
  name: z.string().min(1, 'Product name is required').transform(val => val?.trim() || '').optional(),
  sku: z.string().min(1, 'SKU is required').transform(val => val?.trim() || '').optional(),
  price: z.union([
    z.number().positive('Price must be positive'),
    z.string().transform(val => parseFloat(val))
  ]).refine(val => !isNaN(val) && val > 0, 'Price must be a positive number').optional(),
  description: z.string().optional().nullable().transform(val => val?.trim() || null),
  category: z.string().optional().nullable().transform(val => val?.trim() || null),
  reference: z.string().optional().nullable().transform(val => val?.trim() || null),
  icon: z.string().min(1, 'Icon is required').transform(val => val?.trim() || '').optional(),
  // CHANGE: Handle array of images
  images: z.array(z.string().url('Invalid image URL')).max(6, 'Maximum 6 images allowed').optional(),
  active: z.boolean().optional()
}).partial();

// GET ALL PRODUCTS - Updated to handle images array
const getProducts = async (req, res) => {
  try {
    const { active = 'true', category } = req.query;

    const where = {};
    
    if (active !== 'all') {
      where.active = active === 'true';
    }
    
    if (category && category !== 'all') {
      where.category = category;
    }

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
        images: true, // Now getting images array
        active: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { name: 'asc' }
    });

    // Sanitize null values for frontend
    const sanitizedProducts = products.map(p => ({
      ...p,
      description: p.description || '',
      category: p.category || '',
      reference: p.reference || '',
      images: p.images || [] // Ensure images is always an array
    }));

    res.json({
      success: true,
      count: sanitizedProducts.length,
      data: sanitizedProducts
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET SINGLE PRODUCT - Updated
const getProduct = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Sanitize null values for frontend
    const sanitizedProduct = {
      ...product,
      description: product.description || '',
      category: product.category || '',
      reference: product.reference || '',
      images: product.images || [] // Ensure images is always an array
    };

    res.json({ success: true, data: sanitizedProduct });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CREATE PRODUCT - Updated for multiple images
const createProduct = async (req, res) => {
  try {
    console.log('📦 Creating product with data:', req.body);
    
    const data = productSchema.parse(req.body);

    // Check if SKU already exists
    const existingSku = await prisma.product.findUnique({
      where: { sku: data.sku }
    });

    if (existingSku) {
      return res.status(400).json({ 
        success: false, 
        message: 'A product with this SKU already exists' 
      });
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        price: data.price,
        description: data.description || null,
        category: data.category || null,
        reference: data.reference || null,
        icon: data.icon,
        images: data.images || [], // Store images array
        active: data.active
      }
    });

    console.log('✅ Product created:', product.id);

    res.status(201).json({
      success: true,
      message: 'Product added — clients can now order it!',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'SKU';
      return res.status(400).json({ 
        success: false, 
        message: `${field} already exists` 
      });
    }
    
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// UPDATE PRODUCT - Updated for multiple images
const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    console.log('📦 Updating product:', productId);
    console.log('📦 Raw update data:', req.body);
    
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!existingProduct) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Pre-process the data
    const preprocessedData = {
      ...req.body,
      description: req.body.description ?? '',
      category: req.body.category ?? '',
      reference: req.body.reference ?? '',
      price: req.body.price !== undefined ? Number(req.body.price) : undefined,
      images: req.body.images || [] // Ensure images is array
    };
    
    console.log('📦 Preprocessed data:', preprocessedData);

    // Validate with partial schema
    const data = productUpdateSchema.parse(preprocessedData);
    
    console.log('📦 Validated data:', data);

    // Check SKU uniqueness if being changed
    if (data.sku && data.sku !== existingProduct.sku) {
      const skuExists = await prisma.product.findUnique({
        where: { sku: data.sku }
      });
      
      if (skuExists) {
        return res.status(400).json({ 
          success: false, 
          message: 'SKU already in use by another product' 
        });
      }
    }

    // Build update object
    const updateData = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.category !== undefined) updateData.category = data.category || null;
    if (data.reference !== undefined) updateData.reference = data.reference || null;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.images !== undefined) updateData.images = data.images || []; // Update images array
    if (data.active !== undefined) updateData.active = data.active;

    console.log('📦 Final update data:', updateData);

    const product = await prisma.product.update({
      where: { id: productId },
      data: updateData
    });

    console.log('✅ Product updated:', product.id);

    // Sanitize response for frontend
    const sanitizedProduct = {
      ...product,
      description: product.description || '',
      category: product.category || '',
      reference: product.reference || '',
      images: product.images || []
    };

    res.json({ 
      success: true, 
      message: 'Product updated successfully', 
      data: sanitizedProduct 
    });
  } catch (error) {
    console.error('Update product error:', error);
    
    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:', error.errors);
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
        message: 'SKU or name already used by another product' 
      });
    }
    
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// SOFT DELETE (deactivate)
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    console.log('🗑️ Soft deleting product:', productId);
    
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { active: false }
    });
    
    console.log('✅ Product deactivated:', productId);
    
    res.json({ success: true, message: 'Product removed from catalog' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

// GET CATEGORIES
const getCategories = async (req, res) => {
  try {
    const categories = await prisma.product.findMany({
      where: {
        category: { not: null },
        active: true
      },
      select: { category: true },
      distinct: ['category']
    });

    const categoryList = categories
      .map(c => c.category)
      .filter(Boolean)
      .sort();

    res.json({
      success: true,
      data: categoryList
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories
};