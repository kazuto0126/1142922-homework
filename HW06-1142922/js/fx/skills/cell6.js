// 6 納茲：火竜の咆哮 —— 吸氣（粒子往口中收）→ 大火焰吐息：錐形火焰 + 一條筆直的火柱貫穿格子、一路噴出棋盤
// → 火柱經過的空間持續燃燒（沿線冒出火舌、熱浪、黑煙）→ 火星往上飄。
import * as THREE from 'three';
import { emit, ring, flash, converge, spawn, later, residue, rand } from '../common.js';
import { hit, energyMaterial, smoke } from '../realism.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const fire = fx.color;
  // 口的位置：格子左前方的半空中；火柱從口出發、穿過格子上方，一路往前噴
  const mouth = pos.clone().add(new THREE.Vector3(-2.6, 1.6, 2.0));
  const aim = pos.clone().setY(pos.y + 0.55);
  const dir = aim.clone().sub(mouth).normalize();
  const reach = 15; // 火柱總長（會飛出棋盤）

  // 吸氣：兩圈往口中收的火星
  converge(stage, mouth, { radius: 2.2, count: 110 * mul, color: '#ffcf7a', color2: fire, life: 0.32, size: 0.26 });
  later(stage, 150, () => converge(stage, mouth, { radius: 1.4, count: 70 * mul, color: '#fff1b0', color2: '#ff6a1f', life: 0.22, size: 0.22 }));
  audio.sfx('charge', { pitch: 0.7 });

  // ① 大火焰：錐形吐息（比原本大），分 10 波噴出
  for (let i = 0; i < 10; i++) {
    later(stage, 320 + i * 55, () => {
      emit(stage, { pos: mouth, count: 40 * mul, color: '#ffd27a', color2: fire, shape: 'cone', dir, angle: 0.26 + i * 0.012, speed: 15 * scale, speedVar: 0.25, drag: 0.45, life: 0.55, size: 0.85 * scale, sizeVar: 0.6, alpha: 0.6 });
      emit(stage, { pos: mouth, count: 20 * mul, color: '#ff3b1f', color2: '#8a1400', shape: 'cone', dir, angle: 0.34, speed: 12 * scale, drag: 0.5, life: 0.65, size: 1.0 * scale, alpha: 0.75 });
    });
  }

  later(stage, 320, () => {
    // 錐形火焰（加大）
    const len = 6.5;
    const coneMat = energyMaterial(stage, { c1: '#fff3b0', c2: '#ff2a00', scroll: 8, scale: [4, 5], fresnel: 0.9, threshold: 0.26, fadeV: 0.16 });
    const cone = new THREE.ConeGeometry(1.8 * scale, len, 48, 1, true);
    cone.translate(0, -len / 2, 0);
    const breath = new THREE.Mesh(cone, coneMat);
    breath.position.copy(mouth);
    breath.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    spawn(stage, breath, {
      life: 0.85,
      update(k) {
        const grow = Math.min(1, k / 0.15);
        breath.scale.set(0.3 + 0.7 * grow, grow, 0.3 + 0.7 * grow);
        coneMat.uniforms.uOpacity.value = 0.7 * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35); // 太亮會整片發白，看不出火焰的形狀
      },
    });

    // ② 筆直的火柱：從口中一路噴出去（穿過格子、飛出棋盤），兩層：外層翻滾的火、中間白熱的芯
    const beamGroup = new THREE.Group();
    const outerMat = energyMaterial(stage, { c1: '#ffd27a', c2: '#ff3000', scroll: 14, scale: [3, 18], fresnel: 1.0, threshold: 0.22, fadeV: 0.06, twist: 0.6 });
    const coreMat = energyMaterial(stage, { c1: '#ffffff', c2: '#ffb347', scroll: 20, scale: [2, 24], fresnel: 0.6, threshold: 0.18, fadeV: 0.04 });
    const outerGeo = new THREE.CylinderGeometry(0.55 * scale, 0.75 * scale, reach, 32, 1, true);
    const coreGeo = new THREE.CylinderGeometry(0.2 * scale, 0.28 * scale, reach, 20, 1, true);
    for (const geo of [outerGeo, coreGeo]) geo.translate(0, -reach / 2, 0);
    beamGroup.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(coreGeo, coreMat));
    beamGroup.position.copy(mouth);
    beamGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    spawn(stage, beamGroup, {
      life: 1.0,
      update(k) {
        // 火柱前端往前推進（約 0.25 秒噴到最遠），之後慢慢變細消失
        const extend = Math.min(1, k / 0.25);
        const thin = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        beamGroup.scale.set(Math.max(0.001, thin), Math.max(0.001, extend), Math.max(0.001, thin));
        outerMat.uniforms.uOpacity.value = thin;
        coreMat.uniforms.uOpacity.value = thin;
      },
    });
    audio.sfx('fire');
    audio.sfx('fire', { pitch: 0.7, delay: 0.15 });
    flash(stage, mouth, { color: '#ff7a2a', intensity: 20, life: 0.7, distance: 12 });
  });

  // ③ 燃燒的空間：火柱經過的地方一路冒出火舌、熱浪、黑煙（從近到遠依序點燃）
  const burnPts = 12;
  for (let j = 0; j < burnPts; j++) {
    const p = mouth.clone().addScaledVector(dir, 1.2 + (j / burnPts) * (reach - 1.5));
    later(stage, 360 + j * 22, () => {
      emit(stage, { pos: p, count: 26 * mul, color: '#ffd27a', color2: '#ff3b1f', shape: 'sphere', speed: 2.2, drag: 1.2, life: 0.6, size: 0.6 * scale, radius: 0.35 });
      flash(stage, p, { color: '#ff6a1f', intensity: 6, distance: 5, life: 0.4 });
    });
    for (let t = 0; t < 3; t++) {
      later(stage, 600 + j * 22 + t * 170, () => {
        emit(stage, { pos: p, count: 10 * mul, color: '#ffb347', color2: '#ff2a00', shape: 'up', angle: 0.35, speed: rand(1.8, 3), gravity: 2.5, drag: 0.6, life: 0.7, size: 0.42 * scale, radius: 0.3 });
      });
    }
    later(stage, 900 + j * 25, () => smoke(stage, p, { count: 4, color: '#2a2220', size: 1.4, life: 1.6, speed: 0.8, alpha: 0.4, radius: 0.3 }));
  }

  // 火柱掠過格子的那一刻：命中（不一定要砸在地上，衝擊從格子上方的火柱炸開）
  later(stage, 420, () => {
    ring(stage, pos, { color: fire, radius: 2.6 * scale, life: 0.6, width: 0.2 });
    hit(fx, { power: 1.15, color: '#ff6a1f', smokeColor: '#2a2220', debrisColor: '#3a2a22', at: aim.clone() });
    audio.sfx('explode', { pitch: 1.0, gain: 0.8 });
  });

  later(stage, 900, () => {
    // 火星與熱浪往上飄
    emit(stage, { pos: pos.clone().setY(pos.y + 0.15), count: 90 * mul, color: '#ffb347', color2: '#ff3b1f', shape: 'up', angle: 0.6, speed: 2.8, gravity: 2, drag: 0.8, life: 1.2, size: 0.22, radius: 1.0 });
    residue(fx);
  });
}
