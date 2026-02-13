// ================================================================
// AI CHAT APPLICATION - Frontend
// ================================================================

const socket = io();

// DOM elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const chatsList = document.getElementById('chats-list');
const userCountText = document.getElementById('user-count-text');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatTitle = document.getElementById('current-chat-title');
const renameChatBtn = document.getElementById('rename-chat-btn');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const error = document.getElementById('error');
const errorMessage = document.getElementById('error-message');

// State
let chats = {};
let activeChat = null;
let isProcessing = false;

// Socket.io event handlers
socket.on('connect', () => {
    console.log('✅ Connected to server');
});

socket.on('user-count', (count) => {
    userCountText.textContent = count === 1 ? '1 онлайн' : `${count} онлайн`;
});

socket.on('chats', (chatsArray) => {
    console.log(`📚 Received ${chatsArray.length} chats`);

    chatsArray.forEach(chat => {
        chats[chat.id] = chat;
    });

    renderChatsList();

    // Select first chat as active
    if (chatsArray.length > 0 && !activeChat) {
        switchToChat(chatsArray[0].id);
    }
});

socket.on('chat-created', (newChat) => {
    console.log('✨ New chat created:', newChat.id);
    chats[newChat.id] = newChat;
    renderChatsList();
    switchToChat(newChat.id);
});

socket.on('message-added', (data) => {
    const { chatId, message, chatTitle } = data;

    if (!chats[chatId]) {
        chats[chatId] = { id: chatId, title: chatTitle, messages: [], createdAt: new Date().toISOString() };
    }

    // Add message if not already exists
    if (!chats[chatId].messages.find(m => m.id === message.id)) {
        chats[chatId].messages.push(message);
    }

    // Update title if changed
    if (chatTitle !== chats[chatId].title) {
        chats[chatId].title = chatTitle;
    }

    renderChatsList();

    // If this is the active chat, add message to view
    if (chatId === activeChat) {
        renderChatMessages();
    }
});

socket.on('chat-title-updated', (data) => {
    const { chatId, title } = data;
    if (chats[chatId]) {
        chats[chatId].title = title;
        renderChatsList();
        if (chatId === activeChat) {
            currentChatTitle.textContent = title;
        }
    }
});

socket.on('chat-deleted', (chatId) => {
    console.log('🗑️ Chat deleted:', chatId);

    if (chats[chatId]) {
        delete chats[chatId];
        renderChatsList();

        // If deleted chat was active, switch to another chat
        if (activeChat === chatId) {
            const remainingChats = Object.keys(chats);
            if (remainingChats.length > 0) {
                switchToChat(remainingChats[0]);
            } else {
                activeChat = null;
                currentChatTitle.textContent = 'Нет чатов';
                renderChatMessages();
            }
        }
    }
});

// Create new chat
let isCreatingChat = false;
newChatBtn.addEventListener('click', () => {
    if (isCreatingChat) return;

    isCreatingChat = true;
    newChatBtn.disabled = true;
    newChatBtn.style.opacity = '0.6';

    socket.emit('create-chat');

    setTimeout(() => {
        isCreatingChat = false;
        newChatBtn.disabled = false;
        newChatBtn.style.opacity = '1';
    }, 1000);
});

// Rename chat
renameChatBtn.addEventListener('click', () => {
    if (!activeChat) return;

    const newTitle = prompt('Введите новое название чата:', chats[activeChat].title);
    if (newTitle && newTitle.trim()) {
        socket.emit('update-chat-title', {
            chatId: activeChat,
            title: newTitle.trim()
        });
    }
});

// Delete chat
deleteChatBtn.addEventListener('click', () => {
    if (!activeChat) return;

    const chatTitle = chats[activeChat].title;
    const confirmed = confirm(`Вы уверены, что хотите удалить чат "${chatTitle}"?`);

    if (confirmed) {
        socket.emit('delete-chat', activeChat);
    }
});

// Toggle sidebar (mobile)
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    document.body.classList.toggle('sidebar-active');
});

// Render chats list
function renderChatsList() {
    const chatsArray = Object.values(chats).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (chatsArray.length === 0) {
        chatsList.innerHTML = `
            <div class="empty-chats">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>Нет чатов</p>
                <span>Создайте новый чат</span>
            </div>
        `;
        return;
    }

    chatsList.innerHTML = chatsArray.map(chat => {
        const lastMessage = chat.messages[chat.messages.length - 1];
        const preview = lastMessage ?
            (lastMessage.content || lastMessage.result || '').substring(0, 50) + '...' :
            'Пустой чат';

        return `
            <div class="chat-item ${chat.id === activeChat ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="chat-item-title">${chat.title}</div>
                <div class="chat-item-preview">${preview}</div>
                <div class="chat-item-meta">
                    <span class="chat-item-time">${formatTime(chat.createdAt)}</span>
                    ${chat.messages.length > 0 ? `<span class="chat-item-count">${chat.messages.length}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Event delegation for chat items
chatsList.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.chat-item');
    if (chatItem) {
        const chatId = chatItem.dataset.chatId;
        switchToChat(chatId);
    }
});

// Switch to chat
function switchToChat(chatId) {
    if (!chats[chatId]) return;

    activeChat = chatId;
    currentChatTitle.textContent = chats[chatId].title;

    renderChatsList();
    renderChatMessages();

    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-active');
    }

    // Focus input
    messageInput.focus();
}

// Render chat messages
function renderChatMessages() {
    if (!activeChat || !chats[activeChat]) {
        chatMessages.innerHTML = getWelcomeMessage();
        return;
    }

    const messages = chats[activeChat].messages;

    if (messages.length === 0) {
        chatMessages.innerHTML = getWelcomeMessage();
        return;
    }

    chatMessages.innerHTML = messages.map(msg => {
        const isUser = msg.role === 'user';
        const avatarIcon = isUser ? '👤' : '🤖';
        const content = msg.content || msg.result || '';

        return `
            <div class="message-bubble ${msg.role}">
                <div class="avatar">${avatarIcon}</div>
                <div class="content">${isUser ? escapeHtml(content) : marked.parse(content)}</div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Welcome message
function getWelcomeMessage() {
    return `
        <div class="welcome-message">
            <div class="logo">
                <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </div>
            <h1>AI Chat</h1>
            <p class="subtitle">Умный помощник на базе GPT-4</p>
            <p class="hint-text">Начните разговор - напишите сообщение ниже</p>
        </div>
    `;
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || isProcessing) return;
    if (!activeChat) {
        showError('Создайте чат или выберите существующий');
        return;
    }

    // Clear input and disable
    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    isProcessing = true;
    hideError();

    // Add user message locally
    const userMessage = {
        id: Date.now(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    };

    chats[activeChat].messages.push(userMessage);
    renderChatMessages();

    // Emit to server for sync
    socket.emit('add-message', {
        chatId: activeChat,
        message: userMessage
    });

    // Show typing indicator
    showTypingIndicator();

    try {
        // Get chat history for context (last 10 messages)
        const chatHistory = chats[activeChat].messages
            .slice(-10)
            .map(m => ({
                role: m.role,
                content: m.content || m.result
            }));

        // Call AI API with streaming
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                chatHistory: chatHistory.slice(0, -1) // Exclude the last message we just added
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'AI request failed');
        }

        // Process streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessageContent = '';
        let aiMessageElement = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    if (data === '[DONE]') {
                        break;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            aiMessageContent += parsed.content;

                            // Update or create AI message bubble
                            if (!aiMessageElement) {
                                removeTypingIndicator();
                                const aiMessage = {
                                    id: Date.now() + 1,
                                    role: 'assistant',
                                    content: aiMessageContent,
                                    timestamp: new Date().toISOString()
                                };
                                chats[activeChat].messages.push(aiMessage);
                                renderChatMessages();

                                // Get reference to the last message for live updates
                                const messageBubbles = chatMessages.querySelectorAll('.message-bubble.assistant');
                                aiMessageElement = messageBubbles[messageBubbles.length - 1]?.querySelector('.content');
                            } else {
                                // Update existing message
                                aiMessageElement.innerHTML = marked.parse(aiMessageContent);
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }
            }
        }

        // Save final AI message to server
        const finalAIMessage = chats[activeChat].messages[chats[activeChat].messages.length - 1];
        socket.emit('add-message', {
            chatId: activeChat,
            message: finalAIMessage
        });

        // Auto-update chat title if first message
        if (chats[activeChat].messages.length === 2 && chats[activeChat].title === 'Новый чат') {
            const summaryTitle = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            socket.emit('update-chat-title', {
                chatId: activeChat,
                title: summaryTitle
            });
        }

    } catch (err) {
        console.error('AI Error:', err);
        showError(err.message || 'Не удалось получить ответ от AI');
        removeTypingIndicator();

        // Remove user message if AI failed
        chats[activeChat].messages.pop();
        renderChatMessages();
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        isProcessing = false;
        messageInput.focus();
    }
}

// Typing indicator
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message-bubble assistant typing-bubble';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

// Error handling
function showError(msg) {
    error.classList.remove('hidden');
    errorMessage.textContent = msg;
}

function hideError() {
    error.classList.add('hidden');
}

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ч`;

    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

console.log('🤖 AI Chat ready!');
