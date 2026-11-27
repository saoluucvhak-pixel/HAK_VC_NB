'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** P4 giao diện: gói trao đổi có dòng dầu trùng nội dung với dòng nhập tay → hiện "Dòng dầu nghi trùng", mặc định "Bỏ qua"; nhập xong chỉ còn 1 dòng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');
const { fuelContentKey } = require('../main/import/fuelKey');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện HAKQN: dòng dầu nghi trùng khi nhận gói kỳ', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-fd-'));
  const a = await install('DH', { installId: 'INS-AAAA1111' });
  const k = await a.periods.calculate({ contractId: a.contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await a.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const file = path.join(tmp, 'ky_may_A.dgvc'); await new ExchangeService(a.store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: file, user: { username: 'ketoan' } });
  const src = a.store.find('GIAO_NHAN_DAU', (r) => r.contract_id === a.contractId && !r.is_deleted); const x = src[0]; a.store.close();
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await srv.ctx.store.transaction((tx) => { tx.insert('GIAO_NHAN_DAU', { ...x, receipt_id: 'GD-TAY-1', import_batch_id: '' }); }, { user: 'test' }); // nhập tay dòng cùng nội dung
    await page.locator('nav button', { hasText: 'Trao đổi dữ liệu' }).click(); await page.getByRole('heading', { name: 'Trao đổi dữ liệu' }).waitFor();
    await fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: file }) }); await page.getByRole('button', { name: 'Chọn gói…' }).click();
    await page.getByText('Thông tin gói').waitFor();
    await page.getByText(/Xung đột \(1\)/).waitFor(); await page.getByText(/Dòng dầu nghi trùng/).waitFor(); await page.getByText(/đã có ở máy này \(mã GD-TAY-1\)/).waitFor();
    assert.equal(await page.getByLabel('Xử lý dòng dầu nghi trùng').inputValue(), 'SKIP', 'mặc định bỏ qua');
    await page.getByRole('button', { name: 'Nhập gói' }).last().click(); await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('.toast', { hasText: /Đã nhập gói/ }).first().waitFor({ timeout: 30000 });
    const mine = srv.ctx.store.find('GIAO_NHAN_DAU', (r) => r.contract_id === a.contractId && !r.is_deleted);
    assert.equal(mine.filter((r) => fuelContentKey(r) === fuelContentKey(x)).length, 1); assert.equal(mine.length, src.length);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
