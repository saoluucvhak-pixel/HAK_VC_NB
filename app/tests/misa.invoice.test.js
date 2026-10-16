'use strict';
/**
 * File nhập hóa đơn MISA meInvoice (mẫu "Hóa đơn GTGT 1 thuế suất") — đối chiếu với HÓA ĐƠN THẬT
 * 1C26TYY (ĐH → HAKQN, 25/09/2026, chưa cấp số): 5 xe, 96.900 đ/tấn, 140.711.397 + VAT 11.256.912 = 151.968.309.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const E = require('../main/engine');
const { ReportService } = require('../main/reports/ReportService');
const { install, KETOAN, rid } = require('./install');

const WEEK = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
// số liệu in trên hóa đơn thật
const REAL = {
  lines: [['92H00057', 279.98, 27130062], ['92H00133', 224.99, 21801531], ['92H00141', 303.20, 29380080], ['92H00192', 356.52, 34546788], ['92H00195', 287.44, 27852936]],
  price: 96900, amount: 140711397, vat: 11256912, total: 151968309,
  desc: (bks) => `Vận chuyển dăm gỗ từ nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng đến Cảng Tiên Sa Đà Nẵng bằng xe thùng biển kiểm soát: ${bks}`,
};
const cell = (ws, a) => { const v = ws.getCell(a).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };

test('Cách tính của hóa đơn MISA: thành tiền từng dòng làm tròn đồng, VAT = làm tròn(tổng tiền hàng × 8%) — khớp hóa đơn thật', () => {
  const cfg = E.buildConfig([]);
  const amounts = REAL.lines.map(([, t]) => E.calculateConfirmationLine({ kg: Math.round(t * 1000), unitPrice: REAL.price, vatRate: 0.08 }, cfg));
  assert.deepEqual(amounts.map((a) => a.amount), REAL.lines.map((l) => l[2]));
  const sum = amounts.reduce((a, x) => a + x.amount, 0);
  assert.equal(sum, REAL.amount);
  assert.equal(E.calculateInvoiceVat(sum, 0.08, cfg), REAL.vat);
  assert.equal(amounts.reduce((a, x) => a + x.vat, 0), REAL.vat - 1, 'cộng VAT từng dòng thì thiếu 1 đ so với hóa đơn');
});

test('Kỳ ĐH 18–23/09 → file nhập MISA đúng mẫu; bỏ 1 dòng dầu 400 lít trùng (18/09, 92H-00192) thì ra ĐÚNG hóa đơn thật 96.900', async () => {
  const { store, periods, contractId } = await install('DH');
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  assert.equal(dup.length, 2, 'bảng kê ĐH có 2 dòng giống hệt nhau');
  // như file Excel: tính cả 2 dòng → 88.900
  const a = periods.preview({ contractId, ...WEEK });
  assert.equal(a.results[0].transportPrice, 88900);
  // bỏ 1 dòng trùng → 96.900 = đơn giá trên hóa đơn thật
  const k = await periods.calculate({ contractId, ...WEEK, excludeReceiptIds: [dup[1].receipt_id], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  assert.equal(k.results[0].transportPrice, REAL.price);
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const rs = new ReportService(store);
  const m = rs.misa({ periodId: k.period.period_id });
  const inv = m.invoices[0];
  assert.deepEqual(inv.lines.map((l) => [l.description, l.uom, l.qty, l.unitPrice, l.amount]), REAL.lines.map(([bks, t, amt]) => [REAL.desc(bks), 'Tấn', t, REAL.price, amt]), 'từng dòng hàng khớp hóa đơn thật');
  assert.deepEqual(inv.totals, { amount: REAL.amount, vat: REAL.vat, total: REAL.total });
  assert.deepEqual([inv.buyer.name, inv.buyer.taxCode, inv.payment, inv.vatPct, inv.date], ['CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM', '4000956057', 'Chuyển khoản', 8, '25/09/2026']);
  // VAT_ROUND_BASIS = LINE: BKVC thiếu 1 đ → cảnh báo
  assert.equal(inv.bkvc.vat, REAL.vat - 1);
  assert.ok(m.warnings.some((w) => w.code === 'W_INVOICE_VAT_DIFF'));

  // ghi file từ mẫu MISA, đọc lại
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'misa-')), 'HoaDon_MISA.xlsx');
  const res = await rs.export({ report: 'MISA', format: 'XLSX', params: { periodId: k.period.period_id }, targetPath: f });
  assert.ok(res.warnings.length);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); const ws = wb.worksheets[0];
  assert.equal(ws.name, 'Hóa đơn GTGT');
  assert.equal(cell(ws, 'A1'), 'File mẫu danh sách hóa đơn để nhập vào phần mềm', 'giữ dòng hướng dẫn của MISA');
  assert.deepEqual(ws.getRow(9).values.slice(1), ['Số thứ tự hóa đơn (*)', 'Ngày hóa đơn', 'Tên đơn vị mua hàng', 'Địa chỉ', 'Mã số thuế', 'Người mua hàng', 'Email', 'Hình thức thanh toán',
    'Loại tiền', 'Tỷ giá', 'Thuế suất GTGT (%)', 'Tiền thuế GTGT', 'Tiền thuế GTGT quy đổi', 'Tên hàng hóa/dịch vụ (*)', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thành tiền quy đổi']);
  assert.deepEqual(['A', 'B', 'C', 'E', 'H', 'I', 'J', 'K', 'L', 'M'].map((c) => cell(ws, `${c}10`)), ['1', '25/09/2026', 'CÔNG TY TNHH HOÀNG ANH KHÔI QUẢNG NAM', '4000956057', 'Chuyển khoản', 'VND', 1, 8, REAL.vat, REAL.vat]);
  for (let i = 0; i < 5; i++) {
    const r = 10 + i; const [bks, t, amt] = REAL.lines[i];
    assert.deepEqual(['A', 'N', 'O', 'P', 'Q', 'R', 'S'].map((c) => cell(ws, `${c}${r}`)), ['1', REAL.desc(bks), 'Tấn', t, REAL.price, amt, amt], `dòng ${r}`);
    if (i) assert.equal(cell(ws, `L${r}`), null, 'tiền thuế chỉ ghi ở dòng đầu hóa đơn');
  }
  assert.equal(cell(ws, 'A15'), null, 'không còn dòng ví dụ của mẫu');
  let sumR = 0; for (let r = 10; r <= 14; r++) sumR += cell(ws, `R${r}`); assert.equal(sumR, REAL.amount);
  store.close();
});

test('VAT_ROUND_BASIS = TOTAL: BKVC tính VAT trên tổng (chênh dồn dòng cuối) → khớp hóa đơn, hết cảnh báo', async () => {
  const { store, periods, contractId } = await install('DH');
  await store.transaction((tx) => tx.update('CONFIG', 'VAT_ROUND_BASIS', { config_value: 'TOTAL' }), { user: 'admin' });
  const k = await periods.calculate({ contractId, ...WEEK, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const rs = new ReportService(store); const b = rs.bkvc({ periodId: k.period.period_id });
  assert.equal(b.totals.vat, E.calculateInvoiceVat(b.totals.amount, 0.08, E.buildConfig(store.all('CONFIG'))));
  assert.equal(b.totals.vat, 10327549); assert.equal(b.totals.total, 139421906);
  assert.equal(b.lines.reduce((a, l) => a + l.vat, 0), b.totals.vat, 'cột VAT cộng lại đúng dòng tổng');
  const m = rs.misa({ periodId: k.period.period_id });
  assert.equal(m.invoices[0].vat, b.totals.vat); assert.ok(!m.warnings.some((w) => w.code === 'W_INVOICE_VAT_DIFF'));
  // bên thuê (kỳ nhận từ gói) không lập hóa đơn
  store.close();
});

test('Dòng dầu nghi trùng: bỏ khỏi kỳ được lưu theo lần tính — tính lại vẫn giữ; "Không trùng" thì hết cảnh báo', async () => {
  const { store, periods, contractId } = await install('DH');
  const records = new (require('../main/services/RecordService').RecordService)(store, { importService: null });
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const pv = periods.preview({ contractId, ...WEEK });
  const w = pv.issues.filter((i) => i.code === 'W_FUEL_POSSIBLE_DUPLICATE');
  assert.ok(w.some((i) => i.ref === dup[1].receipt_id), 'cảnh báo nêu đúng dòng, có ref để bấm');
  assert.match(w[0].message, /18\/09\/2026/);
  const k = await periods.calculate({ contractId, ...WEEK, excludeReceiptIds: [dup[1].receipt_id], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  assert.equal(k.results[0].transportPrice, 96900);
  assert.ok(k.issues.some((i) => i.code === 'I_FUEL_EXCLUDED' && i.ref === dup[1].receipt_id));
  assert.ok(!k.issues.some((i) => i.code === 'W_FUEL_POSSIBLE_DUPLICATE' && i.ref === dup[0].receipt_id), 'bỏ 1 dòng thì dòng còn lại hết cảnh báo trùng');
  const pid = k.period.period_id;
  assert.deepEqual(periods.get({ periodId: pid }).exclusions.excludeReceiptIds, [dup[1].receipt_id]);
  // tính lại KHÔNG truyền danh sách bỏ → giữ như lần trước (không tự đưa dòng trùng trở lại)
  const k2 = await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.equal(k2.results[0].transportPrice, 96900);
  assert.equal(periods.preview({ contractId, ...WEEK, periodId: pid }).results[0].transportPrice, 96900);
  // đưa lại vào kỳ (danh sách rỗng) → 88.900
  const k3 = await periods.calculate({ contractId, ...WEEK, periodId: pid, excludeReceiptIds: [], clientRequestId: rid(), user: KETOAN });
  assert.equal(k3.results[0].transportPrice, 88900);
  // "Không trùng": xác nhận cảnh báo → hết W_FUEL_POSSIBLE_DUPLICATE cho dòng đó
  await records.ackFuelFlags({ receiptIds: dup.map((r) => r.receipt_id), note: 'đã kiểm tra: 2 lần đổ thật', user: KETOAN });
  assert.ok(!periods.preview({ contractId, ...WEEK, periodId: pid }).issues.some((i) => i.code === 'W_FUEL_POSSIBLE_DUPLICATE' && dup.some((d) => d.receipt_id === i.ref)));
  store.close();
});

test('Bảng tính đơn giá (mẫu in) + Biên bản giao nhận dầu diesel: số liệu = kỳ đã lưu; xuất PDF-HTML / Excel', async () => {
  const { store, periods, contractId } = await install('DH');
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const k = await periods.calculate({ contractId, ...WEEK, excludeReceiptIds: [dup[1].receipt_id], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id; const rs = new ReportService(store);
  const ps = rs.pricingSheet({ periodId: pid }); const rt = ps.routes[0];
  assert.equal(ps.carrier.address, 'Thôn Phú Quý, Xã Đại Lộc, TP. Đà Nẵng', 'bảng tính đơn giá: địa chỉ bỏ chữ Việt Nam');
  assert.doesNotMatch(rs.html({ report: 'PRICING_SHEET', params: { periodId: pid } }), /Việt Nam<\/div>/);
  const rows = rt.sections.flatMap((x) => x.rows);
  assert.deepEqual(rows.map((r) => r.no), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(rows.find((r) => r.no === 11).value, '115.000'); assert.equal(rows.find((r) => r.no === 20).value, '96.900');
  assert.equal(rt.transportPrice, 96900); assert.match(rt.words, /^Chín mươi sáu ngàn, chín trăm đồng\/tấn/);
  assert.equal(ps.bkvc.amount, REAL.amount); assert.equal(ps.notes.length, 1, 'ghi chú dòng dầu đã bỏ khỏi kỳ');
  const fh = rs.fuelHandover({ periodId: pid }); const doc = fh.docs[0];
  assert.equal(fh.docs.length, 1); assert.equal(doc.giver.unitCode, 'HAKQN'); assert.equal(doc.receiver.unitCode, 'DH');
  assert.equal(doc.totals.qty, Math.round(k.results[0].actualFuelLiter * 100) / 100, 'tổng lít = dầu thực nhận của kỳ');
  assert.ok(!doc.rows.some((r) => r.receiptId === dup[1].receipt_id), 'không có dòng đã bỏ khỏi kỳ');
  assert.equal(doc.byPlate.reduce((a, o) => a + o.times, 0), doc.rows.length);
  assert.ok(doc.rows.some((r) => r.note === 'Nhận trước kỳ'));
  assert.match(doc.qtyWords, /lít$/);
  const hs = rs.html({ report: 'PRICING_SHEET', params: { periodId: pid } }); assert.match(hs, /BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN DĂM GỖ/); assert.match(hs, /BẢN NHÁP/);
  const hf = rs.html({ report: 'FUEL_HANDOVER', params: { periodId: pid } }); assert.match(hf, /BIÊN BẢN GIAO NHẬN DẦU DIESEL/); assert.match(hf, /BÊN GIAO \(Bên A\)/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-doc-'));
  for (const rep of ['PRICING_SHEET', 'FUEL_HANDOVER']) {
    const f = path.join(dir, `${rep}.xlsx`); await rs.export({ report: rep, format: 'XLSX', params: { periodId: pid }, targetPath: f });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); assert.ok(wb.worksheets[0].rowCount > 30, rep);
  }
  store.close();
});

test('Thuế suất GTGT chọn theo từng kỳ: 10% → BKVC/hóa đơn MISA 10%; tính lại giữ nguyên; lịch thuế suất theo ngày; thuế suất ngoài danh sách bị chặn', async () => {
  const { store, periods, contractId } = await install('DH');
  await assert.rejects(periods.calculate({ contractId, ...WEEK, vatRate: 0.07, clientRequestId: rid(), user: KETOAN }), /không có trong danh sách/);
  assert.equal(periods.preview({ contractId, ...WEEK }).vatRate, 0.08, 'mặc định VAT_RATE');
  const k = await periods.calculate({ contractId, ...WEEK, vatRate: 0.1, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id; const rs = new ReportService(store);
  let b = rs.bkvc({ periodId: pid });
  assert.equal(b.header.vatPct, 10); assert.equal(b.totals.vat, b.lines.reduce((a, l) => a + Math.round(l.amount * 0.1), 0));
  const k2 = await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.equal(k2.vatRate, 0.1, 'tính lại không chọn → giữ 10% của kỳ');
  assert.equal(periods.get({ periodId: pid }).exclusions.vatRate, 0.1);
  assert.equal(rs.misa({ periodId: pid }).invoices[0].vatPct, 10);
  // lịch thuế suất: từ 01/09/2026 là 10% → kỳ mới mặc định 10%
  await store.transaction((tx) => tx.update('CONFIG', 'VAT_RATE_SCHEDULE', { config_value: '2026-01-01=0.08;2026-09-01=0.1' }), { user: 'admin' });
  assert.equal(periods.preview({ contractId, dateFrom: '2026-09-24', dateTo: '2026-09-30', routeCode: 'VC.007' }).vatRate, 0.1);
  assert.equal(periods.preview({ contractId, dateFrom: '2026-08-01', dateTo: '2026-08-31', routeCode: 'VC.007' }).vatRate, 0.08);
  store.close();
});

test('Kỳ không có dầu: báo E_NO_FUEL kèm gợi ý đơn giá → "Tính với dầu = 0" (đơn giá + lý do) tính được, tính lại vẫn giữ', async () => {
  const { store, periods, contractId } = await install('DH');
  const k1 = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-20', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k1.period.period_id, user: KETOAN }); // kỳ 1 dùng hết bảng kê dầu
  const W2 = { dateFrom: '2026-09-21', dateTo: '2026-09-23', routeCode: 'VC.007' };
  const pv = periods.preview({ contractId, ...W2 });
  const e = pv.issues.find((i) => i.code === 'E_NO_FUEL');
  assert.ok(e, 'kỳ không có dầu → E_NO_FUEL'); assert.equal(e.ref, 'VC.007'); assert.ok(e.params.suggestFuelPrice > 0);
  await assert.rejects(periods.calculate({ contractId, ...W2, clientRequestId: rid(), user: KETOAN }), /Còn lỗi chặn/);
  const ov = [{ code: 'E_NO_FUEL', routeCode: 'VC.007', fuelPrice: 29940, reason: 'Kỳ này không nhận dầu' }];
  const k2 = await periods.calculate({ contractId, ...W2, overrides: ov, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const r = k2.results[0];
  assert.equal(r.actualFuelLiter, 0); assert.equal(r.fuelDiffLiter, r.standardFuelLiter);
  assert.equal(r.transportPrice, Math.round((115000 + (r.standardFuelLiter * 29940) / r.totalTon) / 100) * 100);
  assert.ok(k2.issues.some((i) => i.code === 'W_OVERRIDE_NO_FUEL' && /29\.940/.test(i.message)));
  const k3 = await periods.calculate({ contractId, ...W2, periodId: k2.period.period_id, clientRequestId: rid(), user: KETOAN });
  assert.equal(k3.results[0].transportPrice, r.transportPrice, 'tính lại giữ xác nhận dầu = 0');
  assert.deepEqual(periods.get({ periodId: k2.period.period_id }).exclusions.overrides, ov);
  store.close();
});
