// 區分「點擊」和「拖曳轉視角 / 雙指縮放」：按下到放開移動不到 6 px 才算點擊。
export const CLICK_MAX_PX = 6;

export function isClick(down, up) {
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_MAX_PX;
}

/**
 * 追蹤所有手指 / 滑鼠。只有「單一指標、主要按鍵、中途沒移動超過門檻」的放開才算點擊：
 * - 雙指（縮放或同時點）期間的任何放開都不算；
 * - 拖出去再拖回原點也不算（只要中途移動超過門檻）；
 * - 右鍵、中鍵不算；pointercancel / reset 後的放開不算。
 */
export function createTapTracker({ maxPx = CLICK_MAX_PX } = {}) {
  const pointers = new Map();
  let multi = false;
  const pos = e => ({ x: e.clientX, y: e.clientY });
  const forget = id => {
    pointers.delete(id);
    if (pointers.size === 0) multi = false;
  };

  return {
    down(e) {
      if (e.button !== undefined && e.button !== 0) return;
      pointers.set(e.pointerId, { ...pos(e), moved: false });
      if (pointers.size > 1) multi = true;
    },
    move(e) {
      const p = pointers.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= maxPx) p.moved = true;
    },
    /** 回傳這次放開是否算點擊。 */
    up(e) {
      const p = pointers.get(e.pointerId);
      const wasMulti = multi;
      forget(e.pointerId);
      return !!p && !p.moved && !wasMulti && isClick(p, pos(e));
    },
    cancel(e) { forget(e.pointerId); },
    reset() { pointers.clear(); multi = false; },
  };
}
