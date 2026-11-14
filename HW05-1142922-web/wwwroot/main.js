import { dotnet } from './_framework/dotnet.js';
import * as gfx from './gfx.js';
import * as sound from './sound.js';

const W = 1280, H = 800;
const canvas = document.getElementById('game');
const status = document.getElementById('status');
const startBox = document.getElementById('start');
const startButton = document.getElementById('play');

function setStatus(text) { status.textContent = text; }

// 畫布的實際像素：依視窗大小與螢幕密度決定，之後只用 CSS 縮放（不重畫小圖）。
const fit = Math.min(innerWidth / W, innerHeight / H) * (devicePixelRatio || 1);
const scale = Math.max(0.75, Math.min(1.5, Math.round(fit * 4) / 4));
canvas.width = Math.round(W * scale);
canvas.height = Math.round(H * scale);
gfx.attachScreen(canvas);

function layout() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * k}px`;
  canvas.style.height = `${H * k}px`;
}
addEventListener('resize', layout);
layout();

setStatus('載入遊戲程式…');
const { setModuleImports, getAssemblyExports, getConfig, runMain } = await dotnet
  .withDiagnosticTracing(false)
  .create();

setModuleImports('gfx', gfx);
setModuleImports('sound', sound);
setModuleImports('store', {
  load: key => { try { return localStorage.getItem(key); } catch { return null; } },
  save: (key, value) => { try { localStorage.setItem(key, value); } catch { } },
});

const exports = await getAssemblyExports(getConfig().mainAssemblyName);
const game = exports.CandyLegend.Web.Bridge;
await runMain();

setStatus('載入圖片…');
await gfx.loadImages('img/', ['Boss.acnologia.jpg', 'Boss.acnologia_human.jpg', 'Art.glitter.jpg', 'Art.mark.png']);
const gains = await (await fetch('music/gains.json')).json();
sound.setup('music/', gains);

setStatus('');
startBox.classList.add('ready');

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}

let started = false;
async function begin() {
  if (started) return;
  started = true;
  sound.unlock();
  startButton.disabled = true;
  startButton.textContent = '準備中…';
  // 讓「準備中」先畫出來，再開始建立小圖與合成音效（要一兩秒）。
  await new Promise(r => setTimeout(r, 30));
  game.Start(scale);
  startBox.remove();
  let last = performance.now();
  const frame = now => {
    const dt = (now - last) / 1000;
    last = now;
    const t0 = performance.now();
    try {
      game.Frame(dt);
    } catch (err) {
      console.error(err);
    }
    // 每格花多少毫秒（開發檢查用）：在主控台看 hw05Stats。
    const ms = performance.now() - t0;
    const s = (window.hw05Stats ??= { avg: 0, max: 0, frames: 0 });
    s.avg = s.frames ? s.avg * 0.95 + ms * 0.05 : ms;
    s.max = Math.max(s.max * 0.995, ms);
    s.frames++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  let down = false;
  canvas.addEventListener('pointerdown', e => {
    sound.unlock();
    canvas.setPointerCapture(e.pointerId);
    if (e.button !== 0) return;
    down = true;
    const [x, y] = toLogical(e);
    game.MouseDown(x, y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = toLogical(e);
    game.MouseMove(x, y, down);
    e.preventDefault();
  });
  const up = () => { if (down) { down = false; game.MouseUp(); } };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const code = e.keyCode;
    if (code === 13 || code === 27 || code === 32 || (code >= 65 && code <= 90)) {
      sound.unlock();
      game.KeyDown(code);
      e.preventDefault();
    }
  });

  // 手機沒有 Esc 鍵：右上角的小按鈕送 Esc（暫停／返回）。
  document.getElementById('esc').addEventListener('click', () => { sound.unlock(); game.KeyDown(27); });
  document.getElementById('mute').addEventListener('click', () => { sound.unlock(); game.KeyDown(77); });
  document.getElementById('tools').classList.add('show');
}

startButton.addEventListener('click', begin);
window.hw05Game = game;
