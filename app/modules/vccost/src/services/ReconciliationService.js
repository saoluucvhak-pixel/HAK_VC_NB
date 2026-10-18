'use strict';
/**
 * ĐỐI CHIẾU hệ thống (A) ↔ bảng kê/đề nghị thanh toán của đơn vị VC (B), cấp phiếu. (docs/RECONCILIATION_SPEC.md)
 * - matchRows(): hàm thuần, không đụng DB → dễ test.
 * - Không sửa phiếu cân. Chỉ ghi kết quả + cờ trang_thai_doi_chieu + 1 cảnh báo tổng hợp / lô.
 */
const crypto = require('crypto');
const { readWorkbook } = require('../excel/workbookReader');
const { fold, matchField } = require('../excel/columnMapping');
const { normalizePlate, displayPlate } = require('../utils/plate');
const { parseDateTime, datePart } = require('../utils/datetime');
const { toDb, fromDb } = require('../utils/dbMoney');
const { ValidationError } = require('./CatalogService');

const B_SYN = {
  don_gia: ['don gia', 'don gia (dong/tan)', 'gia'],
  tien_truoc_vat: ['thanh tien', 'thanh tien truoc vat', 'tien truoc vat', 'cuoc van chuyen', 'cuoc truoc thue'],
  tien_vat: ['vat', 'tien vat', 'thue gtgt', 'tien thue'],
  tong_tien: ['tong cong', 'tong tien', 'tong thanh toan', 'cong tien thanh toan', 'tong cong tien thanh toan'],
  ngay: ['ngay', 'ngay van chuyen', 'ngay can'],
};
const B_FIELDS = ['so_phieu', 'bien_so', 'ngay', 'kl_hang_kg', 'don_gia', 'tien_truoc_vat', 'tien_vat', 'tong_tien'];

function detectB(aoa) {
  let best = { headerRow: 0, mapping: {}, score: 0 };
  for (let r = 0; r < Math.min(30, aoa.length); r++) {
    const mapping = {};
    (aoa[r] || []).forEach((cell, c) => {
      const h = fold(cell); if (!h) return;
      let f = matchField(cell);
      if (f === 'ngay_gio_can_1') f = 'ngay';
      if (!B_FIELDS.includes(f)) { f = Object.entries(B_SYN).find(([, s]) => s.includes(h))?.[0] || null; }
      if (f && B_FIELDS.includes(f) && mapping[f] === undefined) mapping[f] = c;
    });
    const score = Object.keys(mapping).length + (mapping.so_phieu !== undefined || mapping.bien_so !== undefined ? 3 : 0);
    if (score > best.score) best = { headerRow: r, mapping, score };
  }
  return best;
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function parseB(aoa, headerRow, mapping) {
  const out = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (row.every((c) => c === null || c === undefined || c === '')) continue;
    const first = fold(row.find((c) => c !== null && c !== undefined && c !== '') ?? '');
    if (first.startsWith('tong cong') || first === 'cong') continue;
    const g = (f) => (mapping[f] === undefined ? null : row[mapping[f]]);
    const sp = g('so_phieu'); const bs = g('bien_so');
    if ((sp === null || sp === '') && (bs === null || bs === '')) continue;
    out.push({
      source_row: r + 1, so_phieu: sp === null || sp === '' ? null : String(sp).trim(), bien_so_goc: bs == null ? null : String(bs),
      bien_so_chuan: bs ? normalizePlate(bs) : null, ngay: g('ngay') ? datePart(parseDateTime(g('ngay'))) : null,
      kl_hang_kg: num(g('kl_hang_kg')), don_gia: num(g('don_gia')), tien_truoc_vat: num(g('tien_truoc_vat')), tien_vat: num(g('tien_vat')), tong_tien: num(g('tong_tien')),
    });
  }
  return out;
}

const SEVERITY = ['LECH_KHOI_LUONG', 'LECH_DON_GIA', 'LECH_TIEN', 'LECH_VAT'];

/** So sánh 1 cặp. Chỉ so cột mà B có giá trị. */
function compare(a, b, { tolKg = 0, tolMoney = 1 }) {
  const diffs = [];
  const chk = (col, tol, kind) => {
    if (b[col] === null || b[col] === undefined || a[col] === null || a[col] === undefined) return;
    const d = Number(a[col]) - Number(b[col]);
    if (Math.abs(d) > tol) diffs.push({ cot: col, he_thong: Number(a[col]), doi_tac: Number(b[col]), chenh: Math.round(d * 1000) / 1000, kind });
  };
  chk('kl_hang_kg', tolKg, 'LECH_KHOI_LUONG'); chk('don_gia', 0, 'LECH_DON_GIA');
  chk('tien_truoc_vat', tolMoney, 'LECH_TIEN'); chk('tong_tien', tolMoney, 'LECH_TIEN'); chk('tien_vat', tolMoney, 'LECH_VAT');
  const kinds = new Set(diffs.map((d) => d.kind));
  const ket_qua = SEVERITY.find((k) => kinds.has(k)) || 'KHOP';
  return { ket_qua, diffs: diffs.map(({ kind, ...d }) => d) };
}

/**
 * @param A [{id, so_phieu, bien_so_chuan, ngay_can, kl_hang_kg, don_gia, tien_truoc_vat, tien_vat, tong_tien}]
 * @param B [{idx, so_phieu, bien_so_chuan, ngay, kl_hang_kg, ...}]
 * @returns [{a, b, khoa_khop, ket_qua, diffs}]
 */
function matchRows(A, B, opt = {}) {
  const usedA = new Set(); const out = [];
  const bySo = new Map();
  for (const a of A) { const k = String(a.so_phieu); if (!bySo.has(k)) bySo.set(k, []); bySo.get(k).push(a); }
  const bCount = new Map();
  // Trùng dữ liệu chỉ khi cùng số phiếu VÀ cùng biển số (số phiếu có thể lặp hợp lệ giữa các xe)
  const bKey = (b) => `${b.so_phieu}|${b.bien_so_chuan || ''}`;
  for (const b of B) if (b.so_phieu) bCount.set(bKey(b), (bCount.get(bKey(b)) || 0) + 1);
  const pending = [];
  for (const b of B) {
    if (b.so_phieu) {
      if (bCount.get(bKey(b)) > 1) { out.push({ a: null, b, khoa_khop: 'SO_PHIEU', ket_qua: 'TRUNG_DU_LIEU', diffs: [{ cot: 'so_phieu', he_thong: null, doi_tac: b.so_phieu, chenh: null }] }); continue; }
      let cands = (bySo.get(b.so_phieu) || []).filter((a) => !usedA.has(a.id));
      if (cands.length > 1 && b.bien_so_chuan) cands = cands.filter((a) => a.bien_so_chuan === b.bien_so_chuan);
      if (cands.length === 1) { const a = cands[0]; usedA.add(a.id); out.push({ a, b, khoa_khop: 'SO_PHIEU', ...compare(a, b, opt) }); continue; }
      if (cands.length > 1) { out.push({ a: null, b, khoa_khop: 'SO_PHIEU', ket_qua: 'CAN_KIEM_TRA', diffs: [{ cot: 'so_phieu', he_thong: cands.length, doi_tac: b.so_phieu, chenh: null }] }); continue; }
      if (!b.bien_so_chuan || !b.ngay) { out.push({ a: null, b, khoa_khop: null, ket_qua: 'THIEU_BEN_A', diffs: [] }); continue; }
    }
    pending.push(b);
  }
  // B không có số phiếu (hoặc số phiếu không thấy bên A): khớp biển số + ngày + KL
  for (const b of pending) {
    const cands = A.filter((a) => !usedA.has(a.id) && a.bien_so_chuan === b.bien_so_chuan && a.ngay_can === b.ngay
      && (b.kl_hang_kg == null || Math.abs(a.kl_hang_kg - b.kl_hang_kg) <= (opt.tolKg || 0)));
    if (cands.length === 1) { const a = cands[0]; usedA.add(a.id); out.push({ a, b, khoa_khop: 'BIEN_SO_NGAY_KL', ...compare(a, b, opt) }); }
    else if (cands.length > 1) out.push({ a: null, b, khoa_khop: 'BIEN_SO_NGAY_KL', ket_qua: 'CAN_KIEM_TRA', diffs: [{ cot: 'ung_vien', he_thong: cands.length, doi_tac: 1, chenh: null }] });
    else out.push({ a: null, b, khoa_khop: null, ket_qua: 'THIEU_BEN_A', diffs: [] });
  }
  for (const a of A) if (!usedA.has(a.id)) out.push({ a, b: null, khoa_khop: null, ket_qua: 'THIEU_BEN_B', diffs: [] });
  return out;
}

class ReconciliationService {
  constructor(db, { audit, alerts, reports }) { Object.assign(this, { db, audit, alerts, reports }); this.previews = new Map(); }

  open({ filePath, buffer, fileName }) {
    const wb = readWorkbook({ filePath, buffer, fileName });
    const sheets = wb.sheets.map((s) => ({ ...s, det: detectB(wb.aoa(s.name)) }));
    const best = sheets.reduce((a, s) => (!a || s.det.score > a.det.score ? s : a), null);
    const token = crypto.randomUUID(); this.previews.set(token, { wb });
    return { token, fileName: wb.fileName, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows })), suggestedSheet: best.name };
  }

  sheetInfo(token, sheetName, headerRow = null) {
    const p = this._p(token); const aoa = p.wb.aoa(sheetName); const det = detectB(aoa);
    const hr = headerRow === null || headerRow === undefined ? det.headerRow : Number(headerRow);
    const headers = (aoa[hr] || []).map((t, i) => ({ index: i, text: t == null ? '' : String(t) }));
    const mapping = headerRow == null ? det.mapping : (() => { const d = detectB([aoa[hr] || []]); return d.mapping; })();
    return { sheetName, headerRow: hr, headers, mapping, sample: aoa.slice(hr + 1, hr + 6) };
  }

  _p(token) { const p = this.previews.get(token); if (!p) throw new ValidationError('Phiên đối chiếu đã hết hạn — chọn lại file'); return p; }

  _loadA({ don_vi_id, dot_id, tu_ngay, den_ngay }) {
    const { sql, params } = this.reports.where({ don_vi_id, dot_id, tu_ngay, den_ngay });
    return this.db.all(`SELECT p.id, p.so_phieu, p.bien_so, p.bien_so_chuan, p.ngay_can, p.kl_hang_kg, p.don_gia, p.tien_truoc_vat, p.tien_vat, p.tong_tien FROM phieu_can p WHERE ${sql}`, params)
      .map((r) => ({ ...r, don_gia: fromDb(r.don_gia), tien_truoc_vat: fromDb(r.tien_truoc_vat), tien_vat: fromDb(r.tien_vat), tong_tien: fromDb(r.tong_tien) }));
  }

  /** Chạy đối chiếu & lưu lô. */
  run(token, { ten, don_vi_id = null, dot_id = null, tu_ngay = null, den_ngay = null, sheetName, headerRow, mapping, tolKg = 0, tolMoney = 1, loai_chung_tu = 'BANG_KE' }) {
    const p = this._p(token);
    if (!ten) throw new ValidationError('Cần đặt tên lô đối chiếu');
    if (mapping.so_phieu === undefined && mapping.bien_so === undefined) throw new ValidationError('File đối tác cần có cột Số phiếu hoặc Biển số');
    if (mapping.so_phieu === undefined && (mapping.ngay === undefined)) throw new ValidationError('Không có Số phiếu thì cần cột Ngày để khớp theo biển số + ngày + KL');
    const B = parseB(p.wb.aoa(sheetName), Number(headerRow), mapping).map((b, idx) => ({ ...b, idx }));
    if (!B.length) throw new ValidationError('Không đọc được dòng dữ liệu nào của đối tác');
    const A = this._loadA({ don_vi_id, dot_id, tu_ngay, den_ngay });
    const res = matchRows(A, B, { tolKg: Number(tolKg), tolMoney: Number(tolMoney) });
    return this.db.tx(() => {
      const batchId = this.db.run(`INSERT INTO doi_chieu_batch(ten, loai_chung_tu, don_vi_van_chuyen_id, dot_van_chuyen_id, tu_ngay, den_ngay, tham_so_json, trang_thai) VALUES (?,?,?,?,?,?,?, 'DA_CHAY')`,
        [ten, loai_chung_tu, don_vi_id || null, dot_id || null, tu_ngay || null, den_ngay || null, JSON.stringify({ tolKg: Number(tolKg), tolMoney: Number(tolMoney), file: p.wb.fileName, sheetName })]).id;
      const bId = new Map();
      for (const b of B) bId.set(b.idx, this.db.run(`INSERT INTO doi_chieu_dong_b(batch_id, source_row, so_phieu, bien_so_goc, bien_so_chuan, ngay, kl_hang_kg, don_gia, tien_truoc_vat, tien_vat, tong_tien, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [batchId, b.source_row, b.so_phieu, b.bien_so_goc, b.bien_so_chuan, b.ngay, b.kl_hang_kg, toDb(b.don_gia), toDb(b.tien_truoc_vat), toDb(b.tien_vat), toDb(b.tong_tien), JSON.stringify(b)]).id);
      for (const r of res) this.db.run(`INSERT INTO doi_chieu_ket_qua(batch_id, phieu_can_id, dong_b_id, khoa_khop, ket_qua, chenh_lech_json) VALUES (?,?,?,?,?,?)`,
        [batchId, r.a ? r.a.id : null, r.b ? bId.get(r.b.idx) : null, r.khoa_khop, r.ket_qua, JSON.stringify(r.diffs)]);
      // cờ trên phiếu A (phạm vi của lô)
      for (const a of A) this.db.run(`UPDATE phieu_can SET trang_thai_doi_chieu='CHUA_DOI_CHIEU' WHERE id=?`, [a.id]);
      for (const r of res) if (r.a) this.db.run(`UPDATE phieu_can SET trang_thai_doi_chieu=? WHERE id=?`, [r.ket_qua === 'KHOP' ? 'KHOP' : 'LECH', r.a.id]);
      for (const r of res) if (!r.a && r.ket_qua === 'THIEU_BEN_B') { /* không xảy ra: THIEU_BEN_B luôn có a */ }
      const counts = this.counts(batchId);
      const bad = res.length - (counts.KHOP || 0);
      if (bad) this.alerts.open('UNMATCHED_RECONCILIATION', 'doi_chieu_batch', batchId, counts, `Lô đối chiếu "${ten}": ${bad}/${res.length} dòng không khớp`);
      this.audit.log('RECONCILE', 'doi_chieu_batch', batchId, null, { ten, counts, A: A.length, B: B.length });
      return { batchId, counts, soA: A.length, soB: B.length };
    });
  }

  counts(batchId) { return Object.fromEntries(this.db.all('SELECT ket_qua k, COUNT(*) n FROM doi_chieu_ket_qua WHERE batch_id=? GROUP BY ket_qua', [batchId]).map((r) => [r.k, r.n])); }

  batches() {
    return this.db.all(`SELECT b.*, d.ma don_vi, (SELECT COUNT(*) FROM doi_chieu_ket_qua k WHERE k.batch_id=b.id) tong,
      (SELECT COUNT(*) FROM doi_chieu_ket_qua k WHERE k.batch_id=b.id AND k.ket_qua='KHOP') khop FROM doi_chieu_batch b LEFT JOIN don_vi_van_chuyen d ON d.id=b.don_vi_van_chuyen_id ORDER BY b.id DESC`);
  }

  results(batchId, { ket_qua = null, offset = 0, limit = 500 } = {}) {
    const w = ['k.batch_id=?']; const p = [batchId];
    if (ket_qua) { w.push('k.ket_qua=?'); p.push(ket_qua); }
    const rows = this.db.all(`SELECT k.*, pc.so_phieu a_so_phieu, pc.bien_so a_bien_so, pc.ngay_can a_ngay, pc.kl_hang_kg a_kl, pc.don_gia a_don_gia, pc.tien_truoc_vat a_tien, pc.tien_vat a_vat, pc.tong_tien a_tong,
        b.source_row, b.so_phieu b_so_phieu, b.bien_so_goc b_bien_so, b.ngay b_ngay, b.kl_hang_kg b_kl, b.don_gia b_don_gia, b.tien_truoc_vat b_tien, b.tien_vat b_vat, b.tong_tien b_tong
      FROM doi_chieu_ket_qua k LEFT JOIN phieu_can pc ON pc.id=k.phieu_can_id LEFT JOIN doi_chieu_dong_b b ON b.id=k.dong_b_id
      WHERE ${w.join(' AND ')} ORDER BY CASE k.ket_qua WHEN 'KHOP' THEN 1 ELSE 0 END, k.id LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, p).map((r) => {
      for (const c of ['a_don_gia', 'a_tien', 'a_vat', 'a_tong', 'b_don_gia', 'b_tien', 'b_vat', 'b_tong']) r[c] = fromDb(r[c]);
      r.diffs = JSON.parse(r.chenh_lech_json || '[]'); return r;
    });
    return { total: this.db.get(`SELECT COUNT(*) n FROM doi_chieu_ket_qua k WHERE ${w.join(' AND ')}`, p).n, counts: this.counts(batchId), rows };
  }

  /**
   * Đối chiếu KHỐI LƯỢNG 2 bên theo xe: Bên A (cân của mình) vs Bên B (file đối tác).
   * Trả { batch, rows:[{bien_so, a_chuyen, b_chuyen, a_kg, b_kg, chenh_kg, chenh_pct, ket_luan}], tot, counts, tolKg }
   */
  weightByVehicle(batchId) {
    const batch = this.db.get(`SELECT b.*, d.ma don_vi FROM doi_chieu_batch b LEFT JOIN don_vi_van_chuyen d ON d.id=b.don_vi_van_chuyen_id WHERE b.id=?`, [batchId]);
    if (!batch) throw new ValidationError('Không tìm thấy lô đối chiếu');
    const raw = this.db.all(`SELECT k.ket_qua, pc.kl_hang_kg a_kl, b.kl_hang_kg b_kl, COALESCE(pc.bien_so_chuan, b.bien_so_chuan, b.bien_so_goc) bs, COALESCE(pc.bien_so, b.bien_so_goc, b.bien_so_chuan) bs_show
      FROM doi_chieu_ket_qua k LEFT JOIN phieu_can pc ON pc.id=k.phieu_can_id LEFT JOIN doi_chieu_dong_b b ON b.id=k.dong_b_id WHERE k.batch_id=?`, [batchId]);
    let tolKg = 0; try { tolKg = Number((() => { const j = JSON.parse(batch.tham_so_json || '{}') || {}; return j.tolKg ?? j.dungSaiKg ?? 0; })()); } catch (e) { /* mặc định 0 */ }
    const m = new Map();
    for (const r of raw) {
      const key = r.bs || '(không rõ)';
      const o = m.get(key) || { bien_so: r.bs_show || key, a_chuyen: 0, b_chuyen: 0, a_kg: 0, b_kg: 0 };
      if (r.a_kl !== null && r.a_kl !== undefined && r.ket_qua !== 'THIEU_BEN_A') { o.a_chuyen += 1; o.a_kg += Number(r.a_kl) || 0; }
      if (r.b_kl !== null && r.b_kl !== undefined && r.ket_qua !== 'THIEU_BEN_B') { o.b_chuyen += 1; o.b_kg += Number(r.b_kl) || 0; }
      m.set(key, o);
    }
    const rows = [...m.values()].sort((x, y) => String(x.bien_so).localeCompare(String(y.bien_so))).map((o) => {
      const chenh = Math.round((o.b_kg - o.a_kg) * 1000) / 1000;
      const ket = o.a_chuyen === 0 ? 'CHI_BEN_B' : o.b_chuyen === 0 ? 'CHI_BEN_A' : (Math.abs(chenh) <= tolKg && o.a_chuyen === o.b_chuyen) ? 'KHOP' : 'LECH';
      return { ...o, a_kg: Math.round(o.a_kg * 1000) / 1000, b_kg: Math.round(o.b_kg * 1000) / 1000, chenh_kg: chenh, chenh_pct: o.a_kg ? chenh / o.a_kg * 100 : null, ket_luan: ket };
    });
    const sum = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) * 1000) / 1000;
    const tot = { a_chuyen: sum('a_chuyen'), b_chuyen: sum('b_chuyen'), a_kg: sum('a_kg'), b_kg: sum('b_kg'), chenh_kg: sum('chenh_kg') };
    tot.chenh_pct = tot.a_kg ? tot.chenh_kg / tot.a_kg * 100 : null;
    const counts = { KHOP: 0, LECH: 0, CHI_BEN_A: 0, CHI_BEN_B: 0 }; rows.forEach((r) => { counts[r.ket_luan] += 1; });
    return { batch, rows, tot, counts, tolKg, ket_qua_dong: this.counts(batchId) };
  }

  /** xu_ly: CHAP_NHAN_A | CHAP_NHAN_B | DIEU_CHINH | BO_QUA */
  resolve(id, xu_ly, note = null) {
    if (!['CHAP_NHAN_A', 'CHAP_NHAN_B', 'DIEU_CHINH', 'BO_QUA'].includes(xu_ly)) throw new ValidationError('Xử lý không hợp lệ');
    const k = this.db.get('SELECT * FROM doi_chieu_ket_qua WHERE id=?', [id]);
    if (!k) throw new ValidationError('Không tìm thấy dòng đối chiếu');
    this.db.run(`UPDATE doi_chieu_ket_qua SET xu_ly=?, ghi_chu=?, updated_at=strftime('%Y-%m-%dT%H:%M:%S','now','localtime') WHERE id=?`, [xu_ly, note, id]);
    this.audit.log('RECONCILE_RESOLVE', 'doi_chieu_ket_qua', id, { xu_ly: k.xu_ly }, { xu_ly }, note);
    return { ok: true };
  }
}

module.exports = { ReconciliationService, matchRows, compare, detectB, parseB };
