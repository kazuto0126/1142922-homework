// 演出時間軸：依「經過的時間」執行排好的步驟，可以跳過或取消。
// 每一幀呼叫 update()；就算幀數很少（分頁在背景），到期的步驟也會依序執行。

export class Timeline {
  constructor({ now = () => performance.now(), onError = e => console.error(e) } = {}) {
    this._now = now;
    this._onError = onError;
    this._steps = [];
    this._duration = 0;
    this._start = null;
    this._next = 0;
    this._state = 'idle'; // idle | playing | done | skipped | cancelled
    this._resolve = null;
    this._skipHandlers = [];
    this._early = null;
    this._quietSince = null;
  }

  /**
   * 提早結束：所有步驟都跑過、而且已經過了 afterMs 之後，只要 isQuiet() 連續 stableMs 都成立，
   * 就直接算演完（不用等到 setDuration 的長度）。setDuration 仍然是上限。
   */
  endEarlyWhen(isQuiet, { afterMs = 0, stableMs = 300 } = {}) {
    this._early = { isQuiet, afterMs, stableMs };
    return this;
  }

  add(atMs, fn) {
    this._steps.push({ at: atMs, fn, order: this._steps.length });
    return this;
  }

  setDuration(ms) {
    this._duration = ms;
    return this;
  }

  onSkip(fn) {
    this._skipHandlers.push(fn);
    return this;
  }

  get state() { return this._state; }

  play() {
    this._steps.sort((a, b) => a.at - b.at || a.order - b.order);
    this._start = this._now();
    this._state = 'playing';
    // 第一批步驟在下一次 update()（下一幀）才執行，所以 play() 之後立刻 cancel() 什麼都不會跑。
    return new Promise(resolve => { this._resolve = resolve; });
  }

  update() {
    if (this._state !== 'playing') return;
    const elapsed = this._now() - this._start;
    while (this._next < this._steps.length && this._steps[this._next].at <= elapsed) {
      const step = this._steps[this._next++];
      this._safe(step.fn);
      if (this._state !== 'playing') return; // 步驟裡可能呼叫了 skip / cancel
    }
    if (this._next < this._steps.length) return;
    if (elapsed >= this._duration) { this._finish('done'); return; }
    if (this._early && elapsed >= this._early.afterMs) {
      let quiet = false;
      try { quiet = !!this._early.isQuiet(); } catch (e) { this._onError(e); }
      if (!quiet) this._quietSince = null;
      else if (this._quietSince === null) this._quietSince = elapsed;
      else if (elapsed - this._quietSince >= this._early.stableMs) this._finish('done');
    }
  }

  skip() {
    if (this._state !== 'playing') return;
    this._state = 'skipped';
    for (const fn of this._skipHandlers) this._safe(fn);
    this._resolve('skipped');
  }

  cancel() {
    if (this._state !== 'playing' && this._state !== 'idle') return;
    this._finish('cancelled');
  }

  _finish(state) {
    this._state = state;
    if (this._resolve) this._resolve(state);
  }

  _safe(fn) {
    try { fn(); } catch (e) { this._onError(e); }
  }
}
