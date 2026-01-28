const express = require('express');
const router = express.Router();
const multer = require('multer');
const productWishController = require('../controllers/productWishController');
const { authenticateToken, requireRole } = require('../middleware/auth');

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
  requireRole(['CLIENT']),
  upload.single('image'),
  productWishController.submitProductWish
);

router.get(
  '/my-wishes',
  authenticateToken,
  requireRole(['CLIENT']),
  productWishController.getMyProductWishes
);

router.get(
  '/my-booked-products',
  authenticateToken,
  requireRole(['CLIENT']),
  productWishController.getMyBookedProducts
);

router.post(
  '/:wishId/start-discussion',
  authenticateToken,
  requireRole(['CLIENT']),
  productWishController.startWhatsAppDiscussion
);

// ADMIN ROUTES
router.get(
  '/all',
  authenticateToken,
  requireRole(['ADMIN']),
  productWishController.getAllProductWishes
);

router.post(
  '/:wishId/approve',
  authenticateToken,
  requireRole(['ADMIN']),
  productWishController.approveProductWish
);

router.post(
  '/:wishId/reject',
  authenticateToken,
  requireRole(['ADMIN']),
  productWishController.rejectProductWish
);

router.post(
  '/:wishId/create-product',
  authenticateToken,
  requireRole(['ADMIN']),
  productWishController.createBookedProduct
);

module.exports = router;