// 3 江戶川柯南：キック力増強シューズ（原創抽象造型）—— 棋盤外的地面上電流聚集（增強踢力）→
// 一顆發光的足球被踢出，拖著電光與火焰飛進來 → 在兩個點反彈 → 重重砸進格子 → 巨大的衝擊波掃過整個棋盤。
import * as THREE from 'three';
import { emit, ring, flash, arcs, bolt, spawn, glowMat, later, residue, rand, easeIn } from '../common.js';
import { hit, energyMaterial, sparks, debris, smoke } from '../realism.js';
import { shockwave } from '../realism.js';

let ballGeo = null, ballMat = null; // 足球的幾何與材質只建立一次（每次都新建會讓著色器被丟掉又重新編譯而卡一下）

/** 發光的足球（二十面體加細分、黑白兩色面，外面一層電光）。 */
function makeBall(stage) {
  const g = new THREE.Group();
  if (!ballGeo) {
  const geo = new THREE.IcosahedronGeometry(0.32, 1).toNonIndexed();
  // 每個三角面隨機黑或白，看起來像足球的拼塊
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count / 3; i++) {
    c.set(i % 5 === 0 ? '#1a1a22' : '#f4f4f8');
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.userData.shared = true;
  ballGeo = geo;
  ballMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.8, emissive: '#3a6bff', emissiveIntensity: 0.25, flatShading: true });
  ballMat.userData.shared = true;
  }
  const ball = new THREE.Mesh(ballGeo, ballMat);
  g.add(ball);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), energyMaterial(stage, { c1: '#e6f6ff', c2: '#2b6cff', scroll: 8, scale: [6, 6], fresnel: 1.8, threshold: 0.3, opacity: 0.8 }));
  g.add(aura);
  g.userData = { ball, aura };
  return g;
}

export default function (fx) {
  const { stage, pos, audio, mul, scale } = fx;
  const blue = fx.color;
  // 踢出點：棋盤外前方的地面；反彈兩次後砸進格子
  const kick = pos.clone().add(new THREE.Vector3(-3.5, 0.4, 6.5));
  const b1 = new THREE.Vector3(3.6, 0.4, 3.2);
  const b2 = new THREE.Vector3(-1.5, 2.8, -3.8);
  const target = pos.clone().setY(pos.y + 0.35);
  // 運鏡：跟著足球飛行、反彈 → 撞擊時拉高看衝擊波
  fx.shot([
    { at: 0.3, pos: kick.clone().add(new THREE.Vector3(1.5, 1.8, 3.5)), target: kick.clone() },
    { at: 0.5, pos: b1.clone().add(new THREE.Vector3(2.2, 2.2, 3.5)), target: b1.clone() },
    { at: 0.66, pos: b2.clone().add(new THREE.Vector3(2.5, 1.8, 4.5)), target: b2.clone() },
    { at: 0.8, pos: pos.clone().add(new THREE.Vector3(1, 4.5, 5.5)), target: pos.clone() },
    { at: 1, pos: pos.clone().add(new THREE.Vector3(0, 10, 5)), target: pos.clone() },
  ], 1700);

  // ① 增強踢力：地面上電流聚集
  audio.sfx('charge', { pitch: 1.2 });
  for (let i = 0; i < 6; i++) {
    later(stage, i * 100, () => {
      arcs(stage, kick, { count: 2 + i, radius: 0.6 + i * 0.08, color: '#9fd0ff', life: 0.25, width: 0.03 });
      audio.sfx('thunder', { pitch: 2 - i * 0.1, gain: 0.2 + i * 0.03 });
    });
  }
  const ball = makeBall(stage);
  ball.position.copy(kick);
  ball.scale.setScalar(0.001);
  stage.fxLayer.add(ball);

  // ② 踢出 → 反彈兩次 → 砸進格子
  const path = [kick, b1, b2, target];
  const legMs = [260, 230, 200];
  let leg = 0, legT = 0, started = false;
  later(stage, 650, () => {
    started = true;
    audio.sfx('impact', { pitch: 1.6, gain: 0.7 }); // 踢球
    flash(stage, kick, { color: '#9fd0ff', intensity: 30, distance: 8, life: 0.3 });
    sparks(stage, kick, { count: 40, color: '#cfeaff', speed: 7 });
  });
  spawn(stage, new THREE.Group(), {
    life: 1.5,
    update(k, _o, dt) {
      ball.scale.setScalar(Math.max(0.001, Math.min(1, k * 8)) * 1.4 * scale);
      ball.userData.ball.rotation.x += dt * 25;
      ball.userData.ball.rotation.y += dt * 13;
      if (!started || leg >= path.length - 1) return;
      legT += (dt * 1000) / legMs[leg];
      const u = Math.min(1, legT);
      ball.position.lerpVectors(path[leg], path[leg + 1], u);
      // 拖著電光與火焰
      emit(stage, { pos: ball.position, count: 6, color: '#9fd0ff', color2: '#ff9a3a', speed: 1.2, drag: 2, life: 0.35, size: 0.35, alpha: 0.85 });
      if (u >= 1) {
        const hitPt = path[leg + 1];
        leg++; legT = 0;
        if (leg < path.length - 1) {
          // 反彈點：火花 + 小衝擊環 + 一道閃電
          sparks(stage, hitPt, { count: 30, color: '#cfeaff', speed: 8 });
          ring(stage, hitPt, { color: '#9fd0ff', radius: 1.4, life: 0.3, width: 0.1, y: 0 });
          bolt(stage, hitPt, hitPt.clone().lerp(path[leg + 1], 0.5), { color: '#bfe8ff', width: 0.04, life: 0.2, segments: 8, jag: 0.4 });
          stage.impact(fx.cell, 0.3);
          audio.sfx('impact', { pitch: 1.3, gain: 0.6 });
        }
      }
    },
  });

  // ③ 砸進格子：巨大的衝擊波掃過整個棋盤
  const impactAt = 650 + legMs.reduce((a, b) => a + b, 0);
  later(stage, impactAt, () => {
    if (ball.parent) {
      ball.parent.remove(ball);
      ball.traverse(o => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material && !o.material.userData.shared) o.material.dispose();
      });
    }
    hit(fx, { power: 1.6, color: blue, smokeColor: '#3a3f55', debrisColor: '#3a3f55' });
    debris(stage, pos.clone().setY(0.3), { count: 26, color: '#3a3f55', power: 1.5 });
    shockwave(stage, pos, { radius: 6.5 * scale, c1: '#ffffff', c2: '#3a8bff', life: 0.75, height: 0.8 });
    for (let i = 0; i < 3; i++) ring(stage, pos, { color: i % 2 ? '#ffffff' : '#5ab0ff', radius: (4 + i * 1.5) * scale, life: 0.6, width: 0.1, y: 0.1, delay: i * 0.08 });
    arcs(stage, target, { count: 10 * mul, radius: 2.4 * scale, color: '#bfe8ff', life: 0.5, width: 0.04 });
    later(stage, 150, () => smoke(stage, pos.clone().setY(0.25), { count: 18, color: '#3a3f55', size: 1.8, life: 1.4, speed: 2 }));
    audio.sfx('explode', { pitch: 1.0 });
    audio.sfx('impact', { pitch: 0.7 });
    residue(fx, { delay: 0.2 });
  });
}

/** 預熱用：足球的材質（清漆 + 頂點顏色的實體材質，只有這一招用到）。 */
export function warmupObjects(stage) {
  return [makeBall(stage)];
}
