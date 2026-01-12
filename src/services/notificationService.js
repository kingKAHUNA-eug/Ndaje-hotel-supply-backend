// services/notificationService.js
const prisma = require('../config/prisma');

class NotificationService {
  static async createNotification(userId, title, message, type = 'INFO', link = null) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type,
          link,
          read: false
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      throw error;
    }
  }
  
  static async getUnreadNotifications(userId) {
    try {
      const notifications = await prisma.notification.findMany({
        where: {
          userId,
          read: false
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      
      return notifications;
    } catch (error) {
      console.error('Get unread notifications error:', error);
      throw error;
    }
  }
  
  static async markAsRead(notificationId, userId) {
    try {
      // First verify the notification belongs to the user
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: userId
        }
      });

      if (!notification) {
        throw new Error('Notification not found or access denied');
      }

      // Then update it
      const updated = await prisma.notification.update({
        where: {
          id: notificationId
        },
        data: {
          read: true,
          readAt: new Date()
        }
      });
      
      return updated;
    } catch (error) {
      console.error('Mark as read error:', error);
      throw error;
    }
  }
  
  static async markAllAsRead(userId) {
    try {
      await prisma.notification.updateMany({
        where: {
          userId,
          read: false
        },
        data: {
          read: true,
          readAt: new Date()
        }
      });
      
      return { success: true };
    } catch (error) {
      console.error('Mark all as read error:', error);
      throw error;
    }
  }
  
  static async getNotificationCount(userId) {
    try {
      const count = await prisma.notification.count({
        where: {
          userId,
          read: false
        }
      });
      
      return count;
    } catch (error) {
      console.error('Get notification count error:', error);
      throw error;
    }
  }
  
  // Quote related notifications
  static async notifyNewQuote(quoteId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          client: true
        }
      });
      
      if (!quote) return;
      
      // Get all managers
      const managers = await prisma.user.findMany({
        where: { role: 'MANAGER' }
      });
      
      // Create notifications for each manager
      for (const manager of managers) {
        await this.createNotification(
          manager.id,
          'New Quote Available',
          `New quote from ${quote.client.name} is available for pricing`,
          'QUOTE',
          `/manager/quotes/${quoteId}`
        );
      }
    } catch (error) {
      console.error('Notify new quote error:', error);
    }
  }
  
  static async notifyQuoteLocked(quoteId, managerId) {
    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId }
      });
      
      if (!quote) return;
      
      // Notify admin
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' }
      });
      
      for (const admin of admins) {
        await this.createNotification(
          admin.id,
          'Quote Locked',
          `Quote ${quoteId.substring(0, 8)} has been locked for pricing`,
          'QUOTE',
          `/admin/quotes/${quoteId}`
        );
      }
    } catch (error) {
      console.error('Notify quote locked error:', error);
    }
  }
  
  static async notifyDeliveryAssigned(deliveryId, driverId) {
    try {
      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          order: {
            include: {
              client: true
            }
          }
        }
      });
      
      if (!delivery) return;
      
      // Notify driver
      await this.createNotification(
        driverId,
        'New Delivery Assigned',
        `You have been assigned a new delivery for order ${delivery.orderId.substring(0, 8)}`,
        'DELIVERY',
        `/driver/deliveries/${deliveryId}`
      );
      
      // Notify client
      await this.createNotification(
        delivery.order.clientId,
        'Delivery Agent Assigned',
        `A delivery agent has been assigned to your order. You can track your delivery.`,
        'DELIVERY',
        `/tracking/${delivery.orderId}`
      );
    } catch (error) {
      console.error('Notify delivery assigned error:', error);
    }
  }
}

module.exports = NotificationService;