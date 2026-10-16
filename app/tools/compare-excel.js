'use strict';
/**
 * Bước 14 — SO SÁNH TOÀN BỘ APP ↔ EXCEL.
 *
 * APP: chạy đúng như người dùng (bản cài mới → import file Excel gốc → sửa LDĐ về 0726 đã chốt → tính → xác nhận → báo cáo).
 * EXCEL: đọc THẲNG các sheet kết quả của 3 file gốc bằng exceljs (không dùng bộ ghép cột của APP), gồm:
 *   QR_DGVC (2) (17 cột + khối ký) · BKVC (17 xe, tổng, bằng chữ, nơi/ngày, 2 bên, người ký) · NL_VC (từng phiếu, 15 cột)
 *   · NL_GIAONHANDAU (từng dòng dầu) · BK (mẫu BKVC cũ 11/2025 — kiểm quy tắc làm tròn / đọc chữ) · CAN (file xuất trạm cân 11/2025).
 * Mọi chỗ khác nhau được xếp vào 1 quy tắc giải thích (RULES) theo 5 mục: Công thức / Dữ liệu / Làm tròn / Kiểu dữ liệu / Nguyên nhân,
 * kèm đề xuất + trạng thái. Chỗ khác KHÔNG khớp quy tắc nào → "CHƯA GIẢI THÍCH" (test Bước 14 sẽ báo lỗi).
 * Không sửa số của APP cho khớp Excel.
 *
 *   node tools/compare-excel.js [file kết quả .xlsx]
 */
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const E = require('../main/engine');
const { TicketService } = require('../main/services/TicketService');
const { ReportService } = require('../main/reports/ReportService');
const { ImportService } = require('../main/import/ImportService');
const { install, FILE, KETOAN } = require('../tests/install');

const WEEK = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const REPORT_DATE = '2026-09-24';
const LDD_OK = 'UTXK/ĐN-QS/0726';
let seq = 0; const rid = () => `cmp-${process.pid}-${++seq}`;

// ─────────────────────────── đọc Excel ───────────────────────────
function cv(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : v.result ?? null;
    if (v.text) return v.text;
    if (v.error) return null;
  }
  return v;
}
const at = (ws, addr) => cv(ws.getCell(addr));
const norm = (h) => String(h ?? '').replace(/\s+/g, ' ').trim();
function table(ws, headerRow) {
  const heads = []; ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c, i) => { heads[i] = norm(cv(c)); });
  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const o = {}; let any = false;
    heads.forEach((h, i) => { if (!h) return; const v = cv(ws.getRow(r).getCell(i)); o[h] = v; if (v !== null && v !== '') any = true; });
    if (any) rows.push({ excelRow: r, ...o });
  }
  return rows;
}
async function readWorkbook(file) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); return wb; }

// ─────────────────────────── quy tắc giải thích ───────────────────────────
// Mỗi quy tắc: when(d) → true nếu giải thích được; texts theo 5 mục; status: CHẤP NHẬN | ĐÃ SỬA | CẦN XÁC NHẬN.
const R = (id, kind, when, t) => ({ id, kind, when, ...t });
const isNum = (x) => typeof x === 'number';
const RULES = [
  R('LAMTRON_VAT_DONG', 'Làm tròn', (d) => d.scope === 'BKVC' && ['VAT', 'Thành tiền sau VAT'].includes(d.field) && isNum(d.excel) && !Number.isInteger(d.excel)
      && Math.abs(d.app - d.excel) < 1, {
    formula: 'Giống nhau: VAT = Thành tiền × 8%; Thành tiền sau VAT = Thành tiền + VAT', data: 'Giống nhau (cùng KG, cùng đơn giá)',
    rounding: 'APP làm tròn VAT từng dòng tới đồng (HALF_UP) rồi cộng; Excel để số lẻ (vd 5.126.542,4)', type: '—',
    cause: 'Quy tắc "làm tròn tiền đến đồng" đã chốt. Mẫu BK cũ 11/2025 của chính công ty cũng làm tròn VAT từng dòng (xem sheet BK_MAU_CU)',
    proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('LAMTRON_TONG', 'Làm tròn', (d) => d.scope === 'BKVC' && d.field.startsWith('TỔNG') && /VAT|sau VAT/.test(d.field) && Math.abs(d.app - d.excel) < 1, {
    formula: 'Giống nhau: tổng = cộng các dòng', data: 'Giống nhau', rounding: 'APP cộng các dòng đã làm tròn đồng → số nguyên; Excel cộng số lẻ → ,2',
    type: '—', cause: 'Hệ quả của LAMTRON_VAT_DONG: chênh 0,2 đ', proposal: 'Giữ APP (hóa đơn không có số lẻ đồng)', status: 'CHẤP NHẬN' }),
  R('KIEUSO_THUC', 'Kiểu dữ liệu', (d) => isNum(d.app) && isNum(d.excel) && Math.abs(d.app - d.excel) < 1e-6 && d.app !== d.excel, {
    formula: 'Giống nhau', data: 'Giống nhau', rounding: '—',
    type: 'Excel lưu số thực nhị phân (vd 64.585.519,99999999 = 362,84 × 178.000; 6.143,679999999999); APP tính số thập phân chính xác',
    cause: 'Sai số dấu phẩy động của Excel, không phải chênh lệch tiền', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('CHU_A25_CU', 'Dữ liệu', (d) => d.scope === 'BKVC' && d.field === 'Bằng chữ', {
    formula: 'APP: đọc chữ từ TỔNG thanh toán thực tế (1.181.061.043). Excel A25: KHÔNG có công thức — chữ gõ/dán sẵn', data: 'Excel ghi "Một tỷ, hai trăm năm mươi lăm triệu…" = 1.255.799.581 (số của kỳ khác)',
    rounding: '—', type: '—', cause: 'Ô bằng chữ trong Excel không cập nhật theo số tổng (mẫu BK cũ dùng hàm vnd() — APP đọc giống hệt, xem BK_MAU_CU)',
    proposal: 'Giữ APP — tránh sai chữ trên chứng từ', status: 'CHẤP NHẬN' }),
  R('LDD_0726', 'Dữ liệu', (d) => d.scope === 'PHIEU_CAN' && d.field === 'LDĐ' && d.excel === 'UTXK/ĐN-QS/0526' && d.app === LDD_OK, {
    formula: '—', data: 'File _DH.xlsx / _ĐN.xlsx ghi 0526; file QS ghi 0726', rounding: '—', type: '—',
    cause: 'Người dùng chốt 25/09/2026: đúng là 0726. APP sửa hàng loạt (có lý do, audit từng phiếu). Cột mô tả — không ảnh hưởng số tính',
    proposal: 'Giữ APP', status: 'ĐÃ SỬA' }),
  R('THU_TU_DONG', 'Trình bày', (d) => d.scope === 'BKVC' && d.field === 'Thứ tự dòng', {
    formula: '—', data: 'Số liệu từng xe khớp 17/17', rounding: '—', type: '—',
    cause: 'Excel xếp theo thứ tự nhập tay (92H-00195, 00844, 00994 thêm sau nằm cuối); APP xếp theo biển số', proposal: 'Giữ APP (ổn định, dễ tra)', status: 'CHẤP NHẬN' }),
  R('DIACHI_DANHMUC', 'Dữ liệu', (d) => d.field === 'Địa chỉ bên vận chuyển', {
    formula: '—', data: 'Excel: địa chỉ viết tắt; APP: địa chỉ đầy đủ trong danh mục đơn vị', rounding: '—', type: '—',
    cause: 'APP in đúng danh mục DON_VI (theo Danh mục công ty)', proposal: 'Nếu muốn in bản rút gọn: sửa địa chỉ trong danh mục — không cần sửa phần mềm', status: 'CHẤP NHẬN' }),
  R('KHOANG_TRANG', 'Kiểu dữ liệu', (d) => typeof d.app === 'string' && typeof d.excel === 'string' && d.app === d.excel.trim() && d.app !== d.excel, {
    formula: '—', data: 'Cùng giá trị', rounding: '—', type: 'Ô Excel có khoảng trắng thừa đầu/cuối (vd " 92H-00057", "Công ty TNHH Hoàng Anh Khôi "); APP bỏ khi import',
    cause: 'Khoảng trắng thừa làm Excel/Power Query so trùng sai; APP chuẩn hóa', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('QR_KHOI_KY_CHEP', 'Dữ liệu', (d) => d.scope === 'QR_DGVC' && d.inst !== 'HAKQN' && d.key.startsWith('khối ký') && !/Kế toán/.test(d.field), {
    formula: '—', data: 'Sheet QR_DGVC (2) của file _DH / _ĐN: khối ký bên thuê vẫn ghi "CN CÔNG TY TNHH HOÀNG ANH KHÔI" (chép từ file QS) trong khi hợp đồng là ĐH → HAKQN / HAK → HAKQN',
    rounding: '—', type: '—', cause: 'Excel không đổi khối ký theo hợp đồng → sai bên thuê, kéo theo sai người ký (ĐH – HAKQN: HAKQN ký VÕ VĂN PHỤNG theo thứ tự đã chốt)',
    proposal: 'Giữ APP — khối ký lấy từ hợp đồng + thứ tự ký', status: 'CHẤP NHẬN' }),
  R('TEN_DON_VI', 'Dữ liệu', (d) => /^Tên bên (thuê|vận chuyển)/.test(d.field), {
    formula: '—', data: 'Tên in trên chứng từ khác Excel', rounding: '—', type: '—',
    cause: 'APP in theo thứ tự: tên riêng của hợp đồng → "Tên ghi trên chứng từ" của đơn vị → tên đơn vị (người dùng đổi được, chốt 25/09/2026)',
    proposal: 'Sửa tên in ở hợp đồng hoặc danh mục đơn vị — không cần sửa phần mềm', status: 'CHẤP NHẬN' }),
  R('CHUC_DANH', 'Trình bày', (d) => /Chức danh/.test(d.field) && d.excel && d.app && norm(d.excel).replace(/\./g, '').toLowerCase().replace(/^p ?giám/, 'phó giám') === d.app.toLowerCase(), {
    formula: '—', data: 'Cùng chức danh', rounding: '—', type: '—', cause: 'Excel viết "   Giám Đốc" / "P.Giám Đốc"; APP viết chuẩn "Giám đốc" / "Phó Giám đốc"', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('NHAN_SAI_QRDGVC', 'Dữ liệu', (d) => d.scope === 'QR_DGVC' && d.field === 'Chức danh bên thuê' && d.excel === 'Giám Đốc' && d.app === 'Phó Giám đốc', {
    formula: '—', data: 'QR_DGVC (2) ghi VÕ THỊ NHƯ NGỌC là "Giám Đốc"; BKVC cùng file ghi "P.Giám Đốc"', rounding: '—', type: '—',
    cause: 'Nhãn trong sheet QR_DGVC (2) sai — trái với BKVC và thứ tự ký đã chốt', proposal: 'Giữ APP (Phó Giám đốc)', status: 'CHẤP NHẬN' }),
  R('MST', 'Trình bày', (d) => d.field === 'MST bên vận chuyển' && !d.excel, {
    formula: '—', data: '—', rounding: '—', type: '—', cause: 'APP thêm dòng MST dưới địa chỉ (lấy từ danh mục)', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('KETOAN_QRDGVC', 'Trình bày', (d) => d.scope === 'QR_DGVC' && /Kế toán/.test(d.field) && !d.excel, {
    formula: '—', data: '—', rounding: '—', type: '—', cause: 'Excel QR_DGVC (2) chỉ có Giám đốc 2 bên; APP in thêm Kế toán như BKVC', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('DIENGIAI_CUOC', 'Dữ liệu', (d) => d.field === 'Diễn giải cước (dưới khối ký)', {
    formula: 'APP: mẫu câu theo hóa đơn thật (MISA 25/09/2026) + điểm đi / điểm đến của tuyến + biển số viết liền', data: 'Excel BKVC!C37 (ngoài vùng in): "… từ NM Đông Phú … đến NM dăm gỗ … Bà Nà … BKS : 43H-01055" — câu cũ, khác tuyến VC.007 (Quế Sơn → Tiên Sa) và khác hóa đơn thật',
    rounding: '—', type: '—', cause: 'Dùng để viết hóa đơn (chốt 25/09/2026) → theo mẫu hóa đơn thật "Vận chuyển dăm gỗ từ nhà máy DG CCN Đông Phú, Xã Quế Sơn , TP Đà Nẵng đến Cảng Tiên Sa Đà Nẵng bằng xe thùng biển kiểm soát: 92H00057"',
    proposal: 'Câu chữ sửa được theo từng hợp đồng / điểm đi – đến của tuyến', status: 'CHẤP NHẬN' }),
  R('BK_CU_THANHTIEN', 'Làm tròn', (d) => d.scope === 'BK_MAU_CU' && d.field === 'Thành tiền' && Math.abs(d.app - d.excel) < 1, {
    formula: 'Giống nhau: Tấn × Đơn giá', data: 'Giống nhau', rounding: 'Mẫu cũ để Thành tiền số lẻ (23.592.934,4), làm tròn ở tổng; APP làm tròn từng dòng',
    type: '—', cause: 'Tổng thanh toán vẫn trùng khớp 49.583.334', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('BK_CU_TONG_TRUOC_VAT', 'Làm tròn', (d) => d.scope === 'BK_MAU_CU' && d.field === 'TỔNG Thành tiền' && Math.abs(d.app - d.excel) < 1, {
    formula: 'Giống nhau', data: 'Giống nhau', rounding: 'Hệ quả BK_CU_THANHTIEN (45.910.494,7 ↔ 45.910.495)', type: '—', cause: 'Tổng sau VAT trùng', proposal: 'Giữ APP', status: 'CHẤP NHẬN' }),
  R('BK_CU_NGUOIKY', 'Dữ liệu', (d) => d.scope === 'BK_MAU_CU' && /Người ký/.test(d.field), {
    formula: '—', data: 'Mẫu cũ 11/2025 (HAK vận chuyển cho HAKQN): HAK ký VÕ THỊ NHƯ NGỌC – P.Giám đốc, HAKQN ký VÕ VĂN PHỤNG – Giám đốc',
    rounding: '—', type: '—', cause: 'Ngược với thứ tự đã chốt (HAK ưu tiên 1 → VÕ VĂN PHỤNG). Mẫu 24/09/2026 (HAKQN → CNHAK) đúng thứ tự',
    proposal: 'Chốt 25/09/2026: người ký đúng thứ tự ưu tiên đã thống nhất → giữ APP (mẫu cũ ghi ngược)', status: 'CHẤP NHẬN' }),
];
function explain(d) { return RULES.find((r) => r.when(d)) || null; }

// ─────────────────────────── so sánh ───────────────────────────
const same = (a, b) => {
  const e = (x) => x === null || x === undefined || x === '';
  if (e(a) && e(b)) return true;
  if (isNum(a) && isNum(b)) return a === b;
  return String(a ?? '').trim() === String(b ?? '').trim() && String(a ?? '') === String(b ?? '');
};
class Diff {
  constructor() { this.checks = 0; this.rows = []; this.byScope = {}; }
  cmp(scope, inst, key, field, app, excel, where = '') {
    this.checks++; const s = (this.byScope[`${scope}|${inst}`] ||= { scope, inst, checks: 0, same: 0, diff: 0 }); s.checks++;
    if (same(app, excel)) { s.same++; return true; }
    s.diff++;
    const d = { scope, inst, key, field, app, excel, where };
    const r = explain(d);
    this.rows.push({ ...d, rule: r ? r.id : 'CHƯA GIẢI THÍCH', kind: r ? r.kind : '?', formula: r?.formula || '', data: r?.data || '', rounding: r?.rounding || '',
      type: r?.type || '', cause: r?.cause || 'Không khớp quy tắc giải thích nào — cần kiểm tra', proposal: r?.proposal || '', status: r ? r.status : 'CHƯA GIẢI THÍCH' });
    return false;
  }
  note(scope, inst, key, field, app, excel, where) { // chỗ khác về cấu trúc (không phải cặp giá trị)
    return this.cmp(scope, inst, key, field, app, excel, where);
  }
}

const QR_COLS = [
  ['Mã tuyến', 'route_code'], ['Tuyến', 'route_name'], ['Cự ly tuyến', 'trip_distance_km'], ['Ngày bắt đầu', 'start_date'], ['Ngày kết thúc', 'end_date'],
  ['Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu)', 'contract_price'], ['Số chuyến', 'trip_count'], ['Tổng KL (Tấn)', 'total_ton'],
  ['Dầu Diezel thực nhận', 'actual_fuel_liter'], ['Định mức dầu Diezel', 'fuel_norm_l_per_km'], ['Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)', 'standard_fuel_liter'],
  ['CL Tiêu hao Diezel', 'fuel_diff_liter'], ['Đơn giá dầu', 'fuel_price'], ['Ngày nhập dầu', 'fuel_import_date'], ['Đơn giá CL Diezel', 'fuel_adjust_price'],
  ['Đơn giá vận chuyển', 'transport_price'],
];
const TICKET_COLS = [
  ['Stt', 'row_no'], ['Số phiếu', 'ticket_no'], ['Ngày cân 1', 'weigh1_date'], ['Giờ cân 1', 'weigh1_time'], ['Ngày cân 2', 'weigh2_date'], ['Giờ cân 2', 'weigh2_time'],
  ['Biển số 1', 'plate_no'], ['Cân lần 1', 'weight1_kg'], ['Cân lần 2', 'weight2_kg'], ['KL hàng (KG)', 'net_kg'], ['Nguồn gốc', 'origin'], ['Khách hàng', 'customer'],
  ['LDĐ', 'ldd'], ['Kiểu cân', 'weigh_type'], ['Mã cự ly VC', 'route_code'], ['Đơn vị VC', 'transport_unit_name'],
];
const FUEL_COLS = [
  ['Ngày nhận dầu', 'receive_date'], ['Mã cự ly VC', 'route_code'], ['Biển số xe', 'fuel_vehicle_code'], ['ĐVT', 'uom'], ['Số lượng (lít)', 'qty_liter'],
  ['Đơn giá dầu', 'fuel_price_excl_vat'], ['Ngày mua dầu', 'purchase_date'], ['Đơn vị', 'giver_unit_code'],
];
const txt = (x) => (x === null || x === undefined ? '' : typeof x === 'number' ? String(x) : String(x));

/** Chạy APP cho 1 bản cài, trả dữ liệu để so. */
async function runApp(inst) {
  const c = await install(inst);
  const ts = new TicketService(c.store);
  const bad = c.store.all('PHIEU_CAN').filter((t) => t.ldd && t.ldd !== LDD_OK && /^UTXK\/ĐN-QS\//.test(t.ldd));
  const fixes = [];
  for (const v of [...new Set(bad.map((t) => t.ldd))]) {
    fixes.push({ from: v, ...(await ts.bulkUpdateDescriptive({ field: 'ldd', fromValue: v, toValue: LDD_OK, reason: 'Chốt LDĐ = UTXK/ĐN-QS/0726 (25/09/2026)', clientRequestId: rid(), user: KETOAN })) });
  }
  const k = await c.periods.calculate({ contractId: c.contractId, ...WEEK, reportDate: REPORT_DATE, clientRequestId: rid(), user: KETOAN });
  await c.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const rs = new ReportService(c.store);
  const pid = k.period.period_id;
  const out = { inst, store: c.store, pid, fixes, calc: rs.pricing({ periodId: pid }).rows[0], bkvc: rs.bkvc({ periodId: pid }), pricing: rs.pricing({ periodId: pid }),
    tickets: new Map(c.store.all('PHIEU_CAN').map((t) => [t.ticket_key, t])), fuel: c.store.all('GIAO_NHAN_DAU'),
    fuelInPeriod: new Set(c.store.find('FUEL_DETAIL', (d) => d.period_id === pid && d.is_current).map((d) => d.receipt_id)),
    ticketsInPeriod: new Set(c.store.find('TRANSPORT_DETAIL', (d) => d.period_id === pid && d.is_current).map((d) => d.ticket_id)), issues: k.issues };
  return out;
}

async function compareInstall(inst, D, sheetsOut) {
  const app = await runApp(inst);
  const wb = await readWorkbook(FILE[inst]);

  // 1. QR_DGVC (2): 16 cột kết quả
  const qr = wb.getWorksheet('QR_DGVC (2)');
  const qh = {}; qr.getRow(5).eachCell((c, i) => { qh[norm(cv(c))] = i; });
  const side = [];
  for (const [label, key] of QR_COLS) {
    const x = cv(qr.getRow(6).getCell(qh[label])); const a = app.calc[key];
    D.cmp('QR_DGVC', inst, 'VC.007', label, a, x, `QR_DGVC (2)!${qr.getRow(6).getCell(qh[label]).address}`);
    side.push({ inst, field: label, app: a, excel: x, ok: same(a, x) });
  }
  // khối ký QR_DGVC (2): dòng 10 (bên), 11 (chức danh), 14 (tên)
  const S = app.pricing.signers;
  D.cmp('QR_DGVC', inst, 'khối ký', 'Tên bên vận chuyển (khối ký)', S.carrier.unitName, norm(at(qr, 'C10')), 'QR_DGVC (2)!C10');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Tên bên thuê (khối ký)', S.customer.unitName, norm(at(qr, 'L10')), 'QR_DGVC (2)!L10');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Chức danh bên vận chuyển', S.carrier.signer.title, norm(at(qr, 'C11')), 'QR_DGVC (2)!C11');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Người ký bên vận chuyển', S.carrier.signer.name, norm(at(qr, 'C14')), 'QR_DGVC (2)!C14');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Chức danh bên thuê', S.customer.signer.title, norm(at(qr, 'L11')), 'QR_DGVC (2)!L11');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Người ký bên thuê', S.customer.signer.name, norm(at(qr, 'L14')), 'QR_DGVC (2)!L14');
  D.cmp('QR_DGVC', inst, 'khối ký', 'Kế toán bên vận chuyển', S.carrier.accountant || '', '', 'QR_DGVC (2) không có');
  sheetsOut.qr.push(...side);

  // 2. NL_VC: từng phiếu, 16 cột (sau khi APP sửa LDĐ)
  const nl = table(wb.getWorksheet('NL_VC'), 1).filter((r) => r['Số phiếu'] !== null && r['Số phiếu'] !== '');
  let tOk = 0; const seen = new Set();
  for (const r of nl) {
    const key = `${txt(r['Số phiếu'])}|${r['Ngày cân 1']}|${txt(r['Biển số 1']).toUpperCase()}`;
    const t = app.tickets.get(key); seen.add(key);
    if (!t) { D.note('PHIEU_CAN', inst, key, 'Phiếu có trong Excel', 'KHÔNG CÓ', 'có', `NL_VC!A${r.excelRow}`); continue; }
    let ok = true;
    for (const [h, k] of TICKET_COLS) {
      const x = r[h]; let a = t[k];
      if (h === 'Số phiếu') a = t.ticket_no, ok = D.cmp('PHIEU_CAN', inst, key, h, a, txt(x), `NL_VC!R${r.excelRow}`) && ok;
      else if (h === 'Stt') ok = D.cmp('PHIEU_CAN', inst, key, h, a, txt(x), `NL_VC!A${r.excelRow}`) && ok;
      else ok = D.cmp('PHIEU_CAN', inst, key, h, a, x, `NL_VC!R${r.excelRow}`) && ok;
    }
    if (!app.ticketsInPeriod.has(t.ticket_id)) ok = D.note('PHIEU_CAN', inst, key, 'Phiếu nằm trong kỳ', 'không', 'có', '') && ok;
    if (ok) tOk++;
  }
  for (const k of app.tickets.keys()) if (!seen.has(k)) D.note('PHIEU_CAN', inst, k, 'Phiếu có trong APP', 'có', 'KHÔNG CÓ', 'NL_VC');
  sheetsOut.tickets.push({ inst, excel: nl.length, app: app.tickets.size, inPeriod: app.ticketsInPeriod.size, allFieldsSame: tOk, kgExcel: nl.reduce((a, r) => a + r['KL hàng (KG)'], 0),
    kgApp: [...app.tickets.values()].reduce((a, t) => a + t.net_kg, 0), lddFixed: app.fixes.reduce((a, f) => a + f.updated, 0) });

  // 3. NL_GIAONHANDAU: từng dòng dầu (theo thứ tự file), tất cả nằm trong kỳ
  const fx = table(wb.getWorksheet('NL_GIAONHANDAU'), 2).filter((r) => r['Ngày nhận dầu']);
  const fa = [...app.fuel].sort((a, b) => a.receipt_id.localeCompare(b.receipt_id));
  D.cmp('DAU', inst, 'bảng kê', 'Số dòng dầu', fa.length, fx.length, 'NL_GIAONHANDAU');
  fx.forEach((r, i) => {
    const a = fa[i]; if (!a) return;
    for (const [h, k] of FUEL_COLS) D.cmp('DAU', inst, `dòng ${i + 1}`, h, k === 'giver_unit_code' ? a[k] : a[k], r[h], `NL_GIAONHANDAU!R${r.excelRow}`);
    D.cmp('DAU', inst, `dòng ${i + 1}`, 'Dòng dầu nằm trong kỳ', app.fuelInPeriod.has(a.receipt_id) ? 'có' : 'không', 'có', '');
  });
  const avg = fx.reduce((s, r) => s + r['Đơn giá dầu'], 0) / fx.length;
  sheetsOut.fuel.push({ inst, lines: fx.length, appLines: fa.length, inPeriod: app.fuelInPeriod.size, liters: fx.reduce((s, r) => s + r['Số lượng (lít)'], 0),
    appLiters: app.calc.actual_fuel_liter, avgExcelRecalc: avg, appFuelPrice: app.calc.fuel_price, qrFuelPrice: cv(qr.getRow(6).getCell(qh['Đơn giá dầu'])),
    beforePeriod: fx.filter((r) => r['Ngày nhận dầu'] < WEEK.dateFrom).length });

  // 4. BKVC (chỉ file QS có sheet này)
  const bk = wb.getWorksheet('BKVC');
  if (bk) compareBkvc(bk, app, inst, D, sheetsOut);
  if (inst === 'HAKQN') { await compareOldBk(wb.getWorksheet('BK'), app, D, sheetsOut); await compareCan(D, sheetsOut); compareBkctSheet(wb, sheetsOut); }
  app.store.close();
  return app;
}

function compareBkvc(ws, app, inst, D, out) {
  const B = app.bkvc; const byPlate = new Map(B.lines.map((l) => [l.plate_no, l]));
  const COLS = [['C', 'Số chuyến', 'trip_count'], ['D', 'Khối lượng (KG)', 'kg'], ['E', 'Khối lượng (Tấn)', 'ton'], ['F', 'Đơn giá', 'unit_price'], ['G', 'Thành tiền', 'amount'],
    ['H', 'VAT', 'vat'], ['I', 'Thành tiền sau VAT', 'amount_incl_vat']];
  const order = [];
  for (let r = 7; typeof at(ws, `A${r}`) === 'number'; r++) {
    const plate = at(ws, `B${r}`); order.push(plate); const l = byPlate.get(plate);
    if (!l) { D.note('BKVC', inst, plate, 'Xe có trong BKVC', 'KHÔNG CÓ', 'có', `BKVC!B${r}`); continue; }
    const line = { plate, excelRow: r };
    for (const [c, h, k] of COLS) { D.cmp('BKVC', inst, plate, h, l[k], at(ws, `${c}${r}`), `BKVC!${c}${r}`); line[`app_${k}`] = l[k]; line[`excel_${k}`] = at(ws, `${c}${r}`); }
    out.bkvc.push(line);
  }
  D.cmp('BKVC', inst, '17 xe', 'Số dòng xe', B.lines.length, order.length, 'BKVC!A7:A23');
  D.cmp('BKVC', inst, '17 xe', 'Thứ tự dòng', B.lines.map((l) => l.plate_no).join(', '), order.join(', '), 'BKVC!B7:B23');
  const tr = 7 + order.length; const T = B.totals;
  for (const [c, h, v] of [['C', 'TỔNG Số chuyến', T.trips], ['D', 'TỔNG KG', T.kg], ['E', 'TỔNG Tấn', T.ton], ['G', 'TỔNG Thành tiền', T.amount], ['H', 'TỔNG VAT', T.vat], ['I', 'TỔNG sau VAT', T.total]]) {
    D.cmp('BKVC', inst, 'TỔNG CỘNG', h, v, at(ws, `${c}${tr}`), `BKVC!${c}${tr}`);
  }
  D.cmp('BKVC', inst, 'chữ', 'Bằng chữ', B.amountInWords, at(ws, `A${tr + 1}`), `BKVC!A${tr + 1}`);
  D.cmp('BKVC', inst, 'đầu trang', 'Tên bên vận chuyển (đầu trang)', B.header.carrier.unitName, norm(at(ws, 'A1')), 'BKVC!A1');
  D.cmp('BKVC', inst, 'đầu trang', 'Địa chỉ bên vận chuyển', B.header.carrier.address, norm(at(ws, 'A2')), 'BKVC!A2');
  D.cmp('BKVC', inst, 'đầu trang', 'MST bên vận chuyển', `MST: ${B.header.carrier.taxCode}`, at(ws, 'A3'), 'BKVC!A3');
  D.cmp('BKVC', inst, 'đầu trang', 'Tiêu đề', B.header.title, norm(at(ws, 'A4')), 'BKVC!A4');
  D.cmp('BKVC', inst, 'đầu trang', 'Dòng kỳ', B.header.periodText, norm(at(ws, 'A5')), 'BKVC!A5');
  const hdr = []; ws.getRow(6).eachCell((c) => hdr.push(norm(cv(c))));
  D.cmp('BKVC', inst, 'đầu trang', 'Tiêu đề cột', ['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn)', 'Đơn giá', 'Thành tiền', `VAT (${B.header.vatPct}%)`, 'Thành tiền', 'Ghi chú'].join(' | '), hdr.join(' | '), 'BKVC!A6:J6');
  const f = tr + 2; // nơi/ngày, bên, chức danh, …, tên
  D.cmp('BKVC', inst, 'chân trang', 'Nơi, ngày lập', B.header.placeDate, norm(at(ws, `G${f}`)), `BKVC!G${f}`);
  D.cmp('BKVC', inst, 'chân trang', 'Tên bên vận chuyển (khối ký)', B.signers.carrier.unitName, norm(at(ws, `A${f + 1}`)), `BKVC!A${f + 1}`);
  D.cmp('BKVC', inst, 'chân trang', 'Tên bên thuê (khối ký)', B.signers.customer.unitName, norm(at(ws, `G${f + 1}`)), `BKVC!G${f + 1}`);
  D.cmp('BKVC', inst, 'chân trang', 'Chức danh bên vận chuyển', B.signers.carrier.signer.title, norm(at(ws, `B${f + 2}`)), `BKVC!B${f + 2}`);
  D.cmp('BKVC', inst, 'chân trang', 'Chức danh bên thuê', B.signers.customer.signer.title, norm(at(ws, `G${f + 2}`)), `BKVC!G${f + 2}`);
  D.cmp('BKVC', inst, 'chân trang', 'Người ký bên vận chuyển', B.signers.carrier.signer.name, norm(at(ws, `B${f + 7}`)), `BKVC!B${f + 7}`);
  D.cmp('BKVC', inst, 'chân trang', 'Kế toán bên vận chuyển', B.signers.carrier.accountant, norm(at(ws, `D${f + 7}`)), `BKVC!D${f + 7}`);
  D.cmp('BKVC', inst, 'chân trang', 'Người ký bên thuê', B.signers.customer.signer.name, norm(at(ws, `G${f + 7}`)), `BKVC!G${f + 7}`);
  D.cmp('BKVC', inst, 'chân trang', 'Kế toán bên thuê', B.signers.customer.accountant, norm(at(ws, `I${f + 7}`)), `BKVC!I${f + 7}`);
  // diễn giải cước để viết hóa đơn (chốt 25/09/2026): Excel có 1 dòng cho 1 xe; APP sinh 1 dòng / xe — so đúng dòng của xe đó
  let desc = ''; let at37 = '';
  for (let r = f + 8; r <= ws.rowCount; r++) { const v = at(ws, `C${r}`); if (typeof v === 'string' && /^Cước vận chuyển/.test(v)) { desc = v; at37 = `BKVC!C${r}`; break; } }
  const plate = (desc.match(/BKS\s*:\s*(\S+)/) || [])[1];
  const mine = B.invoiceLines.find((l) => l.plate_no === plate);
  D.cmp('BKVC', inst, plate || 'ngoài vùng in', 'Diễn giải cước (dưới khối ký)', mine ? mine.description : '', desc, at37);
  out.invoice = { excel: desc, plate, app: mine ? mine.description : '', lines: B.invoiceLines.length };
}

/** Mẫu BKVC cũ (sheet BK, 08–09/11/2025, HAK → HAKQN): tính lại bằng Tầng C của APP từ KG + đơn giá trên sheet. */
async function compareOldBk(ws, app, D, out) {
  const cfg = E.buildConfig(app.store.all('CONFIG'));
  let tA = 0; let tV = 0; let tT = 0; let r = 7;
  for (; typeof at(ws, `A${r}`) === 'number'; r++) {
    const kg = at(ws, `D${r}`); const price = at(ws, `F${r}`); const plate = at(ws, `B${r}`);
    const l = E.calculateConfirmationLine({ kg, unitPrice: price, vatRate: cfg.vatRate }, cfg);
    D.cmp('BK_MAU_CU', 'HAKQN', plate, 'Thành tiền', l.amount, at(ws, `G${r}`), `BK!G${r}`);
    D.cmp('BK_MAU_CU', 'HAKQN', plate, 'VAT', l.vat, at(ws, `H${r}`), `BK!H${r}`);
    out.oldBk.push({ plate, kg, price, appAmount: l.amount, excelAmount: at(ws, `G${r}`), appVat: l.vat, excelVat: at(ws, `H${r}`) });
    tA += l.amount; tV += l.vat; tT += l.amountInclVat;
  }
  D.cmp('BK_MAU_CU', 'HAKQN', 'TỔNG', 'TỔNG Thành tiền', tA, at(ws, `G${r}`), `BK!G${r}`);
  D.cmp('BK_MAU_CU', 'HAKQN', 'TỔNG', 'TỔNG VAT', tV, at(ws, `H${r}`), `BK!H${r}`);
  D.cmp('BK_MAU_CU', 'HAKQN', 'TỔNG', 'TỔNG sau VAT', tT, at(ws, `I${r}`), `BK!I${r} = ROUND(G+H;0)`);
  D.cmp('BK_MAU_CU', 'HAKQN', 'chữ', 'Bằng chữ (hàm vnd của Excel)', E.numberToVietnameseWords(tT, { thousand: cfg.amountWordsThousand, suffix: cfg.amountWordsSuffix }), at(ws, `C${r + 1}`), `BK!C${r + 1}`);
  // người ký theo quy tắc APP cho cặp HAK (vận chuyển) → HAKQN (thuê)
  const s = E.resolveSigners({ carrier_unit_code: 'HAK', customer_unit_code: 'HAKQN' }, app.store.all('DON_VI'), cfg);
  D.cmp('BK_MAU_CU', 'HAKQN', 'khối ký', 'Người ký bên vận chuyển (HAK)', `${s.carrier.signer.name} – ${s.carrier.signer.title}`, `${norm(at(ws, 'B19'))} – ${norm(at(ws, 'B14'))}`, 'BK!B14/B19');
  D.cmp('BK_MAU_CU', 'HAKQN', 'khối ký', 'Người ký bên thuê (HAKQN)', `${s.customer.signer.name} – ${s.customer.signer.title}`, `${norm(at(ws, 'G19'))} – ${norm(at(ws, 'G14'))}`, 'BK!G14/G19');
  out.oldBkTotals = { app: { amount: tA, vat: tV, total: tT }, excel: { amount: at(ws, `G${r}`), vat: at(ws, `H${r}`), total: at(ws, `I${r}`) } };
}

/** Sheet CAN = file xuất từ trạm cân (11/2025): APP import được không, tổng KG có trùng SUBTOTAL của sheet không. */
async function compareCan(D, out) {
  const c = await install('HAKQN', { withData: false });
  const s = new ImportService(c.store);
  let noFixed = '';
  try { await s.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, sheetName: 'CAN', user: 'k' }); } catch (e) { noFixed = e.details?.code || e.code; }
  const p = await s.preview({ importType: 'PHIEU_CAN', filePath: FILE.HAKQN, sheetName: 'CAN', fixedValues: { route_code: 'VC.007' }, user: 'k' });
  const rows = s.previewRows({ batchId: p.batchId, pageSize: 10000 }).rows;
  const wb = await readWorkbook(FILE.HAKQN); const ws = wb.getWorksheet('CAN');
  D.cmp('CAN_TRAM', 'HAKQN', 'CAN', 'Số lượt cân (SUBTOTAL G5)', rows.length, at(ws, 'G5'), 'CAN!G5');
  D.cmp('CAN_TRAM', 'HAKQN', 'CAN', 'Tổng KL hàng (SUBTOTAL J5)', rows.reduce((a, r) => a + r.normalized.net_kg, 0), at(ws, 'J5'), 'CAN!J5');
  D.cmp('CAN_TRAM', 'HAKQN', 'CAN', 'Dòng lỗi khi import', p.summary.error, 0, '');
  const owners = {}; for (const r of rows) owners[r.normalized.owner_unit_code] = (owners[r.normalized.owner_unit_code] || 0) + 1;
  out.can = { rows: rows.length, summary: p.summary, noFixedValues: noFixed, owners, warnings: rows.filter((r) => r.status === 'WARNING').map((r) => r.issues.map((i) => i.message).join('; ')) };
  c.store.close();
}

/** Sheet BKCT trong file: dữ liệu cũ (27–31/07/2026) — không so số, chỉ ghi nhận cấu trúc. */
function compareBkctSheet(wb, out) {
  const ws = wb.getWorksheet('BKCT'); const hdr = []; ws.getRow(4).eachCell((c) => hdr.push(norm(cv(c))));
  out.bkct = { period: norm(at(ws, 'A3')).replace(/^.*\(/, '(').trim(), excelColumns: hdr, rows: ws.rowCount };
}

// ─────────────────────────── xuất file so sánh ───────────────────────────
async function writeReport(res, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  const FONT = { name: 'Times New Roman', size: 10 };
  const sheet = (name, cols, rows, widths = []) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.addRow(cols).eachCell((c) => { c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141F19' } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
    for (const r of rows) ws.addRow(r).eachCell((c) => { c.font = FONT; c.alignment = { wrapText: true, vertical: 'top' }; });
    cols.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i] || 16; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };
  const S = res.summary;
  const tong = wb.addWorksheet('TONG_HOP');
  tong.getColumn(1).width = 34; tong.getColumn(2).width = 16; tong.getColumn(3).width = 16; tong.getColumn(4).width = 16; tong.getColumn(5).width = 16;
  tong.addRow(['SO SÁNH APP ↔ EXCEL — kỳ 18–23/09/2026, tuyến VC.007']).font = { ...FONT, size: 14, bold: true };
  tong.addRow([`Lập lúc ${res.at} · ${S.checks} phép so · ${S.same} khớp · ${S.diff} khác (${S.explained} đã giải thích, ${S.unexplained} chưa giải thích)`]).font = { ...FONT, italic: true };
  tong.addRow([]);
  tong.addRow(['Phạm vi', 'Bản cài', 'Số phép so', 'Khớp', 'Khác']).font = { ...FONT, bold: true };
  for (const s of res.scopes) tong.addRow([s.scope, s.inst, s.checks, s.same, s.diff]);
  tong.addRow([]);
  tong.addRow(['Chênh lệch theo quy tắc', 'Loại', 'Số chỗ', 'Trạng thái']).font = { ...FONT, bold: true };
  for (const g of res.groups) tong.addRow([g.rule, g.kind, g.count, g.status]);
  tong.addRow([]);
  tong.addRow(['Đơn giá vận chuyển', 'APP', 'Excel']).font = { ...FONT, bold: true };
  for (const q of res.qr.filter((x) => x.field === 'Đơn giá vận chuyển')) tong.addRow([q.inst, q.app, q.excel]);
  tong.eachRow((r) => r.eachCell((c) => { c.font = { ...FONT, ...c.font }; }));

  sheet('CHENH_LECH', ['Phạm vi', 'Bản cài', 'Dòng / khóa', 'Chỉ tiêu', 'APP', 'Excel', 'Ô Excel', 'Loại', 'Công thức', 'Dữ liệu', 'Làm tròn', 'Kiểu dữ liệu', 'Nguyên nhân', 'Đề xuất', 'Trạng thái', 'Quy tắc'],
    res.diffs.map((d) => [d.scope, d.inst, d.key, d.field, d.app, d.excel, d.where, d.kind, d.formula, d.data, d.rounding, d.type, d.cause, d.proposal, d.status, d.rule]),
    [10, 8, 18, 22, 22, 22, 14, 11, 26, 30, 30, 26, 36, 30, 13, 18]);
  sheet('QR_DGVC', ['Bản cài', 'Chỉ tiêu', 'APP', 'Excel', 'Khớp'], res.qr.map((q) => [q.inst, q.field, q.app, q.excel, q.ok ? 'KHỚP' : 'KHÁC']), [9, 44, 22, 22, 8]);
  sheet('BKVC', ['Xe', 'Dòng Excel', 'Chuyến APP', 'Chuyến Excel', 'KG APP', 'KG Excel', 'Thành tiền APP', 'Thành tiền Excel', 'VAT APP', 'VAT Excel', 'Sau VAT APP', 'Sau VAT Excel'],
    res.bkvc.map((l) => [l.plate, l.excelRow, l.app_trip_count, l.excel_trip_count, l.app_kg, l.excel_kg, l.app_amount, l.excel_amount, l.app_vat, l.excel_vat, l.app_amount_incl_vat, l.excel_amount_incl_vat]));
  sheet('PHIEU_CAN', ['Bản cài', 'Phiếu trong Excel (NL_VC)', 'Phiếu trong APP', 'Phiếu trong kỳ', 'Phiếu khớp đủ 16 cột', 'KG Excel', 'KG APP', 'Phiếu sửa LDĐ'],
    res.tickets.map((t) => [t.inst, t.excel, t.app, t.inPeriod, t.allFieldsSame, t.kgExcel, t.kgApp, t.lddFixed]), [9, 18, 14, 14, 18, 14, 14, 12]);
  sheet('DAU', ['Bản cài', 'Dòng Excel', 'Dòng APP', 'Dòng trong kỳ', 'Lít Excel', 'Lít APP', 'Giá dầu TB (tính lại từ bảng kê)', 'Giá dầu APP', 'Giá dầu QR_DGVC (2)', 'Dòng nhận trước kỳ'],
    res.fuel.map((f) => [f.inst, f.lines, f.appLines, f.inPeriod, f.liters, f.appLiters, f.avgExcelRecalc, f.appFuelPrice, f.qrFuelPrice, f.beforePeriod]));
  sheet('BK_MAU_CU', ['Xe', 'KG', 'Đơn giá', 'Thành tiền APP', 'Thành tiền Excel', 'VAT APP', 'VAT Excel'], [
    ...res.oldBk.map((b) => [b.plate, b.kg, b.price, b.appAmount, b.excelAmount, b.appVat, b.excelVat]),
    ['TỔNG', '', '', res.oldBkTotals.app.amount, res.oldBkTotals.excel.amount, res.oldBkTotals.app.vat, res.oldBkTotals.excel.vat],
    ['SAU VAT', '', '', res.oldBkTotals.app.total, res.oldBkTotals.excel.total, '', '']]);
  sheet('CAN_TRAM', ['Mục', 'Kết quả'], [
    ['Import khi không gán mã tuyến', res.can.noFixedValues || 'được'], ['Số lượt cân', res.can.rows], ['OK / cảnh báo / lỗi', `${res.can.summary.ok} / ${res.can.summary.warning} / ${res.can.summary.error}`],
    ['Chủ xe (từ cột "Cty VC")', Object.entries(res.can.owners).map(([k, v]) => `${k}: ${v}`).join(' · ')], ...res.can.warnings.map((w) => ['Cảnh báo', w])], [34, 90]);
  sheet('BKCT_EXCEL', ['Mục', 'Excel (sheet BKCT)', 'APP'], [
    ['Kỳ trên sheet', res.bkct.period, '( Vận chuyển từ ngày 18/09/2026 đến ngày 23/09/2026 )'],
    ['Số cột', res.bkct.excelColumns.length, 16], ['Tên cột', res.bkct.excelColumns.join(' | '), 'Thêm: Nguồn gốc, Khách hàng, LDĐ, Kiểu cân, Mã tuyến, Đơn vị VC'],
    ['Khối ký', 'Có (2 bên, Giám đốc + Kế toán)', 'Có (bổ sung ở Bước 14)']], [18, 70, 60]);
  await wb.xlsx.writeFile(file);
}

async function compareAll({ outFile } = {}) {
  const D = new Diff();
  const out = { qr: [], tickets: [], fuel: [], bkvc: [], oldBk: [], oldBkTotals: null, can: null, bkct: null, invoice: null };
  for (const inst of ['HAKQN', 'DH', 'HAK']) await compareInstall(inst, D, out);
  const groups = Object.values(D.rows.reduce((m, d) => { (m[d.rule] ||= { rule: d.rule, kind: d.kind, status: d.status, count: 0 }).count++; return m; }, {}));
  const unexplained = D.rows.filter((d) => d.status === 'CHƯA GIẢI THÍCH').length;
  const res = { at: new Date().toISOString(), summary: { checks: D.checks, same: D.checks - D.rows.length, diff: D.rows.length, explained: D.rows.length - unexplained, unexplained },
    scopes: Object.values(D.byScope), groups, diffs: D.rows, ...out };
  if (outFile) await writeReport(res, outFile);
  return res;
}

module.exports = { compareAll, RULES };

if (require.main === module) {
  const f = process.argv[2] || path.resolve(__dirname, '../../docs/SO_SANH_APP_EXCEL.xlsx');
  compareAll({ outFile: f }).then((r) => {
    console.log(`${r.summary.checks} phép so · ${r.summary.same} khớp · ${r.summary.diff} khác · chưa giải thích: ${r.summary.unexplained}`);
    for (const g of r.groups) console.log(`  ${g.status.padEnd(16)} ${g.kind.padEnd(13)} ${String(g.count).padStart(4)}  ${g.rule}`);
    for (const d of r.diffs.filter((x) => x.status === 'CHƯA GIẢI THÍCH').slice(0, 30)) console.log('  ?', d.scope, d.inst, d.key, d.field, JSON.stringify(d.app), '|', JSON.stringify(d.excel), d.where);
    console.log(`→ ${f}`);
    process.exitCode = r.summary.unexplained ? 1 : 0;
  }).catch((e) => { console.error(e); process.exit(1); });
}
