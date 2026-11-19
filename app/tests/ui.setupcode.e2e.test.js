'use strict';
/** P1 (1.6.1) giao diện: ADMIN đầu tiên đặt mật khẩu không cần mã; tạo kế toán → hộp thoại mã kích hoạt; kế toán đăng nhập lần đầu phải nhập mã; không in sẵn email ADMIN ở bước khởi tạo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện: mã kích hoạt một lần cho người dùng mới', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    assert.equal(await page.getByText('saoluucvhak@gmail.com').count(), 0, 'không in sẵn email ADMIN');
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    // ADMIN đầu tiên: không có ô mã
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    assert.equal(await page.getByLabel('Mã kích hoạt').isVisible(), false);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    // tạo kế toán → hộp thoại mã
    await page.locator('nav button', { hasText: 'Cài đặt' }).first().click(); await page.getByRole('tab', { name: /Người dùng/ }).click().catch(async () => { await page.getByText('Người dùng', { exact: true }).first().click(); });
    await page.getByRole('button', { name: 'Thêm người dùng' }).click();
    const m = page.locator('.modal', { hasText: 'Thêm người dùng' }); await m.getByLabel(/Tên đăng nhập/).fill('ketoan.moi@example.com'); await m.getByRole('button', { name: 'Lưu' }).click();
    const cm = page.locator('.modal', { hasText: 'Mã kích hoạt của ketoan.moi@example.com' }); await cm.waitFor();
    const code = (await cm.locator('.mono').innerText()).trim(); assert.match(code, /^[A-Z2-9]{8}$/);
    await cm.getByRole('button', { name: 'Đã ghi lại mã' }).click();
    // đăng xuất, đăng nhập lần đầu bằng mã
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('ketoan.moi@example.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('Ketoan2026'); await page.getByLabel('Nhập lại mật khẩu').fill('Ketoan2026');
    await page.getByLabel('Mã kích hoạt').fill('SAIMA234'); await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.locator('.toast', { hasText: /Mã kích hoạt không đúng/ }).first().waitFor();
    await page.getByLabel('Mã kích hoạt').fill(code); await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
