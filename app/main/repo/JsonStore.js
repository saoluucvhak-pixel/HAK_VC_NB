'use strict';
/**
 * JsonStore — kho dữ liệu file JSON của 1 bản cài (DATA_STORAGE_DESIGN §3–§4).
 *  - Mở: khóa thư mục (.lock), phục hồi journal dở dang, kiểm SHA-256 mọi file theo manifest, nạp toàn bộ vào bộ nhớ.
 *  - Đọc: từ bộ nhớ (get / all / find).
 *  - Ghi: CHỈ qua transaction(fn) — hàng đợi tuần tự, sao chép khi ghi, kiểm schema + ràng buộc, rồi journal 2 pha.
 * Chỉ lớp này biết dữ liệu là file JSON (đổi kho lưu = thay lớp này).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Journal, sha256, writeAtomic } = require('./Journal');
const { validateRow, normalizeRow, isEmpty } = require('./validate');
const { AppError } = require('../../shared/errors');
const SCHEMA = require('../../shared/schema.json');

const LOCK_STALE_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const nowIso = () => {
  const d = new Date(); const tz = -d.getTimezoneOffset(); const s = tz >= 0 ? '+' : '-';
  const p = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${new Date(d.getTime() + tz * 60000).toISOString().slice(0, 19)}${s}${p(tz / 60)}:${p(tz % 60)}`;
};

/**
 * Bản 1.2.5 — lưu gọn:
 *  - bảng chia theo thời gian: mỗi NĂM 1 thư mục, mỗi THÁNG 1 file (tables/PHIEU_CAN/2026/2026-09.json) → sửa 1 phiếu chỉ ghi lại file tháng đó;
 *  - định dạng "A": tên cột ghi 1 lần ở đầu file, mỗi dòng là 1 mảng giá trị, không thụt lề → file nhỏ hơn ~3–4 lần.
 * File định dạng cũ (mỗi dòng 1 object, mỗi năm 1 file) vẫn đọc được; app tự chuyển sang định dạng mới (compact()).
 */
const FORMAT = 'A';
const MISSING = '\u0000'; // ô không có cột (dòng cũ thiếu cột mới) — khác '' và null
function partitionKey(def, row) {
  if (!def.partition) return null;
  const v = row[def.partition[1]];
  if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 7);
  return typeof v === 'string' && /^\d{4}/.test(v) ? `${v.slice(0, 4)}-00` : '0000-00';
}
const relOf = (table, key) => (key === null ? `tables/${table}.json` : `tables/${table}/${key.slice(0, 4)}/${key}.json`);
const isNewRel = (rel) => /^tables\/[A-Z_]+\.json$/.test(rel) || /^tables\/[A-Z_]+\/\d{4}\/\d{4}-\d{2}\.json$/.test(rel);
function encodeTable(table, key, rows) {
  const cols = SCHEMA.tables[table].columns.map((c) => c.name);
  return Buffer.from(JSON.stringify({ table, partition: key, schemaVersion: SCHEMA.schemaVersion, format: FORMAT, columns: cols,
    rows: rows.map((r) => cols.map((c) => (r[c] === undefined ? MISSING : r[c]))) }));
}
function decodeRows(d) {
  if (d.format !== FORMAT) return d.rows;
  const cols = d.columns;
  return d.rows.map((a) => { const o = {}; for (let i = 0; i < cols.length; i++) if (a[i] !== MISSING) o[cols[i]] = a[i]; return o; });
}

class JsonStore {
  /** Tạo thư mục dữ liệu mới (rỗng) cho 1 bản cài. */
  static create(root, { installCode, unitCode, installId, appVersion = '0.1.0' }) {
    if (fs.existsSync(path.join(root, 'manifest.json'))) throw new AppError('STORAGE_ERROR', `Thư mục đã có dữ liệu: ${root}`);
    fs.mkdirSync(root, { recursive: true });
    for (const d of ['tables', 'journal', 'backups/daily', 'backups/monthly', 'backups/manual', 'exports', 'logs']) fs.mkdirSync(path.join(root, d), { recursive: true });
    const files = {};
    for (const [name, def] of Object.entries(SCHEMA.tables)) {
      if (def.partition) continue; // bảng chia năm: file tạo khi có dòng
      const rel = relOf(name, null);
      const data = encodeTable(name, null, []);
      writeAtomic(path.join(root, rel), data);
      files[rel] = { sha256: sha256(data), rows: 0 };
    }
    const manifest = { app: 'DGVC', schemaVersion: SCHEMA.schemaVersion, installId: installId || `INS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      installCode, unitCode, createdAt: nowIso(), appVersion, dataVersion: 0, lastBackupAt: null, sequences: {}, files };
    writeAtomic(path.join(root, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 1)));
    return root;
  }

  constructor(root, { fault, lockStaleMs = LOCK_STALE_MS, heartbeatMs = HEARTBEAT_MS, clock = nowIso } = {}) {
    this.root = root;
    this.journal = new Journal(root, { fault });
    this.lockStaleMs = lockStaleMs;
    this.heartbeatMs = heartbeatMs;
    this.clock = clock;
    this.instanceId = crypto.randomBytes(6).toString('hex');
    this.queue = Promise.resolve();
    this.opened = false;
  }

  // ─────────────────────────── mở / đóng ───────────────────────────
  open({ takeoverStaleLock = false } = {}) {
    this._acquireLock(takeoverStaleLock);
    try {
      this.recovered = this.journal.recover();
      const mp = path.join(this.root, 'manifest.json');
      if (!fs.existsSync(mp)) throw new AppError('INTEGRITY_ERROR', 'Không có manifest.json — không phải thư mục dữ liệu DGVC');
      this.manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
      if (this.manifest.schemaVersion !== SCHEMA.schemaVersion) {
        throw new AppError('INTEGRITY_ERROR', `Dữ liệu schemaVersion ${this.manifest.schemaVersion}, APP cần ${SCHEMA.schemaVersion}`);
      }
      this.data = {};
      for (const name of Object.keys(SCHEMA.tables)) this.data[name] = [];
      const bad = []; this.oldFormatFiles = 0;
      this.mounted = new Map(); // năm lưu trữ đang mở xem (chỉ đọc): năm → { bảng → Set(id) }
      for (const [rel, meta] of Object.entries(this.manifest.files)) {
        const p = path.join(this.root, rel);
        if (!fs.existsSync(p)) { bad.push({ rel, problem: 'MISSING' }); continue; }
        const buf = fs.readFileSync(p);
        if (sha256(buf) !== meta.sha256) { bad.push({ rel, problem: 'SHA256_MISMATCH' }); continue; }
        let d; try { d = JSON.parse(buf.toString('utf8')); } catch { bad.push({ rel, problem: 'JSON_INVALID' }); continue; }
        if (!SCHEMA.tables[d.table]) { bad.push({ rel, problem: 'UNKNOWN_TABLE' }); continue; }
        const rows = decodeRows(d);
        for (const r of rows) this.data[d.table].push(r);
        if (d.format !== FORMAT || !isNewRel(rel)) this.oldFormatFiles++;
      }
      if (bad.length) throw new AppError('INTEGRITY_ERROR', 'Dữ liệu bị sửa ngoài APP hoặc hỏng — đề nghị khôi phục bản sao lưu', { files: bad });
      this._reindex();
      this.opened = true;
      return this;
    } catch (e) { this._releaseLock(); throw e; }
  }

  close() { this._releaseLock(); this.opened = false; }

  _lockPath() { return path.join(this.root, '.lock'); }
  _lockInfo() { return { pid: process.pid, host: os.hostname(), user: os.userInfo().username, instanceId: this.instanceId, startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }; }
  _acquireLock(takeover) {
    const lp = this._lockPath();
    try {
      fs.writeFileSync(lp, JSON.stringify(this._lockInfo()), { flag: 'wx' });
    } catch (e) {
      if (e.code !== 'EEXIST') throw new AppError('STORAGE_ERROR', `Không tạo được khóa thư mục: ${e.message}`);
      let info = {}; try { info = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch { /* khóa hỏng = khóa chết */ }
      const age = Date.now() - Date.parse(info.heartbeatAt || 0);
      const stale = !(age < this.lockStaleMs);
      if (!stale || !takeover) throw new AppError('DATA_LOCKED', stale ? 'Thư mục có khóa cũ (APP trước bị tắt đột ngột?) — xác nhận chiếm quyền để mở' : `Thư mục dữ liệu đang được mở bởi ${info.user || '?'} trên máy ${info.host || '?'}`, { stale, holder: info });
      fs.writeFileSync(lp, JSON.stringify(this._lockInfo()));
    }
    this._hb = setInterval(() => {
      try { const i = JSON.parse(fs.readFileSync(lp, 'utf8')); if (i.instanceId === this.instanceId) { i.heartbeatAt = new Date().toISOString(); fs.writeFileSync(lp, JSON.stringify(i)); } } catch { /* bỏ qua */ }
    }, this.heartbeatMs);
    this._hb.unref();
  }
  _releaseLock() {
    if (this._hb) clearInterval(this._hb);
    try { const i = JSON.parse(fs.readFileSync(this._lockPath(), 'utf8')); if (i.instanceId === this.instanceId) fs.unlinkSync(this._lockPath()); } catch { /* không có khóa */ }
  }

  // ─────────────────────────── đọc ───────────────────────────
  _reindex(only) {
    this.pk = this.pk || {};
    for (const name of only || Object.keys(SCHEMA.tables)) {
      const key = SCHEMA.tables[name].pk;
      this.pk[name] = new Map(this.data[name].map((r) => [r[key], r]));
    }
  }
  get unitCode() { return this.manifest.unitCode; }
  get installCode() { return this.manifest.installCode; }
  get dataVersion() { return this.manifest.dataVersion; }
  /** Có file định dạng cũ → nên chạy compact() (app tự làm khi mở). */
  get needsCompaction() { return this.oldFormatFiles > 0; }
  /** Các năm đã lưu trữ (bản 1.2.5): { '2025': {...} } — dữ liệu năm đó nằm ở archive/<năm>/, không nạp khi mở. */
  get archives() { return this.manifest.archives || {}; }
  /** Năm lớn nhất đã lưu trữ — mọi phiếu cân / dòng dầu / kỳ có ngày ≤ năm này không được thêm mới. */
  get archivedThrough() { const ys = Object.keys(this.archives).map(Number); return ys.length ? Math.max(...ys) : 0; }
  isMountedRow(t, id) { for (const m of this.mounted.values()) if (m[t] && m[t].has(id)) return true; return false; }
  _mountedYearOf(t, id) { for (const [y, m] of this.mounted) if (m[t] && m[t].has(id)) return y; return null; }
  all(table) { return this.data[table]; }
  get(table, id) { return this.pk[table].get(id) || null; }
  find(table, pred) { return this.data[table].filter(pred); }

  // ─────────────────────────── ghi ───────────────────────────
  /**
   * transaction(async (tx) => {...}, { user }) — tuần tự hóa mọi lần ghi.
   * tx.insert / tx.update / tx.nextId / tx.audit / tx.all / tx.get. Lỗi trong fn hoặc ràng buộc → không ghi gì.
   */
  transaction(fn, { user = 'system', device = '' } = {}) {
    const run = async () => {
      if (!this.opened) throw new AppError('STORAGE_ERROR', 'Kho dữ liệu chưa mở');
      const tx = new Tx(this, user, device);
      const result = await fn(tx);
      if (tx.touched.size) this._commit(tx);
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  _commit(tx) {
    // 1. kiểm schema + ràng buộc trên dữ liệu mới
    const errs = [];
    for (const t of tx.touched) {
      const def = SCHEMA.tables[t];
      for (const r of tx.changedRows.get(t).values()) errs.push(...validateRow(t, def, r).map((e) => ({ table: t, id: r[def.pk], ...e })));
    }
    errs.push(...this._constraints(tx));
    if (errs.length) throw new AppError('VALIDATION_FAILED', `Dữ liệu không hợp lệ (${errs.length} lỗi): ${errs.slice(0, 3).map((e) => e.message).join('; ')}`, { errors: errs.slice(0, 200) });
    // 2. dựng file mới cho các phân vùng bị chạm
    const newManifest = JSON.parse(JSON.stringify(this.manifest));
    const files = [];
    for (const t of tx.touched) {
      const def = SCHEMA.tables[t]; const cols = def.columns.map((c) => c.name);
      const parts = new Set(def.partition ? [...tx.changedRows.get(t).values()].map((r) => partitionKey(def, r)) : [null]);
      for (const oldR of tx.replacedOld.get(t) || []) parts.add(partitionKey(def, oldR));
      const mountedIds = this.mounted.size ? (r) => this.isMountedRow(t, r[def.pk]) : null; // dòng năm lưu trữ đang xem: không ghi vào kho đang dùng
      void cols;
      for (const key of parts) {
        const rows = tx.tables[t].filter((r) => partitionKey(def, r) === key && !(mountedIds && mountedIds(r)));
        const data = encodeTable(t, key, rows);
        const rel = relOf(t, key);
        files.push({ rel, data });
        newManifest.files[rel] = { sha256: sha256(data), rows: rows.length };
      }
    }
    for (const [k, v] of Object.entries(tx.manifestPatch)) { if (v === undefined) delete newManifest[k]; else newManifest[k] = v; }
    newManifest.dataVersion = this.manifest.dataVersion + 1;
    newManifest.sequences = tx.sequences;
    const txnId = this.journal.commit(files, Buffer.from(JSON.stringify(newManifest, null, 1)));
    // 3. chỉ khi ghi đĩa xong mới đổi bộ nhớ
    for (const t of tx.touched) this.data[t] = tx.tables[t];
    this.manifest = newManifest;
    this._reindex([...tx.touched]);
    tx.txnId = txnId;
  }

  /**
   * Chuyển toàn bộ kho sang định dạng gọn + chia tháng (bản 1.2.5). Ghi qua journal như 1 giao dịch; số liệu giữ nguyên từng ô.
   * File cũ bị bỏ khỏi manifest rồi xóa sau khi ghi xong. Trả { files, before, after } (byte).
   */
  compact() {
    const run = async () => {
      if (!this.opened) throw new AppError('STORAGE_ERROR', 'Kho dữ liệu chưa mở');
      if (this.mounted.size) throw new AppError('VALIDATION_FAILED', 'Đang xem năm lưu trữ — thôi xem rồi chạy lại');
      const before = Object.keys(this.manifest.files).reduce((a, rel) => { try { return a + fs.statSync(path.join(this.root, rel)).size; } catch { return a; } }, 0);
      const newManifest = JSON.parse(JSON.stringify(this.manifest)); newManifest.files = {};
      const files = [];
      for (const [t, def] of Object.entries(SCHEMA.tables)) {
        const groups = new Map();
        if (!def.partition) groups.set(null, this.data[t]);
        else for (const r of this.data[t]) { const k = partitionKey(def, r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        for (const [key, rows] of groups) {
          const data = encodeTable(t, key, rows); const rel = relOf(t, key);
          files.push({ rel, data }); newManifest.files[rel] = { sha256: sha256(data), rows: rows.length };
        }
      }
      newManifest.dataVersion = this.manifest.dataVersion + 1;
      newManifest.storageFormat = FORMAT;
      const old = Object.keys(this.manifest.files).filter((rel) => !newManifest.files[rel]);
      this.journal.commit(files, Buffer.from(JSON.stringify(newManifest, null, 1)));
      this.manifest = newManifest;
      for (const rel of old) { try { fs.unlinkSync(path.join(this.root, rel)); } catch { /* đã không còn */ } }
      // xóa thư mục năm cũ rỗng
      for (const t of Object.keys(SCHEMA.tables)) { const d = path.join(this.root, 'tables', t); try { if (fs.statSync(d).isDirectory() && !fs.readdirSync(d).length) fs.rmdirSync(d); } catch { /* không có */ } }
      this.oldFormatFiles = 0;
      const after = files.reduce((a, f) => a + f.data.length, 0);
      return { files: files.length, removed: old.length, before, after };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  _constraints(tx) {
    const errs = [];
    const view = (t) => (tx.tables[t] || this.data[t]);
    for (const t of tx.touched) {
      const def = SCHEMA.tables[t];
      const rows = view(t);
      const seen = new Map();
      for (const r of rows) {
        if (seen.has(r[def.pk])) errs.push({ table: t, id: r[def.pk], code: 'DUPLICATE', message: `${t}: trùng khóa chính ${r[def.pk]}` });
        seen.set(r[def.pk], true);
      }
      for (const cols of def.unique) {
        const m = new Map();
        for (const r of rows) {
          const k = cols.map((c) => r[c]).join('\u0001');
          if (m.has(k)) errs.push({ table: t, id: r[def.pk], code: 'DUPLICATE', message: `${t}: trùng (${cols.join(' + ')}) = ${cols.map((c) => r[c]).join(' | ')}` });
          m.set(k, true);
        }
      }
      for (const pu of def.partialUnique) { // "contract_id+ticket_id WHERE is_current AND usage_state IN (CONFIRMED,LOCKED)"
        const cols = pu.split(' WHERE ')[0].split('+');
        const m = new Map();
        for (const r of rows) {
          if (!(r.is_current && (r.usage_state === 'CONFIRMED' || r.usage_state === 'LOCKED'))) continue;
          const k = cols.map((c) => r[c]).join('\u0001');
          if (m.has(k)) errs.push({ table: t, id: r[def.pk], code: 'DUPLICATE', message: `${t}: ${cols.join(' + ')} đã dùng ở kỳ đã xác nhận/khóa khác (${cols.map((c) => r[c]).join(' | ')})` });
          m.set(k, true);
        }
      }
      for (const [col, [rt, rc]] of Object.entries(def.fk)) {
        const target = new Set(view(rt).map((x) => x[rc]));
        for (const r of tx.changedRows.get(t).values()) {
          if (!isEmpty(r[col]) && !target.has(r[col])) errs.push({ table: t, id: r[def.pk], field: col, code: 'FK', message: `${t}.${col} = ${r[col]} không có trong ${rt}` });
        }
      }
    }
    return errs;
  }
}

/** Cột ngày quyết định 1 dòng thuộc năm nào khi lưu trữ năm (bản 1.2.5). */
const ARCHIVE_DATE_COL = { PHIEU_CAN: 'weigh1_date', GIAO_NHAN_DAU: 'receive_date', KY_TINH: 'date_to' };
const ARCHIVE_LABEL = { PHIEU_CAN: 'Phiếu cân', GIAO_NHAN_DAU: 'Dòng dầu', KY_TINH: 'Kỳ tính' };

class Tx {
  constructor(store, user, device) {
    this.store = store; this.user = user; this.device = device;
    this.tables = {}; this.touched = new Set(); this.changedRows = new Map(); this.replacedOld = new Map();
    this.sequences = { ...store.manifest.sequences };
    this.now = store.clock();
    this.manifestPatch = {};
    this.allowArchived = false;
  }
  /** Ghi thêm/đổi 1 khóa của manifest trong cùng giao dịch (vd archives). undefined = xóa khóa. */
  setManifest(key, value) { this.manifestPatch[key] = value; }
  /** Chặn ghi vào dữ liệu năm đã lưu trữ (bản 1.2.5). */
  _guardArchived(t, row, id) {
    if (this.allowArchived) return;
    const s = this.store;
    if (id !== undefined && s.isMountedRow(t, id)) {
      const y = s._mountedYearOf(t, id);
      throw new AppError('BUSINESS_RULE', `Dữ liệu năm ${y} đã lưu trữ (đang xem, chỉ đọc) — muốn sửa: Cài đặt → Dữ liệu & sao lưu → Mở lại năm ${y}`, { code: 'E_YEAR_ARCHIVED', year: y });
    }
    const col = ARCHIVE_DATE_COL[t]; const through = s.archivedThrough;
    if (row && col && through && typeof row[col] === 'string' && Number(row[col].slice(0, 4)) <= through) {
      throw new AppError('BUSINESS_RULE', `${ARCHIVE_LABEL[t]} ngày ${row[col].split('-').reverse().join('/')} thuộc năm đã lưu trữ (đến hết năm ${through}) — không thêm được. Muốn nhập: Cài đặt → Dữ liệu & sao lưu → Mở lại năm ${through}`, { code: 'E_YEAR_ARCHIVED', year: through });
    }
  }
  /** Xóa nhiều dòng 1 lần (lưu trữ năm) — nhanh hơn gọi remove() từng dòng. */
  removeMany(t, ids) {
    const def = SCHEMA.tables[t]; const rows = this._table(t);
    const keep = []; const gone = [];
    for (const r of rows) (ids.has(r[def.pk]) ? gone : keep).push(r);
    if (!gone.length) return 0;
    this.tables[t] = keep; this._pk[t] = new Map(keep.map((r, k) => [r[def.pk], k]));
    if (!this.replacedOld.has(t)) this.replacedOld.set(t, []);
    for (const r of gone) { this.replacedOld.get(t).push(r); this.changedRows.get(t).delete(r[def.pk]); }
    this.touched.add(t);
    return gone.length;
  }
  /** Đưa lại nguyên dòng (mở lại năm lưu trữ) — không đổi ngày tạo / người tạo / phiên bản. */
  restoreRows(t, list) {
    const def = SCHEMA.tables[t]; const rows = this._table(t);
    let n = 0;
    for (const raw of list) {
      const r = normalizeRow(def, { ...raw });
      if (this._pk[t].has(r[def.pk])) continue;
      this._pk[t].set(r[def.pk], rows.length); rows.push(r); this.changedRows.get(t).set(r[def.pk], r); n++;
    }
    if (n) this.touched.add(t);
    return n;
  }
  _table(t) {
    if (!SCHEMA.tables[t]) throw new AppError('INTERNAL', `Bảng không tồn tại: ${t}`);
    if (!this.tables[t]) { this.tables[t] = this.store.data[t].slice(); this.changedRows.set(t, new Map()); this._pk = this._pk || {}; this._pk[t] = new Map(this.tables[t].map((r, i) => [r[SCHEMA.tables[t].pk], i])); }
    return this.tables[t];
  }
  all(t) { return this.tables[t] || this.store.data[t]; }
  get(t, id) {
    if (this.tables[t]) { const i = this._pk[t].get(id); return i === undefined ? null : this.tables[t][i]; }
    return this.store.get(t, id);
  }
  /** Sinh ID `<prefix>-<mã bản cài>-<số tăng>` (vd GD-DH-00017); bộ đếm chỉ lưu khi giao dịch ghi thành công. */
  nextId(prefix, width = 5) {
    const n = (this.sequences[prefix] || 0) + 1; this.sequences[prefix] = n;
    return `${prefix}-${this.store.installCode}-${String(n).padStart(width, '0')}`;
  }
  insert(t, row) {
    const def = SCHEMA.tables[t]; const rows = this._table(t);
    const r = normalizeRow(def, { ...row });
    this._guardArchived(t, r);
    if (def.audit) Object.assign(r, { created_at: r.created_at || this.now, created_by: r.created_by || this.user, updated_at: r.updated_at || '', updated_by: r.updated_by || '', row_version: r.row_version || 1 });
    else if ('created_at' in r && !r.created_at) { r.created_at = this.now; if ('created_by' in r && !r.created_by) r.created_by = this.user; }
    if (this._pk[t].has(r[def.pk])) throw new AppError('DUPLICATE', `${t}: đã có ${r[def.pk]}`, { table: t, id: r[def.pk] });
    this._pk[t].set(r[def.pk], rows.length); rows.push(r);
    this.touched.add(t); this.changedRows.get(t).set(r[def.pk], r);
    return r;
  }
  /** Sửa 1 dòng; expectedRowVersion (nếu có) phải khớp → nếu không CONFLICT_VERSION. */
  update(t, id, patch, { expectedRowVersion } = {}) {
    const def = SCHEMA.tables[t]; const rows = this._table(t);
    const i = this._pk[t].get(id);
    if (i === undefined) throw new AppError('NOT_FOUND', `${t}: không có ${id}`);
    const old = rows[i];
    this._guardArchived(t, null, id);
    if (expectedRowVersion !== undefined && def.audit && old.row_version !== expectedRowVersion) {
      throw new AppError('CONFLICT_VERSION', `${t} ${id} đã bị sửa ở nơi khác (phiên bản ${old.row_version}, bạn đang sửa bản ${expectedRowVersion})`, { current: old });
    }
    if (patch[def.pk] !== undefined && patch[def.pk] !== id) throw new AppError('VALIDATION_FAILED', 'Không được đổi khóa chính');
    const r = { ...old, ...patch };
    if (def.audit) Object.assign(r, { updated_at: this.now, updated_by: this.user, row_version: old.row_version + 1 });
    rows[i] = r;
    if (!this.replacedOld.has(t)) this.replacedOld.set(t, []);
    this.replacedOld.get(t).push(old);
    this.touched.add(t); this.changedRows.get(t).set(id, r);
    return { before: old, after: r };
  }
  /** Xóa hẳn 1 dòng (chỉ dùng cho danh mục nhập nhầm chưa dùng ở đâu — khóa ngoại được kiểm lại khi ghi). */
  remove(t, id) {
    const def = SCHEMA.tables[t]; const rows = this._table(t);
    const i = this._pk[t].get(id);
    if (i === undefined) throw new AppError('NOT_FOUND', `${t}: không có ${id}`);
    this._guardArchived(t, null, id);
    const [old] = rows.splice(i, 1);
    this._pk[t] = new Map(rows.map((r, k) => [r[def.pk], k]));
    if (!this.replacedOld.has(t)) this.replacedOld.set(t, []);
    this.replacedOld.get(t).push(old);
    this.touched.add(t); this.changedRows.get(t).delete(id);
    return old;
  }
  /** Ghi AUDIT_LOG (chỉ ghi thêm). */
  audit(action, entity, entityId, before = null, after = null, { reason = '', runId = '' } = {}) {
    return this.insert('AUDIT_LOG', { log_id: this.nextId('AL', 7), ts: this.now, username: this.user, action, entity, entity_id: String(entityId),
      before_json: before === null ? '' : JSON.stringify(before), after_json: after === null ? '' : JSON.stringify(after), reason, run_id: runId, device_info: this.device });
  }
}

module.exports = { JsonStore, SCHEMA, nowIso, encodeTable, decodeRows, partitionKey, relOf, ARCHIVE_DATE_COL };
