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
