'use strict';
/**
 * Lỗi xác nhận (rà soát 1.3.0): hai yêu cầu CÙNG clientRequestId chạy đồng thời (bấm đúp "Xác nhận import") đều chạy → nhập dầu bị NHÂN ĐÔI (16 → 32 dòng).
 * Nay: cùng id đang chạy → trả cùng một kết quả; hai id khác nhau cho cùng một lô → lô thứ hai bị chặn rõ (E_BATCH_BUSY), dữ liệu không nhân đôi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, FILE, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');

test('Import dầu: cùng clientRequestId đồng thời → chỉ một lần ghi, cùng kết quả', async () => {
  const { store } = await install('DH', { withData: false }); const imp = new ImportService(store);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-DH-HAKQN', filePath: FILE.DH, user: 'k' }); const id = rid();
  const go = () => imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: id, user: 'k' });
  const [a, b] = await Promise.all([go(), go()]);
  assert.equal(a.inserted, 16); assert.deepEqual(a, b, 'cùng một kết quả');
  assert.equal(store.all('GIAO_NHAN_DAU').length, 16, 'không nhân đôi dòng dầu');
  assert.equal(store.find('IMPORT_BATCH', (x) => x.status === 'CONFIRMED').length, 1);
});

test('Import: hai clientRequestId KHÁC nhau cho cùng một lô → lô thứ hai bị chặn rõ ràng, không nhân đôi', async () => {
  const { store } = await install('DH', { withData: false }); const imp = new ImportService(store);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-DH-HAKQN', filePath: FILE.DH, user: 'k' });
  const go = () => imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));
  const res = await Promise.all([go(), go()]);
  assert.equal(res.filter((x) => x.ok).length, 1); const bad = res.find((x) => !x.ok);
  assert.equal(bad.e.details && bad.e.details.code, 'E_BATCH_BUSY');
  assert.equal(store.all('GIAO_NHAN_DAU').length, 16);
});

test('Nhập tay dầu / tính kỳ: cùng clientRequestId đồng thời → một lần', async () => {
  const { store, periods, contractId } = await install('DH');
  const rec = new RecordService(store, { importService: new ImportService(store) });
  const g = store.find('GIAO_NHAN_DAU', (x) => !x.is_deleted)[0]; const n0 = store.all('GIAO_NHAN_DAU').length;
  const row = { receive_date: '2026-09-19', route_code: 'VC.007', fuel_vehicle_code: g.fuel_vehicle_code, uom: 'LÍT', qty_liter: 77, fuel_price_excl_vat: g.fuel_price_excl_vat, giver_unit_code: g.giver_unit_code };
  const id = rid(); const save = () => rec.saveFuelRows({ contractId, rows: [row], acceptWarnings: true, clientRequestId: id, user: KETOAN });
  const [a, b] = await Promise.all([save(), save()]); assert.deepEqual(a, b); assert.equal(store.all('GIAO_NHAN_DAU').length, n0 + 1);
  const cid = rid(); const calc = () => periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: cid, user: KETOAN });
  const [p, q] = await Promise.all([calc(), calc()]); assert.equal(p.period.period_id, q.period.period_id); assert.equal(store.all('KY_TINH').length, 1);
});
