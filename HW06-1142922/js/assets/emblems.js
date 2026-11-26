// 九格地板：各作品的代表色 + 程式畫的標誌（向原作致敬的簡化圖形）。
// drawEmblem 的座標系：中心 (0,0)，範圍約 -1..1，畫之前已縮放好。

const TAU = Math.PI * 2;

function path(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}

const EMBLEMS = [
  // 0 我的英雄學院：盾牌 + One For All 的閃電
  (g, c) => {
    g.beginPath();
    g.moveTo(0, -0.92);
    g.bezierCurveTo(0.45, -0.78, 0.75, -0.75, 0.8, -0.7);
    g.lineTo(0.72, 0.15);
    g.bezierCurveTo(0.6, 0.6, 0.25, 0.82, 0, 0.95);
    g.bezierCurveTo(-0.25, 0.82, -0.6, 0.6, -0.72, 0.15);
    g.lineTo(-0.8, -0.7);
    g.bezierCurveTo(-0.75, -0.75, -0.45, -0.78, 0, -0.92);
    g.closePath();
    g.fillStyle = '#0f2a1a'; g.fill();
    g.lineWidth = 0.09; g.strokeStyle = c; g.stroke();
    path(g, [[0.12, -0.7], [-0.32, 0.08], [-0.02, 0.08], [-0.14, 0.72], [0.36, -0.12], [0.06, -0.12], [0.22, -0.7]]);
    g.fillStyle = '#d8ffe6'; g.fill();
    g.lineWidth = 0.04; g.strokeStyle = c; g.stroke();
  },
  // 1 火影忍者：木葉的漩渦 + 葉尖
  (g, c) => {
    g.lineCap = 'round';
    g.lineWidth = 0.13;
    g.strokeStyle = c;
    g.beginPath();
    for (let a = 0; a <= TAU * 2.05; a += 0.05) {
      const r = 0.06 + a * 0.045;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    // 葉尖：從漩渦外圈延伸出去的三角
    path(g, [[0.45, 0.32], [0.95, 0.7], [0.28, 0.6]]);
    g.fillStyle = c; g.fill();
    g.beginPath(); g.arc(0, 0, 0.82, Math.PI * 0.55, Math.PI * 1.9); g.lineWidth = 0.1; g.stroke();
  },
  // 2 進擊的巨人：自由之翼（藍、白兩片翅膀交疊）
  (g) => {
    const wing = (dir, color) => {
      g.save();
      g.scale(dir, -1); // 翅膀根部在下、羽毛往外上方展開
      g.beginPath();
      g.moveTo(0.05, 0.75);
      g.bezierCurveTo(-0.15, 0.2, -0.3, -0.35, -0.2, -0.8);
      g.bezierCurveTo(-0.45, -0.6, -0.55, -0.45, -0.62, -0.3);
      g.bezierCurveTo(-0.7, -0.25, -0.82, -0.1, -0.85, 0.05);
      g.bezierCurveTo(-0.9, 0.12, -0.95, 0.3, -0.9, 0.42);
      g.bezierCurveTo(-0.7, 0.4, -0.4, 0.6, 0.05, 0.75);
      g.closePath();
      g.fillStyle = color; g.fill();
      g.lineWidth = 0.035; g.strokeStyle = '#1b2238'; g.stroke();
      // 羽毛的分隔線
      g.beginPath();
      g.moveTo(-0.2, -0.3); g.lineTo(-0.62, -0.3);
      g.moveTo(-0.15, 0.05); g.lineTo(-0.85, 0.05);
      g.moveTo(-0.1, 0.4); g.lineTo(-0.88, 0.42);
      g.stroke();
      g.restore();
    };
    g.translate(-0.08, 0);
    wing(1, '#2f5fd0');
    g.translate(0.16, 0);
    wing(-1, '#f4f6ff');
  },
  // 3 名偵探柯南：放大鏡 + 紅色蝴蝶結
  (g, c) => {
    g.lineCap = 'round';
    g.lineWidth = 0.12; g.strokeStyle = '#e8eefc';
    g.beginPath(); g.arc(-0.12, -0.18, 0.5, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(160,200,255,0.25)'; g.fill();
    g.lineWidth = 0.18; g.strokeStyle = c;
    g.beginPath(); g.moveTo(0.24, 0.2); g.lineTo(0.7, 0.72); g.stroke();
    // 蝴蝶結
    g.save();
    g.translate(-0.12, -0.18);
    g.scale(0.55, 0.55);
    g.fillStyle = '#e0303a';
    path(g, [[0, 0], [-0.75, -0.42], [-0.75, 0.42]]); g.fill();
    path(g, [[0, 0], [0.75, -0.42], [0.75, 0.42]]); g.fill();
    g.beginPath(); g.arc(0, 0, 0.16, 0, TAU); g.fillStyle = '#ff5a63'; g.fill();
    g.restore();
  },
  // 4 航海王：草帽骷髏
  (g) => {
    // 交叉的骨頭
    g.lineCap = 'round';
    g.lineWidth = 0.16; g.strokeStyle = '#f7f3ea';
    g.beginPath(); g.moveTo(-0.75, -0.05); g.lineTo(0.75, 0.85); g.moveTo(0.75, -0.05); g.lineTo(-0.75, 0.85); g.stroke();
    for (const [x, y] of [[-0.75, -0.05], [0.75, 0.85], [0.75, -0.05], [-0.75, 0.85]]) {
      g.beginPath(); g.arc(x, y, 0.1, 0, TAU); g.fillStyle = '#f7f3ea'; g.fill();
    }
    // 骷髏頭
    g.beginPath(); g.ellipse(0, 0.12, 0.48, 0.45, 0, 0, TAU); g.fillStyle = '#f7f3ea'; g.fill();
    g.fillRect(-0.24, 0.4, 0.48, 0.22);
    g.fillStyle = '#1a1a1a';
    g.beginPath(); g.ellipse(-0.18, 0.15, 0.11, 0.13, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0.18, 0.15, 0.11, 0.13, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(0, 0.28); g.lineTo(-0.05, 0.38); g.lineTo(0.05, 0.38); g.fill();
    g.lineWidth = 0.03; g.strokeStyle = '#1a1a1a';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 0.08, 0.46); g.lineTo(i * 0.08, 0.6); g.stroke(); }
    // 草帽
    g.beginPath(); g.ellipse(0, -0.2, 0.78, 0.16, 0, 0, TAU); g.fillStyle = '#f2c94c'; g.fill();
    g.beginPath(); g.ellipse(0, -0.3, 0.44, 0.34, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#d8312f'; g.fillRect(-0.44, -0.34, 0.88, 0.1);
  },
  // 5 科學超電磁砲：硬幣 + 電光
  (g, c) => {
    g.beginPath(); g.arc(-0.05, 0.05, 0.62, 0, TAU);
    const gr = g.createRadialGradient(-0.2, -0.1, 0.05, -0.05, 0.05, 0.62);
    gr.addColorStop(0, '#fff1b8'); gr.addColorStop(1, '#c98a1c');
    g.fillStyle = gr; g.fill();
    g.lineWidth = 0.06; g.strokeStyle = '#8a5a10'; g.stroke();
    g.beginPath(); g.arc(-0.05, 0.05, 0.48, 0, TAU); g.lineWidth = 0.025; g.stroke();
    path(g, [[0.1, -0.95], [-0.25, -0.1], [0.05, -0.1], [-0.2, 0.9], [0.4, -0.25], [0.1, -0.25], [0.35, -0.95]]);
    g.fillStyle = '#e8f7ff'; g.fill();
    g.lineWidth = 0.045; g.strokeStyle = c; g.stroke();
  },
  // 6 FAIRY TAIL：公會紋章（帶尾巴的妖精剪影）
  (g, c) => {
    g.beginPath();
    g.moveTo(-0.15, 0.85);
    g.bezierCurveTo(-0.45, 0.6, -0.5, 0.25, -0.2, 0.05);
    g.bezierCurveTo(-0.55, 0.0, -0.75, -0.25, -0.62, -0.55);
    g.bezierCurveTo(-0.45, -0.35, -0.25, -0.3, -0.05, -0.38);
    g.bezierCurveTo(-0.1, -0.6, 0.05, -0.85, 0.3, -0.92);
    g.bezierCurveTo(0.2, -0.7, 0.25, -0.5, 0.42, -0.42);
    g.bezierCurveTo(0.7, -0.35, 0.82, -0.05, 0.62, 0.15);
    g.bezierCurveTo(0.5, -0.05, 0.3, -0.1, 0.15, 0.0);
    g.bezierCurveTo(0.35, 0.2, 0.3, 0.55, 0.0, 0.62);
    g.bezierCurveTo(0.15, 0.45, 0.05, 0.25, -0.1, 0.25);
    g.bezierCurveTo(-0.25, 0.4, -0.25, 0.65, -0.15, 0.85);
    g.closePath();
    const gr = g.createLinearGradient(0, -0.9, 0, 0.9);
    gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, c);
    g.fillStyle = gr; g.fill();
    g.lineWidth = 0.05; g.strokeStyle = '#5a0f08'; g.stroke();
  },
  // 7 刀劍神域：交叉的黑白雙劍
  (g) => {
    const sword = (angle, blade, edge) => {
      g.save();
      g.rotate(angle);
      path(g, [[-0.07, 0.35], [-0.07, -0.78], [0, -0.95], [0.07, -0.78], [0.07, 0.35]]);
      g.fillStyle = blade; g.fill();
      g.lineWidth = 0.025; g.strokeStyle = edge; g.stroke();
      g.fillStyle = '#c9ced8'; g.fillRect(-0.26, 0.33, 0.52, 0.08);
      g.fillStyle = '#2a2d36'; g.fillRect(-0.045, 0.41, 0.09, 0.4);
      g.beginPath(); g.arc(0, 0.85, 0.07, 0, TAU); g.fillStyle = '#c9ced8'; g.fill();
      g.restore();
    };
    sword(-0.62, '#20232b', '#8fb0ff');
    sword(0.62, '#e9f6ff', '#5fb7ff');
  },
  // 8 死神：新月（月牙天衝）+ 斬月的刀身
  (g, c) => {
    // 新月 = 大圓減掉往右上偏移的小圓：算出兩圓交點，沿外圓左側、再沿內圓走回來
    const R = 0.82, r = 0.72, dx = 0.32, dy = -0.16;
    const d = Math.hypot(dx, dy);
    const a = (R * R - r * r + d * d) / (2 * d);
    const h = Math.sqrt(R * R - a * a);
    const ux = dx / d, uy = dy / d;
    const p1 = [a * ux - h * uy, a * uy + h * ux];
    const p2 = [a * ux + h * uy, a * uy - h * ux];
    const t1 = Math.atan2(p1[1], p1[0]), t2 = Math.atan2(p2[1], p2[0]);
    const s1 = Math.atan2(p1[1] - dy, p1[0] - dx), s2 = Math.atan2(p2[1] - dy, p2[0] - dx);
    g.beginPath();
    g.arc(0, 0, R, t1, t2, false);
    g.arc(dx, dy, r, s2, s1, true);
    g.closePath();
    g.fillStyle = '#16080c'; g.fill();
    g.lineWidth = 0.05; g.strokeStyle = c; g.stroke();
    g.save();
    g.rotate(-0.7);
    path(g, [[-0.13, 0.55], [-0.13, -0.7], [0.1, -0.85], [0.13, 0.55]]);
    g.fillStyle = '#121216'; g.fill();
    g.lineWidth = 0.03; g.strokeStyle = '#e8e8ef'; g.stroke();
    g.fillStyle = '#e8e8ef';
    g.fillRect(-0.05, 0.55, 0.1, 0.3);
    g.restore();
  },
];

/** 在 g 上、以 (cx, cy) 為中心、半徑 r 畫第 cell 格的標誌。 */
export function drawEmblem(g, cell, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  g.scale(r, r);
  g.lineJoin = 'round';
  EMBLEMS[cell](g, color);
  g.restore();
}

const FONT = "'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif";

/** 一格的地板貼圖：代表色漸層 + 斜紋 + 標誌 + 作品名。 */
export function tileCanvas(world, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size;

  const bg = g.createRadialGradient(s / 2, s * 0.45, s * 0.05, s / 2, s / 2, s * 0.75);
  bg.addColorStop(0, mix(world.color, '#ffffff', 0.15));
  bg.addColorStop(0.5, mix(world.color, '#000000', 0.45));
  bg.addColorStop(1, mix(world.color, '#000000', 0.82));
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);

  // 斜紋
  g.save();
  g.globalAlpha = 0.07;
  g.strokeStyle = '#ffffff';
  g.lineWidth = s * 0.012;
  for (let x = -s; x < s * 2; x += s * 0.06) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - s, s); g.stroke(); }
  g.restore();

  // 內框
  g.strokeStyle = mix(world.color, '#ffffff', 0.35);
  g.globalAlpha = 0.6;
  g.lineWidth = s * 0.012;
  g.strokeRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);
  g.globalAlpha = 1;

  // 標誌（加一層光暈）
  g.shadowColor = mix(world.color, '#ffffff', 0.3);
  g.shadowBlur = s * 0.06;
  drawEmblem(g, world.cell, s / 2, s * 0.44, s * 0.3, mix(world.color, '#ffffff', 0.15));
  g.shadowBlur = 0;

  // 作品名
  g.font = `900 ${Math.round(s * 0.075)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = s * 0.02;
  g.fillText(world.work, s / 2, s * 0.86, s * 0.84);
  return c;
}

/** 兩個 #rrggbb 顏色混合。 */
export function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}
