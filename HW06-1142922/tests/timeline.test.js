import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline } from '../js/core/timeline.js';

function setup() {
  const clock = { t: 0 };
  const tl = new Timeline({ now: () => clock.t });
  const ran = [];
  tl.add(1000, () => ran.push('c')).add(0, () => ran.push('a')).add(500, () => ran.push('b')).setDuration(1500);
  return { clock, tl, ran };
}

test('依經過時間執行到期的步驟，結束時回傳 done', async () => {
  const { clock, tl, ran } = setup();
  const done = tl.play();
  clock.t = 600; tl.update();
  assert.deepEqual(ran, ['a', 'b']);
  clock.t = 2000; tl.update();
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.equal(await done, 'done');
});

test('時間一次跳很多：全部依序執行', async () => {
  const { clock, tl, ran } = setup();
  const done = tl.play();
  clock.t = 5000; tl.update();
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.equal(await done, 'done');
});

test('skip：回傳 skipped、onSkip 呼叫一次、之後不再執行', async () => {
  const { clock, tl, ran } = setup();
  let skips = 0;
  tl.onSkip(() => skips++);
  const done = tl.play();
  clock.t = 100; tl.update();
  tl.skip();
  tl.skip();
  clock.t = 5000; tl.update();
  assert.deepEqual(ran, ['a']);
  assert.equal(skips, 1);
  assert.equal(await done, 'skipped');
});

test('cancel：回傳 cancelled、不呼叫 onSkip', async () => {
  const { clock, tl, ran } = setup();
  let skips = 0;
  tl.onSkip(() => skips++);
  const done = tl.play();
  tl.cancel();
  clock.t = 5000; tl.update();
  assert.deepEqual(ran, []);
  assert.equal(skips, 0);
  assert.equal(await done, 'cancelled');
});

test('步驟丟錯不會卡住整個時間軸', async () => {
  const clock = { t: 0 };
  const errors = [];
  const tl = new Timeline({ now: () => clock.t, onError: e => errors.push(e.message) });
  const ran = [];
  tl.add(0, () => { throw new Error('boom'); }).add(10, () => ran.push('after')).setDuration(20);
  const done = tl.play();
  clock.t = 30; tl.update();
  assert.deepEqual(ran, ['after']);
  assert.deepEqual(errors, ['boom']);
  assert.equal(await done, 'done');
});

test('endEarlyWhen：步驟都跑完、過了 afterMs、安靜持續 stableMs 才提早結束；上限仍是 setDuration', async () => {
  const clock = { t: 0 };
  let quiet = false;
  const tl = new Timeline({ now: () => clock.t });
  tl.add(0, () => {}).add(1000, () => {}).setDuration(8000).endEarlyWhen(() => quiet, { afterMs: 2000, stableMs: 300 });
  const done = tl.play();
  quiet = true;
  clock.t = 1500; tl.update();          // 還沒過 afterMs
  assert.equal(tl.state, 'playing');
  clock.t = 2100; tl.update();          // 開始安靜
  clock.t = 2300; tl.update();          // 安靜才 200ms
  assert.equal(tl.state, 'playing');
  quiet = false; clock.t = 2350; tl.update(); // 又有動靜，重新計時
  quiet = true; clock.t = 2500; tl.update();
  clock.t = 2700; tl.update();
  assert.equal(tl.state, 'playing');
  clock.t = 2850; tl.update();          // 連續安靜 350ms
  assert.equal(await done, 'done');
});

test('endEarlyWhen：一直不安靜就照原本的長度結束', async () => {
  const clock = { t: 0 };
  const tl = new Timeline({ now: () => clock.t });
  tl.add(0, () => {}).setDuration(3000).endEarlyWhen(() => false, { afterMs: 500 });
  const done = tl.play();
  clock.t = 2900; tl.update();
  assert.equal(tl.state, 'playing');
  clock.t = 3000; tl.update();
  assert.equal(await done, 'done');
});
