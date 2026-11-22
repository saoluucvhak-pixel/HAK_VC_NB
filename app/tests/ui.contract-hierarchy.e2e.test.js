'use strict';
/** Kiểm tra mô hình cha-con: Hợp đồng (cha) -> thẻ Tuyến và đơn giá vận chuyển (một bảng, không gán mã) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('Giao diện Hợp đồng cha-con: Hợp đồng -> Tuyến và đơn giá vận chuyển', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
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

    // 2. Chuyển sang thẻ "Tuyến và đơn giá vận chuyển" (một bảng, không còn khái niệm gán mã)
    await d.getByRole('tab', { name: 'Tuyến và đơn giá vận chuyển' }).click();
    await page.getByRole('heading', { name: 'Tuyến và đơn giá đang áp dụng của hợp đồng' }).waitFor();
    const table = page.locator('#ct-panel-price table').first();
    await table.waitFor();
    for (const t of ['Tuyến', 'Tên tuyến', 'Cự ly (km)', 'Phương thức', 'Đơn giá', 'ĐVT', 'Hiệu lực từ', 'Nguồn']) await table.locator('th', { hasText: t }).first().waitFor();
    await page.getByRole('button', { name: 'Thêm đơn giá' }).waitFor();
    for (const t of [/Gán mã/, /Đổi mã/, /Bỏ gán/, /Tạo mã đơn giá/, /Chọn đơn giá có sẵn/, /Đổi ở DM Đơn giá/]) assert.equal(await page.getByRole('button', { name: t }).count(), 0, `không còn nút ${t}`);

    console.log('TEST PASSED: Hợp đồng -> Tuyến và đơn giá vận chuyển');
  } finally {
    await browser.close();
    await srv.close();
  }
});
