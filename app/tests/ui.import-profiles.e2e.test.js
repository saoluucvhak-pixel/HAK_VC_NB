'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { workbook } = require('./import.profiles-fixture');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Chromium: tạo mẫu, đọc thử, lưu, đặt mặc định, sửa cách đọc và mở lại đợt', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 90000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1050 }, locale: 'vi-VN' });
  page.setDefaultTimeout(10000);
  const errors = [];
  const testPassword = `1a-${randomUUID()}`;
  page.on('pageerror', (error) => errors.push(error.message));
  const next = (file) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: file }) });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const nav = (name) => page.getByRole('button', { name }).first().click();
  const dialog = (name) => page.getByRole('dialog', { name, exact: true });
  const openSettings = async () => {
    await nav('Cài đặt');
    await page.getByRole('tab', { name: 'Mẫu nhập Excel' }).click();
  };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await button('Tiếp').click();
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await button('Tiếp').click();
    await button('Tiếp').click();
    await button('Khởi tạo bản cài').click();
    const admin = srv.ctx.store.all('USERS').find((user) => user.role === 'ADMIN');
    await page.getByLabel('Tên đăng nhập').fill(admin.username);
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(testPassword);
    await page.getByLabel('Nhập lại mật khẩu').fill(testPassword);
    await button('Vào phần mềm').click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const store = srv.ctx.store;
    const catalog = { splitDates: true, plate: '99A-00001', route: store.all('TUYEN_VC')[0].route_code };
    await store.transaction((tx) => tx.insert('XE', {
      ...store.all('XE')[0], plate_no: catalog.plate, plate_key: '99A00001', note: 'Xe tổng hợp dùng để kiểm thử',
    }));
    const sample = await workbook(srv.home, 'Mau-nha-cung-cap.xlsx', catalog);
    const newFile = await workbook(srv.home, 'Phieu-can-doi-thu-tu-cot.xlsx', { ...catalog, order: [7, 4, 2, 6, 1, 5, 0, 3] });
    const changed = await workbook(srv.home, 'Phieu-can-doi-tieu-de.xlsx', { ...catalog, malformed: 'missing', firstTicket: 44 });

    await openSettings();
    await page.getByText('Mặc định: Tự nhận diện', { exact: true }).waitFor();
    await button('Tạo mẫu').click();
    await next(sample);
    await button('Chọn file mẫu').click();
    await page.getByLabel('Sheet', { exact: true }).selectOption('Phiếu nhà cung cấp');
    const row = page.getByLabel('Dòng tiêu đề', { exact: true });
    await row.fill('3');
    await row.press('Tab');
    await page.getByRole('heading', { name: 'Ghép cột', exact: true }).waitFor();
    const titles = page.getByRole('region', { name: 'Xem trước tiêu đề' });
    await titles.getByRole('heading', { name: 'Tiêu đề Excel · Dòng 3' }).waitFor();
    await titles.getByText('A: Số phiếu', { exact: true }).waitFor();
    await titles.getByText('D: Khối lượng hàng', { exact: true }).waitFor();
    await page.getByLabel('Ngày cân 1', { exact: true }).waitFor();
    await page.getByLabel('Giờ cân 1', { exact: true }).waitFor();
    await page.getByLabel('Tên mẫu', { exact: true }).fill('Nhà cung cấp A');
    await button('Đọc thử').click();
    await page.getByText('2 phiếu hợp lệ / 2 dòng · Tổng 3.800 kg', { exact: true }).waitFor();
    await page.getByText(/Dòng 6 · Tổng công bố 3.900 kg.*−100|Dòng 6 · Tổng công bố 3.900 kg.*-100/).waitFor();
    await page.getByText('000042', { exact: true }).waitFor();
    await button('Lưu mẫu').click();
    await page.getByText('Đã lưu mẫu “Nhà cung cấp A”.').waitFor();
    await button('Đặt mẫu này làm mặc định').click();
    await page.getByText('Mặc định: Nhà cung cấp A', { exact: true }).waitFor();
    if (process.env.DGVC_PROFILE_SHOT) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: process.env.DGVC_PROFILE_SHOT, fullPage: true, style: '.toast { visibility: hidden }' });
    }

    await nav('Phiếu cân');
    await next(newFile);
    await button('Import từ Excel').click();
    let preview = dialog('Import phiếu cân — xem trước');
    await preview.getByText('Cách đọc: Nhà cung cấp A', { exact: true }).waitFor();
    const previewTicket = preview.getByRole('row').filter({ has: page.getByRole('cell', { name: '000042', exact: true }) });
    for (const time of ['22/09/2026', '23:50:00', '23/09/2026', '00:30:00']) {
      await previewTicket.getByRole('cell', { name: time, exact: true }).waitFor();
    }
    await preview.getByRole('button', { name: 'Đổi cách đọc' }).click();
    let repair = dialog('Cách đọc file phiếu cân');
    await repair.getByLabel('Mẫu đọc file').selectOption('');
    await repair.getByRole('button', { name: 'Đọc bằng mẫu đã chọn' }).click();
    await repair.getByRole('alert').waitFor();
    assert.equal(await preview.isVisible(), true);
    await repair.getByRole('button', { name: 'Quay lại' }).click();
    await preview.getByLabel('Chấp nhận các dòng cảnh báo', { exact: true }).check();
    await preview.getByRole('button', { name: 'Xác nhận import 2 dòng' }).click();
    await page.locator('.toast', { hasText: 'Đã import 2 dòng' }).waitFor();
    const saved = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '000042', exact: true }) });
    await saved.waitFor();
    assert.deepEqual(await saved.getByRole('cell').allTextContents().then((cells) => cells.slice(0, 5)),
      ['000042', '22/09/2026', '23:50:00', '23/09/2026', '00:30:00']);

    await next(changed);
    await button('Import từ Excel').click();
    repair = dialog('Cách đọc file phiếu cân');
    await repair.getByRole('alert').getByText(/Thiếu tiêu đề “Biển số”/).waitFor();
    await repair.getByRole('button', { name: 'Sửa cách ghép' }).click();
    await repair.getByLabel('Sheet', { exact: true }).selectOption('Phiếu nhà cung cấp');
    const repairRow = repair.getByLabel('Dòng tiêu đề', { exact: true });
    await repairRow.fill('3');
    await repairRow.press('Tab');
    await repair.getByLabel('Biển số', { exact: true }).selectOption('Xe mới');
    await repair.getByRole('button', { name: 'Đọc thử' }).click();
    await repair.getByText('000044', { exact: true }).waitFor();
    await repair.getByRole('button', { name: 'Áp dụng cách ghép' }).click();
    preview = dialog('Import phiếu cân — xem trước');
    await preview.getByText('Cách đọc: Ghép cột tùy chỉnh', { exact: true }).waitFor();
    await preview.getByRole('button', { name: 'Hủy', exact: true }).click();

    await openSettings();
    await button('Dùng Tự nhận diện').click();
    await page.getByText('Mặc định: Tự nhận diện', { exact: true }).waitFor();
    await page.reload();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(testPassword);
    await button('Vào phần mềm').click();
    await openSettings();
    await page.getByText('Mặc định: Tự nhận diện', { exact: true }).waitFor();
    await page.getByRole('cell', { name: 'Nhà cung cấp A', exact: true }).waitFor();
    await button('Sao chép').click();
    await dialog('Sao chép mẫu').getByRole('button', { name: 'Lưu', exact: true }).click();
    const copy = page.getByRole('row', { name: /Nhà cung cấp A \(bản sao\)/ });
    await copy.getByRole('button', { name: 'Xóa', exact: true }).click();
    await dialog('Xóa mẫu nhập').getByRole('button', { name: 'Xóa mẫu', exact: true }).click();
    await copy.waitFor({ state: 'detached' });

    await nav('Phiếu cân');
    await button('Lịch sử nhập').click();
    const history = dialog('Lịch sử nhập phiếu cân');
    await history.getByRole('row', { name: /Đã hủy xem trước/ }).waitFor();
    await history.getByRole('row', { name: /Đã nhập/ }).getByRole('button', { name: 'Xem cấu hình' }).click();
    const detail = page.getByRole('dialog', { name: /Cách đọc đợt/ });
    await detail.getByText(/Nhà cung cấp A · Sheet Phiếu nhà cung cấp · Dòng tiêu đề 3/).waitFor();
    await next(newFile);
    await detail.getByRole('button', { name: 'Đọc lại file gốc' }).click();
    await preview.getByText('Cách đọc: Nhà cung cấp A', { exact: true }).waitFor();
    await preview.getByText(/Theo cấu hình đợt IB/).waitFor();
    await preview.getByRole('cell', { name: '000042', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await srv.close();
    fs.rmSync(srv.home, { recursive: true, force: true });
  }
});
