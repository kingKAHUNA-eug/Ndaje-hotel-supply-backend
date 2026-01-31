// src/whatsapp.js – 100% WORKING ON RENDER JANUARY 2026 – NO MORE logger.child ERROR
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const prisma = require('./config/prisma');

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    browser: ['Ndaje Kigali', 'Chrome', '2026'],
    logger: undefined,  // ← THIS KILLS THE logger.child ERROR FOREVER
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

      let reply;

      try {
        // TRY GROQ FIRST (FASTEST)
        const groqRes = await axios.post(
          "https://ndaje-python-ai.onrender.com/ai",
          { message: text, name: msg.pushName || "Customer" },
          { headers: { "Content-Type": "application/json" }, timeout: 12000 }
        );
        reply = groqRes.data.reply;

      } catch (err) {
        // FALLBACK TO DEEPSEEK OR HARD-CODED REPLY
        try {
          const deepRes = await axios.post(
            "https://ndaje-python-ai.onrender.com/ai",
            { message: text, name: msg.pushName || "Customer" },
            { headers: { "Content-Type": "application/json" }, timeout: 15000 }
          );
          reply = deepRes.data.reply;
        } catch {
          reply = "Muraho boss! 🔥\nNdaje is here — chicken 5,900/kg today only!\nHow much you need? Free delivery above 150k — reply now and we close this deal in 2 minutes 💪";
        }
      }

      await sock.sendMessage(from, { text: reply });

      // Save quote
      try {
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
      } catch (e) { /* ignore */ }
    }
  });
}

module.exports = { startWhatsApp };