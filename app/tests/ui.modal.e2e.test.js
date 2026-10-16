'use strict';
/** Giao diện — cửa sổ nhập liệu (Thêm hợp đồng) không tự đóng khi bôi đen chữ kéo ra ngoài / bấm ra nền khi đang nhập; lưu được. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện: Thêm hợp đồng — không mất dữ liệu đang nhập', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 180000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await page.locator('nav button', { hasText: 'Hợp đồng vận chuyển' }).click();
    // cửa sổ chưa nhập gì: bấm ra nền thì đóng (như cũ)
    await page.getByRole('button', { name: 'Thêm hợp đồng' }).click();
    await page.mouse.click(10, 10); await page.waitForTimeout(200);
    assert.equal(await page.locator('.modal').count(), 0);
    await page.getByRole('button', { name: 'Thêm hợp đồng' }).click();
    const code = page.locator('.modal label.field', { hasText: 'Mã hợp đồng' }).locator('input');
    await code.fill('DH-HAK-TEST');
    // bôi đen chữ kéo ra ngoài khung
    const b = await code.boundingBox();
    await page.mouse.move(b.x + b.width - 5, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(5, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.modal').count(), 1, 'kéo bôi đen ra ngoài không đóng cửa sổ');
    // bấm ra nền khi đang nhập: không đóng
    await page.mouse.click(10, 10); await page.waitForTimeout(200);
    assert.equal(await page.locator('.modal').count(), 1, 'đang nhập dở: bấm ra nền không đóng');
    assert.equal(await code.inputValue(), 'DH-HAK-TEST');
    // Esc khi đang nhập: hỏi lại — chọn "Hủy" thì giữ nguyên
    page.once('dialog', (d) => d.dismiss());
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.equal(await page.locator('.modal').count(), 1);
    await page.locator('.modal label.field', { hasText: 'Bên thuê' }).locator('select').selectOption('HAK');
    await page.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
    await page.locator('tbody tr', { hasText: 'DH-HAK-TEST' }).waitFor();
    assert.equal(await page.locator('.modal').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
