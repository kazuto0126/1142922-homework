// 6 納茲：火竜の咆哮 —— 吸氣（粒子往口中收）→ 錐形火焰吐息席捲整格 → 火星與熱浪往上飄。
import * as THREE from 'three';
import { emit, ring, flash, converge, later, residue } from '../common.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const fire = fx.color;
  // 口的位置：格子左前方的半空中，往格子噴
  const mouth = pos.clone().add(new THREE.Vector3(-2.2, 1.5, 1.8));
  const dir = pos.clone().setY(pos.y + 0.2).sub(mouth).normalize();

  converge(stage, mouth, { radius: 1.6, count: 70 * mul, color: '#ffcf7a', color2: fire, life: 0.3, size: 0.22 });
  audio.sfx('charge', { pitch: 0.8 });

  // 吐息：分 8 波噴出，看起來是一道連續的火柱
  for (let i = 0; i < 8; i++) {
    later(stage, 300 + i * 55, () => {
      emit(stage, { pos: mouth, count: 34 * mul, color: '#ffe08a', color2: fire, shape: 'cone', dir, angle: 0.22 + i * 0.015, speed: 10 * scale, speedVar: 0.25, drag: 0.6, life: 0.42, size: 0.55 * scale, sizeVar: 0.6 });
      emit(stage, { pos: mouth, count: 14 * mul, color: '#ff3b1f', color2: '#8a1400', shape: 'cone', dir, angle: 0.3, speed: 8 * scale, drag: 0.6, life: 0.5, size: 0.7 * scale });
    });
  }
  later(stage, 300, () => {
    audio.sfx('fire');
    flash(stage, mouth, { color: '#ff7a2a', intensity: 35, life: 0.5 });
  });

  later(stage, 560, () => {
    ring(stage, pos, { color: fire, radius: 2.2 * scale, life: 0.55, width: 0.22 });
    flash(stage, pos, { color: '#ff5a1f', intensity: 55 * scale, life: 0.5 });
    stage.shake(0.2 * scale, 450);
    audio.sfx('explode', { pitch: 1.1, gain: 0.7 });
  });

  later(stage, 700, () => {
    // 火星與熱浪往上飄
    emit(stage, { pos: pos.clone().setY(pos.y + 0.15), count: 70 * mul, color: '#ffb347', color2: '#ff3b1f', shape: 'up', angle: 0.6, speed: 2.5, gravity: 2, drag: 0.8, life: 1.1, size: 0.2, radius: 0.8 });
    residue(fx);
  });
}
