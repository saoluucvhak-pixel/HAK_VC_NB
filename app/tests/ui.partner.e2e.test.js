'use strict';
/**
 * Giao diện — luồng đối tác sau khi GỘP menu (bản cài ĐH):
 *  - Đối chiếu dữ liệu: 3 thẻ (Kiểm tra nội bộ · Đối chiếu 3 tiêu chí · Các đợt đã nạp), nút "Tải file mẫu Excel" (phiếu cân + dầu) hiện và tải được;
 *  - Excel DẦU của đối tác đọc được ở màn đối chiếu; lưu thành đợt; nạp lại cùng file → hỏi xác nhận (chống nạp trùng); xóa đợt;
 *  - Trao đổi dữ liệu: Nhập gói nhận cả .json, xuất gói Phiếu cân kèm dầu rồi Lịch sử có dòng XUẤT, sau nhập có nút "Mở đối chiếu";
 *  - vai trò XEM: không thấy nút ghi (tải mẫu, lưu thành đợt, xóa đợt).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { start } = require('../tools/dev-server');
const { FILE, CONTRACT, rid } = require('./install');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/opt/pw-browsers/chromium');
const SHOTS = process.env.DGVC_SHOTS || '';
const PW = 'HakGroup2026';
const D = (s) => new Date(`${s}T00:00:00Z`);

test('Giao diện ĐH: Đối chiếu với đối tác — file mẫu, Excel dầu, lưu đợt chống trùng, Trao đổi gộp, vai trò XEM', { skip: !fs.existsSync(CHROME) && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-ui-partner-'));
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const next = (p) => fetch(`${srv.url}/dev/next`, { method: 'POST', body: JSON.stringify({ path: p }) });
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
  const toast = async (re) => (await page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 }), page.locator('.toast', { hasText: re }).first().innerText());
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const login = async (u) => {
    await page.getByLabel('Tên đăng nhập').fill(u); await page.getByLabel('Mật khẩu', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  };
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PW); await page.getByLabel('Nhập lại mật khẩu').fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    const ctx = srv.ctx; const imp = ctx.svc.import;
    const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    const b = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.DH, filePath: FILE.DH, user: 'k' }); await imp.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
    const store = ctx.store;
    const fuel = store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.contract_id === CONTRACT.DH && r.receive_date >= '2026-09-18' && r.receive_date <= '2026-09-23').slice(0, 3);
    assert.equal(fuel.length, 3, 'dữ liệu mẫu có dầu');

    // ── Đối chiếu dữ liệu: 3 thẻ + nút tải file mẫu
    await nav('Đối chiếu dữ liệu'); await page.getByRole('heading', { name: 'Đối chiếu dữ liệu' }).first().waitFor();
    for (const t of ['Kiểm tra nội bộ', 'Đối chiếu 3 tiêu chí', 'Các đợt đã nạp']) await page.getByRole('tab', { name: t }).waitFor();
    await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí' }).click(); await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí', selected: true }).waitFor();
    await page.getByRole('button', { name: 'Chọn file…' }).waitFor();
    await page.getByText('Dầu: dùng mẫu Excel dầu / .json / .dgvc').waitFor();
    await shot('doi-chieu-3-tieu-chi-1366');
    await page.getByRole('button', { name: /Tải file mẫu Excel — phiếu cân/ }).click();
    const t1 = await toast(/Đã tạo file mẫu:/); const f1 = /file mẫu: (.+?) — nhập/.exec(t1)[1];
    assert.ok(fs.existsSync(f1), `file mẫu phiếu cân có thật: ${f1}`); assert.ok((await new ExcelJS.Workbook().xlsx.readFile(f1)).getWorksheet('NL_VC'));
    await page.getByRole('button', { name: /Tải file mẫu Excel — dầu/ }).click();
    const t2 = await toast(/sheet NL_GIAONHANDAU/); const f2 = /file mẫu: (.+?) — nhập/.exec(t2)[1];
    assert.ok(fs.existsSync(f2), `file mẫu dầu có thật: ${f2}`); assert.ok((await new ExcelJS.Workbook().xlsx.readFile(f2)).getWorksheet('NL_GIAONHANDAU'));

    // ── Excel DẦU của đối tác (điền theo mẫu vừa tải) đọc được ở màn đối chiếu: 3 dòng khớp
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f2); const ws = wb.getWorksheet('NL_GIAONHANDAU');
    fuel.forEach((r, i) => [D(r.receive_date), r.route_code, r.plate_no, 'Lít', r.qty_liter, r.fuel_price_excl_vat, null, r.giver_unit_code].forEach((x, j) => { if (x !== null) ws.getCell(6 + i, j + 1).value = x; }));
    const dau = path.join(tmp, 'dau_doi_tac.xlsx'); await wb.xlsx.writeFile(dau);
    await next(dau); await page.getByRole('button', { name: 'Chọn file…' }).click();
    await page.getByRole('tab', { name: 'Chi tiết dầu nhận' }).click();
    await page.locator('tbody tr', { hasText: 'Khớp' }).first().waitFor();
    assert.equal(await page.locator('tbody tr .tag', { hasText: 'Khớp' }).count() >= 3, true, 'Excel dầu: đủ 3 dòng khớp');
    await shot('doi-chieu-excel-dau');

    // ── Lưu thành đợt; nạp lại cùng file → hỏi xác nhận (Hủy → vẫn 1 đợt; Vẫn nạp thêm → 2 đợt)
    const saveBatch = async (name) => {
      await page.getByRole('button', { name: 'Lưu thành đợt…' }).click();
      await page.locator('.modal').getByText('Lưu thành đợt để đối chiếu lại').waitFor();
      await page.locator('.modal label.field', { hasText: 'Tên đợt' }).locator('input').fill(name);
      await page.locator('.modal').getByRole('button', { name: 'Lưu đợt' }).click();
    };
    await saveBatch('Dầu đối tác 1'); await toast(/Đã lưu đợt Dầu đối tác 1/);
    assert.equal(ctx.svc.subcontract.list().length, 1);
    await next(dau); await page.getByRole('button', { name: 'Chọn file…' }).click(); await page.waitForTimeout(1500); // chờ kết quả mới thay kết quả cũ
    await page.getByRole('tab', { name: 'Chi tiết dầu nhận' }).click(); await page.locator('tbody tr', { hasText: 'Khớp' }).first().waitFor();
    await saveBatch('Dầu đối tác 2'); await page.locator('.modal', { hasText: 'File đã nạp trước đó' }).waitFor();
    await page.locator('.modal', { hasText: 'File đã nạp trước đó' }).getByRole('button', { name: 'Hủy' }).click(); await page.waitForTimeout(300);
    assert.equal(ctx.svc.subcontract.list().length, 1, 'Hủy → không nạp thêm');
    await page.locator('.modal').getByRole('button', { name: 'Lưu đợt' }).click();
    await page.locator('.modal', { hasText: 'File đã nạp trước đó' }).getByRole('button', { name: 'Vẫn nạp thêm' }).click();
    await toast(/Đã lưu đợt Dầu đối tác 2/); assert.equal(ctx.svc.subcontract.list().length, 2, 'xác nhận → nạp thêm');

    // ── Các đợt đã nạp: nhãn "chỉ là bản sao", đối chiếu theo đợt cho ra cùng dầu, xóa đợt
    await page.getByRole('tab', { name: 'Các đợt đã nạp' }).click();
    // chờ đúng màn MỚI (tab được chọn) — chữ "không vào kỳ" và các bảng ở màn trước vẫn còn trên trang trong lúc chuyển màn nên không dùng làm mốc
    await page.getByRole('tab', { name: 'Các đợt đã nạp', selected: true }).waitFor(); await page.getByText(/không vào kỳ/).first().waitFor();
    // bảng nạp bất đồng bộ và có thể dựng lại giữa chừng: chờ tới khi thật sự đủ 2 dòng (không chờ "≥ 2 dòng" của bảng cũ) rồi mới khẳng định
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2, null, { timeout: 15000 });
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.locator('tbody tr', { hasText: 'Dầu đối tác 1' }).getByRole('button', { name: 'Đối chiếu' }).click();
    await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí', selected: true }).waitFor();
    await page.getByRole('tab', { name: 'Chi tiết dầu nhận' }).click(); await page.locator('tbody tr', { hasText: 'Khớp' }).first().waitFor();
    await page.getByRole('tab', { name: 'Các đợt đã nạp' }).click();
    await page.locator('tbody tr', { hasText: 'Dầu đối tác 2' }).getByRole('button', { name: 'Xóa' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Xóa đợt' }).click(); await toast(/Đã xóa đợt/);
    assert.equal(ctx.svc.subcontract.list().length, 1);

    // ── Trao đổi dữ liệu: xuất gói Phiếu cân kèm dầu → Lịch sử có dòng XUẤT; nhập gói nhận .json
    await nav('Trao đổi dữ liệu'); await page.getByRole('heading', { name: 'Trao đổi dữ liệu' }).first().waitFor();
    await page.getByRole('tab', { name: 'Xuất gói' }).click();
    await page.locator('label.field', { hasText: 'Loại gói' }).locator('select').selectOption('PHIEU_CAN');
    await page.locator('label.field', { hasText: 'Phiếu cân từ ngày' }).locator('input').fill('2026-09-18');
    await page.locator('label.field', { hasText: 'đến ngày' }).locator('input').fill('2026-09-23');
    await shot('trao-doi-xuat-goi-1366');
    await page.getByRole('button', { name: 'Xuất gói', exact: true }).click(); await toast(/Đã xuất gói/);
    await page.getByRole('tab', { name: 'Lịch sử gói', selected: true }).waitFor();
    await page.locator('tbody tr', { hasText: 'EXPORT' }).locator('td', { hasText: '"GIAO_NHAN_DAU"' }).first().waitFor(); // gói xuất có dầu
    await page.getByRole('tab', { name: 'Nhập gói' }).click();
    await page.getByText('Đối tác gửi gì → làm gì?').waitFor();
    await shot('trao-doi-nhap-goi-1366');

    // ── vai trò XEM: không có nút ghi
    const auth = ctx.svc.auth; const A = { username: 'phuthuy.apple@gmail.com' };
    const r = await auth.saveUser({ record: { username: 'xem.dh', role: 'XEM', unitCode: 'DH' }, create: true, user: A });
    await auth.setFirstPassword({ username: 'xem.dh', newPassword: PW, setupCode: r.setupCode });
    await page.getByRole('button', { name: 'Đăng xuất' }).click(); await page.getByLabel('Tên đăng nhập').waitFor();
    await login('xem.dh');
    await nav('Đối chiếu dữ liệu'); await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí' }).click(); await page.getByRole('button', { name: 'Chọn file…' }).waitFor();
    for (const n of [/Tải file mẫu Excel/, 'Lưu thành đợt…']) assert.equal(await page.getByRole('button', { name: n }).count(), 0, `XEM không thấy nút ${n}`);
    await page.getByRole('tab', { name: 'Các đợt đã nạp' }).click(); await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xóa', exact: true }).count(), 0, 'XEM không thấy nút Xóa đợt');
    assert.ok(await page.getByRole('button', { name: 'Đối chiếu', exact: true }).count() >= 1, 'XEM vẫn đối chiếu được (chỉ đọc)');
    assert.deepEqual(errors, []);
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'partner-FAIL.png') }).catch(() => {});
    throw e;
  } finally { await browser.close(); await srv.close(); }
});
