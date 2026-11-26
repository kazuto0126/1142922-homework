// 音量規則：音效永遠比音樂大聲。
export const MUSIC_RATIO = 0.4; // 音樂 = 音效音量 × 0.4
export const DUCK = 0.35;       // 大招時音樂再 × 0.35

export function busGains({ musicOn, sfxOn, volume, ducked }) {
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  return {
    music: musicOn ? v * MUSIC_RATIO * (ducked ? DUCK : 1) : 0,
    sfx: sfxOn ? v : 0,
  };
}
