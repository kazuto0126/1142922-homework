// 0 綠谷出久：デトロイト・スマッシュ（原創抽象造型）—— 棋盤外半空中，一個巨大的能量拳被綠色閃電纏繞、蓄力
// → 一拳打出：拳風化成巨大的錐形氣壓，橫掃過整個棋盤 → 一圈圈衝擊波、煙塵被整片吹飛、綠色電弧在棋盤上亂竄。
import * as THREE from 'three';
import { emit, ring, flash, arcs, bolt, spawn, later, residue, rand, easeIn, easeOut } from '../common.js';
import { hit, energyMaterial, smoke, sparks, debris } from '../realism.js';
import { makeFist } from '../models.js';

let fistMat = null;
function greenFistMaterial() {
  if (!fistMat) {
    fistMat = new THREE.MeshPhysicalMaterial({ color: '#d8ffe6', emissive: '#2bff7a', emissiveIntensity: 0.9, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 0.5 });
    fistMat.userData.shared = true;
  }
  return fistMat;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const green = '#3cff8a';
  // 拳頭在棋盤外右側的半空中，朝格子打過來
  const origin = pos.clone().add(new THREE.Vector3(6.5, 2.4, 2.2));
  const target = pos.clone().setY(pos.y + 0.6);
  const dir = target.clone().sub(origin).normalize();
  // 運鏡：從能量拳背後越過拳頭看向棋盤 → 出拳時鏡頭往前衝 → 拉高看拳風
  fx.shot([
    { at: 0.35, pos: origin.clone().addScaledVector(dir, -4.2).add(new THREE.Vector3(0, 1.3, 0)), target: target.clone() },
    { at: 0.52, pos: origin.clone().addScaledVector(dir, -4.6).add(new THREE.Vector3(0, 1.5, 0)), target: target.clone() },
    { at: 0.66, pos: origin.clone().addScaledVector(dir, 1.5).add(new THREE.Vector3(0, 1.4, 0)), target: target.clone() },
    { at: 1, pos: pos.clone().add(new THREE.Vector3(0, 8, 8)), target: pos.clone() },
  ], 1900);

  const fist = makeFist(greenFistMaterial(), { arm: 0 }); // 只有浮空的能量拳，不拖手臂
  fist.traverse(o => { if (o.geometry) o.geometry.userData.shared = false; });
  fist.position.copy(origin);
  fist.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  fist.scale.setScalar(0.001);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), energyMaterial(stage, { c1: '#c8ffd8', c2: '#10c050', scroll: 4, scale: [5, 5], fresnel: 1.8, threshold: 0.36, opacity: 0.45 }));
  aura.scale.set(1.2, 1.1, 1.2);
  fist.add(aura);
  stage.fxLayer.add(fist);

  // ① 能量拳出現、綠色閃電越纏越多（0 ~ 0.9 秒）
  audio.sfx('charge', { pitch: 0.8 });
  spawn(stage, new THREE.Group(), {
    life: 0.9,
    update(k) {
      fist.scale.setScalar(Math.max(0.001, easeOut(Math.min(1, k * 3)) * 1.5 * scale));
      fist.position.copy(origin).addScaledVector(dir, -k * 1.2); // 往後拉、蓄力
      fist.position.x += rand(-0.03, 0.03) * k; fist.position.y += rand(-0.03, 0.03) * k;
    },
  });
  for (let i = 0; i < 7; i++) {
    later(stage, 80 + i * 110, () => {
      arcs(stage, fist.position, { count: 2 + i, radius: 1.2 + i * 0.12, color: green, life: 0.25, width: 0.035 });
      audio.sfx('thunder', { pitch: 1.6 - i * 0.07, gain: 0.25 + i * 0.03 });
    });
  }

  // ② 出拳：拳頭衝向格子上方停住，拳風化成錐形氣壓往前橫掃
  later(stage, 900, () => {
    audio.sfx('whoosh', { pitch: 0.6 });
    const from = fist.position.clone();
    const stop = target.clone().addScaledVector(dir, -2.0);
    spawn(stage, new THREE.Group(), {
      life: 0.16,
      update(k) { fist.position.lerpVectors(from, stop, easeIn(k)); },
    });
  });
  later(stage, 1060, () => {
    // 巨大的錐形氣壓：從拳頭往前張開，掃過整個棋盤
    const len = 12;
    const coneMat = energyMaterial(stage, { c1: '#ffffff', c2: '#3cff8a', scroll: -10, scale: [10, 4], fresnel: 0.8, threshold: 0.3, fadeV: 0.12, opacity: 0.8, twist: 0.5 });
    const cone = new THREE.ConeGeometry(5.5 * scale, len, 48, 1, true);
    cone.translate(0, -len / 2, 0);
    const blast = new THREE.Mesh(cone, coneMat);
    blast.position.copy(fist.position);
    blast.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    spawn(stage, blast, {
      life: 0.75,
      update(k) {
        const g = easeOut(Math.min(1, k / 0.3));
        blast.scale.set(0.2 + 0.8 * g, Math.max(0.01, g), 0.2 + 0.8 * g);
        coneMat.uniforms.uOpacity.value = 0.8 * (k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6);
      },
    });
    hit(fx, { power: 1.6, color: green, smokeColor: '#d8e0d8', debrisColor: '#4a5a4a', at: target.clone() });
    debris(stage, pos.clone().setY(0.3), { count: 30, color: '#4a5a4a', power: 1.6 });
    flash(stage, target, { color: '#7fffb0', intensity: 50, distance: 14, life: 0.5 });
    audio.sfx('explode', { pitch: 0.8 });
    audio.sfx('impact', { pitch: 0.5 });
    // 一圈圈擴散到整個棋盤的衝擊波
    for (let i = 0; i < 4; i++) ring(stage, pos, { color: i % 2 ? '#ffffff' : green, radius: (3 + i * 1.6) * scale, life: 0.55 + i * 0.1, width: 0.1, y: 0.15 + i * 0.1, delay: i * 0.07 });
    // 整片煙塵沿著拳風的方向被吹飛
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Vector3(rand(-4, 4), 0.3, rand(-4, 4));
      smoke(stage, p, { count: 4, color: '#e8efe8', size: 1.4, life: 1.0, speed: 2.5, alpha: 0.45, radius: 0.4 });
      emit(stage, { pos: p, count: 10 * mul, color: '#ffffff', color2: green, shape: 'cone', dir: dir.clone().setY(0.15), angle: 0.4, speed: 9, drag: 1.2, life: 0.6, size: 0.18 });
    }
    // 綠色電弧在棋盤上亂竄
    for (let w = 0; w < 5; w++) {
      later(stage, 60 + w * 120, () => {
        const a = new THREE.Vector3(rand(-4, 4), rand(0.2, 0.6), rand(-4, 4)), b = new THREE.Vector3(rand(-4, 4), rand(0.2, 0.6), rand(-4, 4));
        bolt(stage, a, b, { color: green, width: 0.04, life: 0.22, segments: 10, jag: 0.5 });
      });
    }
    // 拳頭收回、淡出
    spawn(stage, new THREE.Group(), {
      life: 0.5,
      update(k) {
        fist.position.addScaledVector(dir, -0.15);
        aura.material.uniforms.uOpacity.value = 0.45 * (1 - k);
        fistMat.opacity = 0.88 * (1 - k);
        if (k >= 1) {
          if (fist.parent) fist.parent.remove(fist);
          fist.traverse(o => { if (o.geometry) o.geometry.dispose(); });
          aura.material.dispose();
          fistMat.opacity = 0.88;
        }
      },
    });
    later(stage, 200, () => sparks(stage, target, { count: 60 * mul, color: '#bfffd6', speed: 9 }));
    residue(fx, { delay: 0.3 });
  });
}
