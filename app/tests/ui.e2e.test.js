'use strict';
/**
 * Bước 15 — kiểm thử GIAO DIỆN bằng trình duyệt thật (Chromium): người dùng bấm từ đầu đến cuối như trên bản cài.
 * Khởi tạo bản cài HAKQN → đặt mật khẩu → import phiếu cân + bảng kê dầu → TÍNH GIÁ → xác nhận → BKVC → thêm tuyến → nhắc sửa các nhà máy khác → sao lưu.
 * Ảnh chụp màn hình lưu ở DGVC_SHOTS (nếu đặt) để xem lại.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tools/dev-server');
const { FILE } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.DGVC_SHOTS || '';

test('Giao diện: đi hết luồng chính trên trình duyệt', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 240000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  let n = 0; const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: false }); } };
  const toast = async (re) => { await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }); };
  const nav = async (label) => { await page.getByRole('button', { name: label, exact: false }).first().click(); await page.waitForTimeout(250); };
  try {
    await page.goto(srv.url);
    // ── khởi tạo: bước 1 thư mục, bước 2 chọn đơn vị HAKQN
    await page.getByText('Bước 1 — Thư mục dữ liệu').waitFor();
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await shot('khoi-tao-1');
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByText('Bước 2 — Đơn vị của bản cài này').waitFor();
    for (const u of ['HAK', 'HAKQN', 'DH', 'CNHAK']) assert.ok(await page.locator('.unit-pick label', { hasText: `${u} —` }).count(), `có đơn vị ${u}`);
    await page.locator('.unit-pick label', { hasText: 'HAKQN —' }).click();
    await shot('khoi-tao-2-chon-don-vi');
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click();
    await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    // ── đăng nhập lần đầu: đặt mật khẩu
    await page.getByLabel('Tên đăng nhập').waitFor();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com');
    await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill('HakGroup2026');
    await page.getByLabel('Nhập lại mật khẩu').fill('HakGroup2026');
    await shot('dang-nhap-lan-dau');
    await page.getByRole('button', { name: 'Vào phần mềm' }).click();
    await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    assert.match(await page.locator('.install').textContent(), /HAKQN/);
    // ── import phiếu cân
    await nav('Phiếu cân');
    await page.getByRole('button', { name: 'Tải file mẫu' }).click();
    await toast(/Đã tạo file mẫu: .*Mau_Import_PhieuCan_HAKQN\.xlsx/);
    await next(FILE.HAKQN);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByText('Import phiếu cân — xem trước').waitFor();
    await shot('import-phieu-can');
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import 326 dòng/);
    await page.locator('tfoot', { hasText: '326 phiếu' }).waitFor();
    await shot('phieu-can');
    // ── import bảng kê dầu hợp đồng HAKQN-QS
    await nav('Giao nhận dầu');
    await next(FILE.HAKQN);
    await page.getByRole('button', { name: 'Import từ Excel' }).click();
    await page.getByText('Import bảng kê dầu — xem trước').waitFor();
    await page.getByLabel('Chấp nhận các dòng cảnh báo').check();
    await page.getByRole('button', { name: /Xác nhận import/ }).click();
    await toast(/Đã import 18 dòng/);
    // ── tính giá
    await nav('Tính giá vận chuyển');
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'Đến ngày' }).locator('input').fill('2026-09-23');
    await page.locator('label.field', { hasText: 'Mã tuyến' }).locator('select').selectOption('VC.007');
    await page.locator('label.field', { hasText: 'Ngày lập BKVC' }).locator('input').fill('2026-09-24');
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await page.locator('.kpi.main .v', { hasText: '178.000' }).waitFor();
    await page.getByRole('button', { name: 'TÍNH GIÁ', exact: true }).click();
    await toast(/Đã tính và lưu kỳ HAKQN-QS\/20260918-20260923-VC.007/);
    await shot('tinh-gia');
    await page.getByTitle('Xem chi tiết tính').first().click();
    await page.getByRole('dialog', { name: 'Xem chi tiết tính' }).waitFor();
    assert.equal(await page.locator('.trace li').count(), 15);
    await shot('chi-tiet-tinh');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Xác nhận kỳ', exact: true }).click();
    await page.getByRole('dialog', { name: 'Xác nhận kỳ' }).getByRole('button', { name: 'Đồng ý' }).click();
    await toast(/Đã xác nhận kỳ/);
    await page.locator('.status-flow .s.on', { hasText: 'Đã xác nhận' }).waitFor();
    // ── bảng xác nhận khối lượng
    await page.getByRole('button', { name: 'Bảng xác nhận KL' }).last().click();
    await page.getByRole('heading', { name: /Bảng xác nhận KL/ }).waitFor();
    await page.locator('.money', { hasText: '1.181.061.043' }).waitFor();
    const frame = page.frameLocator('iframe.preview');
    await frame.getByText('VÕ VĂN PHỤNG').waitFor();
    await frame.getByText('CN CÔNG TY TNHH HOÀNG ANH KHÔI').first().waitFor();
    await shot('bkvc');
    await page.getByRole('button', { name: 'Xuất Excel' }).first().click();
    await toast(/Đã xuất XLSX/);
    await page.getByRole('tab', { name: 'Bảng tính đơn giá' }).click();
    await frame.getByText('BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN DĂM GỖ').waitFor();
    await frame.getByText('178.000 đ/tấn').waitFor();
    await shot('bang-tinh-don-gia');
    await page.getByRole('tab', { name: 'Biên bản giao nhận dầu' }).click();
    await frame.getByText('BIÊN BẢN GIAO NHẬN DẦU DIESEL').waitFor();
    await shot('bien-ban-giao-nhan-dau');
    await page.getByRole('tab', { name: 'Bảng xác nhận khối lượng' }).click();
    await page.getByRole('button', { name: 'Xuất file hóa đơn MISA' }).click();
    await toast(/Đã xuất file hóa đơn MISA/);
    await shot('bkvc-misa');
    // ── báo cáo theo ngày: tổng hợp khối lượng, phiếu cân, giao nhận dầu
    await nav('Báo cáo');
    await page.getByRole('tab', { name: 'Tổng hợp khối lượng' }).click();
    await page.getByRole('tab', { name: 'Tổng hợp khối lượng', selected: true }).waitFor(); await page.waitForTimeout(300);
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-01');
    await page.getByRole('button', { name: 'Xem', exact: true }).click();
    await page.getByText('Cộng CNHAK · CN Quế Sơn').waitFor();
    await shot('tong-hop-khoi-luong');
    await page.getByRole('button', { name: 'Tải Excel' }).click(); await toast(/Đã xuất XLSX/);
    await page.getByRole('tab', { name: 'Phiếu cân' }).click();
    await page.getByRole('tab', { name: 'Phiếu cân', selected: true }).waitFor(); await page.waitForTimeout(300);
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-01');
    await page.getByRole('button', { name: 'Xem', exact: true }).click();
    await page.locator('tfoot', { hasText: '326 phiếu' }).waitFor();
    await page.getByRole('button', { name: 'Tải Excel' }).click(); await toast(/Đã xuất XLSX/);
    await page.getByRole('tab', { name: 'Giao nhận dầu' }).click();
    await page.getByRole('tab', { name: 'Giao nhận dầu', selected: true }).waitFor(); await page.waitForTimeout(300);
    await page.locator('label.field', { hasText: 'Từ ngày' }).locator('input').fill('2026-09-01');
    await page.getByRole('button', { name: 'Xem', exact: true }).click();
    await page.locator('tfoot', { hasText: '18 lần nhận' }).waitFor();
    await shot('giao-nhan-dau-theo-ngay');
    await page.getByRole('button', { name: 'Tải Excel' }).click(); await toast(/Đã xuất XLSX/);
    // ── căn cứ tính giá ký hợp đồng (QR_DATA (2))
    await nav('Căn cứ giá hợp đồng');
    await page.getByRole('heading', { name: 'Căn cứ tính giá ký hợp đồng' }).waitFor();
    await page.locator('tr', { hasText: 'VC.007' }).locator('.money', { hasText: '115.000' }).waitFor();
    assert.equal(await page.getByText('Power Query').count(), 0, 'không còn diễn giải Power Query');
    await shot('can-cu-gia-hop-dong');
    await page.locator('tr', { hasText: 'VC.009' }).first().click();
    await page.getByRole('dialog', { name: /Cách tính ĐG HĐ — VC.009/ }).getByText('= 64.000 đ').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Xuất Excel (có công thức)' }).click();
    await toast(/Đã xuất XLSX/);
    // ── đơn giá: đơn giá tham khảo ghi rõ nguồn
    await nav('Đơn giá');
    await page.getByRole('cell', { name: /TBL_DATA · cột "Đơn Giá \(chưa VAT\)"/ }).first().waitFor();
    await page.getByRole('button', { name: 'Tạo phiên bản giá mới' }).click();
    const pdlg = page.getByRole('dialog', { name: /Phiên bản giá mới/ });
    await pdlg.getByRole('textbox', { name: /^Nguồn đơn giá tham khảo/ }).waitFor();
    assert.match(await pdlg.getByRole('textbox', { name: /^Nguồn đơn giá tham khảo/ }).inputValue(), /TBL_DATA/);
    await pdlg.getByText('ĐG HĐ =').waitFor();
    await shot('don-gia-tham-khao');
    await page.keyboard.press('Escape');
    // ── thêm tuyến → nhắc sửa các nhà máy còn lại
    await nav('Danh mục tuyến');
    await page.getByRole('button', { name: 'Thêm tuyến', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Thêm tuyến vận chuyển' });
    await dlg.getByRole('textbox', { name: /^Mã tuyến/ }).fill('VC.016');
    await dlg.getByRole('textbox', { name: /^Tên tuyến/ }).fill('Xã Quế Sơn - Cảng Chu Lai');
    await dlg.getByRole('spinbutton', { name: /^Cự ly \(km\)/ }).fill('65');
    await dlg.getByRole('textbox', { name: /^Điểm đến/ }).fill('Cảng Chu Lai, Quảng Nam');
    await shot('them-tuyen');
    await dlg.getByRole('button', { name: 'Lưu' }).click();
    await toast(/Nhớ sửa giống ở các nhà máy còn lại: HAK, DH, CNHAK/);
    await page.locator('td', { hasText: 'VC.016' }).first().waitFor();
    await nav('Nhắc sửa danh mục');
    await page.locator('.kpi', { hasText: 'Nhà máy DH' }).waitFor();
    await shot('nhac-sua-danh-muc');
    await page.locator('.kpi', { hasText: 'Nhà máy DH' }).getByRole('button', { name: 'Xuất gói danh mục' }).click();
    await toast(/Đã xuất gói danh mục cho DH/);
    assert.equal(await page.locator('.kpi', { hasText: 'Nhà máy DH' }).count(), 0, 'DH đã nhận gói → hết nhắc');
    // ── tổng quan + sao lưu
    await nav('Tổng quan');
    await page.locator('.kpi', { hasText: 'Đơn giá VC bình quân' }).locator('.v', { hasText: '178.000' }).waitFor();
    await shot('tong-quan');
    await nav('Cài đặt');
    await page.getByRole('button', { name: 'Sao lưu ngay' }).click();
    await toast(/Đã sao lưu/);
    await shot('cai-dat-sao-luu');
    assert.deepEqual(errors, [], `lỗi JavaScript: ${errors.join(' | ')}`);
  } catch (e) { await shot('FAIL'); throw e; } finally { await browser.close(); await srv.close(); }
});
