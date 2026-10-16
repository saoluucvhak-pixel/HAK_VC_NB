'use strict';
/**
 * Giao diện — Đối chiếu dữ liệu (bản cài ĐH): chốt kỳ 18–23/09 → xe A gửi về muộn 1 phiếu ngày 20/09 → import thấy cảnh báo "nhập muộn"
 * → menu Đối chiếu dữ liệu có số nhắc, liệt kê "Về muộn", nút mở đúng kỳ → tab Đối chiếu với đơn vị khác: chọn file Excel phiếu cân của xe A.
 */
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
const HEAD = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Mã tuyến'];
async function ticketFile(file, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_VC'); ws.addRow(HEAD); for (const r of rows) ws.addRow(r); await wb.xlsx.writeFile(file); return file;
}

test('Giao diện ĐH: phiếu cân về muộn được phát hiện và đối chiếu được với file của xe A', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-rc-'));
  const late = await ticketFile(path.join(tmp, 'xeA_ve_muon.xlsx'), [['99001', '20/09/2026', '10:00:00', '20/09/2026', '10:20:00', '92H-00192', 14000, 32000, 18000, 'VC.007']]);
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  let n = 0; const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `rc-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: false }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
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
    // chốt kỳ 18–23/09
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ/);
    await page.getByRole('button', { name: 'Xác nhận kỳ' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await toast(/Đã xác nhận kỳ/);

    // xe A gửi về muộn 1 phiếu ngày 20/09
    await nav('Phiếu cân'); await next(late);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByText('Import phiếu cân — xem trước').waitFor();
    await page.getByText(/nhập muộn nên CHƯA được tính/).first().waitFor();
    await shot('import-canh-bao-ve-muon');
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import 1 dòng/);

    // menu có số nhắc
    await nav('Đối chiếu dữ liệu');
    await page.getByRole('heading', { name: 'Đối chiếu dữ liệu' }).waitFor();
    const badge = page.locator('nav button', { hasText: 'Đối chiếu dữ liệu' }).locator('.badge');
    await badge.waitFor(); assert.equal((await badge.textContent()).trim(), '1');
    const row = page.locator('tbody tr', { hasText: '99001' });
    await row.locator('.tag', { hasText: 'Về muộn' }).waitFor();
    assert.match(await row.textContent(), /18\.000/);
    await shot('phieu-ve-muon');
    await row.getByRole('button', { name: 'Mở kỳ để tính lại' }).click();
    await page.getByRole('heading', { name: 'Tính giá vận chuyển' }).waitFor();
    await page.getByRole('button', { name: 'Trả về nháp' }).waitFor();

    // đối chiếu với file của xe A
    await nav('Đối chiếu dữ liệu');
    await page.getByRole('tab', { name: 'Đối chiếu với đơn vị khác' }).click();
    await page.getByRole('tab', { name: 'Đối chiếu với đơn vị khác', selected: true }).waitFor();
    const theirs = await ticketFile(path.join(tmp, 'xeA_phieu_can.xlsx'), [
      ['99001', '20/09/2026', '10:00:00', '20/09/2026', '10:20:00', '92H-00192', 14000, 32000, 18000, 'VC.007'],
      ['99009', '20/09/2026', '22:00:00', '20/09/2026', '22:20:00', '92H-00192', 14000, 31000, 17000, 'VC.007'],
    ]);
    await next(theirs);
    await page.getByRole('button', { name: 'Chọn file…' }).click();
    await page.locator('.kpi', { hasText: 'Bên mình chưa có' }).locator('.v', { hasText: '1' }).waitFor();
    await page.locator('tbody tr', { hasText: '99009' }).locator('.tag', { hasText: 'Bên mình chưa có' }).waitFor();
    await shot('doi-chieu-file-xe-A');
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'rc-FAIL.png') }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
