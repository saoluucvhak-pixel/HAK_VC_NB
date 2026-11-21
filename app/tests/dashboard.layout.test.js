'use strict';
const { _electron: electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-test-dash-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, DGVC_USER_DATA: path.join(home, 'userData'), DGVC_DOCUMENTS: path.join(home, 'Documents') }
  });
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

  const f1 = await w.locator('.filters-inline label.field', { hasText: 'Từ ngày' }).boundingBox();
  const f2 = await w.locator('.filters-inline label.field', { hasText: 'đến ngày' }).boundingBox();
  const btn = await w.locator('.filters-inline button.btn.primary').boundingBox();

  console.log('Từ ngày box:', JSON.stringify(f1));
  console.log('đến ngày box:', JSON.stringify(f2));
  console.log('Nút Xem box:', JSON.stringify(btn));

  // Check that all 3 are on the same vertical line (Y coordinates overlap closely)
  const diffY1 = Math.abs(f1.y - f2.y);
  const diffY2 = Math.abs(f1.y - btn.y);
  console.log('Y diff between Từ ngày and đến ngày:', diffY1);
  console.log('Y diff between Từ ngày and Xem:', diffY2);
  assert.ok(diffY1 < 5, 'Từ ngày và đến ngày phải trên cùng 1 dòng Y');
  assert.ok(diffY2 < 5, 'Từ ngày và Xem phải trên cùng 1 dòng Y');

  // Check that horizontal coordinates are sequentially arranged from left to right
  assert.ok(f1.x + f1.width <= f2.x + 2, 'Từ ngày phải ở bên trái đến ngày');
  assert.ok(f2.x + f2.width <= btn.x + 2, 'đến ngày phải ở bên trái nút Xem');

  console.log('ASSERTION PASSED: Từ ngày ... đến ngày ... Xem bố cục hoàn toàn trên 1 dòng!');
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
