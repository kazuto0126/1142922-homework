// 一局棋的狀態。玩家（或雙人模式的先手）永遠是 X，電腦永遠是 O。
import { EMPTY, X, O, winner, winningLine, isGameOver } from './rules.js';
import { chooseMove } from './ai.js';
import { classifyMove, tierOf } from './analysis.js';

const otherFaction = f => (f === 'sukuna' ? 'gojo' : 'sukuna');

export function createMatch({ mode, firstFaction }) {
  if (mode !== 'cpu' && mode !== 'pvp') throw new Error(`未知的模式：${mode}`);
  if (firstFaction !== 'sukuna' && firstFaction !== 'gojo') throw new Error(`未知的陣營：${firstFaction}`);

  const board = Array(9).fill(EMPTY);
  const factionOf = { [X]: firstFaction, [O]: otherFaction(firstFaction) };
  let result = null;

  const turn = () => (board.filter(c => c === X).length === board.filter(c => c === O).length ? X : O);
  const isOver = () => result !== null;
  const isCpuTurn = () => mode === 'cpu' && !isOver() && turn() === O;

  function apply(index) {
    if (!Number.isInteger(index) || index < 0 || index > 8) throw new Error(`格子編號不合法：${index}`);
    if (isOver()) throw new Error('這局已經結束了。');
    if (board[index] !== EMPTY) throw new Error(`第 ${index} 格已經有棋子了。`);
    const mark = turn();
    const classification = classifyMove(board, index);
    board[index] = mark;
    if (isGameOver(board)) {
      const w = winner(board);
      result = { winner: w, winnerFaction: w === EMPTY ? null : factionOf[w], line: winningLine(board) };
    }
    return { index, mark, faction: factionOf[mark], classification, tier: tierOf(classification), result };
  }

  return {
    mode,
    factionOf,
    get board() { return board.slice(); },
    get result() { return result; },
    turn,
    isOver,
    isCpuTurn,
    /** 人類下棋。輪到電腦時丟錯。 */
    play(index) {
      if (isCpuTurn()) throw new Error('現在輪到電腦。');
      return apply(index);
    },
    /** 電腦下棋。只在輪到電腦時可用。 */
    cpuPlay(rng = null) {
      if (!isCpuTurn()) throw new Error('現在不是電腦的回合。');
      return apply(chooseMove(board, rng));
    },
  };
}

/** 從 viewerMark 的角度看結果。 */
export function outcomeFor(result, viewerMark) {
  if (!result || result.winner === EMPTY) return 'draw';
  return result.winner === viewerMark ? 'win' : 'lose';
}
