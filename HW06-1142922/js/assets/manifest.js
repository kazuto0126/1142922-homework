// 素材路徑。檔案還沒到位時，loader 會自動改用替代圖 / 合成音樂。

export const IMAGES = {
  leader: {
    sukuna: 'assets/img/leader-sukuna.webp',
    gojo: 'assets/img/leader-gojo.webp',
  },
  hero: Array.from({ length: 9 }, (_, i) => `assets/img/hero-${i}.webp`),
  // 地板不用圖片：由 js/assets/emblems.js 畫各作品的標誌與代表色
};

/** 音效、語音（使用者提供的檔案；沒有就跳過）。 */
export const SFX = {
  linkStart: 'assets/sfx/link-start.mp3',
};

export const MUSIC = {
  cell: Array.from({ length: 9 }, (_, i) => `assets/music/cell${i}.mp3`),
  // 領袖的歌先不找（使用者決定），保留位置
  leader: { sukuna: null, gojo: null },
};

/** 已經放進 repo 的素材清單；不在清單裡的就不去請求，直接用替代品（避免一堆 404）。 */
export const AVAILABLE = new Set([
  IMAGES.leader.sukuna,
  IMAGES.leader.gojo,
  ...IMAGES.hero,
  // 每格的主題曲（tools/prepare-music.mjs 產生：副歌 44 秒、去人聲、-18 LUFS）
  ...MUSIC.cell,
  // 登入語音 + 潛行音效（使用者提供的檔案，剪成 7 秒、音量對齊其他音效）
  SFX.linkStart,
]);

export const isAvailable = path => !!path && AVAILABLE.has(path);
