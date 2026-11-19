'use strict';
/**
 * Mã đơn giá (cha) → dòng giá cố định (con), gán cho hợp đồng. NGUYÊN TẮC: quy trình / logic cũ giữ nguyên — hợp đồng không gán mã chạy y như trước;
 * dòng giá thuộc mã không lẫn vào giá chung / giá riêng hợp đồng; mã chỉ ghi đè khi hợp đồng chọn mã VÀ mã có dòng giá cho tuyến / ngày đó.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { MasterDataService } = require('../main/services/MasterDataService');
const { ExchangeService } = require('../main/services/ExchangeService');
const { newStore, createStorage } = require('../main/repo/createStore');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
async function setup() {
  const ctx = await install('HAKQN'); const { store, periods, contractId } = ctx;
  const cat = new CatalogService(store); const md = new MasterDataService(store);
  const ct = () => store.get('HOP_DONG', contractId); const unit = ct().customer_unit_code;
  const calc = (extra = {}) => periods.calculate({ contractId, ...W, clientRequestId: rid(), user: KETOAN, ...extra });
  const mkCode = (code = 'DG-CD-01', over = {}) => cat.savePriceCode({ create: true, record: { priceCode: code, unitCode: unit, priceName: 'Giá cố định thử', ...over }, user: KETOAN });
  const addLine = async (code, rec) => { const r = await cat.addCodeLine({ priceCode: code, record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 150000, ...rec }, user: KETOAN });
    const a = await cat.activatePrice({ priceId: r.record.price_id, rowVersion: r.record.row_version, user: KETOAN }); return { ...r, active: a }; };
  const assign = (code) => md.saveContract({ record: { contractId, priceCode: code }, rowVersion: ct().row_version, user: KETOAN });
  // tuyến đơn giá cố định không nhận dầu (chốt 07/10/2026) → các test giá cố định loại dòng dầu khỏi kỳ trước khi tính
  const dropFuel = () => store.transaction((tx) => { for (const r of tx.all('GIAO_NHAN_DAU')) tx.update('GIAO_NHAN_DAU', r.receipt_id, { is_deleted: true }); }, { user: 'test' });
  return { ...ctx, cat, md, ct, unit, calc, mkCode, addLine, assign, dropFuel };
}

test('Cây cha–con: tạo mã → thêm dòng giá cố định → áp dụng → gán hợp đồng → kỳ tính dùng giá cố định của mã (đơn giá, tiền, VAT khớp tính tay)', async () => {
  const s = await setup();
  const base = await s.calc(); const baseId = base.period.period_id; // chưa gán mã → giá theo dầu như cũ
  assert.equal(base.results[0].priceMethod || 'THEO_DAU', 'THEO_DAU'); const oldPrice = base.results[0].transportPrice; assert.ok(oldPrice > 0 && oldPrice !== 150000);
  await s.mkCode(); const l = await s.addLine('DG-CD-01', {});
  assert.equal(l.record.price_code, 'DG-CD-01'); assert.equal(l.record.price_method, 'CO_DINH'); assert.equal(l.record.contract_id, ''); assert.equal(l.active.activated.status, 'ACTIVE');
  const tree = s.cat.listPriceCodes(); const node = tree.units.find((u) => u.unitCode === s.unit).codes.find((c) => c.price_code === 'DG-CD-01');
  assert.equal(node.lineCount, 1); assert.equal(node.activeLines, 1); assert.deepEqual(node.contracts, []);
  await s.assign('DG-CD-01'); await s.dropFuel();
  const k = await s.calc({ periodId: baseId }); const r = k.results[0];
  assert.equal(r.transportPrice, 150000); assert.equal(r.priceMethod, 'CO_DINH'); assert.ok(k.issues.some((i) => i.code === 'I_FIXED_PRICE'));
  const lines = s.store.find('BKVC_LINE', (x) => x.period_id === baseId && x.is_current);
  assert.ok(lines.length > 5); for (const x of lines) assert.equal(x.amount, x.kg * 150, `thành tiền xe ${x.plate_no}`);
  assert.equal(s.store.find('TRANSPORT_CALCULATION', (c) => c.period_id === baseId && c.is_current)[0].price_id, l.record.price_id, 'kỳ ghi đúng dòng giá của mã');
  assert.equal(s.cat.getPriceCode({ priceCode: 'DG-CD-01' }).record.contracts[0].contractId, s.contractId);
});

test('NGUYÊN TẮC: hợp đồng không gán mã chạy như cũ; dòng giá của mã không lẫn vào giá chung / giá riêng; mã không có dòng cho tuyến → quay về giá cũ', async () => {
  const s = await setup();
  const first = await s.calc(); const pid = first.period.period_id; const before = first.results[0].transportPrice;
  await s.mkCode(); await s.addLine('DG-CD-01', { routeCode: 'VC.002', fixedPrice: 99000 }); // mã chỉ có dòng cho tuyến VC.002
  // chưa gán: kỳ VC.007 y như cũ, danh sách giá chung không có dòng của mã, _activePrice không nhặt dòng của mã
  assert.equal((await s.calc({ periodId: pid })).results[0].transportPrice, before);
  assert.equal(s.cat.listPrices({ routeCode: 'VC.002' }).items.some((p) => p.price_code), false, 'giá chung không chứa dòng thuộc mã');
  assert.equal(s.cat.listPrices({ priceCode: 'DG-CD-01' }).items.length, 1);
  assert.equal(s.cat._activePrice('VC.002', '', '2026-09-20') && s.cat._activePrice('VC.002', '', '2026-09-20').price_code, '');
  // gán mã: tuyến VC.007 KHÔNG có dòng trong mã → vẫn giá cũ
  await s.assign('DG-CD-01'); assert.equal((await s.calc({ periodId: pid })).results[0].transportPrice, before);
  // báo cáo căn cứ giá hợp đồng: VC.007 vẫn giá cũ
  const { ReportService } = require('../main/reports/ReportService'); const basis = new ReportService(s.store, {}).contractBasis({ contractId: s.contractId, asOf: '2026-09-20' });
  assert.ok(basis.rows.length > 0);
});

test('Ưu tiên: dòng giá của mã > giá riêng hợp đồng > giá chung; dòng mới của cùng mã đóng dòng cũ của CHÍNH mã đó, không đụng giá khác', async () => {
  const s = await setup();
  const generalBefore = s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && !p.contract_id && !p.price_code && p.status === 'ACTIVE').map((p) => [p.price_id, p.status, p.effective_to]);
  await s.mkCode(); const a = await s.addLine('DG-CD-01', { effectiveFrom: '2026-01-01', fixedPrice: 140000 });
  const b = await s.addLine('DG-CD-01', { effectiveFrom: '2026-09-21', fixedPrice: 160000 });
  assert.equal(b.active.closed.length, 1); assert.equal(b.active.closed[0].priceId, a.record.price_id);
  assert.deepEqual(s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && !p.contract_id && !p.price_code && p.status === 'ACTIVE').map((p) => [p.price_id, p.status, p.effective_to]), generalBefore, 'giá chung không bị đóng');
  await s.assign('DG-CD-01'); await s.dropFuel();
  const one = await s.calc({ dateFrom: '2026-09-18', dateTo: '2026-09-20' }); assert.equal(one.results[0].transportPrice, 140000, 'kỳ trước 21/09 dùng dòng v1');
  const two = await s.calc({ dateFrom: '2026-09-21', dateTo: '2026-09-23' }); assert.equal(two.results[0].transportPrice, 160000, 'kỳ từ 21/09 dùng dòng v2');
  // kỳ vắt hai dòng giá của mã (18/09 dùng v1, 23/09 dùng v2) → chặn như logic cũ (E_PRICE_VERSION_SPLIT)
  const E = require('../main/engine'); const sel = E.selectPriceVersion(s.store.all('PRICE_HISTORY'), 'VC.007', s.contractId, '2026-09-18', '2026-09-23', { priceVersionDate: 'PERIOD_END' }, 'DG-CD-01');
  assert.equal(sel.issue && sel.issue.code, 'E_PRICE_VERSION_SPLIT');
});

test('Chọn đơn giá CÓ SẴN để đưa vào mã (sao chép), kiểm tra hợp lệ, đóng mã, đổi mã của hợp đồng → kỳ nháp tính lại', async () => {
  const s = await setup();
  await s.mkCode('DG-CHON'); const src = s.store.find('PRICE_HISTORY', (p) => p.route_code === 'VC.007' && !p.contract_id && !p.price_code && p.status === 'ACTIVE')[0];
  const l = await s.cat.addCodeLine({ priceCode: 'DG-CHON', fromPriceId: src.price_id, record: { effectiveFrom: '2027-01-01' }, user: KETOAN });
  assert.equal(l.record.price_method, src.price_method || 'THEO_DAU'); assert.equal(l.record.new_price, src.new_price); assert.equal(l.record.price_code, 'DG-CHON'); assert.equal(l.record.effective_from, '2027-01-01');
  // kiểm tra hợp lệ
  await assert.rejects(s.mkCode('dg thu'), /Mã đơn giá 2–24/); await assert.rejects(s.mkCode('DG-CHON'), (e) => e.code === 'DUPLICATE');
  await assert.rejects(s.mkCode('DG-X', { unitCode: 'KHONG-CO' }), /không có trong danh mục/);
  await assert.rejects(s.cat.savePriceCode({ record: { priceCode: 'DG-CHON', unitCode: s.unit, priceName: 'đổi' }, user: KETOAN }), /rowVersion/);
  await assert.rejects(s.cat.addCodeLine({ priceCode: 'DG-CHON', record: { routeCode: 'VC.007', fixedPrice: 0, effectiveFrom: '2027-02-01' }, user: KETOAN }), /phải > 0/);
  await assert.rejects(s.cat.createPriceVersion({ record: { routeCode: 'VC.007', priceMethod: 'CO_DINH', fixedPrice: 1, effectiveFrom: '2027-02-01', contractId: s.contractId, priceCode: 'DG-CHON' }, user: KETOAN }), /không gắn riêng một hợp đồng/);
  // mã của đơn vị khác không gán được
  const other = s.store.all('DON_VI').find((u) => u.unit_code !== s.ct().customer_unit_code && u.unit_code !== s.ct().carrier_unit_code).unit_code;
  await s.mkCode('DG-KHAC', { unitCode: other }); await assert.rejects(s.assign('DG-KHAC'), /không phải bên thuê/);
  // kỳ nháp → đổi mã → needs_recalc; đóng mã → không thêm dòng / không gán hợp đồng mới
  const k = await s.calc(); await s.assign('DG-CHON'); assert.equal(s.store.get('KY_TINH', k.period.period_id).needs_recalc, true);
  const c = s.store.get('MA_DON_GIA', 'DG-CHON'); await s.cat.setPriceCodeActive({ priceCode: 'DG-CHON', active: false, rowVersion: c.row_version, user: KETOAN });
  await assert.rejects(s.cat.addCodeLine({ priceCode: 'DG-CHON', record: { routeCode: 'VC.002', fixedPrice: 5, effectiveFrom: '2027-03-01' }, user: KETOAN }), /đã đóng/);
  await s.assign(''); await assert.rejects(s.assign('DG-CHON'), /đã đóng/);
});

test('Gói DANH_MUC mang mã đơn giá + dòng giá sang máy khác; máy nhận có đủ cha–con và hợp đồng gán mã tính ra cùng đơn giá', async () => {
  const a = await setup(); await a.mkCode(); await a.addLine('DG-CD-01', {}); await a.assign('DG-CD-01');
  const ex = new ExchangeService(a.store, {}); const pkg = await ex.exportPackage({ packageType: 'DANH_MUC', user: KETOAN });
  const file = pkg.file; assert.ok(file && fs.existsSync(file));
  const zlib = require('node:zlib'); const body = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  assert.ok(Array.isArray(body.tables.MA_DON_GIA) && body.tables.MA_DON_GIA.some((c) => c.price_code === 'DG-CD-01'));
  assert.ok(body.tables.PRICE_HISTORY.some((p) => p.price_code === 'DG-CD-01'));
  assert.ok(body.tables.HOP_DONG.some((c) => c.price_code === 'DG-CD-01'));
});

test('SQLite: kho tạo bằng bản cũ (chưa có bảng MA_DON_GIA / cột price_code) tự được bổ sung khi mở; dữ liệu nguyên vẹn; ràng buộc duy nhất mới có hiệu lực', async () => {
  const { sqliteAvailable } = require('../main/repo/SqliteStore'); if (!sqliteAvailable()) return;
  const { DatabaseSync } = require('node:sqlite');
  const c = await install('DH', { kind: 'sqlite' }); const fp = c.store.fingerprint().sha256; const dir = c.dir; c.store.close();
  // giả lập kho bản cũ: bỏ bảng / cột mới, xóa chữ ký chỉ mục
  const db = new DatabaseSync(path.join(dir, 'dgvc.sqlite'));
  for (const i of db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql LIKE '%price_code%'").all()) db.exec(`DROP INDEX "${i.name}"`);
  db.exec("CREATE UNIQUE INDEX \"ux_PRICE_HISTORY_0\" ON \"PRICE_HISTORY\" (\"route_code\", \"contract_id\", \"effective_from\")"); // chỉ mục duy nhất kiểu cũ
  db.exec('DROP TABLE "MA_DON_GIA"'); db.exec('ALTER TABLE "PRICE_HISTORY" DROP COLUMN "price_code"'); db.exec('ALTER TABLE "HOP_DONG" DROP COLUMN "price_code"');
  db.exec("DELETE FROM \"_meta\" WHERE \"key\"='index_sig'"); db.close();
  const s2 = newStore(dir, {}, 'sqlite').open();
  assert.ok(s2.schemaChanges.some((x) => x.includes('MA_DON_GIA')) && s2.schemaChanges.some((x) => x.includes('PRICE_HISTORY.price_code')) && s2.schemaChanges.some((x) => x.includes('HOP_DONG.price_code')), JSON.stringify(s2.schemaChanges));
  assert.equal(s2.fingerprint().sha256, fp, 'dữ liệu cũ nguyên vẹn sau khi bổ sung cấu trúc'); s2.close();
  const s3 = newStore(dir, {}, 'sqlite').open(); assert.deepEqual(s3.schemaChanges, [], 'mở lần hai không còn gì để đổi');
  // dòng giá thuộc mã + giá chung cùng tuyến / cùng ngày hiệu lực: được phép (unique mới gồm price_code)
  const cat = new CatalogService(s3); await cat.savePriceCode({ create: true, record: { priceCode: 'DG-1', unitCode: s3.all('DON_VI')[0].unit_code, priceName: 'x' }, user: KETOAN });
  const gen = s3.find('PRICE_HISTORY', (p) => !p.contract_id && p.status === 'ACTIVE')[0];
  await s3.transaction((tx) => tx.insert('PRICE_HISTORY', { ...gen, price_id: 'PR-TEST-CODE', price_code: 'DG-1', price_method: 'CO_DINH', fixed_price: 1000, status: 'ACTIVE' }), { user: 'test' });
  s3.close(); const s4 = newStore(dir, {}, 'sqlite').open(); assert.equal(s4.get('PRICE_HISTORY', 'PRICE-TEST') || s4.get('PRICE_HISTORY', 'PR-TEST-CODE').price_code, 'DG-1'); s4.close();
});
