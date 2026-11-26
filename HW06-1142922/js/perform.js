// 把拍點表（core/director.js）對到實際的畫面：入場、cut-in、技能、落子、運鏡。
// 每段演出都可以跳過（skip）或取消（cancel）。
import { Timeline } from './core/timeline.js';
import { planMove, planUnison, planEnding } from './core/director.js';
import { WORLDS, FACTIONS } from './core/worlds.js';
import { palette, ring } from './fx/common.js';
import { SKILLS, makeFx } from './fx/skills/index.js';
import * as leaders from './fx/leaders.js';
import * as cutin from './ui/cutin.js';

export function createPerformer({ stage, audio, heroImages, leaderImages, getSettings }) {
  let current = null;
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
    const world = WORLDS[cell];
    const pal = palette(faction);
    const fx = makeFx({ stage, cell, faction, tier, audio, world, pal });
    const plan = planMove(event, { shortMode: getSettings().shortMode });
    const usesCam = plan.beats.some(b => b.kind === 'keyCam');

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      stage.placePiece(cell, faction);
      stage.placeStandee(cell, faction, heroImages[cell]);
      ring(stage, fx.pos, { color: pal.primary, radius: 1.2, life: 0.45 });
      audio.sfx('place');
      audio.music.playCell(cell);
    };

    const handlers = {
      entrance: () => leaders.entrance(fx),
      keyCam: () => { audio.duck(true); stage.flyTo(cell, 650); },
      keyBanner: () => {
        cutin.showBanner(tier === 'finish' ? '決着' : '会心の一手', faction, { lifeMs: 380 });
        audio.sfx('cutin', { pitch: 0.8 });
      },
      cutin: () => {
        cutin.showCutin({
          heroJa: world.heroJa, moveJa: world.moveJa, reading: world.reading, line: world.line,
          faction, image: heroImages[cell], tier: tier === 'normal' ? 'normal' : 'key', worldColor: world.color,
          // cut-in 要在技能打出來（normal 500 ms、key 1200 ms）前後退場，3D 技能才看得到
          lifeMs: tier === 'normal' ? 750 : 650,
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
  async function performFinish(result) {
    const myEpoch = epoch;
    const faction = result.winnerFaction;
    // 跳過結局相關演出：cut-in、鏡頭、還在跑的特效全部收掉
    const skipCleanup = () => { cutin.clearAll(); stage.snapBack(); stage.cancelFx(); };

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
    tl.add(0, () => {
      audio.duck(false);
      if (faction) {
        const f = FACTIONS[faction];
        cutin.showLeaderCutin({ faction, image: leaderImages[faction], titleJa: f.victoryJa, reading: f.victoryReading, lifeMs: 1300 });
        leaders.victory(stage, faction, audio);
      } else {
        cutin.showLeaderCutin({ faction: 'sukuna', image: leaderImages.sukuna, titleJa: FACTIONS.sukuna.unisonJa, reading: FACTIONS.sukuna.unisonReading, lifeMs: 700 });
        leaders.drawClash(stage, audio);
      }
    });
    if (!faction) tl.add(650, () => cutin.showLeaderCutin({ faction: 'gojo', image: leaderImages.gojo, titleJa: FACTIONS.gojo.unisonJa, reading: FACTIONS.gojo.unisonReading, lifeMs: 700 }));
    if (!faction) tl.add(3200, () => cutin.showBanner('勢均力敵', 'sukuna', { lifeMs: 1500 }));
    tl.setDuration(ending.duration);
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
      stage.snapBack();
      audio.duck(false);
    },
  };
}
