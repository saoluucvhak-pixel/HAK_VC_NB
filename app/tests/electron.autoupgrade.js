'use strict';
/**
 * Chạy BẢN ELECTRON thật: bản cài CŨ (kho JSON, cấu hình storage=json) mở lên phải TỰ NÂNG CẤP sang SQLite trước khi hiện giao diện:
 * có dgvc.sqlite, cấu hình storage=sqlite, kho JSON cũ còn nguyên, dữ liệu / kỳ đã chốt nguyên vẹn qua IPC, thông báo nâng cấp hiện một lần.
 *   xvfb-run -a node tests/electron.autoupgrade.js
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { AppContext } = require('../main/app/AppContext');
const { FILE, CONTRACT, KETOAN, rid } = require('./install');

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-autoup-'));
  const userData = path.join(home, 'userData'); const data = path.join(home, 'Documents', 'DGVC_DATA');
  // 1. dựng bản cài CŨ: kho JSON có dữ liệu + 1 kỳ đã xác nhận
  const old = new AppContext({ configFile: path.join(userData, 'dgvc-config.json'), documentsDir: path.join(home, 'Documents'), defaultStorage: 'json' });
  await old.init({ mode: 'NEW', dataFolder: data, unitCode: 'HAKQN' });
  const imp = old.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
  const f = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: f.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
  const k = await old.svc.periods.calculate({ contractId: CONTRACT.HAKQN, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
  await old.svc.periods.confirm({ periodId: k.period.period_id, rowVersion: old.store.get('KY_TINH', k.period.period_id).row_version, user: KETOAN });
  const fp = old.store.fingerprint(); const total = old.svc.reports.bkvc({ periodId: k.period.period_id }).totals.total; assert.equal(old.storageKind(), 'json'); old.close();
  assert.ok(fs.existsSync(path.join(data, 'manifest.json'))); assert.ok(!fs.existsSync(path.join(data, 'dgvc.sqlite')));

  // 2. mở bằng Electron thật
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, DGVC_USER_DATA: userData, DGVC_DOCUMENTS: path.join(home, 'Documents') } });
  const w = await app.firstWindow(); w.setDefaultTimeout(30000); const errors = []; w.on('pageerror', (e) => errors.push(e.message));
  await w.getByLabel('Tên đăng nhập').waitFor();
  assert.ok(fs.existsSync(path.join(data, 'dgvc.sqlite')), 'đã dựng dgvc.sqlite trước khi hiện giao diện'); assert.ok(fs.existsSync(path.join(data, 'manifest.json')), 'kho JSON cũ còn nguyên làm dự phòng');
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'dgvc-config.json'), 'utf8')).storage, 'sqlite');
  // 3. đăng nhập (admin mặc định chưa có mật khẩu → đặt lần đầu) và kiểm dữ liệu qua giao diện
  await w.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await w.getByText('Đặt mật khẩu lần đầu').waitFor();
  await w.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await w.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026'); await w.getByRole('button', { name: 'Vào phần mềm' }).click();
  await w.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  await w.locator('.toast', { hasText: /nâng cấp sang kho SQLite/ }).first().waitFor();
  await w.locator('nav button', { hasText: 'Cài đặt' }).first().click(); await w.locator('.storage-card').getByText('SQLite (kho chính)').waitFor();
  await w.locator('nav button', { hasText: 'Bảng xác nhận KL' }).first().click(); await w.locator('.money', { hasText: total.toLocaleString('vi-VN') }).first().waitFor();
  assert.deepEqual(errors, []); await app.close();
  // 4. mở lại: vẫn SQLite, dữ liệu giống hệt bản JSON cũ
  const again = new AppContext({ configFile: path.join(userData, 'dgvc-config.json'), documentsDir: path.join(home, 'Documents') }); again.open();
  assert.equal(again.store.storageKind, 'sqlite'); assert.equal(again.store.fingerprint().perTable.PHIEU_CAN.sha256, fp.perTable.PHIEU_CAN.sha256); assert.equal(again.store.fingerprint().perTable.KY_TINH.sha256, fp.perTable.KY_TINH.sha256);
  again.close();
  console.log(`ELECTRON AUTOUPGRADE OK — ${path.join(data, 'dgvc.sqlite')}`);
})().catch((e) => { console.error('ELECTRON AUTOUPGRADE FAIL', e); process.exit(1); });
