// routes/notification.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const NotificationController = require('../controllers/notificationController');

router.use(authenticateToken);

router.get('/', NotificationController.getNotifications);
router.get('/count', NotificationController.getNotificationCount);
router.put('/:id/read', NotificationController.markAsRead);
router.put('/read-all', NotificationController.markAllAsRead);

module.exports = router;