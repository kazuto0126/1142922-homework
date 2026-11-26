// 2 艾連：巨人化 —— 黃色落雷 → 蒸氣爆發 → 巨人的手臂從地底伸出抓住格子、持續冒蒸氣 → 沉回地底。
import * as THREE from 'three';
import { emit, ring, flash, bolt, orb, spawn, later, residue, easeOut, easeIn } from '../common.js';
import { hit, smoke, debris } from '../realism.js';
import { makeTitanArm } from '../models.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const gold = fx.color;

  // 落雷（兩道）
  bolt(stage, pos.clone().setY(9), pos.clone().setY(pos.y + 0.1), { color: '#ffe14a', width: 0.14 * scale, life: 0.4, segments: 16, jag: 0.55 });
  bolt(stage, pos.clone().add(new THREE.Vector3(0.6, 8, -0.4)), pos.clone().setY(pos.y + 0.1), { color: gold, width: 0.07, life: 0.35, delay: 0.06, segments: 12, jag: 0.6 });
  flash(stage, pos, { color: '#ffe14a', intensity: 45 * scale, life: 0.45, distance: 12 });
  audio.sfx('thunder');

  later(stage, 160, () => {
    hit(fx, { power: 1.3, color: '#ffd04a', smokeColor: '#e8e0d6', debrisColor: '#7a5b45' });
    orb(stage, pos.clone().setY(pos.y + 0.6), { color: '#ff9a3a', grow: [0.3, 1.8 * scale], life: 0.5, opacity: [0.7, 0] });
    smoke(stage, pos.clone().setY(0.3), { count: 30 * mul, color: '#f2ece4', size: 2.2, life: 2.0, speed: 2.4, alpha: 0.6, radius: 0.8 });
    audio.sfx('explode', { pitch: 0.8 });
  });

  later(stage, 250, () => {
    const arm = makeTitanArm();
    const s = 0.8 * scale;
    arm.scale.setScalar(s);
    const below = pos.clone().setY(-4.4 * s), up = pos.clone().setY(-0.9 * s);
    arm.position.copy(below);
    arm.rotation.set(0.15, Math.random() * 6.28, 0.1);
    audio.sfx('wind', { pitch: 0.5 });
    let steamAcc = 0;
    spawn(stage, arm, {
      life: 1.6,
      update(k, _o, dt) {
        const t = k * 1600;
        if (t < 450) arm.position.lerpVectors(below, up, easeOut(t / 450));
        else if (t < 1150) { arm.position.copy(up); arm.rotation.x = 0.15 + Math.sin(t / 90) * 0.02; }
        else arm.position.lerpVectors(up, below, easeIn((t - 1150) / 450));
        // 巨人的身體一直冒出蒸氣
        steamAcc += dt;
        if (steamAcc > 0.12) {
          steamAcc = 0;
          smoke(stage, arm.position.clone().setY(Math.max(0.3, arm.position.y + 2.2 * s)), { count: 4, color: '#f4eee8', size: 1.3, life: 1.2, speed: 0.8, alpha: 0.4, radius: 0.5 });
        }
      },
    });
    later(stage, 420, () => {
      debris(stage, pos.clone().setY(0.2), { count: 26, color: '#7a5b45', power: 1.1 });
      stage.impact(fx.cell, 0.7);
      ring(stage, pos, { color: gold, radius: 2.4 * scale, life: 0.5, width: 0.12 });
    });
    residue(fx, { delay: 0.5 });
  });
}
