// ============================================
// BACKEND SERVER UPDATE - Apply this to your index.js or server.js
// ============================================

// STEP 1: Make sure you have the cors middleware file
// File: middlewares/cors.js (you already created this)

// STEP 2: Update your main server file (index.js or server.js)

const express = require('express');
const app = express();

// ✅ IMPORT THE CORS MIDDLEWARE (add this near the top with other imports)
const corsMiddleware = require('./middlewares/cors');

// ✅ APPLY CORS MIDDLEWARE BEFORE ANY ROUTES
// This MUST come before app.use('/api', ...) or any route handlers
app.use(corsMiddleware);

// Handle preflight requests explicitly
app.options('*', corsMiddleware);

// Then continue with your other middleware...
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Your routes come AFTER cors
app.use('/api', require('./routes'));

// ... rest of your server code

// ============================================
// ALTERNATIVE: If you don't want a separate file
// ============================================

// Replace any existing app.use(cors(...)) with this:

const cors = require('cors');

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://ndaje-admin.vercel.app',
      'https://ndaje-hotel-supply-backend.onrender.com'
    ];
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',  // ← THIS IS THE KEY FIX
    'Pragma',
    'Expires'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
}));

// Handle OPTIONS requests
app.options('*', cors());

// ============================================
// DEPLOYMENT STEPS
// ============================================

/*
1. Save the changes to your server file
2. Commit to git:
   git add .
   git commit -m "fix: Add Cache-Control to CORS allowed headers"
   git push

3. Render will automatically redeploy (or trigger manually)

4. Wait for deployment to complete (~2-3 minutes)

5. Test from https://ndaje-admin.vercel.app
   - Open browser DevTools (F12)
   - Go to Network tab
   - Try to load products
   - Should see: 200 OK (not CORS error)
*/

// ============================================
// DEBUGGING: Add this temporarily to see what's happening
// ============================================

app.use((req, res, next) => {
  console.log('📥 Request:', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    cacheControl: req.headers['cache-control']
  });
  next();
});