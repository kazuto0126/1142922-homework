import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicManager } from '../js/audio/music.js';

function fakeParam(v = 1) {
  return {
    value: v,
    setValueAtTime(x) { this.value = x; },
    linearRampToValueAtTime(x) { this.value = x; },
    cancelScheduledValues() {},
  };
}

function fakeCtx() {
  const ctx = {
    currentTime: 0,
    sources: [],
    createGain() {
      return { gain: fakeParam(1), connect() {}, disconnect() {} };
    },
    createBufferSource() {
      const s = {
        buffer: null, loop: false, started: false, stopped: false,
        connect() {}, disconnect() {},
        start() { this.started = true; },
        stop() { this.stopped = true; },
      };
      ctx.sources.push(s);
      return s;
    },
  };
  return ctx;
}

function fakeSynth() {
  const beds = [];
  const endings = [];
  return {
    beds, endings,
    playFallbackBed(ctx, dest, cell) { const h = { cell, stopped: false, stop() { this.stopped = true; } }; beds.push(h); return h; },
    playEndingTrack(ctx, dest, kind) { const h = { kind, stopped: false, stop() { this.stopped = true; } }; endings.push(h); return h; },
  };
}

const paths = Array.from({ length: 9 }, (_, i) => `assets/music/cell${i}.mp3`);

test('歌載入失敗：改播合成背景樂，而且不丟錯', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: () => Promise.reject(new Error('404')) });
  await mm.playCell(3);
  assert.equal(synth.beds.length, 1);
  assert.equal(synth.beds[0].cell, 3);
});

test('沒列在可用清單的歌不去下載，直接用合成背景樂', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  let fetched = 0;
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, available: () => false, fetchBuffer: () => { fetched++; return Promise.resolve({}); } });
  await mm.playCell(5);
  assert.equal(fetched, 0);
  assert.equal(synth.beds[0].cell, 5);
});

test('換歌：前一首會停，不會兩首疊在一起', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: p => Promise.resolve({ p }) });
  await mm.playCell(1);
  await mm.playCell(2);
  assert.equal(ctx.sources.length, 2);
  assert.equal(ctx.sources[0].stopped, true);
  assert.equal(ctx.sources[1].stopped, false);
  assert.equal(ctx.sources[1].loop, true);
});

test('慢的那首載入完成時已經被換掉：不播', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  let release;
  const slow = new Promise(r => { release = r; });
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: p => (p.endsWith('cell1.mp3') ? slow : Promise.resolve({ p })) });
  const first = mm.playCell(1);
  await mm.playCell(2);
  release({ p: 'cell1' });
  await first;
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].buffer.p, 'assets/music/cell2.mp3');
});

test('stop：所有聲音都停', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: () => Promise.reject(new Error('x')) });
  await mm.playCell(0);
  await mm.playEnding('draw');
  mm.stop();
  assert.ok(synth.beds.every(b => b.stopped));
  assert.ok(synth.endings.every(e => e.stopped));
});

test('解碼後的歌最多只留 3 首在記憶體（手機記憶體有限）', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  const fetched = [];
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: p => { fetched.push(p); return Promise.resolve({ p }); } });
  for (const c of [0, 1, 2, 3, 4]) await mm.playCell(c);
  await mm.playCell(4); // 最近用過的：不用重新下載
  assert.equal(fetched.filter(p => p.endsWith('cell4.mp3')).length, 1);
  await mm.playCell(0); // 已經被擠掉：要重新下載
  assert.equal(fetched.filter(p => p.endsWith('cell0.mp3')).length, 2);
});

test('結局曲：victory / defeat / draw 交給合成器', async () => {
  const ctx = fakeCtx(), synth = fakeSynth();
  const mm = createMusicManager({ ctx, dest: {}, synth, paths, fetchBuffer: () => Promise.reject(new Error('x')) });
  await mm.playEnding('victory');
  assert.equal(synth.endings[0].kind, 'victory');
  await mm.playEnding('defeat');
  assert.equal(synth.endings[0].stopped, true);
});
