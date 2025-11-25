import { calculateCanvasSize } from './image-utils.js';
const imageEditorModal = document.getElementById('image-editor-modal');
  const backgroundCanvas = document.getElementById('background-canvas');
  const drawingCanvas = document.getElementById('drawing-canvas');
  const backgroundCtx = backgroundCanvas.getContext('2d');
  const drawingCtx = drawingCanvas.getContext('2d');
  const brushTool = document.getElementById('brush-tool');
  const textTool = document.getElementById('text-tool');
  const rectTool = document.getElementById('rect-tool');
  const eraserTool = document.getElementById('eraser-tool');
  const colorPicker = document.getElementById('color-picker');
  const brushSize = document.getElementById('brush-size');
  const sizeDisplay = document.getElementById('size-display');
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const clearCanvas = document.getElementById('clear-canvas');
  const cancelEdit = document.getElementById('cancel-edit');
  const saveEdit = document.getElementById('save-edit');

  let currentTool = 'brush';
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentImage = null;
  let currentImageIndex = -1;
  let editHistory = [];
  let historyStep = -1;
  let isDrawingShape = false;
  let shapeStartX = 0;
  let shapeStartY = 0;
  let tempCanvas = null;
  let tempCtx = null;
  let textElements = [];
  let isEditingText = false;
  let currentTextInput = null;
  let saveCallback = null;
  let initialized = false;

export function openImageEditor(imageFile, imageIndex, onSave) {
    if (!imageEditorModal || !backgroundCanvas || !drawingCanvas) { alert('编辑器初始化失败'); return; }
    saveCallback = typeof onSave === 'function' ? onSave : null;
    initializeEditor(imageFile, imageIndex);
    imageEditorModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    switchTool('brush');
    if (!initialized) { bindEvents(); initialized = true; }
  }

  function initializeEditor(imageFile, imageIndex) {
    currentImage = imageFile;
    currentImageIndex = imageIndex;
    const img = new Image();
    img.onload = function() {
      const maxWidth = 800;
      const maxHeight = 600;
      const size = calculateCanvasSize(img.width, img.height, maxWidth, maxHeight);
      const width = size.width;
      const height = size.height;
      backgroundCanvas.width = width;
      backgroundCanvas.height = height;
      drawingCanvas.width = width;
      drawingCanvas.height = height;
      const canvasWrapper = document.querySelector('.canvas-wrapper');
      if (canvasWrapper) { canvasWrapper.style.width = width + 'px'; canvasWrapper.style.height = height + 'px'; }
      backgroundCanvas.style.width = width + 'px';
      backgroundCanvas.style.height = height + 'px';
      drawingCanvas.style.width = width + 'px';
      drawingCanvas.style.height = height + 'px';
      try { backgroundCtx.drawImage(img, 0, 0, width, height); } catch (e) {}
      drawingCtx.clearRect(0, 0, width, height);
      editHistory = [];
      historyStep = -1;
      saveState();
    };
    img.onerror = function() { alert('图片加载失败，请重试'); };
    const reader = new FileReader();
    reader.onload = function(e) { img.src = e.target.result; };
    reader.onerror = function() { alert('文件读取失败，请重试'); };
    reader.readAsDataURL(imageFile);
  }

  function switchTool(toolName) {
    document.querySelectorAll('.tool-btn').forEach(btn => { btn.classList.remove('active'); });
    currentTool = toolName;
    const toolBtn = document.getElementById(toolName + '-tool');
    if (toolBtn) { toolBtn.classList.add('active'); }
    updateCanvasCursor();
  }

  function updateCanvasCursor() {
    switch (currentTool) {
      case 'brush': drawingCanvas.style.cursor = 'crosshair'; break;
      case 'text': drawingCanvas.style.cursor = 'text'; break;
      case 'rect': drawingCanvas.style.cursor = 'crosshair'; break;
      case 'eraser': drawingCanvas.style.cursor = 'grab'; break;
      default: drawingCanvas.style.cursor = 'default';
    }
  }

  function saveState() {
    historyStep++;
    if (historyStep < editHistory.length) { editHistory.length = historyStep; }
    editHistory.push(drawingCanvas.toDataURL());
    if (editHistory.length > 20) { editHistory.shift(); historyStep--; }
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoBtn.disabled = historyStep <= 0;
    redoBtn.disabled = historyStep >= editHistory.length - 1;
  }

  function undo() { if (historyStep > 0) { historyStep--; restoreState(editHistory[historyStep]); updateHistoryButtons(); } }
  function redo() { if (historyStep < editHistory.length - 1) { historyStep++; restoreState(editHistory[historyStep]); updateHistoryButtons(); } }

  function restoreState(dataURL) {
    const img = new Image();
    img.onload = function() { drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); drawingCtx.drawImage(img, 0, 0); };
    img.src = dataURL;
  }

  function clearDrawingCanvas() { drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); saveState(); }

  function getCanvasCoordinates(e) { const rect = drawingCanvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  function createTempCanvas() { if (!tempCanvas) { tempCanvas = document.createElement('canvas'); tempCtx = tempCanvas.getContext('2d'); } tempCanvas.width = drawingCanvas.width; tempCanvas.height = drawingCanvas.height; tempCtx.drawImage(drawingCanvas, 0, 0); }

  function startDrawing(e) {
    const coords = getCanvasCoordinates(e);
    if (currentTool === 'rect') { isDrawingShape = true; shapeStartX = coords.x; shapeStartY = coords.y; createTempCanvas(); }
    else if (currentTool === 'brush' || currentTool === 'eraser') { isDrawing = true; lastX = coords.x; lastY = coords.y; drawingCtx.lineWidth = brushSize.value; drawingCtx.lineCap = 'round'; drawingCtx.lineJoin = 'round'; if (currentTool === 'brush') { drawingCtx.globalCompositeOperation = 'source-over'; drawingCtx.strokeStyle = colorPicker.value; } else { drawingCtx.globalCompositeOperation = 'destination-out'; } drawingCtx.beginPath(); drawingCtx.moveTo(lastX, lastY); }
  }

  function draw(e) {
    const coords = getCanvasCoordinates(e);
    if (isDrawingShape && currentTool === 'rect') { drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); drawingCtx.drawImage(tempCanvas, 0, 0); const width = coords.x - shapeStartX; const height = coords.y - shapeStartY; drawingCtx.strokeStyle = colorPicker.value; drawingCtx.lineWidth = brushSize.value; drawingCtx.globalCompositeOperation = 'source-over'; drawingCtx.strokeRect(shapeStartX, shapeStartY, width, height); }
    else if (isDrawing && (currentTool === 'brush' || currentTool === 'eraser')) { drawingCtx.lineTo(coords.x, coords.y); drawingCtx.stroke(); lastX = coords.x; lastY = coords.y; }
  }

  function stopDrawing() { if (isDrawingShape && currentTool === 'rect') { isDrawingShape = false; saveState(); } else if (isDrawing) { isDrawing = false; saveState(); } }

  function handleTextClick(e) { if (currentTool !== 'text') return; const coords = getCanvasCoordinates(e); finishTextEditing(); createTextInput(coords.x, coords.y); }

  function createTextInput(x, y) { isEditingText = true; const input = document.createElement('input'); input.type = 'text'; input.className = 'text-input-overlay'; input.placeholder = '输入文字...'; input.style.position = 'absolute'; input.style.left = x + 'px'; input.style.top = y + 'px'; input.style.fontSize = (parseInt(brushSize.value) * 2) + 'px'; input.style.color = colorPicker.value; input.style.background = 'rgba(255, 255, 255, 0.9)'; input.style.border = '2px solid ' + colorPicker.value; input.style.borderRadius = '4px'; input.style.padding = '4px 8px'; input.style.zIndex = '1000'; input.style.fontFamily = 'Arial, sans-serif'; input.style.fontWeight = 'bold'; const canvasContainer = document.querySelector('.canvas-wrapper'); canvasContainer.appendChild(input); currentTextInput = { element: input, x, y, fontSize: parseInt(brushSize.value) * 2, color: colorPicker.value }; input.focus(); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { finishTextEditing(); } else if (e.key === 'Escape') { cancelTextEditing(); } }); input.addEventListener('blur', () => { setTimeout(() => finishTextEditing(), 100); }); }

  function finishTextEditing() { if (!isEditingText || !currentTextInput) return; const text = currentTextInput.element.value.trim(); if (text) { drawingCtx.font = `bold ${currentTextInput.fontSize}px Arial`; drawingCtx.fillStyle = currentTextInput.color; drawingCtx.textBaseline = 'top'; drawingCtx.fillText(text, currentTextInput.x, currentTextInput.y); textElements.push({ text, x: currentTextInput.x, y: currentTextInput.y, fontSize: currentTextInput.fontSize, color: currentTextInput.color }); saveState(); } cleanupTextInput(); }

  function cancelTextEditing() { cleanupTextInput(); }
  function cleanupTextInput() { if (currentTextInput && currentTextInput.element) { currentTextInput.element.remove(); } currentTextInput = null; isEditingText = false; }

  function closeEditor() { imageEditorModal.classList.add('hidden'); document.body.style.overflow = 'auto'; }
  function saveEditorChanges() { const compositeCanvas = document.createElement('canvas'); const compositeCtx = compositeCanvas.getContext('2d'); compositeCanvas.width = backgroundCanvas.width; compositeCanvas.height = backgroundCanvas.height; compositeCtx.drawImage(backgroundCanvas, 0, 0); compositeCtx.drawImage(drawingCanvas, 0, 0); compositeCanvas.toBlob((blob) => { const editedFile = new File([blob], currentImage.name, { type: 'image/png' }); if (saveCallback) { try { saveCallback(editedFile); } catch (e) {} } updateThumbnail(currentImageIndex, editedFile); closeEditor(); }, 'image/png'); }

export function updateThumbnail(index, file) { const thumbnails = document.getElementById('thumbnails-container')?.querySelectorAll('.thumbnail-wrapper'); if (!thumbnails || !thumbnails[index]) return; const img = thumbnails[index].querySelector('img'); if (!img) return; const reader = new FileReader(); reader.onload = function(e) { img.src = e.target.result; }; reader.readAsDataURL(file); }

  function bindEvents() {
    drawingCanvas.addEventListener('mousedown', (e) => { if (currentTool === 'text') { handleTextClick(e); } else { startDrawing(e); } });
    drawingCanvas.addEventListener('mousemove', draw);
    drawingCanvas.addEventListener('mouseup', stopDrawing);
    drawingCanvas.addEventListener('mouseout', stopDrawing);
    brushTool.addEventListener('click', () => switchTool('brush'));
    textTool.addEventListener('click', () => switchTool('text'));
    rectTool.addEventListener('click', () => switchTool('rect'));
    eraserTool.addEventListener('click', () => switchTool('eraser'));
    brushSize.addEventListener('input', (e) => { sizeDisplay.textContent = e.target.value + 'px'; });
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    clearCanvas.addEventListener('click', () => { if (confirm('确定要清空所有编辑内容吗？')) { clearDrawingCanvas(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !imageEditorModal.classList.contains('hidden')) { closeEditor(); } });
    cancelEdit.addEventListener('click', closeEditor);
    saveEdit.addEventListener('click', saveEditorChanges);
  }