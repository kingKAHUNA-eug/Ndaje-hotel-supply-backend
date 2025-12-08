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