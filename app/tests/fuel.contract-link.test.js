'use strict';
/** B2: dầu giao nhận là bảng con của hợp đồng — nhập tay lẫn import Excel đều gắn đúng hợp đồng (contract_id). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, FILE, KETOAN, rid, CONTRACT } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');

test('Nhập tay và import Excel đều gắn dòng dầu đúng hợp đồng đang chọn', async () => {
  const { store, contractId } = await install('HAKQN', { withData: false });
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp });
  assert.equal(store.find('GIAO_NHAN_DAU', () => true).length, 0);
  const man = await rec.saveFuelRows({ contractId, acceptWarnings: true, clientRequestId: rid(), user: KETOAN,
    rows: [{ receive_date: '2026-09-19', route_code: 'VC.007', fuel_vehicle_code: 'DH_92H00192', uom: 'LÍT', qty_liter: 40, fuel_price_excl_vat: 29000, giver_unit_code: 'DH' }] });
  assert.equal(man.inserted, 1);
  const afterManual = store.find('GIAO_NHAN_DAU', () => true); assert.ok(afterManual.every((r) => r.contract_id === contractId), 'nhập tay: đúng hợp đồng');
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, filePath: FILE.HAKQN, user: 'ketoan' });
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  const all = store.find('GIAO_NHAN_DAU', () => true); assert.ok(all.length > afterManual.length, 'import Excel thêm dòng');
  assert.ok(all.every((r) => r.contract_id === contractId), 'nhập tay + import Excel: tất cả dòng gắn đúng hợp đồng');
  store.close();
});
