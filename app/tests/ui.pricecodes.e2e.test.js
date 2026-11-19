'use strict';
/** Giao diện: màn "Mã đơn giá" (cha–con): tạo mã → thêm dòng giá cố định → áp dụng → gán hợp đồng (cả từ màn Hợp đồng) → kỳ tính dùng giá cố định; màn Đơn giá cũ không đổi. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện HAKQN: Mã đơn giá — tạo mã, thêm dòng cố định, áp dụng, gán hợp đồng; chọn đơn giá có sẵn; hợp đồng chọn mã', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(500); };
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
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS'; const ct = () => ctx.store.get('HOP_DONG', contractId); const unit = ct().customer_unit_code;
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });

    // màn Đơn giá CŨ vẫn như cũ (không lẫn dòng của mã)
    await nav('Đơn giá'); await page.getByRole('heading', { name: 'Đơn giá' }).first().waitFor();
    // màn Mã đơn giá
    await nav('Mã đơn giá'); await page.getByRole('heading', { name: 'Mã đơn giá' }).first().waitFor();
    const tree = page.locator('.pc-tree'); await tree.getByText('Chưa có mã đơn giá nào').waitFor();
    await tree.locator('.pc-unit', { hasText: unit }).first().getByRole('button', { name: '+ Tạo mã' }).click().catch(async () => { await tree.getByText(/Đơn vị chưa có mã/).click(); await tree.locator('.pc-unit', { hasText: unit }).first().getByRole('button', { name: '+ Tạo mã' }).click(); });
    const m = page.locator('.modal', { hasText: 'Tạo mã đơn giá' });
    await m.getByLabel(/Mã đơn giá/).fill('DG-UI-01'); await m.getByLabel(/Tên mã đơn giá/).fill('Giá cố định thử UI'); await m.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã tạo mã DG-UI-01/);
    await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-01/ }).waitFor();
    // thêm dòng giá cố định
    await page.locator('.pc-detail').getByRole('button', { name: 'Thêm dòng giá cố định' }).click();
    const lm = page.locator('.modal', { hasText: 'Thêm dòng giá cố định vào mã DG-UI-01' });
    await lm.getByLabel('Tuyến').selectOption('VC.007'); await lm.getByLabel(/Đơn giá cố định/).fill('150.000'); // gõ dấu chấm ngăn cách nghìn kiểu Việt
    await lm.getByLabel(/Hiệu lực từ ngày/).fill('2026-01-01'); await lm.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã thêm dòng giá/); const row = page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }); await row.getByText('Cố định').waitFor(); await row.getByText('Nháp').waitFor();
    await row.getByRole('button', { name: 'Áp dụng' }).click(); await toast(/Đã áp dụng/); await page.locator('.pc-detail tbody tr', { hasText: 'VC.007' }).getByText('Đang dùng').waitFor();
    // gán cho hợp đồng từ màn Mã đơn giá
    await page.locator('.pc-detail').getByRole('button', { name: 'Gán cho hợp đồng…' }).click();
    const am = page.locator('.modal', { hasText: 'Gán mã DG-UI-01 cho hợp đồng' }); await am.getByLabel('Hợp đồng').selectOption(contractId); await am.getByRole('button', { name: 'Gán mã' }).click(); await toast(/Đã gán mã DG-UI-01/);
    assert.equal(ct().price_code, 'DG-UI-01'); await page.locator('.pc-detail').getByText(/HAKQN-QS/).first().waitFor();
    // kỳ tính dùng giá cố định của mã (tuyến cố định không nhận dầu → không có dầu trong kỳ)
    const k = await ctx.svc.periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
    assert.equal(k.results[0].transportPrice, 150000); assert.equal(k.results[0].priceMethod, 'CO_DINH');
    // hợp đồng: ô "Mã đơn giá áp dụng" hiện đúng và bỏ chọn được
    await nav('Hợp đồng vận chuyển'); await page.locator('tbody tr', { hasText: 'HAKQN-QS' }).first().click();
    const cm = page.locator('.modal', { hasText: 'Hợp đồng HAKQN-QS' }); const sel = cm.getByLabel('Mã đơn giá áp dụng'); assert.equal(await sel.inputValue(), 'DG-UI-01');
    await sel.selectOption(''); await cm.getByRole('button', { name: 'Lưu hợp đồng' }).click(); await toast(/Đã lưu hợp đồng/); assert.equal(ct().price_code || '', '');
    // chọn đơn giá CÓ SẴN đưa vào mã
    await nav('Mã đơn giá'); await page.locator('.pc-tree').getByRole('button', { name: /DG-UI-01/ }).click();
    await page.locator('.pc-detail').getByRole('button', { name: 'Chọn đơn giá có sẵn…' }).click();
    const pm = page.locator('.modal', { hasText: 'Chọn đơn giá có sẵn đưa vào mã DG-UI-01' }); await pm.locator('input[type=checkbox]').first().check(); await pm.locator('input[type=date]').fill('2027-01-01'); await pm.getByRole('button', { name: 'Đưa vào mã' }).click();
    await toast(/Đã đưa 1 dòng vào mã/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
