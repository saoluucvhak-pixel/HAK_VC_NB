'use strict';
/**
 * Kiểm thử toàn diện quy trình Thuê vận chuyển & Đối chiếu 3 tiêu chuẩn:
 *  1. Nhập dữ liệu thuê VC bằng file JSON đợt, gán vào kỳ vận chuyển công ty
 *  2. Đối chiếu Khối lượng phiếu cân qua từng xe (Biển số, số chuyến, Tấn, Chênh lệch KG)
 *  3. Đối chiếu Khối lượng dầu nhận (Số lần nhận, Số lít dầu, Chênh lệch Lít)
 *  4. Đối chiếu Đơn giá & Thành tiền (Đơn giá thuê đ/tấn, Cước thuê, Bù trừ tiền dầu, Thực trả cho bên thuê, Chênh lệch cước công ty)
 *  5. Xuất gói dữ liệu gửi đối tác dạng .json và .dgvc
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, rid } = require('./install');
const { SubcontractService } = require('../main/services/SubcontractService');
const { ExchangeService } = require('../main/services/ExchangeService');
const { ReconcileService } = require('../main/services/ReconcileService');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-subcontract-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };

async function setupEnv() {
  const ctx = await install('DH');
  const { store, periods, contractId } = ctx;
  const dup = store.find('GIAO_NHAN_DAU', (r) => r.receive_date === '2026-09-18' && r.plate_no === '92H-00192' && r.qty_liter === 400);
  const k = await periods.calculate({ contractId, ...W, excludeReceiptIds: [dup[1].receipt_id], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });

  const ex = new ExchangeService(store);
  const sub = new SubcontractService(store, { exchange: ex });
  const rec = new ReconcileService(store, { exchange: ex, subcontract: sub });

  return { ...ctx, ex, sub, rec, period: k.period };
}

test('Quy trình Thuê vận chuyển & Đối chiếu 3 tiêu chuẩn với file JSON đợt', async () => {
  const { store, sub, rec, ex, period } = await setupEnv();

  // 1. Tạo file JSON đợt thuê vận chuyển do đối tác gửi
  // Xe 92H-00141: Khớp phiếu cân và khớp dầu
  // Xe 92H-00192: Lệch phiếu cân (+500 kg) và lệch dầu (+20 L)
  // Xe 43C-999.99: Thiếu bên mình (chỉ có trong file đối tác)
  const fuel141Rows = store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.plate_no === '92H-00141' && r.receive_date >= W.dateFrom && r.receive_date <= W.dateTo);
  const fuel192Rows = store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.plate_no === '92H-00192' && r.receive_date >= W.dateFrom && r.receive_date <= W.dateTo);

  const batchData = {
    partnerName: 'CÔNG TY VẬN TẢI TUẤN HƯNG',
    batchName: 'Đợt 1 - Tuyến VC.007 ngày 18-23/09',
    tickets: [
      // 92H-00141: lấy các phiếu cân sẵn có của xe này trong kỳ để khớp
      ...store.find('PHIEU_CAN', (t) => !t.is_deleted && t.plate_no === '92H-00141' && t.weigh1_date >= W.dateFrom && t.weigh1_date <= W.dateTo),
      // 92H-00192: cố tình sửa khối lượng tăng 500 kg ở phiếu đầu
      ...store.find('PHIEU_CAN', (t) => !t.is_deleted && t.plate_no === '92H-00192' && t.weigh1_date >= W.dateFrom && t.weigh1_date <= W.dateTo).map((t, idx) =>
        idx === 0 ? { ...t, net_kg: t.net_kg + 500 } : t
      ),
      // 43C-999.99: phiếu mới hoàn toàn
      { ticket_no: 'TH-001', weigh1_date: '2026-09-20', weigh1_time: '08:00:00', plate_no: '43C-999.99', net_kg: 20000, route_code: 'VC.007' }
    ],
    fuel: [
      // 92H-00141: khớp 100% tất cả các lần nhận dầu
      ...fuel141Rows.map((r, i) => ({ receipt_no: `D-141-${i + 1}`, receipt_date: r.receive_date, plate_no: r.plate_no, qty_liter: r.qty_liter })),
      // 92H-00192: lệch đúng 20 L ở lần nhận đầu
      ...fuel192Rows.map((r, i) => ({ receipt_no: `D-192-${i + 1}`, receipt_date: r.receive_date, plate_no: r.plate_no, qty_liter: i === 0 ? r.qty_liter + 20 : r.qty_liter })),
      // 43C-999.99: dầu mới
      { receipt_no: 'D-003', receipt_date: '2026-09-20', plate_no: '43C-999.99', qty_liter: 150 }
    ]
  };

  const jsonFilePath = path.join(OUT, 'subcontract_batch_1.json');
  fs.writeFileSync(jsonFilePath, JSON.stringify(batchData, null, 2), 'utf8');

  // 2. Kiểm tra xem trước đợt nạp (previewBatch)
  const preview = await sub.previewBatch({ filePath: jsonFilePath });
  assert.equal(preview.summary.ticketCount, batchData.tickets.length);
  assert.equal(preview.summary.fuelCount, batchData.fuel.length);
  assert.ok(preview.summary.plates.includes('92H-00141'));
  assert.ok(preview.summary.plates.includes('92H-00192'));
  assert.ok(preview.summary.plates.includes('43C-999.99'));

  // 3. Nạp đợt và gán vào kỳ vận chuyển của công ty
  const imported = await sub.importBatch({
    filePath: jsonFilePath,
    periodId: period.period_id,
    partnerName: batchData.partnerName,
    batchName: batchData.batchName,
    rentUnitPrice: 155000, // 155.000 đ/tấn
    fuelUnitPrice: 19500,  // 19.500 đ/lít
    deductFuel: true,
    user: KETOAN
  });

  assert.ok(imported.batchId.startsWith('SCB-'));
  assert.equal(imported.periodId, period.period_id);
  assert.equal(imported.periodCode, period.period_code);
  assert.equal(imported.rentUnitPrice, 155000);
  assert.equal(imported.fuelUnitPrice, 19500);

  // Kiểm tra danh sách đợt
  const list = sub.list({ periodId: period.period_id });
  assert.equal(list.length, 1);
  assert.equal(list[0].batchId, imported.batchId);

  // 4. Thực hiện Đối chiếu 3 tiêu chuẩn
  const cmp = await rec.compare({ batchId: imported.batchId });
  assert.ok(cmp.batch, 'có thông tin đợt');
  assert.equal(cmp.batch.batchId, imported.batchId);
  assert.ok(cmp.period, 'có thông tin kỳ tính công ty');
  assert.equal(cmp.period.periodId, period.period_id);

  // Kiểm tra Tiêu chí 1: Phiếu cân từng xe
  const row141 = cmp.byPlate.find((r) => r.plateNo === '92H-00141');
  assert.ok(row141, 'có xe 92H-00141');
  assert.equal(row141.diffKg, 0, '92H-00141 chênh 0 kg');

  const row192 = cmp.byPlate.find((r) => r.plateNo === '92H-00192');
  assert.ok(row192, 'có xe 92H-00192');
  assert.equal(row192.diffKg, 500, '92H-00192 chênh đúng 500 kg');

  const row43C = cmp.byPlate.find((r) => r.plateNo === '43C-999.99');
  assert.ok(row43C, 'có xe 43C-999.99');
  assert.equal(row43C.matchStatus, 'MISSING_MINE', '43C-999.99 bên mình chưa có');

  // Kiểm tra Tiêu chí 2: Dầu nhận từng xe
  assert.equal(row141.diffFuelLiter, 0, '92H-00141 dầu khớp 0 L');
  assert.equal(row192.diffFuelLiter, 20, '92H-00192 dầu lệch đúng 20 L');

  // Kiểm tra Tiêu chí 3: Đơn giá, Thành tiền, Tiền dầu bù trừ & Thực trả
  assert.equal(row141.rentUnitPrice, 155000);
  assert.equal(row141.fuelUnitPrice, 19500);
  assert.equal(row141.theirRentAmount, Math.round((row141.theirKg / 1000) * 155000));
  assert.equal(row141.theirFuelAmount, Math.round(row141.theirFuelLiter * 19500));
  assert.equal(row141.theirPayable, row141.theirRentAmount - row141.theirFuelAmount);

  // Kiểm tra Doanh thu khách hàng và Lợi nhuận cước cty (vì đã gắn kỳ tính)
  assert.ok(row141.customerRevenue > 0, 'xe 92H-00141 có doanh thu cước khách hàng');
  assert.equal(row141.profitMargin, row141.customerRevenue - row141.theirRentAmount);

  // Kiểm tra trạng thái khớp tổng kết từng xe
  assert.equal(row141.matchStatus, 'MATCH');
  assert.equal(row192.matchStatus, 'DIFF_BOTH');

  // Kiểm tra Totals
  assert.equal(cmp.totals.rentUnitPrice, 155000);
  assert.equal(cmp.totals.fuelUnitPrice, 19500);
  assert.equal(cmp.totals.theirPayable, cmp.totals.theirRentAmount - cmp.totals.theirFuelAmount);
  assert.ok(cmp.totals.customerRevenue > 0);

  // 5. Kiểm tra Xuất dữ liệu gửi đối tác dạng .json và .dgvc
  const exportJsonPath = path.join(OUT, 'export_partner.json');
  const expJsonRes = await ex.exportPackage({
    packageType: 'KY_TINH',
    periodIds: [period.period_id],
    targetPath: exportJsonPath,
    user: KETOAN
  });
  assert.ok(fs.existsSync(exportJsonPath));
  const parsedJson = JSON.parse(fs.readFileSync(exportJsonPath, 'utf8'));
  assert.equal(parsedJson.header.format, 'DGVC-PKG');
  assert.ok(parsedJson.tables.KY_TINH.length >= 1);

  // Đọc lại gói qua ExchangeService.read
  const readBack = ex.read(exportJsonPath);
  assert.equal(readBack.header.format, 'DGVC-PKG');

  // 6. Xóa đợt nạp
  const delRes = await sub.deleteBatch({ batchId: imported.batchId, user: KETOAN });
  assert.equal(delRes.ok, true);
  assert.equal(sub.list({ periodId: period.period_id }).length, 0);

  store.close();
});
