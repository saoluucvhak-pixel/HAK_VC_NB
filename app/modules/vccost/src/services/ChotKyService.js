'use strict';
/**
 * CHỐT KỲ — khóa số liệu một đợt (tàu) hoặc một khoảng ngày để ký Bảng kê / xuất hóa đơn.
 *  - Chỉ chốt khi MỌI phiếu trong phạm vi đã tính giá (không còn phiếu thiếu giá/xe/đơn vị).
 *  - Chốt = lưu ảnh chụp (snapshot) từng phiếu + tổng theo ĐÚNG quy tắc Bảng kê, gắn chot_ky_id vào phiếu.
 *  - Phiếu đã chốt: không tính lại, không sửa, không hoàn tác import; trigger DB chặn thêm 1 lớp.
 *  - Chốt theo ĐỢT: đợt chuyển KHOA. Mở khóa bắt buộc có lý do, ghi nhật ký; đợt trở lại MO.
 */
const { toDb, fromDb } = require('../utils/dbMoney');
const { ValidationError } = require('./CatalogService');

class ChotKyService {
  constructor(db, { audit, reports }) { Object.assign(this, { db, audit, reports }); }

  _filter(o = {}) {
    const loai = o.loai === 'DOT' ? 'DOT' : 'KY';
    if (loai === 'DOT' && !o.dot_id) throw new ValidationError('Chọn đợt / tàu cần chốt');
    if (loai === 'KY' && (!o.tu_ngay || !o.den_ngay)) throw new ValidationError('Chọn từ ngày – đến ngày của kỳ');
    if (loai === 'KY' && o.tu_ngay > o.den_ngay) throw new ValidationError('Từ ngày phải trước hoặc bằng đến ngày');
    const f = { chua_chot: true };
    if (loai === 'DOT') f.dot_id = Number(o.dot_id); else { f.tu_ngay = o.tu_ngay; f.den_ngay = o.den_ngay; }
    if (o.don_vi_id) f.don_vi_id = Number(o.don_vi_id);
    return { loai, f };
  }

  /** Xem trước: số phiếu, tổng theo Bảng kê, phiếu chưa tính giá (chặn chốt). */
  preview(o) {
    const { loai, f } = this._filter(o);
    const { sql, params } = this.reports.where(f);
    const n = this.db.get(`SELECT COUNT(*) n FROM phieu_can p WHERE ${sql}`, params).n;
    const u = this.reports.where({ ...f, chua_tinh_gia: true });
    const un = this.db.all(`SELECT CASE WHEN p.trang_thai_tinh_gia IN ('OK','LOCKED') THEN 'THIEU_DU_LIEU_GIA' ELSE p.trang_thai_tinh_gia END trang_thai, COUNT(*) so_chuyen
                            FROM phieu_can p WHERE ${u.sql} GROUP BY 1 ORDER BY 2 DESC`, u.params);
    const statements = this.reports.statements({ ...f, da_tinh_gia: true }).map((s) => ({
      don_vi: s.don_vi.ma, so_chuyen: s.so_chuyen, tong_kg: s.tong_kg, tien_truoc_vat: s.tien_truoc_vat, tien_vat: s.tien_vat, tong_tien: s.tong_tien }));
    const tot = statements.reduce((a, s) => ({ so_chuyen: a.so_chuyen + s.so_chuyen, tong_kg: a.tong_kg + s.tong_kg, tien_truoc_vat: a.tien_truoc_vat + s.tien_truoc_vat, tien_vat: a.tien_vat + s.tien_vat, tong_tien: a.tong_tien + s.tong_tien }),
      { so_chuyen: 0, tong_kg: 0, tien_truoc_vat: 0, tien_vat: 0, tong_tien: 0 });
    const da = this.reports.where({ ...f, chua_chot: false });
    const daChot = this.db.get(`SELECT COUNT(*) n FROM phieu_can p WHERE ${da.sql} AND p.chot_ky_id IS NOT NULL`, da.params).n;
    return { loai, so_phieu: n, chua_tinh_gia: un.reduce((a, x) => a + x.so_chuyen, 0), chua_tinh_theo_ly_do: un, statements, tong: tot, da_chot_truoc_do: daChot,
      chot_duoc: n > 0 && !un.length };
  }

  _ma() {
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const c = this.db.get(`SELECT COUNT(*) n FROM chot_ky WHERE ma LIKE ?`, [`CK-${ym}-%`]).n;
    return `CK-${ym}-${String(c + 1).padStart(3, '0')}`;
  }

  lock(o) {
    const { loai, f } = this._filter(o);
    return this.db.tx(() => {
      const pv = this.preview(o);
      if (!pv.so_phieu) throw new ValidationError('Không có phiếu nào chưa chốt trong phạm vi này');
      if (pv.chua_tinh_gia) throw new ValidationError(`Còn ${pv.chua_tinh_gia} phiếu chưa tính giá trong phạm vi (${pv.chua_tinh_theo_ly_do.map((x) => `${x.trang_thai}: ${x.so_chuyen}`).join(', ')}). Xử lý xong mới chốt được.`);
      if (loai === 'DOT') {
        const d = this.db.get('SELECT * FROM dot_van_chuyen WHERE id=?', [f.dot_id]);
        if (!d) throw new ValidationError('Đợt không tồn tại');
      }
      const ma = this._ma();
      const id = this.db.run(`INSERT INTO chot_ky(ma, loai, dot_van_chuyen_id, tu_ngay, den_ngay, don_vi_van_chuyen_id, trang_thai, so_phieu, tong_kg, tien_truoc_vat, tien_vat, tong_tien, ghi_chu)
        VALUES (?,?,?,?,?,?, 'DA_CHOT', ?,?,?,?,?, ?)`, [ma, loai, f.dot_id || null, f.tu_ngay || null, f.den_ngay || null, f.don_vi_id || null,
        pv.tong.so_chuyen, pv.tong.tong_kg, toDb(pv.tong.tien_truoc_vat), toDb(pv.tong.tien_vat), toDb(pv.tong.tong_tien), o.ghi_chu || null]).id;
      const { sql, params } = this.reports.where({ ...f, da_tinh_gia: true });
      const rows = this.db.all(`SELECT p.* FROM phieu_can p WHERE ${sql}`, params);
      for (const r of rows) {
        this.db.run(`INSERT INTO chot_ky_snapshot(chot_ky_id, phieu_can_id, kl_hang_kg, don_gia, ty_le_vat, tien_truoc_vat, tien_vat, tong_tien, bang_gia_id, don_vi_van_chuyen_id, tuyen_id, snapshot_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [id, r.id, r.kl_hang_kg, r.don_gia, r.ty_le_vat, r.tien_truoc_vat, r.tien_vat, r.tong_tien, r.bang_gia_id, r.don_vi_van_chuyen_id, r.tuyen_id, JSON.stringify(r)]);
      }
      this.db.run(`UPDATE phieu_can SET chot_ky_id=? WHERE id IN (SELECT phieu_can_id FROM chot_ky_snapshot WHERE chot_ky_id=?)`, [id, id]);
      if (loai === 'DOT') this.db.run(`UPDATE dot_van_chuyen SET trang_thai='KHOA' WHERE id=?`, [f.dot_id]);
      this.audit.log('LOCK_PERIOD', 'chot_ky', id, null, { ma, loai, so_phieu: rows.length, tong: pv.tong }, o.ghi_chu || null);
      return { id, ma, so_phieu: rows.length, tong: pv.tong };
    });
  }

  list() {
    return this.db.all(`SELECT k.*, d.ma_dot, v.ma don_vi FROM chot_ky k LEFT JOIN dot_van_chuyen d ON d.id=k.dot_van_chuyen_id
                        LEFT JOIN don_vi_van_chuyen v ON v.id=k.don_vi_van_chuyen_id ORDER BY k.id DESC`)
      .map((k) => ({ ...k, tien_truoc_vat: fromDb(k.tien_truoc_vat), tien_vat: fromDb(k.tien_vat), tong_tien: fromDb(k.tong_tien) }));
  }

  unlock(id, reason) {
    if (!reason || !String(reason).trim()) throw new ValidationError('Cần ghi lý do mở khóa');
    return this.db.tx(() => {
      const k = this.db.get('SELECT * FROM chot_ky WHERE id=?', [id]);
      if (!k) throw new ValidationError('Không tìm thấy kỳ chốt');
      if (k.trang_thai !== 'DA_CHOT') throw new ValidationError('Kỳ này đã được mở khóa');
      const n = this.db.run(`UPDATE phieu_can SET chot_ky_id=NULL WHERE chot_ky_id=?`, [id]).changes;
      this.db.run(`UPDATE chot_ky SET trang_thai='DA_MO_KHOA', mo_khoa_luc=strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), ly_do_mo_khoa=? WHERE id=?`, [String(reason).trim(), id]);
      if (k.loai === 'DOT' && k.dot_van_chuyen_id) {
        const other = this.db.get(`SELECT COUNT(*) n FROM chot_ky WHERE dot_van_chuyen_id=? AND trang_thai='DA_CHOT' AND id<>?`, [k.dot_van_chuyen_id, id]).n;
        if (!other) this.db.run(`UPDATE dot_van_chuyen SET trang_thai='MO' WHERE id=?`, [k.dot_van_chuyen_id]);
      }
      this.audit.log('UNLOCK_PERIOD', 'chot_ky', id, { trang_thai: 'DA_CHOT' }, { trang_thai: 'DA_MO_KHOA', so_phieu: n }, String(reason).trim());
      return { ok: true, so_phieu: n };
    });
  }

  /** Phiếu mới (import) rơi vào kỳ ngày đã chốt → chặn, tránh số liệu đã ký bị thay đổi. */
  assertOpenForDates(dates) {
    const ds = [...new Set(dates.filter(Boolean))];
    if (!ds.length) return;
    const k = this.db.all(`SELECT ma, tu_ngay, den_ngay FROM chot_ky WHERE loai='KY' AND trang_thai='DA_CHOT'`);
    const hit = ds.filter((d) => k.some((x) => d >= x.tu_ngay && d <= x.den_ngay));
    if (hit.length) {
      const ky = k.filter((x) => hit.some((d) => d >= x.tu_ngay && d <= x.den_ngay)).map((x) => x.ma);
      throw new ValidationError(`Có phiếu mới thuộc kỳ đã chốt (${[...new Set(ky)].join(', ')}), ngày ${hit.slice(0, 3).join(', ')}${hit.length > 3 ? '…' : ''}. Mở khóa kỳ trước khi import thêm.`);
    }
  }
}

module.exports = { ChotKyService };
