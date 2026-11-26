// 8 黑崎一護：月牙天衝 —— 黑紅色的新月形劍氣橫掃過格子 → 殘留黑紅火焰。
import * as THREE from 'three';
import { emit, ring, flash, converge, spawn, glowMat, later, residue, easeOut } from '../common.js';

function crescent(scale) {
  const g = new THREE.Group();
  // 外圈紅光、內圈黑色（用一般混合的深色，才看得出「黑」）
  const red = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.5, 48, 1, -Math.PI * 0.45, Math.PI * 0.9), glowMat('#ff2a3d', 0.95));
  const black = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.4, 48, 1, -Math.PI * 0.42, Math.PI * 0.84),
    new THREE.MeshBasicMaterial({ color: '#0a0004', transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }),
  );
  black.position.z = 0.01;
  g.add(red, black);
  g.scale.setScalar(scale);
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const red = fx.color;
  const from = pos.clone().add(new THREE.Vector3(-3.4, 1.0, 0.6));
  const to = pos.clone().add(new THREE.Vector3(1.2, 0.6, -0.2));

  // 蓄力：刀尖聚集黑紅靈壓
  converge(stage, from, { radius: 1.3, count: 50 * mul, color: '#ff2a3d', color2: '#1a0006', life: 0.25, size: 0.25 });
  audio.sfx('charge', { pitch: 0.7, gain: 0.7 });

  later(stage, 180, () => {
    const moon = crescent(1.1 * scale);
    // 新月的開口朝前進方向，立在垂直面上
    moon.position.copy(from);
    moon.rotation.y = 0;
    spawn(stage, moon, {
      life: 0.45,
      update(k) {
        moon.position.lerpVectors(from, to, easeOut(k));
        moon.scale.setScalar(1.1 * scale * (0.7 + k * 0.6));
        moon.children.forEach(m => { m.material.opacity = k < 0.7 ? 0.95 : 0.95 * (1 - (k - 0.7) / 0.3); });
        emit(stage, { pos: moon.position, count: 5 * mul, color: '#ff2a3d', color2: '#2a0008', speed: 1.5, life: 0.35, size: 0.3, radius: 0.8 });
      },
    });
    audio.sfx('slash', { pitch: 0.6 });
    audio.sfx('wind', { pitch: 0.8 });
  });

  later(stage, 380, () => {
    emit(stage, { pos: pos.clone().setY(pos.y + 0.4), count: 110 * mul, color: red, color2: '#1a0006', speed: 7 * scale, life: 0.55, size: 0.32 });
    ring(stage, pos, { color: '#ff2a3d', radius: 2.2 * scale, life: 0.5, width: 0.22 });
    flash(stage, pos, { color: '#ff2a3d', intensity: 50 * scale });
    stage.shake(0.28 * scale, 320);
    audio.sfx('explode', { pitch: 0.9, gain: 0.8 });
  });

  later(stage, 500, () => {
    // 殘留的黑紅火焰
    emit(stage, { pos: pos.clone().setY(pos.y + 0.1), count: 60 * mul, color: '#ff2a3d', color2: '#140004', shape: 'up', angle: 0.35, speed: 2.4, gravity: 1.5, drag: 0.8, life: 0.9, size: 0.4, radius: 0.7 });
    residue(fx);
  });
}
