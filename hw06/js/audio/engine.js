// 音訊總管：AudioContext、音效 / 音樂兩條匯流排、避讓。
// 音量一律由 busGains 決定：音樂 = 音效 × 0.4，大招時再 × 0.35。
import { busGains } from '../core/audioPlan.js';
import { MUSIC, isAvailable } from '../assets/manifest.js';
import { WORLDS } from '../core/worlds.js';
import * as synth from './synth.js';
import { createMusicManager } from './music.js';

export function createAudio(initialSettings) {
  let settings = { ...initialSettings };
  let ctx = null;
  const clipFiles = new Map();   // 路徑 → 下載中的檔案
  const clipBuffers = new Map(); // 路徑 → 解碼好的聲音
  let sfxBus = null;
  let musicBus = null;
  let music = null;
  let ducked = false;
  let boosted = false;

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(comp);
    musicBus.connect(comp);
    music = createMusicManager({
      ctx, dest: musicBus, synth, paths: WORLDS.map(w => MUSIC.cell[w.id]), // 依盤面位置排列：playCell(盤面位置)
      available: isAvailable,
      fetchBuffer: async path => {
        const r = await fetch(path);
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return ctx.decodeAudioData(await r.arrayBuffer());
      },
    });
    applyGains(true);
  }

  function applyGains(immediate = false, slow = false) {
    if (!ctx) return;
    const g = busGains({ ...settings, ducked, boosted });
    const t = ctx.currentTime;
    for (const [bus, v] of [[sfxBus, g.sfx], [musicBus, g.music]]) {
      bus.gain.cancelScheduledValues(t);
      if (immediate) bus.gain.setValueAtTime(v, t);
      else bus.gain.setTargetAtTime(v, t, slow ? 0.5 : 0.04); // 平常約 120 ms 平滑過渡；音樂從大聲收回來時慢慢降
    }
  }

  const ready = () => ctx && ctx.state === 'running';

  return {
    get ctx() { return ctx; },
    /** 要在使用者點擊時呼叫（瀏覽器規定）。 */
    async unlock() {
      if (!ctx) build();
      if (ctx && ctx.state !== 'running') {
        try { await ctx.resume(); } catch { /* 有些瀏覽器會拒絕，之後的點擊再試 */ }
      }
    },
    setSettings(s) { settings = { ...s }; applyGains(); },
    /** 領域對決時把音樂放大（這段沒有音效）；結束後慢慢收回正常音量。 */
    boostMusic(on) {
      if (boosted === !!on) return;
      boosted = !!on;
      applyGains(false, !on);
    },
    duck(on) { ducked = !!on; applyGains(); },
    sfx(name, opts) { if (ready()) synth.playSfx(ctx, sfxBus, name, opts); },
    /** 播一段音檔（例如語音）到音效匯流排；沒有這個檔案就什麼都不做。 */
    /** 先把語音檔下載好（還不解碼，不需要等使用者點擊）。 */
    preloadClip(path) {
      if (!isAvailable(path) || clipFiles.has(path)) return;
      clipFiles.set(path, fetch(path).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    },
    /**
     * 播放一段語音 / 音效檔。回傳 Promise：真的開始播放時 resolve 成 { stop(ms), duration }，播不了就是 null。
     */
    async clip(path, gain = 1) {
      if (!ready() || !isAvailable(path)) return null;
      try {
        if (!clipBuffers.has(path)) {
          this.preloadClip(path);
          const data = await clipFiles.get(path);
          if (!data) return null;
          clipBuffers.set(path, await ctx.decodeAudioData(data.slice(0)));
        }
        const buf = clipBuffers.get(path);
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        g.gain.value = gain;
        src.buffer = buf;
        src.connect(g).connect(sfxBus);
        src.start();
        return {
          duration: buf.duration,
          stop(ms = 300) {
            const t = ctx.currentTime;
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.linearRampToValueAtTime(0, t + ms / 1000);
            try { src.stop(t + ms / 1000 + 0.05); } catch { /* 已經停了 */ }
          },
        };
      } catch {
        return null; // 語音不是必要的
      }
    },
    music: {
      playCell: cell => (music ? music.playCell(cell) : Promise.resolve()),
      playTitle: () => (music ? music.playTitle() : Promise.resolve()),
      playEnding: kind => (music ? music.playEnding(kind) : Promise.resolve()),
      stop: ms => music && music.stop(ms),
    },
    stopAll() { if (music) music.stop(200); },
    /** 驗證用：兩條匯流排目前的目標音量。 */
    debugGains() { return ctx ? { sfx: sfxBus.gain.value, music: musicBus.gain.value } : null; },
  };
}
