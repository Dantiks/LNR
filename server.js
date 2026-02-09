const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// In-memory storage for chats (ChatGPT-style)
// Structure: { chatId: { id, title, createdAt, messages: [] } }
let chats = {};
let connectedUsers = 0;

// Create initial default chat
const defaultChatId = 'chat-' + Date.now();
chats[defaultChatId] = {
  id: defaultChatId,
  title: 'Новый чат',
  createdAt: new Date().toISOString(),
  messages: []
};

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint for fetching and extracting text from URL
app.post('/api/fetch-url', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Fetch the webpage with browser-like headers
    const response = await axios.get(validUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });

    // Parse HTML and extract text
    const $ = cheerio.load(response.data);

    // Remove script, style, and other non-content tags
    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Get text from main content areas
    let text = '';

    // Try to find main content
    const mainContent = $('main, article, .content, .post, .article, #content').first();
    if (mainContent.length) {
      text = mainContent.text();
    } else {
      // Fallback to body
      text = $('body').text();
    }

    // Clean up the text
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'Could not extract meaningful text from URL' });
    }

    res.json({ text, url: validUrl.href });

  } catch (error) {
    console.error('Error fetching URL:', error.message);
    console.error('Error details:', {
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    if (error.code === 'ENOTFOUND') {
      return res.status(404).json({
        error: 'Сайт не найден. Проверьте правильность URL.'
      });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: 'Превышено время ожидания. Сайт слишком долго не отвечает.'
      });
    }

    if (error.response) {
      const status = error.response.status;
      if (status === 403) {
        return res.status(403).json({
          error: 'Доступ запрещён. Сайт блокирует автоматические запросы.'
        });
      }
      if (status === 404) {
        return res.status(404).json({
          error: 'Страница не найдена (404). Проверьте правильность ссылки.'
        });
      }
      if (status >= 500) {
        return res.status(502).json({
          error: 'Ошибка на сервере сайта. Попробуйте позже.'
        });
      }
      return res.status(status).json({
        error: `Ошибка загрузки страницы (код ${status})`
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Не удалось подключиться к сайту.'
      });
    }

    res.status(500).json({
      error: 'Не удалось загрузить содержимое URL. Попробуйте другую ссылку.'
    });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  connectedUsers++;
  console.log(`👤 User connected. Total users: ${connectedUsers}`);

  // Send current user count to all clients
  io.emit('user-count', connectedUsers);

  // Send all chats to newly connected client
  socket.emit('chats', Object.values(chats));

  // Handle create new chat
  socket.on('create-chat', () => {
    const newChatId = 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const newChat = {
      id: newChatId,
      title: 'Новый чат',
      createdAt: new Date().toISOString(),
      messages: []
    };

    chats[newChatId] = newChat;

    // Broadcast new chat to all clients
    io.emit('chat-created', newChat);

    console.log(`✨ New chat created: ${newChatId}`);
  });

  // Handle switch chat (for logging purposes)
  socket.on('switch-chat', (chatId) => {
    console.log(`🔄 User switched to chat: ${chatId}`);
  });

  // Handle new message in a specific chat
  socket.on('new-message', (data) => {
    const { chatId, message } = data;

    if (!chats[chatId]) {
      console.error(`❌ Chat not found: ${chatId}`);
      return;
    }

    // Add timestamp and ID to message
    const messageWithMeta = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      ...message
    };

    // Add message to chat
    chats[chatId].messages.push(messageWithMeta);

    // Keep only last 50 messages per chat
    if (chats[chatId].messages.length > 50) {
      chats[chatId].messages = chats[chatId].messages.slice(-50);
    }

    // Auto-update chat title based on first message
    if (chats[chatId].messages.length === 1 && chats[chatId].title === 'Новый чат') {
      const shortTitle = message.result.substring(0, 30) + (message.result.length > 30 ? '...' : '');
      chats[chatId].title = shortTitle;
    }

    // Broadcast message to all clients
    io.emit('message-added', {
      chatId: chatId,
      message: messageWithMeta,
      chatTitle: chats[chatId].title
    });

    console.log(`📝 Message added to chat ${chatId}: ${message.type}`);
  });

  // Handle chat title update
  socket.on('update-chat-title', (data) => {
    const { chatId, title } = data;

    if (!chats[chatId]) {
      console.error(`❌ Chat not found: ${chatId}`);
      return;
    }

    chats[chatId].title = title;

    // Broadcast title update to all clients
    io.emit('chat-title-updated', { chatId, title });

    console.log(`✏️ Chat title updated: ${chatId} -> ${title}`);
  });
  
  // Handle chat deletion
  socket.on('delete-chat', (chatId) => {
    if (!chats[chatId]) {
      console.error(`❌ Chat not found: ${chatId}`);
      return;
    }
    
    delete chats[chatId];
    io.emit('chat-deleted', chatId);
    
    console.log(`🗑️ Chat deleted: ${chatId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    connectedUsers--;
    console.log(`👤 User disconnected. Total users: ${connectedUsers}`);
    io.emit('user-count', connectedUsers);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Open your browser and navigate to the URL above`);
  console.log(`🔌 Socket.io ready for real-time collaboration`);
  console.log(`💬 Default chat ID: ${defaultChatId}`);
});
