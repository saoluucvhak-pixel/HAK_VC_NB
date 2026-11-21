'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

test('Danh mục/Xe vận chuyển menu và hiển thị trang', async (t) => {
  const { _electron: electron } = require('playwright-core');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-test-vehmenu-'));
  let app;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [path.join(__dirname, '..'), '--no-sandbox'],
      env: { ...process.env, DGVC_USER_DATA: path.join(home, 'userData'), DGVC_DOCUMENTS: path.join(home, 'Documents') }
    });
  } catch (err) {
    t.skip('Môi trường không cho phép khởi chạy Electron trực tiếp: ' + err.message);
    return;
  }
  try {
    const w = await app.firstWindow();
    await w.getByText('Bước 1 — Thư mục dữ liệu').waitFor({ timeout: 15000 });
    await w.getByRole('button', { name: 'Tiếp' }).click();
    await w.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await w.getByRole('button', { name: 'Tiếp' }).click();
    await w.getByRole('button', { name: 'Tiếp' }).click();
    await w.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await w.getByLabel('Tên đăng nhập').fill('saoluucvhak@gmail.com');
    await w.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await w.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await w.getByRole('button', { name: 'Vào phần mềm' }).click();
    await w.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // Menu Danh mục phải có nút 'Xe vận chuyển'
    const btn = w.locator('nav').getByRole('button', { name: 'Xe vận chuyển', exact: true });
    await btn.waitFor();
    await btn.click();

    // Tiêu đề trang phải là 'Xe vận chuyển'
    await w.getByRole('heading', { name: 'Xe vận chuyển', level: 1 }).waitFor();
    console.log('TEST PASSED: Menu Danh mục/Xe vận chuyển mở đúng trang Xe vận chuyển!');
  } finally {
    if (app) await app.close();
  }
});
