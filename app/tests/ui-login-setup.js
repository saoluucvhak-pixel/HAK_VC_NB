'use strict';

async function completeAccountSetup(page, username = 'phuthuy.apple@gmail.com', password = 'HakGroup2026') {
  await page.getByRole('radio', { name: 'Sử dụng tài khoản đăng nhập' }).check();
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản và khởi tạo' }).click();
}

module.exports = { completeAccountSetup };
