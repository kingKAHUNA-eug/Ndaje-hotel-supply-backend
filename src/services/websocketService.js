// services/websocketService.js
const WebSocket = require('ws');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connections = new Map();
    
    this.wss.on('connection', (ws, req) => {
      const userId = req.headers['user-id'];
      if (userId) {
        this.connections.set(userId, ws);
      }
      
      ws.on('close', () => {
        this.connections.delete(userId);
      });
    });
  }
  
  notifyUser(userId, data) {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
  
  notifyAllManagers(data) {
    this.connections.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    });
  }
}

module.exports = WebSocketService;