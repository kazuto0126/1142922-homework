// 網頁版的聲音：音效是 C# 合成好的取樣，音樂是 music/ 底下的 mp3（串流播放，不整首解碼進記憶體）。
// 混音規則照 Windows 版：音樂壓到統一音量、換曲先淡出 0.25 秒再淡入 0.5 秒、最後一起過柔和限幅。

const SR = 44100;
let ac = null, master = null, fxBus = null, musicBus = null;
const effects = [];
const voices = [];
let gains = {};
let base = 'music/';

let musicOn = true;
let rate = 1;
let current = null;   // { name, el, src, gain }
let alt = '';
let wanted = '', wantedAlt = '';
const tracks = new Map();

export function setup(musicBase, gainTable) {
  base = musicBase;
  gains = gainTable;
}

/** 要在使用者點擊後才能開始播放聲音。 */
export function unlock() {
  if (!ac) {
    ac = new AudioContext({ sampleRate: SR, latencyHint: 'interactive' });
    // 柔和限幅：和 Windows 版的 Soft() 同一條曲線（先縮一半，曲線上再放大回來）。
    const pre = ac.createGain();
    pre.gain.value = 0.5;
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let k = 0; k < curve.length; k++) {
      const x = (k / 2048 - 1) * 2;
      const a = Math.abs(x);
      const y = a <= 0.75 ? a : 0.75 + 0.25 * Math.tanh((a - 0.75) / 0.25);
      curve[k] = x < 0 ? -y : y;
    }
    shaper.curve = curve;
    pre.connect(shaper).connect(ac.destination);
    master = pre;
    fxBus = ac.createGain();
    fxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.connect(master);
    for (const e of effects) e.buffer ??= makeBuffer(e.data);
    applyMusic();
  }
  if (ac.state !== 'running') ac.resume();
  // 有些手機瀏覽器第一次不讓音樂自動播放：之後每次點擊都補播一次。
  if (current && current.el.paused) current.el.play().catch(() => { });
}

function makeBuffer(data) {
  const buf = ac.createBuffer(1, data.length, SR);
  buf.copyToChannel(data, 0);
  return buf;
}

export function addEffect(id, bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const data = new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  effects[id] = { data, buffer: ac ? makeBuffer(data) : null };
}

export function play(id, gain, pan, playbackRate) {
  if (!ac || ac.state !== 'running') return;
  const e = effects[id];
  if (!e) return;
  e.buffer ??= makeBuffer(e.data);
  const src = ac.createBufferSource();
  src.buffer = e.buffer;
  src.playbackRate.value = playbackRate;
  pan = Math.max(-1, Math.min(1, pan));
  const merger = ac.createChannelMerger(2);
  const l = ac.createGain(), r = ac.createGain();
  l.gain.value = gain * Math.min(1, 1 - pan);
  r.gain.value = gain * Math.min(1, 1 + pan);
  src.connect(l).connect(merger, 0, 0);
  src.connect(r).connect(merger, 0, 1);
  merger.connect(fxBus);
  src.start();
  voices.push(src);
  src.onended = () => {
    const k = voices.indexOf(src);
    if (k >= 0) voices.splice(k, 1);
    merger.disconnect();
  };
  // 和 Windows 版一樣最多 40 個聲音同時響，超過就停掉最舊的。
  while (voices.length > 40) { try { voices.shift().stop(); } catch { } }
}

function track(name) {
  let t = tracks.get(name);
  if (t) return t;
  const el = new Audio(base + name + '.mp3');
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.preservesPitch = false;
  el.mozPreservesPitch = false;
  el.webkitPreservesPitch = false;
  t = { name, el, src: null, gain: null };
  el.addEventListener('ended', () => onEnded(t));
  tracks.set(name, t);
  return t;
}

function connect(t) {
  if (t.src || !ac) return;
  t.src = ac.createMediaElementSource(t.el);
  t.gain = ac.createGain();
  t.gain.gain.value = 0;
  t.src.connect(t.gain).connect(musicBus);
}

function onEnded(t) {
  if (current !== t) return;
  if (alt) {
    // 兩首輪流播：這首播完換另一首。
    const next = track(alt);
    alt = t.name;
    start(next, 0.05);
  } else {
    t.el.currentTime = 0;
    t.el.play().catch(() => { });
  }
}

function start(t, fadeIn) {
  connect(t);
  const g = t.gain.gain;
  const target = gains[t.name] ?? 1;
  g.cancelScheduledValues(ac.currentTime);
  g.setValueAtTime(0, ac.currentTime);
  g.linearRampToValueAtTime(target, ac.currentTime + fadeIn);
  t.el.currentTime = 0;
  t.el.playbackRate = rate;
  t.el.play().catch(() => { });
  current = t;
}

function stop(t) {
  if (!t.gain) { t.el.pause(); return; }
  const g = t.gain.gain;
  g.cancelScheduledValues(ac.currentTime);
  g.setValueAtTime(g.value, ac.currentTime);
  g.linearRampToValueAtTime(0, ac.currentTime + 0.25);
  setTimeout(() => { if (current !== t) t.el.pause(); }, 300);
}

function applyMusic() {
  if (!ac) return;
  const name = musicOn ? wanted : '';
  // 同一組歌已經在播（可能正輪到第二首）：不重來。
  if (current && (current.name === name || (wantedAlt && current.name === wantedAlt && alt === name))) {
    if (current.name === name) alt = wantedAlt;
    return;
  }
  const old = current;
  current = null;
  if (old) stop(old);
  if (!name) return;
  alt = wantedAlt;
  const t = track(name);
  setTimeout(() => {
    if (wanted === name && musicOn && current === null) start(t, 0.5);
  }, old ? 260 : 0);
}

export function music(name, altName) {
  if (name !== wanted) setSpeed(1);
  wanted = name;
  wantedAlt = altName;
  if (wanted) track(wanted);          // 先開始下載
  applyMusic();
}

function setSpeed(r) {
  rate = r;
  if (current) current.el.playbackRate = r;
}

export function musicSpeed(r) { setSpeed(r); }

export function musicOnOff(on) {
  musicOn = on;
  applyMusic();
}

export { musicOnOff as musicOn };
