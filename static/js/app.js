import { showToast, setLoading, displayResult, renderConversationHistory, createThumbnail } from './ui.js';
import { optimizeImageForUpload, compressBase64ToJpeg } from './image-utils.js';
import { generateImage, fetchEnvKey, generateImageGeminiOfficial } from './api.js';
import { STORAGE_KEYS, getApiKey, setApiKey, clearApiKey, getRememberKey, setRememberKey, getAutoClearPreference, setAutoClearPreference, getTemplates, saveTemplates, saveModelStates, loadModelStates } from './storage.js';
import { openImageEditor, updateThumbnail } from './editor.js';

let uploadArea, fileInput, thumbnailsContainer, promptInput, nbAspectSelect, nbResolutionSelect, nbResolutionOutput, apiKeyInput, googleApiKeyInput, generateBtn, btnText, spinner, resultContainer;
let conversationHistoryDiv, clearConversationBtn, toggleHistoryBtn, isHistoryVisible;
let rememberKeyCheckbox, clearKeyBtn, autoClearCheckbox, templateSelect, saveTemplateBtn, manageTemplatesBtn, templateModal, closeModalBtn, newTemplateName, newTemplateContent, addTemplateBtn, templatesList;
let selectedFiles = [];
let conversationHistory = [];
let isFirstMessage = true;
let currentModel = 'nanobanana';
const modelStates = { nanobanana: { files: [], prompt: '', apiKey: '', aspect: '16:9', resolution: '1k' } };

/**
 * 分辨率显示仅用于 UI 提示，不再假装给出“绝对像素值”。
 * 采用 Gemini / NanoBanana 的逻辑：1k/2k/4k ≈ 短边 1024 / 2048 / 4096。
 */
function getNbResolution() {
  const aspect = nbAspectSelect ? nbAspectSelect.value : '16:9';
  const level = nbResolutionSelect ? nbResolutionSelect.value : '1k';
  const shortMap = { '1k': 1024, '2k': 2048, '4k': 4096 };
  const short = shortMap[level] || 1024;
  const label = (level || '1k').toUpperCase();
  return {
    width: null,
    height: null,
    text: `${label}（短边≈${short}px，比例 ${aspect}，最终像素以模型生成为准）`
  };
}

function updateNbResolutionOutput() {
  const dims = getNbResolution();
  if (nbResolutionOutput && dims) { nbResolutionOutput.textContent = dims.text; }
}

function initializeConversationHistory() {
  conversationHistory = [{ role: 'system', content: [{ type: 'text', text: 'You are nano banana.' }] }];
}

async function loadSavedApiKey() {
  try {
    const data = await fetchEnvKey();
    if (data && data.hasEnvKey && data.apiKey) { apiKeyInput.value = data.apiKey; apiKeyInput.placeholder = '已从环境变量自动加载API密钥'; }
    if (data && data.hasGoogleKey && data.googleApiKey && googleApiKeyInput) { googleApiKeyInput.value = data.googleApiKey; googleApiKeyInput.placeholder = '已从环境变量自动加载Google API密钥'; }
  } catch {}
  const rememberKey = getRememberKey();
  const savedKey = getApiKey();
  if (rememberKey && savedKey) { try { const decodedKey = atob(savedKey); apiKeyInput.value = decodedKey; rememberKeyCheckbox.checked = true; } catch { clearApiKey(); } }
}

function saveApiKey() {
  if (rememberKeyCheckbox.checked && apiKeyInput.value.trim()) { const encoded = btoa(apiKeyInput.value.trim()); setApiKey(encoded); setRememberKey(true); } else { clearApiKey(); setRememberKey(false); }
}

function clearSavedApiKey() { clearApiKey(); setRememberKey(false); apiKeyInput.value = ''; rememberKeyCheckbox.checked = false; }

function loadAutoClearPreference() { const autoClear = getAutoClearPreference(); if (autoClearCheckbox) autoClearCheckbox.checked = autoClear; }
function saveAutoClearPreference() { const autoClear = autoClearCheckbox && autoClearCheckbox.checked; setAutoClearPreference(!!autoClear); }

function performAutoClear() {
  const shouldAutoClear = getAutoClearPreference();
  if (shouldAutoClear) { const before = selectedFiles.length; selectedFiles = []; if (thumbnailsContainer) thumbnailsContainer.innerHTML = ''; promptInput.value = ''; }
}

function getStoredTemplates() { return getTemplates(); }
function initializeTemplates() { const stored = getStoredTemplates(); if (!stored.length) { saveTemplates([{ name: '默认', content: '' }]); } }
function loadTemplateOptions() { const templates = getStoredTemplates(); if (!templateSelect) return; templateSelect.innerHTML = '<option value="">选择提示词模板...</option>'; templates.forEach((t, i) => { const option = document.createElement('option'); option.value = i; option.textContent = t.name; templateSelect.appendChild(option); }); }
function selectTemplate() { const idx = templateSelect.value; if (idx !== '') { const templates = getStoredTemplates(); const t = templates[idx]; if (t) { const cur = promptInput.value.trim(); promptInput.value = cur ? cur + '\n\n' + t.content : t.content; } } }
function saveCurrentPromptAsTemplate() { const cur = promptInput.value.trim(); if (!cur) { showToast('当前提示词为空，无法保存', 'warning', 2500); return; } if (templateModal) { templateModal.classList.remove('hidden'); } if (newTemplateContent) { newTemplateContent.value = cur; } if (newTemplateName) { newTemplateName.value = ''; newTemplateName.focus(); } }

function renderTemplatesList() {
  const templates = getStoredTemplates();
  if (!templatesList) return;
  templatesList.innerHTML = '';
  templates.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'template-item-row';
    const name = document.createElement('div');
    name.className = 'template-item-name';
    name.textContent = t.name;
    const actions = document.createElement('div');
    actions.className = 'template-item-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'modal-btn delete-template-btn';
    delBtn.textContent = '删除';
    delBtn.dataset.index = i;
    actions.appendChild(delBtn);
    row.appendChild(name);
    row.appendChild(actions);
    templatesList.appendChild(row);
  });
}

function removeTemplatesByNames(names) {
  const set = new Set(names);
  const templates = getStoredTemplates();
  const filtered = templates.filter(t => !set.has(t.name));
  if (filtered.length !== templates.length) { saveTemplates(filtered); }
}

function updateModelUI() { const container = document.querySelector('.conversation-container'); if (container) container.style.display = 'flex'; }

function saveCurrentModelState() {
  const s = modelStates[currentModel];
  if (!s) return;
  s.files = [...selectedFiles];
  s.prompt = promptInput.value;
  s.apiKey = apiKeyInput.value;
  if (nbAspectSelect) s.aspect = nbAspectSelect.value;
  if (nbResolutionSelect) s.resolution = nbResolutionSelect.value;
}
function saveModelStatesToStorage() {
  const data = { currentModel, modelStates: { [currentModel]: modelStates[currentModel] }, timestamp: Date.now() };
  saveModelStates(data);
}
function loadModelStatesFromStorage() {
  const data = loadModelStates();
  if (data && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
    if (data.modelStates[data.currentModel]) { Object.assign(modelStates[data.currentModel], data.modelStates[data.currentModel]); }
  }
}

function manageConversationLength() {
  const MAX_CONVERSATION_TURNS = 12;
  const MIN_MESSAGES_TO_KEEP = 6;
  if (conversationHistory.length > MAX_CONVERSATION_TURNS) {
    const sys = conversationHistory[0];
    const recent = conversationHistory.slice(-MIN_MESSAGES_TO_KEEP);
    conversationHistory = [sys, ...recent];
  }
}

export function handleFiles(files) {
  files.forEach(file => {
    if (!selectedFiles.some(f => f.name === file.name)) {
      selectedFiles.push(file);
      createThumbnail(thumbnailsContainer, file, selectedFiles);
    }
  });
}

export async function handleNanoBananaGeneration() {
  if (!promptInput.value.trim()) { alert('请输入提示词'); return; }
  setLoading(true, { generateBtn, btnText, spinner });
  try {
    let base64Images = [];
    if (selectedFiles.length > 0) {
      const promises = selectedFiles.map(file => optimizeImageForUpload(file));
      base64Images = await Promise.all(promises);
    }
    let messageContent = [{ type: 'text', text: promptInput.value }];

    // 复用上一张模型生成的图（多轮修改）
    if (conversationHistory.length > 0) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        const lastImage = Array.isArray(lastMessage.content)
          ? lastMessage.content.find(c => c.type === 'image_url' && c.image_url && c.image_url.url)
          : null;
        if (lastImage && base64Images.length === 0) {
          const len = lastImage.image_url.url.length;
          const threshold = Math.floor(2 * 1024 * 1024 * 1.33);
          if (len <= threshold) {
            messageContent.push({ type: 'image_url', image_url: { url: lastImage.image_url.url } });
            messageContent.push({
              type: 'text',
              text: '\n(Based on the image above, please modify according to my new instruction. Keep the character consistent. / 基于上图修改，保持角色一致。)'
            });
          }
        }
      }
    }

    const aspect = nbAspectSelect?.value || '16:9';
    const resLevel = nbResolutionSelect?.value || '1k';
    const resLabel = (resLevel || '1k').toUpperCase();
    messageContent.push({
      type: 'text',
      text: `请按比例 ${aspect} 与分辨率档位 ${resLabel} 生成图片，尽量保持画面构图完整，不要故意加黑边或大幅裁切。`
    });

    // 用户上传参考图
    if (base64Images.length > 0) {
      messageContent.push(...base64Images.map(img => ({ type: 'image_url', image_url: { url: img } })));
    }

    const currentUserMessage = { role: 'user', content: messageContent };
    if (isFirstMessage) { initializeConversationHistory(); conversationHistory.push(currentUserMessage); isFirstMessage = false; }
    else { conversationHistory.push(currentUserMessage); }

    let data;
    if (resLevel === '1k') {
      if (!apiKeyInput.value.trim()) { throw new Error('请输入 OpenRouter API 密钥'); }
      data = await generateImage({
        prompt: promptInput.value,
        images: base64Images,
        apikey: apiKeyInput.value,
        conversationHistory,
        parameters: { aspect_ratio: aspect, resolution: resLabel }
      });
    } else {
      if (!googleApiKeyInput || !googleApiKeyInput.value.trim()) { throw new Error('请输入 Google Gemini API 密钥'); }
      const imageSize = resLabel === '2K' ? '2K' : '4K';
      data = await generateImageGeminiOfficial(messageContent, aspect, imageSize, googleApiKeyInput.value.trim());
    }

    if (data.error) { throw new Error(data.error); }
    if (data.usedFallback && data.model) { showToast(`已切换到后备模型：${data.model}`, 'warning', 4000); }

    let assistantContent = [];
    if (data.text) { assistantContent.push({ type: 'text', text: data.text }); }
    if (data.imageUrl) {
      // 不再前端压缩，直接使用原始图像 URL（保持 2K / 4K 等真实分辨率）
      assistantContent.push({ type: 'image_url', image_url: { url: data.imageUrl } });
    }
    if (assistantContent.length === 0) { assistantContent.push({ type: 'text', text: '处理完成' }); }

    const assistantMessage = { role: 'assistant', content: assistantContent };
    conversationHistory.push(assistantMessage);
    manageConversationLength();
    displayResult(resultContainer, data);
    renderConversationHistory(conversationHistoryDiv, conversationHistory);
  } catch (error) {
    alert('Error: ' + error.message);
    if (resultContainer) resultContainer.innerHTML = `<p>Error: ${error.message}</p>`;
  } finally {
    setLoading(false, { generateBtn, btnText, spinner });
    performAutoClear();
  }
}

export function selectGalleryImage(galleryItem) {
  (async () => {
    const imageName = galleryItem.dataset.image;
    galleryItem.classList.toggle('selected');
    if (!galleryItem.classList.contains('selected')) {
      selectedFiles = selectedFiles.filter(file => file.name !== imageName);
      const thumbnails = thumbnailsContainer.querySelectorAll('.thumbnail-wrapper');
      thumbnails.forEach(thumbnail => {
        const img = thumbnail.querySelector('img');
        if (img && img.alt === imageName) { thumbnail.remove(); }
      });
      return;
    }
    try {
      const response = await fetch(imageName);
      const blob = await response.blob();
      const file = new File([blob], imageName, { type: blob.type });
      if (!selectedFiles.some(f => f.name === file.name)) {
        selectedFiles.push(file);
        createThumbnail(thumbnailsContainer, file, selectedFiles);
      }
    } catch (e) {
      alert('加载图片失败，请重试');
      galleryItem.classList.remove('selected');
    }
  })();
}

export function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

export async function initializeApp() {
  uploadArea = document.querySelector('.upload-area');
  fileInput = document.getElementById('image-upload');
  thumbnailsContainer = document.getElementById('thumbnails-container');
  promptInput = document.getElementById('prompt-input');
  nbAspectSelect = document.getElementById('nb-aspect-select');
  nbResolutionSelect = document.getElementById('nb-resolution-select');
  nbResolutionOutput = document.getElementById('nb-resolution-output');
  apiKeyInput = document.getElementById('api-key-input');
  googleApiKeyInput = document.getElementById('google-api-key-input');
  generateBtn = document.getElementById('generate-btn');
  btnText = generateBtn ? generateBtn.querySelector('.btn-text') : null;
  spinner = generateBtn ? generateBtn.querySelector('.spinner') : null;
  resultContainer = document.getElementById('result-image-container');
  conversationHistoryDiv = document.getElementById('conversation-history');
  clearConversationBtn = document.getElementById('clear-conversation-btn');
  toggleHistoryBtn = document.getElementById('toggle-history-btn');
  isHistoryVisible = true;
  rememberKeyCheckbox = document.getElementById('remember-key-checkbox');
  clearKeyBtn = document.getElementById('clear-key-btn');
  autoClearCheckbox = document.getElementById('auto-clear-checkbox');
  templateSelect = document.getElementById('template-select');
  saveTemplateBtn = document.getElementById('save-template-btn');
  manageTemplatesBtn = document.getElementById('manage-templates-btn');
  templateModal = document.getElementById('template-modal');
  closeModalBtn = document.getElementById('close-modal-btn');
  newTemplateName = document.getElementById('new-template-name');
  newTemplateContent = document.getElementById('new-template-content');
  addTemplateBtn = document.getElementById('add-template-btn');
  templatesList = document.getElementById('templates-list');

  await loadSavedApiKey();
  loadAutoClearPreference();
  initializeTemplates();
  removeTemplatesByNames(['图1改图2尺寸', '整合内容尺寸到最后一张图', '参考图2制作海报', '参考图2修改形象']);
  loadTemplateOptions();
  renderTemplatesList();
  loadModelStatesFromStorage();
  updateModelUI();
  renderConversationHistory(conversationHistoryDiv, conversationHistory);

  // 初始化时更新一次分辨率显示
  updateNbResolutionOutput();
}

export function bindEventListeners() {
  if (rememberKeyCheckbox) rememberKeyCheckbox.addEventListener('change', saveApiKey);
  if (apiKeyInput) apiKeyInput.addEventListener('input', saveApiKey);
  if (clearKeyBtn) clearKeyBtn.addEventListener('click', clearSavedApiKey);
  if (autoClearCheckbox) autoClearCheckbox.addEventListener('change', saveAutoClearPreference);
  if (templateSelect) templateSelect.addEventListener('change', selectTemplate);
  if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', saveCurrentPromptAsTemplate);
  if (manageTemplatesBtn && templateModal) manageTemplatesBtn.addEventListener('click', () => { templateModal.classList.remove('hidden'); renderTemplatesList(); });
  if (closeModalBtn && templateModal) closeModalBtn.addEventListener('click', () => { templateModal.classList.add('hidden'); });
  if (addTemplateBtn) addTemplateBtn.addEventListener('click', () => {
    const name = newTemplateName.value.trim();
    const content = newTemplateContent.value.trim();
    if (name && content) {
      const templates = getStoredTemplates();
      templates.push({ name, content });
      saveTemplates(templates);
      loadTemplateOptions();
      renderTemplatesList();
      showToast('模板已保存', 'success', 2000);
    } else {
      showToast('请输入名称和内容', 'warning', 2000);
    }
  });
  if (templatesList) templatesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-template-btn');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index || '-1', 10);
    const templates = getStoredTemplates();
    if (Number.isInteger(idx) && idx >= 0 && idx < templates.length) {
      templates.splice(idx, 1);
      saveTemplates(templates);
      loadTemplateOptions();
      renderTemplatesList();
      showToast('模板已删除', 'success', 2000);
    }
  });
  if (nbAspectSelect) nbAspectSelect.addEventListener('change', () => { saveCurrentModelState(); updateNbResolutionOutput(); saveModelStatesToStorage(); });
  if (nbResolutionSelect) nbResolutionSelect.addEventListener('change', () => { saveCurrentModelState(); updateNbResolutionOutput(); saveModelStatesToStorage(); });
  if (clearConversationBtn) clearConversationBtn.addEventListener('click', () => { initializeConversationHistory(); renderConversationHistory(conversationHistoryDiv, conversationHistory); });
  if (toggleHistoryBtn && conversationHistoryDiv) toggleHistoryBtn.addEventListener('click', () => {
    isHistoryVisible = !isHistoryVisible;
    if (isHistoryVisible) { conversationHistoryDiv.classList.remove('hidden'); toggleHistoryBtn.textContent = '隐藏历史'; }
    else { conversationHistoryDiv.classList.add('hidden'); toggleHistoryBtn.textContent = '显示历史'; }
  });
}
