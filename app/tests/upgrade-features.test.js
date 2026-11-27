'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { install, KETOAN, rid } = require('./install');
const { ReconcileService } = require('../main/services/ReconcileService');
const { ReportService } = require('../main/reports/ReportService');

test('Nghiệm thu: Hạng mục 2, 3, 4 (Kiểm soát hao hụt 2 đầu cân, Biên bản đối chiếu công nợ, Lịch trình & năng suất đội xe)', async (t) => {
  const { store, periods } = await install('HAKQN', { withData: true });
  t.after(() => { try { store.close(); } catch {} });

  // Tính kỳ 18-23/09/2026
  const calcRes = await periods.calculate({
    contractId: 'HD-HAKQN-QS',
    dateFrom: '2026-09-18',
    dateTo: '2026-09-23',
    routeCode: 'VC.007',
    clientRequestId: rid(),
    user: KETOAN
  });
  const pid = calcRes.period.period_id;

  const reportSvc = new ReportService(store);
  const reconcileSvc = new ReconcileService(store);

  await t.test('1. Kiểm soát hao hụt 2 đầu cân (transitLoss)', async () => {
    const res = await reconcileSvc.transitLoss({ tolerancePct: 0.5, maxHours: 24 });
    assert.ok(res, 'Phải trả về kết quả đối chiếu hao hụt');
    assert.equal(res.tolerancePct, 0.5, 'Định mức hao hụt 0.5%');
    assert.ok(res.summary, 'Phải có summary');
    assert.ok(Array.isArray(res.rows), 'Phải có danh sách rows');
    assert.ok(Array.isArray(res.byPlate), 'Phải có danh sách thống kê byPlate');

    // Báo cáo Excel cho TRANSIT_LOSS
    const rep = await reconcileSvc.report({ kind: 'TRANSIT_LOSS', params: { tolerancePct: 0.5 } });
    assert.equal(rep.sheets.length, 3, 'Phải có 3 sheet: Tong hop, Theo xe, Chi tiet tung chuyen');
    assert.equal(rep.sheets[0].name, 'Tong hop hao hut');
  });

  await t.test('2. Biên bản đối chiếu công nợ & cước vận chuyển (reconciliationStatement)', async () => {
    const stmt = reportSvc.reconciliationStatement({ periodId: pid });
    assert.ok(stmt, 'Phải tạo được biên bản đối chiếu công nợ');
    assert.equal(stmt.title, 'BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ VÀ CƯỚC VẬN CHUYỂN');
    assert.ok(stmt.contractNo, 'Có số hợp đồng');
    assert.ok(stmt.freight, 'Có thông tin doanh thu cước');
    assert.ok(stmt.fuel, 'Có thông tin nhiên liệu cấn trừ');
    assert.equal(stmt.netPayable, stmt.freight.total - stmt.fuel.amount, 'Net Pay = Tổng cước sau VAT - Tiền dầu cấn trừ');
    assert.ok(stmt.netPayableWords, 'Có số tiền bằng chữ');
    assert.ok(Array.isArray(stmt.byPlate), 'Có phân bổ theo xe');

    // Test HTML template
    const htmlOutput = reportSvc.html({ report: 'RECONCILIATION_STATEMENT', params: { periodId: pid } });
    assert.ok(htmlOutput.includes('BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ VÀ CƯỚC VẬN CHUYỂN'), 'HTML có tiêu đề');
    assert.ok(htmlOutput.includes('SỐ TIỀN THỰC THANH TOÁN RÒNG'), 'HTML có khung Net Pay');
    assert.ok(htmlOutput.includes('ĐẠI DIỆN BÊN B'), 'HTML có chữ ký bên vận chuyển');
    assert.ok(htmlOutput.includes('ĐẠI DIỆN BÊN A'), 'HTML có chữ ký bên thuê');
  });

  await t.test('3. Biểu đồ lịch trình & năng suất đội xe (fleetTimeline)', async () => {
    const timeline = reportSvc.fleetTimeline({ periodId: pid });
    assert.ok(timeline, 'Phải trả về dữ liệu lịch trình');
    assert.equal(timeline.hourlyDistribution.length, 24, 'Phải có phân bổ 24 khung giờ');
    assert.ok(Array.isArray(timeline.bottlenecks), 'Phải có danh sách điểm nghẽn trạm cân');
    assert.ok(Array.isArray(timeline.vehicles), 'Phải có danh sách các xe và các chuyến');
    assert.ok(timeline.totalTickets > 0, 'Phải có số lượng phiếu cân phân tích');

    // Kiểm tra xe đầu tiên
    const v1 = timeline.vehicles[0];
    assert.ok(v1.plateNo, 'Có biển số xe');
    assert.ok(v1.tripCount > 0, 'Có số chuyến');
    assert.ok(Array.isArray(v1.trips), 'Có danh sách trips');
  });
});

test('Biên bản công nợ cộng đủ các tuyến của một xe và báo lỗi dữ liệu dầu', (t) => {
  const store = { find: () => [] };
  const reports = new ReportService(store);
  t.mock.method(reports, '_period', () => ({ period_code: 'KT', report_date: '2026-11-27' }));
  t.mock.method(reports, '_meta', () => ({ contract: {}, cfg: {}, signers: { carrier: {}, customer: {} } }));
  t.mock.method(reports, 'bkvc', () => ({
    lines: [
      { plate_no: '92H-00001', trip_count: 1, kg: 1000, ton: 1, uom: 'TAN', amount_incl_vat: 110 },
      { plate_no: '92H-00001', trip_count: 2, kg: 7000, ton: 9, uom: 'M3', amount_incl_vat: 220 }
    ],
    totals: { trips: 3, kg: 8000, ton: 10, amount: 300, vat: 30, total: 330 },
    header: { vatPct: 10 },
    uomLabel: 'tấn / m³'
  }));
  const stmt = reports.reconciliationStatement({ periodId: 'KT' });
  assert.equal(stmt.fuel.amount, 0);
  assert.equal(stmt.freight.ton, 8);
  assert.equal(stmt.freight.uomLabel, 'tấn');
  assert.equal(stmt.byPlate.length, 1);
  assert.equal(stmt.byPlate[0].trips, 3);
  assert.equal(stmt.byPlate[0].ton, 8);
  assert.equal(stmt.byPlate[0].netPayable, stmt.netPayable);

  store.find = () => [{ receipt_id: 'missing' }];
  store.get = () => undefined;
  assert.throws(() => reports.reconciliationStatement({ periodId: 'KT' }), { code: 'INTEGRITY_ERROR' });
});

test('Lịch trình tính theo ngày thực và bỏ qua giờ cân thiếu', () => {
  const tickets = [
    { weigh1_date: '2026-11-24', weigh1_time: '23:50', weigh2_date: '2026-11-25', weigh2_time: '00:10' },
    { weigh1_date: '2026-11-25', weigh1_time: '01:00', weigh2_date: '2026-11-25', weigh2_time: '01:30' },
    { weigh1_date: '2026-11-27', weigh1_time: '01:30', weigh2_date: '2026-11-27', weigh2_time: '01:45' },
    { weigh1_date: '2026-11-27', weigh1_time: '', weigh2_time: '' }
  ].map((times, i) => ({ ...times, ticket_id: String(i), plate_no: '92H-00001', net_kg: 2005 }));
  const reports = new ReportService({ all: (table) => table === 'PHIEU_CAN' ? tickets : [] });
  const timeline = reports.fleetTimeline();
  const [v] = timeline.vehicles;
  assert.equal(timeline.totalTickets, 4);
  assert.equal(timeline.hourlyDistribution[0].count, 0);
  assert.equal(timeline.hourlyDistribution[1].ton, 4.01);
  assert.equal(v.totalTon, 8.02);
  assert.equal(v.avgDurationMin, 22);
  assert.equal(v.avgTurnaroundMin, 1465);
  assert.equal(v.trips.find((t) => t.ticketId === '0').turnaroundNextMin, 50);
  assert.equal(v.trips.find((t) => t.ticketId === '3').startMin, null);
});

test('Hao hụt hai đầu cân chấp nhận định mức 0% và từ chối giá trị không hợp lệ', async (t) => {
  const ticket = { ticket_no: '001', plate_no: '92H-00001', weigh1_date: '2026-11-27', weigh1_time: '07:00', net_kg: 10000 };
  const reconcile = new ReconcileService({ all: () => [ticket] });
  t.mock.method(reconcile, '_theirs', async () => ({
    tickets: [{ ...ticket, weigh1_time: '07:30', net_kg: 9990 }]
  }));
  const report = await reconcile.transitLoss({ destinationFilePath: 'dich.xlsx', tolerancePct: 0 });
  assert.equal(report.tolerancePct, 0);
  assert.equal(report.summary.excessCount, 1);
  await assert.rejects(reconcile.transitLoss({ tolerancePct: Infinity }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(reconcile.transitLoss({ maxHours: -1 }), { code: 'VALIDATION_FAILED' });
});

test('Biên bản công nợ Excel giữ phần lẻ và ghi đúng đơn vị m³', async (t) => {
  const { tmpdir } = require('node:os');
  const { Workbook } = require('exceljs');
  const { writeReconciliationStatement } = require('../main/reports/xlsxExport');
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'dgvc-cong-no-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'cong-no.xlsx');
  const party = { unitName: 'Đơn vị thử', signer: { name: 'Người thử', title: 'Đại diện' } };
  await writeReconciliationStatement({
    carrier: party, customer: party, signers: { carrier: party, customer: party }, periodCode: 'KT', dateText: 'ngày 27/11/2026',
    freight: { trips: 1, ton: 8.75, uomLabel: 'm³', amount: 100, vatPct: 10, vat: 10, total: 110 },
    fuel: { qty: 1.25, avgPrice: 20, amount: 25 },
    byPlate: [], netPayable: 85, netPayableWords: 'Tám mươi lăm đồng'
  }, file);
  const wb = new Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(1);
  const cells = [];
  ws.eachRow((row) => row.eachCell((cell) => cells.push(cell)));
  for (const qty of [8.75, 1.25]) {
    const quantity = cells.find((cell) => cell.col === 7 && cell.value === qty);
    assert.equal(quantity?.numFmt, '#,##0.00');
  }
  assert.ok(cells.some((cell) => cell.value === 'Khối lượng (m³)'));
});
