// 進入點：建立舞台、載入素材、處理點擊與對局流程。
import { createStage, supportsWebGL } from './stage/stage.js';
import { createMatch, outcomeFor } from './core/match.js';
import { EMPTY, X } from './core/rules.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { isClick } from './core/pointer.js';
import { IMAGES } from './assets/manifest.js';
import { loadImage } from './assets/loader.js';

const CPU_THINK_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const canvas = document.getElementById('stage');
const hint = document.getElementById('hint');

if (!supportsWebGL()) {
  document.body.innerHTML = '<div class="fatal">你的瀏覽器不支援 WebGL，請改用最新版的 Chrome 或 Edge。</div>';
} else {
  boot();
}

async function boot() {
  const stage = createStage(canvas, { quality: 'high' });

  const heroImages = await Promise.all(WORLDS.map(w =>
    loadImage(IMAGES.hero[w.cell], { kind: 'hero', label: w.heroZh, sub: w.work, color: w.color })));
  const worldImages = await Promise.all(WORLDS.map(w =>
    loadImage(IMAGES.world[w.cell], { kind: 'world', label: w.work, sub: w.heroZh, color: w.color })));
  worldImages.forEach((img, i) => stage.setWorldImage(i, img));

  let match = createMatch({ mode: 'cpu', firstFaction: 'rimuru' });
  let busy = false;

  async function show(event) {
    stage.placePiece(event.index, event.faction);
    stage.placeStandee(event.index, event.faction, heroImages[event.index]);
  }

  async function humanMove(cell) {
    busy = true;
    try {
      await show(match.play(cell));
      if (!match.isOver() && match.isCpuTurn()) {
        await sleep(CPU_THINK_MS);
        await show(match.cpuPlay(Math.random));
      }
      if (match.isOver()) console.info('[HW06] 結果：', outcomeFor(match.result, X), match.result);
    } finally {
      busy = false;
    }
  }

  // ── 點擊 / 拖曳 ──
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    const d = down;
    down = null;
    if (!d || !isClick(d, { x: e.clientX, y: e.clientY })) return;
    if (busy || match.isOver() || match.isCpuTurn() || stage.isCinematic) return;
    const cell = stage.pickCell(e.clientX, e.clientY);
    if (cell >= 0 && match.board[cell] === EMPTY) humanMove(cell);
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const cell = stage.pickCell(e.clientX, e.clientY);
    const free = cell >= 0 && match.board[cell] === EMPTY && !match.isOver();
    stage.setHover(free ? cell : -1);
    canvas.style.cursor = free && !busy ? 'pointer' : 'grab';
    if (cell >= 0) {
      const w = WORLDS[cell];
      hint.innerHTML = `<b>${w.work}</b><span>${w.heroZh}</span>`;
      hint.style.left = `${e.clientX}px`;
      hint.style.top = `${e.clientY}px`;
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  });
  canvas.addEventListener('pointerleave', () => { hint.hidden = true; stage.setHover(-1); });

  // 開發 / 驗證用
  window.__hw06 = {
    stage,
    get match() { return match; },
    newMatch(opts = { mode: 'cpu', firstFaction: 'rimuru' }) { stage.clearBoard(); match = createMatch(opts); },
    FACTIONS,
  };
}
