'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { completeAccountSetup } = require('./ui-login-setup');

const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const skip = !fs.existsSync(chromiumPath) && 'không có Chromium';
const username = 'chu.may';
const password = 'ChuMay2026';

async function setup(page, srv) {
  await page.goto(srv.url);
  await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
  const next = page.getByRole('button', { name: 'Tiếp', exact: true });
  await next.click();
  await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
  await next.click();
  await next.click();
}

test('Chromium: bỏ qua khi cài, bật tài khoản, xác thực để tắt và mở lại không mật khẩu', { skip, timeout: 90000 }, async () => {
  const srv = await start({ port: 0, quiet: true });
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: chromiumPath });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dashboard = page.getByRole('heading', { name: 'Tổng quan', exact: true });
  const login = page.getByRole('heading', { name: 'Đăng nhập', exact: true });
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const openLoginSettings = async () => {
    await page.locator('nav').getByRole('button', { name: /Cài đặt/ }).click();
    await page.getByRole('tab', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: 'Cách sử dụng phần mềm' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Người dùng' }).count(), 0);
  };
  try {
    await setup(page, srv);
    await btn('Bỏ qua').click();
    await dashboard.waitFor();
    assert.equal(srv.ctx.store.all('USERS').length, 0);
    assert.equal(await btn('Đăng xuất').count(), 0);
    await page.reload();
    await dashboard.waitFor();

    await openLoginSettings();
    await btn('Sử dụng tài khoản đăng nhập').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tên đăng nhập').fill(username);
    await dialog.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await dialog.getByLabel('Nhập lại mật khẩu').fill('khacmatkhau2026');
    await dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await page.getByText('Hai lần nhập mật khẩu không giống nhau').waitFor();
    assert.equal(srv.ctx.svc.auth.settings().mode, 'SINGLE');
    await dialog.getByLabel('Nhập lại mật khẩu').fill(password);
    await dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await login.waitFor();
    await page.reload();
    await login.waitFor();
    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await btn('Vào phần mềm').click();
    await dashboard.waitFor();

    await openLoginSettings();
    await btn('Chuyển sang một người sử dụng').click();
    await dialog.getByLabel('Tên đăng nhập').fill(username);
    await dialog.getByLabel('Mật khẩu', { exact: true }).fill('KhongDung2026');
    await dialog.getByRole('button', { name: 'Xác nhận chuyển' }).click();
    await page.getByText(/Sai tên đăng nhập hoặc mật khẩu/).waitFor();
    assert.equal(srv.ctx.svc.auth.settings().mode, 'ACCOUNT');
    await dialog.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await dialog.getByRole('button', { name: 'Xác nhận chuyển' }).click();
    await dashboard.waitFor();
    await page.reload();
    await dashboard.waitFor();
    assert.equal(await login.count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});

test('Chromium: tạo một tài khoản ngay khi cài, đăng xuất và đăng nhập lại', { skip, timeout: 60000 }, async () => {
  const srv = await start({ port: 0, quiet: true });
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: chromiumPath });
  const page = await browser.newPage();
  try {
    await setup(page, srv);
    await completeAccountSetup(page, username, password);
    const dashboard = page.getByRole('heading', { name: 'Tổng quan', exact: true });
    await dashboard.waitFor();
    assert.deepEqual(srv.ctx.store.all('USERS').map((u) => u.username), [username]);
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await dashboard.waitFor();
  } finally { await browser.close(); await srv.close(); }
});
