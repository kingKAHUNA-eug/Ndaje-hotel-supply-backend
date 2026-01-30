// src/whatsapp.js – FINAL 100% WORKING VERSION – JANUARY 2026
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const prisma = require('./config/prisma');
let qrcode;
try {
  qrcode = require('qrcode-terminal');
} catch (e) {
  qrcode = null;
}

// Clean logger that won't mess up QR code
const logger = pino({ level: 'silent' });

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    logger,
    auth: state,
    browser: ['Ndaje Kigali', 'Safari', '3.0'],
    printQRInTerminal: false // We handle QR ourselves
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && qrcode) {
      process.stdout.write('\x1b[2J\x1b[0;0H'); // Clear screen
      console.log('=======================================');
      console.log('     SCAN THIS QR CODE NOW – NDAJE     ');
      console.log('=======================================');
      qrcode.generate(qr, { small: true });
      console.log('=======================================');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Reconnecting Ndaje WhatsApp...');
        startWhatsApp();
      } else {
        console.log('Logged out. Delete auth_info_baileys folder and redeploy.');
      }
    } else if (connection === 'open') {
      console.log('NDAJE IS ALIVE – WHATSAPP CONNECTED – KING KAHUNA EMPIRE 2026 🔥');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      const from = msg.key.remoteJid;
      const phone = from.split('@')[0];
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';

      if (!text.trim()) return;

      try {
        // THIS IS THE FIXED AI CALL — 100% WORKING
        const aiRes = await axios.post(
          "https://ndaje-python-ai.onrender.com/ai",
          { 
            message: text, 
            name: msg.pushName || "Customer" 
          },
          { 
            headers: { "Content-Type": "application/json" },
            timeout: 20000 
          }
        );

        const reply = aiRes.data.reply || "Ndaje here! How can I help you today? 🔥";

        await sock.sendMessage(from, { text: reply });

        // SAVE QUOTE TO DATABASE
        try {
          await prisma.quote.create({
            data: {
              customerPhone: phone,
              customerName: msg.pushName || "WhatsApp Customer",
              items: [{ product: "WhatsApp Order", note: text.substring(0, 500) }],
              totalAmount: 0,
              status: "PENDING",
              source: "WHATSAPP",
              messageHistory: [
                { role: "customer", content: text },
                { role: "ndaje", content: reply }
              ]
            }
          });
        } catch (dbErr) {
          console.error("Failed to save quote:", dbErr.message);
        }

      } catch (err) {
        console.error("AI CALL FAILED:", err.message || err);
        await sock.sendMessage(from, { text: "Ndaje is getting stronger... back in 10 seconds 💪" });
      }
    }
  });
}

module.exports = { startWhatsApp };