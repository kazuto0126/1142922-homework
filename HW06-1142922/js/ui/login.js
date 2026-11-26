// 按下 START 後的全螢幕登入動畫（原創設計）：黑畫面打出 LINK START → 彩色光束隧道加速 → 白光 → 進入遊戲。
// 點一下或按空白鍵可以跳過。回傳結束時 resolve 的 Promise。

const DURATION = 4200;

export function playLogin({ onVoice } = {}) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'login';
    root.innerHTML = `
      <canvas></canvas>
      <div class="login-text"><span class="ls">LINK START</span></div>
      <div class="login-sub">1142922HW06-TTT ANIME<br><small>SYSTEM ONLINE</small></div>
      <div class="login-flash"></div>`;
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    const g = canvas.getContext('2d');
    const resize = () => { canvas.width = innerWidth * Math.min(devicePixelRatio || 1, 2); canvas.height = innerHeight * Math.min(devicePixelRatio || 1, 2); };
    resize();
    window.addEventListener('resize', resize);

    // 光束：從中心往外衝的彩色線條
    const streaks = Array.from({ length: 260 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: Math.random() * 0.2,
      v: 0.15 + Math.random() * 0.9,
      hue: Math.floor(Math.random() * 360),
      w: 1 + Math.random() * 2.5,
    }));

    const t0 = performance.now();
    let done = false;
    let raf = 0;
    if (onVoice) setTimeout(() => { if (!done) onVoice(); }, 150);
    // 保底：分頁在背景時瀏覽器會暫停畫面更新，時間到一定結束
    const guard = setTimeout(() => finish(), DURATION + 400);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(guard);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      root.classList.add('out');
      setTimeout(() => root.remove(), 400);
      resolve();
    }
    const onKey = e => { if (e.code === 'Space' || e.code === 'Enter') finish(); };
    window.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', finish);

    function frame(now) {
      const t = (now - t0) / 1000;
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      // 殘影：不完全清掉，光束會拖出尾巴
      g.fillStyle = `rgba(0,0,0,${t < 0.6 ? 1 : 0.28})`;
      g.fillRect(0, 0, W, H);
      root.classList.toggle('tunnel', t > 0.6);
      root.classList.toggle('flash', t > 3.0);
      root.classList.toggle('welcome', t > 3.2);
      if (t > 0.6 && t < 3.3) {
        const speed = Math.pow((t - 0.6) / 2.7, 2) * 3.2 + 0.2; // 越來越快
        g.globalCompositeOperation = 'lighter';
        for (const s of streaks) {
          s.r += s.v * speed * 0.016;
          if (s.r > 1.2) { s.r = Math.random() * 0.05; s.a = Math.random() * Math.PI * 2; }
          const r1 = s.r * s.r * R, r2 = Math.min(R * 1.3, (s.r + 0.04 * speed) ** 2 * R);
          g.strokeStyle = `hsla(${(s.hue + t * 90) % 360},100%,65%,${Math.min(1, s.r * 2)})`;
          g.lineWidth = s.w * (0.5 + s.r * 2);
          g.beginPath();
          g.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
          g.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2);
          g.stroke();
        }
        // 中心的光圈
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.25);
        glow.addColorStop(0, `rgba(255,255,255,${0.25 + speed * 0.1})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
      if (t * 1000 >= DURATION) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
