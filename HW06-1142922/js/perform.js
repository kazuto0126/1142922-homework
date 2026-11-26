// 把拍點表（core/director.js）對到實際的畫面：入場、cut-in、技能、落子、運鏡。
// 每段演出都可以跳過（skip）或取消（cancel）。
import { Timeline } from './core/timeline.js';
import { planMove } from './core/director.js';
import { WORLDS } from './core/worlds.js';
import { palette, ring } from './fx/common.js';
import { SKILLS, makeFx } from './fx/skills/index.js';
import * as leaders from './fx/leaders.js';
import * as cutin from './ui/cutin.js';

export function createPerformer({ stage, audio, heroImages, getSettings }) {
  let current = null;

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

  return {
    performMove,
    get busy() { return !!current; },
    skip() { if (current) current.skip(); },
    cancelCurrent() {
      if (current) current.cancel();
      cutin.clearAll();
      stage.snapBack();
      audio.duck(false);
    },
  };
}
