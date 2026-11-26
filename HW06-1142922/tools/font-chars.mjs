// 收集日文字型子集要包含的字：worlds.js 的日文欄位 + 演出字樣 + 英數。
// 用法：node tools/font-chars.mjs  → 印出去重後的字串
import { WORLDS, FACTIONS } from '../js/core/worlds.js';

const EXTRA = [
  '会心の一手', '決着', '合体', '勝利', '敗北', '勢均力敵', '引き分け', '陣營', '陣営', '利姆路', '五條悟', 'vs', 'VS',
  '！？!?「」『』・＝ー～…。、', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 ',
];

const strings = [...EXTRA];
for (const w of WORLDS) strings.push(w.heroJa, w.moveJa, w.reading, w.line || '');
for (const f of Object.values(FACTIONS)) {
  strings.push(f.nameJa, f.entranceJa, f.entranceReading, f.unisonJa, f.unisonReading, f.victoryJa, f.victoryReading);
}

const chars = [...new Set([...strings.join('')])].sort().join('');
process.stdout.write(chars);
