// 畫面質感：攝影棚反射環境、即時鏡面反射（棋盤表面反射棋子和招式）、實體材質、結晶棋子。
import * as THREE from 'three';

// ───────────────────────── 攝影棚環境（給金屬、亮面、水晶反射用） ─────────────────────────

/**
 * 原創的反射環境：暗色的天球 + 幾片發光的柔光箱與燈條。
 * 金屬和亮面會反射出長條的高光，比原本的灰色房間乾淨、有質感。
 */
export function makeStudioEnv(renderer) {
  const env = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(60, 48, 24);
  const colors = [];
  const p = skyGeo.attributes.position;
  const top = new THREE.Color('#1a2140'), mid = new THREE.Color('#06070f'), bottom = new THREE.Color('#020205');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 60;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.8)); else c.copy(mid).lerp(bottom, -y);
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const panel = (w, h, color, power, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(14, 14, '#fff4e6', 1.4, [0, 34, 6]);        // 頭頂的大柔光箱
  panel(3, 34, '#ffffff', 7, [26, 10, 18]);         // 右前方的白色燈條（金屬上的長條高光）
  panel(3, 34, '#ffffff', 5, [-24, 10, 22]);        // 左前方
  panel(5, 28, '#ff3347', 4.5, [-30, 6, -6]);       // 左側紅色（宿儺）
  panel(5, 28, '#8a5cff', 4.5, [30, 6, -8]);        // 右側紫色（五條悟）
  panel(30, 3, '#6f8cff', 3, [0, 14, -30]);         // 後方的藍色輪廓光

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}

// ───────────────────────── 即時鏡面反射 ─────────────────────────

/**
 * 在 y = planeY 的水平面做鏡面反射：每幀用鏡像的鏡頭把場景畫到一張半解析度的貼圖，
 * 棋盤表面的材質（用 addMirror 加上去）依照螢幕位置取樣，再依粗糙度做模糊。
 */
export function createMirror(renderer, planeY) {
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const uniforms = {
    tReflect: { value: black },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflOn: { value: 0 },
  };
  const cam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const planePoint = new THREE.Vector3(0, planeY, 0);
  const camPos = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4(), q = new THREE.Vector4();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  let enabled = true;
  let scale = 0.5;

  function setSize(w, h) {
    rt.setSize(Math.max(2, Math.floor(w * scale)), Math.max(2, Math.floor(h * scale)));
  }

  function render(scene, camera) {
    if (!enabled) { uniforms.uReflOn.value = 0; uniforms.tReflect.value = black; return; }
    camera.updateMatrixWorld();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(planePoint, camPos);
    if (view.dot(normal) > 0) { uniforms.uReflOn.value = 0; return; } // 鏡頭在平面下方
    view.reflect(normal).negate().add(planePoint);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(planePoint, look).reflect(normal).negate().add(planePoint);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(target);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    uniforms.uReflMatrix.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    // 斜裁切面：只畫平面上方的東西（不然格子本體會出現在倒影裡）
    plane.setFromNormalAndCoplanarPoint(normal, planePoint).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1 - 0.003; pm[14] = clip.w;

    // 畫倒影時，反射材質不能讀自己正在寫的貼圖
    uniforms.tReflect.value = black;
    uniforms.uReflOn.value = 0;
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    uniforms.tReflect.value = rt.texture;
    uniforms.uReflOn.value = 1;
  }

  /**
   * 讓 MeshStandard / MeshPhysical 材質帶有鏡面反射。
   * strength：反射強度；blur：模糊程度（mip 層級，0 是完美鏡面）。
   */
  function addMirror(material, { strength = 0.6, blur = 1.5 } = {}) {
    material.onBeforeCompile = sh => {
      sh.uniforms.tReflect = uniforms.tReflect;
      sh.uniforms.uReflMatrix = uniforms.uReflMatrix;
      sh.uniforms.uReflOn = uniforms.uReflOn;
      sh.uniforms.uReflStrength = { value: strength };
      sh.uniforms.uReflBlur = { value: blur };
      sh.vertexShader = 'uniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vReflCoord = uReflMatrix * (modelMatrix * vec4(transformed, 1.0));',
      );
      sh.fragmentShader = 'uniform sampler2D tReflect;\nuniform float uReflOn, uReflStrength, uReflBlur;\nvarying vec4 vReflCoord;\n' + sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `if (uReflOn > 0.5) {
          vec2 ruv = vReflCoord.xy / vReflCoord.w;
          vec2 px = vec2(0.004, 0.003) * (0.5 + uReflBlur);
          vec3 refl = textureLod(tReflect, ruv, uReflBlur).rgb * 0.4
            + textureLod(tReflect, ruv + vec2(px.x, px.y), uReflBlur + 0.5).rgb * 0.15
            + textureLod(tReflect, ruv + vec2(-px.x, px.y), uReflBlur + 0.5).rgb * 0.15
            + textureLod(tReflect, ruv + vec2(px.x, -px.y), uReflBlur + 0.5).rgb * 0.15
            + textureLod(tReflect, ruv + vec2(-px.x, -px.y), uReflBlur + 0.5).rgb * 0.15;
          float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float fres = 0.35 + 0.65 * pow(1.0 - ndv, 4.0);
          outgoingLight += refl * fres * uReflStrength;
        }
        #include <opaque_fragment>`,
      );
    };
    material.customProgramCacheKey = () => 'mirror-v1';
    return material;
  }

  return {
    render, setSize, addMirror, uniforms,
    set enabled(v) { enabled = v; if (!v) { uniforms.uReflOn.value = 0; uniforms.tReflect.value = black; } },
    get enabled() { return enabled; },
    set scale(v) { scale = v; },
  };
}

// ───────────────────────── 程式產生的表面紋理 ─────────────────────────

/** 細微的拉絲 / 研磨紋路（粗糙度貼圖），讓金屬側面的高光有紋理。 */
export function brushedTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * 256, v = 90 + Math.random() * 80;
    g.fillStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.3})`;
    g.fillRect(0, y, 256, 0.6 + Math.random() * 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 黑曜石平台上的細紋（粗糙度貼圖）：大部分很亮，偶爾有霧面的紋路。 */
export function stoneRoughness() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#303030';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(150,150,150,${0.08 + Math.random() * 0.18})`;
    g.lineWidth = 0.5 + Math.random() * 2.5;
    g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 140; y += (Math.random() - 0.5) * 140; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ───────────────────────── 棋子 ─────────────────────────

/** 宿儺陣營：一簇往上刺的暗紅寶石結晶（會折射後方的棋盤），中心有發光的核。 */
export function makeCrimsonCrystal() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#e0142e', roughness: 0.04, metalness: 0,
    transmission: 1, thickness: 0.5, ior: 1.77,
    attenuationColor: '#50000c', attenuationDistance: 0.22,
    clearcoat: 1, clearcoatRoughness: 0.04,
    emissive: '#ff1030', emissiveIntensity: 0.18,
    specularIntensity: 1, envMapIntensity: 1.6,
    flatShading: true,
  });
  mat.userData.crystal = true;
  mat.userData.ei = mat.emissiveIntensity;
  const group = new THREE.Group();
  const spikes = [[0, 0.66, 0, 0], [0.17, 0.44, 0.05, 0.35], [-0.16, 0.4, -0.04, -0.4], [0.02, 0.36, -0.17, 0.25], [-0.05, 0.3, 0.17, -0.2]];
  for (const [x, h, z, tilt] of spikes) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.11, h, 6), mat);
    m.position.set(x, h / 2 - 0.2, z);
    m.rotation.z = tilt;
    m.castShadow = true;
    group.add(m);
  }
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a7a').multiplyScalar(3), toneMapped: false }));
  core.position.y = -0.02;
  group.add(core);
  group.userData.spin = 0.5;
  return group;
}

/** 五條悟陣營：透明的鑽石結晶，會折射、有色散與彩虹薄膜光，中心是紫色的光核，外圈一道光環。 */
export function makeSixEyesCrystal() {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f6f4ff', roughness: 0.02, metalness: 0,
    transmission: 1, thickness: 0.6, ior: 2.1, dispersion: 4,
    attenuationColor: '#b49cff', attenuationDistance: 0.9,
    iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 650],
    specularIntensity: 1, envMapIntensity: 1.8,
    flatShading: true,
  });
  mat.userData.crystal = true;
  mat.userData.ei = 0;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), mat);
  gem.scale.set(0.85, 1.25, 0.85);
  gem.castShadow = true;
  group.add(gem);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#a77bff').multiplyScalar(3), toneMapped: false }));
  core.scale.set(1, 1.3, 1);
  group.add(core);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.018, 12, 64),
    new THREE.MeshPhysicalMaterial({ color: '#d9ccff', metalness: 1, roughness: 0.15, emissive: '#8a5cff', emissiveIntensity: 1.4 }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  group.userData.spin = 1.4;
  return group;
}

/** 畫質切換：低畫質時結晶不做折射（省一次整個場景的繪製）。 */
export function setCrystalQuality(root, high) {
  root.traverse(o => {
    const m = o.material;
    if (!m || !m.userData || !m.userData.crystal) return;
    m.transmission = high ? 1 : 0;
    m.opacity = 1;
    m.emissiveIntensity = high ? m.userData.ei : 0.6;
  });
}
