// 5 御坂美琴：超電磁砲 —— 硬幣彈起 → 一道橘色粗光束貫穿 → 電弧四散。
import * as THREE from 'three';
import { emit, ring, flash, beam, arcs, spawn, solidMat, later, residue } from '../common.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const orange = fx.color;
  // 從棋盤右前方、高一點的地方射過來
  const shooter = pos.clone().add(new THREE.Vector3(4.4, 1.3, -0.8));
  const target = pos.clone().setY(pos.y + 0.25);

  // 硬幣：往上彈、翻轉、落回指尖
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.025, 20), solidMat('#ffcc55', { emissive: '#ff9a1a', emissiveIntensity: 0.8, flat: false }));
  coin.position.copy(shooter);
  spawn(stage, coin, {
    life: 0.38,
    update(k, _o, dt) {
      coin.position.y = shooter.y + Math.sin(k * Math.PI) * 1.1;
      coin.rotation.x += dt * 30;
    },
  });
  arcs(stage, shooter, { count: 3, radius: 0.5, color: '#bfe8ff', life: 0.35 });
  audio.sfx('sparkle', { pitch: 1.3 });

  later(stage, 360, () => {
    beam(stage, shooter, target, { color: orange, width: 0.2 * scale, life: 0.5 });
    beam(stage, shooter, target, { color: '#ff7a1a', width: 0.34 * scale, life: 0.3, core: false });
    emit(stage, { pos: shooter, count: 30 * mul, color: '#ffd27a', color2: orange, speed: 3, life: 0.4, size: 0.25 });
    audio.sfx('beam');
  });

  later(stage, 420, () => {
    arcs(stage, target, { count: 8 * mul, radius: 1.4 * scale, color: '#bfe8ff', life: 0.5, width: 0.04 });
    emit(stage, { pos: target, count: 120 * mul, color: orange, color2: '#fff1c8', speed: 8 * scale, drag: 2, life: 0.5, size: 0.28 });
    ring(stage, pos, { color: orange, radius: 2.1 * scale, life: 0.45, width: 0.2 });
    flash(stage, pos, { color: '#ffb347', intensity: 35 * scale });
    stage.shake(0.25 * scale, 300);
    audio.sfx('thunder', { gain: 0.8 });
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.12 });
  });
}
