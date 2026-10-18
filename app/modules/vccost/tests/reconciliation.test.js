'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { matchRows } = require('../src/services/ReconciliationService');
const { createApp, SEED_DIR } = require('../src/app');

const A = (id, so, bs, ngay, kl, gia, tien) => ({ id, so_phieu: so, bien_so_chuan: bs, ngay_can: ngay, kl_hang_kg: kl, don_gia: gia, tien_truoc_vat: tien, tien_vat: tien * 0.08, tong_tien: tien * 1.08 });

test('matchRows: khớp, lệch nhiều cột (báo đủ, kết quả = nghiêm trọng nhất), thiếu A/B, trùng B', () => {
  const a = [A(1, '100', '43H01021', '2026-09-29', 20000, 206500, 4130000), A(2, '101', '43H01021', '2026-09-30', 20000, 206500, 4130000), A(3, '102', '43H01055', '2026-09-30', 10000, 206500, 2065000), A(4, '103', '43H01055', '2026-10-01', 10000, 206500, 2065000)];
  const b = [
    { idx: 0, so_phieu: '100', kl_hang_kg: 20000, don_gia: 206500, tien_truoc_vat: 4130000 },                 // KHOP
    { idx: 1, so_phieu: '101', kl_hang_kg: 20100, don_gia: 206500, tien_truoc_vat: 4150650 },                 // lệch KL + tiền
    { idx: 2, so_phieu: '999', bien_so_chuan: null, kl_hang_kg: 1 },                                          // không có bên A
    { idx: 3, so_phieu: '103', kl_hang_kg: 10000 }, { idx: 4, so_phieu: '103', kl_hang_kg: 10000 },          // trùng B
  ];
  const r = matchRows(a, b, { tolKg: 0, tolMoney: 1 });
  const by = (so) => r.filter((x) => (x.b && x.b.so_phieu === so) || (!x.b && x.a.so_phieu === so));
  assert.equal(by('100')[0].ket_qua, 'KHOP');
  const l = by('101')[0];
  assert.equal(l.ket_qua, 'LECH_KHOI_LUONG');
  assert.deepEqual(l.diffs.map((d) => d.cot), ['kl_hang_kg', 'tien_truoc_vat']);
  assert.equal(by('999')[0].ket_qua, 'THIEU_BEN_A');
  assert.equal(by('103').filter((x) => x.ket_qua === 'TRUNG_DU_LIEU').length, 2);
  assert.equal(by('102')[0].ket_qua, 'THIEU_BEN_B');
  assert.equal(r.filter((x) => x.ket_qua === 'THIEU_BEN_B').length, 2);   // A 102 và A 103 (B trùng nên không tự ghép)
});

test('matchRows: B không có số phiếu → khớp biển số + ngày + KL; nhiều ứng viên → CAN_KIEM_TRA', () => {
  const a = [A(1, '1', '43H01021', '2026-09-29', 20000, 1, 1), A(2, '2', '43H01055', '2026-09-29', 18000, 1, 1), A(3, '3', '43H01055', '2026-09-29', 18000, 1, 1)];
  const r = matchRows(a, [{ idx: 0, bien_so_chuan: '43H01021', ngay: '2026-09-29', kl_hang_kg: 20000 }, { idx: 1, bien_so_chuan: '43H01055', ngay: '2026-09-29', kl_hang_kg: 18000 }], {});
  assert.equal(r.find((x) => x.b.idx === 0).khoa_khop, 'BIEN_SO_NGAY_KL');
  assert.equal(r.find((x) => x.b.idx === 0).ket_qua, 'KHOP');
  assert.equal(r.find((x) => x.b.idx === 1).ket_qua, 'CAN_KIEM_TRA');
});

test('đối chiếu end-to-end: bảng kê đối tác tạo từ hệ thống + 4 lỗi cài sẵn', async () => {
  const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'sample-v47.json'), 'utf8'));
  const app = createApp({ dbFile: ':memory:', driver: 'node:sqlite' });
  app.seed.load(seed);
  const SAMPLE = path.join(__dirname, 'fixtures', 'sample-v47.xlsx');
  const pv = app.vehicleImport.preview({ filePath: SAMPLE }); app.vehicleImport.commit(pv.token);
  const o = app.imports.open({ filePath: SAMPLE }); const si = app.imports.sheetInfo(o.token, o.suggestedSheet);
  app.imports.preview(o.token, { sheetName: si.sheetName, headerRow: si.headerRow, mapping: si.mapping }); app.imports.commit(o.token, {});
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`).id;
  const t = app.reports.tickets({ don_vi_id: hak }, { offset: 0, limit: 1000 }).rows;
  assert.equal(t.length, 107);
  // file đối tác
  const rows = [['STT', 'Số phiếu', 'Biển số', 'Ngày', 'KL (kg)', 'Đơn giá', 'Thành tiền']];
  t.forEach((x, i) => rows.push([i + 1, x.so_phieu, x.bien_so, x.ngay_can, x.kl_hang_kg, x.don_gia, x.tien_truoc_vat]));
  rows[2][4] += 100;                 // lệch KL (+ lệch tiền vì giữ nguyên tiền)
  rows[3][5] = 200000;               // lệch đơn giá
  rows.splice(4, 1);                 // thiếu bên B
  rows.push([200, '999999', '43H-99999', '2026-10-01', 15000, 206500, 3097500]);  // thiếu bên A
  const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'BangKe');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const op = app.recon.open({ buffer, fileName: 'hak.xlsx' });
  const info = app.recon.sheetInfo(op.token, op.suggestedSheet);
  assert.ok(['so_phieu', 'bien_so', 'ngay', 'kl_hang_kg', 'don_gia', 'tien_truoc_vat'].every((k) => info.mapping[k] !== undefined), JSON.stringify(info.mapping));
  const r = app.recon.run(op.token, { ten: 'HAK V47', don_vi_id: hak, sheetName: info.sheetName, headerRow: info.headerRow, mapping: info.mapping, tolMoney: 1 });
  assert.equal(r.soA, 107); assert.equal(r.soB, 107);          // 107 - 1 + 1
  assert.equal(r.counts.KHOP, 104);
  assert.equal(r.counts.LECH_KHOI_LUONG, 1); assert.equal(r.counts.LECH_DON_GIA, 1);
  assert.equal(r.counts.THIEU_BEN_A, 1); assert.equal(r.counts.THIEU_BEN_B, 1);
  const res = app.recon.results(r.batchId, { ket_qua: 'LECH_KHOI_LUONG' });
  assert.equal(res.rows[0].diffs[0].chenh, -100);
  // cờ trên phiếu A + cảnh báo + xử lý + audit
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE don_vi_van_chuyen_id=? AND trang_thai_doi_chieu='KHOP'`, [hak]).n, 104);
  assert.equal(app.alerts.list({ loai: 'UNMATCHED_RECONCILIATION' }).total, 1);
  app.recon.resolve(res.rows[0].id, 'CHAP_NHAN_A', 'Trạm cân đúng');
  assert.equal(app.recon.results(r.batchId, { ket_qua: 'LECH_KHOI_LUONG' }).rows[0].xu_ly, 'CHAP_NHAN_A');
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM audit_log WHERE action='RECONCILE_RESOLVE'`).n, 1);
  // đối chiếu không sửa phiếu cân
  assert.equal(app.reports.statement({ don_vi_id: hak }).tong_tien, 416454167);

  // ---- đối chiếu khối lượng 2 bên theo xe + in kèm bảng kê
  const w = app.recon.weightByVehicle(r.batchId);
  const aKg = t.reduce((a, x) => a + x.kl_hang_kg, 0);
  const removed = t[3].kl_hang_kg;
  assert.equal(w.tot.a_kg, aKg - 0 - (0));                               // A đủ 107 phiếu
  assert.equal(w.tot.b_kg - w.tot.a_kg, 100 - removed + 15000);          // +100 lệch, −phiếu thiếu B, +15000 phiếu thiếu A
  assert.equal(w.counts.CHI_BEN_B, 1);                                     // 43H-99999 chỉ Bên B có
  assert.ok(w.counts.LECH >= 1 && w.counts.KHOP > 0);
  assert.ok(w.rows.find((x) => x.ket_luan === 'CHI_BEN_B').a_chuyen === 0);
  // thông tin Bên B (danh mục mở rộng) + bảng kê có sheet đối chiếu
  app.catalog.update('don_vi_van_chuyen', hak, { dai_dien: 'Trần Văn B', chuc_vu: 'Giám đốc', ke_toan: 'Lê Thị C', so_hop_dong: '12/2026/HĐVC', ngay_hop_dong: '2026-01-05', ten_in_bao_cao: 'CÔNG TY CP HAK', noi_ky: 'Quảng Ngãi' });
  app.settings.set('company', { ten: 'CÔNG TY A', dai_dien: 'Nguyễn Văn A', nguoi_lap: 'Phạm Kế Toán' });
  const documents = require('../src/print/documents'), tpl = require('../src/print/htmlTemplates'), ex = require('../src/excel/exporters');
  const d = documents.statementDoc(app, { don_vi_id: hak }, { reconBatchId: r.batchId });
  assert.equal(d.benB.ten, 'CÔNG TY CP HAK'); assert.ok(d.contract.includes('12/2026/HĐVC') && d.contract.includes('05/01/2026'));
  const html = tpl.statementHtml(d);
  for (const k of ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'BIÊN BẢN ĐỐI CHIẾU KHỐI LƯỢNG', 'Trần Văn B', 'Lê Thị C', 'CÔNG TY CP HAK', '43H-99999']) assert.ok(html.includes(k), k);
  const ExcelJS = require('exceljs'); const wbk = new ExcelJS.Workbook(); await wbk.xlsx.load(await ex.statementWorkbook(d));
  assert.deepEqual(wbk.worksheets.map((x) => x.name), ['Bảng kê', 'Chi tiết theo xe', 'Đối chiếu khối lượng', 'Phụ lục phiếu cân']);
  // không chọn lô đối chiếu → không có sheet/phần đối chiếu
  const d0 = documents.statementDoc(app, { don_vi_id: hak });
  assert.equal(d0.recon, null); assert.ok(!tpl.statementHtml(d0).includes('BIÊN BẢN ĐỐI CHIẾU'));
});
