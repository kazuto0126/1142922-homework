import test from 'node:test';
import assert from 'node:assert/strict';
import { DUR, planMove, planUnison, planEnding } from '../js/core/director.js';
import { busGains, MUSIC_RATIO, DUCK } from '../js/core/audioPlan.js';
import { isClick, CLICK_MAX_PX } from '../js/core/pointer.js';

test('演出長度常數', () => {
  assert.deepEqual(DUR, { normal: 2200, key: 3800, short: 900, unison: 6500, ending: 8000 });
});

test('一般落子的拍點', () => {
  assert.deepEqual(planMove({ tier: 'normal' }, { shortMode: false }), {
    duration: 2200,
    beats: [
      { at: 0, kind: 'entrance' },
      { at: 300, kind: 'cutin' },
      { at: 700, kind: 'skill' },
      { at: 2000, kind: 'settle' },
    ],
  });
});

test('關鍵一手的拍點', () => {
  assert.deepEqual(planMove({ tier: 'key' }, { shortMode: false }), {
    duration: 3800,
    beats: [
      { at: 0, kind: 'entrance' },
      { at: 0, kind: 'keyCam' },
      { at: 300, kind: 'keyBanner' },
      { at: 700, kind: 'cutin' },
      { at: 1300, kind: 'skill' },
      { at: 3500, kind: 'settle' },
    ],
  });
});

test('精簡模式：一般與關鍵都 900 ms、沒有 cut-in；finish 不受影響', () => {
  for (const tier of ['normal', 'key']) {
    const p = planMove({ tier }, { shortMode: true });
    assert.equal(p.duration, 900);
    assert.ok(!p.beats.some(b => b.kind === 'cutin'));
    assert.deepEqual(p.beats.map(b => b.kind), ['entrance', 'skill', 'settle']);
  }
  const f = planMove({ tier: 'finish' }, { shortMode: true });
  assert.deepEqual(f, planMove({ tier: 'key' }, { shortMode: false }));
});

test('合體技與結局', () => {
  const u = planUnison([0, 4, 8]);
  assert.equal(u.duration, 6500);
  assert.deepEqual(u.beats.filter(b => b.kind === 'unisonHero').map(b => [b.at, b.cell]), [[0, 0], [1200, 4], [2400, 8]]);
  assert.deepEqual(u.beats.find(b => b.kind === 'unisonLeader'), { at: 3800, kind: 'unisonLeader' });
  const e = planEnding({ winner: 0, winnerFaction: null, line: null });
  assert.deepEqual(e, { duration: 8000, beats: [{ at: 0, kind: 'ending' }] });
});

test('音量：音樂 = 音效 × 0.4，避讓再 × 0.35', () => {
  assert.equal(MUSIC_RATIO, 0.4);
  assert.equal(DUCK, 0.35);
  assert.deepEqual(busGains({ musicOn: true, sfxOn: true, volume: 1, ducked: false }), { music: 0.4, sfx: 1 });
  assert.deepEqual(busGains({ musicOn: true, sfxOn: true, volume: 0.5, ducked: false }), { music: 0.2, sfx: 0.5 });
  const d = busGains({ musicOn: true, sfxOn: true, volume: 1, ducked: true });
  assert.ok(Math.abs(d.music - 0.14) < 1e-9);
  assert.equal(d.sfx, 1);
  assert.equal(busGains({ musicOn: false, sfxOn: true, volume: 1, ducked: false }).music, 0);
  assert.equal(busGains({ musicOn: true, sfxOn: false, volume: 1, ducked: false }).sfx, 0);
});

test('音樂關掉音效時，音樂仍然以 0.4 為上限', () => {
  assert.deepEqual(busGains({ musicOn: true, sfxOn: false, volume: 1, ducked: false }), { music: 0.4, sfx: 0 });
});

test('點擊判定：移動小於 6 px 才算點擊', () => {
  assert.equal(CLICK_MAX_PX, 6);
  assert.equal(isClick({ x: 0, y: 0 }, { x: 5, y: 3 }), true);
  assert.equal(isClick({ x: 0, y: 0 }, { x: 6, y: 1 }), false);
});
