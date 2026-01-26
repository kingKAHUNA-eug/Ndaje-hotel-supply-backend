const { prisma } = require('../index');

class ActivityService {
  /**
   * Log a system activity
   * @param {Object} params - Activity parameters
   * @param {string} params.type - Activity type
   * @param {string} params.description - Activity description
   * @param {string} params.userId - User ID who performed the action (optional)
   * @param {Object} params.metadata - Additional data (optional)
   */
  static async logActivity({ type, description, userId = null, metadata = {} }) {
    try {
      const activity = await prisma.activity.create({
        data: {
          type,
          description,
          userId,
          metadata
        }
      });
      
      console.log(`📝 Activity logged: ${type} - ${description}`);
      return activity;
    } catch (error) {
      console.error('Failed to log activity:', error);
      return null;
    }
  }

  /**
   * Get recent activities
   * @param {number} limit - Number of activities to return
   * @returns {Array} Recent activities
   */
  static async getRecentActivities(limit = 10) {
    try {
      const activities = await prisma.activity.findMany({
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      return activities;
    } catch (error) {
      console.error('Failed to get recent activities:', error);
      return [];
    }
  }

  /**
   * Log quote creation activity
   * @param {string} quoteId - Quote ID
   * @param {string} clientId - Client ID
   * @param {string} userId - User ID who created it (if any)
   */
  static async logQuoteCreated(quoteId, clientId, userId = null) {
    return this.logActivity({
      type: 'quote',
      description: `New quote #${quoteId.slice(-8)} created`,
      userId,
      metadata: { quoteId, clientId }
    });
  }

  /**
   * Log quote status change
   * @param {string} quoteId - Quote ID
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {string} userId - User ID who changed it
   */
  static async logQuoteStatusChange(quoteId, oldStatus, newStatus, userId) {
    return this.logActivity({
      type: 'quote',
      description: `Quote #${quoteId.slice(-8)} status changed from ${oldStatus} to ${newStatus}`,
      userId,
      metadata: { quoteId, oldStatus, newStatus }
    });
  }

  /**
   * Log order creation
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @param {number} amount - Order amount
   * @param {string} userId - User ID
   */
  static async logOrderCreated(orderId, clientId, amount, userId) {
    return this.logActivity({
      type: 'order',
      description: `New order #${orderId.slice(-8)} created for RWF ${amount.toLocaleString()}`,
      userId,
      metadata: { orderId, clientId, amount }
    });
  }

  /**
   * Log user creation
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @param {string} role - User role
   * @param {string} adminId - Admin ID who created it
   */
  static async logUserCreated(userId, email, role, adminId) {
    return this.logActivity({
      type: 'user',
      description: `New ${role.toLowerCase()} account created for ${email}`,
      userId: adminId,
      metadata: { userId, email, role }
    });
  }

  /**
   * Log payment activity
   * @param {string} paymentId - Payment ID
   * @param {string} orderId - Order ID
   * @param {number} amount - Payment amount
   * @param {string} status - Payment status
   * @param {string} userId - User ID
   */
  static async logPayment(paymentId, orderId, amount, status, userId) {
    return this.logActivity({
      type: 'payment',
      description: `Payment ${status.toLowerCase()} for order #${orderId.slice(-8)} - RWF ${amount.toLocaleString()}`,
      userId,
      metadata: { paymentId, orderId, amount, status }
    });
  }

  /**
   * Log delivery activity
   * @param {string} deliveryId - Delivery ID
   * @param {string} orderId - Order ID
   * @param {string} status - Delivery status
   * @param {string} userId - User ID (driver or manager)
   */
  static async logDelivery(deliveryId, orderId, status, userId) {
    return this.logActivity({
      type: 'delivery',
      description: `Delivery #${deliveryId.slice(-8)} for order #${orderId.slice(-8)} marked as ${status}`,
      userId,
      metadata: { deliveryId, orderId, status }
    });
  }

  /**
   * Log system activity
   * @param {string} description - Activity description
   * @param {Object} metadata - Additional data
   */
  static async logSystem(description, metadata = {}) {
    return this.logActivity({
      type: 'system',
      description,
      metadata
    });
  }
}

module.exports = ActivityService;