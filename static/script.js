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
    
    // === 聊天界面元素获取 ===
    const chatMessages = document.getElementById('chat-messages');
    const currentSessionTitle = document.getElementById('current-session-title');
    const sessionsList = document.getElementById('sessions-list');
    const newChatBtn = document.getElementById('new-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const deleteSessionBtn = document.getElementById('delete-session-btn');

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
    let currentSessionId = null;
    let sessions = {};
    let isGenerating = false;

    // === 本地存储键名常量 ===
    const STORAGE_KEYS = {
        API_KEY: 'nanobanana_api_key',
        REMEMBER_KEY: 'nanobanana_remember_key',
        TEMPLATES: 'nanobanana_templates',
        SESSIONS: 'nanobanana_sessions',
        CURRENT_SESSION: 'nanobanana_current_session'
    };

    // === 预设模板数据 ===
    // 默认模板已清空，用户可以自行添加模板
    const DEFAULT_TEMPLATES = [];

    // === 初始化函数 ===
    function initializeApp() {
        loadSavedApiKey();
        initializeTemplates();
        loadTemplateOptions();
        initializeChatSystem();
        bindEventListeners();
    }

    // === 聊天系统初始化 ===
    function initializeChatSystem() {
        loadSessions();
        loadCurrentSession();
        if (!currentSessionId) {
            createNewSession();
        }
        renderSessionsList();
        renderCurrentChat();
    }

    // === 会话管理功能 ===
    function loadSessions() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
            sessions = stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('无法读取保存的会话');
            sessions = {};
        }
    }

    function saveSessions() {
        try {
            localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
        } catch (e) {
            console.error('无法保存会话:', e);
        }
    }

    function loadCurrentSession() {
        try {
            currentSessionId = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
            if (currentSessionId && !sessions[currentSessionId]) {
                currentSessionId = null;
            }
        } catch (e) {
            console.warn('无法读取当前会话');
            currentSessionId = null;
        }
    }

    function saveCurrentSession() {
        try {
            if (currentSessionId) {
                localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, currentSessionId);
            } else {
                localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
            }
        } catch (e) {
            console.error('无法保存当前会话:', e);
        }
    }

    function createNewSession() {
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const session = {
            id: sessionId,
            title: '新对话',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        sessions[sessionId] = session;
        currentSessionId = sessionId;
        
        saveSessions();
        saveCurrentSession();
        renderSessionsList();
        renderCurrentChat();
        updateSessionTitle();
        
        return sessionId;
    }

    function switchToSession(sessionId) {
        if (sessions[sessionId]) {
            currentSessionId = sessionId;
            saveCurrentSession();
            renderSessionsList();
            renderCurrentChat();
            updateSessionTitle();
            
            // 清空当前选择的文件
            selectedFiles = [];
            thumbnailsContainer.innerHTML = '';
            promptInput.value = '';
        }
    }

    function deleteSession(sessionId) {
        if (!sessions[sessionId]) return;
        
        if (!confirm('确定要删除这个会话吗？所有消息将被永久删除。')) {
            return;
        }
        
        delete sessions[sessionId];
        
        if (currentSessionId === sessionId) {
            // 如果删除的是当前会话，切换到其他会话或创建新会话
            const remainingSessions = Object.keys(sessions);
            if (remainingSessions.length > 0) {
                switchToSession(remainingSessions[0]);
            } else {
                createNewSession();
            }
        }
        
        saveSessions();
        renderSessionsList();
    }

    function clearCurrentChat() {
        if (!currentSessionId || !sessions[currentSessionId]) return;
        
        if (!confirm('确定要清空当前对话吗？所有消息将被删除。')) {
            return;
        }
        
        sessions[currentSessionId].messages = [];
        sessions[currentSessionId].updatedAt = new Date().toISOString();
        sessions[currentSessionId].title = '新对话';
        
        saveSessions();
        renderSessionsList();
        renderCurrentChat();
        updateSessionTitle();
    }

    function updateSessionTitle() {
        if (!currentSessionId || !sessions[currentSessionId]) return;
        
        const session = sessions[currentSessionId];
        currentSessionTitle.textContent = session.title;
    }

    // === 消息管理功能 ===
    function addMessage(type, content, images = []) {
        if (!currentSessionId || !sessions[currentSessionId]) return;
        
        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type: type, // 'user' 或 'assistant'
            content: content,
            images: images,
            timestamp: new Date().toISOString()
        };
        
        sessions[currentSessionId].messages.push(message);
        sessions[currentSessionId].updatedAt = new Date().toISOString();
        
        // 自动更新会话标题（使用第一条用户消息的前20个字符）
        if (type === 'user' && sessions[currentSessionId].title === '新对话') {
            const title = content.length > 20 ? content.substring(0, 20) + '...' : content;
            sessions[currentSessionId].title = title;
        }
        
        saveSessions();
        renderSessionsList();
        updateSessionTitle();
        
        return message;
    }

    function renderSessionsList() {
        sessionsList.innerHTML = '';
        
        const sessionIds = Object.keys(sessions).sort((a, b) => {
            return new Date(sessions[b].updatedAt) - new Date(sessions[a].updatedAt);
        });
        
        if (sessionIds.length === 0) {
            sessionsList.innerHTML = '<p style="color: #888; text-align: center; padding: 1rem;">暂无对话</p>';
            return;
        }
        
        sessionIds.forEach(sessionId => {
            const session = sessions[sessionId];
            const sessionItem = document.createElement('div');
            sessionItem.className = `session-item ${sessionId === currentSessionId ? 'active' : ''}`;
            
            const lastMessage = session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
            const preview = lastMessage ? 
                (lastMessage.content.length > 30 ? lastMessage.content.substring(0, 30) + '...' : lastMessage.content) : 
                '暂无消息';
            
            sessionItem.innerHTML = `
                <div class="session-title">${escapeHtml(session.title)}</div>
                <div class="session-preview">${escapeHtml(preview)}</div>
                <div class="session-time">${formatTime(session.updatedAt)}</div>
            `;
            
            sessionItem.addEventListener('click', () => switchToSession(sessionId));
            sessionsList.appendChild(sessionItem);
        });
    }

    function renderCurrentChat() {
        if (!currentSessionId || !sessions[currentSessionId]) {
            chatMessages.innerHTML = '<div class="welcome-message"><p>👋 欢迎使用 nano banana！</p><p>上传图片并输入提示词开始对话吧</p></div>';
            return;
        }
        
        const session = sessions[currentSessionId];
        chatMessages.innerHTML = '';
        
        if (session.messages.length === 0) {
            chatMessages.innerHTML = '<div class="welcome-message"><p>👋 欢迎使用 nano banana！</p><p>上传图片并输入提示词开始对话吧</p></div>';
            return;
        }
        
        session.messages.forEach(message => {
            renderMessage(message);
        });
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function renderMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        messageDiv.dataset.messageId = message.id;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        
        let content = '';
        
        // 渲染图片（如果有）
        if (message.images && message.images.length > 0) {
            content += '<div class="message-images">';
            message.images.forEach(imageData => {
                content += `<img src="${imageData}" class="message-image" alt="上传的图片">`;
            });
            content += '</div>';
        }
        
        // 渲染文本内容
        content += `<p class="message-content">${escapeHtml(message.content)}</p>`;
        
        // 渲染时间
        content += `<div class="message-time">${formatTime(message.timestamp)}</div>`;
        
        bubbleDiv.innerHTML = content;
        messageDiv.appendChild(bubbleDiv);
        chatMessages.appendChild(messageDiv);
    }

    function showTypingIndicator() {
        const existingIndicator = chatMessages.querySelector('.typing-indicator');
        if (existingIndicator) return;
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function hideTypingIndicator() {
        const typingIndicator = chatMessages.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    // === 工具函数 ===
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins}分钟前`;
        if (diffHours < 24) return `${diffHours}小时前`;
        if (diffDays < 7) return `${diffDays}天前`;
        
        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins}分钟前`;
        if (diffHours < 24) return `${diffHours}小时前`;
        if (diffDays < 7) return `${diffDays}天前`;
        
        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

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
        
        // 聊天界面事件
        newChatBtn.addEventListener('click', createNewSession);
        clearChatBtn.addEventListener('click', clearCurrentChat);
        
        // 提示词输入框回车发送
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isGenerating && promptInput.value.trim()) {
                    generateBtn.click();
                }
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

        // 设置生成状态
        isGenerating = true;
        setLoading(true);

        try {
            // 1. 创建一个 Promise 数组，用于将所有选中的文件转换为 Base64
            const conversionPromises = selectedFiles.map(file => fileToBase64(file));
            
            // 2. 等待所有文件转换完成
            const base64Images = await Promise.all(conversionPromises);
            
            // 3. 添加用户消息到聊天历史
            const userMessage = addMessage('user', promptInput.value, base64Images);
            renderMessage(userMessage);
            
            // 4. 显示打字指示器
            showTypingIndicator();
            
            // 5. 构建消息历史（包含上下文）
            const messages = [];
            if (currentSessionId && sessions[currentSessionId]) {
                const session = sessions[currentSessionId];
                // 添加历史消息到请求中（最近10条消息以保持上下文）
                const recentMessages = session.messages.slice(-10);
                
                recentMessages.forEach(msg => {
                    if (msg.type === 'user') {
                        const content = [{ type: "text", text: msg.content }];
                        if (msg.images && msg.images.length > 0) {
                            msg.images.forEach(imageData => {
                                content.push({
                                    type: "image_url",
                                    image_url: { url: imageData }
                                });
                            });
                        }
                        messages.push({ role: "user", content });
                    } else if (msg.type === 'assistant') {
                        messages.push({
                            role: "assistant",
                            content: [{ type: "text", text: msg.content }]
                        });
                    }
                });
            }
            
            // 6. 构建请求数据
            const requestData = {
                model: "google/gemini-2.0-flash-exp",
                messages: messages
            };
            
            // 7. 发送请求
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKeyInput.value}`
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.choices && data.choices[0] && data.choices[0].message) {
                const result = data.choices[0].message.content;
                
                // 隐藏打字指示器
                hideTypingIndicator();
                
                // 添加AI回复到聊天历史
                const assistantMessage = addMessage('assistant', result);
                renderMessage(assistantMessage);
                
                // 清空输入框和文件选择
                promptInput.value = '';
                selectedFiles = [];
                thumbnailsContainer.innerHTML = '';
                
                // 滚动到底部
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
            } else {
                throw new Error('响应格式错误');
            }
        } catch (error) {
            console.error('生成失败:', error);
            
            // 隐藏打字指示器
            hideTypingIndicator();
            
            // 添加错误消息
            const errorMessage = addMessage('assistant', `❌ 生成失败: ${error.message}`);
            renderMessage(errorMessage);
            
            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } finally {
            // 恢复按钮状态
            isGenerating = false;
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
});
