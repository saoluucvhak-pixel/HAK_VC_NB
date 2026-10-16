'use strict';
/**
 * Giao diện — bản cài ĐH: tạo phiên bản giá ĐƠN GIÁ CỐ ĐỊNH cho tuyến VC.007 (giá riêng HĐ), chỉ hiện ô đơn giá cố định;
 * kích hoạt → Tính giá báo tuyến cố định có dầu → bấm "Bỏ 16 dòng dầu khỏi kỳ" → đơn giá 95.500 → TÍNH GIÁ lưu kỳ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện ĐH: đơn giá cố định theo tuyến', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/VALIDATION_FAILED|400/.test(m.text())) errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `gia-co-dinh-${name}.png`) }); } };
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

    // Đơn giá → tạo phiên bản cố định
    await nav('Đơn giá');
    await page.getByRole('heading', { name: 'Đơn giá', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tạo phiên bản giá mới' }).click();
    const m = page.locator('.modal', { hasText: 'Phiên bản giá mới' });
    await field(m, 'Phương thức đơn giá').locator('select').waitFor();
    assert.ok(await field(m, 'Định mức dầu (lít/km) *').isVisible(), 'mặc định theo giá dầu: có ô định mức');
    assert.ok(!(await field(m, 'Đơn giá cố định / tấn (chưa VAT)').isVisible()));
    await field(m, 'Phương thức đơn giá').locator('select').selectOption('CO_DINH');
    assert.ok(!(await field(m, 'Định mức dầu (lít/km) *').isVisible()), 'cố định: ẩn ô dầu');
    await field(m, 'Giá riêng cho hợp đồng').locator('select').selectOption('HD-DH-HAKQN');
    await field(m, 'Hiệu lực từ ngày *').locator('input').fill('2026-09-01');
    await field(m, 'Đơn giá cố định / tấn (chưa VAT)').locator('input').fill('95500');
    await m.getByText('Đơn giá vận chuyển mọi kỳ =').waitFor();
    await m.locator('.money', { hasText: '95.500' }).waitFor();
    await shot('tao-phien-ban');
    await m.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await toast(/Đã lưu bản nháp/);
    const draftRow = page.locator('tbody tr', { hasText: 'Cố định' }).filter({ hasText: 'HD-DH-HAKQN' });
    await draftRow.waitFor(); await draftRow.click();
    await page.locator('.modal', { hasText: 'Bản nháp' }).getByRole('button', { name: 'Kích hoạt' }).click();
    await page.locator('.modal', { hasText: 'Kích hoạt giá mới' }).getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('tbody tr', { hasText: 'Cố định' }).filter({ hasText: 'ACTIVE' }).or(page.locator('tbody tr', { hasText: 'Cố định' }).filter({ hasText: 'Đang dùng' })).first().waitFor();
    await shot('danh-sach');

    // Tính giá: tuyến cố định có dầu → lỗi + nút bỏ dầu
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.locator('label.field', { hasText: 'Ngày lập BKVC' }).locator('input').fill('2026-09-25');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    const err = page.locator('.issues li', { hasText: 'ĐƠN GIÁ CỐ ĐỊNH' });
    await err.waitFor();
    await shot('loi-co-dau');
    await err.getByRole('button', { name: 'Bỏ 16 dòng dầu khỏi kỳ' }).click();
    await page.locator('.modal', { hasText: 'Bỏ dầu khỏi kỳ' }).getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('.kpi.main .v', { hasText: '95.500' }).waitFor();
    await page.locator('tbody tr', { hasText: 'VC.007' }).getByText('cố định').waitFor();
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ/);
    await page.locator('.kpi.main .v', { hasText: '95.500' }).waitFor();
    await page.locator('tbody tr', { hasText: 'VC.007' }).getByRole('button', { name: /95\.500/ }).click();
    await page.getByText('Đơn giá cố định', { exact: true }).first().waitFor();
    await shot('ket-qua');
    await page.keyboard.press('Escape');
    // Căn cứ giá hợp đồng: tuyến cố định ghi thẳng đơn giá, cột dầu "—"
    await nav('Căn cứ giá hợp đồng');
    await page.locator('label.field', { hasText: 'Hợp đồng' }).locator('select').selectOption('HD-DH-HAKQN');
    await page.locator('label.field', { hasText: 'Áp dụng ngày' }).locator('input').fill('2026-09-20');
    await page.getByRole('button', { name: 'Xem', exact: true }).click();
    const br = page.locator('tbody tr', { hasText: 'VC.007' });
    await br.getByText('giá cố định').waitFor();
    assert.match(await br.innerText(), /95\.500/);
    await shot('can-cu-gia');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); await srv.close();
  }
});
