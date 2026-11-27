// 棋盤上的「看得見的演算法」：
//  - 電腦思考：一道掃描光掃過所有空格，最後鎖定它選的那一格（原本每格浮出的勝／和／敗字樣，使用者覺得不好看，拿掉了）。
//  - 危機警示：只差一格就連線的格子會脈動發光、閃出裂痕（用威脅那一方的陣營色），並有心跳聲。
import * as THREE from 'three';
import { FACTIONS } from '../core/worlds.js';
import { makeBeamPillar } from './scenery.js';

const TILE_TOP = 0.125;

/** 鎖定框：旋轉的虛線圈 + 四個角括號。 */
function reticle(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const seg = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 8, 1, (i / 12) * Math.PI * 2, Math.PI / 12), mat);
    ring.add(seg);
  }
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const corners = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.06), mat);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.42), mat);
    a.position.set(0.18, 0, 0); b.position.set(0, 0.18, 0);
    const corner = new THREE.Group();
    corner.add(a, b);
    corner.rotation.z = (i * Math.PI) / 2;
    corner.position.set(Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 1.2, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 1.2, 0);
    corners.add(corner);
  }
  corners.rotation.x = -Math.PI / 2;
  g.add(corners);
  g.userData = { ring, corners, mat };
  return g;
}

/** 危機警示的貼地光：外框脈動 + 閃爍的裂痕。 */
function threatOverlay(uTime, size, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv - 0.5;
        float edge = max(abs(p.x), abs(p.y));
        float beat = pow(max(0.5 + 0.5 * sin(uTime * 6.0), 1e-4), 3.0);          // 心跳般的脈動
        float frame = smoothstep(0.40, 0.49, edge) * (0.5 + 1.5 * beat);
        // 往內收縮的方框（像在倒數）
        float shrink = fract(uTime * 0.9);
        float inner = smoothstep(0.02, 0.0, abs(edge - (0.48 - shrink * 0.4))) * (1.0 - shrink);
        // 閃爍的裂痕
        vec2 q = p * 6.0;
        float crack = smoothstep(0.05, 0.0, abs(fract(q.x + q.y * 0.6 + hash(floor(q)) * 0.6) - 0.5))
                    * step(0.55, hash(floor(q) + floor(uTime * 8.0)));
        float k = frame + inner * 1.2 + crack * 0.6 * beat;
        gl_FragColor = vec4(uColor * k * 1.8 * uAlpha, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function createBoardHud(stage, { cellSize = 2.4 } = {}) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const uTime = { value: 0 };
  stage.onFrame(dt => { uTime.value += dt; });
  let token = 0;
  let scan = null;
  let lock = null;
  const threatMeshes = new Map(); // cell → mesh

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const disposeObj = o => o.traverse(x => {
    if (x.geometry) x.geometry.dispose();
    if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); }
  });

  function clearInsight() {
    token++;
    if (scan) { group.remove(scan); disposeObj(scan); scan = null; }
    if (lock) { group.remove(lock); disposeObj(lock); lock = null; }
  }

  /**
   * 電腦思考的演出：掃描光掃過所有空格 → 鎖定 choice。insight 只用來決定要掃哪些格子。
   * 回傳 Promise（被 clearInsight 中斷時也會結束）。sfx：播放音效的函式。
   */
  async function think(insight, choice, { sfx = () => {}, faction = 'sukuna' } = {}) {
    clearInsight();
    const my = token;
    const alive = () => my === token;
    const color = FACTIONS[faction].primary;
    // ② 掃描光依序掃過所有空格
    scan = makeBeamPillar(uTime, color);
    group.add(scan);
    const path = insight.map(x => x.cell);
    for (const cell of path) {
      if (!alive()) return;
      const c = stage.cellCenter(cell);
      scan.position.set(c.x, TILE_TOP + 3.5, c.z);
      sfx('hover', { pitch: 2, gain: 0.35 });
      await wait(95);
    }
    if (!alive()) return;
    const target = stage.cellCenter(choice);
    scan.position.set(target.x, TILE_TOP + 3.5, target.z);
    // ③ 鎖定框從大縮到格子大小
    lock = reticle(color);
    lock.position.set(target.x, TILE_TOP + 0.05, target.z);
    group.add(lock);
    sfx('charge', { pitch: 1.6, gain: 0.7 });
    await new Promise(resolve => {
      stage.tween(420, k => {
        if (!lock) return;
        const e = 1 - Math.pow(1 - k, 3);
        lock.scale.setScalar((2.2 - 1.2 * e) * cellSize / 2.4);
        lock.userData.ring.rotation.z = k * 4;
        lock.userData.mat.opacity = Math.min(1, k * 2);
        if (k >= 1) resolve();
      });
    });
    if (!alive()) return;
    sfx('impact', { pitch: 1.4, gain: 0.6 });
    stage.impact(choice, 0.25);
    await wait(320);
  }

  /**
   * 設定危機警示。list：[{ cell, faction }]。已經有的保留，不在清單裡的淡出移除，新出現的有心跳聲。
   */
  function setThreats(list, { sfx = () => {} } = {}) {
    const want = new Map(list.map(t => [t.cell, t.faction]));
    for (const [cell, mesh] of threatMeshes) {
      if (want.get(cell) === mesh.userData.faction) continue;
      threatMeshes.delete(cell);
      stage.tween(250, k => {
        mesh.material.uniforms.uAlpha.value = 1 - k;
        if (k >= 1) { group.remove(mesh); disposeObj(mesh); }
      });
    }
    let fresh = false;
    for (const [cell, faction] of want) {
      if (threatMeshes.has(cell)) continue;
      const mesh = threatOverlay(uTime, cellSize * 0.98, faction === 'sukuna' ? '#ff3347' : '#8fb4ff');
      mesh.userData.faction = faction;
      const c = stage.cellCenter(cell);
      mesh.position.set(c.x, TILE_TOP + 0.008, c.z);
      group.add(mesh);
      threatMeshes.set(cell, mesh);
      stage.tween(350, k => { mesh.material.uniforms.uAlpha.value = k; });
      fresh = true;
    }
    if (fresh) {
      // 心跳兩下
      sfx('impact', { pitch: 0.35, gain: 0.7 });
      setTimeout(() => sfx('impact', { pitch: 0.32, gain: 0.55 }), 190);
    }
  }

  function clearAll() {
    clearInsight();
    for (const [, mesh] of threatMeshes) { group.remove(mesh); disposeObj(mesh); }
    threatMeshes.clear();
  }

  return { think, clearInsight, setThreats, clearAll };
}
