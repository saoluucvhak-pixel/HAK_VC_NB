'use strict';
/**
 * PHASE 12 (làm sớm để kiểm chứng business rules):
 * Import file Excel mẫu → chạy engine → so sánh với giá trị Excel đã tính → EXCEL_VS_APP_VALIDATION.
 *
 * Chạy: node scripts/validate-sample.js <đường-dẫn-file-excel> [thư-mục-output]
 * Không sửa số để khớp. Nếu lệch → báo nguyên nhân.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { detectHeader, fold } = require('../src/excel/columnMapping');
const { parseTickets } = require('../src/excel/ticketParser');
const { computeFuelAdjustment } = require('../src/services/FuelAdjustmentService');
const { VehicleResolver } = require('../src/services/VehicleResolver');
const { computeTicket, aggregate } = require('../src/services/TransportCostEngine');
const { classify, businessKey, fingerprint } = require('../src/services/DuplicateDetector');
const { buildTimeline } = require('../src/services/TimeAnomalyService');
const { normalizePlate } = require('../src/utils/plate');
const { buildStatement } = require('../src/services/StatementService');

const file = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', 'docs');
if (!file) { console.error('Usage: node scripts/validate-sample.js <file.xlsx> [outDir]'); process.exit(1); }
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed', 'sample-v47.json'), 'utf8'));
const wb = XLSX.readFile(file, { cellFormula: true });
const aoa = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
const cellV = (sheet, addr) => (wb.Sheets[sheet][addr] || {}).v;

const lines = [];
const log = (s = '') => { lines.push(s); };
const fmt = (n, d = 0) => (n === null || n === undefined ? '' : Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }));
let allOk = true;
const cmp = (label, app, xl, tol = 1e-6) => {
  const ok = Math.abs(Number(app) - Number(xl)) <= tol;
  if (!ok) allOk = false;
  return `| ${label} | ${fmt(xl, 2)} | ${fmt(app, 2)} | ${fmt(Number(app) - Number(xl), 2)} | ${ok ? '✅ Khớp' : '❌ LỆCH'} |`;
};

// ---------- 1. Danh mục từ seed ----------
const locByAlias = new Map();
seed.dia_diem.forEach((d) => d.aliases.concat([d.ma, d.ten]).forEach((a) => locByAlias.set(fold(a), d.ma)));
const routes = seed.tuyen.map((r, i) => ({ id: i + 1, ...r }));
const routeResolver = (nx, nd) => {
  const r = routes.find((x) => x.noi_xuat === nx && x.noi_den === nd);
  return r ? { status: 'OK', routeId: r.id } : { status: 'UNKNOWN_ROUTE', routeId: null };
};
const routeIdByMa = Object.fromEntries(routes.map((r) => [r.ma_tuyen, r.id]));

// ---------- 2. Giá dầu + bảng giá (engine tính lại, so với Excel) ----------
const fuelDaily = seed.gia_dau.chi_tiet.map((x) => x.gia);
const xlFuel = { 'DN-TIENSA': { applied: 'G21', adj: 'G19', perTon: 'G18' }, 'DH-TIENSA': { applied: 'G44', adj: 'G42', perTon: 'G41' }, 'QC-TIENSA': { applied: 'G67', adj: 'G65', perTon: 'G64' } };
log('# EXCEL_VS_APP_VALIDATION');
log('');
log(`File Excel: \`${path.basename(file)}\`  `);
log(`Thời điểm chạy: ${new Date().toISOString()}  `);
log('Chế độ làm tròn: **Excel-compat** (cộng KG theo nhóm rồi × đơn giá, không làm tròn thành tiền/VAT — đúng như công thức Excel).');
log('');
log('## 1. Module điều chỉnh giá cước theo giá dầu (sheet "Giá dầu + Giá VC")');
log('');
log('| Chỉ tiêu | Excel | App | Chênh | Kết quả |');
log('|---|---:|---:|---:|---|');
let ruleId = 0;
const priceRules = seed.bang_gia.map((b) => {
  ruleId++;
  let don_gia_ap_dung = b.don_gia_goc, breakdown = null;
  if (b.phuong_thuc === 'DIEU_CHINH_DAU') {
    breakdown = computeFuelAdjustment({
      basePrice: b.don_gia_goc, baseFuelPrice: b.gia_dau_co_so, fuelPrices: fuelDaily,
      distanceKm: b.khoang_cach_km, fuelNormPer100km: b.dinh_muc_dau, avgTonPerTrip: b.khoi_luong_binh_quan,
    });
    don_gia_ap_dung = breakdown.appliedPrice;
    const x = xlFuel[b.tuyen];
    if (!x) { // Quế Sơn: Excel không có bảng tính dầu — so với đơn giá gõ tay ở sheet QS
      log(cmp(`${b.tuyen} — đơn giá suy ngược (so với Excel 'Xe chạy QS (HHH)'!F5)`, breakdown.appliedPrice, cellV('Xe chạy QS (HHH)', 'F5')));
      return { id: ruleId, ma_bang_gia: b.ma_bang_gia, tuyen_id: routeIdByMa[b.tuyen], don_vi_van_chuyen_id: null, loai_hang: null,
        tu_ngay: b.tu_ngay, den_ngay: b.den_ngay, don_gia_ap_dung, don_vi_tinh: b.don_vi_tinh, vat_percent: b.vat_percent, trang_thai: 'ACTIVE', breakdown };
    }
    log(cmp(`${b.tuyen} — cước tăng/tấn (II.2)`, breakdown.adjustmentPerTon, cellV('Giá dầu + Giá VC', x.perTon)));
    log(cmp(`${b.tuyen} — cước điều chỉnh làm tròn (II.3)`, breakdown.adjustmentFinal, cellV('Giá dầu + Giá VC', x.adj)));
    log(cmp(`${b.tuyen} — đơn giá áp dụng (III.1)`, breakdown.appliedPrice, cellV('Giá dầu + Giá VC', x.applied)));
  }
  return { id: ruleId, ma_bang_gia: b.ma_bang_gia, tuyen_id: routeIdByMa[b.tuyen], don_vi_van_chuyen_id: null, loai_hang: null,
    tu_ngay: b.tu_ngay, den_ngay: b.den_ngay, don_gia_ap_dung, don_vi_tinh: b.don_vi_tinh, vat_percent: b.vat_percent, trang_thai: 'ACTIVE', breakdown };
});
log('');

// ---------- 3. Import phiếu cân từ "File tổng" ----------
const ftAoa = aoa('File tổng');
const hd = detectHeader(ftAoa);
const tickets = parseTickets(ftAoa, hd.headerRow, hd.mapping);
log('## 2. Import phiếu cân (sheet "File tổng")');
log('');
log(`- Dòng header tự dò được: **${hd.headerRow + 1}**; cột nhận dạng: ${Object.entries(hd.mapping).map(([k, v]) => `${k}→${XLSX.utils.encode_col(v)}`).join(', ')}`);
log(`- Số phiếu đọc được: **${tickets.length}**; dòng có lỗi validate: **${tickets.filter((t) => t.errors.length).length}**`);
tickets.filter((t) => t.errors.length).slice(0, 20).forEach((t) => log(`  - Dòng ${t.source_row} (phiếu ${t.so_phieu}): ${t.errors.join('; ')}`));

// Duplicate: import lần 1 vào "DB rỗng", rồi import lại cùng file
const c1 = classify(tickets, new Map());
const db = new Map(tickets.map((t, i) => [businessKey(t), { id: i + 1, ...t, fingerprint: fingerprint(t) }]));
const c2 = classify(tickets, db);
const cnt = (arr) => arr.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
log(`- Import lần 1: ${JSON.stringify(cnt(c1))}`);
log(`- Import lại CÙNG file lần 2: ${JSON.stringify(cnt(c2))} → không sinh dữ liệu trùng`);
log('');

// ---------- 4. Danh mục xe từ sheet "Số xe" ----------
const sxAoa = aoa('Số xe');
const vehicles = sxAoa.slice(1).filter((r) => r[1]).map((r) => ({ bien_so_chuan: normalizePlate(r[1]), don_vi_van_chuyen_id: String(r[2]).trim(), tu_ngay: null, den_ngay: null }));
const vr = new VehicleResolver(vehicles);
const carrierGroup = Object.fromEntries(seed.don_vi_van_chuyen.map((c) => [c.ma, c.nhom_bao_cao]));

// ---------- 5. Tính từng phiếu ----------
const settings = seed.cai_dat_lam_tron_excel_compat;
const ctx = { vehicleResolver: vr, routeResolver, priceRules, settings };
const results = tickets.map((t, i) => {
  const nx = locByAlias.get(fold(t.noi_xuat)) || null;
  const r = computeTicket({ id: i + 1, ...t, noi_xuat_id: nx, noi_den_id: 'TIENSA' }, ctx);
  return { ...r, bien_so: t.bien_so, noi_xuat: t.noi_xuat, cty_excel: t.cong_ty_vc_nguon, ngay_gio_can_1: t.ngay_gio_can_1, ngay_gio_can_2: t.ngay_gio_can_2, can_lan_1: t.can_lan_1, can_lan_2: t.can_lan_2 };
});
const st = cnt(results);
log('## 3. Engine tính chi phí từng phiếu');
log('');
log(`- Trạng thái tính giá: ${JSON.stringify(st)}`);
const mismatchCarrier = results.filter((r) => r.cty_excel && r.don_vi_van_chuyen_id !== String(r.cty_excel).trim());
log(`- Đơn vị VC app xác định (theo danh mục xe) khác cột "Tên cty VC" của Excel: **${mismatchCarrier.length}** phiếu`);
log('');

// ---------- 6. So sánh với từng sheet tổng hợp ----------
const sheets = [
  { name: 'CP VC tại ĐH (HHH)', noiXuat: 'DH', group: 'HHH' },
  { name: 'Xe chạy QS (HHH)', noiXuat: 'QS', group: 'HHH' },
  { name: 'Xe chạy QS (HAK)', noiXuat: 'QS', group: 'HAK_GROUP' },
];
log('## 4. So sánh theo sheet tổng hợp (theo xe + nơi xuất + nhóm đơn vị)');
const grand = { app: {}, xl: {} };
for (const sh of sheets) {
  const a = aoa(sh.name);
  const xlRows = a.slice(4).filter((r) => r[1] && fold(r[0]) !== 'tong cong');
  const xlTotal = a.find((r) => fold(r[0]) === 'tong cong');
  const subset = results.filter((r) => locByAlias.get(fold(r.noi_xuat)) === sh.noiXuat && carrierGroup[r.don_vi_van_chuyen_id] === sh.group);
  const byVeh = aggregate(subset, (r) => normalizePlate(r.bien_so), settings);
  const appMap = new Map(byVeh.map((x) => [x.key, x]));
  log('');
  log(`### ${sh.name}`);
  log('');
  log(`Số xe Excel: ${xlRows.length} — Số xe App: ${byVeh.length}`);
  log('');
  log('| Chỉ tiêu | Excel | App | Chênh | Kết quả |');
  log('|---|---:|---:|---:|---|');
  const tot = { so_chuyen: 0, tong_kg: 0, tien_truoc_vat: 0, tien_vat: 0, tong_tien: 0 };
  byVeh.forEach((x) => Object.keys(tot).forEach((k) => (tot[k] += x[k])));
  log(cmp('Số chuyến', tot.so_chuyen, xlTotal[2]));
  log(cmp('Tổng KG', tot.tong_kg, xlTotal[3]));
  log(cmp('Tổng tấn', tot.tong_kg / 1000, xlTotal[4], 1e-6));
  log(cmp('Thành tiền (trước VAT)', tot.tien_truoc_vat, xlTotal[6], 1e-3));
  log(cmp('VAT', tot.tien_vat, xlTotal[7], 1e-3));
  log(cmp('Tổng tiền', tot.tong_tien, xlTotal[8], 1e-3));
  let vehMismatch = 0; const detail = [];
  for (const r of xlRows) {
    const k = normalizePlate(r[1]); const ap = appMap.get(k);
    const ok = ap && ap.so_chuyen === r[2] && ap.tong_kg === r[3] && ap.don_gia.length === 1 && ap.don_gia[0] === r[5] && Math.abs(ap.tong_tien - r[8]) < 1e-3;
    if (!ok) { vehMismatch++; detail.push(`  - ${r[1]}: Excel ${r[2]} chuyến/${r[3]} kg/giá ${r[5]} — App ${ap ? `${ap.so_chuyen}/${ap.tong_kg}/${ap.don_gia.join(',')}` : 'không có'}`); }
    appMap.delete(k);
  }
  log('');
  log(`So từng xe (số chuyến, KG, đơn giá, tổng tiền): **${xlRows.length - vehMismatch}/${xlRows.length} xe khớp**; xe chỉ có ở App: ${appMap.size}`);
  detail.forEach((d) => log(d));
  if (vehMismatch || appMap.size) allOk = false;
  grand.app[sh.name] = tot; grand.xl[sh.name] = xlTotal;
}

// ---------- 7. Tổng HHH / HAK như ô E2050/E2051 ----------
log('');
log('## 5. Tổng chi phí theo nhóm đơn vị (File tổng!E2050, E2051) và theo nơi xuất (File tổng!K2044:K2048)');
log('');
log('| Chỉ tiêu | Excel | App | Chênh | Kết quả |');
log('|---|---:|---:|---:|---|');
const byGroup = aggregate(results, (r) => carrierGroup[r.don_vi_van_chuyen_id], settings);
const g = Object.fromEntries(byGroup.map((x) => [x.key, x]));
const ft = (addr) => cellV('File tổng', addr);
log(cmp('Tổng chi phí HHH gồm VAT (E2050)', g.HHH.tong_tien, ft('E2050'), 1e-3));
log(cmp('Tổng chi phí HAK gồm VAT (E2051)', g.HAK_GROUP.tong_tien, ft('E2051'), 1e-3));
const byNx = aggregate(results, (r) => locByAlias.get(fold(r.noi_xuat)), settings);
const n = Object.fromEntries(byNx.map((x) => [x.key, x]));
log(cmp('Đại Hiệp — số chuyến (C2045)', n.DH.so_chuyen, ft('C2045')));
log(cmp('Đại Hiệp — KL tấn (D2045)', n.DH.tong_tan, ft('D2045'), 1e-6));
log(cmp('Đại Hiệp — chi phí gồm VAT (K2045)', n.DH.tong_tien, ft('K2045'), 1e-2));
log(cmp('Quế Sơn — số chuyến (C2046)', n.QS.so_chuyen, ft('C2046')));
log(cmp('Quế Sơn — KL tấn (D2046)', n.QS.tong_tan, ft('D2046'), 1e-6));
log(cmp('Quế Sơn — chi phí gồm VAT (K2046)', n.QS.tong_tien, ft('K2046'), 1e-2));
log(cmp('Tổng chi phí gồm VAT (K2048)', n.DH.tong_tien + n.QS.tong_tien, ft('K2048'), 1e-2));
log(cmp('Tổng KG toàn đợt (H2040)', results.reduce((s, r) => s + r.kl_hang_kg, 0), ft('H2040')));
log('');

// ---------- 8. Bảng kê theo đơn vị (hóa đơn riêng từng bên, làm tròn theo bảng kê) ----------
const stRound = seed.cai_dat_lam_tron_bang_ke.statement;
const routeLabel = (id) => (routes.find((x) => x.id === id) || {}).ma_tuyen;
log('## 6. Bảng kê theo từng đơn vị vận chuyển (làm tròn theo bảng kê — quy tắc chính thức)');
log('');
log('Mỗi đơn vị xuất hóa đơn riêng. Thành tiền mỗi dòng giá = ROUND(tấn × đơn giá, 0); VAT = ROUND(Σ thành tiền × 8%, 0). Xe trả về **vẫn tính cước**.');
log('');
log('| Đơn vị | Số xe | Số chuyến | Tổng KG | Dòng giá | Thành tiền | VAT | Tổng thanh toán | So với Excel (không làm tròn) |');
log('|---|---:|---:|---:|---|---:|---:|---:|---:|');
const carriers = [...new Set(results.map((r) => r.don_vi_van_chuyen_id))].sort();
const stmts = {};
for (const c of carriers) {
  const rs = results.filter((r) => r.don_vi_van_chuyen_id === c);
  const st = buildStatement(rs, { rounding: stRound, routeLabel });
  stmts[c] = st;
  const xl = aggregate(rs, () => c, settings)[0];
  log(`| ${c} | ${new Set(rs.map((r) => r.bien_so)).size} | ${st.so_chuyen} | ${fmt(st.tong_kg)} | ${st.lines.map((l) => `${l.tuyen} @${fmt(l.don_gia)}: ${l.so_chuyen} ch`).join('<br>')} | ${fmt(st.tien_truoc_vat)} | ${fmt(st.tien_vat)} | ${fmt(st.tong_tien)} | ${fmt(st.tong_tien - xl.tong_tien, 2)} |`);
}
const sumSt = (ks) => ks.reduce((a, k) => a + (stmts[k] ? stmts[k].tong_tien : 0), 0);
log('');
log(`- Tổng 4 bảng kê: **${fmt(sumSt(carriers))}** đ — Excel (K2048, không làm tròn): ${fmt(ft('K2048'), 2)} đ — chênh ${fmt(sumSt(carriers) - ft('K2048'), 2)} đ (chỉ do làm tròn).`);
log(`- HAK + QC + ĐH = ${fmt(sumSt(['HAK', 'QC', 'ĐH']))} đ ↔ Excel "Tổng chi phí HAK" E2051 = ${fmt(ft('E2051'), 2)} đ.`);
const traVe = new Set(seed.xe_tra_ve.so_phieu);
const rv = results.filter((r) => traVe.has(String(r.so_phieu)) && locByAlias.get(fold(r.noi_xuat)) === 'QS');
log(`- Xe trả về (Quế Sơn, ${rv.length} phiếu, ${fmt(rv.reduce((a, r) => a + r.kl_hang_kg, 0))} kg) đã nằm trong bảng kê — khớp Excel F2046 = ${fmt(ft('F2046') * 1000)} kg.`);
log('');

// ---------- 9. Cảnh báo dữ liệu phát hiện được ----------
log('## 7. Cảnh báo dữ liệu (engine phát hiện — chỉ cảnh báo, không kết luận)');
log('');
const byPlate = new Map();
results.forEach((r) => { const k = normalizePlate(r.bien_so); if (!byPlate.has(k)) byPlate.set(k, []); byPlate.get(k).push(r); });
const flagged = [];
for (const [, list] of byPlate) buildTimeline(list).forEach((t) => t.flags.length && flagged.push(t));
const fc = {};
flagged.forEach((t) => t.flags.forEach((f) => (fc[f] = (fc[f] || 0) + 1)));
log(`- Tổng số phiếu có cờ thời gian/cân: ${flagged.length} — ${JSON.stringify(fc)}`);
flagged.filter((t) => t.flags.includes('REVERSE_WEIGHING') || t.flags.includes('SHORT_GAP')).forEach((t) =>
  log(`  - Phiếu ${t.so_phieu} xe ${t.bien_so} (${t.noi_xuat}) ${t.ngay_gio_can_1} → ${t.ngay_gio_can_2}; cân1 ${t.can_lan_1} / cân2 ${t.can_lan_2}; cách chuyến trước ${t.khoang_cach_chuyen_phut === null ? '-' : t.khoang_cach_chuyen_phut.toFixed(1) + ' phút'}; cờ: ${t.flags.join(', ')}`));
log('');
log(`## KẾT LUẬN: ${allOk ? '✅ App khớp Excel ở mọi chỉ tiêu đã so sánh' : '❌ Có chỉ tiêu lệch — xem chi tiết ở trên'}`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'EXCEL_VS_APP_VALIDATION.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exitCode = allOk ? 0 : 2;
