// controllers/driverController.js - COMPLETE DRIVER DASHBOARD
const { prisma } = require('../config/prisma');

class DriverController {
  // Get driver's assigned deliveries
  static async getMyDeliveries(req, res) {
    try {
      const agentId = req.user.id;
      const { status } = req.query;
      
      console.log(`🚚 [getMyDeliveries] for driver: ${agentId}, status: ${status}`);
      
      let whereClause = { agentId };
      if (status) {
        whereClause.status = status;
      }
      
      const deliveries = await prisma.delivery.findMany({
        where: whereClause,
        include: {
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true,
                      price: true,
                      image: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      console.log(`✅ Found ${deliveries.length} deliveries for driver`);
      
      res.json({
        success: true,
        data: deliveries,
        count: deliveries.length
      });
    } catch (error) {
      console.error('❌ Get driver deliveries error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch deliveries'
      });
    }
  }
  
  // Update delivery status
  static async updateDeliveryStatus(req, res) {
    try {
      const { deliveryId } = req.params;
      const agentId = req.user.id;
      const { status, currentLat, currentLng, notes } = req.body;
      
      console.log(`📦 Updating delivery ${deliveryId} status to ${status}`);
      
      // Verify delivery exists and belongs to this agent
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId: agentId
        }
      });
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found or not assigned to you'
        });
      }
      
      const updateData = {
        status,
        deliveryNotes: notes || delivery.deliveryNotes
      };
      
      // Add location if provided
      if (currentLat && currentLng) {
        updateData.currentLat = currentLat;
        updateData.currentLng = currentLng;
      }
      
      // Set actual delivery time if status is DELIVERED
      if (status === 'DELIVERED') {
        updateData.actualDelivery = new Date();
        
        // Also update order status
        await prisma.order.update({
          where: { id: delivery.orderId },
          data: { status: 'DELIVERED' }
        });
      }
      
      const updatedDelivery = await prisma.delivery.update({
        where: { id: deliveryId },
        data: updateData,
        include: {
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              },
              address: true
            }
          }
        }
      });
      
      console.log(`✅ Delivery ${deliveryId} status updated to ${status}`);
      
      res.json({
        success: true,
        message: 'Delivery status updated',
        data: updatedDelivery
      });
    } catch (error) {
      console.error('❌ Update delivery status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update delivery status'
      });
    }
  }
  
  // Get delivery details for driver
  static async getDeliveryDetails(req, res) {
    try {
      const { deliveryId } = req.params;
      const agentId = req.user.id;
      
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId: agentId
        },
        include: {
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true,
                      price: true,
                      image: true
                    }
                  }
                }
              }
            }
          }
        }
      });
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      res.json({
        success: true,
        data: delivery
      });
    } catch (error) {
      console.error('❌ Get delivery details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch delivery details'
      });
    }
  }
  
  // Get delivery verification code
  static async getDeliveryCode(req, res) {
    try {
      const { deliveryId } = req.params;
      const agentId = req.user.id;
      
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId: agentId
        },
        include: {
          order: {
            include: {
              client: true
            }
          }
        }
      });
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      if (!delivery.deliveryCode) {
        return res.status(400).json({
          success: false,
          message: 'Delivery code not generated yet'
        });
      }
      
      // Generate a short code for display
      const shortCode = delivery.deliveryCode.substring(0, 6);
      
      res.json({
        success: true,
        data: {
          deliveryId,
          shortCode,
          fullCode: delivery.deliveryCode,
          clientName: delivery.order.client.name,
          clientPhone: delivery.order.client.phone,
          status: delivery.status,
          codeGeneratedAt: delivery.codeGeneratedAt
        }
      });
    } catch (error) {
      console.error('❌ Get delivery code error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get delivery code'
      });
    }
  }
  
  // Mark delivery as picked up
  static async markAsPickedUp(req, res) {
    try {
      const { deliveryId } = req.params;
      const agentId = req.user.id;
      
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId: agentId
        }
      });
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          message: 'Delivery not found'
        });
      }
      
      const updatedDelivery = await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: 'PICKED_UP',
          updatedAt: new Date()
        },
        include: {
          order: {
            include: {
              client: {
                select: {
                  name: true,
                  phone: true
                }
              }
            }
          }
        }
      });
      
      res.json({
        success: true,
        message: 'Delivery marked as picked up',
        data: updatedDelivery
      });
    } catch (error) {
      console.error('❌ Mark as picked up error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update delivery status'
      });
    }
  }
  
  // Get driver statistics
  static async getDriverStats(req, res) {
    try {
      const agentId = req.user.id;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Get delivery counts by status
      const deliveryStats = await prisma.delivery.groupBy({
        by: ['status'],
        where: {
          agentId: agentId,
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        _count: {
          id: true
        }
      });
      
      // Get total completed deliveries
      const completedDeliveries = await prisma.delivery.count({
        where: {
          agentId: agentId,
          status: 'DELIVERED',
          actualDelivery: {
            gte: thirtyDaysAgo
          }
        }
      });
      
      // Get recent activity
      const recentDeliveries = await prisma.delivery.findMany({
        where: {
          agentId: agentId
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: {
          order: {
            include: {
              client: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });
      
      res.json({
        success: true,
        data: {
          stats: deliveryStats,
          totalCompleted: completedDeliveries,
          recentDeliveries: recentDeliveries
        }
      });
    } catch (error) {
      console.error('❌ Get driver stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch driver statistics'
      });
    }
  }
  
  // Update driver location
  static async updateLocation(req, res) {
    try {
      const agentId = req.user.id;
      const { latitude, longitude } = req.body;
      
      // Store location in a separate table or log it
      // For now, we'll update it in the user model or create a location log
      await prisma.user.update({
        where: { id: agentId },
        data: {
          updatedAt: new Date()
          // Add location fields to User model if needed
        }
      });
      
      // Log location (optional - create a locationLog model)
      // await prisma.locationLog.create({
      //   data: {
      //     userId: agentId,
      //     latitude: latitude,
      //     longitude: longitude
      //   }
      // });
      
      res.json({
        success: true,
        message: 'Location updated'
      });
    } catch (error) {
      console.error('❌ Update location error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update location'
      });
    }
  }
}

module.exports = DriverController;