'use strict';
/**
 * 3 biểu mẫu in/ký hai bên (theo các sheet của file V.47):
 *  1) tauSummaryDoc  — TỔNG HỢP XUẤT HÀNG TÀU … tại <nơi xuất> của <đơn vị>: theo xe (số chuyến, KG, tấn, đơn giá, thành tiền, VAT, tổng).
 *  2) detailDoc      — BẢNG CHI TIẾT VẬN CHUYỂN: từng chuyến (phiếu cân) của từng xe, có cộng theo xe.
 *  3) priceDoc       — BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN theo giá dầu.
 * Mỗi đơn vị vận chuyển (Bên B) có bộ ký riêng cùng Bên A.
 */
const { docTienBangChu } = require('../utils/vnNumber');
const { companyInfo, carrierInfo, filterLabels, dmy, contractFor } = require('./documents');
const withContract = (app, d, ngay) => { const info = carrierInfo(d), c = contractFor(app, d.id, ngay); if (c) { if (c.so_hop_dong) info.so_hop_dong = c.so_hop_dong; if (c.ngay_ky) info.ngay_hop_dong = c.ngay_ky; if (c.noi_ky) info.noi_ky = c.noi_ky; } return info; };

const rd = (n) => Math.round(Number(n) || 0);
const dm = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '');

const { buildStatement, isPriced } = require('../services/StatementService');
/** Phiếu → dạng bảng kê dùng chung: mọi biểu mẫu dùng ĐÚNG quy tắc "đã tính giá" + làm tròn của Bảng kê. */
const toRes = (t) => ({ kl_hang_kg: t.kl_hang_kg, don_gia: t.don_gia, tuyen_id: t.tuyen_id, don_vi_tinh: t.don_vi_tinh, vat_percent: t.ty_le_vat, bien_so: t.bien_so, status: t.trang_thai_tinh_gia });
const pricedTicket = (t) => isPriced(toRes(t));
const stmtOf = (app, ts) => buildStatement(ts.map(toRes), { rounding: (app.settings.get('rounding') || {}).statement, routeLabel: (id) => String(id ?? '') });
/** Chia phần làm tròn chênh lệch vào dòng lớn nhất để các dòng cộng đúng tổng. */
function fit(rows, key, total) {
  if (!rows.length) return;
  const diff = Math.round(total) - rows.reduce((a, r) => a + r[key], 0);
  if (diff) rows.reduce((m, r) => (r[key] > m[key] ? r : m))[key] += diff;
}
function loadTickets(app, filter) {
  return app.reports.tickets(filter, { offset: 0, limit: 10_000_000, sort: 'ngay_gio_can_1', dir: 'asc' }).rows;
}
function carriers(app, ngay) {
  return new Map(app.db.all('SELECT * FROM don_vi_van_chuyen').map((d) => [d.ma, withContract(app, d, ngay)]));
}
function periodText(app, filter, tickets) {
  let dot = filter.dot_id ? app.db.get('SELECT * FROM dot_van_chuyen WHERE id=?', [filter.dot_id]) : null;
  if (!dot) { const codes = [...new Set(tickets.map((t) => t.dot).filter(Boolean))]; if (codes.length === 1) dot = app.db.get('SELECT * FROM dot_van_chuyen WHERE ma_dot=?', [codes[0]]); }
  const ds0 = tickets.map((t) => (t.ngay_can || '').slice(0, 10)).filter(Boolean).sort();
  if (!dot && ds0.length) { const c = app.db.all('SELECT * FROM dot_van_chuyen WHERE IFNULL(tu_ngay,\'0000\') <= ? AND IFNULL(den_ngay,\'9999\') >= ?', [ds0[ds0.length - 1], ds0[0]]); if (c.length === 1) dot = c[0]; }
  const ds = tickets.map((t) => (t.ngay_can || '').slice(0, 10)).filter(Boolean).sort();
  const tu = filter.tu_ngay || (dot && dot.tu_ngay) || ds[0], den = filter.den_ngay || (dot && dot.den_ngay) || ds[ds.length - 1];
  return { dot, tu, den, tauName: dot ? [dot.ten_tau, dot.voyage].filter(Boolean).join(' ') : '', text: `Đợt ngày ${tu ? dm(tu) : '…'} đến ${den ? `${dm(den)}-${den.slice(0, 4)}` : '…'}` };
}

function tauSummaryDoc(app, filter = {}) {
  const all = loadTickets(app, filter).filter(pricedTicket);
  const per = periodText(app, filter, all);
  const car = carriers(app, per.den), benA = companyInfo(app);
  const groups = new Map();
  for (const t of all) {
    const key = `${t.don_vi}|${t.noi_xuat || t.noi_xuat_goc || ''}|${t.noi_den || ''}`;
    if (!groups.has(key)) groups.set(key, { don_vi: t.don_vi, noi_xuat: t.noi_xuat || t.noi_xuat_goc || '', noi_den: t.noi_den || '', byCar: new Map(), ts: [] });
    const g = groups.get(key); g.ts.push(t); const k = `${t.bien_so}|${t.don_gia}|${t.ty_le_vat}`;
    const o = g.byCar.get(k) || { bien_so: t.bien_so, don_gia: t.don_gia, so_chuyen: 0, kg: 0, tien: 0, vat: 0, tong: 0 };
    o.so_chuyen += 1; o.kg += Number(t.kl_hang_kg) || 0; o.tien += Number(t.tien_truoc_vat) || 0; o.vat += Number(t.tien_vat) || 0; o.tong += Number(t.tong_tien) || 0;
    g.byCar.set(k, o);
  }
  const sections = [...groups.values()].sort((a, b) => (a.don_vi || '').localeCompare(b.don_vi || '') || a.noi_xuat.localeCompare(b.noi_xuat) || a.noi_den.localeCompare(b.noi_den)).map((g) => {
    const rows = [...g.byCar.values()].sort((a, b) => a.bien_so.localeCompare(b.bien_so) || a.don_gia - b.don_gia)
      .map((o) => ({ ...o, tan: o.kg / 1000, tien: rd(o.tien), vat: rd(o.vat) }));
    const st = stmtOf(app, g.ts); // tổng theo ĐÚNG quy tắc Bảng kê (làm tròn từng dòng giá, VAT 1 lần/thuế suất)
    fit(rows, 'tien', st.tien_truoc_vat); fit(rows, 'vat', st.tien_vat);
    for (const r of rows) r.tong = r.tien + r.vat;
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const tot = { xe: new Set(rows.map((r) => r.bien_so)).size, so_chuyen: sum('so_chuyen'), kg: sum('kg'), tan: sum('kg') / 1000, tien: st.tien_truoc_vat, vat: st.tien_vat, tong: st.tong_tien };
    const benB = car.get(g.don_vi) || { ma: g.don_vi, ten: g.don_vi };
    return { ...g, benB, rows, tot, bangChu: docTienBangChu(rd(tot.tong)),
      titleLines: [`BẢNG TỔNG HỢP VẬN CHUYỂN XUẤT HÀNG TÀU${per.tauName ? ` ${per.tauName.toUpperCase()}` : ' …………………'}`, `TUYẾN TỪ ${g.noi_xuat.toUpperCase()} ĐẾN ${(g.noi_den || '…………').toUpperCase()}`,
        `ĐỢT ${per.dot ? `${per.dot.ma_dot} ` : ''}${per.text.replace(/^Đợt /, '')}`],
      sheet: `${g.don_vi} ${g.noi_xuat}-${g.noi_den}` };
  });
  return { kind: 'tau', period: per, benA, sections, filters: filterLabels(app, filter), file: `TongHopTau_${per.dot ? per.dot.ma_dot : (per.tu || 'ky')}` };
}

function detailDoc(app, filter = {}) {
  const every = loadTickets(app, filter);
  const all = every.filter(pricedTicket); // cùng định nghĩa 'đã tính giá' với Bảng kê
  const per = periodText(app, filter, all);
  const car = carriers(app, per.den), benA = companyInfo(app);
  const byDv = new Map();
  const unpricedBy = new Map();
  for (const t of every) if (!pricedTicket(t)) { const k = t.don_vi || '(chưa gán đơn vị)'; unpricedBy.set(k, (unpricedBy.get(k) || 0) + 1); }
  for (const t of all) { const k = t.don_vi || '(chưa gán đơn vị)'; if (!byDv.has(k)) byDv.set(k, []); byDv.get(k).push(t); }
  const sections = [...byDv.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dv, ts]) => {
    const cars = new Map();
    for (const t of ts) { if (!cars.has(t.bien_so)) cars.set(t.bien_so, []); cars.get(t.bien_so).push(t); }
    const xes = [...cars.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bs, rows]) => ({ bien_so: bs, rows,
      so_chuyen: rows.length, kg: rows.reduce((a, r) => a + (Number(r.kl_hang_kg) || 0), 0), tien: rows.reduce((a, r) => a + (Number(r.tien_truoc_vat) || 0), 0) }));
    const st = stmtOf(app, ts);
    for (const x of xes) { x.rows = x.rows.map((t) => ({ ...t, tien_truoc_vat: rd(t.tien_truoc_vat) })); x.tien = rd(x.tien); fit(x.rows, 'tien_truoc_vat', x.tien); }
    fit(xes, 'tien', st.tien_truoc_vat);
    for (const x of xes) fit(x.rows, 'tien_truoc_vat', x.tien);
    const tot = { xe: xes.length, so_chuyen: ts.length, kg: xes.reduce((a, x) => a + x.kg, 0), tien: st.tien_truoc_vat, chuaTinh: unpricedBy.get(dv) || 0 };
    return { don_vi: dv, benB: car.get(dv) || { ma: dv, ten: dv }, xes, tot, sheet: dv, title: `BẢNG CHI TIẾT VẬN CHUYỂN${per.tauName ? ` — TÀU ${per.tauName.toUpperCase()}` : ''}` };
  });
  return { kind: 'detail', period: per, benA, sections, filters: filterLabels(app, filter), file: `ChiTietVanChuyen_${per.dot ? per.dot.ma_dot : (per.tu || 'ky')}` };
}

/** Các bước tính đơn giá của 1 tuyến (kiểu "Bảng tính đơn giá" DGVC: STT · Chỉ tiêu · Cách tính · Diễn giải · Giá trị · ĐVT). f = công thức Excel theo số bước. */
function priceSteps(x, sh) {
  const steps = []; const H = (t) => steps.push({ head: t });
  const S = (stt, label, how, note, value, unit, o = {}) => steps.push({ stt, label, how, note, value, unit, ...o });
  const fix = x.phuong_thuc !== 'DIEU_CHINH_DAU';
  const n0 = (v) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  const n2 = (v) => Number(v).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fix) {
    H('A. ĐƠN GIÁ THEO BẢNG GIÁ (giá cố định, không điều chỉnh theo dầu)');
    S(1, 'Đơn giá cước vận chuyển (chưa VAT)', 'Bảng giá', '', x.don_gia_goc, 'đ/tấn', { fmt: 'money', bold: true });
    return steps;
  }
  H('A. THÔNG SỐ THEO BẢNG GIÁ HỢP ĐỒNG');
  S(1, 'Đơn giá cước vận chuyển cơ sở (chưa VAT)', 'Bảng giá', '', x.don_gia_goc, 'đ/tấn', { fmt: 'money' });
  S(2, 'Khối lượng bình quân / chuyến', 'Bảng giá', '', x.tan_bq, 'tấn', { fmt: 'dec2' });
  S(3, 'Đơn giá 1 chuyến', '(1) × (2)', `${n0(x.don_gia_goc)} × ${n2(x.tan_bq)}`, x.don_gia_goc * x.tan_bq, 'đ/chuyến', { fmt: 'money', f: '{1}*{2}' });
  S(4, 'Cự ly chuyến (đi và về)', 'Danh mục tuyến / bảng giá', '', x.km, 'km', { fmt: 'dec2' });
  S(5, 'Định mức tiêu hao dầu diesel', 'Bảng giá', `${n2(x.dinh_muc)} lít/100 km`, x.dinh_muc / 100, 'lít/km', { fmt: 'dec4' });
  S(6, 'Dầu tiêu hao theo định mức / chuyến', '(4) × (5)', `${n2(x.km)} × ${(x.dinh_muc / 100).toLocaleString('vi-VN')}`, x.lit_chuyen, 'lít', { fmt: 'dec2', f: '{4}*{5}' });
  S(7, 'Đơn giá dầu cơ sở (chưa VAT)', 'Bảng giá', '', x.gia_dau_co_so, 'đ/lít', { fmt: 'dec2' });
  H('B. GIÁ DẦU ÁP DỤNG');
  S(8, 'Đơn giá dầu áp dụng (chưa VAT)', sh.so_ngay_gia ? `Bình quân ${sh.so_ngay_gia} ngày` : 'Giá dầu áp dụng', '', x.gia_dau_ap_dung, 'đ/lít', { fmt: 'dec2' });
  S(9, 'Chênh lệch giá dầu', '(8) − (7)', `${n2(x.gia_dau_ap_dung)} − ${n2(x.gia_dau_co_so)}`, x.chenh_dau, 'đ/lít', { fmt: 'dec2', f: '{8}-{7}' });
  H('C. ĐIỀU CHỈNH ĐƠN GIÁ THEO GIÁ DẦU');
  S(10, 'Chi phí chênh lệch dầu / chuyến', '(6) × (9)', `${n2(x.lit_chuyen)} × ${n2(x.chenh_dau)}`, x.cp_chenh_chuyen, 'đ/chuyến', { fmt: 'money2', f: '{6}*{9}' });
  S(11, 'Điều chỉnh / tấn (làm tròn đồng)', '(10) / (2)', `${n2(x.cp_chenh_chuyen)} / ${n2(x.tan_bq)}`, x.dc_tan, 'đ/tấn', { fmt: 'money', f: 'ROUND({10}/{2},0)' });
  S(12, 'Điều chỉnh / tấn làm tròn đến hàng trăm', '(11) làm tròn hàng trăm', '', x.dieu_chinh, 'đ/tấn', { fmt: 'money', f: 'ROUND({11},-2)' });
  S(13, 'ĐƠN GIÁ VẬN CHUYỂN (chưa VAT)', '(1) + (12)', `${n0(x.don_gia_goc)} + ${n0(x.dieu_chinh)}`, x.gia_moi, 'đ/tấn', { fmt: 'money', f: '{1}+{12}', bold: true });
  return steps;
}

function priceDoc(app, { ngay, gia_dau = null, dau_tu = null, dau_den = null, don_vi_id = null, tu_ngay = null, den_ngay = null } = {}) {
  const sh = app.price.priceSheet({ ngay: ngay || new Date().toISOString().slice(0, 10), gia_dau, dau_tu, dau_den });
  const row = don_vi_id ? app.db.get('SELECT * FROM don_vi_van_chuyen WHERE id=?', [don_vi_id]) : null;
  const benB = row ? withContract(app, row, den_ngay || ngay) : null;
  const sections = sh.rows.map((x) => {
    const rule = x.bang_gia ? app.db.get('SELECT tu_ngay FROM bang_gia_van_chuyen WHERE ma_bang_gia=?', [x.bang_gia]) : null;
    const sec = { x, rule, steps: x.thieu ? [] : priceSteps(x, sh), sheet: x.ma_tuyen, vat: x.vat_percent };
    if (!x.thieu && (tu_ngay || den_ngay)) {
      const f = { tuyen_id: x.tuyen_id, tu_ngay, den_ngay }; if (don_vi_id) f.don_vi_id = don_vi_id;
      const ts = app.reports.tickets(f, { offset: 0, limit: 10_000_000 }).rows.filter(pricedTicket);
      if (ts.length) { const st = stmtOf(app, ts); sec.kyTri = { so_chuyen: ts.length, tan: st.tong_tan, tien: st.tien_truoc_vat, vat: st.tien_vat, tong: st.tong_tien }; }
      if (sec.kyTri) sec.kyTri.bangChu = docTienBangChu(sec.kyTri.tong);
    }
    if (!x.thieu) sec.giaBangChu = docTienBangChu(x.gia_moi).replace(/ đồng\.?$/, ' đồng/tấn');
    return sec;
  });
  return { kind: 'price', sh, sections, benA: companyInfo(app), benB, tu_ngay, den_ngay, contract: benB && benB.so_hop_dong ? `Hợp đồng vận chuyển số ${benB.so_hop_dong}${benB.ngay_hop_dong ? ` ngày ${dmy(benB.ngay_hop_dong)}` : ''}` : '', file: `BangTinhDonGia_${sh.ngay}` };
}

module.exports = { tauSummaryDoc, detailDoc, priceDoc };
