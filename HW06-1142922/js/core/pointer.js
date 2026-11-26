// 區分「點擊」和「拖曳轉視角」：按下到放開移動不到 6 px 才算點擊。
export const CLICK_MAX_PX = 6;

export function isClick(down, up) {
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_MAX_PX;
}
