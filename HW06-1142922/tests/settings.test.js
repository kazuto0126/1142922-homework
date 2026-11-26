import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../js/core/settings.js';

const KEY = 'hw06-1142922-settings';
function fakeStorage() {
  const data = {};
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('預設值', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { musicOn: true, sfxOn: true, volume: 0.8, shortMode: false, quality: 'high' });
  assert.deepEqual(loadSettings(fakeStorage()), DEFAULT_SETTINGS);
});

test('存了再讀回來一樣', () => {
  const s = fakeStorage();
  const v = { musicOn: false, sfxOn: true, volume: 0.35, shortMode: true, quality: 'low' };
  saveSettings(s, v);
  assert.ok(KEY in s.data);
  assert.deepEqual(loadSettings(s), v);
});

test('壞資料：回到預設值；不合法的欄位個別修正', () => {
  const s = fakeStorage();
  s.setItem(KEY, '{壞掉');
  assert.deepEqual(loadSettings(s), DEFAULT_SETTINGS);
  s.setItem(KEY, JSON.stringify({ volume: 5, quality: 'ultra', musicOn: 'yes', shortMode: true }));
  assert.deepEqual(loadSettings(s), { musicOn: true, sfxOn: true, volume: 1, shortMode: true, quality: 'high' });
});

test('storage 會丟錯：讀到預設值，存檔不丟錯', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(bad), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(bad, DEFAULT_SETTINGS));
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
});
