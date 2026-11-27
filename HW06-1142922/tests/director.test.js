import test from 'node:test';
import assert from 'node:assert/strict';
import { DUR, planMove, planUnison, planEnding } from '../js/core/director.js';
import { busGains, MUSIC_RATIO, DUCK, BOOST_RATIO } from '../js/core/audioPlan.js';
import { isClick, CLICK_MAX_PX } from '../js/core/pointer.js';

test('演出長度常數', () => {
  assert.deepEqual(DUR, { normal: 4200, key: 7000, short: 900, unison: 6500, ending: 8000 });
});

test('一般落子的拍點', () => {
  assert.deepEqual(planMove({ tier: 'normal' }, { shortMode: false }), {
    duration: 4200,
    beats: [
      { at: 0, kind: 'entrance' },
      { at: 0, kind: 'softCam' },
      { at: 300, kind: 'cutin' },
      { at: 1250, kind: 'charge' },
      { at: 1900, kind: 'skill' },
      { at: 3000, kind: 'aftermath' },
      { at: 3300, kind: 'settle' },
    ],
  });
});

test('關鍵一手的拍點', () => {
  assert.deepEqual(planMove({ tier: 'key' }, { shortMode: false }), {
    duration: 7000,
    beats: [
      { at: 0, kind: 'entrance' },
      { at: 0, kind: 'keyCam' },
      { at: 300, kind: 'keyBanner' },
      { at: 700, kind: 'cutin' },
      { at: 1900, kind: 'charge' },
      { at: 2900, kind: 'skill' },
      { at: 4700, kind: 'aftermath' },
      { at: 5400, kind: 'settle' },
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
  // 平手也先播領域對決
  const e = planEnding({ winner: 0, winnerFaction: null, line: null });
  assert.deepEqual(e, { duration: 11800, beats: [{ at: 0, kind: 'clash' }, { at: 3800, kind: 'ending' }] });
  // 宿儺贏（玩家的五條悟輸）：先 3.8 秒領域對決，再接勝利演出
  const lose = planEnding({ winner: 1, winnerFaction: 'sukuna', line: [0, 1, 2] });
  assert.deepEqual(lose, { duration: 11800, beats: [{ at: 0, kind: 'clash' }, { at: 3800, kind: 'ending' }] });
  // 五條悟贏：沒有對決
  assert.equal(planEnding({ winner: 0, winnerFaction: 'gojo', line: [0, 1, 2] }).beats.length, 1);
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

test('領域對決時音樂放大（這段沒有音效），音樂關掉時仍然是 0', () => {
  assert.equal(busGains({ musicOn: true, sfxOn: true, volume: 1, ducked: false, boosted: true }).music, BOOST_RATIO);
  assert.ok(BOOST_RATIO > MUSIC_RATIO);
  assert.equal(busGains({ musicOn: false, sfxOn: true, volume: 1, ducked: false, boosted: true }).music, 0);
});

test('音樂關掉音效時，音樂仍然以 0.4 為上限', () => {
  assert.deepEqual(busGains({ musicOn: true, sfxOn: false, volume: 1, ducked: false }), { music: 0.4, sfx: 0 });
});

test('點擊判定：移動小於 6 px 才算點擊', () => {
  assert.equal(CLICK_MAX_PX, 6);
  assert.equal(isClick({ x: 0, y: 0 }, { x: 5, y: 3 }), true);
  assert.equal(isClick({ x: 0, y: 0 }, { x: 6, y: 1 }), false);
});
