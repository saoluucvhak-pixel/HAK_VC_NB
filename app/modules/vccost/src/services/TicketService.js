'use strict';
/** Sửa phiếu cân (có audit), gán/chuyển đợt, đánh dấu xe trả về. Không sửa phiếu đã chốt. */
const { ValidationError } = require('./CatalogService');
const { businessKey, strongKey, fingerprint } = require('./DuplicateDetector');
const { normalizePlate, displayPlate, isValidPlate } = require('../utils/plate');

const EDITABLE = ['ngay_gio_can_1', 'ngay_gio_can_2', 'bien_so', 'can_lan_1', 'can_lan_2', 'kl_hang_kg', 'noi_den_id', 'dot_van_chuyen_id', 'xe_tra_ve', 'ghi_chu', 'loai_hang'];
const FINANCIAL = EDITABLE.filter((k) => k !== 'ghi_chu'); // phiếu đã chốt: chỉ còn sửa được ghi chú
const { parseDateTime } = require('../utils/datetime');

class TicketService {
  constructor(db, { audit, cost }) { Object.assign(this, { db, audit, cost }); }

  get(id) { return this.db.get('SELECT * FROM phieu_can WHERE id=?', [id]); }

  update(id, data, note) {
    if (!note) throw new ValidationError('Cần ghi lý do sửa phiếu');
    return this.db.tx(() => {
      const old = this.get(id);
      if (!old || old.trang_thai !== 'ACTIVE') throw new ValidationError('Không tìm thấy phiếu');
      const ch = {};
      for (const k of EDITABLE) if (k in data && data[k] !== old[k]) ch[k] = data[k] === '' ? null : data[k];
      if (!Object.keys(ch).length) return old;
      if (old.chot_ky_id && Object.keys(ch).some((k) => FINANCIAL.includes(k) || k === 'dot_van_chuyen_id')) throw new ValidationError('Phiếu đã chốt — phải mở khóa kỳ trước');
      if (old.dot_van_chuyen_id && Object.keys(ch).some((k) => FINANCIAL.includes(k))) {
        const sd = this.db.get('SELECT trang_thai FROM dot_van_chuyen WHERE id=?', [old.dot_van_chuyen_id]);
        if (sd && sd.trang_thai === 'KHOA') throw new ValidationError('Phiếu thuộc đợt đã khóa — mở khóa đợt trước khi sửa');
      }
      for (const k of ['ngay_gio_can_1', 'ngay_gio_can_2']) {
        if (!(k in ch)) continue;
        if (ch[k] === null) { if (k === 'ngay_gio_can_1') throw new ValidationError('Không được xóa ngày giờ cân 1'); continue; }
        const iso = parseDateTime(ch[k]);
        if (!iso) throw new ValidationError(`${k === 'ngay_gio_can_1' ? 'Ngày giờ cân 1' : 'Ngày giờ cân 2'}: sai định dạng hoặc ngày không tồn tại`);
        ch[k] = iso;
      }
      const t1 = ch.ngay_gio_can_1 ?? old.ngay_gio_can_1, t2 = ch.ngay_gio_can_2 ?? old.ngay_gio_can_2;
      if (('ngay_gio_can_1' in ch || 'ngay_gio_can_2' in ch) && t1 && t2 && t2 < t1) throw new ValidationError('Giờ cân 2 phải sau giờ cân 1');
      for (const k of ['can_lan_1', 'can_lan_2']) if (k in ch && ch[k] !== null && !(Number(ch[k]) >= 0)) throw new ValidationError('Trọng lượng cân không được âm');
      if (ch.dot_van_chuyen_id) {
        const d = this.db.get('SELECT trang_thai FROM dot_van_chuyen WHERE id=?', [ch.dot_van_chuyen_id]);
        if (!d) throw new ValidationError('Đợt không tồn tại');
        if (d.trang_thai === 'KHOA') throw new ValidationError('Đợt đích đã khóa');
      }
      if ('bien_so' in ch) {
        if (!isValidPlate(ch.bien_so)) throw new ValidationError('Biển số không hợp lệ');
        ch.bien_so_chuan = normalizePlate(ch.bien_so); ch.bien_so = displayPlate(ch.bien_so);
      }
      if ('kl_hang_kg' in ch && !(Number(ch.kl_hang_kg) > 0)) throw new ValidationError('KL phải > 0');
      if ('xe_tra_ve' in ch) ch.xe_tra_ve = ch.xe_tra_ve ? 1 : 0;
      const merged = { ...old, ...ch, noi_xuat: old.noi_xuat_goc, bien_so: ch.bien_so || old.bien_so_goc };
      ch.business_key = businessKey(merged); ch.strong_key = strongKey(merged); ch.fingerprint = fingerprint(merged);
      const cols = Object.keys(ch);
      this.db.run(`UPDATE phieu_can SET ${cols.map((c) => `${c}=?`).join(',')}, updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`, [...cols.map((c) => ch[c]), id]);
      const oldVals = Object.fromEntries(cols.map((c) => [c, old[c]]));
      this.audit.log('dot_van_chuyen_id' in ch && cols.length <= 4 ? 'MOVE_TICKET' : 'UPDATE_TICKET', 'phieu_can', id, oldVals, ch, note);
      this.cost.recalc({ ids: [id] });
      if ('bien_so' in ch) this.cost.syncTimeAlerts([old.bien_so_chuan]);
      return this.get(id);
    });
  }

  /** Phân loại phiếu trước khi xóa: xóa được / đã chốt kỳ (không xóa) / đợt đã khóa (không xóa). */
  _delCheck(ids) {
    const out = { ok: [], locked: [], dotKhoa: [], missing: 0, priced: 0 };
    for (const id of [...new Set(ids.map(Number))]) {
      const t = this.db.get(`SELECT p.*, d.trang_thai AS dot_tt FROM phieu_can p LEFT JOIN dot_van_chuyen d ON d.id=p.dot_van_chuyen_id WHERE p.id=?`, [id]);
      if (!t || t.trang_thai !== 'ACTIVE') { out.missing++; continue; }
      if (t.chot_ky_id || t.trang_thai_tinh_gia === 'LOCKED') out.locked.push(t.so_phieu);
      else if (t.dot_tt === 'KHOA') out.dotKhoa.push(t.so_phieu);
      else { out.ok.push(t.id); if (t.trang_thai_tinh_gia === 'OK') out.priced++; }
    }
    return out;
  }

  removePreview(ids) {
    const c = this._delCheck(ids);
    return { xoa_duoc: c.ok.length, da_tinh_gia: c.priced, da_chot_ky: c.locked.length, dot_khoa: c.dotKhoa.length, khong_con: c.missing };
  }

  /**
   * Xóa phiếu cân (xóa mềm → trạng thái VOID, có audit, import lại được). Gồm cả phiếu đã áp giá vận chuyển.
   * Phiếu đã chốt kỳ hoặc thuộc đợt đã khóa thì KHÔNG xóa — phải mở khóa trước.
   */
  remove(ids, reason) {
    if (!reason || !String(reason).trim()) throw new ValidationError('Cần ghi lý do xóa phiếu');
    if (!Array.isArray(ids) || !ids.length) throw new ValidationError('Chưa chọn phiếu nào');
    return this.db.tx(() => {
      const c = this._delCheck(ids);
      if (c.locked.length) throw new ValidationError(`${c.locked.length} phiếu đã chốt kỳ (${c.locked.slice(0, 5).join(', ')}${c.locked.length > 5 ? '…' : ''}) — mở khóa kỳ trước khi xóa`);
      if (c.dotKhoa.length) throw new ValidationError(`${c.dotKhoa.length} phiếu thuộc đợt đã khóa (${c.dotKhoa.slice(0, 5).join(', ')}${c.dotKhoa.length > 5 ? '…' : ''}) — mở khóa đợt trước khi xóa`);
      const plates = new Set();
      for (const id of c.ok) {
        const t = this.get(id); plates.add(t.bien_so_chuan);
        this.db.run(`UPDATE phieu_can SET trang_thai='VOID', updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`, [id]);
        this.db.run(`UPDATE canh_bao SET trang_thai='DA_XU_LY', resolved_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), ghi_chu='Phiếu đã xóa' WHERE entity='phieu_can' AND entity_id=? AND trang_thai IN ('MOI','DANG_XU_LY')`, [id]);
        this.audit.log('DELETE_TICKET', 'phieu_can', id, { so_phieu: t.so_phieu, bien_so: t.bien_so, ngay_gio_can_1: t.ngay_gio_can_1, kl_hang_kg: t.kl_hang_kg, don_gia: t.don_gia, tong_tien: t.tong_tien, dot_van_chuyen_id: t.dot_van_chuyen_id }, null, reason);
      }
      this.cost.syncTimeAlerts([...plates]);
      return { deleted: c.ok.length, da_tinh_gia: c.priced };
    });
  }

  /** Chuyển nhiều phiếu sang đợt khác. */
  moveToDot(ids, dotId, note) {
    return this.db.tx(() => ids.map((id) => this.update(id, { dot_van_chuyen_id: dotId }, note || 'Chuyển đợt')).length);
  }
}

module.exports = { TicketService };
