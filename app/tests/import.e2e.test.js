'use strict';
/**
 * Đầu-cuối: thư mục dữ liệu MỚI → nạp danh mục → import thẳng 3 file Excel gốc (phiếu cân + bảng kê dầu)
 * → so với dữ liệu mẫu → chạy Engine → phải khớp Excel (178.000 / 88.900 / 125.600).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { JsonStore } = require('../main/repo/JsonStore');
const { ImportService } = require('../main/import/ImportService');
const E = require('../main/engine');
const { loadDataFolder, fixture } = require('./helpers');

const X = path.join(__dirname, 'fixtures/excel');
const FILE = { HAKQN: path.join(X, 'Dongiavanchuyen_24.09 QS-TS( XUẤT QS).xlsx'), DH: path.join(X, 'Dongiavanchuyen_24.09_DH.xlsx'), HAK: path.join(X, 'Dongiavanchuyen_24.09_ĐN.xlsx') };
const CONTRACT = { HAKQN: 'HD-HAKQN-QS', DH: 'HD-DH-HAKQN', HAK: 'HD-HAK-HAKQN' };
const EXCEL = fixture('excel_expected.json');
const CATALOG = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'PRICE_HISTORY', 'HOP_DONG_XE', 'CONFIG', 'USERS'];
let reqId = 0; const rid = () => `req-${++reqId}`;

async function freshInstall(inst) {
  const seed = loadDataFolder(inst);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-${inst}-`));
  JsonStore.create(dir, { installCode: inst, unitCode: seed.manifest.unitCode, installId: `INS-E2E-${inst}` });
  const store = new JsonStore(dir).open();
  await store.transaction((tx) => { for (const t of CATALOG) for (const r of seed.rows[t]) tx.insert(t, r); }, { user: 'setup' });
  return { dir, store, seed: seed.rows, svc: new ImportService(store) };
}
async function importBoth(ctx, inst) {
  const pt = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE[inst], user: 'ketoan' });
  const ct = await ctx.svc.confirm({ batchId: pt.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  const pf = await ctx.svc.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT[inst], filePath: FILE[inst], user: 'ketoan' });
  const cf = await ctx.svc.confirm({ batchId: pf.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  return { pt, ct, pf, cf };
}
function calc(store, inst) {
  const all = (t) => store.all(t);
  return E.calculatePeriod({ contract: store.get('HOP_DONG', CONTRACT[inst]), contractVehicles: all('HOP_DONG_XE'), units: all('DON_VI'), routes: all('TUYEN_VC'),
    prices: all('PRICE_HISTORY'), tickets: all('PHIEU_CAN'), receipts: all('GIAO_NHAN_DAU'), installUnitCode: store.unitCode, cfg: E.buildConfig(all('CONFIG')),
    params: { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' } });
}
const CORE = ['ticket_id', 'ticket_key', 'ticket_no', 'weigh1_date', 'weigh1_time', 'weigh2_date', 'weigh2_time', 'plate_no', 'weight1_kg', 'weight2_kg', 'net_kg', 'route_code', 'owner_unit_code'];
const FUEL = ['receipt_id', 'contract_id', 'receive_date', 'route_code', 'fuel_vehicle_code', 'plate_no', 'owner_unit_code', 'uom', 'qty_liter', 'fuel_price_excl_vat', 'purchase_date', 'giver_unit_code'];

for (const inst of ['HAKQN', 'DH', 'HAK']) {
  test(`${inst}: thư mục mới → import file Excel gốc → dữ liệu trùng dữ liệu mẫu → tính ra đúng Excel`, async () => {
    const ctx = await freshInstall(inst);
    const { pt, ct, pf, cf } = await importBoth(ctx, inst);
    const nT = ctx.seed.PHIEU_CAN.length; const nF = ctx.seed.GIAO_NHAN_DAU.length;
    assert.equal(pt.summary.error, 0, JSON.stringify(pt.rows.filter((r) => r.status === 'ERROR').slice(0, 3)));
    assert.equal(pt.total, nT); assert.equal(ct.inserted, nT);
    assert.equal(pf.summary.error, 0, JSON.stringify(pf.rows.filter((r) => r.status === 'ERROR').slice(0, 3)));
    assert.equal(cf.inserted, nF);
    // phiếu cân: các cột cốt lõi trùng dữ liệu mẫu (ID phiếu suy ra từ số phiếu + ngày + xe → giống mọi bản cài)
    for (const s of ctx.seed.PHIEU_CAN) {
      const t = ctx.store.get('PHIEU_CAN', s.ticket_id);
      assert.ok(t, `thiếu phiếu ${s.ticket_key}`);
      for (const f of CORE) assert.equal(t[f], s[f], `${s.ticket_key}.${f}`);
    }
    // bảng kê dầu: trùng từng dòng, cùng mã GD-<bản cài>-00001… theo thứ tự file
    for (const s of ctx.seed.GIAO_NHAN_DAU) {
      const r = ctx.store.get('GIAO_NHAN_DAU', s.receipt_id);
      assert.ok(r, `thiếu ${s.receipt_id}`);
      for (const f of FUEL) assert.equal(r[f], s[f], `${s.receipt_id}.${f}`);
    }
    const out = calc(ctx.store, inst);
    assert.equal(out.canCalculate, true);
    const x = EXCEL[inst]; const r = out.results[0];
    assert.equal(r.tripCount, x['Số chuyến']); assert.equal(r.totalTon, x['Tổng KL (Tấn)']); assert.equal(r.actualFuelLiter, x['Dầu Diezel thực nhận']);
    assert.equal(r.fuelPrice, x['Đơn giá dầu']); assert.equal(r.fuelAdjustPrice, x['Đơn giá CL Diezel']); assert.equal(r.transportPrice, x['Đơn giá vận chuyển']);
    // lưu xong mở lại vẫn nguyên
    ctx.store.close();
    const again = new JsonStore(ctx.dir).open();
    assert.equal(again.all('PHIEU_CAN').length, nT); assert.equal(calc(again, inst).results[0].transportPrice, x['Đơn giá vận chuyển']);
    assert.equal(again.all('IMPORT_BATCH').filter((b) => b.status === 'CONFIRMED').length, 2);
    assert.equal(again.all('AUDIT_LOG').filter((a) => a.action === 'IMPORT_CONFIRM').length, 2);
    again.close();
  });
}

test('Cảnh báo thật khi import bảng kê dầu ĐH: 2 dòng nghi trùng (18/09, 92H-00192, 400 lít), 1 mã xe viết khác chuẩn; dấu cách thừa được bỏ', async () => {
  const ctx = await freshInstall('DH');
  await importBoth(ctx, 'DH').then(() => {});
  const b = ctx.store.all('GIAO_NHAN_DAU');
  assert.equal(b.filter((r) => r.validation_flags.includes('W_POSSIBLE_DUPLICATE')).length, 2);
  assert.deepEqual(b.filter((r) => r.validation_flags.includes('W_PLATE_FORMAT')).map((r) => r.fuel_vehicle_code), ['92H00195']);
  assert.ok(b.every((r) => r.fuel_vehicle_code === r.fuel_vehicle_code.trim()));
  assert.equal(b.filter((r) => r.plate_no === '92H-00192' && r.receive_date === '2026-09-18').length, 2, 'giữ cả 2 dòng (đã xác nhận không trùng)');
});

test('Import lại đúng file đó: nhận ra đã import, mọi dòng là TRÙNG (bỏ qua), không thêm gì', async () => {
  const ctx = await freshInstall('DH');
  await importBoth(ctx, 'DH');
  const pt = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH });
  assert.equal(pt.sameFileImportedBefore, true); assert.equal(pt.warnings[0].code, 'W_SAME_FILE_IMPORTED');
  assert.equal(pt.summary.duplicate, 77);
  const pf = await ctx.svc.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-DH-HAKQN', filePath: FILE.DH });
  assert.equal(pf.summary.duplicate, 16, 'cả 2 dòng 400 lít giống hệt cũng được ghép đúng 1-1');
  const c = await ctx.svc.confirm({ batchId: pf.batchId, acceptWarnings: true, clientRequestId: rid() });
  assert.equal(c.inserted, 0); assert.equal(ctx.store.all('GIAO_NHAN_DAU').length, 16);
});

test('Bản HAKQN import phiếu cân từ file ĐH: 77 phiếu đã có → TRÙNG; chỉ khác cột mô tả (nguồn gốc, khách hàng, LDĐ, Stt) → thông tin, giữ bản đang có', async () => {
  const ctx = await freshInstall('HAKQN');
  await importBoth(ctx, 'HAKQN');
  const p = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH });
  assert.equal(p.summary.duplicate, 77); assert.equal(p.summary.error, 0);
  const info = p.rows[0].issues.find((i) => i.code === 'W_TICKET_DESCRIPTIVE_DIFF');
  assert.ok(info && /origin/.test(info.message) && /ldd/.test(info.message), JSON.stringify(p.rows[0].issues));
});

test('Bảng kê dầu cho hợp đồng mà bản cài không phải bên VC → E_NOT_CARRIER', async () => {
  const ctx = await freshInstall('HAKQN');
  await assert.rejects(ctx.svc.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-DH-HAKQN', filePath: FILE.DH }), (e) => e.details?.code === 'E_NOT_CARRIER');
});

async function makeBadWorkbook(file) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Danh sách cân');
  ws.addRow(['BÁO CÁO DANH SÁCH CÁC LƯỢT XE ĐÃ CÂN']); ws.addRow([]);
  ws.addRow(['Stt', 'Số\n phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số 1', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Mã cự ly VC', 'Đơn vị VC', 'Cột lạ']);
  const d = new Date(Date.UTC(2026, 8, 25));
  ws.addRow([1, 9001, '25/09/2026', 0.5, d, '12:30', '43H-01080', 14000, 31470, '17.470', 'VC.007', 'Công ty TNHH Hoàng Anh Khôi', 'x']); // OK: ngày dạng chữ, giờ dạng số, KG kiểu VN
  ws.addRow([2, 9002, d, '08:00:00', d, '08:30:00', '43H-01080', 14000, 14000, 0, 'VC.007', '', '']);                                  // KG = 0
  ws.addRow([3, 9003, d, '08:00:00', d, '08:30:00', '43H01080', 14000, 31000, 17000, 'VC.007', '', '']);                               // sai định dạng biển số
  ws.addRow([4, 9004, d, '08:00:00', d, '08:30:00', '43H-01080', 14000, 31000, 17000, '', '', '']);                                     // thiếu mã tuyến
  ws.addRow([5, 9005, d, '08:00:00', d, '08:30:00', '43H-01080', 14000, 31000, 17000, 'VC.999', '', '']);                               // mã tuyến không có
  ws.addRow([6, 9006, d, '08:00:00', d, '08:30:00', '51C-12345', 14000, 31000, 17000, 'VC.007', '', '']);                               // xe chưa có trong danh mục
  ws.addRow([7, 9001, '25/09/2026', 0.5, d, '12:30', '43H-01080', 14000, 31470, 17470, 'VC.007', '', '']);                             // trùng dòng 4 trong file
  ws.addRow([8, 9008, '31/02/2026', '08:00', d, '08:30', '43H-01080', 14000, 31000, 17000, 'VC.007', '', '']);                        // ngày sai
  ws.addRow([9, 9009, d, '08:00:00', d, '08:30:00', '43H-01080', 14000, 31000, 17010, 'VC.007', 'Công ty TNHH SX TM DV Đại Hiệp', '']); // KL lệch + đơn vị khác chủ xe
  ws.addRow(['', '', '', '', '', '', '', '', 'TỔNG CỘNG', 99999]);
  await wb.xlsx.writeFile(file);
}

test('File xấu: tự dò tiêu đề ở dòng 3, đọc ngày/giờ/số kiểu Việt Nam, phát hiện đủ lỗi; còn lỗi thì không cho ghi; bỏ dòng lỗi thì ghi', async () => {
  const ctx = await freshInstall('HAKQN');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bad-')), 'can.xlsx');
  await makeBadWorkbook(f);
  const p = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: f });
  assert.equal(p.headerRowNo, 3);
  const byRow = Object.fromEntries(p.rows.map((r) => [r.rowNo, r]));
  const has = (rowNo, code) => byRow[rowNo].issues.some((i) => i.code === code);
  assert.equal(byRow[4].status, 'OK', JSON.stringify(byRow[4].issues));
  assert.equal(byRow[4].normalized.weigh1_date, '2026-09-25'); assert.equal(byRow[4].normalized.weigh1_time, '12:00:00');
  assert.equal(byRow[4].normalized.weigh2_time, '12:30:00'); assert.equal(byRow[4].normalized.net_kg, 17470);
  assert.ok(has(5, 'E_KG_INVALID')); assert.ok(has(6, 'E_PLATE_FORMAT')); assert.ok(has(7, 'E_ROUTE_MISSING')); assert.ok(has(8, 'E_ROUTE_NOT_FOUND'));
  assert.ok(has(9, 'E_VEHICLE_NOT_FOUND')); assert.ok(has(10, 'E_TICKET_DUPLICATE')); assert.ok(has(11, 'E_DATE_INVALID'));
  assert.ok(has(12, 'W_KG_MISMATCH')); assert.ok(has(12, 'W_OWNER_MISMATCH'));
  assert.equal(p.total, 9, 'dòng TỔNG CỘNG bị bỏ qua');
  assert.equal(p.summary.error, 7); assert.equal(p.summary.warning, 1);
  await assert.rejects(ctx.svc.confirm({ batchId: p.batchId, acceptWarnings: true, clientRequestId: rid() }), (e) => e.details?.code === 'E_IMPORT_HAS_ERRORS');
  await assert.rejects(ctx.svc.confirm({ batchId: p.batchId, skipRowNos: [5, 6, 7, 8, 9, 10, 11], clientRequestId: rid() }), (e) => e.code === 'VALIDATION_FAILED');
  const c = await ctx.svc.confirm({ batchId: p.batchId, skipRowNos: [5, 6, 7, 8, 9, 10, 11], acceptWarnings: true, clientRequestId: rid() });
  assert.equal(c.inserted, 2);
  assert.equal(ctx.store.get('IMPORT_BATCH', p.batchId).status, 'CONFIRMED');
});

test('Xem trước rồi dữ liệu thay đổi (lô khác vừa ghi) → xác nhận bị chặn E_PREVIEW_STALE', async () => {
  const ctx = await freshInstall('DH');
  const a = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH });
  const b = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE.DH });
  await ctx.svc.confirm({ batchId: b.batchId, acceptWarnings: true, clientRequestId: rid() });
  await assert.rejects(ctx.svc.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid() }), (e) => e.details?.code === 'E_PREVIEW_STALE');
  assert.equal(ctx.store.all('PHIEU_CAN').length, 77);
});

test('Bấm "Xác nhận" 2 lần (cùng clientRequestId) → chỉ ghi 1 lần', async () => {
  const ctx = await freshInstall('HAK');
  const p = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAK });
  const id = rid();
  const [x, y] = await Promise.all([ctx.svc.confirm({ batchId: p.batchId, acceptWarnings: true, clientRequestId: id }), ctx.svc.confirm({ batchId: p.batchId, acceptWarnings: true, clientRequestId: id })].map((pr) => pr.catch((e) => e)));
  const ok = [x, y].filter((v) => v && v.inserted === 100);
  assert.ok(ok.length >= 1);
  assert.equal(ctx.store.all('PHIEU_CAN').length, 100);
});

test('Thiếu cột bắt buộc → E_MAPPING_REQUIRED kèm danh sách cột; ghép tay thì chạy', async () => {
  const ctx = await freshInstall('HAKQN');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-'));
  const f = path.join(dir, 'x.csv');
  fs.writeFileSync(f, '﻿Số phiếu,Ngày cân,Giờ cân,Biển số,KG,Tuyến,Ngày ra\n573,18/09/2026,08:11:18,43H-01080,17470,VC.007,18/09/2026\n');
  await assert.rejects(ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: f }), (e) => e.details?.code === 'E_MAPPING_REQUIRED' && e.details.missing.includes('weigh1_date'));
  const mapping = { 'Số phiếu': 'ticket_no', 'Ngày cân': 'weigh1_date', 'Giờ cân': 'weigh1_time', 'Biển số': 'plate_no', KG: 'net_kg', 'Tuyến': 'route_code', 'Ngày ra': 'weigh2_date' };
  const p = await ctx.svc.preview({ importType: 'PHIEU_CAN', filePath: f, mapping });
  assert.equal(p.rows[0].status, 'OK', JSON.stringify(p.rows[0].issues));
  assert.equal(p.rows[0].normalized.ticket_id, loadDataFolder('HAKQN').rows.PHIEU_CAN[0].ticket_id);
});
