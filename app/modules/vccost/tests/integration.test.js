'use strict';
/** Kiểm thử end-to-end trên DB thật (node:sqlite) với file Excel mẫu V.47. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp, SEED_DIR } = require('../src/app');

const SAMPLE = path.join(__dirname, 'fixtures', 'sample-v47.xlsx');
const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'sample-v47.json'), 'utf8'));

function setup() {
  const app = createApp({ dbFile: ':memory:', driver: 'node:sqlite' });
  app.seed.load(seed);
  return app;
}
function importVehicles(app) {
  const pv = app.vehicleImport.preview({ filePath: SAMPLE });
  return { pv, res: app.vehicleImport.commit(pv.token) };
}
function importTickets(app, opts = {}) {
  const o = app.imports.open({ filePath: SAMPLE });
  const si = app.imports.sheetInfo(o.token, o.suggestedSheet);
  const dot = app.db.get(`SELECT id FROM dot_van_chuyen WHERE ma_dot='PON-V47'`);
  const pv = app.imports.preview(o.token, { sheetName: si.sheetName, headerRow: si.headerRow, mapping: si.mapping, dotId: dot.id });
  return { o, si, pv, dot, commit: () => app.imports.commit(o.token, opts) };
}

test('seed: bảng giá điều chỉnh dầu sinh đúng qua kỳ điều chỉnh (gồm Quế Sơn suy ngược)', () => {
  const app = setup();
  const r = app.db.all(`SELECT ma_bang_gia, tu_ngay, den_ngay, don_gia_ap_dung/1000 gia FROM bang_gia_van_chuyen ORDER BY ma_bang_gia`);
  const m = Object.fromEntries(r.map((x) => [x.ma_bang_gia, x]));
  assert.equal(m['DH-TIENSA-2026-09-18'].gia, 116700);
  assert.equal(m['DN-TIENSA-2026-09-18'].gia, 85300);
  assert.equal(m['QC-TIENSA-2026-09-18'].gia, 155200);
  assert.equal(m['QS-TIENSA-2026-09-18'].gia, 206500);
  assert.equal(m['DH-TIENSA-2025-04'].den_ngay, '2026-09-17');   // bảng cũ tự đóng
  assert.equal(m['QS-TIENSA-2025-11'].gia, 173000);
});

test('import danh mục xe từ sheet "Số xe"', () => {
  const app = setup();
  const { pv, res } = importVehicles(app);
  assert.equal(pv.sheet, 'Số xe');
  assert.equal(pv.counts.NEW, 220);
  assert.equal(res.created, 220);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM xe_don_vi_lich_su').n, 220);
  // import lại: không tạo trùng
  const pv2 = app.vehicleImport.preview({ filePath: SAMPLE });
  assert.equal(pv2.counts.SAME, 220);
});

test('import phiếu cân end-to-end: preview không ghi DB, commit, bảng kê khớp Excel', () => {
  const app = setup(); importVehicles(app);
  const { o, si, pv, commit } = importTickets(app);
  assert.equal(o.suggestedSheet, 'File tổng');
  assert.equal(si.headerRow, 3);
  assert.equal(pv.counts.total, 2035);
  assert.equal(pv.counts.new, 2035);
  assert.equal(pv.counts.noPrice + pv.counts.unknownVehicle + pv.counts.unknownLocation, 0);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM phieu_can').n, 0, 'preview không được ghi DB');
  const c = commit();
  assert.equal(c.inserted, 2035);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE trang_thai_tinh_gia='OK'`).n, 2035);

  const byCarrier = Object.fromEntries(app.reports.statements({}).map((s) => [s.don_vi.ma, s]));
  assert.equal(byCarrier.HHH.tong_tien, 4074119881);
  assert.equal(byCarrier.HAK.tong_tien, 416454167);
  assert.equal(byCarrier.QC.tong_tien, 624215138);
  assert.equal(byCarrier['ĐH'].tong_tien, 398115232);
  const sum = Object.values(byCarrier).reduce((a, s) => a + s.tong_tien, 0);
  assert.ok(Math.abs(sum - 5512904418.24) < 1, 'tổng bảng kê ≈ Excel K2048');
  assert.equal(byCarrier.HHH.lines.length, 2);              // ĐH 116.700 + QS 206.500
  assert.equal(byCarrier.HHH.so_chuyen, 1668);

  const veh = app.reports.byVehicle({ bien_so: '43H-25314' });
  assert.equal(veh.length, 1);
  const tl = app.reports.timeline('92H-00903');
  assert.ok(tl.some((t) => t.flags.includes('REVERSE_WEIGHING')));
  const open = app.alerts.list({ trang_thai: 'MOI' });
  assert.ok(open.summary.some((s) => s.loai === 'TIME_ANOMALY'));
});

test('import lại cùng file: 0 phiếu mới; có cảnh báo file đã import', () => {
  const app = setup(); importVehicles(app);
  importTickets(app).commit();
  const second = importTickets(app);
  assert.ok(second.o.previouslyImported);
  assert.equal(second.pv.counts.new, 0);
  assert.equal(second.pv.counts.exact, 2035);
  const c = second.commit();
  assert.equal(c.inserted, 0);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE trang_thai='ACTIVE'`).n, 2035);
});

test('trùng khóa khác dữ liệu → Cần kiểm tra; Cập nhật dữ liệu mới; hoàn tác batch', () => {
  const app = setup(); importVehicles(app);
  importTickets(app).commit();
  // sửa 1 dòng trong file (KL) bằng CSV
  const csv = 'Số phiếu;Ngày giờ cân 1;Ngày giờ cân 2;Biển số;Cân lần 1;Cân lần 2;KL hàng (KG);Nơi xuất\n' +
              '1387;28/09/2026 13:16:04;28/09/2026 14:21:08;92C-07938;14510;34610;20100;Quế Sơn\n' +
              '99999;05/10/2026 08:00:00;05/10/2026 08:30:00;99Z-99999;14000;33000;19000;Quế Sơn\n';
  const o = app.imports.open({ buffer: Buffer.from(csv, 'utf8'), fileName: 'sua.csv' });
  const si = app.imports.sheetInfo(o.token, o.sheets[0].name);
  const pv = app.imports.preview(o.token, { sheetName: si.sheetName, headerRow: si.headerRow, mapping: si.mapping });
  assert.equal(pv.counts.conflict, 1);
  assert.equal(pv.counts.new, 1);
  assert.equal(pv.counts.unknownVehicle, 1);
  const c = app.imports.commit(o.token, {});
  const pend = app.imports.pendingReviews();
  assert.equal(pend.length, 1);
  assert.deepEqual(pend[0].diffs.map((d) => d.field).sort(), ['can_lan_2', 'kl_hang_kg']);
  // phiếu mới với xe lạ: không tự gán đơn vị
  const lạ = app.db.get(`SELECT * FROM phieu_can WHERE so_phieu='99999'`);
  assert.equal(lạ.trang_thai_tinh_gia, 'UNKNOWN_VEHICLE');
  assert.equal(lạ.don_vi_van_chuyen_id, null);
  // gán xe vào đơn vị → phiếu tự tính lại
  const xe = app.catalog.create('xe', { bien_so_hien_thi: '99z 99999' });
  const qc = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='QC'`);
  app.catalog.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: qc.id }, { parentId: xe.id });
  assert.equal(app.db.get(`SELECT trang_thai_tinh_gia s, don_gia/1000 g FROM phieu_can WHERE so_phieu='99999'`).s, 'OK');
  // cập nhật dữ liệu mới
  app.imports.resolveReview(pend[0].id, 'UPDATE', 'Trạm cân gửi lại');
  assert.equal(app.db.get(`SELECT kl_hang_kg FROM phieu_can WHERE so_phieu='1387'`).kl_hang_kg, 20100);
  // hoàn tác batch: phiếu mới VOID, phiếu cập nhật trả về cũ
  const u = app.imports.undoBatch(c.batchId, 'Nhập nhầm file');
  assert.equal(u.voided, 1); assert.equal(u.restored, 1);
  assert.equal(app.db.get(`SELECT kl_hang_kg FROM phieu_can WHERE so_phieu='1387'`).kl_hang_kg, 20090);
  assert.equal(app.db.get(`SELECT trang_thai FROM phieu_can WHERE so_phieu='99999'`).trang_thai, 'VOID');
  assert.ok(app.audit.list({ action: 'UNDO_IMPORT' }).total === 1);
});

test('preview lỗi: thiếu mapping bắt buộc', () => {
  const app = setup();
  const o = app.imports.open({ filePath: SAMPLE });
  assert.throws(() => app.imports.preview(o.token, { sheetName: 'File tổng', headerRow: 3, mapping: { so_phieu: 1 } }), /Mapping/);
});

test('danh mục: không xóa đơn vị đang dùng; lịch sử xe tự đóng phiên bản; bảng giá đã dùng không sửa được', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const hhh = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HHH'`);
  assert.throws(() => app.catalog.remove('don_vi_van_chuyen', hhh.id), /INACTIVE/);
  const xe = app.db.get(`SELECT id FROM xe WHERE bien_so_chuan='43H01021'`);
  const qc = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='QC'`);
  app.catalog.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: qc.id, tu_ngay: '2026-10-02' }, { parentId: xe.id });
  const h = app.catalog.list('xe_don_vi_lich_su', { parentId: xe.id });
  assert.equal(h.length, 2);
  assert.equal(h.find((x) => x.tu_ngay === null).den_ngay, '2026-10-01');
  // phiếu của xe 43H-01021 từ 02/10 chuyển sang QC
  const r = app.db.all(`SELECT p.ngay_can, d.ma FROM phieu_can p JOIN don_vi_van_chuyen d ON d.id=p.don_vi_van_chuyen_id WHERE p.bien_so_chuan='43H01021'`);
  assert.ok(r.filter((x) => x.ngay_can >= '2026-10-02').every((x) => x.ma === 'QC'));
  assert.ok(r.filter((x) => x.ngay_can < '2026-10-02').every((x) => x.ma === 'HAK'));
  const bg = app.db.get(`SELECT id FROM bang_gia_van_chuyen WHERE ma_bang_gia='DH-TIENSA-2026-09-18'`);
  assert.throws(() => app.catalog.update('bang_gia_van_chuyen', bg.id, { don_gia_goc: 120000 }), /tạo bảng giá mới/);
});

test('giá thay đổi giữa đợt: bảng giá mới từ 02/10 → phiếu từ 02/10 tính giá mới', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const t = app.db.get(`SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen='DH-TIENSA'`);
  app.price.createVersion({ tuyen_id: t.id, tu_ngay: '2026-10-02', don_gia: 120000, phuong_thuc: 'CO_DINH' });
  const g = app.db.all(`SELECT DISTINCT ngay_can >= '2026-10-02' sau, don_gia/1000 gia FROM phieu_can WHERE tuyen_id=?`, [t.id]);
  assert.deepEqual(g.map((x) => [x.sau, x.gia]).sort(), [[0, 116700], [1, 120000]]);
  assert.ok(app.alerts.list({ loai: 'PRICE_CHANGED' }).total > 0);
});

test('bảng giá: chỉ nhập thông số, đơn giá áp dụng TỰ TÍNH theo công thức Excel; không nhận giá nhập tay', () => {
  const app = setup();
  const t = app.db.get(`SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen='DH-TIENSA'`);
  const cur = app.price.activeRule(t.id, '2026-10-01');
  assert.equal(cur.phuong_thuc, 'DIEU_CHINH_DAU');
  // đổi km → đơn giá tự tính lại; giá áp dụng gửi tay bị bỏ qua
  const id = app.price.createVersion({ tuyen_id: t.id, tu_ngay: '2026-10-05', khoang_cach_km: cur.khoang_cach_km + 10 });
  const n = app.catalog.get('bang_gia_van_chuyen', id);
  const { computeFuelAdjustment } = require('../src/services/FuelAdjustmentService');
  const exp = computeFuelAdjustment({ basePrice: cur.don_gia_goc, baseFuelPrice: cur.gia_dau_co_so, currentFuelPrice: cur.gia_dau_ap_dung, distanceKm: cur.khoang_cach_km + 10, fuelNormPer100km: cur.dinh_muc_dau, avgTonPerTrip: cur.khoi_luong_binh_quan });
  assert.equal(n.don_gia_ap_dung, exp.appliedPrice);
  const c = app.catalog.create('bang_gia_van_chuyen', { ma_bang_gia: 'X1', tuyen_id: t.id, tu_ngay: '2027-01-01', phuong_thuc: 'CO_DINH', don_gia_goc: 150000, don_gia_ap_dung: 999, vat_percent: 8 });
  assert.equal(c.don_gia_ap_dung, 150000);
  assert.throws(() => app.catalog.create('bang_gia_van_chuyen', { ma_bang_gia: 'X2', tuyen_id: t.id, tu_ngay: '2027-02-01', phuong_thuc: 'DIEU_CHINH_DAU', don_gia_goc: 150000, vat_percent: 8 }), /cần nhập/);
});

test('bảng tính đơn giá: từng bước khớp Excel, giả định giá dầu, xuất Excel, áp dụng thành bảng giá mới', async () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const sh = app.price.priceSheet({ ngay: '2026-10-01' });
  const r = sh.rows.find((x) => x.ma_tuyen === 'DH-TIENSA');
  assert.equal(r.gia_moi, 116700); assert.equal(r.lit_chuyen, r.km * 35 / 100);
  const sim = app.price.priceSheet({ ngay: '2026-10-01', gia_dau: r.gia_dau_ap_dung + 1000 }).rows.find((x) => x.ma_tuyen === 'DH-TIENSA');
  assert.ok(sim.gia_moi > r.gia_moi);
  const buf = await require('../src/excel/exporters').priceSheetWorkbook(sh);
  assert.ok(buf.length > 2000);
  const res = app.price.applySheet({ ngay_ap_dung: '2026-10-08', gia_dau: r.gia_dau_ap_dung + 1000 });
  assert.ok(res.created > 0);
  assert.equal(app.price.activeRule(r.tuyen_id, '2026-10-08').don_gia_ap_dung, sim.gia_moi);
});

test('xóa bảng giá: có phiếu dùng → CHẶN + cảnh báo; chưa có phiếu → xóa được và mở lại bảng trước', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const t = app.db.get(`SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen='DH-TIENSA'`);
  const used = app.price.activeRule(t.id, '2026-10-01');
  assert.throws(() => app.price.removeRule(used.id), /đang có \d+ phiếu sử dụng/);
  const id = app.price.createVersion({ tuyen_id: t.id, tu_ngay: '2027-03-01', don_gia: 120000, phuong_thuc: 'CO_DINH' });
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=?`, [id]).n, 0);
  assert.ok(app.price.removeRule(id).mo_lai);
  assert.equal(app.price.activeRule(t.id, '2027-06-01').den_ngay, null);
});

test('giá dầu: import từ file (mới/giữ/ghi đè), xóa & sửa giá dầu, xóa kỳ nháp', () => {
  const app = setup();
  app.db.run('DELETE FROM gia_dau');
  const pv = app.fuelImport.preview({ filePath: require('path').join(__dirname, 'fixtures/sample-v47.xlsx') });
  assert.equal(pv.counts.NEW, 6);
  const r1 = app.fuelImport.commit(pv.token);
  assert.equal(r1.created, 6);
  const pv2 = app.fuelImport.preview({ filePath: require('path').join(__dirname, 'fixtures/sample-v47.xlsx') });
  assert.equal(pv2.counts.SAME, 6); assert.equal(pv2.counts.NEW, undefined);
  const row = app.catalog.list('gia_dau')[0];
  app.catalog.update('gia_dau', row.id, { gia: 99999 });
  const pv3 = app.fuelImport.preview({ filePath: require('path').join(__dirname, 'fixtures/sample-v47.xlsx') });
  assert.equal(pv3.counts.CHANGED, 1);
  assert.equal(app.fuelImport.commit(pv3.token, { overwrite: false }).updated, 0);
  const pv4 = app.fuelImport.preview({ filePath: require('path').join(__dirname, 'fixtures/sample-v47.xlsx') });
  assert.equal(app.fuelImport.commit(pv4.token, { overwrite: true }).updated, 1);
  assert.equal(app.catalog.get('gia_dau', row.id).gia, 31640);
  app.catalog.remove('gia_dau', row.id);
  assert.equal(app.catalog.list('gia_dau').length, 5);
  const ky = app.price.createFuelPeriod({ ma_ky: 'T1', loai_dau: 'DO 0,05S-II', tu_ngay_tham_chieu: '2026-09-18', den_ngay_tham_chieu: '2026-09-23', ngay_ap_dung: '2026-09-25' });
  assert.ok(app.price.removeFuelPeriod(ky).ok);
});

test('chứng từ in: bảng kê Excel/PDF có Bên A/Bên B, bằng chữ, chữ ký; báo cáo có KG + tấn, không có cột chưa tính giá', async () => {
  const ExcelJS = require('exceljs');
  const app = setup(); importVehicles(app); importTickets(app).commit();
  app.settings.set('company', { ten: 'CÔNG TY TEST A', ma_so_thue: '123', dai_dien: 'Nguyễn Văn A' });
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`);
  const documents = require('../src/print/documents'), tpl = require('../src/print/htmlTemplates'), ex = require('../src/excel/exporters');
  const d = documents.statementDoc(app, { don_vi_id: hak.id });
  assert.ok(d.bangChu.endsWith('đồng.') && d.tickets.length === d.st.so_chuyen);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await ex.statementWorkbook(d));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Bảng kê', 'Chi tiết theo xe', 'Phụ lục phiếu cân']);
  const txt = []; wb.worksheets[0].eachRow((r) => r.eachCell((c) => txt.push(String(c.value && c.value.result !== undefined ? c.value.result : c.value))));
  const all = txt.join('|');
  assert.ok(all.includes('CÔNG TY TEST A') && all.includes('BÊN B') && all.includes('Bằng chữ') && all.includes('KẾ TOÁN') && all.includes('Nguyễn Văn A'));
  assert.equal(wb.worksheets[0].pageSetup.paperSize, 9);
  // tổng phụ lục = tổng bảng kê
  assert.ok(Math.abs(d.tickets.reduce((a, x) => a + x.kl_hang_kg, 0) / 1000 - d.st.tong_tan) < 1e-6);
  const html = tpl.statementHtml(d); assert.ok(html.includes('BẢNG KÊ CHI PHÍ VẬN CHUYỂN') && html.includes(d.bangChu));
  for (const k of Object.keys(documents.REPORTS)) {
    const rd = documents.reportDoc(app, k, {});
    const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(await ex.reportWorkbook(rd));
    const heads = []; w2.worksheets[0].eachRow((r) => r.eachCell((c) => heads.push(String(c.value))));
    assert.ok(!heads.some((h) => /Chưa tính giá|chưa tính giá \(/i.test(h)), `${k} còn cột chưa tính giá`);
    assert.ok(heads.includes('KL cân (kg)') && heads.includes('KL cân (tấn)'), `${k} thiếu cột KG/tấn`);
    assert.ok(tpl.reportHtml(rd).includes(rd.title));
  }
});

test('KL giám định: hiển thị chênh (giám định − cân), KHÔNG ảnh hưởng cước', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const before = app.reports.statement({ don_vi_id: app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`).id }).tong_tien;
  const [dot] = app.reports.byDot({});
  assert.equal(dot.kl_giam_dinh_tan, 38453.23);
  assert.equal(dot.chenh_giam_dinh_tan, Math.round((38453.23 - dot.tong_tan) * 1000) / 1000);
  assert.ok(dot.chenh_giam_dinh_tan < 0);                       // cân nhiều hơn giám định
  app.catalog.update('dot_van_chuyen', app.db.get('SELECT id FROM dot_van_chuyen').id, { khoi_luong_giam_dinh: 30000 });
  app.cost.recalc({ all: true });
  assert.equal(app.reports.statement({ don_vi_id: app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`).id }).tong_tien, before);
  assert.equal(app.reports.dashboard({ dot_id: dot.k }).giamDinh.kl_giam_dinh_tan, 30000);
});

test('dữ liệu ban đầu từ Excel: DB trống → đủ danh mục + xe + 2.035 phiếu, bảng kê khớp; chạy lại không trùng', () => {
  const { loadInitialData, isFreshDb } = require('../src/services/InitialDataService');
  const app = createApp({ dbFile: ':memory:', driver: 'node:sqlite' });
  assert.equal(isFreshDb(app), true);
  const r = loadInitialData(app, SEED_DIR);
  assert.equal(r.phieu.inserted, 2035);
  assert.equal(isFreshDb(app), false);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE trang_thai_tinh_gia='OK'`).n, 2035);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM don_vi_van_chuyen').n, 4);
  assert.equal(app.reports.statement({ don_vi_id: app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`).id }).tong_tien, 416454167);
  const again = loadInitialData(app, SEED_DIR);
  assert.equal(again.phieu.inserted, 0); assert.equal(again.phieu.duplicate, 2035);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM phieu_can').n, 2035);
});

test('3 biểu mẫu in ký 2 bên: tổng hợp tàu, chi tiết từng xe, bảng tính đơn giá (Excel + HTML)', async () => {
  const ExcelJS = require('exceljs');
  const app = setup(); importVehicles(app); importTickets(app).commit();
  app.settings.set('company', { ten: 'CÔNG TY A', dai_dien: 'Nguyễn Văn A', nguoi_lap: 'Kế Toán A' });
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`).id;
  app.catalog.update('don_vi_van_chuyen', hak, { dai_dien: 'Trần Văn B', ke_toan: 'Lê Thị C' });
  const forms = require('../src/print/forms'), fx = require('../src/excel/forms'), fh = require('../src/print/formHtml'), ex = require('../src/excel/exporters');
  const t = forms.tauSummaryDoc(app, { don_vi_id: hak });
  assert.ok(t.sections.length >= 1);
  const sec = t.sections[0]; const total = app.reports.statement({ don_vi_id: hak }).tong_tan;
  assert.ok(Math.abs(t.sections.reduce((a, s) => a + s.tot.kg, 0) / 1000 - total) < 1e-6);   // KG khớp bảng kê
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await fx.tauSummaryWorkbook(t));
  const txt = []; wb.worksheets[0].eachRow((r) => r.eachCell((c) => txt.push(String(c.value))));
  for (const k of ['BẢNG TỔNG HỢP VẬN CHUYỂN XUẤT HÀNG TÀU', 'TUYẾN TỪ', 'ĐỢT', 'Khối lượng (KG)', 'Bằng chữ', 'KẾ TOÁN', 'BÊN B –', 'Trần Văn B', 'Lê Thị C']) assert.ok(txt.join('|').includes(k), k);
  assert.ok(fh.tauSummaryHtml(t).includes(sec.bangChu));
  const d = forms.detailDoc(app, { don_vi_id: hak });
  assert.equal(d.sections[0].tot.so_chuyen, app.reports.statement({ don_vi_id: hak }).so_chuyen);
  const wd = new ExcelJS.Workbook(); await wd.xlsx.load(await fx.detailWorkbook(d));
  const td = []; wd.worksheets[0].eachRow((r) => r.eachCell((c) => td.push(String(c.value))));
  assert.ok(td.includes('Cân lần 1 (KG)') && td.includes('TỔNG CỘNG') && td.join('|').includes('Cộng '));
  assert.ok(fh.detailHtml(d).includes('Số phiếu'));
  const p = forms.priceDoc(app, { ngay: '2026-10-01', gia_dau: 31640, don_vi_id: hak, tu_ngay: '2026-09-28', den_ngay: '2026-10-04' });
  const wp = new ExcelJS.Workbook(); await wp.xlsx.load(await ex.priceSheetWorkbook(p.sh, { benA: p.benA, benB: p.benB }));
  require('../src/excel/forms').addPriceSheets(wp, p);
  assert.ok(wp.worksheets.length > 1);
  const tp = []; wp.worksheets[1].eachRow((r) => r.eachCell((c) => tp.push(String(c.value && c.value.result !== undefined ? c.value.result : c.value))));
  const tj = tp.join('|');
  for (const k of ['BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN', 'Cách tính', 'ĐƠN GIÁ VẬN CHUYỂN (chưa VAT)', 'BÊN B –', 'Trần Văn B', 'Bằng chữ']) assert.ok(tj.includes(k), k);
  const qs = p.sections.find((s) => s.x.ma_tuyen === 'QS-TIENSA'); assert.equal(qs.steps.find((s) => s.stt === 13).value, 206500);   // khớp bảng tính cũ
  assert.ok(qs.kyTri && qs.kyTri.so_chuyen > 0);
  assert.ok(fh.priceHtml(p).includes('BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN') && fh.priceHtml(p).includes('Diễn giải'));
});

test('xóa kỳ điều chỉnh đã duyệt: được khi chưa phiếu dùng (gỡ bảng giá, mở lại giá cũ); chặn khi có phiếu dùng', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const ky = app.db.get('SELECT id FROM ky_dieu_chinh_gia_dau ORDER BY id DESC LIMIT 1');
  if (!ky) return;
  const used = app.db.get('SELECT COUNT(*) n FROM phieu_can p JOIN bang_gia_van_chuyen b ON b.id=p.bang_gia_id WHERE b.ky_dieu_chinh_id=?', [ky.id]).n;
  if (used) assert.throws(() => app.price.removeFuelPeriod(ky.id), /phiếu đang dùng/);
  else { app.price.removeFuelPeriod(ky.id); assert.equal(app.db.get('SELECT COUNT(*) n FROM ky_dieu_chinh_gia_dau WHERE id=?', [ky.id]).n, 0); }
});

test('danh mục Hợp đồng vận chuyển: chọn theo ngày, ghi vào Bảng kê', async () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`);
  app.catalog.create('hop_dong', { ma: 'HD-OLD', so_hop_dong: '01/2025', ngay_ky: '2025-01-05', don_vi_van_chuyen_id: hak.id, tu_ngay: '2025-01-01', den_ngay: '2025-12-31', noi_ky: 'Quảng Ngãi' });
  app.catalog.create('hop_dong', { ma: 'HD-NEW', so_hop_dong: '09/2026', ngay_ky: '2026-01-02', don_vi_van_chuyen_id: hak.id, tu_ngay: '2026-01-01', tieu_de_bao_cao: 'BẢNG KÊ TEST' });
  const documents = require('../src/print/documents');
  assert.equal(documents.contractFor(app, hak.id, '2025-06-01').ma, 'HD-OLD');
  assert.equal(documents.contractFor(app, hak.id, '2026-06-01').ma, 'HD-NEW');
  const d = documents.statementDoc(app, { don_vi_id: hak.id, den_ngay: '2026-06-30' });
  assert.ok(d.contract.includes('09/2026') && d.tieu_de === 'BẢNG KÊ TEST');
});

test('xóa bảng giá đã dùng với recalc: phiếu được gỡ giá và tính lại, nhập giá đúng thì tính lại được', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const t = app.db.get(`SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen='DH-TIENSA'`);
  const used = app.price.activeRule(t.id, '2026-10-01');
  const n = app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=?`, [used.id]).n;
  assert.ok(n > 0);
  const r = app.price.removeRule(used.id, { recalc: true });
  assert.equal(r.tinh_lai, n);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE bang_gia_id=?`, [used.id]).n, 0);
  const okN = app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE tuyen_id=? AND trang_thai_tinh_gia='OK'`, [t.id]).n;
  if (!r.mo_lai) assert.equal(okN, 0);
  app.price.createVersion({ tuyen_id: t.id, tu_ngay: '2026-01-01', don_gia: 99000, phuong_thuc: 'CO_DINH' });
  assert.ok(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE tuyen_id=? AND don_gia IS NOT NULL`, [t.id]).n > 0);
});

test('rà soát: giá mới không chồng giá sau nó; ngày sai bị từ chối; dung sai đối chiếu được đọc đúng', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const t = app.db.get(`SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen='DH-TIENSA'`);
  const add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const open = app.db.get(`SELECT * FROM bang_gia_van_chuyen WHERE tuyen_id=? AND don_vi_van_chuyen_id IS NULL AND loai_hang IS NULL AND den_ngay IS NULL AND trang_thai='ACTIVE'`, [t.id]);
  app.price.createVersion({ tuyen_id: t.id, tu_ngay: add(open.tu_ngay, 10), don_gia: 130000, phuong_thuc: 'CO_DINH' });
  const mid = app.price.createVersion({ tuyen_id: t.id, tu_ngay: add(open.tu_ngay, 4), don_gia: 125000, phuong_thuc: 'CO_DINH' });
  assert.equal(app.db.get('SELECT den_ngay FROM bang_gia_van_chuyen WHERE id=?', [mid]).den_ngay, add(open.tu_ngay, 9));
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE tuyen_id=? AND trang_thai_tinh_gia='MULTIPLE_PRICE'`, [t.id]).n, 0);

  const { parseDateTime } = require('../src/utils/datetime');
  assert.equal(parseDateTime('31/02/2026'), null);
  assert.equal(parseDateTime('2026-13-45 99:99'), null);
  assert.ok(parseDateTime('28/02/2026 10:00'));
  const tk = app.db.get(`SELECT id FROM phieu_can WHERE trang_thai='ACTIVE' LIMIT 1`);
  assert.throws(() => app.tickets.update(tk.id, { ngay_gio_can_1: 'abc' }, 'test'), /định dạng|không tồn tại/);

  const bid = app.db.run(`INSERT INTO doi_chieu_batch(ten, loai_chung_tu, trang_thai, tham_so_json) VALUES ('t','VC','DA_CHAY', ?)`, [JSON.stringify({ tolKg: 50, tolMoney: 1 })]).id;
  assert.equal(app.recon.weightByVehicle(bid).tolKg, 50);
});

test('rà soát: Tổng hợp tàu cộng đúng Bảng kê (dòng cộng ra tổng, tổng = tiền + VAT)', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const forms = require('../src/print/forms');
  const doc = forms.tauSummaryDoc(app, {});
  for (const s of doc.sections) {
    const sum = (k) => s.rows.reduce((a, r) => a + r[k], 0);
    assert.equal(sum('tien'), s.tot.tien); assert.equal(sum('vat'), s.tot.vat);
    assert.equal(s.tot.tien + s.tot.vat, s.tot.tong);
  }
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`);
  const det = forms.detailDoc(app, { don_vi_id: hak.id });
  for (const s of det.sections) {
    assert.equal(s.xes.reduce((a, x) => a + x.tien, 0), s.tot.tien);
    for (const x of s.xes) assert.equal(x.rows.reduce((a, r) => a + r.tien_truoc_vat, 0), x.tien);
  }
});

test('chốt kỳ: xem trước, chốt (snapshot), khóa sửa, mở khóa có lý do', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const dates = app.db.get(`SELECT MIN(ngay_can) a, MAX(ngay_can) b FROM phieu_can WHERE trang_thai='ACTIVE'`);
  const hak = app.db.get(`SELECT id FROM don_vi_van_chuyen WHERE ma='HAK'`);
  const pv = app.lock.preview({ loai: 'KY', tu_ngay: dates.a, den_ngay: dates.b, don_vi_id: hak.id });
  assert.ok(pv.so_phieu > 0);
  if (pv.chua_tinh_gia) { assert.equal(pv.chot_duoc, false); assert.throws(() => app.lock.lock({ loai: 'KY', tu_ngay: dates.a, den_ngay: dates.b, don_vi_id: hak.id }), /chưa tính giá/); }
  // làm sạch phiếu chưa tính giá của HAK để chốt được
  app.db.run(`UPDATE phieu_can SET trang_thai='VOID' WHERE don_vi_van_chuyen_id=? AND NOT (trang_thai_tinh_gia IN ('OK','LOCKED') AND don_gia IS NOT NULL AND ty_le_vat IS NOT NULL AND kl_hang_kg>0)`, [hak.id]);
  const before = app.reports.statement({ don_vi_id: hak.id, tu_ngay: dates.a, den_ngay: dates.b });
  assert.throws(() => app.lock.unlock(999, 'x'), /Không tìm thấy/);
  const r = app.lock.lock({ loai: 'KY', tu_ngay: dates.a, den_ngay: dates.b, don_vi_id: hak.id });
  assert.equal(r.so_phieu, before.so_chuyen);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE chot_ky_id=?`, [r.id]).n, r.so_phieu);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM chot_ky_snapshot WHERE chot_ky_id=?`, [r.id]).n, r.so_phieu);
  const k = app.lock.list()[0]; assert.equal(k.tong_tien, before.tong_tien);
  const t = app.db.get(`SELECT id FROM phieu_can WHERE chot_ky_id=? LIMIT 1`, [r.id]);
  assert.throws(() => app.tickets.update(t.id, { kl_hang_kg: 1 }, 'x'), /chốt/);
  assert.throws(() => app.db.run(`UPDATE phieu_can SET can_lan_1=1 WHERE id=?`, [t.id]), /MỞ KHÓA/);
  assert.equal(app.lock.preview({ loai: 'KY', tu_ngay: dates.a, den_ngay: dates.b, don_vi_id: hak.id }).so_phieu, 0);
  assert.throws(() => app.lock.unlock(r.id, ''), /lý do/);
  assert.equal(app.lock.unlock(r.id, 'nhập sai giá').so_phieu, r.so_phieu);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE chot_ky_id IS NOT NULL`).n, 0);
  assert.ok(app.tickets.update(t.id, { ghi_chu: 'ok' }, 'x'));
});

test('dashboard: chỉ đếm phiếu đã tính giá, phiếu chưa tính giá hiện riêng', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const d = app.reports.dashboard({});
  const all = app.db.get(`SELECT COUNT(*) n FROM phieu_can WHERE trang_thai='ACTIVE'`).n;
  assert.equal(d.kpi.so_chuyen + d.kpi.chua_tinh.so_chuyen, all);
  const st = app.reports.statements({}).reduce((a, s) => a + s.so_chuyen, 0);
  assert.equal(d.kpi.so_chuyen, st);
});

test('biển số: sửa gõ nhầm O/I ở vị trí số, full-width; không đụng biển hợp lệ', () => {
  const { normalizePlate: n } = require('../src/utils/plate');
  assert.equal(n('43HO1O21'), '43H01021');
  assert.equal(n('４３H-01021'), '43H01021');
  assert.equal(n('43H-01021'), '43H01021');
  assert.equal(n('29H1-12345'), '29H112345');
});

test('backup: 2 backup cùng giây không trùng tên; restore file rác bị từ chối, DB vẫn mở', () => {
  const os = require('os');
  const { BackupService } = require('../src/services/BackupService');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const app = setup();
  const bk = new BackupService({ getDb: () => app.db, dbFile: path.join(dir, 'x.db'), backupsDir: dir, reopen: () => {} });
  const a = bk.backupNow('MANUAL'); const b = bk.backupNow('MANUAL');
  assert.notEqual(a.file, b.file); assert.ok(fs.existsSync(a.file) && fs.existsSync(b.file));
  const bad = path.join(dir, 'app_bad_MANUAL.db'); fs.writeFileSync(bad, 'khong phai sqlite');
  assert.throws(() => bk.restore(bad), /SQLite/);
  assert.ok(app.db.get('SELECT 1 x').x === 1);
});

test('migrator: DB phiên bản mới hơn phần mềm bị từ chối', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { migrate } = require('../src/database/migrator');
  const db = new DatabaseSync(':memory:'); migrate(db);
  db.exec("INSERT INTO schema_version(version, description) VALUES (999, 'x')");
  assert.throws(() => migrate(db), /mới hơn/);
});

test('xóa danh mục: đơn vị còn hợp đồng / địa điểm còn là nơi đến của phiếu bị chặn bằng thông báo rõ', () => {
  const app = setup();
  const dv = app.db.get('SELECT id FROM don_vi_van_chuyen LIMIT 1');
  app.db.run(`INSERT INTO hop_dong(ma, so_hop_dong, don_vi_van_chuyen_id) VALUES ('HD-T','1/2026',?)`, [dv.id]);
  assert.throws(() => app.catalog.remove('don_vi_van_chuyen', dv.id), /Không xóa được/);
});

test('backup tự động theo định kỳ ngày khi mở phần mềm', () => {
  const os = require('os');
  const { BackupService } = require('../src/services/BackupService');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk2-'));
  const app = setup(); let days = 2;
  const bk = new BackupService({ getDb: () => app.db, dbFile: path.join(dir, 'x.db'), backupsDir: dir, settings: { get: () => ({ intervalDays: days }) }, reopen: () => {} });
  assert.ok(bk.autoDaily());                       // chưa có bản AUTO → sao lưu
  assert.equal(bk.autoDaily(), null);              // vừa sao lưu → chưa tới hạn
  const f = bk.list().find((b) => b.kind === 'AUTO').file;
  const t = (Date.now() - 1 * 86400000) / 1000; fs.utimesSync(f, t, t);
  assert.equal(bk.autoDaily(), null);              // 1 ngày < 2 ngày
  const t2 = (Date.now() - 2.1 * 86400000) / 1000; fs.utimesSync(f, t2, t2);
  assert.ok(bk.autoDaily());                       // quá 2 ngày → sao lưu
  days = 0; fs.utimesSync(bk.list().find((b) => b.kind === 'AUTO').file, 1, 1);
  assert.equal(bk.autoDaily(), null);              // 0 = tắt
});

test('xóa phiếu cân: gồm phiếu đã áp giá, cần lý do, chặn phiếu đã chốt kỳ, import lại được', () => {
  const app = setup(); importVehicles(app); importTickets(app).commit();
  const rows = app.db.all(`SELECT id, so_phieu, trang_thai_tinh_gia FROM phieu_can WHERE trang_thai='ACTIVE' ORDER BY id LIMIT 5`);
  const priced = rows.find((r) => r.trang_thai_tinh_gia === 'OK'); assert.ok(priced);
  const total0 = app.reports.dashboard({}).kpi.so_chuyen;
  assert.throws(() => app.tickets.remove([priced.id], ''), /lý do/);
  const pv = app.tickets.removePreview([priced.id]); assert.equal(pv.xoa_duoc, 1); assert.equal(pv.da_tinh_gia, 1);
  const r = app.tickets.remove([priced.id], 'nhập nhầm'); assert.equal(r.deleted, 1);
  assert.equal(app.db.get('SELECT trang_thai FROM phieu_can WHERE id=?', [priced.id]).trang_thai, 'VOID');
  assert.equal(app.reports.dashboard({}).kpi.so_chuyen, total0 - 1);
  assert.equal(app.db.get(`SELECT COUNT(*) n FROM audit_log WHERE action='DELETE_TICKET' AND entity_id=?`, [priced.id]).n, 1);
  assert.equal(app.tickets.removePreview([priced.id]).khong_con, 1);   // xóa rồi → không còn
  // phiếu đã chốt kỳ thì không xóa được
  const p2 = app.db.get(`SELECT id FROM phieu_can WHERE trang_thai='ACTIVE' AND trang_thai_tinh_gia='OK' LIMIT 1`);
  app.db.run(`INSERT INTO chot_ky(ma, loai, trang_thai, so_phieu, tong_kg, tien_truoc_vat, tien_vat, tong_tien) VALUES ('CK-T','KY','DA_CHOT',1,0,0,0,0)`);
  const ck = app.db.get(`SELECT id FROM chot_ky WHERE ma='CK-T'`).id;
  app.db.run(`UPDATE phieu_can SET chot_ky_id=? WHERE id=?`, [ck, p2.id]);
  assert.throws(() => app.tickets.remove([p2.id], 'x'), /đã chốt kỳ/);
});

test('danh mục Xe: gán đơn vị ngay khi thêm/sửa xe; đổi đơn vị cần ngày áp dụng', () => {
  const app = setup();
  const [a, b] = app.db.all('SELECT id FROM don_vi_van_chuyen ORDER BY id LIMIT 2');
  const xe = app.catalog.create('xe', { bien_so_hien_thi: '43H-12345', don_vi_van_chuyen_id: a.id });
  const row = () => app.catalog.list('xe').find((x) => x.id === xe.id);
  assert.equal(row().don_vi_van_chuyen_id, a.id);
  app.catalog.update('xe', xe.id, { loai_xe: 'Đầu kéo', don_vi_van_chuyen_id: a.id });         // không đổi → không thêm dòng
  assert.equal(app.db.get('SELECT COUNT(*) n FROM xe_don_vi_lich_su WHERE xe_id=?', [xe.id]).n, 1);
  assert.throws(() => app.catalog.update('xe', xe.id, { don_vi_van_chuyen_id: b.id }), /Áp dụng từ ngày/);
  app.catalog.update('xe', xe.id, { don_vi_van_chuyen_id: b.id, tu_ngay_don_vi: '2020-01-01' });
  assert.equal(row().don_vi_van_chuyen_id, b.id);
  assert.equal(app.db.get('SELECT COUNT(*) n FROM xe_don_vi_lich_su WHERE xe_id=?', [xe.id]).n, 2);
});

test('file mẫu import: điền dữ liệu vào mẫu rồi import được (tự nhận cột, không nhầm sheet hướng dẫn)', async () => {
  const ExcelJS = require('exceljs'); const T = require('../src/excel/templates');
  const app = setup();
  const carriers = app.db.all(`SELECT ma FROM don_vi_van_chuyen ORDER BY ma`).map((x) => x.ma);
  // --- mẫu xe
  let wb = new ExcelJS.Workbook(); await wb.xlsx.load(await T.vehicleTemplate({ carriers }));
  assert.equal(wb.worksheets[0].name, 'Danh sách xe');
  let ws = wb.worksheets[0]; ws.getCell(6, 2).value = '43H-77777'; ws.getCell(6, 3).value = carriers[0]; ws.getCell(7, 2).value = '43H-88888'; ws.getCell(7, 3).value = carriers[0];
  const vbuf = Buffer.from(await wb.xlsx.writeBuffer());
  const vp = app.vehicleImport.preview({ buffer: vbuf, fileName: 'mau-xe.xlsx' });
  assert.equal(vp.sheet, 'Danh sách xe'); assert.equal(vp.counts.NEW, 2);
  app.vehicleImport.commit(vp.token);
  assert.ok(app.db.get(`SELECT id FROM xe WHERE bien_so_chuan='43H77777'`));
  // --- mẫu phiếu cân
  const locs = app.db.all(`SELECT ten FROM dia_diem ORDER BY ten`).map((x) => x.ten);
  wb = new ExcelJS.Workbook(); await wb.xlsx.load(await T.ticketTemplate({ locations: locs }));
  ws = wb.worksheets[0]; assert.equal(ws.name, 'Phiếu cân');
  const put = (r, v) => v.forEach((x, i) => { ws.getCell(r, i + 1).value = x; });
  put(6, [1, 'T0001', new Date(Date.UTC(2026, 8, 29, 13, 16)), new Date(Date.UTC(2026, 8, 29, 13, 52)), '43H-77777', 45500, 27700, 17800, locs[0]]);
  const tbuf = Buffer.from(await wb.xlsx.writeBuffer());
  const o = app.imports.open({ buffer: tbuf, fileName: 'mau-pc.xlsx' });
  const si = app.imports.sheetInfo(o.token, o.suggestedSheet);
  assert.equal(o.suggestedSheet, 'Phiếu cân');
  for (const k of ['so_phieu', 'ngay_gio_can_1', 'bien_so', 'kl_hang_kg', 'noi_xuat']) assert.notEqual(si.mapping[k], undefined, k);
  const pv = app.imports.preview(o.token, { sheetName: si.sheetName, headerRow: si.headerRow, mapping: si.mapping, dotId: null });
  assert.equal(pv.counts.new, 1); assert.equal(pv.counts.error, 0);
});
