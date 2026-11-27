// 九格技能。每個技能是 (fx) => void，約 0.9 秒內排好自己的子效果。
// fx = { stage, cell, pos, faction, pal, tier, audio, world, color, mul, scale, big }
import { emit, ring, flash, orb, skillColor } from '../common.js';
import { WORLDS } from '../../core/worlds.js';
import cell0 from './cell0.js';
import cell1 from './cell1.js';
import cell2 from './cell2.js';
import cell3 from './cell3.js';
import cell4 from './cell4.js';
import cell5 from './cell5.js';
import cell6 from './cell6.js';
import cell7 from './cell7.js';
import cell8 from './cell8.js';

/** 通用技能（還沒做專屬特效的格子先用這個）。 */
export function genericSkill(fx) {
  const { stage, pos, pal, mul, audio } = fx;
  const c = fx.color;
  orb(stage, pos.clone().setY(pos.y + 0.6), { color: c, grow: [0.1, 1.1 * fx.scale], life: 0.4, opacity: [1, 0] });
  emit(stage, { pos: pos.clone().setY(pos.y + 0.6), count: 90 * mul, color: c, color2: pal.accent, speed: 6 * fx.scale, life: 0.7, size: 0.32 });
  ring(stage, pos, { color: c, radius: 1.8 * fx.scale, life: 0.5 });
  flash(stage, pos, { color: c, intensity: 35 });
  stage.shake(0.12 * fx.scale, 260);
  audio.sfx('impact');
}

// 技能檔依世界編號命名（cell{id}.js）；SKILLS 依盤面位置排列，SKILLS[盤面位置] 就是那格的技能
const BY_ID = [cell0, cell1, cell2, cell3, cell4, cell5, cell6, cell7, cell8];
export const SKILLS = WORLDS.map(w => BY_ID[w.id]);

/** 建立技能需要的 context。 */
export function makeFx({ stage, cell, faction, tier, audio, world, pal }) {
  const pos = stage.cellCenter(cell).setY(0.15);
  const big = tier !== 'normal';
  return {
    stage, cell, pos, faction, pal, tier, audio, world,
    color: skillColor(world.color, pal),
    big,
    mul: big ? 1.6 : 1,
    scale: big ? 1.3 : 1,
  };
}
