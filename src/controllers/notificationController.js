// controllers/notificationController.js
const NotificationService = require('../services/notificationService');

class NotificationController {
  // Get notifications for current user
  static async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await NotificationService.getUnreadNotifications(userId);
      
      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }
  
  // Get notification count
  static async getNotificationCount(req, res) {
    try {
      const userId = req.user.id;
      const count = await NotificationService.getNotificationCount(userId);
      
      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Get notification count error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notification count'
      });
    }
  }
  
  // Mark notification as read
  static async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const notification = await NotificationService.markAsRead(id, userId);
      
      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  }
  
  // Mark all notifications as read
  static async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      
      await NotificationService.markAllAsRead(userId);
      
      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read'
      });
    }
  }
}

module.exports = NotificationController;