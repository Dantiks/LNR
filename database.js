const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'chats.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
`);

// Prepared statements for better performance
const statements = {
    // Chats
    getAllChats: db.prepare('SELECT * FROM chats ORDER BY created_at DESC'),
    getChat: db.prepare('SELECT * FROM chats WHERE id = ?'),
    insertChat: db.prepare('INSERT OR REPLACE INTO chats (id, title, created_at) VALUES (?, ?, ?)'),
    updateChatTitle: db.prepare('UPDATE chats SET title = ? WHERE id = ?'),
    deleteChat: db.prepare('DELETE FROM chats WHERE id = ?'),

    // Messages
    getMessages: db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC'),
    insertMessage: db.prepare('INSERT INTO messages (chat_id, role, content, type, timestamp) VALUES (?, ?, ?, ?, ?)'),
    deleteMessages: db.prepare('DELETE FROM messages WHERE chat_id = ?')
};

// Database operations
const dbOps = {
    // Load all chats with messages
    loadAllChats() {
        const chatsArray = statements.getAllChats.all();
        const chats = {};

        for (const chat of chatsArray) {
            const messages = statements.getMessages.all(chat.id);
            chats[chat.id] = {
                id: chat.id,
                title: chat.title,
                createdAt: chat.created_at,
                messages: messages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    type: msg.type,
                    timestamp: msg.timestamp
                }))
            };
        }

        return chats;
    },

    // Save chat
    saveChat(chat) {
        statements.insertChat.run(chat.id, chat.title, chat.createdAt);
    },

    // Save message
    saveMessage(chatId, message) {
        statements.insertMessage.run(
            chatId,
            message.role,
            message.content,
            message.type,
            message.timestamp
        );
    },

    // Update chat title
    updateTitle(chatId, title) {
        statements.updateChatTitle.run(title, chatId);
    },

    // Delete chat
    deleteChat(chatId) {
        statements.deleteChat.run(chatId);
    }
};

module.exports = dbOps;
