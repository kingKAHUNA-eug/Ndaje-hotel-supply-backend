// controllers/adminController.js
const { z } = require('zod');
const AdminReportService = require('../services/adminReportService');
const crypto = require('crypto'); 
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');
const { prisma } = require('../index');

if (process.env.CLOUDINARY_URL) {
  cloudinary.config(process.env.CLOUDINARY_URL);
  console.log('✅ Cloudinary configured from CLOUDINARY_URL');
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configured from individual env vars');
}

const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    console.log('📤 Uploading image to Cloudinary...');

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'ndaje-products',
          resource_type: 'auto',
          allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp']
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      uploadStream.end(req.file.buffer);
    });

    console.log('✅ Image uploaded:', result.secure_url);

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: { 
        url: result.secure_url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to upload image' 
    });
  }
};

// Helper function to generate unique identifiers
const generateUniqueId = (prefix) => {
  // Using crypto for better randomness than uuid
  const randomString = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${randomString}`;
};

// Validation schemas
const reportFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional()
});

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(10, 'Phone must be at least 10 characters')
});

// ======================== REPORTS ========================
const generateSystemReport = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    if (filters.startDate) filters.startDate = new Date(filters.startDate);
    if (filters.endDate) filters.endDate = new Date(filters.endDate);

    const report = await AdminReportService.generateSystemReport(filters);

    res.json({
      success: true,
      message: 'System report generated successfully',
      data: { report }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error('Generate system report error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

const exportReportToCSV = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    if (filters.startDate) filters.startDate = new Date(filters.startDate);
    if (filters.endDate) filters.endDate = new Date(filters.endDate);

    const report = await AdminReportService.generateSystemReport(filters);
    const csvContent = AdminReportService.exportToCSV(report);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="system-report-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error('Export report to CSV error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

const getDashboardSummary = async (req, res) => {
  try {
    const filters = reportFiltersSchema.parse(req.query);
    if (filters.startDate) filters.startDate = new Date(filters.startDate);
    if (filters.endDate) filters.endDate = new Date(filters.endDate);

    const report = await AdminReportService.generateSystemReport(filters);

    res.json({
      success: true,
      data: {
        summary: report.summary,
        orderStatistics: report.orderStatistics,
        userStatistics: report.userStatistics,
        paymentStatistics: report.paymentStatistics,
        deliveryStatistics: report.deliveryStatistics
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// ======================== ADMIN ENDPOINTS ========================

// GET all managers
const getAllManagers = async (req, res) => {
  try {
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER' },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ 
      success: true, 
      data: managers,
      count: managers.length 
    });
  } catch (err) {
    console.error('Get all managers error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch managers' 
    });
  }
};

// GET all drivers
const getAllDrivers = async (req, res) => {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: 'DELIVERY_AGENT' },
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ 
      success: true, 
      data: drivers,
      count: drivers.length 
    });
  } catch (err) {
    console.error('Get all drivers error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch drivers' 
    });
  }
};

// GET all orders
const getAllOrders = async (req, res) => {
  try {
    const orders = await prisma.quote.findMany({
      where: { status: 'APPROVED' },
      include: {
        client: {
          select: { name: true, email: true, phone: true }
        },
        manager: {
          select: { name: true }
        },
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ 
      success: true, 
      data: orders,
      count: orders.length 
    });
  } catch (err) {
    console.error('Get all orders error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders' 
    });
  }
};

// CREATE MANAGER - PRODUCTION VERSION
const createManager = async (req, res) => {
  try {
    // Validate input
    const validatedData = createUserSchema.parse(req.body);
    const { name, email, phone } = validatedData;

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'A user with this email already exists' 
      });
    }

    // Generate unique identifier for this manager
    const firebaseUid = generateUniqueId('mgr');

    // Create manager with transaction for safety
    const manager = await prisma.$transaction(async (tx) => {
      return await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
          role: 'MANAGER',
          isActive: true,
          emailVerified: true,
          firebaseUid: firebaseUid
        },
        select: {
          id: true,
          firebaseUid: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });
    });

    console.log(`✅ Manager created: ${manager.email} (${manager.firebaseUid})`);

    res.status(201).json({
      success: true,
      message: 'Manager created successfully',
      data: manager
    });

  } catch (err) {
    console.error('Create manager error:', err);
    
    // Handle validation errors
    if (err instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: err.errors 
      });
    }
    
    // Handle Prisma errors
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      if (target?.includes('email')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already exists' 
        });
      }
      if (target?.includes('firebaseUid')) {
        // This should be rare with crypto-generated IDs
        return res.status(500).json({ 
          success: false, 
          message: 'Unique ID conflict. Please try again.' 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create manager. Please try again.' 
    });
  }
};

// CREATE DRIVER - PRODUCTION VERSION
const createDriver = async (req, res) => {
  try {
    // Validate input
    const validatedData = createUserSchema.parse(req.body);
    const { name, email, phone } = validatedData;

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'A user with this email already exists' 
      });
    }

    // Generate unique identifier for this driver
    const firebaseUid = generateUniqueId('drv');

    // Create driver with transaction for safety
    const driver = await prisma.$transaction(async (tx) => {
      return await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
          role: 'DELIVERY_AGENT',
          isActive: true,
          emailVerified: true,
          firebaseUid: firebaseUid
        },
        select: {
          id: true,
          firebaseUid: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });
    });

    console.log(`✅ Driver created: ${driver.email} (${driver.firebaseUid})`);

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: driver
    });

  } catch (err) {
    console.error('Create driver error:', err);
    
    // Handle validation errors
    if (err instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: err.errors 
      });
    }
    
    // Handle Prisma errors
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      if (target?.includes('email')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email already exists' 
        });
      }
      if (target?.includes('firebaseUid')) {
        return res.status(500).json({ 
          success: false, 
          message: 'Unique ID conflict. Please try again.' 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create driver. Please try again.' 
    });
  }
};
// ======================== DEBUG CLOUDINARY CONFIG ========================
const testCloudinaryConfig = async (req, res) => {
  try {
    console.log('🔍 Testing Cloudinary Configuration...');
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.log('API Key exists:', !!process.env.CLOUDINARY_API_KEY);
    console.log('API Key length:', process.env.CLOUDINARY_API_KEY?.length);
    console.log('API Secret exists:', !!process.env.CLOUDINARY_API_SECRET);
    console.log('API Secret length:', process.env.CLOUDINARY_API_SECRET?.length);
    
    // Test if cloudinary is configured
    const config = cloudinary.config();
    console.log('Cloudinary config:', {
      cloud_name: config.cloud_name,
      api_key_set: !!config.api_key
    });

    res.json({
      success: true,
      data: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key_exists: !!process.env.CLOUDINARY_API_KEY,
        api_key_length: process.env.CLOUDINARY_API_KEY?.length,
        api_secret_exists: !!process.env.CLOUDINARY_API_SECRET,
        api_secret_length: process.env.CLOUDINARY_API_SECRET?.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const resetUserPassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  try {
    // 1. Find user in Prisma to get their firebaseUid
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firebaseUid: true, email: true, name: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.firebaseUid) {
      return res.status(400).json({
        success: false,
        message: 'This user has no Firebase account (maybe created manually)'
      });
    }

    // 2. Reset password in Firebase Auth
    await admin.auth().updateUser(user.firebaseUid, {
      password: newPassword
    });

    // 3. Generate a clean password to show admin once
    const displayPassword = newPassword;

    // 4. Respond with success + show password once
    res.json({
      success: true,
      message: 'Password reset successfully in Firebase!',
      newPassword: displayPassword,  // Only shown once in response
      user: {
        name: user.name,
        email: user.email
      }
    });

  } catch (err) {
    {
    console.error('Firebase password reset failed:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password: ' + err.message
    });
  }
};
};
// ======================== EXPORT ========================
module.exports = {
  generateSystemReport,
  exportReportToCSV,
  getDashboardSummary,
  getAllManagers,
  getAllDrivers,
  getAllOrders,
  createManager,
  createDriver,
  uploadProductImage,
  testCloudinaryConfig,
  resetUserPassword,
  deleteManager,
  deleteDriver
};