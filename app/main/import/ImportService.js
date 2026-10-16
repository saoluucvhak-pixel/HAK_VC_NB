'use strict';
/**
 * ImportService — import phiếu cân / bảng kê dầu từ Excel (API: import.preview, import.previewRows, import.confirm, import.cancel).
 * Không bao giờ ghi thẳng: preview (kiểm tra, không ghi dữ liệu) → người dùng xem, bỏ dòng lỗi → confirm (kiểm lại + ghi 1 giao dịch).
 */
const crypto = require('node:crypto');
const { openWorkbook } = require('./excelReader');
const M = require('./mapping');
const { issue } = require('../engine/issues');
const { selectPriceVersion } = require('../engine/period');
const { AppError, businessError } = require('../../shared/errors');
const { buildCoverage, CLOSED } = require('../services/periodCoverage');

const CORE_TICKET = ['ticket_no', 'weigh1_date', 'weigh1_time', 'weigh2_date', 'weigh2_time', 'plate_no', 'weight1_kg', 'weight2_kg', 'net_kg', 'route_code'];
const DESC_TICKET = ['row_no', 'origin', 'customer', 'ldd', 'weigh_type', 'transport_unit_name'];
const PAGE = 100;

class ImportService {
  constructor(store) {
    this.store = store;
    this.staging = new Map();   // batchId → dữ liệu preview (trong bộ nhớ)
    this.done = new Map();      // clientRequestId → kết quả (chống bấm 2 lần)
  }

  // ─────────────────────────── preview ───────────────────────────
  async preview({ importType, contractId = '', filePath, sheetName, headerRow, mapping, fixedValues = {}, user = 'system' }) {
    if (!['PHIEU_CAN', 'GIAO_NHAN_DAU'].includes(importType)) throw new AppError('VALIDATION_FAILED', `importType không hợp lệ: ${importType}`);
    if (importType === 'GIAO_NHAN_DAU') this._checkFuelContract(contractId);
    const wb = await openWorkbook(filePath);
    const sheet = sheetName || this._pickSheet(wb, importType);
    const all = wb.rows(sheet);
    const hIdx = Number.isInteger(headerRow) ? headerRow - 1 : M.detectHeaderRow(all, importType);
    if (hIdx < 0) throw businessError('E_MAPPING_REQUIRED', `Không tìm thấy dòng tiêu đề phù hợp trong sheet "${sheet}"`);
    const headers = (all[hIdx] || []).map((h) => (h === null ? '' : String(h)));
    const map = mapping || M.suggestMapping(headers, importType);
    // cột file không có (vd file xuất từ trạm cân không có mã tuyến) → người dùng gán 1 giá trị chung cho mọi dòng
    const fixed = Object.fromEntries(Object.entries(fixedValues).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    const known = new Set(M.FIELDS[importType].map((f) => f.key));
    const badFixed = Object.keys(fixed).filter((k) => !known.has(k));
    if (badFixed.length) throw new AppError('VALIDATION_FAILED', `Cột gán giá trị chung không hợp lệ: ${badFixed.join(', ')}`);
    const miss = M.missingRequired(map, importType).filter((k) => !(k in fixed));
    if (miss.length) throw businessError('E_MAPPING_REQUIRED', `Chưa ghép đủ cột bắt buộc: ${miss.join(', ')}`, { headers, mapping: map, missing: miss });
    const colOf = {}; headers.forEach((h, i) => { if (map[h]) colOf[map[h]] = i; });
    const dataRows = [];
    for (let i = hIdx + 1; i < all.length; i++) dataRows.push({ rowNo: i + 1, cells: all[i] || [] });
    for (const k of Object.keys(fixed)) if (colOf[k] !== undefined) throw new AppError('VALIDATION_FAILED', `Cột ${k} đã có trong file — không gán giá trị chung`);
    const staged = { importType, contractId, fileName: wb.fileName, fileSha256: wb.fileSha256, sheet, headerRowNo: hIdx + 1, headers, mapping: map, colOf, fixed, dataRows, user };
    const result = this._validate(staged);
    const prev = this.store.all('IMPORT_BATCH').find((b) => b.file_sha256 === wb.fileSha256 && b.import_type === importType && b.status === 'CONFIRMED');
    const fileWarnings = prev ? [issue('W_SAME_FILE_IMPORTED', { date: (prev.confirmed_at || prev.created_at).slice(0, 10), batchId: prev.batch_id })] : [];
    const batch = await this.store.transaction((tx) => tx.insert('IMPORT_BATCH', {
      batch_id: tx.nextId('IB', 6), import_type: importType, contract_id: contractId, file_name: wb.fileName, file_sha256: wb.fileSha256, sheet_name: sheet,
      header_json: JSON.stringify(headers), mapping_json: JSON.stringify(Object.keys(fixed).length ? { ...map, '(giá trị chung)': fixed } : map), ...this._counts(result.rows), status: 'PREVIEW',
    }), { user });
    this.staging.set(batch.batch_id, { ...staged, result, dataVersion: this.store.dataVersion });
    return { batchId: batch.batch_id, fileName: wb.fileName, fileSha256: wb.fileSha256, sameFileImportedBefore: !!prev, warnings: fileWarnings,
      sheets: wb.sheets, sheet, headerRowNo: hIdx + 1, headers, mapping: map, fixedValues: fixed, summary: this._summary(result.rows),
      rows: result.rows.slice(0, PAGE).map(publicRow), total: result.rows.length, skippedBlank: result.skippedBlank };
  }

  /**
   * Đọc phiếu cân từ file Excel để ĐỐI CHIẾU — không tạo lô, không ghi gì.
   * Chỉ bắt buộc số phiếu, ngày cân 1, biển số, KL hàng (file trạm cân của đơn vị khác thường thiếu mã tuyến).
   */
  async readTickets({ filePath, sheetName }) {
    const wb = await openWorkbook(filePath);
    const sheet = sheetName || this._pickSheet(wb, 'PHIEU_CAN');
    const all = wb.rows(sheet);
    const hIdx = M.detectHeaderRow(all, 'PHIEU_CAN');
    if (hIdx < 0) throw businessError('E_MAPPING_REQUIRED', `Không tìm thấy dòng tiêu đề phiếu cân trong sheet "${sheet}"`);
    const headers = (all[hIdx] || []).map((h) => (h === null ? '' : String(h)));
    const map = M.suggestMapping(headers, 'PHIEU_CAN');
    const NEED = { ticket_no: 'Số phiếu', weigh1_date: 'Ngày cân 1', plate_no: 'Biển số', net_kg: 'KL hàng (KG)' };
    const miss = Object.keys(NEED).filter((k) => !Object.values(map).includes(k));
    if (miss.length) throw businessError('E_MAPPING_REQUIRED', `File thiếu cột: ${miss.map((k) => NEED[k]).join(', ')}`, { headers, mapping: map, missing: miss });
    const colOf = {}; headers.forEach((h, i) => { if (map[h]) colOf[map[h]] = i; });
    const dataRows = [];
    for (let i = hIdx + 1; i < all.length; i++) dataRows.push({ rowNo: i + 1, cells: all[i] || [] });
    const { rows } = this._validate({ importType: 'PHIEU_CAN', colOf, fixed: {}, headers, dataRows });
    return { fileName: wb.fileName, sheet, rows: rows.map((r) => ({ rowNo: r.rowNo, record: r.record, errors: r.issues.filter((i) => i.level === 'ERROR').map((i) => i.message) })) };
  }

  previewRows({ batchId, status, page = 1, pageSize = PAGE }) {
    const st = this.staging.get(batchId); if (!st) throw new AppError('NOT_FOUND', `Không có lô đang xem trước: ${batchId}`);
    const rows = status ? st.result.rows.filter((r) => r.status === status) : st.result.rows;
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize).map(publicRow), total: rows.length };
  }

  // ─────────────────────────── confirm ───────────────────────────
  async confirm({ batchId, skipRowNos = [], acceptWarnings = false, clientRequestId, user = 'system' }) {
    if (!clientRequestId) throw new AppError('VALIDATION_FAILED', 'Thiếu clientRequestId');
    if (this.done.has(clientRequestId)) return this.done.get(clientRequestId);
    const st = this.staging.get(batchId); if (!st) throw new AppError('NOT_FOUND', `Không có lô đang xem trước: ${batchId}`);
    const skip = new Set(skipRowNos);
    const fresh = this._validate(st); // kiểm lại trên dữ liệu hiện tại
    const sig = (rows) => rows.map((r) => `${r.rowNo}:${r.status}`).join('|');
    if (sig(fresh.rows) !== sig(st.result.rows)) {
      throw businessError('E_PREVIEW_STALE', 'Dữ liệu đã thay đổi kể từ lúc xem trước — hãy xem trước lại', { before: this._summary(st.result.rows), now: this._summary(fresh.rows) });
    }
    const keep = fresh.rows.filter((r) => !skip.has(r.rowNo));
    const errs = keep.filter((r) => r.status === 'ERROR');
    if (errs.length) throw businessError('E_IMPORT_HAS_ERRORS', `Còn ${errs.length} dòng lỗi chưa bỏ`, { rowNos: errs.map((r) => r.rowNo) });
    if (!acceptWarnings && keep.some((r) => r.status === 'WARNING' || r.status === 'UPDATE')) throw new AppError('VALIDATION_FAILED', 'Có dòng cảnh báo / cập nhật — cần xác nhận "chấp nhận cảnh báo"');
    const toInsert = keep.filter((r) => r.status === 'OK' || r.status === 'WARNING');
    const toUpdate = keep.filter((r) => r.status === 'UPDATE');
    const out = await this.store.transaction((tx) => {
      const ids = []; const updated = []; const restored = []; const recalc = new Set();
      for (const r of toUpdate) {
        const before = tx.get('PHIEU_CAN', r.update.id);
        const F = r.update.fields; // chỉ các cột khác nhau và có trong file
        const patch = Object.fromEntries(F.map((f) => [f, r.record[f]]));
        if (F.includes('transport_unit_name')) patch.owner_unit_code = r.record.owner_unit_code;
        tx.update('PHIEU_CAN', r.update.id, { ...patch, is_deleted: false, validation_flags: r.record.validation_flags, flags_ack: false });
        tx.audit(r.update.mode === 'RESTORE' ? 'IMPORT_RESTORE' : 'IMPORT_UPDATE', 'PHIEU_CAN', r.update.id,
          { ...Object.fromEntries(F.map((f) => [f, before[f]])), ...(r.update.mode === 'RESTORE' ? { is_deleted: true } : {}) }, patch, { reason: `import ${st.fileName} dòng ${r.rowNo} (lô ${batchId})` });
        for (const p of r.update.drafts) recalc.add(p);
        (r.update.mode === 'RESTORE' ? restored : updated).push(r.update.id);
      }
      for (const p of recalc) tx.update('KY_TINH', p, { needs_recalc: true });
      for (const r of toInsert) {
        const rec = { ...r.record, import_batch_id: batchId };
        if (st.importType === 'GIAO_NHAN_DAU') rec.receipt_id = tx.nextId('GD');
        tx.insert(st.importType, rec); ids.push(rec.ticket_id || rec.receipt_id);
      }
      const counts = { ...this._counts(fresh.rows), ok_rows: toInsert.filter((r) => r.status === 'OK').length, warning_rows: toInsert.filter((r) => r.status === 'WARNING').length };
      const { after } = tx.update('IMPORT_BATCH', batchId, { ...counts, status: 'CONFIRMED', confirmed_at: tx.now, confirmed_by: user });
      tx.audit('IMPORT_CONFIRM', 'IMPORT_BATCH', batchId, null, { importType: st.importType, contractId: st.contractId, file: st.fileName, inserted: ids.length, skipped: skip.size });
      return { inserted: ids.length, insertedIds: ids, updated: updated.length, restored: restored.length, recalcPeriods: [...recalc], skippedByUser: [...skip], duplicates: fresh.rows.filter((r) => r.status === 'DUPLICATE').length, batch: after };
    }, { user });
    this.staging.delete(batchId);
    this.done.set(clientRequestId, out);
    return out;
  }

  async cancel({ batchId, user = 'system' }) {
    const b = this.store.get('IMPORT_BATCH', batchId);
    if (!b || b.status !== 'PREVIEW') throw new AppError('NOT_FOUND', `Không có lô PREVIEW ${batchId}`);
    await this.store.transaction((tx) => tx.update('IMPORT_BATCH', batchId, { status: 'CANCELLED' }), { user });
    this.staging.delete(batchId);
    return { batchId, status: 'CANCELLED' };
  }

  // ─────────────────────────── nội bộ ───────────────────────────
  _checkFuelContract(contractId) {
    const c = this.store.get('HOP_DONG', contractId);
    if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    if (c.carrier_unit_code !== this.store.unitCode) {
      throw businessError('E_NOT_CARRIER', `Đơn vị của bản cài (${this.store.unitCode}) không phải bên vận chuyển của hợp đồng ${c.contract_code} — không nhập bảng kê dầu được`);
    }
  }
  _pickSheet(wb, importType) {
    const pref = importType === 'PHIEU_CAN' ? ['NL_VC', 'CAN'] : ['NL_GIAONHANDAU'];
    for (const p of pref) { const s = wb.sheets.find((x) => x.name === p && !x.hidden); if (s) return s.name; }
    let best = null;
    for (const s of wb.sheets.filter((x) => !x.hidden)) {
      const rows = wb.rows(s.name); const h = M.detectHeaderRow(rows, importType);
      const score = h < 0 ? 0 : new Set(rows[h].map((x) => M.matchField(M.FIELDS[importType], x)).filter(Boolean)).size;
      if (!best || score > best.score) best = { name: s.name, score };
    }
    return best.name;
  }
  _counts(rows) {
    const c = (s) => rows.filter((r) => r.status === s).length;
    return { total_rows: rows.length, ok_rows: c('OK'), warning_rows: c('WARNING') + c('UPDATE'), error_rows: c('ERROR'), duplicate_rows: c('DUPLICATE') };
  }
  _summary(rows) {
    const c = (s) => rows.filter((r) => r.status === s).length;
    return { total: rows.length, ok: c('OK'), warning: c('WARNING'), error: c('ERROR'), duplicate: c('DUPLICATE'), update: c('UPDATE') };
  }

  _validate(st) {
    const ctx = this._catalog();
    const rows = []; let skippedBlank = 0;
    const fixed = st.fixed || {};
    const get = (cells, key) => (st.colOf[key] === undefined ? (key in fixed ? fixed[key] : null) : cells[st.colOf[key]]);
    for (const { rowNo, cells } of st.dataRows) {
      const vals = Object.keys(st.colOf).map((k) => get(cells, k));
      if (vals.every((v) => v === null || v === '')) { skippedBlank++; continue; }
      if (cells.some((v) => typeof v === 'string' && /^t[ổo]ng c[ộo]ng$/i.test(v.trim()))) { skippedBlank++; continue; } // dòng tổng
      const r = st.importType === 'PHIEU_CAN' ? this._ticketRow(rowNo, cells, get, ctx) : this._fuelRow(rowNo, cells, get, ctx, st.contractId);
      if (r === null) { skippedBlank++; continue; }
      r.raw = Object.fromEntries(st.headers.map((h, i) => [h.replace(/\s+/g, ' ').trim() || `Cột ${i + 1}`, cells[i] && typeof cells[i] === 'object' ? cells[i].__date : (cells[i] ?? null)]).filter(([k]) => k));
      // bản 1.2.5: chỉ lưu MẢNG giá trị ô theo thứ tự cột của file; tên cột nằm 1 lần ở IMPORT_BATCH.header_json (gọn ~2 lần)
      r.record.raw_row_json = JSON.stringify(st.headers.map((h, i) => (cells[i] && typeof cells[i] === 'object' ? cells[i].__date : (cells[i] ?? null))));
      rows.push(r);
    }
    ctx.cols = new Set([...Object.keys(st.colOf), ...Object.keys(fixed)]); // chỉ so / cập nhật cột CÓ trong file
    if (st.importType === 'PHIEU_CAN') { this._ticketDupes(rows, ctx); this._ticketLate(rows); }
    else this._fuelDupes(rows, ctx, st.contractId);
    for (const r of rows) {
      r.status = r.issues.some((i) => i.level === 'ERROR') ? 'ERROR' : r.duplicate ? 'DUPLICATE' : r.update ? 'UPDATE' : r.issues.some((i) => i.level === 'WARNING') ? 'WARNING' : 'OK';
      r.record.validation_flags = r.issues.filter((i) => i.level === 'WARNING').map((i) => i.code).filter((c, i, a) => a.indexOf(c) === i).join(';');
    }
    return { rows, skippedBlank };
  }

  _catalog() {
    const s = this.store;
    const cfg = Object.fromEntries(s.all('CONFIG').map((c) => [c.config_key, c.config_value]));
    const unitByName = new Map();
    for (const u of s.all('DON_VI')) for (const n of [u.unit_code, u.unit_name, u.short_name, ...(u.name_aliases || '').split(';')]) if (n) unitByName.set(n.trim().toUpperCase(), u.unit_code);
    return {
      plateRegex: new RegExp(cfg.PLATE_REGEX || '^\\d{2}[A-Z]{1,2}-\\d{4,5}$'),
      kgTol: Number(cfg.KG_CHECK_TOLERANCE || 0),
      vehicles: new Map(s.all('XE').map((x) => [x.plate_no, x])),
      vehicleByKey: new Map(s.all('XE').map((x) => [x.plate_key, x])),
      routes: new Set(s.all('TUYEN_VC').map((r) => r.route_code)),
      unitByName,
      tickets: new Map(s.all('PHIEU_CAN').map((t) => [t.ticket_key, t])),
      ticketPeriods: (() => { const m = new Map(); for (const d of s.all('TRANSPORT_DETAIL')) { if (!d.is_current || d.usage_state === 'RELEASED') continue; const p = s.get('KY_TINH', d.period_id); if (!p || p.status === 'HUY') continue; if (!m.has(d.ticket_id)) m.set(d.ticket_id, []); m.get(d.ticket_id).push(p); } return m; })(),
      receipts: s.all('GIAO_NHAN_DAU').filter((r) => !r.is_deleted),
      contractPlates: new Map(),
    };
  }

  _ticketRow(rowNo, cells, get, ctx) {
    const iss = []; const rec = {};
    const need = (key, label, v) => { if (v === '' || v === null || v === undefined) iss.push(issue('E_FIELD_MISSING', { rowNo, field: label })); };
    rec.ticket_no = M.toText(get(cells, 'ticket_no')).replace(/\.0$/, '');
    rec.row_no = M.toText(get(cells, 'row_no'));
    if (!rec.ticket_no && !get(cells, 'weigh1_date')) return null; // không phải dòng dữ liệu (vd bảng pivot bên dưới)
    need('ticket_no', 'số phiếu', rec.ticket_no);
    for (const [k, lab] of [['weigh1_date', 'ngày cân 1'], ['weigh2_date', 'ngày cân 2']]) {
      const d = M.toDate(get(cells, k)); if (d.error) iss.push(issue('E_DATE_INVALID', { detail: `dòng ${rowNo} ${lab}: ${d.error}` })); rec[k] = d.value || ''; need(k, lab, rec[k]);
    }
    for (const k of ['weigh1_time', 'weigh2_time']) { const t = M.toTime(get(cells, k)); if (t.error) iss.push(issue('E_DATE_INVALID', { detail: `dòng ${rowNo}: ${t.error}` })); rec[k] = t.value || ''; }
    if (rec.weigh1_date && rec.weigh2_date && (rec.weigh2_date < rec.weigh1_date || (rec.weigh2_date === rec.weigh1_date && rec.weigh1_time && rec.weigh2_time && rec.weigh2_time < rec.weigh1_time))) {
      iss.push(issue('E_DATE_INVALID', { detail: `dòng ${rowNo}: ngày/giờ cân 2 trước cân 1` }));
    }
    if (rec.weigh1_date && this.store.archivedThrough && Number(rec.weigh1_date.slice(0, 4)) <= this.store.archivedThrough) iss.push(issue('E_YEAR_ARCHIVED', { rowNo, date: rec.weigh1_date.split('-').reverse().join('/'), year: this.store.archivedThrough }));
    rec.plate_no = M.toText(get(cells, 'plate_no')).toUpperCase();
    need('plate_no', 'biển số', rec.plate_no);
    if (rec.plate_no && !ctx.plateRegex.test(rec.plate_no)) iss.push(issue('E_PLATE_FORMAT', { rowNo, value: rec.plate_no }));
    else if (rec.plate_no && !ctx.vehicles.has(rec.plate_no)) iss.push(issue('E_VEHICLE_NOT_FOUND', { rowNo, value: rec.plate_no }));
    for (const k of ['weight1_kg', 'weight2_kg', 'net_kg']) { const n = M.toNumber(get(cells, k)); rec[k] = n.error ? '' : n.value; if (n.error && k !== 'net_kg') iss.push(issue('E_KG_INVALID', { rowNo, value: get(cells, k) })); }
    if (!(typeof rec.net_kg === 'number' && rec.net_kg > 0)) iss.push(issue('E_KG_INVALID', { rowNo, value: get(cells, 'net_kg') }));
    else if (typeof rec.weight1_kg === 'number' && typeof rec.weight2_kg === 'number' && Math.abs(rec.net_kg - Math.abs(rec.weight2_kg - rec.weight1_kg)) > ctx.kgTol) {
      iss.push(issue('W_KG_MISMATCH', { ticketNo: rec.ticket_no, netKg: rec.net_kg, diffKg: Math.abs(rec.weight2_kg - rec.weight1_kg) }));
    }
    for (const k of ['origin', 'customer', 'ldd', 'weigh_type']) rec[k] = M.toText(get(cells, k));
    rec.route_code = M.toText(get(cells, 'route_code')).toUpperCase();
    if (!rec.route_code) iss.push(issue('E_ROUTE_MISSING', { ticketNo: rec.ticket_no, plateNo: rec.plate_no }));
    else if (!ctx.routes.has(rec.route_code)) iss.push(issue('E_ROUTE_NOT_FOUND', { routeCode: rec.route_code }));
    rec.transport_unit_name = M.toText(get(cells, 'transport_unit_name'));
    const byName = rec.transport_unit_name ? ctx.unitByName.get(rec.transport_unit_name.toUpperCase()) : undefined;
    const owner = ctx.vehicles.get(rec.plate_no)?.owner_unit_code;
    rec.owner_unit_code = byName || owner || '';
    if (byName && owner && byName !== owner) iss.push(issue('W_OWNER_MISMATCH', { rowNo, value: rec.transport_unit_name, plateNo: rec.plate_no, owner }));
    if (rec.weigh1_date && rec.weigh2_date && rec.weigh1_date !== rec.weigh2_date) iss.push(issue('W_OVERNIGHT', { count: 1 }));
    rec.ticket_key = `${rec.ticket_no}|${rec.weigh1_date}|${rec.plate_no}`;
    rec.ticket_id = `PC-${crypto.createHash('sha1').update(rec.ticket_key).digest('hex').slice(0, 12)}`;
    Object.assign(rec, { flags_ack: false, flags_ack_note: '', is_deleted: false });
    return { rowNo, record: rec, issues: iss };
  }

  /** Phiếu mới có ngày nằm trong kỳ đã xác nhận / đã khóa → cảnh báo "về muộn" (vẫn nhập được, nhưng kỳ đó không tự tính lại). */
  _ticketLate(rows) {
    const fresh = rows.filter((r) => !r.duplicate && (!r.update || r.update.mode === 'RESTORE') && !r.issues.some((i) => i.level === 'ERROR'));
    if (!fresh.length) return;
    const cov = buildCoverage(this.store);
    if (!cov.periods.some((p) => CLOSED.has(p.status))) return;
    const TXT = { DA_XAC_NHAN: 'đã xác nhận', DA_KHOA: 'đã khóa' };
    for (const r of fresh) {
      const p = cov.periodsFor(r.record).flatMap((x) => x.periods).find((x) => CLOSED.has(x.status));
      if (p) r.issues.push(issue('W_TICKET_LATE', { ticketNo: r.record.ticket_no, date: r.record.weigh1_date.split('-').reverse().join('/'), plateNo: r.record.plate_no, periodCode: p.period_code, status: TXT[p.status] }));
    }
  }

  _ticketDupes(rows, ctx) {
    const seen = new Map();
    for (const r of rows) {
      if (r.issues.some((i) => i.level === 'ERROR')) continue;
      const k = r.record.ticket_key;
      if (seen.has(k)) { r.issues.push(issue('E_TICKET_DUPLICATE', { rowNo: r.rowNo, ticketNo: r.record.ticket_no, date: r.record.weigh1_date, plateNo: r.record.plate_no, detail: `trùng dòng ${seen.get(k)} trong file` })); continue; }
      seen.set(k, r.rowNo);
      const old = ctx.tickets.get(k);
      if (!old) continue;
      const inFile = (f) => !ctx.cols || ctx.cols.has(f);
      const core = CORE_TICKET.filter((f) => inFile(f) && old[f] !== r.record[f]);
      const desc = DESC_TICKET.filter((f) => f !== 'row_no' && inFile(f) && (old[f] || '') !== (r.record[f] || ''));
      const LBL = { weigh1_time: 'giờ cân 1', weigh2_date: 'ngày cân 2', weigh2_time: 'giờ cân 2', weight1_kg: 'cân lần 1', weight2_kg: 'cân lần 2', net_kg: 'KL hàng', route_code: 'tuyến', origin: 'nguồn gốc', customer: 'khách hàng', ldd: 'LDĐ', weigh_type: 'kiểu cân', transport_unit_name: 'đơn vị VC' };
      const fmtv = (f, v) => (f.endsWith('_date') ? String(v || '').split('-').reverse().join('/') : v === '' || v === null || v === undefined ? '(trống)' : v);
      const changes = [...core, ...(old.is_deleted ? desc : [])].map((f) => `${LBL[f] || f} ${fmtv(f, old[f])} → ${fmtv(f, r.record[f])}`).join(', ');
      // phiếu đã xóa trước đây → import lại = KHÔI PHỤC (theo số liệu trong file)
      if (old.is_deleted) { r.update = { id: old.ticket_id, mode: 'RESTORE', drafts: [], fields: [...core, ...desc] }; r.issues.push(issue('W_TICKET_RESTORE', { ticketNo: r.record.ticket_no, changes: changes ? ` — số liệu theo file: ${changes}` : '' })); continue; }
      if (core.length) {
        const ps = ctx.ticketPeriods.get(old.ticket_id) || [];
        const hard = ps.find((p) => p.status !== 'NHAP');
        if (hard) {
          r.issues.push(issue('E_TICKET_DUPLICATE', { rowNo: r.rowNo, ticketNo: r.record.ticket_no, date: r.record.weigh1_date, plateNo: r.record.plate_no,
            detail: `đã có nhưng khác số liệu (${changes}) và đang ở kỳ ${hard.period_code} ${hard.status === 'DA_KHOA' ? 'đã khóa' : 'đã xác nhận'} — trả kỳ về nháp rồi import lại để cập nhật` }));
          continue;
        }
        // phiếu đã có, khác số liệu, chưa ở kỳ đã chốt → CẬP NHẬT theo file
        r.update = { id: old.ticket_id, mode: 'UPDATE', drafts: ps.map((p) => p.period_id), fields: core };
        r.issues.push(issue('W_TICKET_UPDATE', { ticketNo: r.record.ticket_no, changes, drafts: ps.length ? ` — kỳ nháp ${ps.map((p) => p.period_code).join(', ')} phải tính lại` : '' }));
        continue;
      }
      // chỉ khác cột mô tả (LDĐ, nguồn gốc…) → giữ bản đang có (file các nhà máy khác nhau ở các cột này); sửa mô tả: "Sửa hàng loạt cột mô tả"
      r.duplicate = true;
      if (desc.length) r.issues.push(issue('W_TICKET_DESCRIPTIVE_DIFF', { rowNo: r.rowNo, ticketNo: r.record.ticket_no, fields: desc.join(', ') }));
    }
  }

  _fuelRow(rowNo, cells, get, ctx, contractId) {
    const iss = []; const rec = { contract_id: contractId };
    const d = M.toDate(get(cells, 'receive_date'));
    if (d.error) iss.push(issue('E_DATE_INVALID', { detail: `dòng ${rowNo} ngày nhận dầu: ${d.error}` }));
    rec.receive_date = d.value || '';
    const rawCode = M.toText(get(cells, 'fuel_vehicle_code'));
    if (!rec.receive_date && !rawCode) return null;
    if (!rec.receive_date && !d.error) iss.push(issue('E_FIELD_MISSING', { rowNo, field: 'ngày nhận dầu' }));
    const pd = M.toDate(get(cells, 'purchase_date'));
    if (pd.error) iss.push(issue('E_DATE_INVALID', { detail: `dòng ${rowNo} ngày mua dầu: ${pd.error}` }));
    rec.purchase_date = pd.value || '';
    rec.route_code = M.toText(get(cells, 'route_code')).toUpperCase();
    if (!rec.route_code) iss.push(issue('E_ROUTE_MISSING', { ticketNo: `dòng ${rowNo}`, plateNo: rawCode }));
    else if (!ctx.routes.has(rec.route_code)) iss.push(issue('E_ROUTE_NOT_FOUND', { routeCode: rec.route_code }));
    rec.fuel_vehicle_code = rawCode;
    const veh = ctx.vehicleByKey.get(M.plateKey(rawCode));
    if (!rawCode) iss.push(issue('E_FIELD_MISSING', { rowNo, field: 'biển số xe' }));
    else if (!veh) iss.push(issue('E_VEHICLE_NOT_FOUND', { rowNo, value: rawCode }));
    rec.plate_no = veh ? veh.plate_no : '';
    rec.owner_unit_code = veh ? veh.owner_unit_code : '';
    if (veh && rawCode !== veh.plate_no && !/^[A-Z]{2}_[0-9A-Z]+$/.test(rawCode)) iss.push(issue('W_PLATE_FORMAT', { rowNo, value: rawCode, plateNo: veh.plate_no }));
    rec.uom = (M.toText(get(cells, 'uom')) || 'LÍT').toUpperCase();
    const q = M.toNumber(get(cells, 'qty_liter')); rec.qty_liter = q.error ? '' : q.value;
    if (!(typeof rec.qty_liter === 'number' && rec.qty_liter !== 0)) iss.push(issue('E_QTY_INVALID', { rowNo, value: get(cells, 'qty_liter') }));
    const offset = typeof rec.qty_liter === 'number' && rec.qty_liter < 0; // dòng bù trừ nhiên liệu
    if (offset) iss.push(issue('W_FUEL_OFFSET', { rowNo, qty: rec.qty_liter }));
    const rawPrice = get(cells, 'fuel_price_excl_vat');
    const pr = M.toNumber(rawPrice); rec.fuel_price_excl_vat = pr.error ? '' : pr.value;
    // dòng bù trừ được để trống đơn giá (lưu 0 — chỉ trừ lít); dòng thường phải có đơn giá > 0
    if (offset && (rawPrice === null || rawPrice === '' || rawPrice === undefined)) rec.fuel_price_excl_vat = 0;
    else if (!(typeof rec.fuel_price_excl_vat === 'number' && (rec.fuel_price_excl_vat > 0 || (offset && rec.fuel_price_excl_vat === 0)))) iss.push(issue('E_PRICE_NEGATIVE', { what: `Dòng ${rowNo}: đơn giá dầu`, value: rawPrice }));
    const g = M.toText(get(cells, 'giver_unit_code'));
    rec.giver_unit_code = ctx.unitByName.get(g.toUpperCase()) || '';
    if (!g) iss.push(issue('E_FIELD_MISSING', { rowNo, field: 'đơn vị giao dầu' }));
    else if (!rec.giver_unit_code) iss.push(issue('E_UNIT_NOT_FOUND', { rowNo, value: g }));
    if (veh) {
      if (!ctx.contractPlates.has(contractId)) ctx.contractPlates.set(contractId, new Set(this.store.all('HOP_DONG_XE').filter((x) => x.contract_id === contractId).map((x) => x.plate_no)));
      if (!ctx.contractPlates.get(contractId).has(veh.plate_no)) iss.push(issue('W_VEHICLE_OUT_OF_CONTRACT', { receiptId: `dòng ${rowNo}`, plateNo: veh.plate_no }));
    }
    rec.fuel_depot = M.toText(get(cells, 'fuel_depot'));
    if (rec.receive_date && this.store.archivedThrough && Number(rec.receive_date.slice(0, 4)) <= this.store.archivedThrough) iss.push(issue('E_YEAR_ARCHIVED', { rowNo, date: rec.receive_date.split('-').reverse().join('/'), year: this.store.archivedThrough }));
    // tuyến đang dùng đơn giá cố định tại ngày nhận dầu → tuyến cố định không nhận dầu (chốt 07/10/2026): cảnh báo ngay khi import
    if (rec.route_code && rec.receive_date && ctx.routes.has(rec.route_code)) {
      if (!ctx.prices) ctx.prices = this.store.all('PRICE_HISTORY');
      const sel = selectPriceVersion(ctx.prices, rec.route_code, contractId, rec.receive_date, rec.receive_date, { priceVersionDate: 'PERIOD_END' });
      if (sel.price && sel.price.price_method === 'CO_DINH') iss.push(issue('W_FUEL_FIXED_ROUTE', { rowNo, routeCode: rec.route_code, priceId: sel.price.price_id }));
    }
    Object.assign(rec, { receipt_id: '', flags_ack: false, flags_ack_note: '', is_deleted: false });
    return { rowNo, record: rec, issues: iss };
  }

  _fuelDupes(rows, ctx, contractId) {
    // Trùng với dữ liệu đã có (cùng HĐ, ngày, xe, lít, giá, ngày mua, bên giao) → DUPLICATE (ghép 1-1, nên 2 dòng giống hệt hợp lệ vẫn giữ đủ)
    const key = (r) => [r.receive_date, r.plate_no, r.qty_liter, r.fuel_price_excl_vat, r.purchase_date, r.giver_unit_code, r.route_code].join('|');
    const pool = new Map();
    for (const r of ctx.receipts.filter((x) => x.contract_id === contractId)) pool.set(key(r), (pool.get(key(r)) || 0) + 1);
    for (const r of rows) {
      if (r.issues.some((i) => i.level === 'ERROR')) continue;
      const k = key(r.record); const n = pool.get(k) || 0;
      if (n > 0) { r.duplicate = true; pool.set(k, n - 1); }
    }
    // Nghi trùng trong chính file: cùng ngày + xe + số lít
    const groups = new Map();
    for (const r of rows) { if (r.duplicate) continue; const k = [r.record.receive_date, r.record.plate_no, r.record.qty_liter].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const g of groups.values()) if (g.length > 1) for (const r of g) {
      const other = g.find((x) => x !== r);
      r.issues.push(issue('W_POSSIBLE_DUPLICATE', { rowNo: r.rowNo, date: r.record.receive_date, plateNo: r.record.plate_no, qty: r.record.qty_liter, otherRow: other.rowNo }));
    }
  }
}

function publicRow(r) {
  return { rowNo: r.rowNo, status: r.status, issues: r.issues.map((i) => ({ code: i.code, level: i.level, message: i.message })), normalized: { ...r.record, raw_row_json: undefined } };
}

module.exports = { ImportService };
