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

    // Kiểm tra bộ lọc: Tìm kiếm, Chủ xe, Trạng thái
    const fQ = w.getByLabel('Tìm xe vận chuyển', { exact: true });
    const fOwner = w.getByLabel('Lọc theo chủ xe', { exact: true });
    const fStatus = w.getByLabel('Lọc theo trạng thái xe', { exact: true });
    await fQ.waitFor();
    await fOwner.waitFor();
    await fStatus.waitFor();

    // Thêm 1 xe để test lọc
    await w.getByRole('button', { name: 'Thêm xe' }).click();
    await w.locator('.modal label.field', { hasText: 'Biển số' }).locator('input').fill('92H-88888');
    await w.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
    await w.locator('tbody tr', { hasText: '92H-88888' }).waitFor();

    // Lọc theo từ khóa tìm kiếm
    await fQ.fill('92H-88888');
    await w.waitForTimeout(350);
    assert.equal(await w.locator('tbody tr').count(), 1);
    await w.locator('.fchip', { hasText: 'Tìm: 92H-88888' }).waitFor();
    await fQ.fill('KHONG_CO_XE_NAO_XYZ');
    await w.getByText('Không có xe vận chuyển phù hợp bộ lọc').waitFor();
    await fQ.fill('');
    await w.waitForTimeout(350);

    // Lọc theo trạng thái Ngừng dùng
    await fStatus.selectOption('inactive');
    assert.equal(await w.locator('tbody tr', { hasText: '92H-88888' }).count(), 0);
    await fStatus.selectOption('active');
    await w.locator('tbody tr', { hasText: '92H-88888' }).waitFor();

    console.log('TEST PASSED: Menu Danh mục/Xe vận chuyển và bộ lọc hoạt động tốt!');
  } finally {
    if (app) await app.close();
  }
});
