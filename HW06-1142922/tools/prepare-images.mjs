// 把下載的原圖裁切、縮小成 webp，放到 assets/img/。
// 用法：node tools/prepare-images.mjs <原圖資料夾>   （原圖檔名：leader-rimuru.src、hero-0.src、world-0.src…）
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const FFMPEG = process.env.FFMPEG || 'C:/Users/lingz/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe';
const src = process.argv[2];
if (!src) { console.error('用法：node tools/prepare-images.mjs <原圖資料夾>'); process.exit(1); }
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../assets/img');
fs.mkdirSync(out, { recursive: true });

// 立繪：裁成 4:5 的上半身（x, y, w, h 是原圖像素），輸出 512×640
const PORTRAITS = {
  'leader-rimuru': [62, 8, 240, 300],
  'leader-gojo': [78, 0, 560, 700],
  'leader-sukuna': [200, 0, 558, 698],
  'hero-0': [82, 100, 600, 750],
  'hero-1': [320, 38, 800, 1000],
  'hero-2': [58, 0, 460, 575],
  'hero-3': [0, 0, 248, 310],
  'hero-4': [43, 0, 600, 750],
  'hero-5': [290, 0, 576, 720],
  'hero-6': [86, 0, 680, 850],
  'hero-7': [165, 10, 290, 362],
  'hero-8': [0, 0, 506, 632],
};

function run(args) {
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

for (const [name, [x, y, w, h]] of Object.entries(PORTRAITS)) {
  run(['-i', path.join(src, `${name}.src`), '-vf', `crop=${w}:${h}:${x}:${y},scale=512:640:flags=lanczos`, '-c:v', 'libwebp', '-quality', '82', path.join(out, `${name}.webp`)]);
  console.log('ok', name);
}

// 世界圖（目前沒用到，地板改成程式畫的標誌）：裁成置中的正方形，輸出 768×768
for (let i = 0; i < 9 && process.env.WITH_WORLDS; i++) {
  run(['-i', path.join(src, `world-${i}.src`), '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=768:768:flags=lanczos", '-c:v', 'libwebp', '-quality', '80', path.join(out, `world-${i}.webp`)]);
  console.log('ok', `world-${i}`);
}
