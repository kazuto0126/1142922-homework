// 0 綠谷出久：デトロイト・スマッシュ —— 綠色電弧纏身 → 一拳打出錐形衝擊波 → 地面放射狀裂紋 + 氣浪環。
import * as THREE from 'three';
import { emit, ring, flash, arcs, spawn, glowMat, later, residue, rand, easeOut } from '../common.js';
import { hit, energyMaterial } from '../realism.js';

export default function (fx) {
  const { stage, pos, pal, audio, mul, scale } = fx;
  const c = fx.color;
  const fist = pos.clone().setY(pos.y + 1.6 * scale);

  // 蓄力：綠色電弧 + 往上竄的火花
  arcs(stage, fist, { count: 6 * mul, radius: 0.9 * scale, color: '#7dffa8', life: 0.35 });
  emit(stage, { pos: fist, count: 30 * mul, color: '#c8ffd9', color2: c, speed: 2.5, life: 0.35, size: 0.18 });
  audio.sfx('charge', { pitch: 1.2 });

  later(stage, 250, () => {
    // 錐形衝擊波（從拳頭往下打）
    const coneMat = energyMaterial(stage, { c1: '#eafff0', c2: '#' + c.getHexString(), scroll: -6, scale: [6, 3], fresnel: 0.8, threshold: 0.3, fadeV: 0.15 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 40, 1, true), coneMat);
    cone.position.copy(fist).setY(fist.y - 0.8);
    spawn(stage, cone, {
      life: 0.35,
      update(k) {
        const s = 0.2 + easeOut(k) * 1.4 * scale;
        cone.scale.set(s, 1 + k * 0.4, s);
        coneMat.uniforms.uOpacity.value = 1 - k;
      },
    });
    emit(stage, { pos: fist, count: 120 * mul, color: c, color2: '#ffffff', shape: 'cone', dir: new THREE.Vector3(0, -1, 0), angle: 0.6, speed: 9 * scale, life: 0.45, size: 0.3 });

    // 地面裂紋：放射狀發光細線
    const cracks = new THREE.Group();
    const n = Math.round(10 * mul);
    for (let i = 0; i < n; i++) {
      const len = rand(0.7, 1.3) * scale;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.05), glowMat('#b6ffcd', 1));
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      m.position.set(Math.cos(a) * len / 2, 0, Math.sin(a) * len / 2);
      m.rotation.y = -a;
      cracks.add(m);
    }
    cracks.position.copy(pos).setY(pos.y + 0.03);
    spawn(stage, cracks, {
      life: 0.8,
      update(k) {
        cracks.scale.setScalar(Math.min(1, k * 4));
        cracks.children.forEach(m => { m.material.opacity = 1 - k; });
      },
    });

    ring(stage, pos, { color: c, radius: 2.4 * scale, life: 0.5, width: 0.25 });
    ring(stage, pos, { color: '#ffffff', radius: 1.6 * scale, life: 0.4, width: 0.1, delay: 0.05, y: 0.4 });
    emit(stage, { pos: pos.clone().setY(pos.y + 0.2), count: 70 * mul, color: '#ddffe8', color2: c, shape: 'ring', speed: 7 * scale, drag: 2.5, life: 0.6, size: 0.35 });
    hit(fx, { power: 1.1, debrisColor: '#6d6a60' });
    audio.sfx('impact');
    audio.sfx('wind', { delay: 0.05 });
    residue(fx, { delay: 0.15 });
  });
}
