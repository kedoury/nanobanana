export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
}

export function optimizeImageForUpload(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_SIZE = 1536;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width = Math.round((width * MAX_SIZE) / height); height = MAX_SIZE; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); }
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = url;
    });
}

export function compressBase64ToJpeg(base64Str) {
    return new Promise((resolve) =>  {
      const img = new  Image();
      img.onload = () =>  {
        const MAX_SIDE = 1024;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > MAX_SIDE) { h = Math.round((h * MAX_SIDE) / w); w = MAX_SIDE; }
        } else {
          if (h > MAX_SIDE) { w = Math.round((w * MAX_SIDE) / h); h = MAX_SIDE; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressed);
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
}

export function calculateCanvasSize(imgWidth, imgHeight, maxWidth, maxHeight) {
    let width = imgWidth;
    let height = imgHeight;
    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
    if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
    return { width: Math.round(width), height: Math.round(height) };
}