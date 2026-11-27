// 把拍點表（core/director.js）對到實際的畫面：入場、cut-in、技能、落子、運鏡。
// 每段演出都可以跳過（skip）或取消（cancel）。
import { Timeline } from './core/timeline.js';
import { planMove, planUnison, planEnding } from './core/director.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { palette, ring, emit, converge, orb, flash, later, liveParticles, pendingFx } from './fx/common.js';
import { SKILLS, makeFx } from './fx/skills/index.js';
import * as leaders from './fx/leaders.js';
import * as cutin from './ui/cutin.js';
import { playDomainClash, clearClash } from './ui/clash.js';

export function createPerformer({ stage, audio, heroImages, leaderImages, getSettings }) {
  let current = null;
  let lastCell = null; // 最後一手下在哪一格（領域對決時放那一格的歌）
  let epoch = 0; // cancelCurrent() 時 +1；演出各段之間檢查，避免取消後下一段又開始

  /** 以舞台的每一幀驅動時間軸。 */
  async function run(tl) {
    current = tl;
    const off = stage.onFrame(() => tl.update());
    try {
      return await tl.play();
    } finally {
      off();
      if (current === tl) current = null;
    }
  }

  async function performMove(event) {
    const { index: cell, faction, tier } = event;
    lastCell = cell;
    const world = WORLDS[cell];
    const pal = palette(faction);
    const fx = makeFx({ stage, cell, faction, tier, audio, world, pal });
    const plan = planMove(event, { shortMode: getSettings().shortMode });
    const usesCam = plan.beats.some(b => b.kind === 'keyCam' || b.kind === 'softCam');
    const big = tier !== 'normal';

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      stage.placePiece(cell, faction);
      stage.placeStandee(cell, faction, heroImages[cell]);
      ring(stage, fx.pos, { color: pal.primary, radius: 1.2, life: 0.45 });
      audio.sfx('place');
      // 整場都是刀劍神域的歌；只有致勝關鍵的一手（会心の一手、決着）才換成那一格的歌，
      // 而且一直播到合體技、領域對決、結局，下一局再回到刀劍神域
      if (tier === 'key' || tier === 'finish') audio.music.playCell(cell);
    };

    const handlers = {
      entrance: () => leaders.entrance(fx),
      keyCam: () => { audio.duck(true); stage.flyTo(cell, 650); },
      // 一般落子：鏡頭輕輕推近（比關鍵一手遠一點）
      softCam: () => stage.flyTo(cell, 900, 13),
      // 蓄力：能量從四周往格子聚集、光球慢慢變大、地面一圈圈收縮的光環，最後一下閃光
      charge: () => {
        const p = fx.pos.clone().setY(fx.pos.y + 0.7);
        const n = big ? 4 : 3;
        audio.sfx('charge', { pitch: big ? 0.7 : 0.9 });
        for (let i = 0; i < n; i++) {
          later(stage, i * 170, () => {
            converge(stage, p, { radius: (big ? 2.8 : 2.2) - i * 0.25, count: big ? 90 : 60, color: fx.color, color2: pal.accent, life: 0.45, size: 0.22 });
            ring(stage, fx.pos, { color: fx.color, radius: 0.4, life: 0.35, width: 0.06, y: 0.05 + i * 0.04 });
          });
        }
        orb(stage, p, { color: fx.color, grow: [0.05, big ? 0.7 : 0.5], life: big ? 0.9 : 0.6, opacity: [0.2, 0.9] });
        later(stage, big ? 850 : 560, () => flash(stage, fx.pos, { color: fx.color, intensity: big ? 30 : 18, life: 0.25 }));
      },
      // 餘韻：飄起來的餘燼、慢慢擴散的波紋，讓命中之後還有幾秒的「味道」
      aftermath: () => {
        const n = big ? 5 : 3;
        for (let i = 0; i < n; i++) {
          later(stage, i * 260, () => {
            emit(stage, { pos: fx.pos.clone().setY(fx.pos.y + 0.2), count: big ? 40 : 24, color: fx.color, color2: pal.accent, shape: 'up', angle: 0.6, speed: 1.2, speedVar: 0.5, gravity: 0.4, drag: 0.6, life: 1.6, size: 0.16, radius: 1.0, alpha: 0.8 });
            ring(stage, fx.pos, { color: i % 2 ? pal.primary : fx.color, radius: (big ? 3.2 : 2.4) + i * 0.3, life: 1.1, width: 0.03, y: 0.03 });
          });
        }
      },
      keyBanner: () => {
        cutin.showBanner(tier === 'finish' ? '決着' : '会心の一手', faction, { lifeMs: 380 });
        audio.sfx('cutin', { pitch: 0.8 });
      },
      cutin: () => {
        cutin.showCutin({
          heroJa: world.heroJa, moveJa: world.moveJa, reading: world.reading, line: world.line,
          faction, image: heroImages[cell], tier: tier === 'normal' ? 'normal' : 'key', worldColor: world.color,
          // cut-in 停留久一點，在蓄力開始前退場，3D 技能才看得到
          lifeMs: tier === 'normal' ? 900 : 1150,
        });
        audio.sfx('cutin');
      },
      skill: () => SKILLS[cell](fx),
      settle,
    };

    const tl = new Timeline();
    for (const b of plan.beats) tl.add(b.at, handlers[b.kind]);
    tl.setDuration(plan.duration);
    tl.onSkip(() => {
      cutin.clearAll();
      settle();
      stage.snapBack();
    });

    const result = await run(tl);
    if (result === 'done') {
      settle();
      if (usesCam) await stage.restoreView(500);
    }
    audio.duck(false);
    return result;
  }

  /**
   * 對局結束：有人連線 → 合體技（5 秒）→ 勝利演出（7 秒）；和局 → 對撞演出（7 秒）。
   * 每一段都可以跳過；回傳 'cancelled' 表示中途被取消（例如按了回標題）。
   */
  /** 畫面上的演出是不是都結束了：沒有特效物件、粒子幾乎散光、沒有待觸發的特效、鏡頭不動、沒有 cut-in 和領域對決。 */
  function stageQuiet() {
    return stage.fxLayer.children.length === 0
      && liveParticles(stage) < 25
      && pendingFx(stage) === 0
      && !stage.isCinematic
      && cutin.activeCount() === 0
      && !document.querySelector('.clash');
  }
  /** 時間軸最後一個步驟的時間。 */
  const lastBeat = beats => Math.max(0, ...beats.map(b => b.at));

  async function performFinish(result) {
    const myEpoch = epoch;
    const faction = result.winnerFaction;
    // 結局：整片天空慢慢染成勝方的顏色（平手維持四方位）
    stage.setSkyMood({ bias: 0, winner: faction || null });
    // 跳過結局相關演出：cut-in、鏡頭、還在跑的特效全部收掉
    const skipCleanup = () => { cutin.clearAll(); clearClash(); audio.boostMusic(false); stage.snapBack(); stage.cancelFx(); };

    if (faction && result.line) {
      const plan = planUnison(result.line);
      const tl = new Timeline();
      tl.add(0, () => {
        audio.duck(true);
        stage.orbitLine(result.line, plan.duration - 300);
      });
      for (const b of plan.beats) {
        if (b.kind === 'unisonHero') {
          tl.add(b.at, () => {
            const w = WORLDS[b.cell];
            cutin.showCutin({ heroJa: w.heroJa, moveJa: w.moveJa, reading: w.reading, faction, image: heroImages[b.cell], tier: 'normal', worldColor: w.color, lifeMs: 650 });
            audio.sfx('cutin');
            SKILLS[b.cell](makeFx({ stage, cell: b.cell, faction, tier: 'normal', audio, world: w, pal: palette(faction) }));
          });
        } else if (b.kind === 'unisonLeader') {
          tl.add(b.at - 300, () => { cutin.showBanner('合体', faction, { lifeMs: 450 }); audio.sfx('cutin', { pitch: 0.7 }); });
          tl.add(b.at, () => {
            const f = FACTIONS[faction];
            cutin.showLeaderCutin({ faction, image: leaderImages[faction], titleJa: f.unisonJa, reading: f.unisonReading, lifeMs: 900 });
          });
          tl.add(b.at + 600, () => leaders.unison(stage, result.line, faction, audio));
        }
      }
      tl.setDuration(plan.duration);
      // 動畫演完就直接往下走，不要留一段什麼都沒有的空白
      tl.endEarlyWhen(stageQuiet, { afterMs: lastBeat(plan.beats) + 600 });
      tl.onSkip(skipCleanup);
      const r = await run(tl);
      // 跳過合體技 = 直接到結局畫面（不再播勝利演出）
      if (r !== 'done') { audio.duck(false); return r; }
      await stage.restoreView(400);
      if (epoch !== myEpoch) return 'cancelled'; // 鏡頭回位的空檔被取消了
    }
    if (epoch !== myEpoch) return 'cancelled';

    // 結局演出
    const ending = planEnding(result);
    const tl = new Timeline();
    const endAt = ending.beats.find(b => b.kind === 'ending').at;
    // 五條悟輸的時候：先播領域對決（無量空処 vs 伏魔御廚子，五條悟這邊被打碎）
    if (ending.beats.some(b => b.kind === 'clash')) {
      tl.add(0, () => {
        audio.duck(false);
        // 對決時不放音效；放最後一手那一格的歌（使用者要求），而且放大聲
        audio.music.playCell(lastCell ?? Math.floor(Math.random() * WORLDS.length));
        audio.boostMusic(true);
        playDomainClash({ outcome: faction === 'sukuna' ? 'lose' : 'draw' });
      });
    }
    tl.add(endAt, () => {
      audio.duck(false);
      audio.boostMusic(false);
      if (faction) {
        const f = FACTIONS[faction];
        cutin.showLeaderCutin({ faction, image: leaderImages[faction], titleJa: f.victoryJa, reading: f.victoryReading, lifeMs: 1300 });
        leaders.victory(stage, faction, audio);
      } else {
        cutin.showLeaderCutin({ faction: 'sukuna', image: leaderImages.sukuna, titleJa: FACTIONS.sukuna.unisonJa, reading: FACTIONS.sukuna.unisonReading, lifeMs: 700 });
        leaders.drawClash(stage, audio);
      }
    });
    if (!faction) tl.add(endAt + 650, () => cutin.showLeaderCutin({ faction: 'gojo', image: leaderImages.gojo, titleJa: FACTIONS.gojo.unisonJa, reading: FACTIONS.gojo.unisonReading, lifeMs: 700 }));
    if (!faction) tl.add(endAt + 3200, () => cutin.showBanner('勢均力敵', 'sukuna', { lifeMs: 1500 }));
    tl.setDuration(ending.duration);
    // 結局動畫演完就立刻顯示勝負（原本固定等到 8 秒，中間會有空白）
    tl.endEarlyWhen(stageQuiet, { afterMs: lastBeat(ending.beats) + 600 });
    tl.onSkip(skipCleanup);
    const r = await run(tl);
    audio.duck(false);
    return r;
  }

  return {
    performMove,
    performFinish,
    get busy() { return !!current; },
    skip() { if (current) current.skip(); },
    cancelCurrent() {
      epoch++;
      if (current) current.cancel();
      cutin.clearAll();
      clearClash();
      audio.boostMusic(false);
      stage.snapBack();
      audio.duck(false);
    },
  };
}
