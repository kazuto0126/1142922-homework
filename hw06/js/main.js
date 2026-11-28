// 進入點：建立舞台、載入素材、畫面流程與對局流程。
import { createStage, supportsWebGL, CELL } from './stage/stage.js';
import { createBoardHud, hudWarmupObjects } from './stage/boardHud.js';
import { cpuInsight, threats } from './core/insight.js';
import { moveDamage, MAX_HP } from './core/hp.js';
import { pickTier, tierSettings } from './core/autoQuality.js';
import { createMatch, outcomeFor } from './core/match.js';
import { EMPTY, X, O } from './core/rules.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { createTapTracker } from './core/pointer.js';
import { createStats } from './core/stats.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { IMAGES, MUSIC } from './assets/manifest.js';
import { loadImage } from './assets/loader.js';
import { tileCanvas, loadEmblems } from './assets/emblems.js';
import { createScreens } from './ui/screens.js';
import { createAudio } from './audio/engine.js';
import { playLogin } from './ui/login.js';
import { SFX } from './assets/manifest.js';
import { createPerformer } from './perform.js';
import { liveParticles } from './fx/common.js';
import { fxWarmupObjects, rehearse } from './fx/warmup.js';

const CPU_THINK_MS = 400;
const SAO_CELL = WORLDS.find(w => w.work === '刀劍神域').cell; // 刀劍神域那一格的盤面位置；它的歌是整場的背景音樂
const sleep = ms => new Promise(r => setTimeout(r, ms));

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const canvas = document.getElementById('stage');

if (!supportsWebGL()) {
  document.body.innerHTML = '<div class="fatal">你的瀏覽器不支援 WebGL，請改用最新版的 Chrome 或 Edge。</div>';
} else {
  boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<div class="fatal">載入失敗，請重新整理頁面。</div>');
  });
}

/** 等下一幀（分頁在背景、畫面暫停時最多等 60ms，不會卡住）。 */
function nextFrame() {
  return new Promise(resolve => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(go);
    setTimeout(go, 60);
  });
}

async function boot() {
  const storage = safeStorage();
  let settings = loadSettings(storage);
  const stats = createStats(storage);
  const stage = createStage(canvas, { quality: settings.quality === 'low' ? 'low' : 'high' }); // 自動：先用完整版，開頭動畫時量過再決定
  // 封面完全蓋住棋盤：先不要畫 3D（第一次畫會一次編譯幾十個著色器、卡住封面動畫），按下 START 才開始畫
  stage.setRunning(false);
  const audio = createAudio(settings);
  const boardHud = createBoardHud(stage, { cellSize: CELL }); // 電腦思考的視覺化、危機警示
  const hudSfx = (name, opts) => audio.sfx(name, opts);
  audio.preloadClip(SFX.linkStart); // 封面時先把語音下載好，按下 START 就能立刻播

  // 任何按鈕都有點擊音效；第一次點擊時解鎖音訊（瀏覽器規定）
  document.addEventListener('pointerdown', () => { audio.unlock(); }, { capture: true });
  document.addEventListener('click', e => { if (e.target.closest('button')) audio.sfx('click'); }, { capture: true });

  // ── 素材 ──
  const [heroImages, leaderList] = await Promise.all([
    Promise.all(WORLDS.map(w => loadImage(IMAGES.hero[w.id], { kind: 'hero', label: w.heroZh, sub: w.work, color: w.color }))),
    Promise.all(['sukuna', 'gojo'].map(f => loadImage(IMAGES.leader[f], { kind: 'leader', label: FACTIONS[f].nameZh, sub: FACTIONS[f].nameJa, color: FACTIONS[f].secondary }))),
  ]);
  const leaderImages = { sukuna: leaderList[0], gojo: leaderList[1] };
  const emblems = await loadEmblems();
  WORLDS.forEach(w => stage.setWorldImage(w.cell, tileCanvas(w, emblems[w.id])));
  // 在封面畫面時先把特效的著色器平行編譯好（不等它，背景進行）
  stage.warmup([...fxWarmupObjects(stage), ...hudWarmupObjects()]);
  // 九首歌在背景一首一首先下載（進瀏覽器快取），之後換歌就不用等下載
  (async () => {
    const order = [SAO_CELL, ...WORLDS.map(w => w.cell).filter(c => c !== SAO_CELL)];
    for (const cell of order) {
      const path = MUSIC.cell[WORLDS[cell].id];
      try { await fetch(path, { priority: 'low' }).then(r => r.arrayBuffer()); } catch { /* 下載失敗沒關係，播放時會再試 */ }
    }
  })();

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
      if (app.diving) return; // 連點只算一次
      app.diving = true;
      await audio.unlock();
      document.querySelector('.boot')?.classList.add('diving');
      // 第一次真正的 3D 繪製會佔住主執行緒一下：趁封面「變白淡出」的 CSS 動畫（由瀏覽器另一條執行緒處理，不會頓）時做完，
      // 再開始用主執行緒逐幀畫的光束隧道
      await nextFrame();
      stage.setRunning(true);
      stage.setRenderEvery(3); // 登入動畫蓋住畫面時，背後的 3D 每 3 幀才畫一次，把時間讓給隧道動畫
      stage.warmDraw();
      await nextFrame();
      // 登入動畫蓋住整個畫面時，在棋盤上靜音預演幾招：顯示卡第一次畫這些特效會卡一下，先在看不到的時候卡掉
      const stopRehearsal = rehearse(stage);
      // 自動畫質：預演九招的這幾秒，順便量這台電腦畫完整特效每一幀要多久（頭 0.8 秒的編譯卡頓不算）；
      // 第 3.3 秒決定給完整版還是輕量版，剩下的登入動畫時間拿來切換、重新編譯，玩家看不到切換的那一下
      const autoDone = settings.quality === 'auto' ? measureAndPickQuality() : Promise.resolve();
      // 「リンク・スタート」語音 + 潛入音效（使用者提供的原版音檔），動畫跟著聲音的時間點走
      await playLogin({ startAudio: () => audio.clip(SFX.linkStart, 1) });
      await autoDone;
      stopRehearsal();
      stage.setRenderEvery(1);
      app.diving = false;
      audio.music.playCell(SAO_CELL); // 潛入完成後才開始刀劍神域的歌
      goMode();
    },
    onMode: mode => { app.mode = mode; startMatch(); },
    onHome: () => goTitle(),
    onAgain: () => startMatch(),
    onOpenSettings: () => screens.openSettings(settings),
    onSettings: s => applySettings(s),
  }, { leaderImages });

  // 之前在這台電腦上跑不動、被自動換成輕量版過：記起來，下次直接用輕量版（7 天內）
  const LITE_KEY = 'hw06-1142922-lite';
  const rememberedLite = () => { try { return Date.now() - Number(storage?.getItem(LITE_KEY) || 0) < 7 * 864e5; } catch { return false; } };

  async function measureAndPickQuality() {
    stage.startBenchmark({ skipMs: 800 });
    await sleep(3300);
    const result = stage.stopBenchmark();
    let tier = pickTier(result);
    if (rememberedLite()) tier = 'lite';
    app.bench = { ...result, tier };
    if (!tier || settings.quality !== 'auto') return;
    app.autoTier = tier;
    await applyTier(tier);
  }

  // 自動模式下，完整版已經降到最低還是跑不順：等輪到玩家、畫面靜止時換成輕量版（換的時候要重新編譯，頓一兩秒）
  let wantLite = false;
  stage.onStruggle(() => {
    if (settings.quality !== 'auto' || app.autoTier === 'lite' || wantLite) return;
    wantLite = true;
    try { storage?.setItem(LITE_KEY, String(Date.now())); } catch { /* 存不了就算了 */ }
    const tryNow = () => {
      if (!wantLite) return;
      let busy = true;
      try { busy = performer.busy || app.busy || app.diving; } catch { /* 開場還沒建好演出器 */ }
      if (busy) { setTimeout(tryNow, 500); return; }
      wantLite = false;
      app.autoTier = 'lite';
      applyTier('lite');
    };
    tryNow();
  });

  /** 套用自動模式選出來的等級。換成輕量版時先暫停 3D、在背景重新編譯好著色器再繼續畫，才不會卡。 */
  async function applyTier(tier) {
    const { quality, perfLevel } = tierSettings(tier);
    if (stage.quality !== quality) {
      stage.setRunning(false);
      stage.setQuality(quality);
      await stage.recompile();
      stage.setRunning(true);
    }
    if (quality === 'high') stage.setPerfLevel(perfLevel);
  }

  function applySettings(s) {
    settings = s;
    saveSettings(storage, s);
    audio.setSettings(s);
    if (s.quality === 'auto') applyTier(app.autoTier || 'full');
    else if (stage.quality !== s.quality) stage.setQuality(s.quality);
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
    boardHud.clearAll();
    stage.setSkyMood({ bias: 0, winner: null });
    stage.clearBoard();
    stage.resetView();
    stage.controls.autoRotate = true;
    stage.setRunning(false); // 封面蓋住棋盤時不畫 3D
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
    app.hp = { gojo: MAX_HP, sukuna: MAX_HP };
    app.busy = false;
    app.thinking = false;
    boardHud.clearAll();
    stage.setSkyMood({ bias: 0, winner: null });
    stage.clearBoard();
    stage.controls.autoRotate = false;
    stage.resetView();
    screens.hideResult();
    screens.showHud(hudState());
    audio.music.playCell(SAO_CELL);
    // 入場運鏡：繞著整個場景轉一圈、看遍四方的天空，再降到棋盤上方（精簡模式跳過；點一下可以跳過）
    if (!settings.shortMode) {
      const m = app.match;
      app.busy = true;
      audio.sfx('whoosh', { pitch: 0.5 });
      stage.introSweep(4200).then(() => { if (app.match === m) app.busy = false; });
    }
  }

  const performer = createPerformer({ stage, audio, heroImages, leaderImages, getSettings: () => settings });

  async function show(event) {
    await performer.performMove(event);
  }

  /** 這一步打在對手身上的傷害（SAO 風格 HP 條）。 */
  function applyHp(event) {
    const foe = event.faction === 'gojo' ? 'sukuna' : 'gojo';
    const dmg = moveDamage(event.classification, app.hp[foe]);
    app.hp[foe] -= dmg;
    screens.setHp(foe, app.hp[foe], dmg);
    if (dmg > 0) audio.sfx('impact', { pitch: 1.9, gain: 0.35 });
  }

  /** 對局結束：先記戰績，播合體技與結局演出，最後換結局曲、顯示結局畫面。 */
  /** 危機警示：只差一格就連線的格子（用威脅那一方的陣營色）。 */
  function updateThreats(m) {
    if (m.isOver()) { boardHud.clearAll(); return; }
    const list = threats(m.board).map(t => ({ cell: t.cell, faction: m.factionOf[t.mark] }));
    boardHud.setThreats(list, { sfx: hudSfx });
    // 天空氣氛：誰只差一格的地方比較多，那一側的天空和光就變亮
    const g = list.filter(t => t.faction === 'gojo').length, s = list.filter(t => t.faction === 'sukuna').length;
    stage.setSkyMood({ bias: 0.6 * (g - s) });
  }

  async function finish() {
    const m = app.match;
    boardHud.clearAll();
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
    // 致勝那一手的歌一直播到合體技、領域對決演完，結局畫面出來時才換結局曲
    const done = await performer.performFinish(r);
    if (done === 'cancelled' || app.match !== m) return;
    audio.music.playEnding({ win: 'victory', lose: 'defeat', draw: 'draw' }[tone]);
    screens.showResult({ banner, sub, tone, faction: r.winnerFaction });
  }

  async function humanMove(cell) {
    const m = app.match;
    app.busy = true;
    try {
      boardHud.breakBarrier(cell, m.factionOf[m.turn()], { sfx: hudSfx }); // 五條悟擋在無下限護盾的那一格：護盾往外炸開
      boardHud.setThreats([]); // 下棋演出時先收掉警示，演完再重算
      const ev = m.play(cell);
      await show(ev);
      if (app.match !== m) return;
      applyHp(ev);
      screens.updateHud(hudState());
      updateThreats(m);
      if (!m.isOver() && m.isCpuTurn()) {
        app.thinking = true;
        screens.updateHud(hudState());
        // 電腦先決定，再把「每格算出來的結果 → 掃描 → 鎖定」演給玩家看
        const choice = m.peekCpuMove(Math.random);
        if (settings.shortMode) await sleep(CPU_THINK_MS);
        else await boardHud.think(cpuInsight(m.board), choice, { sfx: hudSfx, faction: m.factionOf[O] });
        if (app.match !== m) return; // 中途回到標題或重開
        boardHud.clearInsight();
        boardHud.breakBarrier(choice, m.factionOf[O], { sfx: hudSfx }); // 宿儺硬闖進護盾：護盾被斬碎
        boardHud.setThreats([]);
        app.thinking = false;
        const cev = m.cpuPlay(null, choice);
        await show(cev);
        if (app.match !== m) return;
        applyHp(cev);
        screens.updateHud(hudState());
        updateThreats(m);
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
    // 滑鼠移到格子上不顯示作品和角色名字（使用者要求），只有格子浮起來和音效
  });
  canvas.addEventListener('pointerleave', () => stage.setHover(-1));

  goTitle();

  // 開發 / 驗證用
  window.__hw06 = {
    stage, app, stats, audio, performer,
    liveParticles: () => liveParticles(stage),
    get settings() { return settings; },
    /** 驗證用：替目前輪到的人類下一手（等同點擊那一格）。 */
    play: cell => (canPlay() ? humanMove(cell) : Promise.resolve('blocked')),
    /** 驗證用：直接套用某個自動畫質等級（'full' | 'reduced' | 'lite'）。 */
    applyTier,
  };
}
