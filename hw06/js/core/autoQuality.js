// 依開頭登入動畫期間量到的每幀時間，決定要給完整特效還是輕量版（純邏輯，可以單元測試）。
// 量的時候背後同時預演好幾招（實測約是平常放一招的 1.6 倍重），而且每幀都強迫等顯示卡畫完
// （平常 CPU 和顯示卡是同時做的），量到的數字會比實際順跑時高，所以門檻放寬。
export const FULL_MS = 30;     // 中位數在這以下：完整特效、最高解析度
export const REDUCED_MS = 48;  // 這以下：完整特效，但關掉抗鋸齒
// 再慢：輕量版（關陰影與鏡面反射、解析度 1 倍、粒子減量）

/** result：stage.stopBenchmark() 的結果。回傳 'full' | 'reduced' | 'lite'；沒量到回傳 null。 */
export function pickTier(result) {
  if (!result || !Number.isFinite(result.median)) return null;
  if (result.median <= FULL_MS) return 'full';
  if (result.median <= REDUCED_MS) return 'reduced';
  return 'lite';
}

/** 自動模式下各等級對應的 { quality, perfLevel }。 */
export function tierSettings(tier) {
  if (tier === 'lite') return { quality: 'low', perfLevel: 0 };
  if (tier === 'reduced') return { quality: 'high', perfLevel: 1 }; // 等級 1：關抗鋸齒、解析度不變
  return { quality: 'high', perfLevel: 0 };
}
