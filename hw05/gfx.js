// 把 C# 送來的一串畫圖指令（Shim/Drawing.cs 的 Gfx）畫到 <canvas> 上。
// 編號 0 是網頁上的主畫布，其他編號是離屏畫布（糖晶小圖、背景、圖層）或預先解碼的圖片。

const canvases = new Map();   // id -> { canvas, ctx, depth }
const strings = [];
let images = new Map();       // 資源名稱 -> [id, w, h]
let nextImageId = 1000000;
const tintCache = new Map();
const measureCtx = new OffscreenCanvas(4, 4).getContext('2d');

export function attachScreen(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  canvases.set(0, { canvas, ctx, depth: 0 });
}

/** 開始前先把圖片下載並解碼好，C# 用 imageInfo 取得編號與大小。 */
export async function loadImages(base, names) {
  await Promise.all(names.map(async name => {
    const res = await fetch(base + name);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const id = nextImageId++;
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    canvases.set(id, { canvas, ctx: canvas.getContext('2d'), depth: 0 });
    images.set(name, [id, bmp.width, bmp.height]);
  }));
}

export function imageInfo(name) {
  return images.get(name) ?? [0, 1, 1];
}

let lastFont = '';
export function measure(font, text) {
  if (font !== lastFont) { measureCtx.font = font; lastFont = font; }
  return measureCtx.measureText(text).width;
}

export function getPixels(id) {
  const c = canvases.get(id);
  const data = c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height).data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export function putPixels(id, data) {
  const c = canvases.get(id);
  const arr = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
  c.ctx.putImageData(new ImageData(arr, c.canvas.width, c.canvas.height), 0, 0);
  tintCache.clear();
}

const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a / 255})`;
const JOINS = ['miter', 'bevel', 'round', 'miter'];
const CAPS = ['butt', 'round', 'square'];
const ALIGN = ['left', 'center', 'right'];
const BASE = ['top', 'middle', 'bottom'];

export function flush(view, newStrings) {
  for (const s of newStrings) strings.push(s);
  const o = view.slice();     // Float64Array 複本
  const n = o.length;
  let i = 0;
  let cur = canvases.get(0);
  let ctx = cur.ctx;

  // ── 讀取路徑：回傳 { path, texts } ──
  function readPath() {
    const count = o[i++];
    let path = null, texts = null;
    for (let k = 0; k < count; k++) {
      const code = o[i++];
      if (code === 7) {
        (texts ??= []).push([strings[o[i]], strings[o[i + 1]], o[i + 2], o[i + 3], o[i + 4], o[i + 5]]);
        i += 6;
        continue;
      }
      path ??= new Path2D();
      switch (code) {
        case 0: path.moveTo(o[i], o[i + 1]); i += 2; break;
        case 1: path.lineTo(o[i], o[i + 1]); i += 2; break;
        case 2: path.bezierCurveTo(o[i], o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5]); i += 6; break;
        case 3: path.closePath(); break;
        case 4: {
          const x = o[i], y = o[i + 1], w = o[i + 2], h = o[i + 3]; i += 4;
          path.moveTo(x + w, y + h / 2);
          path.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
          path.closePath();
          break;
        }
        case 5: {
          const x = o[i], y = o[i + 1], w = o[i + 2], h = o[i + 3], start = o[i + 4], sweep = o[i + 5]; i += 6;
          const a0 = start * Math.PI / 180, a1 = (start + sweep) * Math.PI / 180;
          path.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, a0, a1, sweep < 0);
          break;
        }
        case 6: path.rect(o[i], o[i + 1], o[i + 2], o[i + 3]); i += 4; break;
      }
    }
    return { path, texts };
  }

  // ── 讀取筆刷：回傳 fillStyle 或放射漸層的描述 ──
  function readBrush() {
    const kind = o[i++];
    if (kind === 0) { const s = rgba(o[i], o[i + 1], o[i + 2], o[i + 3]); i += 4; return s; }
    if (kind === 1) {
      const g = ctx.createLinearGradient(o[i], o[i + 1], o[i + 2], o[i + 3]); i += 4;
      const stops = o[i++];
      for (let k = 0; k < stops; k++) { g.addColorStop(Math.min(1, Math.max(0, o[i])), rgba(o[i + 1], o[i + 2], o[i + 3], o[i + 4])); i += 5; }
      return g;
    }
    // 放射漸層：橢圓中心 (cx, cy)、半徑 rx, ry，亮點在 (fx, fy)
    const cx = o[i], cy = o[i + 1], rx = o[i + 2], ry = o[i + 3], fx = o[i + 4], fy = o[i + 5]; i += 6;
    const stops = [];
    const count = o[i++];
    for (let k = 0; k < count; k++) { stops.push([o[i], rgba(o[i + 1], o[i + 2], o[i + 3], o[i + 4])]); i += 5; }
    return { radial: true, cx, cy, rx, ry, fx, fy, stops };
  }

  function fillWith(style, path) {
    if (style.radial) {
      ctx.save();
      ctx.clip(path, 'evenodd');
      ctx.translate(style.cx, style.cy);
      const k = style.ry / style.rx;
      ctx.scale(1, k);
      const g = ctx.createRadialGradient((style.fx - style.cx), (style.fy - style.cy) / k, 0, 0, 0, style.rx);
      for (const [p, c] of style.stops) g.addColorStop(Math.min(1, Math.max(0, p)), c);
      ctx.fillStyle = g;
      ctx.fillRect(-style.rx * 1.5, -style.rx * 1.5, style.rx * 3, style.rx * 3);
      ctx.restore();
    } else {
      ctx.fillStyle = style;
      ctx.fill(path, 'evenodd');
    }
  }

  function setFont(font) {
    if (cur.font !== font) { ctx.font = font; cur.font = font; }
  }

  function tinted(src, r, g, b) {
    const key = `${src.id}|${r}|${g}|${b}`;
    let t = tintCache.get(key);
    if (t) return t;
    const w = src.canvas.width, h = src.canvas.height;
    t = new OffscreenCanvas(w, h);
    const c = t.getContext('2d');
    c.drawImage(src.canvas, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(src.canvas, 0, 0);
    tintCache.set(key, t);
    return t;
  }

  while (i < n) {
    const op = o[i++];
    switch (op) {
      case 1: { // 切換畫布
        cur = canvases.get(o[i++]);
        ctx = cur.ctx;
        break;
      }
      case 2: { // 重設：清掉存檔堆疊與變換
        while (cur.depth > 0) { ctx.restore(); cur.depth--; }
        cur.font = null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        break;
      }
      case 3: ctx.save(); cur.depth++; break;
      case 4: if (cur.depth > 0) { ctx.restore(); cur.depth--; cur.font = null; } break;
      case 5: ctx.translate(o[i], o[i + 1]); i += 2; break;
      case 6: ctx.rotate(o[i++] * Math.PI / 180); break;
      case 7: ctx.scale(o[i], o[i + 1]); i += 2; break;
      case 8: ctx.setTransform(1, 0, 0, 1, 0, 0); break;
      case 9: ctx.imageSmoothingEnabled = o[i++] !== 0; break;
      case 10: i++; break; // SourceCopy：底圖本來就不透明，直接用一般疊加
      case 20: { // 填色
        const style = readBrush();
        const { path, texts } = readPath();
        if (path) fillWith(style, path);
        if (texts) {
          for (const [s, font, align, base, x, y] of texts) {
            setFont(font);
            ctx.textAlign = ALIGN[align];
            ctx.textBaseline = BASE[base];
            if (style.radial) ctx.fillStyle = style.stops[0][1]; else ctx.fillStyle = style;
            ctx.fillText(s, x, y);
          }
        }
        break;
      }
      case 21: { // 描邊
        const r = o[i], g = o[i + 1], b = o[i + 2], a = o[i + 3], width = o[i + 4], join = o[i + 5], cap = o[i + 6], dash = o[i + 7];
        i += 8;
        const { path, texts } = readPath();
        ctx.strokeStyle = rgba(r, g, b, a);
        ctx.lineWidth = width;
        ctx.lineJoin = JOINS[join] ?? 'miter';
        ctx.lineCap = CAPS[cap] ?? 'butt';
        if (dash === 1) ctx.setLineDash([width * 3, width]);
        else if (dash === 2) ctx.setLineDash([width, width]);
        if (path) ctx.stroke(path);
        if (texts) {
          for (const [s, font, align, base, x, y] of texts) {
            setFont(font);
            ctx.textAlign = ALIGN[align];
            ctx.textBaseline = BASE[base];
            ctx.strokeText(s, x, y);
          }
        }
        if (dash) ctx.setLineDash([]);
        break;
      }
      case 22: { // 裁切
        const { path } = readPath();
        if (path) ctx.clip(path, 'evenodd');
        break;
      }
      case 23: { // 貼圖
        const id = o[i], dx = o[i + 1], dy = o[i + 2], dw = o[i + 3], dh = o[i + 4], sx = o[i + 5], sy = o[i + 6], sw = o[i + 7], sh = o[i + 8];
        const alpha = o[i + 9], tr = o[i + 10], tg = o[i + 11], tb = o[i + 12];
        i += 13;
        const src = canvases.get(id);
        if (!src || alpha <= 0 || dw === 0 || dh === 0) break;
        src.id ??= id;
        const image = (tr !== 1 || tg !== 1 || tb !== 1) ? tinted(src, tr, tg, tb) : src.canvas;
        const prev = ctx.globalAlpha;
        if (alpha < 1) ctx.globalAlpha = prev * alpha;
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.globalAlpha = prev;
        break;
      }
      case 25: { // 清除
        const r = o[i], g = o[i + 1], b = o[i + 2], a = o[i + 3]; i += 4;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cur.canvas.width, cur.canvas.height);
        if (a > 0) { ctx.fillStyle = rgba(r, g, b, a); ctx.fillRect(0, 0, cur.canvas.width, cur.canvas.height); }
        ctx.restore();
        break;
      }
      case 30: { // 新的離屏畫布
        const id = o[i], w = o[i + 1], h = o[i + 2]; i += 3;
        const canvas = new OffscreenCanvas(w, h);
        canvases.set(id, { canvas, ctx: canvas.getContext('2d'), depth: 0, id });
        break;
      }
      case 31: { // 釋放
        const id = o[i++];
        if (id !== 0) canvases.delete(id);
        break;
      }
      default:
        console.error('gfx: unknown op', op, 'at', i - 1);
        return;
    }
  }
}
