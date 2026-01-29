const express = require('express');
const router = express.Router();
const multer = require('multer');
const productWishController = require('../controllers/productWishController');
const { authenticateToken, requireClient, requireAdmin, authorize } = require('../middlewares/auth');

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// CLIENT ROUTES
router.post(
  '/submit',
  authenticateToken,
  authorize('CLIENT'),
  upload.single('image'),
  productWishController.submitProductWish
);

router.get(
  '/my-wishes',
  authenticateToken,
  authorize('CLIENT'),
  productWishController.getMyProductWishes
);

router.get(
  '/my-booked-products',
  authenticateToken,
  authorize('CLIENT'),
  productWishController.getMyBookedProducts
);

router.post(
  '/:wishId/start-discussion',
  authenticateToken,
  authorize('CLIENT'),
  productWishController.startWhatsAppDiscussion
);

// ADMIN ROUTES
router.get(
  '/all',
  authenticateToken,
  requireAdmin,
  productWishController.getAllProductWishes
);

router.post(
  '/:wishId/approve',
  authenticateToken,
  requireAdmin,
  productWishController.approveProductWish
);

router.post(
  '/:wishId/reject',
  authenticateToken,
  requireAdmin,
  productWishController.rejectProductWish
);

router.post(
  '/:wishId/create-product',
  authenticateToken,
  requireAdmin,
  productWishController.createBookedProduct
);

module.exports = router;