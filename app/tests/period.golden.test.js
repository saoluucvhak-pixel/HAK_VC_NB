'use strict';
/** Đối chiếu Engine JS với (1) bảng QR_DGVC (2) + BKVC trong 3 file Excel và (2) bộ tính tham chiếu Python — khớp TUYỆT ĐỐI (===). */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { loadDataFolder, fixture } = require('./helpers');

const EXCEL = fixture('excel_expected.json');
const GOLD = fixture('golden_periods.json');
const CASES = [['HAKQN', 'HD-HAKQN-QS'], ['DH', 'HD-DH-HAKQN'], ['HAK', 'HD-HAK-HAKQN']];

function run(inst, contractId, params = {}) {
  const { manifest, rows } = loadDataFolder(inst);
  const contract = rows.HOP_DONG.find((c) => c.contract_id === contractId);
  return E.calculatePeriod({
    contract, contractVehicles: rows.HOP_DONG_XE, units: rows.DON_VI, routes: rows.TUYEN_VC, prices: rows.PRICE_HISTORY,
    tickets: rows.PHIEU_CAN, receipts: rows.GIAO_NHAN_DAU, installUnitCode: manifest.unitCode, cfg: E.buildConfig(rows.CONFIG),
    params: { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', ...params },
  });
}

for (const [inst, cid] of CASES) {
  test(`${inst} — 9 chỉ tiêu khớp bảng QR_DGVC (2) của Excel`, () => {
    const out = run(inst, cid);
    assert.equal(out.canCalculate, true, JSON.stringify(out.issues.filter((i) => i.level === 'ERROR')));
    const r = out.results[0]; const x = EXCEL[inst];
    assert.equal(r.tripCount, x['Số chuyến']);
    assert.equal(r.totalTon, x['Tổng KL (Tấn)']);
    assert.equal(r.actualFuelLiter, x['Dầu Diezel thực nhận']);
    assert.equal(r.standardFuelLiter, x['Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)']);
    assert.equal(r.fuelDiffLiter, x['CL Tiêu hao Diezel ']);
    assert.equal(r.fuelPrice, x['Đơn giá dầu']);
    assert.equal(r.contractPrice, x['Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu)']);
    assert.equal(r.fuelAdjustPrice, x['Đơn giá CL Diezel']);
    assert.equal(r.transportPrice, x['Đơn giá vận chuyển']);
    assert.equal(r.startDate, x['Ngày bắt đầu']);
    assert.equal(r.endDate, x['Ngày kết thúc']);
    assert.equal(r.fuelImportDate, x['Ngày nhập dầu']);
    assert.equal(r.tripDistanceKm, x['Cự ly tuyến']);
  });

  test(`${inst} — mọi trường khớp bộ tính tham chiếu Python`, () => {
    const out = run(inst, cid); const r = out.results[0]; const g = GOLD[inst];
    const map = { trip_count: 'tripCount', total_kg: 'totalKg', total_ton: 'totalTon', actual_fuel_liter: 'actualFuelLiter', fuel_price: 'fuelPrice',
      standard_fuel_liter: 'standardFuelLiter', fuel_diff_liter: 'fuelDiffLiter', fuel_adjust_price: 'fuelAdjustPrice', transport_price_raw: 'transportPriceRaw',
      transport_price: 'transportPrice', trip_price: 'tripPrice', fuel_per_trip: 'fuelPerTrip', fuel_cost_per_trip: 'fuelCostPerTrip', fuel_cost_ratio: 'fuelCostRatio',
      price_no_diesel: 'priceNoDiesel', contract_price: 'contractPrice', start_date: 'startDate', end_date: 'endDate', fuel_start_date: 'fuelStartDate',
      fuel_end_date: 'fuelEndDate', fuel_import_date: 'fuelImportDate', fuel_line_count: 'fuelLineCount', price_id: 'priceId', trip_distance_km: 'tripDistanceKm' };
    for (const [py, js] of Object.entries(map)) assert.equal(r[js], g.result[py], py);
    assert.deepEqual(r.trace.steps.map((s) => s.value), g.trace);
    assert.deepEqual([...r.ticketIds].sort(), g.ticketIds);
    assert.deepEqual([...r.receiptIds].sort(), g.receiptIds);
    assert.deepEqual(out.issues.map((i) => i.code).filter((c) => g.issueCodes.includes(c)).sort(), g.issueCodes);
    const L = out.bkvc.lines;
    assert.equal(L.length, g.lines.length);
    g.lines.forEach((gl, i) => {
      assert.equal(L[i].plateNo, gl.plate_no); assert.equal(L[i].tripCount, gl.trip_count); assert.equal(L[i].kg, gl.kg);
      assert.equal(L[i].amount, gl.amount); assert.equal(L[i].vat, gl.vat); assert.equal(L[i].amountInclVat, gl.amount_incl_vat);
    });
    assert.equal(out.bkvc.totals.amount, g.totals.amount); assert.equal(out.bkvc.totals.vat, g.totals.vat); assert.equal(out.bkvc.totals.total, g.totals.total);
  });
}

test('HAKQN — BKVC so với sheet BKVC của Excel: chuyến, KG, thành tiền trùng; VAT/tổng chỉ lệch do làm tròn đến đồng (đã chốt)', () => {
  const out = run('HAKQN', 'HD-HAKQN-QS'); const x = EXCEL.HAKQN_BKVC;
  const byPlate = new Map(out.bkvc.lines.map((l) => [l.plateNo, l]));
  let maxVatDiff = 0;
  for (const [plate, trips, kg, amount, vat] of x.lines) {
    const l = byPlate.get(plate);
    assert.ok(l, plate); assert.equal(l.tripCount, trips); assert.equal(l.kg, kg);
    assert.ok(Math.abs(l.amount - amount) < 0.01, `${plate} thành tiền ${l.amount} vs ${amount}`);
    assert.ok(Math.abs(l.vat - vat) <= 0.5, `${plate} VAT ${l.vat} vs ${vat}`);
    maxVatDiff = Math.max(maxVatDiff, Math.abs(l.vat - vat));
  }
  const [trips, kg, , amount, vat, total] = x.totals;
  assert.equal(out.bkvc.totals.trips, trips); assert.equal(out.bkvc.totals.kg, kg);
  assert.equal(out.bkvc.totals.amount, amount);
  assert.equal(out.bkvc.totals.vat, 87486003);   // Excel 87.486.003,2
  assert.equal(out.bkvc.totals.total, 1181061043); // Excel 1.181.061.043,2
  assert.ok(Math.abs(out.bkvc.totals.total - total) < 0.5);
  assert.ok(maxVatDiff <= 0.5);
  assert.equal(out.bkvc.amountInWords, 'Một tỷ, một trăm tám mươi mốt triệu, không trăm sáu mươi mốt ngàn, không trăm bốn mươi ba đồng y ./.');
});

test('XEM CHI TIẾT TÍNH — HAKQN-QS đủ 15 bước, thay số đúng', () => {
  const s = run('HAKQN', 'HD-HAKQN-QS').results[0].trace.steps;
  assert.equal(s.length, 15);
  assert.equal(s[0].expr, '165.000 × 18');
  assert.equal(s[10].expr, '144 × 326 × 0,4');
  assert.equal(s[12].expr, '12.924,60 × 29.940,00 / 6.143,68');
  assert.equal(s[14].expr, 'ROUND(177.985,46; -2)');
  assert.equal(s[14].value, 178000);
  assert.equal(s[6].drill, 'calc.tickets');
});
