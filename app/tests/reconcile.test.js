'use strict';
/** Đối chiếu dữ liệu: kiểm tra nội bộ (phiếu về muộn, lọt khe, xe 2 hợp đồng) + đối chiếu file phiếu cân / gói .dgvc của đơn vị khác. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { ExchangeService } = require('../main/services/ExchangeService');
const { ReconcileService } = require('../main/services/ReconcileService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-reconcile-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const HEAD = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Mã tuyến', 'Đơn vị VC'];
async function ticketFile(file, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_VC');
  ws.addRow(HEAD);
  for (const t of rows) ws.addRow([t.ticket_no, dmy(t.weigh1_date), t.weigh1_time, dmy(t.weigh2_date), t.weigh2_time, t.plate_no, t.weight1_kg, t.weight2_kg, t.net_kg, t.route_code, t.transport_unit_name || '']);
  await wb.xlsx.writeFile(file); return file;
}
async function confirmedDH() {
  const ctx = await install('DH');
  const { store, periods, contractId } = ctx;
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: [dup[1].receipt_id], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const imp = new ImportService(store); const ex = new ExchangeService(store);
  return { ...ctx, imp, ex, rec: new ReconcileService(store, { importService: imp, exchange: ex }), period: k.period };
}

test('Kiểm tra nội bộ: phiếu cân về muộn được cảnh báo khi import và hiện ở Đối chiếu dữ liệu', async () => {
  const { store, imp, rec, period } = await confirmedDH();
  let a = rec.audit({});
  assert.equal(a.summary.LATE.count, 0); assert.equal(a.summary.GAP.count, 0); assert.equal(a.summary.DRAFT.count, 0);
  assert.equal(a.rows.filter((r) => r.kind === 'WAITING').length, 0, 'mặc định không liệt kê phiếu chờ kỳ sau');

  // xe 92H-00192 cân thêm 1 phiếu ngày 20/09 nhưng file về sau khi đã chốt kỳ
  const late = { ticket_no: '99001', weigh1_date: '2026-09-20', weigh1_time: '10:00:00', weigh2_date: '2026-09-20', weigh2_time: '10:20:00', plate_no: '92H-00192', weight1_kg: 14000, weight2_kg: 32000, net_kg: 18000, route_code: 'VC.007' };
  const f = await ticketFile(path.join(OUT, 'late.xlsx'), [late]);
  const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: f, user: 'ketoan' });
  const row = pv.rows[0];
  assert.equal(row.status, 'WARNING');
  const w = row.issues.find((i) => i.code === 'W_TICKET_LATE');
  assert.ok(w, 'có cảnh báo phiếu về muộn'); assert.match(w.message, new RegExp(period.period_code)); assert.match(w.message, /20\/09\/2026/);
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });

  a = rec.audit({});
  assert.equal(a.summary.LATE.count, 1); assert.equal(a.summary.LATE.kg, 18000);
  assert.equal(a.rows[0].ticketNo, '99001'); assert.equal(a.rows[0].periodId, period.period_id); assert.equal(a.rows[0].periodStatus, 'DA_XAC_NHAN');
  assert.equal(a.problems, 1);

  // phiếu ngày 15/09 (trước kỳ đã chốt, không kỳ nào phủ) → lọt khe
  const gap = { ...late, ticket_no: '99002', weigh1_date: '2026-09-15', weigh2_date: '2026-09-15' };
  const g = await imp.preview({ importType: 'PHIEU_CAN', filePath: await ticketFile(path.join(OUT, 'gap.xlsx'), [gap]), user: 'ketoan' });
  assert.ok(!g.rows[0].issues.some((i) => i.code === 'W_TICKET_LATE'), 'không thuộc kỳ đã chốt → không phải về muộn');
  await imp.confirm({ batchId: g.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  a = rec.audit({});
  assert.equal(a.summary.GAP.count, 1); assert.equal(a.rows.find((r) => r.kind === 'GAP').ticketNo, '99002');

  // phiếu ngày 25/09 (sau kỳ đã chốt) → chờ kỳ sau, chỉ hiện khi bật includeWaiting
  const nxt = { ...late, ticket_no: '99003', weigh1_date: '2026-09-25', weigh2_date: '2026-09-25' };
  const n = await imp.preview({ importType: 'PHIEU_CAN', filePath: await ticketFile(path.join(OUT, 'next.xlsx'), [nxt]), user: 'ketoan' });
  await imp.confirm({ batchId: n.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(rec.audit({}).summary.WAITING.count, 0);
  assert.equal(rec.audit({ includeWaiting: true }).summary.WAITING.count, 1);

  // xe 92H-00192 khai thêm vào hợp đồng thứ 2 cùng bên thuê, thời gian chồng nhau → nguy cơ tính 2 lần
  const c0 = store.get('HOP_DONG', 'HD-DH-HAKQN') || store.all('HOP_DONG').find((c) => c.carrier_unit_code === store.unitCode);
  await store.transaction((tx) => {
    tx.insert('HOP_DONG', { ...c0, contract_id: 'HD-TEST-2', contract_code: 'HD-TEST-2' });
    tx.insert('HOP_DONG_XE', { id: 'HX-T1', contract_id: 'HD-TEST-2', plate_no: '92H-00192', effective_from: '2026-09-01', effective_to: '' });
  }, { user: 'test' });
  a = rec.audit({});
  assert.equal(a.overlaps.length, 1); assert.equal(a.overlaps[0].plateNo, '92H-00192'); assert.equal(a.overlaps[0].sameCustomer, true);

  // xuất Excel
  const xf = path.join(OUT, 'audit.xlsx'); await rec.export({ kind: 'AUDIT', params: {}, targetPath: xf });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xf);
  assert.deepEqual(wb.worksheets.map((s) => s.name), ['Tong hop', 'Phieu chua tinh', 'Xe 2 hop dong']);
  const ws = wb.getWorksheet('Phieu chua tinh');
  assert.equal(ws.getCell('B5').value, 'Về muộn — ngày cân thuộc kỳ đã chốt nhưng chưa tính'); assert.equal(ws.getCell('C5').value, '99001');
  store.close();
});

test('Đối chiếu file Excel phiếu cân của đơn vị khác: khớp / lệch / khác số phiếu / thiếu mỗi bên', async () => {
  const { store, rec } = await confirmedDH();
  const mine = store.find('PHIEU_CAN', (t) => !t.is_deleted && t.weigh1_date === '2026-09-20' && t.plate_no === '92H-00141').sort((a, b) => a.weigh1_time.localeCompare(b.weigh1_time));
  assert.ok(mine.length >= 4, `cần ≥4 phiếu, có ${mine.length}`);
  const [a, b, c, d] = mine;
  const theirs = [a, { ...b, net_kg: b.net_kg + 20, weight2_kg: b.weight2_kg + 20 }, { ...c, ticket_no: `${c.ticket_no}9` },
    { ...a, ticket_no: '88001', weigh1_time: '23:59:00', net_kg: 17777 }];
  const f = await ticketFile(path.join(OUT, 'theirs.xlsx'), theirs);
  const r = await rec.compare({ filePath: f });
  assert.equal(r.dateFrom, '2026-09-20'); assert.equal(r.dateTo, '2026-09-20'); assert.deepEqual(r.plates, ['92H-00141']);
  assert.equal(r.summary.KHOP.count, 1);
  assert.equal(r.summary.LECH.count, 1);
  const lech = r.rows.find((x) => x.kind === 'LECH'); assert.equal(lech.diffKg, 20); assert.match(lech.fields, /KL hàng/); assert.match(lech.fields, /Cân lần 2/);
  assert.equal(r.summary.KHAC_SO_PHIEU.count, 1);
  assert.equal(r.summary.THIEU_BEN_MINH.count, 1); assert.equal(r.rows.find((x) => x.kind === 'THIEU_BEN_MINH').theirTicketNo, '88001');
  assert.equal(r.summary.THIEU_BEN_KIA.count, mine.length - 3); assert.ok(r.rows.some((x) => x.kind === 'THIEU_BEN_KIA' && x.ticketNo === d.ticket_no));
  assert.ok(r.rows.find((x) => x.kind === 'KHOP').periodCode, 'phiếu bên mình ghi rõ đã ở kỳ nào');
  assert.equal(r.totals.mineTrips, mine.length); assert.equal(r.totals.theirTrips, 4);
  assert.equal(r.byPlate.length, 1); assert.equal(r.byPlate[0].diffTrips, 4 - mine.length);
  assert.equal(r.problems, r.rows.length - 1);
  // không ghi gì
  assert.equal(store.find('PHIEU_CAN', (t) => t.ticket_no === '88001').length, 0);
  const xf = path.join(OUT, 'compare.xlsx'); await rec.export({ kind: 'COMPARE', params: { filePath: f }, targetPath: xf });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xf);
  assert.deepEqual(wb.worksheets.map((s) => s.name), ['Tong hop', 'Theo xe', 'Chi tiet']);
  assert.equal(wb.getWorksheet('Chi tiet').getCell('B5').value, 'Lệch số liệu');
  store.close();
});

test('Đối chiếu gói .dgvc phiếu cân: cùng dữ liệu thì khớp hết; gói không có phiếu cân thì báo rõ', async () => {
  const { store, ex, rec } = await confirmedDH();
  const pkg = path.join(OUT, 'pc.dgvc');
  await ex.exportPackage({ packageType: 'PHIEU_CAN', dateFrom: '2026-09-18', dateTo: '2026-09-23', targetPath: pkg, user: { username: 'ketoan' } });
  const r = await rec.compare({ filePath: pkg });
  assert.equal(r.problems, 0); assert.equal(r.matched, 77); assert.match(r.source.sourceText, /gói Phiếu cân của DH/);
  const cat = path.join(OUT, 'dm.dgvc');
  await ex.exportPackage({ packageType: 'DANH_MUC', targetPath: cat, user: { username: 'ketoan' } });
  await assert.rejects(rec.compare({ filePath: cat }), /không có phiếu cân/);
  store.close();
});
