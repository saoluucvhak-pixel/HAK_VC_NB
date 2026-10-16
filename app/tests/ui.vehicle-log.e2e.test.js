'use strict';
/** Giao diện — Báo cáo → Nhật trình xe: chọn xe, tháng / quý → bảng + tổng, đổi sang quý có dòng cộng tháng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện: Nhật trình xe theo tháng / quý', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const field = (name) => page.locator('label.field').filter({ has: page.locator(`span:text-is("${name}")`) });
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    for (const [menu, title] of [['Phiếu cân', 'Import phiếu cân — xem trước'], ['Giao nhận dầu', 'Import bảng kê dầu — xem trước']]) {
      await page.locator('nav button', { hasText: menu }).click(); await next(FILE.DH);
      await page.getByRole('button', { name: 'Import từ Excel' }).click();
      await page.getByText(title).waitFor();
      await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
      await page.getByRole('button', { name: /Xác nhận import/ }).click();
      await toast(/Đã import \d+ dòng/);
    }
    await page.locator('nav button', { hasText: 'Báo cáo' }).click();
    await page.getByRole('tab', { name: 'Nhật trình xe' }).click();
    await page.getByRole('tab', { name: 'Nhật trình xe', selected: true }).waitFor();
    await field('Xe').locator('select').selectOption('92H-00192');
    await field('Năm').locator('input').fill('2026');
    await field('Tháng').locator('select').selectOption('9');
    await page.getByRole('button', { name: 'Xem', exact: true }).click();
    await page.getByRole('heading', { name: 'NHẬT TRÌNH VẬN CHUYỂN XE 92H-00192' }).waitFor();
    await page.locator('.kpi.main .v', { hasText: '2.736' }).waitFor();
    assert.match(await page.locator('.card.flush tbody tr').first().textContent(), /18\/09\/2026.*VC\.007.*72.*3.*432/);
    // chốt đồng hồ km đầu năm / cuối năm
    await page.getByText(/Chưa chốt đồng hồ km/).waitFor();
    await page.getByRole('button', { name: 'Chốt đồng hồ km…' }).click();
    const rows = page.locator('.modal tbody tr'); await rows.nth(1).waitFor();
    assert.equal(await rows.count(), 2, 'gợi ý sẵn 2 lần chốt: 01/01 và 31/12');
    await rows.nth(0).locator('input[type=number]').fill('120000');
    await rows.nth(1).locator('input[type=number]').fill('123500');
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'chot-dong-ho.png') }); }
    await page.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
    await toast(/Đã lưu chốt đồng hồ: thêm 2/);
    await field('Theo').locator('select').selectOption('YEAR');
    await page.locator('.kpi', { hasText: 'Km đồng hồ' }).locator('.v', { hasText: '3.500' }).waitFor();
    await page.locator('.kpi', { hasText: 'Chênh lệch (đồng hồ − tuyến)' }).locator('.v', { hasText: '+764 km' }).waitFor();
    await page.getByRole('heading', { name: 'ĐỐI CHIẾU KM ĐỒNG HỒ VỚI KM THEO TUYẾN' }).waitFor();
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, 'nhat-trinh-thang.png') }); }
    await field('Theo').locator('select').selectOption('QUARTER');
    await field('Quý').locator('select').selectOption('3');
    await page.getByText('Quý 3/2026').waitFor();
    await page.locator('.kpi.main .v', { hasText: '2.736' }).waitFor();
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'nt-FAIL.png') }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
