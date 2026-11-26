// 素材路徑。檔案還沒到位時，loader 會自動改用替代圖 / 合成音樂。

export const IMAGES = {
  leader: {
    rimuru: 'assets/img/leader-rimuru.webp',
    gojo: 'assets/img/leader-gojo.webp',
  },
  hero: Array.from({ length: 9 }, (_, i) => `assets/img/hero-${i}.webp`),
  world: Array.from({ length: 9 }, (_, i) => `assets/img/world-${i}.webp`),
};

export const MUSIC = {
  cell: Array.from({ length: 9 }, (_, i) => `assets/music/cell${i}.mp3`),
  // 領袖的歌先不找（使用者決定），保留位置
  leader: { rimuru: null, gojo: null },
};

/** 已經放進 repo 的素材清單；不在清單裡的就不去請求，直接用替代品（避免一堆 404）。 */
export const AVAILABLE = new Set([
]);

export const isAvailable = path => !!path && AVAILABLE.has(path);
