// 把一手棋排成「拍點表」：什麼時間點要做哪一段演出。
// 拍點表是純資料，實際畫面由 js/perform.js 對應到特效。

// 使用者要求演出再長一點（歌才聽得到）。參考遊戲技能演出的做法，每一手分成四段：
//   ① 鏡頭推近 + cut-in（看清楚是誰出招）② 蓄力（能量聚集，讓人預期「要來了」）
//   ③ 出招與命中（停頓、震動、閃光）④ 餘韻（餘燼、波紋慢慢散去，鏡頭緩緩退回）
// 關鍵一手（会心の一手、決着）比一般落子更長、更大，重要程度和視覺份量要對得上。
export const DUR = { normal: 4200, key: 7000, short: 900, unison: 6500, ending: 8000 };

const NORMAL = [
  { at: 0, kind: 'entrance' },
  { at: 0, kind: 'softCam' },
  { at: 300, kind: 'cutin' },
  { at: 1250, kind: 'charge' },
  { at: 1900, kind: 'skill' },
  { at: 3000, kind: 'aftermath' },
  { at: 3300, kind: 'settle' },
];

const KEY = [
  { at: 0, kind: 'entrance' },
  { at: 0, kind: 'keyCam' },
  { at: 300, kind: 'keyBanner' },
  { at: 700, kind: 'cutin' },
  { at: 1900, kind: 'charge' },
  { at: 2900, kind: 'skill' },
  { at: 4700, kind: 'aftermath' },
  { at: 5400, kind: 'settle' },
];

const SHORT = [
  { at: 0, kind: 'entrance' },
  { at: 150, kind: 'skill' },
  { at: 750, kind: 'settle' },
];

const copy = beats => beats.map(b => ({ ...b }));

/** event.tier ∈ normal | key | finish。finish 一律用完整的關鍵一手演出。 */
export function planMove(event, { shortMode = false } = {}) {
  if (event.tier === 'finish') return { duration: DUR.key, beats: copy(KEY) };
  if (shortMode) return { duration: DUR.short, beats: copy(SHORT) };
  if (event.tier === 'key') return { duration: DUR.key, beats: copy(KEY) };
  return { duration: DUR.normal, beats: copy(NORMAL) };
}

/** 連線的三位盟友依序出招，最後由領袖放大招。 */
export function planUnison(line) {
  return {
    duration: DUR.unison,
    beats: [
      ...line.map((cell, i) => ({ at: i * 1200, kind: 'unisonHero', cell })),
      { at: 3800, kind: 'unisonLeader' },
    ],
  };
}

/** 對決畫面的長度：宿儺贏（五條悟輸）時，結局前先播領域對決。 */
export const CLASH_MS = 3800;

export function planEnding(result) {
  // 五條悟輸、或是平手，都先播領域對決
  if (result && (result.winnerFaction === 'sukuna' || !result.winnerFaction)) {
    return { duration: CLASH_MS + DUR.ending, beats: [{ at: 0, kind: 'clash' }, { at: CLASH_MS, kind: 'ending' }] };
  }
  return { duration: DUR.ending, beats: [{ at: 0, kind: 'ending' }] };
}
