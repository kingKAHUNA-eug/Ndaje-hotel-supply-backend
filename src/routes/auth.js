// src/routes/auth.js
const express = require('express');
const { 
  signup, 
  login, 
  requestPasswordReset 
} = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/auth');
const prisma = require('../config/prisma');
const admin = require('../config/firebase'); // ← YOUR FILE!

const router = express.Router();

// === EXISTING ROUTES (UNCHANGED) ===
router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', requestPasswordReset);

// Session info (aliases /profile for compatibility)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { 
        id: true,
        firebaseUid: true,
        name: true,
        email: true,
        role: true,
        phone: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.firebaseUid || user.id, // backward compatible id seen by clients
          _id: user.id,                    // MongoDB/ObjectId for locking logic
          firebaseUid: user.firebaseUid,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role
        }
      }
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.user.userId },
      select: { id: true, name: true, email: true, role: true }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// === GOOGLE SIGN-IN (USING YOUR config/firebase.js) ===
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'idToken is required' });
  }

  try {
    // Verify token using YOUR Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email not provided by Google' });
    }

    // Find or create user in Prisma
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.User.create({
        data: {
          email,
          name: name || email.split('@')[0],
          firebaseUid: uid,
          avatar: picture,
          role: 'CLIENT',
          emailVerified: true,
        },
      });
    } else if (!user.firebaseUid) {
      // Link Google account
      user = await prisma.user.update({
        where: { email },
        data: { firebaseUid: uid, avatar: picture, emailVerified: true },
      });
    }

    // Generate your JWT
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user.firebaseUid, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // FIXED: Add 'data' wrapper to match frontend expectations
    res.json({
      success: true,
      data: {  // Add this wrapper
        token,
        user: {
          id: user.id,
          firebaseUid: user.firebaseUid,  // Add this
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
        }
      }
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ success: false, message: 'Invalid Google token' });
  }
});

module.exports = router;