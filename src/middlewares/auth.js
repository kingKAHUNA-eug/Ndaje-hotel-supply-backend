const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // CRITICAL FIX: Use firebaseUid, not id
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.userId },  // ← THIS IS THE FIX
      select: { id: true, firebaseUid: true, email: true, role: true, name: true }
    });

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = {
      userId: user.firebaseUid,
      email: user.email,
      role: user.role,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  
// Role-based authorization middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Specific role middlewares
const requireClient = authorize('CLIENT');
const requireManager = authorize('MANAGER');
const requireAdmin = authorize('ADMIN');
const requireDeliveryAgent = authorize('DELIVERY_AGENT');
const requireManagerOrAdmin = authorize('MANAGER', 'ADMIN');
const requireStaff = authorize('MANAGER', 'ADMIN', 'DELIVERY_AGENT');

module.exports = {
  authenticateToken,
  authorize,
  requireClient,
  requireManager,
  requireAdmin,
  requireDeliveryAgent,
  requireManagerOrAdmin,
  requireStaff
};
