const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

app.use(express.json());

const authorizedTokens = new Map();
const userSessions = new Map();

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔐 Get Auth Token', callback_data: 'get_token' }],
      [{ text: '📧 Create Email', callback_data: 'create_email' }],
      [{ text: '📦 Bulk Create', callback_data: 'bulk_create' }],
      [{ text: '✅ List Emails', callback_data: 'list_emails' }],
      [{ text: '❌ Delete Email', callback_data: 'delete_email' }],
    ]
  };
  
  bot.sendMessage(chatId, 
    '🤖 *Email Router Bot*\n\n' +
    'Welcome! This bot manages email on your Cloudflare domain.\n\n' +
    'Domain: ' + process.env.EMAIL_DOMAIN + '\n' +
    'Get your auth token to proceed.',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// Callback query handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    if (data === 'get_token') {
      const token = generateToken();
      authorizedTokens.set(token, {
        chatId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        permissions: ['create', 'delete', 'list', 'bulk']
      });

      bot.sendMessage(chatId,
        '🔐 *Your Authorization Token*\n\n' +
        '```\n' + token + '\n```\n\n' +
        'Keep this safe! Expires in 30 days.',
        { parse_mode: 'Markdown' }
      );
    }
    else if (data === 'create_email') {
      userSessions.set(chatId, { mode: 'create_email', step: 'username' });
      bot.sendMessage(chatId, '📧 Enter username (e.g., john):');
    }
    else if (data === 'bulk_create') {
      userSessions.set(chatId, { mode: 'bulk_create', step: 'pattern' });
      bot.sendMessage(chatId, '📦 Enter pattern (e.g., user1-100):');
    }
    else if (data === 'delete_email') {
      userSessions.set(chatId, { mode: 'delete_email', step: 'username' });
      bot.sendMessage(chatId, '❌ Enter full email to delete:');
    }

    bot.answerCallbackQuery(query.id);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message);
  }
});

// Handle text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  const session = userSessions.get(chatId);
  
  try {
    if (session?.mode === 'create_email' && session.step === 'username') {
      session.username = text.toLowerCase().trim();
      session.step = 'confirm';
      userSessions.set(chatId, session);
      
      const fullEmail = session.username + '@' + process.env.EMAIL_DOMAIN;
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: `confirm_create_${session.username}` },
            { text: '❌ Cancel', callback_data: 'cancel_' }
          ]
        ]
      };
      
      bot.sendMessage(chatId, '📧 Create: `' + fullEmail + '`\n\nCorrect?',
        { parse_mode: 'Markdown', reply_markup: keyboard });
    }
    else if (session?.mode === 'bulk_create' && session.step === 'pattern') {
      const pattern = text.toLowerCase().trim();
      const match = pattern.match(/^([a-z0-9]+)(\d+)-(\d+)$/i);
      
      if (!match) {
        bot.sendMessage(chatId, '❌ Invalid format. Use: basename1-100');
        return;
      }

      const [, basename, start, end] = match;
      session.basename = basename;
      session.start = parseInt(start);
      session.end = parseInt(end);
      session.step = 'confirm';
      userSessions.set(chatId, session);

      const count = session.end - session.start + 1;
      if (count > 1000) {
        bot.sendMessage(chatId, '❌ Maximum 1000 emails per request');
        return;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: `✅ Create ${count}`, callback_data: `confirm_bulk_${session.basename}_${session.start}_${session.end}` },
            { text: '❌ Cancel', callback_data: 'cancel_' }
          ]
        ]
      };

      bot.sendMessage(chatId,
        '📦 Create ' + count + ' emails?\n\nStart: ' + basename + session.start + '\nEnd: ' + basename + session.end,
        { reply_markup: keyboard });
    }
    else if (session?.mode === 'delete_email' && session.step === 'username') {
      session.email = text.toLowerCase().trim();
      session.step = 'confirm';
      userSessions.set(chatId, session);

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Delete', callback_data: `confirm_delete_${session.email}` },
            { text: '❌ Cancel', callback_data: 'cancel_' }
          ]
        ]
      };

      bot.sendMessage(chatId, '⚠️ Delete: ' + session.email + '\n\nCannot undo!',
        { reply_markup: keyboard });
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message);
  }
});

// Confirmation callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('confirm_create_')) {
    const username = data.replace('confirm_create_', '');
    try {
      await createEmailRoute(username);
      bot.sendMessage(chatId, '✅ Email created: ' + username + '@' + process.env.EMAIL_DOMAIN);
      userSessions.delete(chatId);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Error: ' + error.message);
    }
  }
  else if (data.startsWith('confirm_bulk_')) {
    const parts = data.replace('confirm_bulk_', '').split('_');
    const basename = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);

    bot.sendMessage(chatId, '⏳ Creating emails...');
    
    try {
      const results = await bulkCreateEmails(basename, start, end);
      bot.sendMessage(chatId,
        '✅ Complete\n\nCreated: ' + results.success + '\nFailed: ' + results.failed);
      userSessions.delete(chatId);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Error: ' + error.message);
    }
  }
  else if (data.startsWith('confirm_delete_')) {
    const email = data.replace('confirm_delete_', '');
    try {
      await deleteEmailRoute(email);
      bot.sendMessage(chatId, '✅ Deleted: ' + email);
      userSessions.delete(chatId);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Error: ' + error.message);
    }
  }
  else if (data === 'cancel_') {
    userSessions.delete(chatId);
    bot.sendMessage(chatId, '❌ Cancelled');
  }
});

// API Endpoints
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });
  if (!authorizedTokens.has(token)) return res.status(403).json({ error: 'Invalid token' });

  const tokenData = authorizedTokens.get(token);
  if (new Date() > tokenData.expiresAt) {
    authorizedTokens.delete(token);
    return res.status(403).json({ error: 'Token expired' });
  }

  req.token = token;
  next();
};

app.post('/api/emails/create', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const result = await createEmailRoute(username);
    res.json({ success: true, email: username + '@' + process.env.EMAIL_DOMAIN, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emails/bulk', authenticateToken, async (req, res) => {
  try {
    const { basename, start, end } = req.body;
    if (!basename || !start || !end) return res.status(400).json({ error: 'Missing parameters' });

    if (end - start + 1 > 1000) return res.status(400).json({ error: 'Max 1000' });

    const results = await bulkCreateEmails(basename, start, end);
    res.json({ success: true, ...results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/emails/:email', authenticateToken, async (req, res) => {
  try {
    const email = req.params.email;
    await deleteEmailRoute(email);
    res.json({ success: true, email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/token', (req, res) => {
  const { secret } = req.body;
  if (secret !== process.env.API_SECRET) return res.status(401).json({ error: 'Invalid secret' });

  const token = generateToken();
  authorizedTokens.set(token, {
    chatId: 'api-user',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    permissions: ['create', 'delete', 'list', 'bulk']
  });

  res.json({ success: true, token, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
});

// Cloudflare Integration
async function createEmailRoute(username) {
  const url = `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/email/routing/rules`;

  const response = await axios.post(url, {
    enabled: true,
    priority: Math.floor(Math.random() * 1000),
    matchers: [{ type: 'literal', field: 'to', value: username + '@' + process.env.EMAIL_DOMAIN }],
    actions: [{ type: 'forward', values: [process.env.FORWARD_EMAIL] }]
  }, {
    headers: {
      'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
      'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
      'Content-Type': 'application/json'
    }
  });

  if (!response.data.success) throw new Error(response.data.errors[0]?.message || 'Cloudflare error');
  return { ruleId: response.data.result.id };
}

async function bulkCreateEmails(basename, start, end) {
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = start; i <= end; i++) {
    try {
      await createEmailRoute(basename + i);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ index: i, error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

async function deleteEmailRoute(email) {
  const url = `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/email/routing/rules`;

  const getResponse = await axios.get(url, {
    headers: {
      'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
      'X-Auth-Email': process.env.CLOUDFLARE_EMAIL
    }
  });

  const rule = getResponse.data.result.find(r => r.matchers?.[0]?.value === email);
  if (!rule) throw new Error('Email not found');

  const deleteUrl = `${url}/${rule.id}`;
  const deleteResponse = await axios.delete(deleteUrl, {
    headers: {
      'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
      'X-Auth-Email': process.env.CLOUDFLARE_EMAIL
    }
  });

  if (!deleteResponse.data.success) throw new Error('Failed to delete');
  return { ruleId: rule.id };
}

function generateToken() {
  return 'et_' + crypto.randomBytes(32).toString('hex');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
  console.log(`📧 Domain: ${process.env.EMAIL_DOMAIN}`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  bot.stopPolling();
  process.exit(0);
});
