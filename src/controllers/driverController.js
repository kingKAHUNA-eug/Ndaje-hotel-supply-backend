// controllers/driverController.js
const { prisma } = require('../config/prisma');

const getMyDeliveries = async (req, res) => {
  try {
    const agentId = req.user.id;
    
    const deliveries = await prisma.delivery.findMany({
      where: { agentId },
      include: {
        order: {
          include: {
            client: {
              select: {
                name: true,
                phone: true,
                email: true
              }
            },
            address: true,
            items: {
              include: {
                product: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch deliveries' });
  }
};

module.exports = { getMyDeliveries };