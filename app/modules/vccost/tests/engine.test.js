'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { round } = require('../src/utils/money');
const { normalizePlate, displayPlate, isValidPlate } = require('../src/utils/plate');
const { parseDateTime, diffMinutes } = require('../src/utils/datetime');
const { computeFuelAdjustment } = require('../src/services/FuelAdjustmentService');
const { resolvePrice } = require('../src/services/PriceResolver');
const { VehicleResolver } = require('../src/services/VehicleResolver');
const { computeTicket, aggregate } = require('../src/services/TransportCostEngine');
const { classify, businessKey, fingerprint } = require('../src/services/DuplicateDetector');
const { buildTimeline } = require('../src/services/TimeAnomalyService');
const { detectHeader } = require('../src/excel/columnMapping');

// ---------- dữ liệu dùng chung ----------
const rules = [
  { id: 1, tuyen_id: 10, don_vi_van_chuyen_id: null, loai_hang: null, tu_ngay: '2025-04-10', den_ngay: '2026-09-17', don_gia_ap_dung: 96000, don_vi_tinh: 'DONG_TAN', vat_percent: 8, trang_thai: 'ACTIVE' },
  { id: 2, tuyen_id: 10, don_vi_van_chuyen_id: null, loai_hang: null, tu_ngay: '2026-09-18', den_ngay: null, don_gia_ap_dung: 116700, don_vi_tinh: 'DONG_TAN', vat_percent: 8, trang_thai: 'ACTIVE' },
];
const vr = new VehicleResolver([
  { bien_so_chuan: '43H-01021', don_vi_van_chuyen_id: 'HAK', tu_ngay: null, den_ngay: '2026-09-30' },
  { bien_so_chuan: '43H-01021', don_vi_van_chuyen_id: 'QC', tu_ngay: '2026-10-01', den_ngay: null },
  { bien_so_chuan: '92C-07938', don_vi_van_chuyen_id: 'HHH', tu_ngay: null, den_ngay: null },
]);
const ctx = (over = {}) => ({ vehicleResolver: vr, routeResolver: (nx, nd) => (nx === 'DH' && nd === 'TIENSA' ? { status: 'OK', routeId: 10 } : { status: 'UNKNOWN_ROUTE', routeId: null }), priceRules: rules, settings: { roundingLevel: 'TICKET', rounding: { amount: { digits: 0 }, vat: { digits: 0 }, total: { digits: 0 } } }, ...over });
const tk = (o = {}) => ({ id: 1, so_phieu: '1', ngay_gio_can_1: '2026-10-01T08:00:00', bien_so: '92C-07938', kl_hang_kg: 20090, noi_xuat_id: 'DH', noi_den_id: 'TIENSA', ...o });

// ---------- tiện ích ----------
test('làm tròn giống Excel ROUND (kể cả số âm, digits âm)', () => {
  assert.equal(round(14324, -2).toNumber(), 14300);
  assert.equal(round(14350, -2).toNumber(), 14400);
  assert.equal(round(-14350, -2).toNumber(), -14400);
  assert.equal(round(20690.5263, 0).toNumber(), 20691);
  assert.equal(round(2.5, 0).toNumber(), 3);
});

test('chuẩn hóa biển số: các cách viết khác nhau về cùng mã', () => {
  for (const s of ['43H-01021', '43H 01021', '43H.01021', '43h01021', ' 43H-010.21 ']) assert.equal(normalizePlate(s), '43H01021');
  assert.equal(displayPlate('92h00903'), '92H-00903');
  assert.equal(displayPlate('34K9190'), '34K-9190');
  assert.equal(displayPlate('29H112345'), '29H1-12345');
  assert.ok(isValidPlate('43H-01021'));
  assert.ok(!isValidPlate('ABC'));
});

test('đọc ngày giờ dd/mm/yyyy hh:mm:ss, serial Excel, và từ chối ngày sai', () => {
  assert.equal(parseDateTime('28/09/2026 13:16:04'), '2026-09-28T13:16:04');
  assert.equal(parseDateTime('18.09.2026'), '2026-09-18T00:00:00');
  assert.equal(parseDateTime(46293.5), '2026-09-28T12:00:00');
  assert.equal(parseDateTime('31/13/2026 10:00:00'), null);
  assert.equal(diffMinutes('2026-10-01T23:50:00', '2026-10-02T00:10:00'), 20);
});

// ---------- giá dầu ----------
test('điều chỉnh giá dầu khớp Excel: NM Đại Hiệp → 116.700', () => {
  const r = computeFuelAdjustment({ basePrice: 96000, baseFuelPrice: 17240, fuelPrices: [31640, 31640, 31640, 31640, 31640, 31640], distanceKm: 78, fuelNormPer100km: 35, avgTonPerTrip: 19 });
  assert.equal(r.fuelLitPerTrip, 27.3);
  assert.equal(r.adjustmentPerTon, 20691);
  assert.equal(r.adjustmentFinal, 20700);
  assert.equal(r.appliedPrice, 116700);
});

test('giá dầu thay đổi → đơn giá đổi; giá dầu giảm → điều chỉnh âm', () => {
  const base = { basePrice: 96000, baseFuelPrice: 17240, distanceKm: 78, fuelNormPer100km: 35, avgTonPerTrip: 19 };
  assert.equal(computeFuelAdjustment({ ...base, currentFuelPrice: 20000 }).appliedPrice, 96000 + 4000);   // 27.3*2760/19=3965.7→3966→4000
  assert.equal(computeFuelAdjustment({ ...base, currentFuelPrice: 15000 }).appliedPrice, 96000 - 3200);   // 27.3*-2240/19=-3218.5→-3218→-3200
  // tham số không hard-code: đổi định mức / tấn bình quân cho kết quả khác
  assert.notEqual(computeFuelAdjustment({ ...base, currentFuelPrice: 31640, fuelNormPer100km: 30 }).appliedPrice, 116700);
  assert.throws(() => computeFuelAdjustment({ ...base, currentFuelPrice: 31640, avgTonPerTrip: 0 }));
});

// ---------- bảng giá ----------
test('bảng giá theo ngày & giá thay đổi giữa kỳ', () => {
  assert.equal(resolvePrice({ routeId: 10, date: '2026-09-17' }, rules).rule.id, 1);
  assert.equal(resolvePrice({ routeId: 10, date: '2026-09-18' }, rules).rule.id, 2);
});

test('không có bảng giá → NO_PRICE; nhiều bảng giá cùng mức → MULTIPLE_PRICE (không tự chọn)', () => {
  assert.equal(resolvePrice({ routeId: 10, date: '2025-01-01' }, rules).status, 'NO_PRICE');
  const dup = [...rules, { ...rules[1], id: 3, don_gia_ap_dung: 120000 }];
  const r = resolvePrice({ routeId: 10, date: '2026-10-01' }, dup);
  assert.equal(r.status, 'MULTIPLE_PRICE');
  assert.equal(r.candidates.length, 2);
});

test('bảng giá riêng của đơn vị VC ưu tiên hơn bảng giá chung (quy tắc xác định, không tùy ý)', () => {
  const rr = [...rules, { ...rules[1], id: 4, don_vi_van_chuyen_id: 'HHH', don_gia_ap_dung: 110000 }];
  assert.equal(resolvePrice({ routeId: 10, carrierId: 'HHH', date: '2026-10-01' }, rr).rule.id, 4);
  assert.equal(resolvePrice({ routeId: 10, carrierId: 'QC', date: '2026-10-01' }, rr).rule.id, 2);
});

test('bảng giá ngừng (INACTIVE) không được dùng', () => {
  const rr = rules.map((r) => (r.id === 2 ? { ...r, trang_thai: 'INACTIVE' } : r));
  assert.equal(resolvePrice({ routeId: 10, date: '2026-10-01' }, rr).status, 'NO_PRICE');
});

// ---------- xe ----------
test('xe chưa xác định → UNKNOWN_VEHICLE, không tự gán đơn vị', () => {
  const r = computeTicket(tk({ bien_so: '99Z-99999' }), ctx());
  assert.equal(r.status, 'UNKNOWN_VEHICLE');
  assert.equal(r.don_vi_van_chuyen_id, null);
});

test('xe đổi đơn vị theo thời gian (lịch sử từ/đến ngày)', () => {
  assert.equal(vr.resolve('43h01021', '2026-09-30').carrierId, 'HAK');
  assert.equal(vr.resolve('43H 01021', '2026-10-01').carrierId, 'QC');
});

// ---------- tính tiền ----------
test('kg → tấn, thành tiền, VAT lấy từ bảng giá (không hard-code 8%)', () => {
  const r = computeTicket(tk(), ctx());
  assert.equal(r.kl_hang_tan, 20.09);
  assert.equal(r.don_gia, 116700);
  assert.equal(r.tien_truoc_vat, 2344503);     // 20.09 * 116700 = 2,344,503
  assert.equal(r.tien_vat, 187560);            // 187,560.24 → 187,560
  assert.equal(r.tong_tien, 2532063);
  const r10 = computeTicket(tk(), ctx({ priceRules: rules.map((x) => ({ ...x, vat_percent: 10 })) }));
  assert.equal(r10.tien_vat, 234450);          // 234,450.3
});

test('đơn giá theo chuyến (đồng/chuyến)', () => {
  const r = computeTicket(tk(), ctx({ priceRules: [{ ...rules[1], don_vi_tinh: 'DONG_CHUYEN', don_gia_ap_dung: 1500000 }] }));
  assert.equal(r.tien_truoc_vat, 1500000);
});

test('KL không hợp lệ / nơi xuất lạ được đánh dấu, không tính tiền', () => {
  assert.equal(computeTicket(tk({ kl_hang_kg: 0 }), ctx()).status, 'INVALID_WEIGHT');
  assert.equal(computeTicket(tk({ noi_xuat_id: 'XX' }), ctx()).status, 'UNKNOWN_LOCATION');
});

test('phiếu đã chốt: trả snapshot, không tính lại dù bảng giá đổi', () => {
  const snap = { don_gia: 116700, tien_truoc_vat: 2344503, tien_vat: 187560, tong_tien: 2532063, price_rule_id: 2 };
  const r = computeTicket(tk({ locked_snapshot: snap }), ctx({ priceRules: [{ ...rules[1], don_gia_ap_dung: 999999 }] }));
  assert.equal(r.status, 'LOCKED');
  assert.equal(r.don_gia, 116700);
});

test('tổng hợp GROUP (giống Excel) vs TICKET', () => {
  const list = [tk({ id: 1, kl_hang_kg: 18333 }), tk({ id: 2, kl_hang_kg: 17777 })];
  const g = { roundingLevel: 'GROUP', rounding: {} };
  const resG = list.map((t) => computeTicket(t, ctx({ settings: g })));
  const [aggG] = aggregate(resG, () => 'x', g);
  assert.equal(aggG.so_chuyen, 2);
  assert.equal(aggG.tong_kg, 36110);
  assert.equal(aggG.tien_truoc_vat, 4214037);   // 36,11 t × 116.700
  const resT = list.map((t) => computeTicket(t, ctx()));
  const [aggT] = aggregate(resT, () => 'x', ctx().settings);
  assert.equal(aggT.tien_truoc_vat, 2139461 + 2074576);  // từng phiếu đã làm tròn
});

// ---------- trùng ----------
test('import cùng file 2 lần không tạo trùng; khác dữ liệu → KEY_CONFLICT', () => {
  const rows = [
    { so_phieu: '1387', bien_so: '92C-07938', ngay_gio_can_1: '2026-09-28T13:16:04', kl_hang_kg: 20090, noi_xuat: 'Quế Sơn' },
    { so_phieu: '1493', bien_so: '43H-30057', ngay_gio_can_1: '2026-09-29T01:44:44', kl_hang_kg: 18790, noi_xuat: 'Quế Sơn' },
  ];
  assert.deepEqual(classify(rows, new Map()).map((x) => x.status), ['NEW', 'NEW']);
  const db = new Map(rows.map((r, i) => [businessKey(r), { id: i + 1, ...r, fingerprint: fingerprint(r) }]));
  assert.deepEqual(classify(rows, db).map((x) => x.status), ['EXACT_DUPLICATE', 'EXACT_DUPLICATE']);
  const changed = [{ ...rows[0], kl_hang_kg: 20100 }, { ...rows[1], bien_so: '43h 30057' }];
  const c = classify(changed, db);
  assert.equal(c[0].status, 'KEY_CONFLICT');
  assert.deepEqual(c[0].diffs.map((d) => d.field), ['kl_hang_kg']);
  assert.equal(c[1].status, 'EXACT_DUPLICATE'); // chỉ khác cách viết biển số → cùng xe
});

test('cùng số phiếu nhưng khác nơi xuất là 2 phiếu khác nhau; trùng trong cùng file bị bắt', () => {
  const a = { so_phieu: '100', bien_so: '43H-01021', ngay_gio_can_1: '2026-10-01T08:00:00', kl_hang_kg: 1, noi_xuat: 'Quế Sơn' };
  const b = { ...a, noi_xuat: 'Đại Hiệp' };
  assert.deepEqual(classify([a, b, a], new Map()).map((x) => x.status), ['NEW', 'NEW', 'IN_FILE_DUPLICATE']);
});

// ---------- thời gian ----------
test('timeline xe: thời gian cân, khoảng cách chuyến, cảnh báo', () => {
  const tl = buildTimeline([
    { so_phieu: 'B', ngay_gio_can_1: '2026-10-01T15:20:31', ngay_gio_can_2: '2026-10-01T15:34:20', can_lan_1: 13920, can_lan_2: 30820 },
    { so_phieu: 'A', ngay_gio_can_1: '2026-10-01T11:16:25', ngay_gio_can_2: '2026-10-01T15:20:21', can_lan_1: 32690, can_lan_2: 13920 },
  ]);
  assert.equal(tl[0].so_phieu, 'A');
  assert.ok(tl[0].flags.includes('REVERSE_WEIGHING'));
  assert.ok(tl[0].flags.includes('LONG_WEIGH_DURATION'));
  assert.ok(Math.abs(tl[1].khoang_cach_chuyen_phut - 10 / 60) < 1e-9);
  assert.ok(tl[1].flags.includes('SHORT_GAP'));
});

// ---------- import ----------
test('tự dò header không nằm ở dòng 1 và nhận tên cột đồng nghĩa', () => {
  const aoa = [['TỔNG HỢP'], [null], ['STT', 'Số chứng từ', 'Ngày cân 1', 'Số xe', 'Khối lượng', 'Nơi xuất'], [1, 'X1', '01/10/2026 08:00:00', '43H01021', 18000, 'Quế Sơn']];
  const h = detectHeader(aoa);
  assert.equal(h.headerRow, 2);
  assert.equal(h.mapping.so_phieu, 1);
  assert.equal(h.mapping.bien_so, 3);
  assert.equal(h.mapping.kl_hang_kg, 4);
});

// ---------- bảng kê (làm tròn theo bảng kê) ----------
const { buildStatement } = require('../src/services/StatementService');
test('bảng kê: làm tròn từng dòng giá, VAT tính 1 lần trên tổng', () => {
  const mk = (kg, gia, tuyen, bs) => ({ kl_hang_kg: kg, don_gia: gia, tuyen_id: tuyen, don_vi_tinh: 'DONG_TAN', vat_percent: 8, bien_so: bs, status: 'OK' });
  const st = buildStatement([mk(18333, 116700, 1, 'A'), mk(17777, 116700, 1, 'B'), mk(20090, 206500, 2, 'A'), { ...mk(1000, null, 2, 'C'), don_gia: null, status: 'NO_PRICE' }]);
  assert.equal(st.lines.length, 2);
  assert.equal(st.lines[0].thanh_tien, 4214037);          // 36,11 t × 116.700
  assert.equal(st.lines[1].thanh_tien, 4148585);          // 20,09 × 206.500 = 4.148.585
  assert.equal(st.tien_truoc_vat, 8362622);
  assert.equal(st.tien_vat, 669010);                      // 669.009,76 → 669.010
  assert.equal(st.tong_tien, 9031632);
  assert.equal(st.so_chuyen_chua_tinh_gia, 1);
  assert.equal(st.vehicles.length, 3);
});

test('bảng kê: làm tròn VAT xuống nếu cấu hình DOWN', () => {
  const st = buildStatement([{ kl_hang_kg: 20090, don_gia: 116700, tuyen_id: 1, don_vi_tinh: 'DONG_TAN', vat_percent: 8, bien_so: 'A', status: 'OK' }],
    { rounding: { vat: { digits: 0, mode: 'DOWN' } } });
  assert.equal(st.tien_vat, 187560);                      // 187.560,24
});
