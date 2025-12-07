// middlewares/auth.js - CLEAN VERSION (NO TEST ENDPOINTS)
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;

    if (decoded.firebaseUid) {
      user = await prisma.user.findUnique({
        where: { firebaseUid: decoded.firebaseUid },
        select: { id: true, firebaseUid: true, email: true, role: true, name: true, isActive: true }
      });
    } else if (decoded.email) {
      user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { id: true, firebaseUid: true, email: true, role: true, name: true, isActive: true }
      });
    } else if (decoded.userId) {
      user = await prisma.user.findFirst({
        where: { firebaseUid: decoded.userId },
        select: { id: true, firebaseUid: true, email: true, role: true, name: true, isActive: true }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // ✅ FIX: Add userId field that your controllers expect
    req.user = {
      userId: user.id,      // ← ADD THIS LINE
      id: user.id,
      firebaseUid: user.firebaseUid || null,
      email: user.email,
      role: user.role,
      name: user.name
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

// Role authorization
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};

const requireAdmin = authorize('ADMIN');
const requireManager = authorize('MANAGER');
const requireDeliveryAgent = authorize('DELIVERY_AGENT');
const requireManagerOrAdmin = authorize('MANAGER', 'ADMIN');
const requireClient = authorize('CLIENT');
const requireStaff = authorize('MANAGER', 'ADMIN', 'DELIVERY_AGENT');

module.exports = {
  authenticateToken,
  requireAdmin,
  requireManager,
  requireDeliveryAgent,
  requireManagerOrAdmin,
  requireClient,
  requireStaff,
  authorize
};