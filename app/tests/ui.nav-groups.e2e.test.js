'use strict';
/** P6 (1.8.x): menu nhóm (thu gọn/mở, nhớ trạng thái, tự mở nhóm của màn hiện tại, phím tắt cũ giữ nguyên), màn Công ty & đối tác / Xe tách khỏi Cài đặt, màn Hợp đồng cha–con. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, KETOAN, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/opt/pw-browsers/chromium');
const SHOTS = process.env.DGVC_SHOTS || '';
test('Giao diện HAKQN: menu nhóm + Hợp đồng cha–con', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
  const item = (label) => page.locator('nav .nav-items').getByRole('button', { name: label }).first();
  const group = (label) => page.locator('nav').getByRole('button', { name: label, exact: true });
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx; const contractId = 'HD-HAKQN-QS';
    const imp = ctx.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    const b = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: FILE.HAKQN, user: 'k' }); await imp.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    await ctx.svc.periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });

    // nhóm: nút có aria-expanded; mặc định mở hết; mọi mục còn trong menu; số phím tắt giữ nguyên
    for (const g of ['Bắt đầu', 'Danh mục', 'Nhập liệu', 'Tính & chốt', 'Kết xuất', 'Đối chiếu & đồng bộ', 'Hệ thống']) assert.equal(await group(g).getAttribute('aria-expanded'), 'true', g);
    for (const label of ['Tổng quan', 'Hướng dẫn & quy trình', 'Phiếu cân', 'Giao nhận dầu', 'Nhập dữ liệu thuê VC', 'Danh mục tuyến', 'Hợp đồng vận chuyển', 'DM Đơn giá', 'Báo cáo giá hợp đồng', 'Tính giá vận chuyển', 'Bảng xác nhận KL', 'Chi tiết vận chuyển', 'Kiểm tra dữ liệu', 'Báo cáo', 'Xuất dữ liệu VC gửi đối tác', 'Đối chiếu dữ liệu', 'Nhắc sửa danh mục', 'Lịch sử thao tác', 'Cài đặt', 'Công ty & đối tác', 'Xe vận chuyển']) {
      assert.ok(await item(label).count() >= 1, `mục menu ${label}`); }
    const hot = async (label) => (await page.locator('nav .nav-items button', { hasText: label }).first().locator('.n').innerText()).trim();
    assert.deepEqual([await hot('Tổng quan'), await hot('Phiếu cân'), await hot('Giao nhận dầu'), await hot('Danh mục tuyến'), await hot('DM Đơn giá'), await hot('Tính giá vận chuyển'), await hot('Cài đặt')], ['1', '2', '3', '4', '5', '6', '11']);
    await shot('menu-nhom');
    // thu gọn / mở; bàn phím (Enter) đổi được; trạng thái nhớ khi chuyển màn
    await group('Nhập liệu').click(); assert.equal(await group('Nhập liệu').getAttribute('aria-expanded'), 'false'); assert.equal(await item('Phiếu cân').isVisible(), false);
    await group('Hệ thống').focus(); await page.keyboard.press('Enter'); assert.equal(await group('Hệ thống').getAttribute('aria-expanded'), 'false');
    await item('Báo cáo').click(); await page.getByRole('heading', { name: 'Báo cáo' }).first().waitFor();
    assert.equal(await group('Nhập liệu').getAttribute('aria-expanded'), 'false', 'nhớ trạng thái thu gọn khi chuyển màn');
    assert.equal(await item('Báo cáo').getAttribute('aria-current'), 'page');
    // tự mở nhóm chứa màn hiện tại
    await page.evaluate(() => window.DGVC.go('tickets')); await page.getByRole('heading', { name: 'Phiếu cân' }).first().waitFor();
    assert.equal(await group('Nhập liệu').getAttribute('aria-expanded'), 'true', 'vào Phiếu cân → nhóm Nhập liệu tự mở'); assert.equal(await item('Phiếu cân').getAttribute('aria-current'), 'page');
    assert.equal(await group('Hệ thống').getAttribute('aria-expanded'), 'false');
    await group('Hệ thống').click();

    // Công ty & đối tác / Xe tách khỏi Cài đặt; đường dẫn cũ vẫn chạy
    await item('Công ty & đối tác').click(); await page.getByRole('heading', { name: 'Công ty & đối tác' }).first().waitFor(); await page.getByRole('tab', { name: /Công ty đối tác/ }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Xe vận chuyển', exact: true }).count(), 0);
    await item('Xe vận chuyển').click(); await page.getByRole('heading', { name: 'Xe vận chuyển', exact: true }).first().waitFor();
    await item('Cài đặt').click(); await page.getByRole('heading', { name: 'Cài đặt' }).first().waitFor(); assert.equal(await page.getByRole('tab', { name: 'Công ty & xe' }).count(), 0);
    await page.evaluate(() => window.DGVC.go('settings', { tab: 'units' })); await page.getByRole('heading', { name: 'Công ty & đối tác' }).first().waitFor();

    // Hợp đồng cha–con
    await item('Hợp đồng vận chuyển').click(); await page.getByRole('heading', { name: 'Hợp đồng vận chuyển' }).first().waitFor();
    assert.match(await page.locator('.crumb').textContent(), /^Danh mục › Hợp đồng$/);
    await page.locator('.ct-items button', { hasText: 'HAKQN-QS' }).first().click(); const d = page.locator('.ct-detail', { hasText: 'Hợp đồng HAKQN-QS' }); await d.waitFor();
    assert.match(await page.locator('.crumb').textContent(), /Danh mục › Hợp đồng › HAKQN-QS/);
    await d.getByRole('tab', { name: 'Xe của hợp đồng' }).click(); const plates = ctx.store.find('HOP_DONG_XE', (v) => v.contract_id === contractId).length;
    assert.equal((await d.getByLabel('Phạm vi xe').inputValue()).split('\n').filter(Boolean).length, plates);
    await d.getByRole('tab', { name: /Kỳ tính \(1\)/ }).click(); await d.getByRole('button', { name: 'Mở kỳ' }).waitFor();
    await d.getByRole('tab', { name: 'Mã đơn giá' }).click(); await d.getByText(/Giá chung \(cách cũ\)/).waitFor();
    await shot('hop-dong-cha-con');
    // chọn nhanh liên tiếp: kết quả cũ không ghi đè — hợp đồng cuối cùng được chọn là hợp đồng hiển thị
    const codes = await page.locator('.ct-items button .mono').allInnerTexts(); assert.ok(codes.length >= 1);
    await page.locator('.ct-filters').getByLabel('Trạng thái hợp đồng').selectOption('all');
    for (const cd of codes.slice(0, 3)) await page.locator('.ct-items button', { hasText: cd }).first().click({ noWaitAfter: true });
    const last = codes[Math.min(2, codes.length - 1)]; await page.locator('.ct-detail', { hasText: `Hợp đồng ${last}` }).waitFor();
    // màn hẹp: danh sách và chi tiết xếp dọc, có nút "← Danh sách"
    await page.setViewportSize({ width: 800, height: 800 }); await page.waitForTimeout(300);
    assert.equal(await page.locator('.ct-list').isVisible(), false, 'đã chọn → chỉ hiện chi tiết'); await shot('hop-dong-man-hep');
    await page.getByRole('button', { name: '← Danh sách' }).click(); await page.locator('.ct-list').waitFor(); assert.equal(await page.locator('.ct-detail').isVisible(), false);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(over <= 1, `tràn ngang ${over}px ở 800px`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
