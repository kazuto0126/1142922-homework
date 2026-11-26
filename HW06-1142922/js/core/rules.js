// 井字棋基本規則。棋盤是長度 9 的陣列：
//  0 | 1 | 2
//  3 | 4 | 5
//  6 | 7 | 8
// 先手固定是 X，後手是 O。

export const EMPTY = 0;
export const X = 1;
export const O = 2;

/** 8 條連線：3 橫、3 直、2 斜。 */
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const opponent = mark => (mark === X ? O : X);

/** 連成一線的三格；沒有就回傳 null。 */
export function winningLine(board) {
  for (const line of LINES) {
    const a = board[line[0]];
    if (a !== EMPTY && a === board[line[1]] && a === board[line[2]]) return line;
  }
  return null;
}

/** 贏家（X 或 O）；沒有人連線就回傳 EMPTY。 */
export function winner(board) {
  const line = winningLine(board);
  return line ? board[line[0]] : EMPTY;
}

export function countEmpty(board) {
  let n = 0;
  for (let i = 0; i < 9; i++) if (board[i] === EMPTY) n++;
  return n;
}

export const isGameOver = board => winner(board) !== EMPTY || countEmpty(board) === 0;

/** X 先手：X 與 O 一樣多時輪到 X，否則輪到 O。 */
export function sideToMove(board) {
  let x = 0, o = 0;
  for (let i = 0; i < 9; i++) {
    if (board[i] === X) x++;
    else if (board[i] === O) o++;
  }
  return x === o ? X : O;
}

/** 盤面不合法時丟錯。 */
export function validate(board) {
  if (!Array.isArray(board) || board.length !== 9) throw new Error('棋盤必須剛好 9 格。');
  let x = 0, o = 0;
  for (let i = 0; i < 9; i++) {
    const c = board[i];
    if (c === X) x++;
    else if (c === O) o++;
    else if (c !== EMPTY) throw new Error(`第 ${i} 格的值不合法：${c}`);
  }
  if (x !== o && x !== o + 1) throw new Error('X 是先手，X 的數量必須等於 O 或多 O 一個。');
}
