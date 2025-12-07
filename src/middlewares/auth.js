const jwt = require('jsonwebtoken');
const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error('JWT verification error:', err);
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid or expired token' 
        });
      }

      console.log('Decoded JWT:', decoded); // Debug log
      
      // Your JWT might have different field names, check all possibilities:
      req.user = {
        userId: decoded.userId || decoded.id || decoded.sub || decoded._id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name
      };

      console.log('Set req.user:', req.user); // Debug log

      // Validate that we got a userId
      if (!req.user.userId) {
        console.error('No userId found in JWT token:', decoded);
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid token structure - no user ID' 
        });
      }

      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication failed' 
    });
  }
};

const requireClient = (req, res, next) => {
  if (req.user.role !== 'CLIENT') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Client role required.' 
    });
  }
  next();
};

const requireManager = (req, res, next) => {
  if (req.user.role !== 'MANAGER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Manager role required.' 
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireClient,
  requireManager
};


// ============================================
// CHECK YOUR LOGIN ROUTE - auth controller
// ============================================
// Make sure your login is creating JWT with the correct structure

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user and verify password...
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password (assuming you have this logic)
    // const isValidPassword = await bcrypt.compare(password, user.password);
    // if (!isValidPassword) return res.status(401).json({...});

    // CREATE JWT TOKEN WITH CORRECT STRUCTURE
    const token = jwt.sign(
      {
        userId: user.id,        // ✅ CRITICAL: Use 'userId' consistently
        // OR use 'id' - just be consistent
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};


// ============================================
// ALTERNATIVE: If you're using Firebase Auth
// ============================================

const authenticateFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Find user in your database
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Set req.user with MongoDB user ID
    req.user = {
      userId: user.id,  // MongoDB ObjectId
      email: user.email,
      role: user.role,
      firebaseUid: decodedToken.uid
    };

    console.log('Firebase auth - req.user:', req.user);

    next();
  } catch (error) {
    console.error('Firebase authentication error:', error);
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};


// ============================================
// DEBUGGING STEPS
// ============================================

// 1. Add this to your quoteController createEmptyQuote:
const createEmptyQuote = async (req, res) => {
  try {
    const { notes } = req.body;
    
    // ADD THESE DEBUG LOGS:
    console.log('=== CREATE QUOTE DEBUG ===');
    console.log('req.user:', req.user);
    console.log('clientId from req.user:', req.user.userId);
    console.log('notes:', notes);
    console.log('========================');
    
    const clientId = req.user.userId;

    if (!clientId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Client ID is missing. Authentication error.' 
      });
    }

    const quote = await QuoteService.createEmptyQuote(clientId, notes);

    res.status(201).json({
      success: true,
      message: 'Quote created',
      data: { quote }
    });
  } catch (error) {
    console.error('createEmptyQuote error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Check your quoteService.js:
class QuoteService {
  static async createEmptyQuote(clientId, notes = null) {
    try {
      // ADD THIS DEBUG LOG:
      console.log('QuoteService.createEmptyQuote called with:');
      console.log('- clientId:', clientId);
      console.log('- notes:', notes);

      if (!clientId) {
        throw new Error('Client ID is required');
      }

      const quote = await prisma.quote.create({
        data: {
          clientId: clientId,  // This should NOT be undefined
          status: 'PENDING_ITEMS',
          totalAmount: 0,
          sourcingNotes: notes
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  description: true,
                  category: true
                }
              }
            }
          }
        }
      });

      return quote;
    } catch (error) {
      console.error('QuoteService.createEmptyQuote error:', error);
      throw error;
    }
  }
}


// ============================================
// QUICK TEST - Check your JWT structure
// ============================================

// Add this test endpoint temporarily:
app.get('/api/test-auth', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working',
    user: req.user,
    userId: req.user.userId,
    userIdExists: !!req.user.userId
  });
});

// Call this from frontend to verify:
// GET https://your-backend.com/api/test-auth
// With Authorization: Bearer YOUR_TOKEN


// ============================================
// MOST COMMON ISSUE:
// ============================================

// Your JWT payload might be using 'id' instead of 'userId'
// Check your login code - what are you putting in the JWT?

// If your JWT has 'id', change authenticateToken to:
req.user = {
  userId: decoded.id,  // ← Use decoded.id if that's what's in your JWT
  email: decoded.email,
  role: decoded.role
};

// Or if using 'sub':
req.user = {
  userId: decoded.sub,  // ← Use decoded.sub if that's what's in your JWT
  email: decoded.email,
  role: decoded.role
};