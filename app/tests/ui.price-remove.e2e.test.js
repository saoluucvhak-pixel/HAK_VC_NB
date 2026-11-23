'use strict';
/** Màn Đơn giá: nút Xóa trên dòng — nháp xóa hẳn; đã áp dụng chưa dùng thì đóng (không còn trong danh mục), mở lại bản trước; dòng đã dùng không có nút Xóa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { KETOAN } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Giao diện: Đơn giá — Xóa dòng nháp và dòng đã áp dụng chưa dùng', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const cat = srv.ctx.svc.catalog;
    const draft = (await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 123000, effectiveFrom: '2030-01-01' }, user: KETOAN })).record;
    await page.locator('nav button', { hasText: 'Đơn giá' }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: `Xóa ${draft.price_id}` }).waitFor();
    await page.getByRole('button', { name: `Xóa ${draft.price_id}` }).click();
    await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('.toast', { hasText: `Đã xóa ${draft.price_id}` }).first().waitFor();
    assert.ok(!srv.ctx.store.get('PRICE_HISTORY', draft.price_id), 'nháp bị xóa hẳn');
    await page.getByRole('button', { name: `Xóa ${draft.price_id}` }).waitFor({ state: 'detached', timeout: 10000 });
    assert.equal(await page.getByRole('button', { name: `Xóa ${draft.price_id}` }).count(), 0);
    // dòng đã áp dụng, chưa dùng: xóa → đóng, bản trước mở lại; sau đó không còn nút Xóa cho dòng đã xóa
    const a = (await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 111000, effectiveFrom: '2030-02-01' }, user: KETOAN })).record;
    await cat.activatePrice({ priceId: a.price_id, rowVersion: a.row_version, user: KETOAN });
    await page.locator('nav button', { hasText: 'Hợp đồng vận chuyển' }).first().click(); await page.waitForTimeout(500);
    await page.locator('nav button', { hasText: 'Đơn giá' }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: `Xóa ${a.price_id}` }).click();
    await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('.toast', { hasText: `Đã xóa ${a.price_id}` }).first().waitFor();
    const gone = srv.ctx.store.get('PRICE_HISTORY', a.price_id); assert.equal(gone.status, 'CLOSED'); assert.ok(gone.effective_to < gone.effective_from);
    await page.getByRole('button', { name: `Xóa ${a.price_id}` }).waitFor({ state: 'detached', timeout: 10000 });
    assert.equal(await page.getByRole('button', { name: `Xóa ${a.price_id}` }).count(), 0, 'dòng đã xóa không còn trong danh mục');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
