'use strict';
/**
 * Báo cáo — tổng hợp bằng SQL (GROUP BY + index), không tải toàn bộ dữ liệu lên giao diện.
 * Tiền theo phiếu/xe là giá trị chưa làm tròn (tham khảo); SỐ THANH TOÁN chính thức = bảng kê (StatementService).
 */
const { fromDb } = require('../utils/dbMoney');
const { buildTimeline } = require('./TimeAnomalyService');
const { buildStatement } = require('./StatementService');
const { normalizePlate } = require('../utils/plate');

const MONEY = ['don_gia', 'tien_truoc_vat', 'tien_vat', 'tong_tien'];
const conv = (r) => { for (const k of MONEY) if (k in r) r[k] = fromDb(r[k]); return r; };

const SORTABLE = new Set(['so_phieu', 'ngay_gio_can_1', 'bien_so', 'kl_hang_kg', 'noi_xuat', 'don_gia', 'tong_tien', 'tien_truoc_vat', 'don_vi', 'trang_thai_tinh_gia', 'id']);

/** Phiếu "đã tính giá" — cùng định nghĩa với Bảng kê (StatementService.isPriced) + phải có đơn vị vận chuyển. */
const pricedSql = (a = 'p') => `(${a}.trang_thai_tinh_gia IN ('OK','LOCKED') AND ${a}.don_gia IS NOT NULL AND ${a}.ty_le_vat IS NOT NULL AND ${a}.kl_hang_kg > 0 AND ${a}.don_vi_van_chuyen_id IS NOT NULL)`;

class ReportService {
  constructor(db, settings) { this.db = db; this.settings = settings; }

  where(f = {}, alias = 'p') {
    const w = [`${alias}.trang_thai='ACTIVE'`]; const p = [];
    const add = (sql, ...v) => { w.push(sql); p.push(...v); };
    if (f.tu_ngay) add(`${alias}.ngay_can >= ?`, f.tu_ngay);
    if (f.den_ngay) add(`${alias}.ngay_can <= ?`, f.den_ngay);
    if (f.dot_id) add(`${alias}.dot_van_chuyen_id = ?`, f.dot_id);
    if (f.noi_xuat_id) add(`${alias}.noi_xuat_id = ?`, f.noi_xuat_id);
    if (f.tuyen_id) add(`${alias}.tuyen_id = ?`, f.tuyen_id);
    if (f.don_vi_id) add(`${alias}.don_vi_van_chuyen_id = ?`, f.don_vi_id);
    if (f.bien_so) add(`${alias}.bien_so_chuan = ?`, normalizePlate(f.bien_so));
    if (f.trang_thai_tinh_gia) add(`${alias}.trang_thai_tinh_gia = ?`, f.trang_thai_tinh_gia);
    if (f.chua_tinh_gia) w.push(`NOT ${pricedSql(alias)}`);
    if (f.da_tinh_gia) w.push(pricedSql(alias));
    if (f.chua_chot) w.push(`${alias}.chot_ky_id IS NULL`);
    if (f.chot_ky_id) add(`${alias}.chot_ky_id = ?`, f.chot_ky_id);
    if (f.search) { const s = `%${f.search}%`; add(`(${alias}.so_phieu LIKE ? OR ${alias}.bien_so LIKE ? OR ${alias}.noi_xuat_goc LIKE ?)`, s, s, s); }
    return { sql: w.join(' AND '), params: p };
  }

  /** Chi tiết vận chuyển (phân trang phía SQL). */
  tickets(f = {}, { offset = 0, limit = 100, sort = 'ngay_gio_can_1', dir = 'asc' } = {}) {
    const { sql, params } = this.where(f);
    const col = SORTABLE.has(sort) ? (sort === 'don_vi' ? 'd.ma' : `p.${sort}`) : 'p.ngay_gio_can_1';
    const base = `FROM phieu_can p LEFT JOIN don_vi_van_chuyen d ON d.id=p.don_vi_van_chuyen_id LEFT JOIN tuyen_van_chuyen t ON t.id=p.tuyen_id
                  LEFT JOIN dot_van_chuyen dt ON dt.id=p.dot_van_chuyen_id WHERE ${sql}`;
    const tot = this.db.get(`SELECT COUNT(*) n, SUM(p.kl_hang_kg) kg, SUM(p.tien_truoc_vat) tien_truoc_vat, SUM(p.tien_vat) tien_vat, SUM(p.tong_tien) tong_tien ${base}`, params);
    const rows = this.db.all(`SELECT p.id, p.so_phieu, p.ngay_can, p.ngay_gio_can_1, p.ngay_gio_can_2, p.bien_so, d.ma AS don_vi, p.noi_xuat, p.noi_xuat_goc, p.noi_den,
        t.ma_tuyen AS tuyen, p.tuyen_id, p.don_vi_tinh, p.can_lan_1, p.can_lan_2, p.kl_hang_kg, p.kl_hang_tan, p.don_gia, p.tien_truoc_vat, p.ty_le_vat, p.tien_vat, p.tong_tien,
        dt.ma_dot AS dot, p.trang_thai_tinh_gia, p.trang_thai_doi_chieu, p.xe_tra_ve, p.chot_ky_id, p.ghi_chu, p.bang_gia_id
        ${base} ORDER BY ${col} ${dir === 'desc' ? 'DESC' : 'ASC'}, p.id LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params).map(conv);
    return { total: tot.n, totals: { so_chuyen: tot.n, tong_kg: tot.kg || 0, tien_truoc_vat: fromDb(tot.tien_truoc_vat) || 0, tien_vat: fromDb(tot.tien_vat) || 0, tong_tien: fromDb(tot.tong_tien) || 0 }, rows };
  }

  _group(f, keySql, labelSql, extraJoin = '') {
    const { sql, params } = this.where(f);
    return this.db.all(`SELECT ${keySql} AS k, ${labelSql} AS label, COUNT(*) so_chuyen, COUNT(DISTINCT p.bien_so_chuan) so_xe,
        SUM(p.kl_hang_kg) tong_kg, SUM(p.kl_hang_kg)/1000.0 tong_tan, group_concat(DISTINCT p.don_gia) don_gia_list,
        SUM(p.tien_truoc_vat) tien_truoc_vat, SUM(p.tien_vat) tien_vat, SUM(p.tong_tien) tong_tien,
        SUM(CASE WHEN p.trang_thai_tinh_gia NOT IN ('OK','LOCKED') THEN 1 ELSE 0 END) chua_tinh_gia
      FROM phieu_can p LEFT JOIN don_vi_van_chuyen d ON d.id=p.don_vi_van_chuyen_id ${extraJoin}
      WHERE ${sql} GROUP BY ${keySql} ORDER BY label`, params)
      .map((r) => ({ ...conv(r), don_gia: (r.don_gia_list ? String(r.don_gia_list).split(',').map((x) => fromDb(Number(x))).sort((a, b) => a - b) : []) }));
  }

  byVehicle(f = {}) {
    const { sql, params } = this.where(f);
    return this.db.all(`SELECT p.bien_so_chuan k, MIN(p.bien_so) label, group_concat(DISTINCT d.ma) don_vi, COUNT(*) so_chuyen,
        SUM(p.kl_hang_kg) tong_kg, SUM(p.kl_hang_kg)/1000.0 tong_tan, group_concat(DISTINCT p.don_gia) don_gia_list,
        SUM(p.tien_truoc_vat) tien_truoc_vat, SUM(p.tien_vat) tien_vat, SUM(p.tong_tien) tong_tien,
        SUM(CASE WHEN p.trang_thai_tinh_gia NOT IN ('OK','LOCKED') THEN 1 ELSE 0 END) chua_tinh_gia
      FROM phieu_can p LEFT JOIN don_vi_van_chuyen d ON d.id=p.don_vi_van_chuyen_id WHERE ${sql}
      GROUP BY p.bien_so_chuan ORDER BY label`, params)
      .map((r) => ({ ...conv(r), don_gia: r.don_gia_list ? String(r.don_gia_list).split(',').map((x) => fromDb(Number(x))).sort((a, b) => a - b) : [] }));
  }
  byCarrier(f = {}) { return this._group(f, 'p.don_vi_van_chuyen_id', `COALESCE(d.ma, '(Chưa xác định)')`); }
  byOrigin(f = {}) { return this._group(f, 'p.noi_xuat_id', `COALESCE(p.noi_xuat, p.noi_xuat_goc, '(Chưa xác định)')`); }
  byDate(f = {}) { return this._group(f, 'p.ngay_can', 'p.ngay_can'); }
  /** Theo đợt/tàu. KL giám định chỉ để đối chiếu — cước luôn tính theo KL cân (chốt 07/10/2026). */
  byDot(f = {}) {
    return this._group(f, 'p.dot_van_chuyen_id', `COALESCE(dt.ma_dot, '(Chưa gán đợt)')`, 'LEFT JOIN dot_van_chuyen dt ON dt.id=p.dot_van_chuyen_id').map((r) => ({ ...r, ...this.giamDinh(r.k, r.tong_tan) }));
  }
  /** {kl_giam_dinh_tan, chenh_giam_dinh_tan (giám định − cân), chenh_giam_dinh_pct} hoặc null khi đợt chưa nhập KL giám định. */
  giamDinh(dotId, tongTanCan) {
    const d = dotId ? this.db.get('SELECT khoi_luong_giam_dinh gd FROM dot_van_chuyen WHERE id=?', [dotId]) : null;
    if (!d || d.gd === null || d.gd === undefined) return { kl_giam_dinh_tan: null, chenh_giam_dinh_tan: null, chenh_giam_dinh_pct: null };
    const chenh = Math.round((d.gd - tongTanCan) * 1000) / 1000;
    return { kl_giam_dinh_tan: d.gd, chenh_giam_dinh_tan: chenh, chenh_giam_dinh_pct: tongTanCan ? Math.round((chenh / tongTanCan) * 1e6) / 1e4 : null };
  }

  /** Timeline 1 xe (MASTER_PROMPT XVIII). */
  timeline(bienSo, { tu_ngay, den_ngay } = {}) {
    const { sql, params } = this.where({ bien_so: bienSo, tu_ngay, den_ngay });
    const rows = this.db.all(`SELECT p.id, p.so_phieu, p.ngay_can, p.ngay_gio_can_1, p.ngay_gio_can_2, p.bien_so, p.noi_xuat, p.noi_xuat_goc, p.noi_den,
        p.can_lan_1, p.can_lan_2, p.kl_hang_kg, p.kl_hang_tan, p.don_gia, p.tien_truoc_vat, p.tien_vat, p.tong_tien, d.ma don_vi
        FROM phieu_can p LEFT JOIN don_vi_van_chuyen d ON d.id=p.don_vi_van_chuyen_id WHERE ${sql}`, params).map(conv);
    return buildTimeline(rows, this.settings.get('time_anomaly') || {});
  }

  /** Bảng kê 1 đơn vị (làm tròn theo bảng kê). */
  statement(f) {
    if (!f || !f.don_vi_id) throw new Error('Cần chọn đơn vị vận chuyển');
    const { sql, params } = this.where(f);
    const rows = this.db.all(`SELECT p.kl_hang_kg, p.don_gia, p.tuyen_id, p.don_vi_tinh, p.ty_le_vat AS vat_percent, p.bien_so, p.trang_thai_tinh_gia AS status
                              FROM phieu_can p WHERE ${sql}`, params).map(conv);
    const routes = new Map(this.db.all('SELECT id, ma_tuyen FROM tuyen_van_chuyen').map((t) => [t.id, t.ma_tuyen]));
    const r = this.settings.get('rounding') || {};
    const st = buildStatement(rows, { rounding: r.statement, routeLabel: (id) => routes.get(id) || '(chưa có tuyến)' });
    st.don_vi = this.db.get('SELECT * FROM don_vi_van_chuyen WHERE id=?', [f.don_vi_id]);
    return st;
  }

  statements(f = {}) {
    const ids = this.db.all(`SELECT DISTINCT p.don_vi_van_chuyen_id id FROM phieu_can p WHERE ${this.where(f).sql} AND p.don_vi_van_chuyen_id IS NOT NULL`, this.where(f).params);
    return ids.map((x) => this.statement({ ...f, don_vi_id: x.id }));
  }

  dashboard(f = {}) {
    const pf = { ...f, da_tinh_gia: true }; // số liệu chính: CHỈ phiếu đã tính giá (khớp Bảng kê)
    const { sql, params } = this.where(pf);
    const k = this.db.get(`SELECT COUNT(*) so_chuyen, COALESCE(SUM(kl_hang_kg),0) tong_kg, COALESCE(SUM(tien_truoc_vat),0) tien_truoc_vat, COALESCE(SUM(tien_vat),0) tien_vat,
        COALESCE(SUM(tong_tien),0) tong_tien, COUNT(DISTINCT bien_so_chuan) so_xe, COUNT(DISTINCT don_vi_van_chuyen_id) so_don_vi,
        SUM(CASE WHEN chot_ky_id IS NOT NULL THEN 1 ELSE 0 END) da_chot
      FROM phieu_can p WHERE ${sql}`, params);
    for (const m of ['tien_truoc_vat', 'tien_vat', 'tong_tien']) k[m] = fromDb(k[m]);
    // Phiếu CHƯA tính giá (cùng bộ lọc): đếm, KL, theo từng lý do
    const u = this.where({ ...f, chua_tinh_gia: true });
    const un = this.db.get(`SELECT COUNT(*) so_chuyen, COALESCE(SUM(kl_hang_kg),0) tong_kg FROM phieu_can p WHERE ${u.sql}`, u.params);
    const unBy = this.db.all(`SELECT CASE WHEN p.trang_thai_tinh_gia IN ('OK','LOCKED') THEN 'THIEU_DU_LIEU_GIA' ELSE p.trang_thai_tinh_gia END trang_thai, COUNT(*) so_chuyen, COALESCE(SUM(kl_hang_kg),0) tong_kg
                              FROM phieu_can p WHERE ${u.sql} GROUP BY 1 ORDER BY 2 DESC`, u.params);
    const w = this.where(f);
    const o = this.db.get(`SELECT SUM(CASE WHEN trang_thai_doi_chieu IN ('CHUA_DOI_CHIEU','LECH') THEN 1 ELSE 0 END) can_doi_chieu FROM phieu_can p WHERE ${w.sql}`, w.params);
    k.can_doi_chieu = o.can_doi_chieu || 0;
    k.chua_tinh = { so_chuyen: un.so_chuyen, tong_kg: un.tong_kg, theo_trang_thai: unBy };
    f = pf;
    const top = (order) => this.db.all(`SELECT MIN(p.bien_so) label, COUNT(*) so_chuyen, SUM(kl_hang_kg) tong_kg FROM phieu_can p WHERE ${sql}
                                        GROUP BY bien_so_chuan ORDER BY ${order} DESC LIMIT 10`, params);
    return {
      kpi: k,
      byDate: this.byDate(f).map((r) => ({ label: r.label, so_chuyen: r.so_chuyen, tong_tan: r.tong_tan, tong_tien: r.tong_tien })),
      byOrigin: this.byOrigin(f).map((r) => ({ label: r.label, tong_tan: r.tong_tan, so_chuyen: r.so_chuyen })),
      byCarrier: this.byCarrier(f).map((r) => ({ label: r.label, tong_tien: r.tong_tien, so_chuyen: r.so_chuyen })),
      giamDinh: f.dot_id ? this.giamDinh(f.dot_id, k.tong_kg / 1000) : null,
      topTrips: top('so_chuyen'), topWeight: top('tong_kg'),
    };
  }
}

module.exports = { ReportService };
