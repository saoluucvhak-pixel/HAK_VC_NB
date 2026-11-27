'use strict';
const { completeAccountSetup } = require('./ui-login-setup');
/** Giao diện: Cài đặt → Dữ liệu & sao lưu → "Sao lưu JSON ra thư mục…" và "Khôi phục từ file…" (chọn manifest.json / .zip tự chọn), nội dung thẻ Kho lưu trữ đọc được, không trùng lặp. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện ĐH: sao lưu JSON ra thư mục, thay đổi dữ liệu, khôi phục từ file manifest.json và từ .zip tự chọn', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 30000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(400); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click();
    await completeAccountSetup(page); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await nav('Phiếu cân'); await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click(); await page.getByText('Import phiếu cân — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check(); await page.getByRole('button', { name: /Xác nhận import/ }).click(); await toast(/Đã import \d+ dòng/);
    const live = () => srv.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted).length; const n0 = live(); assert.ok(n0 > 0);

    await nav('Cài đặt');
    assert.equal(srv.ctx.store.storageKind, 'sqlite', 'bản cài mới mặc định SQLite');
    await page.locator('.storage-card').getByText('SQLite (kho chính)').waitFor();
    // 1) Sao lưu PHỤ JSON để gửi máy khác: một file .zip
    const zipJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-json-')), 'DGVC_JSON.zip'); await next(zipJson);
    await page.getByRole('button', { name: 'Sao lưu JSON gửi máy khác…' }).click(); await toast(/Đã lưu .*DGVC_JSON\.zip/);
    assert.ok(fs.existsSync(zipJson)); const AdmZip = require('adm-zip'); assert.ok(new AdmZip(zipJson).getEntry('manifest.json'));
    // 2) thay đổi dữ liệu rồi khôi phục từ file JSON đó
    await srv.ctx.svc.records.softDeleteTickets({ ticketIds: srv.ctx.store.all('PHIEU_CAN').slice(0, 5).map((t) => t.ticket_id), reason: 'thử', user: { username: 'phuthuy.apple@gmail.com', role: 'ADMIN' } });
    assert.equal(live(), n0 - 5);
    await next(zipJson); await page.getByRole('button', { name: 'Khôi phục từ file…' }).click();
    const m = page.locator('.modal', { hasText: 'Khôi phục từ file' }); await m.getByText(/Đơn vị DH/).waitFor(); await m.getByText(/kho JSON/).waitFor(); await m.getByText(/Dữ liệu Thuê vận chuyển: \d+ tệp/).waitFor();
    await m.locator('textarea').fill('khôi phục thử từ JSON'); await m.getByRole('button', { name: 'Khôi phục' }).click();
    await toast(/Đã khôi phục từ file · Thuê vận chuyển: \d+ tệp · năm lưu trữ: \d+ tệp/); assert.equal(live(), n0); assert.equal(srv.ctx.store.storageKind, 'sqlite', 'sau khôi phục từ JSON vẫn là SQLite');
    // 3) khôi phục từ bản sao lưu SQL (.zip có dgvc.db) đặt ở nơi khác
    await nav('Cài đặt');
    const b = await srv.ctx.svc.backup.backup({ kind: 'manual', user: { username: 'phuthuy.apple@gmail.com' } }); const usb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-usb-')), 'sao-luu.zip'); fs.copyFileSync(b.file, usb);
    await srv.ctx.svc.records.softDeleteTickets({ ticketIds: srv.ctx.store.all('PHIEU_CAN').slice(0, 3).map((t) => t.ticket_id), reason: 'thử', user: { username: 'phuthuy.apple@gmail.com', role: 'ADMIN' } });
    await next(usb); await page.getByRole('button', { name: 'Khôi phục từ file…' }).click();
    const m2 = page.locator('.modal', { hasText: 'Khôi phục từ file' }); await m2.getByText(/kho SQLite/).waitFor(); await m2.locator('textarea').fill('từ USB'); await m2.getByRole('button', { name: 'Khôi phục' }).click();
    await toast(/Đã khôi phục từ file/); assert.equal(live(), n0);
    // 4) file không hợp lệ → thông báo, không đổi gì
    await nav('Cài đặt'); const bad = path.join(os.tmpdir(), `khong-phai-sao-luu-${Date.now()}.zip`); fs.writeFileSync(bad, 'khong phai zip'); await next(bad);
    await page.getByRole('button', { name: 'Khôi phục từ file…' }).click(); await page.locator('.toast', { hasText: /File sao lưu hỏng|không toàn vẹn|Không có/ }).first().waitFor({ timeout: 20000 });
    assert.equal(live(), n0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
