import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, X, O, winner, countEmpty, isGameOver } from '../js/core/rules.js';
import { evaluate, getBestMoves, chooseMove } from '../js/core/ai.js';

const empty = () => Array(9).fill(EMPTY);
const winsNow = (b, i, m) => { b[i] = m; const w = winner(b) === m; b[i] = EMPTY; return w; };

test('空棋盤完美對下是和局', () => assert.equal(evaluate(empty()), 0));

test('實際 AI 對上 X 的所有下法：489 局，X 贏 0', () => {
  const s = { games: 0, x: 0, o: 0, d: 0, decisions: 0, missed: 0 };
  const playX = b => {
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = X;
      if (winner(b) === X) { s.games++; s.x++; }
      else if (!countEmpty(b)) { s.games++; s.d++; }
      else playO(b);
      b[i] = EMPTY;
    }
  };
  const playO = b => {
    s.decisions++;
    const canWin = b.some((c, i) => c === EMPTY && winsNow(b, i, O));
    const m = chooseMove(b);
    b[m] = O;
    if (canWin && winner(b) !== O) s.missed++;
    if (winner(b) === O) { s.games++; s.o++; }
    else if (!countEmpty(b)) { s.games++; s.d++; }
    else playX(b);
    b[m] = EMPTY;
  };
  playX(empty());
  assert.deepEqual(s, { games: 489, x: 0, o: 366, d: 123, decisions: 648, missed: 0 });
});

test('所有同分最佳步都展開：6112 條路線，輸 0 條', () => {
  let lines = 0, losses = 0;
  const allX = b => {
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = X;
      if (winner(b) === X) { lines++; losses++; }
      else if (!countEmpty(b)) lines++;
      else allO(b);
      b[i] = EMPTY;
    }
  };
  const allO = b => {
    for (const m of getBestMoves(b)) {
      b[m] = O;
      if (isGameOver(b)) lines++; else allX(b);
      b[m] = EMPTY;
    }
  };
  allX(empty());
  assert.equal(losses, 0);
  assert.equal(lines, 6112);
});

test('對照組：永遠下第一個空格的笨 AI 輸 429 局', () => {
  let losses = 0;
  const dumbX = b => {
    for (let i = 0; i < 9; i++) {
      if (b[i] !== EMPTY) continue;
      b[i] = X;
      if (winner(b) === X) losses++;
      else if (countEmpty(b)) {
        const m = b.indexOf(EMPTY);
        b[m] = O;
        if (!isGameOver(b)) dumbX(b);
        b[m] = EMPTY;
      }
      b[i] = EMPTY;
    }
  };
  dumbX(empty());
  assert.equal(losses, 429);
});

test('X 先下角，唯一不輸的回應是中心', () => {
  for (const c of [0, 2, 6, 8]) {
    const b = empty(); b[c] = X;
    assert.deepEqual(getBestMoves(b), [4]);
    assert.equal(chooseMove(b), 4);
  }
});

test('對角陷阱：X 在 0、8，O 在 4 → AI 下邊', () => {
  const b = empty(); b[0] = X; b[4] = O; b[8] = X;
  assert.ok([1, 3, 5, 7].includes(chooseMove(b)));
});

test('傳入 rng 時只會從最佳步裡挑', () => {
  const b = empty(); b[1] = X;
  for (const r of [0, 0.3, 0.6, 0.999]) assert.ok(getBestMoves(b).includes(chooseMove(b, () => r)));
});

test('非法盤面丟錯', () => {
  assert.throws(() => getBestMoves([X, X, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]));
  assert.throws(() => getBestMoves([X, X, X, O, O, EMPTY, EMPTY, EMPTY, EMPTY])); // 已結束
});
