// 場景美術（原創設計）：星雲天空、浮游光塵、遠方的巨大光環與浮空黑曜石碎片、
// 多層的浮空平台、旋轉的符文圓陣、格子之間流動的光縫、從上方灑下的光柱。
// 全部用 GPU 著色器動畫（傳一個 uTime），每幀幾乎不花 CPU。
import * as THREE from 'three';

const NOISE = `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; } return v; }`;

// ───────────────────────── 天空 ─────────────────────────

/** 星雲天空：左邊偏紅（宿儺）、右邊偏紫（五條悟），中間深藍；會閃的星星；整片緩慢流動。 */
export function makeSky(uTime) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uFade: { value: 1 } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // 永遠在最遠處
      }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform float uTime, uFade;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // 底色：天頂深、地平線帶一點藍
        vec3 col = mix(vec3(0.012, 0.016, 0.04), vec3(0.004, 0.005, 0.014), smoothstep(-0.1, 0.8, h));
        col = mix(col, vec3(0.002, 0.002, 0.006), smoothstep(0.0, -0.6, h));
        // 星雲：兩層雜訊，沿著地平線的寬帶
        vec3 q = d * 2.6 + vec3(uTime * 0.006, 0.0, uTime * 0.004);
        float n = fbm(q + fbm(q * 1.7) * 0.9);
        float band = smoothstep(-0.35, 0.15, h) * smoothstep(0.85, 0.1, h);
        float cloud = smoothstep(0.42, 0.85, n) * band;
        vec3 red = vec3(0.55, 0.05, 0.10), purple = vec3(0.30, 0.12, 0.62), blue = vec3(0.08, 0.16, 0.45);
        float side = d.x * 0.5 + 0.5;
        vec3 neb = mix(red, blue, smoothstep(0.1, 0.5, side));
        neb = mix(neb, purple, smoothstep(0.5, 0.9, side));
        col += neb * cloud * 0.55;
        col += neb * spow(cloud, 3.0) * 0.6; // 星雲最亮的核心
        // 星星：每一格最多一顆，會閃
        vec3 sp = d * 220.0;
        vec3 cell = floor(sp);
        float r = hash3(cell);
        if (r > 0.985) {
          vec3 c = cell + 0.5 + (vec3(hash3(cell + 1.3), hash3(cell + 2.7), hash3(cell + 4.1)) - 0.5) * 0.6;
          float dist = length(sp - c);
          float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 6.0) + r * 80.0);
          float star = smoothstep(0.35, 0.0, dist) * tw * (r > 0.997 ? 2.2 : 0.8);
          col += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.75), hash3(cell + 9.0)) * star * smoothstep(-0.2, 0.1, h);
        }
        gl_FragColor = vec4(col * uFade, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ───────────────────────── 浮游光塵 ─────────────────────────

/** 在棋盤周圍緩慢往上飄、會閃爍的光塵（位置完全在 GPU 算）。 */
export function makeDust(uTime, count = 420) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 1] = Math.random() * 14 - 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, pixelRatio: { value: 1 } },
    vertexShader: `
      attribute float seed;
      uniform float uTime, pixelRatio;
      varying float vA; varying float vS;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + 5.0 + uTime * (0.15 + seed * 0.25), 14.0) - 5.0;
        p.x += sin(uTime * 0.3 + seed * 30.0) * 0.6;
        p.z += cos(uTime * 0.25 + seed * 20.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float edge = smoothstep(-5.0, -3.5, p.y) * smoothstep(9.0, 6.0, p.y);
        vA = edge * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.0 + seed * 3.0) + seed * 50.0)));
        vS = seed;
        gl_PointSize = (0.6 + seed * 1.4) * pixelRatio * (60.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      varying float vA; varying float vS;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = mix(vec3(0.7, 0.8, 1.0), vS < 0.3 ? vec3(1.0, 0.45, 0.5) : vec3(0.75, 0.6, 1.0), 0.5);
        gl_FragColor = vec4(c * 1.3, a * a * vA * 0.8);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ───────────────────────── 遠景：巨大光環與浮空碎片 ─────────────────────────

/** 圍著競技場的巨大光環（細線、虛線、刻度環），各自慢慢轉。回傳 { group, update(dt) }。 */
export function makeArenaRings() {
  const group = new THREE.Group();
  const rings = [];
  const glow = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const add = (mesh, tilt, speed) => {
    const holder = new THREE.Group();
    holder.rotation.set(tilt[0], tilt[1], tilt[2]);
    holder.add(mesh);
    group.add(holder);
    rings.push({ mesh, speed });
  };
  // 實線大環
  add(new THREE.Mesh(new THREE.TorusGeometry(15, 0.035, 6, 200), glow('#6f7cff', 0.9)), [Math.PI / 2 + 0.12, 0, 0.05], 0.02);
  // 刻度環：很多小方塊排成一圈
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.02, 0.5), glow('#a8b4ff', 0.8), 120);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    p.set(Math.cos(a) * 19, 0, Math.sin(a) * 19);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    s.set(1, 1, i % 10 === 0 ? 2.2 : 1);
    ticks.setMatrixAt(i, m.compose(p, q, s));
  }
  add(ticks, [0.18, 0, -0.1], -0.012);
  group.position.y = -1.5;
  return {
    group,
    update(dt) { for (const r of rings) r.mesh.rotation.z += r.speed * dt; },
  };
}

/** 浮在遠處、緩慢上下漂浮自轉的黑曜石碎片。回傳 { mesh, update(t) }。 */
export function makeShards(count = 26) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshPhysicalMaterial({ color: '#141626', roughness: 0.25, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const data = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const r = 17 + Math.random() * 14;
    data.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r, y: -7 + Math.random() * 9,
      s: new THREE.Vector3(0.3 + Math.random() * 0.9, 0.4 + Math.random() * 1.6, 0.3 + Math.random() * 0.9),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: (Math.random() - 0.5) * 0.3, bob: Math.random() * 6,
    });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), e = new THREE.Euler();
  function update(t) {
    for (let i = 0; i < count; i++) {
      const d = data[i];
      e.set(d.rot.x + t * d.spin, d.rot.y + t * d.spin * 0.7, d.rot.z);
      p.set(d.x, d.y + Math.sin(t * 0.4 + d.bob) * 0.35, d.z);
      mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), d.s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}

// ───────────────────────── 平台 ─────────────────────────

/** 原創的符文圓陣貼圖：同心圓、刻度、隨機產生的幾何符號（不是任何真實文字）。 */
function runeTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  const circle = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  circle(500, 6); circle(470, 2); circle(330, 3); circle(318, 1.5);
  // 刻度
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2, long = i % 5 === 0;
    g.lineWidth = long ? 3 : 1.5;
    g.beginPath();
    g.moveTo(Math.cos(a) * 470, Math.sin(a) * 470);
    g.lineTo(Math.cos(a) * (long ? 440 : 455), Math.sin(a) * (long ? 440 : 455));
    g.stroke();
  }
  // 符號帶：每個符號由幾條隨機的直線、弧線、點組成
  const N = 36;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -385);
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const t = Math.random();
      g.beginPath();
      if (t < 0.45) { g.moveTo(-18 + Math.random() * 36, -30 + Math.random() * 20); g.lineTo(-18 + Math.random() * 36, 5 + Math.random() * 25); }
      else if (t < 0.8) { g.arc(0, Math.random() * 20 - 10, 10 + Math.random() * 12, Math.random() * 3, 3 + Math.random() * 3); }
      else { g.arc(Math.random() * 24 - 12, Math.random() * 40 - 20, 4, 0, Math.PI * 2); g.fill(); }
      g.stroke();
    }
    g.restore();
  }
  // 內部的幾何星形
  g.lineWidth = 2.5;
  for (const [n, r] of [[8, 300], [5, 300]]) {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i * (n === 8 ? 3 : 2) / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * 平台底下的部分（主平台本身在 stage.js）：往下收窄的兩層岩台、發光接縫、底部的發光結晶、
 * 繞著平台轉的兩個符文圓陣。回傳 { group, update(t, dt) }。
 */
export function makeUnderside(uTime, size) {
  const group = new THREE.Group();
  const rock = new THREE.MeshPhysicalMaterial({ color: '#0d0f1c', roughness: 0.55, metalness: 0.3, clearcoat: 0.4, flatShading: true });
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.58, size * 0.42, 0.9, 8, 1), rock);
  tier2.rotation.y = Math.PI / 8;
  tier2.position.y = -1.5;
  const tier3 = new THREE.Mesh(new THREE.ConeGeometry(size * 0.42, 3.2, 8, 3), rock);
  tier3.rotation.set(Math.PI, Math.PI / 8, 0);
  tier3.position.y = -3.55;
  // 把錐體的頂點弄亂一點，看起來像天然岩石
  const pa = tier3.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    if (Math.abs(pa.getY(i)) < 1.5) { pa.setX(i, pa.getX(i) * (0.85 + Math.random() * 0.3)); pa.setZ(i, pa.getZ(i) * (0.85 + Math.random() * 0.3)); }
  }
  tier3.geometry.computeVertexNormals();
  group.add(tier2, tier3);

  // 發光接縫（HDR，會泛光）
  const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7f8cff').multiplyScalar(1.6), toneMapped: false });
  const seam = new THREE.Mesh(new THREE.TorusGeometry(size * 0.58, 0.025, 6, 96), seamMat);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -1.06;
  group.add(seam);
  // 底部的發光結晶
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8f6bff').multiplyScalar(2.2), toneMapped: false }));
  core.scale.set(1, 1.8, 1);
  core.position.y = -5.6;
  group.add(core);

  // 符文圓陣（加法混合、會呼吸）
  const tex = runeTexture();
  const runeMat = (color, k) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uColor: { value: new THREE.Color(color).multiplyScalar(k) }, uTime, uPhase: { value: Math.random() * 6 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform sampler2D map; uniform vec3 uColor; uniform float uTime, uPhase; varying vec2 vUv;
      void main() {
        float a = texture2D(map, vUv).a;
        float pulse = 0.7 + 0.3 * sin(uTime * 1.2 + uPhase);
        // 一道光沿著圓陣繞圈掃過
        float ang = atan(vUv.y - 0.5, vUv.x - 0.5);
        float sweep = spow(0.5 + 0.5 * sin(ang - uTime * 0.9 + uPhase), 12.0);
        gl_FragColor = vec4(uColor * (pulse + sweep * 1.5), a * (0.55 + sweep * 0.45));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.75, size * 1.75), runeMat('#6f7cff', 1.25));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.95;
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.05, size * 1.05), runeMat('#b07cff', 1.3));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = -2.05;
  group.add(outer, inner);

  return {
    group,
    update(t) {
      outer.rotation.z = t * 0.05;
      inner.rotation.z = -t * 0.09;
      core.rotation.y = t * 0.6;
      core.position.y = -5.6 + Math.sin(t * 0.8) * 0.15;
    },
  };
}

/** 格子之間的光縫：沿著縫隙流動的光脈衝。step：格子間距；y：高度。 */
export function makeSeams(uTime, step, y) {
  const group = new THREE.Group();
  const len = step * 3;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color('#9fb4ff') } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float flow = spow(0.5 + 0.5 * sin(vUv.x * 18.0 - uTime * 2.4), 8.0);
        float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        float k = across * ends * (0.35 + flow * 1.6);
        gl_FragColor = vec4(uColor * k * 1.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (const off of [-step / 2, step / 2]) {
    for (const axis of ['x', 'z']) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.09), mat);
      m.rotation.x = -Math.PI / 2;
      if (axis === 'z') m.rotation.z = Math.PI / 2;
      if (axis === 'x') m.position.z = off; else m.position.x = off;
      m.position.y = y;
      group.add(m);
    }
  }
  return group;
}

/** 從上方斜斜灑下來的淡淡光柱（加法混合、會緩慢流動）。 */
export function makeLightShafts(uTime) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      varying vec2 vUv; varying float vFace;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // 光柱邊緣（側面朝向鏡頭的角度小）淡掉，看起來才像一團光而不是一片牆
        vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform float uTime; varying vec2 vUv; varying float vFace;
      ${NOISE}
      void main() {
        float n = vnoise(vec3(vUv.x * 14.0, vUv.y * 2.0 - uTime * 0.15, uTime * 0.05));
        float fadeY = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float a = fadeY * spow(vFace, 3.0) * (0.35 + 0.65 * n) * 0.022;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  for (const [x, z, r, tilt] of [[-1.5, -1, 1.6, 0.18], [1.8, 0.6, 1.2, 0.22], [0.2, 2.2, 0.9, 0.15]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 1.6, 16, 24, 1, true), mat);
    cone.position.set(x + 2.5, 7.5, z + 1.5);
    cone.rotation.set(-tilt, 0, tilt);
    group.add(cone);
  }
  return group;
}

/** 有圓角斜邊的格子（斜邊會接到高光，比方塊真實）。材質群組 0 = 上下面、1 = 側面與斜邊。 */
export function bevelTileGeometry(cell, height) {
  const r = 0.14, b = 0.035;
  const h = cell / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h); shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r); shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h); shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r); shape.quadraticCurveTo(-h, -h, -h + r, -h);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -height / 2 + b, 0);
  // 上下面的貼圖座標換成 0..1（跟原本方塊的上表面方向一樣）
  const uv = geo.attributes.uv;
  const capCount = geo.groups[0].count;
  const idx = geo.index;
  const done = new Set();
  for (let i = geo.groups[0].start; i < geo.groups[0].start + capCount; i++) {
    const v = idx ? idx.getX(i) : i;
    if (done.has(v)) continue;
    done.add(v);
    uv.setXY(v, (uv.getX(v) + h) / cell, (uv.getY(v) + h) / cell);
  }
  return geo; // 法線用 ExtrudeGeometry 本身算好的（斜邊才會是平滑的）
}

// ───────────────────────── 佔領格子 ─────────────────────────

/**
 * 佔領的領域紋路（蓋在格子表面）：從中心往外擴散。
 * 五條悟（kind 0）：同心的漣漪 + 六角格；宿儺（kind 1）：交錯的紅色斬痕、會閃。
 * uProgress 0→1 是擴散進度；之後保持在 1，紋路繼續緩慢呼吸，一眼看得出這格是誰的。
 */
export function makeClaimOverlay(uTime, size, faction) {
  const gojo = faction !== 'sukuna';
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uProgress: { value: 0 },
      uAlpha: { value: 1 },
      uKind: { value: gojo ? 0 : 1 },
      uColor: { value: new THREE.Color(gojo ? '#9fc4ff' : '#ff3347') },
      uColor2: { value: new THREE.Color(gojo ? '#7a4dff' : '#7a0012') },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform float uTime, uProgress, uAlpha, uKind; uniform vec3 uColor, uColor2;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float line(float x, float w) { return smoothstep(w, 0.0, abs(fract(x) - 0.5)); }
      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 1.4142;
        float front = uProgress * 1.15;
        float inside = smoothstep(front, front - 0.1, d);
        float wave = smoothstep(0.1, 0.0, abs(d - front)) * (1.0 - smoothstep(0.85, 1.0, uProgress));
        float pat;
        if (uKind < 0.5) {
          // 無限的漣漪 + 六角格
          float rip = spow(0.5 + 0.5 * sin(d * 46.0 - uTime * 3.2), 8.0);
          vec2 q = p * 10.0;
          q.y += mod(floor(q.x), 2.0) * 0.5;
          vec2 f = abs(fract(q) - 0.5);
          float hex = smoothstep(0.43, 0.49, max(f.x * 1.2 + f.y * 0.55, f.y));
          pat = rip * 0.75 + hex * 0.35 * (0.6 + 0.4 * sin(uTime * 2.0 + d * 8.0));
        } else {
          // 交錯的斬痕：兩組斜線，每一段隨機斷開，會閃
          float a = (p.x * 0.85 + p.y) * 3.2 + 0.12 * sin(p.y * 9.0);
          float b = (p.x - p.y * 0.8) * 2.6 + 0.3;
          float s1 = line(a, 0.035) * step(0.35, hash(vec2(floor(a), floor(p.x * 3.0))));
          float s2 = line(b, 0.03) * step(0.5, hash(vec2(floor(b) + 7.0, floor(p.y * 3.0))));
          float flick = 0.75 + 0.25 * sin(uTime * 11.0 + hash(floor(p * 4.0)) * 6.0);
          pat = max(s1, s2) * flick + spow(1.0 - d, 3.0) * 0.25;
        }
        float border = smoothstep(0.43, 0.5, max(abs(p.x), abs(p.y)));
        float breathe = 0.8 + 0.2 * sin(uTime * 1.6);
        float k = inside * (0.08 + pat * 0.9 + border * 0.7) * breathe + wave * 2.2;
        vec3 col = mix(uColor2, uColor, clamp(pat + wave, 0.0, 1.0)) * k * uAlpha;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 從天而降的光柱（棋子沿著它落下）：上淡下亮、會流動。 */
export function makeBeamPillar(uTime, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying float vFace;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      float spow(float x, float y) { return pow(max(x, 1e-4), y); }
      uniform float uTime, uAlpha; uniform vec3 uColor; varying vec2 vUv; varying float vFace;
      void main() {
        float flow = 0.6 + 0.4 * sin(vUv.y * 30.0 + uTime * 18.0);
        float k = spow(vFace, 1.5) * spow(1.0 - vUv.y, 1.5) * flow;
        gl_FragColor = vec4(uColor * k * 1.7 * uAlpha, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 7, 32, 1, true), mat);
  m.position.y = 3.5;
  return m;
}
