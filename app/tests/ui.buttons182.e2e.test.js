'use strict';
/** Rà soát 1.8.2 (lần 2) — lớp chống bấm đúp không được khóa nút vĩnh viễn: nút Lưu của hộp thoại bấm lại được sau khi bị từ chối;
 *  TÍNH GIÁ bấm lại được sau khi xong; bấm đúp TÍNH GIÁ chỉ gửi 1 lệnh. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE, CONTRACT, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
test('Giao diện ĐH: nút không bị khóa vĩnh viễn sau lớp chống bấm đúp', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const calls = []; page.on('request', (r) => { if (r.url().endsWith('/api') && r.method() === 'POST') { try { calls.push(JSON.parse(r.postData()).action); } catch { /* bỏ */ } } });
  const count = (a) => calls.filter((x) => x === a).length;
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(400); };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026'); await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const imp = srv.ctx.svc.import;
    for (const [t, extra] of [['PHIEU_CAN', {}], ['GIAO_NHAN_DAU', { contractId: CONTRACT.DH }]]) {
      const a = await imp.preview({ importType: t, filePath: FILE.DH, user: 'k', ...extra }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    }

    // (1) hộp thoại: Lưu khi thiếu trường bắt buộc → hộp vẫn mở, nút Lưu bấm lại được; điền đủ → lưu được
    await nav('Cài đặt'); await page.getByRole('tab', { name: 'Người dùng' }).click(); await page.getByRole('button', { name: 'Thêm người dùng' }).click();
    const save = page.locator('.modal').getByRole('button', { name: 'Lưu' });
    await save.click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('.modal').count(), 1, 'thiếu trường → hộp vẫn mở');
    assert.equal(await save.isDisabled(), false, 'nút Lưu không bị khóa sau khi bị từ chối');
    await page.locator('.modal label.field', { hasText: 'Tên đăng nhập' }).locator('input').fill('ketoan.moi');
    const n0 = count('users.save'); await save.click(); await page.getByText(/Mã kích hoạt của ketoan.moi/).waitFor();
    assert.equal(count('users.save'), n0 + 1, 'lần bấm thứ hai gửi users.save');
    await page.locator('.modal').getByRole('button', { name: 'Đã ghi lại mã' }).click(); await page.waitForTimeout(300);

    // (2) TÍNH GIÁ: bấm lại được sau khi xong; (3) bấm đúp chỉ 1 lệnh
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    const calc = page.getByRole('button', { name: 'TÍNH GIÁ', exact: true });
    await calc.click(); await page.locator('.toast', { hasText: /Đã tính và lưu kỳ/ }).first().waitFor(); await page.waitForTimeout(300);
    assert.equal(await calc.isDisabled(), false, 'TÍNH GIÁ bấm lại được sau khi xong');
    const c0 = count('periods.calculate'); await calc.click(); await page.waitForTimeout(1500);
    assert.equal(count('periods.calculate'), c0 + 1, 'lần bấm thứ hai có gửi lệnh');
    const c1 = count('periods.calculate'); await calc.dblclick(); await page.waitForTimeout(1500);
    assert.equal(count('periods.calculate'), c1 + 1, 'bấm đúp chỉ 1 lệnh');
    assert.equal(await calc.isDisabled(), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
