'use strict';
/**
 * Phương thức ĐƠN GIÁ CỐ ĐỊNH (bản 1.2.3, chốt 07/10/2026):
 *  - đơn vị đ/tấn; chọn theo từng tuyến + phiên bản giá (cùng hợp đồng có tuyến theo giá dầu, tuyến cố định);
 *  - tuyến cố định KHÔNG nhận dầu: kỳ có dòng dầu của tuyến → lỗi, chỉ rõ; bỏ dầu khỏi kỳ → tính được;
 *  - Đơn giá VC = đơn giá cố định (không làm tròn lại, không chênh lệch dầu); BKVC = Tấn × đơn giá.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ReportService } = require('../main/reports/ReportService');
const { ImportService } = require('../main/import/ImportService');
const html = require('../main/reports/htmlTemplates');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-fixed-'));

async function fixedVersion(store, contractId, fixedPrice = 95500, effectiveFrom = '2026-09-01') {
  const cs = new CatalogService(store);
  const v = await cs.createPriceVersion({ record: { routeCode: 'VC.007', contractId, effectiveFrom, priceMethod: 'CO_DINH', fixedPrice, newPrice: 999999 }, user: KETOAN });
  await cs.activatePrice({ priceId: v.record.price_id, rowVersion: v.record.row_version, user: KETOAN });
  return { cs, v };
}

test('Bảng giá cố định: chỉ cần đơn giá > 0; các cột theo giá dầu ghi 0; xem trước & danh sách trả đúng đơn giá', async () => {
  const { store, contractId } = await install('DH', { withData: false });
  const cs = new CatalogService(store);
  await assert.rejects(cs.createPriceVersion({ record: { routeCode: 'VC.007', contractId, effectiveFrom: '2026-09-01', priceMethod: 'CO_DINH', fixedPrice: 0 }, user: KETOAN }), /Đơn giá cố định .* phải > 0/);
  const pv = cs.previewPrice({ record: { routeCode: 'VC.007', contractId, priceMethod: 'CO_DINH', fixedPrice: 95500 } });
  assert.equal(pv.priceMethod, 'CO_DINH'); assert.equal(pv.contractPrice, 95500);
  const { v } = await fixedVersion(store, contractId);
  const rec = store.get('PRICE_HISTORY', v.record.price_id);
  assert.equal(rec.price_method, 'CO_DINH'); assert.equal(rec.fixed_price, 95500);
  assert.equal(rec.new_price, 0, 'số nhập ở ô theo giá dầu bị bỏ — không dùng'); assert.equal(rec.fuel_norm_l_per_km, 0);
  const item = cs.listPrices({ routeCode: 'VC.007', contractId }).items.find((x) => x.price_id === rec.price_id);
  assert.equal(item.contractPrice, 95500);
  // phiên bản theo giá dầu vẫn kiểm đủ như cũ
  await assert.rejects(cs.createPriceVersion({ record: { routeCode: 'VC.007', contractId, effectiveFrom: '2026-10-01', priceMethod: 'THEO_DAU', newPrice: 170000, fuelPriceExclVat: 15500, avgLoadTon: 18 }, user: KETOAN }), /Định mức dầu/);
  store.close();
});

test('Kỳ tính tuyến cố định: có dầu → lỗi E_FIXED_PRICE_HAS_FUEL; bỏ dầu khỏi kỳ → ĐG VC = đơn giá cố định, BKVC = tấn × đơn giá; chứng từ in đúng', async () => {
  const { store, periods, contractId } = await install('DH');
  await fixedVersion(store, contractId, 95500);

  const pv = await periods.preview({ contractId, ...W });
  const err = pv.issues.find((i) => i.code === 'E_FIXED_PRICE_HAS_FUEL');
  assert.ok(err, 'tuyến cố định có dòng dầu → chặn');
  assert.match(err.message, /ĐƠN GIÁ CỐ ĐỊNH .* 16 dòng dầu/);
  assert.equal(err.params.receiptIds.length, 16);
  assert.equal(pv.results[0].resultStatus, 'ERROR');

  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: err.params.receiptIds, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  const r = k.results[0];
  assert.equal(r.priceMethod, 'CO_DINH'); assert.equal(r.transportPrice, 95500); assert.equal(r.fuelAdjustPrice, 0); assert.equal(r.actualFuelLiter, 0);
  assert.ok(!k.issues.some((i) => i.level === 'ERROR'));
  assert.ok(k.issues.some((i) => i.code === 'I_FIXED_PRICE'));
  assert.ok(!k.issues.some((i) => i.code === 'W_VEHICLE_NO_FUEL'), 'tuyến cố định không cảnh báo xe không có dầu');
  assert.deepEqual(r.trace.steps.map((s) => s.key), ['fixedPrice', 'tripCount', 'totalTon', 'transportPrice']);
  // BKVC: thành tiền từng dòng = làm tròn(tấn × 95.500)
  const lines = k.bkvc.lines;
  for (const l of lines) assert.equal(l.amount, Math.round((l.kg / 1000) * 95500));
  assert.equal(k.bkvc.totals.amount, lines.reduce((a, l) => a + l.amount, 0));

  const calc = store.find('TRANSPORT_CALCULATION', (c) => c.period_id === k.period.period_id && c.is_current)[0];
  assert.equal(calc.price_method, 'CO_DINH'); assert.equal(calc.transport_price, 95500); assert.equal(calc.fuel_price, '');

  const rs = new ReportService(store);
  const ps = rs.pricingSheet({ periodId: k.period.period_id });
  assert.equal(ps.routes[0].priceMethod, 'CO_DINH');
  assert.deepEqual(ps.routes[0].sections.flatMap((x) => x.rows.map((y) => y.no)), [1, 2, 3, 4]);
  assert.match(html.pricingSheet(ps), /Đơn giá cố định/);
  const f = path.join(OUT, 'btdg.xlsx');
  await rs.export({ report: 'PRICING_SHEET', format: 'XLSX', params: { periodId: k.period.period_id }, targetPath: f });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const txt = []; wb.worksheets[0].eachRow((row) => row.eachCell((c) => txt.push(String(c.value))));
  assert.ok(txt.some((t) => /Đơn giá cố định/.test(t)));
  assert.equal(rs.bkvc({ periodId: k.period.period_id }).totals.amount, k.bkvc.totals.amount);

  // căn cứ giá ký hợp đồng: tuyến cố định ghi thẳng đơn giá
  const cb = rs.contractBasis({ contractId, asOf: '2026-09-20' });
  const row = cb.rows.find((x) => x.routeCode === 'VC.007');
  assert.equal(row.fixed, true); assert.equal(row.contractPrice, 95500);
  assert.match(html.contractBasis(cb), /Đơn giá cố định — không tính theo giá dầu/);
  const f2 = path.join(OUT, 'cancu.xlsx');
  await rs.export({ report: 'CONTRACT_BASIS', format: 'XLSX', params: { contractId, asOf: '2026-09-20' }, targetPath: f2 });
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(f2);
  const ws = wb2.worksheets[0]; let hit = null;
  ws.eachRow((rw, i) => { if (rw.getCell(2).value === 'VC.007') hit = i; });
  assert.equal(ws.getCell(hit, 15).value, 95500);
  store.close();
});

test('Tuyến theo giá dầu không đổi kết quả (96.900); đổi sang cố định từ ngày mới thì kỳ cắt ngang ngày đổi bị chặn tách kỳ', async () => {
  const { store, periods, contractId } = await install('DH');
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const base = await periods.preview({ contractId, ...W, excludeReceiptIds: [dup[1].receipt_id] });
  assert.equal(base.results[0].transportPrice, 96900); assert.equal(base.results[0].priceMethod, 'THEO_DAU');
  await fixedVersion(store, contractId, 95500, '2026-09-21');
  const pv = await periods.preview({ contractId, ...W, excludeReceiptIds: [dup[1].receipt_id] });
  assert.ok(pv.issues.some((i) => i.code === 'E_PRICE_VERSION_SPLIT'), 'kỳ gồm cả ngày trước và sau khi đổi phương thức → tách kỳ');
  store.close();
});

test('Import dầu vào tuyến đang dùng đơn giá cố định → cảnh báo W_FUEL_FIXED_ROUTE', async () => {
  const { store, contractId } = await install('DH', { withData: false });
  await fixedVersion(store, contractId);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_GIAONHANDAU');
  ws.addRow(['Ngày nhận dầu', 'Mã cự ly VC', 'Biển số xe', 'ĐVT', 'Số lượng (lít)', 'Đơn giá dầu', 'Ngày mua dầu', 'Đơn vị']);
  ws.addRow(['21/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', 100, 30000, '', 'HAKQN']);
  const f = path.join(OUT, 'dau.xlsx'); await wb.xlsx.writeFile(f);
  const imp = new ImportService(store);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: f, user: 'ketoan' });
  const w = pv.rows[0].issues.find((i) => i.code === 'W_FUEL_FIXED_ROUTE');
  assert.ok(w); assert.match(w.message, /ĐƠN GIÁ CỐ ĐỊNH/);
  await imp.cancel({ batchId: pv.batchId });
  store.close();
});
