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

    // === 聊天界面元素获取 ===
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const attachImageBtn = document.getElementById('attach-image-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const exportChatBtn = document.getElementById('export-chat-btn');
    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    const controlsPanel = document.querySelector('.controls-panel');

    let selectedFiles = [];
    let chatManager = new ChatManager();
    let currentChatImages = []; // 当前聊天中选择的图片

    // === 本地存储键名常量 ===
    const STORAGE_KEYS = {
        API_KEY: 'nanobanana_api_key',
        REMEMBER_KEY: 'nanobanana_remember_key',
        TEMPLATES: 'nanobanana_templates',
        CHAT_HISTORY: 'nanobanana_chat_history'
    };

    // === 聊天数据结构 ===
    class ChatMessage {
        constructor(role, content, images = [], timestamp = null) {
            this.id = Date.now() + Math.random(); // 唯一标识符
            this.role = role; // 'user' 或 'assistant'
            this.content = content; // 文本内容
            this.images = images; // 图片数组 [{url, name, base64}]
            this.timestamp = timestamp || new Date().toISOString();
            this.status = 'sent'; // 'sending', 'sent', 'error'
        }
    }

    // === 聊天管理类 ===
    class ChatManager {
        constructor() {
            this.messages = [];
            this.loadChatHistory();
        }

        // 添加消息
        addMessage(role, content, images = []) {
            const message = new ChatMessage(role, content, images);
            this.messages.push(message);
            this.saveChatHistory();
            return message;
        }

        // 获取所有消息
        getAllMessages() {
            return this.messages;
        }

        // 获取上下文消息（用于API调用）
        getContextMessages(maxMessages = 10) {
            // 返回最近的消息，用于维持对话上下文
            return this.messages.slice(-maxMessages).map(msg => ({
                role: msg.role,
                content: msg.content,
                images: msg.images
            }));
        }

        // 清空聊天记录
        clearChat() {
            this.messages = [];
            this.saveChatHistory();
        }

        // 删除单条消息
        deleteMessage(messageId) {
            this.messages = this.messages.filter(msg => msg.id !== messageId);
            this.saveChatHistory();
        }

        // 保存聊天记录到本地存储
        saveChatHistory() {
            try {
                localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(this.messages));
            } catch (e) {
                console.error('无法保存聊天记录:', e);
            }
        }

        // 从本地存储加载聊天记录
        loadChatHistory() {
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
                if (stored) {
                    this.messages = JSON.parse(stored);
                }
            } catch (e) {
                console.warn('无法加载聊天记录:', e);
                this.messages = [];
            }
        }

        // 导出聊天记录
        exportChat() {
            const exportData = {
                timestamp: new Date().toISOString(),
                messages: this.messages
            };
            return JSON.stringify(exportData, null, 2);
        }
    }

    // === 预设模板数据 ===
    // 默认模板已清空，用户可以自行添加模板
    const DEFAULT_TEMPLATES = [];

    // === 初始化函数 ===
    function initializeApp() {
        loadSavedApiKey();
        initializeTemplates();
        loadTemplateOptions();
        initializeChatUI();
        bindEventListeners();
    }

    // === 聊天界面初始化 ===
    function initializeChatUI() {
        // 加载历史聊天记录
        renderChatHistory();
        // 滚动到底部
        scrollToBottom();
    }

    // === 渲染聊天历史 ===
    function renderChatHistory() {
        const messages = chatManager.getAllMessages();
        
        // 清空聊天容器（保留欢迎消息）
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        chatMessages.innerHTML = '';
        
        if (messages.length === 0) {
            // 如果没有历史消息，显示欢迎消息
            if (welcomeMessage) {
                chatMessages.appendChild(welcomeMessage);
            }
        } else {
            // 渲染所有历史消息
            messages.forEach(message => {
                renderMessage(message);
            });
        }
    }

    // === 渲染单条消息 ===
    function renderMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        messageDiv.dataset.messageId = message.id;

        let imagesHtml = '';
        if (message.images && message.images.length > 0) {
            const imagesContainer = message.role === 'user' ? 
                '<div class="message-images">' : '<div class="message-images">';
            imagesHtml = imagesContainer + 
                message.images.map(img => 
                    `<img src="${img.url}" alt="${img.name}" class="message-image" onclick="openImagePreview('${img.url}')">`
                ).join('') + '</div>';
        }

        const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
            ${message.role === 'user' ? imagesHtml : ''}
            <div class="message-content">${message.content}</div>
            ${message.role === 'assistant' ? imagesHtml : ''}
            <div class="message-time">${timeStr}</div>
        `;

        chatMessages.appendChild(messageDiv);
    }

    // === 滚动到底部 ===
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
        
        // 聊天功能事件
        sendMessageBtn.addEventListener('click', sendChatMessage);
        attachImageBtn.addEventListener('click', () => fileInput.click());
        clearChatBtn.addEventListener('click', clearChatHistory);
        exportChatBtn.addEventListener('click', exportChatHistory);
        togglePanelBtn.addEventListener('click', toggleControlsPanel);
        
        // 聊天输入框事件
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
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

    // --- 核心修改区域开始 ---
    generateBtn.addEventListener('click', async () => {
        if (!apiKeyInput.value.trim()) {
            alert('请输入 OpenRouter API 密钥');
            return;
        }

        if (selectedFiles.length === 0) {
            alert('请选择至少一张图片');
            return;
        }

        if (!promptInput.value.trim()) {
            alert('请输入提示词');
            return;
        }

        setLoading(true);

        try {
            // 1. 创建一个 Promise 数组，用于将所有选中的文件转换为 Base64
            const conversionPromises = selectedFiles.map(file => fileToBase64(file));
            
            // 2. 等待所有文件转换完成
            const base64Images = await Promise.all(conversionPromises);
            
            // 3. 发送包含 images 数组的请求
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: promptInput.value,
                    images: base64Images, // 注意：这里从 'image' 改为了 'images'，并且值是一个数组
                    apikey: apiKeyInput.value
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            displayResult(data.imageUrl);
        } catch (error) {
            alert('Error: ' + error.message);
            resultContainer.innerHTML = `<p>Error: ${error.message}</p>`;
        } finally {
            setLoading(false);
        }
    });
    // --- 核心修改区域结束 ---

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
            importUserData(file);
        }
    }

    // === 聊天功能实现 ===
    
    // 发送聊天消息
    async function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message && currentChatImages.length === 0) {
            alert('请输入消息或上传图片');
            return;
        }

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('请先输入API密钥');
            return;
        }

        // 禁用发送按钮
        sendMessageBtn.disabled = true;
        sendMessageBtn.textContent = '发送中...';
        
        try {
            // 创建用户消息
            const userMessage = new ChatMessage('user', message, [...currentChatImages]);
            chatManager.addMessage(userMessage);
            renderMessage(userMessage);
            
            // 清空输入
            chatInput.value = '';
            currentChatImages = [];
            updateImagePreview();
            
            // 显示AI思考状态
            showTypingIndicator();
            
            // 准备API请求数据
            const chatHistory = chatManager.getMessages();
            const messages = chatHistory.map(msg => ({
                role: msg.role,
                content: msg.images && msg.images.length > 0 ? [
                    { type: 'text', text: msg.content },
                    ...msg.images.map(img => ({
                        type: 'image_url',
                        image_url: { url: img }
                    }))
                ] : msg.content
            }));

            // 发送API请求
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: messages,
                    apiKey: apiKey
                })
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            
            // 隐藏思考状态
            hideTypingIndicator();
            
            // 创建AI回复消息
            const aiMessage = new ChatMessage('assistant', data.content);
            chatManager.addMessage(aiMessage);
            renderMessage(aiMessage);
            
        } catch (error) {
            console.error('发送消息失败:', error);
            hideTypingIndicator();
            
            // 创建错误消息
            const errorMessage = new ChatMessage('assistant', `抱歉，发生了错误：${error.message}`);
            chatManager.addMessage(errorMessage);
            renderMessage(errorMessage);
        } finally {
            // 恢复发送按钮
            sendMessageBtn.disabled = false;
            sendMessageBtn.textContent = '发送';
            scrollToBottom();
        }
    }
    
    // 显示AI思考指示器
    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message ai-message typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(indicator);
        scrollToBottom();
    }
    
    // 隐藏AI思考指示器
    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    // 清空聊天记录
    function clearChatHistory() {
        if (!confirm('确定要清空所有聊天记录吗？此操作不可撤销。')) {
            return;
        }
        
        chatManager.clearHistory();
        chatMessages.innerHTML = '';
        currentChatImages = [];
        updateImagePreview();
        alert('聊天记录已清空');
    }
    
    // 导出聊天记录
    function exportChatHistory() {
        try {
            const chatData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                messages: chatManager.getMessages(),
                totalMessages: chatManager.getMessages().length
            };
            
            const blob = new Blob([JSON.stringify(chatData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('聊天记录导出成功！');
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            alert('导出聊天记录失败，请重试。');
        }
    }
    
    // 切换控制面板显示/隐藏
    function toggleControlsPanel() {
        const controlsPanel = document.querySelector('.controls-panel');
        controlsPanel.classList.toggle('hidden');
        
        const isHidden = controlsPanel.classList.contains('hidden');
        togglePanelBtn.textContent = isHidden ? '显示控制面板' : '隐藏控制面板';
    }
    
    // 更新图片预览
    function updateImagePreview() {
        const previewContainer = document.querySelector('.image-preview');
        if (!previewContainer) {
            // 如果预览容器不存在，创建一个
            const container = document.createElement('div');
            container.className = 'image-preview';
            chatInput.parentNode.insertBefore(container, chatInput);
        }
        
        const preview = document.querySelector('.image-preview');
        preview.innerHTML = '';
        
        currentChatImages.forEach((imageData, index) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'preview-image';
            imgContainer.innerHTML = `
                <img src="${imageData}" alt="预览图片 ${index + 1}">
                <button onclick="removeImage(${index})" class="remove-btn">×</button>
            `;
            preview.appendChild(imgContainer);
        });
    }
    
    // 移除图片
    window.removeImage = function(index) {
        currentChatImages.splice(index, 1);
        updateImagePreview();
    };

    // 将聊天功能函数暴露到全局
    window.sendChatMessage = sendChatMessage;
    window.clearChatHistory = clearChatHistory;
    window.exportChatHistory = exportChatHistory;
    window.toggleControlsPanel = toggleControlsPanel;

    // 将导出导入函数暴露到全局，供HTML调用
    window.exportUserData = exportUserData;
    window.importUserData = importUserData;
    window.handleImportFile = handleImportFile;
});
