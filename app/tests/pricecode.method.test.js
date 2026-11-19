'use strict';
/** Giá 3 tầng — Hình thức (CO_DINH | THEO_DAU) ở MÃ ĐƠN GIÁ. Không đổi cách tính giá. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { MasterDataService } = require('../main/services/MasterDataService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
async function setup() {
  const ctx = await install('DH'); const { store, periods, contractId } = ctx;
  const cat = new CatalogService(store); const md = new MasterDataService(store);
  const ct = () => store.get('HOP_DONG', contractId); const unit = ct().customer_unit_code;
  const calc = (extra = {}) => periods.calculate({ contractId, ...W, clientRequestId: rid(), user: KETOAN, ...extra });
  const mkCode = (code, over = {}) => cat.savePriceCode({ create: true, record: { priceCode: code, unitCode: unit, priceName: 'Mã thử', ...over }, user: KETOAN });
  const assign = (code) => md.saveContract({ record: { contractId, priceCode: code }, rowVersion: ct().row_version, user: KETOAN });
  return { ...ctx, cat, md, ct, unit, calc, mkCode, assign };
}
const THEO_DAU = { routeCode: 'VC.007', effectiveFrom: '2026-01-01', newPrice: 200000, fuelPriceExclVat: 20000, fuelNormLPerKm: 0.5, avgLoadTon: 25 };

test('(a) tạo mã không truyền hình thức → CO_DINH; mã cũ (cột rỗng) đọc ra CO_DINH', async () => {
  const s = await setup();
  const r = await s.mkCode('DG-A'); assert.equal(r.record.priceMethod, 'CO_DINH');
  // mã 1.5.0: không có cột price_method
  await s.store.transaction((tx) => { tx.insert('MA_DON_GIA', { price_code: 'DG-OLD', unit_code: s.unit, price_name: 'Mã cũ', status: 'ACTIVE', note: '' }); }, { user: 'test' });
  assert.equal(s.cat.getPriceCode({ priceCode: 'DG-OLD' }).record.priceMethod, 'CO_DINH');
  assert.equal(s.cat.listPriceCodes().items.find((c) => c.price_code === 'DG-OLD').priceMethod, 'CO_DINH');
});

test('listPriceCodes trả methods: 2 nhóm cố định / theo dầu, giữ units + items', async () => {
  const s = await setup();
  await s.mkCode('DG-CD'); await s.mkCode('DG-TD', { priceMethod: 'THEO_DAU' });
  const l = s.cat.listPriceCodes();
  assert.deepEqual(l.methods.map((m) => m.method), ['CO_DINH', 'THEO_DAU']);
  assert.ok(l.methods.every((m) => m.label));
  assert.deepEqual(l.methods[0].codes.map((c) => c.price_code), ['DG-CD']);
  assert.deepEqual(l.methods[1].codes.map((c) => c.price_code), ['DG-TD']);
  assert.ok(Array.isArray(l.units) && l.items.length === 2 && l.total === 2);
});

test('(b) mã THEO_DAU + dòng trái hình thức → VALIDATION_FAILED; mã CO_DINH + dòng theo dầu → VALIDATION_FAILED', async () => {
  const s = await setup();
  await s.mkCode('DG-TD', { priceMethod: 'THEO_DAU' }); await s.mkCode('DG-CD');
  await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-TD', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', priceMethod: 'CO_DINH', fixedPrice: 150000 }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-CD', record: { ...THEO_DAU, priceMethod: 'THEO_DAU' }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  // không truyền hình thức → ép theo mã
  const ok = await s.cat.addCodeLine({ priceCode: 'DG-TD', record: THEO_DAU, user: KETOAN });
  assert.equal(ok.record.price_method, 'THEO_DAU');
});

test('(c) mã THEO_DAU cho CÙNG kết quả tính như giá chung cùng tham số (đến từng đồng)', async () => {
  const s = await setup();
  const general = await s.calc(); const pid = general.period.period_id;
  const gp = s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && p.status === 'ACTIVE' && !p.price_code && !p.contract_id)[0];
  assert.ok(gp && gp.price_method !== 'CO_DINH');
  const snap = (k) => ({ price: k.results[0].transportPrice, bkvc: JSON.stringify(k.bkvc), results: JSON.stringify(k.results.map(({ priceId, trace, ...r }) => ({ ...r, trace: { ...trace, priceId: undefined } }))) });
  const before = snap(general);
  await s.mkCode('DG-TD', { priceMethod: 'THEO_DAU' });
  const l = await s.cat.addCodeLine({ priceCode: 'DG-TD', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', newPrice: gp.new_price, fuelPriceExclVat: gp.fuel_price_excl_vat, fuelNormLPerKm: gp.fuel_norm_l_per_km, avgLoadTon: gp.avg_load_ton, avgVolumeM3: gp.avg_volume_m3 }, user: KETOAN });
  await s.cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  await s.assign('DG-TD');
  const viaCode = await s.calc({ periodId: pid });
  assert.deepEqual(snap(viaCode), before);
  assert.equal(s.store.find('TRANSPORT_CALCULATION', (c) => c.period_id === pid && c.is_current)[0].price_id, l.record.price_id, 'kỳ dùng dòng giá của mã');
});

test('(d) đổi hình thức khi mã đã có dòng → lỗi; chưa có dòng/hợp đồng thì đổi được', async () => {
  const s = await setup();
  const c = await s.mkCode('DG-X');
  const ch = await s.cat.savePriceCode({ record: { priceCode: 'DG-X', unitCode: s.unit, priceName: 'Mã thử', priceMethod: 'THEO_DAU' }, rowVersion: c.record.row_version, user: KETOAN });
  assert.equal(ch.record.priceMethod, 'THEO_DAU');
  await s.cat.addCodeLine({ priceCode: 'DG-X', record: THEO_DAU, user: KETOAN });
  await assert.rejects(() => s.cat.savePriceCode({ record: { priceCode: 'DG-X', unitCode: s.unit, priceName: 'Mã thử', priceMethod: 'CO_DINH' }, rowVersion: ch.record.row_version, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  // sửa tên không đổi hình thức vẫn được (không truyền priceMethod)
  const again = await s.cat.savePriceCode({ record: { priceCode: 'DG-X', unitCode: s.unit, priceName: 'Tên mới' }, rowVersion: ch.record.row_version, user: KETOAN });
  assert.equal(again.record.priceMethod, 'THEO_DAU');
});

test('(e) lưu rồi đọc lại hình thức (kho đang chạy: JSON hoặc SQLite)', async () => {
  const s = await setup();
  await s.mkCode('DG-TD', { priceMethod: 'THEO_DAU' });
  assert.equal(s.store.get('MA_DON_GIA', 'DG-TD').price_method, 'THEO_DAU');
  assert.equal(s.cat.getPriceCode({ priceCode: 'DG-TD' }).record.priceMethod, 'THEO_DAU');
});

test('hình thức lạ → VALIDATION_FAILED', async () => {
  const s = await setup();
  await assert.rejects(() => s.mkCode('DG-Z', { priceMethod: 'KHAC' }), (e) => e.code === 'VALIDATION_FAILED');
});

test('sao chép giá có sẵn khác hình thức: mã trống nhận hình thức của dòng đầu; mã đã có dòng thì từ chối', async () => {
  const s = await setup();
  const src = s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && !p.contract_id && !p.price_code && p.status === 'ACTIVE')[0];
  await s.mkCode('DG-EMPTY'); // mặc định CO_DINH, còn trống
  const l = await s.cat.addCodeLine({ priceCode: 'DG-EMPTY', fromPriceId: src.price_id, record: { effectiveFrom: '2027-01-01' }, user: KETOAN });
  assert.equal(l.record.price_method, 'THEO_DAU');
  assert.equal(s.cat.getPriceCode({ priceCode: 'DG-EMPTY' }).record.priceMethod, 'THEO_DAU');
  await s.mkCode('DG-FIX'); await s.cat.addCodeLine({ priceCode: 'DG-FIX', record: { routeCode: 'VC.002', effectiveFrom: '2027-01-01', fixedPrice: 99000 }, user: KETOAN });
  await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-FIX', fromPriceId: src.price_id, record: { effectiveFrom: '2027-01-01' }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
});

test('ngày cập nhật của dòng trong mã: điền lùi ≤ bản đang dùng → E_PRICE_DATE_OVERLAP; bản sau ngày → áp dụng thì bản cũ đóng', async () => {
  const s = await setup();
  await s.mkCode('DG-OV', { priceMethod: 'THEO_DAU' });
  const first = await s.cat.addCodeLine({ priceCode: 'DG-OV', record: THEO_DAU, user: KETOAN });
  await s.cat.activatePrice({ priceId: first.record.price_id, rowVersion: first.record.row_version, user: KETOAN });
  for (const d of ['2026-01-01', '2025-12-31']) {
    await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-OV', record: { ...THEO_DAU, effectiveFrom: d }, user: KETOAN }), (e) => e.code === 'BUSINESS_RULE' && (e.details || e.extra || {}).code === 'E_PRICE_DATE_OVERLAP');
  }
  const next = await s.cat.addCodeLine({ priceCode: 'DG-OV', record: { ...THEO_DAU, newPrice: 210000, effectiveFrom: '2026-06-01' }, user: KETOAN });
  await s.cat.activatePrice({ priceId: next.record.price_id, rowVersion: next.record.row_version, user: KETOAN });
  const old = s.store.get('PRICE_HISTORY', first.record.price_id);
  assert.equal(old.status, 'CLOSED'); assert.ok(old.effective_to && old.effective_to >= '2026-05-31' && old.effective_to < '2026-06-01'.replace('06-01', '06-02'));
  assert.equal(s.store.get('PRICE_HISTORY', next.record.price_id).status, 'ACTIVE');
});
