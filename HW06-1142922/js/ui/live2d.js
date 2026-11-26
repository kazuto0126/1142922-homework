// 「Live2D 風」的立繪：把一張圖切成很多橫條，每條用不同的位移畫出來，
// 做出呼吸起伏、頭部擺動、頭髮衣服飄動的感覺；標題畫面還會跟著滑鼠微微轉向。
// （真正的 Live2D 需要拆圖層綁骨架的模型，這裡是用一張圖模擬。）

const ROWS = 72;
const active = new Set();
let raf = 0;
const pointer = { x: 0, y: 0 }; // -1..1

window.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

function loop(now) {
  const t = now / 1000;
  for (const p of active) {
    if (!p.canvas.isConnected) { active.delete(p); continue; }
    draw(p, t);
  }
  raf = active.size ? requestAnimationFrame(loop) : 0;
}

function draw(p, t) {
  const { ctx, image, w, h, sw, sh, sway, phase, parallax } = p;
  const margin = sw * 0.05; // 從原圖的內側取樣，位移時邊緣才不會露出空白
  const breath = Math.sin(t * 1.7 + phase);
  const scaleY = 1 + 0.014 * breath;               // 呼吸：整體微微伸縮（以腳為基準）
  const bob = Math.sin(t * 1.7 + phase - 0.6) * 0.004 * h;
  const head = Math.sin(t * 0.85 + phase) * 0.03 * sway;   // 頭部左右擺動（越上面擺越多）
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < ROWS; i++) {
    const v = i / ROWS;                 // 0 = 頂端
    const srcY = v * sh;
    const srcH = sh / ROWS + 1;
    const top = Math.pow(1 - v, 2);     // 上方權重
    const flutter = Math.sin(t * 3.2 + v * 9 + phase) * 0.006 * sway; // 頭髮、衣服的小波動
    const shift = (head * top + flutter) * sw;
    const destY = h - (h - v * h) * scaleY + bob;
    ctx.drawImage(image, margin + shift, srcY, sw - margin * 2, srcH, 0, destY, w, (h / ROWS + 1) * scaleY);
  }
  if (parallax) {
    p.tx += (pointer.x - p.tx) * 0.06;
    p.ty += (pointer.y - p.ty) * 0.06;
    p.canvas.style.transform = `perspective(900px) rotateY(${p.tx * 8}deg) rotateX(${-p.ty * 5}deg) translateX(${p.tx * 6}px)`;
  }
}

/**
 * 建立一個會動的立繪 canvas。image：HTMLImageElement 或 canvas。
 * sway：擺動幅度倍率；parallax：是否跟著滑鼠轉向。
 */
export function live2d(image, { sway = 1, parallax = false, className = '' } = {}) {
  const canvas = document.createElement('canvas');
  const sw = image.naturalWidth || image.width || 512;
  const sh = image.naturalHeight || image.height || 640;
  const scale = Math.min(1, 640 / sh);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.className = `live2d ${className}`.trim();
  const p = {
    canvas, image, ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height, sw, sh,
    sway, parallax, phase: Math.random() * Math.PI * 2, tx: 0, ty: 0,
  };
  draw(p, performance.now() / 1000);
  active.add(p);
  if (!raf) raf = requestAnimationFrame(loop);
  return canvas;
}

/** 把容器裡標了 data-l2d 的佔位元素換成會動的立繪。images：{ key: image }。 */
export function mountLive2d(root, images, opts = {}) {
  root.querySelectorAll('[data-l2d]').forEach(slot => {
    const img = images[slot.dataset.l2d];
    if (!img) return;
    const c = live2d(img, { ...opts, sway: Number(slot.dataset.sway || opts.sway || 1) });
    c.setAttribute('aria-label', slot.getAttribute('aria-label') || '');
    slot.replaceWith(c);
  });
}
