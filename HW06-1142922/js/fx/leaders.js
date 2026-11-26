// 兩大陣營的領袖演出：入場、合體技、勝利、和局對撞。
import * as THREE from 'three';
import { emit, ring, flash, orb, spawn, glowMat, wait, rand } from './common.js';

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

// ───────────────────────── 以下在 Task 10 完成 ─────────────────────────

export async function unison(stage, line, faction, audio) { await wait(10); }
export async function victory(stage, faction, audio) { await wait(10); }
export async function drawClash(stage, audio) { await wait(10); }

export { rand };
