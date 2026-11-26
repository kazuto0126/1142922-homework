// 把一手棋排成「拍點表」：什麼時間點要做哪一段演出。
// 拍點表是純資料，實際畫面由 js/perform.js 對應到特效。

// 使用者要求技能持續久一點（原本 1.5 / 3 / 5 / 7 秒）
export const DUR = { normal: 2200, key: 3800, short: 900, unison: 6500, ending: 8000 };

const NORMAL = [
  { at: 0, kind: 'entrance' },
  { at: 300, kind: 'cutin' },
  { at: 700, kind: 'skill' },
  { at: 2000, kind: 'settle' },
];

const KEY = [
  { at: 0, kind: 'entrance' },
  { at: 0, kind: 'keyCam' },
  { at: 300, kind: 'keyBanner' },
  { at: 700, kind: 'cutin' },
  { at: 1300, kind: 'skill' },
  { at: 3500, kind: 'settle' },
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

export function planEnding(_result) {
  return { duration: DUR.ending, beats: [{ at: 0, kind: 'ending' }] };
}
