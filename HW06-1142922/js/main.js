// 進入點：建立舞台、載入素材、畫面流程與對局流程。
import { createStage, supportsWebGL } from './stage/stage.js';
import { createMatch, outcomeFor } from './core/match.js';
import { EMPTY, X } from './core/rules.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { createTapTracker } from './core/pointer.js';
import { createStats } from './core/stats.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { IMAGES } from './assets/manifest.js';
import { loadImage } from './assets/loader.js';
import { tileCanvas, loadEmblems } from './assets/emblems.js';
import { createScreens } from './ui/screens.js';
import { createAudio } from './audio/engine.js';
import { playLogin } from './ui/login.js';
import { SFX } from './assets/manifest.js';
import { createPerformer } from './perform.js';
import { liveParticles } from './fx/common.js';

const CPU_THINK_MS = 400;
const SAO_CELL = 7; // 刀劍神域那一格的歌，當作標題與選單的背景音樂
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const audio = createAudio(settings);

  // 任何按鈕都有點擊音效；第一次點擊時解鎖音訊（瀏覽器規定）
  document.addEventListener('pointerdown', () => { audio.unlock(); }, { capture: true });
  document.addEventListener('click', e => { if (e.target.closest('button')) audio.sfx('click'); }, { capture: true });

  // ── 素材 ──
  const [heroImages, leaderList] = await Promise.all([
    Promise.all(WORLDS.map(w => loadImage(IMAGES.hero[w.cell], { kind: 'hero', label: w.heroZh, sub: w.work, color: w.color }))),
    Promise.all(['sukuna', 'gojo'].map(f => loadImage(IMAGES.leader[f], { kind: 'leader', label: FACTIONS[f].nameZh, sub: FACTIONS[f].nameJa, color: FACTIONS[f].secondary }))),
  ]);
  const leaderImages = { sukuna: leaderList[0], gojo: leaderList[1] };
  const emblems = await loadEmblems();
  WORLDS.forEach(w => stage.setWorldImage(w.cell, tileCanvas(w, emblems[w.cell])));

  // ── 狀態 ──
  const app = {
    screen: 'title',
    mode: 'cpu',
    faction: 'gojo', // 先手（玩家）固定是五條悟，對手是宿儺（使用者要求，不用選陣營）
    match: null,
    busy: false,
    thinking: false,
  };

  const screens = createScreens(document.getElementById('ui'), {
    onStart: async () => {
      await audio.unlock();
      audio.music.playCell(SAO_CELL); // 從按下 START 開始就是刀劍神域的歌
      audio.sfx('charge', { pitch: 0.6 });
      await playLogin({ onVoice: () => audio.clip(SFX.linkStart, 1) });
      audio.sfx('whoosh', { pitch: 0.8 });
      goMode();
    },
    onMode: mode => { app.mode = mode; startMatch(); },
    onHome: () => goTitle(),
    onAgain: () => startMatch(),
    onOpenSettings: () => screens.openSettings(settings),
    onSettings: s => applySettings(s),
  }, { leaderImages });

  function applySettings(s) {
    settings = s;
    saveSettings(storage, s);
    audio.setSettings(s);
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
    performer.cancelCurrent();
    stage.clearBoard();
    stage.resetView();
    stage.controls.autoRotate = true;
    stage.controls.autoRotateSpeed = 0.6;
    screens.hideResult();
    screens.showTitle();
    audio.music.playCell(SAO_CELL);
  }

  function goMode() {
    app.screen = 'mode';
    screens.showMode();
  }

  function startMatch() {
    app.screen = 'playing';
    performer.cancelCurrent();
    app.match = createMatch({ mode: app.mode, firstFaction: app.faction });
    app.busy = false;
    app.thinking = false;
    stage.clearBoard();
    stage.controls.autoRotate = false;
    stage.resetView();
    screens.hideResult();
    screens.showHud(hudState());
    audio.music.playCell(SAO_CELL);
  }

  const performer = createPerformer({ stage, audio, heroImages, leaderImages, getSettings: () => settings });

  async function show(event) {
    await performer.performMove(event);
  }

  /** 對局結束：先記戰績、換結局曲，再播合體技與結局演出，最後顯示結局畫面。 */
  async function finish() {
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
    audio.music.playEnding({ win: 'victory', lose: 'defeat', draw: 'draw' }[tone]);
    const done = await performer.performFinish(r);
    if (done === 'cancelled' || app.match !== m) return;
    screens.showResult({ banner, sub, tone, faction: r.winnerFaction });
  }

  async function humanMove(cell) {
    const m = app.match;
    app.busy = true;
    try {
      await show(m.play(cell));
      if (app.match !== m) return;
      screens.updateHud(hudState());
      if (!m.isOver() && m.isCpuTurn()) {
        app.thinking = true;
        screens.updateHud(hudState());
        await sleep(CPU_THINK_MS);
        if (app.match !== m) return; // 中途回到標題或重開
        app.thinking = false;
        await show(m.cpuPlay(Math.random));
        if (app.match !== m) return;
        screens.updateHud(hudState());
      }
      if (m.isOver() && app.match === m) await finish();
    } finally {
      if (app.match === m) app.busy = false;
    }
  }

  const canPlay = () => app.screen === 'playing' && app.match && !app.busy && !app.match.isOver()
    && !app.match.isCpuTurn() && !stage.isCinematic;

  // ── 點擊 / 拖曳 ──
  // 只有「單指 / 左鍵、沒拖動、沒有第二根手指」的放開才算下棋（見 core/pointer.js）
  const taps = createTapTracker();
  // 演出中：點一下（畫面任何地方）或按空白鍵就跳過；這次點擊不會被當成下棋
  canvas.addEventListener('pointerdown', e => {
    if (performer.busy) {
      performer.skip();
      taps.reset();
      return;
    }
    taps.down(e);
  });
  canvas.addEventListener('pointercancel', e => taps.cancel(e));
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && performer.busy) {
      e.preventDefault();
      performer.skip();
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!taps.up(e) || !canPlay()) return;
    const cell = stage.pickCell(e.clientX, e.clientY);
    if (cell >= 0 && app.match.board[cell] === EMPTY) humanMove(cell);
  });

  let lastHover = -1;
  canvas.addEventListener('pointermove', e => {
    taps.move(e);
    if (e.pointerType !== 'mouse' || app.screen !== 'playing' || !canPlay()) {
      hint.hidden = true;
      stage.setHover(-1);
      lastHover = -1;
      canvas.style.cursor = 'grab';
      return;
    }
    const cell = stage.pickCell(e.clientX, e.clientY);
    const free = cell >= 0 && app.match.board[cell] === EMPTY && canPlay();
    if (free && cell !== lastHover) audio.sfx('hover');
    lastHover = free ? cell : -1;
    stage.setHover(lastHover);
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
  window.__hw06 = {
    stage, app, stats, audio, performer,
    liveParticles: () => liveParticles(stage),
    get settings() { return settings; },
    /** 驗證用：替目前輪到的人類下一手（等同點擊那一格）。 */
    play: cell => (canPlay() ? humanMove(cell) : Promise.resolve('blocked')),
  };
}
