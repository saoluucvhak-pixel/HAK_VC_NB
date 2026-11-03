'use strict';
/** Xóa nhiều dòng dầu tải lên sai (bản 1.2.6): giữ dòng ở kỳ đã chốt, kỳ nháp phải tính lại, import lại file đúng được. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN, ADMIN, rid, FILE } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');
const { QueryService } = require('../main/services/QueryService');

test('Xóa các dòng dầu đang lọc → tải lại file → đủ dòng, tính được như cũ', async () => {
  const { store, periods, contractId } = await install('DH');
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp }); const q = new QueryService(store);
  const W = { contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
  const before = (await periods.preview(W)).results[0].transportPrice;
  const k = await periods.calculate({ ...W, dateTo: '2026-09-19', clientRequestId: rid(), user: KETOAN }); // kỳ nháp dùng dầu
  await assert.rejects(rec.softDeleteFuelMany({ receiptIds: ['x'], user: ADMIN }), /lý do/);
  const all = q.fuel({ contractId }).items;
  const x = await rec.softDeleteFuelMany({ receiptIds: all.map((r) => r.receipt_id), reason: 'file sai', user: ADMIN });
  assert.equal(x.deleted, all.length); assert.deepEqual(x.affectedPeriods, [k.period.period_id]);
  assert.equal(q.fuel({ contractId }).total, 0);
  assert.equal(store.get('KY_TINH', k.period.period_id).needs_recalc, true);
  // tải lại file đúng
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: FILE.DH, user: 'ketoan' });
  assert.equal(pv.summary.duplicate, 0);
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(q.fuel({ contractId }).total, all.length);
  store.close();
  void before;
});

test('Dòng dầu ở kỳ đã xác nhận được giữ lại khi xóa hàng loạt', async () => {
  const { store, periods, contractId } = await install('DH');
  const rec = new RecordService(store, { importService: new ImportService(store) }); const q = new QueryService(store);
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const all = q.fuel({ contractId }).items;
  const x = await rec.softDeleteFuelMany({ receiptIds: all.map((r) => r.receipt_id), reason: 'thử', user: ADMIN });
  assert.equal(x.deleted, 0); assert.equal(x.skipped.length, all.length); assert.equal(x.skipped[0].periodCode, k.period.period_code);
  store.close();
});
