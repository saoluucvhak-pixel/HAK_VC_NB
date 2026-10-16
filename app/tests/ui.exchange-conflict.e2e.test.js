'use strict';
/** Giao diện — bên thuê HAKQN nhận gói kỳ của 2 máy cùng đơn vị DH (cùng kỳ): gói thứ 2 hiện XUNG ĐỘT kèm so sánh, không "Thay bản cũ"; giải thích các chữ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };

async function pkg(installId, file, dropDup) {
  const { store, periods, contractId } = await install('DH', { installId });
  const ex = dropDup ? [store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400)[1].receipt_id] : [];
  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: ex, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  await new ExchangeService(store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: file, user: { username: 'ketoan' } });
  store.close(); return file;
}

test('Giao diện HAKQN: gói kỳ cùng kỳ từ máy khác → xung đột có so sánh, chọn được', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-xc-'));
  const fa = await pkg('INS-AAAA1111', path.join(tmp, 'ky_may_A.dgvc'), false);
  const fb = await pkg('INS-BBBB2222', path.join(tmp, 'ky_may_B.dgvc'), true);
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `xc-${name}.png`), fullPage: true }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const open = async (f) => {
      await page.locator('nav button', { hasText: 'Trao đổi dữ liệu' }).click();
      await page.getByRole('heading', { name: 'Trao đổi dữ liệu' }).waitFor();
      await next(f); await page.getByRole('button', { name: 'Chọn gói…' }).click();
      await page.getByText('Thông tin gói').waitFor();
    };
    await open(fa);
    await page.getByRole('button', { name: 'Nhập gói' }).last().click();
    await page.locator('.modal').getByRole('button', { name: 'Đồng ý' }).click();
    await toast(/Đã nhập gói/);
    await open(fb);
    await page.getByText(/Xung đột \(1\)/).waitFor();
    const row = page.locator('tr', { hasText: 'Đơn giá' }); assert.match(await row.textContent(), /88\.900.*96\.900/);
    await page.getByText(/nhận từ MÁY KHÁC/).waitFor();
    await page.getByText('Các chữ trong bảng nghĩa là gì?').click();
    await page.getByText(/Kỳ của máy khác không bao giờ bị thay tự động/).waitFor();
    await shot('xung-dot-ky-may-khac');
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'xc-FAIL.png'), fullPage: true }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
