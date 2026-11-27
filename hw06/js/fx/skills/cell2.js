// 2 艾連：巨人化（原創抽象造型）—— 天空打下一道黃色落雷到棋盤邊、爆炸與蒸氣 →
// 一隻巨大的手臂從棋盤外的邊緣竄起、高舉，再一掌拍在格子上 → 高溫蒸氣蓋滿整個棋盤。
import * as THREE from 'three';
import { emit, ring, flash, bolt, orb, spawn, later, residue, rand, easeOut, easeIn } from '../common.js';
import { hit, smoke, debris } from '../realism.js';
import { makeTitanArm } from '../models.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const gold = fx.color;
  // 落雷與手臂竄出的位置：棋盤外的後方邊緣（靠近這一格的方向）
  const side = new THREE.Vector3(Math.sign(pos.x) || 1, 0, -1).normalize();
  const base = pos.clone().add(side.clone().multiplyScalar(5.5)).setY(-2.5);
  const strike = base.clone().setY(0.2);
  // 運鏡：低角度仰拍巨臂竄起 → 拍下時鏡頭跟著下沉、震動 → 拉遠看蒸氣
  const lookArm = base.clone().setY(4.5);
  fx.shot([
    { at: 0.25, pos: pos.clone().addScaledVector(side, -3.5).add(new THREE.Vector3(0, 0.6, 3)), target: lookArm },
    { at: 0.45, pos: pos.clone().addScaledVector(side, -3.2).add(new THREE.Vector3(0, 0.8, 3.2)), target: lookArm },
    { at: 0.6, pos: pos.clone().addScaledVector(side, -3).add(new THREE.Vector3(0, 2.4, 3.4)), target: pos.clone() },
    { at: 1, pos: pos.clone().add(new THREE.Vector3(0, 7, 8)), target: pos.clone() },
  ], 2100);

  // ① 落雷 + 爆炸 + 蒸氣
  bolt(stage, strike.clone().setY(14), strike, { color: '#ffe14a', width: 0.22 * scale, life: 0.45, segments: 18, jag: 0.7 });
  bolt(stage, strike.clone().add(new THREE.Vector3(1, 12, -0.6)), strike, { color: '#fff6c0', width: 0.1, life: 0.4, delay: 0.06, segments: 14, jag: 0.6 });
  flash(stage, strike, { color: '#ffe14a', intensity: 70, life: 0.5, distance: 18 });
  audio.sfx('thunder');
  later(stage, 150, () => {
    orb(stage, strike.clone().setY(1), { color: '#ff9a3a', grow: [0.3, 3.2 * scale], life: 0.55, opacity: [0.75, 0] });
    smoke(stage, strike, { count: 36 * mul, color: '#f2ece4', size: 2.8, life: 2.2, speed: 3.2, alpha: 0.6, radius: 1.2 });
    stage.impact(fx.cell, 0.7);
    audio.sfx('explode', { pitch: 0.7 });
  });

  // ② 巨大的手臂從邊緣竄起 → 高舉 → 一掌拍下
  const arm = makeTitanArm();
  const s = 1.55 * scale;
  arm.scale.setScalar(s);
  arm.position.copy(base);
  stage.fxLayer.add(arm);
  // 手臂整體繞著根部轉：先直立往上，再往格子方向倒下拍擊
  const toCell = pos.clone().sub(base).setY(0).normalize();
  const tiltAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCell).normalize();
  const qUp = new THREE.Quaternion();
  const qSlam = new THREE.Quaternion().setFromAxisAngle(tiltAxis, Math.PI * 0.47);
  const qPalm = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(toCell.x, toCell.z) + Math.PI);
  let steamAcc = 0;
  later(stage, 250, () => audio.sfx('wind', { pitch: 0.5 }));
  spawn(stage, new THREE.Group(), {
    life: 2.1,
    update(k, _o, dt) {
      const t = k * 2100;
      let rise = 1, q = qUp;
      if (t < 550) rise = easeOut(t / 550);                                   // 竄起
      else if (t < 900) rise = 1;                                              // 高舉、停一下
      else if (t < 1150) q = qUp.clone().slerp(qSlam, easeIn((t - 900) / 250)); // 拍下
      else if (t < 1650) q = qSlam;                                            // 壓在格子上
      else { q = qSlam.clone().slerp(qUp, (t - 1650) / 450); rise = 1 - easeIn((t - 1650) / 450); } // 收回、沉下去
      arm.position.copy(base).setY(base.y - (1 - rise) * 6);
      arm.quaternion.copy(q).multiply(qPalm);
      // 一直冒蒸氣
      steamAcc += dt;
      if (steamAcc > 0.1) {
        steamAcc = 0;
        const top = new THREE.Vector3(0, 3.4 * s, 0).applyQuaternion(arm.quaternion).add(arm.position);
        smoke(stage, top, { count: 3, color: '#f4eee8', size: 1.6, life: 1.2, speed: 0.9, alpha: 0.4, radius: 0.6 });
      }
      if (k >= 1 && arm.parent) {
        arm.parent.remove(arm);
        arm.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      }
    },
  });

  // ③ 拍下的瞬間：命中 + 高溫蒸氣蓋滿整個棋盤
  later(stage, 1150, () => {
    hit(fx, { power: 1.7, color: '#ffd04a', smokeColor: '#e8e0d6', debrisColor: '#7a5b45' });
    debris(stage, pos.clone().setY(0.3), { count: 34, color: '#7a5b45', power: 1.6 });
    ring(stage, pos, { color: gold, radius: 4.2 * scale, life: 0.6, width: 0.16 });
    audio.sfx('impact', { pitch: 0.45 });
    audio.sfx('explode', { pitch: 0.6 });
    for (let w = 0; w < 5; w++) {
      later(stage, w * 140, () => {
        for (let i = 0; i < 8; i++) smoke(stage, new THREE.Vector3(rand(-4.2, 4.2), 0.25, rand(-4.2, 4.2)), { count: 3, color: '#f6f1ea', size: 2.4, life: 1.8, speed: 1.2, alpha: 0.5, radius: 0.5 });
        emit(stage, { pos: pos.clone().setY(0.3), count: 20 * mul, color: '#fff1c2', color2: '#ffb347', shape: 'up', angle: 0.9, speed: 3, gravity: 1, drag: 0.8, life: 0.9, size: 0.3, radius: 2.5 });
      });
    }
    residue(fx, { delay: 0.4 });
  });
}
