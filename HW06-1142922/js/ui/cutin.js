// 2D 演出疊層：cut-in 橫條、全螢幕 cut-in、演出字樣（日文）。
import { FACTIONS } from '../core/worlds.js';

let layer = null;
const srcCache = new WeakMap();

function getLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'cutin-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

/** HTMLImageElement 直接用 src；canvas 轉成 data URL（快取起來）。 */
export function imageSrc(image) {
  if (!image) return '';
  if (image instanceof HTMLImageElement) return image.src;
  if (!srcCache.has(image)) srcCache.set(image, image.toDataURL('image/png'));
  return srcCache.get(image);
}

function factionVars(el, faction) {
  const f = FACTIONS[faction];
  if (!f) return;
  el.style.setProperty('--c1', f.primary);
  el.style.setProperty('--c2', f.secondary);
}

function mount(el, lifeMs) {
  getLayer().appendChild(el);
  let gone = false;
  const hide = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  };
  if (lifeMs) setTimeout(hide, lifeMs);
  return { hide, el };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 主角 cut-in。tier：normal → 橫條；key / unison → 全螢幕。
 * worldColor 是招式本色（作品代表色）。
 */
export function showCutin({ heroJa, moveJa, reading, line, faction, image, tier = 'normal', worldColor, lifeMs }) {
  const full = tier === 'key' || tier === 'unison' || tier === 'finish';
  const el = document.createElement('div');
  el.className = `cutin ${full ? 'full' : 'strip'}`;
  factionVars(el, faction);
  if (worldColor) el.style.setProperty('--w', worldColor);
  el.innerHTML = `
    ${full ? '<div class="speedlines"></div><div class="bar top"></div><div class="bar bottom"></div>' : ''}
    <div class="band">
      <div class="portrait"><img alt="" src="${esc(imageSrc(image))}"></div>
      <div class="words">
        <div class="hero">${esc(heroJa)}</div>
        <div class="move" style="--len:${Math.max(4, [...String(moveJa)].length)}">${esc(moveJa)}</div>
        <div class="reading">${esc(reading)}</div>
        ${line ? `<div class="line">${esc(line)}</div>` : ''}
      </div>
    </div>`;
  return mount(el, lifeMs ?? (full ? 1400 : 1000));
}

/** 領袖 cut-in（合體技、結局）。 */
export function showLeaderCutin({ faction, image, titleJa, reading, lifeMs = 1800 }) {
  const f = FACTIONS[faction];
  return showCutin({ heroJa: f.nameJa, moveJa: titleJa, reading, faction, image, tier: 'unison', worldColor: f.secondary, lifeMs });
}

/** 畫面中央的大字（会心の一手、合体…）。 */
export function showBanner(textJa, faction, { lifeMs = 1100, sub = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'banner';
  factionVars(el, faction);
  el.innerHTML = `<div class="big">${esc(textJa)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
  return mount(el, lifeMs);
}

/** 全螢幕閃光（白、或指定顏色）。 */
export function flashScreen(color = '#ffffff', ms = 380) {
  const el = document.createElement('div');
  el.className = 'screen-flash';
  el.style.background = color;
  el.style.animationDuration = `${ms}ms`;
  return mount(el, ms);
}

export function clearAll() {
  if (layer) layer.replaceChildren();
}
