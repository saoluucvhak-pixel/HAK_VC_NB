'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/**
 * Rà soát trực quan 1.3.1 → 1.3.2 (màn nhỏ + bàn phím + bộ lọc):
 *  - màn 910×512 DIP (laptop 1366×768 để 150 %) và 1093×614 (125 %): không màn nào tràn ngang trang;
 *  - Enter trong ô gõ của bộ lọc = bấm Lọc; "N điều kiện đang lọc" + "Xóa lọc" đưa về mặc định và lọc lại;
 *  - hộp thoại: Tab xoay vòng trong hộp (không rò focus ra nền), Esc đóng, nút trong hộp có tên truy cập.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện: màn nhỏ không tràn, Enter/Xóa lọc ở bộ lọc, hộp thoại giữ focus', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(400); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Phiếu cân'); await fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: FILE.DH }) });
    await page.getByRole('button', { name: 'Import từ Excel' }).click(); await page.getByText('Import phiếu cân — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check(); await page.getByRole('button', { name: /Xác nhận import/ }).click(); await toast(/Đã import \d+ dòng/);

    // 1) màn nhỏ: không tràn ngang trang
    for (const [w, h] of [[1093, 614], [910, 512]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const v of ['Tổng quan', 'Phiếu cân', 'Giao nhận dầu', 'Danh mục tuyến', 'Hợp đồng vận chuyển', 'Hình thức giá', 'Đơn giá', 'Tính giá vận chuyển', 'Bảng xác nhận KL', 'Chi tiết vận chuyển', 'Báo cáo', 'Trao đổi dữ liệu', 'Lịch sử thao tác', 'Cài đặt']) {
        await nav(v);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
        assert.ok(o.sw <= o.vw + 1, `${v} @${w}px tràn ngang: ${o.sw} > ${o.vw}`);
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });

    // 2) Phiếu cân dùng bộ lọc thông minh: gõ là lọc ngay, hiện thẻ điều kiện, "Đặt lại" trả về đủ phiếu
    await nav('Phiếu cân');
    const q = page.locator('[data-sf-q]').first();
    const total = srv.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted).length;
    const some = srv.ctx.store.all('PHIEU_CAN')[0].plate_no; const expect = srv.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted && (t.plate_no.includes(some) || t.ticket_no.includes(some))).length;
    assert.ok(expect > 0 && expect < total);
    await q.fill(some); await page.getByText(/Tìm: /).first().waitFor();
    await page.getByText(new RegExp(`Hiện 1–${expect} / ${expect}`)).waitFor();
    await page.locator('[data-sf-reset]').first().click();
    await page.getByText(new RegExp(`Hiện 1–${total} / ${total}`)).waitFor();
    assert.equal(await q.inputValue(), '');
    // 2b) bộ lọc chung ở các màn còn lại (Tổng quan): Enter = Xem; "N điều kiện đang lọc"; Xóa lọc
    await nav('Tổng quan');
    const from = page.getByLabel('Từ ngày').first();
    await from.fill('2026-09-01'); await page.getByText(/1 điều kiện đang lọc/).waitFor();
    await from.press('Enter'); await page.getByText(/1 điều kiện đang lọc/).waitFor();
    await page.getByRole('button', { name: 'Xóa lọc' }).click();
    assert.equal(await from.inputValue(), ''); assert.equal(await page.getByRole('button', { name: 'Xóa lọc' }).isVisible(), false);

    await nav('Phiếu cân'); await page.locator('tbody tr').first().waitFor();
    // 3) hộp thoại: Tab xoay vòng trong hộp, Esc đóng
    await page.locator('tbody tr').first().click(); await page.locator('.drawer, .modal').first().waitFor();
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('.drawer,.modal')), `focus rò ra nền sau ${i + 1} lần Tab`); }
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('.drawer,.modal'))); }
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.drawer,.modal'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
