// routes/verification.js
const express = require('express');
const { sendVerificationCode, verifyCode } = require('../controllers/verificationController');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

router.post('/send', sendVerificationCode);
router.post('/verify', verifyCode);
router.post('/reset-password', resetPassword);
module.exports = router;