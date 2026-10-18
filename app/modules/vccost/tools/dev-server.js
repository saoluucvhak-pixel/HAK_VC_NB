'use strict';
/**
 * Dev server: chạy giao diện trong trình duyệt (kiểm thử UI/Playwright) với CÙNG handlers như Electron.
 *   node tools/dev-server.js [port] [dataDir]
 * POST /api/<channel> {args} → {ok,data|error}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRuntime } = require('../src/runtime');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };

function start({ port = 5180, dataDir = null, driver = null } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'vccost-dev-'));
  let browser = null;
  const renderPdf = async (html) => {   // chỉ dùng cho kiểm thử/dev: Chromium của Playwright
    const { chromium } = require('playwright-core');
    browser = browser || await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try { await page.setContent(html, { waitUntil: 'load' }); return await page.pdf(require('../src/print/pdfOptions').pdfOptions()); } finally { await page.close(); }
  };
  const rt = createRuntime({ dataDir: dir, version: 'dev', driver, renderPdf });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'POST' && url.startsWith('/api/')) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        let args = {};
        try { args = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* rỗng */ }
        const out = await rt.dispatch(url.slice(5), args);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    if (url.startsWith('/exports/')) {
      const f = path.join(rt.dirs.exports, path.basename(url));
      if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Disposition': `attachment; filename="${path.basename(f)}"` }); return fs.createReadStream(f).pipe(res); }
    }
    let rel = url === '/' ? '/renderer/index.html' : url;
    let f = path.normalize(path.join(ROOT, rel));
    // giống file:// của Electron: đường dẫn tương đối tính từ renderer/
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.normalize(path.join(ROOT, 'renderer', url));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /node_modules\/(?!@fontsource)/.test(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, rt, port, dir, close: () => { server.close(); rt.close(); if (browser) browser.close().catch(() => {}); } })));
}

module.exports = { start };
if (require.main === module) {
  start({ port: Number(process.argv[2]) || 5180, dataDir: process.argv[3] || null }).then((s) => console.log(`Dev server: http://127.0.0.1:${s.port}  (dữ liệu: ${s.dir})`));
}
