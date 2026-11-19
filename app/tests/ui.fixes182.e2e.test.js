'use strict';
/** Rà soát 1.8.2 — giao diện: Ctrl+Enter đúng nút; lưu thẻ này không mất thẻ kia; hết phiên gỡ hộp thoại; "Thôi xem" hỏi trước; đặt lại mật khẩu hỏi xác nhận. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện ĐH: các lỗi rà soát 1.8.2', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const calls = []; page.on('request', (r) => { if (r.url().endsWith('/api') && r.method() === 'POST') { try { calls.push(JSON.parse(r.postData()).action); } catch { /* bỏ */ } } });
  const count = (a) => calls.filter((x) => x === a).length;
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const field = (label) => page.locator('.ct-detail label.field').filter({ has: page.locator(`span:text-is("${label}")`) }).locator('input, textarea, select').first();
  const veh = () => page.getByRole('textbox', { name: 'Phạm vi xe' });
  const login = async () => {
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    await nav('Hợp đồng vận chuyển'); await page.locator('.ct-items button').first().click(); await page.getByRole('tab', { name: 'Thông tin' }).waitFor();

    // (C) sửa cả 2 thẻ, lưu thông tin → phạm vi xe chưa lưu vẫn còn, vẫn tính là chưa lưu
    await page.getByRole('tab', { name: 'Xe của hợp đồng' }).click();
    const before = await veh().inputValue(); await veh().fill(`${before}\n99X-99999\t2026-01-01\t`);
    await page.getByRole('tab', { name: 'Thông tin' }).click(); await field('Ghi chú').fill('ghi chú mới');
    await page.getByRole('button', { name: 'Lưu hợp đồng' }).click(); await page.locator('.toast', { hasText: 'Đã lưu hợp đồng' }).first().waitFor();
    await page.waitForTimeout(500);
    await page.getByRole('tab', { name: 'Xe của hợp đồng' }).click();
    assert.match(await veh().inputValue(), /99X-99999/, 'dòng xe chưa lưu còn nguyên sau khi lưu thẻ Thông tin');
    assert.equal(await field('Ghi chú').inputValue(), 'ghi chú mới', 'thông tin vừa lưu hiển thị đúng');

    // (B) Ctrl+Enter trong ô phạm vi xe → lưu PHẠM VI XE (không gọi contracts.save)
    const cs0 = count('contracts.save'); const sv0 = count('contracts.setVehicles');
    await veh().fill(before); await veh().focus(); await page.keyboard.press('Control+Enter'); await page.waitForTimeout(800);
    assert.equal(count('contracts.save'), cs0, 'Ctrl+Enter ở thẻ Xe không lưu hợp đồng'); assert.equal(count('contracts.setVehicles'), sv0 + 1, 'Ctrl+Enter ở thẻ Xe = Lưu phạm vi xe');

    // (B) Ctrl+Enter khi hộp "Bỏ thay đổi?" đang mở → không gửi lệnh ghi nào
    await page.getByRole('tab', { name: 'Thông tin' }).click(); await field('Ghi chú').fill('chưa lưu');
    await nav('Danh mục tuyến'); await page.getByText('Bỏ thay đổi chưa lưu?').waitFor();
    const n0 = calls.length; await page.keyboard.press('Control+Enter'); await page.waitForTimeout(600);
    assert.deepEqual(calls.slice(n0).filter((a) => /save|set|delete/.test(a)), [], 'không có lệnh ghi khi đang hỏi');
    await page.locator('.modal').getByRole('button', { name: 'Hủy' }).click();

    // (I) "Thôi xem" năm lưu trữ khi còn thay đổi chưa lưu → hỏi; Hủy giữ chữ
    await page.evaluate(() => window.DGVC.archiveBanner([2024]));
    await page.getByRole('button', { name: 'Thôi xem' }).click(); await page.getByText('Bỏ thay đổi chưa lưu?').waitFor();
    await page.locator('.modal').getByRole('button', { name: 'Hủy' }).click();
    assert.equal(await field('Ghi chú').inputValue(), 'chưa lưu');
    await page.evaluate(() => window.DGVC.archiveBanner([]));
    await page.getByRole('button', { name: 'Lưu hợp đồng' }).click(); await page.waitForTimeout(500); // lưu để rời màn không bị hỏi

    // (L) Đặt lại mật khẩu → hỏi xác nhận; Hủy thì không gọi API
    await nav('Cài đặt'); await page.getByRole('tab', { name: 'Người dùng' }).click();
    await page.locator('table tr', { hasText: 'saoluucvhak@gmail.com' }).first().click();
    await page.locator('.modal').getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await page.getByText(/Mật khẩu của saoluucvhak@gmail.com bị xóa/).waitFor();
    await page.locator('.modal').last().getByRole('button', { name: 'Hủy' }).click();
    assert.equal(count('users.resetPassword'), 0, 'Hủy → không đặt lại');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    // (H) hết phiên khi đang mở hộp thoại → về màn đăng nhập, không còn lớp phủ, đăng nhập được ngay
    await nav('Danh mục tuyến'); await page.getByRole('button', { name: /Thêm tuyến/ }).first().click(); await page.locator('.modal').waitFor();
    srv.ctx.svc.auth.sessions.clear();
    await page.evaluate(() => window.DGVC.api('routes.list', {}, { quiet: true }).catch(() => {})); // lần gọi API kế tiếp nhận SESSION_EXPIRED
    await page.getByLabel('Tên đăng nhập').waitFor(); await page.waitForTimeout(300);
    assert.equal(await page.locator('.overlay').count(), 0, 'không còn lớp phủ đè màn đăng nhập');
    await login();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
