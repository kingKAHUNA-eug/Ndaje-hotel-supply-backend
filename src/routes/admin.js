// routes/admin.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const {
  getAllManagers,
  getAllDrivers,
  createManager,
  createDriver,
  getAllOrders,
  getDashboardSummary,
  generateSystemReport,
  exportReportToCSV
} = require('../controllers/adminController');

// Apply auth + admin check to ALL routes
router.use(authenticateToken);
router.use(requireAdmin);

// ========== CRITICAL ENDPOINTS (THESE MAKE NDAJE REAL) ==========
router.get('/managers', getAllManagers);
router.get('/drivers', getAllDrivers);
router.get('/orders', getAllOrders);

router.post('/create-manager', createManager);
router.post('/create-driver', createDriver);

// Your old report routes (keep them)
router.get('/dashboard/summary', getDashboardSummary);
router.get('/reports/system', generateSystemReport);
router.get('/reports/export/csv', exportReportToCSV);

module.exports = router;