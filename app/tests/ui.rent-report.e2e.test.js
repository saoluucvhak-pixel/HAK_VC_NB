'use strict';
/** Giao diện: Báo cáo thuê vận chuyển (bảng tổng hợp + dòng tổng + tổng theo đơn vị, bộ lọc thông minh, chi tiết theo xe, Đối chiếu, sửa đơn giá thuê, xuất Excel, bố cục hẹp, vai trò XEM). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { start } = require('../tools/dev-server');

const CHROME = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const SHOTS = process.env.DGVC_SHOTS || '';
const PW = 'HakGroup2026';
const vn = (n, d = 0) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const tk = (no, date, plate, kg) => ({ ticket_no: no, weigh1_date: date, weigh1_time: '08:00:00', plate_no: plate, net_kg: kg, route_code: 'VC.007' });
const fu = (no, date, plate, l) => ({ receipt_no: no, receipt_date: date, plate_no: plate, qty_liter: l });

test('Giao diện: Báo cáo thuê vận chuyển có số liệu', { skip: !CHROME && 'không có Chromium', timeout: 300000 }, async () => {
  const { chromium } = require('playwright-core');
  const srv = await start({ port: 0, quiet: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, locale: 'vi-VN' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const nav = async (label) => { await page.locator('nav button', { hasText: label }).first().click(); await page.waitForTimeout(300); };
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: !/910|820/.test(n) }); } };
  const open = async () => { await nav('Báo cáo thuê vận chuyển'); await page.getByRole('heading', { name: 'Báo cáo thuê vận chuyển', level: 1 }).waitFor(); };
  const toast = async (re) => page.locator('.toast', { hasText: re }).first().waitFor({ timeout: 20000 });
  const shown = async () => { const t = await page.locator('[data-sf-summary]').first().innerText(); const m = t.match(/Hiển thị ([\d.]+) \/ ([\d.]+) dòng/); assert.ok(m, `không thấy dòng kết quả: ${t}`); return { kept: Number(m[1].replace(/\./g, '')), total: Number(m[2].replace(/\./g, '')) }; };
  const noOverflow = async (w, tag) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(o <= 1, `tràn ngang ${o}px ở ${w} (${tag})`); };
  const mainRows = () => page.locator('.rr-main tbody tr');
  try {
    await page.goto(srv.url);
    await page.getByRole('textbox', { name: 'Thư mục dữ liệu' }).fill(path.join(srv.home, 'DGVC_DATA'));
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.locator('.unit-pick label', { hasText: 'DH —' }).click();
    await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Tiếp' }).click(); await page.getByRole('button', { name: 'Khởi tạo bản cài' }).click();
    await page.getByLabel('Tên đăng nhập').fill('phuthuy.apple@gmail.com'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PW); await page.getByLabel('Nhập lại mật khẩu').fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

    // dữ liệu mẫu: 2 đợt của 2 đơn vị (số lẻ để làm tròn theo từng xe có ý nghĩa)
    const sub = srv.ctx.svc.subcontract; const dir = path.join(srv.home, 'rent-e2e'); fs.mkdirSync(dir, { recursive: true });
    const mk = async (name, data, extra) => { const f = path.join(dir, `${name}.json`); fs.writeFileSync(f, JSON.stringify(data)); return sub.importBatch({ filePath: f, user: { username: 'k' }, ...extra }); };
    const A = await mk('a', { tickets: [tk('A-1', '2026-09-18', '92H-00141', 12345), tk('A-2', '2026-09-19', '92H-00141', 23457), tk('A-3', '2026-09-19', '92H-00192', 31111), tk('A-4', '2026-09-20', '43C-999.99', 9999)],
      fuel: [fu('D1', '2026-09-18', '92H-00141', 101.5), fu('D2', '2026-09-19', '92H-00192', 77.25), fu('D3', '2026-09-21', '51D-000.01', 50)] },
    { partnerName: 'CÔNG TY VẬN TẢI TUẤN HƯNG', batchName: 'Đợt tháng 9', rentUnitPrice: 155000, fuelUnitPrice: 19500, deductFuel: true });
    const B = await mk('b', { tickets: [tk('B-1', '2026-10-02', '60C-123.45', 28765), tk('B-2', '2026-10-03', '60C-123.45', 27654), tk('B-3', '2026-10-05', '60C-777.77', 15001)],
      fuel: [fu('E1', '2026-10-02', '60C-123.45', 120.4), fu('E2', '2026-10-05', '60C-777.77', 61.9)] },
    { partnerName: 'CÔNG TY VẬN TẢI ĐẠI PHÁT', batchName: 'Đợt tháng 10', rentUnitPrice: 148500, fuelUnitPrice: 20100, deductFuel: false });
    const exp = sub.report({}); assert.equal(exp.rows.length, 2);

    await open();
    // bảng + dòng tổng + tổng theo đơn vị
    await mainRows().first().waitFor(); assert.equal(await mainRows().count(), 2);
    const rowA = page.locator('.rr-main tbody tr', { hasText: 'Đợt tháng 9' }); const rowB = page.locator('.rr-main tbody tr', { hasText: 'Đợt tháng 10' });
    const ra = exp.rows.find((x) => x.batchId === A.batchId); const rb = exp.rows.find((x) => x.batchId === B.batchId);
    for (const [row, r] of [[rowA, ra], [rowB, rb]]) {
      const t = await row.innerText();
      for (const v of [vn(r.ticketCount), vn(r.totalTon, 2), vn(r.rentAmount), vn(r.payable)]) assert.ok(t.includes(v), `dòng ${r.batchName} thiếu ${v}: ${t}`);
    }
    await rowA.getByText('CÔNG TY VẬN TẢI TUẤN HƯNG').first().waitFor();
    const foot = await page.locator('.rr-main tfoot').innerText();
    for (const v of ['TỔNG CỘNG', vn(exp.totals.ticketCount), vn(exp.totals.totalTon, 2), vn(exp.totals.rentAmount), vn(exp.totals.deductFuelAmount), vn(exp.totals.payable)]) assert.ok(foot.includes(v), `dòng tổng thiếu ${v}: ${foot}`);
    const byp = await page.locator('.rr-byp').innerText();
    assert.ok(byp.toLowerCase().includes('tổng theo đơn vị vận chuyển') && byp.includes('CÔNG TY VẬN TẢI ĐẠI PHÁT') && byp.includes(vn(exp.totals.payable)), byp);
    assert.equal(await page.locator('.rr-byp tbody tr').count(), 2);
    // hướng dẫn bước 3 theo chữ mới, không còn "đang hoàn thiện"
    const g = page.getByRole('region', { name: 'Hướng dẫn 3 bước' });
    await g.getByText('xem tổng hợp tiền thuê ở bảng bên dưới — không cần tạo kỳ tính giá').waitFor();
    assert.equal(await g.getByText('đang hoàn thiện').count(), 0);
    await shot('rent-report-1366');

    // bộ lọc: tìm không dấu · khoảng ngày · nhớ lần trước · đặt lại
    assert.deepEqual(await shown(), { kept: 2, total: 2 });
    await page.locator('[data-sf-q]').first().fill('dai phat'); await page.waitForTimeout(700);
    assert.equal(await mainRows().count(), 1); await rowB.waitFor(); assert.deepEqual(await shown(), { kept: 1, total: 2 });
    assert.ok((await page.locator('.rr-main tfoot').innerText()).includes(vn(rb.payable)));
    await nav('Phiếu cân'); await open(); assert.equal(await mainRows().count(), 1, 'nhớ bộ lọc lần trước');
    await page.locator('[data-sf-reset]').first().click(); await page.waitForTimeout(700); assert.equal(await mainRows().count(), 2);
    await page.locator('[data-sf-tu]').first().fill('2026-10-01'); await page.waitForTimeout(700);
    assert.equal(await mainRows().count(), 1); await rowB.waitFor();
    await page.locator('[data-sf-reset]').first().click(); await page.waitForTimeout(700);
    await page.getByRole('button', { name: '30 ngày' }).click(); await page.waitForTimeout(700); // 30 ngày gần nhất tính theo giờ máy: không có đợt nào → bảng nói rõ
    assert.equal(await mainRows().count(), 1); await page.locator('.rr-main tbody td.empty').waitFor();
    await page.locator('[data-sf-reset]').first().click(); await page.waitForTimeout(700); assert.equal(await mainRows().count(), 2);

    // bấm dòng → chi tiết theo xe, cộng đúng
    await rowA.click();
    const det = page.getByRole('region', { name: 'Chi tiết đợt Đợt tháng 9' }); await det.waitFor();
    assert.equal(await det.locator('.tbl-wrap').first().locator('tbody tr').count(), 3);
    const dt = await det.innerText();
    for (const v of ['92H-00141', '92H-00192', '43C-999.99', vn(ra.rentAmount), vn(ra.payable), vn(ra.totalTon, 2), 'Xe chỉ có dầu, không có chuyến nào', '51D-000.01']) assert.ok(dt.includes(v), `chi tiết thiếu ${v}`);
    assert.ok(dt.includes('Đơn giá thuê 155.000 đ/tấn'));
    await shot('rent-report-chi-tiet-1366');

    // sửa đơn giá thuê: lý do bắt buộc, số sai bị chặn, lưu → số tiền đổi đúng
    await det.getByRole('button', { name: 'Sửa đơn giá thuê / giá dầu' }).click();
    const dlg = page.getByRole('dialog', { name: /Sửa đơn giá thuê/ });
    await dlg.getByLabel(/Đơn giá thuê/).fill('160.000'); await dlg.getByRole('button', { name: 'Lưu' }).click(); await toast(/Phải nhập lý do/);
    await dlg.getByLabel(/Đơn giá thuê/).fill('abc'); await dlg.getByLabel(/Lý do/).fill('thử'); await dlg.getByRole('button', { name: 'Lưu' }).click(); await toast(/không hợp lệ/);
    await dlg.getByLabel(/Đơn giá thuê/).fill('160.000'); await dlg.getByLabel(/Lý do/).fill('Đơn vị báo giá mới'); await dlg.getByRole('button', { name: 'Lưu' }).click(); await toast(/Đã lưu đơn giá mới/);
    await dlg.waitFor({ state: 'detached' });
    const exp2 = sub.report({}); const ra2 = exp2.rows.find((x) => x.batchId === A.batchId);
    assert.equal(ra2.rentUnitPrice, 160000); assert.notEqual(ra2.rentAmount, ra.rentAmount);
    assert.equal(ra2.rentAmount, Math.round(35.802 * 160000) + Math.round(31.111 * 160000) + Math.round(9.999 * 160000));
    await page.waitForFunction((v) => document.querySelector('.rr-main tbody').innerText.includes(v), vn(ra2.rentAmount));
    assert.ok((await page.locator('.rr-main tfoot').innerText()).includes(vn(exp2.totals.rentAmount)));
    assert.ok((await det.innerText()).includes('Đơn giá thuê 160.000 đ/tấn') && (await det.innerText()).includes(vn(ra2.payable)));
    assert.ok(srv.ctx.store.all('AUDIT_LOG').some((x) => x.action === 'UPDATE_SUBCONTRACT_TERMS' && JSON.stringify(x).includes('Đơn vị báo giá mới')), 'có nhật ký sửa đơn giá');

    // nút Đối chiếu → Đối chiếu dữ liệu với đúng đợt
    await det.getByRole('button', { name: 'Đối chiếu', exact: true }).click();
    await page.getByRole('tab', { name: 'Đối chiếu 3 tiêu chí', selected: true }).waitFor();
    await page.waitForFunction((id) => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === id)); return s && s.value === id; }, A.batchId, { timeout: 15000 });
    await open();

    // xuất Excel: đọc lại đúng dòng và tổng
    await page.getByRole('button', { name: 'Xuất Excel' }).click(); await toast(/Đã xuất Excel:/);
    const file = (await page.locator('.toast', { hasText: /Đã xuất Excel:/ }).first().innerText()).replace(/^.*Đã xuất Excel:\s*/s, '').trim();
    assert.ok(fs.existsSync(file), `không thấy file ${file}`);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Tong hop'); assert.ok(ws);
    assert.equal(ws.getRow(4).getCell(2).value, 'Đơn vị vận chuyển'); assert.equal(ws.getRow(4).getCell(12).value, 'Tiền thuê'); assert.equal(ws.getRow(4).getCell(14).value, 'Thực trả');
    const got = [ws.getRow(5), ws.getRow(6)].map((r) => ({ name: r.getCell(3).value, rent: r.getCell(12).value, pay: r.getCell(14).value }));
    for (const r of exp2.rows) assert.ok(got.some((x) => x.name === r.batchName && x.rent === r.rentAmount && x.pay === r.payable), `Excel thiếu dòng ${r.batchName}`);
    assert.equal(ws.getRow(7).getCell(2).value, 'TỔNG CỘNG'); assert.equal(ws.getRow(7).getCell(12).value, exp2.totals.rentAmount); assert.equal(ws.getRow(7).getCell(14).value, exp2.totals.payable);
    assert.equal(ws.getRow(5).getCell(12).numFmt, '#,##0');

    // bố cục hẹp: không tràn ngang (bảng + chi tiết đang mở)
    await open(); await mainRows().first().waitFor(); await page.locator('.rr-main tbody tr', { hasText: 'Đợt tháng 9' }).click(); await det.waitFor();
    for (const w of [1366, 1093, 910, 820]) {
      await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(300); await noOverflow(w, 'bảng + chi tiết');
      for (const sel of ['.rr-main .tbl-wrap', '.rr-byp .tbl-wrap', '.rr-detail .tbl-wrap']) { const o = await page.evaluate((q) => { const e = document.querySelector(q); return e.scrollWidth - e.clientWidth; }, sel); assert.ok(o <= 1, `${sel} bị cắt ${o}px ở ${w}`); }
      if (w === 910) { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.remove(); document.querySelector('.rr-main').scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }); await shot('rent-report-910'); }
    }
    await page.setViewportSize({ width: 1366, height: 800 });

    // vai trò XEM: xem được số liệu và xuất, không thấy nút sửa
    const xem = await page.evaluate(() => window.DGVC.api('users.save', { record: { username: 'xem.vc', fullName: 'Người xem', role: 'XEM', unitCode: 'DH' } }));
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByLabel('Tên đăng nhập').fill('xem.vc'); await page.getByText('Đặt mật khẩu lần đầu').waitFor();
    await page.getByLabel('Mã kích hoạt').fill(xem.setupCode);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PW); await page.getByLabel('Nhập lại mật khẩu').fill(PW);
    await page.getByRole('button', { name: 'Vào phần mềm' }).click(); await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
    await open(); await mainRows().first().waitFor(); assert.equal(await mainRows().count(), 2);
    await page.locator('.rr-main tbody tr', { hasText: 'Đợt tháng 9' }).click(); await page.getByRole('region', { name: 'Chi tiết đợt Đợt tháng 9' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Sửa đơn giá/ }).count(), 0, 'XEM không thấy nút sửa đơn giá');
    assert.equal(await page.getByRole('button', { name: /Tải file mẫu/ }).count(), 0);
    await page.getByRole('button', { name: 'Đối chiếu', exact: true }).waitFor(); await page.getByRole('button', { name: 'Xuất Excel' }).waitFor();
    const denied = await page.evaluate(() => window.DGVC.api('subcontract.updateTerms', { batchId: 'x', rentUnitPrice: 1, reason: 'x' }, { quiet: true }).then(() => 'ok', (e) => e.code));
    assert.equal(denied, 'FORBIDDEN');
    assert.deepEqual(errors, [], `lỗi JS: ${errors.join(' | ')}`);
  } finally { await browser.close(); await srv.close(); }
});
