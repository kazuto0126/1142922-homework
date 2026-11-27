// 1 漩渦鳴人：螺旋手裏劍（原創抽象造型）—— 棋盤外一隻風之能量手，掌心搓出旋轉的球體、
// 長出四片大刃、發出尖銳的風切聲 → 拋向棋盤，邊飛邊高速旋轉 → 落在格子上炸開成大範圍的風之氣旋（充滿細小的切割線）→ 收縮消失。
import * as THREE from 'three';
import { emit, ring, flash, converge, spawn, glowMat, later, residue, rand, easeOut } from '../common.js';
import { hit, energyMaterial, sparks } from '../realism.js';

/** 抽象的風之能量手（張開手掌朝上）。 */
function makeWindHand(stage) {
  const skin = energyMaterial(stage, { c1: '#eafcff', c2: '#3aa8ff', scroll: 2.5, scale: [3, 3], fresnel: 1.6, threshold: 0.3, opacity: 0.8 });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.75, 2, 1, 2), skin);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 10), skin);
    f.position.set(-0.27 + i * 0.18, 0.05, 0.55);
    f.rotation.x = Math.PI / 2 - 0.35;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 4, 10), skin);
  thumb.position.set(0.45, 0.05, 0.1);
  thumb.rotation.set(Math.PI / 2, 0, -0.9);
  g.add(thumb);
  return { group: g, skin };
}

/** 四刃的旋轉風刃（中心球 + 四片彎刃 + 外圈風環）。 */
function makeSpiralShuriken(stage, scale) {
  const g = new THREE.Group();
  const coreMat = energyMaterial(stage, { c1: '#ffffff', c2: '#4ab0ff', scroll: 6, scale: [5, 5], fresnel: 1.5, threshold: 0.2 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 20), coreMat);
  g.add(core);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glowMat('#ffffff', 1)));
  // 四片彎曲的大刃（薄片，像手裏劍的刃）
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0.15);
  bladeShape.quadraticCurveTo(0.9, 0.55, 1.9, 0.05);
  bladeShape.quadraticCurveTo(1.0, 0.0, 0.0, -0.15);
  const bladeGeo = new THREE.ShapeGeometry(bladeShape, 16);
  const bladeMat = energyMaterial(stage, { c1: '#f2fdff', c2: '#7fd0ff', scroll: 10, scale: [6, 2], fresnel: 0.3, threshold: 0.12, opacity: 0.95 });
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bladeGeo, bladeMat);
    b.rotation.z = (i * Math.PI) / 2;
    blades.add(b);
  }
  blades.rotation.x = -Math.PI / 2; // 平放，繞垂直軸旋轉
  g.add(blades);
  // 外圈的風環
  const ringMat = glowMat('#bfefff', 0.55);
  const wind = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.03, 8, 96), ringMat);
  wind.rotation.x = Math.PI / 2;
  g.add(wind);
  g.scale.setScalar(0.001);
  g.userData = { blades, wind, coreMat, bladeMat, ringMat, scale };
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  // 手在棋盤外（左後方的半空中）
  const handPos = new THREE.Vector3(-6.4, 2.3, -0.8);
  const holdPos = handPos.clone().add(new THREE.Vector3(0, 0.9, 0));
  const target = pos.clone().setY(pos.y + 0.5);

  const hand = makeWindHand(stage);
  hand.group.position.copy(handPos);
  hand.group.lookAt(target.x, handPos.y, target.z);
  const shuriken = makeSpiralShuriken(stage, scale);
  shuriken.position.copy(holdPos);
  stage.fxLayer.add(shuriken);
  const ud = shuriken.userData;

  // ① 手出現、掌心搓出球體 → 長出四片刃（0 ~ 1.0 秒）
  spawn(stage, hand.group, {
    life: 1.35,
    update(k) {
      const t = k * 1350;
      hand.group.scale.setScalar(Math.max(0.001, easeOut(Math.min(1, t / 250)) * 2.6));
      if (t > 1050) hand.skin.uniforms.uOpacity.value = 0.8 * (1 - (t - 1050) / 300);
      // 丟出去的動作：手往前甩
      if (t > 980) hand.group.rotation.x = -Math.min(1, (t - 980) / 150) * 0.9;
    },
  });
  converge(stage, holdPos, { radius: 2.4, count: 90 * mul, color: '#dff6ff', color2: '#4ab0ff', life: 0.45, size: 0.2 });
  audio.sfx('charge', { pitch: 1.1 });
  later(stage, 350, () => audio.sfx('wind', { pitch: 1.6 }));
  later(stage, 600, () => audio.sfx('wind', { pitch: 2.4, gain: 0.8 })); // 尖銳的風切聲

  let phase = 'form';
  let flyT = 0;
  const flyFrom = holdPos.clone();
  const apex = holdPos.clone().lerp(target, 0.5).add(new THREE.Vector3(0, 2.4, 0));
  spawn(stage, new THREE.Group(), {
    life: 1.75,
    update(k, _o, dt) {
      const t = k * 1750;
      // 旋轉：越來越快
      const spin = Math.min(40, 6 + t * 0.03);
      ud.blades.rotation.z += dt * spin;
      ud.wind.rotation.z -= dt * spin * 0.5;
      if (phase === 'form') {
        // 先是一顆球，接著四片刃長出來
        const s = t < 350 ? easeOut(t / 350) * 0.55 : 0.55 + Math.min(1, (t - 350) / 450) * 0.45;
        shuriken.scale.setScalar(Math.max(0.001, s * 1.3 * scale));
        ud.blades.scale.setScalar(Math.max(0.001, Math.min(1, Math.max(0, (t - 350) / 450))));
        if (t % 90 < 18) emit(stage, { pos: shuriken.position, count: 4, color: '#e6fbff', color2: '#7fd0ff', shape: 'ring', speed: 5, life: 0.25, size: 0.14 });
        if (t >= 1050) { phase = 'fly'; flyT = 0; audio.sfx('whoosh', { pitch: 1.4 }); }
      } else if (phase === 'fly') {
        // 拋物線飛到格子上，邊飛邊高速旋轉
        flyT += dt / 0.42;
        const u = Math.min(1, flyT);
        const a = flyFrom.clone().lerp(apex, u), b = apex.clone().lerp(target, u);
        shuriken.position.copy(a.lerp(b, u));
        sparks(stage, shuriken.position, { count: 2, color: '#cfefff', speed: 3, life: 0.3 });
        if (u >= 1) phase = 'done';
      }
    },
  });

  // ③ 落地：炸開成大範圍的風之氣旋
  later(stage, 1500, () => {
    stage.fxLayer.remove(shuriken);
    hit(fx, { power: 1.4, color: '#8fd8ff', smokeColor: '#cfe8f0', scorched: false, at: target.clone() });
    flash(stage, target, { color: '#bfefff', intensity: 45, distance: 12, life: 0.6 });
    audio.sfx('explode', { pitch: 1.2 });
    audio.sfx('wind', { pitch: 1.0 });
    // 半透明的風之圓頂：充滿細小的切割線，先撐大、停留、再往內收縮
    const domeMat = energyMaterial(stage, { c1: '#ffffff', c2: '#3aa8ff', scroll: -9, scale: [26, 10], fresnel: 1.4, threshold: 0.32, opacity: 0.85, twist: 2.0 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(pos.x, 0.12, pos.z);
    spawn(stage, dome, {
      life: 1.3,
      update(k, _o, dt) {
        const r = k < 0.35 ? easeOut(k / 0.35) * 3.4 * scale : k < 0.7 ? 3.4 * scale : 3.4 * scale * (1 - Math.pow((k - 0.7) / 0.3, 2));
        dome.scale.set(Math.max(0.01, r), Math.max(0.01, r * 0.75), Math.max(0.01, r));
        dome.rotation.y += dt * 6;
        domeMat.uniforms.uOpacity.value = 0.85 * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
      },
    });
    // 氣旋裡亂竄的細小風刃（線條火花）
    for (let i = 0; i < 6; i++) {
      later(stage, i * 120, () => {
        sparks(stage, target.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(0, 1.2), rand(-1.5, 1.5))), { count: 22 * mul, color: '#e6fbff', speed: 9, life: 0.35, gravity: 0, spread: 1 });
        ring(stage, pos, { color: '#bfefff', radius: (2.4 + i * 0.35) * scale, life: 0.45, width: 0.05, y: 0.25 + i * 0.12 });
      });
    }
    residue(fx, { delay: 0.6 });
  });
}
