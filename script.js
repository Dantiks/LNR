// VERCEL VERSION - LocalStorage instead of Socket.io
// Real-time features disabled for Vercel deployment

// DOM elements
const tabs = document.querySelectorAll('.tab');
const textTab = document.getElementById('text-tab');
const urlTab = document.getElementById('url-tab');
const textInput = document.getElementById('text-input');
const urlInput = document.getElementById('url-input');
const charCount = document.getElementById('char-count');
const processBtn = document.getElementById('process-btn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('error-message');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');
const chatsList = document.getElementById('chats-list');
const userCountText = document.getElementById('user-count-text');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatTitle = document.getElementById('current-chat-title');
const renameChatBtn = document.getElementById('rename-chat-btn');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const chatMessages = document.getElementById('chat-messages');

let currentTab = 'text';
let chats = JSON.parse(localStorage.getItem('chats') || '{}');
let activeChat = localStorage.getItem('activeChat') || null;

// Initialize
function init() {
    userCountText.textContent = 'Только вы (Vercel)';

    if (Object.keys(chats).length === 0) {
        createChat();
    } else if (activeChat && chats[activeChat]) {
        switchToChat(activeChat);
    } else {
        const firstChat = Object.keys(chats)[0];
        if (firstChat) switchToChat(firstChat);
    }

    renderChatsList();
}

// Save to localStorage
function saveChats() {
    localStorage.setItem('chats', JSON.stringify(chats));
    localStorage.setItem('activeChat', activeChat);
}

// Create new chat
function createChat() {
    const newChatId = 'chat-' + Date.now();
    const newChat = {
        id: newChatId,
        title: 'Новый чат',
        createdAt: new Date().toISOString(),
        messages: []
    };

    chats[newChatId] = newChat;
    saveChats();
    renderChatsList();
    switchToChat(newChatId);
    console.log('✨ New chat created:', newChatId);
}

newChatBtn.addEventListener('click', () => {
    createChat();
});

// Rename chat
renameChatBtn.addEventListener('click', () => {
    if (!activeChat) return;

    const newTitle = prompt('Введите новое название чата:', chats[activeChat].title);
    if (newTitle && newTitle.trim()) {
        chats[activeChat].title = newTitle.trim();
        saveChats();
        currentChatTitle.textContent = newTitle.trim();
        renderChatsList();
    }
});

// Delete chat
deleteChatBtn.addEventListener('click', () => {
    if (!activeChat) return;

    const chatTitle = chats[activeChat].title;
    const confirmed = confirm(`Вы уверены, что хотите удалить чат "${chatTitle}"?`);

    if (confirmed) {
        delete chats[activeChat];
        saveChats();

        const remainingChats = Object.keys(chats);
        if (remainingChats.length > 0) {
            switchToChat(remainingChats[0]);
        } else {
            activeChat = null;
            currentChatTitle.textContent = 'Нет чатов';
            createChat();
        }
        renderChatsList();
    }
});

// Toggle sidebar (mobile)
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    document.body.classList.toggle('sidebar-active');
});

// Tab switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        currentTab = tabName;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (tabName === 'text') {
            textTab.classList.remove('hidden');
            urlTab.classList.add('hidden');
        } else {
            textTab.classList.add('hidden');
            urlTab.classList.remove('hidden');
        }

        error.classList.add('hidden');
    });
});

// Character counter
textInput.addEventListener('input', () => {
    charCount.textContent = textInput.value.length;
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
        const preview = lastMessage ? lastMessage.result.substring(0, 50) + '...' : 'Пустой чат';

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
    saveChats();

    renderChatsList();
    renderChatMessages();

    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-active');
    }
}

// Render chat messages
function renderChatMessages() {
    if (!activeChat || !chats[activeChat]) return;

    const messages = chats[activeChat].messages;

    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="welcome-message">
                <div class="logo">
                    <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h1>Text Shortener</h1>
                <p class="subtitle">Умное сокращение текста до 80-120 символов</p>
                <p class="hint-text">Начните вводить текст или URL ниже</p>
            </div>
        `;
        return;
    }

    chatMessages.innerHTML = messages.map(msg => {
        const typeIcon = msg.type === 'url'
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />';

        return `
            <div class="message-bubble">
                <div class="message-header">
                    <div class="message-type-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            ${typeIcon}
                        </svg>
                        ${msg.type === 'url' ? 'URL' : 'Текст'}
                    </div>
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-content">
                    ${msg.original ? `<div class="message-original">${msg.original.substring(0, 200)}${msg.original.length > 200 ? '...' : ''}</div>` : ''}
                    <div class="message-result">${msg.result}</div>
                    <div class="message-actions">
                        <button class="message-action-btn" onclick="copyText('${msg.result.replace(/'/g, "\\'")}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Копировать
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Copy text helper
window.copyText = async function (text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('✅ Copied to clipboard');
    } catch (err) {
        console.error('Failed to copy:', err);
    }
};

// Format time
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

// Smart text shortening algorithm
function shortenText(text, minLength = 80, maxLength = 120) {
    text = text.trim().replace(/\s+/g, ' ');

    if (text.length <= maxLength) {
        return text;
    }

    const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let bestBreak = -1;

    for (let ending of sentenceEndings) {
        let pos = text.indexOf(ending, minLength);
        if (pos > 0 && pos <= maxLength) {
            bestBreak = pos + 1;
            break;
        }
    }

    if (bestBreak > 0) {
        return text.substring(0, bestBreak).trim();
    }

    const punctuation = [', ', '; ', ' - '];
    for (let punct of punctuation) {
        let pos = text.lastIndexOf(punct, maxLength);
        if (pos >= minLength) {
            return text.substring(0, pos).trim() + '...';
        }
    }

    let lastSpace = text.lastIndexOf(' ', maxLength);
    if (lastSpace >= minLength) {
        return text.substring(0, lastSpace).trim() + '...';
    }

    return text.substring(0, maxLength - 3).trim() + '...';
}

// Show/hide functions
function showError(message) {
    error.classList.remove('hidden');
    errorMessage.textContent = message;
    loading.classList.add('hidden');
}

function hideError() {
    error.classList.add('hidden');
}

function showLoading() {
    loading.classList.remove('hidden');
    hideError();
}

function hideLoading() {
    loading.classList.add('hidden');
}

// Add message to chat
function addMessage(type, original, result) {
    if (!activeChat) return;

    const message = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: type,
        original: original,
        result: result
    };

    chats[activeChat].messages.push(message);

    // Auto-update chat title from first message
    if (chats[activeChat].messages.length === 1 && chats[activeChat].title === 'Новый чат') {
        const shortTitle = result.substring(0, 30) + (result.length > 30 ? '...' : '');
        chats[activeChat].title = shortTitle;
        currentChatTitle.textContent = shortTitle;
    }

    saveChats();
    renderChatMessages();
    renderChatsList();
}

// Process text
async function processText() {
    if (!activeChat) {
        showError('Создайте или выберите чат');
        return;
    }

    hideError();

    if (currentTab === 'text') {
        const text = textInput.value.trim();

        if (!text) {
            showError('Пожалуйста, введите текст для сокращения');
            return;
        }

        if (text.length < 80) {
            showError('Текст слишком короткий. Минимальная длина: 80 символов');
            return;
        }

        showLoading();

        setTimeout(() => {
            const shortened = shortenText(text);
            addMessage('text', text, shortened);
            hideLoading();
            textInput.value = '';
            charCount.textContent = '0';
        }, 500);

    } else {
        const url = urlInput.value.trim();

        if (!url) {
            showError('Пожалуйста, введите URL');
            return;
        }

        showLoading();

        try {
            const response = await fetch('/api/fetch-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка при загрузке URL');
            }

            const shortened = shortenText(data.text);
            addMessage('url', data.text, shortened);
            hideLoading();
            urlInput.value = '';

        } catch (err) {
            console.error('Error:', err);
            hideLoading();
            showError(err.message || 'Не удалось обработать URL');
        }
    }
}

// Event listeners
processBtn.addEventListener('click', processText);

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        processText();
    }
});

textInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        processText();
    }
});

// Initialize on load
init();
