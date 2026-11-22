'use strict';
/** Kiểm tra mô hình cha-con: Hợp đồng (cha) -> Mã đơn giá (con của HĐ, cha của đơn giá) -> Tuyến vận chuyển & Đơn giá (con của mã đơn giá) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('Giao diện Hợp đồng cha-con: Hợp đồng -> Mã đơn giá -> Tuyến & Đơn giá', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(400); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS';
    const imp = ctx.svc.import;
    const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' });
    await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });

    // 1. Vào màn Hợp đồng vận chuyển
    await nav('Hợp đồng vận chuyển');
    await page.locator('.ct-items button', { hasText: 'HAKQN-QS' }).first().click();
    const d = page.locator('.ct-detail', { hasText: 'Hợp đồng HAKQN-QS' });
    await d.waitFor();

    // 2. Chuyển sang thẻ Mã đơn giá
    await d.getByRole('tab', { name: 'Mã đơn giá' }).click();

    // Kiểm tra cấu trúc phân cấp:
    // Cấp 2: Bảng con Mã đơn giá vận chuyển
    await page.getByRole('heading', { name: '1. Mã đơn giá vận chuyển (bảng con của hợp đồng)' }).waitFor();
    await page.getByText(/Hợp đồng vận chuyển là bảng cha liên kết với mã đơn giá con/).waitFor();

    // Cấp 3: Bảng con Tuyến vận chuyển & Đơn giá
    await page.getByRole('heading', { name: '2. Tuyến vận chuyển & Đơn giá (bảng con của mã đơn giá)' }).waitFor();
    await page.getByText(/Tuyến vận chuyển trong hợp đồng được lấy từ "mã đơn giá" cha của đơn giá/).waitFor();

    // Kiểm tra các cột trong bảng: Mã tuyến, Tên tuyến, Cự ly (km), Có phiếu cân, Đơn giá, Nguồn giá, Hình thức
    const table = page.locator('#ct-panel-price table');
    await table.waitFor();
    await table.locator('th', { hasText: 'Mã tuyến' }).waitFor();
    await table.locator('th', { hasText: 'Tên tuyến' }).waitFor();
    await table.locator('th', { hasText: 'Cự ly (km)' }).waitFor();
    await table.locator('th', { hasText: 'Có phiếu cân' }).waitFor();
    await table.locator('th', { hasText: 'Đơn giá' }).waitFor();
    await table.locator('th', { hasText: 'Nguồn giá' }).waitFor();
    await table.locator('th', { hasText: 'Hình thức' }).waitFor();

    // Nút thao tác ở Mã đơn giá: Gán mã đơn giá…, Đổi ở DM Đơn giá →
    await page.getByRole('button', { name: /Gán mã đơn giá…|Đổi mã cho HĐ…/ }).waitFor();
    await page.getByRole('button', { name: /Đổi ở (DM Đơn giá|Mã đơn giá) →/ }).waitFor();

    console.log('TEST PASSED: Mô hình cha-con Hợp đồng -> Mã đơn giá -> Tuyến & Đơn giá hoạt động hoàn hảo!');
  } finally {
    await browser.close();
    await srv.close();
  }
});
