'use strict';
/**
 * Rà soát ruflo (2026-11): GIỮ tính năng mã PT-TD tự chuyển + tuyến m³, nhưng KHÔNG đổi số của dữ liệu cũ.
 *  C1: chuyển PT-TD không được làm mất hiệu lực giá riêng của hợp đồng (thứ tự cũ: giá riêng HĐ > giá chung).
 *  C2: BKVC tuyến tính m³ với đơn giá THEO GIÁ DẦU (đ/tấn) vẫn tính theo TẤN như 1.6.0; chỉ đơn giá CỐ ĐỊNH (đ/m³) mới nhân m³.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const snap = (r) => ({ priceId: r.results[0].trace && r.results[0].trace.priceId, contractPrice: r.results[0].contractPrice, tp: r.results[0].transportPrice, st: r.results[0].resultStatus });

test('C1: chuyển dữ liệu cũ sang PT-TD giữ nguyên kết quả — hợp đồng có GIÁ RIÊNG vẫn dùng giá riêng; hợp đồng chỉ giá chung giữ số cũ', async () => {
  const { store, periods, contractId } = await install('DH'); const cat = new CatalogService(store);
  const base = snap(periods.preview({ contractId, ...W }));                       // chỉ giá chung (kiểu 1.6.0, chưa chuyển)
  const own = await cat.createPriceVersion({ record: { routeCode: 'VC.007', contractId, priceMethod: 'THEO_DAU', newPrice: 300000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 18, effectiveFrom: '2026-06-01' }, user: KETOAN });
  await cat.activatePrice({ priceId: own.record.price_id, rowVersion: own.record.row_version, user: KETOAN });
  const withOwn = snap(periods.preview({ contractId, ...W }));
  assert.equal(withOwn.priceId, own.record.price_id, 'trước chuyển: dùng giá riêng hợp đồng'); assert.notEqual(withOwn.tp, base.tp);
  const r = await cat.backfillCodeMethods({ user: { username: 'system' } });
  assert.ok(r.legacyPrices > 0 && r.legacyContracts > 0, 'có chuyển dữ liệu cũ');
  assert.equal(store.get('HOP_DONG', contractId).price_code, 'PT-TD');
  assert.deepEqual(snap(periods.preview({ contractId, ...W })), withOwn, 'sau chuyển: VẪN dùng giá riêng hợp đồng, số giữ nguyên từng đồng');
  // chuyển lần hai không đổi gì
  assert.deepEqual(await cat.backfillCodeMethods({ user: { username: 'system' } }).then((x) => [x.legacyPrices, x.legacyContracts]), [0, 0]);
});

test('C1b: có cần chuyển dữ liệu cũ hay không (legacyMigrationPending) — dùng để sao lưu an toàn TRƯỚC khi chuyển', async () => {
  const { store } = await install('DH', { withData: false }); const cat = new CatalogService(store);
  const p = cat.legacyMigrationPending(); assert.ok(p.prices > 0 && p.contracts > 0);
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  assert.deepEqual(cat.legacyMigrationPending(), { prices: 0, contracts: 0 });
});

async function m3Scenario(priceSetup) {
  const { store, periods, contractId } = await install('DH');
  await store.transaction((tx) => { tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }); for (const p of store.all('PRICE_HISTORY').filter((x) => x.route_code === 'VC.007')) tx.update('PRICE_HISTORY', p.price_id, { avg_volume_m3: 60, ...(priceSetup || {}) }); }, { user: 'test' });
  const r = periods.preview({ contractId, ...W }); return { r, store };
}
test('C2: tuyến M3 + đơn giá THEO GIÁ DẦU (đ/tấn) → BKVC vẫn tính theo TẤN, khớp bản 1.6.0 (tiền hàng 688.164.407; tổng 743.217.559)', async () => {
  const { r } = await m3Scenario();
  assert.equal(r.results[0].transportPrice, 473900);
  assert.equal(r.bkvc.totals.amount, 688164407); assert.equal(r.bkvc.totals.total, 743217559);
  assert.ok(r.bkvc.lines.every((l) => l.uom === 'TAN'), 'mọi dòng tính theo tấn'); assert.equal(Math.round(r.bkvc.totals.ton * 100) / 100, 1452.13);
});

test('C1c: hợp đồng chỉ có giá chung — chuyển PT-TD không đổi số (so trước/sau từng đồng)', async () => {
  const { store, periods, contractId } = await install('DH'); const cat = new CatalogService(store);
  const before = periods.preview({ contractId, ...W }); await cat.backfillCodeMethods({ user: { username: 'system' } }); const after = periods.preview({ contractId, ...W });
  assert.deepEqual(snap(after), snap(before)); assert.equal(JSON.stringify(after.bkvc.totals), JSON.stringify(before.bkvc.totals));
});

test('C2c: tuyến M3 + đơn giá CỐ ĐỊNH đ/m³ → BKVC tính theo m³ (tính năng được giữ)', async () => {
  const { store, periods, contractId } = await install('DH'); const cat = new CatalogService(store);
  await store.transaction((tx) => { tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }); for (const v of tx.all('XE')) tx.update('XE', v.plate_no, { volume_m3: 10 }); }, { user: 'test' });
  await cat.savePriceCode({ create: true, record: { priceCode: 'DG-M3', unitCode: store.get('HOP_DONG', contractId).customer_unit_code, priceName: 'Cố định đ/m³', priceMethod: 'CO_DINH' }, user: KETOAN });
  const l = await cat.addCodeLine({ priceCode: 'DG-M3', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 50000 }, user: KETOAN }).catch((e) => e);
  if (l instanceof Error) { assert.fail(`mã cố định cho tuyến M3 phải thêm được: ${l.message}`); }
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  await store.transaction((tx) => { tx.update('HOP_DONG', contractId, { price_code: 'DG-M3' }); for (const g of tx.all('GIAO_NHAN_DAU')) tx.update('GIAO_NHAN_DAU', g.receipt_id, { is_deleted: true }); }, { user: 'test' });
  const r = periods.preview({ contractId, ...W });
  assert.equal(r.results[0].transportPrice, 50000); assert.ok(r.bkvc.lines.every((x) => x.uom === 'M3'), 'cố định đ/m³ → dòng tính theo m³');
  const m3 = r.bkvc.lines.reduce((t, x) => t + x.m3, 0); assert.ok(m3 > 0); assert.equal(r.bkvc.totals.amount, r.bkvc.lines.reduce((t, x) => t + x.amount, 0));
});

test('C1d: mở kho đã có kỳ tính và còn dữ liệu giá cũ → sao lưu an toàn trước khi chuyển PT-TD; kho chưa có kỳ thì không sao lưu thừa', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { AppContext } = require('../main/app/AppContext');
  const { FILE, CONTRACT, rid } = require('./install');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-mig-')); const cfgFile = path.join(home, 'c.json');
  const safetyFiles = (ctx) => { const d = path.join(ctx.store.root, 'backups', 'safety'); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.includes('truoc-chuyen-pt-td')) : []; };
  const c1 = new AppContext({ configFile: cfgFile, documentsDir: home }); await c1.init({ mode: 'NEW', dataFolder: path.join(home, 'D'), unitCode: 'DH' });
  const imp = c1.svc.import; const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH, user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
  const b = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.DH, filePath: FILE.DH, user: 'k' }); await imp.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
  const k = await c1.svc.periods.calculate({ contractId: CONTRACT.DH, ...W, clientRequestId: rid(), user: KETOAN });
  // đưa kho về trạng thái "bản cũ": gỡ mã PT-TD trên dữ liệu giá + hợp đồng
  await c1.store.transaction((tx) => { for (const p of tx.all('PRICE_HISTORY')) if (p.price_code === 'PT-TD') tx.update('PRICE_HISTORY', p.price_id, { price_code: '' }); for (const h of tx.all('HOP_DONG')) if (h.price_code === 'PT-TD') tx.update('HOP_DONG', h.contract_id, { price_code: '' }); }, { user: 'test' });
  const before = c1.store.find('TRANSPORT_CALCULATION', (c) => c.period_id === k.period.period_id && c.is_current)[0].transport_price; c1.close();
  const c2 = new AppContext({ configFile: cfgFile, documentsDir: home }); c2.open(); await c2.migrated;
  assert.equal(safetyFiles(c2).length, 1, 'có đúng 1 bản sao lưu an toàn trước khi chuyển');
  assert.equal(c2.store.find('TRANSPORT_CALCULATION', (c) => c.period_id === k.period.period_id && c.is_current)[0].transport_price, before, 'kỳ đã tính giữ nguyên số');
  c2.close(); const c3 = new AppContext({ configFile: cfgFile, documentsDir: home }); c3.open(); await c3.migrated; assert.equal(safetyFiles(c3).length, 1, 'mở lần hai: hết dữ liệu cũ → không sao lưu thêm'); c3.close();
});
