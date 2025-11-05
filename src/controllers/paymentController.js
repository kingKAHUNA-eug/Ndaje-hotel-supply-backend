const { z } = require('zod');
const prisma = require('../config/prisma');
const MTNPaymentService = require('../services/mtnPaymentService');

// Validation schema
const createPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  phoneNumber: z.string().min(10, 'Valid phone number required')
});

const approvePaymentSchema = z.object({
  status: z.enum(['APPROVED', 'FAILED'])
});

// Create MTN MoMo payment
const createPayment = async (req, res) => {
  try {
    const { orderId, phoneNumber } = createPaymentSchema.parse(req.body);

    // Verify order exists and belongs to user
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        clientId: req.user.userId
      },
      include: {
        payment: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.payment) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this order'
      });
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      return res.status(400).json({
        success: false,
        message: 'Order must be awaiting payment'
      });
    }

    // Generate transaction reference
    const transactionRef = `MTN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: order.total,
        method: 'MTN_MOMO',
        status: 'PENDING',
        transactionRef,
        phoneNumber,
        providerResponse: {
          phoneNumber,
          requestTime: new Date().toISOString()
        }
      }
    });

    // Initialize MTN Payment Service
    const mtnPayment = new MTNPaymentService();
    
    // Request payment from MTN MoMo
    const paymentResponse = await mtnPayment.requestPayment(
      phoneNumber,
      order.total,
      transactionRef,
      `Payment for Order #${order.id}`,
      'Please enter your PIN to complete payment'
    );

    if (!paymentResponse.success) {
      // Update payment status to failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          providerResponse: {
            ...payment.providerResponse,
            error: paymentResponse.error,
            code: paymentResponse.code
          }
        }
      });

      return res.status(400).json({
        success: false,
        message: paymentResponse.error || 'Payment request failed'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Payment request created successfully. Please check your phone and enter your PIN.',
      data: {
        payment,
        momoResponse: paymentResponse
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get payment status
const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await prisma.payment.findFirst({
      where: {
        orderId,
        order: {
          clientId: req.user.userId
        }
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            total: true
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: { payment }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Approve/Reject payment (Manager/Admin)
const approvePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status } = approvePaymentSchema.parse(req.body);

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been processed'
      });
    }

    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        approvedById: req.user.userId
      },
      include: {
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
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Update order status if payment approved
    if (status === 'APPROVED') {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'PAID_AND_APPROVED' }
      });
    }

    res.json({
      success: true,
      message: `Payment ${status.toLowerCase()} successfully`,
      data: { payment: updatedPayment }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }

    console.error('Approve payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all payments (Manager/Admin)
const getAllPayments = async (req, res) => {
  try {
    const { status } = req.query;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
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
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: { payments }
    });

  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// MTN MoMo webhook handler
const handleMTNWebhook = async (req, res) => {
  try {
    const { referenceId, status, amount, currency, financialTransactionId } = req.body;
    
    if (!referenceId) {
      return res.status(400).json({
        success: false,
        message: 'Reference ID is required'
      });
    }

    // Find payment by transaction reference
    const payment = await prisma.payment.findFirst({
      where: {
        transactionRef: referenceId
      },
      include: {
        order: true
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Update payment status based on MTN response
    let paymentStatus = 'PENDING';
    if (status === 'SUCCESSFUL') {
      paymentStatus = 'CONFIRMED';
    } else if (status === 'FAILED') {
      paymentStatus = 'FAILED';
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        providerResponse: {
          ...payment.providerResponse,
          webhookData: req.body,
          financialTransactionId,
          webhookReceivedAt: new Date().toISOString()
        }
      }
    });

    // Update order status if payment is confirmed
    if (paymentStatus === 'CONFIRMED') {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'PAID_AND_APPROVED' }
      });
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('MTN webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

// Check payment status with MTN
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await prisma.payment.findFirst({
      where: {
        orderId,
        order: {
          clientId: req.user.userId
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check status with MTN API
    const mtnPayment = new MTNPaymentService();
    const statusResponse = await mtnPayment.getPaymentStatus(payment.transactionRef);

    if (statusResponse.success) {
      // Update payment status if it has changed
      if (statusResponse.status !== payment.status) {
        let newStatus = payment.status;
        if (statusResponse.status === 'SUCCESSFUL') {
          newStatus = 'CONFIRMED';
        } else if (statusResponse.status === 'FAILED') {
          newStatus = 'FAILED';
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            providerResponse: {
              ...payment.providerResponse,
              lastStatusCheck: new Date().toISOString(),
              mtnStatus: statusResponse.status
            }
          }
        });

        // Update order status if payment is confirmed
        if (newStatus === 'CONFIRMED') {
          await prisma.order.update({
            where: { id: payment.orderId },
            data: { status: 'PAID_AND_APPROVED' }
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        payment: {
          ...payment,
          mtnStatus: statusResponse.status || payment.status
        }
      }
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
};

module.exports = {
  createPayment,
  getPaymentStatus,
  approvePayment,
  getAllPayments,
  handleMTNWebhook,
  checkPaymentStatus
};
