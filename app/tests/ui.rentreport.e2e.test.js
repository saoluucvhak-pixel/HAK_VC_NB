'use strict';
/** Báo cáo thuê vận chuyển: mục menu (nhóm Đối tác, đầu nhóm), hướng dẫn 3 bước, nút điều hướng, bảng báo cáo các đợt đã nạp (chi tiết ở ui.rent-report.e2e), bố cục hẹp. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const SHOTS = process.env.DGVC_SHOTS || '';
const PW = 'HakGroup2026';

test('Giao diện: Báo cáo thuê vận chuyển', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${n}.png`) }); } };
  const open = async () => { await nav('Báo cáo thuê vận chuyển'); await page.getByRole('heading', { name: 'Báo cáo thuê vận chuyển', level: 1 }).waitFor(); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PW); await page.getByLabel('Nhập lại mật khẩu').fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    const items = (await page.locator('#nav-g-xchg .nav-txt').allInnerTexts()).map((x) => x.trim());
    assert.equal(items[0], 'Báo cáo thuê vận chuyển'); assert.ok(items.includes('Trao đổi dữ liệu') && items.includes('Đối chiếu dữ liệu'));
    await open();
    // trống: hướng dẫn thay vì bảng rỗng
    await page.getByText('Chưa có đợt dữ liệu nào từ đơn vị vận chuyển').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 0);
    const g = page.getByRole('region', { name: 'Hướng dẫn 3 bước' });
    await g.getByText('Nhận dữ liệu do đơn vị vận chuyển gửi theo mẫu (phiếu cân, dầu)').waitFor();
    await g.getByText('Đối chiếu với kỳ của bạn').waitFor();
    await g.getByText('xem tổng hợp tiền thuê ở bảng bên dưới — không cần tạo kỳ tính giá').waitFor();
    assert.equal(await g.getByText('đang hoàn thiện').count(), 0);
    assert.equal(await g.getByRole('button', { name: /tạo kỳ/i }).count(), 0);
    await shot('rentreport-trong-1366');
    // điều hướng
    await g.getByRole('button', { name: /Nhập gói/ }).click(); await page.getByRole('tab', { name: 'Nhập gói', selected: true }).waitFor();
    await open(); await g.getByRole('button', { name: 'Đối chiếu dữ liệu' }).click(); await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí', selected: true }).waitFor();
    await open(); await g.getByRole('button', { name: 'Các đợt đã nạp' }).click(); await page.getByRole('tab', { name: 'Các đợt đã nạp', selected: true }).waitFor();
    await open();
    await g.getByRole('button', { name: /Tải file mẫu Excel — phiếu cân/ }).click();
    await page.locator('.toast', { hasText: /Đã tạo file mẫu:/ }).first().waitFor();
    // tạo đợt qua dịch vụ
    const b = await srv.ctx.svc.subcontract.importBatch({ filePath: FILE.DH, partnerName: 'Đơn vị VC thử', batchName: 'Đợt thử nghiệm', user: 'k' });
    assert.ok(b.batchId);
    await open();
    const row = page.locator('.rr-main tbody tr', { hasText: 'Đợt thử nghiệm' }); await row.waitFor();
    await row.getByText('Đơn vị VC thử').first().waitFor();
    await shot('rentreport-1366');
    // bấm dòng → chi tiết theo xe (bên dưới); nút Đối chiếu mở Đối chiếu dữ liệu
    await row.click(); const det = page.getByRole('region', { name: 'Chi tiết đợt Đợt thử nghiệm' }); await det.waitFor();
    await det.getByRole('button', { name: 'Đối chiếu', exact: true }).click(); await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí', selected: true }).waitFor();
    for (const w of [1093, 910, 820]) {
      await open(); await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(300);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(o <= 1, `tràn ngang ${o}px ở ${w}`);
      if (w === 910) await shot('rentreport-910');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
