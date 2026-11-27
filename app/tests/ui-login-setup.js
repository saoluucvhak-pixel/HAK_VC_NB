'use strict';
const path = require('node:path');

async function completeAccountSetup(page, username = 'phuthuy.apple@gmail.com', password = 'HakGroup2026') {
  await page.getByRole('radio', { name: 'Sử dụng tài khoản đăng nhập' }).check();
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản và khởi tạo' }).click();
}

// Các bài kiểm tra quyền trên dữ liệu đã có dùng bản cài kiểu cũ.
async function openLegacyInstall(page, srv, unitCode, password = 'HakGroup2026') {
  const username = 'phuthuy.apple@gmail.com';
  await srv.ctx.init({ dataFolder: path.join(srv.home, 'DGVC_DATA'), unitCode });
  await srv.ctx.svc.auth.setFirstPassword({ username, newPassword: password });
  await page.goto(srv.url);
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào phần mềm' }).click();
  await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
}

module.exports = { completeAccountSetup, openLegacyInstall };
