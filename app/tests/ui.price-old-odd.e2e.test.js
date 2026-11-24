'use strict';
/** Màn "Bảng giá chung (Cách cũ)" cũng hỏi lại số nhầm dấu chấm/phẩy (trước: không có hộp kiểm), và cổng D.api chặn ô số nhập sai (NaN không được đổi thành null = ô trống). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Màn Đơn giá cách cũ: hỏi lại số nhầm dấu; D.api chặn ô số nhập sai', { skip: !CHROME && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // cổng chung: NaN trong dữ liệu gửi đi bị chặn ngay ở giao diện, báo rõ ô nào (không gửi, không thành null)
    const blocked = await page.evaluate(async () => { const D = window.DGVC; let sent = false; const old = window.dgvc; try { await D.api('prices.list', { routeCode: 'X', record: { fuelNormLPerKm: NaN } }, { quiet: true }); sent = true; } catch (e) { return { sent, msg: e.message, code: e.code }; } return { sent }; });
    assert.equal(blocked.sent, false); assert.match(blocked.msg, /Có ô số nhập sai \(fuelNormLPerKm\)/); assert.equal(blocked.code, 'VALIDATION_FAILED');

    // màn cũ (D.go('prices') nay trỏ sang màn Đơn giá mới; màn cũ mở trực tiếp)
    await page.evaluate(() => { const D = window.DGVC; D.state.view = 'prices'; D.state.params = {}; D.render(); });
    await page.getByRole('button', { name: 'Tạo công thức tính đơn giá mới' }).click();
    const modal = page.locator('.modal'); await modal.waitFor();
    await modal.getByLabel(/Định mức dầu/).fill('400');
    await modal.getByRole('button', { name: 'Lưu bản nháp' }).click();
    const ck = page.locator('.modal', { hasText: 'Kiểm tra dấu chấm / phẩy' }); await ck.getByText(/Định mức dầu = 400 lít\/km \(lớn hơn 10\)/).waitFor();
    await ck.getByRole('button', { name: 'Hủy' }).click();
    await page.locator('.modal', { hasText: 'Kiểm tra dấu chấm / phẩy' }).waitFor({ state: 'detached' });
    assert.equal(await modal.getByRole('button', { name: 'Lưu bản nháp' }).count(), 1, 'hủy → vẫn ở form, chưa lưu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
