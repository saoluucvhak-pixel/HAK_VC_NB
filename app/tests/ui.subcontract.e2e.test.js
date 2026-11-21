'use strict';
/**
 * Test E2E giao diện:
 *  - Nhập dữ liệu thuê vận chuyển (Menu Nhập liệu)
 *  - Xuất dữ liệu VC gửi đối tác (Menu Kết xuất)
 *  - Đối chiếu 3 tiêu chuẩn (Menu Đối chiếu & đồng bộ)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/opt/pw-browsers/chromium');

test('E2E Giao diện: Nhập dữ liệu thuê VC, Xuất gửi đối tác và Đối chiếu 3 tiêu chuẩn', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(200); };

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

    // 1. Kiểm tra màn hình "Nhập dữ liệu thuê VC" trong menu Nhập liệu
    await nav('Nhập dữ liệu thuê VC');
    await page.getByRole('heading', { name: 'Nhập dữ liệu thuê vận chuyển' }).waitFor();
    await page.getByRole('tab', { name: 'Nạp đợt mới' }).waitFor();
    await page.getByRole('tab', { name: 'Danh sách các đợt đã nạp' }).waitFor();
    await page.getByText('Gán vào Kỳ vận chuyển của công ty').waitFor();
    await page.getByText('Đơn giá thuê (VNĐ / tấn)').waitFor();

    // Chuyển tab danh sách đợt
    await page.getByRole('tab', { name: 'Danh sách các đợt đã nạp' }).click();
    await page.getByText('Chưa có đợt thuê vận chuyển nào').waitFor();

    // 2. Kiểm tra màn hình "Xuất dữ liệu VC gửi đối tác" trong menu Kết xuất
    await nav('Xuất dữ liệu VC gửi đối tác');
    await page.getByRole('heading', { name: 'Xuất dữ liệu vận chuyển gửi đối tác' }).waitFor();
    await page.getByRole('tab', { name: 'Xuất theo Kỳ tính đã chốt' }).waitFor();
    await page.getByRole('tab', { name: 'Xuất theo Khoảng ngày phiếu cân' }).waitFor();
    await page.getByRole('tab', { name: 'Lịch sử đã xuất' }).waitFor();

    await page.getByRole('tab', { name: 'Xuất theo Khoảng ngày phiếu cân' }).click();
    await page.getByLabel('Từ ngày').waitFor();
    await page.getByLabel('Đến ngày').waitFor();
    await page.getByRole('button', { name: 'Xuất phiếu cân gửi đối tác' }).waitFor();

    // 3. Kiểm tra màn hình "Đối chiếu dữ liệu"
    await nav('Đối chiếu dữ liệu');
    await page.getByRole('heading', { name: 'Đối chiếu dữ liệu' }).waitFor();
    await page.getByRole('tab', { name: 'Phiếu cân chưa tính vào kỳ' }).waitFor();
    await page.getByRole('tab', { name: 'Đối chiếu với đơn vị khác' }).waitFor();

    await page.getByRole('tab', { name: 'Đối chiếu với đơn vị khác' }).click();
    await page.getByText('1. Chọn Đợt thuê vận chuyển đã nạp').waitFor();
    await page.getByText('2. Hoặc gán Kỳ tính công ty').waitFor();
    await page.getByRole('button', { name: 'Chọn file…' }).waitFor();

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
