'use strict';
/** Quy tắc nghiệp vụ & trường hợp biên — dựng từ dữ liệu thật rồi thay đổi đúng 1 điểm mỗi test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { loadDataFolder } = require('./helpers');

const clone = (x) => JSON.parse(JSON.stringify(x));
const BASE = loadDataFolder('HAKQN');

function ctx(mut = () => {}) {
  const rows = clone(BASE.rows);
  const c = { rows, installUnitCode: 'HAKQN', contractId: 'HD-HAKQN-QS', params: { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' },
              ticketUsages: [], fuelUsages: [], periods: [] };
  mut(c);
  return E.calculatePeriod({
    contract: c.rows.HOP_DONG.find((x) => x.contract_id === c.contractId), contractVehicles: c.rows.HOP_DONG_XE, units: c.rows.DON_VI,
    routes: c.rows.TUYEN_VC, prices: c.rows.PRICE_HISTORY, tickets: c.rows.PHIEU_CAN, receipts: c.rows.GIAO_NHAN_DAU,
    ticketUsages: c.ticketUsages, fuelUsages: c.fuelUsages, periods: c.periods, installUnitCode: c.installUnitCode,
    cfg: E.buildConfig(c.rows.CONFIG), params: c.params,
  });
}
const codes = (out) => out.issues.map((i) => i.code);

test('Bản cài không phải bên vận chuyển → E_NOT_CARRIER, không tính ("nhà thầu nào làm vận chuyển nhà thầu đó")', () => {
  const out = ctx((c) => { c.contractId = 'HD-DH-HAKQN'; });
  assert.equal(out.canCalculate, false);
  assert.ok(codes(out).includes('E_NOT_CARRIER'));
});

test('Hợp đồng hết hiệu lực trong kỳ → E_CONTRACT_INACTIVE', () => {
  const out = ctx((c) => { c.rows.HOP_DONG.find((x) => x.contract_id === 'HD-HAKQN-QS').effective_to = '2026-09-20'; });
  assert.ok(codes(out).includes('E_CONTRACT_INACTIVE'));
});

test('Chống tính trùng: phiếu đã ở kỳ ĐÃ XÁC NHẬN của cùng HĐ bị loại, kèm đúng câu thông báo', () => {
  const t0 = BASE.rows.PHIEU_CAN[0];
  const out = ctx((c) => {
    c.periods = [{ period_id: 'KY-HAKQN-000001', period_code: 'HAKQN-QS/20260915-20260917' }];
    c.ticketUsages = [{ contract_id: 'HD-HAKQN-QS', ticket_id: t0.ticket_id, period_id: 'KY-HAKQN-000001', is_current: true, usage_state: 'CONFIRMED' }];
  });
  assert.equal(out.results[0].tripCount, 325);
  assert.equal(out.blocked.length, 1);
  assert.equal(out.blocked[0].message, 'Phiếu cân này đã được sử dụng trong kỳ tính HAKQN-QS/20260915-20260917. Không thể đưa vào kỳ mới.');
});

test('Cùng phiếu ở kỳ đã khóa của HĐ KHÁC → vẫn dùng được (1 phiếu thuộc nhiều hợp đồng)', () => {
  const t0 = BASE.rows.PHIEU_CAN[0];
  const out = ctx((c) => { c.ticketUsages = [{ contract_id: 'HD-DH-HAKQN', ticket_id: t0.ticket_id, period_id: 'KY-DH-000001', is_current: true, usage_state: 'LOCKED' }]; });
  assert.equal(out.results[0].tripCount, 326);
  assert.equal(out.blocked.length, 0);
});

test('Phiếu đang ở kỳ NHÁP khác: mặc định không lấy + cảnh báo; bật moveFromDraft thì lấy và báo kỳ cũ cần tính lại', () => {
  const t0 = BASE.rows.PHIEU_CAN[0];
  const use = [{ contract_id: 'HD-HAKQN-QS', ticket_id: t0.ticket_id, period_id: 'KY-HAKQN-000009', is_current: true, usage_state: 'DRAFT' }];
  const a = ctx((c) => { c.ticketUsages = use; });
  assert.equal(a.results[0].tripCount, 325);
  assert.ok(codes(a).includes('W_TICKET_IN_DRAFT_PERIOD'));
  const b = ctx((c) => { c.ticketUsages = use; c.params.moveFromDraft = true; });
  assert.equal(b.results[0].tripCount, 326);
  assert.deepEqual(b.affectedPeriods, ['KY-HAKQN-000009']);
});

test('Tính lại chính kỳ đó (periodId trùng) không tự chặn phiếu của mình', () => {
  const t0 = BASE.rows.PHIEU_CAN[0];
  const out = ctx((c) => {
    c.params.periodId = 'KY-HAKQN-000001';
    c.ticketUsages = [{ contract_id: 'HD-HAKQN-QS', ticket_id: t0.ticket_id, period_id: 'KY-HAKQN-000001', is_current: true, usage_state: 'DRAFT' }];
  });
  assert.equal(out.results[0].tripCount, 326);
});

test('Không có dầu → E_NO_FUEL chặn; xác nhận override + đơn giá dầu → tính với dầu = 0', () => {
  const a = ctx((c) => { c.rows.GIAO_NHAN_DAU = []; });
  assert.equal(a.canCalculate, false); assert.ok(codes(a).includes('E_NO_FUEL'));
  const b = ctx((c) => { c.rows.GIAO_NHAN_DAU = []; c.params.overrides = [{ code: 'E_NO_FUEL', routeCode: 'VC.007', reason: 'xe tự đổ dầu' }]; });
  assert.ok(codes(b).includes('E_NO_FUEL_PRICE'));
  const d = ctx((c) => { c.rows.GIAO_NHAN_DAU = []; c.params.overrides = [{ code: 'E_NO_FUEL', routeCode: 'VC.007', reason: 'xe tự đổ dầu', fuelPrice: 29940 }]; });
  assert.equal(d.canCalculate, true);
  assert.equal(d.results[0].actualFuelLiter, 0);
  assert.ok(codes(d).includes('W_OVERRIDE_NO_FUEL'));
});

test('Dầu từ 2 bên giao trong 1 tuyến → E_MULTI_FUEL_GROUP (Excel sẽ nhân dòng)', () => {
  const out = ctx((c) => { c.rows.GIAO_NHAN_DAU[0].giver_unit_code = 'HAK'; });
  assert.ok(codes(out).includes('E_MULTI_FUEL_GROUP'));
});

test('Đơn giá VC âm → 0 và cảnh báo W_FLOORED_ZERO', () => {
  const out = ctx((c) => { c.rows.GIAO_NHAN_DAU[0].qty_liter = 60000; });
  assert.equal(out.results[0].transportPrice, 0);
  assert.ok(out.results[0].transportPriceRaw < 0);
  assert.ok(codes(out).includes('W_FLOORED_ZERO'));
});

test('Không có phiên bản giá hiệu lực → E_PRICE_NOT_FOUND; kỳ cắt ngang 2 phiên bản → E_PRICE_VERSION_SPLIT', () => {
  const a = ctx((c) => { c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007').effective_from = '2026-10-01'; });
  assert.ok(codes(a).includes('E_PRICE_NOT_FOUND'));
  const b = ctx((c) => {
    const v1 = c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007'); v1.effective_to = '2026-09-20';
    c.rows.PRICE_HISTORY.push({ ...v1, price_id: 'PR-VC.007-v2', version_no: 2, effective_from: '2026-09-21', effective_to: '', new_price: 170000 });
  });
  assert.ok(codes(b).includes('E_PRICE_VERSION_SPLIT'));
});

test('Giá riêng của hợp đồng ưu tiên hơn giá chung', () => {
  const out = ctx((c) => {
    const v1 = c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007');
    c.rows.PRICE_HISTORY.push({ ...v1, price_id: 'PR-VC.007-HAKQN-QS-v1', contract_id: 'HD-HAKQN-QS', new_price: 170000 });
  });
  assert.equal(out.results[0].priceId, 'PR-VC.007-HAKQN-QS-v1');
  assert.equal(out.results[0].newPrice, 170000);
});

test('Danh mục sai: định mức ≤ 0, cự ly ≤ 0, KL_TB ≤ 0, đơn giá âm → lỗi chặn đúng mã', () => {
  const a = ctx((c) => { c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007').fuel_norm_l_per_km = 0; });
  assert.ok(codes(a).includes('E_FUEL_NORM_INVALID'));
  const b = ctx((c) => { c.rows.TUYEN_VC.find((r) => r.route_code === 'VC.007').trip_distance_km = 0; });
  assert.ok(codes(b).includes('E_DISTANCE_INVALID'));
  const d = ctx((c) => { c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007').avg_load_ton = 0; });
  assert.ok(codes(d).includes('E_AVG_LOAD_INVALID'));
  const e = ctx((c) => { c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007').new_price = -1; });
  assert.ok(codes(e).includes('E_PRICE_NEGATIVE'));
  const f = ctx((c) => { c.rows.PRICE_HISTORY.find((p) => p.route_code === 'VC.007').fuel_norm_l_per_km = null; });
  assert.ok(codes(f).includes('E_FUEL_NORM_MISSING'));
});

test('Phiếu thiếu mã tuyến / mã tuyến không tồn tại → báo lỗi, không lặng lẽ bỏ qua', () => {
  const a = ctx((c) => { c.rows.PHIEU_CAN[0].route_code = ''; c.params.routeCode = ''; });
  assert.ok(codes(a).includes('E_ROUTE_MISSING'));
  const b = ctx((c) => { c.rows.PHIEU_CAN[0].route_code = 'VC.999'; c.params.routeCode = ''; });
  assert.ok(codes(b).includes('E_ROUTE_NOT_FOUND'));
});

test('Tổng KL = 0 → E_TOTAL_KG_ZERO', () => {
  const out = ctx((c) => { c.rows.PHIEU_CAN.forEach((t) => { t.net_kg = 0; t.weight2_kg = t.weight1_kg; }); });
  assert.ok(codes(out).includes('E_TOTAL_KG_ZERO'));
});

test('Loại phiếu / dòng dầu theo yêu cầu người dùng', () => {
  const t = BASE.rows.PHIEU_CAN.slice(0, 2).map((x) => x.ticket_id);
  const f = BASE.rows.GIAO_NHAN_DAU[0];
  const out = ctx((c) => { c.params.excludeTicketIds = t; c.params.excludeReceiptIds = [f.receipt_id]; });
  assert.equal(out.results[0].tripCount, 324);
  assert.equal(out.results[0].actualFuelLiter, 5853 - f.qty_liter);
});

test('Cảnh báo dữ liệu thật: 5 xe không có dầu, 6 phiếu qua đêm', () => {
  const out = ctx();
  assert.equal(codes(out).filter((c) => c === 'W_VEHICLE_NO_FUEL').length, 5);
  assert.equal(out.issues.find((i) => i.code === 'W_OVERNIGHT').params.count, 6);
});

test('KL ≠ Cân 2 − Cân 1 → W_KG_MISMATCH', () => {
  const out = ctx((c) => { c.rows.PHIEU_CAN[0].net_kg += 10; });
  assert.ok(codes(out).includes('W_KG_MISMATCH'));
});

test('Đổi cấu hình (không sửa code): mức làm tròn đơn giá và thuế suất VAT theo tham số', () => {
  const out = ctx((c) => { c.rows.CONFIG.find((x) => x.config_key === 'ROUND_FINAL_DIGITS').config_value = '-3'; });
  assert.equal(out.results[0].transportPrice, 178000);
  const out2 = ctx((c) => { c.rows.CONFIG.find((x) => x.config_key === 'ROUND_FINAL_DIGITS').config_value = '0'; });
  assert.equal(out2.results[0].transportPrice, 177985);
  const out3 = ctx((c) => { c.rows.CONFIG.find((x) => x.config_key === 'VAT_RATE').config_value = '0.1'; });
  assert.equal(out3.bkvc.lines[0].vat, 6408178);
});

test('Lọc theo Ngày cân 1 (mặc định): kỳ 18–22/09 không lấy phiếu cân 1 ngày 23/09', () => {
  const out = ctx((c) => { c.params.dateTo = '2026-09-22'; });
  const n23 = BASE.rows.PHIEU_CAN.filter((t) => t.weigh1_date === '2026-09-23').length;
  assert.equal(out.results[0].tripCount, 326 - n23);
});
