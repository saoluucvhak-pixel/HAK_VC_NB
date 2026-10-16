'use strict';
/** Kho nhận dầu (import / sửa / báo cáo) + khai báo km xe theo ngày → nhật trình có km khai báo, kho nhận dầu. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, ADMIN, KETOAN, rid } = require('./install');
const { ImportService } = require('../main/import/ImportService');
const { RecordService } = require('../main/services/RecordService');
const { VehicleKmService } = require('../main/services/VehicleKmService');
const { ReportService } = require('../main/reports/ReportService');
const { JsonStore } = require('../main/repo/JsonStore');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-km-'));
const P = '92H-00192';

test('Kho nhận dầu: import cột "Kho nhận dầu", sửa được cả khi đã chốt kỳ, hiện ở bảng kê dầu / biên bản / nhật trình', async () => {
  const { store, periods, contractId } = await install('DH');
  const imp = new ImportService(store); const rec = new RecordService(store, { importService: imp });
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('NL_GIAONHANDAU');
  ws.addRow(['Ngày nhận dầu', 'Mã cự ly VC', 'Biển số xe', 'ĐVT', 'Số lượng (lít)', 'Đơn giá dầu', 'Ngày mua dầu', 'Đơn vị', 'Kho nhận dầu']);
  ws.addRow(['23/09/2026', 'VC.007', 'DH_92H00192', 'LÍT', 150, 29900, '', 'HAKQN', 'Cây xăng Quế Sơn']);
  const f = path.join(OUT, 'dau.xlsx'); await wb.xlsx.writeFile(f);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId, filePath: f, user: 'ketoan' });
  assert.equal(pv.mapping['Kho nhận dầu'], 'fuel_depot');
  await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  const r = store.find('GIAO_NHAN_DAU', (x) => x.fuel_depot === 'Cây xăng Quế Sơn')[0]; assert.ok(r);
  // chốt kỳ có dòng dầu này → vẫn sửa được kho (cột mô tả), không sửa được số lít
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const other = store.find('GIAO_NHAN_DAU', (x) => x.receive_date === '2026-09-20' && x.plate_no === P)[0];
  await rec.updateFuel({ receiptId: other.receipt_id, changes: { fuel_depot: 'Kho HAKQN' }, rowVersion: other.row_version, reason: 'bổ sung kho', user: ADMIN });
  assert.equal(store.get('GIAO_NHAN_DAU', other.receipt_id).fuel_depot, 'Kho HAKQN');
  const o2 = store.get('GIAO_NHAN_DAU', other.receipt_id);
  await assert.rejects(rec.updateFuel({ receiptId: other.receipt_id, changes: { qty_liter: 999 }, rowVersion: o2.row_version, reason: 'x', user: ADMIN }), /đã xác nhận/);
  const rs = new ReportService(store);
  assert.ok(rs.fuelList({ dateFrom: '2026-09-20', dateTo: '2026-09-20' }).rows.some((x) => x.depot === 'Kho HAKQN'));
  assert.ok(rs.fuelHandover({ periodId: k.period.period_id }).docs[0].rows.some((x) => /Kho: Kho HAKQN/.test(x.note)));
  const log = rs.vehicleLog({ plateNo: P, dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  assert.equal(log.rows.find((x) => x.date === '2026-09-20').depot, 'Kho HAKQN');
  assert.equal(log.rows.find((x) => x.date === '2026-09-23').depot, 'Cây xăng Quế Sơn');
  store.close();
});

test('Chốt đồng hồ km (đầu năm / cuối năm): km đồng hồ − km theo tuyến = chênh lệch; nhiều lần chốt → từng khoảng; cảnh báo đồng hồ giảm', async () => {
  const { store, dir } = await install('DH');
  const km = new VehicleKmService(store);
  const rs = new ReportService(store);
  const route = store.get('TUYEN_VC', 'VC.007');
  const trips = store.find('PHIEU_CAN', (t) => t.plate_no === P && !t.is_deleted);
  const fuelAll = store.find('GIAO_NHAN_DAU', (r) => r.plate_no === P && !r.is_deleted).reduce((a, r) => a + r.qty_liter, 0);
  await assert.rejects(km.save({ plateNo: P, rows: [{ date: '2026-01-01', odometer: -5 }], user: ADMIN }), /không hợp lệ/);
  await assert.rejects(km.save({ plateNo: P, rows: [{ date: '', odometer: 5 }], user: ADMIN }), /Ngày chốt/);
  // chỉ chốt đầu năm và cuối năm
  let r = await km.save({ plateNo: P, rows: [{ date: '2026-01-01', odometer: 120000, readAt: 'DAU_NGAY' }, { date: '2026-12-31', odometer: 123500, readAt: 'CUOI_NGAY', note: 'chốt cuối năm' }], user: ADMIN });
  assert.equal(r.added, 2); assert.deepEqual(r.warnings, []);
  let log = rs.vehicleLog({ plateNo: P, dateFrom: '2026-01-01', dateTo: '2026-12-31', label: 'Năm 2026' });
  const T = log.odo.total;
  assert.equal(log.odo.segments.length, 1);
  assert.equal(T.odoKm, 3500); assert.equal(T.routeKm, trips.length * route.trip_distance_km); assert.equal(T.trips, trips.length);
  assert.equal(T.diffKm, 3500 - trips.length * route.trip_distance_km);
  assert.equal(T.per100, Math.round(fuelAll / 3500 * 10000) / 100);
  assert.equal(log.summary.odoDiffKm, T.diffKm);
  assert.equal(log.rows.find((x) => x.date === '2026-01-01').odo, '120.000 (đầu ngày)');
  assert.equal(log.rows.find((x) => x.date === '2026-01-01').route, '(chốt đồng hồ km)');
  assert.equal(log.extraTables.length, 1);
  // chốt tối 31/12 năm trước thay cho sáng 01/01 → vẫn thuộc năm 2026
  r = await km.save({ plateNo: P, rows: [{ date: '2026-01-01', odometer: '' }, { date: '2025-12-31', odometer: 120000, readAt: 'CUOI_NGAY' }], user: ADMIN });
  assert.equal(r.deleted, 1); assert.equal(r.added, 1);
  log = rs.vehicleLog({ plateNo: P, dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  assert.equal(log.odo.total.odoKm, 3500); assert.equal(log.odo.total.routeKm, trips.length * route.trip_distance_km);
  // thêm chốt giữa kỳ (tối 20/09) → 2 khoảng; chuyến 18–20 vào khoảng 1, 21–23 vào khoảng 2
  await km.save({ plateNo: P, rows: [{ date: '2026-09-20', odometer: 121700, readAt: 'CUOI_NGAY' }], user: ADMIN });
  log = rs.vehicleLog({ plateNo: P, dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  const [s1, s2] = log.odo.segments;
  const n1 = trips.filter((t) => t.weigh1_date <= '2026-09-20').length;
  assert.equal(s1.odoKm, 1700); assert.equal(s1.trips, n1); assert.equal(s2.odoKm, 1800); assert.equal(s2.trips, trips.length - n1);
  assert.equal(log.odo.total.odoKm, 3500); assert.equal(log.extraTables[0].totalsRow.fromText, 'CỘNG');
  // xem riêng tháng 9: chỉ 1 lần chốt trong tháng → chưa đủ để đối chiếu
  const m9 = rs.vehicleLog({ plateNo: P, dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  assert.equal(m9.odo.readings.length, 1); assert.equal(m9.odo.segments.length, 0);
  // đồng hồ giảm → cảnh báo
  r = await km.save({ plateNo: P, rows: [{ date: '2026-10-31', odometer: 121000, readAt: 'CUOI_NGAY' }], user: ADMIN });
  assert.match(r.warnings[0].message, /nhỏ hơn lần chốt trước/);
  // Excel có bảng đối chiếu bên dưới
  const fx = path.join(OUT, 'nt_odo.xlsx');
  await rs.export({ report: 'VEHICLE_LOG', format: 'XLSX', params: { plateNo: P, dateFrom: '2026-01-01', dateTo: '2026-09-30', label: '9 tháng' }, targetPath: fx });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(fx); let found = false;
  wb.worksheets[0].eachRow((row) => { if (row.getCell(1).value === 'ĐỐI CHIẾU KM ĐỒNG HỒ VỚI KM THEO TUYẾN') found = true; });
  assert.ok(found, 'Excel có bảng đối chiếu km đồng hồ');
  store.close();
  const again = new JsonStore(dir).open(); assert.equal(again.find('XE_KM', () => true).length, 4); again.close();
});
