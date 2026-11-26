// 5 御坂美琴：超電磁砲 —— 硬幣彈起 → 一道橘色粗光束貫穿 → 電弧四散。
import * as THREE from 'three';
import { emit, ring, flash, arcs, spawn, solidMat, glowMat, later, residue } from '../common.js';
import { hit, energyMaterial, sparks } from '../realism.js';

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
    const len = shooter.distanceTo(target);
    const beamMat = energyMaterial(stage, { c1: '#ffc070', c2: '#ff5a00', scroll: 14, scale: [3, 12], fresnel: 1.2, threshold: 0.2, fadeV: 0.04 });
    const rail = new THREE.Group();
    rail.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.32 * scale, len, 32, 1, true), beamMat));
    rail.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, len, 12, 1, true), glowMat('#ffffff', 1)));
    rail.position.copy(shooter).add(target).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().sub(shooter).normalize());
    spawn(stage, rail, {
      life: 0.55,
      update(k) {
        const w = k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 2);
        rail.scale.set(Math.max(0.001, w), 1, Math.max(0.001, w));
        beamMat.uniforms.uOpacity.value = w;
      },
    });
    sparks(stage, shooter, { count: 40, color: '#ffd27a', speed: 6, dir: shooter.clone().sub(target) });
    emit(stage, { pos: shooter, count: 30 * mul, color: '#ffd27a', color2: orange, speed: 3, life: 0.4, size: 0.25 });
    audio.sfx('beam');
  });

  later(stage, 420, () => {
    arcs(stage, target, { count: 8 * mul, radius: 1.4 * scale, color: '#bfe8ff', life: 0.5, width: 0.04 });
    emit(stage, { pos: target, count: 120 * mul, color: orange, color2: '#fff1c8', speed: 8 * scale, drag: 2, life: 0.5, size: 0.28 });
    ring(stage, pos, { color: orange, radius: 2.1 * scale, life: 0.45, width: 0.2 });
    hit(fx, { power: 1.1, color: orange, smokeColor: '#4a4a55' });
    audio.sfx('thunder', { gain: 0.8 });
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.12 });
  });
}
