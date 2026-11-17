'use strict';
/** Xử lý lỗi — (1) lỗi hệ thống có mã tra cứu; (2) giao diện báo rõ khi không liên lạc được phần dữ liệu;
 *  (3) lỗi JavaScript ngoài ý muốn hiện thông báo (không im lặng), có giới hạn tần suất; lỗi API đã có thông báo riêng thì không báo trùng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start } = require('../tools/dev-server');
const { Router } = require('../main/api/router');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Router: lỗi hệ thống kèm mã requestId và ghi nhật ký cùng mã', async () => {
  const logs = [];
  const router = new Router({ status() { throw new Error('hỏng giả lập'); } }, { log: (...a) => logs.push(a) });
  const r = await router.handle('setup.status', {}, '');
  assert.equal(r.ok, false); assert.equal(r.error.code, 'INTERNAL');
  const id = r.meta.requestId;
  assert.match(r.error.message, new RegExp(`^Lỗi hệ thống \\(mã ${id}\\): hỏng giả lập$`));
  assert.ok(logs.some((l) => l[0] === 'error' && l.some((x) => String(x) === `requestId=${id}`)), 'nhật ký có cùng mã');
});

test('Giao diện: mất liên lạc với phần dữ liệu và lỗi JavaScript đều được báo, không im lặng', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 120000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  try {
    await page.goto(srv.url);
    await page.getByText('Bước 1 — Thư mục dữ liệu').waitFor();
    const toasts = () => page.locator('.toast').allTextContents();
    // (2) mất liên lạc: D.api ném lỗi IPC_FAILED + hiện thông báo; chế độ quiet thì chỉ ném
    await page.route('**/api', (route) => route.abort());
    const loud = await page.evaluate(() => window.DGVC.api('setup.status', {}).then(() => 'ok', (e) => e.code));
    assert.equal(loud, 'IPC_FAILED');
    await page.locator('.toast', { hasText: 'Không liên lạc được với phần xử lý dữ liệu' }).waitFor();
    const before = (await toasts()).length;
    const quiet = await page.evaluate(() => window.DGVC.api('setup.status', {}, { quiet: true }).then(() => 'ok', (e) => e.code));
    assert.equal(quiet, 'IPC_FAILED'); assert.equal((await toasts()).length, before, 'quiet không hiện thông báo');
    await page.unroute('**/api');
    // phản hồi sai định dạng cũng được xử lý
    await page.route('**/api', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"không phải đối tượng"' }));
    assert.equal(await page.evaluate(() => window.DGVC.api('setup.status', {}, { quiet: true }).then(() => 'ok', (e) => e.code)), 'IPC_FAILED');
    await page.unroute('**/api');
    // (3) lỗi JavaScript ngoài ý muốn → thông báo; lần 2 trong 5 giây không báo dồn
    await page.evaluate(() => { setTimeout(() => { throw new Error('boom-kiem-thu'); }); });
    await page.locator('.toast', { hasText: 'Có lỗi không mong muốn: boom-kiem-thu' }).waitFor();
    const n1 = (await toasts()).filter((t) => t.includes('Có lỗi không mong muốn')).length;
    await page.evaluate(() => { setTimeout(() => { throw new Error('boom-lan-hai'); }); }); await page.waitForTimeout(400);
    assert.equal((await toasts()).filter((t) => t.includes('Có lỗi không mong muốn')).length, n1, 'giới hạn tần suất');
    // lỗi API (có code) bị từ chối không báo trùng
    await page.waitForTimeout(5200);
    await page.evaluate(() => { Promise.reject(Object.assign(new Error('đã có thông báo riêng'), { code: 'VALIDATION_FAILED' })); }); await page.waitForTimeout(400);
    assert.ok(!(await toasts()).some((t) => t.includes('đã có thông báo riêng')), 'không báo trùng lỗi API');
  } finally { await browser.close(); srv.server && srv.server.close(); }
});
