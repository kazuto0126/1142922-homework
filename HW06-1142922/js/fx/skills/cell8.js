// 8 黑崎一護：月牙十字（原創抽象造型）—— 半空中先橫劃出一道黑芯紅邊的劍氣、停住，
// 再直劈出第二道，兩道合成一個巨大的十字 → 十字整個劈到棋盤上 → 十字形的裂痕、黑紅火焰。
import * as THREE from 'three';
import { emit, ring, flash, spawn, later, residue, rand, easeIn, easeOut } from '../common.js';
import { hit, energyMaterial, sparks, debris, smoke } from '../realism.js';

/** 一道直線劍氣：外層紅色流動能量、中間黑色的芯、兩端收尖。長軸沿 x。 */
function slashBar(stage, length, width) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const L = length / 2, W = width / 2;
  shape.moveTo(-L, 0);
  shape.quadraticCurveTo(-L * 0.4, W, 0, W * 1.1);
  shape.quadraticCurveTo(L * 0.4, W, L, 0);
  shape.quadraticCurveTo(L * 0.4, -W, 0, -W * 1.1);
  shape.quadraticCurveTo(-L * 0.4, -W, -L, 0);
  const geo = new THREE.ShapeGeometry(shape, 24);
  const red = new THREE.Mesh(geo, energyMaterial(stage, { c1: '#ffb0b8', c2: '#b00018', scroll: 8, scale: [14, 2], fresnel: 0.3, threshold: 0.14 }));
  const black = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#0a0004', transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
  black.scale.set(0.9, 0.5, 1);
  black.position.z = 0.01;
  g.add(red, black);
  g.userData = { red, black };
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const s = 1.25 * scale;
  // 十字在格子正上方、面向鏡頭的半空中形成
  const center = pos.clone().setY(pos.y + 3.4);
  const cross = new THREE.Group();
  cross.position.copy(center);
  const camFlat = stage.camera.position.clone().setY(center.y);
  cross.lookAt(camFlat);
  stage.fxLayer.add(cross);

  const horiz = slashBar(stage, 5.2 * s, 0.9 * s);
  const vert = slashBar(stage, 5.2 * s, 0.9 * s);
  vert.rotation.z = Math.PI / 2;
  horiz.scale.set(0.001, 1, 1);
  vert.scale.set(0.001, 1, 1);
  cross.add(horiz, vert);

  // ① 橫劃（從左到右展開）
  later(stage, 120, () => {
    audio.sfx('slash', { pitch: 0.7, gain: 1 });
    spawn(stage, new THREE.Group(), { life: 0.16, update(k) { horiz.scale.set(Math.max(0.001, easeOut(k)), 1, 1); } });
    sparks(stage, center, { count: 30 * mul, color: '#ff6070', speed: 7 });
  });
  // ② 直劈（從上到下展開）→ 合成十字
  later(stage, 520, () => {
    audio.sfx('slash', { pitch: 0.55, gain: 1 });
    spawn(stage, new THREE.Group(), { life: 0.16, update(k) { vert.scale.set(Math.max(0.001, easeOut(k)), 1, 1); } });
    flash(stage, center, { color: '#ff2030', intensity: 30, distance: 10, life: 0.4 });
    ring(stage, center, { color: '#ff3347', radius: 3.2 * s, life: 0.4, width: 0.06, y: 0, tilt: cross.quaternion.clone() });
    audio.sfx('charge', { pitch: 0.5 });
  });
  // 十字成形後在空中微微震動、能量翻湧
  spawn(stage, new THREE.Group(), {
    life: 1.0,
    update(k) {
      if (k > 0.55) cross.position.copy(center).add(new THREE.Vector3(rand(-0.04, 0.04), rand(-0.04, 0.04), 0));
      if (k > 0.6 && Math.random() < 0.4) emit(stage, { pos: cross.position, count: 4, color: '#ff3347', color2: '#1a0004', speed: 3, life: 0.4, size: 0.3, radius: 1.5 });
    },
  });

  // ③ 十字整個劈到棋盤上：往下、往前倒下貼地
  later(stage, 1000, () => {
    audio.sfx('whoosh', { pitch: 0.6 });
    const from = center.clone();
    const to = pos.clone().setY(0.25);
    const q0 = cross.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, cross.rotation.y + Math.PI / 4));
    spawn(stage, new THREE.Group(), {
      life: 0.22,
      update(k) {
        const e = easeIn(k);
        cross.position.lerpVectors(from, to, e);
        cross.quaternion.slerpQuaternions(q0, q1, e);
        cross.scale.setScalar(1 + e * 0.25);
      },
    });
  });
  later(stage, 1220, () => {
    hit(fx, { power: 1.5, color: '#ff2030', smokeColor: '#1a0a0c', debrisColor: '#2a1a1c' });
    debris(stage, pos.clone().setY(0.3), { count: 24, color: '#2a1a1c', power: 1.3 });
    audio.sfx('explode', { pitch: 0.7 });
    audio.sfx('impact', { pitch: 0.5 });
    // 十字形的裂痕：沿四個方向的黑紅火焰帶
    const crack = new THREE.Group();
    crack.position.set(pos.x, 0.14, pos.z);
    crack.rotation.y = cross.rotation.y + Math.PI / 4;
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(5.2 * s, 0.4 * s), energyMaterial(stage, { c1: '#ff8090', c2: '#5a0008', scroll: 4, scale: [10, 1], fresnel: 0, threshold: 0.2, opacity: 0.9 }));
      bar.rotation.set(-Math.PI / 2, 0, i * Math.PI / 2);
      crack.add(bar);
    }
    spawn(stage, crack, {
      life: 1.8,
      update(k) { crack.children.forEach(b => { b.material.uniforms.uOpacity.value = 0.9 * (k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5); }); },
    });
    // 沿裂痕冒出的黑紅火焰
    for (let j = 0; j < 4; j++) {
      const a = crack.rotation.y + j * Math.PI / 2;
      for (let d = 0.6; d <= 2.4 * s; d += 0.6) {
        const p = pos.clone().add(new THREE.Vector3(Math.cos(a) * d, 0.2, -Math.sin(a) * d));
        later(stage, d * 60, () => emit(stage, { pos: p, count: 10 * mul, color: '#ff3347', color2: '#1a0004', shape: 'up', angle: 0.35, speed: 2.5, gravity: 2, drag: 0.7, life: 0.9, size: 0.4 }));
      }
    }
    // 十字淡出
    spawn(stage, new THREE.Group(), {
      life: 0.35,
      update(k) {
        for (const bar of [horiz, vert]) {
          bar.userData.red.material.uniforms.uOpacity.value = 1 - k;
          bar.userData.black.material.opacity = 0.92 * (1 - k);
        }
        if (k >= 1 && cross.parent) cross.parent.remove(cross);
      },
    });
    later(stage, 300, () => smoke(stage, pos.clone().setY(0.2), { count: 16, color: '#1a0a0c', size: 1.8, life: 1.6, speed: 1.2 }));
    residue(fx, { delay: 0.2 });
  });
}
