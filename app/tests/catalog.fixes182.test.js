'use strict';
/** Rà soát 1.8.2 — prices.createVersion có priceCode cũng phải đúng hình thức của mã (trước đây tạo được dòng nháp THEO_DAU trong mã CO_DINH). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

test('createPriceVersion: dòng trái hình thức mã → VALIDATION_FAILED; đúng hình thức → tạo được', async () => {
  const { store, contractId } = await install('DH', { withData: false }); const cat = new CatalogService(store);
  const unit = store.get('HOP_DONG', contractId).customer_unit_code;
  await cat.savePriceCode({ create: true, record: { priceCode: 'DG-CD', unitCode: unit, priceName: 'x' }, user: KETOAN });
  await assert.rejects(cat.createPriceVersion({ record: { routeCode: 'VC.007', priceCode: 'DG-CD', priceMethod: 'THEO_DAU', newPrice: 200000, fuelPriceExclVat: 20000, fuelNormLPerKm: 0.5, avgLoadTon: 25, effectiveFrom: '2026-01-01' }, user: KETOAN }),
    (e) => e.code === 'VALIDATION_FAILED');
  assert.equal(store.find('PRICE_HISTORY', (p) => p.price_code === 'DG-CD').length, 0, 'không để lại dòng nháp rác');
  const ok = await cat.createPriceVersion({ record: { routeCode: 'VC.007', priceCode: 'DG-CD', priceMethod: 'CO_DINH', fixedPrice: 150000, effectiveFrom: '2026-01-01' }, user: KETOAN });
  assert.equal(ok.record.price_method, 'CO_DINH');
});
