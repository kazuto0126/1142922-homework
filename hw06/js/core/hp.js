// SAO 風格的 HP：每下一步，依「這步有多關鍵」扣對手的血（純邏輯，可以單元測試）。
// 連線那一步直接把對手打到 0；其他步不會把人打死（至少留 MIN_LEFT），結局一定是連線或平手決定的。
export const MAX_HP = 100;
export const MIN_LEFT = 8;

/**
 * classification：analysis.classifyMove 的結果 { win, block, fork, center }。
 * hp：被打的那一方目前的血量。回傳要扣的血（整數，≥ 0）。
 */
export function moveDamage(classification, hp) {
  if (hp <= 0) return 0;
  if (classification.win) return hp;
  let dmg = 9;
  if (classification.center) dmg += 6;
  if (classification.block) dmg += 12;
  if (classification.fork) dmg += 16;
  return Math.max(0, Math.min(dmg, hp - MIN_LEFT));
}

/** 血量比例對應的 SAO 顏色階段：綠 → 黃 → 紅。 */
export function hpTone(hp) {
  const r = hp / MAX_HP;
  return r > 0.5 ? 'ok' : r > 0.2 ? 'warn' : 'danger';
}
