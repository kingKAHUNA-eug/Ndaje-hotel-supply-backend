// services/notificationService.js
const { Server } = require('socket.io');

class NotificationService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        credentials: true
      }
    });

    this.managerRooms = new Map(); // userId -> socketId
    this.setupSocket();
  }

  setupSocket() {
    this.io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;
      
      if (userId) {
        this.managerRooms.set(userId, socket.id);
        socket.join(`user:${userId}`);
      }

      socket.on('disconnect', () => {
        this.managerRooms.delete(userId);
      });
    });
  }
 static async createNotification(userId, type, title, message, data = {}) {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: JSON.stringify(data),
          read: false
        }
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }
   static async notifyNewQuote(managerId, quoteId, clientName) {
    await this.createNotification(
      managerId,
      'NEW_QUOTE',
      'New Quote Available',
      `New quote from ${clientName} ready for pricing`,
      { quoteId }
    );
  }

  // Notify manager when they try to access a locked quote
  async notifyQuoteLocked(managerId, quoteId, lockedByManagerName) {
    this.io.to(`user:${managerId}`).emit('quote_locked', {
      message: `Quote #${quoteId.substring(0, 8)} is being handled by ${lockedByManagerName}`,
      quoteId,
      lockedBy: lockedByManagerName,
      timestamp: new Date().toISOString()
    });
  }

  // Notify client when quote is priced
  async notifyQuotePriced(clientId, quoteId, managerName) {
    this.io.to(`user:${clientId}`).emit('quote_priced', {
      message: `Your quote #${quoteId.substring(0, 8)} has been priced by ${managerName}`,
      quoteId,
      managerName,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = NotificationService;