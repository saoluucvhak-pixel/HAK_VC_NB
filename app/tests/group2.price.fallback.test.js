'use strict';
/**
 * Nhóm 2 (sau rà soát ruflo): giá chung cũ đã mang mã mặc định PT-TD/PT-CD khi nâng cấp 1.9.0 — không được làm mất giá của
 * hợp đồng không dùng mã mặc định, báo cáo "Báo cáo giá hợp đồng" phải khớp engine, gói trao đổi không sinh xung đột giả.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../main/engine');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ReportService } = require('../main/reports/ReportService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };

test('Hợp đồng gán mã tự tạo (chưa có dòng cho tuyến) vẫn dùng giá chung cũ sau khi giá chung được gắn PT-TD', async () => {
  const { store, periods, contractId } = await install('DH'); const cat = new CatalogService(store);
  const before = periods.preview({ contractId, ...W }).results[0];
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  const unit = store.get('HOP_DONG', contractId).customer_unit_code;
  await cat.savePriceCode({ create: true, record: { priceCode: 'DG-X', unitCode: unit, priceName: 'Mã thử', priceMethod: 'CO_DINH' }, user: KETOAN });
  await store.transaction((tx) => { tx.update('HOP_DONG', contractId, { price_code: 'DG-X' }); }, { user: 'test' });
  const after = periods.preview({ contractId, ...W }).results[0];
  assert.equal(after.resultStatus, before.resultStatus); assert.equal(after.transportPrice, before.transportPrice, 'mã chưa có dòng cho tuyến → dùng giá cũ, đúng số');
  await store.transaction((tx) => { tx.update('HOP_DONG', contractId, { price_code: '' }); }, { user: 'test' });
  assert.equal(periods.preview({ contractId, ...W }).results[0].transportPrice, before.transportPrice, 'bỏ mã khỏi hợp đồng cũng vẫn có giá');
});

test('Báo cáo giá hợp đồng: giá chung (không chọn hợp đồng) vẫn đủ tuyến sau chuyển; hợp đồng PT-TD có giá riêng → báo cáo ra giá riêng như engine', async () => {
  const { store, contractId } = await install('DH'); const cat = new CatalogService(store);
  const rep = new ReportService(store);
  const n0 = rep.contractBasis({ asOf: '2026-09-20' }).rows.length; assert.ok(n0 > 0);
  const own = await cat.createPriceVersion({ record: { routeCode: 'VC.007', contractId, priceMethod: 'CO_DINH', fixedPrice: 95500, effectiveFrom: '2026-09-01' }, user: KETOAN });
  await cat.activatePrice({ priceId: own.record.price_id, rowVersion: own.record.row_version, user: KETOAN });
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  assert.equal(rep.contractBasis({ asOf: '2026-09-20' }).rows.length, n0, 'không chọn hợp đồng: không mất tuyến nào');
  const row = rep.contractBasis({ contractId, asOf: '2026-09-20' }).rows.find((r) => r.routeCode === 'VC.007');
  assert.equal(row.contractPrice, 95500); assert.equal(row.priceId, own.record.price_id);
  const sel = E.selectPriceVersion(store.all('PRICE_HISTORY'), 'VC.007', contractId, '2026-09-20', '2026-09-20', E.buildConfig(store.all('CONFIG')), 'PT-TD');
  assert.equal(sel.price.price_id, own.record.price_id, 'báo cáo và engine chọn cùng một dòng giá');
});
