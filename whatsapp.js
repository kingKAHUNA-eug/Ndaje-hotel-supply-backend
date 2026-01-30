import { Boom } from '@hapi/boom';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import axios from 'axios';

let sock;

export const startWhatsApp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // First time only – scan once with your phone
    defaultQueryTimeoutMs: 60000
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connected – Ndaje is ALIVE');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.key.fromMe && m.type === 'notify') {
      const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
      const message = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      // Call your Python AI
      const aiResponse = await axios.post("https://ndaje-python-ai.onrender.com/ai", {
        message: message,
        name: msg.pushName || "Customer"
      });

      const reply = aiResponse.data.reply;

      await sock.sendMessage(msg.key.remoteJid, { text: reply });
    }
  });
};