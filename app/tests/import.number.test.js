'use strict';
/**
 * F1 — số dạng CHỮ có dấu . , phải đọc đúng hoặc bị chặn, không được ghi sai 1.000 lần mà không báo:
 *  - "17,470" (1–3 chữ số + phẩy + đúng 3 chữ số) đọc được 17,47 (kiểu Việt) hoặc 17.470 (kiểu Anh) → AUTO báo lỗi E_NUMBER_AMBIGUOUS;
 *  - người dùng chọn "kiểu số trong file" (VN / EN) → đọc theo đó;
 *  - KL hàng < 1.000 kg → cảnh báo W_KG_IMPLAUSIBLE.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../main/import/mapping');
const { install } = require('./install');
const { ImportService } = require('../main/import/ImportService');

test('toNumber: các dạng số dạng chữ (AUTO / VN / EN)', () => {
  const v = (s, st) => M.toNumber(s, st);
  // chắc chắn, không đổi so với trước
  assert.equal(v('17.470').value, 17470); assert.equal(v('1.234,5').value, 1234.5); assert.equal(v('5088,35').value, 5088.35);
  assert.equal(v('1,234,567').value, 1234567); assert.equal(v('1,234,567.89').value, 1234567.89); assert.equal(v('0,5').value, 0.5); assert.equal(v('17470').value, 17470);
  assert.equal(v(17470).value, 17470); assert.equal(v('').value, ''); assert.equal(v(null).value, '');
  // mơ hồ: d,ddd → không đoán
  for (const s of ['17,470', '13,810', '1,234', '0,500', '-17,470']) { const r = v(s); assert.ok(Array.isArray(r.ambiguous), `"${s}" phải bị coi là mơ hồ`); assert.equal(r.value, undefined); }
  assert.deepEqual(v('17,470').ambiguous, [17.47, 17470]);
  // chọn kiểu số
  assert.equal(v('17,470', 'EN').value, 17470); assert.equal(v('17,470', 'VN').value, 17.47);
  assert.equal(v('17.470', 'VN').value, 17470); assert.equal(v('17.470', 'EN').value, 17.47);
  assert.equal(v('1,234,567.5', 'EN').value, 1234567.5); assert.equal(v('1.234.567,5', 'VN').value, 1234567.5);
  assert.ok(v('abc').error);
});

const HDR = ['Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Biển số', 'Cân lần 1', 'Cân lần 2', 'KL hàng (kg)', 'Mã tuyến'];
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
function csv(dir, name, rows) { const f = path.join(dir, name); fs.writeFileSync(f, `﻿${[HDR, ...rows].map((r) => r.map(q).join(',')).join('\n')}`); return f; }
const row = (no, plate, w1, w2, net) => [no, '2026-09-30', '08:00:00', '2026-09-30', '09:00:00', plate, w1, w2, net, 'VC.007'];

test('Import phiếu cân: "17,470" bị chặn (mơ hồ) rồi chọn kiểu số thì đọc đúng; KL nhỏ bất thường bị cảnh báo', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-num-'));
  const imp = new ImportService(store);
  const plate = store.find('HOP_DONG_XE', (v) => v.contract_id === 'HD-HAKQN-QS')[0].plate_no;
  const f = csv(dir, 'a.csv', [
    row('N1', plate, '13,810', '31,280', '17,470'),   // chữ kiểu Anh
    row('N2', plate, 13810, 31280, 17470),             // số thật
    row('N3', plate, '13.810', '31.280', '17.470'),    // chữ kiểu Việt
    row('N4', plate, 100, 600, 500),                   // KL 500 kg: nhỏ bất thường
  ]);
  const rowsOf = async (o) => { const pv = await imp.preview({ importType: 'PHIEU_CAN', filePath: f, user: 't', ...o }); return { pv, rows: imp.previewRows({ batchId: pv.batchId, pageSize: 50 }).rows }; };
  const byNo = (rows, no) => rows.find((r) => r.normalized.ticket_no === no);

  // AUTO: N1 bị chặn (không ghi sai âm thầm); N2, N3 đọc đúng; N4 cảnh báo
  let { pv, rows } = await rowsOf({});
  assert.equal(pv.numberStyle, 'AUTO');
  const n1 = byNo(rows, 'N1'); assert.equal(n1.status, 'ERROR'); assert.ok(n1.issues.some((i) => i.code === 'E_NUMBER_AMBIGUOUS'), 'N1 phải báo mơ hồ');
  assert.equal(byNo(rows, 'N2').status, 'OK'); assert.equal(byNo(rows, 'N2').normalized.net_kg, 17470);
  assert.equal(byNo(rows, 'N3').status, 'OK'); assert.equal(byNo(rows, 'N3').normalized.net_kg, 17470);
  assert.ok(byNo(rows, 'N4').issues.some((i) => i.code === 'W_KG_IMPLAUSIBLE')); assert.equal(byNo(rows, 'N4').status, 'WARNING');
  // dòng lỗi mơ hồ không thể xác nhận nếu không bỏ dòng
  await assert.rejects(() => imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: 'x1', user: 't' }), (e) => e.code === 'BUSINESS_RULE' || /dòng lỗi/.test(e.message));
  await imp.cancel({ batchId: pv.batchId, user: 't' });

  // EN: "17,470" = 17.470 kg-nghìn → 17470
  ({ pv, rows } = await rowsOf({ numberStyle: 'EN' }));
  assert.equal(byNo(rows, 'N1').status, 'OK'); assert.equal(byNo(rows, 'N1').normalized.net_kg, 17470); assert.equal(byNo(rows, 'N1').normalized.weight1_kg, 13810);
  assert.equal(byNo(rows, 'N3').normalized.net_kg, 17.47, 'kiểu EN: "17.470" là 17,47 (người dùng đã chọn kiểu EN)');
  await imp.cancel({ batchId: pv.batchId, user: 't' });

  // VN: "17,470" = 17,47 → KL nhỏ bất thường → cảnh báo (không im lặng)
  ({ pv, rows } = await rowsOf({ numberStyle: 'VN' }));
  assert.equal(byNo(rows, 'N1').normalized.net_kg, 17.47); assert.ok(byNo(rows, 'N1').issues.some((i) => i.code === 'W_KG_IMPLAUSIBLE'), 'đọc ra 17,47 kg phải bị cảnh báo');
  await imp.cancel({ batchId: pv.batchId, user: 't' });
  await assert.rejects(() => imp.preview({ importType: 'PHIEU_CAN', filePath: f, numberStyle: 'XX', user: 't' }), /numberStyle/);
  store.close();
});

test('Import dầu: số lít / đơn giá dạng chữ "385,500" bị báo mơ hồ', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-numf-'));
  const imp = new ImportService(store);
  const f = path.join(dir, 'd.csv');
  const H = ['Ngày nhận dầu', 'Mã tuyến', 'Biển số xe', 'ĐVT', 'Số lượng (lít)', 'Đơn giá dầu', 'Đơn vị'];
  const plate = store.find('HOP_DONG_XE', (v) => v.contract_id === 'HD-HAKQN-QS')[0].plate_no;
  fs.writeFileSync(f, `﻿${[H, ['2026-09-20', 'VC.007', plate, 'LÍT', '385,500', '29940', 'CNHAK'], ['2026-09-20', 'VC.007', plate, 'LÍT', '385', '29,940', 'CNHAK']].map((r) => r.map(q).join(',')).join('\n')}`);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-HAKQN-QS', filePath: f, user: 't' });
  const rows = imp.previewRows({ batchId: pv.batchId, pageSize: 10 }).rows;
  assert.ok(rows[0].issues.some((i) => i.code === 'E_NUMBER_AMBIGUOUS'), 'số lít "385,500" mơ hồ');
  assert.ok(rows[1].issues.some((i) => i.code === 'E_NUMBER_AMBIGUOUS'), 'đơn giá "29,940" mơ hồ');
  await imp.cancel({ batchId: pv.batchId, user: 't' });
  const pv2 = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: 'HD-HAKQN-QS', filePath: f, numberStyle: 'EN', user: 't' });
  const r2 = imp.previewRows({ batchId: pv2.batchId, pageSize: 10 }).rows;
  assert.equal(r2[0].normalized.qty_liter, 385500); assert.equal(r2[1].normalized.fuel_price_excl_vat, 29940);
  store.close();
});
