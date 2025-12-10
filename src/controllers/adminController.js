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


// Configure Cloudinary
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
  deleteDriver,
  loginManager,
  loginDriver,
  getUserDetails,
  cleanupOrphanedQuotes,
  viewOrphanedQuotes,
  getAllQuotes,
  getPendingQuotes,
  deleteQuote,
  getQuoteStatistics
};