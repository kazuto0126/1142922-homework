// 2 艾連：巨人化 —— 黃色落雷打中格子 → 蒸氣爆發 → 巨大的手臂從地面伸出再沉下。
import * as THREE from 'three';
import { emit, ring, flash, bolt, orb, spawn, solidMat, later, residue, easeOut } from '../common.js';
import { hit } from '../realism.js';

function makeArm(scale) {
  const skin = solidMat('#c97856', { emissive: '#5a1d0c', emissiveIntensity: 0.35 });
  const g = new THREE.Group();
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 2.4, 7), skin);
  forearm.position.y = 1.2;
  g.add(forearm);
  const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), skin);
  fist.scale.set(1, 1.15, 0.85);
  fist.position.y = 2.55;
  g.add(fist);
  // 指節
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.2), skin);
    k.position.set(-0.24 + i * 0.16, 2.95, 0.22);
    g.add(k);
  }
  g.scale.setScalar(scale);
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const gold = fx.color;

  // 落雷
  bolt(stage, pos.clone().setY(9), pos.clone().setY(pos.y + 0.1), { color: '#ffe14a', width: 0.12 * scale, life: 0.35, segments: 14, jag: 0.5 });
  bolt(stage, pos.clone().add(new THREE.Vector3(0.6, 8, -0.4)), pos.clone().setY(pos.y + 0.1), { color: gold, width: 0.06, life: 0.3, delay: 0.05, segments: 12, jag: 0.6 });
  flash(stage, pos, { color: '#ffe14a', intensity: 55 * scale, life: 0.4, distance: 12 });
  audio.sfx('thunder');

  later(stage, 150, () => {
    // 蒸氣爆發
    emit(stage, { pos: pos.clone().setY(pos.y + 0.2), count: 90 * mul, color: '#fff1e0', color2: '#ffb36b', shape: 'up', angle: 0.9, speed: 3.5 * scale, drag: 1.2, gravity: 1.5, life: 1.3, size: 0.8 });
    orb(stage, pos.clone().setY(pos.y + 0.5), { color: '#ff9a3a', grow: [0.3, 1.6 * scale], life: 0.45, opacity: [0.8, 0] });
    ring(stage, pos, { color: gold, radius: 2.2 * scale, life: 0.5, width: 0.2 });
    hit(fx, { power: 1.3, smokeColor: '#d8d0c8', debrisColor: '#7a5b45' });
    audio.sfx('explode', { pitch: 0.8 });
  });

  later(stage, 230, () => {
    // 巨人的手臂從地底伸出
    const arm = makeArm(0.75 * scale);
    arm.position.copy(pos).setY(-2.6 * scale);
    arm.rotation.z = 0.12;
    spawn(stage, arm, {
      life: 1.0,
      update(k) {
        const up = k < 0.35 ? easeOut(k / 0.35) : k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        arm.position.y = -2.6 * scale + up * 2.75 * scale;
      },
    });
    emit(stage, { pos: pos.clone().setY(pos.y + 0.1), count: 50 * mul, color: '#7a5b45', color2: '#c9a27c', shape: 'up', angle: 0.7, speed: 5, gravity: -9, life: 0.8, size: 0.22 });
    residue(fx, { delay: 0.25 });
  });
}
