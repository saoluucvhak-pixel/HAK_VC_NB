'use strict';
/** Danh mục xe nhập sai: sửa thông tin, sửa biển số (khi chưa có phiếu cân / kỳ), xóa xe chưa dùng, chặn khi đã dùng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, ADMIN } = require('./install');
const { MasterDataService } = require('../main/services/MasterDataService');
const { JsonStore } = require('../main/repo/JsonStore');

test('Sửa xe nhập sai: thông tin, biển số (chuyển cả phạm vi hợp đồng), xóa; xe đã có phiếu cân thì không đổi biển số', async () => {
  const { store, dir, contractId } = await install('DH');
  const m = new MasterDataService(store);
  // thêm nhầm xe 92H-0O999 → sai dạng bị chặn ngay
  await assert.rejects(m.saveVehicle({ create: true, record: { plateNo: '92H-0O999', ownerUnitCode: 'DH' }, user: ADMIN }), /không đúng dạng/);
  // thêm nhầm biển 92H-99999 (đúng là 92H-99990), gán luôn vào hợp đồng
  await m.saveVehicle({ create: true, record: { plateNo: '92H-99999', ownerUnitCode: 'DH', fuelCode: 'DH_92H99999' }, user: ADMIN });
  const cur = store.find('HOP_DONG_XE', (v) => v.contract_id === contractId).map((v) => ({ plateNo: v.plate_no, effectiveFrom: v.effective_from, effectiveTo: v.effective_to }));
  await m.setContractVehicles({ contractId, vehicles: [...cur, { plateNo: '92H-99999', effectiveFrom: '2026-09-01' }], user: ADMIN });

  // sửa thông tin (chủ xe, mã dầu, ghi chú)
  let x = store.get('XE', '92H-99999');
  await m.saveVehicle({ record: { plateNo: '92H-99999', ownerUnitCode: 'HAKQN', fuelCode: 'DH_92H99990', note: 'xe thuê' }, rowVersion: x.row_version, user: ADMIN });
  x = store.get('XE', '92H-99999');
  assert.equal(x.owner_unit_code, 'HAKQN'); assert.equal(x.note, 'xe thuê');

  // sửa biển số
  const u = m.vehicleUsage({ plateNo: '92H-99999' });
  assert.equal(u.canRename, true); assert.deepEqual(u.contracts, [contractId]);
  const r = await m.renameVehicle({ plateNo: '92H-99999', newPlateNo: '92h-99990', rowVersion: x.row_version, reason: 'nhập nhầm', user: ADMIN });
  assert.equal(r.to, '92H-99990'); assert.equal(r.contractRows, 1);
  assert.equal(store.get('XE', '92H-99999'), null);
  const nx = store.get('XE', '92H-99990');
  assert.equal(nx.owner_unit_code, 'HAKQN'); assert.equal(nx.fuel_code, 'DH_92H99990'); assert.equal(nx.plate_key, '92H99990');
  assert.equal(store.find('HOP_DONG_XE', (v) => v.plate_no === '92H-99990').length, 1);
  assert.equal(store.find('HOP_DONG_XE', (v) => v.plate_no === '92H-99999').length, 0);
  assert.ok(store.find('AUDIT_LOG', (a) => a.action === 'RENAME' && a.entity_id === '92H-99999').length);

  // trùng biển số đã có → chặn
  await assert.rejects(m.renameVehicle({ plateNo: '92H-99990', newPlateNo: '92H-00192', user: ADMIN }), /Đã có xe 92H-00192/);
  // xe đã có phiếu cân → không đổi biển số, không xóa
  const used = m.vehicleUsage({ plateNo: '92H-00192' });
  assert.equal(used.canRename, false); assert.ok(used.tickets > 0);
  await assert.rejects(m.renameVehicle({ plateNo: '92H-00192', newPlateNo: '92H-00193', user: ADMIN }), /phiếu cân/);
  await assert.rejects(m.deleteVehicle({ plateNo: '92H-00192', user: ADMIN }), /không xóa được/);
  // xe đang trong hợp đồng → không xóa; xe chưa dùng → xóa được
  await assert.rejects(m.deleteVehicle({ plateNo: '92H-99990', user: ADMIN }), /hợp đồng/);
  await m.saveVehicle({ create: true, record: { plateNo: '92H-88888', ownerUnitCode: 'DH' }, user: ADMIN });
  await m.deleteVehicle({ plateNo: '92H-88888', reason: 'nhập nhầm', user: ADMIN });
  assert.equal(store.get('XE', '92H-88888'), null);

  // mở lại kho: dữ liệu toàn vẹn (SHA-256, khóa ngoại)
  store.close();
  const again = new JsonStore(dir).open();
  assert.ok(again.get('XE', '92H-99990')); assert.equal(again.get('XE', '92H-99999'), null); assert.equal(again.get('XE', '92H-88888'), null);
  again.close();
});
