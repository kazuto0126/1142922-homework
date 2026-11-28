// 畫面：標題、選模式、選陣營、HUD、結局、設定、素材來源。介面文字一律中文。
import { FACTIONS } from '../core/worlds.js';
import { MAX_HP, hpTone } from '../core/hp.js';
import { imageSrc } from './cutin.js';
import { mountLive2d } from './live2d.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createScreens(root, handlers, { leaderImages }) {
  const h = name => (...args) => handlers[name] && handlers[name](...args);
  const leaderSrc = f => imageSrc(leaderImages[f]);

  const layers = {};
  function layer(name) {
    if (!layers[name]) {
      const el = document.createElement('div');
      el.className = `screen screen-${name}`;
      el.hidden = true;
      root.appendChild(el);
      layers[name] = el;
    }
    return layers[name];
  }

  let adoptedBoot = null; // index.html 裡預先畫好的封面（第一次顯示標題時直接沿用）
  function only(...names) {
    for (const [n, el] of Object.entries(layers)) el.hidden = !names.includes(n);
    if (adoptedBoot && !names.includes('title')) { adoptedBoot.remove(); adoptedBoot = null; }
  }

  // ── 標題 ──
  function showTitle() {
    const el = layer('title');
    // 封面：白色的系統開機畫面（原創設計），中間一顆很明顯的英文 START，按下去才潛入遊戲
    const checks = ['NEURAL INTERFACE', 'VISUAL OUTPUT', 'AUDIO OUTPUT', 'MOTOR CONTROL', 'BOARD 3×3 GRID'];
    const pre = document.getElementById('preboot');
    if (pre) {
      // 第一次：沿用 HTML 裡已經在播動畫的封面（不重畫，動畫才不會重來），把 START 打開
      pre.removeAttribute('id');
      adoptedBoot = pre;
      el.replaceChildren();
      const btn = pre.querySelector('[data-act=start]');
      btn.disabled = false;
      btn.querySelector('.boot-start-sub').textContent = 'CLICK TO LINK START';
      btn.onclick = h('onStart');
      pre.querySelector('[data-act=credits]').onclick = () => openCredits();
      only('title');
      return;
    }
    el.innerHTML = `
      <div class="boot">
        <div class="boot-grid"></div>
        <div class="boot-rings"><i></i><i></i><i></i><i></i></div>
        <header class="boot-head"><span>SYSTEM BOOT</span><span>1142922 · HW06</span></header>
        <ul class="boot-checks">
          ${checks.map((c, i) => `<li style="--d:${0.25 + i * 0.28}s"><span>${c}</span><b>OK</b></li>`).join('')}
          <li class="ready" style="--d:${0.25 + checks.length * 0.28}s"><span>SESSION</span><b>READY</b></li>
        </ul>
        <div class="boot-center">
          <div class="boot-title">TTT ANIME</div>
          <button class="boot-start" data-act="start" aria-label="START">
            <span class="boot-start-main">START</span>
            <span class="boot-start-sub">CLICK TO LINK START</span>
          </button>
        </div>
        <button class="link credits-link" data-act="credits">素材來源</button>
      </div>`;
    el.querySelector('[data-act=start]').onclick = h('onStart');
    el.querySelector('[data-act=credits]').onclick = () => openCredits();
    only('title');
  }

  // ── 選模式 ──
  function showMode() {
    const el = layer('mode');
    el.innerHTML = `
      <h2>選擇模式</h2>
      <div class="cards">
        <button class="card" data-mode="cpu"><b>對戰電腦</b><span>你先下，電腦後手。電腦絕對不會輸。</span></button>
        <button class="card" data-mode="pvp"><b>雙人對戰</b><span>同一台電腦，兩個人輪流下。</span></button>
      </div>
      <button class="link" data-act="back">← 回標題</button>`;
    el.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => h('onMode')(b.dataset.mode); });
    el.querySelector('[data-act=back]').onclick = h('onHome');
    only('mode');
  }

  // ── 選陣營 ──
  function showFaction(mode) {
    const el = layer('faction');
    const title = mode === 'pvp' ? '先手選擇陣營' : '選擇你的陣營';
    const note = mode === 'pvp' ? '先手選的陣營先下，另一位玩家拿另一個陣營。' : '不管選誰，都是你先下。';
    el.innerHTML = `
      <h2>${title}</h2>
      <p class="note">${note}</p>
      <div class="cards">
        ${['sukuna', 'gojo'].map(f => `
          <button class="card faction ${f}" data-faction="${f}">
            <div data-l2d="${f}" data-sway="0.7"></div>
            <b>${FACTIONS[f].nameZh}</b>
            <span class="jp">${esc(FACTIONS[f].nameJa)}</span>
          </button>`).join('')}
      </div>
      <button class="link" data-act="back">← 換模式</button>`;
    mountLive2d(el, leaderImages);
    el.querySelectorAll('[data-faction]').forEach(b => { b.onclick = () => h('onFaction')(b.dataset.faction); });
    el.querySelector('[data-act=back]').onclick = h('onBackToMode');
    only('faction');
  }

  // ── HUD ──
  /** SAO 風格的 HP 條：名字 + 斜切的血條（綠 → 黃 → 紅，後面有一條延遲的扣血殘影）+ 數字。 */
  function hpBlock(f, name) {
    return `<div class="info">
        <b>${name}<i class="lv">Lv.${f === 'gojo' ? 28 : 1000}</i></b>
        <div class="sao-hp ok" data-hp="${f}"><div class="trail"></div><div class="fill"></div></div>
        <div class="hp-row"><small data-role="${f}"></small><span class="hp-num" data-hpnum="${f}">${MAX_HP} / ${MAX_HP}</span></div>
      </div>`;
  }

  /** 設定血量（有扣血時播扣血動畫、跳出傷害數字）。 */
  function setHp(f, hp, dmg = 0) {
    const el = layer('hud');
    const bar = el.querySelector(`[data-hp=${f}]`);
    if (!bar) return;
    const r = Math.max(0, hp) / MAX_HP;
    bar.querySelector('.fill').style.transform = `scaleX(${r})`;
    bar.className = `sao-hp ${hpTone(hp)}`;
    // 殘影晚一點才跟上，看得出這一下扣了多少
    const trail = bar.querySelector('.trail');
    if (dmg > 0) setTimeout(() => { trail.style.transform = `scaleX(${r})`; }, 450);
    else trail.style.transform = `scaleX(${r})`;
    el.querySelector(`[data-hpnum=${f}]`).textContent = `${Math.max(0, hp)} / ${MAX_HP}`;
    if (dmg > 0) {
      const side = el.querySelector(`.side.${f}`);
      side.classList.remove('hit');
      void side.offsetWidth; // 重新觸發動畫
      side.classList.add('hit');
      const pop = document.createElement('span');
      pop.className = 'dmg-pop';
      pop.textContent = `-${dmg}`;
      bar.parentElement.appendChild(pop);
      setTimeout(() => pop.remove(), 1100);
    }
  }

  function showHud(state) {
    const el = layer('hud');
    el.innerHTML = `
      <div class="hud-bar">
        <div class="side sukuna"><img alt="" src="${esc(leaderSrc('sukuna'))}">${hpBlock('sukuna', '宿儺')}</div>
        <div class="center"><div class="turn"></div><div class="stats"></div></div>
        <div class="side gojo">${hpBlock('gojo', '五條悟')}<img alt="" src="${esc(leaderSrc('gojo'))}"></div>
      </div>
      <div class="hud-tools">
        <button class="icon" data-act="settings" title="設定">⚙</button>
        <button class="icon" data-act="home" title="回標題">⌂</button>
      </div>
      <div class="hud-help">拖曳旋轉視角．滾輪縮放．雙擊回到預設視角．演出中點一下或按空白鍵跳過</div>`;
    el.querySelector('[data-act=settings]').onclick = h('onOpenSettings');
    el.querySelector('[data-act=home]').onclick = h('onHome');
    only('hud');
    updateHud(state);
  }

  function updateHud({ mode, factionOf, turnFaction, stats, thinking, over }) {
    const el = layer('hud');
    for (const f of ['sukuna', 'gojo']) {
      const mark = factionOf[1] === f ? 1 : 2;
      const who = mode === 'cpu' ? (mark === 1 ? '你・先手' : '電腦・後手') : (mark === 1 ? '玩家 1・先手' : '玩家 2・後手');
      el.querySelector(`[data-role=${f}]`).textContent = who;
      el.querySelector(`.side.${f}`).classList.toggle('active', !over && turnFaction === f);
    }
    const turn = el.querySelector('.turn');
    turn.textContent = over ? '對局結束' : `輪到：${FACTIONS[turnFaction].nameZh}${thinking ? '（思考中…）' : ''}`;
    el.querySelector('.stats').textContent = stats ? `戰績 勝 ${stats.win} / 和 ${stats.draw} / 敗 ${stats.lose}` : '';
  }

  // ── 結局 ──
  function showResult({ banner, sub, tone, faction }) {
    const el = layer('result');
    el.className = `screen screen-result tone-${tone}${faction ? ' ' + faction : ''}`;
    el.innerHTML = `
      <div class="result-box">
        <div class="result-banner${[...banner].length > 4 ? ' long' : ''}">${esc(banner)}</div>
        <div class="result-sub">${esc(sub)}</div>
        <div class="result-actions">
          <button class="btn primary" data-act="again">再來一局</button>
          <button class="btn" data-act="home">回標題</button>
        </div>
      </div>`;
    el.querySelector('[data-act=again]').onclick = h('onAgain');
    el.querySelector('[data-act=home]').onclick = h('onHome');
    layers.result.hidden = false;
  }

  function hideResult() {
    if (layers.result) layers.result.hidden = true;
  }

  // ── 設定 ──
  function openSettings(settings) {
    const el = layer('settings');
    const s = { ...settings };
    el.innerHTML = `
      <div class="panel">
        <h3>設定</h3>
        <label class="row"><span>音樂</span><input type="checkbox" data-k="musicOn" ${s.musicOn ? 'checked' : ''}></label>
        <label class="row"><span>音效</span><input type="checkbox" data-k="sfxOn" ${s.sfxOn ? 'checked' : ''}></label>
        <label class="row"><span>音量</span><input type="range" min="0" max="100" data-k="volume" value="${Math.round(s.volume * 100)}"></label>
        <div class="row"><span>演出</span>
          <div class="seg" data-k="shortMode">
            <button data-v="false" class="${!s.shortMode ? 'on' : ''}">完整</button><button data-v="true" class="${s.shortMode ? 'on' : ''}">精簡</button>
          </div>
        </div>
        <div class="row"><span>畫質</span>
          <div class="seg" data-k="quality">
            <button data-v="auto" class="${s.quality === 'auto' ? 'on' : ''}" title="開頭動畫時量這台電腦的效能自動決定">自動</button><button data-v="high" class="${s.quality === 'high' ? 'on' : ''}">高</button><button data-v="low" class="${s.quality === 'low' ? 'on' : ''}">低</button>
          </div>
        </div>
        <button class="btn primary" data-act="close">關閉</button>
      </div>`;
    const emit = () => h('onSettings')({ ...s });
    el.querySelectorAll('input[type=checkbox]').forEach(i => { i.onchange = () => { s[i.dataset.k] = i.checked; emit(); }; });
    el.querySelector('input[type=range]').oninput = e => { s.volume = Number(e.target.value) / 100; emit(); };
    el.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          const k = seg.dataset.k;
          s[k] = k === 'shortMode' ? b.dataset.v === 'true' : b.dataset.v;
          seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          emit();
        };
      });
    });
    el.querySelector('[data-act=close]').onclick = () => { el.hidden = true; };
    el.onclick = e => { if (e.target === el) el.hidden = true; };
    el.hidden = false;
  }

  // ── 素材來源 ──
  async function openCredits() {
    const el = layer('credits');
    el.innerHTML = '<div class="panel"><h3>素材來源</h3><div class="list">讀取中…</div><button class="btn primary" data-act="close">關閉</button></div>';
    el.querySelector('[data-act=close]').onclick = () => { el.hidden = true; };
    el.onclick = e => { if (e.target === el) el.hidden = true; };
    el.hidden = false;
    const list = el.querySelector('.list');
    let items = [];
    try {
      const r = await fetch('assets/credits.json', { cache: 'no-store' });
      if (r.ok) items = await r.json();
    } catch { /* 沒有清單 */ }
    const base = `<p>3D 引擎：three.js（MIT License）。字型：Dela Gothic One（SIL Open Font License）。<br>
      角色、作品名稱與圖片、音樂的著作權屬於各原作者與權利人，本作業僅供課堂學習展示。</p>`;
    list.innerHTML = base + (items.length
      ? `<ul>${items.map(c => `<li><b>${esc(c.title)}</b>：<a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.author || c.source)}</a></li>`).join('')}</ul>`
      : '<p class="muted">圖片與音樂素材整理中。</p>');
  }

  return {
    showTitle, showMode, showFaction, showHud, updateHud, setHp, showResult, hideResult, openSettings, openCredits,
    hideAll: () => only(),
  };
}
