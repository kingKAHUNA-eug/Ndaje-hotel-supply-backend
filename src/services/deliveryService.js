const prisma = require('../config/prisma');
const DeliveryCodeService = require('./deliveryCodeService');

class DeliveryService {
  /**
   * Assign delivery agent to an order
   * @param {string} orderId - Order ID
   * @param {string} agentId - Delivery agent ID
   * @returns {Object} Created delivery record
   */
  static async assignDeliveryAgent(orderId, agentId) {
    try {
      // Verify order exists and is ready for delivery
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          delivery: true,
          address: true
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'PAID_AND_APPROVED') {
        throw new Error('Order is not ready for delivery');
      }

      if (order.delivery) {
        throw new Error('Delivery already assigned to this order');
      }

      // Verify agent exists and is a delivery agent
      const agent = await prisma.user.findFirst({
        where: {
          id: agentId,
          role: 'DELIVERY_AGENT',
          isActive: true
        }
      });

      if (!agent) {
        throw new Error('Invalid delivery agent');
      }

      // Generate delivery code
      const codeService = new DeliveryCodeService();
      const deliveryCodeData = codeService.generateDeliveryCode(
        'temp', // Will be updated after creation
        orderId,
        order.clientId
      );

      // Create delivery record
      const delivery = await prisma.delivery.create({
        data: {
          orderId,
          agentId,
          status: 'ASSIGNED',
          estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          deliveryCode: deliveryCodeData.encryptedCode,
          codeGeneratedAt: deliveryCodeData.generatedAt
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Update order status to IN_TRANSIT
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'IN_TRANSIT' }
      });

      // Update the delivery code with the actual delivery ID
      const updatedDeliveryCode = codeService.generateDeliveryCode(
        delivery.id,
        orderId,
        order.clientId
      );

      // Update delivery with correct code
      const finalDelivery = await prisma.delivery.update({
        where: { id: delivery.id },
        data: {
          deliveryCode: updatedDeliveryCode.encryptedCode
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      return {
        ...finalDelivery,
        shortCode: codeService.generateShortCode(delivery.id, orderId)
      };
    } catch (error) {
      console.error('DeliveryService.assignDeliveryAgent error:', error);
      throw error;
    }
  }

  /**
   * Update delivery status
   * @param {string} deliveryId - Delivery ID
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   * @param {Object} location - Optional location data
   * @param {string} notes - Optional delivery notes
   * @returns {Object} Updated delivery record
   */
  static async updateDeliveryStatus(deliveryId, agentId, status, location = null, notes = null) {
    try {
      // Verify delivery exists and belongs to agent
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId
        }
      });

      if (!delivery) {
        throw new Error('Delivery not found or access denied');
      }

      const updateData = {
        status,
        deliveryNotes: notes
      };

      // Add location data if provided
      if (location && location.latitude && location.longitude) {
        updateData.currentLat = location.latitude;
        updateData.currentLng = location.longitude;
      }

      // Set actual delivery time if status is DELIVERED
      if (status === 'DELIVERED') {
        updateData.actualDelivery = new Date();
      }

      const updatedDelivery = await prisma.delivery.update({
        where: { id: deliveryId },
        data: updateData,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              address: true
            }
          }
        }
      });

      // Update order status if delivery is completed
      if (status === 'DELIVERED') {
        await prisma.order.update({
          where: { id: delivery.orderId },
          data: { status: 'DELIVERED' }
        });
      }

      return updatedDelivery;
    } catch (error) {
      console.error('DeliveryService.updateDeliveryStatus error:', error);
      throw error;
    }
  }

  /**
   * Get delivery by ID
   * @param {string} deliveryId - Delivery ID
   * @returns {Object} Delivery details
   */
  static async getDeliveryById(deliveryId) {
    try {
      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      return delivery;
    } catch (error) {
      console.error('DeliveryService.getDeliveryById error:', error);
      throw error;
    }
  }

  /**
   * Get deliveries for a delivery agent
   * @param {string} agentId - Agent ID
   * @param {string} status - Optional status filter
   * @returns {Array} List of deliveries
   */
  static async getAgentDeliveries(agentId, status = null) {
    try {
      const whereClause = { agentId };
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
                  email: true,
                  phone: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return deliveries;
    } catch (error) {
      console.error('DeliveryService.getAgentDeliveries error:', error);
      throw error;
    }
  }

  /**
   * Get deliveries for a client
   * @param {string} clientId - Client ID
   * @param {string} status - Optional status filter
   * @returns {Array} List of deliveries
   */
  static async getClientDeliveries(clientId, status = null) {
    try {
      const whereClause = {
        order: {
          clientId
        }
      };
      if (status) {
        whereClause.status = status;
      }

      const deliveries = await prisma.delivery.findMany({
        where: whereClause,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return deliveries;
    } catch (error) {
      console.error('DeliveryService.getClientDeliveries error:', error);
      throw error;
    }
  }

  /**
   * Get all deliveries (Admin only)
   * @param {string} status - Optional status filter
   * @param {string} agentId - Optional agent filter
   * @returns {Array} List of deliveries
   */
  static async getAllDeliveries(status = null, agentId = null) {
    try {
      const whereClause = {};
      if (status) {
        whereClause.status = status;
      }
      if (agentId) {
        whereClause.agentId = agentId;
      }

      const deliveries = await prisma.delivery.findMany({
        where: whereClause,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              },
              address: true,
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      sku: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return deliveries;
    } catch (error) {
      console.error('DeliveryService.getAllDeliveries error:', error);
      throw error;
    }
  }

  /**
   * Get delivery tracking info for client
   * @param {string} orderId - Order ID
   * @param {string} clientId - Client ID
   * @returns {Object} Delivery tracking info
   */
  static async getDeliveryTracking(orderId, clientId) {
    try {
      const delivery = await prisma.delivery.findFirst({
        where: {
          orderId,
          order: {
            clientId
          }
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          },
          order: {
            include: {
              address: true
            }
          }
        }
      });

      if (!delivery) {
        throw new Error('Delivery not found or access denied');
      }

      return {
        deliveryId: delivery.id,
        status: delivery.status,
        agent: delivery.agent,
        currentLocation: delivery.currentLat && delivery.currentLng ? {
          latitude: delivery.currentLat,
          longitude: delivery.currentLng
        } : null,
        estimatedDelivery: delivery.estimatedDelivery,
        actualDelivery: delivery.actualDelivery,
        deliveryNotes: delivery.deliveryNotes,
        orderAddress: delivery.order.address
      };
    } catch (error) {
      console.error('DeliveryService.getDeliveryTracking error:', error);
      throw error;
    }
  }

  /**
   * Verify delivery code by client
   * @param {string} deliveryId - Delivery ID
   * @param {string} clientId - Client ID
   * @param {string} verificationCode - Code provided by delivery agent
   * @returns {Object} Verification result
   */
  static async verifyDeliveryByClient(deliveryId, clientId, verificationCode) {
    try {
      // Get delivery with order details
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          order: {
            clientId
          }
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
        throw new Error('Delivery not found or access denied');
      }

      if (delivery.status !== 'DELIVERED') {
        throw new Error('Delivery must be marked as delivered first');
      }

      if (delivery.clientVerifiedAt) {
        throw new Error('Delivery already verified by client');
      }

      // Verify the code
      const codeService = new DeliveryCodeService();
      const verification = codeService.verifyDeliveryCode(
        delivery.deliveryCode,
        deliveryId,
        delivery.orderId,
        clientId
      );

      if (!verification.isValid) {
        throw new Error('Invalid verification code');
      }

      // Update delivery with client verification
      const updatedDelivery = await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: 'CLIENT_VERIFIED',
          clientVerifiedAt: new Date(),
          clientVerifiedBy: clientId
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      return {
        success: true,
        message: 'Delivery verified successfully',
        delivery: updatedDelivery
      };
    } catch (error) {
      console.error('DeliveryService.verifyDeliveryByClient error:', error);
      throw error;
    }
  }

  /**
   * Confirm delivery completion by manager
   * @param {string} deliveryId - Delivery ID
   * @param {string} managerId - Manager ID
   * @returns {Object} Confirmation result
   */
  static async confirmDeliveryByManager(deliveryId, managerId) {
    try {
      // Get delivery details
      const delivery = await prisma.delivery.findFirst({
        where: { id: deliveryId },
        include: {
          order: true
        }
      });

      if (!delivery) {
        throw new Error('Delivery not found');
      }

      if (delivery.status !== 'CLIENT_VERIFIED') {
        throw new Error('Delivery must be verified by client first');
      }

      if (delivery.managerConfirmedAt) {
        throw new Error('Delivery already confirmed by manager');
      }

      // Update delivery with manager confirmation
      const updatedDelivery = await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: 'MANAGER_CONFIRMED',
          managerConfirmedAt: new Date(),
          managerConfirmedBy: managerId
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // Update order status to DELIVERED
      await prisma.order.update({
        where: { id: delivery.orderId },
        data: { status: 'DELIVERED' }
      });

      return {
        success: true,
        message: 'Delivery confirmed successfully',
        delivery: updatedDelivery
      };
    } catch (error) {
      console.error('DeliveryService.confirmDeliveryByManager error:', error);
      throw error;
    }
  }

  /**
   * Get delivery code for agent
   * @param {string} deliveryId - Delivery ID
   * @param {string} agentId - Agent ID
   * @returns {Object} Delivery code info
   */
  static async getDeliveryCode(deliveryId, agentId) {
    try {
      const delivery = await prisma.delivery.findFirst({
        where: {
          id: deliveryId,
          agentId
        },
        include: {
          order: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              }
            }
          }
        }
      });

      if (!delivery) {
        throw new Error('Delivery not found or access denied');
      }

      if (!delivery.deliveryCode) {
        throw new Error('Delivery code not generated');
      }

      const codeService = new DeliveryCodeService();
      const shortCode = codeService.generateShortCode(deliveryId, delivery.orderId);

      return {
        deliveryId,
        shortCode,
        clientName: delivery.order.client.name,
        clientPhone: delivery.order.client.phone,
        status: delivery.status,
        generatedAt: delivery.codeGeneratedAt
      };
    } catch (error) {
      console.error('DeliveryService.getDeliveryCode error:', error);
      throw error;
    }
  }
}

module.exports = DeliveryService;
