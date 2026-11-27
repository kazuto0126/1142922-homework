// 質感特效：流動的能量材質、煙霧、拉長的火花、會彈跳的碎石、地面焦痕，以及把它們組合起來的「命中」。
import * as THREE from 'three';
import { emit, ring, flash, spawn, later, rand } from './common.js';

const TILE_TOP = 0.125;

// ───────────────────────── 能量材質（流動的雜訊 + 邊緣發光） ─────────────────────────

const NOISE = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }`;

const energyMats = new Set();
let clockStarted = false;

/**
 * 會流動的能量材質（加法混合）。
 * c1：亮部顏色、c2：暗部顏色、scroll：沿 uv.y 流動的速度、scale：雜訊尺度、
 * fresnel：邊緣發光強度、fadeV：沿 uv.y 兩端淡出（火焰、光束用）。
 */
export function energyMaterial(stage, { c1 = '#ffffff', c2 = '#3388ff', scroll = 1.5, scale = [3, 3], fresnel = 1.0, threshold = 0.35, fadeV = 0, opacity = 1, twist = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uC1: { value: new THREE.Color(c1) },
      uC2: { value: new THREE.Color(c2) },
      uScroll: { value: scroll },
      uScale: { value: new THREE.Vector2(...scale) },
      uFresnel: { value: fresnel },
      uThreshold: { value: threshold },
      uFadeV: { value: fadeV },
      uTwist: { value: twist },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime, uScroll, uFresnel, uThreshold, uFadeV, uTwist, uOpacity;
      uniform vec2 uScale; uniform vec3 uC1, uC2;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        uv.x += uv.y * uTwist;
        // 兩層扭曲雜訊：火舌、能量流的紋理
        vec3 q = vec3(uv * uScale + vec2(0.0, -uTime * uScroll), uTime * 0.6);
        float w = fbm(q * 1.7 + vec3(0.0, uTime * 0.8, 0.0));
        float n = fbm(q + vec3(w * 1.6, w * 0.8, 0.0));
        float fr = pow(1.0 - abs(dot(vN, vView)), 2.0) * uFresnel;
        float e = smoothstep(uThreshold + 0.12, uThreshold + 0.42, n + fr * 0.35);
        float fade = uFadeV > 0.0 ? smoothstep(0.0, uFadeV, vUv.y) * smoothstep(1.0, 1.0 - uFadeV, vUv.y) : 1.0;
        vec3 col = mix(uC2, uC1, e * e) * (0.26 + 0.95 * e);
        gl_FragColor = vec4(col, clamp(e * 0.8 + fr * 0.15, 0.0, 1.0) * fade * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  energyMats.add(mat);
  mat.addEventListener('dispose', () => energyMats.delete(mat));
  if (!clockStarted) {
    clockStarted = true;
    stage.onFrame(dt => { for (const m of energyMats) m.uniforms.uTime.value += dt; });
  }
  return mat;
}

// ───────────────────────── 煙霧（一般混合、會長大變淡） ─────────────────────────

const smokeSystems = new WeakMap();

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeSystem(stage) {
  if (smokeSystems.has(stage)) return smokeSystems.get(stage);
  const N = 600;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N), rot = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('rgba', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('rot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: smokeTexture() }, pixelRatio: { value: 1 } },
    vertexShader: `
      attribute float size; attribute vec4 rgba; attribute float rot;
      uniform float pixelRatio; varying vec4 vC; varying float vR;
      void main() { vC = rgba; vR = rot; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio * (320.0 / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D uTex; varying vec4 vC; varying float vR;
      void main() { vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR);
        p = mat2(c, -s, s, c) * p + 0.5; vec4 t = texture2D(uTex, p);
        gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  stage.scene.add(points);
  const vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), s0 = new Float32Array(N), a0 = new Float32Array(N), spin = new Float32Array(N);
  let cursor = 0;
  const upload = () => { for (const k of ['position', 'rgba', 'size', 'rot']) geo.attributes[k].needsUpdate = true; };
  stage.onCancelFx(() => { life.fill(0); col.fill(0); size.fill(0); upload(); });
  stage.onFrame(dt => {
    mat.uniforms.pixelRatio.value = stage.renderer.getPixelRatio();
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) { life[i] = 0; col[i * 4 + 3] = 0; size[i] = 0; any = true; continue; }
      any = true;
      const k = age[i] / life[i];
      const damp = Math.max(0, 1 - 1.8 * dt);
      vel[i * 3] *= damp; vel[i * 3 + 2] *= damp; vel[i * 3 + 1] = vel[i * 3 + 1] * damp + 0.6 * dt;
      for (let j = 0; j < 3; j++) pos[i * 3 + j] += vel[i * 3 + j] * dt;
      size[i] = s0[i] * (0.5 + 1.5 * Math.sqrt(k));
      col[i * 4 + 3] = a0[i] * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k);
      rot[i] += spin[i] * dt;
    }
    if (any) upload();
  });
  const sys = {
    spawn(p, v, c, sz, l, a) {
      const i = cursor; cursor = (cursor + 1) % N;
      pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3);
      col.set([c.r, c.g, c.b, 0], i * 4);
      s0[i] = sz; a0[i] = a; age[i] = 0; life[i] = l; rot[i] = Math.random() * 6.28; spin[i] = rand(-1, 1);
    },
  };
  smokeSystems.set(stage, sys);
  return sys;
}

/** 一團煙（不發光，會往上飄、長大、變淡）。 */
export function smoke(stage, pos, { count = 18, color = '#3a3a44', size = 1.6, life = 1.6, speed = 1.6, alpha = 0.55, radius = 0.5 } = {}) {
  const sys = smokeSystem(stage);
  const n = Math.round(count * (stage.quality === 'low' ? 0.5 : 1));
  const c = new THREE.Color(color);
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    p.set(pos.x + Math.cos(a) * radius * Math.random(), pos.y + rand(0, 0.3), pos.z + Math.sin(a) * radius * Math.random());
    v.set(Math.cos(a) * speed * rand(0.4, 1), rand(0.2, 1) * speed * 0.5, Math.sin(a) * speed * rand(0.4, 1));
    const shade = c.clone().multiplyScalar(rand(0.75, 1.25));
    sys.spawn(p, v, shade, size * rand(0.7, 1.3), life * rand(0.8, 1.2), alpha);
  }
}

// ───────────────────────── 火花（依速度拉長的線段） ─────────────────────────

const sparkSystems = new WeakMap();

function sparkSystem(stage) {
  if (sparkSystems.has(stage)) return sparkSystems.get(stage);
  const N = 900;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  stage.scene.add(lines);
  const p = new Float32Array(N * 3), v = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), base = new Float32Array(N * 3), grav = new Float32Array(N);
  let cursor = 0;
  const upload = () => { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; };
  stage.onCancelFx(() => { life.fill(0); col.fill(0); upload(); });
  stage.onFrame(dt => {
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      any = true;
      age[i] += dt;
      const k = age[i] / life[i];
      if (k >= 1) { life[i] = 0; col.fill(0, i * 6, i * 6 + 6); continue; }
      v[i * 3 + 1] += grav[i] * dt;
      const damp = Math.max(0, 1 - 1.2 * dt);
      for (let j = 0; j < 3; j++) { v[i * 3 + j] *= damp; p[i * 3 + j] += v[i * 3 + j] * dt; }
      if (p[i * 3 + 1] < TILE_TOP && v[i * 3 + 1] < 0) { p[i * 3 + 1] = TILE_TOP; v[i * 3 + 1] *= -0.35; }
      const tail = 0.045;
      for (let j = 0; j < 3; j++) { pos[i * 6 + j] = p[i * 3 + j]; pos[i * 6 + 3 + j] = p[i * 3 + j] - v[i * 3 + j] * tail; }
      const b = (1 - k) * 1.6;
      for (let j = 0; j < 3; j++) { col[i * 6 + j] = base[i * 3 + j] * b; col[i * 6 + 3 + j] = base[i * 3 + j] * b * 0.2; }
    }
    if (any) upload();
  });
  const sys = {
    spawn(pp, vv, c, l, g) {
      const i = cursor; cursor = (cursor + 1) % N;
      p.set([pp.x, pp.y, pp.z], i * 3); v.set([vv.x, vv.y, vv.z], i * 3);
      base.set([c.r, c.g, c.b], i * 3); age[i] = 0; life[i] = l; grav[i] = g;
    },
  };
  sparkSystems.set(stage, sys);
  return sys;
}

/** 一把火花：四散、受重力、碰到地板會彈。dir 有給時往那個方向偏。 */
export function sparks(stage, pos, { count = 60, color = '#ffd27a', speed = 9, life = 0.6, gravity = -14, dir = null, spread = 1 } = {}) {
  const sys = sparkSystem(stage);
  const n = Math.round(count * (stage.quality === 'low' ? 0.5 : 1));
  const c = new THREE.Color(color);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(spread);
    if (dir) v.add(dir.clone().normalize());
    v.normalize().multiplyScalar(speed * rand(0.4, 1.1));
    sys.spawn(pos, v, c.clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.5), life * rand(0.6, 1.2), gravity);
  }
}

// ───────────────────────── 碎石（有影子、會彈跳） ─────────────────────────

const debrisSystems = new WeakMap();

function debrisSystem(stage) {
  if (debrisSystems.has(stage)) return debrisSystems.get(stage);
  const N = 160;
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.08, 0),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0.1 }),
    N,
  );
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stage.scene.add(mesh);
  const p = new Float32Array(N * 3), v = new Float32Array(N * 3), r = new Float32Array(N * 3), w = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), sc = new Float32Array(N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, new THREE.Color('#888888')); }
  let cursor = 0;
  stage.onCancelFx(() => { life.fill(0); for (let i = 0; i < N; i++) mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; });
  stage.onFrame(dt => {
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      any = true;
      age[i] += dt;
      const k = age[i] / life[i];
      if (k >= 1) { life[i] = 0; mesh.setMatrixAt(i, zero); continue; }
      v[i * 3 + 1] -= 16 * dt;
      for (let j = 0; j < 3; j++) { p[i * 3 + j] += v[i * 3 + j] * dt; r[i * 3 + j] += w[i * 3 + j] * dt; }
      // 只有棋盤範圍內有地板；飛出去的碎石會繼續往下掉
      const onBoard = Math.abs(p[i * 3]) < 4.0 && Math.abs(p[i * 3 + 2]) < 4.0; // 棋盤半寬約 3.9
      const floor = TILE_TOP + 0.05 * sc[i];
      if (onBoard && p[i * 3 + 1] < floor) {
        p[i * 3 + 1] = floor;
        if (v[i * 3 + 1] < 0) v[i * 3 + 1] *= -0.38;
        v[i * 3] *= 0.7; v[i * 3 + 2] *= 0.7;
        for (let j = 0; j < 3; j++) w[i * 3 + j] *= 0.7;
      }
      const shrink = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      e.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]);
      m.compose(t.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), q.setFromEuler(e), s.setScalar(sc[i] * shrink));
      mesh.setMatrixAt(i, m);
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  });
  const sys = {
    spawn(pp, vv, color, size, l) {
      const i = cursor; cursor = (cursor + 1) % N;
      p.set([pp.x, pp.y, pp.z], i * 3); v.set([vv.x, vv.y, vv.z], i * 3);
      r.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3); w.set([rand(-12, 12), rand(-12, 12), rand(-12, 12)], i * 3);
      age[i] = 0; life[i] = l; sc[i] = size;
      mesh.setColorAt(i, color);
      mesh.instanceColor.needsUpdate = true;
    },
  };
  debrisSystems.set(stage, sys);
  return sys;
}

/** 碎石：從 pos 炸開，落在棋盤上彈跳、最後縮小消失。 */
export function debris(stage, pos, { count = 24, color = '#6b6577', power = 1, life = 1.8 } = {}) {
  const sys = debrisSystem(stage);
  const n = Math.round(count * (stage.quality === 'low' ? 0.5 : 1));
  const base = new THREE.Color(color);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    v.set(Math.cos(a) * rand(1, 4) * power, rand(3, 7) * power, Math.sin(a) * rand(1, 4) * power);
    sys.spawn(pos, v, base.clone().multiplyScalar(rand(0.6, 1.3)), rand(0.6, 1.6), life * rand(0.8, 1.2));
  }
}

// ───────────────────────── 地面焦痕 ─────────────────────────

let scorchTex = null;
function scorchTexture() {
  if (scorchTex) return scorchTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)');
  gr.addColorStop(0.55, 'rgba(10,6,4,0.6)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  // 放射狀裂痕
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    g.lineWidth = rand(1, 3);
    g.beginPath(); g.moveTo(64, 64);
    let x = 64, y = 64;
    for (let k = 0; k < 4; k++) { x += Math.cos(a + rand(-0.4, 0.4)) * rand(8, 16); y += Math.sin(a + rand(-0.4, 0.4)) * rand(8, 16); g.lineTo(x, y); }
    g.stroke();
  }
  scorchTex = new THREE.CanvasTexture(c);
  return scorchTex;
}

/** 地板上的焦痕 + 一圈還在發光的邊，慢慢淡掉。 */
export function scorch(stage, pos, { radius = 1.1, glow = '#ff7a2a', life = 2.4 } = {}) {
  const g = new THREE.Group();
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  dark.rotation.x = -Math.PI / 2;
  const hot = new THREE.Mesh(new THREE.RingGeometry(radius * 0.25, radius * 0.6, 40), new THREE.MeshBasicMaterial({ color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  hot.rotation.x = -Math.PI / 2;
  hot.position.y = 0.003;
  g.add(dark, hot);
  g.position.set(pos.x, TILE_TOP + 0.012, pos.z);
  g.rotation.y = Math.random() * 6.28;
  return spawn(stage, g, {
    life,
    update(k) {
      dark.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      hot.material.opacity = Math.max(0, 1 - k * 2.2);
    },
  });
}

/** 能量衝擊波：一圈貼地擴散的流動能量。 */
export function shockwave(stage, pos, { radius = 2.6, c1 = '#ffffff', c2 = '#66aaff', life = 0.55, height = 0.5 } = {}) {
  const mat = energyMaterial(stage, { c1, c2, scroll: -3, scale: [8, 2], fresnel: 0.3, threshold: 0.2, fadeV: 0.35 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, height, 48, 1, true), mat);
  m.position.set(pos.x, TILE_TOP + height / 2, pos.z);
  return spawn(stage, m, {
    life,
    update(k) {
      const r = 0.2 + radius * (1 - Math.pow(1 - k, 3));
      m.scale.set(r, 1 - k * 0.6, r);
      mat.uniforms.uOpacity.value = 1 - k;
    },
  });
}

// ───────────────────────── 命中（打擊感一次到位） ─────────────────────────

/**
 * 招式打中格子的那一刻：鏡頭與後製衝擊、格子下沉、火花、碎石、煙、焦痕、衝擊波、閃光。
 * power：0.6 小招 / 1 一般 / 1.4 大招。
 */
export function hit(fx, { power = 1, color = null, smokeColor = '#3a3a44', debrisColor = null, scorched = true, at = null } = {}) {
  const { stage, cell, mul } = fx;
  const pos = at || fx.pos;
  const c = color || fx.color;
  const p = power * (fx.big ? 1.25 : 1);
  stage.impact(cell, p);
  flash(stage, pos, { color: c, intensity: 18 * p, distance: 7 });
  sparks(stage, pos.clone().setY(pos.y + 0.25), { count: 70 * mul * p, color: c, speed: 9 * p });
  debris(stage, pos.clone().setY(TILE_TOP + 0.1), { count: 22 * p, color: debrisColor || '#5a5566', power: p });
  later(stage, 60, () => smoke(stage, pos.clone().setY(TILE_TOP + 0.1), { count: 16 * p, color: smokeColor, size: 1.4 * p, radius: 0.6 }));
  shockwave(stage, pos, { radius: 2.4 * p, c1: '#ffffff', c2: c instanceof THREE.Color ? '#' + c.getHexString() : c });
  ring(stage, pos, { color: c, radius: 2.8 * p, life: 0.45, width: 0.08, y: 0.06 });
  emit(stage, { pos: pos.clone().setY(pos.y + 0.3), count: 40 * mul, color: '#ffffff', color2: c, speed: 6 * p, life: 0.35, size: 0.28 });
  if (scorched) scorch(stage, pos, { radius: 1.0 * p, glow: c instanceof THREE.Color ? '#' + c.getHexString() : c });
}
