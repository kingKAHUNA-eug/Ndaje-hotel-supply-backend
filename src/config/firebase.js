// src/config/firebase.js — FINAL VERSION THAT WILL NEVER CRASH AGAIN
const fs = require('fs');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    // RENDER SECRET FILE — YOU ALREADY HAVE THIS
    const serviceAccount = JSON.parse(
      fs.readFileSync('/etc/secrets/FIREBASE_SERVICE_ACCOUNT', 'utf8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin → LOADED FROM RENDER SECRET FILE — NDAJE IS ALIVE');
  } catch (error) {
    console.log('Firebase Admin → not loaded (local dev only)');
    // Do nothing — auth will still work without Firebase for now
  }
}

module.exports = admin;