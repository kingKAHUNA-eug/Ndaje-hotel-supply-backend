// src/whatsapp.js – FINAL BULLETPROOF VERSION – NEVER LATE, NEVER DIES
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const prisma = require('./config/prisma');

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    browser: ['Ndaje Kigali', 'Safari', '3.0'],
    logger: { level: 'silent' },
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      process.stdout.write('\x1b[2J\x1b[0;0H');
      console.log('=====================================');
      console.log('       SCAN QR NOW – NDAJE         ');
      console.log('=====================================');
      require('qrcode-terminal').generate(qr, { small: true });
      console.log('=====================================');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      if (shouldReconnect) {
        console.log('Reconnecting Ndaje...');
        setTimeout(startWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('NDAJE IS ALIVE – WHATSAPP CONNECTED – KING KAHUNA EMPIRE 2026 🔥');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   msg.message?.imageMessage?.caption || '';

      if (!text.trim()) return;

      try {
        const aiRes = await axios.post(
          "https://ndaje-python-ai.onrender.com/ai",
          { message: text, name: msg.pushName || "Customer" },
          { 
            headers: { "Content-Type": "application/json" },
            timeout: 18000
          }
        );

        const reply = aiRes.data.reply;
        await sock.sendMessage(from, { text: reply });

        // Save quote
        await prisma.quote.create({
          data: {
            customerPhone: from.split('@')[0],
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

      } catch (err) {
        console.error("AI FAILED:", err.message);
        await sock.sendMessage(from, { 
          text: "Muraho bro/sis! 🔥\n"
               + "Ndaje is currently serving 50+ hotels but I saw you!\n"
               +"Chicken 5,900/kg today only — reply me now and we close this deal in 2 minutes 🚀\n"
               +"Free delivery above 150k — I’m waiting for your order!"
        });
      }
    }
  });
}

module.exports = { startWhatsApp };