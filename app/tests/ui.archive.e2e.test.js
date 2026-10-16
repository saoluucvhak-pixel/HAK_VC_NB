'use strict';
/** Giao diện — Lưu trữ theo năm: Cài đặt → Dữ liệu & sao lưu → Lưu trữ đến hết năm 2026 → Phiếu cân chọn ngày 2026 tự mở chế độ chỉ xem → Thôi xem → Mở lại năm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện ĐH: lưu trữ theo năm', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/VALIDATION_FAILED|400/.test(m.text())) errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `luu-tru-${name}.png`) }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(250); };
  const field = (scope, label) => scope.locator('label.field').filter({ has: page.locator(`span:text-is("${label}")`) });
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    for (const [menu, title] of [['Phiếu cân', 'Import phiếu cân — xem trước'], ['Giao nhận dầu', 'Import bảng kê dầu — xem trước']]) {
      await nav(menu); await next(FILE.DH);
      await page.getByRole('button', { name: 'Import từ Excel' }).click();
      await page.getByText(title).waitFor();
      await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
      await page.getByRole('button', { name: /Xác nhận import/ }).click();
      await toast(/Đã import \d+ dòng/);
    }

    await nav('Cài đặt');
    const card = page.locator('.card', { hasText: 'Lưu trữ theo năm' });
    const row = card.locator('tbody tr', { hasText: '2026' });
    await row.getByText('Đang dùng').waitFor();
    await row.getByRole('button', { name: 'Lưu trữ đến hết năm…' }).click();
    const m = page.locator('.modal', { hasText: 'Lưu trữ đến hết năm 2026' });
    await m.getByText(/77 phiếu cân, 16 dòng dầu/).waitFor();
    await m.getByText(/năm hiện tại/).waitFor();
    await shot('xem-truoc');
    await m.getByRole('button', { name: 'Lưu trữ đến hết năm 2026' }).click();
    await toast(/Đã lưu trữ đến hết năm 2026/);
    await card.locator('tbody tr', { hasText: '2026' }).getByText('Đã lưu trữ').waitFor();
    await shot('da-luu-tru');
    // Phiếu cân: kho đang dùng rỗng; chọn ngày 2026 → tự mở xem
    await nav('Phiếu cân');
    await page.locator('label.field', { hasText: 'Từ ngày' }).first().locator('input').fill('2026-09-01');
    await page.locator('label.field', { hasText: 'Đến ngày' }).first().locator('input').fill('2026-09-30');
    await page.getByRole('button', { name: 'Lọc' }).click().catch(() => {});
    await page.locator('.archive-banner', { hasText: 'năm lưu trữ 2026' }).waitFor();
    await page.locator('tbody tr', { hasText: '92H-00192' }).first().waitFor();
    await shot('dang-xem');
    await page.locator('.archive-banner').getByRole('button', { name: 'Thôi xem' }).click();
    await page.waitForTimeout(800);
    // mở lại năm
    await nav('Cài đặt');
    await card.locator('tbody tr', { hasText: '2026' }).getByRole('button', { name: 'Mở lại năm…' }).click();
    const c = page.locator('.modal', { hasText: 'Mở lại năm 2026' });
    await c.getByLabel('Lý do').fill('Nhập bổ sung');
    await c.getByRole('button', { name: 'Đồng ý' }).click();
    await toast(/Đã mở lại năm 2026/);
    await card.locator('tbody tr', { hasText: '2026' }).getByText('Đang dùng').waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); await srv.close();
  }
});
