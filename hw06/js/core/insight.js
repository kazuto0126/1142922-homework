// 給畫面用的分析（純邏輯，可以單元測試）：
// cpuInsight：電腦思考時，每個空格「電腦下這裡」的結果（必勝 / 平手 / 會輸），直接用 AI 的搜尋分數。
// threats：已經有兩顆同色棋子、只差一格就連線的格子（危機警示）。
import { EMPTY, LINES } from './rules.js';
import { scoreMove } from './ai.js';

/** 輪到的人在每個空格下下去之後的結果：'win' | 'draw' | 'lose'（以輪到的人的角度）。 */
export function cpuInsight(board) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] !== EMPTY) continue;
    const s = scoreMove(board, i);
    out.push({ cell: i, outcome: s > 0 ? 'win' : s < 0 ? 'lose' : 'draw' });
  }
  return out;
}

/** 只差一格就連線的格子：[{ cell, mark }]。同一格兩邊都差一格時，兩筆都會列出來。 */
export function threats(board) {
  const seen = new Set();
  const out = [];
  for (const line of LINES) {
    const marks = line.map(i => board[i]);
    const empty = line.filter(i => board[i] === EMPTY);
    if (empty.length !== 1) continue;
    const filled = marks.filter(m => m !== EMPTY);
    if (filled[0] !== filled[1]) continue;
    const key = `${empty[0]}:${filled[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cell: empty[0], mark: filled[0] });
  }
  return out;
}
