// Web Audio 合成器：音效、三首原創結局曲、缺歌時的合成背景樂。全部即時合成，不需要音檔。

const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const noiseCache = new WeakMap();

function noiseBuffer(ctx) {
  if (!noiseCache.has(ctx)) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return noiseCache.get(ctx);
}

/** 振盪器音：頻率可以從 freq 滑到 freqEnd。 */
function tone(ctx, dest, { t, dur, freq, freqEnd = freq, type = 'sine', gain = 0.5, attack = 0.005, detune = 0, filter }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.Q.value = filter.Q ?? 0.8;
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, t + dur);
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** 雜訊：經過濾波器，可以掃頻。 */
function noise(ctx, dest, { t, dur, gain = 0.4, type = 'bandpass', freq = 1000, freqEnd = freq, Q = 1, attack = 0.005 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = Q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

// ───────────────────────── 音效 ─────────────────────────

const SFX = {
  place(ctx, d, t, p) {
    tone(ctx, d, { t, dur: 0.16, freq: 520 * p, freqEnd: 240 * p, gain: 0.5 });
    noise(ctx, d, { t, dur: 0.06, gain: 0.25, type: 'highpass', freq: 3000 });
  },
  hover(ctx, d, t, p) { tone(ctx, d, { t, dur: 0.06, freq: 900 * p, type: 'triangle', gain: 0.12 }); },
  click(ctx, d, t, p) { tone(ctx, d, { t, dur: 0.04, freq: 1000 * p, type: 'square', gain: 0.12 }); },
  whoosh(ctx, d, t, p) { noise(ctx, d, { t, dur: 0.38, gain: 0.45, freq: 400 * p, freqEnd: 3200 * p, Q: 1.4, attack: 0.08 }); },
  cutin(ctx, d, t, p) {
    noise(ctx, d, { t, dur: 0.28, gain: 0.4, type: 'highpass', freq: 1800 * p, freqEnd: 7000 * p, attack: 0.02 });
    tone(ctx, d, { t, dur: 0.22, freq: 300 * p, freqEnd: 1100 * p, type: 'sawtooth', gain: 0.12 });
  },
  impact(ctx, d, t, p) {
    tone(ctx, d, { t, dur: 0.45, freq: 130 * p, freqEnd: 38, gain: 0.9 });
    noise(ctx, d, { t, dur: 0.28, gain: 0.5, type: 'lowpass', freq: 2500, freqEnd: 300 });
  },
  charge(ctx, d, t, p) {
    tone(ctx, d, { t, dur: 0.7, freq: 90 * p, freqEnd: 700 * p, type: 'sawtooth', gain: 0.22, attack: 0.3, filter: { freq: 400, freqEnd: 4000, Q: 6 } });
    noise(ctx, d, { t, dur: 0.7, gain: 0.15, freq: 600, freqEnd: 5000, Q: 3, attack: 0.4 });
  },
  explode(ctx, d, t, p) {
    noise(ctx, d, { t, dur: 1.3, gain: 0.85, type: 'lowpass', freq: 1600 * p, freqEnd: 120, attack: 0.004 });
    tone(ctx, d, { t, dur: 0.9, freq: 70 * p, freqEnd: 28, gain: 0.9 });
  },
  sparkle(ctx, d, t, p) {
    for (let i = 0; i < 6; i++) {
      tone(ctx, d, { t: t + i * 0.05, dur: 0.25, freq: (1400 + Math.random() * 1800) * p, type: 'sine', gain: 0.12 });
    }
  },
  thunder(ctx, d, t, p) {
    for (let i = 0; i < 5; i++) noise(ctx, d, { t: t + i * 0.03, dur: 0.08, gain: 0.5, type: 'highpass', freq: 2500 + i * 400 });
    noise(ctx, d, { t: t + 0.05, dur: 1.1, gain: 0.7, type: 'lowpass', freq: 600 * p, freqEnd: 90 });
  },
  fire(ctx, d, t, p) {
    noise(ctx, d, { t, dur: 1.1, gain: 0.55, freq: 700 * p, freqEnd: 1800 * p, Q: 0.6, attack: 0.12 });
    noise(ctx, d, { t, dur: 1.2, gain: 0.45, type: 'lowpass', freq: 400, freqEnd: 150, attack: 0.1 });
  },
  slash(ctx, d, t, p) {
    noise(ctx, d, { t, dur: 0.14, gain: 0.55, type: 'highpass', freq: 6500 * p, freqEnd: 1400 * p, attack: 0.003 });
    tone(ctx, d, { t, dur: 0.12, freq: 1600 * p, freqEnd: 500 * p, type: 'triangle', gain: 0.12 });
  },
  beam(ctx, d, t, p) {
    tone(ctx, d, { t, dur: 0.9, freq: 220 * p, freqEnd: 180 * p, type: 'sawtooth', gain: 0.3, attack: 0.02, filter: { freq: 3500, freqEnd: 500, Q: 4 } });
    tone(ctx, d, { t, dur: 0.9, freq: 331 * p, freqEnd: 270 * p, type: 'square', gain: 0.12, attack: 0.02, filter: { freq: 2500, freqEnd: 400 } });
    noise(ctx, d, { t, dur: 0.8, gain: 0.3, freq: 3000, Q: 2 });
  },
  wind(ctx, d, t, p) { noise(ctx, d, { t, dur: 0.9, gain: 0.4, freq: 300 * p, freqEnd: 1600 * p, Q: 2.5, attack: 0.2 }); },
};

export const SFX_NAMES = Object.keys(SFX);

export function playSfx(ctx, dest, name, { pitch = 1, gain = 1, delay = 0 } = {}) {
  const fn = SFX[name];
  if (!fn) return;
  let d = dest;
  if (gain !== 1) {
    d = ctx.createGain();
    d.gain.value = gain;
    d.connect(dest);
  }
  fn(ctx, d, ctx.currentTime + delay, pitch);
}

// ───────────────────────── 音樂用的樂器 ─────────────────────────

function brass(ctx, d, t, m, dur, g = 0.16) {
  for (const det of [-7, 7]) {
    tone(ctx, d, { t, dur, freq: midi(m), type: 'sawtooth', gain: g, attack: 0.03, detune: det, filter: { freq: 2600, freqEnd: 900, Q: 1 } });
  }
}
function pad(ctx, d, t, m, dur, g = 0.07) {
  for (const det of [-10, 0, 10]) {
    tone(ctx, d, { t, dur, freq: midi(m), type: 'sawtooth', gain: g, attack: Math.min(0.6, dur * 0.4), detune: det, filter: { freq: 1100, Q: 0.5 } });
  }
}
function pluck(ctx, d, t, m, dur, g = 0.18, type = 'triangle') { tone(ctx, d, { t, dur, freq: midi(m), type, gain: g, attack: 0.004 }); }
function bass(ctx, d, t, m, dur, g = 0.3) { tone(ctx, d, { t, dur, freq: midi(m), type: 'sine', gain: g, attack: 0.01 }); }
function kick(ctx, d, t, g = 0.7) { tone(ctx, d, { t, dur: 0.28, freq: 150, freqEnd: 42, gain: g }); }
function snare(ctx, d, t, g = 0.35) {
  noise(ctx, d, { t, dur: 0.16, gain: g, type: 'highpass', freq: 1500 });
  tone(ctx, d, { t, dur: 0.1, freq: 210, freqEnd: 150, type: 'triangle', gain: g * 0.6 });
}
function hat(ctx, d, t, g = 0.08) { noise(ctx, d, { t, dur: 0.04, gain: g, type: 'highpass', freq: 8000 }); }
function tom(ctx, d, t, f, g = 0.45) { tone(ctx, d, { t, dur: 0.35, freq: f, freqEnd: f * 0.55, gain: g }); }

/** 每圈排一整段（loopBeats 拍），提前 1.2 秒排程。 */
function loop(ctx, dest, { bpm, loopBeats, schedule }) {
  const spb = 60 / bpm;
  const loopDur = loopBeats * spb;
  let next = ctx.currentTime + 0.1;
  let n = 0;
  const tick = () => {
    while (next < ctx.currentTime + 1.2) {
      schedule(next, spb, n++);
      next += loopDur;
    }
  };
  tick();
  const id = setInterval(tick, 300);
  return { stop() { clearInterval(id); } };
}

// ───────────────────────── 結局曲 ─────────────────────────

const TRACKS = {
  // 勝利：C 大調銅管號角 + 鼓，132 BPM
  victory: (ctx, d) => loop(ctx, d, {
    bpm: 132, loopBeats: 16,
    schedule(t0, b) {
      const mel = [[0, 72, 0.5], [0.5, 76, 0.5], [1, 79, 0.5], [1.5, 84, 1.5], [3.5, 79, 0.5], [4, 81, 1], [5, 83, 1], [6, 84, 2],
        [8, 72, 0.5], [8.5, 76, 0.5], [9, 79, 0.5], [9.5, 84, 1], [10.5, 83, 0.5], [11, 81, 1], [12, 79, 0.5], [12.5, 81, 0.5], [13, 83, 0.5], [13.5, 86, 2.5]];
      for (const [at, m, len] of mel) brass(ctx, d, t0 + at * b, m, len * b * 0.95, 0.14);
      const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
      chords.forEach((c, i) => {
        for (const m of c) pad(ctx, d, t0 + i * 4 * b, m - 12, 4 * b, 0.05);
        bass(ctx, d, t0 + i * 4 * b, c[0] - 24, 2 * b);
        bass(ctx, d, t0 + (i * 4 + 2) * b, c[0] - 24, 2 * b);
      });
      for (let i = 0; i < 16; i++) {
        if (i % 2 === 0) kick(ctx, d, t0 + i * b, 0.55);
        if (i % 4 === 1 || i % 4 === 3) snare(ctx, d, t0 + i * b, 0.28);
        hat(ctx, d, t0 + (i + 0.5) * b);
      }
    },
  }),
  // 敗北：A 小調低音弦樂，70 BPM，定音鼓
  defeat: (ctx, d) => loop(ctx, d, {
    bpm: 70, loopBeats: 16,
    schedule(t0, b) {
      const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
      chords.forEach((c, i) => {
        for (const m of c) pad(ctx, d, t0 + i * 4 * b, m, 4 * b * 1.05, 0.07);
        bass(ctx, d, t0 + i * 4 * b, c[0] - 12, 4 * b, 0.28);
        tom(ctx, d, t0 + i * 4 * b, 70, 0.4);
      });
      const mel = [[0, 76, 2], [2, 74, 2], [4, 72, 3], [7, 71, 1], [8, 69, 2], [10, 72, 2], [12, 71, 4]];
      for (const [at, m, len] of mel) tone(ctx, d, { t: t0 + at * b, dur: len * b, freq: midi(m), type: 'triangle', gain: 0.09, attack: 0.2 });
    },
  }),
  // 和局：兩段旋律互相拉鋸（利姆路：明亮三角波；五條悟：方波），100 BPM，戰鼓
  draw: (ctx, d) => loop(ctx, d, {
    bpm: 100, loopBeats: 16,
    schedule(t0, b) {
      const rimuru = [[0, 74], [0.5, 76], [1, 79], [1.5, 81], [2, 79, 1.5]];
      const gojo = [[4, 69], [4.5, 68], [5, 65], [5.5, 64], [6, 65, 1.5]];
      for (const off of [0, 8]) {
        for (const [at, m, len = 0.5] of rimuru) pluck(ctx, d, t0 + (at + off) * b, m, len * b, 0.17, 'triangle');
        for (const [at, m, len = 0.5] of gojo) pluck(ctx, d, t0 + (at + off) * b, m, len * b, 0.09, 'square');
      }
      // 最後兩拍兩邊同時出現，衝突的音程
      pluck(ctx, d, t0 + 14 * b, 81, 2 * b, 0.15, 'triangle');
      pluck(ctx, d, t0 + 14 * b, 80, 2 * b, 0.08, 'square');
      for (let i = 0; i < 4; i++) {
        pad(ctx, d, t0 + i * 4 * b, i % 2 ? 57 : 62, 4 * b, 0.05);
        bass(ctx, d, t0 + i * 4 * b, i % 2 ? 45 : 50, 4 * b, 0.25);
      }
      for (let i = 0; i < 16; i++) {
        tom(ctx, d, t0 + i * b, i % 2 ? 110 : 82, i % 4 === 0 ? 0.5 : 0.3);
        if (i % 4 === 3) snare(ctx, d, t0 + (i + 0.5) * b, 0.2);
      }
    },
  }),
};

export function playEndingTrack(ctx, dest, kind) {
  return (TRACKS[kind] || TRACKS.draw)(ctx, dest);
}

// ───────────────────────── 缺歌時的背景樂 ─────────────────────────

// 每格一組：主音、音階、速度、波形，讓九個世界聽起來不一樣
const BEDS = [
  { root: 64, scale: [0, 2, 4, 7, 9], bpm: 128, wave: 'square' },     // 0 英雄學院
  { root: 62, scale: [0, 2, 3, 7, 9], bpm: 120, wave: 'triangle' },   // 1 火影
  { root: 57, scale: [0, 2, 3, 5, 7], bpm: 112, wave: 'sawtooth' },   // 2 巨人
  { root: 60, scale: [0, 3, 5, 7, 10], bpm: 104, wave: 'triangle' },  // 3 柯南
  { root: 65, scale: [0, 2, 4, 7, 9], bpm: 140, wave: 'square' },     // 4 航海王
  { root: 66, scale: [0, 2, 4, 6, 9], bpm: 136, wave: 'sawtooth' },   // 5 超電磁砲
  { root: 62, scale: [0, 2, 3, 7, 8], bpm: 126, wave: 'sawtooth' },   // 6 FAIRY TAIL
  { root: 61, scale: [0, 2, 4, 7, 11], bpm: 132, wave: 'triangle' },  // 7 刀劍神域
  { root: 59, scale: [0, 1, 5, 7, 8], bpm: 118, wave: 'square' },     // 8 死神
];

export function playFallbackBed(ctx, dest, cell) {
  const cfg = BEDS[cell] || BEDS[4];
  const prog = [0, 3, 4, 2]; // 每 4 拍換一個和弦（音階第幾音）
  return loop(ctx, dest, {
    bpm: cfg.bpm, loopBeats: 16,
    schedule(t0, b) {
      prog.forEach((deg, bar) => {
        const base = cfg.root + cfg.scale[deg % cfg.scale.length];
        bass(ctx, dest, t0 + bar * 4 * b, base - 24, 1.8 * b, 0.22);
        bass(ctx, dest, t0 + (bar * 4 + 2) * b, base - 24, 1.8 * b, 0.18);
        pad(ctx, dest, t0 + bar * 4 * b, base - 12, 4 * b, 0.035);
        for (let i = 0; i < 8; i++) {
          const m = base + cfg.scale[(i * 2 + bar) % cfg.scale.length] + (i >= 4 ? 12 : 0);
          pluck(ctx, dest, t0 + (bar * 4 + i * 0.5) * b, m, 0.45 * b, 0.07, cfg.wave);
        }
      });
      for (let i = 0; i < 16; i++) {
        kick(ctx, dest, t0 + i * b, i % 2 ? 0.3 : 0.45);
        hat(ctx, dest, t0 + (i + 0.5) * b, 0.05);
      }
    },
  });
}
