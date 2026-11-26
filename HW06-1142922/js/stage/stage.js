// Three.js 舞台：浮空九宮格、鏡頭、點擊判定、棋子與主角立牌。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLDS, FACTIONS } from '../core/worlds.js';

export const CELL = 2;
export const GAP = 0.15;
export const STEP = CELL + GAP;
const TILE_TOP = 0.125;
const DEG = Math.PI / 180;
const DEFAULT_VIEW = { polar: 50 * DEG, azimuth: 0, distance: 12.5, target: new THREE.Vector3(0, 0, 0.4) };

export function supportsWebGL() {
  if (new URLSearchParams(location.search).has('nowebgl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch {
    return false;
  }
}

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function createStage(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060d');
  scene.fog = new THREE.FogExp2('#05060d', 0.028);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 20 * DEG;
  controls.maxPolarAngle = 75 * DEG;
  controls.minDistance = 6;
  controls.maxDistance = 16;

  // ── 燈光 ──
  scene.add(new THREE.HemisphereLight('#9fb8ff', '#120a1e', 0.9));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  // ── 背景星空 ──
  scene.add(makeStars());

  // ── 平台與格子 ──
  const board = new THREE.Group();
  scene.add(board);
  board.add(makePlatform());

  const tiles = [];
  const cells = WORLDS.map(w => {
    const i = w.cell;
    const center = new THREE.Vector3(((i % 3) - 1) * STEP, 0, (Math.floor(i / 3) - 1) * STEP);
    const side = new THREE.MeshStandardMaterial({ color: '#1a1d2e', roughness: 0.7, metalness: 0.3 });
    const top = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0.05, emissive: '#ffffff', emissiveIntensity: 0.22 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.25, CELL), [side, side, top, side, side, side]);
    tile.position.copy(center);
    tile.userData.cell = i;
    board.add(tile);
    tiles.push(tile);

    const frame = makeFrame(w.color);
    frame.position.y = TILE_TOP + 0.02;
    tile.add(frame);

    return { center, tile, top, frame, color: w.color, lift: 0, liftTarget: 0, piece: null, standee: null };
  });

  const pieces = new THREE.Group();
  scene.add(pieces);

  /** 特效圖層：fx 模組把東西加在這裡。 */
  const fxLayer = new THREE.Group();
  scene.add(fxLayer);

  // ── 後製 ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useComposer = true;

  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    useComposer = quality === 'high';
    renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    resize();
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    // 直式螢幕（手機）拉遠一點，整個棋盤才放得下
    camera.fov = w < h ? 60 : 45;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ── 每幀 ──
  const frameCbs = new Set();
  const tweens = new Set();
  const clock = new THREE.Clock();
  let cinematic = 0;

  function onFrame(cb) {
    frameCbs.add(cb);
    return () => frameCbs.delete(cb);
  }

  /** 在 ms 毫秒內每幀呼叫 fn(0..1)。回傳結束時 resolve 的 Promise。 */
  function tween(ms, fn, { camera: isCamera = false } = {}) {
    return new Promise(resolve => {
      const t = { elapsed: 0, ms: Math.max(1, ms), fn, resolve, camera: isCamera };
      tweens.add(t);
      fn(0);
    });
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const t of [...tweens]) {
      t.elapsed += dt * 1000;
      const k = Math.min(1, t.elapsed / t.ms);
      try { t.fn(k); } catch (e) { console.error(e); }
      if (k >= 1) { tweens.delete(t); t.resolve(); }
    }
    for (const cb of [...frameCbs]) {
      try { cb(dt); } catch (e) { console.error(e); }
    }
    animateCells(dt);
    if (!cinematic) controls.update();
    let shook = false;
    if (shakeAmp > 0) {
      shakeT += dt;
      const k = shakeT / shakeDur;
      if (k >= 1) shakeAmp = 0;
      else {
        const a = shakeAmp * (1 - k);
        shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        camera.position.add(shakeOff);
        shook = true;
      }
    }
    if (useComposer) composer.render(); else renderer.render(scene, camera);
    if (shook) camera.position.sub(shakeOff);
  });

  let shakeAmp = 0, shakeT = 0, shakeDur = 1;
  const shakeOff = new THREE.Vector3();
  /** 鏡頭震動。amp：震幅（世界單位），ms：長度。 */
  function shake(amp = 0.2, ms = 300) {
    shakeAmp = Math.max(shakeAmp, amp);
    shakeDur = ms / 1000;
    shakeT = 0;
  }

  const now = performance.now();
  function animateCells(dt) {
    const t = (performance.now() - now) / 1000;
    for (const c of cells) {
      c.lift += (c.liftTarget - c.lift) * Math.min(1, dt * 12);
      c.tile.position.y = c.center.y + c.lift;
      if (c.piece) {
        const p = c.piece;
        p.position.y = c.lift + p.userData.baseY + Math.sin(t * 2.2 + c.center.x) * 0.06;
        p.rotation.y += dt * p.userData.spin;
      }
      if (c.standee) c.standee.position.y = c.lift + c.standee.userData.baseY;
    }
  }

  // ── 鏡頭 ──
  function viewToPosition({ polar, azimuth, distance, target }) {
    const s = new THREE.Spherical(distance, polar, azimuth);
    return new THREE.Vector3().setFromSpherical(s).add(target);
  }

  function setView(view) {
    controls.target.copy(view.target);
    camera.position.copy(viewToPosition(view));
    camera.lookAt(controls.target);
    controls.update();
  }

  function currentAzimuth() {
    const off = camera.position.clone().sub(controls.target);
    return new THREE.Spherical().setFromVector3(off).theta;
  }

  let saved = null;
  function saveView() {
    if (!saved) saved = { pos: camera.position.clone(), target: controls.target.clone() };
  }

  function moveCamera(toPos, toTarget, ms) {
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    cinematic++;
    controls.enabled = false;
    return tween(ms, k => {
      const e = ease(k);
      camera.position.lerpVectors(fromPos, toPos, e);
      controls.target.lerpVectors(fromTarget, toTarget, e);
      camera.lookAt(controls.target);
    }, { camera: true }).finally(() => { cinematic = Math.max(0, cinematic - 1); });
  }

  function flyTo(i, ms = 700) {
    saveView();
    const target = cells[i].center.clone();
    const pos = viewToPosition({ polar: 52 * DEG, azimuth: currentAzimuth(), distance: 6.5, target });
    return moveCamera(pos, target, ms);
  }

  function orbitLine(line, ms = 4000) {
    saveView();
    const target = line.reduce((v, i) => v.add(cells[i].center), new THREE.Vector3()).multiplyScalar(1 / line.length);
    const a0 = currentAzimuth();
    cinematic++;
    controls.enabled = false;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    return tween(ms, k => {
      const e = ease(k);
      const orbit = viewToPosition({ polar: 58 * DEG, azimuth: a0 + e * Math.PI * 0.9, distance: 9, target });
      const blend = Math.min(1, k * 4); // 前 25% 從原本的位置滑進軌道
      camera.position.lerpVectors(startPos, orbit, blend);
      controls.target.lerpVectors(startTarget, target, blend);
      camera.lookAt(controls.target);
    }, { camera: true }).finally(() => { cinematic = Math.max(0, cinematic - 1); });
  }

  async function restoreView(ms = 600) {
    if (!saved) { controls.enabled = true; return; }
    const { pos, target } = saved;
    saved = null;
    await moveCamera(pos, target, ms);
    if (!cinematic) controls.enabled = true;
  }

  /** 跳過演出時：鏡頭直接回到原位。 */
  function snapBack() {
    for (const t of [...tweens]) {
      tweens.delete(t);
      if (!t.camera) { try { t.fn(1); } catch (e) { console.error(e); } } // 一般動畫直接跳到結尾
      t.resolve();
    }
    cinematic = 0;
    if (saved) {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      camera.lookAt(controls.target);
      saved = null;
    }
    controls.enabled = true;
  }

  function resetView() {
    snapBack();
    setView(DEFAULT_VIEW);
  }

  canvas.addEventListener('dblclick', () => { if (!cinematic) resetView(); });

  // ── 點擊判定 ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickCell(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(tiles, false)[0];
    return hit ? hit.object.userData.cell : -1;
  }

  let hovered = -1;
  function setHover(i) {
    if (i === hovered) return;
    if (hovered >= 0) cells[hovered].liftTarget = 0;
    hovered = i;
    if (i >= 0) cells[i].liftTarget = 0.14;
  }

  // ── 格子內容 ──
  function setWorldImage(i, image) {
    const tex = textureFrom(image);
    const c = cells[i];
    c.top.map = tex;
    c.top.emissiveMap = tex;
    c.top.needsUpdate = true;
  }

  function placePiece(i, faction) {
    const c = cells[i];
    if (c.piece) return c.piece;
    const piece = faction === 'rimuru' ? makeSlimeCrystal() : makeSixEyesCrystal();
    piece.position.set(c.center.x + 0.55, 0, c.center.z + 0.55);
    piece.userData.baseY = TILE_TOP + 0.45;
    pieces.add(piece);
    c.piece = piece;
    setFrameColor(i, FACTIONS[faction].primary);
    piece.scale.setScalar(0.001);
    tween(380, k => piece.scale.setScalar(Math.max(0.001, backOut(k))));
    return piece;
  }

  function placeStandee(i, faction, image) {
    const c = cells[i];
    if (c.standee) return c.standee;
    const group = new THREE.Group();
    group.position.set(c.center.x - 0.2, 0, c.center.z - 0.25);
    group.userData.baseY = TILE_TOP + 0.02;

    const tex = textureFrom(image);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    const aspect = (image.width || 1) / (image.height || 1);
    const h = 1.75;
    sprite.scale.set(h * aspect, h, 1);
    sprite.center.set(0.5, 0);
    group.add(sprite);

    // 陣營色的底座光環
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: FACTIONS[faction].primary, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);

    pieces.add(group);
    c.standee = group;
    tween(300, k => { sprite.material.opacity = k; });
    return group;
  }

  function setFrameColor(i, color) {
    for (const m of cells[i].frame.children) m.material.color.set(color);
  }

  function clearBoard() {
    for (const c of cells) {
      if (c.piece) { pieces.remove(c.piece); dispose(c.piece); c.piece = null; }
      if (c.standee) { pieces.remove(c.standee); dispose(c.standee); c.standee = null; }
      setFrameColor(c.tile.userData.cell, c.color);
    }
    for (const child of [...fxLayer.children]) { fxLayer.remove(child); dispose(child); }
  }

  setQuality(quality);
  setView(DEFAULT_VIEW);

  return {
    scene, camera, renderer, controls, fxLayer,
    cellCenter: i => cells[i].center.clone(),
    pickCell, setHover, setWorldImage, placePiece, placeStandee, clearBoard,
    onFrame, tween, flyTo, orbitLine, restoreView, snapBack, resetView, setQuality, shake,
    get quality() { return quality; },
    get isCinematic() { return cinematic > 0; },
  };
}

// ───────────────────────── 造型 ─────────────────────────

function textureFrom(image) {
  const tex = image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(image) : new THREE.Texture(image);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function backOut(k) {
  const s = 1.70158;
  return 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
}

function dispose(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of [].concat(o.material)) {
        if (m.map && m.map.dispose) m.map.dispose();
        m.dispose();
      }
    }
  });
}

function makeFrame(color) {
  const g = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const t = 0.06, len = CELL;
  const bars = [
    [len, t, 0, -len / 2], [len, t, 0, len / 2],
    [t, len, -len / 2, 0], [t, len, len / 2, 0],
  ];
  for (const [w, d, x, z] of bars) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat());
    m.position.set(x, 0, z);
    g.add(m);
  }
  return g;
}

function makePlatform() {
  const g = new THREE.Group();
  const size = STEP * 3 + 0.6;
  const slab = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.74, size * 0.6, 0.9, 8, 1),
    new THREE.MeshStandardMaterial({ color: '#141729', roughness: 0.6, metalness: 0.5 }),
  );
  slab.rotation.y = Math.PI / 8;
  slab.position.y = -0.62;
  g.add(slab);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.74, 0.04, 8, 64),
    new THREE.MeshBasicMaterial({ color: '#6f7cff', toneMapped: false }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.17;
  g.add(rim);
  return g;
}

function makeStars() {
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 60 + Math.random() * 60;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 1.6 - 0.6);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.35, sizeAttenuation: true, fog: false }));
  return stars;
}

function makeSlimeCrystal() {
  const geo = new THREE.SphereGeometry(0.32, 32, 20);
  geo.scale(1, 0.78, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#3fd0ff', emissive: '#1a6fff', emissiveIntensity: 0.9,
    roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88,
  }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: '#bff4ff', toneMapped: false }));
  mesh.add(core);
  mesh.userData.spin = 0.6;
  return mesh;
}

function makeSixEyesCrystal() {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({
    color: '#f2f6ff', emissive: '#8a5cff', emissiveIntensity: 1.1,
    roughness: 0.2, metalness: 0.4, flatShading: true,
  }));
  mesh.scale.set(0.85, 1.25, 0.85);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: '#b9a0ff', toneMapped: false }),
  );
  halo.rotation.x = Math.PI / 2;
  mesh.add(halo);
  mesh.userData.spin = 1.4;
  return mesh;
}
