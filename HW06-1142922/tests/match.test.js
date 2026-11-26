import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, X, O } from '../js/core/rules.js';
import { classifyMove, tierOf } from '../js/core/analysis.js';
import { createMatch, outcomeFor } from '../js/core/match.js';
import { createStats } from '../js/core/stats.js';

const board = (xs, os) => {
  const b = Array(9).fill(EMPTY);
  for (const i of xs) b[i] = X;
  for (const i of os) b[i] = O;
  return b;
};

// 可重現的亂數（mulberry32）
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('空盤下中心是關鍵一手，下角是一般', () => {
  const c = classifyMove(board([], []), 4);
  assert.deepEqual(c, { win: false, block: false, fork: false, center: true });
  assert.equal(tierOf(c), 'key');
  const n = classifyMove(board([], []), 0);
  assert.deepEqual(n, { win: false, block: false, fork: false, center: false });
  assert.equal(tierOf(n), 'normal');
});

test('擋下對方必勝的一格是關鍵一手', () => {
  const c = classifyMove(board([0, 1], [4]), 2);
  assert.equal(c.block, true);
  assert.equal(tierOf(c), 'key');
});

test('做出雙殺是關鍵一手', () => {
  const c = classifyMove(board([0, 8], [4, 1]), 6);
  assert.equal(c.fork, true);
  assert.equal(c.block, false);
  assert.equal(tierOf(c), 'key');
});

test('連成一線是 finish', () => {
  const c = classifyMove(board([0, 1], [3, 4]), 2);
  assert.equal(c.win, true);
  assert.equal(tierOf(c), 'finish');
});

test('cpu 對局：陣營分配、輪流、電腦回合不能替電腦下', () => {
  const m = createMatch({ mode: 'cpu', firstFaction: 'gojo' });
  assert.deepEqual(m.factionOf, { 1: 'gojo', 2: 'rimuru' });
  assert.equal(m.turn(), X);
  assert.equal(m.isCpuTurn(), false);
  const e = m.play(4);
  assert.equal(e.mark, X);
  assert.equal(e.faction, 'gojo');
  assert.equal(e.tier, 'key');
  assert.equal(m.isCpuTurn(), true);
  assert.throws(() => m.play(0));
  const c = m.cpuPlay(Math.random);
  assert.equal(c.mark, O);
  assert.equal(c.faction, 'rimuru');
  assert.equal(m.board[c.index], O);
  assert.throws(() => m.play(4)); // 有子
  assert.throws(() => m.play(9)); // 超出範圍
  assert.throws(() => m.cpuPlay(Math.random)); // 輪到人類
});

test('board 回傳的是複本', () => {
  const m = createMatch({ mode: 'cpu', firstFaction: 'rimuru' });
  m.board[0] = O;
  assert.equal(m.board[0], EMPTY);
});

test('結束後不能再下', () => {
  const m = createMatch({ mode: 'pvp', firstFaction: 'rimuru' });
  for (const i of [0, 3, 1, 4]) m.play(i);
  const e = m.play(2);
  assert.deepEqual(e.result, { winner: X, winnerFaction: 'rimuru', line: [0, 1, 2] });
  assert.equal(m.isOver(), true);
  assert.throws(() => m.play(5));
});

test('300 局隨機玩家對上電腦，玩家從來沒贏', () => {
  const rng = seeded(1142922);
  const outcomes = { win: 0, lose: 0, draw: 0 };
  for (let g = 0; g < 300; g++) {
    const m = createMatch({ mode: 'cpu', firstFaction: g % 2 ? 'gojo' : 'rimuru' });
    while (!m.isOver()) {
      if (m.isCpuTurn()) m.cpuPlay(rng);
      else {
        const free = m.board.map((c, i) => (c === EMPTY ? i : -1)).filter(i => i >= 0);
        m.play(free[Math.floor(rng() * free.length)]);
      }
    }
    outcomes[outcomeFor(m.result, X)]++;
  }
  assert.equal(outcomes.win, 0);
  assert.ok(outcomes.lose > 0 && outcomes.draw > 0);
});

test('雙人模式：兩邊都用 play，沒有 cpuPlay；平手結果', () => {
  const m = createMatch({ mode: 'pvp', firstFaction: 'gojo' });
  assert.equal(m.isCpuTurn(), false);
  m.play(0);
  assert.equal(m.isCpuTurn(), false);
  assert.throws(() => m.cpuPlay(Math.random));
  for (const i of [4, 8, 1, 7, 6, 2, 5, 3]) m.play(i);
  assert.deepEqual(m.result, { winner: EMPTY, winnerFaction: null, line: null });
  assert.equal(outcomeFor(m.result, X), 'draw');
  assert.equal(outcomeFor({ winner: O, winnerFaction: 'rimuru', line: [0, 4, 8] }, X), 'lose');
  assert.equal(outcomeFor({ winner: O, winnerFaction: 'rimuru', line: [0, 4, 8] }, O), 'win');
});

function fakeStorage() {
  const data = {};
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('戰績：記錄並讀回，存到 hw06-1142922-stats', () => {
  const s = fakeStorage();
  const stats = createStats(s);
  stats.record('win'); stats.record('lose'); stats.record('draw');
  assert.deepEqual(stats.get(), { win: 1, draw: 1, lose: 1 });
  assert.deepEqual(createStats(s).get(), { win: 1, draw: 1, lose: 1 });
  assert.ok('hw06-1142922-stats' in s.data);
  stats.reset();
  assert.deepEqual(stats.get(), { win: 0, draw: 0, lose: 0 });
});

test('戰績：storage 會丟錯時改存記憶體', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const stats = createStats(bad);
  stats.record('draw');
  assert.deepEqual(stats.get(), { win: 0, draw: 1, lose: 0 });
});

test('戰績：資料壞掉時從 0 開始', () => {
  const s = fakeStorage();
  s.setItem('hw06-1142922-stats', '{壞掉');
  assert.deepEqual(createStats(s).get(), { win: 0, draw: 0, lose: 0 });
  s.setItem('hw06-1142922-stats', '{"win":"x","draw":-3}');
  assert.deepEqual(createStats(s).get(), { win: 0, draw: 0, lose: 0 });
});
