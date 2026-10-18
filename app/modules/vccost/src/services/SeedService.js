'use strict';
/**
 * Nạp dữ liệu khởi tạo từ file JSON (data/seed/*.json) — dùng ĐÚNG luồng nghiệp vụ thật:
 * danh mục qua CatalogService, giá dầu → kỳ điều chỉnh → duyệt → bảng giá mới (PriceService).
 * Idempotent: bỏ qua bản ghi đã có (theo mã).
 */
const { toDb } = require('../utils/dbMoney');

class SeedService {
  constructor(db, { catalog, price, settings, audit }) { Object.assign(this, { db, catalog, price, settings, audit }); }

  load(seed) {
    return this.db.tx(() => {
      const st = { dia_diem: 0, tuyen: 0, don_vi: 0, gia_dau: 0, bang_gia: 0, ky: 0, dot: 0 };
      const loc = (ma) => this.db.get('SELECT id FROM dia_diem WHERE ma=?', [ma]);
      for (const d of seed.dia_diem || []) {
        let row = loc(d.ma);
        if (!row) { row = this.catalog.create('dia_diem', { ma: d.ma, ten: d.ten, loai: d.loai }); st.dia_diem++; }
        for (const a of d.aliases || []) {
          try { this.catalog.create('dia_diem_alias', { alias: a }, { parentId: row.id }); } catch (e) { /* alias đã có */ }
        }
      }
      for (const t of seed.tuyen || []) {
        if (this.db.get('SELECT id FROM tuyen_van_chuyen WHERE ma_tuyen=?', [t.ma_tuyen])) continue;
        this.catalog.create('tuyen_van_chuyen', { ma_tuyen: t.ma_tuyen, noi_xuat_id: loc(t.noi_xuat).id, noi_den_id: loc(t.noi_den).id, khoang_cach_km: t.khoang_cach_km, mo_ta: t.mo_ta });
        st.tuyen++;
      }
      for (const c of seed.don_vi_van_chuyen || []) {
        if (this.db.get('SELECT id FROM don_vi_van_chuyen WHERE ma=?', [c.ma])) continue;
        this.catalog.create('don_vi_van_chuyen', { ma: c.ma, ten: c.ten, nhom_bao_cao: c.nhom_bao_cao, ghi_chu: c.ghi_chu });
        st.don_vi++;
      }
      const gd = seed.gia_dau;
      if (gd) {
        for (const x of gd.chi_tiet) {
          if (this.db.get('SELECT id FROM gia_dau WHERE ngay=? AND loai_dau=?', [x.ngay, gd.loai_dau])) continue;
          this.catalog.create('gia_dau', { ngay: x.ngay, loai_dau: gd.loai_dau, gia: x.gia, nguon: gd.ky_tham_chieu });
          st.gia_dau++;
        }
      }
      // Bảng giá gốc (CO_DINH) mang theo tham số dầu của dòng DIEU_CHINH_DAU cùng tuyến
      const rules = seed.bang_gia || [];
      for (const b of rules.filter((x) => x.phuong_thuc === 'CO_DINH')) {
        if (this.db.get('SELECT id FROM bang_gia_van_chuyen WHERE ma_bang_gia=?', [b.ma_bang_gia])) continue;
        const adj = rules.find((x) => x.tuyen === b.tuyen && x.phuong_thuc === 'DIEU_CHINH_DAU') || {};
        const tuyen = this.db.get('SELECT id, khoang_cach_km FROM tuyen_van_chuyen WHERE ma_tuyen=?', [b.tuyen]);
        const r = {
          ma_bang_gia: b.ma_bang_gia, tuyen_id: tuyen.id, tu_ngay: b.tu_ngay, den_ngay: null, phuong_thuc: 'CO_DINH',
          don_gia_goc: toDb(b.don_gia_goc), don_gia_dieu_chinh: 0, don_gia_ap_dung: toDb(b.don_gia_goc), don_vi_tinh: b.don_vi_tinh, vat_percent: b.vat_percent,
          gia_dau_co_so: toDb(b.gia_dau_co_so ?? adj.gia_dau_co_so), dinh_muc_dau: adj.dinh_muc_dau ?? null, khoi_luong_binh_quan: adj.khoi_luong_binh_quan ?? null,
          khoang_cach_km: adj.khoang_cach_km ?? tuyen.khoang_cach_km, trang_thai: 'ACTIVE', ghi_chu: b.ghi_chu ?? null,
        };
        const cols = Object.keys(r);
        const id = this.db.run(`INSERT INTO bang_gia_van_chuyen(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((k) => r[k])).id;
        this.audit.log('SEED', 'bang_gia_van_chuyen', id, null, r);
        st.bang_gia++;
      }
      // Kỳ điều chỉnh giá dầu → duyệt → sinh bảng giá điều chỉnh
      const adjRules = rules.filter((x) => x.phuong_thuc === 'DIEU_CHINH_DAU');
      if (gd && adjRules.length) {
        const ngay = adjRules[0].tu_ngay;
        const ma = `KY-${ngay}`;
        if (!this.db.get('SELECT id FROM ky_dieu_chinh_gia_dau WHERE ma_ky=?', [ma])) {
          const days = gd.chi_tiet.map((x) => x.ngay).sort();
          const kyId = this.price.createFuelPeriod({ ma_ky: ma, loai_dau: gd.loai_dau, tu_ngay_tham_chieu: days[0], den_ngay_tham_chieu: days[days.length - 1], ngay_ap_dung: ngay, ghi_chu: gd.ky_tham_chieu });
          const out = this.price.approveFuelPeriod(kyId);
          st.ky++; st.bang_gia += out.created.length;
        }
      }
      const d = seed.dot_van_chuyen;
      if (d && !this.db.get('SELECT id FROM dot_van_chuyen WHERE ma_dot=?', [d.ma_dot])) {
        this.catalog.create('dot_van_chuyen', { ma_dot: d.ma_dot, ten_tau: d.ten_tau, voyage: d.voyage, tu_ngay: d.tu_ngay, den_ngay: d.den_ngay,
          khoi_luong_giam_dinh: d.khoi_luong_giam_dinh ?? null, noi_giao_id: d.noi_giao ? loc(d.noi_giao).id : null, ghi_chu: d.ghi_chu });
        st.dot++;
      }
      if (!this.settings.get('default_noi_den')) this.settings.set('default_noi_den', (seed.dia_diem || []).find((x) => x.loai === 'CANG')?.ma || null);
      return st;
    });
  }
}

module.exports = { SeedService };
