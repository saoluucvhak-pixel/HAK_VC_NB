'use strict';
/**
 * IMPORT PHIẾU CÂN: CHỌN FILE → PREVIEW → VALIDATE → NGƯỜI DÙNG XÁC NHẬN → COMMIT (transaction).
 * Không ghi DB ở bước preview. Commit lỗi giữa chừng → rollback toàn bộ.
 * KEY_CONFLICT không tự ghi đè → "Cần kiểm tra" (Giữ cũ / Cập nhật mới / Bỏ qua).
 */
const crypto = require('crypto');
const { readWorkbook } = require('../excel/workbookReader');
const { detectHeader, fold } = require('../excel/columnMapping');
const { parseTickets } = require('../excel/ticketParser');
const { classify, businessKey, strongKey, fingerprint } = require('./DuplicateDetector');
const { computeTicket } = require('./TransportCostEngine');
const { ValidationError } = require('./CatalogService');

const COUNT_KEYS = ['total', 'valid', 'new', 'exact', 'conflict', 'inFile', 'error', 'unknownVehicle', 'unknownLocation', 'noPrice', 'multiplePrice'];

class TicketImportService {
  constructor(db, { audit, alerts, cost, settings }) {
    Object.assign(this, { db, audit, alerts, cost, settings });
    this.previews = new Map();
  }

  /** Bước 1: đọc file, liệt kê sheet, gợi ý sheet có header tốt nhất. */
  open({ filePath, buffer, fileName }) {
    const wb = readWorkbook({ filePath, buffer, fileName });
    const scored = wb.sheets.map((s) => ({ ...s, header: detectHeader(wb.aoa(s.name)) }));
    const best = scored.reduce((a, b) => (b.header.score > (a ? a.header.score : -1) ? b : a), null);
    const prev = this.db.get(`SELECT id, import_time FROM import_batch WHERE file_hash=? AND trang_thai='COMMITTED' ORDER BY id DESC LIMIT 1`, [wb.hash]);
    const token = crypto.randomUUID();
    this.previews.set(token, { wb, stage: 'opened' });
    return {
      token, fileName: wb.fileName, hash: wb.hash, size: wb.size,
      sheets: scored.map((s) => ({ name: s.name, rows: s.rows, cols: s.cols, headerRow: s.header.headerRow, score: s.header.score })),
      suggestedSheet: best ? best.name : null,
      previouslyImported: prev ? { batchId: prev.id, at: prev.import_time } : null,
    };
  }

  /** Bước 2: header + mapping của 1 sheet (để người dùng sửa). */
  sheetInfo(token, sheetName, headerRow = null) {
    const p = this._p(token);
    const aoa = p.wb.aoa(sheetName);
    const det = detectHeader(aoa);
    const hr = headerRow === null || headerRow === undefined ? det.headerRow : Number(headerRow);
    const mapping = headerRow === null || headerRow === undefined ? det.mapping : detectHeader([aoa[hr] || []]).mapping;
    return { sheetName, headerRow: hr, headers: (aoa[hr] || []).map((h, i) => ({ index: i, text: h == null ? '' : String(h) })), mapping, sample: aoa.slice(hr + 1, hr + 6) };
  }

  /** Bước 3: preview đầy đủ (parse, validate, phân loại trùng, tính thử). KHÔNG ghi DB. */
  preview(token, { sheetName, headerRow, mapping, dotId = null, noiDenId = null }) {
    const p = this._p(token);
    if (!mapping || mapping.so_phieu === undefined || mapping.bien_so === undefined || (mapping.kl_hang_kg === undefined && (mapping.can_lan_1 === undefined || mapping.can_lan_2 === undefined))) {
      throw new ValidationError('Mapping phải có: Số phiếu, Biển số, và KL hàng (hoặc Cân lần 1 + Cân lần 2)');
    }
    if (mapping.ngay_gio_can_1 === undefined) throw new ValidationError('Mapping phải có Ngày giờ cân 1');
    const aoa = p.wb.aoa(sheetName);
    const rows = parseTickets(aoa, Number(headerRow), mapping);
    const nd = noiDenId || this._defaultNoiDen(dotId);

    // trùng với DB
    const keys = rows.map((r) => businessKey(r));
    const existing = new Map();
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      for (const e of this.db.all(`SELECT id, so_phieu, bien_so_goc AS bien_so, ngay_gio_can_1, ngay_gio_can_2, can_lan_1, can_lan_2, kl_hang_kg,
                                    noi_xuat_goc AS noi_xuat, business_key, fingerprint, chot_ky_id FROM phieu_can
                                    WHERE trang_thai='ACTIVE' AND business_key IN (${chunk.map(() => '?').join(',')})`, chunk)) existing.set(e.business_key, e);
    }
    const cls = classify(rows, existing);

    // tính thử
    const { ctx, alias } = this.cost.loadContext();
    const counts = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
    const out = rows.map((r, i) => {
      let c = cls[i];
      const nx = alias.get(fold(r.noi_xuat)) || null;
      // Cùng số phiếu + cùng nơi xuất (sau khi quy đổi tên gọi khác, VD "QS" = "Quế Sơn") nhưng khác cách viết → không phải phiếu mới.
      if (c.status === 'NEW' && nx && !r.errors.length) {
        const dup = this.db.get(`SELECT id, so_phieu, bien_so_goc AS bien_so, ngay_gio_can_1, ngay_gio_can_2, can_lan_1, can_lan_2, kl_hang_kg, noi_xuat_goc AS noi_xuat
                                 FROM phieu_can WHERE trang_thai='ACTIVE' AND so_phieu=? AND noi_xuat_id=? LIMIT 1`, [String(r.so_phieu ?? '').trim(), nx]);
        if (dup) {
          const alt = classify([r], new Map([[c.key, { ...dup, fingerprint: null }]]))[0];
          const diffs = (alt.diffs || []).filter((d) => d.field !== 'noi_xuat_key');
          c = diffs.length ? { ...c, status: 'KEY_CONFLICT', existingId: dup.id, diffs } : { ...c, status: 'EXACT_DUPLICATE', existingId: dup.id };
        }
      }
      const calc = computeTicket({ ...r, noi_xuat_id: nx, noi_den_id: nd }, ctx);
      if (c.status === 'IN_FILE_DUPLICATE' && c.differs) r.errors.push(`Trùng số phiếu + nơi xuất với dòng ${rows[c.firstIdx].source_row} trong file nhưng nội dung khác — kiểm tra file nguồn`);
      const phanLoai = r.errors.length ? 'ERROR' : c.status;
      counts.total++;
      if (!r.errors.length) counts.valid++;
      ({ NEW: () => counts.new++, EXACT_DUPLICATE: () => counts.exact++, KEY_CONFLICT: () => counts.conflict++, IN_FILE_DUPLICATE: () => counts.inFile++, ERROR: () => counts.error++ })[phanLoai]();
      if (phanLoai === 'NEW') {
        if (calc.warnings.includes('UNKNOWN_VEHICLE') || calc.warnings.includes('UNKNOWN_CARRIER')) counts.unknownVehicle++;
        if (calc.warnings.includes('UNKNOWN_LOCATION')) counts.unknownLocation++;
        if (calc.warnings.includes('NO_PRICE')) counts.noPrice++;
        if (calc.warnings.includes('MULTIPLE_PRICE')) counts.multiplePrice++;
      }
      return { ...r, idx: i, noi_xuat_id: nx, noi_den_id: nd, phan_loai: phanLoai, existingId: c.existingId || null, diffs: c.diffs || null,
        engine_status: calc.status, warnings: calc.warnings, don_vi_van_chuyen_id: calc.don_vi_van_chuyen_id, don_gia: calc.don_gia,
        tien_truoc_vat: calc.tien_truoc_vat, tong_tien: calc.tong_tien, key: c.key, fp: c.fp };
    });
    Object.assign(p, { stage: 'previewed', sheetName, headerRow: Number(headerRow), mapping, dotId, noiDenId: nd, rows: out, counts });
    return { token, counts, sheetName, headerRow: Number(headerRow), noiDenId: nd };
  }

  /** Trang dữ liệu preview (cho bảng ảo hóa). filter: phan_loai hoặc cờ cảnh báo */
  previewRows(token, { filter = null, offset = 0, limit = 200 } = {}) {
    const p = this._p(token);
    let rows = p.rows || [];
    if (filter) {
      const f = {
        new: (r) => r.phan_loai === 'NEW', exact: (r) => r.phan_loai === 'EXACT_DUPLICATE', conflict: (r) => r.phan_loai === 'KEY_CONFLICT',
        inFile: (r) => r.phan_loai === 'IN_FILE_DUPLICATE', error: (r) => r.phan_loai === 'ERROR', valid: (r) => r.phan_loai !== 'ERROR',
        unknownVehicle: (r) => r.phan_loai === 'NEW' && (r.warnings.includes('UNKNOWN_VEHICLE') || r.warnings.includes('UNKNOWN_CARRIER')),
        unknownLocation: (r) => r.phan_loai === 'NEW' && r.warnings.includes('UNKNOWN_LOCATION'),
        noPrice: (r) => r.phan_loai === 'NEW' && r.warnings.includes('NO_PRICE'),
        multiplePrice: (r) => r.phan_loai === 'NEW' && r.warnings.includes('MULTIPLE_PRICE'),
      }[filter];
      if (f) rows = rows.filter(f);
    }
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(({ fp, key, ...r }) => r) };
  }

  /** Bước 4: commit trong 1 transaction. */
  commit(token, { note = null, dotId, noiDenId } = {}) {
    const p = this._p(token);
    if (p.stage !== 'previewed') throw new ValidationError('Chưa preview');
    const dot = dotId !== undefined ? dotId : p.dotId;
    if (dot) {
      const d = this.db.get('SELECT trang_thai FROM dot_van_chuyen WHERE id=?', [dot]);
      if (!d) throw new ValidationError('Đợt không tồn tại');
      if (d.trang_thai === 'KHOA') throw new ValidationError('Đợt đã khóa — không import thêm phiếu');
    }
    const nd = noiDenId || p.noiDenId;
    require('./ChotKyService').ChotKyService.prototype.assertOpenForDates.call({ db: this.db }, (p.rows || []).filter((r) => r.phan_loai === 'NEW').map((r) => (r.ngay_gio_can_1 || '').slice(0, 10)));
    const result = this.db.tx(() => {
      const c = p.counts;
      const batchId = this.db.run(`INSERT INTO import_batch(loai, file_name, file_hash, sheet_name, header_row, mapping_json, total_rows, dot_van_chuyen_id, user_note)
                                   VALUES ('PHIEU_CAN',?,?,?,?,?,?,?,?)`,
      [p.wb.fileName, p.wb.hash, p.sheetName, p.headerRow + 1, JSON.stringify(p.mapping), c.total, dot || null, note]).id;
      let inserted = 0, dup = 0, conflict = 0, err = 0;
      for (const r of p.rows) {
        const raw = JSON.stringify({ so_phieu: r.so_phieu, ngay_gio_can_1: r.ngay_gio_can_1, ngay_gio_can_2: r.ngay_gio_can_2, bien_so: r.bien_so_goc,
          can_lan_1: r.can_lan_1, can_lan_2: r.can_lan_2, kl_hang_kg: r.kl_hang_kg, noi_xuat: r.noi_xuat, noi_den: r.noi_den, cong_ty_vc: r.cong_ty_vc_nguon });
        if (r.phan_loai === 'NEW') {
          // kiểm tra lại ngay trong transaction (phòng import song song)
          const again = this.db.get(`SELECT id FROM phieu_can WHERE business_key=? AND trang_thai='ACTIVE'`, [r.key]);
          if (again) throw new ValidationError(`Phiếu ${r.so_phieu} vừa được import ở nơi khác — hãy preview lại`);
          const id = this.db.run(`INSERT INTO phieu_can(so_phieu, ngay_gio_can_1, ngay_gio_can_2, bien_so_goc, bien_so, bien_so_chuan, can_lan_1, can_lan_2, kl_hang_kg,
                                    noi_xuat_goc, noi_xuat_id, noi_den_id, cong_ty_vc_nguon, dot_van_chuyen_id, business_key, strong_key, fingerprint, import_batch_id, source_row)
                                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [r.so_phieu, r.ngay_gio_can_1, r.ngay_gio_can_2, r.bien_so_goc, r.bien_so, r.bien_so_chuan, r.can_lan_1, r.can_lan_2, r.kl_hang_kg,
            r.noi_xuat, r.noi_xuat_id, nd, r.cong_ty_vc_nguon == null ? null : String(r.cong_ty_vc_nguon), dot || null, r.key, strongKey(r), r.fp, batchId, r.source_row]).id;
          this._row(batchId, r, 'NEW', 'INSERT', id, raw);
          inserted++;
        } else if (r.phan_loai === 'EXACT_DUPLICATE' || r.phan_loai === 'IN_FILE_DUPLICATE') {
          this._row(batchId, r, r.phan_loai, 'SKIP', r.existingId, raw); dup++;
        } else if (r.phan_loai === 'KEY_CONFLICT') {
          const old = this.db.get('SELECT * FROM phieu_can WHERE id=?', [r.existingId]);
          this._row(batchId, r, 'KEY_CONFLICT', 'PENDING_REVIEW', r.existingId, raw, old);
          this.alerts.open('DUPLICATE_TICKET', 'phieu_can', r.existingId, { so_phieu: r.so_phieu, diffs: r.diffs, batchId }, `Phiếu ${r.so_phieu} trùng khóa nhưng khác: ${r.diffs.map((d) => d.field).join(', ')}`);
          conflict++;
        } else {
          this._row(batchId, r, 'ERROR', 'IGNORE', null, raw, null, r.errors); err++;
        }
      }
      this.db.run('UPDATE import_batch SET inserted_rows=?, duplicate_rows=?, conflict_rows=?, error_rows=? WHERE id=?', [inserted, dup, conflict, err, batchId]);
      this.audit.log('IMPORT', 'import_batch', batchId, null, { file: p.wb.fileName, sheet: p.sheetName, inserted, dup, conflict, err });
      const calc = this.cost.recalc({ batchId });
      return { batchId, inserted, duplicate: dup, conflict, error: err, calculated: calc.count };
    });
    this.previews.delete(token);
    return { ...result, fileBuffer: p.wb.buffer, fileName: p.wb.fileName };
  }

  _row(batchId, r, phanLoai, hanhDong, phieuId, raw, old = null, errors = null) {
    this.db.run(`INSERT INTO import_batch_row(batch_id, source_row, phan_loai, hanh_dong, phieu_can_id, old_json, raw_json, diffs_json, errors_json)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
    [batchId, r.source_row, phanLoai, hanhDong, phieuId, old ? JSON.stringify(old) : null, raw, r.diffs ? JSON.stringify(r.diffs) : null, errors ? JSON.stringify(errors) : null]);
  }

  _defaultNoiDen(dotId) {
    if (dotId) { const d = this.db.get('SELECT noi_giao_id FROM dot_van_chuyen WHERE id=?', [dotId]); if (d && d.noi_giao_id) return d.noi_giao_id; }
    const code = this.settings.get('default_noi_den');
    if (code) { const l = this.db.get('SELECT id FROM dia_diem WHERE ma=?', [code]); if (l) return l.id; }
    return null;
  }

  _p(token) {
    const p = this.previews.get(token);
    if (!p) throw new ValidationError('Phiên import đã hết hạn — hãy chọn lại file');
    return p;
  }

  cancel(token) { this.previews.delete(token); }

  // ------------------------------------------------------------- CẦN KIỂM TRA
  pendingReviews() {
    return this.db.all(`SELECT r.id, r.batch_id, r.source_row, r.phieu_can_id, r.raw_json, r.diffs_json, b.file_name, b.import_time,
                          p.so_phieu, p.bien_so, p.ngay_gio_can_1, p.ngay_gio_can_2, p.can_lan_1, p.can_lan_2, p.kl_hang_kg, p.noi_xuat_goc, p.chot_ky_id
                        FROM import_batch_row r JOIN import_batch b ON b.id=r.batch_id LEFT JOIN phieu_can p ON p.id=r.phieu_can_id
                        WHERE r.hanh_dong='PENDING_REVIEW' AND b.trang_thai='COMMITTED' ORDER BY r.id`)
      .map((x) => ({ ...x, raw: JSON.parse(x.raw_json), diffs: JSON.parse(x.diffs_json || '[]') }));
  }

  /** action: KEEP_OLD | UPDATE | IGNORE */
  resolveReview(rowId, action, note = null) {
    if (!['KEEP_OLD', 'UPDATE', 'IGNORE'].includes(action)) throw new ValidationError('Hành động không hợp lệ');
    return this.db.tx(() => {
      const r = this.db.get(`SELECT * FROM import_batch_row WHERE id=? AND hanh_dong='PENDING_REVIEW'`, [rowId]);
      if (!r) throw new ValidationError('Dòng không còn chờ kiểm tra');
      const old = this.db.get('SELECT * FROM phieu_can WHERE id=?', [r.phieu_can_id]);
      if (action === 'UPDATE') {
        if (!old || old.trang_thai !== 'ACTIVE') throw new ValidationError('Phiếu gốc không còn hiệu lực');
        if (old.chot_ky_id) throw new ValidationError('Phiếu đã chốt — phải mở khóa kỳ trước khi cập nhật');
        const raw = JSON.parse(r.raw_json);
        const [t] = parseTickets([['so_phieu', 't1', 't2', 'bs', 'c1', 'c2', 'kg', 'nx'], [raw.so_phieu, raw.ngay_gio_can_1, raw.ngay_gio_can_2, raw.bien_so, raw.can_lan_1, raw.can_lan_2, raw.kl_hang_kg, raw.noi_xuat]],
          0, { so_phieu: 0, ngay_gio_can_1: 1, ngay_gio_can_2: 2, bien_so: 3, can_lan_1: 4, can_lan_2: 5, kl_hang_kg: 6, noi_xuat: 7 });
        this.db.run(`UPDATE phieu_can SET ngay_gio_can_1=?, ngay_gio_can_2=?, bien_so_goc=?, bien_so=?, bien_so_chuan=?, can_lan_1=?, can_lan_2=?, kl_hang_kg=?,
                       noi_xuat_goc=?, noi_xuat_id=NULL, business_key=?, strong_key=?, fingerprint=?, updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`,
        [t.ngay_gio_can_1, t.ngay_gio_can_2, t.bien_so_goc, t.bien_so, t.bien_so_chuan, t.can_lan_1, t.can_lan_2, t.kl_hang_kg, t.noi_xuat,
          businessKey(t), strongKey(t), fingerprint(t), old.id]);
        this.db.run(`UPDATE import_batch SET updated_rows = updated_rows + 1 WHERE id=?`, [r.batch_id]);
        this.cost.recalc({ ids: [old.id] });
      }
      this.db.run(`UPDATE import_batch_row SET hanh_dong=? WHERE id=?`, [action, rowId]);
      this.audit.log(action === 'UPDATE' ? 'UPDATE_TICKET_FROM_IMPORT' : 'REVIEW_' + action, 'phieu_can', r.phieu_can_id, action === 'UPDATE' ? old : null, action === 'UPDATE' ? JSON.parse(r.raw_json) : null, note);
      const left = this.db.get(`SELECT COUNT(*) n FROM import_batch_row WHERE phieu_can_id=? AND hanh_dong='PENDING_REVIEW'`, [r.phieu_can_id]).n;
      if (!left) this.alerts.closeAuto('phieu_can', r.phieu_can_id, [], ['DUPLICATE_TICKET']);
      return { ok: true };
    });
  }

  // ------------------------------------------------------------- LỊCH SỬ & HOÀN TÁC
  listBatches() { return this.db.all(`SELECT * FROM import_batch ORDER BY id DESC`); }

  batchRows(batchId, { hanh_dong = null, offset = 0, limit = 500 } = {}) {
    const w = ['r.batch_id = ?']; const p = [batchId];
    if (hanh_dong) { w.push('r.hanh_dong = ?'); p.push(hanh_dong); }
    return {
      total: this.db.get(`SELECT COUNT(*) n FROM import_batch_row r WHERE ${w.join(' AND ')}`, p).n,
      rows: this.db.all(`SELECT r.*, pc.so_phieu, pc.bien_so, pc.trang_thai AS trang_thai_phieu FROM import_batch_row r LEFT JOIN phieu_can pc ON pc.id=r.phieu_can_id
                         WHERE ${w.join(' AND ')} ORDER BY r.id LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, p),
    };
  }

  undoBatch(batchId, reason) {
    if (!reason) throw new ValidationError('Cần ghi lý do hoàn tác');
    return this.db.tx(() => {
      const b = this.db.get('SELECT * FROM import_batch WHERE id=?', [batchId]);
      if (!b || b.trang_thai !== 'COMMITTED') throw new ValidationError('Batch không tồn tại hoặc đã hoàn tác');
      const locked = this.db.get(`SELECT COUNT(*) n FROM import_batch_row r JOIN phieu_can p ON p.id=r.phieu_can_id
                                  WHERE r.batch_id=? AND r.hanh_dong IN ('INSERT','UPDATE') AND p.chot_ky_id IS NOT NULL`, [batchId]).n;
      if (locked) throw new ValidationError(`${locked} phiếu của lần import này đã chốt — không hoàn tác được`);
      const ins = this.db.all(`SELECT phieu_can_id FROM import_batch_row WHERE batch_id=? AND hanh_dong='INSERT'`, [batchId]).map((x) => x.phieu_can_id);
      for (const id of ins) {
        this.db.run(`UPDATE phieu_can SET trang_thai='VOID', updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`, [id]);
        this.db.run(`UPDATE canh_bao SET trang_thai='DA_XU_LY', resolved_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime'), ghi_chu='Hoàn tác import' WHERE entity='phieu_can' AND entity_id=? AND trang_thai IN ('MOI','DANG_XU_LY')`, [id]);
      }
      const upd = this.db.all(`SELECT * FROM import_batch_row WHERE batch_id=? AND hanh_dong='UPDATE'`, [batchId]);
      for (const u of upd) {
        // Phiếu đã bị lần import SAU (chưa hoàn tác) sửa tiếp → khôi phục snapshot cũ sẽ ghi đè mất dữ liệu mới
        const later = this.db.get(`SELECT b.id FROM import_batch_row r JOIN import_batch b ON b.id=r.batch_id
          WHERE r.phieu_can_id=? AND r.hanh_dong='UPDATE' AND b.id>? AND b.trang_thai<>'UNDONE' LIMIT 1`, [u.phieu_can_id, batchId]);
        if (later) throw new ValidationError(`Phiếu #${u.phieu_can_id} đã được lần import #${later.id} cập nhật tiếp — hoàn tác lần import #${later.id} trước`);
        const o = JSON.parse(u.old_json);
        this.db.run(`UPDATE phieu_can SET ngay_gio_can_1=?, ngay_gio_can_2=?, bien_so_goc=?, bien_so=?, bien_so_chuan=?, can_lan_1=?, can_lan_2=?, kl_hang_kg=?,
                       noi_xuat_goc=?, noi_xuat_id=?, business_key=?, strong_key=?, fingerprint=? WHERE id=?`,
        [o.ngay_gio_can_1, o.ngay_gio_can_2, o.bien_so_goc, o.bien_so, o.bien_so_chuan, o.can_lan_1, o.can_lan_2, o.kl_hang_kg, o.noi_xuat_goc, o.noi_xuat_id,
          o.business_key, o.strong_key, o.fingerprint, o.id]);
      }
      for (const pr of this.db.all(`SELECT phieu_can_id FROM import_batch_row WHERE batch_id=? AND hanh_dong='PENDING_REVIEW' AND phieu_can_id IS NOT NULL`, [batchId])) {
        const left = this.db.get(`SELECT COUNT(*) n FROM import_batch_row WHERE phieu_can_id=? AND hanh_dong='PENDING_REVIEW' AND batch_id<>?`, [pr.phieu_can_id, batchId]).n;
        if (!left) this.alerts.closeAuto('phieu_can', pr.phieu_can_id, [], ['DUPLICATE_TICKET']);
      }
      this.db.run(`UPDATE import_batch_row SET hanh_dong='IGNORE' WHERE batch_id=? AND hanh_dong='PENDING_REVIEW'`, [batchId]);
      this.db.run(`UPDATE import_batch SET trang_thai='UNDONE', user_note=COALESCE(user_note,'')||' | Hoàn tác: '||? WHERE id=?`, [reason, batchId]);
      this.audit.log('UNDO_IMPORT', 'import_batch', batchId, { inserted: ins.length, updated: upd.length }, null, reason);
      if (upd.length) this.cost.recalc({ ids: upd.map((u) => u.phieu_can_id) });
      const plates = this.db.all(`SELECT DISTINCT bien_so_chuan FROM phieu_can WHERE id IN (${ins.map(() => '?').join(',') || 'NULL'})`, ins).map((x) => x.bien_so_chuan);
      this.cost.syncTimeAlerts(plates);
      return { voided: ins.length, restored: upd.length };
    });
  }
}

module.exports = { TicketImportService };
