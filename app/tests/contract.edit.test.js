'use strict';
/** Hợp đồng nhập sai (bản 1.2.4): sửa thông tin; sửa mã / hai bên & xóa chỉ khi chưa có kỳ tính, dòng dầu; đã dùng → ngừng dùng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, ADMIN, KETOAN, rid } = require('./install');
const { MasterDataService } = require('../main/services/MasterDataService');
const { CatalogService } = require('../main/services/CatalogService');
const { JsonStore } = require('../main/repo/JsonStore');

test('Hợp đồng đã có dòng dầu / kỳ tính: sửa được số HĐ, ghi chú; không đổi mã / hai bên, không xóa; ngừng dùng → không tính giá', async () => {
  const { store, periods, contractId } = await install('DH');
  const m = new MasterDataService(store);
  const u = m.contractUsage({ contractId });
  assert.equal(u.canDelete, false); assert.equal(u.canEditParties, false); assert.match(u.blockers.join(), /16 dòng dầu/);
  let c = store.get('HOP_DONG', contractId);
  await m.saveContract({ record: { contractId, contractNo: '05/2026/HĐVC', note: 'sửa số HĐ' }, rowVersion: c.row_version, user: ADMIN });
  assert.equal(store.get('HOP_DONG', contractId).contract_no, '05/2026/HĐVC');
  c = store.get('HOP_DONG', contractId);
  await assert.rejects(m.saveContract({ record: { contractId, customerUnitCode: 'HAK' }, rowVersion: c.row_version, user: ADMIN }), /không đổi bên thuê được/);
  await assert.rejects(m.saveContract({ record: { contractId, contractCode: 'DH-XYZ' }, rowVersion: c.row_version, user: ADMIN }), /không đổi mã hợp đồng được/);
  // gửi lại đúng giá trị cũ (form luôn gửi đủ ô) → không bị chặn
  await m.saveContract({ record: { contractId, contractCode: c.contract_code, carrierUnitCode: c.carrier_unit_code, customerUnitCode: c.customer_unit_code, note: 'ok' }, rowVersion: c.row_version, user: ADMIN });
  await assert.rejects(m.deleteContract({ contractId, user: ADMIN }), /không xóa được/);
  c = store.get('HOP_DONG', contractId);
  await m.setContractActive({ contractId, active: false, rowVersion: c.row_version, user: ADMIN });
  const pv = await periods.preview({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23' });
  assert.ok(pv.issues.some((i) => i.code === 'E_CONTRACT_INACTIVE'));
  store.close();
});

test('Hợp đồng nhập nhầm chưa dùng: sửa mã + bên thuê, rồi xóa — xóa luôn phạm vi xe và giá riêng; dữ liệu toàn vẹn khi mở lại', async () => {
  const { store, dir } = await install('DH', { withData: false });
  const m = new MasterDataService(store);
  const r = await m.saveContract({ create: true, record: { contractCode: 'DH-HAKK', carrierUnitCode: 'DH', customerUnitCode: 'HAK', effectiveFrom: '2026-10-01' }, user: ADMIN });
  const id = r.record.contract_id;
  await m.setContractVehicles({ contractId: id, vehicles: [{ plateNo: '92H-00192', effectiveFrom: '2026-10-01' }], user: ADMIN });
  await new CatalogService(store).createPriceVersion({ record: { routeCode: 'VC.007', contractId: id, effectiveFrom: '2026-10-01', priceMethod: 'CO_DINH', fixedPrice: 90000 }, user: KETOAN });
  let u = m.contractUsage({ contractId: id });
  assert.equal(u.canEditParties, true); assert.equal(u.vehicles, 1); assert.equal(u.prices, 1);
  let c = store.get('HOP_DONG', id);
  await m.saveContract({ record: { contractId: id, contractCode: 'dh-cnhak', customerUnitCode: 'CNHAK' }, rowVersion: c.row_version, user: ADMIN });
  c = store.get('HOP_DONG', id);
  assert.equal(c.contract_code, 'DH-CNHAK'); assert.equal(c.customer_unit_code, 'CNHAK'); assert.equal(c.contract_id, id, 'mã nội bộ giữ nguyên');
  await assert.rejects(m.saveContract({ record: { contractId: id, contractCode: 'DH-HAKQN' }, rowVersion: c.row_version, user: ADMIN }), /đã dùng/);
  const d = await m.deleteContract({ contractId: id, reason: 'nhập nhầm', user: ADMIN });
  assert.equal(d.vehicleRows, 1); assert.equal(d.priceRows, 1);
  assert.equal(store.get('HOP_DONG', id), null);
  assert.equal(store.find('HOP_DONG_XE', (v) => v.contract_id === id).length, 0);
  assert.equal(store.find('PRICE_HISTORY', (p) => p.contract_id === id).length, 0);
  assert.ok(store.find('AUDIT_LOG', (a) => a.action === 'DELETE' && a.entity === 'HOP_DONG' && a.entity_id === id).length);
  store.close();
  const again = new JsonStore(dir).open(); assert.equal(again.get('HOP_DONG', id), null); again.close();
  void rid;
});
