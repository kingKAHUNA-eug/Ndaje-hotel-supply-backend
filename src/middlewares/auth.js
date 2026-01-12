const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

// Simple role-based authorization middleware factory
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: insufficient permissions'
        });
      }

      next();
    } catch (err) {
      console.error('Authorization error:', err);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

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
    
    // Find user based on JWT payload
    if (decoded.firebaseUid) {
      user = await prisma.user.findUnique({
        where: { firebaseUid: decoded.firebaseUid },
        select: { 
          id: true, 
          firebaseUid: true, 
          email: true, 
          role: true, 
          name: true, 
          isActive: true
        }
      });
    } else if (decoded.email) {
      user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { 
          id: true, 
          firebaseUid: true, 
          email: true, 
          role: true, 
          name: true, 
          isActive: true
        }
      });
    } else if (decoded.userId) {
      user = await prisma.user.findFirst({
        where: { firebaseUid: decoded.userId },
        select: { 
          id: true, 
          firebaseUid: true, 
          email: true, 
          role: true, 
          name: true, 
          isActive: true
        }
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token payload' 
      });
    }

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }
    
    // ✅ For managers, user.id IS the manager ID (no separate manager table)
    const managerId = user.id;

    // ✅ Attach user info to request
    req.user = {
      userId: user.id,               // MongoDB ObjectId as string
      managerId: managerId,          // Same as userId for MANAGER role
      id: managerId,                 // Backward compatibility
      firebaseUid: user.firebaseUid || null,
      email: user.email,
      role: user.role,
      name: user.name
    };

    console.log('🔐 Auth middleware - User:', {
      userId: user.id,
      managerId: managerId,
      role: user.role,
      name: user.name,
      email: user.email
    });

    next();
  
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
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