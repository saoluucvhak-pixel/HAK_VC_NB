'use strict';
/**
 * Dev server (không cần Electron): phục vụ giao diện + API qua HTTP localhost.
 * Dùng để phát triển & kiểm thử giao diện bằng trình duyệt. KHÔNG dùng cho sản xuất.
 *   node scripts/dev-server.js [port] [dataDir]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createRuntime } = require('../src/runtime');

const port = Number(process.argv[2] || 5179);
const dataDir = process.argv[3] || path.join(__dirname, '..', '.devdata');
const rt = createRuntime({ dataDir, version: 'dev-server', driver: 'node:sqlite' });
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    const out = await rt.dispatch(decodeURIComponent(url.pathname.slice(5)), body ? JSON.parse(body) : {});
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(out));
  }
  if (url.pathname.startsWith('/exports/')) {
    const f = path.join(rt.dirs.exports, path.basename(url.pathname));
    if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); return fs.createReadStream(f).pipe(res); }
  }
  let p = url.pathname === '/' ? '/renderer/index.html' : url.pathname;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Dev server: http://127.0.0.1:${port}  (data: ${dataDir})`));
