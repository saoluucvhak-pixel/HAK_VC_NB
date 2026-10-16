'use strict';
/**
 * Bước 14 — so sánh toàn bộ APP ↔ Excel (tools/compare-excel.js): mọi chỗ khác phải có giải thích theo 5 mục.
 * Nếu sau này sửa code làm lệch Excel ở chỗ chưa có quy tắc → test này báo "CHƯA GIẢI THÍCH".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareAll } = require('../tools/compare-excel');

test('APP ↔ Excel: không còn chênh lệch chưa giải thích; số tiền / đơn giá / KG / dầu khớp', async () => {
  const r = await compareAll();
  const bad = r.diffs.filter((d) => d.status === 'CHƯA GIẢI THÍCH');
  assert.equal(bad.length, 0, bad.slice(0, 5).map((d) => `${d.scope} ${d.inst} ${d.key} ${d.field}: APP ${d.app} ≠ Excel ${d.excel}`).join('\n'));
  assert.ok(r.summary.checks > 8000);
  const by = Object.fromEntries(r.groups.map((g) => [g.rule, g.count]));
  // 3 đơn giá + 16 chỉ tiêu QR_DGVC (2) × 3 file: không có chênh lệch nào
  assert.ok(r.qr.every((q) => q.ok), r.qr.filter((q) => !q.ok).map((q) => `${q.inst} ${q.field}`).join(', '));
  assert.deepEqual(r.qr.filter((q) => q.field === 'Đơn giá vận chuyển').map((q) => q.app), [178000, 88900, 125600]);
  // phiếu cân: đủ, khớp mọi cột trừ LDĐ (đã chốt) và khoảng trắng thừa
  assert.deepEqual(r.tickets.map((t) => [t.inst, t.excel, t.app, t.inPeriod, t.kgExcel === t.kgApp]), [['HAKQN', 326, 326, 326, true], ['DH', 77, 77, 77, true], ['HAK', 100, 100, 100, true]]);
  assert.equal(by.LDD_0726, 177);
  // dầu: tính hết bảng kê, kể cả dòng trước kỳ; giá dầu = trung bình cộng bảng kê
  for (const f of r.fuel) { assert.equal(f.inPeriod, f.lines); assert.equal(f.appLiters, f.liters); assert.ok(Math.abs(f.appFuelPrice - f.avgExcelRecalc) < 1e-9); }
  assert.deepEqual(r.fuel.map((f) => f.beforePeriod), [0, 2, 0]);
  // BKVC: chỉ lệch do làm tròn đồng / số thực / trình bày
  assert.equal(by.LAMTRON_VAT_DONG, 32); assert.equal(by.LAMTRON_TONG, 2); assert.equal(by.KIEUSO_THUC, 2);
  // mẫu cũ 11/2025: tổng sau VAT + VAT + bằng chữ trùng Excel
  assert.equal(r.oldBkTotals.app.total, r.oldBkTotals.excel.total); assert.equal(r.oldBkTotals.app.vat, r.oldBkTotals.excel.vat);
  assert.ok(!r.diffs.some((d) => d.scope === 'BK_MAU_CU' && /Bằng chữ|VAT|sau VAT/.test(d.field)));
  // file trạm cân: import được khi gán mã tuyến, 63 lượt = SUBTOTAL
  assert.equal(r.can.noFixedValues, 'E_MAPPING_REQUIRED'); assert.equal(r.can.rows, 63); assert.equal(r.can.summary.error, 0); assert.equal(r.can.summary.warning, 0);
  // còn đúng các điểm chờ người dùng xác nhận
  // tên bên thuê in theo "Tên ghi trên chứng từ" (đổi được) → trùng Excel; diễn giải hóa đơn của xe 43H-01055 trùng từng chữ BKVC!C37
  assert.ok(!r.diffs.some((d) => d.scope !== 'QR_DGVC' || d.inst === 'HAKQN' ? /^Tên bên/.test(d.field) : false));
  assert.equal(r.invoice.plate, '43H-01055'); assert.equal(r.invoice.lines, 17);
  assert.equal(r.invoice.app, 'Vận chuyển dăm gỗ từ nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng đến Cảng Tiên Sa Đà Nẵng bằng xe thùng biển kiểm soát: 43H01055', 'theo mẫu hóa đơn MISA thật');
  // không còn điểm nào chờ người dùng xác nhận (chốt 25/09/2026: người ký theo thứ tự ưu tiên)
  assert.deepEqual(r.groups.filter((g) => g.status === 'CẦN XÁC NHẬN').map((g) => g.rule), []);
});
