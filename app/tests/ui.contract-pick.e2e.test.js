'use strict';
/** Form Hợp đồng: chọn công ty từ danh mục để điền "Tên bên vận chuyển / bên thuê in trên chứng từ" (vẫn sửa tay được). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Giao diện: thêm hợp đồng — chọn công ty từ danh mục điền tên in trên chứng từ', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
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
    const dh = srv.ctx.store.get('DON_VI', 'DH'); const hak = srv.ctx.store.get('DON_VI', 'HAK');
    const nameOf = (u) => u.doc_display_name || u.unit_name;
    await page.locator('nav button', { hasText: 'Hợp đồng vận chuyển' }).first().click(); await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Thêm hợp đồng' }).click();
    const m = page.locator('.modal', { hasText: 'Thêm hợp đồng vận chuyển' });
    const carrierName = m.locator('label.field', { hasText: 'Tên bên vận chuyển in trên chứng từ' });
    const customerName = m.locator('label.field', { hasText: 'Tên bên thuê in trên chứng từ' });
    assert.equal(await carrierName.locator('select').count(), 1, 'có ô chọn công ty từ danh mục');
    await carrierName.locator('select').selectOption('DH');
    assert.equal(await carrierName.locator('input').inputValue(), nameOf(dh));
    await customerName.locator('select').selectOption('HAK');
    assert.equal(await customerName.locator('input').inputValue(), nameOf(hak));
    assert.equal(await carrierName.locator('select').inputValue(), '', 'ô chọn trở về trạng thái chờ sau khi điền');
    await carrierName.locator('input').fill(nameOf(dh) + ' (sửa tay)'); // vẫn sửa tay được
    assert.equal(await carrierName.locator('input').inputValue(), nameOf(dh) + ' (sửa tay)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
