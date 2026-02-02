// controllers/adminController.js
const { z } = require('zod');
const AdminReportService = require('../services/adminReportService');
const QuoteService = require('../services/quoteService');
const crypto = require('crypto'); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');
const { prisma } = require('../index');
const ActivityService = require('../services/activityService');


// Configure Cloudinary - WITH DEBUGGING
console.log('🔧 CLOUDINARY ENV CHECK:');
console.log('  CLOUDINARY_URL:', process.env.CLOUDINARY_URL ? 'SET' : 'NOT SET');
console.log('  CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('  CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');

if (process.env.CLOUDINARY_URL) {
  // Parse the URL to check the cloud name
  const urlMatch = process.env.CLOUDINARY_URL.match(/@([^/]+)$/);
  console.log('  Cloud name from URL:', urlMatch ? urlMatch[1] : 'COULD NOT PARSE');
  
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

// Verify final configuration
const finalConfig = cloudinary.config();
console.log('📋 FINAL CLOUDINARY CONFIG:');
console.log('  cloud_name:', finalConfig.cloud_name);
console.log('  api_key set:', !!finalConfig.api_key);

// Helper function to generate unique identifiers
const generateUniqueId = (prefix) => {
  const randomString = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${randomString}`;
};

// Helper function to generate random password
const generateRandomPassword = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
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

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
});

// ======================== IMAGE UPLOAD ========================
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

const uploadMultipleProductImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No files uploaded' 
      });
    }

    console.log(`📤 Uploading ${req.files.length} images to Cloudinary...`);

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
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
        uploadStream.end(file.buffer);
      });
    });

    const results = await Promise.all(uploadPromises);
    
    const imageData = results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id
    }));

    console.log(`✅ ${results.length} images uploaded successfully`);

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      data: imageData
    });
  } catch (error) {
    console.error('❌ Multiple upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to upload images' 
    });
  }
};

const cleanupOrphanedQuotes = async (req, res) => {
  try {
    // Only admins can run this
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    console.log('🔍 Starting orphaned quotes cleanup...');
    
    // Find all quotes
    const allQuotes = await prisma.quote.findMany({
      include: { 
        client: true,
        items: true 
      }
    });

    console.log(`Total quotes in database: ${allQuotes.length}`);

    // Find orphaned quotes (client is null or doesn't exist)
    const orphanedQuoteIds = allQuotes
      .filter(q => q.client === null || !q.client)
      .map(q => q.id);

    console.log(`Found ${orphanedQuoteIds.length} orphaned quotes`);

    if (orphanedQuoteIds.length === 0) {
      return res.json({
        success: true,
        message: '✅ No orphaned quotes found',
        data: { cleaned: 0, total: allQuotes.length }
      });
    }

    // First, delete quote items for orphaned quotes
    console.log('Deleting quote items...');
    await prisma.quoteItem.deleteMany({
      where: {
        quoteId: { in: orphanedQuoteIds }
      }
    });

    // Then delete the orphaned quotes
    console.log('Deleting orphaned quotes...');
    const deleteResult = await prisma.quote.deleteMany({
      where: {
        id: { in: orphanedQuoteIds }
      }
    });

    res.json({
      success: true,
      message: `✅ Cleaned up ${deleteResult.count} orphaned quotes`,
      data: { 
        cleaned: deleteResult.count, 
        total: allQuotes.length,
        orphanedQuoteIds 
      }
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup orphaned quotes',
      error: error.message
    });
  }
};

// Also add a function to view orphaned quotes without deleting
const viewOrphanedQuotes = async (req, res) => {
  try {
    // Only admins can run this
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    console.log('🔍 Viewing orphaned quotes...');
    
    // Find all quotes with null clients
    const orphanedQuotes = await prisma.quote.findMany({
      where: {
        client: null
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      message: `Found ${orphanedQuotes.length} orphaned quotes`,
      data: { orphanedQuotes }
    });

  } catch (error) {
    console.error('View orphaned quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view orphaned quotes',
      error: error.message
    });
  }
};
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

// CREATE MANAGER - UPDATED WITH PASSWORD
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

    // Generate temporary password
    const temporaryPassword = generateRandomPassword(10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Generate unique identifier
    const firebaseUid = generateUniqueId('mgr');

    // Create manager
    const manager = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        role: 'MANAGER',
        isActive: true,
        isVerified: true,
        emailVerified: true,
        firebaseUid: firebaseUid,
        // Add this line to set the password in the database
        password: hashedPassword
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

    console.log(`✅ Manager created: ${manager.email}`);
    console.log(`📋 Temporary password: ${temporaryPassword}`);

    res.status(201).json({
      success: true,
      message: 'Manager created successfully',
      data: {
        manager: manager,
        temporaryPassword: temporaryPassword, // Send this to admin
        loginInstructions: 'Manager can login with this temporary password and should change it on first login'
      }
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
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create manager. Please try again.' 
    });
  }
};

// CREATE DRIVER - UPDATED WITH PASSWORD
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

    // Generate temporary password
    const temporaryPassword = generateRandomPassword(10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Generate unique identifier
    const firebaseUid = generateUniqueId('drv');

    // Create driver
    const driver = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        role: 'DELIVERY_AGENT',
        isActive: true,
        isVerified: true,
        emailVerified: true,
        firebaseUid: firebaseUid,
        // Add this line to set the password in the database
        password: hashedPassword
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

    console.log(`✅ Driver created: ${driver.email}`);
    console.log(`📋 Temporary password: ${temporaryPassword}`);

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: {
        driver: driver,
        temporaryPassword: temporaryPassword, // Send this to admin
        loginInstructions: 'Driver can login with this temporary password and should change it on first login'
      }
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
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create driver. Please try again.' 
    });
  }
};

// RESET USER PASSWORD - FIXED
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate input
    const { newPassword } = resetPasswordSchema.parse(req.body);

    console.log(`🔐 Resetting password for user ID: ${userId}`);

    // Find user
    const user = await prisma.user.findUnique({
      where: { 
        id: userId,
        OR: [
          { role: 'MANAGER' },
          { role: 'DELIVERY_AGENT' }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found or not a manager/driver' 
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    console.log(`✅ Password reset for ${user.email}`);

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to reset password' 
    });
  }
};

// DELETE MANAGER - FIXED
const deleteManager = async (req, res) => {
  try {
    const { managerId } = req.params;

    console.log(`🗑️ Attempting to delete manager with ID: ${managerId}`);

    if (!managerId || managerId === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: 'Manager ID is required' 
      });
    }

    // Find user by ID and role
    const user = await prisma.user.findUnique({
      where: { 
        id: managerId,
        role: 'MANAGER'
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Manager not found' 
      });
    }

    // Delete from Firebase if has firebaseUid
    if (user.firebaseUid) {
      try {
        await admin.auth().deleteUser(user.firebaseUid);
        console.log(`✅ Deleted from Firebase: ${user.email}`);
      } catch (firebaseErr) {
        console.log(`⚠️ Firebase delete skipped for ${user.email}:`, firebaseErr.message);
      }
    }

    // Delete from database
    await prisma.user.delete({
      where: { id: managerId }
    });

    console.log(`✅ Manager deleted from database: ${user.email}`);

    res.json({
      success: true,
      message: 'Manager deleted successfully'
    });

  } catch (error) {
    console.error('Delete manager error:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false, 
        message: 'Manager not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete manager' 
    });
  }
};

// DELETE DRIVER - FIXED
const deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    console.log(`🗑️ Attempting to delete driver with ID: ${driverId}`);

    if (!driverId || driverId === 'undefined') {
      return res.status(400).json({ 
        success: false, 
        message: 'Driver ID is required' 
      });
    }

    // Find user by ID and role
    const user = await prisma.user.findUnique({
      where: { 
        id: driverId,
        role: 'DELIVERY_AGENT'
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }

    // Delete from Firebase if has firebaseUid
    if (user.firebaseUid) {
      try {
        await admin.auth().deleteUser(user.firebaseUid);
        console.log(`✅ Deleted from Firebase: ${user.email}`);
      } catch (firebaseErr) {
        console.log(`⚠️ Firebase delete skipped for ${user.email}:`, firebaseErr.message);
      }
    }

    // Delete from database
    await prisma.user.delete({
      where: { id: driverId }
    });

    console.log(`✅ Driver deleted from database: ${user.email}`);

    res.json({
      success: true,
      message: 'Driver deleted successfully'
    });

  } catch (error) {
    console.error('Delete driver error:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to delete driver' 
    });
  }
};

// ======================== LOGIN ENDPOINTS FOR MANAGERS/DRIVERS ========================

const loginManager = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find manager
    const manager = await prisma.user.findUnique({
      where: { 
        email: email.trim().toLowerCase(),
        role: 'MANAGER',
        isActive: true
      }
    });

    if (!manager) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials or account not active' 
      });
    }

    // Check if password exists
    if (!manager.password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password not set. Please contact admin.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, manager.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: manager.id, 
        email: manager.email, 
        role: manager.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: manager.id,
          name: manager.name,
          email: manager.email,
          role: manager.role,
          phone: manager.phone
        }
      }
    });

  } catch (error) {
    console.error('Manager login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed' 
    });
  }
};

const loginDriver = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find driver
    const driver = await prisma.user.findUnique({
      where: { 
        email: email.trim().toLowerCase(),
        role: 'DELIVERY_AGENT',
        isActive: true
      }
    });

    if (!driver) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials or account not active' 
      });
    }

    // Check if password exists
    if (!driver.password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password not set. Please contact admin.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, driver.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: driver.id, 
        email: driver.email, 
        role: driver.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          role: driver.role,
          phone: driver.phone
        }
      }
    });

  } catch (error) {
    console.error('Driver login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed' 
    });
  }
};

const getAdminQuotes = async (req, res) => {
  try {
    const { status, startDate, endDate, search } = req.query;
    
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(endDate);
      }
    }
    
    if (search) {
      whereClause.OR = [
        {
          client: {
            name: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          client: {
            email: {
              contains: search,
              mode: 'insensitive'
            }
          }
        },
        {
          id: {
            contains: search,
            mode: 'insensitive'
          }
        }
      ];
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
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Add lock status information
    const quotesWithLockStatus = quotes.map(quote => {
      const isLocked = quote.lockedById !== null;
      const isLockExpired = quote.lockExpiresAt && new Date() > new Date(quote.lockExpiresAt);
      
      return {
        ...quote,
        lockInfo: {
          isLocked,
          isLockExpired,
          lockedAt: quote.lockedAt,
          lockExpiresAt: quote.lockExpiresAt,
          canTakeOver: isLocked && isLockExpired
        }
      };
    });
    
    res.json({
      success: true,
      data: quotesWithLockStatus,
      count: quotesWithLockStatus.length
    });
  } catch (error) {
    console.error('Get admin quotes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes'
    });
  }
};

/**
 * Get quote statistics for admin dashboard
 */
const getAdminQuoteStats = async (req, res) => {
  try {
    // Get counts by status
    const statusCounts = await prisma.quote.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });
    
    // Get total revenue from approved quotes
    const revenueStats = await prisma.quote.aggregate({
      where: {
        status: 'APPROVED'
      },
      _sum: {
        totalAmount: true
      },
      _count: {
        id: true
      }
    });
    
    // Get monthly quotes for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyQuotes = await prisma.quote.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: sixMonthsAgo
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    // Format monthly data
    const formattedMonthly = monthlyQuotes.map(q => ({
      month: q.createdAt.toISOString().substring(0, 7),
      count: q._count.id
    }));
    
    // Get quotes by manager
    const quotesByManager = await prisma.quote.groupBy({
      by: ['managerId'],
      where: {
        managerId: {
          not: null
        }
      },
      _count: {
        id: true
      },
      _sum: {
        totalAmount: true
      }
    });
    
    // Get manager details
    const managerIds = quotesByManager.map(q => q.managerId);
    const managers = await prisma.user.findMany({
      where: {
        id: { in: managerIds },
        role: 'MANAGER'
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
    
    const managerStats = quotesByManager.map(q => {
      const manager = managers.find(m => m.id === q.managerId);
      return {
        managerId: q.managerId,
        managerName: manager ? manager.name : 'Unknown',
        count: q._count.id,
        totalRevenue: q._sum.totalAmount || 0
      };
    });
    
    res.json({
      success: true,
      data: {
        statusCounts,
        revenue: {
          total: revenueStats._sum.totalAmount || 0,
          average: revenueStats._count.id > 0 ? 
            (revenueStats._sum.totalAmount || 0) / revenueStats._count.id : 0,
          count: revenueStats._count.id
        },
        monthly: formattedMonthly,
        byManager: managerStats,
        totalQuotes: statusCounts.reduce((sum, item) => sum + item._count.id, 0)
      }
    });
  } catch (error) {
    console.error('Get admin quote stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote statistics'
    });
  }
};

/**
 * Get detailed quote information
 */
const getQuoteDetails = async (req, res) => {
  try {
    const { quoteId } = req.params;
    
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
                category: true,
                price: true,
                image: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            hotelName: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
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
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Get quote details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote details'
    });
  }
};

/**
 * Admin delete quote with warning
 */
const adminDeleteQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: 'Please confirm deletion by sending confirm: true in the request body'
      });
    }
    
    console.log(`🗑️ Admin deleting quote: ${quoteId}`);
    
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Delete quote items first
    await prisma.quoteItem.deleteMany({
      where: { quoteId }
    });
    
    // Delete the quote
    await prisma.quote.delete({
      where: { id: quoteId }
    });
    
    console.log(`✅ Admin deleted quote: ${quoteId}`);
    
    res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (error) {
    console.error('Admin delete quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete quote'
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

// ======================== GET USER DETAILS ========================
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch user details' 
    });
  }
};
 
/**
 * Get all quotes for admin
 */
const getAllQuotes = async (req, res) => {
  try {
    const { status, search, startDate, endDate } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    const quotes = await QuoteService.getAllQuotes(filters);
    
    res.json({
      success: true,
      data: quotes,
      count: quotes.length
    });
  } catch (error) {
    console.error('Get all quotes error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch quotes'
    });
  }
};

/**
 * Get pending quotes for admin
 */
const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await QuoteService.getAllPendingQuotes();
    
    res.json({
      success: true,
      data: quotes,
      count: quotes.length
    });
  } catch (error) {
    console.error('Get pending quotes error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch pending quotes'
    });
  }
};

/**
 * Admin delete quote
 */
const deleteQuote = async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    await QuoteService.deleteQuoteByAdmin(quoteId);
    
    res.json({
      success: true,
      message: 'Quote deleted successfully'
    });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete quote'
    });
  }
};

/**
 * Get quote statistics for dashboard
 */
const getQuoteStatistics = async (req, res) => {
  try {
    // Get quotes by status
    const quotes = await prisma.quote.groupBy({
      by: ['status'],
      _count: {
        id: true
      },
      _sum: {
        totalAmount: true
      }
    });
    
    // Get daily quotes for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyQuotes = await prisma.quote.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: sevenDaysAgo
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    // Format daily quotes
    const formattedDaily = dailyQuotes.map(q => ({
      date: q.createdAt.toISOString().split('T')[0],
      count: q._count.id
    }));
    
    res.json({
      success: true,
      data: {
        byStatus: quotes,
        daily: formattedDaily,
        total: {
          count: quotes.reduce((sum, q) => sum + q._count.id, 0),
          revenue: quotes.reduce((sum, q) => sum + (q._sum.totalAmount || 0), 0)
        }
      }
    });
  } catch (error) {
    console.error('Get quote statistics error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch quote statistics'
    });
  }
};


// ======================== EXPORT ========================
// ======================== ADMIN DASHBOARD ENDPOINTS ========================

// Get income card data (total revenue from paid orders)
const getIncomeCard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate);
    } else {
      // Default to last 30 days
      dateFilter.createdAt = {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      };
    }

    // Get all paid orders
    const paidOrders = await prisma.order.findMany({
      where: {
        ...dateFilter,
        status: {
          in: ['PAID_AND_APPROVED', 'IN_TRANSIT', 'DELIVERED']
        },
        payment: {
          status: 'APPROVED'
        }
      },
      include: {
        payment: {
          select: {
            amount: true,
            status: true
          }
        }
      }
    });

    // Calculate total income
    const totalIncome = paidOrders.reduce((sum, order) => {
      return sum + (order.payment?.amount || order.total || 0);
    }, 0);

    // Get today's income
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayOrders = paidOrders.filter(order => 
      new Date(order.createdAt) >= todayStart
    );
    const todayIncome = todayOrders.reduce((sum, order) => {
      return sum + (order.payment?.amount || order.total || 0);
    }, 0);

    // Get this month's income
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthOrders = paidOrders.filter(order => 
      new Date(order.createdAt) >= monthStart
    );
    const monthIncome = monthOrders.reduce((sum, order) => {
      return sum + (order.payment?.amount || order.total || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        totalIncome,
        todayIncome,
        monthIncome,
        totalOrders: paidOrders.length,
        todayOrders: todayOrders.length,
        monthOrders: monthOrders.length
      }
    });
  } catch (error) {
    console.error('Get income card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch income data'
    });
  }
};

// Get product analytics for graphs (most purchased products)
const getProductAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate);
    }

    // Get all order items with product info
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          ...dateFilter,
          status: {
            in: ['PAID_AND_APPROVED', 'IN_TRANSIT', 'DELIVERED']
          }
        }
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            price: true
          }
        },
        order: {
          select: {
            createdAt: true,
            status: true
          }
        }
      }
    });

    // Group by product and calculate totals
    const productMap = new Map();
    
    orderItems.forEach(item => {
      const productId = item.productId;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          productName: item.product?.name || 'Unknown',
          sku: item.product?.sku || '',
          category: item.product?.category || 'Uncategorized',
          totalQuantity: 0,
          totalRevenue: 0,
          orderCount: 0
        });
      }
      
      const productData = productMap.get(productId);
      productData.totalQuantity += item.quantity;
      productData.totalRevenue += item.subtotal;
      productData.orderCount += 1;
    });

    // Convert to array and sort by revenue
    const productAnalytics = Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, parseInt(limit));

    // Get category breakdown
    const categoryMap = new Map();
    orderItems.forEach(item => {
      const category = item.product?.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          totalQuantity: 0,
          totalRevenue: 0,
          productCount: 0
        });
      }
      const catData = categoryMap.get(category);
      catData.totalQuantity += item.quantity;
      catData.totalRevenue += item.subtotal;
    });

    const categoryAnalytics = Array.from(categoryMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({
      success: true,
      data: {
        topProducts: productAnalytics,
        categoryBreakdown: categoryAnalytics,
        totalProducts: productMap.size,
        totalCategories: categoryMap.size
      }
    });
  } catch (error) {
    console.error('Get product analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product analytics'
    });
  }
};

// Get active users count (managers and drivers)
const getActiveUsers = async (req, res) => {
  try {
    const activeManagers = await prisma.user.count({
      where: {
        role: 'MANAGER',
        isActive: true
      }
    });

    const activeDrivers = await prisma.user.count({
      where: {
        role: 'DELIVERY_AGENT',
        isActive: true
      }
    });

    const totalManagers = await prisma.user.count({
      where: { role: 'MANAGER' }
    });

    const totalDrivers = await prisma.user.count({
      where: { role: 'DELIVERY_AGENT' }
    });

    const totalClients = await prisma.user.count({
      where: { role: 'CLIENT' }
    });

    res.json({
      success: true,
      data: {
        activeManagers,
        activeDrivers,
        totalManagers,
        totalDrivers,
        totalClients,
        totalUsers: totalManagers + totalDrivers + totalClients
      }
    });
  } catch (error) {
    console.error('Get active users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
};

// Get order history with filters
const getOrderHistory = async (req, res) => {
  try {
    const { startDate, endDate, status, limit = 50, page = 1 } = req.query;
    
    let whereClause = {};
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = new Date(startDate);
      if (endDate) whereClause.createdAt.lte = new Date(endDate);
    }
    
    if (status) {
      whereClause.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true,
              method: true,
              createdAt: true
            }
          },
          delivery: {
            select: {
              id: true,
              status: true,
              agent: {
                select: {
                  id: true,
                  name: true,
                  phone: true
                }
              }
            }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  category: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.order.count({ where: whereClause })
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get order history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order history'
    });
  }
};
const getDashboardStats = async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    console.log('📊 Fetching dashboard stats for range:', range, 'from', startDate.toISOString());

    // Query User model with role='CLIENT', not Client model
    const [
      totalQuotesCount,
      activeQuotesCount,
      completedQuotesCount,
      totalClientsCount,
      newClientsCount
    ] = await Promise.all([
      prisma.quote.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.quote.count({
        where: {
          status: { in: ['PENDING_PRICING', 'IN_PRICING', 'AWAITING_CLIENT_APPROVAL'] }
        }
      }),
      prisma.quote.count({
        where: {
          status: { in: ['APPROVED', 'CONVERTED_TO_ORDER'] },
          createdAt: { gte: startDate }
        }
      }),
      prisma.user.count({
        where: { role: 'CLIENT' }
      }),
      prisma.user.count({
        where: { 
          role: 'CLIENT',
          createdAt: { gte: startDate } 
        }
      })
    ]);

   // ✅ CORRECT - Filter in JavaScript instead
const allApprovedQuotes = await prisma.quote.findMany({
  where: {
    createdAt: { gte: startDate },
    status: 'APPROVED'
  },
  select: { totalAmount: true }
});

// Filter out null values in JavaScript
const approvedQuotes = allApprovedQuotes.filter(q => q.totalAmount !== null && q.totalAmount !== undefined);

    const totalRevenue = approvedQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);
    const averageQuoteValue = totalQuotesCount > 0 ? totalRevenue / totalQuotesCount : 0;
    const conversionRate = totalQuotesCount > 0 
      ? ((completedQuotesCount / totalQuotesCount) * 100).toFixed(1)
      : 0;

    const stats = {
      totalRevenue: Math.round(totalRevenue),
      totalQuotes: totalQuotesCount,
      activeQuotes: activeQuotesCount,
      completedQuotes: completedQuotesCount,
      conversionRate: parseFloat(conversionRate),
      averageQuoteValue: Math.round(averageQuoteValue),
      totalClients: totalClientsCount,
      newClientsThisMonth: newClientsCount
    };

    console.log('✅ Dashboard stats calculated:', stats);

    return res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Get dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
};
// ============================================
// FIX 2: Get Recent Quotes
// ============================================
const getRecentQuotes = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    console.log('📋 Fetching recent quotes, limit:', limit);

    const quotes = await prisma.quote.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
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
        }
      }
    });

    console.log('✅ Found', quotes.length, 'recent quotes');

    return res.json({
      success: true,
      data: quotes
    });

  } catch (error) {
    console.error('❌ Get recent quotes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent quotes',
      error: error.message
    });
  }
};

// ============================================
// FIX 3: Get Top Performing Managers
// ============================================
const getTopManagers = async (req, res) => {
  try {
    console.log('👥 Fetching top performing managers');

    // ✅ CRITICAL FIX: Query User model with role MANAGER, not Manager model
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER' },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    // Get quotes for each manager
    const managersWithMetrics = await Promise.all(
      managers.map(async (manager) => {
        const quotes = await prisma.quote.findMany({
          where: {
            managerId: manager.id,
            status: {
              in: ['APPROVED', 'CONVERTED_TO_ORDER', 'AWAITING_CLIENT_APPROVAL']
            }
          },
          select: {
            id: true,
            totalAmount: true,
            status: true
          }
        });

        const totalQuotes = quotes.length;
        const revenueGenerated = quotes.reduce((sum, quote) => 
          sum + (quote.totalAmount || 0), 0
        );
        const approvedQuotes = quotes.filter(q => 
          q.status === 'APPROVED' || q.status === 'CONVERTED_TO_ORDER'
        ).length;
        const conversionRate = totalQuotes > 0 
          ? Math.round((approvedQuotes / totalQuotes) * 100)
          : 0;

        return {
          id: manager.id,
          name: manager.name,
          email: manager.email,
          revenueGenerated,
          quotesCompleted: approvedQuotes,
          totalQuotes,
          conversionRate
        };
      })
    );

    // Sort by revenue and take top 5
    const topManagers = managersWithMetrics
      .sort((a, b) => b.revenueGenerated - a.revenueGenerated)
      .slice(0, 5);

    console.log('✅ Top managers calculated:', topManagers.length);

    return res.json({
      success: true,
      data: topManagers
    });

  } catch (error) {
    console.error('❌ Get top managers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch top managers',
      error: error.message
    });
  }
};
// ============================================
// FIX 5: Get Recent Activity
// ============================================
const getRecentActivity = async (req, res) => {
  try {
    console.log('📋 Fetching recent activity');

    // ✅ FIXED: Only call res.json() once
    const activities = await prisma.activity.findMany({
      take: 10,
      orderBy: {
        timestamp: 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    console.log('✅ Found', activities.length, 'recent activities');

    // Return response only once
    return res.json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('❌ Get recent activity error:', error);
    
    // ✅ FIXED: Check if headers already sent before responding
    if (res.headersSent) {
      console.error('⚠️ Headers already sent, cannot send error response');
      return;
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error.message
    });
  }
};

/**
 * Export data in CSV format
 */
const exportData = async (req, res) => {
  try {
    const { type } = req.params;
    
    switch (type) {
      case 'quotes':
        const quotes = await prisma.quote.findMany({
          include: {
            client: {
              select: { name: true, email: true }
            },
            manager: {
              select: { name: true }
            }
          }
        });
        
        // Convert to CSV
        const csvQuotes = convertToCSV(quotes);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=quotes_export.csv');
        return res.send(csvQuotes);
        
      case 'orders':
        const orders = await prisma.order.findMany({
          include: {
            client: {
              select: { name: true, email: true }
            }
          }
        });
        
        const csvOrders = convertToCSV(orders);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');
        return res.send(csvOrders);
        
      case 'reports':
        // Generate comprehensive report
        const report = await generateSystemReport(req);
        const csvReport = convertToCSV(report.data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=full_report.csv');
        return res.send(csvReport);
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid export type. Use: quotes, orders, or reports'
        });
    }
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to export data' 
    });
  }
};

// ============================================
// COMPLETE getRevenueTrend Function
// ============================================

const getRevenueTrend = async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    
    console.log('📈 Fetching revenue trend for range:', range);

    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // ✅ FIX: Use 'total' for Order, 'totalAmount' for Quote
    const [quotes, orders] = await Promise.all([
      prisma.quote.findMany({
        where: {
          createdAt: { gte: startDate },
          status: 'APPROVED'
        },
        select: {
          createdAt: true,
          totalAmount: true
        }
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        select: {
          createdAt: true,
          total: true  // ✅ FIXED
        }
      })
    ]);

    // Group data by day for the past week
    const trendData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayQuotes = quotes.filter(q => {
        const qDate = new Date(q.createdAt);
        return qDate >= date && qDate < nextDate;
      });
      
      const dayOrders = orders.filter(o => {
        const oDate = new Date(o.createdAt);
        return oDate >= date && oDate < nextDate;
      });
      
      const quoteRevenue = dayQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);
      const orderRevenue = dayOrders.reduce((sum, o) => sum + (o.total || 0), 0);  // ✅ FIXED
      
      trendData.push({
        label: daysOfWeek[date.getDay()],
        date: date.toISOString(),
        quoteRevenue,
        orderRevenue,
        type: 'revenue'
      });
    }

    console.log('✅ Revenue trend calculated:', trendData.length, 'data points');

    return res.json({
      success: true,
      data: trendData
    });

  } catch (error) {
    console.error('❌ Get revenue trend error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue trend',
      error: error.message
    });
  }
};
// Helper function to get date range
function getDateRange(range) {
  const now = new Date();
  switch (range) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case 'quarter':
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

// Helper function to get day label
function getDayLabel(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  // Extract headers from first object
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      
      // Handle dates
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // Handle nested objects
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value).replace(/,/g, ';');
      }
      
      // Handle strings with commas
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      
      return value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

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
  uploadMultipleProductImages,
  testCloudinaryConfig,
  resetUserPassword,
  deleteManager,
  deleteDriver,
  loginManager,
  loginDriver,
  getUserDetails,
  cleanupOrphanedQuotes,
  viewOrphanedQuotes,
  getAllQuotes,
  getPendingQuotes,
  deleteQuote,
  adminDeleteQuote,
  getQuoteStatistics,
  getAdminQuotes,
  getAdminQuoteStats,
  getQuoteDetails,
  getIncomeCard,
  getProductAnalytics,
  getActiveUsers,
  getOrderHistory,
  getDashboardStats,
  getRecentQuotes,
  getTopManagers,
  getRevenueTrend,
  getRecentActivity,
  exportData
};