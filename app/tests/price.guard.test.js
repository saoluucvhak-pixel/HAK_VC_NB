'use strict';
/** Cảnh báo sớm khi nhập dòng giá theo giá dầu sai: đơn giá cước quá nhỏ (thiếu dấu chấm nghìn) hoặc công thức ra đơn giá ≤ 0. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, storageKinds, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

const OK = { routeCode: 'VC.007', effectiveFrom: '2026-01-01', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.38, avgLoadTon: 24 };
for (const kind of storageKinds()) {
  test(`[${kind}] đơn giá cước dự kiến 150 (thiếu 000) → từ chối rõ ràng; giá hợp lệ vẫn lưu được; công thức ra ≤ 0 → từ chối`, async () => {
    const { store } = await install('DH', { kind, withData: false });
    const cat = new CatalogService(store); await cat.backfillCodeMethods({ user: { username: 'system' } });
    await assert.rejects(cat.addCodeLine({ priceCode: 'PT-TD', record: { ...OK, newPrice: 150 }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED' && /quá nhỏ/.test(e.message));
    // đơn giá cước đủ lớn nhưng dầu "ăn" hết: ĐG ký HĐ ≤ 0
    await assert.rejects(cat.addCodeLine({ priceCode: 'PT-TD', record: { ...OK, newPrice: 1500, fuelPriceExclVat: 900000 }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED' && /≤ 0/.test(e.message));
    const ok = await cat.addCodeLine({ priceCode: 'PT-TD', record: OK, user: KETOAN }); assert.ok(ok.record.price_id);
    store.close();
  });
}
