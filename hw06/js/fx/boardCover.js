// 暫時覆蓋整個棋盤的特效（原創）：從命中的格子往外擴散，蓋滿九格一段時間後退去。
//  - fireSea：火海（火龍的咆哮）
//  - stormField：電場（超電磁砲）
import * as THREE from 'three';
import { emit, flash, later, spawn, arcs, bolt, rand } from './common.js';
import { energyMaterial } from './realism.js';

const TILE_TOP = 0.125;
const HALF = 4.1; // 棋盤半寬（含一點邊）

/** 貼著棋盤的一片流動能量，從 origin 往外擴散成整片，停留後淡出。 */
function coverPlane(stage, origin, opts, { life = 1.6, grow = 0.25, hold = 0.7 } = {}) {
  const mat = energyMaterial(stage, opts);
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mat);
  m.rotation.x = -Math.PI / 2;
  // 以棋盤中心為圓心擴散，九格都蓋得到；起點稍微往命中的格子偏，看得出是從那裡開始的
  m.position.set(origin.x * 0.25, TILE_TOP + 0.06, origin.z * 0.25);
  const full = HALF * 1.42;
  return spawn(stage, m, {
    life,
    update(k) {
      const g = Math.min(1, k / grow);
      m.scale.setScalar(Math.max(0.01, full * (1 - Math.pow(1 - g, 3))));
      // 擴散 → 停留 → 退去
      mat.uniforms.uOpacity.value = opts.opacity * (k < hold ? 1 : 1 - (k - hold) / (1 - hold));
    },
  });
}

/** 棋盤上隨機一點。 */
function randomOnBoard() {
  return new THREE.Vector3(rand(-HALF, HALF), TILE_TOP + 0.1, rand(-HALF, HALF));
}

/** 火海：從 origin 擴散到整個棋盤，到處竄出火舌，約 1.6 秒後退去。 */
export function fireSea(stage, origin, { mul = 1, delay = 0 } = {}) {
  later(stage, delay, () => {
    coverPlane(stage, origin, { c1: '#ffe9a0', c2: '#ff2a00', scroll: 3, scale: [6, 6], fresnel: 0, threshold: 0.3, opacity: 0.85, twist: 0.3 }, { life: 1.7, grow: 0.22, hold: 0.65 });
    coverPlane(stage, origin, { c1: '#ffb347', c2: '#8a1400', scroll: -2, scale: [3, 9], fresnel: 0, threshold: 0.35, opacity: 0.6 }, { life: 1.9, grow: 0.3, hold: 0.6 });
    flash(stage, new THREE.Vector3(0, 0.5, 0), { color: '#ff6a1f', intensity: 45, distance: 14, life: 1.2 });
    // 整片火舌：一波一波從棋盤各處竄起
    for (let w = 0; w < 6; w++) {
      later(stage, 80 + w * 170, () => {
        for (let i = 0; i < 9; i++) {
          emit(stage, { pos: randomOnBoard(), count: 10 * mul, color: '#ffd27a', color2: '#ff3b1f', shape: 'up', angle: 0.3, speed: rand(2.5, 4.5), gravity: 3, drag: 0.5, life: 0.65, size: 0.55, radius: 0.4, alpha: 0.85 });
        }
      });
    }
  });
}

/** 電場：從 origin 擴散到整個棋盤，閃電在格子之間跳來跳去，約 1.3 秒後消散。 */
export function stormField(stage, origin, { mul = 1, delay = 0 } = {}) {
  later(stage, delay, () => {
    coverPlane(stage, origin, { c1: '#e6f6ff', c2: '#2f6bff', scroll: 9, scale: [10, 10], fresnel: 0, threshold: 0.3, opacity: 0.95 }, { life: 1.35, grow: 0.15, hold: 0.6 });
    coverPlane(stage, origin, { c1: '#bfe8ff', c2: '#1a3cff', scroll: -14, scale: [4, 16], fresnel: 0, threshold: 0.34, opacity: 0.7, twist: 1.2 }, { life: 1.25, grow: 0.12, hold: 0.55 });
    flash(stage, new THREE.Vector3(0, 0.6, 0), { color: '#9fd0ff', intensity: 50, distance: 14, life: 0.9 });
    // 格子之間跳動的閃電
    for (let w = 0; w < 7; w++) {
      later(stage, 40 + w * 140, () => {
        for (let i = 0; i < 3; i++) {
          const a = randomOnBoard(), b = randomOnBoard();
          a.y = b.y = TILE_TOP + rand(0.15, 0.5);
          bolt(stage, a, b, { color: i % 2 ? '#bfe8ff' : '#6fb0ff', width: 0.04, life: 0.22, segments: 10, jag: 0.5 });
        }
        arcs(stage, randomOnBoard(), { count: 3 * mul, radius: 0.9, color: '#cfeaff', life: 0.25, width: 0.03 });
      });
    }
  });
}
