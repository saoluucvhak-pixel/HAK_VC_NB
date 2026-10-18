'use strict';
/**
 * Trung tâm cảnh báo. Cảnh báo tự sinh từ engine được đồng bộ: lỗi còn → giữ mở; hết lỗi → tự đóng (DA_XU_LY).
 * Cảnh báo người dùng đã BO_QUA không bị mở lại cho cùng (loại, đối tượng).
 */
const DEF = {
  DUPLICATE_TICKET: ['CAO', 'Phiếu trùng số phiếu + nơi xuất nhưng khác dữ liệu', 'Vào "Cần kiểm tra" chọn Giữ cũ / Cập nhật / Bỏ qua'],
  UNKNOWN_VEHICLE: ['CAO', 'Biển số chưa có trong danh mục xe', 'Thêm xe vào Danh mục → Xe và gán đơn vị vận chuyển'],
  UNKNOWN_CARRIER: ['CAO', 'Xe chưa có đơn vị vận chuyển hiệu lực tại ngày cân (hoặc có >1 đơn vị)', 'Danh mục → Xe → Lịch sử đơn vị'],
  UNKNOWN_LOCATION: ['CAO', 'Không xác định được nơi xuất/nơi đến/tuyến', 'Thêm địa điểm, tên gọi khác (alias) hoặc tuyến'],
  NO_PRICE: ['CAO', 'Không có bảng giá hiệu lực cho tuyến tại ngày cân', 'Thêm bảng giá hoặc sửa hiệu lực'],
  MULTIPLE_PRICE: ['CAO', 'Nhiều bảng giá cùng hiệu lực — hệ thống không tự chọn', 'Sửa hiệu lực / đặt INACTIVE bảng giá thừa'],
  INVALID_WEIGHT: ['CAO', 'Khối lượng không hợp lệ', 'Kiểm tra phiếu cân gốc'],
  INVALID_TIME: ['CAO', 'Thời gian cân không hợp lệ', 'Kiểm tra phiếu cân gốc'],
  TIME_ANOMALY: ['TRUNG_BINH', 'Thời gian cân/khoảng cách chuyến bất thường', 'Đối chiếu với trạm cân (chỉ cảnh báo, không kết luận)'],
  PRICE_CHANGED: ['THAP', 'Đơn giá phiếu thay đổi do tính lại', 'Thông tin'],
  UNMATCHED_RECONCILIATION: ['TRUNG_BINH', 'Dòng đối chiếu không khớp', 'Xem Kết quả đối chiếu'],
};
const STATUS_TO_TYPE = {
  UNKNOWN_VEHICLE: 'UNKNOWN_VEHICLE', UNKNOWN_CARRIER: 'UNKNOWN_CARRIER', AMBIGUOUS_VEHICLE: 'UNKNOWN_CARRIER',
  UNKNOWN_LOCATION: 'UNKNOWN_LOCATION', NO_PRICE: 'NO_PRICE', NO_VAT_RATE: 'NO_PRICE', MULTIPLE_PRICE: 'MULTIPLE_PRICE',
  INVALID_WEIGHT: 'INVALID_WEIGHT', INVALID_TIME: 'INVALID_TIME',
};
const ENGINE_TYPES = ['UNKNOWN_VEHICLE', 'UNKNOWN_CARRIER', 'UNKNOWN_LOCATION', 'NO_PRICE', 'MULTIPLE_PRICE', 'INVALID_WEIGHT', 'INVALID_TIME'];

class AlertService {
  constructor(db) { this.db = db; }

  open(loai, entity, entityId, data, reason) {
    const [muc, nn, xl] = DEF[loai] || ['TRUNG_BINH', loai, ''];
    const skipped = this.db.get(`SELECT id FROM canh_bao WHERE loai=? AND entity=? AND entity_id=? AND trang_thai='BO_QUA'`, [loai, entity, entityId]);
    if (skipped) return;
    this.db.run(
      `INSERT INTO canh_bao(loai, muc_do, entity, entity_id, du_lieu_json, nguyen_nhan, cach_xu_ly)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(loai, entity, entity_id) WHERE trang_thai IN ('MOI','DANG_XU_LY')
       DO UPDATE SET du_lieu_json = excluded.du_lieu_json, nguyen_nhan = excluded.nguyen_nhan`,
      [loai, muc, entity, entityId, data ? JSON.stringify(data) : null, reason || nn, xl]
    );
  }

  closeAuto(entity, entityId, keepTypes, types = ENGINE_TYPES) {
    const close = types.filter((t) => !keepTypes.includes(t));
    if (!close.length) return;
    this.db.run(
      `UPDATE canh_bao SET trang_thai='DA_XU_LY', resolved_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), ghi_chu=COALESCE(ghi_chu,'')||'Tự đóng: dữ liệu đã hợp lệ'
       WHERE entity=? AND entity_id=? AND trang_thai IN ('MOI','DANG_XU_LY') AND loai IN (${close.map(() => '?').join(',')})`,
      [entity, entityId, ...close]
    );
  }

  /** Đồng bộ cảnh báo engine cho 1 phiếu từ danh sách warnings. */
  syncTicket(ticketId, warnings, info) {
    const types = [...new Set(warnings.map((w) => STATUS_TO_TYPE[w]).filter(Boolean))];
    for (const t of types) this.open(t, 'phieu_can', ticketId, info);
    this.closeAuto('phieu_can', ticketId, types);
  }

  syncTimeFlags(ticketId, flags, info) {
    if (flags.length) this.open('TIME_ANOMALY', 'phieu_can', ticketId, { ...info, flags }, `Bất thường: ${flags.join(', ')}`);
    else this.closeAuto('phieu_can', ticketId, [], ['TIME_ANOMALY']);
  }

  list({ trang_thai = null, loai = null, limit = 500, offset = 0 } = {}) {
    const w = []; const p = [];
    if (trang_thai) { w.push(`c.trang_thai IN (${trang_thai.split(',').map(() => '?').join(',')})`); p.push(...trang_thai.split(',')); }
    if (loai) { w.push('c.loai = ?'); p.push(loai); }
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
    return {
      total: this.db.get(`SELECT COUNT(*) n FROM canh_bao c ${where}`, p).n,
      summary: this.db.all(`SELECT loai, muc_do, COUNT(*) n FROM canh_bao c ${where} GROUP BY loai, muc_do ORDER BY n DESC`, p),
      rows: this.db.all(`SELECT c.*, pc.so_phieu, pc.bien_so, pc.noi_xuat, pc.ngay_gio_can_1 FROM canh_bao c
                         LEFT JOIN phieu_can pc ON c.entity='phieu_can' AND pc.id=c.entity_id
                         ${where} ORDER BY CASE c.muc_do WHEN 'CAO' THEN 0 WHEN 'TRUNG_BINH' THEN 1 ELSE 2 END, c.id DESC
                         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, p),
    };
  }

  setStatus(id, status, note) {
    this.db.run(`UPDATE canh_bao SET trang_thai=?, ghi_chu=?, resolved_at=CASE WHEN ? IN ('DA_XU_LY','BO_QUA') THEN strftime('%Y-%m-%dT%H:%M:%S','now','localtime') END WHERE id=?`, [status, note ?? null, status, id]);
  }

  countOpen() { return this.db.get(`SELECT COUNT(*) n FROM canh_bao WHERE trang_thai IN ('MOI','DANG_XU_LY')`).n; }
}

module.exports = { AlertService, ALERT_DEF: DEF };
