// 背景音樂：每格專屬音樂、標題輪播、結局曲。缺歌時改播合成背景樂。
const XFADE_MS = 800;
const TITLE_SLOT_MS = 12000;

/**
 * ctx：AudioContext；dest：音樂匯流排；synth：合成器（playFallbackBed / playEndingTrack）；
 * paths：9 格的歌曲路徑；fetchBuffer(path) → Promise<AudioBuffer>；available(path) → 是否有這個檔案。
 */
export function createMusicManager({ ctx, dest, synth, paths, fetchBuffer, available = () => true }) {
  let seq = 0;             // 每次換歌 +1；舊的非同步載入回來時用來判斷是否已被換掉
  let current = null;      // { stop(fadeMs) }
  let titleTimer = null;
  const buffers = new Map();

  // 解碼後的歌很佔記憶體（一首約 15 MB），最多只留最近用過的 3 首
  const CACHE_MAX = 3;
  function load(path) {
    let p = buffers.get(path);
    if (p) {
      buffers.delete(path); // 移到最後面 = 最近用過
    } else {
      p = fetchBuffer(path);
      p.catch(() => buffers.delete(path));
    }
    buffers.set(path, p);
    while (buffers.size > CACHE_MAX) buffers.delete(buffers.keys().next().value);
    return p;
  }

  function fadeGain() {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + XFADE_MS / 1000);
    g.connect(dest);
    return g;
  }

  function wrap(gain, inner) {
    let stopped = false;
    return {
      stop(fadeMs = XFADE_MS) {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        inner.stop(t + fadeMs / 1000);
        setTimeout(() => { try { gain.disconnect(); } catch { /* 已經斷了 */ } }, fadeMs + 50);
      },
    };
  }

  let playingCell = null; // 目前正在播哪一格的歌（同一首就不重頭播）

  function stopCurrent(fadeMs = XFADE_MS) {
    if (current) { current.stop(fadeMs); current = null; }
    playingCell = null;
  }

  function startBuffer(buffer) {
    const g = fadeGain();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(g);
    src.start();
    return wrap(g, { stop: when => src.stop(when) });
  }

  function startSynth(make) {
    const g = fadeGain();
    const h = make(g);
    return wrap(g, { stop: () => h.stop() });
  }

  async function playCellInner(cell, token) {
    const path = paths[cell];
    let buffer = null;
    if (path && available(path)) {
      try { buffer = await load(path); } catch { buffer = null; }
    }
    if (token !== seq) return; // 已經換成別首了
    stopCurrent();
    current = buffer ? startBuffer(buffer) : startSynth(g => synth.playFallbackBed(ctx, g, cell));
    playingCell = cell;
  }

  function clearTitle() {
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
  }

  return {
    playCell(cell) {
      clearTitle();
      if (cell === playingCell && current) { ++seq; return Promise.resolve(); } // 已經在播這首，不要重頭開始
      return playCellInner(cell, ++seq);
    },

    /** 標題：9 格的歌輪流播，每首 12 秒。 */
    playTitle() {
      clearTitle();
      let i = 0;
      const next = () => {
        const token = ++seq;
        const p = playCellInner(i, token);
        i = (i + 1) % paths.length;
        titleTimer = setTimeout(next, TITLE_SLOT_MS);
        return p;
      };
      return next();
    },

    /** kind ∈ victory | defeat | draw */
    async playEnding(kind) {
      clearTitle();
      ++seq;
      stopCurrent(400);
      current = startSynth(g => synth.playEndingTrack(ctx, g, kind));
    },

    stop(fadeMs = 400) {
      clearTitle();
      ++seq;
      stopCurrent(fadeMs);
    },
  };
}
