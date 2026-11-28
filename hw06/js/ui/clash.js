// 領域對決畫面（原創抽象美術，不畫任何角色）：輸的時候在伏魔御廚子之前播放。
// 左：五條悟的「無量空処」（無限延伸的星空虛空）；右：宿儺的「伏魔御廚子」（血紅天空、落下的斬擊、骨白碎片）。
// 中間一道斜線，兩邊互推、交界噴火花 → 紅色佔上風、左邊出現裂痕 → 左半邊像玻璃一樣碎掉 → 紅色吞掉整個畫面。
// 總長約 3.8 秒；可以從外面呼叫 clearClash() 立刻收掉（跳過、回標題）。
import { makeFrameGate } from './frameGate.js';

const T = { in: 0.35, push: 2.0, crack: 2.0, shatter: 2.65, flood: 3.1, end: 3.8 };
let active = null;

/** 立刻收掉對決畫面（跳過演出時用）。 */
export function clearClash() {
  if (active) active.finish();
}

/** 播放領域對決。sfx(name, opts)：播放音效的函式。回傳結束時 resolve 的 Promise。 */
/**
 * outcome：'lose'（五條悟這邊被打碎、紅色吞掉畫面）或 'draw'（兩邊僵持、都出現裂痕，交界爆出白光把兩邊震開，「勢均力敵」）。
 */
export function playDomainClash({ sfx = () => {}, outcome = 'lose' } = {}) {
  const draw = outcome === 'draw';
  clearClash();
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'clash';
    root.innerHTML = `
      <canvas></canvas>
      <div class="clash-name left"><small>領域展開</small><b>無量空処</b></div>
      <div class="clash-name right"><small>領域展開</small><b>伏魔御廚子</b></div>
      ${draw ? '<div class="clash-final"><small>DRAW</small><b>勢均力敵</b></div>' : '<div class="clash-final"><small>領域展開</small><b>伏魔御廚子</b></div>'}`;
    if (draw) root.classList.add('draw');
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    const g = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 1.25); // 全螢幕 2D 畫布（還有一張離屏的），解析度不用太高，省很多
    let W = 0, H = 0;
    const resize = () => { W = canvas.width = Math.round(innerWidth * dpr); H = canvas.height = Math.round(innerHeight * dpr); };
    resize();
    window.addEventListener('resize', resize);

    // 左半邊用的離屏畫布（碎裂時切成碎片）
    const leftBuf = document.createElement('canvas');
    const lg = leftBuf.getContext('2d');

    const rnd = (a, b) => a + Math.random() * (b - a);
    const stars = Array.from({ length: 240 }, () => ({ a: rnd(0, Math.PI * 2), r: Math.random(), v: rnd(0.05, 0.35), s: rnd(0.5, 2.2) }));
    const slashes = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), len: rnd(0.08, 0.28), ang: rnd(-1.2, -0.4), t: Math.random() * 2, w: rnd(1.5, 5) }));
    const bones = Array.from({ length: 40 }, () => ({ x: Math.random(), y: rnd(0.55, 1.05), s: rnd(4, 14), rot: rnd(0, 6), vr: rnd(-2, 2), vy: rnd(-0.05, -0.15) }));
    const sparks = [];
    let cracks = [];
    const rightCracks = [];
    let shards = null;

    const t0 = performance.now();
    let last = t0;
    let raf = 0;
    let done = false;
    const fired = new Set();
    const once = (k, fn) => { if (!fired.has(k)) { fired.add(k); fn(); } };

    // 斜線位置：x = seamX + (y - H/2) * slope（上方偏右、下方偏左）
    const slope = -0.28;
    function seamAt(seamX, y) { return seamX + (y - H / 2) * slope; }

    function drawLeft(ctx, t) {
      // 無量空処：深靛色的無限虛空，星光從消失點往外流
      const cx = W * 0.27, cy = H * 0.5;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.6);
      grd.addColorStop(0, '#e9f3ff');
      grd.addColorStop(0.05, '#6fb6ff');
      grd.addColorStop(0.22, '#2a2f8f');
      grd.addColorStop(0.55, '#0b0b2e');
      grd.addColorStop(1, '#020210');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.hypot(W, H) * 0.7;
      for (const s of stars) {
        const r = ((s.r + t * s.v) % 1);
        const r1 = r * r * R, r2 = Math.min(R, (r + 0.025) ** 2 * R);
        ctx.strokeStyle = `rgba(${170 + s.s * 30},${210 + s.s * 15},255,${Math.min(1, r * 1.8)})`;
        ctx.lineWidth = s.s * dpr * (0.4 + r);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        ctx.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2);
        ctx.stroke();
      }
      // 環繞消失點的光環
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(150,190,255,${0.25 - i * 0.06})`;
        ctx.lineWidth = (2 + i) * dpr;
        ctx.beginPath();
        ctx.ellipse(cx, cy, W * (0.08 + i * 0.07) * (1 + 0.05 * Math.sin(t * 3 + i)), H * (0.05 + i * 0.05), t * (0.4 + i * 0.2), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawRight(ctx, t) {
      // 伏魔御廚子：血紅的天空、往下的暗色、落下的斬擊與骨白碎片
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a0004');
      grd.addColorStop(0.35, '#7a0612');
      grd.addColorStop(0.62, '#d4202c');
      grd.addColorStop(0.78, '#3a0208');
      grd.addColorStop(1, '#0a0002');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      // 地平線上鋸齒狀的黑色剪影（抽象的尖刺，不是任何建築）
      ctx.fillStyle = '#0d0103';
      ctx.beginPath();
      ctx.moveTo(W * 0.3, H);
      for (let i = 0; i <= 40; i++) {
        const x = W * (0.3 + i * 0.0175);
        const spike = (i % 3 === 0 ? 0.16 : 0.07) * Math.abs(Math.sin(i * 12.9898));
        ctx.lineTo(x, H * (0.8 - spike));
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // 骨白碎片往上飄
      ctx.fillStyle = 'rgba(240,230,215,0.85)';
      for (const b of bones) {
        const y = ((b.y + t * b.vy) % 1.1 + 1.1) % 1.1;
        ctx.save();
        ctx.translate(W * b.x, H * y);
        ctx.rotate(b.rot + t * b.vr);
        ctx.fillRect(-b.s * dpr / 2, -b.s * dpr / 5, b.s * dpr, b.s * dpr / 2.5);
        ctx.restore();
      }
      // 不斷落下的斬擊（白芯 + 紅光）
      ctx.lineCap = 'round';
      for (const s of slashes) {
        const k = ((t * 1.6 + s.t) % 1);
        const x = W * s.x, y = H * s.y;
        const dx = Math.cos(s.ang) * W * s.len, dy = -Math.sin(s.ang) * W * s.len;
        const a = Math.sin(k * Math.PI);
        ctx.strokeStyle = `rgba(255,60,70,${a * 0.6})`;
        ctx.lineWidth = s.w * dpr * 2.4;
        ctx.beginPath(); ctx.moveTo(x - dx * k, y - dy * k); ctx.lineTo(x + dx * k, y + dy * k); ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,240,${a})`;
        ctx.lineWidth = s.w * dpr * 0.6;
        ctx.stroke();
      }
    }

    const gate = makeFrameGate();
    function frame(now) {
      if (gate(now)) { raf = requestAnimationFrame(frame); return; } // 高更新率螢幕每兩次才畫一次
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= T.end) { finish(); return; }

      // 斜線位置：滑進來 → 中間拉鋸 → 紅色往左推
      let seamX;
      const appear = Math.min(1, t / T.in);
      if (draw) seamX = W * (0.5 + Math.sin(t * 9) * 0.012 * appear + Math.sin(t * 23) * 0.006 + (t > T.push ? Math.sin(t * 37) * 0.01 : 0));
      else if (t < T.push) seamX = W * (0.5 + Math.sin(t * 9) * 0.012 * appear + Math.sin(t * 23) * 0.006);
      else seamX = W * (0.5 - Math.pow(Math.min(1, (t - T.push) / (T.shatter - T.push)), 2) * 0.12);
      // 震動
      const shake = (t < T.shatter ? 6 + 10 * Math.max(0, (t - T.push) / (T.shatter - T.push)) : Math.max(0, 22 * (1 - (t - T.shatter) / 0.5))) * dpr;
      const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;

      g.save();
      g.clearRect(0, 0, W, H);
      g.translate(ox, oy);

      // 右半邊（宿儺）：整個畫面先畫紅色，左邊之後蓋上去
      const rightIn = (1 - appear) * W * 0.5;
      // 平手：交界爆開時兩邊往外震開
      const burst = draw && t > T.shatter ? 1 - Math.pow(1 - Math.min(1, (t - T.shatter) / 0.45), 3) : 0;
      const apart = burst * W * 0.06;
      g.save();
      g.translate(rightIn + apart, 0);
      drawRight(g, t);
      // 平手時宿儺這邊也會裂
      if (draw && rightCracks.length) {
        const grow = Math.min(1, (t - T.crack) / (T.shatter - T.crack));
        g.lineCap = 'round';
        // 發光：先畫一條寬的半透明色光、再畫細白芯（不用 shadowBlur，那個每幀都要做模糊，很慢）
        for (const c of rightCracks) {
          const n = Math.max(1, Math.floor(c.length * grow));
          g.beginPath();
          g.moveTo(c[0][0], c[0][1]);
          for (let k = 1; k < n; k++) g.lineTo(c[k][0], c[k][1]);
          g.strokeStyle = 'rgba(143,180,255,0.35)';
          g.lineWidth = 10 * dpr;
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.95)';
          g.lineWidth = 2.5 * dpr;
          g.stroke();
        }
      }
      g.restore();

      // 左半邊（五條悟）畫到離屏畫布，再用斜線裁切
      if (leftBuf.width !== W || leftBuf.height !== H) { leftBuf.width = W; leftBuf.height = H; }
      if (!shards) {
        lg.clearRect(0, 0, W, H);
        drawLeft(lg, t);
        // 裂痕
        if (t > T.crack) {
          once('crack', () => {
            sfx('impact', { pitch: 0.5, gain: 0.9 });
            for (let i = 0; i < 9; i++) {
              const sx = seamAt(seamX, H * (0.15 + i * 0.09)), sy = H * (0.15 + i * 0.09);
              const pts = [[sx, sy]];
              let x = sx, y = sy;
              const dir = Math.PI + (Math.random() - 0.5) * 1.2;
              for (let k = 0; k < 6; k++) { x += Math.cos(dir + (Math.random() - 0.5) * 0.9) * W * 0.06; y += Math.sin(dir + (Math.random() - 0.5) * 0.9) * W * 0.06; pts.push([x, y]); }
              cracks.push(pts);
              if (draw) {
                // 往右邊長的裂痕（宿儺那側）
                const rp = [[sx, sy]];
                let rx = sx, ry = sy;
                const rdir = (Math.random() - 0.5) * 1.2;
                for (let k = 0; k < 6; k++) { rx += Math.cos(rdir + (Math.random() - 0.5) * 0.9) * W * 0.06; ry += Math.sin(rdir + (Math.random() - 0.5) * 0.9) * W * 0.06; rp.push([rx, ry]); }
                rightCracks.push(rp);
              }
            }
          });
          const grow = Math.min(1, (t - T.crack) / (T.shatter - T.crack));
          lg.lineCap = 'round';
          for (const c of cracks) {
            const n = Math.max(1, Math.floor(c.length * grow));
            lg.beginPath();
            lg.moveTo(c[0][0], c[0][1]);
            for (let k = 1; k < n; k++) lg.lineTo(c[k][0], c[k][1]);
            lg.strokeStyle = 'rgba(255,51,71,0.35)'; // 寬的紅光（取代 shadowBlur）
            lg.lineWidth = 10 * dpr;
            lg.stroke();
            lg.strokeStyle = 'rgba(255,255,255,0.95)';
            lg.lineWidth = 2.5 * dpr;
            lg.stroke();
          }
        }
        g.save();
        g.translate(-(1 - appear) * W * 0.5 - apart, 0);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(seamAt(seamX, 0), 0);
        g.lineTo(seamAt(seamX, H), H);
        g.lineTo(0, H);
        g.closePath();
        g.clip();
        g.drawImage(leftBuf, 0, 0);
        g.restore();

        // 交界：發光的斜線 + 火花
        g.globalCompositeOperation = 'lighter';
        const glow = 10 + Math.random() * 8;
        for (const [w, c] of [[glow * 2.2, 'rgba(255,80,90,0.35)'], [glow, 'rgba(160,190,255,0.6)'], [3, '#ffffff']]) {
          g.strokeStyle = c;
          g.lineWidth = w * dpr;
          g.beginPath();
          g.moveTo(seamAt(seamX, -20), -20);
          g.lineTo(seamAt(seamX, H + 20), H + 20);
          g.stroke();
        }
        if (appear >= 1) {
          for (let i = 0; i < 10; i++) {
            const y = Math.random() * H;
            const side = Math.random() < 0.5 ? -1 : 1;
            sparks.push({ x: seamAt(seamX, y), y, vx: side * rnd(200, 900) * dpr, vy: rnd(-500, 300) * dpr, life: rnd(0.2, 0.5), age: 0, red: side > 0 });
          }
        }
        g.globalCompositeOperation = 'source-over';
      }

      // 碎裂：把左半邊切成三角形碎片往外飛
      // 平手：交界爆出白光（不碎裂）
      if (draw && t > T.shatter) {
        const k = Math.min(1, (t - T.shatter) / 0.9);
        const cx = seamAt(seamX, H / 2), r = Math.hypot(W, H) * (0.15 + k * 0.7);
        const grd = g.createRadialGradient(cx, H / 2, 0, cx, H / 2, r);
        grd.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - k * 0.6)})`);
        grd.addColorStop(0.35, `rgba(200,170,255,${0.55 * (1 - k)})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = grd;
        g.fillRect(-50, -50, W + 100, H + 100);
        g.globalCompositeOperation = 'source-over';
      }
      if (!draw && t > T.shatter) {
        once('shatter', () => {
          sfx('explode', { pitch: 0.7 });
          sfx('impact', { pitch: 0.4 });
          const snap = document.createElement('canvas');
          snap.width = W; snap.height = H;
          snap.getContext('2d').drawImage(leftBuf, 0, 0);
          shards = [];
          const cols = 7, rows = 6;
          const pts = [];
          for (let r = 0; r <= rows; r++) {
            pts.push([]);
            for (let c = 0; c <= cols; c++) {
              const jx = c === 0 || c === cols ? 0 : rnd(-0.4, 0.4), jy = r === 0 || r === rows ? 0 : rnd(-0.4, 0.4);
              const y = H * ((r + jy) / rows);
              const right = seamAt(seamX, y);
              pts[r].push([right * ((c + jx) / cols), y]);
            }
          }
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
            for (const tri of [[a, b, e], [a, e, d]]) {
              const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
              const away = Math.atan2(cy - H / 2, cx - seamX) + rnd(-0.6, 0.6);
              shards.push({ tri, cx, cy, vx: Math.cos(away) * rnd(300, 1300) * dpr - 400 * dpr, vy: Math.sin(away) * rnd(300, 1100) * dpr - 200 * dpr, rot: 0, vr: rnd(-6, 6), x: 0, y: 0, snap });
            }
          }
        });
        const k = (t - T.shatter);
        for (const s of shards) {
          s.vy += 2200 * dpr * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
          g.save();
          g.globalAlpha = Math.max(0, 1 - k * 1.4);
          g.translate(s.cx + s.x, s.cy + s.y);
          g.rotate(s.rot);
          g.translate(-s.cx, -s.cy);
          g.beginPath();
          g.moveTo(s.tri[0][0], s.tri[0][1]); g.lineTo(s.tri[1][0], s.tri[1][1]); g.lineTo(s.tri[2][0], s.tri[2][1]); g.closePath();
          g.clip();
          g.drawImage(s.snap, 0, 0);
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 1.5 * dpr;
          g.stroke();
          g.restore();
        }
        g.globalAlpha = 1;
      }

      // 火花
      g.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age > s.life) { sparks.splice(i, 1); continue; }
        s.vy += 900 * dpr * dt;
        const x2 = s.x + s.vx * dt * 3, y2 = s.y + s.vy * dt * 3;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const a = 1 - s.age / s.life;
        g.strokeStyle = s.red ? `rgba(255,${120 + a * 100},${110 * a},${a})` : `rgba(${180 + a * 60},${210 + a * 40},255,${a})`;
        g.lineWidth = 2 * dpr;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(x2, y2); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';

      // 紅光吞掉整個畫面
      if (t > T.flood) {
        const k = Math.min(1, (t - T.flood) / (T.end - T.flood));
        g.fillStyle = draw ? `rgba(60,30,110,${k * 0.8})` : `rgba(150,0,14,${k * 0.85})`;
        g.fillRect(-50, -50, W + 100, H + 100);
      }
      g.restore();

      root.classList.toggle('in', t > 0.05);
      root.classList.toggle('broken', t > T.shatter);
      root.classList.toggle('final', t > T.flood - 0.15);
      root.classList.toggle('out', t > T.end - 0.35);
      raf = requestAnimationFrame(frame);
    }

    function finish() {
      if (done) return;
      done = true;
      active = null;
      cancelAnimationFrame(raf);
      clearTimeout(guard);
      window.removeEventListener('resize', resize);
      root.classList.add('out');
      setTimeout(() => root.remove(), 300);
      resolve();
    }
    // 保底：分頁在背景時畫面更新會暫停，時間到一定結束
    const guard = setTimeout(finish, T.end * 1000 + 400);
    active = { finish };
    sfx('whoosh', { pitch: 0.6 });
    sfx('thunder', { pitch: 0.6, gain: 0.7 });
    raf = requestAnimationFrame(frame);
  });
}
