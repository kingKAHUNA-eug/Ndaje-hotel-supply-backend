const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const adminController = require('../controllers/adminController'); // IMPORT THE CONTROLLER

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
router.get('/test-cloudinary', adminController.testCloudinaryConfig);
router.get('/managers', adminController.getAllManagers);
router.get('/drivers', adminController.getAllDrivers);
router.get('/orders', adminController.getAllOrders);

router.post('/create-manager', adminController.createManager);
router.post('/create-driver', adminController.createDriver);

router.post('/upload/product-image', upload.single('image'), adminController.uploadProductImage);

// ========== QUOTE MANAGEMENT ROUTES ==========
router.get('/quotes', adminController.getAllQuotes);
router.get('/quotes/pending', adminController.getPendingQuotes);
router.delete('/quotes/:quoteId', adminController.deleteQuote);
router.get('/quotes/statistics', adminController.getQuoteStatistics);

router.get('/quotes/orphaned', adminController.viewOrphanedQuotes);
router.post('/quotes/cleanup', adminController.cleanupOrphanedQuotes);

// ========== DASHBOARD & REPORTS ==========
router.get('/dashboard/summary', adminController.getDashboardSummary);
router.get('/dashboard/income', adminController.getIncomeCard);
router.get('/dashboard/products', adminController.getProductAnalytics);
router.get('/dashboard/users', adminController.getActiveUsers);
router.get('/dashboard/orders', adminController.getOrderHistory);
router.get('/reports/system', adminController.generateSystemReport);
router.get('/reports/export/csv', adminController.exportReportToCSV);

// ========== USER MANAGEMENT ==========
router.post('/reset-password/:userId', adminController.resetUserPassword);
router.delete('/managers/:id', adminController.deleteManager);
router.delete('/drivers/:id', adminController.deleteDriver);
router.get('/user/:userId', adminController.getUserDetails);

module.exports = router;