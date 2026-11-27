'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/**
 * Test E2E giao diện:
 *  - (đã gộp menu) Đối chiếu với đối tác: Đối chiếu 3 tiêu chí + Các đợt đã nạp (nhóm Đối tác)
 *  - (đã gộp menu) Xuất gói gửi đối tác nằm ở Trao đổi dữ liệu → Xuất gói
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
    await completeAccountSetup(page);
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // 1. (đã gộp menu) "Nhập dữ liệu thuê VC" → màn "Đối chiếu dữ liệu": thẻ Đối chiếu 3 tiêu chí có ô chọn file, Các đợt đã nạp quản lý đợt
    assert.equal(await page.locator('nav button', { hasText: 'Nhập dữ liệu thuê VC' }).count(), 0, 'đã bỏ mục menu riêng');
    await nav('Đối chiếu dữ liệu');
    await page.getByRole('heading', { name: 'Đối chiếu dữ liệu' }).waitFor();
    await page.getByRole('tab', { name: 'Kiểm tra nội bộ' }).waitFor();
    await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí' }).waitFor();
    await page.getByRole('tab', { name: 'Các đợt đã nạp' }).waitFor();

    await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí' }).click();
    await page.getByText('1. Chọn đợt đối tác đã lưu').waitFor();
    await page.getByText('2. Hoặc gán Kỳ tính công ty').waitFor();
    await page.getByRole('button', { name: 'Chọn file…' }).waitFor();
    await page.getByRole('button', { name: 'Lưu thành đợt…' }).waitFor();

    // Chuyển thẻ danh sách đợt
    await page.getByRole('tab', { name: 'Các đợt đã nạp' }).click();
    await page.getByText('Chưa có đợt nào được lưu').waitFor();

    // 2. (đã gộp menu) "Xuất dữ liệu VC gửi đối tác" → màn "Trao đổi dữ liệu", tab Xuất gói (kỳ đã chốt + khoảng ngày phiếu cân)
    assert.equal(await page.locator('nav button', { hasText: 'Xuất dữ liệu VC gửi đối tác' }).count(), 0, 'đã bỏ mục menu riêng');
    await nav('Trao đổi dữ liệu');
    await page.getByRole('heading', { name: 'Trao đổi dữ liệu' }).waitFor();
    await page.getByRole('tab', { name: 'Nhập gói' }).waitFor();
    await page.getByRole('tab', { name: 'Lịch sử gói' }).waitFor();
    await page.getByRole('tab', { name: 'Xuất gói' }).click();
    const type = page.locator('label.field', { hasText: 'Loại gói' }).locator('select');
    await type.selectOption('KY_TINH'); await page.getByText('Kỳ cần gửi (gói Kỳ tính)').waitFor();
    await type.selectOption('PHIEU_CAN');
    await page.getByLabel('Phiếu cân từ ngày').waitFor();
    await page.getByLabel('đến ngày').waitFor();
    await page.getByLabel('Biển số xe (cách nhau dấu phẩy; trống = mọi xe)').waitFor();
    await page.getByLabel('Định dạng file').waitFor();
    await page.getByRole('button', { name: 'Xuất gói', exact: true }).waitFor();

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
  }
});
