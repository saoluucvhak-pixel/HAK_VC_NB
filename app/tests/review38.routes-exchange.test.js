'use strict';
/**
 * Rà soát #38: (1) contractRouteSources chỉ coi là "tuyến của hợp đồng" các tuyến có phiếu cân của xe trong hợp đồng / dòng giá của mã / giá riêng;
 * allFixed tính trên tuyến của hợp đồng. (2) catalog_date (ngày theo dõi từng máy) không làm gói danh mục báo khác nội dung.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { MasterDataService } = require('../main/services/MasterDataService');
const { ExchangeService } = require('../main/services/ExchangeService');

test('Hợp đồng chỉ chạy VC.007 + mã cố định → tuyến của hợp đồng chỉ VC.007, allFixed = true; tuyến khác vẫn có (inContract=false)', async () => {
  const { store, contractId } = await install('DH'); const cat = new CatalogService(store); const md = new MasterDataService(store);
  const unit = store.get('HOP_DONG', contractId).customer_unit_code;
  let r = cat.contractRouteSources({ contractId });
  assert.deepEqual(r.items.filter((x) => x.inContract).map((x) => x.routeCode), ['VC.007'], 'trước khi gán mã: chỉ VC.007 có phiếu cân');
  assert.equal(r.allFixed, false, 'VC.007 đang theo giá dầu (giá chung)');
  assert.ok(r.items.some((x) => !x.inContract), 'tuyến khác vẫn trả về để xem');
  assert.equal(r.items[0].routeCode, 'VC.007', 'tuyến của hợp đồng lên đầu');
  await cat.savePriceCode({ create: true, record: { priceCode: 'DG-CD', unitCode: unit, priceName: 'x' }, user: KETOAN });
  const l = await cat.addCodeLine({ priceCode: 'DG-CD', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 150000 }, user: KETOAN });
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  await md.saveContract({ record: { contractId, priceCode: 'DG-CD' }, rowVersion: store.get('HOP_DONG', contractId).row_version, user: KETOAN });
  r = cat.contractRouteSources({ contractId });
  const it = r.items.find((x) => x.routeCode === 'VC.007');
  assert.deepEqual({ source: it.source, inUse: it.inUse, inContract: it.inContract, m: it.priceMethod }, { source: 'CODE', inUse: true, inContract: true, m: 'CO_DINH' });
  assert.equal(r.contractRoutes, 1); assert.equal(r.allFixed, true, 'mọi tuyến của hợp đồng cố định → không cần nhập dầu');
});

test('Phiếu cân của xe NGOÀI hiệu lực phạm vi xe không tính là tuyến của hợp đồng; hợp đồng chưa có tuyến → allFixed = null', async () => {
  const { store, contractId } = await install('DH'); const cat = new CatalogService(store);
  await store.transaction((tx) => { for (const v of tx.all('HOP_DONG_XE').filter((x) => x.contract_id === contractId)) tx.update('HOP_DONG_XE', v.id, { effective_from: '2099-01-01', effective_to: '' }); }, { user: 't' });
  const r = cat.contractRouteSources({ contractId });
  assert.equal(r.contractRoutes, 0, 'xe chưa hiệu lực ở ngày cân → phiếu không thuộc hợp đồng'); assert.equal(r.allFixed, null);
  assert.ok(r.items.length > 0 && r.items.every((x) => !x.inContract));
});

test('Gói danh mục: 2 máy "sửa giống" một tuyến ở 2 ngày khác nhau → SAME (catalog_date không tính là khác); khác cự ly thật → vẫn báo', async () => {
  const a = await install('HAK'); const b = await install('DH');
  const route = (s) => s.get('TUYEN_VC', 'VC.007');
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-r38-'));
  const send = async (target, name) => { const f = path.join(OUT, name); await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetUnitCode: target, targetPath: f, user: { username: 'k' } }); return f; };
  // cùng nội dung, chỉ khác ngày cập nhật
  await a.store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { catalog_date: '2026-11-01' }), { user: 't' });
  await b.store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { catalog_date: '2026-11-19' }), { user: 't' });
  const f1 = await send(b.store.unitCode, 'p1.zip');
  const pv1 = new ExchangeService(b.store).previewPackage({ filePath: f1, user: { username: 'k' } });
  const row = (pv) => [...(pv.conflicts || [])].find((x) => x.table === 'TUYEN_VC' && x.id === 'VC.007');
  assert.ok(!row(pv1), 'không có xung đột giả cho VC.007');
  assert.equal(pv1.summary.TUYEN_VC.UPDATE + pv1.summary.TUYEN_VC.CONFLICT, 0, JSON.stringify(pv1.summary.TUYEN_VC));
  // khác cự ly thật → phải báo
  await a.store.transaction((tx) => tx.update('TUYEN_VC', 'VC.007', { distance_km: Number(route(a.store).distance_km) + 1 }), { user: 't' });
  const f2 = await send(b.store.unitCode, 'p2.zip');
  const pv2 = new ExchangeService(b.store).previewPackage({ filePath: f2, user: { username: 'k' } });
  assert.equal(pv2.summary.TUYEN_VC.UPDATE + pv2.summary.TUYEN_VC.CONFLICT, 1, 'khác cự ly → vẫn báo');
});
