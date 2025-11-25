export const STORAGE_KEYS = {
    API_KEY: 'nanobanana_api_key',
    REMEMBER_KEY: 'nanobanana_remember_key',
    TEMPLATES: 'nanobanana_templates',
    AUTO_CLEAR: 'nanobanana_auto_clear',
    MODEL_STATES: 'modelStates'
  };

export function getApiKey() { return localStorage.getItem(STORAGE_KEYS.API_KEY) || null; }
export function setApiKey(val) { localStorage.setItem(STORAGE_KEYS.API_KEY, val); }
export function clearApiKey() { localStorage.removeItem(STORAGE_KEYS.API_KEY); }
export function getRememberKey() { return localStorage.getItem(STORAGE_KEYS.REMEMBER_KEY) === 'true'; }
export function setRememberKey(val) { localStorage.setItem(STORAGE_KEYS.REMEMBER_KEY, val ? 'true' : 'false'); }
export function getAutoClearPreference() { return localStorage.getItem(STORAGE_KEYS.AUTO_CLEAR) === 'true'; }
export function setAutoClearPreference(val) { localStorage.setItem(STORAGE_KEYS.AUTO_CLEAR, val ? 'true' : 'false'); }
export function getTemplates() { try { const s = localStorage.getItem(STORAGE_KEYS.TEMPLATES); return s ? JSON.parse(s) : []; } catch (e) { return []; } }
export function saveTemplates(templates) { try { localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates)); } catch (e) {} }
export function saveModelStates(data) { try { localStorage.setItem(STORAGE_KEYS.MODEL_STATES, JSON.stringify(data)); } catch (e) {} }
export function loadModelStates() { try { const s = localStorage.getItem(STORAGE_KEYS.MODEL_STATES); return s ? JSON.parse(s) : null; } catch (e) { return null; } }