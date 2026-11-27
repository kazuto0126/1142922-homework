// 7 桐谷和人：スターバースト・ストリーム —— 黑、白兩把劍現身 → 輪流揮出 16 連斬（每一擊都有刀光殘影，
// 並甩出一道立體的劍氣往四面八方飛出去，可以飛出棋盤）→ 最後交叉一擊，一圈劍氣同時炸開飛散。
import * as THREE from 'three';
import { emit, ring, spawn, glowMat, later, residue, rand, easeOut } from '../common.js';
import { hit, sparks, energyMaterial } from '../realism.js';
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

/**
 * 立體劍氣：有厚度的新月形（外層流動能量 + 白熱核心），沿 dir 飛出去、邊飛邊旋轉變大、最後淡掉。
 * 會飛出棋盤；沿路留下火花。
 */
let crescentGeo = null; // 所有劍氣共用一個幾何（只建立一次）
function crescentGeometry() {
  if (crescentGeo) return crescentGeo;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 1, Math.PI * 0.12, Math.PI * 0.88, false);
  shape.absarc(0, -0.38, 0.86, Math.PI * 0.86, Math.PI * 0.14, true);
  crescentGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 24 });
  crescentGeo.center();
  crescentGeo.userData.shared = true;
  return crescentGeo;
}

function flyingCrescent(stage, origin, dir, color, size = 1, speed = 13) {
  const geo = crescentGeometry();
  const g = new THREE.Group();
  const outer = new THREE.Mesh(geo, energyMaterial(stage, { c1: '#ffffff', c2: color, scroll: 6, scale: [3, 2], fresnel: 1.4, threshold: 0.15, opacity: 1 }));
  const core = new THREE.Mesh(geo, glowMat('#eaf8ff', 0.9));
  core.scale.set(0.82, 0.55, 0.5);
  g.add(outer, core);
  g.position.copy(origin);
  // 新月的弧面朝前進方向，並隨機繞前進方向轉一個角度
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.rotateY(rand(0, Math.PI * 2));
  const roll = rand(-6, 6);
  const v = dir.clone().normalize().multiplyScalar(speed);
  let acc = 0;
  return spawn(stage, g, {
    life: 1.05,
    update(k, _o, dt) {
      g.position.addScaledVector(v, dt);
      g.rotateY(roll * dt);
      g.scale.setScalar(size * (0.5 + k * 1.4));
      const a = k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 1.6);
      outer.material.uniforms.uOpacity.value = a;
      core.material.opacity = 0.9 * a;
      acc += dt;
      if (acc > 0.05 && k < 0.7) { acc = 0; sparks(stage, g.position, { count: 3, color, speed: 2.5, life: 0.35, gravity: -2 }); }
    },
  });
}

/** 隨機的飛行方向：主要往水平四面八方，帶一點上下。 */
function randomDir() {
  const a = rand(0, Math.PI * 2);
  return new THREE.Vector3(Math.cos(a), rand(-0.15, 0.45), Math.sin(a)).normalize();
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const center = pos.clone().setY(pos.y + 0.9);
  // 運鏡：繞著雙劍慢慢轉 → 最後一圈劍氣炸開時拉遠
  const orbitAt = (a, r, y) => pos.clone().add(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
  fx.shot([
    { at: 0.25, pos: orbitAt(0.4, 5.5, 2.2), target: center.clone() },
    { at: 0.5, pos: orbitAt(1.4, 5.2, 2.0), target: center.clone() },
    { at: 0.75, pos: orbitAt(2.4, 5.5, 2.4), target: center.clone() },
    { at: 1, pos: pos.clone().add(new THREE.Vector3(0, 9, 13)), target: pos.clone() },
  ], 2400);
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
      // 每一斬都甩出一道立體劍氣，飛向四面八方
      flyingCrescent(stage, center.clone(), randomDir(), i % 2 ? '#7fd8ff' : '#3a62ff', 0.75 * scale, rand(11, 16));
      sparks(stage, center, { count: 10 * mul, color: i % 2 ? '#cff4ff' : '#6b8cff', speed: 6 });
      if (i % 4 === 3) stage.impact(fx.cell, 0.35);
      audio.sfx('slash', { pitch: 0.8 + i * 0.04, gain: 0.6 });
    });
  }

  // 最後一擊：雙劍交叉劈下
  later(stage, 300 + N * 80 + 80, () => {
    trail(stage, center, Math.PI / 4, '#cfefff', 3.2 * scale);
    trail(stage, center, -Math.PI / 4, '#4a78ff', 3.2 * scale);
    // 一圈劍氣同時往外炸開，飛出棋盤
    const n = 14;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      flyingCrescent(stage, center.clone(), new THREE.Vector3(Math.cos(a), j % 2 ? 0.25 : -0.05, Math.sin(a)).normalize(), j % 2 ? '#bfefff' : '#4a78ff', 1.1 * scale, 15);
    }
    audio.sfx('whoosh', { pitch: 1.3 });
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
