'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** Dòng bảng bấm được dùng được bằng bàn phím (Tab/Enter/Space) và ở màn hẹp ngăn xem chéo được cuộn vào tầm nhìn sau khi chọn dòng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

test('Giao diện: dòng tuyến mở bằng Enter/Space; màn hẹp cuộn tới ngăn đơn giá của tuyến', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await page.locator('nav button', { hasText: 'Danh mục tuyến' }).first().click(); await page.waitForTimeout(700);
    // bàn phím: dòng có tabindex; Enter mở ngăn đơn giá của tuyến
    const row = page.locator('tbody tr.click').first(); await row.waitFor();
    assert.equal(await row.getAttribute('tabindex'), '0', 'dòng bấm được phải focus được bằng bàn phím');
    await row.focus(); await page.keyboard.press('Enter');
    await page.getByRole('region', { name: /Đơn giá của tuyến/ }).waitFor();
    // màn hẹp: bấm dòng khác → ngăn nằm dưới bảng nhưng được cuộn vào tầm nhìn
    await page.setViewportSize({ width: 910, height: 700 }); await page.waitForTimeout(400);
    const rows = page.locator('tbody tr.click'); const n = await rows.count(); assert.ok(n >= 2);
    await rows.nth(1).click();
    await page.waitForFunction(() => { const el = document.querySelector('[aria-label^="Đơn giá của tuyến"]'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top < window.innerHeight - 40 && r.bottom > 0; }, null, { timeout: 15000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
