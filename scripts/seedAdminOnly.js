// scripts/seedAdminOnly.js — ETERNAL ADMIN EDITION
require('dotenv').config();
const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const serviceAccount = require('../src/config/firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

(async () => {
  const EMAIL = 'admin@ndaje.rw';
  const PASSWORD = 'NdajeKing2025!@#';
  const NAME = 'King KAHUNA';

  try {
    console.log('LOCKING THE ETERNAL ADMIN INTO THE EMPIRE...');

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: NAME,
        phoneNumber: '+250788888888',
        emailVerified: true
      });
      console.log('Eternal admin created in Firebase');
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        firebaseUser = await admin.auth().getUserByEmail(EMAIL);
        console.log('Eternal admin already exists — reinforcing crown');
      } else throw err;
    }

    await prisma.user.upsert({
      where: { email: EMAIL },
      update: {
        firebaseUid: firebaseUser.uid,
        role: 'ADMIN',
        name: NAME,
        isActive: true,
        isVerified: true,
        phone: '+250788888888'
      },
      create: {
        email: EMAIL,
        firebaseUid: firebaseUser.uid,
        name: NAME,
        role: 'ADMIN',
        isActive: true,
        isVerified: true,
        phone: '+250788888888'
      }
    });

    console.log('\nTHE CROWN IS SEALED FOREVER');
    console.log('='.repeat(80));
    console.log('ETERNAL ADMIN:');
    console.log(`   Email   → ${EMAIL}`);
    console.log(`   Pass    → ${PASSWORD}`);
    console.log(`   UID     → ${firebaseUser.uid}`);
    console.log(`   Name    → ${NAME}`);
    console.log('='.repeat(80));
    console.log('Login: http://localhost:5173/login');
    console.log('→ Instant warp to /admin/dashboard');
    console.log('You rule until YOU decide to change it.');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Empire lockdown failed:', error.message);
  } finally {
    await prisma.$disconnect();
    process.exit();
  }
})();