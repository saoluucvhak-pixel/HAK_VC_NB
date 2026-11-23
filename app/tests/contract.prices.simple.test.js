'use strict';
/**
 * Hợp đồng — "thêm đơn giá" cách đơn giản (không gán mã): chọn tuyến → chọn đơn giá của tuyến (PT-CD / PT-TD), hoặc chọn đơn giá trước → tuyến tự xác định.
 * Đơn giá chọn = dòng giá RIÊNG của hợp đồng (engine đã ưu tiên) → không đổi cách tính. Chạy trên cả kho JSON và SQLite.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, storageKinds, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { MasterDataService } = require('../main/services/MasterDataService');
const E = require('../main/engine');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const rejects = (p, code, re) => assert.rejects(p, (e) => (!code || e.code === code || (e.details && e.details.code === code)) && (!re || re.test(e.message)), `phải lỗi ${code || ''}`);

/** Dòng PT-CD cố định cho VC.007 (đang ACTIVE) — nguồn để chọn. */
async function fixedSource(cat, fixedPrice = 95500) {
  await cat.backfillCodeMethods({ user: { username: "system" } }); // kho đã nâng cấp: PT-CD / PT-TD có sẵn, giá chung cũ vào PT-TD
  const r = await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice, effectiveFrom: '2026-01-01' }, user: KETOAN });
  await cat.activatePrice({ priceId: r.record.price_id, rowVersion: r.record.row_version, user: KETOAN });
  return r.record.price_id;
}
const fuelIds = (store) => store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted).map((r) => r.receipt_id);

for (const kind of storageKinds()) {
  const tag = `[${kind}]`;

  test(`${tag} (a) Chọn đơn giá PT-CD → giá riêng hợp đồng (HOP_DONG); engine tính ra đúng đơn giá cố định`, async () => {
    const { store, periods, contractId } = await install('DH', { kind });
    const cat = new CatalogService(store);
    const cdId = await fixedSource(cat);
    const add = await cat.addContractPrice({ contractId, routeCode: 'VC.007', priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN });
    assert.equal(add.record.contract_id, contractId); assert.equal(add.record.price_code, ''); assert.equal(add.record.price_method, 'CO_DINH');
    assert.equal(add.record.status, 'ACTIVE'); assert.equal(add.contractPrice, 95500);
    const it = cat.contractRoutePrices({ contractId }).items.find((x) => x.routeCode === 'VC.007');
    assert.equal(it.source, 'HOP_DONG'); assert.equal(it.priceId, add.record.price_id); assert.equal(it.priceMethod, 'CO_DINH'); assert.equal(it.fixedPrice, 95500); assert.equal(it.contractPrice, 95500);
    assert.ok(store.all('AUDIT_LOG').some((a) => a.entity_id === add.record.price_id && a.action === 'PRICE_CREATE'));
    // tuyến cố định không nhận dầu → chốt chặn của engine vẫn còn; bỏ dầu khỏi kỳ → đơn giá VC = đơn giá cố định
    const pv = await periods.preview({ contractId, ...W });
    assert.ok(pv.issues.some((i) => i.code === 'E_FIXED_PRICE_HAS_FUEL'));
    const pv2 = await periods.preview({ contractId, ...W, excludeReceiptIds: fuelIds(store) });
    assert.equal(pv2.results[0].priceMethod, 'CO_DINH'); assert.equal(pv2.results[0].transportPrice, 95500);
    store.close();
  });

  test(`${tag} (b) Chọn đơn giá PT-TD (theo dầu) → số tiền kỳ y như dùng giá chung; tuyến khác không đổi`, async () => {
    const { store, periods, contractId } = await install('DH', { kind });
    const cat = new CatalogService(store); const cfg = E.buildConfig(store.all('CONFIG')); const code = store.get('HOP_DONG', contractId).price_code || '';
    const snap = async () => { const r = (await periods.preview({ contractId, ...W })).results[0]; return { tp: r.transportPrice, cp: r.contractPrice, st: r.resultStatus }; };
    const pick = () => Object.fromEntries(store.all('TUYEN_VC').map((r) => [r.route_code, (E.selectPriceVersion(store.all('PRICE_HISTORY'), r.route_code, contractId, '2026-09-20', '2026-09-20', cfg, code).price || {}).price_id]));
    const before = await snap(); const picksBefore = pick();
    const choices = cat.contractPriceChoices({ contractId, routeCode: 'VC.007' }).items;
    const td = choices.find((x) => x.priceMethod === 'THEO_DAU'); assert.ok(td, 'tuyến có dòng theo giá dầu để chọn'); assert.ok(['PT-TD'].includes(td.priceCode));
    const add = await cat.addContractPrice({ contractId, priceId: td.priceId, effectiveFrom: '2026-06-01', user: KETOAN });
    assert.equal(add.record.price_method, 'THEO_DAU'); assert.equal(add.record.contract_id, contractId);
    assert.deepEqual(await snap(), before, 'số tiền kỳ không đổi từng đồng');
    assert.equal(cat.contractRoutePrices({ contractId }).items.find((x) => x.routeCode === 'VC.007').source, 'HOP_DONG');
    const after = pick();
    for (const rc of Object.keys(picksBefore)) if (rc !== 'VC.007') assert.equal(after[rc], picksBefore[rc], `tuyến ${rc} không đổi`);
    assert.equal(after['VC.007'], add.record.price_id);
    store.close();
  });

  test(`${tag} (c) routeCode lệch tuyến của đơn giá → VALIDATION_FAILED; nguồn sai hình thức / chưa áp dụng cũng từ chối`, async () => {
    const { store, contractId } = await install('DH', { withData: false, kind });
    const cat = new CatalogService(store); const cdId = await fixedSource(cat);
    await rejects(cat.addContractPrice({ contractId, routeCode: 'VC.002', priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN }), 'VALIDATION_FAILED', /VC\.007.*VC\.002|tuyến/);
    await rejects(cat.addContractPrice({ contractId, priceId: 'KHONG-CO', user: KETOAN }), 'NOT_FOUND');
    await rejects(cat.addContractPrice({ contractId: 'KHONG-CO', priceId: cdId, user: KETOAN }), 'NOT_FOUND');
    const draft = await cat.addCodeLine({ priceCode: 'PT-CD', record: { routeCode: 'VC.007', fixedPrice: 99000, effectiveFrom: '2026-12-01' }, user: KETOAN });
    await rejects(cat.addContractPrice({ contractId, priceId: draft.record.price_id, user: KETOAN }), 'VALIDATION_FAILED', /NHÁP|DRAFT|đang áp dụng/i);
    assert.equal(store.find('PRICE_HISTORY', (p) => p.contract_id === contractId).length, 0, 'lỗi không để lại dòng thừa');
    store.close();
  });

  test(`${tag} (d) Trùng / lùi ngày hiệu lực so với giá riêng đang dùng → E_PRICE_DATE_OVERLAP`, async () => {
    const { store, periods, contractId } = await install('DH', { kind });
    const cat = new CatalogService(store); const cdId = await fixedSource(cat);
    await cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN });
    await rejects(cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN }), 'E_PRICE_DATE_OVERLAP');
    await rejects(cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-08-01', user: KETOAN }), 'E_PRICE_DATE_OVERLAP');
    // ngày sau: bản mới thay, bản cũ đóng = ngày mới − 1
    const v2 = await cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-12-01', user: KETOAN });
    assert.equal(v2.closed.length, 1); assert.equal(store.get('PRICE_HISTORY', v2.closed[0].priceId).effective_to, '2026-11-30');
    store.close();
  });

  test(`${tag} (d2) Kỳ đã xác nhận giữ số: thêm đơn giá riêng có hiệu lực trong kỳ → E_PRICE_USED; ngày sau kỳ thì được và số kỳ cũ không đổi`, async () => {
    const { store, periods, contractId } = await install('DH', { kind });
    const cat = new CatalogService(store);
    const k = await periods.calculate({ contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
    const kept = k.results[0].transportPrice;
    const td = cat.contractPriceChoices({ contractId, routeCode: 'VC.007' }).items.find((x) => x.priceMethod === 'THEO_DAU');
    await periods.confirm({ periodId: k.period.period_id, rowVersion: k.period.row_version, user: KETOAN });
    await rejects(cat.addContractPrice({ contractId, priceId: td.priceId, effectiveFrom: '2026-09-01', user: KETOAN }), 'E_PRICE_USED', /đã xác nhận/);
    assert.equal(store.find('PRICE_HISTORY', (p) => p.contract_id === contractId).length, 0, 'bị chặn thì không để lại dòng');
    await cat.addContractPrice({ contractId, priceId: td.priceId, effectiveFrom: '2026-09-24', user: KETOAN });
    const calc = store.find('TRANSPORT_CALCULATION', (c) => c.period_id === k.period.period_id && c.is_current)[0];
    assert.equal(calc.transport_price, kept, 'kỳ đã xác nhận giữ nguyên số');
    store.close();
  });

  test(`${tag} (e) Gỡ đơn giá riêng: đã dùng → lỗi; mới tạo → xóa được; chỉ gỡ được đơn giá riêng của đúng hợp đồng`, async () => {
    const { store, contractId } = await install('DH', { withData: false, kind });
    const cat = new CatalogService(store); const cdId = await fixedSource(cat);
    const a = await cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN });
    const b = await cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-10-01', user: KETOAN });
    // không phải bản mới nhất / không phải giá riêng của hợp đồng
    await rejects(cat.removeContractPrice({ contractId, priceId: a.record.price_id, user: KETOAN }), 'E_PRICE_USED');
    await rejects(cat.removeContractPrice({ contractId, priceId: cdId, user: KETOAN }), 'VALIDATION_FAILED');
    await rejects(cat.removeContractPrice({ contractId: 'KHONG-CO', priceId: b.record.price_id, user: KETOAN }), 'NOT_FOUND');
    // đã dùng → từ chối rõ ràng
    await store.transaction((tx) => tx.update('PRICE_HISTORY', b.record.price_id, { is_used: true }), { user: 'test' });
    await rejects(cat.removeContractPrice({ contractId, priceId: b.record.price_id, user: KETOAN }), 'E_PRICE_USED', /thêm đơn giá mới/);
    assert.ok(store.get('PRICE_HISTORY', b.record.price_id));
    await store.transaction((tx) => tx.update('PRICE_HISTORY', b.record.price_id, { is_used: false }), { user: 'test' });
    // chưa dùng → xóa; bản riêng trước được mở lại
    const rm = await cat.removeContractPrice({ contractId, priceId: b.record.price_id, user: KETOAN });
    assert.equal(rm.removed, b.record.price_id); assert.deepEqual(rm.reopened, [a.record.price_id]);
    const gone = store.get('PRICE_HISTORY', b.record.price_id); assert.equal(gone.status, 'CLOSED'); assert.ok(gone.effective_to < gone.effective_from, 'dòng đã gỡ: đóng, hiệu lực không khớp ngày nào (giữ lại để gói trao đổi mang được)');
    await rejects(cat.removeContractPrice({ contractId, priceId: b.record.price_id, user: KETOAN }), 'NOT_FOUND'); // gỡ lần hai
    const back = store.get('PRICE_HISTORY', a.record.price_id); assert.equal(back.status, 'ACTIVE'); assert.equal(back.effective_to, '');
    const rm2 = await cat.removeContractPrice({ contractId, priceId: a.record.price_id, user: KETOAN });
    assert.deepEqual(rm2.reopened, []); assert.equal(cat.contractRoutePrices({ contractId }).items.find((x) => x.routeCode === 'VC.007').source !== 'HOP_DONG', true, 'gỡ xong quay về giá của phương thức');
    store.close();
  });

  test(`${tag} (f) contractPriceChoices: theo tuyến, theo đơn giá (kèm routeCode), không truyền; chỉ ACTIVE của PT-CD/PT-TD`, async () => {
    const { store, contractId } = await install('DH', { withData: false, kind });
    const cat = new CatalogService(store); const cdId = await fixedSource(cat);
    const byRoute = cat.contractPriceChoices({ contractId, routeCode: 'VC.007' });
    assert.equal(byRoute.routeCode, 'VC.007'); assert.ok(byRoute.items.length >= 2);
    assert.ok(byRoute.items.every((x) => x.routeCode === 'VC.007' && x.status === 'ACTIVE' && ['PT-CD', 'PT-TD'].includes(x.priceCode)));
    assert.ok(byRoute.items.some((x) => x.priceId === cdId && x.priceMethod === 'CO_DINH' && x.fixedPrice === 95500 && x.priceMethodLabel));
    assert.ok(byRoute.items.some((x) => x.priceMethod === 'THEO_DAU' && x.contractPrice > 0), 'dòng giá chung cũ (đã/chưa gắn PT-TD) có trong danh sách');
    const one = cat.contractPriceChoices({ contractId, priceId: cdId });
    assert.equal(one.items.length, 1); assert.equal(one.items[0].priceId, cdId); assert.equal(one.routeCode, 'VC.007'); assert.equal(one.items[0].routeName, store.get('TUYEN_VC', 'VC.007').route_name);
    assert.throws(() => cat.contractPriceChoices({ contractId, priceId: cdId, routeCode: 'VC.002' }), (e) => e.code === 'VALIDATION_FAILED');
    assert.throws(() => cat.contractPriceChoices({ contractId, priceId: 'KHONG-CO' }), (e) => e.code === 'NOT_FOUND');
    assert.equal(cat.contractPriceChoices({ contractId, routeCode: 'VC.999' }).items.length, 0);
    assert.ok(cat.contractPriceChoices({ contractId }).total >= byRoute.total);
    assert.equal(byRoute.items.every((x) => x.chosenForContract === false), true);
    await cat.addContractPrice({ contractId, priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN });
    assert.ok(cat.contractPriceChoices({ contractId, routeCode: 'VC.007' }).items.every((x) => x.chosenForContract === true));
    // giá riêng của hợp đồng không xuất hiện như một lựa chọn
    assert.ok(!cat.contractPriceChoices({ contractId, routeCode: 'VC.007' }).items.some((x) => x.priceCode === ''));
    store.close();
  });

  test(`${tag} (g) contractFuelStats: thống kê chỉ đọc khớp tổng dữ liệu mẫu; không ghi gì`, async () => {
    const { store, contractId } = await install('DH', { kind });
    const cat = new CatalogService(store);
    const rows = store.find('GIAO_NHAN_DAU', (r) => r.contract_id === contractId && !r.is_deleted);
    const rev = store.get('HOP_DONG', contractId).row_version; const n = store.all('AUDIT_LOG').length;
    const s = cat.contractFuelStats({ contractId });
    assert.equal(s.totals.receipts, rows.length); assert.equal(s.totals.receipts, 16);
    assert.equal(s.totals.liters, Math.round(rows.reduce((t, r) => t + r.qty_liter, 0) * 1000) / 1000);
    assert.equal(s.totals.amount, Math.round(rows.reduce((t, r) => t + r.qty_liter * r.fuel_price_excl_vat, 0)));
    assert.equal(s.items.length, 1); assert.equal(s.items[0].routeCode, 'VC.007'); assert.equal(s.items[0].receipts, 16);
    assert.equal(s.items[0].firstDate, '2026-09-16'); assert.equal(s.items[0].lastDate, '2026-09-23');
    assert.equal(store.get('HOP_DONG', contractId).row_version, rev); assert.equal(store.all('AUDIT_LOG').length, n);
    // dòng đã xóa không tính; hợp đồng không dầu → rỗng; không có hợp đồng → NOT_FOUND
    await store.transaction((tx) => tx.update('GIAO_NHAN_DAU', rows[0].receipt_id, { is_deleted: true }), { user: 'test' });
    assert.equal(cat.contractFuelStats({ contractId }).totals.receipts, 15);
    assert.throws(() => cat.contractFuelStats({ contractId: 'KHONG-CO' }), (e) => e.code === 'NOT_FOUND');
    store.close();
  });

  test(`${tag} contractRoutePrices: hợp đồng không có tuyến riêng → nguồn PHUONG_THUC/CHUNG; không tìm thấy → NOT_FOUND; chỉ đọc`, async () => {
    const { store, contractId } = await install('DH', { withData: false, kind });
    const cat = new CatalogService(store); await cat.backfillCodeMethods({ user: { username: 'system' } });
    const items = cat.contractRoutePrices({ contractId }).items;
    assert.ok(items.length >= 1 && items.every((x) => ['PHUONG_THUC', 'CHUNG'].includes(x.source)));
    const x = items.find((i) => i.routeCode === 'VC.007');
    for (const k of ['routeCode', 'routeName', 'distanceKm', 'uom', 'priceId', 'priceCode', 'priceMethod', 'priceMethodLabel', 'contractPrice', 'effectiveFrom', 'status', 'source']) assert.ok(x[k] !== undefined && x[k] !== null, k);
    assert.throws(() => cat.contractRoutePrices({ contractId: 'KHONG-CO' }), (e) => e.code === 'NOT_FOUND');
    store.close();
  });
  test(`${tag} cảnh báo W_CONTRACT_PRICE_NOT_PREFERRED: hợp đồng đang dùng mã tự tạo (bản cũ) có dòng cho tuyến → thêm đơn giá riêng vẫn lưu nhưng báo tuyến vẫn tính theo mã`, async () => {
    const { store, contractId } = await install('DH', { withData: false, kind });
    const cat = new CatalogService(store); const md = new MasterDataService(store);
    const cdId = await fixedSource(cat);
    const unit = store.get('HOP_DONG', contractId).customer_unit_code;
    await cat.savePriceCode({ create: true, record: { priceCode: 'DG-CU-01', unitCode: unit, priceName: 'Mã tự tạo bản cũ' }, user: KETOAN });
    const l = await cat.addCodeLine({ priceCode: 'DG-CU-01', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 120000 }, user: KETOAN });
    await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
    await md.saveContract({ record: { contractId, priceCode: 'DG-CU-01' }, rowVersion: store.get('HOP_DONG', contractId).row_version, user: KETOAN });
    const add = await cat.addContractPrice({ contractId, routeCode: 'VC.007', priceId: cdId, effectiveFrom: '2026-09-01', user: KETOAN });
    const w = add.warnings.find((x) => x.code === 'W_CONTRACT_PRICE_NOT_PREFERRED');
    assert.ok(w, 'phải có cảnh báo'); assert.match(w.message, /DG-CU-01/); assert.match(w.message, /VC\.007/);
    assert.equal(add.record.contract_id, contractId, 'dòng giá riêng vẫn được lưu'); assert.equal(add.record.status, 'ACTIVE');
    store.close();
  });
}
