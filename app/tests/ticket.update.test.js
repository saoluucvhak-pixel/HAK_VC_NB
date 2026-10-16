'use strict';
/** Import lại phiếu cân đã sửa → cập nhật; phiếu đã xóa → khôi phục; kỳ đã chốt → chặn; xóa nhiều phiếu. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, ADMIN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-tkupd-'));
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
// file trạm cân KHÔNG có cột LDĐ / nguồn gốc → không được xóa trắng các cột đó
const HEAD = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Mã tuyến'];
async function file(name, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_VC'); ws.addRow(HEAD);
  for (const t of rows) ws.addRow([t.ticket_no, dmy(t.weigh1_date), t.weigh1_time, dmy(t.weigh2_date), t.weigh2_time, t.plate_no, t.weight1_kg, t.weight2_kg, t.net_kg, t.route_code]);
  const f = path.join(OUT, name); await wb.xlsx.writeFile(f); return f;
}
const pick = (store) => store.find('PHIEU_CAN', (t) => t.weigh1_date === '2026-09-20' && t.plate_no === '92H-00141').sort((a, b) => a.weigh1_time.localeCompare(b.weigh1_time));

test('Import lại file đã sửa số liệu → cập nhật phiếu đã có; cột không có trong file giữ nguyên; kỳ nháp phải tính lại; kỳ đã chốt bị chặn', async () => {
  const { store, periods, contractId } = await install('DH');
  const imp = new ImportService(store);
  const [a, b, c] = pick(store);
  const ldd = a.ldd; assert.ok(ldd, 'phiếu gốc có LDĐ');
  // kỳ nháp 20/09 chứa a
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-20', dateTo: '2026-09-20', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });

  const f = await file('sua.xlsx', [{ ...a, weight2_kg: a.weight2_kg + 30, net_kg: a.net_kg + 30 }, b]);
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: f, user: 'ketoan' });
  assert.equal(pv.summary.update, 1); assert.equal(pv.summary.duplicate, 1); assert.equal(pv.summary.error, 0);
  const row = pv.rows.find((r) => r.status === 'UPDATE');
  assert.match(row.issues[0].message, /CẬP NHẬT theo file: cân lần 2 .* KL hàng/); assert.match(row.issues[0].message, /kỳ nháp .* phải tính lại/);
  await assert.rejects(imp.confirm({ batchId: pv.batchId, clientRequestId: rid(), user: 'ketoan' }), /chấp nhận cảnh báo/);
  const r = await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(r.updated, 1); assert.equal(r.inserted, 0); assert.deepEqual(r.recalcPeriods, [k.period.period_id]);
  const a2 = store.get('PHIEU_CAN', a.ticket_id);
  assert.equal(a2.net_kg, a.net_kg + 30); assert.equal(a2.ldd, ldd, 'cột LDĐ không có trong file → giữ nguyên');
  assert.equal(store.get('KY_TINH', k.period.period_id).needs_recalc, true);
  assert.ok(store.find('AUDIT_LOG', (x) => x.action === 'IMPORT_UPDATE' && x.entity_id === a.ticket_id).length);

  // kỳ đã xác nhận → không cập nhật, báo rõ
  await periods.calculate({ contractId, dateFrom: '2026-09-20', dateTo: '2026-09-20', routeCode: 'VC.007', periodId: k.period.period_id, clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const pv2 = await imp.preview({ importType: 'PHIEU_CAN', filePath: await file('sua2.xlsx', [{ ...a2, net_kg: a2.net_kg + 1, weight2_kg: a2.weight2_kg + 1 }]), user: 'ketoan' });
  assert.equal(pv2.rows[0].status, 'ERROR'); assert.match(pv2.rows[0].issues[0].message, /đã xác nhận — trả kỳ về nháp/);
  await imp.cancel({ batchId: pv2.batchId });
  store.close();
});

test('Xóa nhiều phiếu (giữ phiếu ở kỳ đã chốt), lọc "Đã xóa", khôi phục; import lại phiếu đã xóa → khôi phục', async () => {
  const { store, periods, contractId } = await install('DH');
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp });
  const [a, b, c] = pick(store);
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-20', dateTo: '2026-09-20', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const other = store.find('PHIEU_CAN', (t) => t.weigh1_date === '2026-09-21').slice(0, 3);
  const x = await rec.softDeleteTickets({ ticketIds: [a.ticket_id, ...other.map((t) => t.ticket_id)], reason: 'file nhập nhầm', user: ADMIN });
  assert.equal(x.deleted, 3); assert.equal(x.skipped.length, 1); assert.equal(x.skipped[0].ticketNo, a.ticket_no);
  await assert.rejects(rec.softDeleteTickets({ ticketIds: [b.ticket_id], user: ADMIN }), /lý do/);
  const { QueryService } = require('../main/services/QueryService');
  const q = new QueryService(store);
  assert.equal(q.tickets({ usage: 'DELETED' }).total, 3);
  await rec.restoreTicket({ ticketId: other[0].ticket_id, user: ADMIN });
  assert.equal(store.get('PHIEU_CAN', other[0].ticket_id).is_deleted, false);
  // import lại 2 phiếu còn đang xóa → khôi phục
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: await file('lai.xlsx', other.slice(1)), user: 'ketoan' });
  assert.equal(pv.summary.update, 2); assert.match(pv.rows[0].issues.map((i) => i.message).join(), /KHÔI PHỤC/);
  const r = await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(r.restored, 2);
  assert.equal(q.tickets({ usage: 'DELETED' }).total, 0);
  store.close();
});
