// 高更新率螢幕（120Hz、144Hz）上的全螢幕 2D 動畫：每兩次 requestAnimationFrame 才畫一次（120→60、144→72），
// 動畫本身用時間算位置，所以速度不變，只是少畫一半，顯示卡和 CPU 負擔減半。
export function makeFrameGate() {
  let last = 0, deltas = [], skip = 1, count = 0;
  /** 在每次 requestAnimationFrame 的開頭呼叫；回傳 true 代表這次跳過不畫。 */
  return now => {
    if (last) {
      deltas.push(now - last);
      if (deltas.length >= 30) {
        const s = deltas.sort((a, b) => a - b);
        const med = s[s.length >> 1];
        skip = med > 0 && med < 11.5 ? 2 : 1;
        deltas = [];
      }
    }
    last = now;
    return skip > 1 && ++count % skip !== 0;
  };
}
