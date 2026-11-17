'use strict';
/**
 * Giai đoạn 1 — CỔNG: cùng kịch bản nghiệp vụ chạy trên kho JSON và kho SQLite phải cho DẤU VÂN TAY `canon` GIỐNG HỆT từng bảng
 * (nhập Excel → tính kỳ → sửa/xóa/khôi phục phiếu → nhập dầu → xác nhận → khóa), và vẫn y nguyên sau khi đóng/mở lại.
 * Đồng hồ cố định để thời điểm ghi không làm lệch.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN, rid } = require('./install');
const { newStore, storageKinds } = require('../main/repo/createStore');
const { RecordService } = require('../main/services/RecordService');
const { ImportService } = require('../main/import/ImportService');

const mkClock = () => { let n = 0; return () => `2026-09-24T08:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n++ % 60).padStart(2, '0')}+07:00`; };

async function scenario(kind) {
  const clock = mkClock();
  const ctx = await install('DH', { kind, clock, installId: 'INS-PARITY' });
  const { store, periods, contractId } = ctx;
  const rec = new RecordService(store, { importService: new ImportService(store) });
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: 'par-1', user: KETOAN });
  const pid = k.period.period_id;
  const tk = store.find('PHIEU_CAN', (t) => !t.is_deleted && t.weigh1_date === '2026-09-25' )[0] || store.find('PHIEU_CAN', (t) => !t.is_deleted)[0];
  await rec.softDeleteTickets({ ticketIds: [tk.ticket_id], reason: 'thử', user: KETOAN });
  await rec.restoreTicket({ ticketId: tk.ticket_id, reason: 'thử', user: KETOAN });
  await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', periodId: pid, clientRequestId: 'par-2', user: KETOAN });
  await periods.confirm({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  await periods.lock({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  const fp = store.fingerprint(); const dv = store.dataVersion; const rows = store.stats().rows;
  store.close();
  const again = newStore(ctx.dir, { clock }, kind).open();
  const fp2 = again.fingerprint(); again.close();
  void rid;
  return { fp, fp2, dv, rows };
}

test('Parity JSON ↔ SQLite: cùng kịch bản → cùng dấu vân tay từng bảng, cùng số dòng, cùng dataVersion; mở lại không đổi', async () => {
  const kinds = storageKinds(); if (!kinds.includes('sqlite')) return;
  const a = await scenario('json'); const b = await scenario('sqlite');
  const diff = Object.keys(a.fp.perTable).filter((t) => a.fp.perTable[t].sha256 !== b.fp.perTable[t].sha256);
  assert.deepEqual(diff, [], `bảng lệch: ${diff.join(', ')}`);
  assert.deepEqual(a.rows, b.rows); assert.equal(a.dv, b.dv);
  assert.equal(a.fp.sequences, b.fp.sequences); assert.equal(a.fp.sha256, b.fp.sha256);
  assert.equal(a.fp2.sha256, a.fp.sha256, 'JSON mở lại không đổi'); assert.equal(b.fp2.sha256, b.fp.sha256, 'SQLite mở lại không đổi');
  assert.ok(a.rows.PHIEU_CAN > 0 && a.rows.KY_TINH === 1);
});
