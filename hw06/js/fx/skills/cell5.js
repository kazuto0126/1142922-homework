// 5 御坂美琴：超電磁砲 —— 半透明的電光手（抽象造型）用拇指把硬幣彈上去 → 硬幣高速翻轉、電弧越聚越多
// → 落回指尖的瞬間發射：橘色光束外面纏繞藍白閃電，硬幣跟著光束飛出去，一路貫穿格子上方、射出棋盤。
import * as THREE from 'three';
import { emit, ring, arcs, bolt, spawn, glowMat, later, residue, rand, easeOut } from '../common.js';
import { hit, energyMaterial, sparks } from '../realism.js';
import { makeCoin } from '../models.js';
import { stormField } from '../boardCover.js';

/** 抽象的電光手：手掌 + 四根彎起的手指 + 可以動的拇指。回傳 { group, thumb }。 */
function makeElectricHand(stage) {
  const skin = energyMaterial(stage, { c1: '#e8f6ff', c2: '#2f7dff', scroll: 3, scale: [3, 3], fresnel: 1.6, threshold: 0.3, opacity: 0.85 });
  const group = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.55, 2, 2, 2), skin);
  group.add(palm);
  // 四根彎起來的手指（握拳狀）
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 10), skin);
    f.position.set(-0.18 + i * 0.12, -0.06, 0.32);
    f.rotation.x = 1.9;
    group.add(f);
  }
  // 拇指：繞著根部轉動，把硬幣彈出去
  const thumbPivot = new THREE.Group();
  thumbPivot.position.set(0.26, 0.02, 0.18);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.26, 4, 10), skin);
  thumb.position.set(0, 0.16, 0);
  thumbPivot.add(thumb);
  thumbPivot.rotation.z = -1.1; // 一開始壓在食指下面蓄力
  group.add(thumbPivot);
  return { group, thumb: thumbPivot, skin };
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const orange = fx.color;
  // 發射位置：棋盤右前方的半空中；光束穿過格子上方，一路往前射出去
  const shooter = pos.clone().add(new THREE.Vector3(4.2, 1.5, 1.2));
  const target = pos.clone().setY(pos.y + 0.6);
  const dir = target.clone().sub(shooter).normalize();
  const reach = 17;
  const end = shooter.clone().addScaledVector(dir, reach);

  // 電光手：面向目標
  const hand = makeElectricHand(stage);
  hand.group.position.copy(shooter).addScaledVector(dir, -0.55).add(new THREE.Vector3(0, -0.4, 0));
  hand.group.lookAt(target);
  hand.group.scale.setScalar(0.001);
  const coin = makeCoin();
  coin.scale.setScalar(2.6);
  const tip = shooter.clone();
  coin.position.copy(tip);
  stage.fxLayer.add(coin);

  let t = 0;
  // 手出現 → 拇指彈出 → 硬幣上升翻轉 → 落回指尖
  spawn(stage, hand.group, {
    life: 1.45,
    update(k, _o, dt) {
      t = k * 1450;
      hand.group.scale.setScalar(Math.max(0.001, easeOut(Math.min(1, t / 220)) * 2.1));
      // 拇指：0.25 秒時彈出去（-1.1 → 0.9），之後慢慢收回
      if (t < 250) hand.thumb.rotation.z = -1.1 - Math.sin(t / 250 * Math.PI) * 0.15;
      else if (t < 330) hand.thumb.rotation.z = -1.1 + (t - 250) / 80 * 2.0;
      else hand.thumb.rotation.z = 0.9 - Math.min(1, (t - 330) / 600) * 1.4;
      // 硬幣：彈起 → 高速翻轉 → 落回指尖
      if (t >= 250 && t < 1000) {
        const u = (t - 250) / 750;
        coin.position.copy(tip).add(new THREE.Vector3(0, Math.sin(u * Math.PI) * 1.9, 0));
        coin.rotation.x += dt * 34;
        coin.rotation.z += dt * 6;
      } else if (t >= 1000) {
        coin.position.copy(tip);
        coin.rotation.set(Math.PI / 2, 0, 0);
        coin.lookAt(target); // 硬幣正面對準目標
      }
      if (k > 0.85) hand.skin.uniforms.uOpacity.value = 0.85 * (1 - (k - 0.85) / 0.15);
    },
  });
  audio.sfx('sparkle', { pitch: 1.3 });
  later(stage, 250, () => {
    audio.sfx('click', { pitch: 1.6, gain: 1 }); // 彈硬幣的「叮」
    sparks(stage, tip, { count: 14, color: '#cfeaff', speed: 4, life: 0.3 });
  });

  // 充能：硬幣在空中時，周圍的閃電越來越密；手也跟著放電
  for (let i = 0; i < 7; i++) {
    later(stage, 300 + i * 100, () => {
      const c = coin.position.clone();
      arcs(stage, c, { count: 2 + i, radius: 0.45 + i * 0.07, color: '#bfe8ff', life: 0.28, width: 0.025 });
      arcs(stage, hand.group.position, { count: 1 + (i >> 1), radius: 0.6, color: '#7fc8ff', life: 0.25, width: 0.02 });
      audio.sfx('thunder', { pitch: 1.9 - i * 0.08, gain: 0.22 + i * 0.03 });
    });
  }
  // 落回指尖：最後一瞬間的集中放電
  later(stage, 980, () => {
    arcs(stage, tip, { count: 10 * mul, radius: 0.9, color: '#e6f6ff', life: 0.22, width: 0.035 });
    emit(stage, { pos: tip, count: 50 * mul, color: '#ffffff', color2: '#7fc8ff', speed: 5, life: 0.25, size: 0.2 });
  });

  // 發射
  later(stage, 1050, () => {
    // 光束：外層流動的橘色能量 + 白熱核心，從指尖一路射出棋盤
    const beamMat = energyMaterial(stage, { c1: '#ffd090', c2: '#ff5a00', scroll: 22, scale: [3, 26], fresnel: 1.2, threshold: 0.2, fadeV: 0.02 });
    const rail = new THREE.Group();
    const outerGeo = new THREE.CylinderGeometry(0.38 * scale, 0.38 * scale, reach, 32, 1, true);
    const coreGeo = new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, reach, 12, 1, true);
    rail.add(new THREE.Mesh(outerGeo, beamMat), new THREE.Mesh(coreGeo, glowMat('#fff4dc', 1)));
    rail.position.copy(shooter).add(end).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    spawn(stage, rail, {
      life: 1.0,
      update(k) {
        const w = k < 0.06 ? k / 0.06 : 1 - Math.pow((k - 0.06) / 0.94, 2);
        rail.scale.set(Math.max(0.001, w), 1, Math.max(0.001, w));
        beamMat.uniforms.uOpacity.value = w;
      },
    });
    // 纏繞光束的藍白閃電（好幾道，沿著光束、各自偏一點）
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const upv = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let j = 0; j < 4; j++) {
      const off = side.clone().multiplyScalar(rand(-0.5, 0.5)).addScaledVector(upv, rand(-0.5, 0.5));
      bolt(stage, shooter.clone().add(off), end.clone().add(off.multiplyScalar(2)), { color: j % 2 ? '#bfe8ff' : '#6fb0ff', width: 0.05 + j * 0.012, life: 0.55, delay: j * 0.04, segments: 18, jag: 0.5 });
    }
    // 沿著光束一圈圈擴散的衝擊環
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    for (let j = 0; j < 6; j++) {
      const p = shooter.clone().addScaledVector(dir, 1.5 + j * 2.4);
      ring(stage, p, { color: j % 2 ? '#ffd27a' : '#bfe8ff', radius: 1.1 + j * 0.15, life: 0.45, width: 0.08, y: 0, tilt, delay: j * 0.03 });
    }
    // 硬幣跟著光束飛出去
    spawn(stage, new THREE.Group(), {
      life: 0.3,
      update(k) { coin.position.lerpVectors(tip, end, easeOut(k)); if (k >= 1 && coin.parent) coin.parent.remove(coin); },
    });
    sparks(stage, tip, { count: 60, color: '#ffd27a', speed: 7, dir: dir.clone().negate() });
    stage.impact(fx.cell, 0.6);
    audio.sfx('beam');
    audio.sfx('thunder', { gain: 0.9 });
  });

  // 光束掠過格子上方：命中
  later(stage, 1110, () => {
    hit(fx, { power: 1.3, color: orange, smokeColor: '#4a4a55', at: target.clone() });
    // 電場：從這一格擴散蓋滿整個棋盤，閃電在格子之間亂竄
    stormField(stage, pos, { mul });
    arcs(stage, target, { count: 12 * mul, radius: 1.6 * scale, color: '#bfe8ff', life: 0.6, width: 0.04 });
    emit(stage, { pos: target, count: 120 * mul, color: orange, color2: '#fff1c8', speed: 8 * scale, drag: 2, life: 0.5, size: 0.28 });
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.12 });
  });
  // 餘電：光束消失後空氣中還劈啪作響
  for (let i = 0; i < 3; i++) later(stage, 1500 + i * 180, () => arcs(stage, shooter.clone().lerp(end, rand(0.15, 0.7)), { count: 3, radius: 0.8, color: '#9fd8ff', life: 0.35 }));
}
