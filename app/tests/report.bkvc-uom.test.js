'use strict';
/**
 * Tiêu đề cột số lượng của BKVC ở Excel / CSV khớp bản in HTML/PDF: kỳ có dòng tính theo m³ → "Khối lượng (Tấn / m³)" (trước: luôn "(Tấn)" dù số là m³);
 * kỳ chỉ có tấn giữ NGUYÊN tiêu đề cũ "Khối lượng (Tấn)" (không đổi tiêu đề cột của báo cáo có sẵn). Số liệu / số tiền không đổi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, rid } = require('./install');
const { CatalogService } = require('../main/services/CatalogService');
const { ReportService } = require('../main/reports/ReportService');
const { bkvcFileQtyHeader } = require('../main/reports/labels');

const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-uom-'));
const LEGACY_HEADS = ['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn)', 'Đơn giá'];

async function period(m3) {
  const c = await install('DH'); const { store, periods, contractId } = c; const cat = new CatalogService(store);
  if (m3) {
    await store.transaction((tx) => { tx.update('TUYEN_VC', 'VC.007', { uom: 'M3' }); for (const v of tx.all('XE')) tx.update('XE', v.plate_no, { volume_m3: 10 }); for (const g of tx.all('GIAO_NHAN_DAU')) tx.update('GIAO_NHAN_DAU', g.receipt_id, { is_deleted: true }); }, { user: 'test' }); // giá cố định: không cần dầu
    await cat.savePriceCode({ create: true, record: { priceCode: 'CD-X', unitCode: store.get('HOP_DONG', contractId).customer_unit_code, priceName: 'x', priceMethod: 'CO_DINH' }, user: KETOAN });
    const l = await cat.addCodeLine({ priceCode: 'CD-X', record: { routeCode: 'VC.007', effectiveFrom: '2026-01-01', fixedPrice: 50000, calcBasis: '' }, user: KETOAN });
    await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
    await store.transaction((tx) => tx.update('HOP_DONG', contractId, { price_code: 'CD-X' }), { user: 'test' });
  }
  const k = await periods.calculate({ contractId, ...W, clientRequestId: rid(), user: KETOAN });
  return { store, pid: k.period.period_id, rs: new ReportService(store) };
}
const headRow = async (file) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); const r = wb.worksheets[0].getRow(6); return [1, 2, 3, 4, 5, 6].map((i) => r.getCell(i).value); };

test('Kỳ tính theo m³: Excel và CSV của BKVC ghi "Khối lượng (Tấn / m³)", khớp bản in HTML', async () => {
  const { store, pid, rs } = await period(true); const d = rs.bkvc({ periodId: pid }); assert.ok(d.lines.some((l) => l.uom === 'M3'), 'kỳ có dòng m³');
  assert.equal(bkvcFileQtyHeader(d), 'Khối lượng (Tấn / m³)');
  const x = path.join(OUT, 'm3.xlsx'); await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: x });
  assert.deepEqual(await headRow(x), ['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn / m³)', 'Đơn giá']);
  const csv = path.join(OUT, 'm3.csv'); await rs.export({ report: 'BKVC', format: 'CSV', params: { periodId: pid }, targetPath: csv }); assert.match(fs.readFileSync(csv, 'utf8').split(/\r?\n/)[0], /Khối lượng \(Tấn \/ m³\)/);
  const html = path.join(OUT, 'm3.html'); await rs.export({ report: 'BKVC', format: 'HTML', params: { periodId: pid }, targetPath: html }); assert.match(fs.readFileSync(html, 'utf8'), /Khối lượng \(Tấn \/ m³\)/, 'HTML cùng nhãn');
  store.close();
});

test('Kỳ chỉ có tấn: tiêu đề Excel / CSV GIỮ NGUYÊN "Khối lượng (Tấn)" như trước', async () => {
  const { store, pid, rs } = await period(false); const d = rs.bkvc({ periodId: pid }); assert.ok(!d.lines.some((l) => l.uom === 'M3'));
  assert.equal(bkvcFileQtyHeader(d), 'Khối lượng (Tấn)');
  const x = path.join(OUT, 'tan.xlsx'); await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: x }); assert.deepEqual(await headRow(x), LEGACY_HEADS);
  const csv = path.join(OUT, 'tan.csv'); await rs.export({ report: 'BKVC', format: 'CSV', params: { periodId: pid }, targetPath: csv }); const first = fs.readFileSync(csv, 'utf8').split(/\r?\n/)[0]; assert.match(first, /Khối lượng \(Tấn\)/); assert.doesNotMatch(first, /m³/);
  store.close();
});

test('Kỳ CŨ (bản chụp chưa có total_m3) dù có dòng giá cố định m³: tiêu đề Excel / CSV GIỮ NGUYÊN "Khối lượng (Tấn)" (cột là kg/1000 = tấn); số liệu không đổi', async () => {
  const { store, pid, rs } = await period(true);
  await store.transaction((tx) => { for (const c2 of tx.all('TRANSPORT_CALCULATION').filter((x) => x.period_id === pid)) tx.update('TRANSPORT_CALCULATION', c2.calc_id, { calc_basis: '', total_m3: '' }); }, { user: 'test' }); // giả lập kỳ tính trước 1.9.4
  const d = rs.bkvc({ periodId: pid }); assert.ok(d.lines.some((l) => l.uom === 'M3'), 'kỳ cũ này có dòng m³ (giá cố định theo ĐVT tuyến)'); assert.equal(d.uomLabel, 'tấn'); assert.equal(d.totals.ton, d.totals.kg / 1000, 'cột = tấn');
  const x = path.join(OUT, 'cu.xlsx'); await rs.export({ report: 'BKVC', format: 'XLSX', params: { periodId: pid }, targetPath: x }); assert.deepEqual(await headRow(x), LEGACY_HEADS, 'in lại kỳ cũ: tiêu đề y như trước');
  const csv = path.join(OUT, 'cu.csv'); await rs.export({ report: 'BKVC', format: 'CSV', params: { periodId: pid }, targetPath: csv }); assert.doesNotMatch(fs.readFileSync(csv, 'utf8').split(/\r?\n/)[0], /m³/);
  store.close();
});
