// 特效工具：共用粒子系統、光束、衝擊環、閃光、短暫物件。全部「發出去就不用管」，壽命到了自動移除。
import * as THREE from 'three';
import { FACTIONS } from '../core/worlds.js';

const systems = new WeakMap(); // stage → 粒子系統

export function palette(faction) {
  const f = FACTIONS[faction];
  return { primary: new THREE.Color(f.primary), secondary: new THREE.Color(f.secondary), accent: new THREE.Color(faction === 'rimuru' ? '#b8f6ff' : '#c9a8ff') };
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
    if (any || live) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.rgba.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }
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

// ───────────────────────── 短暫物件 ─────────────────────────

export function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** 把物件放進特效層，在 life 秒內每幀呼叫 update(k, obj, dt)，結束後移除。 */
export function spawn(stage, obj, { life = 0.6, delay = 0, update = null } = {}) {
  return new Promise(resolve => {
    let t = -delay;
    obj.visible = delay <= 0;
    stage.fxLayer.add(obj);
    const off = stage.onFrame(dt => {
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

/** 瞬間的點光源閃光。 */
export function flash(stage, pos, { color = '#ffffff', intensity = 40, distance = 9, life = 0.35, delay = 0 } = {}) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.copy(pos);
  light.position.y += 1;
  return spawn(stage, light, { life, delay, update(k) { light.intensity = intensity * Math.pow(1 - k, 2); } });
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
