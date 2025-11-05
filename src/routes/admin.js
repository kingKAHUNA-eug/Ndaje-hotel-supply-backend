const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const {
  generateSystemReport,
  exportReportToCSV,
  getDashboardSummary
} = require('../controllers/adminController');

// Apply authentication to all routes
router.use(authenticateToken);

// All admin routes require admin role
router.use(requireAdmin);

// Report routes
router.get('/reports/system', generateSystemReport);
router.get('/reports/export/csv', exportReportToCSV);
router.get('/dashboard/summary', getDashboardSummary);

module.exports = router;