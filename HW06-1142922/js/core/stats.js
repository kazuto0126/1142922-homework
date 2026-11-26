// 對戰電腦的戰績。localStorage 不能用（無痕模式等）時改存在記憶體。
const KEY = 'hw06-1142922-stats';
const zero = () => ({ win: 0, draw: 0, lose: 0 });
const count = v => (Number.isInteger(v) && v >= 0 ? v : 0);

export function createStats(storage) {
  let data = zero();
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = { win: count(parsed.win), draw: count(parsed.draw), lose: count(parsed.lose) };
    }
  } catch {
    data = zero();
  }

  const save = () => {
    try { storage && storage.setItem(KEY, JSON.stringify(data)); } catch { /* 存不了就只留在記憶體 */ }
  };

  return {
    get: () => ({ ...data }),
    record(outcome) {
      if (!(outcome in data)) throw new Error(`未知的結果：${outcome}`);
      data[outcome]++;
      save();
    },
    reset() { data = zero(); save(); },
  };
}
