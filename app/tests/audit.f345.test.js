'use strict';
/**
 * F3 — import "Cập nhật/Khôi phục" không ghi đè số liệu người khác vừa sửa tay sau lúc xem trước (E_PREVIEW_STALE).
 * F4 — lô xem trước bỏ dở được dọn khi mở kho; thông báo rõ khi xác nhận lô không còn phiên xem trước.
 * F5 — Router bắt buộc rowVersion cho thao tác sửa/đổi trạng thái bản ghi (không lách khóa lạc quan bằng cách bỏ trống).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { Router } = require('../main/api/router');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-f345-'));
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const HEAD = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Mã tuyến'];
async function file(name, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_VC'); ws.addRow(HEAD);
  for (const t of rows) ws.addRow([t.ticket_no, dmy(t.weigh1_date), t.weigh1_time, dmy(t.weigh2_date), t.weigh2_time, t.plate_no, t.weight1_kg, t.weight2_kg, t.net_kg, t.route_code]);
  const f = path.join(OUT, name); await wb.xlsx.writeFile(f); return f;
}
const pick = (store) => store.find('PHIEU_CAN', (t) => t.weigh1_date === '2026-09-20' && t.plate_no === '92H-00141').sort((a, b) => a.weigh1_time.localeCompare(b.weigh1_time));

test('F3: phiếu bị sửa tay sau lúc xem trước → xác nhận import UPDATE báo E_PREVIEW_STALE, không ghi đè', async () => {
  const { store } = await install('DH');
  const imp = new ImportService(store);
  const [a] = pick(store);
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: await file('f3.xlsx', [{ ...a, weight2_kg: a.weight2_kg + 30, net_kg: a.net_kg + 30 }]), user: 'ketoan' });
  assert.equal(pv.summary.update, 1);
  // người khác sửa tay phiếu đó (ghi chú) giữa lúc xem trước và xác nhận
  await store.transaction((tx) => tx.update('PHIEU_CAN', a.ticket_id, { net_kg: a.net_kg + 5 }, { expectedRowVersion: a.row_version }), { user: 'nguoikhac' });
  await assert.rejects(imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' }), (e) => e.details && e.details.code === 'E_PREVIEW_STALE' || /xem trước/.test(e.message));
  assert.equal(store.get('PHIEU_CAN', a.ticket_id).net_kg, a.net_kg + 5, 'giá trị sửa tay còn nguyên');
  // xem trước lại → chạy bình thường
  const pv2 = await imp.preview({ importType: 'PHIEU_CAN', filePath: await file('f3b.xlsx', [{ ...a, weight2_kg: a.weight2_kg + 30, net_kg: a.net_kg + 30 }]), user: 'ketoan' });
  const r = await imp.confirm({ batchId: pv2.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(r.updated, 1);
});

test('F4: lô PREVIEW bỏ dở → cancelOrphans chuyển CANCELLED; xác nhận lô đó báo rõ lý do', async () => {
  const { store } = await install('DH');
  const imp = new ImportService(store);
  const [a] = pick(store);
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: await file('f4.xlsx', [{ ...a, net_kg: a.net_kg + 1, weight2_kg: a.weight2_kg + 1 }]), user: 'ketoan' });
  const imp2 = new ImportService(store); // mô phỏng khởi động lại: bộ nhớ xem trước rỗng
  await assert.rejects(imp2.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' }), /đã hết.*xem trước lại/);
  const r = await imp2.cancelOrphans();
  assert.deepEqual(r.cancelled, [pv.batchId]);
  assert.equal(store.get('IMPORT_BATCH', pv.batchId).status, 'CANCELLED');
  await assert.rejects(imp2.confirm({ batchId: pv.batchId, clientRequestId: rid(), user: 'ketoan' }), /đã bị hủy/);
  assert.deepEqual((await imp2.cancelOrphans()).cancelled, [], 'chạy lại không còn gì');
});

test('F5: Router từ chối thao tác sửa khi thiếu rowVersion; có rowVersion thì qua cổng', async () => {
  const { AppContext } = require('../main/app/AppContext');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-f5-'));
  const ctx = new AppContext({ configFile: path.join(home, 'userData', 'dgvc-config.json') });
  const r = new Router(ctx);
  await r.handle('setup.init', { dataFolder: path.join(home, 'D'), unitCode: 'DH', mirrorFolder: '' }, '');
  const { data } = await r.handle('auth.openLocal');
  const tk = data.token;
  for (const action of ['periods.confirm', 'periods.lock', 'tickets.update', 'fuel.update', 'vehicles.setActive', 'prices.activate']) {
    const x = await r.handle(action, { periodId: 'X', ticketId: 'X', receiptId: 'X' }, tk);
    assert.equal(x.ok, false, action); assert.equal(x.error.code, 'VALIDATION_FAILED', action); assert.match(x.error.message, /rowVersion/, action);
  }
  // có rowVersion → qua cổng, lỗi khác (không tồn tại)
  const y = await r.handle('periods.confirm', { periodId: 'X', rowVersion: 1 }, tk);
  assert.equal(y.ok, false); assert.notEqual(y.error.code, 'VALIDATION_FAILED');
  ctx.close();
});
