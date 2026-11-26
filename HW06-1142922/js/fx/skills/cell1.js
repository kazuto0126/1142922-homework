// 1 漩渦鳴人：螺旋丸 —— 手中聚成旋轉的藍色球體 → 往下推進 → 炸開成水平氣旋。
import * as THREE from 'three';
import { emit, ring, flash, converge, spawn, glowMat, later, residue, easeIn } from '../common.js';
import { hit, energyMaterial } from '../realism.js';

export default function (fx) {
  const { stage, pos, pal, audio, mul, scale } = fx;
  const blue = new THREE.Color('#5ab8ff').lerp(pal.primary, 0.3);
  const start = pos.clone().setY(pos.y + 1.4 * scale);
  const end = pos.clone().setY(pos.y + 0.35);

  // 螺旋丸本體：白色核心 + 藍色外殼 + 三個不同軸向快速旋轉的環
  const ball = new THREE.Group();
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), glowMat('#ffffff', 0.8)));
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), energyMaterial(stage, { c1: '#eafcff', c2: '#' + blue.getHexString(), scroll: 6, scale: [8, 3], twist: 3, fresnel: 1.6, threshold: 0.28 }));
  ball.add(shell);
  const rings = [0, 1, 2].map(i => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 48), glowMat(i === 1 ? '#ffffff' : blue, 0.9));
    r.rotation.set(i * 1.1, i * 0.7, i * 0.4);
    ball.add(r);
    return r;
  });
  ball.position.copy(start);
  converge(stage, start, { radius: 1.4 * scale, count: 50 * mul, color: blue, color2: '#ffffff', life: 0.35, size: 0.2 });
  audio.sfx('charge', { pitch: 1.4 });
  audio.sfx('wind', { pitch: 1.6, delay: 0.15 });

  spawn(stage, ball, {
    life: 0.6,
    update(k, _o, dt) {
      const grow = Math.min(1, k / 0.6);
      ball.scale.setScalar(Math.max(0.001, grow * scale));
      rings.forEach((r, i) => { r.rotation.x += dt * (14 + i * 5); r.rotation.y += dt * (9 + i * 3); });
      shell.rotation.y += dt * 20;
      if (k > 0.75) ball.position.lerpVectors(start, end, easeIn((k - 0.75) / 0.25));
    },
  });

  later(stage, 570, () => {
    // 水平氣旋
    emit(stage, { pos: end, count: 140 * mul, color: blue, color2: '#ffffff', shape: 'ring', speed: 8 * scale, drag: 2.2, life: 0.6, size: 0.3 });
    emit(stage, { pos: end, count: 60 * mul, color: '#ffffff', color2: blue, shape: 'ring', speed: 4 * scale, drag: 1.5, life: 0.8, size: 0.25 });
    ring(stage, pos, { color: blue, radius: 2.3 * scale, life: 0.5, width: 0.22 });
    ring(stage, pos, { color: '#ffffff', radius: 1.7 * scale, life: 0.45, width: 0.08, y: 0.35, delay: 0.06 });
    hit(fx, { power: 1.0, color: blue, smokeColor: '#5a6a80' });
    audio.sfx('explode', { pitch: 1.3, gain: 0.8 });
    residue(fx, { delay: 0.1 });
  });
}
