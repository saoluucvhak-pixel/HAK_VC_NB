'use strict';
/** Giao diện (bản 1.2.6): dầu nhận ở kho / đơn vị khác vẫn tính giá; xóa các dòng dầu đang lọc → import lại file đúng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện ĐH: dầu nhiều kho vẫn tính giá; xóa dầu đang lọc rồi tải lại', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  let n = 0; const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `dau-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: false }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.getByRole('button', { name: label, exact: false }).first().click(); await page.waitForTimeout(250); };
  const price = (v) => page.locator('.kpi.main .v', { hasText: v }).waitFor();
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
    // nhập tay 1 dòng dầu nhận ở đơn vị / kho khác
    await nav('Giao nhận dầu');
    await page.getByRole('button', { name: 'Nhập tay' }).click();
    const m = page.locator('.modal', { hasText: 'Nhập tay dòng dầu' });
    await m.locator('label.field', { hasText: 'Ngày nhận dầu' }).locator('input').fill('2026-09-21');
    await m.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await m.locator('label.field', { hasText: 'Biển số / mã xe' }).locator('input').fill('92H-00192');
    await m.locator('label.field', { hasText: 'Số lít' }).locator('input').fill('50');
    await m.locator('label.field', { hasText: 'Đơn giá dầu' }).locator('input').fill('29940');
    assert.equal(await m.locator('label.field', { hasText: 'Bên giao dầu' }).locator('select').inputValue(), 'HAKQN', 'bên giao theo dòng dầu đã có');
    assert.ok(await m.locator('label.field', { hasText: 'Bên giao dầu' }).locator('select').isDisabled(), 'không chọn được bên giao khác');
    await m.locator('label.field', { hasText: 'Kho nhận dầu' }).locator('input').fill('Cây xăng Đại Lộc');
    await m.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã thêm 1 dòng/);
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await page.locator('.issues li').first().waitFor(); await page.waitForTimeout(500);
    assert.equal(await page.locator('.issues li', { hasText: 'E_MULTI_FUEL_GROUP' }).count(), 0);
    assert.match(await page.locator('.kpi.main .v').innerText(), /\d/);
    await shot('nhieu-kho-van-tinh');
    // xóa dầu đang lọc → import lại
    await nav('Giao nhận dầu');
    await page.getByRole('button', { name: /Xóa 17 dòng đang lọc/ }).click();
    const c = page.locator('.modal', { hasText: 'Xóa dòng dầu đang lọc' });
    await c.getByLabel('Lý do').fill('File dầu sai');
    await shot('xoa-dau');
    await c.getByRole('button', { name: 'Xóa', exact: true }).click();
    await toast(/Đã xóa 17 dòng dầu/);
    await page.getByText('Chưa có dòng dầu cho hợp đồng này').waitFor();
    await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByText('Import bảng kê dầu — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import 16 dòng/ }).click();
    await toast(/Đã import 16 dòng/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); await srv.close();
  }
});
