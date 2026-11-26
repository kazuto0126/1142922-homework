// 5 御坂美琴：超電磁砲 —— 硬幣彈起、周圍電弧充能 → 一道橘色光束貫穿格子 → 電弧四散、地面焦黑。
import * as THREE from 'three';
import { emit, ring, arcs, spawn, glowMat, later, residue, easeOut } from '../common.js';
import { hit, energyMaterial, sparks } from '../realism.js';
import { makeCoin } from '../models.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const orange = fx.color;
  // 從棋盤右側、稍高的地方射過來
  const shooter = pos.clone().add(new THREE.Vector3(4.4, 1.3, -0.8));
  const target = pos.clone().setY(pos.y + 0.25);
  const dir = target.clone().sub(shooter).normalize();

  // 硬幣：彈起、翻轉、落回指尖
  const coin = makeCoin();
  coin.scale.setScalar(1.4);
  coin.position.copy(shooter);
  stage.fxLayer.add(coin);
  spawn(stage, new THREE.Group(), {
    life: 0.6,
    update(k, _o, dt) {
      coin.position.y = shooter.y + Math.sin(k * Math.PI) * 1.4;
      coin.rotation.x += dt * 28;
    },
  });
  audio.sfx('sparkle', { pitch: 1.3 });

  // 充能：電弧越來越密
  for (let i = 0; i < 5; i++) {
    later(stage, 100 + i * 110, () => {
      arcs(stage, shooter, { count: 2 + i, radius: 0.5 + i * 0.08, color: '#bfe8ff', life: 0.3 });
      audio.sfx('thunder', { pitch: 1.8, gain: 0.25 });
    });
  }

  later(stage, 700, () => {
    // 光束：外層流動的橘色能量 + 白熱的核心；硬幣跟著光束飛出去
    const len = shooter.distanceTo(target) + 3;
    const end = target.clone().addScaledVector(dir, 3);
    const beamMat = energyMaterial(stage, { c1: '#ffc070', c2: '#ff5a00', scroll: 16, scale: [3, 14], fresnel: 1.2, threshold: 0.2, fadeV: 0.03 });
    const rail = new THREE.Group();
    rail.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.34 * scale, len, 32, 1, true), beamMat));
    rail.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, len, 12, 1, true), glowMat('#fff4dc', 1)));
    rail.position.copy(shooter).add(end).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spawn(stage, rail, {
      life: 0.85,
      update(k) {
        const w = k < 0.08 ? k / 0.08 : 1 - Math.pow((k - 0.08) / 0.92, 2);
        rail.scale.set(Math.max(0.001, w), 1, Math.max(0.001, w));
        beamMat.uniforms.uOpacity.value = w;
        if (k < 0.6) sparks(stage, shooter.clone().lerp(end, Math.random()), { count: 3, color: '#ffd27a', speed: 4 });
      },
    });
    spawn(stage, new THREE.Group(), {
      life: 0.18,
      update(k) { coin.position.lerpVectors(shooter, end, easeOut(k)); if (k >= 1) stage.fxLayer.remove(coin); },
    });
    sparks(stage, shooter, { count: 40, color: '#ffd27a', speed: 6, dir: dir.clone().negate() });
    audio.sfx('beam');
  });

  later(stage, 760, () => {
    hit(fx, { power: 1.3, color: orange, smokeColor: '#4a4a55' });
    arcs(stage, target, { count: 10 * mul, radius: 1.5 * scale, color: '#bfe8ff', life: 0.6, width: 0.04 });
    emit(stage, { pos: target, count: 120 * mul, color: orange, color2: '#fff1c8', speed: 8 * scale, drag: 2, life: 0.5, size: 0.28 });
    ring(stage, pos, { color: orange, radius: 2.3 * scale, life: 0.5, width: 0.16 });
    audio.sfx('thunder', { gain: 0.8 });
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.12 });
  });
  // 餘電
  later(stage, 1200, () => arcs(stage, target, { count: 5, radius: 1.0, color: '#9fd8ff', life: 0.4 }));
}
