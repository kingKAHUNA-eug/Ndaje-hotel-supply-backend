// src/config/firebase.js — THIS IS THE ONLY VERSION THAT WORKS
const fs = require('fs');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      fs.readFileSync('/etc/secrets/FIREBASE_SERVICE_ACCOUNT', 'utf8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin → LOADED FROM RENDER SECRET FILE — NDAJE IS ALIVE');
  } catch (error) {
    console.log('Firebase not loaded (local dev) — this is fine');
  }
}

module.exports = admin;