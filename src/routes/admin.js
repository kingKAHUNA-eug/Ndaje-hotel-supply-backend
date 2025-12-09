// routes/admin.js — FINAL VERSION — FULL CONTROL ACHIEVED
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const {
  getAllManagers,
  getAllDrivers,
  createManager,
  createDriver,
  getAllOrders,
  getDashboardSummary,
  generateSystemReport,
  exportReportToCSV,
  uploadProductImage,
  testCloudinaryConfig,
  // NEW: IMPORT THESE FROM CONTROLLER
  resetUserPassword,
  deleteManager,
  deleteDriver,
  cleanupOrphanedQuotes,
  viewOrphanedQuotes
} = require('../controllers/adminController');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// PROTECT ALL ROUTES — ADMIN ONLY
router.use(authenticateToken);
router.use(requireAdmin);

// ========== EXISTING ROUTES (KEEP THEM) ==========
router.get('/test-cloudinary', testCloudinaryConfig);
router.get('/managers', getAllManagers);
router.get('/drivers', getAllDrivers);
router.get('/orders', getAllOrders);

router.post('/create-manager', createManager);
router.post('/create-driver', createDriver);

router.post('/upload/product-image', upload.single('image'), uploadProductImage);

router.get('/quotes/orphaned', viewOrphanedQuotes);
router.post('/quotes/cleanup', cleanupOrphanedQuotes);

router.get('/dashboard/summary', getDashboardSummary);
router.get('/reports/system', generateSystemReport);
router.get('/reports/export/csv', exportReportToCSV);

// ========== NEW: TOTAL CONTROL ENDPOINTS ==========
router.post('/reset-password/:userId', resetUserPassword);     // Reset any user's password
router.delete('/managers/:id', deleteManager);                 // Delete manager
router.delete('/drivers/:id', deleteDriver);                   // Delete driver

module.exports = router;