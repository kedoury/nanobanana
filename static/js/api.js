export async function generateImage(payload) {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
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