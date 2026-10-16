'use strict';
/**
 * Chạy thử giao diện trên trình duyệt (không cần Electron) — dùng cho lập trình và kiểm thử tự động.
 *   node tools/dev-server.js [cổng=5178] [thư mục "máy" (chứa file cấu hình)]
 * Giao diện gọi POST /api giống hệt window.dgvc.api trong bản cài. Hộp thoại chọn file: POST /dev/next {path} đặt trước file sẽ "chọn".
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { Router } = require('../main/api/router');
const { chromiumPdfRenderer } = require('../main/reports/pdf');

function start({ port = 5178, home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-dev-')), quiet = false } = {}) {
  const pdf = fs.existsSync(process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium') ? chromiumPdfRenderer() : null;
  const ctx = new AppContext({ configFile: path.join(home, 'dgvc-config.json'), pdfRenderer: pdf });
  const queue = [];
  const pick = () => (queue.length ? { path: queue.shift() } : { canceled: true });
  const router = new Router(ctx, { host: { openFile: pick, openFolder: pick, saveFile: pick }, log: (...a) => { if (!quiet) console.error(...a); } });
  const root = path.join(__dirname, '../renderer');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
  const body = (req) => new Promise((res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => res(s ? JSON.parse(s) : {})); });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/api') { const b = await body(req); const out = await router.handle(b.action, b.payload, b.token); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return; }
      if (req.method === 'POST' && req.url === '/dev/next') { const b = await body(req); queue.push(b.path); res.end('{}'); return; }
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(root, rel);
      if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e && e.stack)); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    if (!quiet) console.log(`DGVC dev: http://127.0.0.1:${server.address().port}  (máy thử: ${home})`);
    resolve({ server, ctx, home, url: `http://127.0.0.1:${server.address().port}`, close: async () => { server.close(); ctx.close(); if (pdf) await pdf.close(); } });
  }));
}

if (require.main === module) start({ port: Number(process.argv[2] || 5178), home: process.argv[3] });
module.exports = { start };
