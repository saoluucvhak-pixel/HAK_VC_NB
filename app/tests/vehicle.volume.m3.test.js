'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install, KETOAN, rid } = require('./install');
const { MasterDataService } = require('../main/services/MasterDataService');
const { CatalogService } = require('../main/services/CatalogService');

test('Danh mục xe: lưu trọng tải xe (tấn) và thể tích thùng (m³)', async () => {
  const { store } = await install('DH', { withData: false });
  const md = new MasterDataService(store);

  // Tạo xe mới có payload_ton và volume_m3
  const res = await md.saveVehicle({
    create: true,
    record: {
      plateNo: '43H-99999',
      ownerUnitCode: 'DH',
      fuelCode: 'DH_43H99999',
      payloadTon: 28.5,
      volumeM3: 57.82,
      note: 'Xe thùng dăm lớn'
    },
    user: KETOAN
  });

  assert.equal(res.record.plate_no, '43H-99999');
  assert.equal(res.record.payload_ton, 28.5);
  assert.equal(res.record.volume_m3, 57.82);

  // Cập nhật lại thể tích thùng
  const upd = await md.saveVehicle({
    record: {
      plateNo: '43H-99999',
      volumeM3: 60.5
    },
    rowVersion: res.record.row_version,
    user: KETOAN
  });
  assert.equal(upd.record.volume_m3, 60.5);
  assert.equal(upd.record.payload_ton, 28.5);

  store.close();
});

test('Mã đơn giá cố định: thêm đơn giá M3 theo tuyến (đ/m³) và tính cước quy đổi theo thể tích thùng xe', async () => {
  const { store, periods, contractId } = await install('DH', { withData: false });
  const cs = new CatalogService(store);
  const md = new MasterDataService(store);

  // 1. Tạo tuyến M3 VC.M3_TEST
  await store.transaction((tx) => {
    tx.insert('TUYEN_VC', {
      route_code: 'VC.M3_TEST',
      route_name: 'Tuyến thử nghiệm M3',
      distance_km: 50,
      trip_distance_km: 100,
      from_place: 'Đông Phú',
      to_place: 'Tiên Sa',
      uom: 'M3',
      catalog_unit_code: 'DH',
      note: '',
      is_active: true
    });
  }, { user: 'test' });

  // 2. Tạo 2 xe: Xe 1 có volume_m3 = 58 m3; Xe 2 không có volume_m3 (để test fallback)
  await md.saveVehicle({
    create: true,
    record: {
      plateNo: '43H-11111',
      ownerUnitCode: 'DH',
      fuelCode: 'DH_43H11111',
      payloadTon: 30,
      volumeM3: 58,
      note: ''
    },
    user: KETOAN
  });

  await md.saveVehicle({
    create: true,
    record: {
      plateNo: '43H-22222',
      ownerUnitCode: 'DH',
      fuelCode: 'DH_43H22222',
      payloadTon: 25,
      volumeM3: null,
      note: ''
    },
    user: KETOAN
  });

  // Gán 2 xe vào hợp đồng
  await store.transaction((tx) => {
    tx.insert('HOP_DONG_XE', {
      id: 'HX-M3-1',
      contract_id: contractId,
      plate_no: '43H-11111',
      effective_from: '2026-01-01',
      effective_to: ''
    });
    tx.insert('HOP_DONG_XE', {
      id: 'HX-M3-2',
      contract_id: contractId,
      plate_no: '43H-22222',
      effective_from: '2026-01-01',
      effective_to: ''
    });
  }, { user: 'test' });

  // 3. Tạo Mã đơn giá cố định
  await cs.savePriceCode({
    create: true,
    record: {
      priceCode: 'DG-M3-CD',
      priceName: 'Mã cố định có tuyến M3',
      priceMethod: 'CO_DINH',
      unitCode: 'DH'
    },
    user: KETOAN
  });

  // 4. Thêm dòng giá cố định cho tuyến M3 với đơn giá 120.000 đ/m³
  const lineRes = await cs.addCodeLine({
    priceCode: 'DG-M3-CD',
    record: {
      routeCode: 'VC.M3_TEST',
      effectiveFrom: '2026-09-01',
      fixedPrice: 120000
    },
    user: KETOAN
  });
  await cs.activatePrice({ priceId: lineRes.record.price_id, rowVersion: lineRes.record.row_version, user: KETOAN });

  // Gán mã đơn giá này cho hợp đồng
  const cRec = store.get('HOP_DONG', contractId);
  await store.transaction((tx) => {
    tx.update('HOP_DONG', contractId, { price_code: 'DG-M3-CD' });
  }, { user: 'test' });

  // 5. Thêm phiếu cân:
  // Xe 43H-11111 chạy 2 chuyến
  // Xe 43H-22222 chạy 1 chuyến
  await store.transaction((tx) => {
    tx.insert('PHIEU_CAN', {
      ticket_id: 'TK-M3-001',
      ticket_key: 'DH|VC.M3_TEST|2026-09-19|PH-M3-1',
      ticket_no: 'PH-M3-1',
      weigh1_date: '2026-09-19',
      weigh1_time: '08:00:00',
      weigh2_date: '2026-09-19',
      weigh2_time: '11:00:00',
      plate_no: '43H-11111',
      route_code: 'VC.M3_TEST',
      owner_unit_code: 'DH',
      weight1_kg: 40000,
      weight2_kg: 15000,
      net_kg: 25000,
      is_deleted: false,
      created_at: tx.now
    });
    tx.insert('PHIEU_CAN', {
      ticket_id: 'TK-M3-002',
      ticket_key: 'DH|VC.M3_TEST|2026-09-20|PH-M3-2',
      ticket_no: 'PH-M3-2',
      weigh1_date: '2026-09-20',
      weigh1_time: '08:00:00',
      weigh2_date: '2026-09-20',
      weigh2_time: '11:00:00',
      plate_no: '43H-11111',
      route_code: 'VC.M3_TEST',
      owner_unit_code: 'DH',
      weight1_kg: 40000,
      weight2_kg: 15000,
      net_kg: 25000,
      is_deleted: false,
      created_at: tx.now
    });
    tx.insert('PHIEU_CAN', {
      ticket_id: 'TK-M3-003',
      ticket_key: 'DH|VC.M3_TEST|2026-09-21|PH-M3-3',
      ticket_no: 'PH-M3-3',
      weigh1_date: '2026-09-21',
      weigh1_time: '08:00:00',
      weigh2_date: '2026-09-21',
      weigh2_time: '11:00:00',
      plate_no: '43H-22222',
      route_code: 'VC.M3_TEST',
      owner_unit_code: 'DH',
      weight1_kg: 35000,
      weight2_kg: 15000,
      net_kg: 20000,
      is_deleted: false,
      created_at: tx.now
    });
  }, { user: 'test' });

  // 6. Tính kỳ
  const k = await periods.calculate({
    contractId,
    dateFrom: '2026-09-18',
    dateTo: '2026-09-23',
    routeCode: 'VC.M3_TEST',
    reportDate: '2026-09-25',
    clientRequestId: rid(),
    user: KETOAN
  });

  assert.equal(k.results[0].transportPrice, 120000, 'Đơn giá tuyến M3 là 120.000 đ/m³');

  // Kiểm tra từng dòng BKVC
  const lines = k.bkvc.lines;
  assert.equal(lines.length, 2);

  // Xe 43H-11111: 2 chuyến × 58 m³ = 116 m³
  const l1 = lines.find((l) => l.plateNo === '43H-11111');
  assert.ok(l1);
  assert.equal(l1.tripCount, 2);
  assert.equal(l1.ton, 116, 'Quy đổi 2 chuyến × 58 m³ = 116 m³');
  assert.equal(l1.unitPrice, 120000);
  assert.equal(l1.amount, 116 * 120000, 'Thành tiền = 116 m³ × 120.000 = 13.920.000 đ');
  assert.equal(l1.vat, Math.round(l1.amount * 0.08));

  // Kiểm tra BKVC_LINE trong store đã lưu uom = M3
  const savedLines = store.find('BKVC_LINE', (l) => l.period_id === k.period.period_id && l.is_current);
  assert.equal(savedLines.length, 2);
  const sl1 = savedLines.find((l) => l.plate_no === '43H-11111');
  assert.equal(sl1.uom, 'M3');
  assert.equal(sl1.ton, 116);
  assert.equal(sl1.amount, 13920000);

  store.close();
});
