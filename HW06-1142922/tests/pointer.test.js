import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapTracker } from '../js/core/pointer.js';

const ev = (pointerId, x, y, button = 0) => ({ pointerId, clientX: x, clientY: y, button });

test('單指點一下：算點擊', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100));
  t.move(ev(1, 102, 101));
  assert.equal(t.up(ev(1, 103, 101)), true);
});

test('拖曳出去又拖回原點附近：不算點擊', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100));
  t.move(ev(1, 160, 100));
  t.move(ev(1, 101, 100));
  assert.equal(t.up(ev(1, 101, 100)), false);
});

test('雙指縮放（一指不動、先放開）：兩指都不算點擊', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100));
  t.down(ev(2, 300, 300));
  t.move(ev(2, 360, 360));
  assert.equal(t.up(ev(1, 100, 100)), false);
  assert.equal(t.up(ev(2, 360, 360)), false);
});

test('雙指同時點一下：不算點擊；之後的單指點擊恢復正常', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100));
  t.down(ev(2, 200, 200));
  assert.equal(t.up(ev(2, 200, 200)), false);
  assert.equal(t.up(ev(1, 100, 100)), false);
  t.down(ev(3, 50, 50));
  assert.equal(t.up(ev(3, 50, 50)), true);
});

test('右鍵、中鍵：不算點擊', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100, 2));
  assert.equal(t.up(ev(1, 100, 100, 2)), false);
  t.down(ev(1, 100, 100, 1));
  assert.equal(t.up(ev(1, 100, 100, 1)), false);
});

test('pointercancel 或 reset 之後放開：不算點擊', () => {
  const t = createTapTracker();
  t.down(ev(1, 100, 100));
  t.cancel(ev(1, 100, 100));
  assert.equal(t.up(ev(1, 100, 100)), false);
  t.down(ev(2, 100, 100));
  t.reset();
  assert.equal(t.up(ev(2, 100, 100)), false);
});
