'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** Rà soát #39 — màn Hợp đồng cha–con: đổi thẻ KHÔNG mất chữ đang gõ; rời màn / chọn hợp đồng khác khi còn thay đổi chưa lưu → hỏi trước; thẻ đi bằng phím mũi tên;
 *  bảng tuyến + đơn giá của hợp đồng (#38). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện ĐH: Hợp đồng — giữ chữ khi đổi thẻ, hỏi trước khi bỏ thay đổi', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const field = (label) => page.locator('.ct-detail label.field').filter({ has: page.locator(`span:text-is("${label}")`) }).locator('input, textarea, select').first();
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    await srv.ctx.svc.master.saveContract({ create: true, record: { contractCode: 'DH-HAKK', carrierUnitCode: 'DH', customerUnitCode: 'HAK', effectiveFrom: '2026-10-01' }, user: { username: 'test', role: 'ADMIN' } });
    await nav('Hợp đồng vận chuyển');
    const items = page.locator('.ct-items button'); await items.first().waitFor();
    assert.ok(await items.count() >= 2, 'cần ít nhất 2 hợp đồng');
    await items.nth(0).click(); await page.getByRole('tab', { name: 'Thông tin' }).waitFor();
    const note = field('Ghi chú'); await note.fill('chữ đang gõ — chưa lưu');

    // đổi thẻ rồi quay lại: chữ còn nguyên, không gọi lại dựng chi tiết
    await page.getByRole('tab', { name: 'Xe của hợp đồng' }).click();
    assert.equal(await page.getByRole('tab', { name: 'Xe của hợp đồng' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Thông tin' }).click();
    assert.equal(await field('Ghi chú').inputValue(), 'chữ đang gõ — chưa lưu');

    // phím mũi tên trên thanh thẻ
    await page.getByRole('tab', { name: 'Thông tin' }).focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Xe của hợp đồng' }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('tab', { name: 'Xe của hợp đồng' }).getAttribute('aria-controls'), 'ct-panel-vehicles');
    await page.keyboard.press('End'); assert.match(await page.locator('[role=tab][aria-selected=true]').innerText(), /Kỳ tính/);

    // thẻ "Tuyến và đơn giá vận chuyển": bảng tuyến + đơn giá của hợp đồng, không còn nút "Xem cả N tuyến khác"
    await page.getByRole('tab', { name: 'Tuyến và đơn giá vận chuyển' }).click();
    await page.locator('#ct-panel-price table tbody tr').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /Xem cả \d+ tuyến khác/ }).count(), 0);

    // rời màn khi còn thay đổi chưa lưu → hỏi; Hủy = ở lại, chữ còn
    await nav('Danh mục tuyến');
    await page.getByText('Bỏ thay đổi chưa lưu?').waitFor();
    await page.locator('.modal').getByRole('button', { name: 'Hủy' }).click();
    assert.equal(await page.getByRole('heading', { name: 'Hợp đồng vận chuyển', level: 1 }).count(), 1, 'vẫn ở màn Hợp đồng');
    await page.getByRole('tab', { name: 'Thông tin' }).click(); assert.equal(await field('Ghi chú').inputValue(), 'chữ đang gõ — chưa lưu');

    // chọn hợp đồng khác → hỏi; đồng ý bỏ → mở hợp đồng kia
    const second = await items.nth(1).innerText();
    await items.nth(1).click(); await page.getByText('Bỏ thay đổi chưa lưu?').waitFor();
    await page.locator('.modal').getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await page.locator('.ct-detail h2', { hasText: second.trim().split(/\s/)[0] }).first().waitFor();

    // không có thay đổi → rời màn ngay, không hỏi
    await nav('Danh mục tuyến'); await page.getByRole('heading', { name: 'Danh mục tuyến', level: 1 }).waitFor();
    assert.equal(await page.getByText('Bỏ thay đổi chưa lưu?').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
