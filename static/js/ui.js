export function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 10000; padding: 12px 20px; border-radius: 8px; color: white; font-size: 0.9rem; max-width: 350px; word-wrap: break-word; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); transform: translateX(100%); opacity: 0; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);`;
    const colors = { success: 'linear-gradient(135deg, #4CAF50, #45a049)', error: 'linear-gradient(135deg, #f44336, #d32f2f)', warning: 'linear-gradient(135deg, #ff9800, #f57c00)', info: 'linear-gradient(135deg, #2196F3, #1976d2)' };
    toast.style.background = colors[type] || colors.info;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => { if (toast.parentNode) { toast.parentNode.removeChild(toast); } }, 300); }, duration);
}

export function setLoading(isLoading, els) {
    const { generateBtn, btnText, spinner } = els || {};
    if (generateBtn && btnText) {
      generateBtn.disabled = isLoading;
      btnText.textContent = isLoading ? 'Generating...' : 'Generate';
    }
    const titleGif = document.querySelector('.title-gif');
    if (titleGif) {
      if (isLoading) { titleGif.src = 'chiploading.gif'; titleGif.alt = 'Loading...'; }
      else { titleGif.src = 'chipbanana.gif'; titleGif.alt = 'nano banana'; }
    }
    if (spinner) { spinner.classList.toggle('hidden', !isLoading); }
}

export function displayResult(container, data) {
    if (!container) return;
    container.innerHTML = '';
    if (typeof data === 'string') {
      if (data.startsWith('http') || data.startsWith('data:')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'result-image-wrapper';
        const img = document.createElement('img');
        img.src = data; img.alt = 'Generated image';
        const btn = document.createElement('a');
        btn.className = 'result-download-btn';
        btn.textContent = '下载';
        btn.href = data;
        const ext = (() => { if (data.startsWith('data:image/')) { const m = data.match(/^data:image\/(\w+)/); return m ? m[1] : 'png'; } const p = data.split('?')[0]; const e = p.split('.').pop()?.toLowerCase(); return ['png','jpg','jpeg','webp','gif'].includes(e||'') ? e : 'png'; })();
        btn.download = `nanobanana-result.${ext}`;
        wrapper.appendChild(img);
        wrapper.appendChild(btn);
        container.appendChild(wrapper);
      } else {
        const textDiv = document.createElement('div');
        textDiv.className = 'result-text';
        textDiv.textContent = data;
        container.appendChild(textDiv);
      }
      return;
    }
    if (data && typeof data === 'object') {
      if (data.text) {
        const textDiv = document.createElement('div');
        textDiv.className = 'result-text';
        textDiv.textContent = data.text;
        container.appendChild(textDiv);
      }
      if (data.imageUrl) {
        const wrapper = document.createElement('div');
        wrapper.className = 'result-image-wrapper';
        const img = document.createElement('img');
        img.src = data.imageUrl; img.alt = 'Generated image';
        img.style.marginTop = data.text ? '10px' : '0';
        const btn = document.createElement('a');
        btn.className = 'result-download-btn';
        btn.textContent = '下载';
        btn.href = data.imageUrl;
        const ext = (() => { if (data.imageUrl.startsWith('data:image/')) { const m = data.imageUrl.match(/^data:image\/(\w+)/); return m ? m[1] : 'png'; } const p = data.imageUrl.split('?')[0]; const e = p.split('.').pop()?.toLowerCase(); return ['png','jpg','jpeg','webp','gif'].includes(e||'') ? e : 'png'; })();
        btn.download = `nanobanana-result.${ext}`;
        wrapper.appendChild(img);
        wrapper.appendChild(btn);
        container.appendChild(wrapper);
      }
    }
}

export function renderConversationHistory(container, messages) {
    if (!container) return;
    const userMessages = messages.filter(msg => msg.role !== 'system');
    if (userMessages.length === 0) { container.innerHTML = '<p class="empty-history">开始新对话...</p>'; return; }
    container.innerHTML = '';
    userMessages.forEach((message) => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${message.role}`;
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      message.content.forEach(content => {
        if (content.type === 'text') {
          const textDiv = document.createElement('div');
          textDiv.className = 'message-text';
          textDiv.textContent = content.text;
          contentDiv.appendChild(textDiv);
        } else if (content.type === 'image_url') {
          const img = document.createElement('img');
          img.className = 'message-image';
          img.src = content.image_url.url;
          img.alt = '对话中的图片';
          contentDiv.appendChild(img);
        }
      });
      const timestamp = document.createElement('div');
      timestamp.className = 'message-timestamp';
      timestamp.textContent = new Date().toLocaleTimeString();
      messageDiv.appendChild(contentDiv);
      messageDiv.appendChild(timestamp);
      container.appendChild(messageDiv);
    });
    container.scrollTop = container.scrollHeight;
}

export function createThumbnail(container, file, selectedFiles) {
    if (!container) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'thumbnail-wrapper';
      const img = document.createElement('img');
      img.src = e.target.result; img.alt = file.name;
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.innerHTML = '✏️';
      editBtn.title = '编辑图片';
      editBtn.onclick = (ev) => {
        ev.stopPropagation();
        const fileIndex = selectedFiles.findIndex(f => f.name === file.name);
        if (fileIndex !== -1) {
          window.openImageEditor(selectedFiles[fileIndex], fileIndex, (editedFile) => {
            selectedFiles[fileIndex] = editedFile;
            if (window.updateThumbnail) { window.updateThumbnail(fileIndex, editedFile); }
          });
        } else { alert('未找到对应的图片文件，请重新上传'); }
      };
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = () => {
        const before = selectedFiles.length;
        for (let i = selectedFiles.length - 1; i >= 0; i--) {
          if (selectedFiles[i].name === file.name) { selectedFiles.splice(i, 1); }
        }
        wrapper.remove();
        const galleryItem = document.querySelector(`[data-image="${file.name}"]`);
        if (galleryItem) { galleryItem.classList.remove('selected'); }
      };
      wrapper.appendChild(img);
      wrapper.appendChild(editBtn);
      wrapper.appendChild(removeBtn);
      container.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
}
