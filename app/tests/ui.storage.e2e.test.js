'use strict';
/** Giao diện — Cài đặt → Dữ liệu & sao lưu → "Kho lưu trữ dữ liệu (thí điểm SQLite)": chạy thử → chuyển → ứng dụng vẫn chạy trên SQLite → quay lại JSON. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');
const { sqliteAvailable } = require('../main/repo/SqliteStore');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Giao diện ĐH: thí điểm kho SQLite (chạy thử, chuyển, dùng bình thường, quay lại JSON)', { skip: (!fs.existsSync(CHROME) && 'không có Chromium') || (!sqliteAvailable() && 'không có node:sqlite'), timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  process.env.DGVC_DEFAULT_STORAGE = 'json'; // bản cài cũ (JSON) → thử nâng cấp bằng giao diện
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(250); };
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
    await nav('Phiếu cân'); await next(FILE.DH);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByText('Import phiếu cân — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import \d+ dòng/);

    await nav('Cài đặt');
    const card = page.locator('.storage-card');
    await card.getByText('JSON (kho cũ)').waitFor(); await card.getByText('Cần nâng cấp').waitFor();
    // chạy thử (mục Nâng cao): không đổi gì
    await card.locator('summary').click(); await card.getByRole('button', { name: /Chạy thử chuyển sang SQLite/ }).click();
    const m1 = page.locator('.modal', { hasText: 'Kết quả chạy thử' });
    await m1.getByText('Chạy thử đạt').waitFor(); await m1.getByText(/PHIEU_CAN: 77/).waitFor();
    await m1.locator('.foot').getByRole('button', { name: 'Đóng' }).click();
    assert.ok(!fs.existsSync(path.join(srv.home, 'DGVC_DATA', 'dgvc.sqlite')), 'chạy thử không để lại DB');
    // nâng cấp thật
    await page.locator('.storage-card').getByRole('button', { name: 'Nâng cấp sang SQLite ngay' }).click();
    await page.locator('.modal', { hasText: 'Nâng cấp sang kho SQLite' }).getByRole('button', { name: 'Đồng ý' }).click();
    const m2 = page.locator('.modal', { hasText: 'Kết quả chuyển kho' });
    await m2.getByText('Đã chuyển và kiểm chứng').waitFor();
    await m2.locator('.foot').getByRole('button', { name: 'Đóng' }).click();
    await page.locator('.storage-card').getByText('SQLite (kho chính)').waitFor();
    assert.ok(fs.existsSync(path.join(srv.home, 'DGVC_DATA', 'dgvc.sqlite')));
    // ứng dụng vẫn dùng bình thường trên SQLite: Phiếu cân còn nguyên
    await nav('Phiếu cân'); await page.getByText(/77/).first().waitFor();
    // quay lại JSON (Nâng cao; chưa có giao dịch nghiệp vụ mới)
    await nav('Cài đặt');
    await page.locator('.storage-card summary').click(); await page.locator('.storage-card').getByRole('button', { name: 'Quay lại kho JSON' }).click();
    await page.locator('.modal', { hasText: 'Quay lại kho JSON' }).getByRole('button', { name: 'Đồng ý' }).click();
    await page.locator('.storage-card').getByText('JSON (kho cũ)').waitFor();
    assert.deepEqual(errors, []);
  } finally { delete process.env.DGVC_DEFAULT_STORAGE; await browser.close(); await srv.close(); }
});
