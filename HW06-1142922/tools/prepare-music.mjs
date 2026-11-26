// 每格的主題曲：找出最響亮的 40 秒（副歌）→ Demucs 去人聲 → 淡入淡出 → 響度統一到 -18 LUFS → mp3 128k。
// 用法：node tools/prepare-music.mjs [格子編號…]   （不給就全部處理）
// 環境變數：MUSIC_DIR（歌曲資料夾）、WORK_DIR（暫存）、FFMPEG、DEMUCS_PY
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const FFMPEG = process.env.FFMPEG || 'C:/Users/lingz/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe';
const PY = process.env.DEMUCS_PY || 'D:/mid/.tools/demucs-venv/Scripts/python.exe';
const MUSIC_DIR = process.env.MUSIC_DIR || 'D:/腳本/下載的音樂';
const WORK = process.env.WORK_DIR || 'D:/mid/.tools/hw06-music-work';
const OUT = path.join(root, 'assets', 'music');
const CLIP = 40;      // 取多長（秒）
const PAD = 2;        // 前後多留的秒數（淡入淡出用）
const TARGET = -18;   // LUFS

const sources = JSON.parse(fs.readFileSync(path.join(here, 'music-sources.json'), 'utf8'));
const only = process.argv.slice(2).map(Number);
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

function ff(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** ffmpeg 的分析結果印在 stderr。 */
function analyze(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return (r.stdout || '') + (r.stderr || '');
}

/** 每秒的 RMS（dB）。 */
function rmsPerSecond(file) {
  const text = analyze(['-i', file, '-af', 'aresample=44100,asetnsamples=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level']);
  return [...text.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map(m => (m[1] === '-inf' ? -120 : Number(m[1])));
}

/** loudnorm 第一階段的量測值（input_i 就是整段響度）。 */
function measure(file) {
  const text = analyze(['-i', file, '-af', `loudnorm=I=${TARGET}:TP=-1.5:LRA=11:print_format=json`]);
  return JSON.parse(text.slice(text.lastIndexOf('{'), text.lastIndexOf('}') + 1));
}

for (const s of sources) {
  if (only.length && !only.includes(s.cell)) continue;
  const input = path.join(MUSIC_DIR, s.file);
  if (!fs.existsSync(input)) { console.log(`cell${s.cell}: 找不到 ${s.file}，跳過`); continue; }
  const t0 = Date.now();

  // 1. 找最響亮的 40 秒（避開開頭 5 秒），當作副歌段落
  let start = s.start;
  if (start === undefined) {
    const lin = rmsPerSecond(input).map(db => Math.pow(10, db / 20));
    let best = -Infinity;
    start = 0;
    for (let i = Math.min(5, Math.max(0, lin.length - CLIP)); i + CLIP <= lin.length; i++) {
      let sum = 0;
      for (let j = i; j < i + CLIP; j++) sum += lin[j];
      if (sum > best) { best = sum; start = i; }
    }
  }
  const from = Math.max(0, start - PAD);
  const len = CLIP + PAD * 2;
  const clip = path.join(WORK, `cell${s.cell}-clip.wav`);
  ff(['-ss', String(from), '-t', String(len), '-i', input, '-ac', '2', '-ar', '44100', clip]);

  // 2. 去人聲
  let inst = clip;
  if (s.vocals) {
    execFileSync(PY, ['-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', WORK, clip], { stdio: ['ignore', 'ignore', 'inherit'] });
    inst = path.join(WORK, 'htdemucs', `cell${s.cell}-clip`, 'no_vocals.wav');
  }

  // 3. 淡入淡出 + 兩階段 loudnorm → mp3
  const faded = path.join(WORK, `cell${s.cell}-faded.wav`);
  ff(['-i', inst, '-af', `afade=t=in:d=1.5,afade=t=out:st=${len - 1.5}:d=1.5`, faded]);
  const m = measure(faded);
  const out = path.join(OUT, `cell${s.cell}.mp3`);
  ff(['-i', faded, '-af', `loudnorm=I=${TARGET}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  const check = measure(out);
  console.log(`cell${s.cell}: 段落 ${from}s–${from + len}s，${s.vocals ? '已去人聲' : '純音樂'}，響度 ${check.input_i} LUFS，${(fs.statSync(out).size / 1024).toFixed(0)} KB，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}
