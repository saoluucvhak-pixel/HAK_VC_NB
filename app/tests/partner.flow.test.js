'use strict';
/**
 * Luồng làm việc với ĐỐI TÁC (agent F): gói Phiếu cân kèm dầu (xuất → nhập → nhập lại → nghi trùng), đọc dầu thống nhất giữa
 * đường trực tiếp và đường "đợt", Excel dầu ở màn đối chiếu, chống nạp đợt trùng, lịch sử xuất, file mẫu đọc lại đúng số dòng.
 * Mọi số liệu tiền / kỳ đã chốt KHÔNG đổi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');
const { SubcontractService } = require('../main/services/SubcontractService');
const { ReconcileService } = require('../main/services/ReconcileService');
const { ImportService } = require('../main/import/ImportService');
const { ImportTemplates, TEMPLATE_FIRST_ROW } = require('../main/import/templates');
const { fuelContentKey } = require('../main/import/fuelKey');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-partner-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23' };
const U = { username: 'ketoan' };
const fuelOf = (store, contractId) => store.find('GIAO_NHAN_DAU', (r) => r.contract_id === contractId && !r.is_deleted);
const D = (s) => new Date(`${s}T00:00:00Z`);

{
  const KIND = {}; // loại kho do biến môi trường DGVC_STORAGE quyết định
  const suffix = '';

  async function scene({ asJson = false } = {}) {
    const a = await install('DH', { ...KIND, installId: 'INS-AAAA2222' });
    const q = await install('HAKQN', { ...KIND, withData: false });
    const file = path.join(OUT, `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${asJson ? 'json' : 'dgvc'}`);
    const out = await new ExchangeService(a.store).exportPackage({ packageType: 'PHIEU_CAN', ...W, targetPath: file, user: U });
    return { a, q, file, out, ex: new ExchangeService(q.store), srcFuel: fuelOf(a.store, a.contractId) };
  }

  test(`P0.1 gói Phiếu cân kèm dầu của khoảng ngày (lọc theo receive_date)${suffix}`, async () => {
    const s = await scene();
    const inWin = s.srcFuel.filter((f) => f.receive_date >= W.dateFrom && f.receive_date <= W.dateTo);
    assert.ok(inWin.length > 0, 'dữ liệu mẫu có dầu trong khoảng');
    assert.equal(s.out.counts.GIAO_NHAN_DAU, inWin.length, 'gói kèm đủ dòng dầu trong khoảng ngày');
    assert.ok(s.out.counts.PHIEU_CAN > 0);
  });

  test(`P0.1 nhập gói Phiếu cân có dầu vào máy rỗng; nhập lại lần 2 ra SAME, không nhân đôi${suffix}`, async () => {
    const s = await scene();
    const n = s.out.counts.GIAO_NHAN_DAU;
    const pv = s.ex.previewPackage({ filePath: s.file, user: U });
    assert.equal(pv.summary.GIAO_NHAN_DAU.NEW, n, 'dầu trong gói PHIEU_CAN được xử lý, không bỏ qua lặng lẽ');
    assert.equal(pv.canImport, true);
    const r = await s.ex.importPackage({ previewId: pv.previewId, user: U });
    assert.equal(r.counts.GIAO_NHAN_DAU.NEW, n);
    const mine = fuelOf(s.q.store, s.a.contractId);
    assert.equal(mine.length, n);
    const key = (rows) => rows.map(fuelContentKey).sort();
    assert.deepEqual(key(mine), key(s.srcFuel.filter((f) => f.receive_date >= W.dateFrom && f.receive_date <= W.dateTo)));
    const sum = (rows) => rows.reduce((t, x) => t + x.qty_liter, 0);
    // lần 2
    const pv2 = s.ex.previewPackage({ filePath: s.file, user: U });
    assert.equal(pv2.summary.GIAO_NHAN_DAU.SAME, n); assert.equal(pv2.summary.GIAO_NHAN_DAU.NEW, 0);
    assert.equal(pv2.summary.PHIEU_CAN.NEW, 0);
    assert.equal(pv2.conflicts.length, 0);
    await s.ex.importPackage({ previewId: pv2.previewId, user: U });
    assert.equal(fuelOf(s.q.store, s.a.contractId).length, n, 'nhập lại không sinh thêm dòng dầu');
    assert.equal(sum(fuelOf(s.q.store, s.a.contractId)), sum(mine));
  });

  test(`P0.1 máy nhận đã nhập TAY dầu cùng nội dung → nghi trùng, mặc định bỏ qua; nhập lại vẫn 1 dòng${suffix}`, async () => {
    const s = await scene(); const x = s.srcFuel.find((f) => f.receive_date >= W.dateFrom && f.receive_date <= W.dateTo);
    await s.q.store.transaction((tx) => { tx.insert('GIAO_NHAN_DAU', { ...x, receipt_id: 'GD-TAY-1', import_batch_id: '' }); }, { user: 'test' });
    const pv = s.ex.previewPackage({ filePath: s.file, user: U });
    const dups = pv.conflicts.filter((c) => c.table === 'GIAO_NHAN_DAU' && c.kind === 'POSSIBLE_DUPLICATE');
    assert.equal(dups.length, 1); assert.equal(dups[0].default, 'SKIP'); assert.match(dups[0].note, /đã có ở máy này \(mã GD-TAY-1\)/);
    await s.ex.importPackage({ previewId: pv.previewId, user: U });
    const mine = fuelOf(s.q.store, s.a.contractId);
    assert.equal(mine.filter((r) => fuelContentKey(r) === fuelContentKey(x)).length, 1, 'chỉ 1 dòng X');
    assert.ok(s.q.store.all('AUDIT_LOG').some((a) => a.action === 'FUEL_DUP_REMAP'));
    const pv2 = s.ex.previewPackage({ filePath: s.file, user: U });
    assert.equal(pv2.conflicts.filter((c) => c.kind === 'POSSIBLE_DUPLICATE').length, 0, 'nhập lại: dùng ánh xạ đã ghi nhớ');
    await s.ex.importPackage({ previewId: pv2.previewId, user: U });
    assert.equal(fuelOf(s.q.store, s.a.contractId).filter((r) => fuelContentKey(r) === fuelContentKey(x)).length, 1);
  });

  test(`P0.1 trùng receipt_id nhưng khác nội dung: dòng của máy nhận KHÔNG bị ghi đè (đổi mã dòng đến)${suffix}`, async () => {
    const s = await scene(); const x = s.srcFuel.find((f) => f.receive_date >= W.dateFrom && f.receive_date <= W.dateTo);
    const mineRow = { ...x, qty_liter: x.qty_liter + 123.5, import_batch_id: '' };
    await s.q.store.transaction((tx) => { tx.insert('GIAO_NHAN_DAU', mineRow); }, { user: 'test' });
    const pv = s.ex.previewPackage({ filePath: s.file, user: U });
    await s.ex.importPackage({ previewId: pv.previewId, user: U });
    assert.equal(s.q.store.get('GIAO_NHAN_DAU', x.receipt_id).qty_liter, mineRow.qty_liter, 'dòng của máy này giữ nguyên số lít');
    const mine = fuelOf(s.q.store, s.a.contractId);
    assert.equal(mine.length, s.srcFuel.filter((f) => f.receive_date >= W.dateFrom && f.receive_date <= W.dateTo).length + 1, 'dòng đến được ghi thành dòng riêng');
    assert.ok(mine.some((r) => /@/.test(r.receipt_id) && r.qty_liter === x.qty_liter));
  });

  test(`P1.5 "Nhập gói" nhận cả file .json: xem trước + nhập như .dgvc (kèm dầu)${suffix}`, async () => {
    const s = await scene({ asJson: true });
    assert.ok(s.file.endsWith('.json') && fs.readFileSync(s.file, 'utf8').trim().startsWith('{'), 'file .json xuất ra là JSON thuần');
    const pv = s.ex.previewPackage({ filePath: s.file, user: U });
    assert.equal(pv.summary.GIAO_NHAN_DAU.NEW, s.out.counts.GIAO_NHAN_DAU);
    await s.ex.importPackage({ previewId: pv.previewId, user: U });
    assert.equal(fuelOf(s.q.store, s.a.contractId).length, s.out.counts.GIAO_NHAN_DAU);
  });

  test(`P0.1 gói chỉ chọn "chỉ phiếu cân" (ticketsOnly) vẫn không đụng dầu${suffix}`, async () => {
    const s = await scene();
    const pv = s.ex.previewPackage({ filePath: s.file, ticketsOnly: true, user: U });
    assert.ok(!pv.summary.GIAO_NHAN_DAU);
    await s.ex.importPackage({ previewId: pv.previewId, user: U });
    assert.equal(fuelOf(s.q.store, s.a.contractId).length, 0);
  });

  test(`P0.2 cùng file .json: đường trực tiếp và đường "đợt đã nạp" ra cùng kết quả (dầu 3/3)${suffix}`, async () => {
    const s = await scene({ asJson: true });
    const imp = new ImportService(s.a.store); const ex = new ExchangeService(s.a.store);
    const sub = new SubcontractService(s.a.store, { exchange: ex, importService: imp });
    const rec = new ReconcileService(s.a.store, { importService: imp, exchange: ex, subcontract: sub });
    const n = s.out.counts.GIAO_NHAN_DAU;
    const direct = await rec.compare({ filePath: s.file, contractId: s.a.contractId });
    const batch = await sub.importBatch({ filePath: s.file, partnerName: 'ĐT', user: U });
    const viaBatch = await rec.compare({ batchId: batch.batchId, contractId: s.a.contractId });
    assert.equal(direct.fuelCompare.totals.theirRows, n, 'đường trực tiếp đọc đủ dầu');
    assert.equal(viaBatch.fuelCompare.totals.theirRows, n);
    assert.deepEqual(direct.fuelCompare.summary, viaBatch.fuelCompare.summary);
    assert.equal(direct.fuelCompare.totals.theirLiter, viaBatch.fuelCompare.totals.theirLiter);
    assert.deepEqual(direct.summary, viaBatch.summary);
  });

  test(`P0.3 nạp đợt: cùng file 2 lần → chặn khi chưa xác nhận; bấm 2 lần (cùng clientRequestId) → 1 đợt${suffix}`, async () => {
    const s = await scene({ asJson: true });
    const sub = new SubcontractService(s.a.store, { exchange: new ExchangeService(s.a.store), importService: new ImportService(s.a.store) });
    const id = rid('sc');
    const [r1, r2] = await Promise.all([sub.importBatch({ filePath: s.file, partnerName: 'ĐT', clientRequestId: id, user: U }), sub.importBatch({ filePath: s.file, partnerName: 'ĐT', clientRequestId: id, user: U })]);
    assert.equal(r1.batchId, r2.batchId); assert.equal(sub.list().length, 1);
    assert.equal((await sub.importBatch({ filePath: s.file, partnerName: 'ĐT', clientRequestId: id, user: U })).batchId, r1.batchId, 'gửi lại sau khi xong vẫn cùng kết quả');
    await assert.rejects(sub.importBatch({ filePath: s.file, partnerName: 'ĐT', clientRequestId: rid('sc'), user: U }), (e) => e.details && e.details.code === 'E_BATCH_DUPLICATE' && e.details.duplicates[0].batchId === r1.batchId && /đã nạp/.test(e.message));
    assert.equal(sub.list().length, 1, 'bị chặn → không ghi đợt thứ 2');
    const prev = await sub.previewBatch({ filePath: s.file });
    assert.equal(prev.duplicates.length, 1, 'xem trước cũng báo trùng');
    const again = await sub.importBatch({ filePath: s.file, partnerName: 'ĐT', confirmDuplicate: true, clientRequestId: rid('sc'), user: U });
    assert.notEqual(again.batchId, r1.batchId); assert.equal(sub.list().length, 2, 'đã xác nhận → cho nạp');
    assert.ok(!fs.readdirSync(path.join(s.a.store.root, 'subcontract', 'files')).some((x) => /tmp/.test(x)), 'không còn file tạm');
  });

  test(`P0.3 trùng toàn bộ khóa phiếu với đợt đã có (khác định dạng file) → báo trùng; xóa đợt ghi audit${suffix}`, async () => {
    const s = await scene({ asJson: true });
    const sub = new SubcontractService(s.a.store, { exchange: new ExchangeService(s.a.store), importService: new ImportService(s.a.store) });
    const first = await sub.importBatch({ filePath: s.file, user: U });
    const dgvc = path.join(OUT, `same-${Date.now()}.dgvc`);
    await new ExchangeService(s.a.store).exportPackage({ packageType: 'PHIEU_CAN', ...W, targetPath: dgvc, user: U });
    const prev = await sub.previewBatch({ filePath: dgvc });
    assert.equal(prev.duplicates.length, 1); assert.equal(prev.duplicates[0].reason, 'SAME_TICKETS'); assert.equal(prev.duplicates[0].batchId, first.batchId);
    await sub.deleteBatch({ batchId: first.batchId, user: U });
    assert.equal(sub.list().length, 0);
    assert.ok(s.a.store.all('AUDIT_LOG').some((x) => x.action === 'DELETE_SUBCONTRACT_BATCH' && x.entity_id === first.batchId), 'ghi audit xóa đợt');
  });

  test(`P1.6 compare không gửi deductFuel → dùng deductFuel đã lưu của đợt${suffix}`, async () => {
    const s = await scene({ asJson: true });
    const imp = new ImportService(s.a.store); const ex = new ExchangeService(s.a.store);
    const sub = new SubcontractService(s.a.store, { exchange: ex, importService: imp });
    const rec = new ReconcileService(s.a.store, { importService: imp, exchange: ex, subcontract: sub });
    const b = await sub.importBatch({ filePath: s.file, rentUnitPrice: 100000, fuelUnitPrice: 20000, deductFuel: false, user: U });
    const d = await rec.compare({ batchId: b.batchId });
    assert.equal(d.totals.deductFuel, false);
    const d2 = await rec.compare({ batchId: b.batchId, deductFuel: true });
    assert.equal(d2.totals.deductFuel, true, 'API gửi rõ thì theo API');
  });

  // ───────── Excel dầu / mẫu ─────────
  const fillSheet = async (f, sheet, rows) => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); const ws = wb.getWorksheet(sheet);
    rows.forEach((v, i) => v.forEach((x, j) => { if (x !== null && x !== undefined) ws.getCell(TEMPLATE_FIRST_ROW + i, j + 1).value = x; }));
    await wb.xlsx.writeFile(f);
  };

  test(`P1.4 mẫu dầu cho đối tác (không cần hợp đồng) đọc lại đúng số dòng; Excel dầu qua đối chiếu đọc đủ${suffix}`, async () => {
    const a = await install('DH', KIND); const imp = new ImportService(a.store); const tpl = new ImportTemplates(a.store);
    const ex = new ExchangeService(a.store);
    const rec = new ReconcileService(a.store, { importService: imp, exchange: ex, subcontract: new SubcontractService(a.store, { exchange: ex, importService: imp }) });
    await assert.rejects(tpl.build({ importType: 'GIAO_NHAN_DAU', targetPath: path.join(OUT, 'x.xlsx') }), /Chọn hợp đồng/, 'không có partner → vẫn đòi hợp đồng như cũ');
    const f = path.join(OUT, `mau-dau-${Date.now()}.xlsx`);
    await tpl.build({ importType: 'GIAO_NHAN_DAU', partner: true, targetPath: f });
    const mineFuel = fuelOf(a.store, a.contractId).filter((r) => r.receive_date >= W.dateFrom && r.receive_date <= W.dateTo);
    const take = mineFuel.slice(0, 3);
    await fillSheet(f, 'NL_GIAONHANDAU', take.map((r) => [D(r.receive_date), r.route_code, r.plate_no, 'Lít', r.qty_liter, r.fuel_price_excl_vat, null, r.giver_unit_code]));
    const read = await imp.readPartnerExcel({ filePath: f });
    assert.equal(read.fuel.rows.length, 3); assert.equal(read.tickets, null);
    assert.deepEqual(read.fuel.rows.map((x) => [x.record.receive_date, x.record.plate_no, x.record.qty_liter]), take.map((r) => [r.receive_date, r.plate_no, r.qty_liter]));
    const cmp = await rec.compare({ filePath: f, contractId: a.contractId, ...W });
    assert.equal(cmp.fuelCompare.totals.theirRows, 3, 'Excel dầu hiện đủ 3 dòng ở màn đối chiếu');
    assert.equal(cmp.fuelCompare.summary.KHOP, 3);
    assert.equal(cmp.source.rows, 0);
  });

  test(`P1.4 mẫu phiếu cân tải về đọc lại đúng số dòng; file có CẢ 2 sheet (phiếu cân + dầu) đọc được cả hai${suffix}`, async () => {
    const a = await install('DH', KIND); const imp = new ImportService(a.store); const tpl = new ImportTemplates(a.store);
    const f = path.join(OUT, `mau-pc-${Date.now()}.xlsx`);
    await tpl.build({ importType: 'PHIEU_CAN', targetPath: f });
    const t = a.store.find('PHIEU_CAN', (x) => !x.is_deleted && x.weigh1_date >= W.dateFrom && x.weigh1_date <= W.dateTo).slice(0, 4);
    await fillSheet(f, 'NL_VC', t.map((x, i) => [i + 1, x.ticket_no, D(x.weigh1_date), null, D(x.weigh2_date || x.weigh1_date), null, x.plate_no, x.weight1_kg, x.weight2_kg, x.net_kg, '', '', '', '', x.route_code, x.owner_unit_code]));
    const only = await imp.readPartnerExcel({ filePath: f });
    assert.equal(only.tickets.rows.length, 4); assert.equal(only.fuel, null);
    // ghép sheet dầu vào cùng workbook
    const fd = path.join(OUT, `mau-dau2-${Date.now()}.xlsx`); await tpl.build({ importType: 'GIAO_NHAN_DAU', partner: true, targetPath: fd });
    const fuel = fuelOf(a.store, a.contractId).slice(0, 2);
    await fillSheet(fd, 'NL_GIAONHANDAU', fuel.map((r) => [D(r.receive_date), r.route_code, r.plate_no, 'Lít', r.qty_liter, r.fuel_price_excl_vat, null, r.giver_unit_code]));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); const w2 = new ExcelJS.Workbook(); await w2.xlsx.readFile(fd);
    const src = w2.getWorksheet('NL_GIAONHANDAU'); const dst = wb.addWorksheet('NL_GIAONHANDAU');
    src.eachRow((row, rn) => { row.eachCell((c, cn) => { dst.getCell(rn, cn).value = c.value && c.value.richText ? c.value.richText.map((x) => x.text).join('') : c.value; }); });
    const both = path.join(OUT, `ca-hai-${Date.now()}.xlsx`); await wb.xlsx.writeFile(both);
    const r = await imp.readPartnerExcel({ filePath: both });
    assert.equal(r.tickets.rows.length, 4); assert.equal(r.fuel.rows.length, 2);
  });

  test(`P1.4 Excel dầu thiếu cột → báo lỗi rõ tên cột; file lạ → báo không nhận ra${suffix}`, async () => {
    const a = await install('DH', { ...KIND, withData: false }); const imp = new ImportService(a.store);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_GIAONHANDAU');
    ws.addRow(['Ngày nhận dầu', 'Biển số xe', 'Ghi chú']); ws.addRow([D('2026-09-18'), '92H-00057', 'x']);
    const f = path.join(OUT, `thieu-cot-${Date.now()}.xlsx`); await wb.xlsx.writeFile(f);
    await assert.rejects(imp.readPartnerExcel({ filePath: f }), (e) => /thiếu cột/i.test(e.message) && /Số lượng/.test(e.message));
    const wb2 = new ExcelJS.Workbook(); wb2.addWorksheet('Sheet1').addRow(['a', 'b']);
    const g = path.join(OUT, `la-${Date.now()}.xlsx`); await wb2.xlsx.writeFile(g);
    await assert.rejects(imp.readPartnerExcel({ filePath: g }));
  });

  test(`P1.5 exchange.list trả items có cả chiều XUẤT (Lịch sử xuất có dữ liệu)${suffix}`, async () => {
    const s = await scene();
    const l = new ExchangeService(s.a.store).list();
    assert.ok(Array.isArray(l.items) && l.items.some((x) => x.direction === 'EXPORT' && x.package_type === 'PHIEU_CAN'));
    assert.equal(l.exports, undefined, 'khóa đúng là items, không phải exports');
  });
}
void KETOAN;
