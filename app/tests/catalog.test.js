'use strict';
/**
 * Chốt 25/09/2026: tuyến vận chuyển sửa được, bổ sung được — CatalogService (routes.* / prices.*).
 * Mọi thay đổi có kiểm tra, audit, không làm sai kỳ đã xác nhận/khóa; kỳ nháp liên quan tự đánh dấu "cần tính lại".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { CatalogService } = require('../main/services/CatalogService');
const { ReportService } = require('../main/reports/ReportService');
const { install, ADMIN, KETOAN, rid } = require('./install');

const WEEK = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const rejects = (p, code, issue) => assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (issue) assert.equal(e.details.code, issue, e.message); return true; });

test('Thêm tuyến mới: kiểm tra dữ liệu, cự ly chuyến mặc định = 2 × cự ly, audit; mã trùng bị chặn', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const cs = new CatalogService(store);
  await assert.rejects(cs.saveRoute({ create: true, record: { routeCode: 'vc 16', routeName: '', distanceKm: 0 }, user: KETOAN }), (e) => {
    assert.equal(e.code, 'VALIDATION_FAILED'); assert.equal(e.details.errors.length, 4, e.message); return true; }); // mã, tên, cự ly, cự ly chuyến
  const r = await cs.saveRoute({ create: true, record: { routeCode: 'vc.016', routeName: 'Xã Quế Sơn  -  Cảng Chu Lai', distanceKm: 65, fromPlace: 'NM dăm gỗ Cụm CN Đông Phú', toPlace: 'Cảng Chu Lai, Quảng Nam' }, user: KETOAN });
  assert.equal(r.created, true);
  assert.deepEqual([r.record.route_code, r.record.route_name, r.record.distance_km, r.record.trip_distance_km, r.record.uom, r.record.is_active], ['VC.016', 'Xã Quế Sơn - Cảng Chu Lai', 65, 130, 'TAN', true]);
  // bản cài nào sửa cũng nhắc sửa giống ở các nhà máy còn lại
  assert.equal(r.warnings[0].code, 'I_SYNC_REMINDER'); assert.deepEqual(r.warnings[0].targets, ['HAK', 'DH', 'CNHAK']);
  await rejects(cs.saveRoute({ create: true, record: { routeCode: 'VC.007', routeName: 'x', distanceKm: 1 }, user: KETOAN }), 'DUPLICATE');
  await rejects(cs.saveRoute({ record: { routeCode: 'VC.999', routeName: 'x', distanceKm: 1 }, user: KETOAN }), 'NOT_FOUND');
  const m3 = await cs.saveRoute({ create: true, record: { routeCode: 'VC.017', routeName: 'Nhất Hưng - Tiên Sa', distanceKm: 42, uom: 'm3' }, user: KETOAN });
  assert.equal(m3.record.uom, 'M3');
  assert.ok(store.find('AUDIT_LOG', (a) => a.entity === 'TUYEN_VC' && a.action === 'CREATE').length === 2);
  assert.deepEqual(cs.listRoutes({ q: 'chu lai' }).items.map((x) => x.route_code), ['VC.016']);
  store.close();
});

test('Tuyến mới + giá mới → tính được Tầng A (ĐG_HĐ) như tuyến có sẵn', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const cs = new CatalogService(store);
  await cs.saveRoute({ create: true, record: { routeCode: 'VC.016', routeName: 'Xã Quế Sơn - Cảng Chu Lai', distanceKm: 72 }, user: KETOAN });
  // cùng tham số VC.007 → cùng ĐG_HĐ 115.000
  const pv = cs.previewPrice({ record: { routeCode: 'VC.016', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 } });
  assert.equal(pv.contractPrice, 115000); assert.equal(pv.current, null);
  await assert.rejects(cs.createPriceVersion({ record: { routeCode: 'VC.016', effectiveFrom: '2026-10-01', newPrice: 0, fuelPriceExclVat: 15500, fuelNormLPerKm: 0, avgLoadTon: 18 }, user: KETOAN }),
    (e) => e.code === 'VALIDATION_FAILED' && e.details.errors.length === 2);
  const v1 = await cs.createPriceVersion({ record: { routeCode: 'VC.016', effectiveFrom: '2026-10-01', newPrice: 170000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 }, user: KETOAN });
  assert.equal(v1.record.price_id, 'PR-VC.016-v1'); assert.equal(v1.record.status, 'DRAFT');
  assert.equal(v1.contractPrice, E.computeContractPrice(store.get('TUYEN_VC', 'VC.016'), v1.record, E.buildConfig(store.all('CONFIG'))).contractPrice);
  const a = await cs.activatePrice({ priceId: v1.record.price_id, rowVersion: v1.record.row_version, user: KETOAN });
  assert.equal(a.activated.status, 'ACTIVE'); assert.deepEqual(a.closed, []);
  store.close();
});

test('Sửa tuyến: tên / điểm đi-đến luôn được; cự ly → kỳ nháp phải tính lại; kỳ đã xác nhận cần quyền + lý do, kết quả đã lưu không đổi', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const cs = new CatalogService(store); const rs = new ReportService(store);
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id;
  let r = store.get('TUYEN_VC', 'VC.007');
  // đổi tên / điểm đi-đến: không ảnh hưởng số → không bắt tính lại
  let s = await cs.saveRoute({ record: { routeCode: 'VC.007', routeName: 'Xã Quế Sơn - Cảng Tiên Sa', toPlace: 'Cảng Tiên Sa, TP Đà Nẵng' }, rowVersion: r.row_version, user: KETOAN });
  assert.deepEqual(s.affectedPeriods, []); assert.equal(store.get('KY_TINH', pid).needs_recalc, false);
  assert.match(rs.invoice({ periodId: pid }).rows[0].description, /Cảng Tiên Sa, TP Đà Nẵng|BKS : 43H-01021$/);
  await assert.rejects(cs.saveRoute({ record: { routeCode: 'VC.007', routeName: 'x' }, user: KETOAN }), /rowVersion/);
  // đổi cự ly chuyến khi kỳ còn nháp → cần tính lại, tính lại ra giá mới
  r = store.get('TUYEN_VC', 'VC.007');
  s = await cs.saveRoute({ record: { routeCode: 'VC.007', tripDistanceKm: 150 }, rowVersion: r.row_version, user: KETOAN });
  assert.deepEqual(s.affectedPeriods, [pid]); assert.equal(store.get('KY_TINH', pid).needs_recalc, true);
  const k2 = await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.notEqual(k2.results[0].transportPrice, 178000);
  // trả lại 144, tính lại, xác nhận
  r = store.get('TUYEN_VC', 'VC.007');
  await cs.saveRoute({ record: { routeCode: 'VC.007', tripDistanceKm: 144 }, rowVersion: r.row_version, user: KETOAN });
  const k3 = await periods.calculate({ contractId, ...WEEK, periodId: pid, clientRequestId: rid(), user: KETOAN });
  assert.equal(k3.results[0].transportPrice, 178000);
  await periods.confirm({ periodId: pid, user: KETOAN });
  const before = rs.bkvc({ periodId: pid }).totals;
  // kỳ đã xác nhận: kế toán không có quyền mở khóa → chặn; ADMIN phải có lý do
  r = store.get('TUYEN_VC', 'VC.007');
  await rejects(cs.saveRoute({ record: { routeCode: 'VC.007', tripDistanceKm: 146 }, rowVersion: r.row_version, user: KETOAN }), 'BUSINESS_RULE', 'E_ROUTE_IN_CONFIRMED');
  await assert.rejects(cs.saveRoute({ record: { routeCode: 'VC.007', tripDistanceKm: 146 }, rowVersion: r.row_version, user: ADMIN }), /lý do/);
  s = await cs.saveRoute({ record: { routeCode: 'VC.007', tripDistanceKm: 146 }, rowVersion: r.row_version, reason: 'Đo lại cự ly theo lộ trình mới', user: ADMIN });
  assert.ok(s.warnings.some((w) => w.code === 'W_ROUTE_CHANGED_AFTER_CONFIRM'));
  assert.deepEqual(rs.bkvc({ periodId: pid }).totals, before, 'kỳ đã xác nhận giữ nguyên kết quả đã lưu');
  assert.equal(rs.pricing({ periodId: pid }).rows[0].trip_distance_km, 144);
  const log = store.find('AUDIT_LOG', (a) => a.entity === 'TUYEN_VC' && a.action === 'UPDATE').pop();
  assert.equal(log.reason, 'Đo lại cự ly theo lộ trình mới'); assert.deepEqual(JSON.parse(log.before_json), { trip_distance_km: 144 });
  store.close();
});

test('Ngừng dùng tuyến: không xóa cứng; cấm khi đang có kỳ nháp', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const cs = new CatalogService(store);
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  await rejects(cs.setRouteActive({ routeCode: 'VC.007', active: false, user: KETOAN }), 'BUSINESS_RULE', 'E_IN_USE');
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const r = await cs.setRouteActive({ routeCode: 'VC.007', active: false, reason: 'Hết chạy tuyến', user: KETOAN });
  assert.equal(r.record.is_active, false); assert.ok(store.get('TUYEN_VC', 'VC.007'));
  assert.equal(cs.listRoutes().items.some((x) => x.route_code === 'VC.007'), false);
  assert.equal(cs.listRoutes({ includeInactive: true }).items.find((x) => x.route_code === 'VC.007').usedInPeriods, 1);
  await assert.rejects(cs.createPriceVersion({ record: { routeCode: 'VC.007', effectiveFrom: '2026-10-01', newPrice: 1, fuelPriceExclVat: 1, fuelNormLPerKm: 0.4, avgLoadTon: 18 }, user: KETOAN }), /ngừng dùng/);
  store.close();
});

test('Phiên bản giá: bản nháp không ảnh hưởng; kích hoạt tự đóng bản trước; không đổi giá sau lưng kỳ đã xác nhận', async () => {
  const { store, periods, contractId } = await install('HAKQN');
  const cs = new CatalogService(store);
  const new_ = (from, price) => cs.createPriceVersion({ record: { routeCode: 'VC.007', effectiveFrom: from, newPrice: price, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 }, user: KETOAN });
  await rejects(new_('2025-07-10', 170000), 'BUSINESS_RULE', 'E_PRICE_DATE_OVERLAP');
  const d = await new_('2026-09-21', 170000);
  assert.equal(d.record.price_id, 'PR-VC.007-v2');
  assert.equal(periods.preview({ contractId, ...WEEK }).results[0].transportPrice, 178000, 'bản DRAFT không dùng để tính');
  const upd = await cs.updatePriceDraft({ priceId: d.record.price_id, record: { newPrice: 172000 }, rowVersion: d.record.row_version, user: KETOAN });
  assert.equal(upd.record.new_price, 172000);
  // kỳ nháp 18–23 đang dùng v1 → kích hoạt v2 từ 21/09: kỳ nháp phải tính lại (và sẽ báo cắt ngang 2 phiên bản)
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  // kỳ đã xác nhận có ngày 21–23 dùng v1 → không cho kích hoạt v2 từ 21/09
  await rejects(cs.activatePrice({ priceId: d.record.price_id, user: KETOAN }), 'BUSINESS_RULE', 'E_PRICE_USED');
  // tạo bản từ 01/10 (sau kỳ đã xác nhận) → kích hoạt được, v1 đóng 30/09
  const v3 = await new_('2026-10-01', 170000);
  const a = await cs.activatePrice({ priceId: v3.record.price_id, rowVersion: v3.record.row_version, user: KETOAN });
  assert.deepEqual(a.closed, [{ priceId: 'PR-VC.007-v1', effectiveTo: '2026-09-30' }]);
  assert.equal(store.get('PRICE_HISTORY', 'PR-VC.007-v1').status, 'CLOSED');
  await rejects(cs.updatePriceDraft({ priceId: 'PR-VC.007-v1', record: { newPrice: 1 }, user: KETOAN }), 'BUSINESS_RULE', 'E_PRICE_USED');
  // tuần 18–23/09 vẫn giá cũ; tuần 01–06/10 lấy giá mới
  const sel = (from, to) => E.selectPriceVersion(store.all('PRICE_HISTORY'), 'VC.007', contractId, from, to, E.buildConfig(store.all('CONFIG'))).price.price_id;
  assert.equal(sel('2026-09-18', '2026-09-23'), 'PR-VC.007-v1'); assert.equal(sel('2026-10-01', '2026-10-06'), 'PR-VC.007-v3');
  assert.deepEqual(cs.listPrices({ routeCode: 'VC.007' }).items.map((p) => [p.price_id, p.status, p.contractPrice]),
    [['PR-VC.007-v1', 'CLOSED', 115000], ['PR-VC.007-v2', 'DRAFT', E.computeContractPrice(store.get('TUYEN_VC', 'VC.007'), store.get('PRICE_HISTORY', 'PR-VC.007-v2'), E.buildConfig(store.all('CONFIG'))).contractPrice],
      ['PR-VC.007-v3', 'ACTIVE', E.computeContractPrice(store.get('TUYEN_VC', 'VC.007'), store.get('PRICE_HISTORY', 'PR-VC.007-v3'), E.buildConfig(store.all('CONFIG'))).contractPrice]]);
  store.close();
});

test('Bản cài của nhà máy nào cũng sửa được danh mục, được nhắc sửa các nhà máy còn lại; người ký theo thứ tự ưu tiên', async () => {
  const { store, periods, contractId } = await install('HAK');
  const cs = new CatalogService(store);
  const r = await cs.saveRoute({ create: true, record: { routeCode: 'VC.016', routeName: 'Bà Nà - Tiên Sa (mới)', distanceKm: 30 }, user: KETOAN });
  assert.equal(r.warnings[0].code, 'I_SYNC_REMINDER'); assert.deepEqual(r.warnings[0].targets, ['HAKQN', 'DH', 'CNHAK']);
  assert.equal(store.all('SYNC_REMINDER').length, 1);
  // HAK (ưu tiên 1) → HAKQN (2): HAK ký VÕ VĂN PHỤNG – Giám đốc, HAKQN ký VÕ THỊ NHƯ NGỌC – Phó Giám đốc (chốt 25/09/2026, không theo mẫu cũ 11/2025)
  const k = await periods.calculate({ contractId, ...WEEK, clientRequestId: rid(), user: KETOAN });
  const s = new ReportService(store).bkvc({ periodId: k.period.period_id }).signers;
  assert.deepEqual([s.carrier.unitCode, s.carrier.signer.name, s.carrier.signer.title], ['HAK', 'VÕ VĂN PHỤNG', 'Giám đốc']);
  assert.deepEqual([s.customer.unitCode, s.customer.signer.name, s.customer.signer.title], ['HAKQN', 'VÕ THỊ NHƯ NGỌC', 'Phó Giám đốc']);
  store.close();
});

test('Đơn giá tham khảo: không dùng tính, có số thì bắt buộc ghi nguồn; danh mục đi kèm ghi rõ nguồn TBL_DATA', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const cs = new CatalogService(store);
  const v1 = store.get('PRICE_HISTORY', 'PR-VC.007-v1');
  assert.equal(v1.base_price_excl_vat, 150000);
  assert.equal(v1.base_price_source, 'File Excel Dongiavanchuyen_24.09 · bảng TBL_DATA · cột "Đơn Giá (chưa VAT)" · ngày cập nhật 10/07/2025');
  const rec = { routeCode: 'VC.007', effectiveFrom: '2026-10-01', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 };
  // xem trước không bắt nguồn; đổi đơn giá tham khảo không đổi ĐG HĐ
  const a = cs.previewPrice({ record: { ...rec, basePriceExclVat: 150000 } }); const b = cs.previewPrice({ record: { ...rec, basePriceExclVat: 999999 } });
  assert.equal(a.contractPrice, 115000); assert.equal(b.contractPrice, 115000);
  await assert.rejects(cs.createPriceVersion({ record: { ...rec, basePriceExclVat: 150000 }, user: KETOAN }), /phải ghi nguồn tham khảo/);
  const ok = await cs.createPriceVersion({ record: { ...rec, basePriceExclVat: 150000, basePriceSource: 'Phụ lục HĐ số 02/2026 ngày 20/09/2026' }, user: KETOAN });
  assert.equal(ok.record.base_price_source, 'Phụ lục HĐ số 02/2026 ngày 20/09/2026');
  const none = await cs.createPriceVersion({ record: { ...rec, effectiveFrom: '2026-10-02' }, user: KETOAN });
  assert.deepEqual([none.record.base_price_excl_vat, none.record.base_price_source], ['', ''], 'không nhập thì để trống, không tự chép Đơn giá cước');
  store.close();
});

test('Căn cứ tính giá ký hợp đồng = đúng QR_DATA (2) của Power Query cho 12 tuyến; giá riêng hợp đồng thay giá chung; xuất Excel có công thức', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const rs = new ReportService(store);
  const b = rs.contractBasis({ asOf: '2026-09-25' });
  // bảng CALCULATION_RULES §2.8 (mô phỏng Power Query)
  const PQ = { 'VC.002': 52000, 'VC.003': 70000, 'VC.008': 87000, 'VC.007': 115000, 'VC.009': 64000, 'VC.010': 91000, 'VC.004': 136000, 'VC.005': 163000, 'VC.012': 8000, 'VC.014': 38000, 'VC.013': 46000, 'VC.015': 51000 };
  assert.deepEqual(Object.fromEntries(b.rows.map((r) => [r.routeCode, r.contractPrice])), PQ);
  const v9 = b.rows.find((r) => r.routeCode === 'VC.009');
  assert.deepEqual([v9.newPrice, v9.tripPrice, v9.fuelCostPerTrip, Math.round(v9.priceNoDiesel * 100) / 100], [91667, 1650006, 496000, 64111.44], 'Đơn giá mới ép Int64 như PQ');

  // giá riêng của hợp đồng HAKQN-QS cho VC.007
  const cs = new CatalogService(store);
  const v = await cs.createPriceVersion({ record: { routeCode: 'VC.007', contractId: 'HD-HAKQN-QS', effectiveFrom: '2026-10-01', newPrice: 170000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 }, user: KETOAN });
  await cs.activatePrice({ priceId: v.record.price_id, rowVersion: v.record.row_version, user: KETOAN });
  const c = rs.contractBasis({ contractId: 'HD-HAKQN-QS', asOf: '2026-10-05' });
  const r7 = c.rows.find((r) => r.routeCode === 'VC.007');
  assert.deepEqual([r7.source, r7.contractPrice], ['Giá riêng hợp đồng', 120000]);
  assert.equal(c.rows.find((r) => r.routeCode === 'VC.002').source, 'Giá chung');
  assert.ok(c.signers && c.customer, 'có hợp đồng → khối ký 2 bên');
  assert.match(rs.html({ report: 'CONTRACT_BASIS', params: { contractId: 'HD-HAKQN-QS', asOf: '2026-10-05' } }), /CĂN CỨ TÍNH ĐƠN GIÁ VẬN CHUYỂN KÝ HỢP ĐỒNG/);
  const f = require('node:path').join(require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'cc-')), 'cc.xlsx');
  await rs.export({ report: 'CONTRACT_BASIS', format: 'XLSX', params: { asOf: '2026-09-25' }, targetPath: f });
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const ws = wb.getWorksheet('CAN_CU_GIA_HD'); let found = null;
  ws.eachRow((row) => { if (row.getCell(2).value === 'VC.007') found = row; });
  assert.equal(found.getCell(15).value.formula, `ROUND(N${found.number},-3)`); assert.equal(found.getCell(15).value.result, 115000);
  assert.ok(!wb.getWorksheet('POWER_QUERY'), 'không còn sheet diễn giải Power Query');
  store.close();
});
