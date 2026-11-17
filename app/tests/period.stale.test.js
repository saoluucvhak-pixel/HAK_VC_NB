'use strict';
/**
 * F2 — kỳ NHÁP không được xác nhận khi còn phiếu cân / dòng dầu hợp lệ trong phạm vi mà chưa được tính:
 *  - phiếu MỚI (import), dầu MỚI (nhập tay / import), phiếu KHÔI PHỤC, phiếu ĐỔI tuyến vào phạm vi kỳ → kỳ nháp đánh dấu "cần tính lại";
 *  - cổng ở "Xác nhận kỳ" tự kiểm phạm vi (cả dữ liệu cũ chưa có cờ) → E_NEEDS_RECALC kèm số phiếu / dòng dầu thiếu;
 *  - không báo nhầm: phiếu ngoài khoảng ngày, xe ngoài hợp đồng, phiếu / dầu người dùng đã chủ động bỏ khỏi kỳ, kỳ đã chốt (chỉ cảnh báo "về muộn").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');
const { TicketService } = require('../main/services/TicketService');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const HDR = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (kg)', 'Mã tuyến'];
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const row = (no, d, plate, route = 'VC.007') => [no, d, '08:00:00', d, '09:00:00', plate, 13000, 30000, 17000, route];

async function setup() {
  const ctx = await install('HAKQN');
  const { store, periods, contractId } = ctx;
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp }); const tk = new TicketService(store);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-stale-'));
  const calc = (extra = {}) => periods.calculate({ contractId, ...W, reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN, ...extra });
  const out = await calc(); const pid = out.period.period_id;
  const plate = store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid && d.is_current)[0].plate_no;
  const importCsv = async (name, rows) => {
    const f = path.join(dir, name); fs.writeFileSync(f, `﻿${[HDR, ...rows].map((r) => r.map(q).join(',')).join('\n')}`);
    const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: f, user: 'ketoan' });
    return imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  };
  const P = () => store.get('KY_TINH', pid);
  const confirm = () => periods.confirm({ periodId: pid, rowVersion: P().row_version, user: KETOAN });
  return { ...ctx, imp, rec, tk, calc, pid, plate, importCsv, P, confirm };
}
const fuelRow = (store) => { const g = store.find('GIAO_NHAN_DAU', (x) => !x.is_deleted)[0]; return { receive_date: '2026-09-19', route_code: 'VC.007', fuel_vehicle_code: g.fuel_vehicle_code, uom: 'LÍT', qty_liter: 100, fuel_price_excl_vat: g.fuel_price_excl_vat, giver_unit_code: g.giver_unit_code }; };

test('Phiếu cân MỚI nhập sau khi tính: kỳ nháp bị đánh dấu, không xác nhận được, tính lại rồi xác nhận được', async () => {
  const s = await setup();
  assert.equal(s.P().needs_recalc, false);
  const r = await s.importCsv('late.csv', [row('T7001', '2026-09-20', s.plate)]);
  assert.equal(r.inserted, 1); assert.deepEqual(r.recalcPeriods, [s.pid]);
  assert.equal(s.P().needs_recalc, true, 'kỳ nháp phải được đánh dấu cần tính lại');
  await assert.rejects(s.confirm, (e) => e.code === 'BUSINESS_RULE' && /tính lại/.test(e.message));
  await s.calc({ periodId: s.pid });
  assert.equal(s.P().needs_recalc, false);
  assert.ok(s.store.find('TRANSPORT_DETAIL', (d) => d.period_id === s.pid && d.is_current && s.store.get('PHIEU_CAN', d.ticket_id).ticket_no === 'T7001').length, 'phiếu mới vào kỳ sau khi tính lại');
  const c = await s.confirm(); assert.equal(c.status, 'DA_XAC_NHAN');
  s.store.close();
});

test('Cổng xác nhận tự bắt dữ liệu cũ thiếu cờ (phiếu / dầu nhập sau lần tính, không có needs_recalc)', async () => {
  const s = await setup();
  const plate = s.plate;
  // giả lập dữ liệu của bản cũ: chèn thẳng, KHÔNG đặt cờ
  const t = { ...s.store.get('PHIEU_CAN', s.store.find('TRANSPORT_DETAIL', (d) => d.period_id === s.pid)[0].ticket_id) };
  await s.store.transaction((tx) => {
    const base = { ...t }; for (const k of ['created_at', 'created_by', 'updated_at', 'updated_by', 'row_version']) delete base[k];
    tx.insert('PHIEU_CAN', { ...base, ticket_id: 'PC-legacy000001', ticket_no: 'L1', ticket_key: `L1|2026-09-20|${plate}`, weigh1_date: '2026-09-20', weigh2_date: '2026-09-20' });
    const g = s.store.find('GIAO_NHAN_DAU', (x) => !x.is_deleted)[0]; const gb = { ...g }; for (const k of ['created_at', 'created_by', 'updated_at', 'updated_by', 'row_version']) delete gb[k];
    tx.insert('GIAO_NHAN_DAU', { ...gb, receipt_id: 'GD-legacy-1', qty_liter: 50 });
  }, { user: 'x' });
  assert.equal(s.P().needs_recalc, false);
  await assert.rejects(s.confirm, (e) => /1 phiếu cân và 1 dòng dầu/.test(e.message) && e.details && e.details.ticketCount === 1 && e.details.fuelCount === 1);
  await s.calc({ periodId: s.pid }); assert.equal((await s.confirm()).status, 'DA_XAC_NHAN');
  s.store.close();
});

test('Dầu MỚI (nhập tay), phiếu KHÔI PHỤC, phiếu ĐỔI tuyến vào phạm vi → kỳ nháp bị đánh dấu', async () => {
  const s = await setup();
  // dầu nhập tay
  const rr = await s.rec.saveFuelRows({ contractId: s.contractId, rows: [fuelRow(s.store)], acceptWarnings: true, clientRequestId: rid(), user: KETOAN });
  assert.equal(rr.inserted, 1); assert.equal(s.P().needs_recalc, true, 'dầu mới → cần tính lại');
  await s.calc({ periodId: s.pid }); assert.equal(s.P().needs_recalc, false);
  // khôi phục phiếu đã xóa (phiếu chưa thuộc kỳ nào: tạo rồi xóa)
  await s.importCsv('r.csv', [row('R1', '2026-09-21', s.plate)]); await s.calc({ periodId: s.pid });
  const t = s.store.find('PHIEU_CAN', (x) => x.ticket_no === 'R1')[0];
  await s.rec.softDeleteTicket({ ticketId: t.ticket_id, reason: 'xóa thử', user: KETOAN }); await s.calc({ periodId: s.pid });
  assert.equal(s.P().needs_recalc, false);
  const res = await s.rec.restoreTicket({ ticketId: t.ticket_id, reason: 'khôi phục', user: KETOAN });
  assert.deepEqual(res.affectedPeriods, [s.pid]); assert.equal(s.P().needs_recalc, true, 'khôi phục phiếu → cần tính lại');
  await s.calc({ periodId: s.pid });
  // đổi tuyến: phiếu tuyến khác (ngoài kỳ lọc VC.007) đổi sang VC.007
  const other = s.store.find('TUYEN_VC', (x) => x.route_code !== 'VC.007' && x.is_active)[0].route_code;
  await s.importCsv('o.csv', [row('O1', '2026-09-21', s.plate, other)]);
  assert.equal(s.P().needs_recalc, false, 'phiếu khác tuyến lọc của kỳ: không ảnh hưởng');
  const o = s.store.find('PHIEU_CAN', (x) => x.ticket_no === 'O1')[0];
  await s.tk.update({ ticketId: o.ticket_id, rowVersion: o.row_version, changes: { route_code: 'VC.007' }, user: KETOAN });
  assert.equal(s.P().needs_recalc, true, 'đổi tuyến vào phạm vi kỳ → cần tính lại');
  s.store.close();
});

test('Không báo nhầm: ngoài khoảng ngày, xe ngoài hợp đồng, phiếu đã bỏ khỏi kỳ, kỳ đã chốt', async () => {
  const s = await setup();
  const outside = s.store.all('XE').find((x) => !s.store.find('HOP_DONG_XE', (v) => v.plate_no === x.plate_no).length);
  const r1 = await s.importCsv('x.csv', [row('X1', '2026-09-17', s.plate), row('X2', '2026-09-24', s.plate)].concat(outside ? [row('X3', '2026-09-20', outside.plate_no)] : []));
  assert.equal(r1.inserted, outside ? 3 : 2); assert.equal(r1.recalcPeriods.length, 0);
  assert.equal(s.P().needs_recalc, false); assert.equal((await s.confirm()).status, 'DA_XAC_NHAN', 'không có gì thiếu → xác nhận được (không báo nhầm)');
  // kỳ đã chốt: phiếu về muộn chỉ cảnh báo, kỳ không đổi trạng thái / cờ
  const before = s.P();
  const r2 = await s.importCsv('late2.csv', [row('Z9', '2026-09-20', s.plate)]);
  assert.equal(r2.recalcPeriods.length, 0); assert.equal(s.P().status, 'DA_XAC_NHAN'); assert.equal(s.P().needs_recalc, false); assert.equal(s.P().row_version, before.row_version);
  s.store.close();
});

test('Phiếu / dầu người dùng đã chủ động BỎ khỏi kỳ không bị coi là thiếu', async () => {
  const s = await setup();
  const tid = s.store.find('TRANSPORT_DETAIL', (d) => d.period_id === s.pid && d.is_current)[0].ticket_id;
  const rid1 = s.store.find('FUEL_DETAIL', (d) => d.period_id === s.pid && d.is_current)[0].receipt_id;
  await s.calc({ periodId: s.pid, excludeTicketIds: [tid], excludeReceiptIds: [rid1] });
  assert.equal(s.P().needs_recalc, false);
  assert.equal((await s.confirm()).status, 'DA_XAC_NHAN', 'phiếu / dòng dầu đã bỏ có chủ ý: xác nhận được');
  s.store.close();
});
