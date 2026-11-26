// 4 魯夫：ゴムゴムの猿神銃（五檔）—— 白雲般的粒子湧出 + 鼓點 → 巨大拳頭從天而降砸下。
import * as THREE from 'three';
import { emit, ring, flash, spawn, solidMat, later, residue, easeIn } from '../common.js';

function makeGiantFist(scale) {
  const white = solidMat('#efe6d2', { emissive: '#4a3a14', emissiveIntensity: 0.45 });
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), white);
  fist.scale.set(1.15, 1, 1);
  g.add(fist);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 8, 10), white);
  arm.position.y = 4.6;
  g.add(arm);
  // 拳頭上的雲朵
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + Math.random() * 0.3, 0), white);
    const a = (i / 6) * Math.PI * 2;
    puff.position.set(Math.cos(a) * 1.0, 0.9 + Math.random() * 0.4, Math.sin(a) * 1.0);
    g.add(puff);
  }
  g.scale.setScalar(scale);
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const c = fx.color;

  // 雲朵湧出 + 三下鼓聲（解放の鼓動）
  emit(stage, { pos: pos.clone().setY(pos.y + 0.4), count: 40 * mul, color: '#ffffff', color2: '#fff1c2', shape: 'ring', speed: 2.2, drag: 1.2, gravity: 1.2, life: 1.1, size: 0.6, alpha: 0.4 });
  for (let i = 0; i < 3; i++) {
    later(stage, i * 110, () => {
      audio.sfx('impact', { pitch: 0.55, gain: 0.55 });
      ring(stage, pos, { color: '#ffffff', radius: 0.9 + i * 0.4, life: 0.3, width: 0.06, y: 0.25 });
    });
  }

  later(stage, 250, () => {
    const fist = makeGiantFist(0.8 * scale);
    const top = 10, bottom = pos.y + 0.9 * scale;
    fist.position.copy(pos).setY(top);
    audio.sfx('whoosh', { pitch: 0.6 });
    spawn(stage, fist, {
      life: 0.65,
      update(k) {
        if (k < 0.45) fist.position.y = top + (bottom - top) * easeIn(k / 0.45);
        else {
          fist.position.y = bottom;
          const f = (k - 0.45) / 0.55;
          fist.scale.setScalar(0.8 * scale * (1 + f * 0.15));
          fist.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 1 - f; } });
        }
      },
    });
  });

  later(stage, 540, () => {
    emit(stage, { pos: pos.clone().setY(pos.y + 0.3), count: 110 * mul, color: '#ffe9a8', color2: '#ffb347', shape: 'ring', speed: 10 * scale, drag: 2, life: 0.7, size: 0.32, alpha: 0.75 });
    emit(stage, { pos: pos.clone().setY(pos.y + 0.3), count: 60 * mul, color: c, color2: '#ffffff', shape: 'up', angle: 0.8, speed: 7, gravity: -10, life: 0.8, size: 0.3 });
    ring(stage, pos, { color: '#ffe27a', radius: 3.2 * scale, life: 0.6, width: 0.18 });
    ring(stage, pos, { color: '#ffe27a', radius: 2.2 * scale, life: 0.5, width: 0.12, delay: 0.06 });
    flash(stage, pos, { color: '#ffd27a', intensity: 25 * scale, distance: 9 });
    stage.shake(0.45 * scale, 450);
    audio.sfx('explode');
    audio.sfx('impact', { pitch: 0.7 });
    residue(fx, { delay: 0.15 });
  });
}
