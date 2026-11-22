'use strict';
/** ĐG ký HĐ nhập tay (contract_price) phải đi vào tính kỳ; để trống thì tự tính theo công thức như cũ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const own = (cp, from = '2026-06-01') => ({ routeCode: 'VC.007', priceMethod: 'THEO_DAU', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: from, ...(cp === undefined ? {} : { contractPrice: cp }) });

test('contract_price nhập tay → kỳ tính dùng đúng số tay; để trống → bằng số tự tính', async () => {
  const { store, periods, contractId } = await install('DH'); const cat = new CatalogService(store);
  const mk = async (cp, contract, from) => { const r = await cat.createPriceVersion({ record: { ...own(cp, from), contractId: contract }, user: KETOAN }); await cat.activatePrice({ priceId: r.record.price_id, rowVersion: r.record.row_version, user: KETOAN }); return r.record; };
  const auto = await mk(undefined, contractId);
  const rAuto = periods.preview({ contractId, ...W }).results[0];
  assert.equal(auto.contract_price === '' || auto.contract_price == null, true, 'để trống = tự tính');
  assert.ok(rAuto.contractPrice > 0);
  const manual = await mk(rAuto.contractPrice + 1000, contractId, '2026-07-01');
  assert.equal(Number(manual.contract_price), rAuto.contractPrice + 1000);
  const rMan = periods.preview({ contractId, ...W }).results[0];
  assert.equal(rMan.contractPrice, rAuto.contractPrice + 1000, 'tính kỳ dùng ĐG ký HĐ nhập tay');
  assert.equal(rMan.trace.priceId, manual.price_id);
});
