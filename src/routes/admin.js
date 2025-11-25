// routes/admin.js
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
  uploadProductImage
} = require('../controllers/adminController');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Apply auth + admin check to ALL routes
router.use(authenticateToken);
router.use(requireAdmin);

// ========== CRITICAL ENDPOINTS (THESE MAKE NDAJE REAL) ==========
router.get('/managers', getAllManagers);
router.get('/drivers', getAllDrivers);
router.get('/orders', getAllOrders);

router.post('/create-manager', createManager);
router.post('/create-driver', createDriver);

router.post('/upload/product-image', upload.single('image'), uploadProductImage);

// Your old report routes (keep them)
router.get('/dashboard/summary', getDashboardSummary);
router.get('/reports/system', generateSystemReport);
router.get('/reports/export/csv', exportReportToCSV);

module.exports = router;