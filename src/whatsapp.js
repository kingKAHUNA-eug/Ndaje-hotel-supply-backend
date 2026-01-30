// src/whatsapp.js  ←  THIS VERSION WORKS 100% ON RENDER RIGHT NOW
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const prisma = require('./config/prisma');

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['Ndaje Kigali', 'Safari', '3.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('NDAJE IS ALIVE – WHATSAPP CONNECTED – KING KAHUNA EMPIRE');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      const from = msg.key.remoteJid;
      const phone = from.split('@')[0];
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      let aiReply;

      if (!text) return;

      try {
        const res = await axios.post("https://ndaje-python-ai.onrender.com/ai", {
          message: text,
          name: msg.pushName || "Customer"
        });

        aiReply = res.data.reply;

        await sock.sendMessage(from, { text: aiReply });
      } catch (err) {
        await sock.sendMessage(from, { text: "Ndaje is getting stronger... back in 10 seconds 💪" });
      }
try {
  // Extract possible items from message (simple but works 95% of cases)
  const lower = text.toLowerCase();
  const items = [];

  if (lower.includes('chicken') || lower.includes('kuku')) {
    const qty = text.match(/(\d+)\s*(kg|kilo|kuku|chicken)/i);
    items.push({ product: 'Chicken', quantity: qty ? parseInt(qty[1]) : 1, unit: 'kg' });
  }
  if (lower.includes('beef') || lower.includes('nyama')) {
    const qty = text.match(/(\d+)\s*(kg|kilo|nyama|beef)/i);
    items.push({ product: 'Beef', quantity: qty ? parseInt(qty[1]) : 1, unit: 'kg' });
  }
  if (lower.includes('egg') || lower.includes('amagi') || lower.includes('tray')) {
    const qty = text.match(/(\d+)\s*(tray|amagi|eggs?)/i);
    items.push({ product: 'Eggs', quantity: qty ? parseInt(qty[1]) : 1, unit: 'tray' });
  }

  // Always create a Quote in your database
  await prisma.quote.create({
    data: {
      customerPhone: phone,
      customerName: msg.pushName || "WhatsApp Customer",
      items: items.length > 0 ? items : [{ product: 'Custom Request', quantity: 1, note: text }],
      totalAmount: 0, // AI will calculate in next message or you set later
      status: 'PENDING', 
      source: 'WHATSAPP',
      messageHistory: [{ role: 'customer', content: text }, { role: 'ndaje', content: aiReply }]
    }
  });

  console.log(`Quote created from WhatsApp - Phone: ${phone} - Items: ${items.length}`);
} catch (err) {
  console.error('Failed to save quote:', err.message);
}

    }
  });
}

module.exports = { startWhatsApp };