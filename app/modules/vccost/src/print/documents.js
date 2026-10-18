'use strict';
/**
 * Dữ liệu chứng từ in/ký (dùng chung cho Excel và PDF):
 *  - statementDoc: BẢNG KÊ chi phí vận chuyển giữa Bên A (bên thuê/thanh toán, cấu hình ở Cài đặt) và Bên B (đơn vị vận chuyển).
 *  - reportDoc: báo cáo tổng hợp theo xe / đơn vị / nơi xuất / ngày / đợt.
 */
const { docTienBangChu } = require('../utils/vnNumber');

const dmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '');
const dmyHm = (iso) => (iso && iso.length >= 16 ? `${dmy(iso)} ${iso.slice(11, 16)}` : dmy(iso));

function companyInfo(app) {
  const c = app.settings.get('company') || {};
  return { ten: c.ten || '', ma_so_thue: c.ma_so_thue || '', dia_chi: c.dia_chi || '', dai_dien: c.dai_dien || '', chuc_vu: c.chuc_vu || 'Giám đốc', nguoi_lap: c.nguoi_lap || '',
    xung_ho: c.xung_ho || '', dien_thoai: c.dien_thoai || '', email: c.email || '', noi_ky: c.noi_ky || '' };
}

/** Mô tả bộ lọc bằng tên (không phải id) để in trên chứng từ. */
function filterLabels(app, f = {}) {
  const out = [];
  const name = (sql, id) => { const r = app.db.get(sql, [id]); return r ? Object.values(r)[0] : `#${id}`; };
  if (f.tu_ngay || f.den_ngay) out.push(['Thời gian', `${f.tu_ngay ? dmy(f.tu_ngay) : '…'} → ${f.den_ngay ? dmy(f.den_ngay) : '…'}`]);
  if (f.dot_id) out.push(['Đợt/Tàu', name(`SELECT COALESCE(ten_tau||' '||COALESCE(voyage,''), ma_dot) FROM dot_van_chuyen WHERE id=?`, f.dot_id).trim()]);
  if (f.don_vi_id) out.push(['Đơn vị vận chuyển', name('SELECT ma FROM don_vi_van_chuyen WHERE id=?', f.don_vi_id)]);
  if (f.noi_xuat_id) out.push(['Nơi xuất', name('SELECT ten FROM dia_diem WHERE id=?', f.noi_xuat_id)]);
  if (f.tuyen_id) out.push(['Tuyến', name('SELECT ma_tuyen FROM tuyen_van_chuyen WHERE id=?', f.tuyen_id)]);
  if (f.bien_so) out.push(['Biển số', f.bien_so]);
  return out;
}

function routeNames(app) {
  return new Map(app.db.all(`SELECT t.id, t.ma_tuyen, dx.ten xuat, dd.ten den FROM tuyen_van_chuyen t JOIN dia_diem dx ON dx.id=t.noi_xuat_id JOIN dia_diem dd ON dd.id=t.noi_den_id`)
    .map((t) => [t.id, `${t.xuat} → ${t.den}`]));
}

/** Bên B đầy đủ thông tin in (tên in, đại diện, chức danh, kế toán, hợp đồng, TK ngân hàng). */
function carrierInfo(b) {
  return { ma: b.ma, ten: b.ten_in_bao_cao || b.ten || b.ma, ma_so_thue: b.ma_so_thue || '', dia_chi: b.dia_chi || '', dien_thoai: b.dien_thoai || '', email: b.email || '',
    dai_dien: b.dai_dien || b.nguoi_lien_he || '', xung_ho: b.xung_ho || '', chuc_vu: b.chuc_vu || 'Giám đốc', ke_toan: b.ke_toan || '',
    ngan_hang: b.ngan_hang || '', so_tai_khoan: b.so_tai_khoan || '', so_hop_dong: b.so_hop_dong || '', ngay_hop_dong: b.ngay_hop_dong || '', noi_ky: b.noi_ky || '' };
}

/** Hợp đồng còn hiệu lực của đơn vị vận chuyển tại ngày chứng từ (rơi về thông tin cũ trong đơn vị nếu chưa có). */
function contractFor(app, donViId, ngay) {
  const d = (ngay || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const row = app.db.get(`SELECT * FROM hop_dong WHERE don_vi_van_chuyen_id=? AND trang_thai='ACTIVE' AND (tu_ngay IS NULL OR tu_ngay<=?) AND (den_ngay IS NULL OR den_ngay>=?) ORDER BY COALESCE(tu_ngay,'') DESC LIMIT 1`, [donViId, d, d])
    || app.db.get(`SELECT * FROM hop_dong WHERE don_vi_van_chuyen_id=? AND trang_thai='ACTIVE' ORDER BY COALESCE(tu_ngay,'') DESC LIMIT 1`, [donViId]);
  return row || null;
}
const contractText = (c, benB, prefix = 'Căn cứ Hợp đồng vận chuyển') => {
  const so = (c && c.so_hop_dong) || benB.so_hop_dong, ngay = (c && c.ngay_ky) || benB.ngay_hop_dong;
  return so ? `${prefix} số ${so}${ngay ? ` ngày ${dmy(ngay)}` : ''}` : '';
};

function statementDoc(app, filter = {}, opt = {}) {
  const st = app.reports.statement(filter);
  const dot = filter.dot_id ? app.db.get('SELECT * FROM dot_van_chuyen WHERE id=?', [filter.dot_id]) : null;
  const rn = routeNames(app);
  st.lines.forEach((l) => { l.tuyen_ten = rn.get(l.tuyen_id) || l.tuyen; });
  const all = app.reports.tickets(filter, { offset: 0, limit: 10_000_000, sort: 'ngay_gio_can_1', dir: 'asc' }).rows;
  const tickets = all.filter((t) => (t.trang_thai_tinh_gia === 'OK' || t.trang_thai_tinh_gia === 'LOCKED') && t.don_gia !== null);
  const period = dot ? `Đợt/Tàu: ${[dot.ten_tau, dot.voyage].filter(Boolean).join(' ')} (${dot.ma_dot})${dot.tu_ngay ? ` — ${dmy(dot.tu_ngay)} → ${dmy(dot.den_ngay)}` : ''}`
    : (() => {   // không lọc ngày → lấy khoảng ngày thực tế của các phiếu trong bảng kê
      const ds = tickets.map((t) => (t.ngay_can || '').slice(0, 10)).filter(Boolean).sort();
      const tu = filter.tu_ngay || ds[0], den = filter.den_ngay || ds[ds.length - 1];
      return `Kỳ: ${tu ? dmy(tu) : '…'} → ${den ? dmy(den) : '…'}`;
    })();
  const extra = filterLabels(app, { ...filter, tu_ngay: null, den_ngay: null, dot_id: null, don_vi_id: null }).map(([k, v]) => `${k}: ${v}`).join('; ');
  const full = app.db.get('SELECT * FROM don_vi_van_chuyen WHERE id=?', [st.don_vi.id]) || st.don_vi;
  const benA = companyInfo(app), benB = carrierInfo(full);
  const hopDong = contractFor(app, st.don_vi.id, filter.den_ngay || (tickets[tickets.length - 1] && tickets[tickets.length - 1].ngay_can));
  if (hopDong && hopDong.noi_ky) benB.noi_ky = hopDong.noi_ky;
  const recon = opt.reconBatchId ? app.recon.weightByVehicle(Number(opt.reconBatchId)) : null;
  const thang = (() => { const d = (filter.den_ngay || (tickets[tickets.length - 1] && tickets[tickets.length - 1].ngay_can) || '').slice(0, 10); return d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; })();
  return {
    st, dot, tickets, period, extra, benA, benB, recon, thang,
    hopDong, tieu_de: (hopDong && hopDong.tieu_de_bao_cao) || 'BẢNG KÊ CHI PHÍ VẬN CHUYỂN', contract: contractText(hopDong, benB),
    bangChu: docTienBangChu(st.tong_tien), file: `BangKe_${st.don_vi.ma}_${dot ? dot.ma_dot : (filter.tu_ngay || (tickets[0] && tickets[0].ngay_can) || 'ky')}`,
  };
}

const REPORTS = {
  vehicle: { title: 'BÁO CÁO TỔNG HỢP THEO XE', key: 'Biển số', fn: 'byVehicle', text: true, extra: { header: 'Đơn vị VC', key: 'don_vi' } },
  carrier: { title: 'BÁO CÁO TỔNG HỢP THEO ĐƠN VỊ VẬN CHUYỂN', key: 'Đơn vị', fn: 'byCarrier', extra: { header: 'Số xe', key: 'so_xe', int: true } },
  origin: { title: 'BÁO CÁO TỔNG HỢP THEO NƠI XUẤT', key: 'Nơi xuất', fn: 'byOrigin', extra: { header: 'Số xe', key: 'so_xe', int: true } },
  date: { title: 'BÁO CÁO TỔNG HỢP THEO THỜI GIAN (NGÀY)', key: 'Ngày', fn: 'byDate', date: true, extra: { header: 'Số xe', key: 'so_xe', int: true } },
  dot: { title: 'BÁO CÁO TỔNG HỢP THEO ĐỢT / TÀU', key: 'Đợt / Tàu', fn: 'byDot', dot: true, extra: { header: 'Số xe', key: 'so_xe', int: true } },
};

function reportDoc(app, kind, filter = {}) {
  const def = REPORTS[kind];
  if (!def) throw new Error(`Báo cáo không tồn tại: ${kind}`);
  const rows = app.reports[def.fn](filter).map((r) => ({ ...r, label: def.date ? dmy(r.label) : r.label }));
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const tot = { so_chuyen: sum('so_chuyen'), tong_kg: sum('tong_kg'), tong_tan: sum('tong_tan'), tien_truoc_vat: sum('tien_truoc_vat'), tien_vat: sum('tien_vat'), tong_tien: sum('tong_tien') };
  return {
    kind, def, title: def.title, rows, tot, chuaTinh: sum('chua_tinh_gia'), filters: filterLabels(app, filter), benA: companyInfo(app),
    file: `BaoCao_${kind}`,
  };
}

module.exports = { contractFor, contractText, carrierInfo, statementDoc, reportDoc, REPORTS, companyInfo, filterLabels, dmy, dmyHm };
