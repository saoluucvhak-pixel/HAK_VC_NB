'use strict';
/** Giao diện — Cài đặt → Đơn vị & xe: thêm nhầm xe → bấm vào xe → sửa biển số; xe đã có phiếu cân thì báo không đổi được. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện: sửa biển số xe nhập nhầm', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 200000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/VALIDATION_FAILED|400/.test(m.text())) errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `xe-${name}.png`) }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const units = async () => { await page.locator('nav button', { hasText: 'Cài đặt' }).click(); await page.getByRole('tab', { name: 'Đơn vị & xe' }).click(); await page.getByRole('tab', { name: 'Đơn vị & xe', selected: true }).waitFor(); };
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
    await page.locator('nav button', { hasText: 'Phiếu cân' }).click(); await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import \d+ dòng/);

    await units();
    await page.getByRole('button', { name: 'Thêm xe' }).click();
    await page.locator('.modal label.field', { hasText: 'Biển số' }).locator('input').fill('92H-99999');
    await page.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
    const row = page.locator('tbody tr', { hasText: '92H-99999' });
    await row.waitFor(); await row.click();
    await page.locator('.modal', { hasText: 'Xe 92H-99999' }).getByText('Sửa được biển số').waitFor();
    await shot('sua-xe');
    await page.getByRole('button', { name: 'Sửa biển số…' }).click();
    await page.locator('.modal label.field', { hasText: 'Biển số đúng' }).locator('input').fill('92H-99990');
    await page.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã sửa biển số 92H-99999 → 92H-99990/);
    await page.locator('tbody tr', { hasText: '92H-99990' }).waitFor();
    assert.equal(await page.locator('tbody tr', { hasText: '92H-99999' }).count(), 0);
    // xe đã có phiếu cân
    await page.locator('tbody tr', { hasText: '92H-00192' }).click();
    await page.locator('.modal').getByText(/KHÔNG sửa được biển số/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sửa biển số…' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Xóa xe nhập nhầm' }).count(), 0);
    await shot('xe-da-co-phieu-can');
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'xe-FAIL.png') }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
