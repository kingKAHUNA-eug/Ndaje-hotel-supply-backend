// verificationController.js
const { z } = require('zod');
const prisma = require('../config/prisma');
const twilio = require('twilio');

//const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Validation schemas
const sendCodeSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  type: z.enum(['SIGNUP', 'RECOVERY']),
});

const verifyCodeSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  code: z.string().length(6, 'Code must be 6 digits'),
  type: z.enum(['SIGNUP', 'RECOVERY']),
});

// Send verification code
/*const sendVerificationCode = async (req, res) => {
  try {
    const { phone, type } = sendCodeSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Store code
    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        code,
        type,
        expiresAt,
      },
    });

    // Send SMS via Twilio
    await client.messages.create({
      body: `Your verification code is ${code}. It expires in 15 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    console.error('Send verification code error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
*/
// Verify code
const verifyCode = async (req, res) => {
  try {
    const { phone, code, type } = verifyCodeSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find valid code
    const verification = await prisma.verificationCode.findFirst({
      where: {
        userId: user.id,
        code,
        type,
        expiresAt: { gt: new Date() },
      },
    });

    if (!verification) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    // Mark user as verified for signup
    if (type === 'SIGNUP') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });
    }

    // Delete used code
    await prisma.verificationCode.delete({ where: { id: verification.id } });

    res.json({ success: true, message: 'Verification successful' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    console.error('Verify code error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { sendVerificationCode, verifyCode };