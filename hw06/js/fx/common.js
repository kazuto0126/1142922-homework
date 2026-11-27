// 特效工具：共用粒子系統、光束、衝擊環、閃光、短暫物件。全部「發出去就不用管」，壽命到了自動移除。
import * as THREE from 'three';
import { FACTIONS } from '../core/worlds.js';

const systems = new WeakMap(); // stage → 粒子系統

export function palette(faction) {
  const f = FACTIONS[faction];
  return { primary: new THREE.Color(f.primary), secondary: new THREE.Color(f.secondary), accent: new THREE.Color(faction === 'sukuna' ? '#ffb0b8' : '#c9a8ff') };
}

/** 招式本色混 30% 陣營主色。 */
export function skillColor(worldColor, pal, amount = 0.3) {
  return new THREE.Color(worldColor).lerp(pal.primary, amount);
}

export const rand = (a, b) => a + Math.random() * (b - a);
const tmp = new THREE.Vector3();

// ───────────────────────── 粒子 ─────────────────────────

const VERT = `
  attribute float size;
  attribute vec4 rgba;
  uniform float pixelRatio;
  varying vec4 vColor;
  void main() {
    vColor = rgba;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelRatio * (320.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor.rgb * (0.6 + a), vColor.a * a);
  }`;

function particleSystem(stage) {
  if (systems.has(stage)) return systems.get(stage);
  const N = 4000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const rgba = new Float32Array(N * 4);
  const size = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('rgba', new THREE.BufferAttribute(rgba, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { pixelRatio: { value: stage.renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  stage.scene.add(points);

  const vel = new Float32Array(N * 3);
  const age = new Float32Array(N);
  const life = new Float32Array(N);
  const size0 = new Float32Array(N);
  const alpha0 = new Float32Array(N);
  const grav = new Float32Array(N);
  const drag = new Float32Array(N);
  let cursor = 0;
  let live = 0;

  const sys = {
    liveCount: () => { let n = 0; for (let i = 0; i < live; i++) if (life[i] > 0) n++; return n; },
    cap: () => (stage.quality === 'low' ? 1500 : N),
    spawn(p, v, color, s, l, a, g, d) {
      const cap = sys.cap();
      const i = cursor % cap;
      cursor = (cursor + 1) % cap;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      rgba[i * 4] = color.r; rgba[i * 4 + 1] = color.g; rgba[i * 4 + 2] = color.b; rgba[i * 4 + 3] = a;
      size[i] = s; size0[i] = s; alpha0[i] = a;
      age[i] = 0; life[i] = l; grav[i] = g; drag[i] = d;
      live = Math.max(live, i + 1);
    },
  };

  // 特效全部取消時（重開一局、回標題、跳過結局）：所有粒子立刻消失
  stage.onCancelFx(() => {
    for (let i = 0; i < live; i++) { life[i] = 0; rgba[i * 4 + 3] = 0; size[i] = 0; }
    live = 0;
    upload();
  });
  const upload = () => {
    geo.attributes.position.needsUpdate = true;
    geo.attributes.rgba.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  };
  let wasActive = false;

  stage.onFrame(dt => {
    mat.uniforms.pixelRatio.value = stage.renderer.getPixelRatio();
    let any = false;
    for (let i = 0; i < live; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) { life[i] = 0; rgba[i * 4 + 3] = 0; size[i] = 0; continue; }
      any = true;
      const k = age[i] / life[i];
      vel[i * 3 + 1] += grav[i] * dt;
      const damp = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= damp; vel[i * 3 + 1] *= damp; vel[i * 3 + 2] *= damp;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      rgba[i * 4 + 3] = alpha0[i] * Math.pow(1 - k, 1.4);
      size[i] = size0[i] * (1 - 0.45 * k);
    }
    // 有粒子在動時才上傳；全部消失的那一幀再上傳一次（把最後的粒子清掉）
    if (any || wasActive) upload();
    if (!any) live = 0;
    wasActive = any;
  });

  systems.set(stage, sys);
  return sys;
}

/**
 * 發射粒子。shape：sphere | cone | ring | up | disc。
 * key 演出時呼叫端自己把 count、size 放大。
 */
export function emit(stage, {
  pos, count = 60, color = '#ffffff', color2 = null, speed = 4, speedVar = 0.6, life = 0.8, lifeVar = 0.4,
  size = 0.35, sizeVar = 0.5, gravity = 0, drag = 1.5, shape = 'sphere', dir = new THREE.Vector3(0, 1, 0),
  angle = 0.4, radius = 0, alpha = 1,
}) {
  const sys = particleSystem(stage);
  const n = Math.round(count * (stage.quality === 'low' ? 0.45 : 1));
  const c1 = new THREE.Color(color);
  const c2 = color2 ? new THREE.Color(color2) : c1;
  const d = dir.clone().normalize();
  const v = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    switch (shape) {
      case 'cone': {
        // 在 dir 周圍 angle 弧度內
        const ortho1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const ortho2 = new THREE.Vector3().crossVectors(d, ortho1);
        const a = Math.random() * Math.PI * 2;
        const r = Math.tan(angle) * Math.sqrt(Math.random());
        v.copy(d).addScaledVector(ortho1, Math.cos(a) * r).addScaledVector(ortho2, Math.sin(a) * r).normalize();
        break;
      }
      case 'ring': {
        const a = Math.random() * Math.PI * 2;
        v.set(Math.cos(a), rand(-0.08, 0.15), Math.sin(a));
        break;
      }
      case 'up':
        v.set(rand(-angle, angle), 1, rand(-angle, angle)).normalize();
        break;
      case 'disc': {
        const a = Math.random() * Math.PI * 2;
        v.set(Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2).normalize();
        break;
      }
      default:
        v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    }
    p.copy(pos);
    if (radius > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      p.x += Math.cos(a) * r;
      p.z += Math.sin(a) * r;
      if (shape === 'sphere') p.y += rand(-radius, radius) * 0.5;
    }
    v.multiplyScalar(speed * (1 + rand(-speedVar, speedVar)));
    c.copy(c1).lerp(c2, Math.random());
    sys.spawn(p, v, c, size * (1 + rand(-sizeVar, sizeVar)), Math.max(0.05, life * (1 + rand(-lifeVar, lifeVar))), alpha, gravity, drag);
  }
}

export const burst = (stage, pos, opts = {}) => emit(stage, { ...opts, pos, shape: opts.shape || 'sphere' });

/** 驗證用：目前還活著的粒子數。 */
export function liveParticles(stage) {
  const sys = systems.get(stage);
  return sys ? sys.liveCount() : 0;
}

// ───────────────────────── 短暫物件 ─────────────────────────

// 發光物件的顏色調成 HDR（亮度 > 1），只有它們會泛光，被燈照亮的棋盤不會
export const GLOW = 1.4;
export function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(GLOW), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** 把物件放進特效層，在 life 秒內每幀呼叫 update(k, obj, dt)，結束後移除。 */
export function spawn(stage, obj, { life = 0.6, delay = 0, update = null } = {}) {
  const gen = stage.fxGeneration;
  return new Promise(resolve => {
    let t = -delay;
    obj.visible = delay <= 0;
    stage.fxLayer.add(obj);
    const off = stage.onFrame(dt => {
      if (stage.fxGeneration !== gen) { off(); resolve(); return; } // 特效被取消了（物件已由 cancelFx 清掉）
      t += dt;
      if (t < 0) return;
      obj.visible = true;
      const k = Math.min(1, t / life);
      if (update) update(k, obj, dt);
      if (k >= 1) {
        off();
        stage.fxLayer.remove(obj);
        obj.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach(m => m.dispose());
        });
        resolve();
      }
    });
  });
}

/** 從 from 到 to 的光束（外光 + 白色核心），會先變粗再變細消失。 */
export function beam(stage, from, to, { color = '#ffffff', width = 0.25, life = 0.5, delay = 0, core = true } = {}) {
  const len = from.distanceTo(to);
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 20, 1, true), glowMat(color, 0.85));
  g.add(outer);
  if (core) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, len, 12, 1, true), glowMat('#ffffff', 1)));
  g.position.copy(from).add(to).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.copy(to).sub(from).normalize());
  return spawn(stage, g, {
    life, delay,
    update(k) {
      const w = width * (k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 2));
      g.scale.set(Math.max(0.001, w), 1, Math.max(0.001, w));
    },
  });
}

/** 水平擴散的衝擊環。 */
export function ring(stage, pos, { color = '#ffffff', radius = 1.6, life = 0.5, delay = 0, width = 0.18, y = 0.18, tilt = null } = {}) {
  const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), glowMat(color, 0.9));
  m.position.copy(pos);
  m.position.y += y;
  if (tilt) m.quaternion.copy(tilt); else m.rotation.x = -Math.PI / 2;
  return spawn(stage, m, {
    life, delay,
    update(k) {
      const r = 0.05 + radius * (1 - Math.pow(1 - k, 3));
      m.scale.setScalar(r);
      m.material.opacity = 0.9 * (1 - k);
    },
  });
}

/**
 * 瞬間的點光源閃光。用舞台的固定燈池（不新增燈），放招時才不會因為燈的數量改變而重新編譯材質、卡一下。
 */
export function flash(stage, pos, { color = '#ffffff', intensity = 40, distance = 9, life = 0.35, delay = 0 } = {}) {
  let slot = null;
  const at = pos.clone();
  at.y += 1;
  return spawn(stage, new THREE.Object3D(), {
    life, delay,
    update(k) {
      if (!slot) {
        slot = stage.borrowLight();
        slot.light.color.set(color);
        slot.light.distance = distance;
        slot.light.position.copy(at);
      }
      if (!slot.owns()) return; // 燈已經被更新的閃光拿走了
      slot.light.intensity = k >= 1 ? 0 : intensity * Math.pow(1 - k, 2);
    },
  });
}

/** 發光的球體（聚氣、爆炸核心）。grow：[開始大小, 結束大小]。 */
export function orb(stage, pos, { color = '#ffffff', grow = [0.1, 1.2], life = 0.5, delay = 0, opacity = [1, 0], segments = 24 } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments), glowMat(color, opacity[0]));
  m.position.copy(pos);
  return spawn(stage, m, {
    life, delay,
    update(k) {
      m.scale.setScalar(Math.max(0.001, grow[0] + (grow[1] - grow[0]) * k));
      m.material.opacity = opacity[0] + (opacity[1] - opacity[0]) * k;
    },
  });
}

export const wait = ms => new Promise(r => setTimeout(r, ms));

/** ms 毫秒後執行 fn；如果棋盤在這之間被清掉（重開一局），就不執行。 */
const pending = new WeakMap(); // stage → 還沒觸發的延遲特效數量

export function later(stage, ms, fn) {
  const gen = stage.fxGeneration;
  pending.set(stage, (pending.get(stage) || 0) + 1);
  setTimeout(() => {
    pending.set(stage, Math.max(0, (pending.get(stage) || 1) - 1));
    if (stage.fxGeneration === gen) fn();
  }, ms);
}

/** 還沒觸發的延遲特效數量（判斷演出是不是真的演完了）。 */
export function pendingFx(stage) {
  return pending.get(stage) || 0;
}

/** 粒子從四周往 center 聚集（聚氣、吸氣）。 */
export function converge(stage, center, { radius = 1.5, count = 60, color = '#ffffff', color2 = null, life = 0.35, size = 0.25 } = {}) {
  const sys = particleSystem(stage);
  const n = Math.round(count * (stage.quality === 'low' ? 0.45 : 1));
  const c1 = new THREE.Color(color), c2 = color2 ? new THREE.Color(color2) : c1, c = new THREE.Color();
  const d = new THREE.Vector3(), p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    const r = radius * rand(0.6, 1);
    const l = life * rand(0.8, 1.2);
    p.copy(center).addScaledVector(d, r);
    v.copy(d).multiplyScalar(-r / l);
    c.copy(c1).lerp(c2, Math.random());
    sys.spawn(p, v, c, size * rand(0.6, 1.3), l, 1, 0, 0);
  }
}

/** 鋸齒狀的閃電（由細圓柱組成），每 60 ms 重新抖動一次。 */
export function bolt(stage, from, to, { color = '#ffffff', width = 0.06, life = 0.35, delay = 0, segments = 10, jag = 0.35 } = {}) {
  const g = new THREE.Group();
  const mat = glowMat(color, 1);
  const core = glowMat('#ffffff', 1);
  const segs = [];
  for (let i = 0; i < segments; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), mat);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 5, 1, true), core);
    m.add(c);
    g.add(m);
    segs.push(m);
  }
  const pts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const dirv = new THREE.Vector3();
  function rejitter() {
    pts.length = 0;
    for (let i = 0; i <= segments; i++) {
      const p = from.clone().lerp(to, i / segments);
      if (i > 0 && i < segments) p.add(new THREE.Vector3(rand(-jag, jag), rand(-jag, jag), rand(-jag, jag)));
      pts.push(p);
    }
    segs.forEach((m, i) => {
      const a = pts[i], b = pts[i + 1];
      m.position.copy(a).add(b).multiplyScalar(0.5);
      dirv.copy(b).sub(a);
      const len = dirv.length();
      m.quaternion.setFromUnitVectors(up, dirv.normalize());
      m.scale.set(width, len, width);
    });
  }
  rejitter();
  let acc = 0;
  return spawn(stage, g, {
    life, delay,
    update(k, _o, dt) {
      acc += dt;
      if (acc > 0.06) { acc = 0; rejitter(); }
      mat.opacity = core.opacity = k < 0.7 ? (Math.random() > 0.15 ? 1 : 0.3) : 1 - (k - 0.7) / 0.3;
    },
  });
}

/** 在 center 周圍亂竄的短電弧。 */
export function arcs(stage, center, { count = 5, radius = 1.0, color = '#9ff', life = 0.4, delay = 0, width = 0.03 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(radius * rand(0.4, 1)).add(center);
    const b = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(radius * rand(0.4, 1)).add(center);
    bolt(stage, a, b, { color, width, life: life * rand(0.6, 1), delay: delay + rand(0, life * 0.5), segments: 6, jag: radius * 0.25 });
  }
}

/** 陣營殘留：宿儺是落下的水滴，五條悟是藍紫色的扭曲波紋。 */
export function residue(fx, { delay = 0 } = {}) {
  const { stage, pos, pal, faction } = fx;
  later(stage, delay * 1000, () => {
    if (faction === 'sukuna') {
      emit(stage, { pos: pos.clone().setY(pos.y + 1.8), count: 30 * fx.mul, color: pal.primary, color2: pal.accent, shape: 'sphere', speed: 1.5, gravity: -7, drag: 0.3, life: 0.9, size: 0.22, radius: 0.9 });
    } else {
      ring(stage, pos, { color: pal.secondary, radius: 2.2 * fx.scale, life: 0.55, width: 0.06, y: 0.35 });
      ring(stage, pos, { color: '#ffffff', radius: 1.6 * fx.scale, life: 0.45, width: 0.04, y: 0.55, delay: 0.08 });
    }
  });
}

/** 低面數造型用的材質。 */
export function solidMat(color, { emissive = '#000000', emissiveIntensity = 0, flat = true, opacity = 1 } = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.6, metalness: 0.1, flatShading: flat, transparent: opacity < 1, opacity });
}

export const easeOut = k => 1 - Math.pow(1 - k, 3);
export const easeIn = k => k * k * k;
