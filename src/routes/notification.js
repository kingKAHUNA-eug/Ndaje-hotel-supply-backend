// routes/notification.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const NotificationController = require('../controllers/notificationController');

// Protect all notification routes
router.use(authenticateToken);

// Get user notifications
router.get('/', NotificationController.getNotifications);

// Get notification count
router.get('/count', NotificationController.getNotificationCount);

// Mark notification as read
router.put('/:id/read', NotificationController.markAsRead);

// Mark all notifications as read
router.put('/read-all', NotificationController.markAllAsRead);

module.exports = router;