'use strict';
/** Danh mục tuyến: bấm tuyến → ngăn đơn giá chỉ-xem; bấm đơn giá → hình thức + công thức; nút "Sửa" mở form; XEM không thấy nút Sửa; bố cục hẹp. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const SHOTS = process.env.DGVC_SHOTS || '';
const PW = 'HakGroup2026';

test('Giao diện: Danh mục tuyến — ngăn đơn giá chỉ xem, nút Sửa, vai trò XEM', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${n}.png`) }); } };
  const login = async (u) => { await page.getByLabel('Tên đăng nhập').fill(u); await page.getByLabel('Mật khẩu', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor(); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PW); await page.getByLabel('Nhập lại mật khẩu').fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    await nav('Danh mục tuyến'); await page.getByRole('heading', { name: 'Danh mục tuyến', level: 1 }).waitFor();
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('.rt-side:visible').count(), 0, 'chưa chọn tuyến thì chưa có ngăn');
    // chọn một tuyến có đơn giá
    const code = await page.evaluate(async () => { const d = await window.DGVC.api('routes.list', {}); return (d.items.find((r) => r.activePrice) || d.items[0]).route_code; });
    const row = page.locator('tbody tr', { hasText: code }).first();
    await row.locator('td').nth(2).click();
    const pane = page.getByRole('region', { name: `Đơn giá của tuyến ${code}` }); await pane.waitFor();
    await pane.getByText('Chỉ để xem. Thêm / sửa / xóa đơn giá ở Danh mục › Đơn giá.').waitFor();
    await pane.getByRole('button', { name: 'Mở Đơn giá' }).waitFor();
    for (const c of ['Ngày cập nhật', 'Mã đơn giá', 'Hình thức', 'Đơn giá', 'Hiệu lực', 'Trạng thái']) await pane.locator('th', { hasText: c }).first().waitFor();
    assert.equal(await pane.getByRole('button', { name: /^(Thêm|Sửa|Xóa)/ }).count(), 0, 'ngăn không có nút ghi');
    assert.equal(await row.getAttribute('aria-selected'), 'true');
    const lines = await page.evaluate((c) => window.DGVC.api('routes.priceLines', { routeCode: c }), code);
    assert.ok(lines.items.length > 0);
    const p0 = lines.items[0];
    await pane.locator('tbody tr', { hasText: p0.priceId }).first().click();
    const form = page.locator('.rt-formcard'); await form.waitFor();
    await form.getByText('Công thức').waitFor(); if (p0.formulaText) await form.getByText(p0.formulaText.slice(0, 20), { exact: false }).first().waitFor();
    await form.getByText(p0.methodLabel, { exact: false }).first().waitFor();
    const theoDau = lines.items.find((p) => p.methodCode === 'THEO_DAU');
    if (theoDau) { await pane.locator('tbody tr', { hasText: theoDau.priceId }).first().click(); await form.locator('.k', { hasText: 'ĐG ký HĐ' }).waitFor(); await form.locator('.k', { hasText: 'Định mức' }).waitFor(); }
    assert.equal(await form.getByRole('button').count(), 0);
    await shot('routes-1366');
    // mở Đơn giá
    // nút Sửa mở form sửa; bấm Sửa không đổi ngăn
    await page.getByRole('button', { name: `Sửa tuyến ${code}` }).click();
    await page.getByRole('dialog', { name: `Sửa tuyến ${code}` }).waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {});
    // bố cục hẹp
    for (const w of [1093, 910, 820]) {
      await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(300);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(o <= 1, `tràn ngang ${o}px ở ${w}`);
      if (w === 910) await shot('routes-910');
    }
    await page.setViewportSize({ width: 1366, height: 800 });
    await pane.getByRole('button', { name: 'Mở Đơn giá' }).click(); await page.getByRole('heading', { name: /Đơn giá/, level: 1 }).first().waitFor();

    // XEM: không thấy nút Sửa
    const A = { username: 'phuthuy.apple@gmail.com' };
    const r = await srv.ctx.svc.auth.saveUser({ record: { username: 'xem.dh', role: 'XEM', unitCode: 'DH' }, create: true, user: A });
    await srv.ctx.svc.auth.setFirstPassword({ username: 'xem.dh', newPassword: PW, setupCode: r.setupCode });
    await page.getByRole('button', { name: 'Đăng xuất' }).click(); await login('xem.dh');
    await nav('Danh mục tuyến'); await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /^Sửa tuyến/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Thêm tuyến' }).count(), 0);
    await page.locator('tbody tr', { hasText: code }).first().locator('td').nth(2).click();
    await page.getByRole('region', { name: `Đơn giá của tuyến ${code}` }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
