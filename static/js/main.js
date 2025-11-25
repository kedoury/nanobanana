import { initializeApp, bindEventListeners, handleFiles, handleNanoBananaGeneration, preventDefaults } from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
  bindEventListeners();

  const uploadArea = document.querySelector('.upload-area');
  const fileInput = document.getElementById('image-upload');
  const generateBtn = document.getElementById('generate-btn');

  if (uploadArea) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => { uploadArea.addEventListener(eventName, preventDefaults, false); });
    ['dragenter', 'dragover'].forEach(eventName => { uploadArea.addEventListener(eventName, () => { uploadArea.classList.add('drag-over'); }); });
    ['dragleave', 'drop'].forEach(eventName => { uploadArea.addEventListener(eventName, () => { uploadArea.classList.remove('drag-over'); }); });
    uploadArea.addEventListener('drop', (e) => { const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/')); handleFiles(files); });
  }

  if (fileInput) { fileInput.addEventListener('change', (e) => { const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/')); handleFiles(files); }); }
  if (generateBtn) { generateBtn.addEventListener('click', async () => { await handleNanoBananaGeneration(); }); }
});