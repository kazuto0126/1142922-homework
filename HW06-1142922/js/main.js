// 進入點：建立舞台、載入素材、畫面流程與對局流程。
import { createStage, supportsWebGL } from './stage/stage.js';
import { createMatch, outcomeFor } from './core/match.js';
import { EMPTY, X } from './core/rules.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { isClick } from './core/pointer.js';
import { createStats } from './core/stats.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { IMAGES } from './assets/manifest.js';
import { loadImage } from './assets/loader.js';
import { createScreens } from './ui/screens.js';

const CPU_THINK_MS = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const other = f => (f === 'rimuru' ? 'gojo' : 'rimuru');

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const canvas = document.getElementById('stage');
const hint = document.getElementById('hint');

if (!supportsWebGL()) {
  document.body.innerHTML = '<div class="fatal">你的瀏覽器不支援 WebGL，請改用最新版的 Chrome 或 Edge。</div>';
} else {
  boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<div class="fatal">載入失敗，請重新整理頁面。</div>');
  });
}

async function boot() {
  const storage = safeStorage();
  let settings = loadSettings(storage);
  const stats = createStats(storage);
  const stage = createStage(canvas, { quality: settings.quality });

  // ── 素材 ──
  const [heroImages, worldImages, leaderList] = await Promise.all([
    Promise.all(WORLDS.map(w => loadImage(IMAGES.hero[w.cell], { kind: 'hero', label: w.heroZh, sub: w.work, color: w.color }))),
    Promise.all(WORLDS.map(w => loadImage(IMAGES.world[w.cell], { kind: 'world', label: w.work, sub: w.heroZh, color: w.color }))),
    Promise.all(['rimuru', 'gojo'].map(f => loadImage(IMAGES.leader[f], { kind: 'leader', label: FACTIONS[f].nameZh, sub: FACTIONS[f].nameJa, color: FACTIONS[f].secondary }))),
  ]);
  const leaderImages = { rimuru: leaderList[0], gojo: leaderList[1] };
  worldImages.forEach((img, i) => stage.setWorldImage(i, img));

  // ── 狀態 ──
  const app = {
    screen: 'title',
    mode: 'cpu',
    faction: 'rimuru', // 先手（玩家）的陣營
    match: null,
    busy: false,
    thinking: false,
  };

  const screens = createScreens(document.getElementById('ui'), {
    onStart: () => goMode(),
    onMode: mode => { app.mode = mode; goFaction(); },
    onFaction: f => { app.faction = f; startMatch(); },
    onBackToMode: () => goMode(),
    onHome: () => goTitle(),
    onAgain: () => startMatch(),
    onSwap: () => { app.faction = other(app.faction); startMatch(); },
    onOpenSettings: () => screens.openSettings(settings),
    onSettings: s => applySettings(s),
  }, { leaderImages });

  function applySettings(s) {
    settings = s;
    saveSettings(storage, s);
    if (stage.quality !== s.quality) stage.setQuality(s.quality);
  }

  function hudState() {
    const m = app.match;
    return {
      mode: app.mode,
      factionOf: m.factionOf,
      turnFaction: m.factionOf[m.turn()],
      stats: app.mode === 'cpu' ? stats.get() : null,
      thinking: app.thinking,
      over: m.isOver(),
    };
  }

  // ── 畫面流程 ──
  function goTitle() {
    app.screen = 'title';
    app.match = null;
    stage.clearBoard();
    stage.resetView();
    stage.controls.autoRotate = true;
    stage.controls.autoRotateSpeed = 0.6;
    screens.hideResult();
    screens.showTitle();
  }

  function goMode() {
    app.screen = 'mode';
    screens.showMode();
  }

  function goFaction() {
    app.screen = 'faction';
    screens.showFaction(app.mode);
  }

  function startMatch() {
    app.screen = 'playing';
    app.match = createMatch({ mode: app.mode, firstFaction: app.faction });
    app.busy = false;
    app.thinking = false;
    stage.clearBoard();
    stage.controls.autoRotate = false;
    stage.resetView();
    screens.hideResult();
    screens.showHud(hudState());
  }

  async function show(event) {
    stage.placePiece(event.index, event.faction);
    stage.placeStandee(event.index, event.faction, heroImages[event.index]);
  }

  function finish() {
    const m = app.match;
    const r = m.result;
    let banner, sub, tone;
    if (app.mode === 'cpu') {
      const outcome = outcomeFor(r, X);
      stats.record(outcome);
      tone = outcome;
      banner = { win: '勝利', lose: '敗北', draw: '勢均力敵' }[outcome];
      sub = outcome === 'draw' ? '你守住了！電腦沒能贏下這一局。' : `${FACTIONS[r.winnerFaction].nameZh}陣營連成一線。`;
    } else if (r.winnerFaction) {
      tone = 'win';
      banner = `${FACTIONS[r.winnerFaction].nameZh}陣營 勝利`;
      sub = r.winnerFaction === m.factionOf[1] ? '玩家 1 獲勝！' : '玩家 2 獲勝！';
    } else {
      tone = 'draw';
      banner = '勢均力敵';
      sub = '雙方不分勝負。';
    }
    screens.updateHud(hudState());
    screens.showResult({ banner, sub, tone, faction: r.winnerFaction });
  }

  async function humanMove(cell) {
    const m = app.match;
    app.busy = true;
    try {
      await show(m.play(cell));
      screens.updateHud(hudState());
      if (!m.isOver() && m.isCpuTurn()) {
        app.thinking = true;
        screens.updateHud(hudState());
        await sleep(CPU_THINK_MS);
        if (app.match !== m) return; // 中途回到標題或重開
        app.thinking = false;
        await show(m.cpuPlay(Math.random));
        screens.updateHud(hudState());
      }
      if (m.isOver() && app.match === m) finish();
    } finally {
      if (app.match === m) app.busy = false;
    }
  }

  const canPlay = () => app.screen === 'playing' && app.match && !app.busy && !app.match.isOver()
    && !app.match.isCpuTurn() && !stage.isCinematic;

  // ── 點擊 / 拖曳 ──
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    const d = down;
    down = null;
    if (!d || !isClick(d, { x: e.clientX, y: e.clientY }) || !canPlay()) return;
    const cell = stage.pickCell(e.clientX, e.clientY);
    if (cell >= 0 && app.match.board[cell] === EMPTY) humanMove(cell);
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || app.screen !== 'playing') { hint.hidden = true; return; }
    const cell = stage.pickCell(e.clientX, e.clientY);
    const free = cell >= 0 && app.match.board[cell] === EMPTY && canPlay();
    stage.setHover(free ? cell : -1);
    canvas.style.cursor = free ? 'pointer' : 'grab';
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

  goTitle();

  // 開發 / 驗證用
  window.__hw06 = { stage, app, stats, get settings() { return settings; } };
}
