'use strict';
/** Giao diện — Hợp đồng: hợp đồng đã có dầu chỉ sửa thông tin; hợp đồng nhập nhầm chưa dùng → sửa mã, bên thuê → xóa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện ĐH: sửa / xóa hợp đồng', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/VALIDATION_FAILED|400/.test(m.text())) errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `hop-dong-${name}.png`) }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(250); };
  const field = (scope, label) => scope.locator('label.field').filter({ has: page.locator(`span:text-is("${label}")`) });
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    for (const [menu, title] of [['Phiếu cân', 'Import phiếu cân — xem trước'], ['Giao nhận dầu', 'Import bảng kê dầu — xem trước']]) {
      await nav(menu); await next(FILE.DH);
      await page.getByRole('button', { name: 'Import từ Excel' }).click();
      await page.getByText(title).waitFor();
      await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
      await page.getByRole('button', { name: /Xác nhận import/ }).click();
      await toast(/Đã import \d+ dòng/);
    }

    await nav('Hợp đồng vận chuyển');
    await page.getByRole('heading', { name: 'Hợp đồng vận chuyển' }).waitFor();
    // hợp đồng đã dùng
    await page.locator('tbody tr', { hasText: 'DH-HAKQN' }).click();
    let m = page.locator('.modal', { hasText: 'Hợp đồng DH-HAKQN' });
    await m.getByText(/đã có 16 dòng dầu/).waitFor();
    assert.ok(await field(m, 'Mã hợp đồng *').locator('input').evaluate((e) => e.readOnly));
    assert.equal(await m.getByRole('button', { name: 'Xóa hợp đồng…' }).count(), 0);
    await field(m, 'Số hợp đồng (tự điền)').locator('input').fill('05/2026/HĐVC');
    await shot('da-dung');
    await m.getByRole('button', { name: 'Lưu hợp đồng' }).click();
    await toast(/Đã lưu hợp đồng/);
    await page.locator('tbody tr', { hasText: '05/2026/HĐVC' }).waitFor();
    // thêm nhầm
    await page.getByRole('button', { name: 'Thêm hợp đồng' }).click();
    m = page.locator('.modal', { hasText: 'Thêm hợp đồng vận chuyển' });
    await field(m, 'Mã hợp đồng *').locator('input').fill('DH-HAKK');
    await field(m, 'Bên thuê').locator('select').selectOption('HAK');
    await m.getByRole('button', { name: 'Lưu' }).click();
    await page.locator('tbody tr', { hasText: 'DH-HAKK' }).click();
    m = page.locator('.modal', { hasText: 'Hợp đồng DH-HAKK' });
    await m.getByText(/chưa có kỳ tính, chưa có dòng dầu/).waitFor();
    await field(m, 'Mã hợp đồng *').locator('input').fill('DH-CNHAK');
    await field(m, 'Bên thuê').locator('select').selectOption('CNHAK');
    await shot('chua-dung');
    await m.getByRole('button', { name: 'Lưu hợp đồng' }).click();
    await toast(/Đã lưu hợp đồng/);
    const row = page.locator('tbody tr', { hasText: 'DH-CNHAK' });
    await row.waitFor(); assert.match(await row.innerText(), /CNHAK/);
    await row.click();
    m = page.locator('.modal', { hasText: 'Hợp đồng DH-CNHAK' });
    await m.getByRole('button', { name: 'Xóa hợp đồng…' }).click();
    const cf = page.locator('.modal', { hasText: 'Xóa hẳn hợp đồng DH-CNHAK' });
    await cf.getByLabel('Lý do').fill('Nhập nhầm');
    await cf.getByRole('button', { name: 'Xóa', exact: true }).click();
    await toast(/Đã xóa hợp đồng DH-CNHAK/);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('tbody tr', { hasText: 'DH-CNHAK' }).count(), 0);
    // ngừng dùng
    await page.locator('tbody tr', { hasText: 'DH-HAKQN' }).click();
    await page.locator('.modal', { hasText: 'Hợp đồng DH-HAKQN' }).getByRole('button', { name: 'Ngừng dùng' }).click();
    await page.locator('.modal', { hasText: 'Ngừng dùng hợp đồng' }).getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('tbody tr', { hasText: 'DH-HAKQN' }).getByText('Ngừng').waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); await srv.close();
  }
});
