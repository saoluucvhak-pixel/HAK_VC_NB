'use strict';
/**
 * Chạy thử BẢN ELECTRON thật (cửa sổ, preload, IPC, hộp thoại được giả lập, in PDF bằng printToPDF).
 *   xvfb-run -a node tests/electron.smoke.js
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { FILE } = require('./install');
let launchedApp;

(async () => {
  const home = process.env.DGVC_TEST_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-electron-'));
  fs.mkdirSync(home, { recursive: true });
  const shots = process.env.DGVC_SHOTS || '';
  const appDir = process.env.DGVC_APP_DIR || path.join(__dirname, '..'); // có thể trỏ vào app.asar đã đóng gói
  const app = await electron.launch({ executablePath: process.env.DGVC_EXECUTABLE || require('electron'), args: process.env.DGVC_EXECUTABLE ? ['--no-sandbox'] : [appDir, '--no-sandbox'], env: { ...process.env, DGVC_USER_DATA: path.join(home, 'userData'), DGVC_DOCUMENTS: path.join(home, 'Documents') } });
  launchedApp = app;
  // giả lập hộp thoại Windows: trả sẵn đường dẫn
  const answer = async (p) => app.evaluate(({ dialog, shell }, f) => { shell.openPath = async () => ''; // không mở trình xem file trên máy kiểm thử
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, p);
  const w = await app.firstWindow();
  w.setDefaultTimeout(25000);
  let step = 0; const log = (m) => console.log(`[${++step}] ${m}`);
  const errors = []; w.on('pageerror', (e) => errors.push(e.message));
  await w.getByText('Bước 1 — Thư mục dữ liệu').waitFor({ timeout: 30000 });
  log("await w.getByText('Bước 1 — Thư mục dữ liệu').waitFor({ timeout: 30000");
  assert.equal(await w.getByRole('textbox', { name: 'Thư mục dữ liệu' }).inputValue(), path.join(home, 'Documents', 'DGVC_DATA'), 'mặc định Documents\\DGVC_DATA');
  assert.equal(await w.evaluate(() => typeof window.dgvc.api), 'function', 'preload đã nạp');
  assert.equal(await w.evaluate(() => typeof require), 'undefined', 'giao diện không có quyền Node');
  await w.getByRole('button', { name: 'Tiếp' }).click();
  await w.locator('.unit-pick label', { hasText: 'DH —' }).click();
  await w.getByRole('button', { name: 'Tiếp' }).click(); await w.getByRole('button', { name: 'Tiếp' }).click();
  await w.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
  await w.getByLabel('Tên đăng nhập').fill('saoluucvhak@gmail.com');
  await w.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await w.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
  await w.getByRole('button', { name: 'Vào phần mềm' }).click();
  await w.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  log("await w.getByRole('heading', { name: 'Tổng quan' }).waitFor();");
  // import phiếu cân qua hộp thoại Windows (giả lập)
  await w.getByRole('button', { name: 'Phiếu cân' }).first().click();
  await answer(FILE.DH);
  await w.getByRole('button', { name: 'Import từ Excel' }).click();
  await w.getByLabel('Chấp nhận các dòng cảnh báo').check();
  await w.getByRole('button', { name: /Xác nhận import/ }).click();
  await w.locator('.toast', { hasText: 'Đã import 77 dòng' }).waitFor();
  log("await w.locator('.toast', { hasText: 'Đã import 77 dòng' }).waitFor();");
  await w.getByRole('button', { name: 'Giao nhận dầu' }).first().click();
  await answer(FILE.DH);
  await w.getByRole('button', { name: 'Import từ Excel' }).click();
  await w.getByLabel('Chấp nhận các dòng cảnh báo').check();
  await w.getByRole('button', { name: /Xác nhận import/ }).click();
  await w.locator('.toast', { hasText: 'Đã import 16 dòng' }).waitFor();
  log("await w.locator('.toast', { hasText: 'Đã import 16 dòng' }).waitFor();");
  await w.getByRole('button', { name: 'Tính giá vận chuyển' }).first().click();
  await w.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
  await w.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
  await w.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
  await w.locator('.kpi.main .v', { hasText: '88.900' }).waitFor();
  log("await w.locator('.kpi.main .v', { hasText: '88.900' }).waitFor();");
  if (shots) { fs.mkdirSync(shots, { recursive: true }); await w.screenshot({ path: path.join(shots, 'electron-tinh-gia.png') }); }
  // xuất PDF BKVC bằng printToPDF của Electron
  await w.getByRole('button', { name: 'Bảng xác nhận KL' }).last().click();
  await w.locator('.money', { hasText: '139.421.905' }).waitFor();
  log("await w.locator('.money', { hasText: '139.421.905' }).waitFor();");
  const pdf = path.join(home, 'BKVC_DH.pdf'); await answer(pdf);
  await w.getByRole('button', { name: 'Xuất PDF' }).first().click();
  await w.locator('.toast', { hasText: 'Đã xuất PDF' }).waitFor();
  log("await w.locator('.toast', { hasText: 'Đã xuất PDF' }).waitFor();");
  assert.equal(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
  if (shots) await w.screenshot({ path: path.join(shots, 'electron-bkvc.png') });
  log('pdf ok'); assert.deepEqual(errors, []);
  if (process.env.DGVC_ACCEPTANCE_CONFIRM === '1') {
    await w.evaluate(async () => {
      const D = window.DGVC;
      let period = (await D.api('periods.list', {})).items[0];
      await D.api('periods.confirm', { periodId: period.period_id, rowVersion: period.row_version });
      period = (await D.api('periods.list', {})).items[0];
      await D.api('periods.lock', { periodId: period.period_id, rowVersion: period.row_version });
    });
    log('kỳ đã xác nhận và khóa trước khi kiểm tra nâng cấp');
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(home, 'userData', 'dgvc-config.json'), 'utf8'));
  assert.equal(cfg.dataFolder, path.join(home, 'Documents', 'DGVC_DATA'));
  log(`windows: ${await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => x.getTitle() + (x.isVisible() ? ' (hiện)' : ' (ẩn)')).join(', '))}`);
  // lỗi của giao diện được ghi về nhật ký phía main (kênh logError) và lỗi JavaScript ngoài ý muốn hiện thông báo
  await w.evaluate(() => window.dgvc.logError('kiem-thu-nhat-ky'));
  await w.evaluate(() => { setTimeout(() => { throw new Error('boom-electron'); }); });
  await w.locator('.toast', { hasText: 'Có lỗi không mong muốn: boom-electron' }).waitFor();
  const logText = await (async () => { for (let i = 0; i < 20; i++) { try { const t = fs.readFileSync(path.join(home, 'userData', 'dgvc-main.log'), 'utf8'); if (t.includes('kiem-thu-nhat-ky') && t.includes('boom-electron')) return t; } catch { /* chưa có */ } await new Promise((r) => setTimeout(r, 250)); } return ''; })();
  assert.ok(logText.includes('renderer kiem-thu-nhat-ky') && logText.includes('renderer error: Error: boom-electron'), 'nhật ký main có lỗi của giao diện');
  log('nhật ký lỗi giao diện ok');
  log('closing'); await app.close();
  log('closed');
  console.log(`ELECTRON OK — ${pdf} (${fs.statSync(pdf).size} byte)`);
})().catch(async (error) => {
  if (launchedApp) await launchedApp.close().catch(() => {});
  console.error(error);
  process.exit(1);
});
