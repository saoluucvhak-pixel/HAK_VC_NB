'use strict';
/** Giá 3 tầng (đợt 2, Task 5): hợp đồng liệt kê từng tuyến kèm NGUỒN GIÁ — đúng thứ tự ưu tiên của selectPriceVersion; chỉ đọc, không đổi tính giá. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { MasterDataService } = require('../main/services/MasterDataService');

async function setup() {
  const ctx = await install('HAKQN', { withData: false }); const cat = new CatalogService(ctx.store); const md = new MasterDataService(ctx.store);
  const ct = () => ctx.store.get('HOP_DONG', ctx.contractId); const unit = ct().customer_unit_code;
  const mkCode = (code, over = {}) => cat.savePriceCode({ create: true, record: { priceCode: code, unitCode: unit, priceName: 'Mã thử', ...over }, user: KETOAN });
  const addLine = async (code, rec) => { const r = await cat.addCodeLine({ priceCode: code, record: { effectiveFrom: '2026-01-01', ...rec }, user: KETOAN }); await cat.activatePrice({ priceId: r.record.price_id, rowVersion: r.record.row_version, user: KETOAN }); return r.record; };
  const assign = (code) => md.saveContract({ record: { contractId: ctx.contractId, priceCode: code }, rowVersion: ct().row_version, user: KETOAN });
  return { ...ctx, cat, md, unit, mkCode, addLine, assign, src: () => cat.contractRouteSources({ contractId: ctx.contractId }).items };
}
const by = (items, rc) => items.find((x) => x.routeCode === rc);

test('Hợp đồng không gán mã: toàn GENERAL (giá chung); có giá riêng hợp đồng → CONTRACT', async () => {
  const s = await setup();
  assert.ok(s.src().length >= 3); assert.ok(s.src().every((x) => x.source === 'GENERAL' && !x.priceCode), 'không gán mã → toàn giá chung');
  const own = await s.cat.createPriceVersion({ record: { routeCode: 'VC.002', contractId: s.contractId, priceMethod: 'THEO_DAU', newPrice: 90000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: '2026-06-01' }, user: KETOAN });
  await s.cat.activatePrice({ priceId: own.record.price_id, rowVersion: own.record.row_version, user: KETOAN });
  const it = by(s.src(), 'VC.002'); assert.equal(it.source, 'CONTRACT'); assert.equal(it.priceId, own.record.price_id); assert.equal(by(s.src(), 'VC.009').source, 'GENERAL');
});

test('Hợp đồng gán mã CO_DINH có VC.007: VC.007 = CODE (kèm mã + hình thức + priceId); VC.009 không có trong mã → GENERAL', async () => {
  const s = await setup(); await s.mkCode('DG-CD'); const line = await s.addLine('DG-CD', { routeCode: 'VC.007', fixedPrice: 150000 }); await s.assign('DG-CD');
  const a = by(s.src(), 'VC.007'); assert.deepEqual({ source: a.source, priceCode: a.priceCode, priceMethod: a.priceMethod, priceId: a.priceId }, { source: 'CODE', priceCode: 'DG-CD', priceMethod: 'CO_DINH', priceId: line.price_id });
  assert.ok(a.routeName); const b = by(s.src(), 'VC.009'); assert.equal(b.source, 'GENERAL'); assert.equal(b.priceCode, ''); assert.equal(b.priceMethod, 'THEO_DAU');
});

test('Mã theo giá dầu; mã ưu tiên hơn giá riêng hợp đồng (đúng thứ tự selectPriceVersion); chỉ xét dòng đang hiệu lực hôm nay', async () => {
  const s = await setup(); await s.mkCode('DG-TD', { priceMethod: 'THEO_DAU' });
  await s.addLine('DG-TD', { routeCode: 'VC.002', newPrice: 99000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18 });
  await s.addLine('DG-TD', { routeCode: 'VC.003', newPrice: 99000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: '2099-01-01' }); // chưa hiệu lực
  const own = await s.cat.createPriceVersion({ record: { routeCode: 'VC.002', contractId: s.contractId, priceMethod: 'THEO_DAU', newPrice: 90000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: '2026-06-01' }, user: KETOAN });
  await s.cat.activatePrice({ priceId: own.record.price_id, rowVersion: own.record.row_version, user: KETOAN }); await s.assign('DG-TD');
  const a = by(s.src(), 'VC.002'); assert.equal(a.source, 'CODE'); assert.equal(a.priceMethod, 'THEO_DAU');
  assert.equal(by(s.src(), 'VC.003').source, 'GENERAL', 'dòng của mã chưa hiệu lực → vẫn giá chung');
});

test('Chỉ đọc: gọi contractRouteSources không đổi dữ liệu; hợp đồng không có → NOT_FOUND', async () => {
  const s = await setup(); const fp = s.store.fingerprint().sha256; s.src(); assert.equal(s.store.fingerprint().sha256, fp);
  assert.throws(() => s.cat.contractRouteSources({ contractId: 'KHONG-CO' }), (e) => e.code === 'NOT_FOUND');
});

test('P5: saveContract không gửi priceCode thì KHÔNG đổi / xóa mã đã gán; gửi priceCode mới thì đổi', async () => {
  const s = await setup(); await s.mkCode('DG-CD'); await s.addLine('DG-CD', { routeCode: 'VC.007', fixedPrice: 150000 }); await s.assign('DG-CD');
  await s.md.saveContract({ record: { contractId: s.contractId, note: 'sửa ghi chú, không gửi priceCode' }, rowVersion: s.store.get('HOP_DONG', s.contractId).row_version, user: KETOAN });
  assert.equal(s.store.get('HOP_DONG', s.contractId).price_code, 'DG-CD', 'mã đã gán còn nguyên');
  await s.assign(''); assert.equal(s.store.get('HOP_DONG', s.contractId).price_code, '', 'gửi priceCode rỗng chủ động → bỏ mã');
});

test('B1: mã đơn giá chỉ gán được khi thuộc đối tác của hợp đồng; mã của đối tác khác bị từ chối rõ ràng', async () => {
  const s = await setup(); const other = s.store.all('DON_VI').find((u) => u.unit_code !== s.unit && u.unit_code !== s.store.get('HOP_DONG', s.contractId).carrier_unit_code);
  await s.cat.savePriceCode({ create: true, record: { priceCode: 'DG-KHAC', unitCode: other.unit_code, priceName: 'Mã của đối tác khác' }, user: KETOAN });
  await assert.rejects(() => s.assign('DG-KHAC'), (e) => e.code === 'VALIDATION_FAILED' && /không phải bên thuê/.test(e.message));
  const list = s.cat.listPriceCodes({ unitCode: s.unit }).items; assert.ok(list.every((c) => c.unit_code === s.unit) && !list.some((c) => c.price_code === 'DG-KHAC'));
});
