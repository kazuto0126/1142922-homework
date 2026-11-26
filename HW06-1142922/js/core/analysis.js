// 判斷一手棋是不是「關鍵一手」，決定演出要多大。
import { EMPTY, winner, sideToMove, opponent } from './rules.js';

/** 盤面上 mark 再下一步就能連線的空格。 */
function winningCells(board, mark) {
  const cells = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] !== EMPTY) continue;
    board[i] = mark;
    if (winner(board) === mark) cells.push(i);
    board[i] = EMPTY;
  }
  return cells;
}

/**
 * board 是下這一手之前的盤面；下棋的人 = sideToMove(board)。
 * win：這手直接連線。block：對手原本一步就能在 index 連線。
 * fork：沒有立刻贏，但下完後自己有 ≥2 個再一步就連線的空格。
 */
export function classifyMove(board, index) {
  const b = board.slice();
  const me = sideToMove(b);
  const block = winningCells(b, opponent(me)).includes(index);
  b[index] = me;
  const win = winner(b) === me;
  const fork = !win && winningCells(b, me).length >= 2;
  return { win, block, fork, center: index === 4 };
}

export function tierOf(c) {
  if (c.win) return 'finish';
  if (c.block || c.fork || c.center) return 'key';
  return 'normal';
}
