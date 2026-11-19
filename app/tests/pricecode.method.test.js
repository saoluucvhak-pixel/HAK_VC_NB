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

// ── B4: gói trao đổi mang cột mới sang bản cài khác; gói cũ (mã không có price_method) nhập vào → CO_DINH, không lỗi ──
test('B4: gói DANH_MUC có mã THEO_DAU/CO_DINH nhập sang bản cài khác đọc lại đúng hình thức; mã cũ không có price_method → CO_DINH', async () => {
  const fs = require('node:fs'); const zlib = require('node:zlib'); const os = require('node:os'); const path = require('node:path');
  const { ExchangeService } = require('../main/services/ExchangeService');
  const a = await setup(); const b = await install('DH', { installId: 'may-nhan-b' });
  await a.mkCode('DG-TD', { priceMethod: 'THEO_DAU' }); await a.mkCode('DG-CD');
  const ln = await a.cat.addCodeLine({ priceCode: 'DG-TD', record: THEO_DAU, user: KETOAN });
  await a.cat.activatePrice({ priceId: ln.record.price_id, rowVersion: ln.record.row_version, user: KETOAN });
  await a.store.transaction((tx) => { tx.insert('MA_DON_GIA', { price_code: 'DG-OLD', unit_code: a.unit, price_name: 'Mã kiểu 1.5.0', status: 'ACTIVE', note: '' }); }, { user: 'test' }); // không có cột price_method
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-b4-')), 'dm.dgvcx');
  const pkg = await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: out, user: { username: 'ketoan' } });
  const body = JSON.parse(zlib.gunzipSync(fs.readFileSync(pkg.file)).toString('utf8'));
  const rows = Object.fromEntries(body.tables.MA_DON_GIA.map((r) => [r.price_code, r]));
  assert.equal(rows['DG-TD'].price_method, 'THEO_DAU'); assert.ok(!rows['DG-OLD'].price_method, 'gói mô phỏng bản cũ: mã không có hình thức');
  const ex = new ExchangeService(b.store); const pv = ex.previewPackage({ filePath: pkg.file, user: { username: 'ketoan' } });
  assert.ok(pv.canImport, JSON.stringify(pv.rejected || pv));
  await ex.importPackage({ previewId: pv.previewId, user: { username: 'ketoan' } });
  const cb = new CatalogService(b.store);
  assert.equal(cb.getPriceCode({ priceCode: 'DG-TD' }).record.priceMethod, 'THEO_DAU');
  assert.equal(cb.getPriceCode({ priceCode: 'DG-CD' }).record.priceMethod, 'CO_DINH');
  assert.equal(cb.getPriceCode({ priceCode: 'DG-OLD' }).record.priceMethod, 'CO_DINH');
  assert.equal(b.store.find('PRICE_HISTORY', (p) => p.price_code === 'DG-TD')[0].price_method, 'THEO_DAU');
});

// ── B5: nâng cấp SQLite có DB sẵn (MA_DON_GIA chưa có price_method) ──
test('B5: SQLite kho bản cũ (chưa có cột price_method; có 1 mã + dòng cố định + kỳ đã tính) → mở bằng bản mới: thêm cột, dữ liệu nguyên vẹn, mã đọc ra CO_DINH, kỳ tính lại ra cùng số', async () => {
  const { sqliteAvailable } = require('../main/repo/SqliteStore'); if (!sqliteAvailable()) return;
  const { DatabaseSync } = require('node:sqlite'); const path = require('node:path');
  const { newStore } = require('../main/repo/createStore');
  const c = await install('HAKQN', { kind: 'sqlite' }); const cat = new CatalogService(c.store); const md = new MasterDataService(c.store);
  const unit = c.store.get('HOP_DONG', c.contractId).customer_unit_code;
  await c.store.transaction((tx) => { tx.insert('MA_DON_GIA', { price_code: 'DG-CD-OLD', unit_code: unit, price_name: 'Mã 1.5.0', status: 'ACTIVE', note: '' }); }, { user: 'test' }); // đúng như bản 1.5.0: không có cột hình thức
  const l = await cat.addCodeLine({ priceCode: 'DG-CD-OLD', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 150000 }, user: KETOAN });
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  await md.saveContract({ record: { contractId: c.contractId, priceCode: 'DG-CD-OLD' }, rowVersion: c.store.get('HOP_DONG', c.contractId).row_version, user: KETOAN });
  await c.store.transaction((tx) => { for (const r of tx.all('GIAO_NHAN_DAU')) tx.update('GIAO_NHAN_DAU', r.receipt_id, { is_deleted: true }); }, { user: 'test' });
  const W2 = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
  const k1 = await c.periods.calculate({ contractId: c.contractId, ...W2, clientRequestId: rid(), user: KETOAN });
  const price1 = k1.results[0].transportPrice; assert.equal(price1, 150000);
  const fp = c.store.fingerprint().sha256; const dir = c.dir; c.store.close();
  const db = new DatabaseSync(path.join(dir, 'dgvc.sqlite'));
  db.exec('ALTER TABLE "MA_DON_GIA" DROP COLUMN "price_method"'); // giả lập kho 1.5.0/1.6.0
  db.exec("DELETE FROM \"_meta\" WHERE \"key\"='index_sig'"); db.close();
  const s2 = newStore(dir, {}, 'sqlite').open();
  assert.ok(s2.schemaChanges.some((x) => x.includes('MA_DON_GIA.price_method')), JSON.stringify(s2.schemaChanges));
  assert.equal(new CatalogService(s2).getPriceCode({ priceCode: 'DG-CD-OLD' }).record.priceMethod, 'CO_DINH');
  assert.equal(s2.get('MA_DON_GIA', 'DG-CD-OLD').price_method || '', '');
  assert.equal(s2.fingerprint().sha256, fp, 'dữ liệu cũ nguyên vẹn sau khi thêm cột');
  s2.close(); const s3 = newStore(dir, {}, 'sqlite').open(); assert.deepEqual(s3.schemaChanges, [], 'mở lần hai không còn gì để đổi');
  const { PeriodService } = require('../main/services/PeriodService');
  const again = await new PeriodService(s3).calculate({ contractId: c.contractId, ...W2, periodId: k1.period.period_id, clientRequestId: rid(), user: KETOAN });
  assert.equal(again.results[0].transportPrice, price1, 'kỳ cũ tính lại ra cùng số sau nâng cấp'); assert.equal(again.results[0].priceMethod, 'CO_DINH');
  s3.close();
});

// ── B8: tạo mã đơn giá phát nhắc "sửa giống ở các nhà máy còn lại" như các danh mục khác ──
test('B8: tạo mã đơn giá trả cảnh báo nhắc sửa giống nhà máy khác', async () => {
  const s = await setup();
  const r = await s.mkCode('DG-NHAC', { priceMethod: 'THEO_DAU' });
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1 && /nhà máy|giống/i.test(r.warnings[0].message), JSON.stringify(r.warnings));
});

// ───────── Sửa lỗi sau rà soát: mã cũ (cột rỗng), chốt chặn máy chủ, giao dịch gộp ─────────
const oldCode = (s, code, lines = []) => s.store.transaction((tx) => {
  tx.insert('MA_DON_GIA', { price_code: code, unit_code: s.unit, price_name: 'Mã 1.5.x', status: 'ACTIVE', note: '' }); // không có price_method
  for (const l of lines) tx.insert('PRICE_HISTORY', { price_id: `PR-${l.route}-${code}-v1`, route_code: l.route, contract_id: '', price_code: code, version_no: 1, effective_from: '2026-01-01', effective_to: '', status: 'ACTIVE', is_used: false,
    price_method: l.method, fixed_price: l.method === 'CO_DINH' ? 150000 : '', new_price: l.method === 'CO_DINH' ? 0 : 165000, fuel_price_excl_vat: l.method === 'CO_DINH' ? 0 : 15500, fuel_norm_l_per_km: l.method === 'CO_DINH' ? 0 : 0.4, avg_load_ton: l.method === 'CO_DINH' ? 0 : 18,
    base_price_excl_vat: '', base_price_source: '', price_per_km: '', avg_volume_m3: '', source_note: '' }); }, { user: 'test' });

test('mã cũ (price_method rỗng) suy hình thức từ các dòng: không dòng → CO_DINH; toàn CO_DINH → CO_DINH; toàn khác (kể cả rỗng) → THEO_DAU; lẫn → HON_HOP', async () => {
  const s = await setup();
  await oldCode(s, 'DG-O0'); await oldCode(s, 'DG-O1', [{ route: 'VC.007', method: 'CO_DINH' }]);
  await oldCode(s, 'DG-O2', [{ route: 'VC.007', method: 'THEO_DAU' }, { route: 'VC.002', method: '' }]); await oldCode(s, 'DG-O3', [{ route: 'VC.007', method: 'CO_DINH' }, { route: 'VC.002', method: 'THEO_DAU' }]);
  const m = (c) => s.cat.getPriceCode({ priceCode: c }).record.priceMethod;
  assert.deepEqual(['DG-O0', 'DG-O1', 'DG-O2', 'DG-O3'].map(m), ['CO_DINH', 'CO_DINH', 'THEO_DAU', 'HON_HOP']);
  const l = s.cat.listPriceCodes(); assert.deepEqual(l.methods.map((x) => x.method), ['CO_DINH', 'THEO_DAU', 'HON_HOP'], 'nhóm HON_HOP chỉ xuất hiện khi có');
  assert.deepEqual(l.methods[2].codes.map((c) => c.price_code), ['DG-O3']);
  assert.match(s.cat.getPriceCode({ priceCode: 'DG-O3' }).record.methodWarning, /tách thành 2 mã/);
});

test('nâng cấp một lần: ghi price_method cho mã rỗng theo quy tắc (có audit), HON_HOP để trống; chạy lại không đổi gì; HON_HOP chặn thêm dòng / sửa nháp', async () => {
  const s = await setup();
  await oldCode(s, 'DG-O2', [{ route: 'VC.007', method: 'THEO_DAU' }]); await oldCode(s, 'DG-O3', [{ route: 'VC.007', method: 'CO_DINH' }, { route: 'VC.002', method: 'THEO_DAU' }]);
  const r = await s.cat.backfillCodeMethods({ user: { username: 'system' } });
  assert.deepEqual(r.updated.sort(), ['DG-O2']); assert.deepEqual(r.mixed, ['DG-O3']);
  assert.equal(s.store.get('MA_DON_GIA', 'DG-O2').price_method, 'THEO_DAU'); assert.ok(!s.store.get('MA_DON_GIA', 'DG-O3').price_method, 'HON_HOP không ghi');
  assert.ok(s.store.all('AUDIT_LOG').some((a) => a.action === 'PRICE_CODE_METHOD_BACKFILL' && a.entity_id === 'DG-O2'));
  assert.deepEqual((await s.cat.backfillCodeMethods({ user: { username: 'system' } })).updated, [], 'lần hai không còn gì để ghi');
  await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-O3', record: { routeCode: 'VC.009', effectiveFrom: '2026-02-01', fixedPrice: 150000 }, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED' && /tách thành 2 mã/.test(e.message));
  // sửa nháp của mã HON_HOP bị chặn
  await s.store.transaction((tx) => { tx.insert('PRICE_HISTORY', { price_id: 'PR-VC.009-DG-O3-v1', route_code: 'VC.009', contract_id: '', price_code: 'DG-O3', version_no: 1, effective_from: '2026-03-01', effective_to: '', status: 'DRAFT', is_used: false, price_method: 'CO_DINH', fixed_price: 150000, new_price: 0, fuel_price_excl_vat: 0, fuel_norm_l_per_km: 0, avg_load_ton: 0, base_price_excl_vat: '', base_price_source: '', price_per_km: '', avg_volume_m3: '', source_note: '' }); }, { user: 'test' });
  const d = s.store.get('PRICE_HISTORY', 'PR-VC.009-DG-O3-v1');
  await assert.rejects(() => s.cat.updatePriceDraft({ priceId: d.price_id, record: { fixedPrice: 160000 }, rowVersion: d.row_version, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => s.cat.activatePrice({ priceId: d.price_id, rowVersion: d.row_version, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
});

test('updatePriceDraft/activatePrice: dòng thuộc mã phải đúng hình thức của mã; dòng giá chung (không mã) đổi hình thức như cũ', async () => {
  const s = await setup();
  await s.mkCode('DG-FIX');
  const l = await s.cat.addCodeLine({ priceCode: 'DG-FIX', record: { routeCode: 'VC.002', effectiveFrom: '2026-01-01', fixedPrice: 150000 }, user: KETOAN });
  await assert.rejects(() => s.cat.updatePriceDraft({ priceId: l.record.price_id, record: { priceMethod: 'THEO_DAU', newPrice: 200000, fuelPriceExclVat: 20000, fuelNormLPerKm: 0.5, avgLoadTon: 25 }, rowVersion: l.record.row_version, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED' && /đơn giá cố định/i.test(e.message));
  // gửi priceMethod trùng hình thức của mã → bỏ qua, sửa bình thường
  const ok = await s.cat.updatePriceDraft({ priceId: l.record.price_id, record: { priceMethod: 'CO_DINH', fixedPrice: 155000 }, rowVersion: l.record.row_version, user: KETOAN });
  assert.equal(ok.record.fixed_price, 155000);
  // activate: ép trái hình thức bằng cách ghi thẳng vào kho (giả lập dữ liệu hỏng) → bị chặn
  await s.store.transaction((tx) => { tx.update('PRICE_HISTORY', l.record.price_id, { price_method: 'THEO_DAU' }); }, { user: 'test' });
  const cur = s.store.get('PRICE_HISTORY', l.record.price_id);
  await assert.rejects(() => s.cat.activatePrice({ priceId: cur.price_id, rowVersion: cur.row_version, user: KETOAN }), (e) => e.code === 'VALIDATION_FAILED');
  // giá chung (không mã): đổi hình thức nháp vẫn được
  const g = await s.cat.createPriceVersion({ record: { routeCode: 'VC.009', priceMethod: 'CO_DINH', fixedPrice: 120000, effectiveFrom: '2027-06-01' }, user: KETOAN });
  const g2 = await s.cat.updatePriceDraft({ priceId: g.record.price_id, record: { priceMethod: 'THEO_DAU', newPrice: 200000, fuelPriceExclVat: 20000, fuelNormLPerKm: 0.5, avgLoadTon: 25 }, rowVersion: g.record.row_version, user: KETOAN });
  assert.equal(g2.record.price_method, 'THEO_DAU');
});

test('addCodeLine nhận hình thức dòng sao chép: chèn dòng + cập nhật mã trong MỘT giao dịch — lỗi ở bước cập nhật mã → không còn dòng nháp thừa', async () => {
  const s = await setup();
  const src = s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && !p.contract_id && !p.price_code && p.status === 'ACTIVE')[0];
  await s.mkCode('DG-ADOPT'); // mặc định CO_DINH, còn trống
  const orig = s.store.transaction.bind(s.store);
  s.store.transaction = (fn, o) => orig((tx) => fn(new Proxy(tx, { get: (t, k) => (k === 'update' ? (table, ...a) => { if (table === 'MA_DON_GIA') throw new Error('giả lập lỗi cập nhật mã'); return t.update(table, ...a); } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) })), o);
  await assert.rejects(() => s.cat.addCodeLine({ priceCode: 'DG-ADOPT', fromPriceId: src.price_id, record: { effectiveFrom: '2027-01-01' }, user: KETOAN }), /giả lập lỗi/);
  s.store.transaction = orig;
  assert.equal(s.store.find('PRICE_HISTORY', (p) => p.price_code === 'DG-ADOPT').length, 0, 'không còn dòng nháp thừa');
  assert.equal(s.cat.getPriceCode({ priceCode: 'DG-ADOPT' }).record.priceMethod, 'CO_DINH', 'mã giữ nguyên hình thức');
  // không lỗi → cả hai cùng có
  const ok = await s.cat.addCodeLine({ priceCode: 'DG-ADOPT', fromPriceId: src.price_id, record: { effectiveFrom: '2027-01-01' }, user: KETOAN });
  assert.equal(ok.record.price_method, 'THEO_DAU'); assert.equal(s.store.get('MA_DON_GIA', 'DG-ADOPT').price_method, 'THEO_DAU');
});
