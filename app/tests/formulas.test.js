'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { loadDataFolder } = require('./helpers');

const { rows } = loadDataFolder('HAKQN');
const cfg = E.buildConfig(rows.CONFIG);
const route = (c) => rows.TUYEN_VC.find((r) => r.route_code === c);
const price = (c) => rows.PRICE_HISTORY.find((p) => p.route_code === c);

test('Tầng A — VC.007 từng bước như Power Query QR_DATA (2)', () => {
  const a = E.computeContractPrice(route('VC.007'), price('VC.007'), cfg);
  assert.equal(a.tripPrice, 2970000);          // 165.000 × 18
  assert.equal(a.fuelPerTrip, 57.6);           // 144 × 0,4
  assert.equal(a.fuelCostPerTrip, 892800);     // 15.500 × 57,6
  assert.equal(a.priceNoDiesel, 115400);       // (2.970.000 − 892.800) / 18
  assert.equal(a.contractPrice, 115000);       // ROUND(−3)
  assert.ok(Math.abs(a.fuelCostRatio - 0.3006060606) < 1e-9);
});

test('Tầng A — ĐG_HĐ cả 12 tuyến khớp bảng CALCULATION_RULES §2.8', () => {
  const want = { 'VC.002': 52000, 'VC.003': 70000, 'VC.008': 87000, 'VC.007': 115000, 'VC.009': 64000, 'VC.010': 91000,
                 'VC.004': 136000, 'VC.005': 163000, 'VC.012': 8000, 'VC.014': 38000, 'VC.013': 46000, 'VC.015': 51000 };
  for (const [code, v] of Object.entries(want)) {
    assert.equal(E.computeContractPrice(route(code), price(code), cfg).contractPrice, v, code);
  }
});

test('Ép Int64 như PQ: VC.009 Đơn giá mới 91.666,66667 → 91.667; VC.004 194.791,6667 → 194.792', () => {
  assert.equal(E.computeContractPrice(route('VC.009'), price('VC.009'), cfg).newPrice, 91667);
  assert.equal(E.computeContractPrice(route('VC.004'), price('VC.004'), cfg).tripPrice, 3506256);
});

test('Tuyến M3 (VC.015): ĐG 1 chuyến theo Thể tích TB, chia KL_TB như Excel', () => {
  const a = E.computeContractPrice(route('VC.015'), price('VC.015'), cfg);
  assert.equal(a.tripPrice, 25000 * 57.82);
  assert.equal(a.contractPrice, 51000);
});

test('Tầng B — công thức rời', () => {
  assert.equal(E.calculateStandardFuel({ tripDistanceKm: 144, tripCount: 326, fuelNormLPerKm: 0.4 }), 18777.600000000002);
  assert.equal(E.calculateFuelDifference({ standardFuelLiter: 18777.600000000002, actualFuelLiter: 5853 }), 12924.600000000002);
  assert.equal(E.calculateFuelAdjustment({ fuelDiffLiter: 12924.600000000002, fuelPrice: 29940, totalTon: 6143.68 }), 62985.46213344446);
  assert.deepEqual(E.calculateTransportPrice({ contractPrice: 115000, fuelAdjustPrice: 62985.46213344446 }, cfg), { raw: 177985.46213344447, floored: false, value: 178000 });
  assert.deepEqual(E.calculateTransportPrice({ contractPrice: 115000, fuelAdjustPrice: -120000 }, cfg), { raw: -5000, floored: true, value: 0 });
});

test('Giữ đúng thứ tự nhân như Power Query ([Cự ly chuyến]*[Số chuyến]*[ĐM]): 54 × 3 × 0,4 = 64,8 (không phải 64,80000000000001)', () => {
  assert.equal(E.calculateStandardFuel({ tripDistanceKm: 54, tripCount: 3, fuelNormLPerKm: 0.4 }), 54 * 3 * 0.4);
  assert.equal(E.calculateStandardFuel({ tripDistanceKm: 54, tripCount: 3, fuelNormLPerKm: 0.4 }), 64.8);
});

test('Đơn giá dầu = trung bình cộng (đã chốt), không gia quyền', () => {
  const rs = [{ qty_liter: 100, fuel_price_excl_vat: 28480 }, { qty_liter: 300, fuel_price_excl_vat: 29940 }];
  assert.equal(E.calculateFuelPrice(rs, cfg), 29210);
  assert.equal(E.calculateFuelPrice(rs, { ...cfg, fuelPriceMethod: 'WEIGHTED' }), 29575);
});

test('Tầng C — dòng BKVC làm tròn đến đồng', () => {
  assert.deepEqual(E.calculateConfirmationLine({ kg: 360010, unitPrice: 178000, vatRate: 0.08 }, cfg),
    { ton: 360.01, amount: 64081780, vat: 5126542, amountInclVat: 69208322 });
  // Excel để 64.585.519,99999999 (lỗi số thực) → APP 64.585.520
  assert.equal(E.calculateConfirmationLine({ kg: 362840, unitPrice: 178000, vatRate: 0.08 }, cfg).amount, 64585520);
});
