'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

test('Công ty & đối tác: chia 2 tab và cân đối bố cục', async (t) => {
  const { _electron: electron } = require('playwright-core');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-test-units-'));
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
    await completeAccountSetup(w, 'saoluucvhak@gmail.com');
    await w.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // Chuyển tới màn Công ty & đối tác
    await w.locator('nav button', { hasText: 'Công ty & đối tác' }).first().click();
    await w.getByRole('heading', { name: 'Công ty & đối tác', level: 1 }).waitFor();

    // Kiểm tra 2 tab xuất hiện
    const tab1 = w.getByRole('tab', { name: 'Công ty vận chuyển' });
    const tab2 = w.getByRole('tab', { name: /Công ty đối tác/ });
    assert.equal(await tab1.getAttribute('aria-selected'), 'true', 'Tab 1 mặc định được chọn');
    assert.equal(await tab2.getAttribute('aria-selected'), 'false', 'Tab 2 chưa được chọn');

    // Kiểm tra bố cục Tab 1: 2 cột cân đối (.grid.g2)
    await w.getByRole('heading', { name: 'Thông tin doanh nghiệp & Liên hệ' }).waitFor();
    await w.getByRole('heading', { name: 'Ký duyệt chứng từ & Thanh toán' }).waitFor();
    await w.getByRole('heading', { name: 'Hợp đồng vận chuyển liên quan' }).waitFor();
    assert.equal(await w.getByRole('button', { name: 'Sửa thông tin công ty' }).count(), 1, 'ADMIN có nút Sửa thông tin công ty');

    // Chuyển sang Tab 2: Công ty đối tác
    await tab2.click();
    assert.equal(await tab2.getAttribute('aria-selected'), 'true', 'Tab 2 đã được kích hoạt');
    assert.equal(await tab1.getAttribute('aria-selected'), 'false', 'Tab 1 không còn được chọn');

    // Kiểm tra bảng đối tác và ô tìm kiếm
    await w.getByRole('button', { name: 'Thêm công ty đối tác' }).waitFor();
    await w.getByRole('textbox', { name: 'Tìm đối tác' }).waitFor();
    const rowsBefore = await w.locator('table.t tbody tr').count();
    assert.ok(rowsBefore > 0, 'Phải có danh sách đối tác');

    // Thử tìm kiếm lọc theo mã
    await w.getByRole('textbox', { name: 'Tìm đối tác' }).fill('HAK');
    await w.waitForTimeout(300);
    const rowsFiltered = await w.locator('table.t tbody tr').count();
    assert.ok(rowsFiltered > 0 && rowsFiltered <= rowsBefore, 'Lọc đối tác hoạt động đúng');

    // Xóa tìm kiếm để trở lại danh sách đầy đủ
    await w.getByRole('textbox', { name: 'Tìm đối tác' }).fill('');
    await w.waitForTimeout(300);
    assert.equal(await w.locator('table.t tbody tr').count(), rowsBefore, 'Trở lại đầy đủ');
  } finally {
    if (app) await app.close();
  }
});
