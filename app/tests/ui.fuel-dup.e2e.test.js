'use strict';
/**
 * Giao diện — bản cài ĐH: dòng dầu nghi nhập trùng (18/09, 92H-00192, 400 lít × 2).
 * Tính giá thấy cảnh báo → bấm "Bỏ khỏi kỳ" → 96.900 (đúng hóa đơn 1C26TYY) → TÍNH GIÁ lưu kỳ → mở lại kỳ vẫn giữ dòng đã bỏ → "Đưa lại vào kỳ" → 88.900.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện ĐH: bỏ dòng dầu trùng khỏi kỳ bằng 1 nút, lưu theo kỳ, đưa lại được', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  let n = 0; const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `dh-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: false }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.getByRole('button', { name: label, exact: false }).first().click(); await page.waitForTimeout(250); };
  const price = (v) => page.locator('.kpi.main .v', { hasText: v }).waitFor();
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
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.locator('label.field', { hasText: 'Ngày lập BKVC' }).locator('input').fill('2026-09-25');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await price('88.900');
    const dupRow = page.locator('.issues li', { hasText: 'nghi nhập trùng' }).filter({ hasText: '92H-00192' }).last();
    await dupRow.waitFor();
    await shot('canh-bao-dau-trung');
    await dupRow.getByRole('button', { name: 'Bỏ khỏi kỳ' }).click();
    await price('96.900');
    const exRow = page.locator('.issues li', { hasText: 'Đã bỏ dòng dầu' });
    await exRow.waitFor();
    assert.equal(await page.locator('.issues li', { hasText: 'nghi nhập trùng' }).filter({ hasText: '92H-00192' }).count(), 0, 'bỏ 1 dòng thì dòng còn lại hết cảnh báo');
    await exRow.scrollIntoViewIfNeeded(); await shot('da-bo-dong-trung');
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ/);
    await price('96.900');
    // mở lại kỳ từ danh sách → vẫn giữ dòng đã bỏ
    await nav('Báo cáo');
    await page.locator('tbody tr', { hasText: '96.900' }).first().click();
    await page.getByRole('heading', { name: 'Tính giá vận chuyển' }).waitFor();
    await price('96.900');
    await page.locator('.issues li', { hasText: 'Đã bỏ dòng dầu' }).waitFor();
    await shot('mo-lai-ky');
    // đưa lại vào kỳ → 88.900 (chưa lưu) 
    await page.locator('.issues li', { hasText: 'Đã bỏ dòng dầu' }).getByRole('button', { name: 'Đưa lại vào kỳ' }).click();
    await price('88.900');
    await page.getByText('Đã thay đổi dầu của kỳ').waitFor();
    // thuế suất GTGT chọn được theo kỳ
    await page.locator('.kpi', { hasText: 'Thuế suất GTGT' }).locator('.v', { hasText: '8%' }).waitFor();
    await page.locator('label.field', { hasText: 'Thuế suất GTGT' }).locator('select').selectOption({ label: '10%' });
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await page.locator('.kpi', { hasText: 'Thuế suất GTGT' }).locator('.v', { hasText: '10%' }).waitFor();
    await shot('chon-thue-suat');
    // kỳ không có dầu: hủy kỳ nháp 18–23; kỳ 18–20 dùng hết bảng kê → kỳ 21–23 báo lỗi → "Tính với dầu = 0"
    await nav('Báo cáo');
    await page.locator('tbody tr', { hasText: '96.900' }).first().click();
    await page.getByRole('heading', { name: 'Tính giá vận chuyển' }).waitFor();
    await page.getByRole('button', { name: 'Hủy kỳ', exact: true }).click();
    const hk = page.getByRole('dialog', { name: 'Hủy kỳ nháp' });
    await hk.getByRole('textbox', { name: 'Lý do' }).fill('tách kỳ để thử');
    await hk.getByRole('button', { name: 'Đồng ý' }).click();
    await page.waitForTimeout(400);
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-20');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ .*20260918-20260920/);
    await page.getByRole('button', { name: 'Xác nhận kỳ', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xác nhận kỳ' }).getByRole('button', { name: 'Đồng ý' }).click();
    await toast(/Đã xác nhận kỳ/);
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-21');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    const nf = page.locator('.issues li', { hasText: 'không có dầu thực nhận' });
    await nf.waitFor();
    await shot('ky-khong-co-dau');
    await nf.getByRole('button', { name: 'Tính với dầu = 0' }).click();
    const dlg = page.getByRole('dialog', { name: /Tính với dầu = 0/ });
    assert.ok(Number(await dlg.getByRole('spinbutton').inputValue()) > 0, 'gợi ý đơn giá dầu');
    await dlg.getByRole('button', { name: 'Lưu' }).click();
    await page.locator('.issues li', { hasText: 'tính với dầu thực nhận = 0' }).waitFor();
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ .*20260921-20260923/);
    await shot('ky-khong-co-dau-da-tinh');
    assert.deepEqual(errors, [], `lỗi JavaScript: ${errors.join(' | ')}`);
  } finally { await browser.close(); await srv.close(); }
});
