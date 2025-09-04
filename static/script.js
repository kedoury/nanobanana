document.addEventListener('DOMContentLoaded', () => {
    // === 基础元素获取 ===
    const uploadArea = document.querySelector('.upload-area');
    const fileInput = document.getElementById('image-upload');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const promptInput = document.getElementById('prompt-input');
    const apiKeyInput = document.getElementById('api-key-input');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.spinner');
    const resultContainer = document.getElementById('result-image-container');

    // === 新功能元素获取 ===
    const rememberKeyCheckbox = document.getElementById('remember-key-checkbox');
    const clearKeyBtn = document.getElementById('clear-key-btn');
    const templateSelect = document.getElementById('template-select');
    const saveTemplateBtn = document.getElementById('save-template-btn');
    const manageTemplatesBtn = document.getElementById('manage-templates-btn');
    const templateModal = document.getElementById('template-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const newTemplateName = document.getElementById('new-template-name');
    const newTemplateContent = document.getElementById('new-template-content');
    const addTemplateBtn = document.getElementById('add-template-btn');
    const templatesList = document.getElementById('templates-list');

    let selectedFiles = [];

    // === 本地存储键名常量 ===
    const STORAGE_KEYS = {
        API_KEY: 'nanobanana_api_key',
        REMEMBER_KEY: 'nanobanana_remember_key',
        TEMPLATES: 'nanobanana_templates',
        CONVERSATIONS: 'nanobanana_conversations',
        CURRENT_CONVERSATION: 'nanobanana_current_conversation',
        CHAT_SETTINGS: 'nanobanana_chat_settings'
    };

    // === 对话数据结构定义 ===
    /**
     * 消息结构 (Message)
     * @typedef {Object} Message
     * @property {string} id - 消息唯一标识符
     * @property {string} role - 消息角色: 'user' | 'assistant'
     * @property {string} content - 文本内容
     * @property {Array<Object>} images - 图片数据数组
     * @property {number} timestamp - 消息时间戳
     * @property {number} size - 消息大小（字节）
     * @property {Object} metadata - 元数据（模型信息、token使用等）
     */

    /**
     * 会话结构 (Conversation)
     * @typedef {Object} Conversation
     * @property {string} id - 会话唯一标识符
     * @property {string} title - 会话标题
     * @property {Array<Message>} messages - 消息列表
     * @property {number} createdAt - 创建时间戳
     * @property {number} updatedAt - 最后更新时间戳
     * @property {number} totalSize - 会话总大小（字节）
     * @property {boolean} isPinned - 是否置顶
     * @property {Object} settings - 会话设置（上下文长度等）
     */

    // === 对话管理配置 ===
    const CHAT_CONFIG = {
        MAX_CONVERSATIONS: 50,           // 最大会话数量
        MAX_MESSAGES_PER_CONVERSATION: 100, // 每个会话最大消息数
        MAX_STORAGE_SIZE: 1024 * 1024 * 1024, // 最大存储空间 1GB
        MAX_CONTEXT_MESSAGES: 10,        // 发送给API的最大上下文消息数
        IMAGE_COMPRESSION_QUALITY: 0.8,  // 图片压缩质量
        MAX_IMAGE_SIZE: 1024 * 1024,     // 单张图片最大尺寸 1MB
        AUTO_CLEANUP_DAYS: 30            // 自动清理天数
    };

    // === 预设模板数据 ===
    // 默认模板已清空，用户可以自行添加模板
    const DEFAULT_TEMPLATES = [];

    // === 数据结构类定义 ===
    
    /**
     * 消息类 - 表示单条聊天消息
     */
    class Message {
        constructor(data = {}) {
            this.id = data.id || this.generateId();
            this.role = data.role || 'user'; // 'user' | 'assistant'
            this.content = data.content || '';
            this.images = data.images || [];
            this.timestamp = data.timestamp || Date.now();
            this.size = data.size || this.calculateSize();
            this.metadata = data.metadata || {};
        }
        
        // 生成唯一ID
        generateId() {
            return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // 计算消息大小
        calculateSize() {
            let size = new Blob([this.content]).size;
            if (this.images && Array.isArray(this.images)) {
                this.images.forEach(img => {
                    if (img.data) {
                        size += img.data.length * 0.75; // Base64编码大约增加33%
                    }
                });
            }
            return size;
        }
        
        // 转换为API格式
        toApiFormat() {
            const apiMessage = {
                role: this.role,
                content: this.content
            };
            
            if (this.images && this.images.length > 0) {
                apiMessage.images = this.images.map(img => ({
                    type: 'image',
                    data: img.data,
                    format: img.format || 'jpeg'
                }));
            }
            
            return apiMessage;
        }
    }
    
    /**
     * 会话类 - 表示一个完整的对话会话
     */
    class Conversation {
        constructor(data = {}) {
            this.id = data.id || this.generateId();
            this.title = data.title || '新对话';
            this.messages = data.messages || [];
            this.createdAt = data.createdAt || Date.now();
            this.updatedAt = data.updatedAt || Date.now();
            this.totalSize = data.totalSize || 0;
            this.isPinned = data.isPinned || false;
            this.settings = data.settings || {
                maxContextMessages: CHAT_CONFIG.MAX_CONTEXT_MESSAGES,
                model: 'google/gemini-2.5-flash-image-preview'
            };
        }
        
        // 生成唯一ID
        generateId() {
            return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // 添加消息
        addMessage(message) {
            if (!(message instanceof Message)) {
                message = new Message(message);
            }
            this.messages.push(message);
            this.updatedAt = Date.now();
            this.updateTotalSize();
            return message;
        }
        
        // 获取最后一条消息
        getLastMessage() {
            return this.messages[this.messages.length - 1] || null;
        }
        
        // 获取用户消息数量
        getUserMessageCount() {
            return this.messages.filter(msg => msg.role === 'user').length;
        }
        
        // 更新总大小
        updateTotalSize() {
            this.totalSize = this.messages.reduce((total, msg) => total + (msg.size || 0), 0);
        }
        
        // 生成会话标题
        generateTitle() {
            const firstUserMessage = this.messages.find(msg => msg.role === 'user');
            if (firstUserMessage && firstUserMessage.content) {
                // 取前20个字符作为标题
                this.title = firstUserMessage.content.substring(0, 20).trim();
                if (firstUserMessage.content.length > 20) {
                    this.title += '...';
                }
            } else {
                this.title = `对话 ${new Date(this.createdAt).toLocaleDateString()}`;
            }
            return this.title;
        }
        
        // 切换置顶状态
        togglePin() {
            this.isPinned = !this.isPinned;
            this.updatedAt = Date.now();
            return this.isPinned;
        }
    }

    // === IndexedDB 存储管理类 ===
    class ChatStorage {
        constructor() {
            this.dbName = 'NanoBananaDB';
            this.dbVersion = 1;
            this.db = null;
        }

        // 初始化数据库
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => {
                    console.error('IndexedDB 打开失败:', request.error);
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('IndexedDB 初始化成功');
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // 创建会话存储表
                    if (!db.objectStoreNames.contains('conversations')) {
                        const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
                        conversationStore.createIndex('createdAt', 'createdAt', { unique: false });
                        conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                        conversationStore.createIndex('isPinned', 'isPinned', { unique: false });
                    }
                    
                    // 创建消息存储表
                    if (!db.objectStoreNames.contains('messages')) {
                        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                        messageStore.createIndex('conversationId', 'conversationId', { unique: false });
                        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                        messageStore.createIndex('role', 'role', { unique: false });
                    }
                    
                    // 创建设置存储表
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            });
        }

        // 保存会话
        async saveConversation(conversation) {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readwrite');
                const store = transaction.objectStore('conversations');
                
                // 更新时间戳和大小
                conversation.updatedAt = Date.now();
                conversation.totalSize = this.calculateConversationSize(conversation);
                
                const request = store.put(conversation);
                
                request.onsuccess = () => resolve(conversation);
                request.onerror = () => reject(request.error);
            });
        }

        // 获取所有会话
        async getAllConversations() {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readonly');
                const store = transaction.objectStore('conversations');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    // 按更新时间倒序排列，置顶会话优先
                    const conversations = request.result.sort((a, b) => {
                        if (a.isPinned && !b.isPinned) return -1;
                        if (!a.isPinned && b.isPinned) return 1;
                        return b.updatedAt - a.updatedAt;
                    });
                    resolve(conversations);
                };
                request.onerror = () => reject(request.error);
            });
        }

        // 获取单个会话
        async getConversation(conversationId) {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readonly');
                const store = transaction.objectStore('conversations');
                const request = store.get(conversationId);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        // 删除会话
        async deleteConversation(conversationId) {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations', 'messages'], 'readwrite');
                const conversationStore = transaction.objectStore('conversations');
                const messageStore = transaction.objectStore('messages');
                
                // 删除会话
                conversationStore.delete(conversationId);
                
                // 删除相关消息
                const messageIndex = messageStore.index('conversationId');
                const messageRequest = messageIndex.openCursor(IDBKeyRange.only(conversationId));
                
                messageRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
                
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        }

        // 保存消息
        async saveMessage(message) {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages'], 'readwrite');
                const store = transaction.objectStore('messages');
                
                // 计算消息大小
                message.size = this.calculateMessageSize(message);
                
                const request = store.put(message);
                
                request.onsuccess = () => resolve(message);
                request.onerror = () => reject(request.error);
            });
        }

        // 获取会话的所有消息
        async getConversationMessages(conversationId) {
            if (!this.db) await this.init();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages'], 'readonly');
                const store = transaction.objectStore('messages');
                const index = store.index('conversationId');
                const request = index.getAll(conversationId);
                
                request.onsuccess = () => {
                    // 按时间戳排序
                    const messages = request.result.sort((a, b) => a.timestamp - b.timestamp);
                    resolve(messages);
                };
                request.onerror = () => reject(request.error);
            });
        }

        // 计算消息大小
        calculateMessageSize(message) {
            let size = 0;
            
            // 文本内容大小
            size += new Blob([message.content || '']).size;
            
            // 图片数据大小
            if (message.images && Array.isArray(message.images)) {
                message.images.forEach(image => {
                    if (image.data) {
                        // Base64 数据大小估算
                        size += Math.ceil(image.data.length * 0.75);
                    }
                });
            }
            
            // 元数据大小
            if (message.metadata) {
                size += new Blob([JSON.stringify(message.metadata)]).size;
            }
            
            return size;
        }

        // 计算会话总大小
        calculateConversationSize(conversation) {
            let size = 0;
            
            // 会话基本信息大小
            size += new Blob([JSON.stringify({
                id: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                isPinned: conversation.isPinned,
                settings: conversation.settings
            })]).size;
            
            // 消息总大小
            if (conversation.messages && Array.isArray(conversation.messages)) {
                conversation.messages.forEach(message => {
                    size += this.calculateMessageSize(message);
                });
            }
            
            return size;
        }

        // 获取存储使用情况
        async getStorageUsage() {
            if (!this.db) await this.init();
            
            const conversations = await this.getAllConversations();
            let totalSize = 0;
            let messageCount = 0;
            
            for (const conversation of conversations) {
                totalSize += conversation.totalSize || 0;
                messageCount += conversation.messages ? conversation.messages.length : 0;
            }
            
            return {
                totalSize,
                messageCount,
                conversationCount: conversations.length,
                usagePercentage: (totalSize / CHAT_CONFIG.MAX_STORAGE_SIZE) * 100
            };
        }

        // 清理过期数据
        async cleanupOldData() {
            if (!this.db) await this.init();
            
            const cutoffTime = Date.now() - (CHAT_CONFIG.AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000);
            const conversations = await this.getAllConversations();
            
            const toDelete = conversations.filter(conv => 
                !conv.isPinned && conv.updatedAt < cutoffTime
            );
            
            for (const conversation of toDelete) {
                await this.deleteConversation(conversation.id);
            }
            
            return toDelete.length;
        }
    }

    // 创建全局存储实例
    const chatStorage = new ChatStorage();

    // === 对话管理类 ===
    class ConversationManager {
        constructor() {
            this.currentConversation = null;
            this.conversations = [];
            this.isLoading = false;
        }

        // 初始化对话管理器
        async init() {
            try {
                await chatStorage.init();
                await this.loadConversations();
                await this.loadCurrentConversation();
                this.bindEvents();
                this.updateUI();
            } catch (error) {
                console.error('对话管理器初始化失败:', error);
            }
        }

        // 加载所有会话
        async loadConversations() {
            try {
                this.conversations = await chatStorage.getAllConversations();
                this.renderConversationList();
                this.updateStorageInfo();
            } catch (error) {
                console.error('加载会话列表失败:', error);
            }
        }

        // 加载当前会话
        async loadCurrentConversation() {
            const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_CONVERSATION);
            if (currentId) {
                const conversation = await chatStorage.getConversation(currentId);
                if (conversation) {
                    this.currentConversation = conversation;
                    await this.loadConversationMessages(currentId);
                }
            }
            
            if (!this.currentConversation) {
                await this.createNewConversation();
            }
        }

        // 创建新会话
        async createNewConversation(title = null) {
            const conversation = new Conversation({
                title: title || '新对话',
                settings: {
                    model: 'google/gemini-2.5-flash-image-preview',
                    temperature: 0.7
                }
            });

            try {
                await chatStorage.saveConversation(conversation);
                this.currentConversation = conversation;
                this.conversations.unshift(conversation);
                
                localStorage.setItem(STORAGE_KEYS.CURRENT_CONVERSATION, conversation.id);
                
                this.renderConversationList();
                this.updateUI();
                this.clearChatMessages();
                this.showWelcomeMessage();
                
                return conversation;
            } catch (error) {
                console.error('创建新会话失败:', error);
                throw error;
            }
        }

        // 切换会话
        async switchConversation(conversationId) {
            if (this.currentConversation && this.currentConversation.id === conversationId) {
                return;
            }

            try {
                const conversation = await chatStorage.getConversation(conversationId);
                if (!conversation) {
                    throw new Error('会话不存在');
                }

                this.currentConversation = conversation;
                localStorage.setItem(STORAGE_KEYS.CURRENT_CONVERSATION, conversationId);
                
                await this.loadConversationMessages(conversationId);
                this.updateUI();
                this.renderConversationList();
                
            } catch (error) {
                console.error('切换会话失败:', error);
            }
        }

        // 删除会话
        async deleteConversation(conversationId) {
            if (!confirm('确定要删除这个对话吗？此操作无法撤销。')) {
                return;
            }

            try {
                await chatStorage.deleteConversation(conversationId);
                
                // 从本地列表中移除
                this.conversations = this.conversations.filter(conv => conv.id !== conversationId);
                
                // 如果删除的是当前会话，切换到其他会话或创建新会话
                if (this.currentConversation && this.currentConversation.id === conversationId) {
                    if (this.conversations.length > 0) {
                        await this.switchConversation(this.conversations[0].id);
                    } else {
                        await this.createNewConversation();
                    }
                }
                
                this.renderConversationList();
                this.updateStorageInfo();
                
            } catch (error) {
                console.error('删除会话失败:', error);
                alert('删除会话失败，请稍后重试');
            }
        }

        // 置顶/取消置顶会话
        async togglePinConversation(conversationId) {
            try {
                const conversation = await chatStorage.getConversation(conversationId);
                if (!conversation) return;
                
                conversation.isPinned = !conversation.isPinned;
                await chatStorage.saveConversation(conversation);
                
                // 更新本地列表
                const index = this.conversations.findIndex(conv => conv.id === conversationId);
                if (index !== -1) {
                    this.conversations[index] = conversation;
                }
                
                if (this.currentConversation && this.currentConversation.id === conversationId) {
                    this.currentConversation = conversation;
                }
                
                await this.loadConversations(); // 重新排序
                this.updateUI();
                
            } catch (error) {
                console.error('置顶会话失败:', error);
            }
        }

        // 加载会话消息
        async loadConversationMessages(conversationId) {
            try {
                const messages = await chatStorage.getConversationMessages(conversationId);
                this.clearChatMessages();
                
                if (messages.length === 0) {
                    this.showWelcomeMessage();
                } else {
                    messages.forEach(message => {
                        this.renderMessage(message);
                    });
                    this.scrollToBottom();
                }
            } catch (error) {
                console.error('加载会话消息失败:', error);
            }
        }

        // 保存消息到当前会话
        async saveMessage(message) {
            if (!this.currentConversation) {
                await this.createNewConversation();
            }

            try {
                message.conversationId = this.currentConversation.id;
                await chatStorage.saveMessage(message);
                
                // 更新会话标题（如果是第一条用户消息）
                if (message.role === 'user' && !this.currentConversation.title.startsWith('新对话')) {
                    const title = this.generateConversationTitle(message.content);
                    this.currentConversation.title = title;
                    await chatStorage.saveConversation(this.currentConversation);
                    this.updateUI();
                    this.renderConversationList();
                }
                
                return message;
            } catch (error) {
                console.error('保存消息失败:', error);
                throw error;
            }
        }

        // 生成会话标题
        generateConversationTitle(content) {
            // 提取前30个字符作为标题
            let title = content.trim().substring(0, 30);
            if (content.length > 30) {
                title += '...';
            }
            return title || '新对话';
        }

        // 渲染会话列表
        renderConversationList() {
            const listContainer = document.getElementById('conversation-list');
            if (!listContainer) return;

            listContainer.innerHTML = '';

            this.conversations.forEach(conversation => {
                const item = document.createElement('div');
                item.className = 'conversation-item';
                if (this.currentConversation && conversation.id === this.currentConversation.id) {
                    item.classList.add('active');
                }
                if (conversation.isPinned) {
                    item.classList.add('pinned');
                }

                const preview = conversation.lastMessage ? 
                    conversation.lastMessage.substring(0, 50) + (conversation.lastMessage.length > 50 ? '...' : '') : 
                    '暂无消息';

                const timeStr = this.formatTime(conversation.updatedAt);

                item.innerHTML = `
                    <div class="conversation-title">${this.escapeHtml(conversation.title)}</div>
                    <div class="conversation-preview">${this.escapeHtml(preview)}</div>
                    <div class="conversation-meta">
                        <span class="conversation-time">${timeStr}</span>
                        <div class="conversation-badges">
                            ${conversation.isPinned ? '<span class="badge pinned">置顶</span>' : ''}
                        </div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    this.switchConversation(conversation.id);
                });

                // 右键菜单
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showConversationContextMenu(e, conversation);
                });

                listContainer.appendChild(item);
            });
        }

        // 显示会话右键菜单
        showConversationContextMenu(event, conversation) {
            // 简单的确认对话框，后续可以改为自定义菜单
            const actions = [
                conversation.isPinned ? '取消置顶' : '置顶对话',
                '删除对话'
            ];
            
            const choice = prompt(`选择操作：\n1. ${actions[0]}\n2. ${actions[1]}\n\n请输入数字 (1-2):`);
            
            if (choice === '1') {
                this.togglePinConversation(conversation.id);
            } else if (choice === '2') {
                this.deleteConversation(conversation.id);
            }
        }

        // 更新UI
        updateUI() {
            const titleElement = document.getElementById('current-conversation-title');
            const pinBtn = document.getElementById('pin-conversation-btn');
            
            if (titleElement && this.currentConversation) {
                titleElement.textContent = this.currentConversation.title;
            }
            
            if (pinBtn && this.currentConversation) {
                if (this.currentConversation.isPinned) {
                    pinBtn.classList.add('active');
                    pinBtn.title = '取消置顶';
                } else {
                    pinBtn.classList.remove('active');
                    pinBtn.title = '置顶对话';
                }
            }
        }

        // 更新存储信息
        async updateStorageInfo() {
            try {
                const usage = await chatStorage.getStorageUsage();
                const infoElement = document.getElementById('storage-info');
                if (infoElement) {
                    const usageText = `存储使用: ${Math.round(usage.usagePercentage)}%`;
                    infoElement.innerHTML = `<small>${usageText}</small>`;
                }
            } catch (error) {
                console.error('更新存储信息失败:', error);
            }
        }

        // 清空聊天消息
        clearChatMessages() {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
        }

        // 显示欢迎消息
        showWelcomeMessage() {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-content">
                            <h4>🍌 欢迎使用 nano banana</h4>
                            <p>开始新的对话，上传图片并输入提示词来生成内容</p>
                        </div>
                    </div>
                `;
            }
        }

        // 渲染消息
        renderMessage(message) {
            const messagesContainer = document.getElementById('chat-messages');
            if (!messagesContainer) return;

            // 移除欢迎消息
            const welcomeMessage = messagesContainer.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.remove();
            }

            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.role}`;
            messageElement.dataset.messageId = message.id;

            const avatar = message.role === 'user' ? '👤' : '🤖';
            const timeStr = this.formatTime(message.timestamp);

            let imagesHtml = '';
            if (message.images && message.images.length > 0) {
                imagesHtml = `
                    <div class="message-images">
                        ${message.images.map(img => 
                            `<img src="${img.data}" alt="${img.name || '图片'}" class="message-image" onclick="openImageModal(this.src)">`
                        ).join('')}
                    </div>
                `;
            }

            messageElement.innerHTML = `
                <div class="message-avatar">${avatar}</div>
                <div class="message-content">
                    <div class="message-bubble">
                        ${imagesHtml}
                        <div class="message-text">${this.escapeHtml(message.content)}</div>
                    </div>
                    <div class="message-time">${timeStr}</div>
                </div>
            `;

            messagesContainer.appendChild(messageElement);
            this.scrollToBottom();
        }

        // 滚动到底部
        scrollToBottom() {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }

        // 格式化时间
        formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60000) { // 1分钟内
                return '刚刚';
            } else if (diff < 3600000) { // 1小时内
                return `${Math.floor(diff / 60000)}分钟前`;
            } else if (diff < 86400000) { // 24小时内
                return `${Math.floor(diff / 3600000)}小时前`;
            } else if (diff < 604800000) { // 7天内
                return `${Math.floor(diff / 86400000)}天前`;
            } else {
                return date.toLocaleDateString();
            }
        }

        // HTML转义
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 绑定事件
        bindEvents() {
            // 新建对话按钮
            const newConversationBtn = document.getElementById('new-conversation-btn');
            if (newConversationBtn) {
                newConversationBtn.addEventListener('click', () => {
                    this.createNewConversation();
                });
            }

            // 置顶按钮
            const pinBtn = document.getElementById('pin-conversation-btn');
            if (pinBtn) {
                pinBtn.addEventListener('click', () => {
                    if (this.currentConversation) {
                        this.togglePinConversation(this.currentConversation.id);
                    }
                });
            }

            // 删除按钮
            const deleteBtn = document.getElementById('delete-conversation-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    if (this.currentConversation) {
                        this.deleteConversation(this.currentConversation.id);
                    }
                });
            }

            // 切换侧边栏按钮
            const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
            const sidebar = document.querySelector('.conversation-sidebar');
            if (toggleSidebarBtn && sidebar) {
                toggleSidebarBtn.addEventListener('click', () => {
                    sidebar.classList.toggle('collapsed');
                });
            }
        }
    }

    // 创建全局对话管理器实例
    const conversationManager = new ConversationManager();

    // === 图片压缩优化类 ===
    class ImageCompressor {
        constructor() {
            this.maxWidth = CHAT_CONFIG.maxImageSize;
            this.maxHeight = CHAT_CONFIG.maxImageSize;
            this.quality = CHAT_CONFIG.imageQuality;
            this.outputFormat = 'webp'; // 优先使用WebP格式
        }

        // 压缩图片
        async compressImage(file, options = {}) {
            const {
                maxWidth = this.maxWidth,
                maxHeight = this.maxHeight,
                quality = this.quality,
                outputFormat = this.outputFormat
            } = options;

            return new Promise((resolve, reject) => {
                const img = new Image();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                img.onload = () => {
                    try {
                        // 计算压缩后的尺寸
                        const { width, height } = this.calculateDimensions(
                            img.width, 
                            img.height, 
                            maxWidth, 
                            maxHeight
                        );

                        // 设置画布尺寸
                        canvas.width = width;
                        canvas.height = height;

                        // 绘制压缩后的图片
                        ctx.drawImage(img, 0, 0, width, height);

                        // 转换为指定格式
                        const mimeType = this.getMimeType(outputFormat);
                        const compressedDataUrl = canvas.toDataURL(mimeType, quality);

                        // 计算压缩比
                        const originalSize = this.getFileSizeFromDataUrl(this.originalDataUrl);
                        const compressedSize = this.getFileSizeFromDataUrl(compressedDataUrl);
                        const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

                        resolve({
                            dataUrl: compressedDataUrl,
                            width,
                            height,
                            originalSize,
                            compressedSize,
                            compressionRatio,
                            format: outputFormat
                        });
                    } catch (error) {
                        reject(new Error(`图片压缩失败: ${error.message}`));
                    }
                };

                img.onerror = () => {
                    reject(new Error('图片加载失败'));
                };

                // 读取文件
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.originalDataUrl = e.target.result;
                    img.src = e.target.result;
                };
                reader.onerror = () => {
                    reject(new Error('文件读取失败'));
                };
                reader.readAsDataURL(file);
            });
        }

        // 批量压缩图片
        async compressImages(files, options = {}) {
            const results = [];
            const errors = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const result = await this.compressImage(file, options);
                    results.push({
                        file,
                        result,
                        index: i
                    });
                } catch (error) {
                    errors.push({
                        file,
                        error,
                        index: i
                    });
                }
            }

            return { results, errors };
        }

        // 计算压缩后的尺寸（保持宽高比）
        calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
            let { width, height } = { width: originalWidth, height: originalHeight };

            // 如果图片尺寸小于最大限制，不需要压缩
            if (width <= maxWidth && height <= maxHeight) {
                return { width, height };
            }

            // 计算缩放比例
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);

            // 应用缩放比例
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);

            return { width, height };
        }

        // 获取MIME类型
        getMimeType(format) {
            const mimeTypes = {
                'webp': 'image/webp',
                'jpeg': 'image/jpeg',
                'jpg': 'image/jpeg',
                'png': 'image/png'
            };
            return mimeTypes[format.toLowerCase()] || 'image/jpeg';
        }

        // 从DataURL计算文件大小（字节）
        getFileSizeFromDataUrl(dataUrl) {
            // Base64编码的数据URL格式: data:image/type;base64,<data>
            const base64Data = dataUrl.split(',')[1];
            if (!base64Data) return 0;
            
            // Base64编码后的大小约为原始大小的4/3
            return Math.round((base64Data.length * 3) / 4);
        }

        // 格式化文件大小
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // 检查浏览器是否支持WebP
        static supportsWebP() {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        }

        // 获取推荐的输出格式
        getRecommendedFormat(originalFormat) {
            // 如果浏览器支持WebP，优先使用WebP
            if (ImageCompressor.supportsWebP()) {
                return 'webp';
            }
            
            // 否则根据原始格式决定
            const format = originalFormat.toLowerCase();
            if (format.includes('png')) {
                return 'png'; // PNG保持透明度
            }
            return 'jpeg'; // 其他格式转为JPEG
        }

        // 智能压缩（根据文件大小自动调整参数）
        async smartCompress(file) {
            const fileSizeKB = file.size / 1024;
            let quality = this.quality;
            let maxSize = this.maxWidth;

            // 根据文件大小调整压缩参数
            if (fileSizeKB > 5000) { // 大于5MB
                quality = 0.6;
                maxSize = 1200;
            } else if (fileSizeKB > 2000) { // 大于2MB
                quality = 0.7;
                maxSize = 1600;
            } else if (fileSizeKB > 1000) { // 大于1MB
                quality = 0.8;
                maxSize = 1920;
            }

            const recommendedFormat = this.getRecommendedFormat(file.type);

            return await this.compressImage(file, {
                maxWidth: maxSize,
                maxHeight: maxSize,
                quality,
                outputFormat: recommendedFormat
            });
        }

        // 渐进式压缩（多次压缩直到达到目标大小）
        async progressiveCompress(file, targetSizeKB = 500) {
            let quality = 0.9;
            let maxSize = this.maxWidth;
            let result;
            let attempts = 0;
            const maxAttempts = 5;

            while (attempts < maxAttempts) {
                result = await this.compressImage(file, {
                    maxWidth: maxSize,
                    maxHeight: maxSize,
                    quality,
                    outputFormat: this.getRecommendedFormat(file.type)
                });

                const resultSizeKB = result.compressedSize / 1024;
                
                if (resultSizeKB <= targetSizeKB || quality <= 0.3) {
                    break;
                }

                // 调整压缩参数
                quality -= 0.15;
                if (resultSizeKB > targetSizeKB * 2) {
                    maxSize = Math.round(maxSize * 0.8);
                }

                attempts++;
            }

            return result;
        }
    }

    // 创建全局图片压缩器实例
    const imageCompressor = new ImageCompressor();

    // === 上下文管理类 ===
    class ContextManager {
        constructor() {
            this.maxContextMessages = CHAT_CONFIG.maxContextMessages;
            this.maxTokens = 30000; // Gemini 2.5 Flash的上下文限制
            this.averageTokensPerChar = 0.25; // 估算每个字符的token数
        }

        // 构建API请求的上下文
        async buildContext(conversationId, currentMessage) {
            try {
                const messages = await chatStorage.getConversationMessages(conversationId);
                
                // 添加当前消息
                const allMessages = [...messages, currentMessage];
                
                // 智能选择上下文消息
                const contextMessages = this.selectContextMessages(allMessages);
                
                // 转换为API格式
                const apiMessages = this.convertToApiFormat(contextMessages);
                
                return {
                    messages: apiMessages,
                    totalMessages: contextMessages.length,
                    estimatedTokens: this.estimateTokens(apiMessages)
                };
            } catch (error) {
                console.error('构建上下文失败:', error);
                // 如果失败，至少返回当前消息
                return {
                    messages: this.convertToApiFormat([currentMessage]),
                    totalMessages: 1,
                    estimatedTokens: this.estimateTokens([currentMessage])
                };
            }
        }

        // 智能选择上下文消息
        selectContextMessages(messages) {
            if (messages.length <= this.maxContextMessages) {
                return messages;
            }

            // 策略1: 保留最近的消息
            const recentMessages = messages.slice(-this.maxContextMessages);
            
            // 检查token限制
            let selectedMessages = recentMessages;
            let estimatedTokens = this.estimateTokens(selectedMessages);
            
            // 如果超过token限制，逐步减少消息
            while (estimatedTokens > this.maxTokens && selectedMessages.length > 1) {
                // 移除最早的消息（保留最新的用户消息）
                selectedMessages = selectedMessages.slice(1);
                estimatedTokens = this.estimateTokens(selectedMessages);
            }

            // 确保上下文的完整性（用户消息和助手回复成对出现）
            return this.ensureContextIntegrity(selectedMessages);
        }

        // 确保上下文完整性
        ensureContextIntegrity(messages) {
            const result = [];
            
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                result.push(message);
                
                // 如果是用户消息，检查是否有对应的助手回复
                if (message.role === 'user' && i < messages.length - 1) {
                    const nextMessage = messages[i + 1];
                    if (nextMessage.role === 'assistant') {
                        result.push(nextMessage);
                        i++; // 跳过下一条消息，因为已经添加了
                    }
                }
            }
            
            return result;
        }

        // 转换为API格式
        convertToApiFormat(messages) {
            return messages.map(message => {
                const apiMessage = {
                    role: message.role,
                    content: []
                };

                // 添加文本内容
                if (message.content && message.content.trim()) {
                    apiMessage.content.push({
                        type: 'text',
                        text: message.content
                    });
                }

                // 添加图片内容
                if (message.images && message.images.length > 0) {
                    message.images.forEach(image => {
                        apiMessage.content.push({
                            type: 'image_url',
                            image_url: {
                                url: image.data
                            }
                        });
                    });
                }

                return apiMessage;
            });
        }

        // 估算token数量
        estimateTokens(messages) {
            let totalTokens = 0;
            
            messages.forEach(message => {
                // 文本内容的token估算
                if (message.content) {
                    totalTokens += Math.ceil(message.content.length * this.averageTokensPerChar);
                }
                
                // 图片内容的token估算（每张图片约170 tokens）
                if (message.images && message.images.length > 0) {
                    totalTokens += message.images.length * 170;
                }
                
                // 系统消息的额外开销
                totalTokens += 10; // 每条消息的基础开销
            });
            
            return totalTokens;
        }

        // 优化上下文（移除不重要的消息）
        optimizeContext(messages, targetTokens) {
            if (this.estimateTokens(messages) <= targetTokens) {
                return messages;
            }

            // 按重要性排序消息
            const scoredMessages = this.scoreMessages(messages);
            
            // 选择最重要的消息，直到达到token限制
            const selectedMessages = [];
            let currentTokens = 0;
            
            for (const { message, score } of scoredMessages) {
                const messageTokens = this.estimateTokens([message]);
                if (currentTokens + messageTokens <= targetTokens) {
                    selectedMessages.push(message);
                    currentTokens += messageTokens;
                } else {
                    break;
                }
            }
            
            // 按时间顺序重新排列
            return selectedMessages.sort((a, b) => a.timestamp - b.timestamp);
        }

        // 为消息评分（重要性）
        scoreMessages(messages) {
            return messages.map(message => {
                let score = 0;
                
                // 最近的消息更重要
                const age = Date.now() - message.timestamp;
                const daysSinceCreated = age / (1000 * 60 * 60 * 24);
                score += Math.max(0, 10 - daysSinceCreated); // 最近10天内的消息有额外分数
                
                // 包含图片的消息更重要
                if (message.images && message.images.length > 0) {
                    score += 5;
                }
                
                // 较长的消息可能更重要
                if (message.content && message.content.length > 100) {
                    score += 2;
                }
                
                // 用户消息比助手消息稍微重要一些
                if (message.role === 'user') {
                    score += 1;
                }
                
                return { message, score };
            }).sort((a, b) => b.score - a.score); // 按分数降序排列
        }

        // 分析上下文使用情况
        analyzeContextUsage(messages) {
            const totalMessages = messages.length;
            const totalTokens = this.estimateTokens(messages);
            const userMessages = messages.filter(m => m.role === 'user').length;
            const assistantMessages = messages.filter(m => m.role === 'assistant').length;
            const messagesWithImages = messages.filter(m => m.images && m.images.length > 0).length;
            
            return {
                totalMessages,
                totalTokens,
                userMessages,
                assistantMessages,
                messagesWithImages,
                tokenUtilization: (totalTokens / this.maxTokens * 100).toFixed(1),
                messageUtilization: (totalMessages / this.maxContextMessages * 100).toFixed(1)
            };
        }

        // 获取上下文摘要
        getContextSummary(messages) {
            if (messages.length === 0) {
                return '暂无对话历史';
            }
            
            const analysis = this.analyzeContextUsage(messages);
            const timeSpan = this.getTimeSpan(messages);
            
            return `包含 ${analysis.totalMessages} 条消息（${analysis.userMessages} 条用户消息，${analysis.assistantMessages} 条助手回复），` +
                   `${analysis.messagesWithImages} 条包含图片，` +
                   `预估 ${analysis.totalTokens} tokens（${analysis.tokenUtilization}% 利用率），` +
                   `时间跨度：${timeSpan}`;
        }

        // 获取时间跨度
        getTimeSpan(messages) {
            if (messages.length === 0) return '无';
            
            const timestamps = messages.map(m => m.timestamp).sort((a, b) => a - b);
            const earliest = new Date(timestamps[0]);
            const latest = new Date(timestamps[timestamps.length - 1]);
            const diffMs = latest - earliest;
            
            if (diffMs < 60000) { // 小于1分钟
                return '1分钟内';
            } else if (diffMs < 3600000) { // 小于1小时
                return `${Math.ceil(diffMs / 60000)}分钟`;
            } else if (diffMs < 86400000) { // 小于1天
                return `${Math.ceil(diffMs / 3600000)}小时`;
            } else {
                return `${Math.ceil(diffMs / 86400000)}天`;
            }
        }

        // 清理过期上下文
        async cleanupExpiredContext(conversationId, maxAge = 7) {
            try {
                const messages = await chatStorage.getConversationMessages(conversationId);
                const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
                
                const expiredMessages = messages.filter(m => m.timestamp < cutoffTime);
                
                if (expiredMessages.length > 0) {
                    // 删除过期消息
                    for (const message of expiredMessages) {
                        await chatStorage.deleteMessage(message.id);
                    }
                    
                    console.log(`已清理 ${expiredMessages.length} 条过期消息`);
                    return expiredMessages.length;
                }
                
                return 0;
            } catch (error) {
                console.error('清理过期上下文失败:', error);
                return 0;
            }
        }
    }

    // 创建全局上下文管理器实例
    const contextManager = new ContextManager();

    // === 存储管理类 ===
    // 负责存储容量监控、自动清理和数据导出功能
    class StorageManager {
        constructor() {
            this.maxStorageSize = CHAT_CONFIG.maxStorageSize; // 最大存储空间（字节）
            this.autoCleanupDays = CHAT_CONFIG.autoCleanupDays; // 自动清理天数
        }

        // 计算当前存储使用情况
        async getStorageUsage() {
            try {
                const conversations = await chatStorage.getAllConversations();
                let totalSize = 0;
                let messageCount = 0;
                let imageCount = 0;
                let oldestDate = new Date();
                let newestDate = new Date(0);

                for (const conversation of conversations) {
                    // 计算会话基本信息大小
                    totalSize += JSON.stringify(conversation).length * 2; // UTF-16编码，每字符2字节
                    
                    // 获取会话消息
                    const messages = await chatStorage.getConversationMessages(conversation.id);
                    messageCount += messages.length;
                    
                    for (const message of messages) {
                        // 计算消息大小
                        totalSize += JSON.stringify(message).length * 2;
                        
                        // 计算图片大小
                        if (message.images && message.images.length > 0) {
                            imageCount += message.images.length;
                            for (const image of message.images) {
                                if (image.data) {
                                    // Base64图片大小估算
                                    totalSize += image.data.length;
                                }
                            }
                        }
                        
                        // 更新时间范围
                        const messageDate = new Date(message.timestamp);
                        if (messageDate < oldestDate) oldestDate = messageDate;
                        if (messageDate > newestDate) newestDate = messageDate;
                    }
                }

                return {
                    totalSize,
                    conversationCount: conversations.length,
                    messageCount,
                    imageCount,
                    usagePercentage: (totalSize / this.maxStorageSize) * 100,
                    oldestDate: messageCount > 0 ? oldestDate : null,
                    newestDate: messageCount > 0 ? newestDate : null,
                    formattedSize: this.formatBytes(totalSize),
                    formattedMaxSize: this.formatBytes(this.maxStorageSize)
                };
            } catch (error) {
                console.error('计算存储使用情况失败:', error);
                return {
                    totalSize: 0,
                    conversationCount: 0,
                    messageCount: 0,
                    imageCount: 0,
                    usagePercentage: 0,
                    oldestDate: null,
                    newestDate: null,
                    formattedSize: '0 B',
                    formattedMaxSize: this.formatBytes(this.maxStorageSize)
                };
            }
        }

        // 格式化字节大小
        formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // 自动清理过期数据
        async autoCleanup() {
            try {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - this.autoCleanupDays);
                
                const conversations = await chatStorage.getAllConversations();
                let cleanedCount = 0;
                
                for (const conversation of conversations) {
                    if (new Date(conversation.updatedAt) < cutoffDate) {
                        await chatStorage.deleteConversation(conversation.id);
                        cleanedCount++;
                    }
                }
                
                console.log(`自动清理完成，删除了 ${cleanedCount} 个过期会话`);
                return cleanedCount;
            } catch (error) {
                console.error('自动清理失败:', error);
                return 0;
            }
        }

        // 智能清理（基于存储使用率）
        async smartCleanup(targetUsagePercentage = 70) {
            try {
                const usage = await this.getStorageUsage();
                if (usage.usagePercentage <= targetUsagePercentage) {
                    return { cleaned: 0, message: '存储空间充足，无需清理' };
                }

                const conversations = await chatStorage.getAllConversations();
                // 按最后更新时间排序，优先删除最旧的会话
                conversations.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
                
                let cleanedCount = 0;
                let currentUsage = usage.usagePercentage;
                
                for (const conversation of conversations) {
                    if (currentUsage <= targetUsagePercentage) break;
                    
                    await chatStorage.deleteConversation(conversation.id);
                    cleanedCount++;
                    
                    // 重新计算使用率
                    const newUsage = await this.getStorageUsage();
                    currentUsage = newUsage.usagePercentage;
                }
                
                return {
                    cleaned: cleanedCount,
                    message: `智能清理完成，删除了 ${cleanedCount} 个会话，当前使用率: ${currentUsage.toFixed(1)}%`
                };
            } catch (error) {
                console.error('智能清理失败:', error);
                return { cleaned: 0, message: '清理失败: ' + error.message };
            }
        }

        // 更新存储信息显示
        async updateStorageDisplay() {
            const storageInfo = document.getElementById('storage-info');
            if (!storageInfo) return;

            try {
                const usage = await this.getStorageUsage();
                
                storageInfo.innerHTML = `
                    <div class="storage-usage">
                        <div class="storage-bar">
                            <div class="storage-fill" style="width: ${Math.min(usage.usagePercentage, 100)}%"></div>
                        </div>
                        <div class="storage-text">
                            ${usage.formattedSize} / ${usage.formattedMaxSize} (${usage.usagePercentage.toFixed(1)}%)
                        </div>
                        <div class="storage-details">
                            ${usage.conversationCount} 会话 • ${usage.messageCount} 消息 • ${usage.imageCount} 图片
                        </div>
                    </div>
                `;
                
                // 如果使用率过高，显示警告
                if (usage.usagePercentage > 80) {
                    storageInfo.classList.add('storage-warning');
                } else {
                    storageInfo.classList.remove('storage-warning');
                }
            } catch (error) {
                console.error('更新存储显示失败:', error);
                storageInfo.innerHTML = '<div class="storage-error">存储信息加载失败</div>';
            }
        }

        // 导出聊天数据
        async exportChatData(options = {}) {
            try {
                const {
                    includeImages = true,
                    dateRange = null, // { start: Date, end: Date }
                    conversationIds = null // 指定会话ID数组
                } = options;

                let conversations = await chatStorage.getAllConversations();
                
                // 过滤会话
                if (conversationIds) {
                    conversations = conversations.filter(conv => conversationIds.includes(conv.id));
                }
                
                const exportData = {
                    exportDate: new Date().toISOString(),
                    version: '1.0',
                    conversations: [],
                    metadata: {
                        totalConversations: conversations.length,
                        includeImages,
                        dateRange
                    }
                };

                for (const conversation of conversations) {
                    const messages = await chatStorage.getConversationMessages(conversation.id);
                    
                    // 过滤消息（按日期范围）
                    let filteredMessages = messages;
                    if (dateRange) {
                        filteredMessages = messages.filter(msg => {
                            const msgDate = new Date(msg.timestamp);
                            return msgDate >= dateRange.start && msgDate <= dateRange.end;
                        });
                    }
                    
                    // 处理图片数据
                    if (!includeImages) {
                        filteredMessages = filteredMessages.map(msg => ({
                            ...msg,
                            images: msg.images ? msg.images.map(img => ({
                                ...img,
                                data: '[图片数据已省略]'
                            })) : []
                        }));
                    }
                    
                    exportData.conversations.push({
                        ...conversation,
                        messages: filteredMessages
                    });
                }
                
                return exportData;
            } catch (error) {
                console.error('导出聊天数据失败:', error);
                throw error;
            }
        }

        // 导入聊天数据
        async importChatData(importData) {
            try {
                if (!importData.conversations || !Array.isArray(importData.conversations)) {
                    throw new Error('无效的导入数据格式');
                }

                let importedCount = 0;
                let skippedCount = 0;

                for (const conversationData of importData.conversations) {
                    try {
                        // 检查会话是否已存在
                        const existingConv = await chatStorage.getConversation(conversationData.id);
                        if (existingConv) {
                            skippedCount++;
                            continue;
                        }

                        // 导入会话
                        const conversation = new Conversation(conversationData);
                        await chatStorage.saveConversation(conversation);

                        // 导入消息
                        if (conversationData.messages && conversationData.messages.length > 0) {
                            for (const messageData of conversationData.messages) {
                                const message = new Message(messageData);
                                await chatStorage.saveMessage(conversation.id, message);
                            }
                        }

                        importedCount++;
                    } catch (error) {
                        console.error(`导入会话 ${conversationData.id} 失败:`, error);
                        skippedCount++;
                    }
                }

                return {
                    imported: importedCount,
                    skipped: skippedCount,
                    message: `导入完成：成功 ${importedCount} 个，跳过 ${skippedCount} 个`
                };
            } catch (error) {
                console.error('导入聊天数据失败:', error);
                throw error;
            }
        }

        // 定期检查和清理
        startPeriodicCleanup() {
            // 每小时检查一次
            setInterval(async () => {
                await this.autoCleanup();
                await this.updateStorageDisplay();
            }, 60 * 60 * 1000);
            
            // 立即执行一次
            setTimeout(async () => {
                await this.autoCleanup();
                await this.updateStorageDisplay();
            }, 5000);
        }
    }

    // 创建全局存储管理器实例
    const storageManager = new StorageManager();

    // === 初始化函数 ===
    function initializeApp() {
        loadSavedApiKey();
        initializeTemplates();
        loadTemplateOptions();
        bindEventListeners();
    }

    // === 密钥记忆功能 ===
    function loadSavedApiKey() {
        const rememberKey = localStorage.getItem(STORAGE_KEYS.REMEMBER_KEY) === 'true';
        const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        
        if (rememberKey && savedKey) {
            // 简单解码（Base64）
            try {
                const decodedKey = atob(savedKey);
                apiKeyInput.value = decodedKey;
                rememberKeyCheckbox.checked = true;
            } catch (e) {
                console.warn('无法解码保存的API密钥');
                localStorage.removeItem(STORAGE_KEYS.API_KEY);
            }
        }
    }

    function saveApiKey() {
        if (rememberKeyCheckbox.checked && apiKeyInput.value.trim()) {
            // 简单编码（Base64）
            const encodedKey = btoa(apiKeyInput.value.trim());
            localStorage.setItem(STORAGE_KEYS.API_KEY, encodedKey);
            localStorage.setItem(STORAGE_KEYS.REMEMBER_KEY, 'true');
        } else {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
            localStorage.setItem(STORAGE_KEYS.REMEMBER_KEY, 'false');
        }
    }

    function clearSavedApiKey() {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
        localStorage.setItem(STORAGE_KEYS.REMEMBER_KEY, 'false');
        apiKeyInput.value = '';
        rememberKeyCheckbox.checked = false;
        alert('已清除保存的API密钥');
    }

    // === 模板管理功能 ===
    function initializeTemplates() {
        // 直接加载已保存的模板，不再自动添加默认模板
        // 用户可以通过界面手动添加需要的模板
        const templates = getStoredTemplates();
        // 模板为空时不做任何操作，让用户自行管理
    }

    function getStoredTemplates() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('无法读取保存的模板');
            return [];
        }
    }

    function saveTemplates(templates) {
        try {
            localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
        } catch (e) {
            console.error('无法保存模板:', e);
            alert('保存模板失败，请检查浏览器存储空间');
        }
    }

    function loadTemplateOptions() {
        const templates = getStoredTemplates();
        
        // 清空现有选项（保留默认选项）
        templateSelect.innerHTML = '<option value="">选择提示词模板...</option>';
        
        // 添加模板选项
        templates.forEach((template, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = template.name;
            templateSelect.appendChild(option);
        });
    }

    function selectTemplate() {
        const selectedIndex = templateSelect.value;
        if (selectedIndex !== '') {
            const templates = getStoredTemplates();
            const template = templates[selectedIndex];
            if (template) {
                promptInput.value = template.content;
            }
        }
    }

    function saveCurrentPromptAsTemplate() {
        const currentPrompt = promptInput.value.trim();
        if (!currentPrompt) {
            alert('请先输入提示词内容');
            return;
        }
        
        const templateName = prompt('请输入模板名称:');
        if (!templateName || !templateName.trim()) {
            return;
        }
        
        const templates = getStoredTemplates();
        const newTemplate = {
            name: templateName.trim(),
            content: currentPrompt
        };
        
        templates.push(newTemplate);
        saveTemplates(templates);
        loadTemplateOptions();
        
        alert('模板保存成功！');
    }

    // === 模态框管理 ===
    function openTemplateModal() {
        templateModal.classList.remove('hidden');
        renderTemplatesList();
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    function closeTemplateModal() {
        templateModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
        // 清空输入框
        newTemplateName.value = '';
        newTemplateContent.value = '';
    }

    function renderTemplatesList() {
        const templates = getStoredTemplates();
        templatesList.innerHTML = '';
        
        if (templates.length === 0) {
            templatesList.innerHTML = '<p style="color: #888; text-align: center;">暂无模板</p>';
            return;
        }
        
        templates.forEach((template, index) => {
            const templateItem = document.createElement('div');
            templateItem.className = 'template-item';
            templateItem.innerHTML = `
                <div class="template-item-header">
                    <span class="template-name">${escapeHtml(template.name)}</span>
                    <div class="template-actions">
                        <button class="template-action-btn" onclick="editTemplate(${index})">编辑</button>
                        <button class="template-action-btn delete" onclick="deleteTemplate(${index})">删除</button>
                    </div>
                </div>
                <div class="template-content">${escapeHtml(template.content)}</div>
            `;
            templatesList.appendChild(templateItem);
        });
    }

    function addNewTemplate() {
        const name = newTemplateName.value.trim();
        const content = newTemplateContent.value.trim();
        
        if (!name || !content) {
            alert('请填写模板名称和内容');
            return;
        }
        
        const templates = getStoredTemplates();
        const newTemplate = { name, content };
        
        templates.push(newTemplate);
        saveTemplates(templates);
        loadTemplateOptions();
        renderTemplatesList();
        
        // 清空输入框
        newTemplateName.value = '';
        newTemplateContent.value = '';
        
        alert('模板添加成功！');
    }

    // === 全局函数（供HTML内联事件使用） ===
    window.editTemplate = function(index) {
        const templates = getStoredTemplates();
        const template = templates[index];
        if (!template) return;
        
        const newName = prompt('编辑模板名称:', template.name);
        if (newName === null) return; // 用户取消
        
        const newContent = prompt('编辑模板内容:', template.content);
        if (newContent === null) return; // 用户取消
        
        if (newName.trim() && newContent.trim()) {
            templates[index] = {
                name: newName.trim(),
                content: newContent.trim()
            };
            saveTemplates(templates);
            loadTemplateOptions();
            renderTemplatesList();
            alert('模板更新成功！');
        }
    };

    window.deleteTemplate = function(index) {
        if (!confirm('确定要删除这个模板吗？')) return;
        
        const templates = getStoredTemplates();
        templates.splice(index, 1);
        saveTemplates(templates);
        loadTemplateOptions();
        renderTemplatesList();
        alert('模板删除成功！');
    };

    // === 工具函数 ===
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === 事件监听器绑定 ===
    function bindEventListeners() {
        // 密钥记忆功能事件
        rememberKeyCheckbox.addEventListener('change', saveApiKey);
        apiKeyInput.addEventListener('input', saveApiKey);
        clearKeyBtn.addEventListener('click', clearSavedApiKey);
        
        // 模板功能事件
        templateSelect.addEventListener('change', selectTemplate);
        saveTemplateBtn.addEventListener('click', saveCurrentPromptAsTemplate);
        manageTemplatesBtn.addEventListener('click', openTemplateModal);
        closeModalBtn.addEventListener('click', closeTemplateModal);
        addTemplateBtn.addEventListener('click', addNewTemplate);
        
        // 模态框背景点击关闭
        templateModal.addEventListener('click', (e) => {
            if (e.target === templateModal) {
                closeTemplateModal();
            }
        });
        
        // ESC键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !templateModal.classList.contains('hidden')) {
                closeTemplateModal();
            }
        });
    }

    // === 启动应用 ===
    initializeApp();

    // 拖放功能
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('drag-over');
        });
    });

    uploadArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });

    function handleFiles(files) {
        files.forEach(file => {
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
                createThumbnail(file);
            }
        });
    }

    function createThumbnail(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';
            
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.name !== file.name);
                wrapper.remove();
            };
            
            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            thumbnailsContainer.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }

    // --- 集成多轮对话的API调用逻辑 ---
    generateBtn.addEventListener('click', async () => {
        await handleSendMessage();
    });

    // 处理发送消息的核心函数
    async function handleSendMessage() {
        const messageInput = document.getElementById('message-input');
        const imageInput = document.getElementById('image-input');
        const sendBtn = document.getElementById('send-btn');
        
        // 获取消息内容
        const messageText = messageInput ? messageInput.value.trim() : promptInput.value.trim();
        const currentImages = imageInput ? Array.from(imageInput.files) : selectedFiles;
        
        // 验证输入
        if (!apiKeyInput.value.trim()) {
            alert('请输入 OpenRouter API 密钥');
            return;
        }

        if (!messageText) {
            alert('请输入消息内容');
            return;
        }

        // 设置加载状态
        const isLegacyMode = !messageInput; // 判断是否为传统模式
        if (isLegacyMode) {
            setLoading(true);
        } else {
            sendBtn.disabled = true;
            sendBtn.textContent = '发送中...';
        }

        try {
            // 压缩图片（如果有）
            let compressedImages = [];
            if (currentImages.length > 0) {
                compressedImages = await imageCompressor.compressImages(currentImages);
            }

            // 创建用户消息
            const userMessage = new Message({
                role: 'user',
                content: messageText,
                images: compressedImages
            });

            // 如果是聊天模式，添加消息到当前会话
            if (!isLegacyMode && conversationManager.currentConversation) {
                await conversationManager.saveMessage(userMessage);
                conversationManager.renderMessage(userMessage);
                conversationManager.scrollToBottom();
            }

            // 构建API请求上下文
            let apiMessages;
            if (!isLegacyMode && conversationManager.currentConversation) {
                // 聊天模式：使用上下文管理器构建完整上下文
                apiMessages = await contextManager.buildContext(conversationManager.currentConversation.id);
            } else {
                // 传统模式：只发送当前消息
                apiMessages = [{
                    role: 'user',
                    content: messageText,
                    images: compressedImages.map(img => img.data)
                }];
            }

            // 发送API请求
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: apiMessages, // 使用messages数组而不是单个prompt
                    apikey: apiKeyInput.value
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 创建助手回复消息
            const assistantMessage = new Message({
                role: 'assistant',
                content: data.response || '生成完成',
                images: data.imageUrl ? [{ data: data.imageUrl, type: 'url' }] : []
            });

            if (!isLegacyMode && conversationManager.currentConversation) {
                // 聊天模式：保存助手回复并渲染
                await conversationManager.saveMessage(assistantMessage);
                conversationManager.renderMessage(assistantMessage);
                conversationManager.scrollToBottom();
                
                // 清空输入
                messageInput.value = '';
                if (imageInput) {
                    imageInput.value = '';
                }
                
                // 更新会话标题（如果是新会话的第一条消息）
                const messages = await conversationManager.loadConversationMessages(conversationManager.currentConversation.id);
                if (messages.length <= 2) { // 用户消息 + 助手回复
                    const title = await conversationManager.generateConversationTitle(messageText);
                    conversationManager.currentConversation.title = title;
                    await chatStorage.updateConversation(conversationManager.currentConversation);
                    conversationManager.renderConversationList();
                }
            } else {
                // 传统模式：显示结果
                displayResult(data.imageUrl);
            }

        } catch (error) {
            console.error('发送消息失败:', error);
            alert('Error: ' + error.message);
            
            if (isLegacyMode) {
                resultContainer.innerHTML = `<p>Error: ${error.message}</p>`;
            }
        } finally {
            // 恢复按钮状态
            if (isLegacyMode) {
                setLoading(false);
            } else {
                sendBtn.disabled = false;
                sendBtn.textContent = '发送';
            }
        }
    }
    // --- 集成多轮对话的API调用逻辑结束 ---

    function setLoading(isLoading) {
        generateBtn.disabled = isLoading;
        btnText.textContent = isLoading ? 'Generating...' : 'Generate';
        spinner.classList.toggle('hidden', !isLoading);
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function displayResult(imageUrl) {
        resultContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Generated image';
        resultContainer.appendChild(img);
    }

    // === 数据持久化功能 ===
    // 导出用户数据（API密钥和模板）
    function exportUserData() {
        try {
            const userData = {
                apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
                rememberKey: localStorage.getItem(STORAGE_KEYS.REMEMBER_KEY) || 'false',
                templates: getStoredTemplates(),
                exportDate: new Date().toISOString(),
                version: '1.0'
            };

            const dataStr = JSON.stringify(userData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `nanobanana-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            alert('数据导出成功！文件已下载到您的下载文件夹。');
        } catch (error) {
            console.error('导出数据失败:', error);
            alert('导出数据失败，请重试。');
        }
    }

    // 导入用户数据
    function importUserData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const userData = JSON.parse(e.target.result);
                    
                    // 验证数据格式
                    if (!userData.version || !userData.exportDate) {
                        throw new Error('无效的备份文件格式');
                    }

                    // 恢复API密钥设置
                    if (userData.apiKey) {
                        localStorage.setItem(STORAGE_KEYS.API_KEY, userData.apiKey);
                    }
                    if (userData.rememberKey) {
                        localStorage.setItem(STORAGE_KEYS.REMEMBER_KEY, userData.rememberKey);
                    }

                    // 恢复模板数据
                    if (userData.templates && Array.isArray(userData.templates)) {
                        saveTemplates(userData.templates);
                    }

                    // 重新加载界面
                    loadSavedApiKey();
                    loadTemplateOptions();
                    
                    alert(`数据导入成功！\n导出时间: ${new Date(userData.exportDate).toLocaleString()}\n模板数量: ${userData.templates ? userData.templates.length : 0}`);
                    resolve();
                } catch (error) {
                    console.error('导入数据失败:', error);
                    alert('导入数据失败：' + error.message);
                    reject(error);
                }
            };
            reader.onerror = () => {
                alert('读取文件失败，请重试。');
                reject(new Error('文件读取失败'));
            };
            reader.readAsText(file);
        });
    }

    // 处理文件导入的辅助函数
    function handleImportFile(input) {
        const file = input.files[0];
        if (file) {
            if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
                alert('请选择有效的JSON文件');
                return;
            }
            
            importUserData(file).finally(() => {
                // 清空文件输入，允许重复选择同一文件
                input.value = '';
            });
        }
    }

    // 将导出导入函数暴露到全局，供HTML调用
    window.exportUserData = exportUserData;
    window.importUserData = importUserData;
    window.handleImportFile = handleImportFile;

    // === 聊天界面事件绑定 ===
    // 绑定聊天界面的事件监听器
    function bindChatEvents() {
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const imageInput = document.getElementById('image-input');
        const newChatBtn = document.getElementById('new-chat-btn');
        
        // 发送按钮点击事件
        if (sendBtn) {
            sendBtn.addEventListener('click', handleSendMessage);
        }
        
        // 消息输入框回车发送
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
            
            // 自动调整输入框高度
            messageInput.addEventListener('input', () => {
                messageInput.style.height = 'auto';
                messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
            });
        }
        
        // 图片输入变化事件
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    console.log(`选择了 ${files.length} 张图片`);
                }
            });
        }
        
        // 新建对话按钮
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                conversationManager.createNewConversation();
            });
        }
        
        // 绑定存储管理事件
        bindStorageEvents();
    }
    
    // 绑定存储管理事件
    function bindStorageEvents() {
        // 导出聊天记录
        const exportChatBtn = document.getElementById('exportChatBtn');
        if (exportChatBtn) {
            exportChatBtn.addEventListener('click', async () => {
                try {
                    const exportData = await storageManager.exportChatData();
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                        type: 'application/json'
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `chat-backup-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    alert('聊天记录导出成功！');
                } catch (error) {
                    console.error('导出失败:', error);
                    alert('导出失败：' + error.message);
                }
            });
        }
        
        // 导入聊天记录
        const importChatBtn = document.getElementById('importChatBtn');
        const importChatFile = document.getElementById('importChatFile');
        if (importChatBtn && importChatFile) {
            importChatBtn.addEventListener('click', () => {
                importChatFile.click();
            });
            
            importChatFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);
                    const result = await storageManager.importChatData(importData);
                    
                    alert(result.message);
                    
                    // 刷新会话列表和存储显示
                    await conversationManager.loadConversations();
                    await storageManager.updateStorageDisplay();
                } catch (error) {
                    console.error('导入失败:', error);
                    alert('导入失败：' + error.message);
                }
                
                // 清空文件输入
                e.target.value = '';
            });
        }
        
        // 清理过期数据
        const cleanupBtn = document.getElementById('cleanupBtn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', async () => {
                if (confirm('确定要清理过期数据吗？这将删除30天前的会话数据。')) {
                    try {
                        await storageManager.autoCleanup();
                        await storageManager.updateStorageDisplay();
                        await conversationManager.loadConversations();
                        alert('清理完成！');
                    } catch (error) {
                        console.error('清理失败:', error);
                        alert('清理失败：' + error.message);
                    }
                }
            });
        }
    }
    
    // === 聊天系统初始化 ===
    // 初始化聊天系统
    async function initializeChatSystem() {
        try {
            // 初始化存储
            await chatStorage.init();
            
            // 初始化对话管理器
            await conversationManager.init();
            
            // 绑定聊天事件
            bindChatEvents();
            
            // 启动存储管理器
            storageManager.startPeriodicCleanup();
            
            // 检查是否有聊天界面元素
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) {
                console.log('聊天系统初始化完成');
                // 立即更新存储显示
                await storageManager.updateStorageDisplay();
            }
            
        } catch (error) {
            console.error('聊天系统初始化失败:', error);
        }
    }
    
    // 在页面加载完成后初始化聊天系统
    initializeChatSystem();
});
