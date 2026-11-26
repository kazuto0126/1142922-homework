// 7 桐谷和人：スターバースト・ストリーム —— 黑白雙劍的 16 道斬擊殘影依序閃現 → 最後一擊十字閃光。
import * as THREE from 'three';
import { emit, ring, flash, spawn, glowMat, later, residue, rand } from '../common.js';

function slashMesh(color, len, width) {
  // 中間粗、兩端尖的刀光
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.quadraticCurveTo(0, width, len / 2, 0);
  shape.quadraticCurveTo(0, -width * 0.35, -len / 2, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), glowMat(color, 0.75));
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const center = pos.clone().setY(pos.y + 0.9).add(new THREE.Vector3(0, 0, -0.3));
  const cam = stage.camera.position;

  function slash(i, color, len, width, angle, life = 0.16) {
    const m = slashMesh(color, len * scale, width * scale);
    m.position.copy(center).add(new THREE.Vector3(rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25)));
    m.lookAt(cam); // 面向鏡頭，斬擊才看得清楚
    m.rotateZ(angle);
    spawn(stage, m, {
      life,
      update(k) {
        m.scale.set(Math.min(1, k * 5), 1, 1);
        m.material.opacity = 0.75 * (k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7);
      },
    });
  }

  // 16 連擊：黑劍（深藍）與白劍（青白）交替
  for (let i = 0; i < 16; i++) {
    later(stage, i * 40, () => {
      const dark = i % 2 === 0;
      slash(i, dark ? '#2f5bff' : '#7fdcff', rand(1.3, 1.9), 0.12, rand(0, Math.PI));
      emit(stage, { pos: center, count: 3 * mul, color: dark ? '#4a78ff' : '#bff0ff', speed: 4, life: 0.25, size: 0.14 });
      audio.sfx('slash', { pitch: 0.8 + i * 0.04, gain: 0.6 });
    });
  }

  // 最後一擊：十字
  later(stage, 700, () => {
    slash(16, '#cfefff', 2.6, 0.22, Math.PI / 4, 0.4);
    slash(17, '#4a78ff', 2.6, 0.22, -Math.PI / 4, 0.4);
    emit(stage, { pos: center, count: 100 * mul, color: '#ffffff', color2: fx.color, speed: 7 * scale, life: 0.5, size: 0.3 });
    ring(stage, pos, { color: fx.color, radius: 2.0 * scale, life: 0.45, width: 0.18 });
    flash(stage, pos, { color: '#cfefff', intensity: 30 * scale });
    stage.shake(0.25 * scale, 300);
    audio.sfx('impact', { pitch: 1.2 });
    residue(fx, { delay: 0.1 });
  });
}
