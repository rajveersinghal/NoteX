// ===== Configuration =====
const API_BASE_URL = 'http://localhost:8000';

// ===== App State =====
const AppState = {
    theme: localStorage.getItem('notex_theme') || 'light',
    selectedModel: localStorage.getItem('notex_selectedModel') || '2.5 Flash',
    currentChatId: null,
    sidebarOpen: false,
    isProcessing: false,
    conversations: JSON.parse(localStorage.getItem('notex_conversations') || '[]'),
    lastSummaryContext: null // Store last summary for context-aware chat
};

// ===== DOM Elements =====
const elements = {
    sidebar: document.getElementById('sidebar'),
    newChatBtn: document.getElementById('new-chat-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPopover: document.getElementById('settings-popover'),
    themeToggle: document.getElementById('theme-toggle'),
    chatHistory: document.getElementById('chat-history'),
    menuToggle: document.getElementById('menu-toggle'),
    modelSelectorBtn: document.getElementById('model-selector-btn'),
    modelDropdown: document.getElementById('model-dropdown'),
    selectedModelText: document.getElementById('selected-model'),
    chatWindow: document.getElementById('chat-window'),
    welcomeScreen: document.getElementById('welcome-screen'),
    messages: document.getElementById('messages'),
    flashBtn: document.getElementById('flash-btn'),
    uploadBtn: document.getElementById('upload-btn'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    fileInput: document.getElementById('file-input'),
    youtubeModal: document.getElementById('youtube-modal'),
    youtubeLink: document.getElementById('youtube-link')
};

// ===== API Functions =====
async function summarizeYouTube(url, model) {
    const response = await fetch(`${API_BASE_URL}/api/summarize/youtube`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, model })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to summarize video');
    }
    
    return await response.json();
}

async function summarizeDocument(file, model) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);
    
    const response = await fetch(`${API_BASE_URL}/api/summarize/document`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to summarize document');
    }
    
    return await response.json();
}

async function sendChatMessage(message, history, model, context = null) {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            message, 
            history,
            model,
            context 
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get chat response');
    }
    
    return await response.json();
}

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        return await response.json();
    } catch (error) {
        console.error('API health check failed:', error);
        return null;
    }
}

// ===== Utility Functions =====
function saveToStorage(key, value) {
    localStorage.setItem(`notex_${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    AppState[key] = value;
}

function loadFromStorage(key, defaultValue) {
    const stored = localStorage.getItem(`notex_${key}`);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return stored;
        }
    }
    return defaultValue;
}

// ===== Theme Management =====
function initTheme() {
    applyTheme(AppState.theme);
}

function applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    updateThemeToggleText();
}

function toggleTheme() {
    AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
    applyTheme(AppState.theme);
    saveToStorage('theme', AppState.theme);
    if (elements.settingsPopover) {
        elements.settingsPopover.style.display = 'none';
    }
}

function updateThemeToggleText() {
    if (!elements.themeToggle) return;
    const icon = AppState.theme === 'light' ? '🌙' : '☀️';
    const text = AppState.theme === 'light' ? 'Dark Mode' : 'Light Mode';
    elements.themeToggle.innerHTML = `<span class="icon">${icon}</span><span>${text}</span>`;
}

// ===== Sidebar Management =====
function toggleSidebar() {
    AppState.sidebarOpen = !AppState.sidebarOpen;
    if (elements.sidebar) {
        elements.sidebar.classList.toggle('sidebar--open', AppState.sidebarOpen);
    }
    if (elements.settingsPopover) {
        elements.settingsPopover.style.display = 'none';
    }
}

function closeSidebar() {
    AppState.sidebarOpen = false;
    if (elements.sidebar) {
        elements.sidebar.classList.remove('sidebar--open');
    }
}

function toggleSettingsPopover() {
    if (!elements.settingsPopover) return;
    const isHidden = elements.settingsPopover.style.display === 'none' || !elements.settingsPopover.style.display;
    elements.settingsPopover.style.display = isHidden ? 'block' : 'none';
}

function handleNewChat() {
    AppState.currentChatId = null;
    AppState.lastSummaryContext = null;
    
    if (elements.messages) {
        elements.messages.innerHTML = '';
    }
    if (elements.welcomeScreen) {
        elements.welcomeScreen.style.display = 'block';
    }
    if (elements.chatInput) {
        elements.chatInput.value = '';
        elements.chatInput.focus();
    }
    
    updateChatHistory();
    
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

// ===== Chat History Management =====
function saveConversation(message, isUser) {
    if (!AppState.currentChatId) {
        AppState.currentChatId = Date.now().toString();
        const title = message.substring(0, 40) + (message.length > 40 ? '...' : '');
        AppState.conversations.unshift({
            id: AppState.currentChatId,
            title: title,
            messages: [],
            timestamp: Date.now()
        });
    }

    const conv = AppState.conversations.find(c => c.id === AppState.currentChatId);
    if (conv) {
        conv.messages.push({ content: message, isUser, timestamp: Date.now() });
        saveToStorage('conversations', AppState.conversations);
        updateChatHistory();
    }
}

function updateChatHistory() {
    if (!elements.chatHistory) return;
    
    elements.chatHistory.innerHTML = AppState.conversations.map(conv => `
        <li class="chat-history__item ${conv.id === AppState.currentChatId ? 'chat-history__item--active' : ''}" 
            data-chat-id="${conv.id}">
            <span class="icon">💬</span>
            <span class="chat-history__title">${conv.title}</span>
            <div class="chat-history__actions">
                <button class="chat-history__btn" data-action="share" title="Share">📤</button>
                <button class="chat-history__btn" data-action="delete" title="Delete">🗑️</button>
            </div>
        </li>
    `).join('');

    // Add click listeners
    document.querySelectorAll('.chat-history__item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-history__actions')) {
                loadConversation(item.dataset.chatId);
            }
        });
    });

    document.querySelectorAll('.chat-history__btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const chatId = btn.closest('.chat-history__item').dataset.chatId;
            
            if (action === 'delete') {
                deleteConversation(chatId);
            } else if (action === 'share') {
                shareConversation(chatId);
            }
        });
    });
}

function loadConversation(id) {
    const conv = AppState.conversations.find(c => c.id === id);
    if (!conv) return;

    AppState.currentChatId = id;
    elements.messages.innerHTML = '';
    hideWelcome();

    conv.messages.forEach(msg => addMessage(msg.content, msg.isUser, false));
    updateChatHistory();
    
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

function deleteConversation(id) {
    if (confirm('Are you sure you want to delete this conversation?')) {
        AppState.conversations = AppState.conversations.filter(c => c.id !== id);
        saveToStorage('conversations', AppState.conversations);
        
        if (AppState.currentChatId === id) {
            handleNewChat();
        } else {
            updateChatHistory();
        }
    }
}

function shareConversation(id) {
    const conv = AppState.conversations.find(c => c.id === id);
    if (!conv) return;

    const text = conv.messages.map(msg => 
        `${msg.isUser ? 'You' : 'NoteX'}: ${msg.content}`
    ).join('\n\n');

    if (navigator.share) {
        navigator.share({
            title: `NoteX: ${conv.title}`,
            text: text
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert('Conversation copied to clipboard!');
        });
    }
}

function getConversationHistory() {
    const conv = AppState.conversations.find(c => c.id === AppState.currentChatId);
    if (!conv) return [];
    
    return conv.messages.map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
    }));
}

// ===== Model Selector =====
function toggleModelDropdown() {
    if (!elements.modelDropdown) return;
    const isHidden = elements.modelDropdown.style.display === 'none' || !elements.modelDropdown.style.display;
    elements.modelDropdown.style.display = isHidden ? 'block' : 'none';
}

function handleModelSelection(e) {
    const option = e.target.closest('.model-selector__option');
    if (!option) return;
    
    const selectedModel = option.dataset.model;
    AppState.selectedModel = selectedModel;
    
    if (elements.selectedModelText) {
        elements.selectedModelText.textContent = selectedModel;
    }
    
    saveToStorage('selectedModel', selectedModel);
    
    if (elements.modelDropdown) {
        elements.modelDropdown.style.display = 'none';
    }
}

// ===== Message Management =====
function hideWelcome() {
    if (elements.welcomeScreen) {
        elements.welcomeScreen.style.display = 'none';
    }
}

function showWelcome() {
    if (elements.welcomeScreen) {
        elements.welcomeScreen.style.display = 'block';
    }
}

function createMessageElement(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message--${isUser ? 'user' : 'ai'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message__content';
    
    // Support markdown-style formatting
    const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    
    contentDiv.innerHTML = formattedContent;
    messageDiv.appendChild(contentDiv);
    
    // Add copy and share buttons for AI messages with substantial content
    if (!isUser && content.length > 100) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.innerHTML = '<span class="icon">📋</span><span>Copy</span>';
        copyBtn.onclick = () => {
            const plainText = content.replace(/<br>/g, '\n').replace(/<\/?strong>/g, '**');
            navigator.clipboard.writeText(plainText);
            copyBtn.innerHTML = '<span class="icon">✓</span><span>Copied!</span>';
            setTimeout(() => copyBtn.innerHTML = '<span class="icon">📋</span><span>Copy</span>', 2000);
        };
        
        const shareBtn = document.createElement('button');
        shareBtn.className = 'action-btn';
        shareBtn.innerHTML = '<span class="icon">↗️</span><span>Share</span>';
        shareBtn.onclick = () => {
            const plainText = content.replace(/<br>/g, '\n').replace(/<\/?strong>/g, '**');
            if (navigator.share) {
                navigator.share({ 
                    title: 'NoteX Response', 
                    text: plainText
                }).catch(() => {});
            } else {
                navigator.clipboard.writeText(plainText);
                alert('Response copied to clipboard!');
            }
        };
        
        actionsDiv.appendChild(copyBtn);
        actionsDiv.appendChild(shareBtn);
        contentDiv.appendChild(actionsDiv);
    }
    
    return messageDiv;
}

function addMessage(content, isUser = false, shouldSave = true) {
    if (!elements.messages) return;
    
    hideWelcome();
    
    const messageElement = createMessageElement(content, isUser);
    elements.messages.appendChild(messageElement);
    
    if (elements.chatWindow) {
        elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
    }
    
    if (shouldSave) {
        saveConversation(content, isUser);
    }
}

function addLoadingMessage() {
    if (!elements.messages) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message--ai message--loading';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = `
        <div class="message__content">
            <div class="loading-animation">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
            <span class="loading-text">Thinking...</span>
            <div class="loading-shimmer"></div>
        </div>
    `;
    
    elements.messages.appendChild(loadingDiv);
    
    if (elements.chatWindow) {
        elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
    }
}

function removeLoadingMessage() {
    const loadingMsg = document.getElementById('loading-message');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

// ===== Input Area Management =====
function handleTextareaInput() {
    if (!elements.chatInput) return;
    const textarea = elements.chatInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function handleTextareaKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
}

async function handleSendMessage() {
    if (!elements.chatInput || AppState.isProcessing) return;
    
    const message = elements.chatInput.value.trim();
    if (!message) return;
    
    AppState.isProcessing = true;
    addMessage(message, true);
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    addLoadingMessage();
    
    try {
        const history = getConversationHistory();
        const result = await sendChatMessage(
            message, 
            history.slice(0, -1), // Exclude the current message we just added
            AppState.selectedModel,
            AppState.lastSummaryContext
        );
        
        removeLoadingMessage();
        
        if (result.success && result.message) {
            addMessage(result.message, false);
        } else {
            throw new Error('No response generated');
        }
    } catch (error) {
        removeLoadingMessage();
        addMessage(`❌ Error: ${error.message}\n\nPlease check:\n• API is running at ${API_BASE_URL}\n• API keys are configured correctly`, false);
        console.error('Chat error:', error);
    } finally {
        AppState.isProcessing = false;
    }
}

// ===== Modal Management =====
function showModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    document.body.style.overflow = '';
}

function handleFlashButton() {
    if (elements.youtubeModal) {
        showModal(elements.youtubeModal);
    }
}

async function handleYoutubeModalSubmit() {
    if (!elements.youtubeLink || AppState.isProcessing) return;
    
    const link = elements.youtubeLink.value.trim();
    
    if (!link) {
        alert('Please enter a YouTube link');
        return;
    }
    
    // Validate YouTube URL
    const videoIdRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/;
    if (!videoIdRegex.test(link)) {
        alert('Please enter a valid YouTube URL');
        return;
    }
    
    AppState.isProcessing = true;
    
    addMessage(`📹 Summarizing YouTube video: ${link}`, true);
    addLoadingMessage();
    
    elements.youtubeLink.value = '';
    hideModal(elements.youtubeModal);
    
    try {
        const result = await summarizeYouTube(link, AppState.selectedModel);
        
        removeLoadingMessage();
        
        if (result.success && result.summary) {
            addMessage(result.summary, false);
            AppState.lastSummaryContext = result.summary; // Store for context-aware chat
        } else {
            throw new Error('No summary generated');
        }
    } catch (error) {
        removeLoadingMessage();
        addMessage(`❌ Error: ${error.message}\n\nPlease check:\n• Your API is running at ${API_BASE_URL}\n• The video has captions/subtitles available\n• Your API keys are configured correctly`, false);
        console.error('YouTube summarization error:', error);
    } finally {
        AppState.isProcessing = false;
    }
}

function handleYoutubeModalCancel() {
    if (elements.youtubeLink) {
        elements.youtubeLink.value = '';
    }
    hideModal(elements.youtubeModal);
}

// ===== File Upload =====
function handleUploadButton() {
    if (elements.fileInput) {
        elements.fileInput.click();
    }
}

async function handleFileSelect(e) {
    if (AppState.isProcessing) return;
    
    const files = e.target.files;
    if (files.length === 0) return;
    
    const file = files[0];
    const fileType = file.name.split('.').pop().toLowerCase();
    
    if (!['doc', 'docx', 'pdf'].includes(fileType)) {
        alert('Please select a .doc, .docx, or .pdf file');
        return;
    }
    
    AppState.isProcessing = true;
    
    addMessage(`📎 Summarizing file: ${file.name}`, true);
    addLoadingMessage();
    
    e.target.value = '';
    
    try {
        const result = await summarizeDocument(file, AppState.selectedModel);
        
        removeLoadingMessage();
        
        if (result.success && result.summary) {
            addMessage(result.summary, false);
            AppState.lastSummaryContext = result.summary; // Store for context-aware chat
        } else {
            throw new Error('No summary generated');
        }
    } catch (error) {
        removeLoadingMessage();
        addMessage(`❌ Error: ${error.message}\n\nPlease check:\n• Your API is running at ${API_BASE_URL}\n• The file contains readable text\n• Your API keys are configured correctly`, false);
        console.error('Document summarization error:', error);
    } finally {
        AppState.isProcessing = false;
    }
}

// ===== Quick Actions =====
function handleQuickActions(e) {
    const quickAction = e.target.closest('.quick-action');
    if (quickAction) {
        const id = quickAction.id;
        if (id === 'upload-quick-btn') {
            handleUploadButton();
        } else if (id === 'youtube-quick-btn') {
            handleFlashButton();
        } else if (id === 'text-quick-btn') {
            elements.chatInput.focus();
        }
        return;
    }
    
    const suggestion = e.target.closest('.suggestion');
    if (suggestion) {
        const prompt = suggestion.dataset.prompt || suggestion.textContent.replace(/^[^\s]+\s/, '');
        elements.chatInput.value = prompt;
        elements.chatInput.focus();
        handleTextareaInput();
    }
}

// ===== Close Dropdowns on Outside Click =====
function handleOutsideClick(e) {
    if (elements.modelSelectorBtn && elements.modelDropdown) {
        if (!elements.modelSelectorBtn.contains(e.target) && 
            !elements.modelDropdown.contains(e.target)) {
            elements.modelDropdown.style.display = 'none';
        }
    }
    
    if (elements.settingsBtn && elements.settingsPopover) {
        if (!elements.settingsBtn.contains(e.target) && 
            !elements.settingsPopover.contains(e.target)) {
            elements.settingsPopover.style.display = 'none';
        }
    }
    
    if (window.innerWidth <= 768 && AppState.sidebarOpen) {
        if (elements.sidebar && !elements.sidebar.contains(e.target) && 
            !elements.menuToggle.contains(e.target)) {
            closeSidebar();
        }
    }
}

// ===== Event Listeners =====
function initEventListeners() {
    if (elements.newChatBtn) {
        elements.newChatBtn.addEventListener('click', handleNewChat);
    }
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSettingsPopover();
        });
    }
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTheme();
        });
    }
    if (elements.menuToggle) {
        elements.menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }
    
    if (elements.modelSelectorBtn) {
        elements.modelSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModelDropdown();
        });
    }
    if (elements.modelDropdown) {
        elements.modelDropdown.addEventListener('click', handleModelSelection);
    }
    
    if (elements.flashBtn) {
        elements.flashBtn.addEventListener('click', handleFlashButton);
    }
    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', handleUploadButton);
    }
    if (elements.chatInput) {
        elements.chatInput.addEventListener('input', handleTextareaInput);
        elements.chatInput.addEventListener('keydown', handleTextareaKeydown);
    }
    if (elements.sendBtn) {
        elements.sendBtn.addEventListener('click', handleSendMessage);
    }
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }
    
    // Quick actions and suggestions
    const quickActionsContainer = document.querySelector('.quick-actions');
    const promptSuggestions = document.querySelector('.prompt-suggestions');
    
    if (quickActionsContainer) {
        quickActionsContainer.addEventListener('click', handleQuickActions);
    }
    if (promptSuggestions) {
        promptSuggestions.addEventListener('click', handleQuickActions);
    }
    
    // YouTube modal
    if (elements.youtubeModal) {
        const overlay = elements.youtubeModal.querySelector('.modal__overlay');
        const closeBtn = elements.youtubeModal.querySelector('.modal__close');
        const cancelBtn = elements.youtubeModal.querySelector('.modal__cancel');
        const submitBtn = elements.youtubeModal.querySelector('.modal__submit');
        const content = elements.youtubeModal.querySelector('.modal__content');
        
        if (overlay) overlay.addEventListener('click', handleYoutubeModalCancel);
        if (closeBtn) closeBtn.addEventListener('click', handleYoutubeModalCancel);
        if (cancelBtn) cancelBtn.addEventListener('click', handleYoutubeModalCancel);
        if (submitBtn) submitBtn.addEventListener('click', handleYoutubeModalSubmit);
        if (content) content.addEventListener('click', (e) => e.stopPropagation());
        
        // Enter key in youtube link input
        if (elements.youtubeLink) {
            elements.youtubeLink.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleYoutubeModalSubmit();
                }
            });
        }
    }
    
    document.addEventListener('click', handleOutsideClick);
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeSidebar();
        }
    });
}

// ===== Initialization =====
async function init() {
    initTheme();
    
    if (elements.selectedModelText) {
        elements.selectedModelText.textContent = AppState.selectedModel;
    }
    
    if (elements.youtubeModal) elements.youtubeModal.style.display = 'none';
    if (elements.settingsPopover) elements.settingsPopover.style.display = 'none';
    if (elements.modelDropdown) elements.modelDropdown.style.display = 'none';
    
    document.body.style.overflow = '';
    
    initEventListeners();
    updateChatHistory();
    
    // Load last conversation or show welcome
    if (AppState.conversations.length > 0 && AppState.conversations[0].messages.length > 0) {
        loadConversation(AppState.conversations[0].id);
    } else {
        showWelcome();
    }
    
    if (elements.chatInput) {
        elements.chatInput.focus();
    }
    
    // Check API health
    const health = await checkHealth();
    if (health) {
        console.log('✅ API Connected:', health);
    } else {
        console.warn('⚠️ API not available. Make sure to run: python main.py');
        addMessage(`⚠️ **Backend API not detected**\n\nTo use all features:\n1. Install dependencies: \`pip install fastapi uvicorn youtube-transcript-api google-generativeai groq cohere pypdf2 python-docx python-dotenv\`\n2. Create .env file with your API keys\n3. Start API: \`python main.py\`\n4. API should run at ${API_BASE_URL}\n\n💬 **Chat feature is now available!** Ask me anything or summarize content.`, false);
    }
    
    console.log('🎉 NoteX with Chat initialized!');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}