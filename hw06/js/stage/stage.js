// Three.js 舞台：浮空九宮格、鏡頭、點擊判定、棋子與主角立牌。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { WORLDS, FACTIONS } from '../core/worlds.js';
import { makeQuadrantLights, makeSky, makeDust, makeArenaRings, makeShards, makeUnderside, makeSeams, makeLightShafts, bevelTileGeometry, makeClaimOverlay, makeBeamPillar } from './scenery.js';
import { makeStudioEnv, createMirror, brushedTexture, stoneRoughness, makeCrimsonCrystal, makeSixEyesCrystal, setCrystalQuality } from './look.js';

export const CELL = 2.4; // 格子加大 20%（使用者要求棋盤大一點）
export const GAP = 0.15;
export const STEP = CELL + GAP;
const TILE_TOP = 0.125;
const DEG = Math.PI / 180;
const FRAME_GLOW = 1.8; // 邊框發光線的 HDR 亮度（超過泛光門檻才會發光）
const DEFAULT_VIEW = { polar: 50 * DEG, azimuth: 0, distance: 16.5, target: new THREE.Vector3(0, 0, 0.5) };

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
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060d');
  scene.fog = new THREE.FogExp2('#05060d', 0.022);
  // 環境反射：攝影棚燈條，讓金屬、亮面、結晶有長條的真實高光
  scene.environment = makeStudioEnv(renderer);
  scene.environmentIntensity = 0.9;
  // 棋盤表面的即時鏡面反射（棋子、招式都會倒映在棋盤上）
  const mirror = createMirror(renderer, TILE_TOP);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 20 * DEG;
  controls.maxPolarAngle = 75 * DEG;
  controls.minDistance = 8;
  controls.maxDistance = 26;

  // ── 燈光 ──
  // 主光（暖白、投影）+ 冷色輪廓光 + 兩側陣營色補光
  scene.add(new THREE.HemisphereLight('#8aa4ff', '#0b0614', 0.35));
  const key = new THREE.DirectionalLight('#fff1dc', 2.4);
  key.position.set(5, 11, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 32 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  // 四個方位的方向燈（跟四方位天空對應）：血紅、藍紫、金色、深藍
  const quad = makeQuadrantLights();
  scene.add(quad.group);
  const accentL = new THREE.PointLight('#ff3347', 22, 12, 2);
  accentL.position.set(-5.5, 2.2, 1);
  const accentR = new THREE.PointLight('#8a5cff', 22, 12, 2);
  accentR.position.set(5.5, 2.2, 1);
  scene.add(accentL, accentR);

  // 特效閃光用的固定燈池：燈的數量不變，Three.js 就不用在招式放出來的瞬間重新編譯所有材質（原本卡頓的主因）
  const lightPool = Array.from({ length: 4 }, () => {
    const l = new THREE.PointLight('#ffffff', 0, 9, 2);
    l.userData.owner = null;
    scene.add(l);
    return l;
  });
  let poolCursor = 0;
  /** 借一盞特效燈；同時超過 4 個閃光時，最舊的那盞會被拿去用。 */
  function borrowLight() {
    const l = lightPool[poolCursor];
    poolCursor = (poolCursor + 1) % lightPool.length;
    const token = {};
    l.userData.owner = token;
    l.intensity = 0;
    return { light: l, owns: () => l.userData.owner === token };
  }

  // ── 背景：星雲天空、光塵、遠方的光環與浮空碎片、光柱 ──
  const uTime = { value: 0 }; // 場景美術共用的時間（GPU 動畫）
  const sky = makeSky(uTime);
  const dust = makeDust(uTime);
  const arena = makeArenaRings();
  const shards = makeShards();
  scene.add(sky, dust, arena.group, shards.mesh, makeLightShafts(uTime));

  // ── 平台與格子 ──
  const board = new THREE.Group();
  scene.add(board);
  board.add(makePlatform(mirror));
  const underside = makeUnderside(uTime, STEP * 3 + 0.6);
  board.add(underside.group);
  board.add(makeSeams(uTime, STEP, -0.14));

  const brushed = brushedTexture();
  const tileGeo = bevelTileGeometry(CELL, 0.25);
  const tiles = [];
  const cells = WORLDS.map(w => {
    const i = w.cell;
    const center = new THREE.Vector3(((i % 3) - 1) * STEP, 0, (Math.floor(i / 3) - 1) * STEP);
    // 側面：拉絲鈦金屬（異向高光）；表面：上了透明漆的亮面，會倒映棋子和招式
    const side = new THREE.MeshPhysicalMaterial({ color: '#2a3048', roughness: 0.32, metalness: 1, roughnessMap: brushed, anisotropy: 0.7, clearcoat: 0.4, clearcoatRoughness: 0.2 });
    const top = mirror.addMirror(new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.55, metalness: 0.05, emissive: '#ffffff', emissiveIntensity: 0.08,
      clearcoat: 0.35, clearcoatRoughness: 0.12, specularIntensity: 0.4, envMapIntensity: 0.35,
    }), { strength: 0.5, blur: 1.2 });
    const tile = new THREE.Mesh(tileGeo, [top, side]);
    tile.castShadow = true;
    tile.receiveShadow = true;
    tile.position.copy(center);
    tile.userData.cell = i;
    board.add(tile);
    tiles.push(tile);

    const frame = makeFrame(w.color);
    frame.position.y = TILE_TOP + 0.02;
    tile.add(frame);

    return { center, tile, top, frame, color: w.color, lift: 0, liftTarget: 0, dip: 0, dipVel: 0, piece: null, standee: null, claim: null };
  });

  const pieces = new THREE.Group();
  scene.add(pieces);

  /** 特效圖層：fx 模組把東西加在這裡。 */
  const fxLayer = new THREE.Group();
  scene.add(fxLayer);

  // ── 後製 ──
  // 後製用的畫面加上 4 倍多重取樣抗鋸齒（EffectComposer 預設沒有，邊緣會有鋸齒）
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  // 門檻設在 1 以上：只有真的會發光的東西（招式、光核、邊框）才泛光，棋盤本身保持清晰不霧
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 1.0);
  composer.addPass(bloom);
  // 衝擊後製：色差 + 放射模糊 + 閃白 + 暗角，命中時瞬間拉高再衰減
  const impactPass = new ShaderPass(IMPACT_SHADER);
  composer.addPass(impactPass);
  composer.addPass(new OutputPass());
  const fxPost = { aberration: 0, zoom: 0, flash: 0 };
  let useComposer = true;

  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    const high = quality === 'high';
    useComposer = high;
    renderer.shadowMap.enabled = high;
    key.castShadow = high;
    setCrystalQuality(pieces, high);
    perf.level = 0;
    applyPerf();
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }

  // ── 自動調整畫質：幀率掉下來就先降解析度、再關鏡面反射，順暢優先 ──
  // 等級：[解析度倍率, 鏡面反射解析度（0 = 關）]
  const PERF_LEVELS = [[1, 0.5], [0.85, 0.5], [0.75, 0.4], [0.65, 0.35], [0.6, 0]];
  const perf = { level: 0, sum: 0, n: 0, since: performance.now(), goodWindows: 0, fps: 60 };
  function applyPerf() {
    const [scaleRes, mirrorRes] = PERF_LEVELS[perf.level];
    const maxPR = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    renderer.setPixelRatio(Math.max(0.5, maxPR * (quality === 'high' ? scaleRes : 1)));
    mirror.enabled = quality === 'high' && mirrorRes > 0;
    mirror.scale = mirrorRes || 0.35;
    resize();
  }
  function trackPerf(rawDt) {
    if (quality !== 'high' || document.hidden || rawDt > 0.25) return; // 背景分頁、切換時的長間隔不算
    perf.sum += rawDt; perf.n++;
    const now = performance.now();
    if (now - perf.since < 1500 || perf.n < 20) return;
    const avg = perf.sum / perf.n;
    perf.fps = Math.round(1 / avg);
    perf.sum = 0; perf.n = 0; perf.since = now;
    if (avg > 1 / 42 && perf.level < PERF_LEVELS.length - 1) { perf.level++; perf.goodWindows = 0; applyPerf(); }
    else if (avg < 1 / 75 && perf.level > 0 && !camTween) {
      if (++perf.goodWindows >= 4) { perf.level--; perf.goodWindows = 0; applyPerf(); }
    } else perf.goodWindows = 0;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    mirror.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    camera.aspect = w / h;
    // 直式螢幕（手機）拉遠一點，整個棋盤才放得下
    baseFov = w < h ? 66 : 45;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  let baseFov = 45;
  window.addEventListener('resize', resize);

  // ── 每幀 ──
  const frameCbs = new Set();
  const tweens = new Set();
  const clock = new THREE.Clock();
  let camTween = null; // 同一時間只有一段鏡頭動畫

  function onFrame(cb) {
    frameCbs.add(cb);
    return () => frameCbs.delete(cb);
  }

  /** 在 ms 毫秒內每幀呼叫 fn(0..1)。回傳結束時 resolve 的 Promise。 */
  // 用真實時間計算進度（不是幀數），畫面卡頓或在背景時也會準時結束，跟演出時間軸同步
  function tween(ms, fn, { camera: isCamera = false } = {}) {
    let t;
    const p = new Promise(resolve => {
      t = { start: performance.now(), ms: Math.max(1, ms), fn, resolve, camera: isCamera };
      tweens.add(t);
      fn(0);
    });
    p.handle = t;
    return p;
  }

  // 每一幀：可以由 setAnimationLoop 驅動，也可以由開發工具手動呼叫 tick()
  let timeScale = 1;
  const mood = { bias: 0, winner: null };
  /** 天空與四方燈的氣氛。bias：-1 宿儺佔優 … +1 五條悟佔優；winner：'sukuna' | 'gojo' | null（結局時整片天空染色）。 */
  function setSkyMood({ bias = mood.bias, winner = mood.winner } = {}) {
    mood.bias = Math.max(-1, Math.min(1, bias));
    mood.winner = winner || null;
  }
  const frame = () => {
    const rawDt = clock.getDelta();
    trackPerf(rawDt);
    // 偶爾一幀特別久（例如切分頁）時不要讓粒子一口氣跳一大段，畫面比較順
    const dt = Math.min(rawDt, 0.05);
    // 命中停頓（hit-stop）：特效幾乎停住一瞬間，再平滑地加速回正常速度（不是突然跳回去），鏡頭和介面照常
    const target = performance.now() < hitStopUntil ? 0.06 : 1;
    timeScale += (target - timeScale) * (target < timeScale ? 1 : Math.min(1, dt * 14));
    const fxDt = dt * timeScale;
    for (const t of [...tweens]) {
      const k = Math.min(1, (performance.now() - t.start) / t.ms);
      try { t.fn(k); } catch (e) { console.error(e); }
      if (k >= 1) { tweens.delete(t); t.resolve(); }
    }
    for (const cb of [...frameCbs]) {
      try { cb(fxDt); } catch (e) { console.error(e); }
    }
    animateCells(dt);
    // 衝擊後製與鏡頭縮放衰減
    const decay = Math.exp(-dt * 7);
    fxPost.aberration *= decay; fxPost.zoom *= decay; fxPost.flash *= Math.exp(-dt * 10);
    impactPass.uniforms.uAberration.value = fxPost.aberration;
    impactPass.uniforms.uZoom.value = fxPost.zoom;
    impactPass.uniforms.uFlash.value = fxPost.flash;
    // 場景美術：時間、光環、碎片、符文陣、光塵
    uTime.value += dt;
    const T = uTime.value;
    arena.update(dt);
    shards.update(T);
    underside.update(T);
    dust.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    impactPass.uniforms.uTime.value = T;
    // 兩側陣營色的燈慢慢呼吸（錯開節奏）
    accentL.intensity = 22 * (0.8 + 0.2 * Math.sin(T * 0.9));
    accentR.intensity = 22 * (0.8 + 0.2 * Math.sin(T * 0.9 + 2.1));
    // 領域展開時背景換掉：星雲天空淡出，結束後再淡回來
    // 天空的氣氛：誰佔優勢那一側變亮；結局時整片染成勝方的顏色（平滑過渡）
    const sk = sky.material.uniforms;
    sk.uBias.value += (mood.bias - sk.uBias.value) * Math.min(1, dt * 1.5);
    sk.uOverAmt.value += ((mood.winner ? 0.85 : 0) - sk.uOverAmt.value) * Math.min(1, dt * 1.2);
    if (mood.winner) sk.uOver.value.set(mood.winner === 'sukuna' ? '#ff2a36' : '#9a6bff');
    const b = sk.uBias.value, over = sk.uOverAmt.value;
    const winS = mood.winner === 'sukuna' ? over : 0, winG = mood.winner === 'gojo' ? over : 0;
    quad.lights.crimson.intensity = quad.base.crimson * (1 + Math.max(-b, 0) * 0.9 + winS * 1.5) * (1 - winG * 0.6);
    quad.lights.violet.intensity = quad.base.violet * (1 + Math.max(b, 0) * 0.9 + winG * 1.5) * (1 - winS * 0.6);
    quad.lights.gold.intensity = quad.base.gold * (1 - over * 0.6);
    quad.lights.blue.intensity = quad.base.blue * (1 - over * 0.5);
    const skyTarget = scene.background.equals(env.background) ? 1 : 0;
    const su = sky.material.uniforms.uFade;
    su.value += (skyTarget - su.value) * Math.min(1, dt * 3);
    fovKick *= Math.exp(-dt * 6);
    if (Math.abs(camera.fov - (baseFov + fovKick)) > 0.01) { camera.fov = baseFov + fovKick; camera.updateProjectionMatrix(); }
    controls.enabled = !camTween; // 鏡頭動畫結束就自動還給玩家操作
    if (!camTween) controls.update();
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
    if (useComposer) {
      mirror.render(scene, camera);
      composer.render();
    } else renderer.render(scene, camera);
    if (shook) camera.position.sub(shakeOff);
  };
  renderer.setAnimationLoop(frame);

  let hitStopUntil = 0;
  let fovKick = 0;

  /**
   * 打擊感：命中停頓 + 鏡頭震動 + 鏡頭往內衝 + 色差 / 放射模糊 / 閃白 + 格子下沉回彈（周圍的格子依距離跟著震）。
   * power 約 0.5（小）～ 1.5（大招）。
   */
  function impact(cell, power = 1) {
    hitStopUntil = Math.max(hitStopUntil, performance.now() + 50 + 45 * power);
    shake(0.16 * power, 260 + 140 * power);
    fovKick = Math.min(fovKick, -2.6 * power);
    fxPost.aberration = Math.max(fxPost.aberration, 0.006 * power);
    fxPost.zoom = Math.max(fxPost.zoom, 0.045 * power);
    fxPost.flash = Math.max(fxPost.flash, 0.18 * power);
    if (cell >= 0 && cells[cell]) {
      const src = cells[cell].center;
      for (const c of cells) {
        const d = c.center.distanceTo(src);
        const kick = (c === cells[cell] ? 3.2 : 1.4 / (1 + d)) * power;
        setTimeout(() => { c.dipVel -= kick; }, d * 35);
      }
    }
  }

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
      // 受擊下沉後彈回（彈簧）
      c.dipVel += (-180 * c.dip - 14 * c.dipVel) * dt;
      c.dip += c.dipVel * dt;
      c.tile.position.y = c.center.y + c.lift + c.dip;
      if (c.piece) {
        const p = c.piece;
        p.position.y = c.lift + c.dip + p.userData.baseY + (p.userData.drop || 0) + Math.sin(t * 2.2 + c.center.x) * 0.06;
        p.rotation.y += dt * p.userData.spin;
        if (p.userData.update) p.userData.update(t);
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

  /** 開始一段鏡頭動畫；如果已經有一段在跑，先把舊的停掉（停在當下的位置）。 */
  function cameraTween(ms, fn) {
    if (camTween) { tweens.delete(camTween); camTween.resolve(); camTween = null; }
    controls.enabled = false;
    const p = tween(ms, fn, { camera: true });
    const handle = p.handle;
    camTween = handle;
    return p.finally(() => { if (camTween === handle) camTween = null; });
  }

  function moveCamera(toPos, toTarget, ms) {
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    return cameraTween(ms, k => {
      const e = ease(k);
      camera.position.lerpVectors(fromPos, toPos, e);
      controls.target.lerpVectors(fromTarget, toTarget, e);
      camera.lookAt(controls.target);
    });
  }

  function flyTo(i, ms = 700, distance = 9.5) {
    saveView();
    const target = cells[i].center.clone();
    const pos = viewToPosition({ polar: 52 * DEG, azimuth: currentAzimuth(), distance, target });
    return moveCamera(pos, target, ms);
  }

  function orbitLine(line, ms = 4000) {
    saveView();
    const target = line.reduce((v, i) => v.add(cells[i].center), new THREE.Vector3()).multiplyScalar(1 / line.length);
    const a0 = currentAzimuth();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    return cameraTween(ms, k => {
      const e = ease(k);
      const orbit = viewToPosition({ polar: 58 * DEG, azimuth: a0 + e * Math.PI * 0.9, distance: 13.5, target });
      const blend = Math.min(1, k * 4); // 前 25% 從原本的位置滑進軌道
      camera.position.lerpVectors(startPos, orbit, blend);
      controls.target.lerpVectors(startTarget, target, blend);
      camera.lookAt(controls.target);
    });
  }

  async function restoreView(ms = 600) {
    if (!saved) return;
    const { pos, target } = saved;
    saved = null;
    await moveCamera(pos, target, ms);
  }

  /** 跳過演出時：鏡頭直接回到原位。 */
  function snapBack() {
    for (const t of [...tweens]) {
      tweens.delete(t);
      if (!t.camera) { try { t.fn(1); } catch (e) { console.error(e); } } // 一般動畫直接跳到結尾
      t.resolve();
    }
    camTween = null;
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

  canvas.addEventListener('dblclick', () => { if (!camTween) resetView(); });

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
    const piece = faction === 'sukuna' ? makeCrimsonCrystal() : makeSixEyesCrystal();
    setCrystalQuality(piece, quality === 'high');
    piece.userData.faction = faction;
    piece.position.set(c.center.x + 0.62, 0, c.center.z + 0.62);
    piece.userData.baseY = TILE_TOP + 0.55;
    pieces.add(piece);
    c.piece = piece;
    claimCell(i, faction, piece);
    return piece;
  }

  /**
   * 佔領格子的演出：天上打下一道光柱 → 棋子沿著光柱落下 → 落地的衝擊波、閃光、格子下沉
   * → 陣營的領域紋路從中心擴散到整格（之後一直留著、緩慢呼吸）→ 邊框換成陣營色。
   */
  function claimCell(i, faction, piece) {
    const c = cells[i];
    const color = FACTIONS[faction].primary;
    const glowColor = faction === 'sukuna' ? '#ff3347' : '#9fc4ff';
    const finalScale = piece.scale.x;
    // 光柱
    const pillar = makeBeamPillar(uTime, glowColor);
    pillar.position.x = piece.position.x;
    pillar.position.z = piece.position.z;
    pillar.position.y += TILE_TOP;
    fxLayer.add(pillar);
    tween(900, k => {
      pillar.material.uniforms.uAlpha.value = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 1.5);
      pillar.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
      if (k >= 1 && pillar.parent) { pillar.parent.remove(pillar); dispose(pillar); }
    });
    // 棋子落下（加速），落地時壓扁再彈回
    piece.userData.drop = 4;
    piece.scale.setScalar(finalScale);
    tween(300, k => {
      piece.userData.drop = 4 * (1 - k * k);
      if (k >= 1) landed();
    });
    function landed() {
      piece.userData.drop = 0;
      tween(320, k => {
        const sq = Math.sin(k * Math.PI) * Math.exp(-k * 2.5) * 0.35;
        piece.scale.set(finalScale * (1 + sq), finalScale * (1 - sq), finalScale * (1 + sq));
      });
      impact(i, 0.5);
      // 閃光
      const slot = borrowLight();
      slot.light.color.set(glowColor);
      slot.light.distance = 9;
      slot.light.position.set(c.center.x, 1.2, c.center.z);
      tween(500, k => { if (slot.owns()) slot.light.intensity = k >= 1 ? 0 : 40 * Math.pow(1 - k, 2); });
      // 貼地的衝擊環
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(piece.position.x, TILE_TOP + 0.03, piece.position.z);
      fxLayer.add(ring);
      tween(550, k => {
        ring.scale.setScalar(0.1 + (1 - Math.pow(1 - k, 3)) * CELL * 0.6);
        ring.material.opacity = 1 - k;
        if (k >= 1 && ring.parent) { ring.parent.remove(ring); dispose(ring); }
      });
      // 領域紋路從中心擴散
      if (c.claim) { c.tile.remove(c.claim); dispose(c.claim); }
      const claim = makeClaimOverlay(uTime, CELL * 0.97, faction);
      claim.position.y = TILE_TOP + 0.004;
      c.tile.add(claim);
      c.claim = claim;
      tween(700, k => { claim.material.uniforms.uProgress.value = 1 - Math.pow(1 - k, 2); });
      setFrameColor(i, color);
    }
  }

  function removeClaim(c) {
    if (!c.claim) return;
    c.tile.remove(c.claim);
    dispose(c.claim);
    c.claim = null;
  }

  /**
   * 主角加入陣營：立繪只跳出來約 1 秒就淡出（不擋視線）；
   * 之後格子上只留陣營棋子，不放頭像（使用者要求）。
   */
  // 立繪貼圖快取：每張圖只建立、上傳到顯示卡一次（第一次跳出立繪時才不會卡一下）
  const standeeTex = new Map();
  function standeeTexture(image) {
    if (!standeeTex.has(image)) standeeTex.set(image, textureFrom(image));
    return standeeTex.get(image);
  }
  /** 封面時先把立繪上傳到顯示卡。 */
  function preloadImages(images) {
    for (const img of images) {
      try { renderer.initTexture(standeeTexture(img)); } catch (e) { console.warn('preloadImages', e); }
    }
  }

  function placeStandee(i, faction, image) {
    const c = cells[i];
    if (c.standee) return c.standee;
    const group = new THREE.Group();
    group.position.set(c.center.x - 0.25, 0, c.center.z - 0.2);
    group.userData.baseY = TILE_TOP + 0.02;

    // 暫時跳出來的立繪
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: standeeTexture(image), transparent: true, depthWrite: false, opacity: 0 }));
    const aspect = (image.width || 1) / (image.height || 1);
    const h = 1.6;
    sprite.scale.set(h * aspect, h, 1);
    sprite.center.set(0.5, 0);
    group.add(sprite);

    pieces.add(group);
    c.standee = group;
    tween(1500, k => {
      // 0–15% 升起淡入、15–70% 停留、70–100% 下沉淡出
      const show = k < 0.15 ? k / 0.15 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      sprite.material.opacity = show;
      sprite.position.y = (1 - Math.min(1, k / 0.15)) * -0.3 + (k > 0.7 ? -(k - 0.7) * 0.8 : 0);
      if (k >= 1 && sprite.parent) {
        group.remove(sprite);
        sprite.material.dispose(); // 貼圖留在快取裡，下次直接用
      }
    });
    return group;
  }

  function setFrameColor(i, color) {
    for (const m of cells[i].frame.children) m.material.color.set(color).multiplyScalar(FRAME_GLOW);
  }

  /**
   * 把某格的棋子和立牌交給特效（例如被吞噬、被粉碎）：
   * 物件移到特效層，之後 clearBoard 會一起清掉。回傳 [piece, standee]（可能是 null）。
   */
  function takeCell(i) {
    const c = cells[i];
    const out = [c.piece, c.standee];
    for (const o of out) {
      if (!o) continue;
      const world = new THREE.Vector3();
      o.getWorldPosition(world);
      pieces.remove(o);
      fxLayer.add(o);
      o.position.copy(world);
    }
    c.piece = null;
    c.standee = null;
    removeClaim(c);
    setFrameColor(i, c.color);
    return out;
  }

  /** 棋盤上被某陣營佔領的格子。 */
  function cellsOf(faction) {
    return cells.filter(c => c.piece && c.piece.userData.faction === faction).map(c => c.tile.userData.cell);
  }

  // 結局演出可能改背景（例如無量空處），重開時要還原
  const env = { background: scene.background.clone(), fog: scene.fog.density };
  function resetEnvironment() {
    scene.background.copy(env.background);
    scene.fog.density = env.fog;
    board.scale.setScalar(1);
    board.rotation.set(0, 0, 0);
    board.visible = true;
  }

  let fxGeneration = 0;
  const cancelHooks = new Set();
  /** 讓特效系統（例如粒子）在特效被全部取消時一起清空。 */
  function onCancelFx(fn) { cancelHooks.add(fn); return () => cancelHooks.delete(fn); }

  /**
   * 立刻停止所有特效：延遲特效不再觸發、每幀更新的特效停止、粒子清空、鏡頭不再震動。
   * 棋子和格子不動。
   */
  function cancelFx() {
    fxGeneration++; // 還沒觸發的延遲特效、正在跑的 spawn 看到世代變了就會停
    for (const child of [...fxLayer.children]) { fxLayer.remove(child); dispose(child); }
    for (const fn of cancelHooks) { try { fn(); } catch (e) { console.error(e); } }
    for (const l of lightPool) { l.intensity = 0; l.userData.owner = null; }
    shakeAmp = 0;
    hitStopUntil = 0;
    timeScale = 1;
    fovKick = 0;
    fxPost.aberration = fxPost.zoom = fxPost.flash = 0;
  }

  function clearBoard() {
    cancelFx();
    for (const c of cells) {
      if (c.piece) { pieces.remove(c.piece); dispose(c.piece); c.piece = null; }
      if (c.standee) { pieces.remove(c.standee); c.standee.traverse(o => { if (o.material) o.material.dispose(); }); c.standee = null; } // 立繪貼圖在快取裡，不 dispose
      removeClaim(c);
      setFrameColor(c.tile.userData.cell, c.color);
    }
    resetEnvironment();
  }

  /**
   * 預先編譯著色器：把各種特效會用到的物件放在畫面外，先讓 GPU 編好程式，
   * 第一次放招時就不會因為編譯而卡一下。
   */
  // 這些樣本之後一直留在場景裡（隱藏）：Three.js 在最後一個用到某個著色器的材質被丟掉時會把著色器刪掉，
  // 下一招又要重新編譯而卡一下；留一份在這裡，著色器就一直在。
  const keepAlive = new THREE.Group();
  keepAlive.position.set(0, -400, 0);
  scene.add(keepAlive);
  async function warmup(objects = []) {
    for (const o of [makeCrimsonCrystal(), makeSixEyesCrystal(), makeClaimOverlay(uTime, 1, 'gojo'), makeBeamPillar(uTime, '#ffffff'), ...objects]) {
      o.traverse(m => { m.frustumCulled = false; });
      keepAlive.add(o);
    }
    keepAlive.visible = true;
    try {
      // 要用跟實際繪製一樣的輸出目標編譯（後製畫面是線性色彩、不做色調映射，跟直接畫到螢幕的著色器版本不同）
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(useComposer ? composer.readBuffer : null);
      const p = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(prev);
      await p;
      // 顯示卡驅動要等「第一次真的畫」才把著色器準備完，所以用一台對著樣本的鏡頭，在畫面外真的畫一次
      const warmCam = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
      warmCam.position.set(0, -398, 6);
      warmCam.lookAt(0, -400, 0);
      const warmRT = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, samples: 4 });
      renderer.setRenderTarget(useComposer ? warmRT : null);
      renderer.render(scene, warmCam);
      renderer.setRenderTarget(prev);
      warmRT.dispose();
      frame(); // 再畫一幀正常畫面：陰影、後製用的著色器也一起準備好
    } catch (e) {
      console.warn('warmup', e);
    } finally {
      keepAlive.visible = false;
    }
  }

  setQuality(quality);
  setView(DEFAULT_VIEW);

  return {
    scene, camera, renderer, controls, fxLayer,
    cellCenter: i => cells[i].center.clone(),
    pickCell, setHover, setWorldImage, placePiece, placeStandee, clearBoard, takeCell, cellsOf, resetEnvironment, cancelFx, onCancelFx,
    onFrame, tween, flyTo, borrowLight, warmup, mirror, composer, bloom, setSkyMood, preloadImages,
    get perf() { return { level: perf.level, fps: perf.fps, pixelRatio: renderer.getPixelRatio(), mirror: mirror.enabled }; },
    /** 開發用：停掉自動更新，改成手動推進（瀏覽器暫停動畫時截圖用）。 */
    manualTick(on) { renderer.setAnimationLoop(on ? null : frame); return frame; }, orbitLine, restoreView, snapBack, resetView, setQuality, shake, impact,
    get quality() { return quality; },
    get fxGeneration() { return fxGeneration; },
    get isCinematic() { return !!camTween; },
  };
}

// ───────────────────────── 衝擊後製 ─────────────────────────

const IMPACT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0 },
    uZoom: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAberration, uZoom, uFlash, uTime;
    float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.31) * 43758.5453); }
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec3 col = vec3(0.0);
      if (uZoom < 0.002 && uAberration < 0.0003) {
        col = texture2D(tDiffuse, vUv).rgb; // 平常沒有衝擊時只取一次樣，省效能
      } else {
        // 放射模糊（往畫面中心衝）+ 色差（紅藍往外分開）
        for (int i = 0; i < 6; i++) {
          float k = 1.0 - float(i) / 6.0 * uZoom;
          vec2 uv = 0.5 + dir * k;
          col.r += texture2D(tDiffuse, uv + dir * uAberration).r;
          col.g += texture2D(tDiffuse, uv).g;
          col.b += texture2D(tDiffuse, uv - dir * uAberration).b;
        }
        col /= 6.0;
      }
      col *= 1.0 + uFlash * 2.0; // 閃光只加亮原本的顏色，不會蒙上一層灰
      float vig = smoothstep(0.85, 0.25, length(dir));
      col *= mix(1.0, vig, 0.35);
      // 調色：暗部偏冷藍、亮部微暖，畫面比較有電影感
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.93, 0.98, 1.08), vec3(1.04, 1.0, 0.96), smoothstep(0.05, 0.6, luma));
      // 很淡的底片顆粒（只在暗部明顯）
      col += (grain(vUv * 1000.0) - 0.5) * 0.018 * (1.0 - smoothstep(0.0, 0.4, luma));
      col = max(col, 0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

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
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); // 共用幾何不丟
    if (o.material) {
      for (const m of [].concat(o.material)) {
        if (m.userData && m.userData.shared) continue; // 共用材質不丟
        if (m.map && m.map.dispose) m.map.dispose();
        m.dispose();
      }
    }
  });
}

function makeFrame(color) {
  const g = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(FRAME_GLOW), toneMapped: false });
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

function makePlatform(mirror) {
  const g = new THREE.Group();
  const size = STEP * 3 + 0.6;
  // 拋光的黑曜石平台：亮面、帶細紋，也會倒映棋子和招式
  const rough = stoneRoughness();
  rough.repeat.set(2, 2);
  const stone = mirror.addMirror(new THREE.MeshPhysicalMaterial({
    color: '#0b0d18', roughness: 0.22, roughnessMap: rough, metalness: 0.35,
    clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.3, sheenColor: '#4a3a8a',
  }), { strength: 0.75, blur: 1.6 });
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.74, size * 0.6, 0.9, 8, 1), stone);
  slab.receiveShadow = true;
  slab.rotation.y = Math.PI / 8;
  slab.position.y = -0.62;
  g.add(slab);
  // 邊緣：拋光的金屬鑲邊 + 發光線
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.745, size * 0.745, 0.06, 8, 1, true),
    new THREE.MeshPhysicalMaterial({ color: '#c9ccd8', metalness: 1, roughness: 0.12, clearcoat: 0.5, side: THREE.DoubleSide }),
  );
  trim.rotation.y = Math.PI / 8;
  trim.position.y = -0.2;
  g.add(trim);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.74, 0.03, 8, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#6f7cff').multiplyScalar(2), toneMapped: false }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.24;
  g.add(rim);
  return g;
}

