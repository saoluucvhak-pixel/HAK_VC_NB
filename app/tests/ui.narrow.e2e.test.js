'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** Màn hẹp (820 / 910 / 1093 px): thẻ (tab) không bị che chữ, trang không tràn ngang, tiêu đề không bị cắt; thông báo cùng nội dung không hiện lặp. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Giao diện: màn hẹp không che chữ thẻ, không tràn ngang; thông báo trùng chỉ hiện một lần', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const screens = [['Hình thức giá', null], ['Đơn giá', null], ['Hợp đồng vận chuyển', null], ['Báo cáo', null], ['Bảng xác nhận KL', null], ['Hướng dẫn & quy trình', null], ['Cài đặt', 'Thông tin']];
    for (const w of [820, 910, 1093]) {
      await page.setViewportSize({ width: w, height: 768 });
      for (const [nav, tab] of screens) {
        await page.locator('nav button', { hasText: nav }).first().click(); await page.waitForTimeout(600);
        if (tab) { await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(400); }
        const r = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, cut: [...document.querySelectorAll('.tabs')].filter((t) => t.scrollWidth > t.clientWidth + 1).length }));
        assert.ok(r.page <= 1, `${nav}${tab ? ' › ' + tab : ''} ở ${w}px tràn ngang ${r.page}px`);
        assert.equal(r.cut, 0, `${nav}${tab ? ' › ' + tab : ''} ở ${w}px còn thẻ bị che chữ`);
      }
    }
    // thông báo cùng nội dung gọi 2 lần chỉ hiện 1 lần
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => { window.DGVC.toast('Nhớ sửa giống thử', 'info', 6000); window.DGVC.toast('Nhớ sửa giống thử', 'info', 6000); });
    assert.equal(await page.locator('.toast', { hasText: 'Nhớ sửa giống thử' }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
