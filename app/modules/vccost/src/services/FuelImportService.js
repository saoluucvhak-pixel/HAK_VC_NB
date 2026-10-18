'use strict';
/**
 * Import giá dầu theo ngày từ Excel/CSV: cột Ngày + Giá (+ Loại dầu, Nguồn tuỳ chọn).
 * Preview → chọn ghi đè giá khác → ghi. Không đụng bảng giá/phiếu (giá dầu chỉ là dữ liệu tham chiếu cho kỳ điều chỉnh).
 */
const crypto = require('crypto');
const { readWorkbook } = require('../excel/workbookReader');
const { fold } = require('../excel/columnMapping');
const { parseDateTime, datePart } = require('../utils/datetime');
const { toDb, fromDb } = require('../utils/dbMoney');
const { ValidationError } = require('./CatalogService');

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};

class FuelImportService {
  constructor(db, { audit }) { Object.assign(this, { db, audit }); this.previews = new Map(); }

  preview({ filePath, buffer, fileName, sheetName = null, loaiDau = 'DO 0,05S-II' }) {
    const wb = readWorkbook({ filePath, buffer, fileName });
    let best = null;
    for (const s of wb.sheets) {
      if (sheetName && s.name !== sheetName) continue;
      const aoa = wb.aoa(s.name);
      for (let r = 0; r < Math.min(aoa.length, 15); r++) {
        const cells = (aoa[r] || []).map((c) => (c == null ? '' : fold(String(c))));
        const ngay = cells.findIndex((c) => /^ngay\b|^ngay$|\bngay\b/.test(c) && !/thay doi/.test(c));
        const gia = cells.findIndex((c) => /\bgia\b/.test(c) && /dau|gia$|^gia/.test(c) && !/cuoc|binh quan/.test(c));
        if (ngay < 0 || gia < 0 || ngay === gia) continue;
        const score = 1 + (cells.some((c) => /dau/.test(c)) ? 1 : 0);
        if (!best || score > best.score) best = { sheet: s.name, headerRow: r, ngay, gia, score,
          loai: cells.findIndex((c) => /loai/.test(c)), nguon: cells.findIndex((c) => /^nguon/.test(c)), aoa };
      }
    }
    if (!best) throw new ValidationError('Không tìm thấy bảng có cột "Ngày" và "Giá dầu"');
    const rows = []; const seen = new Set();
    for (let r = best.headerRow + 1; r < best.aoa.length; r++) {
      const row = best.aoa[r] || [];
      const rawD = row[best.ngay], rawG = row[best.gia];
      if ((rawD === null || rawD === undefined || rawD === '') && (rawG === null || rawG === undefined || rawG === '')) continue;
      const d = rawD === null || rawD === undefined || rawD === '' ? null : datePart(parseDateTime(rawD));
      const g = num(rawG);
      const loai = best.loai >= 0 && row[best.loai] ? String(row[best.loai]).trim() : loaiDau;
      const item = { source_row: r + 1, ngay: d, loai_dau: loai, gia: g, nguon: best.nguon >= 0 && row[best.nguon] ? String(row[best.nguon]).trim() : null };
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || g === null || g <= 0) item.status = 'INVALID';
      else if (seen.has(`${d}|${loai}`)) item.status = 'DUP_IN_FILE';
      else {
        seen.add(`${d}|${loai}`);
        const ex = this.db.get('SELECT id, gia FROM gia_dau WHERE ngay=? AND loai_dau=?', [d, loai]);
        if (!ex) item.status = 'NEW';
        else { item.id = ex.id; item.gia_cu = fromDb(ex.gia); item.status = Math.abs(item.gia_cu - g) < 0.0005 ? 'SAME' : 'CHANGED'; }
      }
      rows.push(item);
    }
    const counts = rows.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {});
    const token = crypto.randomUUID();
    this.previews.set(token, { rows, fileName: wb.fileName });
    return { token, sheet: best.sheet, headerRow: best.headerRow + 1, counts, rows };
  }

  /** @param {{overwrite:boolean}} o overwrite=true: ghi đè ngày đã có nhưng khác giá */
  commit(token, { overwrite = false } = {}) {
    const p = this.previews.get(token);
    if (!p) throw new ValidationError('Phiên import đã hết hạn');
    const res = this.db.tx(() => {
      const st = { created: 0, updated: 0, skipped: 0 };
      for (const r of p.rows) {
        if (r.status === 'NEW') {
          this.db.run('INSERT INTO gia_dau(ngay, loai_dau, gia, nguon, ghi_chu) VALUES (?,?,?,?,?)', [r.ngay, r.loai_dau, toDb(r.gia), r.nguon, `Import ${p.fileName}`]); st.created++;
        } else if (r.status === 'CHANGED' && overwrite) {
          this.db.run('UPDATE gia_dau SET gia=? WHERE id=?', [toDb(r.gia), r.id]); st.updated++;
          this.audit.log('UPDATE', 'gia_dau', r.id, { gia: r.gia_cu }, { gia: r.gia }, 'Import ghi đè');
        } else st.skipped++;
      }
      this.audit.log('IMPORT_FUEL', 'gia_dau', null, null, { file: p.fileName, ...st });
      return st;
    });
    this.previews.delete(token);
    return res;
  }
}

module.exports = { FuelImportService };
