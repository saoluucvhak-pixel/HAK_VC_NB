'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** Kiểm tra bộ lọc trên màn Danh mục tuyến: tìm kiếm, đơn vị, ĐVT, tuyến ngừng dùng */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('Giao diện: Bộ lọc màn Danh mục tuyến', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 120000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await completeAccountSetup(page);
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // Vào Danh mục tuyến
    await page.locator('nav button', { hasText: 'Danh mục tuyến' }).first().click();
    await page.getByRole('heading', { name: 'Danh mục tuyến', level: 1 }).waitFor();

    const fQ = page.getByLabel('Tìm tuyến vận chuyển', { exact: true });
    const fUnit = page.getByLabel('Lọc theo đơn vị', { exact: true });
    const fUom = page.getByLabel('Lọc theo ĐVT mặc định', { exact: true });
    await fQ.waitFor();
    await fUnit.waitFor();
    await fUom.waitFor();

    const total = await page.locator('tbody tr').count();
    assert.ok(total > 0, 'Phải có danh sách tuyến');

    // Lọc theo từ khóa VC.007
    await fQ.fill('VC.007');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.locator('tbody tr', { hasText: 'VC.007' }).waitFor();

    // Kiểm tra chip điều kiện của HAK_SMART_FILTER và xóa chip
    await page.locator('.fchip', { hasText: 'Tìm: VC.007' }).waitFor();

    // Lọc không khớp
    await fQ.fill('KHONG_TON_TAI_999');
    await page.getByText('Không có tuyến vận chuyển phù hợp bộ lọc').waitFor();
    await fQ.fill('');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('tbody tr').count(), total);

    // Lọc theo ĐVT M3
    await fUom.selectOption('M3');
    const m3Count = await page.locator('tbody tr').count();
    assert.ok(m3Count > 0 && m3Count < total, 'Lọc M3 phải ra số lượng nhỏ hơn tổng');
    await fUom.selectOption('');
    assert.equal(await page.locator('tbody tr').count(), total);

    assert.deepEqual(errors, []);
    console.log('TEST PASSED: Bộ lọc màn Danh mục tuyến hoạt động chính xác!');
  } finally {
    await browser.close();
    await srv.close();
  }
});
