// Chạy: node tests/ui-smoke.mjs  — dev server + Playwright, chụp màn hình vào docs/screenshots
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { start } = require('../tools/dev-server.js');
import fs from 'fs'; import path from 'path';
const out = path.resolve('docs/screenshots'); fs.mkdirSync(out, { recursive: true });
const srv = await start({ port: 5191 });
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, n + '.png') }); };
const nav = async (id) => { await page.click(`[data-nav="${id}"]`); await page.waitForTimeout(400); };
await page.goto('http://127.0.0.1:5191/');
await page.waitForSelector('#sidebar .nav-item');
await shot('00-dashboard-empty');
// seed
await nav('settings'); page.once('dialog', () => {});
await page.click('[data-act=seed]'); await page.click('.modal .btn:not(.ghost)'); await page.waitForTimeout(800);
// import vehicles + tickets
const fx = path.resolve('tests/fixtures/sample-v47.xlsx');
await nav('import');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Import danh mục xe")')]);
await fc.setFiles(fx); await page.waitForSelector('.modal'); await shot('01-import-vehicles');
await page.click('.modal .btn:has-text("Ghi danh mục xe")'); await page.waitForTimeout(800);
await nav('import');
const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=pick]')]);
await fc2.setFiles(fx); await page.waitForSelector('[data-act=preview]'); await shot('02-import-mapping');
await page.click('[data-act=preview]'); await page.waitForSelector('[data-act=commit]'); await shot('03-import-preview');
await page.click('[data-act=commit]'); await page.click('.modal .btn:has-text("Import")'); await page.waitForSelector('text=Import hoàn tất', { timeout: 60000 }); await shot('04-import-done');
for (const [id, n] of [['dashboard', '05-dashboard'], ['tickets', '06-tickets'], ['statements', '07-statements'], ['rp:vehicle', '08-report-vehicle'], ['rp:carrier', '09-report-carrier'], ['prices', '10-prices'], ['fuel', '11-fuel'], ['cat:xe', '12-cat-xe'], ['cat:dia_diem', '13-cat-diadiem'], ['alerts', '14-alerts'], ['batches', '15-batches'], ['audit', '16-audit'], ['backup', '17-backup'], ['settings', '18-settings'], ['review', '19-review'], ['vehicle', '20-vehicle'], ['lock', '21-lock'], ['cat:hop_dong', '24-hop-dong']]) {
  await nav(id); await shot(n);
  const bad = await page.evaluate(() => {
    const out = []; const isNum = /^[−-]?\d{1,3}(\.\d{3})*(,\d+)?%?$/; const isDate = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2}(:\d{2})?)?$/;
    document.querySelectorAll('table.t td').forEach((td) => {
      const t = td.textContent.trim(); if (!t || td.querySelector('button,input,select')) return; const al = getComputedStyle(td).textAlign;
      if (/^\d{4}-\d{2}-\d{2}/.test(t) || /^[−-]?\d+\.\d{1,2}%?$/.test(t)) out.push('định dạng không VN: ' + t);
      else if (isDate.test(t) && al !== 'center') out.push('ngày không canh giữa: ' + t);
      else if (isNum.test(t) && t.length > 3 && !td.classList.contains('mono') && al !== 'right' && al !== 'end') out.push('số không canh phải: ' + t + ' (' + al + ')');
    });
    return [...new Set(out)].slice(0, 6);
  });
  if (bad.length) console.log('ALIGN', id, JSON.stringify(bad));
}
// bảng kê 1 đơn vị
await nav('statements'); await page.selectOption('label:has-text("Đơn vị vận chuyển") select', { index: 1 }); await page.waitForSelector('.stmt'); await shot('21-statement-one');
// xóa phiếu: chọn 2 dòng → hộp xóa (không bấm xóa)
await nav('tickets');
await page.click('table.t tbody tr:nth-child(1) input[type=checkbox]'); await page.click('table.t tbody tr:nth-child(2) input[type=checkbox]');
await page.click('[data-act=del-selected]'); await page.waitForSelector('.modal'); await shot('23-delete-tickets');
await page.click('.modal .btn.ghost');
// explain
await nav('tickets'); await page.click('table.t tbody tr >> nth=0'); await page.waitForSelector('.modal'); await shot('22-explain');

// ---- Đối chiếu: file đối tác dựng từ phiếu HAK + lỗi cài sẵn
const XLSX = require('xlsx');
const hakId = (await (await fetch('http://127.0.0.1:5191/api/catalog.options', { method: 'POST', body: JSON.stringify({ table: 'don_vi_van_chuyen' }) })).json()).data.find((x) => x.label === 'HAK').id;
const tk = (await (await fetch('http://127.0.0.1:5191/api/tickets.list', { method: 'POST', body: JSON.stringify({ filter: { don_vi_id: hakId }, limit: 1000 }) })).json()).data.rows;
const aoa = [['STT', 'Số phiếu', 'Biển số', 'Ngày', 'KL (kg)', 'Đơn giá', 'Thành tiền']];
tk.forEach((x, i) => aoa.push([i + 1, x.so_phieu, x.bien_so, x.ngay_can, x.kl_hang_kg, x.don_gia, x.tien_truoc_vat]));
aoa[2][4] += 100; aoa[3][5] = 200000; aoa.splice(4, 1);
const wbx = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbx, XLSX.utils.aoa_to_sheet(aoa), 'BangKe');
const partner = path.join(out, '..', '..', 'tests', 'fixtures', 'doitac-hak.xlsx'); XLSX.writeFile(wbx, partner);
await page.click('.modal .btn:has-text("Đóng")');
await nav('reconcile'); await shot('23-recon-list');
await page.click('[data-act=new]'); await page.fill('[data-f=ten]', 'HAK – V.47');
await page.selectOption('[data-f=dv]', { label: 'HAK' });
const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=pick]')]);
await fc3.setFiles(partner); await page.waitForSelector('[data-map=so_phieu]'); await shot('24-recon-mapping');
await page.click('[data-act=run]'); await page.waitForSelector('text=Kết quả: HAK'); await shot('25-recon-result');
const kq = await page.locator('.kpi small').allInnerTexts(); console.log('recon kpis', kq.join(' | '));
const info = await (await fetch('http://127.0.0.1:5191/api/app.info', { method: 'POST', body: '{}' })).json();
console.log('app.info', JSON.stringify(info.data.counts));
console.log('errors:', errors.length ? errors : 'none');
await browser.close(); srv.close();
process.exit(errors.length ? 1 : 0);
