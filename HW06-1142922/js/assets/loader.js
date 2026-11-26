// 載入圖片；沒有素材或載入失敗時，畫一張替代圖，不丟錯。
import { isAvailable } from './manifest.js';

/**
 * placeholder = { kind: 'world'|'hero'|'leader', label, sub, color }
 * 回傳 HTMLImageElement（真的圖）或 HTMLCanvasElement（替代圖）。
 */
export function loadImage(path, placeholder) {
  if (!isAvailable(path)) return Promise.resolve(placeholderCanvas(placeholder));
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(placeholderCanvas(placeholder));
    img.src = path;
  });
}

const FONT = "'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif";

export function placeholderCanvas({ kind = 'world', label = '', sub = '', color = '#888888' } = {}) {
  const tall = kind !== 'world';
  const w = 512, h = tall ? 640 : 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');

  // 背景：作品代表色的放射漸層
  const bg = g.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h / 2, h * 0.75);
  bg.addColorStop(0, shade(color, 0.15));
  bg.addColorStop(0.55, shade(color, -0.45));
  bg.addColorStop(1, '#06070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 斜線紋理
  g.save();
  g.globalAlpha = 0.08;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  for (let x = -h; x < w; x += 28) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
  }
  g.restore();

  if (tall) {
    // 剪影：頭 + 肩膀
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.arc(w / 2, h * 0.36, w * 0.17, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(w * 0.12, h);
    g.quadraticCurveTo(w * 0.16, h * 0.58, w / 2, h * 0.56);
    g.quadraticCurveTo(w * 0.84, h * 0.58, w * 0.88, h);
    g.closePath(); g.fill();
    g.strokeStyle = shade(color, 0.35);
    g.lineWidth = 4;
    g.stroke();
  } else {
    g.strokeStyle = shade(color, 0.3);
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, h - 28);
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 12;
  g.fillStyle = '#ffffff';
  g.font = `900 ${tall ? 56 : 60}px ${FONT}`;
  g.fillText(label, w / 2, tall ? h * 0.86 : h * 0.46, w - 40);
  if (sub) {
    g.font = `700 30px ${FONT}`;
    g.fillStyle = shade(color, 0.5);
    g.fillText(sub, w / 2, tall ? h * 0.94 : h * 0.62, w - 40);
  }
  return c;
}

/** 把 #rrggbb 調亮（amount > 0）或調暗（amount < 0）。 */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}
