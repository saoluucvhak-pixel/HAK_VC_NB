'use strict';
/** Nhật trình vận chuyển 1 xe: ngày, tuyến, cự ly, số chuyến, số km, dầu nhận, dầu định mức, chủ hàng; tháng / quý (cộng từng tháng) / xuất Excel, PDF. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install } = require('./install');
const { ReportService } = require('../main/reports/ReportService');
const { chromiumPdfRenderer } = require('../main/reports/pdf');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-vlog-'));
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

test('Nhật trình xe 92H-00192 tháng 09/2026 khớp phiếu cân + bảng kê dầu; quý có dòng cộng tháng; xuất Excel / PDF', async () => {
  const { store } = await install('DH');
  const render = fs.existsSync(CHROME) ? chromiumPdfRenderer({ executablePath: CHROME }) : undefined;
  const rs = new ReportService(store, { pdfRenderer: render });
  try {
  const P = '92H-00192';
  const d = rs.vehicleLog({ plateNo: P, dateFrom: '2026-09-01', dateTo: '2026-09-30', label: 'Tháng 09/2026' });
  const t = store.find('PHIEU_CAN', (x) => x.plate_no === P && !x.is_deleted);
  const f = store.find('GIAO_NHAN_DAU', (x) => x.plate_no === P && !x.is_deleted);
  const route = store.get('TUYEN_VC', 'VC.007');
  assert.equal(d.summary.trips, t.length);
  assert.equal(d.summary.km, t.length * route.trip_distance_km, 'số km = cự ly đi-về × số chuyến');
  assert.equal(d.summary.fuel, Math.round(f.reduce((a, r) => a + r.qty_liter, 0) * 100) / 100);
  assert.equal(d.summary.ton, Math.round(t.reduce((a, x) => a + x.net_kg, 0) / 10) / 100);
  assert.equal(d.rows[0].date, '2026-09-18'); assert.equal(d.rows[0].distance_km, route.distance_km);
  assert.match(d.rows[0].owner, /Hoàng Anh Khôi Quảng Nam/, 'chủ hàng = bên thuê của hợp đồng');
  assert.equal(d.rows.filter((r) => r.fuel !== null).length, new Set(f.map((r) => r.receive_date)).size, 'dầu nhận ghi 1 lần mỗi ngày');
  assert.ok(d.summary.norm > 0);
  assert.equal(d.rows.reduce((a, r) => a + (r.trips || 0), 0), t.length);
  // dầu nhận ngày không chạy → vẫn có dòng
  const free = store.find('GIAO_NHAN_DAU', (x) => x.plate_no === P)[0];
  await store.transaction((tx) => tx.insert('GIAO_NHAN_DAU', { ...free, receipt_id: 'GD-DH-T9001', receive_date: '2026-10-02', qty_liter: 120, created_at: '', created_by: '', row_version: 1 }), { user: 't' });
  const q = rs.vehicleLog({ plateNo: P, dateFrom: '2026-07-01', dateTo: '2026-12-31', label: 'Quý 3–4/2026' });
  const sub = q.rows.filter((r) => r._b);
  assert.deepEqual(sub.map((r) => r.route), ['Cộng tháng 09/2026', 'Cộng tháng 10/2026']);
  const oct = q.rows.find((r) => r.date === '2026-10-02'); assert.equal(oct.route, '(chỉ nhận dầu)'); assert.equal(oct.fuel, 120); assert.equal(oct.trips, null);
  assert.equal(q.totalsRow.fuel, Math.round((d.summary.fuel + 120) * 100) / 100);
  await assert.rejects(async () => rs.vehicleLog({ plateNo: '', dateFrom: '2026-09-01', dateTo: '2026-09-30' }), /Chọn xe/);
  // xuất
  const fx = path.join(OUT, 'nt.xlsx'); await rs.export({ report: 'VEHICLE_LOG', format: 'XLSX', params: { plateNo: P, dateFrom: '2026-09-01', dateTo: '2026-09-30', label: 'Tháng 09/2026' }, targetPath: fx });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(fx); const ws = wb.worksheets[0];
  assert.equal(ws.getCell('A2').value, 'NHẬT TRÌNH VẬN CHUYỂN XE 92H-00192');
  assert.deepEqual(ws.getRow(4).values.slice(1, 11), ['STT', 'Ngày', 'Tuyến', 'Cự ly 1 chiều (km)', 'Số chuyến', 'Số km theo tuyến (đi + về)', 'Chốt đồng hồ km', 'KL hàng (tấn)', 'Dầu nhận (lít)', 'Kho nhận dầu']);
  if (fs.existsSync(CHROME)) {
    const fp = path.join(OUT, 'nt.pdf'); await rs.export({ report: 'VEHICLE_LOG', format: 'PDF', params: { plateNo: P, dateFrom: '2026-09-01', dateTo: '2026-09-30', label: 'Tháng 09/2026' }, targetPath: fp });
    assert.ok(fs.statSync(fp).size > 10000);
  }
  } finally { if (render) await render.close(); store.close(); }
});
