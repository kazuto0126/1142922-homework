// 把一手棋排成「拍點表」：什麼時間點要做哪一段演出。
// 拍點表是純資料，實際畫面由 js/perform.js 對應到特效。

export const DUR = { normal: 1500, key: 3000, short: 700, unison: 5000, ending: 7000 };

const NORMAL = [
  { at: 0, kind: 'entrance' },
  { at: 250, kind: 'cutin' },
  { at: 500, kind: 'skill' },
  { at: 1300, kind: 'settle' },
];

const KEY = [
  { at: 0, kind: 'entrance' },
  { at: 0, kind: 'keyCam' },
  { at: 300, kind: 'keyBanner' },
  { at: 700, kind: 'cutin' },
  { at: 1200, kind: 'skill' },
  { at: 2700, kind: 'settle' },
];

const SHORT = [
  { at: 0, kind: 'entrance' },
  { at: 150, kind: 'skill' },
  { at: 550, kind: 'settle' },
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
      ...line.map((cell, i) => ({ at: i * 900, kind: 'unisonHero', cell })),
      { at: 2800, kind: 'unisonLeader' },
    ],
  };
}

export function planEnding(_result) {
  return { duration: DUR.ending, beats: [{ at: 0, kind: 'ending' }] };
}
