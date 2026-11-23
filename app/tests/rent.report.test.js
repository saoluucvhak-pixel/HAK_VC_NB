'use strict';
/**
 * Báo cáo thuê vận chuyển (phương án b — chỉ tổng hợp số liệu nhận về): số liệu KHỚP TỪNG ĐỒNG với phần "bên kia" của Đối chiếu 3 tiêu chí,
 * lọc, chi tiết theo xe cộng ra báo cáo, sửa đơn giá thuê / giá dầu (lý do bắt buộc, nhật ký, số hợp lệ, quyền), xuất Excel.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, storageKinds, KETOAN, rid } = require('./install');
const { SubcontractService } = require('../main/services/SubcontractService');
const { ReconcileService } = require('../main/services/ReconcileService');
const { ExchangeService } = require('../main/services/ExchangeService');
const { Router } = require('../main/api/router');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-rent-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const tk = (no, date, plate, kg) => ({ ticket_no: no, weigh1_date: date, weigh1_time: '08:00:00', plate_no: plate, net_kg: kg, route_code: 'VC.007' });
const fu = (no, date, plate, l) => ({ receipt_no: no, receipt_date: date, plate_no: plate, qty_liter: l });
const write = (name, o) => { const f = path.join(OUT, `${name}-${Math.random().toString(36).slice(2, 7)}.json`); fs.writeFileSync(f, JSON.stringify(o), 'utf8'); return f; };

// Số lẻ cố ý: làm tròn THEO TỪNG XE khác với làm tròn trên tổng → bắt được công thức lệch
const DATA = {
  A1: { partnerName: 'CÔNG TY VẬN TẢI TUẤN HƯNG', batchName: 'Đợt 1 - 09/2026',
    tickets: [tk('A-1', '2026-09-18', '92H-00141', 12345), tk('A-2', '2026-09-19', '92H-00141', 23457), tk('A-3', '2026-09-19', '92H-00192', 31111), tk('A-4', '2026-09-20', '43C-999.99', 9999),
      tk('A-1', '2026-09-18', '92H-00141', 12345) /* trùng khóa: chỉ tính một lần */],
    fuel: [fu('D1', '2026-09-18', '92H-00141', 101.5), fu('D2', '2026-09-19', '92H-00192', 77.25), fu('D3', '2026-09-20', '43C-999.99', 33.3), fu('D4', '2026-09-21', '51D-000.01', 50) /* xe không có chuyến */] },
  B1: { partnerName: 'CÔNG TY VẬN TẢI ĐẠI PHÁT', batchName: 'Đợt tháng 10',
    tickets: [tk('B-1', '2026-10-02', '60C-123.45', 28765), tk('B-2', '2026-10-03', '60C-123.45', 27654), tk('B-3', '2026-10-05', '60C-777.77', 15001)],
    fuel: [fu('E1', '2026-10-02', '60C-123.45', 120.4), fu('E2', '2026-10-05', '60C-777.77', 61.9)] },
  // gắn kỳ 18–23/09: phiếu / dầu ngoài khoảng kỳ KHÔNG tính (giống Đối chiếu)
  C1: { partnerName: 'CÔNG TY VẬN TẢI TUẤN HƯNG', batchName: 'Đợt 2 - gắn kỳ',
    tickets: [tk('C-1', '2026-09-18', '92H-00141', 20001), tk('C-2', '2026-09-22', '92H-00192', 18999), tk('C-3', '2026-09-28', '92H-00192', 40000)],
    fuel: [fu('F1', '2026-09-22', '92H-00192', 55.5), fu('F2', '2026-09-30', '92H-00192', 99)] },
};

async function scene(kind) {
  const ctx = await install('DH', { kind });
  const { store, periods, contractId } = ctx;
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: dup[1] ? [dup[1].receipt_id] : [], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const ex = new ExchangeService(store); const sub = new SubcontractService(store, { exchange: ex });
  const rec = new ReconcileService(store, { exchange: ex, subcontract: sub });
  const a = await sub.importBatch({ filePath: write('a', DATA.A1), partnerName: DATA.A1.partnerName, batchName: DATA.A1.batchName, rentUnitPrice: 155000, fuelUnitPrice: 19500, deductFuel: true, user: KETOAN });
  const b = await sub.importBatch({ filePath: write('b', DATA.B1), partnerName: DATA.B1.partnerName, batchName: DATA.B1.batchName, rentUnitPrice: 148500, fuelUnitPrice: 20100, deductFuel: false, user: KETOAN });
  const c = await sub.importBatch({ filePath: write('c', DATA.C1), periodId: k.period.period_id, partnerName: DATA.C1.partnerName, batchName: DATA.C1.batchName, rentUnitPrice: 152750, fuelUnitPrice: 19800, deductFuel: true, user: KETOAN });
  return { ...ctx, sub, rec, a, b, c, period: k.period };
}

for (const kind of storageKinds()) {
  const tag = `[${kind}]`;

  test(`${tag} report khớp từng đồng với Đối chiếu 3 tiêu chí (their*) trên từng đợt`, async () => {
    const s = await scene(kind);
    const rep = s.sub.report({});
    assert.equal(rep.rows.length, 3);
    for (const batch of [s.a, s.b, s.c]) {
      const r = rep.rows.find((x) => x.batchId === batch.batchId); const cmp = await s.rec.compare({ batchId: batch.batchId });
      const t = cmp.totals;
      assert.equal(r.ticketCount, t.theirTrips, `${batch.batchName}: số chuyến`);
      assert.equal(r.totalKg, t.theirKg, `${batch.batchName}: kg`);
      assert.equal(r.totalTon, t.theirTon, `${batch.batchName}: tấn`);
      assert.equal(r.rentAmount, t.theirRentAmount, `${batch.batchName}: tiền thuê`);
      assert.equal(r.fuelAmount, t.theirFuelAmount, `${batch.batchName}: tiền dầu`);
      assert.equal(r.deductFuelAmount, t.deductFuel ? t.theirFuelAmount : 0, `${batch.batchName}: dầu trừ`);
      assert.equal(r.payable, t.theirPayable, `${batch.batchName}: thực trả`);
      assert.equal(r.plateCount, cmp.byPlate.length);
      assert.equal(r.fuelLiter, Math.round(cmp.byPlate.reduce((x, p) => x + p.theirFuelLiter, 0) * 100) / 100, `${batch.batchName}: dầu (lít) của xe có chuyến`);
      assert.equal(Math.round((r.fuelLiter + r.fuelLiterUnmatched) * 100) / 100, Math.round(cmp.fuelCompare.totals.theirLiter * 100) / 100, 'dầu có chuyến + dầu xe không chuyến = tổng dầu bên kia');
      assert.equal(r.rentUnitPrice, t.rentUnitPrice); assert.equal(r.fuelUnitPrice, t.fuelUnitPrice); assert.equal(r.deductFuel, t.deductFuel);
    }
  });

  test(`${tag} report: số tiền đúng theo công thức viết tay (làm tròn từng xe) và dòng tổng / tổng theo đơn vị`, async () => {
    const s = await scene(kind);
    const rep = s.sub.report({});
    // Đợt A1: 92H-00141 = 12345+23457 (A-1 trùng chỉ tính 1 lần) ; 92H-00192 = 31111 ; 43C-999.99 = 9999 ; dầu 51D-000.01 không có chuyến → vẫn cấn trừ dầu
    const a = rep.rows.find((x) => x.batchId === s.a.batchId);
    const rent = Math.round(35.802 * 155000) + Math.round(31.111 * 155000) + Math.round(9.999 * 155000);
    const fuel = Math.round(101.5 * 19500) + Math.round(77.25 * 19500) + Math.round(33.3 * 19500) + Math.round(50 * 19500); // + xe 51D-000.01 chỉ có dầu: vẫn cấn trừ
    assert.equal(a.ticketCount, 4); assert.equal(a.plateCount, 4); assert.equal(a.totalKg, 76912); assert.equal(a.totalTon, 76.91);
    assert.equal(a.rentAmount, rent); assert.equal(a.fuelAmount, fuel); assert.equal(a.deductFuelAmount, fuel); assert.equal(a.payable, rent - fuel);
    assert.equal(a.fuelLiter, 262.05); assert.equal(a.fuelLiterUnmatched, 0);
    // Đợt B1: không trừ dầu
    const b = rep.rows.find((x) => x.batchId === s.b.batchId);
    const rentB = Math.round(56.419 * 148500) + Math.round(15.001 * 148500);
    assert.equal(b.rentAmount, rentB); assert.equal(b.deductFuelAmount, 0); assert.equal(b.payable, rentB); assert.ok(b.fuelAmount > 0);
    // Đợt C1 (gắn kỳ 18–23/09): chỉ C-1, C-2 và dầu F1
    const c = rep.rows.find((x) => x.batchId === s.c.batchId);
    assert.equal(c.ticketCount, 2); assert.equal(c.totalKg, 39000); assert.equal(c.fuelLiter, 55.5); assert.equal(c.periodCode, s.period.period_code);
    assert.equal(c.rentAmount, Math.round(20.001 * 152750) + Math.round(18.999 * 152750));
    // tổng
    const sum = (k) => rep.rows.reduce((x, r) => x + r[k], 0);
    for (const k of ['ticketCount', 'rentAmount', 'fuelAmount', 'deductFuelAmount', 'payable', 'totalKg']) assert.equal(rep.totals[k], sum(k), k);
    assert.equal(rep.totals.batchCount, 3);
    // theo đơn vị: Tuấn Hưng có 2 đợt (A1 + C1)
    assert.equal(rep.byPartner.length, 2);
    const th = rep.byPartner.find((x) => x.partnerName === DATA.A1.partnerName);
    assert.equal(th.batchCount, 2); assert.equal(th.rentAmount, a.rentAmount + c.rentAmount); assert.equal(th.payable, a.payable + c.payable);
    assert.deepEqual(rep.partners, [DATA.B1.partnerName, DATA.A1.partnerName].sort((x, y) => x.localeCompare(y, 'vi')));
  });

  test(`${tag} report: lọc theo đơn vị, tháng, khoảng ngày, tìm không dấu, kỳ`, async () => {
    const s = await scene(kind);
    const ids = (f) => s.sub.report(f).rows.map((r) => r.batchId).sort();
    assert.deepEqual(ids({ partnerName: DATA.B1.partnerName }), [s.b.batchId]);
    assert.deepEqual(ids({ partnerName: DATA.A1.partnerName }), [s.a.batchId, s.c.batchId].sort());
    assert.deepEqual(ids({ month: '2026-10' }), [s.b.batchId]);
    assert.deepEqual(ids({ month: '2026-09' }), [s.a.batchId, s.c.batchId].sort());
    assert.deepEqual(ids({ month: '2026-08' }), []);
    assert.deepEqual(ids({ dateFrom: '2026-09-25' }), [s.b.batchId, s.c.batchId].sort(), 'giao với khoảng ngày dữ liệu của đợt');
    assert.deepEqual(ids({ dateFrom: '2026-09-01', dateTo: '2026-09-17' }), []);
    assert.deepEqual(ids({ dateTo: '2026-09-18' }), [s.a.batchId, s.c.batchId].sort());
    assert.deepEqual(ids({ q: 'dai phat' }), [s.b.batchId], 'tìm không dấu');
    assert.deepEqual(ids({ q: 'TUẤN HƯNG gắn' }), [], 'cụm không có trong tên');
    assert.deepEqual(ids({ q: 'gan ky' }), [s.c.batchId]);
    assert.deepEqual(ids({ periodId: s.period.period_id }), [s.c.batchId]);
    assert.deepEqual(ids({ contractId: s.contractId }), [s.c.batchId]);
    assert.deepEqual(ids({ partnerName: DATA.B1.partnerName, month: '2026-09' }), []);
    const empty = s.sub.report({ month: '2026-08' }); assert.equal(empty.rows.length, 0); assert.equal(empty.totals.rentAmount, 0); assert.equal(empty.totalBatches, 3);
    assert.throws(() => s.sub.report({ month: '2026-13' }), { code: 'VALIDATION_FAILED' });
    assert.throws(() => s.sub.report({ dateFrom: '2026-10-01', dateTo: '2026-09-01' }), { code: 'VALIDATION_FAILED' });
    assert.throws(() => s.sub.report({ dateFrom: '01/10/2026' }), { code: 'VALIDATION_FAILED' });
  });

  test(`${tag} reportDetail: cộng theo xe ra đúng dòng của report; theo ngày; dầu xe không chuyến`, async () => {
    const s = await scene(kind);
    const rep = s.sub.report({});
    for (const batch of [s.a, s.b, s.c]) {
      const d = s.sub.reportDetail({ batchId: batch.batchId }); const r = rep.rows.find((x) => x.batchId === batch.batchId);
      assert.deepEqual(d.batch, r);
      const sum = (k) => d.byPlate.reduce((x, p) => x + p[k], 0);
      assert.equal(sum('ticketCount'), r.ticketCount); assert.equal(sum('kg'), r.totalKg); assert.equal(sum('rentAmount'), r.rentAmount); assert.equal(sum('fuelAmount'), r.fuelAmount);
      assert.equal(sum('deductFuelAmount'), r.deductFuelAmount); assert.equal(sum('payable'), r.payable); assert.equal(d.byPlate.length, r.plateCount);
      assert.equal(Math.round(sum('fuelLiter') * 100) / 100, r.fuelLiter);
      assert.equal(d.byDate.reduce((x, p) => x + p.ticketCount, 0), r.ticketCount);
      assert.equal(d.byDate.reduce((x, p) => x + p.kg, 0), r.totalKg);
      assert.equal(d.totals.payable, r.payable);
      for (const p of d.byPlate) assert.equal(p.payable, p.rentAmount - p.deductFuelAmount);
    }
    const da = s.sub.reportDetail({ batchId: s.a.batchId });
    assert.deepEqual(da.fuelOnly, [{ plateNo: '51D-000.01', fuelCount: 1, fuelLiter: 50 }]);
    assert.deepEqual(da.byPlate.map((p) => p.plateNo), ['43C-999.99', '51D-000.01', '92H-00141', '92H-00192']);
    assert.throws(() => s.sub.reportDetail({ batchId: 'KHONG-CO' }), { code: 'NOT_FOUND' });
    assert.throws(() => s.sub.reportDetail({}), { code: 'VALIDATION_FAILED' });
  });

  test(`${tag} updateTerms: đổi đơn giá → báo cáo VÀ Đối chiếu cùng đổi đúng; lý do bắt buộc; nhật ký; số sai bị từ chối; rowVersion`, async () => {
    const s = await scene(kind);
    const before = s.sub.report({}).rows.find((x) => x.batchId === s.a.batchId);
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: 160000, reason: '  ', user: KETOAN }), { code: 'VALIDATION_FAILED' });
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: 160000, user: KETOAN }), { code: 'VALIDATION_FAILED' });
    for (const bad of [-1, 1000000001, 'abc', '12x']) {
      await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: bad, reason: 'thử', user: KETOAN }), { code: 'VALIDATION_FAILED' }, `đơn giá thuê ${bad}`);
    }
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, fuelUnitPrice: -5, reason: 'thử', user: KETOAN }), { code: 'VALIDATION_FAILED' });
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, reason: 'không đổi gì', user: KETOAN }), { code: 'VALIDATION_FAILED' });
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: 155000, reason: 'trùng giá cũ', user: KETOAN }), { code: 'VALIDATION_FAILED' });
    await assert.rejects(s.sub.updateTerms({ batchId: 'KHONG-CO', rentUnitPrice: 1, reason: 'x', user: KETOAN }), { code: 'NOT_FOUND' });
    assert.deepEqual(s.sub.report({}).rows.find((x) => x.batchId === s.a.batchId), before, 'lần sửa bị từ chối không đổi gì');
    assert.equal(s.store.all('AUDIT_LOG').filter((x) => x.action === 'UPDATE_SUBCONTRACT_TERMS').length, 0);

    const r = await s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: '160.000', fuelUnitPrice: 21000, deductFuel: false, reason: 'Đơn vị báo giá mới', rowVersion: before.rowVersion, user: KETOAN });
    assert.equal(r.rentUnitPrice, 160000); assert.equal(r.fuelUnitPrice, 21000); assert.equal(r.deductFuel, false);
    assert.equal(r.rentAmount, Math.round(35.802 * 160000) + Math.round(31.111 * 160000) + Math.round(9.999 * 160000));
    assert.equal(r.deductFuelAmount, 0); assert.equal(r.payable, r.rentAmount); assert.equal(r.rowVersion, before.rowVersion + 1);
    // dữ liệu phiếu / dầu không đổi
    assert.equal(r.ticketCount, before.ticketCount); assert.equal(r.totalKg, before.totalKg); assert.equal(r.fuelLiter, before.fuelLiter);
    // báo cáo và Đối chiếu vẫn khớp nhau sau khi sửa
    const cmp = await s.rec.compare({ batchId: s.a.batchId });
    assert.equal(cmp.totals.rentUnitPrice, 160000); assert.equal(cmp.totals.theirRentAmount, r.rentAmount); assert.equal(cmp.totals.theirPayable, r.payable);
    assert.deepEqual(s.sub.report({}).rows.find((x) => x.batchId === s.a.batchId), r);
    // nhật ký có lý do + trước/sau
    const log = s.store.all('AUDIT_LOG').filter((x) => x.action === 'UPDATE_SUBCONTRACT_TERMS');
    assert.equal(log.length, 1); assert.equal(log[0].entity_id || log[0].record_id || s.a.batchId, s.a.batchId);
    assert.match(JSON.stringify(log[0]), /Đơn vị báo giá mới/); assert.match(JSON.stringify(log[0]), /160000/); assert.match(JSON.stringify(log[0]), /155000/);
    // rowVersion cũ → xung đột
    await assert.rejects(s.sub.updateTerms({ batchId: s.a.batchId, rentUnitPrice: 170000, reason: 'bản cũ', rowVersion: before.rowVersion, user: KETOAN }), { code: 'CONFLICT_VERSION' });
    // chỉ đổi trừ dầu; đợt khác không bị ảnh hưởng
    const r2 = await s.sub.updateTerms({ batchId: s.a.batchId, deductFuel: true, reason: 'trừ dầu lại', user: KETOAN });
    assert.equal(r2.deductFuelAmount, r2.fuelAmount); assert.equal(r2.rentUnitPrice, 160000);
    assert.equal(s.sub.report({}).rows.find((x) => x.batchId === s.b.batchId).rentUnitPrice, 148500);
    // đơn giá 0 hợp lệ
    const r3 = await s.sub.updateTerms({ batchId: s.b.batchId, rentUnitPrice: 0, reason: 'miễn phí thử', user: KETOAN }); assert.equal(r3.rentAmount, 0);
  });

  test(`${tag} quyền: đọc mọi vai trò; sửa đơn giá chỉ ADMIN / KẾ TOÁN; xuất Excel đọc lại đúng dòng và tổng`, async () => {
    const roles = (a) => new Router({}).rolesOf(a);
    for (const a of ['subcontract.report', 'subcontract.reportDetail', 'subcontract.reportExport']) assert.deepEqual(roles(a).sort(), ['ADMIN', 'KE_TOAN', 'XEM'], a);
    assert.deepEqual(roles('subcontract.updateTerms').sort(), ['ADMIN', 'KE_TOAN']);
    const s = await scene(kind);
    const target = path.join(OUT, `bc-${kind}.xlsx`);
    const x = await s.sub.exportReport({ params: { month: '2026-09' }, targetPath: target });
    assert.ok(fs.existsSync(target)); assert.equal(x.rows, 2);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(target);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Tong hop', 'Theo don vi', 'Chi tiet theo xe']);
    const ws = wb.getWorksheet('Tong hop'); const rep = s.sub.report({ month: '2026-09' });
    assert.equal(ws.getRow(4).getCell(2).value, 'Đơn vị vận chuyển'); assert.equal(ws.getRow(4).getCell(12).value, 'Tiền thuê'); assert.equal(ws.getRow(4).getCell(14).value, 'Thực trả');
    assert.equal(ws.getRow(5).getCell(3).value, rep.rows[0].batchName); assert.equal(ws.getRow(5).getCell(12).value, rep.rows[0].rentAmount); assert.equal(ws.getRow(6).getCell(14).value, rep.rows[1].payable);
    const tot = ws.getRow(5 + rep.rows.length);
    assert.equal(tot.getCell(2).value, 'TỔNG CỘNG'); assert.equal(tot.getCell(12).value, rep.totals.rentAmount); assert.equal(tot.getCell(14).value, rep.totals.payable); assert.equal(tot.getCell(6).value, rep.totals.ticketCount);
    assert.equal(ws.getRow(5).getCell(12).numFmt, '#,##0');
    const dt = wb.getWorksheet('Chi tiet theo xe'); const dtot = dt.getRow(dt.rowCount);
    assert.equal(dtot.getCell(2).value, 'TỔNG CỘNG'); assert.equal(dtot.getCell(10).value, rep.totals.payable);
    await assert.rejects(s.sub.exportReport({ params: {} }), { code: 'VALIDATION_FAILED' });
  });
}
