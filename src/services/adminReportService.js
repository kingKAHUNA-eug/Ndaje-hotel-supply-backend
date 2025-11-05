const prisma = require('../config/prisma');

class AdminReportService {
  /**
   * Generate comprehensive system report
   * @param {Object} filters - Report filters
   * @returns {Object} Complete system report
   */
  static async generateSystemReport(filters = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        endDate = new Date(),
        status = null
      } = filters;

      // Get all orders in the date range
      const orders = await prisma.order.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          },
          ...(status && { status })
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          payment: true,
          delivery: {
            include: {
              agent: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  category: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate statistics
      const stats = this.calculateOrderStatistics(orders);
      
      // Get user statistics
      const userStats = await this.getUserStatistics();
      
      // Get product statistics
      const productStats = await this.getProductStatistics(startDate, endDate);
      
      // Get delivery statistics
      const deliveryStats = await this.getDeliveryStatistics(startDate, endDate);
      
      // Get payment statistics
      const paymentStats = await this.getPaymentStatistics(startDate, endDate);

      return {
        reportPeriod: {
          startDate,
          endDate,
          generatedAt: new Date()
        },
        summary: {
          totalOrders: orders.length,
          totalRevenue: stats.totalRevenue,
          averageOrderValue: stats.averageOrderValue,
          completionRate: stats.completionRate
        },
        orderStatistics: stats,
        userStatistics: userStats,
        productStatistics: productStats,
        deliveryStatistics: deliveryStats,
        paymentStatistics: paymentStats,
        detailedOrders: orders.map(order => this.formatOrderForReport(order))
      };
    } catch (error) {
      console.error('AdminReportService.generateSystemReport error:', error);
      throw error;
    }
  }

  /**
   * Calculate order statistics
   * @param {Array} orders - Array of orders
   * @returns {Object} Order statistics
   */
  static calculateOrderStatistics(orders) {
    const totalOrders = orders.length;
    const completedOrders = orders.filter(order => order.status === 'DELIVERED').length;
    const totalRevenue = orders
      .filter(order => order.payment?.status === 'CONFIRMED')
      .reduce((sum, order) => sum + order.total, 0);
    
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Status breakdown
    const statusBreakdown = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    // Revenue by status
    const revenueByStatus = orders.reduce((acc, order) => {
      const status = order.status;
      const revenue = order.payment?.status === 'CONFIRMED' ? order.total : 0;
      acc[status] = (acc[status] || 0) + revenue;
      return acc;
    }, {});

    return {
      totalOrders,
      completedOrders,
      totalRevenue,
      averageOrderValue,
      completionRate,
      statusBreakdown,
      revenueByStatus
    };
  }

  /**
   * Get user statistics
   * @returns {Object} User statistics
   */
  static async getUserStatistics() {
    try {
      const users = await prisma.user.findMany({
        select: {
          role: true,
          isActive: true,
          createdAt: true
        }
      });

      const roleBreakdown = users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {});

      const activeUsers = users.filter(user => user.isActive).length;
      const inactiveUsers = users.length - activeUsers;

      return {
        totalUsers: users.length,
        activeUsers,
        inactiveUsers,
        roleBreakdown
      };
    } catch (error) {
      console.error('AdminReportService.getUserStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get product statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Product statistics
   */
  static async getProductStatistics(startDate, endDate) {
    try {
      // Get all products
      const products = await prisma.product.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          price: true
        }
      });

      // Get order items in date range
      const orderItems = await prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: {
              gte: startDate,
              lte: endDate
            }
          }
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        }
      });

      // Calculate product popularity
      const productPopularity = orderItems.reduce((acc, item) => {
        const productId = item.productId;
        if (!acc[productId]) {
          acc[productId] = {
            product: item.product,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0
          };
        }
        acc[productId].totalQuantity += item.quantity;
        acc[productId].totalRevenue += item.subtotal;
        acc[productId].orderCount += 1;
        return acc;
      }, {});

      // Category breakdown
      const categoryBreakdown = orderItems.reduce((acc, item) => {
        const category = item.product.category;
        acc[category] = (acc[category] || 0) + item.quantity;
        return acc;
      }, {});

      return {
        totalProducts: products.length,
        categoryBreakdown,
        productPopularity: Object.values(productPopularity)
          .sort((a, b) => b.totalQuantity - a.totalQuantity)
          .slice(0, 10) // Top 10 products
      };
    } catch (error) {
      console.error('AdminReportService.getProductStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get delivery statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Delivery statistics
   */
  static async getDeliveryStatistics(startDate, endDate) {
    try {
      const deliveries = await prisma.delivery.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const totalDeliveries = deliveries.length;
      const completedDeliveries = deliveries.filter(d => d.status === 'MANAGER_CONFIRMED').length;
      const averageDeliveryTime = this.calculateAverageDeliveryTime(deliveries);

      // Agent performance
      const agentPerformance = deliveries.reduce((acc, delivery) => {
        const agentId = delivery.agentId;
        if (!acc[agentId]) {
          acc[agentId] = {
            agent: delivery.agent,
            totalDeliveries: 0,
            completedDeliveries: 0,
            averageTime: 0
          };
        }
        acc[agentId].totalDeliveries += 1;
        if (delivery.status === 'MANAGER_CONFIRMED') {
          acc[agentId].completedDeliveries += 1;
        }
        return acc;
      }, {});

      return {
        totalDeliveries,
        completedDeliveries,
        completionRate: totalDeliveries > 0 ? (completedDeliveries / totalDeliveries) * 100 : 0,
        averageDeliveryTime,
        agentPerformance: Object.values(agentPerformance)
      };
    } catch (error) {
      console.error('AdminReportService.getDeliveryStatistics error:', error);
      throw error;
    }
  }

  /**
   * Get payment statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Payment statistics
   */
  static async getPaymentStatistics(startDate, endDate) {
    try {
      const payments = await prisma.payment.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const totalPayments = payments.length;
      const successfulPayments = payments.filter(p => p.status === 'CONFIRMED').length;
      const totalRevenue = payments
        .filter(p => p.status === 'CONFIRMED')
        .reduce((sum, p) => sum + p.amount, 0);

      const statusBreakdown = payments.reduce((acc, payment) => {
        acc[payment.status] = (acc[payment.status] || 0) + 1;
        return acc;
      }, {});

      return {
        totalPayments,
        successfulPayments,
        successRate: totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0,
        totalRevenue,
        statusBreakdown
      };
    } catch (error) {
      console.error('AdminReportService.getPaymentStatistics error:', error);
      throw error;
    }
  }

  /**
   * Calculate average delivery time
   * @param {Array} deliveries - Array of deliveries
   * @returns {number} Average delivery time in hours
   */
  static calculateAverageDeliveryTime(deliveries) {
    const completedDeliveries = deliveries.filter(d => 
      d.actualDelivery && d.createdAt
    );

    if (completedDeliveries.length === 0) return 0;

    const totalTime = completedDeliveries.reduce((sum, delivery) => {
      const timeDiff = delivery.actualDelivery.getTime() - delivery.createdAt.getTime();
      return sum + timeDiff;
    }, 0);

    return totalTime / completedDeliveries.length / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Format order for report
   * @param {Object} order - Order object
   * @returns {Object} Formatted order
   */
  static formatOrderForReport(order) {
    return {
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      client: order.client,
      manager: order.manager,
      paymentStatus: order.payment?.status || 'N/A',
      deliveryStatus: order.delivery?.status || 'N/A',
      deliveryAgent: order.delivery?.agent || null,
      itemCount: order.items.length,
      items: order.items.map(item => ({
        product: item.product,
        quantity: item.quantity,
        subtotal: item.subtotal
      }))
    };
  }

  /**
   * Export report to CSV format
   * @param {Object} report - System report
   * @returns {string} CSV formatted report
   */
  static exportToCSV(report) {
    const headers = [
      'Order ID',
      'Status',
      'Total Amount',
      'Client Name',
      'Client Email',
      'Manager Name',
      'Payment Status',
      'Delivery Status',
      'Delivery Agent',
      'Created At',
      'Item Count'
    ];

    const rows = report.detailedOrders.map(order => [
      order.id,
      order.status,
      order.total,
      order.client.name,
      order.client.email,
      order.manager?.name || 'N/A',
      order.paymentStatus,
      order.deliveryStatus,
      order.deliveryAgent?.name || 'N/A',
      order.createdAt.toISOString(),
      order.itemCount
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }
}

module.exports = AdminReportService;
