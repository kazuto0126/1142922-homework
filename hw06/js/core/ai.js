// 後手不敗 AI：完整 Minimax（Negamax 形式）+ 記憶化。
// 井字棋合法盤面不到 3^9 = 19683 種，全部算得完，所以每一步都是數學上最佳；
// 雙方最佳時必為和局，因此後手最差也是和局，不會輸。
//
// 評分以「輪到下棋的那一方」為準：> 0 必勝、0 和局、< 0 必敗；
// 絕對值 = 分出勝負時剩下的空格數 + 1，所以會「贏得快、輸得慢」。
//
// 選步：分數最高（保證不輸）→ 陷阱最多（對手有越多下法會讓 AI 必勝越好）
//       → 有 rng 時隨機，否則照位置偏好：中心 > 角 > 邊。

import { EMPTY, winner, countEmpty, sideToMove, isGameOver, validate } from './rules.js';

const POSITION_PRIORITY = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const UNKNOWN = -1000;
const cache = new Int32Array(19683).fill(UNKNOWN);

function encode(b) {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 3 + b[i];
  return key;
}

/** Negamax；會暫時修改 b，結束時還原。 */
function search(b) {
  const key = encode(b);
  const cached = cache[key];
  if (cached !== UNKNOWN) return cached;

  let result;
  const empties = countEmpty(b);
  if (winner(b) !== EMPTY) {
    result = -(empties + 1); // 上一手已經連線 → 輪到的人輸
  } else if (empties === 0) {
    result = 0;
  } else {
    const me = sideToMove(b);
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = me;
      const score = -search(b);
      b[i] = EMPTY;
      if (score > best) best = score;
    }
    result = best;
  }
  cache[key] = result;
  return result;
}

/** 以輪到的人的角度評估盤面。 */
export function evaluate(board) {
  validate(board);
  return search(board.slice());
}

/** 輪到的人下在 index 之後，對他有多好。 */
export function scoreMove(board, index) {
  validate(board);
  if (board[index] !== EMPTY) throw new Error(`第 ${index} 格已經有棋子了。`);
  const b = board.slice();
  b[index] = sideToMove(b);
  return -search(b);
}

/** 所有分數最高的步（全部都保證不輸），由小到大。 */
export function getBestMoves(board) {
  validate(board);
  if (isGameOver(board)) throw new Error('遊戲已經結束，沒有可以下的步。');
  const b = board.slice();
  const me = sideToMove(b);
  let bestScore = -Infinity;
  let best = [];
  for (let i = 0; i < 9; i++) {
    if (b[i] !== EMPTY) continue;
    b[i] = me;
    const score = -search(b);
    b[i] = EMPTY;
    if (score > bestScore) { bestScore = score; best = [i]; }
    else if (score === bestScore) best.push(i);
  }
  return best;
}

/** b 是 AI 剛下完、輪到對手的盤面：對手有幾種回應會讓 AI 必勝。 */
function countTraps(b) {
  if (isGameOver(b)) return 0;
  const opp = sideToMove(b);
  let traps = 0;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== EMPTY) continue;
    b[i] = opp;
    if (search(b) > 0) traps++;
    b[i] = EMPTY;
  }
  return traps;
}

/** AI 決定下哪一格。rng 是回傳 [0,1) 的函式；null 時結果固定。 */
export function chooseMove(board, rng = null) {
  const best = getBestMoves(board);
  if (best.length === 1) return best[0];

  const b = board.slice();
  const me = sideToMove(b);
  let maxTraps = -1;
  let candidates = [];
  for (const m of best) {
    b[m] = me;
    const traps = countTraps(b);
    b[m] = EMPTY;
    if (traps > maxTraps) { maxTraps = traps; candidates = [m]; }
    else if (traps === maxTraps) candidates.push(m);
  }

  if (rng) return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  for (const p of POSITION_PRIORITY) if (candidates.includes(p)) return p;
  return candidates[0];
}
