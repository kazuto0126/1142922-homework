// 4 魯夫：橡膠拳連打（原創抽象造型）—— 雲霧與鼓聲 → 幾十個白色橡膠拳從棋盤外四面八方伸過來，
// 拉著長長的橡膠手臂，越打越快地瘋狂砸在格子和周圍 → 最後一記大拳收尾。
import * as THREE from 'three';
import { emit, ring, spawn, later, residue, rand, easeIn, easeOut } from '../common.js';
import { hit, smoke, debris, sparks } from '../realism.js';
import { makeFist, std } from '../models.js';

// 所有拳頭共用材質與幾何（只建立一次；連打幾十拳也不會卡）
let fistMat = null, fistTemplate = null, armGeo = null;
function material() {
  if (!fistMat) {
    fistMat = std('#f3ede2', { emissive: '#3a3020', ei: 0.2, rough: 0.5, sheen: 1, sheenColor: '#fff6e0', clearcoat: 0.3 });
    fistMat.userData.shared = true;
  }
  return fistMat;
}
function newFist() {
  if (!fistTemplate) {
    fistTemplate = makeFist(material(), { arm: 0 });
    fistTemplate.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; });
    armGeo = new THREE.CylinderGeometry(0.14, 0.16, 1, 10, 1, true);
    armGeo.userData.shared = true;
  }
  return fistTemplate.clone(); // clone 共用幾何與材質
}

/** 一記拳：從棋盤外的 from 伸長手臂、砸到 to，停一下再縮回。 */
function punch(stage, fx, from, to, { size = 0.55, dur = 0.34, power = 0.35, mul = 1, big = false } = {}) {
  const fist = newFist();
  const g = new THREE.Group();
  g.add(fist);
  // 橡膠手臂：一根從出發點拉到拳頭的圓柱（縮放長度）
  const arm = new THREE.Mesh(armGeo, material());
  g.add(arm);
  fist.scale.setScalar(size);
  const dir = to.clone().sub(from).normalize();
  // 拳面朝前進方向（拳頭模型的拳面朝 -y）
  fist.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const cur = new THREE.Vector3();
  let landed = false;
  spawn(stage, g, {
    life: dur,
    update(k) {
      // 0–45% 伸出去、45–60% 停在命中點、60–100% 縮回
      const e = k < 0.45 ? easeIn(k / 0.45) : k < 0.6 ? 1 : 1 - easeOut((k - 0.6) / 0.4);
      cur.lerpVectors(from, to, e);
      fist.position.copy(cur);
      const mid = from.clone().add(cur).multiplyScalar(0.5);
      const len = Math.max(0.01, from.distanceTo(cur));
      arm.position.copy(mid);
      arm.scale.set(size * 1.1, len, size * 1.1);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      if (!landed && k >= 0.45) {
        landed = true;
        stage.impact(fx.cell, power);
        ring(stage, to.clone().setY(0.1), { color: '#fff1c2', radius: big ? 3.2 : 1.1, life: 0.3, width: 0.12, y: 0.02 });
        emit(stage, { pos: to, count: (big ? 90 : 14) * mul, color: '#ffffff', color2: '#ffe27a', shape: 'ring', speed: big ? 10 : 5, drag: 2, life: 0.35, size: 0.22 });
        if (big || Math.random() < 0.35) debris(stage, to.clone().setY(0.25), { count: big ? 30 : 4, color: '#6a6258', power: big ? 1.5 : 0.6 });
      }
    },
  });
}

/** 棋盤外的出發點：四面八方、比棋盤高。 */
function originOutside() {
  const a = rand(0, Math.PI * 2);
  const r = rand(7.5, 10);
  return new THREE.Vector3(Math.cos(a) * r, rand(3, 6.5), Math.sin(a) * r);
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;

  // 雲霧 + 三下鼓聲
  smoke(stage, pos.clone().setY(0.4), { count: 24 * mul, color: '#f4f1ea', size: 1.8, life: 1.8, speed: 1.4, alpha: 0.45, radius: 1.2 });
  for (let i = 0; i < 3; i++) {
    later(stage, i * 140, () => {
      audio.sfx('impact', { pitch: 0.5, gain: 0.55 });
      ring(stage, pos, { color: '#ffffff', radius: 1 + i * 0.5, life: 0.35, width: 0.05, y: 0.25 });
    });
  }

  // 連打：越打越快，大部分砸在這一格，偶爾砸到旁邊
  const N = Math.round(30 * (fx.big ? 1.2 : 1));
  let t = 450;
  for (let i = 0; i < N; i++) {
    const delay = t;
    t += Math.max(32, 95 - i * 3.2);
    later(stage, delay, () => {
      const spread = Math.random() < 0.75 ? 1.0 : 2.6;
      const to = pos.clone().add(new THREE.Vector3(rand(-spread, spread), 0.35, rand(-spread, spread)));
      punch(stage, fx, originOutside(), to, { size: rand(0.45, 0.65) * scale, dur: rand(0.28, 0.36), power: 0.22, mul });
      if (i % 2 === 0) audio.sfx('impact', { pitch: rand(0.8, 1.3), gain: 0.45 });
      if (i % 5 === 0) audio.sfx('whoosh', { pitch: rand(1.2, 1.6), gain: 0.4 });
      if (i % 3 === 0) sparks(stage, to, { count: 8, color: '#ffffff', speed: 5, life: 0.3 });
    });
  }

  // 最後一記大拳：從正上方高處砸下
  later(stage, t + 80, () => {
    punch(stage, fx, pos.clone().add(new THREE.Vector3(0, 9, 3)), pos.clone().setY(0.6), { size: 1.25 * scale, dur: 0.5, power: 1.2, mul, big: true });
    audio.sfx('whoosh', { pitch: 0.5 });
  });
  later(stage, t + 80 + 230, () => {
    hit(fx, { power: 1.6, color: '#ffe27a', smokeColor: '#ece6da', debrisColor: '#8a7f6a' });
    audio.sfx('explode');
    audio.sfx('impact', { pitch: 0.6 });
    residue(fx, { delay: 0.2 });
  });
}
