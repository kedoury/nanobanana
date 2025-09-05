<script>
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
    
    // === 图库功能元素获取 ===
    const galleryItems = document.querySelectorAll('.gallery-item');

    let selectedFiles = [];

    // === 本地存储键名常量 ===
    const STORAGE_KEYS = {
        API_KEY: 'nanobanana_api_key',
        REMEMBER_KEY: 'nanobanana_remember_key',
        TEMPLATES: 'nanobanana_templates'
    };

    // === 预设模板数据（保持 name 唯一）===
    const DEFAULT_TEMPLATES = [
        {
            name: "图1改图2尺寸",
            content: "Transfer the content of Figure 1 to Figure 2. Expand Figure 1's content to match Figure 2's aspect ratio. Completely erase Figure 2's existing content, retaining only its aspect ratio"
        },
        {
            name: "整合内容尺寸到最后一张图",
            content: "Transfer the completed content to the final figure. Expand the image content to match the final figure's aspect ratio. Completely erase the final figure's existing content, retaining only its aspect ratio"
        },
        {
            name: "参考图2制作海报",
            content: "Remove the background of the Figure 1, refer to the Figure 2 and add text packaging that matches the character style to make a game promotional poster"
        },
        {
            name: "参考图2修改形象",
            content: "Keep the style and character movements of Figure 1, and modify the character image with reference to Figure 2"
        },
        {
            name: "户外真人COS",
            content: "Generate a photo of a cosplayer dressed in the costume of the illustrated character, posing with the action of the character in the picture, with exquisite makeup, set in an anime exhibition, outdoors, under strong sunlight."
        },
        {
            name: "室内真人COS",
            content: "Generate a highly detailed photo of a girl cosplaying this illustration, at Comiket. Exactly replicate the same pose, body posture, hand gestures, facial expression, and camera framing as in the original illustration. Keep the same angle, perspective, and composition, without any deviation"
        }
    ];

    // === 初始化函数 ===
    async function initializeApp() {
        await loadSavedApiKey(); // 等待API密钥加载完成
        initializeTemplates();   // ★ 改成“合并默认模板”策略
        loadTemplateOptions();
        bindEventListeners();
    }

    // === 密钥记忆功能 ===
    async function loadSavedApiKey() {
        // 1. 首先尝试从环境变量获取API密钥
        try {
            const response = await fetch('/api/get-env-key');
            if (response.ok) {
                const data = await response.json();
                if (data.hasEnvKey && data.apiKey) {
                    apiKeyInput.value = data.apiKey;
                    apiKeyInput.placeholder = '已从环境变量自动加载API密钥';
                    console.log('✅ 已从环境变量自动加载API密钥');
                    return; // 如果环境变量有密钥，就不需要从本地存储加载了
                }
            }
        } catch (error) {
            console.warn('无法从环境变量获取API密钥:', error);
        }

        // 2. 如果环境变量没有密钥，则尝试从本地存储加载
        const rememberKey = localStorage.getItem(STORAGE_KEYS.REMEMBER_KEY) === 'true';
        const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        
        if (rememberKey && savedKey) {
            // 简单解码（Base64）
            try {
                const decodedKey = atob(savedKey);
                apiKeyInput.value = decodedKey;
                rememberKeyCheckbox.checked = true;
                console.log('✅ 已从本地存储加载保存的API密钥');
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

    // === 模板管理功能（方案B：合并默认模板） ===
    function initializeTemplates() {
        let stored = getStoredTemplates();

        // 首次：直接写入默认模板
        if (!stored.length) {
            saveTemplates(DEFAULT_TEMPLATES);
            return;
        }

        // 其后：把“默认模板中新增的项（按 name 去重）”并入本地
        const existingNames = new Set(stored.map(t => t.name));
        let changed = false;

        DEFAULT_TEMPLATES.forEach(def => {
            if (!existingNames.has(def.name)) {
                stored.push(def);
                changed = true;
            }
        });

        // ★ 不覆盖同名模板内容（保护用户自定义/旧版本修改）
        if (changed) {
            saveTemplates(stored);
        }
    }

    // （可选）一键恢复默认模板
    function resetToDefaultTemplates() {
        if (confirm('将清空现有模板并恢复为默认模板，确定吗？')) {
            saveTemplates(DEFAULT_TEMPLATES);
            loadTemplateOptions();
            renderTemplatesList();
            alert('已恢复默认模板');
        }
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
                // 如果已有内容，就追加到后面，否则直接设置
                const currentContent = promptInput.value.trim();
                if (currentContent) {
                    // 在现有内容后面添加换行符和新模板内容
                    promptInput.value = currentContent + '\n\n' + template.content;
                } else {
                    // 如果没有内容，直接设置模板内容
                    promptInput.value = template.content;
                }
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

    // （可选）把重置函数也挂到全局，方便你在控制台调用或绑定按钮
    window.resetToDefaultTemplates = resetToDefaultTemplates;

    // === 图库功能 ===
    async function selectGalleryImage(galleryItem) {
        const imageName = galleryItem.dataset.image;
        
        // 切换选中状态的视觉效果
        galleryItem.classList.toggle('selected');
        
        // 如果是取消选择，从selectedFiles中移除
        if (!galleryItem.classList.contains('selected')) {
            selectedFiles = selectedFiles.filter(file => file.name !== imageName);
            // 移除对应的缩略图
            const thumbnails = thumbnailsContainer.querySelectorAll('.thumbnail-wrapper');
            thumbnails.forEach(thumbnail => {
                const img = thumbnail.querySelector('img');
                if (img && img.alt === imageName) {
                    thumbnail.remove();
                }
            });
            return;
        }
        
        try {
            // 获取图片并转换为File对象
            const response = await fetch(imageName);
            const blob = await response.blob();
            
            // 创建File对象，使用图片名称
            const file = new File([blob], imageName, { type: blob.type });
            
            // 检查是否已经存在相同文件
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
                createThumbnail(file);
            }
        } catch (error) {
            console.error('加载图库图片失败:', error);
            alert('加载图片失败，请重试');
            // 如果加载失败，取消选中状态
            galleryItem.classList.remove('selected');
        }
    }
    
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
        
        // 图库功能事件
        galleryItems.forEach(item => {
            item.addEventListener('click', () => selectGalleryImage(item));
        });
    }

    // === 启动应用 ===
    initializeApp().catch(error => {
        console.error('应用初始化失败:', error);
    });

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
                
                // 如果删除的是图库中的图片，取消对应图库项的选中状态
                const galleryItem = document.querySelector(`[data-image="${file.name}"]`);
                if (galleryItem) {
                    galleryItem.classList.remove('selected');
                }
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

        // 图片上传现在是可选的，支持纯文字生成图片
        // if (selectedFiles.length === 0) {
        //     alert('请选择至少一张图片');
        //     return;
        // }

        if (!promptInput.value.trim()) {
            alert('请输入提示词');
            return;
        }

        setLoading(true);

        try {
            // 1. 处理图片转换（如果有选择图片的话）
            let base64Images = [];
            if (selectedFiles.length > 0) {
                // 创建一个 Promise 数组，用于将所有选中的文件转换为 Base64
                const conversionPromises = selectedFiles.map(file => fileToBase64(file));
                // 等待所有文件转换完成
                base64Images = await Promise.all(conversionPromises);
            }
            
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
            resultContainer.innerHTML = `<p>Error: ${escapeHtml(error.message)}</p>`;
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
});
</script>
