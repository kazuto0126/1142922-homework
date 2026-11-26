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
    if (this._next >= this._steps.length && elapsed >= this._duration) this._finish('done');
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
