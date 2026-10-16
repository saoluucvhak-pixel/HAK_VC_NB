'use strict';
/** Giao diện — Phiếu cân: import lại file đã sửa số → "Cập nhật"; xóa nhiều phiếu đang lọc; lọc "Đã xóa" → khôi phục. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện: cập nhật phiếu cân qua import, xóa nhiều, khôi phục', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-tk-'));
  // file DH gốc, sửa KL hàng phiếu đầu tiên
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(FILE.DH);
  const ws = wb.getWorksheet('NL_VC'); let hdr = 0; let kgCol = 0;
  ws.eachRow((row, i) => { if (!hdr) row.eachCell((c, j) => { if (String(c.value).trim() === 'KL hàng (KG)') { hdr = i; kgCol = j; } }); });
  const cell = ws.getRow(hdr + 1).getCell(kgCol); const oldKg = Number(cell.value && cell.value.result !== undefined ? cell.value.result : cell.value); cell.value = oldKg + 30;
  const fixed = path.join(tmp, 'DH_da_sua.xlsx'); await wb.xlsx.writeFile(fixed);
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  let n = 0; const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `tk-${++n}-${name}.png`) }); } };
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
    await page.locator('nav button', { hasText: 'Phiếu cân' }).click(); await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import 77 dòng/);
    // import lại file đã sửa
    await next(fixed); await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.locator('.modal tbody tr', { hasText: 'Cập nhật' }).first().waitFor();
    assert.match(await page.locator('.modal tbody tr', { hasText: 'Cập nhật' }).first().textContent(), /CẬP NHẬT theo file: KL hàng/);
    await shot('import-cap-nhat');
    await page.getByLabel(/Chấp nhận các dòng cảnh báo/).check();
    await page.getByRole('button', { name: /Xác nhận import 1 dòng/ }).click();
    await toast(/cập nhật 1 phiếu/);
    // xóa phiếu đang lọc (1 xe, 1 ngày)
    await page.locator('label.field', { hasText: 'Số phiếu / biển số' }).locator('input').fill('92H-00141');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-20');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-20');
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    const del = page.getByRole('button', { name: /Xóa \d+ phiếu đang lọc/ }); await del.waitFor();
    const cnt = Number((await del.textContent()).match(/Xóa (\d+)/)[1]);
    await del.click(); await page.locator('.modal textarea').fill('file nhập nhầm'); await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await toast(new RegExp(`Đã xóa ${cnt} phiếu`));
    // lọc Đã xóa → khôi phục 1 phiếu
    await page.locator('label.field', { hasText: 'Trạng thái sử dụng' }).locator('select').selectOption('DELETED');
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await page.getByText(/Phiếu đã xóa — bấm vào 1 phiếu để khôi phục/).waitFor();
    assert.equal(await page.locator('.card.flush tbody tr').count(), cnt);
    await shot('loc-da-xoa');
    await page.locator('.card.flush tbody tr').first().click();
    await page.getByRole('button', { name: 'Khôi phục phiếu' }).click();
    await toast(/Đã khôi phục phiếu/);
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'tk-FAIL.png') }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
