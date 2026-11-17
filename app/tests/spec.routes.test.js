'use strict';
/** F6/F7 — mọi route trong Router phải có trong đặc tả (và ngược lại), vai trò Router khớp đặc tả; xóa hàng loạt liệt kê mã không tồn tại. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROUTES, PUBLIC } = require('../main/api/router');
const SPEC = require('../shared/api_spec.json');
const { install, KETOAN, rid } = require('./install');
const { RecordService } = require('../main/services/RecordService');
const { ImportService } = require('../main/import/ImportService');

test('F6: ROUTES ↔ api_spec.json khớp hai chiều', () => {
  const routes = new Set(Object.keys(ROUTES)); const spec = new Set(SPEC.actions.map((a) => a.action));
  assert.deepEqual([...routes].filter((x) => !spec.has(x)).sort(), [], 'route có trong mã nhưng thiếu trong đặc tả');
  assert.deepEqual([...spec].filter((x) => !routes.has(x)).sort(), [], 'đặc tả có nhưng thiếu trong mã');
  assert.ok(PUBLIC);
});

test('F7: softDeleteMany liệt kê riêng mã không tồn tại và phiếu đã xóa trước đó', async () => {
  const { store } = await install('DH');
  const rec = new RecordService(store, { importService: new ImportService(store) });
  const [a, b] = store.find('PHIEU_CAN', (t) => !t.is_deleted).slice(0, 2);
  const x = await rec.softDeleteTickets({ ticketIds: [a.ticket_id, 'KHONG-CO', 'KHONG-CO-2'], reason: 'test', user: KETOAN });
  assert.equal(x.deleted, 1); assert.deepEqual(x.notFound, ['KHONG-CO', 'KHONG-CO-2']); assert.deepEqual(x.alreadyDeleted, []);
  const y = await rec.softDeleteTickets({ ticketIds: [a.ticket_id, 'KHONG-CO'], reason: 'test', user: KETOAN });
  assert.equal(y.deleted, 0); assert.deepEqual(y.alreadyDeleted, [a.ticket_id]); assert.deepEqual(y.notFound, ['KHONG-CO']);
  const g = store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted)[0];
  const f = await rec.softDeleteFuelMany({ receiptIds: [g.receipt_id, 'NOPE'], reason: 'test', user: KETOAN });
  assert.equal(f.deleted, 1); assert.deepEqual(f.notFound, ['NOPE']);
  void b; void rid;
});
