'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { install, KETOAN, ADMIN, rid } = require('./install');
const { MasterDataService } = require('../main/services/MasterDataService');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-veh-import-'));

test('Import danh mục xe từ Excel: đọc nhận diện cột, xem trước INSERT/UPDATE và nạp thành công', async () => {
  const { store } = await install('DH', { withData: false });
  const md = new MasterDataService(store);

  // Tạo sẵn 1 xe để test UPDATE
  await md.saveVehicle({
    create: true,
    record: {
      plateNo: '43H-99991',
      ownerUnitCode: 'DH',
      fuelCode: 'DH_43H99991',
      payloadTon: 20,
      volumeM3: null,
      note: 'Xe cũ'
    },
    user: ADMIN
  });

  // Tạo file Excel test
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Danh sách xe');
  ws.addRow(['STT', 'Biển số', 'Trọng tải (tấn)', 'Thể tích thùng (m3)', 'Chủ xe', 'Mã xe dầu', 'Ghi chú']);
  ws.addRow([1, '43H-99991', '25,5', '57,82', 'DH', 'DH_99991_NEW', 'Đã nâng tải thùng']); // update
  ws.addRow([2, '92H-00057', 18, 55.4, 'ĐH', 'DH_92H00057', 'Xe dăm']); // update xe có sẵn trong seed, test nhận diện đơn vị 'ĐH' -> 'DH'
  ws.addRow([3, '92H-99998', 30, null, 'DH', '', '']); // insert mới chỉ có tải trọng
  ws.addRow([4, 'BIEN_SO_SAI', 15, 40, 'DH', '', 'Lỗi định dạng']); // error

  const excelPath = path.join(TMP, 'danh_sach_xe.xlsx');
  await wb.xlsx.writeFile(excelPath);

  // 1. Xem trước
  const preview = await md.previewImportVehicles({ filePath: excelPath });
  assert.equal(preview.totalRows, 4);
  assert.equal(preview.insertCount, 1, '1 xe thêm mới (92H-99998)');
  assert.equal(preview.updateCount, 2, '2 xe cập nhật (43H-99991, 92H-00057)');
  assert.equal(preview.errorCount, 1, '1 xe lỗi định dạng');

  // Kiểm tra chi tiết dòng 1 (UPDATE)
  const r1 = preview.rows.find((r) => r.plateNo === '43H-99991');
  assert.ok(r1);
  assert.equal(r1.action, 'UPDATE');
  assert.equal(r1.payloadTon, 25.5);
  assert.equal(r1.volumeM3, 57.82);

  // Kiểm tra chi tiết dòng 2 (UPDATE)
  const r2 = preview.rows.find((r) => r.plateNo === '92H-00057');
  assert.ok(r2);
  assert.equal(r2.action, 'UPDATE');
  assert.equal(r2.payloadTon, 18);
  assert.equal(r2.volumeM3, 55.4);
  assert.equal(r2.ownerUnitCode, 'DH', 'Nhận diện đúng chủ xe');

  // 2. Xác nhận nạp
  const res = await md.importVehicles({
    rows: preview.rows.filter((r) => r.action !== 'ERROR'),
    user: KETOAN
  });

  assert.equal(res.inserted, 1);
  assert.equal(res.updated, 2);

  // Kiểm tra dữ liệu trong store
  const v1 = store.get('XE', '43H-99991');
  assert.equal(v1.payload_ton, 25.5);
  assert.equal(v1.volume_m3, 57.82);
  assert.equal(v1.note, 'Đã nâng tải thùng');

  const v2 = store.get('XE', '92H-00057');
  assert.ok(v2);
  assert.equal(v2.payload_ton, 18);
  assert.equal(v2.volume_m3, 55.4);

  store.close();
});

test('Cảnh báo phiếu cân chở quá trọng tải xe (W_OVERLOAD)', async () => {
  const { store, periods, contractId } = await install('DH', { withData: false });
  const md = new MasterDataService(store);

  // Tạo xe có trọng tải đăng kiểm 18 tấn (= 18.000 kg)
  await md.saveVehicle({
    create: true,
    record: {
      plateNo: '43H-88888',
      ownerUnitCode: 'DH',
      payloadTon: 18,
      volumeM3: 50,
    },
    user: ADMIN
  });

  // Gán xe vào hợp đồng
  await store.transaction((tx) => {
    tx.insert('HOP_DONG_XE', {
      id: 'HX-OV-1',
      contract_id: contractId,
      plate_no: '43H-88888',
      effective_from: '2026-01-01',
      effective_to: ''
    });
  }, { user: 'test' });

  // Tuyến & giá
  await store.transaction((tx) => {
    tx.insert('TUYEN_VC', {
      route_code: 'VC.OV',
      route_name: 'Tuyến test quá tải',
      distance_km: 20,
      trip_distance_km: 40,
      from_place: 'A',
      to_place: 'B',
      uom: 'TAN',
      catalog_unit_code: 'DH',
      note: '',
      is_active: true
    });
    tx.insert('PRICE_HISTORY', {
      price_id: 'PR-OV-1',
      route_code: 'VC.OV',
      contract_id: contractId,
      version_no: 1,
      effective_from: '2026-01-01',
      status: 'ACTIVE',
      is_used: false,
      price_method: 'CO_DINH',
      fixed_price: 100000,
      new_price: 0,
      fuel_price_excl_vat: 0,
      fuel_norm_l_per_km: 0,
      avg_load_ton: 0,
    });
  }, { user: 'test' });

  // Phiếu cân chở 28.500 kg (vượt 10.500 kg so với đăng kiểm 18.000 kg)
  await store.transaction((tx) => {
    tx.insert('PHIEU_CAN', {
      ticket_id: 'TK-OV-1',
      ticket_key: 'DH|VC.OV|2026-09-19|PH-OV-1',
      ticket_no: 'PH-OV-1',
      weigh1_date: '2026-09-19',
      weigh1_time: '08:00:00',
      weigh2_date: '2026-09-19',
      weigh2_time: '11:00:00',
      plate_no: '43H-88888',
      route_code: 'VC.OV',
      owner_unit_code: 'DH',
      weight1_kg: 43500,
      weight2_kg: 15000,
      net_kg: 28500,
      is_deleted: false,
      created_at: tx.now
    });
  }, { user: 'test' });

  // Tính kỳ
  const k = await periods.calculate({
    contractId,
    dateFrom: '2026-09-18',
    dateTo: '2026-09-23',
    routeCode: 'VC.OV',
    reportDate: '2026-09-25',
    clientRequestId: rid(),
    user: KETOAN
  });

  // Kiểm tra cảnh báo W_OVERLOAD
  const warn = k.issues.find((i) => i.code === 'W_OVERLOAD');
  assert.ok(warn, 'Hệ thống phải phát hiện cảnh báo W_OVERLOAD');
  assert.equal(warn.level, 'WARNING', 'Mức độ cảnh báo là WARNING (màu vàng), không chặn tính');
  assert.match(warn.message, /vượt trọng tải đăng kiểm/);
  assert.equal(warn.params.netKg, 28500);
  assert.equal(warn.params.payloadKg, 18000);
  assert.equal(warn.params.diffKg, 10500);

  // Vẫn tính ra kết quả bình thường không bị lỗi
  assert.ok(k.period);
  assert.equal(k.results[0].transportPrice, 100000);
  assert.equal(k.bkvc.lines.length, 1);
  assert.equal(k.bkvc.lines[0].ton, 28.5);

  store.close();
});
