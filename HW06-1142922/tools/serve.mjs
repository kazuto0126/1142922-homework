// 本機測試用的靜態伺服器（不快取）。用法：node tools/serve.mjs <port> <root>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 8766);
const root = path.resolve(process.argv[3] || '.');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

// 開發用：POST /__shot?name=xxx 把頁面送來的 data URL 存成 D:/mid/.tools/hw06-shots/xxx.jpg（檢查特效用）
const SHOT_DIR = process.env.SHOT_DIR || 'D:/mid/.tools/hw06-shots';

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const b64 = body.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(SHOT_DIR, `${name}.jpg`), Buffer.from(b64, 'base64'));
      res.writeHead(204).end();
    });
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  const file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let target = file;
  try {
    if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  } catch { /* 交給下面處理 404 */ }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}/`));
