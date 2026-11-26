// 4 魯夫：ゴムゴムの猿神銃（五檔）—— 雲霧湧出 + 鼓聲 → 巨拳在高空蓄力 → 砸穿格子 → 拳頭陷在地上再收回。
import * as THREE from 'three';
import { emit, ring, spawn, later, residue, easeIn, easeOut } from '../common.js';
import { hit, smoke, debris, sparks, energyMaterial } from '../realism.js';
import { makeFist, std } from '../models.js';

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;

  // 雲霧 + 三下鼓聲
  smoke(stage, pos.clone().setY(0.4), { count: 24 * mul, color: '#f4f1ea', size: 1.8, life: 1.8, speed: 1.4, alpha: 0.45, radius: 1.2 });
  for (let i = 0; i < 3; i++) {
    later(stage, i * 140, () => {
      audio.sfx('impact', { pitch: 0.5, gain: 0.55 });
      ring(stage, pos, { color: '#ffffff', radius: 1 + i * 0.5, life: 0.35, width: 0.05, y: 0.25 });
      stage.impact(fx.cell, 0.25);
    });
  }

  // 巨拳：白色的橡膠拳，周圍纏著雲狀的能量
  const fist = makeFist(std('#f3ede2', { emissive: '#3a3020', ei: 0.2, rough: 0.5, sheen: 1, sheenColor: '#fff6e0', clearcoat: 0.3, fade: true }), { arm: 7 });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 20), energyMaterial(stage, { c1: '#ffffff', c2: '#e8dcc0', scroll: 2, scale: [4, 4], fresnel: 1.5, threshold: 0.35, opacity: 0.6 }));
  aura.scale.set(1.25, 1.0, 1.1);
  aura.position.y = 0.1;
  fist.add(aura);
  const s = 1.0 * scale;
  fist.scale.setScalar(0.001);
  const high = pos.clone().setY(5.2), wind = pos.clone().setY(6.4), ground = pos.clone().setY(0.55 * s);
  fist.position.copy(high);
  audio.sfx('whoosh', { pitch: 0.5, delay: 0.3 });

  spawn(stage, fist, {
    life: 1.75,
    update(k) {
      const t = k * 1750;
      if (t < 300) {
        fist.scale.setScalar(Math.max(0.001, easeOut(t / 300) * s));
      } else if (t < 650) { // 往上拉、蓄力
        fist.position.lerpVectors(high, wind, easeOut((t - 300) / 350));
        fist.rotation.z = Math.sin(t / 40) * 0.03;
      } else if (t < 900) { // 砸下
        fist.position.lerpVectors(wind, ground, easeIn((t - 650) / 250));
        if (t > 700) emit(stage, { pos: fist.position, count: 6, color: '#ffffff', color2: '#fff1c2', speed: 2, life: 0.4, size: 0.5, radius: 0.8 });
      } else if (t < 1300) { // 陷在地上、微微震動
        fist.position.copy(ground).add(new THREE.Vector3(Math.random() * 0.04, 0, Math.random() * 0.04));
      } else { // 收回、淡出
        const e = (t - 1300) / 450;
        fist.position.lerpVectors(ground, high, easeIn(e));
        fist.traverse(o => { if (o.material && !o.material.uniforms) { o.material.transparent = true; o.material.opacity = 1 - e; } });
        aura.material.uniforms.uOpacity.value = 0.6 * (1 - e);
      }
    },
  });

  later(stage, 900, () => {
    hit(fx, { power: 1.6, color: '#ffe27a', smokeColor: '#ece6da', debrisColor: '#8a7f6a' });
    debris(stage, pos.clone().setY(0.3), { count: 30, color: '#6a6258', power: 1.5 });
    emit(stage, { pos: pos.clone().setY(0.3), count: 140 * mul, color: '#ffe9a8', color2: '#ffb347', shape: 'ring', speed: 11 * scale, drag: 2, life: 0.8, size: 0.32, alpha: 0.75 });
    ring(stage, pos, { color: '#ffe27a', radius: 3.4 * scale, life: 0.7, width: 0.15 });
    audio.sfx('explode');
    audio.sfx('impact', { pitch: 0.6 });
    residue(fx, { delay: 0.2 });
  });
  later(stage, 1050, () => sparks(stage, pos.clone().setY(0.4), { count: 60, color: '#ffffff', speed: 7 }));
}
