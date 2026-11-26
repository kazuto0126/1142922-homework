// 7 桐谷和人：スターバースト・ストリーム —— 黑、白兩把劍現身 → 輪流揮出 16 連斬（每一擊都有刀光殘影）→ 最後交叉一擊。
import * as THREE from 'three';
import { emit, ring, spawn, glowMat, later, residue, rand, easeOut } from '../common.js';
import { hit, sparks } from '../realism.js';
import { makeSword } from '../models.js';

function trail(stage, center, angle, color, len) {
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.quadraticCurveTo(0, 0.14, len / 2, 0);
  shape.quadraticCurveTo(0, -0.05, -len / 2, 0);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), glowMat(color, 0.75));
  m.position.copy(center);
  m.lookAt(stage.camera.position);
  m.rotateZ(angle);
  return spawn(stage, m, {
    life: 0.22,
    update(k) {
      m.scale.set(Math.min(1, k * 5), 1, 1);
      m.material.opacity = 0.75 * (k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7);
    },
  });
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const center = pos.clone().setY(pos.y + 0.9);
  const swords = [makeSword(true), makeSword(false)];
  const home = [new THREE.Vector3(-0.9, 1.4, 0.3), new THREE.Vector3(0.9, 1.4, 0.3)];
  swords.forEach((sw, i) => {
    sw.scale.setScalar(0.001);
    sw.position.copy(center).add(home[i]);
    stage.fxLayer.add(sw);
  });
  audio.sfx('sparkle', { pitch: 0.8 });

  // 雙劍現身
  spawn(stage, new THREE.Group(), {
    life: 0.3,
    update(k) { swords.forEach((sw, i) => { sw.scale.setScalar(Math.max(0.001, easeOut(k) * 0.9 * scale)); sw.rotation.z = (i ? -1 : 1) * (0.6 + k); }); },
  });

  // 16 連擊：兩把劍輪流從一側揮到另一側
  const N = 16;
  for (let i = 0; i < N; i++) {
    later(stage, 300 + i * 80, () => {
      const sw = swords[i % 2];
      const a = rand(0, Math.PI);
      const from = center.clone().add(new THREE.Vector3(Math.cos(a) * 1.1, Math.sin(a) * 0.6 + 0.2, 0.3));
      const to = center.clone().add(new THREE.Vector3(-Math.cos(a) * 1.1, -Math.sin(a) * 0.6 + 0.2, 0.3));
      spawn(stage, new THREE.Group(), {
        life: 0.075,
        update(k) {
          sw.position.lerpVectors(from, to, k);
          sw.rotation.z = a + Math.PI / 2 + (k - 0.5) * 2.2;
        },
      });
      trail(stage, center.clone().add(new THREE.Vector3(rand(-0.2, 0.2), rand(-0.2, 0.2), 0)), a, i % 2 ? '#9fe6ff' : '#3a62ff', rand(1.6, 2.2) * scale);
      sparks(stage, center, { count: 10 * mul, color: i % 2 ? '#cff4ff' : '#6b8cff', speed: 6 });
      if (i % 4 === 3) stage.impact(fx.cell, 0.35);
      audio.sfx('slash', { pitch: 0.8 + i * 0.04, gain: 0.6 });
    });
  }

  // 最後一擊：雙劍交叉劈下
  later(stage, 300 + N * 80 + 80, () => {
    trail(stage, center, Math.PI / 4, '#cfefff', 3.2 * scale);
    trail(stage, center, -Math.PI / 4, '#4a78ff', 3.2 * scale);
    hit(fx, { power: 1.2, color: '#9be7ff', scorched: false, debrisColor: '#4a4f60' });
    emit(stage, { pos: center, count: 100 * mul, color: '#ffffff', color2: fx.color, speed: 7 * scale, life: 0.5, size: 0.3 });
    ring(stage, pos, { color: fx.color, radius: 2.2 * scale, life: 0.5, width: 0.16 });
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.1 });
    // 雙劍淡出
    spawn(stage, new THREE.Group(), {
      life: 0.4,
      update(k) {
        swords.forEach(sw => sw.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 1 - k; } }));
        if (k >= 1) swords.forEach(sw => stage.fxLayer.remove(sw));
      },
    });
  });
}
