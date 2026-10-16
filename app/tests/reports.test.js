'use strict';
/**
 * Bước 12 — báo cáo từ kỳ đã lưu: BKVC (bảng xác nhận khối lượng), BKCT (bảng kê chi tiết phiếu cân), bảng tính đơn giá.
 * Xuất XLSX / CSV / PDF rồi ĐỌC LẠI file để kiểm; đối chiếu từng dòng với sheet BKVC của file Excel gốc.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const { ReportService } = require('../main/reports/ReportService');
const { chromiumPdfRenderer } = require('../main/reports/pdf');
const E = require('../main/engine');
const { install, FILE, KETOAN, rid } = require('./install');
const { fixture } = require('./helpers');

const EXCEL = fixture('excel_expected.json');
const FULL = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const HAS_PDF = fs.existsSync(CHROME) && (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc12-out-'));
const cellText = (c) => { const v = c.value; if (v && v.richText) return v.richText.map((t) => t.text).join(''); if (v && v.result !== undefined) return v.result; return v; };

async function period(inst, { confirm = false } = {}) {
  const ctx = await install(inst);
  const r = await ctx.periods.calculate({ contractId: ctx.contractId, ...FULL, reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
  if (confirm) await ctx.periods.confirm({ periodId: r.period.period_id, user: KETOAN });
  return { ...ctx, pid: r.period.period_id, calc: r };
}

/** Sheet BKVC trong file Excel gốc (chỉ file HAKQN-QS có sheet này). */
async function excelBkvc() {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(FILE.HAKQN);
  const ws = wb.getWorksheet('BKVC'); const lines = [];
  for (let r = 7; ; r++) {
    const v = (c) => cellText(ws.getRow(r).getCell(c));
    if (typeof v(1) !== 'number') return { lines, total: ws.getRow(r) };
    lines.push({ plate: v(2), trips: v(3), kg: v(4), price: v(6), amount: v(7), vat: v(8), total: v(9) });
  }
}

test('BKVC (HAKQN → CNHAK): số liệu, bằng chữ, người ký; từng xe khớp sheet BKVC của Excel', async () => {
  const { store, pid } = await period('HAKQN');
  const d = new ReportService(store).bkvc({ periodId: pid });
  assert.equal(d.lines.length, 17);
  assert.deepEqual({ ...d.totals }, { trips: 326, kg: 6143680, amount: 1093575040, vat: 87486003, total: 1181061043, ton: 6143.68 });
  assert.equal(d.amountInWords, 'Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng y ./.');
  assert.equal(d.amountInWords, E.numberToVietnameseWords(1181061043, { thousand: 'ngàn', suffix: 'đồng y ./.' }));
  assert.equal(d.header.title, 'BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM');
  assert.equal(d.header.periodText, '( Vận chuyển từ ngày 18/09/2026 đến ngày 23/09/2026 )');
  assert.equal(d.header.placeDate, 'Quế Sơn Trung, ngày 24 tháng 09 năm 2026');
  assert.equal(d.header.vatPct, 8); assert.equal(d.header.status, 'NHAP');
  assert.equal(d.signers.carrier.unitCode, 'HAKQN'); assert.equal(d.signers.customer.unitCode, 'CNHAK');
  assert.deepEqual(d.signers.carrier.signer, { name: 'VÕ VĂN PHỤNG', title: 'Giám đốc' });
  assert.deepEqual(d.signers.customer.signer, { name: 'VÕ THỊ NHƯ NGỌC', title: 'Phó Giám đốc' });

  // so từng xe với sheet BKVC gốc (thứ tự dòng khác: app xếp theo biển số, Excel theo thứ tự nhập tay)
  const x = await excelBkvc();
  assert.equal(x.lines.length, 17);
  const mine = new Map(d.lines.map((l) => [l.plate_no, l]));
  for (const e of x.lines) {
    const l = mine.get(e.plate); assert.ok(l, `thiếu xe ${e.plate}`);
    assert.equal(l.trip_count, e.trips, e.plate); assert.equal(l.kg, e.kg, e.plate); assert.equal(l.unit_price, e.price, e.plate);
    assert.equal(l.amount, Math.round(e.amount), e.plate);                     // 92H-00903: Excel 64.585.519,99999999 (sai số dấu phẩy động)
    assert.equal(l.vat, E.roundDigits(e.vat, 0, 'HALF_UP'), e.plate);          // app làm tròn VAT tới đồng; Excel để lẻ
    assert.equal(l.amount_incl_vat, l.amount + l.vat, e.plate);
    assert.ok(Math.abs(l.amount_incl_vat - e.total) < 1, e.plate);
  }
  // tổng: Excel 1.181.061.043,2 — app 1.181.061.043 (tổng các dòng đã làm tròn đồng) → chênh 0,2đ, đã ghi nhận
  const xt = cellText(x.total.getCell(9));
  assert.ok(Math.abs(xt - d.totals.total - 0.2) < 1e-6, `Excel ${xt}`);
  assert.equal(cellText(x.total.getCell(7)), d.totals.amount);
  store.close();
});

test('BKVC các hợp đồng thầu phụ: người ký theo thứ tự ưu tiên đơn vị', async () => {
  for (const [inst, carrier, customer] of [['DH', 'DH', 'HAKQN'], ['HAK', 'HAK', 'HAKQN']]) {
    const { store, pid, calc } = await period(inst);
    const d = new ReportService(store).bkvc({ periodId: pid });
    assert.equal(d.signers.carrier.unitCode, carrier); assert.equal(d.signers.customer.unitCode, customer);
    // HAK (ưu tiên 1) > HAKQN (2) > DH (3): bên ưu tiên cao hơn ký Giám đốc
    const phung = inst === 'HAK' ? d.signers.carrier : d.signers.customer;
    const ngoc = inst === 'HAK' ? d.signers.customer : d.signers.carrier;
    assert.equal(phung.signer.name, 'VÕ VĂN PHỤNG'); assert.equal(ngoc.signer.name, 'VÕ THỊ NHƯ NGỌC');
    assert.ok(d.lines.every((l) => l.unit_price === EXCEL[inst]['Đơn giá vận chuyển']));
    assert.equal(d.totals.trips, EXCEL[inst]['Số chuyến']);
    assert.equal(d.totals.total, calc.bkvc.totals.amountInclVat ?? d.totals.total);
    assert.equal(d.totals.total, d.lines.reduce((a, l) => a + l.amount + l.vat, 0));
    store.close();
  }
});

test('Bảng tính đơn giá + bảng kê chi tiết lấy từ kỳ đã lưu', async () => {
  const { store, pid } = await period('HAKQN');
  const rs = new ReportService(store);
  const pr = rs.pricing({ periodId: pid });
  assert.equal(pr.columns.length, 17); assert.equal(pr.rows.length, 1);
  const r = pr.rows[0]; const x = EXCEL.HAKQN;
  assert.equal(r.route_code, 'VC.007'); assert.equal(r.trip_distance_km, x['Cự ly tuyến']);
  assert.equal(r.start_date, x['Ngày bắt đầu']); assert.equal(r.end_date, x['Ngày kết thúc']); assert.equal(r.fuel_import_date, x['Ngày nhập dầu']);
  assert.equal(r.contract_price, x['Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu)']); assert.equal(r.trip_count, x['Số chuyến']);
  assert.equal(r.total_ton, x['Tổng KL (Tấn)']); assert.equal(r.actual_fuel_liter, x['Dầu Diezel thực nhận']);
  assert.ok(Math.abs(r.standard_fuel_liter - x['Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)']) < 1e-9);
  assert.ok(Math.abs(r.fuel_diff_liter - x['CL Tiêu hao Diezel ']) < 1e-9);
  assert.equal(r.fuel_price, x['Đơn giá dầu']); assert.equal(r.fuel_adjust_price, x['Đơn giá CL Diezel']); assert.equal(r.transport_price, x['Đơn giá vận chuyển']);

  const ct = rs.bkct({ periodId: pid });
  assert.equal(ct.columns.length, 15); assert.ok(!ct.columns.some((c) => c.key === 'customer'), 'bỏ cột Khách hàng'); assert.equal(ct.rows.length, 326);
  assert.deepEqual(ct.totals, { trips: 326, kg: 6143680 });
  assert.deepEqual(ct.rows.map((t) => t.stt), Array.from({ length: 326 }, (_, i) => i + 1));
  for (let i = 1; i < ct.rows.length; i++) assert.ok(ct.rows[i - 1].weigh1_date + ct.rows[i - 1].weigh1_time <= ct.rows[i].weigh1_date + ct.rows[i].weigh1_time);
  const one = rs.bkct({ periodId: pid, plateNo: '92H-00903' });
  const bl = store.find('BKVC_LINE', (l) => l.period_id === pid && l.is_current && l.plate_no === '92H-00903')[0];
  assert.equal(one.rows.length, bl.trip_count); assert.equal(one.totals.kg, bl.kg);   // truy vết: dòng BKVC ↔ phiếu cân
  assert.equal(rs.bkct({ periodId: pid, q: ct.rows[0].ticket_no }).rows.some((t) => t.ticket_id === ct.rows[0].ticket_id), true);
  assert.throws(() => rs.bkvc({ periodId: 'KY-KHONG-CO' }), (e) => e.code === 'NOT_FOUND');
  store.close();
});

test('Xuất Excel BKVC đúng mẫu — mở lại file kiểm từng ô', async () => {
  const { store, pid } = await period('HAKQN', { confirm: true });
  const rs = new ReportService(store);
  const f = path.join(OUT, 'BKVC.xlsx');
  const res = await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: f });
  assert.ok(res.sizeBytes > 5000);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const ws = wb.getWorksheet('BKVC');
  const v = (a) => cellText(ws.getCell(a));
  assert.equal(v('A1'), 'CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM');
  assert.equal(v('A4'), 'BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM');
  assert.equal(v('A5'), '( Vận chuyển từ ngày 18/09/2026 đến ngày 23/09/2026 )');
  assert.deepEqual(ws.getRow(6).values.slice(1), ['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn)', 'Đơn giá', 'Thành tiền', 'VAT (8%)', 'Thành tiền', 'Ghi chú']);
  assert.equal(v('A7'), 1); assert.equal(v('B7'), '43H-01021'); assert.equal(v('C7'), 19); assert.equal(v('D7'), 360010); assert.equal(v('G7'), 64081780); assert.equal(v('H7'), 5126542);
  assert.equal(ws.getCell('G7').numFmt, '#,##0'); assert.equal(ws.getCell('E7').numFmt, '#,##0.00');
  assert.equal(v('A24'), 'TỔNG CỘNG'); assert.equal(v('C24'), 326); assert.equal(v('D24'), 6143680); assert.equal(v('G24'), 1093575040); assert.equal(v('H24'), 87486003); assert.equal(v('I24'), 1181061043);
  assert.equal(v('A25'), 'Bằng chữ: Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng y ./.');
  assert.equal(v('G26'), 'Quế Sơn Trung, ngày 24 tháng 09 năm 2026');
  assert.equal(v('A27'), 'CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM'); assert.equal(v('F27'), 'CN CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(v('A28'), 'Giám đốc'); assert.equal(v('D28'), 'Kế toán'); assert.equal(v('F28'), 'Phó Giám đốc');
  assert.equal(v('A33'), 'VÕ VĂN PHỤNG'); assert.equal(v('F33'), 'VÕ THỊ NHƯ NGỌC');
  assert.equal(v('D33'), 'TRẦN THỊ HẸN'); assert.equal(v('I33'), 'DƯƠNG THỊ THANH NGA');
  assert.equal(ws.pageSetup.orientation, 'portrait'); assert.equal(ws.pageSetup.paperSize, 9);
  assert.equal(ws.pageSetup.printArea, 'A1:J33');
  assert.equal(ws.getCell('A1').font.name, 'Times New Roman');
  // tổng = cộng các dòng trong chính file
  let sum = 0; for (let r = 7; r <= 23; r++) sum += v(`I${r}`); assert.equal(sum, v('I24'));
  store.close();
});

test('Xuất Excel/CSV bảng kê chi tiết + bảng tính đơn giá', async () => {
  const { store, pid } = await period('HAKQN');
  const rs = new ReportService(store);
  const fx = path.join(OUT, 'BKCT.xlsx');
  await rs.export({ report: 'BKCT', format: 'XLSX', params: { periodId: pid }, targetPath: fx });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(fx); const ws = wb.worksheets[0];
  assert.equal(cellText(ws.getCell('A2')), 'BẢNG KÊ CHI TIẾT KHỐI LƯỢNG VẬN CHUYỂN DĂM');
  assert.equal(ws.getRow(4).values.length - 1, 15);
  assert.equal(cellText(ws.getRow(4).getCell(15)), 'Đơn vị VC'); assert.ok(ws.getColumn(15).width >= 30, 'cột Đơn vị VC mở rộng');
  assert.equal(ws.rowCount, 4 + 326 + 1 + 1 + 8, 'dữ liệu + tổng + 1 dòng trống + khối ký 8 dòng như Excel');
  assert.equal(cellText(ws.getCell('A3')), '( Vận chuyển từ ngày 18/09/2026 đến ngày 23/09/2026 )');
  assert.equal(cellText(ws.getCell('I333')), 'Quế Sơn Trung, ngày 24 tháng 09 năm 2026');
  assert.equal(cellText(ws.getCell('A334')), 'CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM'); assert.equal(cellText(ws.getCell('I334')), 'CN CÔNG TY TNHH HOÀNG ANH KHÔI');
  assert.equal(cellText(ws.getCell('A335')), 'Giám đốc'); assert.equal(cellText(ws.getCell('I335')), 'Phó Giám đốc');
  assert.equal(cellText(ws.getCell('A340')), 'VÕ VĂN PHỤNG'); assert.equal(cellText(ws.getCell('I340')), 'VÕ THỊ NHƯ NGỌC');
  assert.equal(cellText(ws.getCell('E340')), 'TRẦN THỊ HẸN'); assert.equal(cellText(ws.getCell('M340')), 'DƯƠNG THỊ THANH NGA');
  assert.equal(ws.pageSetup.printArea, 'A1:O340');
  assert.equal(cellText(ws.getCell('B331')), 'TỔNG CỘNG'); assert.equal(cellText(ws.getCell('J331')), 6143680);
  assert.match(cellText(ws.getCell('C5')), /^\d\d\/\d\d\/2026$/);
  assert.equal(ws.views[0].ySplit, 4);

  const fc = path.join(OUT, 'BKCT.csv');
  await rs.export({ report: 'BKCT', format: 'CSV', params: { periodId: pid }, targetPath: fc });
  const buf = fs.readFileSync(fc);
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'CSV phải có BOM để Excel mở đúng tiếng Việt');
  const lines = buf.toString('utf8').slice(1).trim().split('\r\n');
  assert.equal(lines.length, 327);
  assert.equal(lines[0].split(',')[1], 'Số phiếu');
  const kgIdx = 9; assert.equal(lines.slice(1).reduce((a, l) => a + Number(l.split(',')[kgIdx]), 0), 6143680);

  const fp = path.join(OUT, 'PRICING.csv');
  await rs.export({ report: 'PRICING', format: 'CSV', params: { periodId: pid }, targetPath: fp });
  const pl = fs.readFileSync(fp, 'utf8').slice(1).trim().split('\r\n');
  assert.equal(pl.length, 2); assert.ok(pl[1].endsWith(',178000'));
  const px = path.join(OUT, 'PRICING.xlsx');
  await rs.export({ report: 'PRICING', format: 'XLSX', params: { periodId: pid }, targetPath: px });
  const pw = new ExcelJS.Workbook(); await pw.xlsx.readFile(px); const ps = pw.worksheets[0];
  const names = []; ps.eachRow((r) => r.eachCell((c) => { const v = cellText(c); if (typeof v === 'string' && /^VÕ /.test(v)) names.push(v); }));
  assert.deepEqual([...new Set(names)], ['VÕ VĂN PHỤNG', 'VÕ THỊ NHƯ NGỌC'], 'bảng tính đơn giá có khối ký như QR_DGVC (2)');
  const bc = path.join(OUT, 'BKVC.csv');
  await rs.export({ report: 'BKVC', format: 'CSV', params: { periodId: pid }, targetPath: bc });
  assert.equal(fs.readFileSync(bc, 'utf8').trim().split('\r\n').length, 18);
  await assert.rejects(rs.export({ report: 'XYZ', format: 'CSV', params: { periodId: pid }, targetPath: bc }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(rs.export({ report: 'BKVC', format: 'DOCX', params: { periodId: pid }, targetPath: bc }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(rs.export({ report: 'BKVC', format: 'PDF', params: { periodId: pid }, targetPath: path.join(OUT, 'x.pdf') }), (e) => e.code === 'INTERNAL');
  store.close();
});

test('Xuất PDF (A4) — đọc lại chữ trong file', { skip: !HAS_PDF && 'không có Chromium/pdftotext trên máy này' }, async () => {
  const { store, pid } = await period('HAKQN');
  const render = chromiumPdfRenderer({ executablePath: CHROME });
  const rs = new ReportService(store, { pdfRenderer: render });
  try {
    const fb = path.join(OUT, 'BKVC.pdf');
    await rs.export({ report: 'BKVC', format: 'PDF', params: { periodId: pid }, targetPath: fb });
    assert.equal(fs.readFileSync(fb).subarray(0, 5).toString(), '%PDF-');
    const info = execFileSync('pdfinfo', [fb]).toString();
    assert.match(info, /Pages:\s+1\b/, 'BKVC 17 xe phải vừa 1 trang A4');
    assert.match(info, /Page size:\s+59\d(\.\d+)? x 84\d(\.\d+)? pts \(A4\)/, 'khổ A4 dọc');
    const txt = execFileSync('pdftotext', ['-layout', fb, '-']).toString();
    for (const s of ['BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM', '1.181.061.043', '1.093.575.040', '87.486.003', '6.143.680', 'VÕ VĂN PHỤNG', 'VÕ THỊ NHƯ NGỌC', 'không trăm bốn mươi ba đồng y']) {
      assert.ok(txt.includes(s), `PDF thiếu "${s}"`);
    }
    // dấu nước xoay chéo: pdftotext tách từng chữ → bỏ khoảng trắng rồi tìm
    assert.ok(execFileSync('pdftotext', ['-raw', fb, '-']).toString().replace(/\s/g, '').includes('BẢNNHÁP'), 'kỳ nháp phải in dấu BẢN NHÁP');
    const fc = path.join(OUT, 'BKCT.pdf');
    await rs.export({ report: 'BKCT', format: 'PDF', params: { periodId: pid }, targetPath: fc });
    const ci = execFileSync('pdfinfo', [fc]).toString();
    assert.match(ci, /Page size:\s+84\d(\.\d+)? x 59\d(\.\d+)? pts \(A4\)/, 'bảng kê khổ A4 ngang');
    const ctxt = execFileSync('pdftotext', ['-layout', fc, '-']).toString();
    assert.equal((ctxt.match(/TỔNG CỘNG/g) || []).length, 1, 'dòng tổng chỉ in 1 lần ở cuối');
    assert.ok(ctxt.includes('6.143.680'));
    const html = path.join(OUT, 'BKVC.html');
    await rs.export({ report: 'BKVC', format: 'HTML', params: { periodId: pid }, targetPath: html });
    assert.doesNotMatch(fs.readFileSync(html, 'utf8'), /https?:\/\//, 'mẫu in không tải gì từ Internet');
  } finally { await render.close(); store.close(); }
});

test('Kỳ đã xác nhận: PDF không còn chữ BẢN NHÁP', { skip: !HAS_PDF && 'không có Chromium' }, async () => {
  const { store, pid } = await period('HAKQN', { confirm: true });
  const render = chromiumPdfRenderer({ executablePath: CHROME });
  try {
    const f = path.join(OUT, 'BKVC_confirmed.pdf');
    await new ReportService(store, { pdfRenderer: render }).export({ report: 'BKVC', format: 'PDF', params: { periodId: pid }, targetPath: f });
    assert.ok(!execFileSync('pdftotext', ['-raw', f, '-']).toString().replace(/\s/g, '').includes('BẢNNHÁP'));
  } finally { await render.close(); store.close(); }
});

test('Tên in trên chứng từ đổi được (chốt 25/09/2026): hợp đồng → "tên ghi trên chứng từ" → tên đơn vị', async () => {
  const { store, pid, contractId } = await period('HAKQN');
  const rs = new ReportService(store);
  let s = rs.bkvc({ periodId: pid }).signers;
  assert.equal(s.customer.unitName, 'CN CÔNG TY TNHH HOÀNG ANH KHÔI'); assert.equal(s.customer.nameSource, 'DOC_DISPLAY_NAME');
  assert.equal(s.customer.legalName, 'Chi Nhánh Công ty TNHH Hoàng Anh Khôi');
  // đổi riêng cho hợp đồng này
  await store.transaction((tx) => tx.update('HOP_DONG', contractId, { customer_print_name: 'Chi nhánh Công ty TNHH Hoàng Anh Khôi tại Quế Sơn' }), { user: 'admin' });
  const d = rs.bkvc({ periodId: pid });
  assert.equal(d.signers.customer.unitName, 'CHI NHÁNH CÔNG TY TNHH HOÀNG ANH KHÔI TẠI QUẾ SƠN'); assert.equal(d.signers.customer.nameSource, 'CONTRACT');
  assert.equal(d.header.customer.unitName, d.signers.customer.unitName);
  // bỏ trống cả 2 → tên đơn vị
  await store.transaction((tx) => { tx.update('HOP_DONG', contractId, { customer_print_name: '' }); tx.update('DON_VI', 'CNHAK', { doc_display_name: '' }); }, { user: 'admin' });
  s = rs.bkvc({ periodId: pid }).signers;
  assert.equal(s.customer.unitName, 'CHI NHÁNH CÔNG TY TNHH HOÀNG ANH KHÔI'); assert.equal(s.customer.nameSource, 'UNIT_NAME');
  // số liệu không đổi
  assert.equal(rs.bkvc({ periodId: pid }).totals.total, 1181061043);
  store.close();
});

test('Diễn giải cước để viết hóa đơn (chốt 25/09/2026): 1 dòng / xe, mẫu câu theo hợp đồng, số khớp BKVC', async () => {
  const { store, pid, contractId } = await period('HAKQN');
  const rs = new ReportService(store);
  const inv = rs.invoice({ periodId: pid }); const b = rs.bkvc({ periodId: pid });
  assert.equal(inv.templateSource, 'CONFIG'); assert.equal(inv.rows.length, 17);
  const x = inv.rows.find((r) => r.plate_no === '43H-01055');
  // đúng câu trên hóa đơn thật MISA (25/09/2026): điểm đi / điểm đến của tuyến VC.007 + biển số viết liền
  assert.equal(x.description, 'Vận chuyển dăm gỗ từ nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng đến Cảng Tiên Sa Đà Nẵng bằng xe thùng biển kiểm soát: 43H01055');
  assert.deepEqual([x.uom, x.qty, x.unit_price, x.amount, x.vat, x.total], ['Tấn', 387.23, 178000, 68926940, 5514155, 74441095]);
  for (const r of inv.rows) { const l = b.lines.find((y) => y.plate_no === r.plate_no); assert.deepEqual([r.qty, r.amount, r.vat, r.total], [l.ton, l.amount, l.vat, l.amount_incl_vat]); }
  assert.deepEqual({ ...inv.totalsRow }, { description: 'TỔNG CỘNG', qty: 6143.68, amount: 1093575040, vat: 87486003, total: 1181061043 });
  // tuyến chưa điền điểm đi / điểm đến → tách từ tên tuyến
  await store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { from_place: '', to_place: '' }), { user: 'admin' });
  assert.equal(rs.invoice({ periodId: pid }).rows[0].description, 'Vận chuyển dăm gỗ từ Xã Quế Sơn đến Tiên Sa bằng xe thùng biển kiểm soát: 43H01021', 'điểm đi/đến tách từ tên tuyến');
  // sửa điểm đi / điểm đến trong danh mục tuyến → diễn giải đổi theo
  await store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { from_place: 'NM dăm gỗ Cụm CN Đông Phú, Xã Quế Sơn', to_place: 'Cảng Tiên Sa, TP Đà Nẵng' }), { user: 'admin' });
  assert.equal(rs.invoice({ periodId: pid }).rows[0].description, 'Vận chuyển dăm gỗ từ NM dăm gỗ Cụm CN Đông Phú, Xã Quế Sơn đến Cảng Tiên Sa, TP Đà Nẵng bằng xe thùng biển kiểm soát: 43H01021');
  await store.transaction((tx) => tx.update('HOP_DONG', contractId, { service_desc: 'Cước VC dăm {MA_TUYEN} từ {TU_NGAY} đến {DEN_NGAY}, xe {BKS}' }), { user: 'admin' });
  assert.equal(rs.invoice({ periodId: pid }).rows[0].description, 'Cước VC dăm VC.007 từ 18/09/2026 đến 23/09/2026, xe 43H-01021');
  // xuất: sheet HOA_DON trong file BKVC + dòng diễn giải ngoài vùng in; báo cáo INVOICE riêng (Excel / CSV)
  const f = path.join(OUT, 'BKVC_hoadon.xlsx');
  await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: f });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const hd = wb.getWorksheet('HOA_DON'); assert.ok(hd, 'có sheet HOA_DON');
  assert.equal(cellText(hd.getCell('B2')), 'Cước VC dăm VC.007 từ 18/09/2026 đến 23/09/2026, xe 43H-01021');
  assert.equal(cellText(hd.getCell('F19')), 1093575040); assert.equal(cellText(hd.getCell('I19')), 1181061043);
  const ws = wb.getWorksheet('BKVC'); assert.equal(ws.pageSetup.printArea, 'A1:J33');
  assert.equal(cellText(ws.getCell('C37')), 'Cước VC dăm VC.007 từ 18/09/2026 đến 23/09/2026, xe 43H-01021', 'dòng diễn giải nằm ngoài vùng in, như Excel');
  const fc = path.join(OUT, 'HOA_DON.csv');
  await rs.export({ report: 'INVOICE', format: 'CSV', params: { periodId: pid }, targetPath: fc });
  const lines = fs.readFileSync(fc, 'utf8').slice(1).trim().split('\r\n');
  assert.equal(lines.length, 18); assert.match(lines[1], /^1,"Cước VC dăm VC\.007 từ 18\/09\/2026 đến 23\/09\/2026, xe 43H-01021",Tấn,360\.01,178000,64081780,8,5126542,69208322$/);
  const fx = path.join(OUT, 'HOA_DON.xlsx');
  await rs.export({ report: 'INVOICE', format: 'XLSX', params: { periodId: pid }, targetPath: fx });
  const w2 = new ExcelJS.Workbook(); await w2.xlsx.readFile(fx); const s2 = w2.worksheets[0];
  assert.equal(cellText(s2.getCell('B22')), 'TỔNG CỘNG'); assert.equal(cellText(s2.getCell('I22')), 1181061043);
  store.close();
});

test('Báo cáo theo ngày: tổng hợp khối lượng theo khách hàng / nhóm xe (có dòng cộng), phiếu cân & giao nhận dầu → Excel', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const ExcelJS = require('exceljs');
  const { install: inst } = require('./install'); const { ReportService: RS } = require('../main/reports/ReportService');
  const { store } = await inst('HAKQN'); const rs = new RS(store);
  const v = rs.volumeSummary({ groupBy: 'CUSTOMER', groupBy2: 'OWNER' });
  assert.equal(v.totalsRow.trips, 326); assert.equal(v.totalsRow.ton, 6143.68);
  assert.deepEqual(v.rows.filter((r) => !r._b).map((r) => [r.g2, r.trips]), [['HAKQN · HAKQN', 149], ['HAK · HAK', 100], ['DH · Đại Hiệp', 77]]);
  assert.equal(v.rows.find((r) => r._b).g1, 'Cộng CNHAK · CN Quế Sơn');
  const byOwner = rs.volumeSummary({ groupBy: 'OWNER' }); assert.equal(byOwner.rows.reduce((a, r) => a + r.share, 0).toFixed(2), '100.00');
  const byDay = rs.volumeSummary({ groupBy: 'DAY', dateFrom: '2026-09-18', dateTo: '2026-09-19' }); assert.deepEqual(byDay.rows.map((r) => r.g1), ['18/09/2026', '19/09/2026']);
  assert.throws(() => rs.volumeSummary({ groupBy: 'XYZ' }), /không hỗ trợ/);
  const t = rs.ticketList({ dateFrom: '2026-09-18', dateTo: '2026-09-18' }); assert.ok(t.rows.length > 0 && t.rows.every((x) => x.weigh1_date === '2026-09-18'));
  const f = rs.fuelList({ dateFrom: '2026-09-16', dateTo: '2026-09-20' }); assert.ok(f.rows.every((x) => x.receive_date >= '2026-09-16' && x.receive_date <= '2026-09-20'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-'));
  for (const [rep, params] of [['VOLUME', { groupBy: 'CUSTOMER', groupBy2: 'OWNER' }], ['TICKETS', {}], ['FUEL_LIST', {}]]) {
    const file = path.join(dir, `${rep}.xlsx`); await rs.export({ report: rep, format: 'XLSX', params, targetPath: file });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); assert.ok(wb.worksheets[0].rowCount > 5, rep);
    assert.match(rs.html({ report: rep, params }), /<table>/);
  }
  store.close();
});
