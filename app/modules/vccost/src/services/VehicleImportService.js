'use strict';
/**
 * Import danh mục xe (dạng sheet "Số xe": Biển số → Tên công ty [→ Từ ngày]).
 * Preview trước; xe đã có nhưng KHÁC đơn vị → không tự đổi, người dùng chọn đóng lịch sử cũ từ ngày X.
 */
const crypto = require('crypto');
const { readWorkbook } = require('../excel/workbookReader');
const { detectHeader, fold } = require('../excel/columnMapping');
const { normalizePlate, displayPlate, isValidPlate } = require('../utils/plate');
const { parseDateTime, datePart } = require('../utils/datetime');
const { ValidationError } = require('./CatalogService');

class VehicleImportService {
  constructor(db, { audit, catalog, cost }) { Object.assign(this, { db, audit, catalog, cost }); this.previews = new Map(); }

  preview({ filePath, buffer, fileName, sheetName = null }) {
    const wb = readWorkbook({ filePath, buffer, fileName });
    let sheet = sheetName, det = null;
    for (const s of wb.sheets) {
      if (sheetName && s.name !== sheetName) continue;
      const d = detectHeader(wb.aoa(s.name));
      if (d.mapping.bien_so === undefined || d.mapping.cong_ty_vc === undefined) continue;
      // ưu tiên sheet DANH MỤC (không có cột số phiếu) hơn sheet phiếu cân có cột công ty
      const score = d.score + (d.mapping.so_phieu === undefined ? 100 : 0);
      if (!det || score > det._score) { det = { ...d, _score: score }; sheet = s.name; }
    }
    if (!det) throw new ValidationError('Không tìm thấy sheet có cột "Biển số/Số xe" và "Tên công ty/Đơn vị"');
    const carriers = new Map(this.db.all('SELECT id, ma FROM don_vi_van_chuyen').map((c) => [fold(c.ma).toUpperCase(), c]));
    const rows = [];
    const aoa = wb.aoa(sheet);
    const seen = new Map();
    for (let r = det.headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const bs = row[det.mapping.bien_so];
      if (bs === null || bs === undefined || String(bs).trim() === '') continue;
      const cty = row[det.mapping.cong_ty_vc] == null ? '' : String(row[det.mapping.cong_ty_vc]).trim();
      const rawTu = det.mapping.tu_ngay !== undefined ? row[det.mapping.tu_ngay] : null;
      const tu = rawTu != null && String(rawTu).trim() !== '' ? datePart(parseDateTime(rawTu)) : null;
      const tuBad = rawTu != null && String(rawTu).trim() !== '' && !tu;
      const chuan = normalizePlate(bs);
      const item = { source_row: r + 1, bien_so_goc: String(bs), bien_so: displayPlate(bs), bien_so_chuan: chuan, don_vi_ma: cty, tu_ngay: tu };
      if (!isValidPlate(bs)) item.status = 'INVALID_PLATE';
      else if (tuBad) { item.status = 'INVALID_DATE'; item.note = `Từ ngày không đọc được: "${rawTu}"`; }
      else if (seen.has(chuan)) {
        const first = seen.get(chuan);
        const same = fold(first.don_vi_ma).toUpperCase() === fold(cty).toUpperCase() && (first.tu_ngay || '') === (tu || '');
        item.status = same ? 'DUP_IN_FILE' : 'CONFLICT_IN_FILE';
        if (!same) item.note = `Biển số xuất hiện lại ở dòng ${first.source_row} với đơn vị/ngày khác — không import, xử lý tay`;
      }
      else {
        seen.set(chuan, item);
        const c = carriers.get(fold(cty).toUpperCase());
        item.don_vi_van_chuyen_id = c ? c.id : null;
        const xe = this.db.get('SELECT id FROM xe WHERE bien_so_chuan=?', [chuan]);
        if (!xe) item.status = c ? 'NEW' : 'NEW_UNKNOWN_CARRIER';
        else {
          item.xe_id = xe.id;
          const cur = this.db.get(`SELECT h.*, d.ma FROM xe_don_vi_lich_su h JOIN don_vi_van_chuyen d ON d.id=h.don_vi_van_chuyen_id
                                   WHERE h.xe_id=? AND h.den_ngay IS NULL ORDER BY h.tu_ngay DESC LIMIT 1`, [xe.id]);
          item.don_vi_hien_tai = cur ? cur.ma : null;
          if (!c) item.status = 'UNKNOWN_CARRIER';
          else if (cur && cur.don_vi_van_chuyen_id === c.id) item.status = 'SAME';
          else item.status = cur ? 'CHANGED_CARRIER' : 'ASSIGN_CARRIER';
        }
      }
      rows.push(item);
    }
    const counts = rows.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
    const missingCarriers = [...new Set(rows.filter((x) => x.status === 'NEW_UNKNOWN_CARRIER' || x.status === 'UNKNOWN_CARRIER').map((x) => x.don_vi_ma).filter(Boolean))];
    const token = crypto.randomUUID();
    this.previews.set(token, { rows, fileName: wb.fileName });
    return { token, sheet, headerRow: det.headerRow + 1, counts, missingCarriers, rows };
  }

  /**
   * @param {object} opts {createMissingCarriers: bool, changeFrom: 'YYYY-MM-DD' | null (null = không đổi xe khác đơn vị)}
   */
  commit(token, { createMissingCarriers = false, changeFrom = null } = {}) {
    const p = this.previews.get(token);
    if (!p) throw new ValidationError('Phiên import đã hết hạn');
    const res = this.db.tx(() => {
      const stat = { created: 0, assigned: 0, changed: 0, skipped: 0, carriersCreated: 0 };
      const carrierId = new Map(this.db.all('SELECT id, ma FROM don_vi_van_chuyen').map((c) => [fold(c.ma).toUpperCase(), c.id]));
      const getCarrier = (ma) => {
        const k = fold(ma).toUpperCase();
        if (carrierId.has(k)) return carrierId.get(k);
        if (!createMissingCarriers || !ma) return null;
        const id = this.catalog.create('don_vi_van_chuyen', { ma, ten: ma }).id;
        carrierId.set(k, id); stat.carriersCreated++;
        return id;
      };
      const touched = [];
      for (const r of p.rows) {
        try {
        if (['INVALID_PLATE', 'INVALID_DATE', 'DUP_IN_FILE', 'CONFLICT_IN_FILE', 'SAME'].includes(r.status)) { stat.skipped++; continue; }
        const cid = getCarrier(r.don_vi_ma);
        if (r.status.startsWith('NEW')) {
          const xe = this.catalog.create('xe', { bien_so_hien_thi: r.bien_so });
          if (cid) this.catalog.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: cid, tu_ngay: r.tu_ngay }, { parentId: xe.id });
          stat.created++; touched.push(xe.id);
        } else if (r.status === 'ASSIGN_CARRIER' || (r.status === 'UNKNOWN_CARRIER' && cid && !r.don_vi_hien_tai)) {
          if (cid) { this.catalog.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: cid, tu_ngay: r.tu_ngay }, { parentId: r.xe_id }); stat.assigned++; touched.push(r.xe_id); }
          else stat.skipped++;
        } else if (r.status === 'CHANGED_CARRIER' || r.status === 'UNKNOWN_CARRIER') {
          if (changeFrom && cid) { this.catalog.create('xe_don_vi_lich_su', { don_vi_van_chuyen_id: cid, tu_ngay: r.tu_ngay || changeFrom }, { parentId: r.xe_id }); stat.changed++; touched.push(r.xe_id); }
          else stat.skipped++;
        }
        } catch (e) { if (e instanceof ValidationError) throw new ValidationError(`Xe ${r.bien_so} (dòng ${r.source_row}): ${e.message}`); throw e; }
      }
      this.audit.log('IMPORT_VEHICLES', 'xe', null, null, { file: p.fileName, ...stat });
      for (const id of touched) this.cost.recalc({ xeId: id });
      return stat;
    });
    this.previews.delete(token);
    return res;
  }
}

module.exports = { VehicleImportService };
