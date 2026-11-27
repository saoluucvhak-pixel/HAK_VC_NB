'use strict';
const { openLegacyInstall } = require('./ui-login-setup');
/** Rà soát 1.8.2 — nút hiện đúng quyền api_spec (KE_TOAN không sửa công ty; XEM không thấy Sao lưu ngay / Chọn gói…); bấm đúp nút cấp trang chỉ gửi 1 lệnh. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PW = 'HakGroup2026';
test('Giao diện ĐH: quyền hiển thị nút + chống bấm đúp (1.8.2)', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const calls = []; page.on('request', (r) => { if (r.url().endsWith('/api') && r.method() === 'POST') { try { calls.push(JSON.parse(r.postData()).action); } catch { /* bỏ */ } } });
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(400); };
  const login = async (u) => {
    await page.getByLabel('Tên đăng nhập').fill(u); await page.getByLabel('Mật khẩu', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  };
  const logout = async () => { await page.getByRole('button', { name: 'Đăng xuất' }).click(); await page.getByLabel('Tên đăng nhập').waitFor(); };
  try {
    await openLegacyInstall(page, srv, 'DH', PW);

    // bấm đúp "Lưu hợp đồng" → chỉ 1 lệnh contracts.save
    await nav('Hợp đồng vận chuyển'); await page.locator('.ct-items button').first().click(); await page.getByRole('button', { name: 'Lưu hợp đồng' }).waitFor();
    const n0 = calls.filter((a) => a === 'contracts.save').length;
    await page.getByRole('button', { name: 'Lưu hợp đồng' }).dblclick(); await page.waitForTimeout(1200);
    assert.equal(calls.filter((a) => a === 'contracts.save').length - n0, 1, 'bấm đúp chỉ gửi 1 lệnh');

    const auth = srv.ctx.svc.auth; const A = { username: 'phuthuy.apple@gmail.com' };
    for (const [u, role] of [['ketoan.dh', 'KE_TOAN'], ['xem.dh', 'XEM']]) {
      const r = await auth.saveUser({ record: { username: u, role, unitCode: 'DH' }, create: true, user: A });
      await auth.setFirstPassword({ username: u, newPassword: PW, setupCode: r.setupCode });
    }
    await logout();

    // KE_TOAN: không thấy nút sửa công ty / thêm đối tác (units.save chỉ ADMIN), vẫn thấy Thêm xe (vehicles.save cho KE_TOAN)
    await login('ketoan.dh');
    await nav('Công ty & đối tác'); await page.getByRole('heading', { name: 'Công ty & đối tác', level: 1 }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sửa thông tin công ty' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Thêm công ty đối tác|Thêm đối tác/ }).count(), 0);
    await page.getByText('Chỉ ADMIN sửa được thông tin công ty').waitFor();
    await nav('Xe vận chuyển'); assert.ok(await page.getByRole('button', { name: 'Thêm xe' }).count() >= 1, 'KE_TOAN vẫn thêm được xe');
    await nav('Cài đặt'); assert.ok(await page.getByRole('button', { name: 'Sao lưu ngay' }).count() >= 1, 'KE_TOAN được sao lưu');
    await logout();

    // XEM: không có Sao lưu ngay / Chọn gói…
    await login('xem.dh');
    await nav('Cài đặt'); await page.waitForTimeout(300); assert.equal(await page.getByRole('button', { name: 'Sao lưu ngay' }).count(), 0);
    await nav('Trao đổi dữ liệu'); await page.waitForTimeout(300);
    assert.equal(await page.getByRole('button', { name: 'Chọn gói…' }).count(), 0); await page.getByText('Vai trò Chỉ xem không nhận gói.').waitFor();
    // XEM: form hợp đồng chỉ đọc, gõ không được → rời màn không bị hỏi
    await nav('Hợp đồng vận chuyển'); await page.locator('.ct-items button').first().click(); await page.getByRole('tab', { name: 'Thông tin' }).waitFor();
    const note = page.locator('.ct-detail label.field').filter({ has: page.locator('span:text-is("Ghi chú")') }).locator('input, textarea').first();
    assert.equal(await note.getAttribute('readonly'), '', 'ô Ghi chú chỉ đọc với XEM');
    await nav('Danh mục tuyến'); assert.equal(await page.getByText('Bỏ thay đổi chưa lưu?').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
