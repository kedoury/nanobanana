export async function generateImage(payload) {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
}

export async function generateImageGeminiOfficial(messageContent, aspect, imageSize, googleApiKey) {
  const parts = [];
  for (const item of messageContent || []) {
    if (item && item.type === 'text' && typeof item.text === 'string') { parts.push({ text: item.text }); }
    else if (item && item.type === 'image_url' && item.image_url && typeof item.image_url.url === 'string') {
      const url = item.image_url.url;
      const m = url.match(/^data:(.+);base64,(.*)$/);
      if (m) { parts.push({ inlineData: { mimeType: m[1], data: m[2] } }); }
    }
  }
  const payload = {
    contents: [ { role: 'user', parts } ],
    generationConfig: { responseModalities: ['TEXT','IMAGE'], imageConfig: { aspectRatio: aspect, imageSize } }
  };
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleApiKey },
    body: JSON.stringify(payload)
  });
  if (!res.ok) { try { const err = await res.json(); return { error: err.error?.message || 'Gemini API error' }; } catch { return { error: 'Gemini API error' }; } }
  const data = await res.json();
  const candidates = data?.candidates || [];
  const content = candidates[0]?.content || {};
  const partsOut = content?.parts || [];
  for (const p of partsOut) {
    if (p.inlineData && p.inlineData.data && p.inlineData.mimeType) {
      return { imageUrl: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` };
    }
  }
  for (const p of partsOut) { if (p.text) { return { text: p.text }; } }
  return { error: 'No content returned' };
}

export async function fetchEnvKey() {
    try {
      const res = await fetch('/api/get-env-key');
      if (!res.ok) return { hasEnvKey: false };
      const data = await res.json();
      return data;
    } catch (e) {
      return { hasEnvKey: false };
    }
}
