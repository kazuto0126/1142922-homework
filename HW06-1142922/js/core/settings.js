// 玩家設定：音樂 / 音效開關、音量、演出長度、畫質。存在 localStorage，壞掉就用預設值。
const KEY = 'hw06-1142922-settings';

export const DEFAULT_SETTINGS = Object.freeze({ musicOn: true, sfxOn: true, volume: 0.8, shortMode: false, quality: 'high' });

function sanitize(raw) {
  const d = DEFAULT_SETTINGS;
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  const vol = Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : d.volume;
  return {
    musicOn: bool(raw.musicOn, d.musicOn),
    sfxOn: bool(raw.sfxOn, d.sfxOn),
    volume: vol,
    shortMode: bool(raw.shortMode, d.shortMode),
    quality: raw.quality === 'low' || raw.quality === 'high' ? raw.quality : d.quality,
  };
}

export function loadSettings(storage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return sanitize(parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  try { storage && storage.setItem(KEY, JSON.stringify(sanitize(settings))); } catch { /* 存不了就算了 */ }
}
