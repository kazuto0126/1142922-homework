// 宿儺陣營的演出：入場「解」、合體技「開」、勝利「伏魔御廚子」。全部是抽象的斬擊、火焰與領域效果。
import * as THREE from 'three';
import { emit, ring, flash, spawn, glowMat, later, rand, palette, easeIn, easeOut } from './common.js';
import { energyMaterial, sparks, smoke, debris, scorch } from './realism.js';
import { flashScreen } from '../ui/cutin.js';

const TILE_TOP = 0.125;

/** 一道斬擊：細長、兩端尖的紅黑刀光，瞬間劃過再消失。 */
export function slashLine(stage, center, { length = 2.4, angle = 0, tilt = 0, color = '#ff3347', width = 0.07, life = 0.22, delay = 0, y = 0.4 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.quadraticCurveTo(0, width, length / 2, 0);
  shape.quadraticCurveTo(0, -width, -length / 2, 0);
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), glowMat('#ffe0e4', 1));
  const halo = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), glowMat(color, 0.8));
  halo.scale.set(1.05, 3, 1);
  g.add(halo, core);
  g.position.set(center.x, center.y + y, center.z);
  g.rotation.set(-Math.PI / 2 + tilt, 0, angle);
  return spawn(stage, g, {
    life, delay,
    update(k) {
      g.scale.set(Math.min(1, k * 6), 1, 1);
      const o = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      core.material.opacity = o;
      halo.material.opacity = 0.8 * o;
    },
  });
}

/** 入場「解」：三道交錯的斬擊劃過格子，地上留下刀痕火花。 */
export function entrance(fx) {
  const { stage, pos, pal, audio, mul } = fx;
  const base = rand(0, Math.PI);
  for (let i = 0; i < 3; i++) {
    later(stage, i * 70, () => {
      slashLine(stage, pos, { length: 2.2, angle: base + i * 1.05, y: 0.2 + i * 0.12, color: '#' + pal.primary.getHexString() });
      sparks(stage, pos.clone().setY(TILE_TOP + 0.2), { count: 18 * mul, color: '#ff6070', speed: 6 });
      audio.sfx('slash', { pitch: 1.3 + i * 0.15, gain: 0.7 });
    });
  }
  ring(stage, pos, { color: pal.primary, radius: 1.3, life: 0.3, width: 0.06, y: 0.15 });
}

function lineInfo(stage, line) {
  const pts = line.map(i => stage.cellCenter(i).setY(0.3));
  const dir = pts[2].clone().sub(pts[0]).normalize();
  return { pts, dir };
}

/** 合體技「開」：掌中燃起火焰，凝成一支火焰之矢，沿著連線射穿三格並引爆。 */
export function fuga(stage, line, audio) {
  const { pts, dir } = lineInfo(stage, line);
  const start = pts[0].clone().addScaledVector(dir, -3.5).setY(1.4);
  const end = pts[2].clone().addScaledVector(dir, 5).setY(0.6);

  // 蓄火：一團旋轉的火焰
  const fireMat = energyMaterial(stage, { c1: '#ffe6a0', c2: '#ff2200', scroll: 6, scale: [5, 4], fresnel: 1.2, threshold: 0.25 });
  const charge = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 20), fireMat);
  charge.position.copy(start);
  spawn(stage, charge, { life: 0.9, update(k) { charge.scale.setScalar(0.3 + k * 1.1); charge.rotation.y += 0.15; } });
  emit(stage, { pos: start, count: 60, color: '#ff8a3a', color2: '#ff2200', shape: 'up', angle: 0.6, speed: 2.5, gravity: 2, life: 0.8, size: 0.4 });
  audio.sfx('charge', { pitch: 0.7 });
  audio.sfx('fire', { delay: 0.2 });

  later(stage, 900, () => {
    // 火焰之矢
    const arrowMat = energyMaterial(stage, { c1: '#fff1b8', c2: '#ff3300', scroll: 12, scale: [3, 8], fresnel: 1.0, threshold: 0.22, fadeV: 0.12 });
    const geo = new THREE.ConeGeometry(0.45, 3.4, 32, 1, true);
    geo.rotateX(Math.PI / 2); // 錐尖朝 -z
    const arrow = new THREE.Mesh(geo, arrowMat);
    arrow.position.copy(start);
    arrow.lookAt(start.clone().sub(dir)); // 錐尖朝前進方向
    flashScreen('#ff9a50', 260);
    audio.sfx('whoosh', { pitch: 0.7 });
    let hitIdx = 0;
    spawn(stage, arrow, {
      life: 1.0,
      update(k) {
        arrow.position.lerpVectors(start, end, easeIn(k));
        emit(stage, { pos: arrow.position, count: 8, color: '#ffb060', color2: '#ff2200', speed: 1.5, life: 0.5, size: 0.45, radius: 0.3 });
        while (hitIdx < 3 && arrow.position.clone().sub(pts[hitIdx]).dot(dir) > 0) {
          const p = pts[hitIdx++];
          stage.impact(line[hitIdx - 1], 1.2);
          flash(stage, p, { color: '#ff6a1f', intensity: 25, distance: 8 });
          sparks(stage, p, { count: 80, color: '#ffb347', speed: 10 });
          debris(stage, p.clone().setY(TILE_TOP + 0.1), { count: 18, color: '#3a2a22', power: 1.1 });
          smoke(stage, p.clone().setY(TILE_TOP + 0.1), { count: 14, color: '#2a2220', size: 1.6 });
          scorch(stage, p, { radius: 1.1, glow: '#ff5a1f' });
          emit(stage, { pos: p, count: 120, color: '#ffd27a', color2: '#ff2200', speed: 8, life: 0.7, size: 0.4 });
          audio.sfx('explode', { pitch: 1.1, gain: 0.8 });
        }
      },
    });
  });
}

let shrineTex = null;
function shrineSkyTexture() {
  if (shrineTex) return shrineTex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#120004');
  gr.addColorStop(0.55, '#4a0010');
  gr.addColorStop(1, '#0a0002');
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 512);
  // 滿天的血紅斬痕
  g.strokeStyle = 'rgba(255,60,80,0.55)';
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, l = 10 + Math.random() * 60, a = Math.random() * Math.PI;
    g.lineWidth = Math.random() * 1.6 + 0.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  shrineTex = new THREE.CanvasTexture(c);
  shrineTex.colorSpace = THREE.SRGBColorSpace;
  return shrineTex;
}

/** 勝利「伏魔御廚子」：天空被血紅的領域包覆，無數斬擊劈下，把對手的棋子全部斬碎。 */
export function malevolentShrine(stage, audio) {
  const pal = palette('sukuna');
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.MeshBasicMaterial({ map: shrineSkyTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  spawn(stage, dome, {
    life: 6.5,
    update(k, _o, dt) {
      const open = Math.min(1, k / 0.1);
      dome.scale.setScalar(Math.max(0.01, easeOut(open)));
      dome.material.opacity = open;
      dome.rotation.y -= dt * 0.04;
    },
  });
  later(stage, 100, () => { stage.scene.background.set('#120004'); stage.scene.fog.density = 0.012; });
  for (let i = 0; i < 3; i++) ring(stage, new THREE.Vector3(0, 0, 0), { color: i === 1 ? '#ffffff' : pal.primary, radius: 12, life: 0.9, width: 0.03, delay: i * 0.12, y: 0.3 + i * 0.3 });
  flashScreen('#ff3347', 420);
  stage.impact(-1, 1.2);
  audio.sfx('charge', { pitch: 0.4 });
  audio.sfx('thunder', { pitch: 0.6, delay: 0.2 });

  // 領域內：整個棋盤上隨機落下的斬擊（持續約 3.5 秒）
  for (let i = 0; i < 70; i++) {
    later(stage, 500 + i * 50, () => {
      const p = new THREE.Vector3(rand(-3.2, 3.2), 0, rand(-3.2, 3.2));
      slashLine(stage, p, { length: rand(1.2, 2.6), angle: rand(0, Math.PI), tilt: rand(-0.3, 0.3), y: rand(0.15, 1.2), life: 0.2 });
      if (i % 3 === 0) sparks(stage, p.clone().setY(TILE_TOP + 0.1), { count: 10, color: '#ff6070', speed: 5 });
      if (i % 4 === 0) audio.sfx('slash', { pitch: rand(0.9, 1.6), gain: 0.45 });
    });
  }

  // 對手的棋子被斬碎
  const victims = stage.cellsOf('gojo');
  victims.forEach((cell, n) => {
    later(stage, 1200 + n * 320, () => {
      const p = stage.cellCenter(cell).setY(0.6);
      for (let j = 0; j < 4; j++) slashLine(stage, p, { length: 1.8, angle: j * 0.8 + rand(0, 0.4), y: 0.4, life: 0.25, delay: j * 0.04 });
      for (const obj of stage.takeCell(cell)) if (obj) obj.visible = false;
      emit(stage, { pos: p, count: 80, color: '#ffffff', color2: '#b9a0ff', speed: 5, gravity: -4, life: 0.9, size: 0.25 });
      debris(stage, p, { count: 14, color: '#d8d0ff', power: 0.8 });
      stage.impact(cell, 0.9);
      audio.sfx('impact', { pitch: 1.2 });
    });
  });
}

/** 預熱用：伏魔御廚子的天空貼圖。 */
export function warmupTextures() {
  return [shrineSkyTexture()];
}
