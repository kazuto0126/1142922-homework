// 兩大陣營的領袖演出：入場、合體技、勝利、和局對撞。
import * as THREE from 'three';
import { emit, ring, flash, orb, beam, spawn, glowMat, converge, later, rand, palette, easeOut, easeIn } from './common.js';
import { flashScreen } from '../ui/cutin.js';

const opponentOf = f => (f === 'rimuru' ? 'gojo' : 'rimuru');

// ───────────────────────── 入場 ─────────────────────────

/** 利姆路：地面張開「暴食之王」的影子傳送門，水滴噴出。五條悟：空間扭曲，瞬間出現。 */
export function entrance(fx) {
  const { stage, pos, pal, faction, audio, mul } = fx;
  if (faction === 'rimuru') {
    const portal = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#06001a', transparent: true, opacity: 0.92, depthWrite: false }));
    hole.rotation.x = -Math.PI / 2;
    portal.add(hole);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.05, 64), glowMat(pal.primary, 1));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.005;
    portal.add(rim);
    portal.position.copy(pos).setY(pos.y + 0.02);
    spawn(stage, portal, {
      life: 0.75,
      update(k) {
        const s = k < 0.3 ? k / 0.3 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        portal.scale.setScalar(Math.max(0.001, s * 0.85));
        portal.rotation.y += 0.08;
      },
    });
    emit(stage, { pos: pos.clone().setY(pos.y + 0.1), count: 46 * mul, color: pal.primary, color2: pal.accent, shape: 'up', angle: 0.5, speed: 5, gravity: -11, drag: 0.4, life: 0.8, size: 0.28 });
    orb(stage, pos.clone().setY(pos.y + 0.35), { color: pal.primary, grow: [0.05, 0.42], life: 0.35, delay: 0.12, opacity: [0.9, 0] });
    audio.sfx('whoosh', { pitch: 0.7 });
    audio.sfx('place', { pitch: 0.7, delay: 0.12 });
  } else {
    for (let i = 0; i < 3; i++) {
      ring(stage, pos, { color: i === 1 ? pal.secondary : '#ffffff', radius: 1.5 - i * 0.25, life: 0.35, delay: i * 0.06, width: 0.08, y: 0.2 + i * 0.15 });
    }
    flash(stage, pos, { color: '#e8e0ff', intensity: 30, life: 0.3 });
    emit(stage, { pos: pos.clone().setY(pos.y + 0.6), count: 36 * mul, color: '#ffffff', color2: pal.secondary, speed: 3, drag: 3, life: 0.5, size: 0.22, radius: 0.6 });
    audio.sfx('sparkle', { pitch: 1.2 });
    audio.sfx('whoosh', { pitch: 1.6 });
  }
}

// ───────────────────────── 合體技（領袖的大招） ─────────────────────────

function lineInfo(stage, line) {
  const pts = line.map(i => stage.cellCenter(i).setY(0.2));
  const center = pts.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const dir = pts[2].clone().sub(pts[0]).normalize();
  return { pts, center, dir };
}

/** 利姆路「神之怒」：天空出現光點陣列 → 無數細光束齊射在連線上。 */
function megiddo(stage, line, audio) {
  const { pts, center } = lineInfo(stage, line);
  const pal = palette('rimuru');
  const lenses = [];
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Vector3(center.x + rand(-4, 4), rand(6.5, 8.5), center.z + rand(-4, 4));
    lenses.push(p);
    orb(stage, p, { color: '#dff8ff', grow: [0.05, 0.16], life: 1.6, opacity: [1, 0.6], delay: i * 0.015, segments: 10 });
  }
  audio.sfx('charge', { pitch: 1.6 });
  for (let i = 0; i < 40; i++) {
    later(stage, 450 + i * 28, () => {
      const from = lenses[i % lenses.length];
      const target = pts[i % 3].clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)));
      beam(stage, from, target, { color: i % 2 ? pal.primary : '#ffffff', width: 0.05, life: 0.28 });
      emit(stage, { pos: target, count: 8, color: '#ffffff', color2: pal.primary, speed: 3, life: 0.3, size: 0.18 });
      if (i % 5 === 0) audio.sfx('beam', { pitch: 1.8, gain: 0.35 });
    });
  }
  later(stage, 1600, () => {
    for (const p of pts) ring(stage, p, { color: pal.primary, radius: 2.2, life: 0.6, width: 0.2 });
    emit(stage, { pos: center, count: 200, color: '#ffffff', color2: pal.primary, shape: 'ring', speed: 9, drag: 1.8, life: 0.8, size: 0.35 });
    flash(stage, center, { color: '#bff4ff', intensity: 70, distance: 16 });
    stage.shake(0.45, 500);
    flashScreen('#bff4ff', 380);
    audio.sfx('explode');
  });
}

/** 五條悟 虚式「茈」：紅球、藍球從兩側飛來合體成紫球 → 沿連線貫穿。 */
function hollowPurple(stage, line, audio) {
  const { pts, dir } = lineInfo(stage, line);
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const start = pts[0].clone().addScaledVector(dir, -3).setY(1.4);
  const end = pts[2].clone().addScaledVector(dir, 6).setY(1.0);

  const mk = color => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 14), glowMat('#ffffff', 0.9)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), glowMat(color, 0.55)));
    return g;
  };
  const red = mk('#ff2b4a');
  const blue = mk('#2b7bff');
  const redFrom = start.clone().addScaledVector(side, 2.5).setY(2.2);
  const blueFrom = start.clone().addScaledVector(side, -2.5).setY(2.2);
  spawn(stage, red, { life: 0.7, update(k) { red.position.lerpVectors(redFrom, start, easeIn(k)); red.rotation.y += 0.2; } });
  spawn(stage, blue, { life: 0.7, update(k) { blue.position.lerpVectors(blueFrom, start, easeIn(k)); blue.rotation.y -= 0.2; } });
  audio.sfx('charge', { pitch: 0.9 });
  audio.sfx('charge', { pitch: 1.3, delay: 0.1 });

  later(stage, 700, () => {
    const purple = new THREE.Group();
    purple.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), glowMat('#ffffff', 0.95)));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat('#9b4dff', 0.6));
    purple.add(shell);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 8, 64), glowMat('#e0c8ff', 0.9));
    purple.add(halo);
    purple.position.copy(start);
    flash(stage, start, { color: '#b070ff', intensity: 60, distance: 14 });
    flashScreen('#c8a0ff', 300);
    audio.sfx('explode', { pitch: 1.4, gain: 0.6 });
    let hit = 0;
    spawn(stage, purple, {
      life: 1.4,
      update(k, _o, dt) {
        const grow = Math.min(1, k / 0.25);
        purple.scale.setScalar(Math.max(0.001, grow * 1.1));
        halo.rotation.x += dt * 6;
        halo.rotation.y += dt * 4;
        if (k > 0.3) {
          const e = (k - 0.3) / 0.7;
          purple.position.lerpVectors(start, end, easeIn(e));
          emit(stage, { pos: purple.position, count: 10, color: '#c08aff', color2: '#ffffff', speed: 2, life: 0.5, size: 0.4, radius: 0.6 });
          // 經過每一格時炸開
          while (hit < 3 && purple.position.clone().sub(pts[hit]).dot(dir) > 0) {
            const p = pts[hit++];
            ring(stage, p, { color: '#b070ff', radius: 2.4, life: 0.5, width: 0.22 });
            emit(stage, { pos: p, count: 90, color: '#d6b8ff', color2: '#7a2bff', speed: 7, life: 0.6, size: 0.32 });
            stage.shake(0.3, 300);
            audio.sfx('impact', { pitch: 0.9 });
          }
        }
      },
    });
    later(stage, 500, () => audio.sfx('beam', { pitch: 0.6 }));
  });
}

/** 合體技：依陣營放大招。回傳在演出結束時 resolve 的 Promise。 */
export function unison(stage, line, faction, audio) {
  if (faction === 'rimuru') megiddo(stage, line, audio);
  else hollowPurple(stage, line, audio);
}

// ───────────────────────── 勝利 ─────────────────────────

/** 利姆路「暴食之王」：棋盤中央張開黑色漩渦，把對手的棋子全部吞掉。 */
function beelzebuth(stage, audio) {
  const pal = palette('rimuru');
  const center = new THREE.Vector3(0, 2.6, 0);
  const vortex = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#04000c', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  vortex.add(disc);
  const rims = [0, 1, 2].map(i => {
    const r = new THREE.Mesh(new THREE.RingGeometry(1 + i * 0.12, 1.06 + i * 0.12, 64, 1, 0, Math.PI * (1.2 + i * 0.3)), glowMat(i === 1 ? '#7a2bff' : pal.primary, 0.9));
    vortex.add(r);
    return r;
  });
  vortex.position.copy(center);
  vortex.lookAt(stage.camera.position);
  spawn(stage, vortex, {
    life: 4.6,
    update(k, _o, dt) {
      const open = k < 0.15 ? easeOut(k / 0.15) : k > 0.85 ? 1 - easeIn((k - 0.85) / 0.15) : 1;
      vortex.scale.setScalar(Math.max(0.001, open * 2.2));
      rims.forEach((r, i) => { r.rotation.z += dt * (3 + i * 1.5) * (i % 2 ? -1 : 1); });
      vortex.lookAt(stage.camera.position);
      if (k > 0.1 && k < 0.85 && Math.random() < 0.6) {
        converge(stage, center, { radius: 4.5, count: 14, color: pal.primary, color2: '#7a2bff', life: 0.5, size: 0.3 });
      }
    },
  });
  audio.sfx('charge', { pitch: 0.5 });
  audio.sfx('wind', { pitch: 0.5, delay: 0.3 });

  // 對手的棋子一個一個被吸進漩渦
  const victims = stage.cellsOf('gojo');
  victims.forEach((cell, n) => {
    later(stage, 700 + n * 350, () => {
      for (const obj of stage.takeCell(cell)) {
        if (!obj) continue;
        const from = obj.position.clone();
        const s0 = obj.scale.clone();
        spawn(stage, new THREE.Group(), {
          life: 0.9,
          update(k) {
            const e = easeIn(k);
            obj.position.lerpVectors(from, center, e);
            obj.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - e));
            obj.rotation.y += 0.3;
          },
        });
      }
      audio.sfx('whoosh', { pitch: 0.8 });
    });
  });

  later(stage, 4300, () => {
    flash(stage, center, { color: pal.primary, intensity: 60, distance: 16 });
    emit(stage, { pos: center, count: 160, color: pal.primary, color2: '#ffffff', speed: 7, life: 0.8, size: 0.32 });
    stage.shake(0.3, 400);
    audio.sfx('explode', { pitch: 0.7 });
  });
}

let domainTexture = null;
function makeDomainTexture() {
  if (domainTexture) return domainTexture;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#01030c';
  g.fillRect(0, 0, c.width, c.height);
  // 星雲
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 60 + Math.random() * 180;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const hue = Math.random() < 0.5 ? '120,170,255' : '190,140,255';
    grad.addColorStop(0, `rgba(${hue},0.35)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 無數的星點（資訊的洪流）
  for (let i = 0; i < 2600; i++) {
    const a = Math.random();
    g.fillStyle = `rgba(255,255,255,${0.3 + a * 0.7})`;
    const s = a > 0.97 ? 2.2 : 1;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, s, s);
  }
  domainTexture = new THREE.CanvasTexture(c);
  domainTexture.colorSpace = THREE.SRGBColorSpace;
  return domainTexture;
}

/** 五條悟 領域展開「無量空処」：畫面變成無限的星空，對手的棋子靜止、泛白、碎裂。 */
function unlimitedVoid(stage, audio) {
  const pal = palette('gojo');
  // 領域：從中心擴張的大球（從內側看）
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.MeshBasicMaterial({ map: makeDomainTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  spawn(stage, dome, {
    life: 6.5,
    update(k, _o, dt) {
      const open = Math.min(1, k / 0.12);
      dome.scale.setScalar(Math.max(0.01, easeOut(open)));
      dome.material.opacity = Math.min(1, k / 0.12);
      dome.rotation.y += dt * 0.05;
    },
  });
  later(stage, 100, () => { stage.scene.background.set('#01030c'); stage.scene.fog.density = 0.006; });
  for (let i = 0; i < 4; i++) ring(stage, new THREE.Vector3(0, 0, 0), { color: i % 2 ? pal.secondary : '#ffffff', radius: 12, life: 1.0, width: 0.03, delay: i * 0.15, y: 0.3 + i * 0.3 });
  flashScreen('#ffffff', 450);
  audio.sfx('sparkle', { pitch: 0.7 });
  audio.sfx('wind', { pitch: 0.4 });

  // 對手的棋子：凍結 → 泛白 → 碎裂
  const victims = stage.cellsOf('rimuru');
  later(stage, 1200, () => {
    for (const cell of victims) {
      for (const obj of stage.takeCell(cell)) {
        if (!obj) continue;
        obj.traverse(o => {
          if (o.material && o.material.color) o.material.color.set('#d8dce8');
          if (o.material && o.material.emissive) o.material.emissive.set('#000000');
        });
      }
    }
    audio.sfx('charge', { pitch: 0.4, gain: 0.6 });
  });
  victims.forEach((cell, n) => {
    later(stage, 2600 + n * 260, () => {
      const p = stage.cellCenter(cell).setY(0.8);
      emit(stage, { pos: p, count: 70, color: '#ffffff', color2: '#9fb4ff', speed: 4, gravity: -3, life: 1.0, size: 0.25, radius: 0.5 });
      ring(stage, p, { color: '#ffffff', radius: 1.4, life: 0.4, width: 0.05, y: -0.5 });
      audio.sfx('slash', { pitch: 1.6, gain: 0.5 });
      // 碎掉的立牌、棋子直接消失
      for (const child of [...stage.fxLayer.children]) {
        if (child.position.distanceTo(p) < 1.6 && (child.isSprite || child.type === 'Group' || child.isMesh) && child.userData.baseY !== undefined) {
          child.visible = false;
        }
      }
    });
  });
}

/** 勝利演出（約 6 秒）。 */
export function victory(stage, faction, audio) {
  if (faction === 'rimuru') beelzebuth(stage, audio);
  else unlimitedVoid(stage, audio);
}

// ───────────────────────── 和局 ─────────────────────────

/** 「神之怒」對撞「茈」：兩股力量在中心正面相撞，爆炸後兩邊都還站著。 */
export function drawClash(stage, audio) {
  const cam = stage.camera.position.clone();
  const toCam = cam.clone().setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCam).normalize();
  const mid = new THREE.Vector3(0, 2.2, 0);
  const left = mid.clone().addScaledVector(side, -6);
  const right = mid.clone().addScaledVector(side, 6);
  const rim = palette('rimuru'), gj = palette('gojo');

  const mk = (inner, outer) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), glowMat(inner, 0.95)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), glowMat(outer, 0.5)));
    return g;
  };
  const a = mk('#ffffff', rim.primary);
  const b = mk('#ffffff', '#9b4dff');
  audio.sfx('charge', { pitch: 0.8 });
  audio.sfx('charge', { pitch: 1.2, delay: 0.15 });

  later(stage, 600, () => {
    spawn(stage, a, { life: 0.9, update(k) { a.position.lerpVectors(left, mid, easeIn(k)); emit(stage, { pos: a.position, count: 6, color: rim.primary, speed: 1.5, life: 0.4, size: 0.3 }); } });
    spawn(stage, b, { life: 0.9, update(k) { b.position.lerpVectors(right, mid, easeIn(k)); emit(stage, { pos: b.position, count: 6, color: '#b070ff', speed: 1.5, life: 0.4, size: 0.3 }); } });
    audio.sfx('whoosh', { pitch: 0.6 });
  });

  // 對撞：先互相推擠，再大爆炸
  later(stage, 1500, () => {
    const clash = new THREE.Group();
    clash.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat('#ffffff', 0.8)));
    clash.position.copy(mid);
    spawn(stage, clash, {
      life: 1.4,
      update(k) {
        clash.scale.setScalar(0.6 + Math.sin(k * 40) * 0.12 + k * 0.6);
        if (Math.random() < 0.7) {
          emit(stage, { pos: mid.clone().addScaledVector(side, -0.6), count: 10, color: rim.primary, shape: 'cone', dir: side.clone().negate(), angle: 0.6, speed: 6, life: 0.4, size: 0.3 });
          emit(stage, { pos: mid.clone().addScaledVector(side, 0.6), count: 10, color: '#b070ff', shape: 'cone', dir: side.clone(), angle: 0.6, speed: 6, life: 0.4, size: 0.3 });
        }
      },
    });
    stage.shake(0.15, 1400);
    audio.sfx('beam', { pitch: 0.5 });
    audio.sfx('thunder', { delay: 0.5, gain: 0.6 });
  });

  later(stage, 2900, () => {
    flashScreen('#ffffff', 600);
    emit(stage, { pos: mid, count: 260, color: '#ffffff', color2: rim.primary, speed: 11, drag: 1.5, life: 1.0, size: 0.4 });
    emit(stage, { pos: mid, count: 160, color: '#b070ff', color2: gj.secondary, speed: 8, drag: 1.5, life: 1.1, size: 0.35 });
    for (let i = 0; i < 3; i++) ring(stage, new THREE.Vector3(0, 0, 0), { color: i === 1 ? '#b070ff' : rim.primary, radius: 7 + i * 2, life: 0.9, width: 0.05, delay: i * 0.1, y: 0.4 });
    flash(stage, mid, { color: '#ffffff', intensity: 90, distance: 20 });
    stage.shake(0.55, 700);
    audio.sfx('explode');
    audio.sfx('impact', { pitch: 0.6, delay: 0.05 });
  });
}

export { opponentOf };
