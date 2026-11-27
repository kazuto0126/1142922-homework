// 必殺技用的 3D 模型（程式建模）：巨拳、巨人手臂、雙劍、硬幣。只做招式的物件，不做角色本人。
import * as THREE from 'three';

/**
 * 實體材質。clearcoat：表面的透明漆（金屬、亮面）；sheen：皮膚 / 布料邊緣的柔光；fade：之後會淡出（一開始就設成透明，避免中途重新編譯）。
 */
export function std(color, { emissive = '#000000', ei = 0, rough = 0.55, metal = 0.1, flat = false, clearcoat = 0, sheen = 0, sheenColor = '#ffffff', fade = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, emissive, emissiveIntensity: ei, roughness: rough, metalness: metal, flatShading: flat,
    clearcoat, clearcoatRoughness: 0.12, sheen, sheenColor, sheenRoughness: 0.45, transparent: fade,
  });
}

/** 圓角方塊（用來做指節、刀柄）。 */
function rounded(w, h, d, r = 0.2, seg = 3) {
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const half = new THREE.Vector3(w / 2 - r * w, h / 2 - r * h, d / 2 - r * d);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = v.clone().clamp(half.clone().negate(), half);
    const n = v.clone().sub(c);
    if (n.lengthSq() > 0) v.copy(c).add(n.normalize().multiply(new THREE.Vector3(r * w, r * h, r * d)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * 握緊的拳頭（拳面朝 -y），附前臂。scale 1 時拳頭寬約 1。
 * material 可以傳進來（例如白色的五檔、半透明的能量拳）。
 */
export function makeFist(material = std('#cdb99c', { rough: 0.75 }), { arm = 3 } = {}) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(rounded(1.0, 0.8, 0.75, 0.25), material);
  palm.position.y = 0.15;
  g.add(palm);
  // 四根彎起來的手指：每根兩節，拳面朝下
  for (let i = 0; i < 4; i++) {
    const x = -0.36 + i * 0.24;
    const len = i === 0 || i === 3 ? 0.9 : 1;
    const prox = new THREE.Mesh(rounded(0.22, 0.34 * len, 0.26, 0.4), material);
    prox.position.set(x, -0.35, 0.22);
    prox.rotation.x = 0.25;
    const mid = new THREE.Mesh(rounded(0.21, 0.3 * len, 0.24, 0.4), material);
    mid.position.set(x, -0.42, -0.06);
    mid.rotation.x = 1.5;
    g.add(prox, mid);
    // 指節突起
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), material);
    knuckle.position.set(x, -0.2, 0.36);
    g.add(knuckle);
  }
  // 大拇指橫跨在手指前面
  const thumb = new THREE.Mesh(rounded(0.55, 0.22, 0.24, 0.4), material);
  thumb.position.set(-0.05, -0.18, 0.42);
  thumb.rotation.z = -0.35;
  g.add(thumb);
  if (arm > 0) {
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, arm, 16), material);
    fore.position.y = 0.55 + arm / 2;
    g.add(fore);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 巨人的手臂：有肌肉起伏的前臂 + 張開抓取的手（掌心朝 -z），從地底伸出用。 */
export function makeTitanArm() {
  const skin = std('#b86e52', { emissive: '#3a0f06', ei: 0.22, rough: 0.55, sheen: 0.8, sheenColor: '#ffb08a', clearcoat: 0.25 });
  const muscle = std('#a45a42', { rough: 0.6, sheen: 0.8, sheenColor: '#ff9a7a', clearcoat: 0.25 });
  const g = new THREE.Group();
  // 前臂：幾段錯開的肌肉
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.8, 14), skin);
  fore.position.y = 1.4;
  g.add(fore);
  for (const [x, y, z, s] of [[0.18, 1.9, 0.2, 0.42], [-0.2, 1.2, 0.18, 0.46], [0.05, 0.6, -0.25, 0.5], [0.25, 2.3, -0.1, 0.36]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), muscle);
    m.scale.set(s * 0.8, s * 1.8, s * 0.7);
    m.position.set(x, y, z);
    g.add(m);
  }
  // 手掌 + 張開的五指
  const palm = new THREE.Mesh(rounded(1.2, 1.0, 0.45, 0.3), skin);
  palm.position.y = 3.2;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const x = -0.45 + i * 0.3;
    for (let j = 0; j < 3; j++) {
      const seg = new THREE.Mesh(rounded(0.22, 0.42 - j * 0.06, 0.24, 0.4), skin);
      seg.position.set(x, 3.85 + j * 0.36, -0.05 - j * 0.12);
      seg.rotation.x = -0.35 * (j + 1);
      g.add(seg);
    }
  }
  const thumb = new THREE.Mesh(rounded(0.26, 0.6, 0.26, 0.4), skin);
  thumb.position.set(0.75, 3.35, -0.1);
  thumb.rotation.z = -0.9;
  g.add(thumb);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 單手劍：刀刃沿 +y，劍柄在原點。dark=true 是黑色的劍，否則是白藍色的劍。 */
export function makeSword(dark = true) {
  const blade = dark
    ? std('#22252f', { emissive: '#1b3cff', ei: 0.3, rough: 0.12, metal: 1, clearcoat: 1, fade: true })
    : std('#eef8ff', { emissive: '#5fc8ff', ei: 0.35, rough: 0.08, metal: 1, clearcoat: 1, fade: true });
  const guardMat = std(dark ? '#3a3f4c' : '#c8d4e4', { rough: 0.18, metal: 1, clearcoat: 0.6, fade: true });
  const gripMat = std('#141418', { rough: 0.7, sheen: 0.6, sheenColor: '#5a5a70', fade: true });
  const g = new THREE.Group();
  // 刀刃：扁平、尖端收窄
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, 0);
  shape.lineTo(-0.07, 1.75);
  shape.lineTo(0, 2.0);
  shape.lineTo(0.07, 1.75);
  shape.lineTo(0.07, 0);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  bladeGeo.translate(0, 0.08, -0.0125);
  g.add(new THREE.Mesh(bladeGeo, blade));
  const guard = new THREE.Mesh(rounded(0.42, 0.07, 0.1, 0.3), guardMat);
  guard.position.y = 0.05;
  g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 10), gripMat);
  grip.position.y = -0.2;
  g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), guardMat);
  pommel.position.y = -0.43;
  g.add(pommel);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** 有齒紋邊緣的硬幣（平放時面朝 +y）。 */
export function makeCoin() {
  const gold = std('#e0a93a', { emissive: '#3a2200', ei: 0.08, rough: 0.16, metal: 1, clearcoat: 0.6 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 40), gold));
  for (let i = 0; i < 40; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.032, 0.012), gold);
    const a = (i / 40) * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.162, 0, Math.sin(a) * 0.162);
    r.rotation.y = -a;
    g.add(r);
  }
  const face = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 40), gold);
  face.rotation.x = Math.PI / 2;
  face.position.y = 0.016;
  g.add(face);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
