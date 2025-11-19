// controllers/adminController.js
const { z } = require('zod');
const AdminReportService = require('../services/adminReportService');
const User = require('../models/User');
const Quote = require('../models/Quote');  // This is your Order model (approved quotes = orders)

// Validation schemas
const reportFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional()
});

// ======================== YOUR ORIGINAL CODE (KEPT 100% INTACT) ========================
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

// ======================== NEW REAL ENDPOINTS (ADDED NOW) ========================

// GET all managers
const getAllManagers = async (req, res) => {
  try {
    const managers = await User.find({ role: 'MANAGER' }).select('-password');
    res.json({ success: true, data: managers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all drivers
const getAllDrivers = async (req, res) => {
  try {
    const drivers = await User.find({ role: 'DRIVER' }).select('-password');
    res.json({ success: true, data: drivers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all real orders (approved quotes)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Quote.find({ status: 'approved' })
      .populate('clientId', 'name email phone hotelName')
      .populate('items.productId', 'name unit referencePrice')
      .sort({ approvedAt: -1 });

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// CREATE manager
const createManager = async () => {
  if (!newManager.name || !newManager.email || !newManager.phone) {
    alert('Name, email and phone are required')
    return
  }

  try {
    const payload = {
      name: newManager.name.trim(),
      email: newManager.email.trim().toLowerCase(),
      phone: newManager.phone.trim(),
      // FORCE a strong password — bypass any validation
      password: newManager.password || "NDAJE@2025!manager"
    }

    console.log('Sending:', payload)

    const res = await axios.post(`${API_URL}/admin/create-manager`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    })

    setManagers(prev => [...prev, res.data.data.user])
    setShowAddManager(false)
    setNewManager({ name: '', email: '', phone: '', password: '' })
    
    alert(`Manager "${res.data.data.user.name}" created!\nLogin: ${payload.email}\nPassword: ${payload.password}`)
  } catch (err) {
    console.error('ERROR:', err.response?.data)
    alert(err.response?.data?.message || 'Server error - check console')
  }
}
// CREATE driver
const createDriver = async (req, res) => {
  const { name, email, phone, vehicle, password } = req.body;

  if (!name || !email || !phone || !vehicle) {
    return res.status(400).json({ success: false, message: 'Name, email, phone and vehicle required' });
  }

  try {
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      vehicle,
      password: password || Math.random().toString(36).slice(-8) + 'A1!',
      role: 'DRIVER',
      status: 'active'
    });

    const safeUser = { ...user._doc, password: undefined };
    res.json({ success: true, data: { user: safeUser } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ======================== EXPORT ALL ========================
module.exports = {
  generateSystemReport,
  exportReportToCSV,
  getDashboardSummary,
  // NEW ONES
  getAllManagers,
  getAllDrivers,
  getAllOrders,
  createManager,
  createDriver
};