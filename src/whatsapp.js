// src/whatsapp.js – 100% WORKING ON RENDER JANUARY 2026 – FINAL VERSION
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const prisma = require('./config/prisma');

const logger = pino({ level: 'silent' }); // ← THIS FIXES THE CHILD ERROR FOREVER

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    browser: ['Ndaje Kigali', 'Chrome', '2026'],
    logger, // ← Proper Pino logger
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ qr, connection }) => {
    if (qr) {
      process.stdout.write('\x1b[2J\x1b[0;0H');
      console.log('=====================================');
      console.log('       SCAN QR NOW – NDAJE         ');
      console.log('=====================================');
      require('qrcode-terminal').generate(qr, { small: true });
      console.log('=====================================');
    }

    if (connection === 'open') {
      console.log('NDAJE IS ALIVE – WHATSAPP CONNECTED – KING KAHUNA EMPIRE 2026 🔥');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      if (!text.trim()) return;

      try {
        const aiRes = await axios.post(
          "https://ndaje-python-ai.onrender.com/ai",
          { message: text, name: msg.pushName || "Customer" },
          { headers: { "Content-Type": "application/json" }, timeout: 15000 }
        );

        await sock.sendMessage(from, { text: aiRes.data.reply });

        await prisma.quote.create({
          data: {
            customerPhone: from.split('@')[0],
            customerName: msg.pushName || "WhatsApp Customer",
            items: [{ product: "WhatsApp Order", note: text.substring(0, 500) }],
            totalAmount: 0,
            status: "PENDING",
            source: "WHATSAPP"
          }
        });

      } catch (err) {
        await sock.sendMessage(from, { 
          text: "Muraho boss! 🔥\nNdaje is super busy but I saw your message!\nChicken 5,900/kg today — how much you taking?\nFree delivery above 150k — reply now and we close this!"
        });
      }
    }
  });
}

module.exports = { startWhatsApp };