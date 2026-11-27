// 按下 START 後的全螢幕潛入動畫（原創設計），時間點對齊 link-start.mp3：
//   0.0–0.4 白色介面褪成黑色 → 0.1–1.0 語音「LINK START」、字打出來 → 1.1–4.9 彩色光束隧道越來越快（跟著上升的音效）
//   → 4.9 白光（音效的安靜空檔）→ 5.3 WELCOME → 6.0 結束、進入遊戲。
// 點一下或按空白鍵 / Enter 可以跳過。回傳結束時 resolve 的 Promise。

const T = { text: 0.1, tunnel: 1.1, flash: 4.9, welcome: 5.25, end: 6.0 };

/**
 * startAudio：開始播語音的函式，回傳 Promise（真的開始播放時 resolve 成 { stop(ms) }，播不了是 null）。
 * 動畫會等聲音真的開始（最多 0.7 秒）才起跑，畫面和聲音才對得上。
 */
export function playLogin({ startAudio = null } = {}) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'login';
    root.innerHTML = `
      <canvas></canvas>
      <div class="login-text"><span class="ls">LINK START</span></div>
      <div class="login-sub">WELCOME<br><small>1142922 HW06 · TTT ANIME</small></div>
      <div class="login-flash"></div>`;
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    const g = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    resize();
    window.addEventListener('resize', resize);
    // 第一幀先塗白，接住白色的開機畫面
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);

    // 光束：從中心往外衝的彩色線條
    const streaks = Array.from({ length: 320 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: Math.random() * 0.2,
      v: 0.15 + Math.random() * 0.9,
      hue: Math.floor(Math.random() * 360),
      w: 1 + Math.random() * 2.5,
    }));

    let t0 = 0;
    let done = false;
    let raf = 0;
    let voice = null;
    let guard = 0;

    function finish(skipped = false) {
      if (done) return;
      done = true;
      clearTimeout(guard);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      if (skipped && voice) voice.stop(300);
      root.classList.add('out');
      setTimeout(() => root.remove(), 400);
      resolve();
    }
    const onKey = e => { if (e.code === 'Space' || e.code === 'Enter') finish(true); };
    window.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', () => finish(true));

    let last = 0;
    function frame(now) {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      if (t < 0.4) {
        // 白 → 黑
        const k = t / 0.4;
        const v = Math.round(255 * (1 - k * k));
        g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`;
        g.fillRect(0, 0, W, H);
      } else {
        // 殘影：不完全清掉，光束會拖出尾巴
        g.fillStyle = `rgba(0,0,0,${t < T.tunnel ? 1 : 0.26})`;
        g.fillRect(0, 0, W, H);
      }
      root.classList.toggle('typing', t > T.text);
      root.classList.toggle('tunnel', t > T.tunnel);
      root.classList.toggle('flash', t > T.flash);
      root.classList.toggle('welcome', t > T.welcome);
      if (t > T.tunnel && t < T.flash + 0.3) {
        const k = Math.min(1, (t - T.tunnel) / (T.flash - T.tunnel));
        const speed = k * k * 3.4 + 0.2; // 越來越快，跟著音效往上衝
        g.globalCompositeOperation = 'lighter';
        for (const s of streaks) {
          s.r += s.v * speed * dt;
          if (s.r > 1.2) { s.r = Math.random() * 0.05; s.a = Math.random() * Math.PI * 2; }
          const r1 = s.r * s.r * R, r2 = Math.min(R * 1.3, (s.r + 0.04 * speed) ** 2 * R);
          g.strokeStyle = `hsla(${(s.hue + t * 90) % 360},100%,65%,${Math.min(1, s.r * 2)})`;
          g.lineWidth = s.w * dpr * (0.5 + s.r * 2);
          g.beginPath();
          g.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
          g.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2);
          g.stroke();
        }
        // 中心的光圈，越接近白光越亮
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * (0.18 + k * 0.25));
        glow.addColorStop(0, `rgba(255,255,255,${0.2 + k * 0.6})`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
      if (t >= T.end) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    function begin() {
      if (done || t0) return;
      t0 = performance.now();
      // 保底：分頁在背景時瀏覽器會暫停畫面更新，時間到一定結束
      guard = setTimeout(() => finish(), T.end * 1000 + 500);
      raf = requestAnimationFrame(frame);
    }

    if (startAudio) {
      Promise.resolve(startAudio()).then(h => { voice = h; if (done && h) h.stop(300); begin(); }).catch(() => begin());
      setTimeout(begin, 700); // 聲音載不出來也不要一直等
    } else begin();
  });
}
