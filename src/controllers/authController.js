const admin = require('../config/firebase');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../config/prisma');

// Validation schema
const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
});
// ADD THIS WITH YOUR OTHER SCHEMAS
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/* ========== SIGNUP — BULLETPROOF ========== */
const signup = async (req, res) => {
  let firebaseUser = null;

  try {
    // 1. Validate input
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.errors[0].message,
      });
    }

    const { name, email, password, phone } = result.data;

    // 2. Check if email already exists in Firebase
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({
        success: false,
        message: 'This email is already registered. Try signing in.',
      });
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
      // Safe to proceed
    }

    // 3. Create Firebase user
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });
    } catch (err) {
      console.error('Firebase create error:', err);
      return res.status(400).json({
        success: false,
        message: err.errorInfo?.message || 'Failed to create account in Firebase',
      });
    }

    // 4. Set custom claim (role)
    try {
      await admin.auth().setCustomUserClaims(firebaseUser.uid, { role: 'CLIENT' });
    } catch (err) {
      console.error('Failed to set role claim:', err);
      // Don't fail — can retry later
    }

    // 5. Save to MongoDB
    try {
      await prisma.user.create({
        data: {
          firebaseUid: firebaseUser.uid,
          name,
          email,
          phone: phone || null,
          role: 'CLIENT',
          isVerified: false,
          emailVerified: false,
        },
      });
    } catch (err) {
      console.error('Prisma create error:', err);
      
      // ROLLBACK: Delete Firebase user if MongoDB fails
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
        console.log('Rolled back Firebase user:', firebaseUser.uid);
      } catch (deleteErr) {
        console.error('Failed to rollback Firebase user:', deleteErr);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to save user data. Account creation cancelled.',
      });
    }

    // 6. Send verification email
    try {
      await admin.auth().generateEmailVerificationLink(email);
    } catch (err) {
      console.error('Failed to send verification email:', err);
      // Don't fail signup
    }

    // 7. Generate JWT
    const token = jwt.sign(
      { userId: firebaseUser.uid, email, role: 'CLIENT' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // SUCCESS!
    return res.status(201).json({
      success: true,
      message: 'Account created! Check your email to verify.',
      data: {
        user: { id: firebaseUser.uid, name, email, role: 'CLIENT' },
        token,
      },
    });

  } catch (err) {
    console.error('Unexpected signup error:', err);

    // FINAL ROLLBACK: If Firebase user exists but we crashed
    if (firebaseUser?.uid) {
      try {
        await admin.auth().deleteUser(firebaseUser.uid);
        console.log('Emergency rollback: deleted Firebase user', firebaseUser.uid);
      } catch (deleteErr) {
        console.error('Emergency rollback failed:', deleteErr);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
    });
  }
};
/* ========== LOGIN ========== */
const login = async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // 1. Find user in MongoDB
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // 2. Generate Firebase custom token
    const firebaseToken = await admin.auth().createCustomToken(user.firebaseUid);

    // 3. Generate your own JWT
    const token = jwt.sign(
      { userId: user.firebaseUid, email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        firebaseToken,
        token,
        user: { id: user.firebaseUid, name: user.name, email, role: user.role },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ========== PASSWORD RESET ========== */
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    // Generate Firebase reset link
    const link = await admin.auth().generatePasswordResetLink(email);

    res.json({
      success: true,
      message: 'Password reset link sent to your email',
      data: { link }, // Remove in production if using custom email
    });
  } catch (err) {
    console.error('Password reset error:', err);
    if (err.code?.startsWith('auth/')) {
      return res.status(400).json({ success: false, message: err.errorInfo?.message });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ========== EXPORTS ========== */
module.exports = {
  signup,
  login,
  requestPasswordReset,
};