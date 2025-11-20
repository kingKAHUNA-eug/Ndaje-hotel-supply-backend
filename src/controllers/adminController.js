// controllers/adminController.js
const { z } = require('zod');
const AdminReportService = require('../services/adminReportService');
const { prisma } = require('../config/prisma'); // ← Use Prisma, not Mongoose models

// Validation schemas
const reportFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional()
});

// ======================== YOUR ORIGINAL CODE ========================
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
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
    }
    console.error('Generate system report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
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
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
    }
    console.error('Export report to CSV error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
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
      return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
    }
    console.error('Get dashboard summary error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// ======================== REAL ENDPOINTS WITH PRISMA ========================

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
        status: true,
        createdAt: true
      }
    });
    res.json({ success: true, data: managers });
  } catch (err) {
    console.error('Get all managers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all drivers
const getAllDrivers = async (req, res) => {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: 'DELIVERY_AGENT' }, // ← Use DELIVERY_AGENT, not DRIVER
      select: {
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true
      }
    });
    res.json({ success: true, data: drivers });
  } catch (err) {
    console.error('Get all drivers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all real orders (approved quotes)
const getAllOrders = async (req, res) => {
  try {
    const orders = await prisma.quote.findMany({
      where: { status: 'approved' },
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
      orderBy: { updatedAt: 'desc' }
    });

    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Get all orders error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// REPLACE ONLY THIS FUNCTION IN adminController.js
const createManager = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // REQUIRED FIELDS ONLY
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and phone are required'
      });
    }

    // Create manager — NO PASSWORD NEEDED (they'll use Google login or reset later)
    const manager = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role: 'MANAGER',
        firebaseUid: null,
        emailVerified: true,
        status: 'active'
      }
    });

    // Return safe user (no password field)
    const { password: _, ...safeManager } = manager;

    return res.json({
      success: true,
      message: 'Manager created successfully!',
      data: { user: safeManager }
    });

  } catch (err) {
    console.error('Create manager error:', err);

    if (err.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create manager'
    });
  }
};
// CREATE driver
const createDriver = async (req, res) => {
  const { name, email, phone, vehicle, password } = req.body;

  if (!name || !email || !phone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name, email and phone are required' 
    });
  }

  try {
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(
      password || Math.random().toString(36).slice(-8) + 'A1!', 
      10
    );

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password: hashedPassword,
        role: 'DELIVERY_AGENT',
        status: 'active',
        emailVerified: true
        // Note: If you have a 'vehicle' field in your schema, add it here
      }
    });

    const { password: _, ...safeUser } = user;
    res.json({ success: true, data: { user: safeUser } });
  } catch (err) {
    console.error('Create driver error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ======================== EXPORT ALL ========================
module.exports = {
  generateSystemReport,
  exportReportToCSV,
  getDashboardSummary,
  getAllManagers,
  getAllDrivers,
  getAllOrders,
  createManager,
  createDriver
};