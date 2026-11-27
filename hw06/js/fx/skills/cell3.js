// 3 江戶川柯南：キック力増強シューズ —— 腰帶彈出足球 → 帶火花的直線急射 → 撞擊爆開。
import * as THREE from 'three';
import { emit, ring, flash, spawn, solidMat, later, residue, easeOut } from '../common.js';
import { hit } from '../realism.js';

function makeBall() {
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), solidMat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 }));
  // 黑色五角形花紋
  const patch = solidMat('#111111');
  for (const v of [[0, 1, 0], [0.95, 0.3, 0], [-0.6, 0.3, 0.75], [-0.6, 0.3, -0.75], [0.3, -0.9, 0.3]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), patch);
    const n = new THREE.Vector3(...v).normalize();
    p.position.copy(n).multiplyScalar(0.262);
    p.lookAt(n.clone().multiplyScalar(2));
    ball.add(p);
  }
  return ball;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const c = fx.color;
  // 從棋盤前方（靠近鏡頭的一側）踢過來
  const kickFrom = pos.clone().add(new THREE.Vector3(-0.8, 0.5, 3.4));
  const target = pos.clone().setY(pos.y + 0.45);

  const ball = makeBall();
  ball.position.copy(kickFrom);
  ball.scale.setScalar(0.001);
  audio.sfx('place', { pitch: 1.6 });

  spawn(stage, ball, {
    life: 0.45,
    update(k, _o, dt) {
      ball.rotation.x += dt * 25;
      ball.rotation.z += dt * 12;
      if (k < 0.4) {
        // 腰帶彈出：膨脹 + 往上彈
        const e = easeOut(k / 0.4);
        ball.scale.setScalar(Math.max(0.001, e * scale));
        ball.position.copy(kickFrom).setY(kickFrom.y + e * 0.5);
      } else {
        // 踢出：直線急射，留下火花
        const e = (k - 0.4) / 0.6;
        const from = kickFrom.clone().setY(kickFrom.y + 0.5);
        ball.position.lerpVectors(from, target, e * e);
        emit(stage, { pos: ball.position, count: 6 * mul, color: '#ffd24a', color2: c, speed: 1.2, life: 0.35, size: 0.2 });
      }
    },
  });
  later(stage, 180, () => audio.sfx('whoosh', { pitch: 1.3 }));

  later(stage, 430, () => {
    emit(stage, { pos: target, count: 110 * mul, color: '#ffe680', color2: c, speed: 7 * scale, life: 0.55, size: 0.3 });
    ring(stage, pos, { color: c, radius: 2.0 * scale, life: 0.45, width: 0.2 });
    ring(stage, pos, { color: '#ffd24a', radius: 1.4 * scale, life: 0.35, width: 0.1, y: 0.45 });
    hit(fx, { power: 0.9, color: '#ffd24a', at: target });
    audio.sfx('impact', { pitch: 1.1 });
    residue(fx, { delay: 0.1 });
  });
}
