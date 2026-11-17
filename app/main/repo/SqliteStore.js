'use strict';
/**
 * SqliteStore — kho SQLite (node:sqlite có sẵn trong Node ≥ 22.13 / Electron 45), GIAI ĐOẠN 1 của kế hoạch lưu trữ: chỉ dev/CI, sau cờ DGVC_STORAGE=sqlite.
 *
 * Thiết kế (báo cáo §4): kế thừa JsonStore để GIỮ NGUYÊN toàn bộ ngữ nghĩa đọc/giao dịch (bộ nhớ RAM, sao chép khi ghi, kiểm schema + ràng buộc,
 * khóa lạc quan, sinh mã, audit, lớp phủ năm lưu trữ, bản chụp/dấu vân tay) — chỉ thay LỚP BỀN VỮNG: mở = nạp từ dgvc.sqlite; ghi = 1 giao dịch SQLite
 * (BEGIN IMMEDIATE … COMMIT) thay cho journal 2 pha; khóa thư mục `.lock` giữ nguyên.
 *
 * Ánh xạ kiểu (xem docs/DATA_STORAGE_DESIGN.md): TEXT/ENUM/DATE/TIME/DATETIME/JSON → TEXT; INT → INTEGER; NUM (mọi cột tiền / giá / khối lượng) → REAL (đúng IEEE-754
 * như JS); BOOL → INTEGER 0/1. Ô rỗng GIỮ NGUYÊN: '' ↔ '' và null ↔ NULL (không STRICT để cột số vẫn lưu được '' — nếu không thì canon / contentSha256 đổi).
 * SQLite KHÔNG tính tiền: làm tròn, cộng, nhân đều ở engine JS.
 * Chưa làm ở giai đoạn này (có kế hoạch ở GĐ 2): BackupService/changeFolder cho SQLite (hiện chép thô tệp JSON), khóa ngoại SQL, bảng _request, lease thay .lock.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JsonStore, SCHEMA, nowIso } = require('./JsonStore');
const { normalizeRow } = require('./validate');
const { AppError } = require('../../shared/errors');

const DB_FILE = 'dgvc.sqlite';
/** Phiên bản CẤU TRÚC lưu trữ (PRAGMA user_version) — tách khỏi SCHEMA.schemaVersion (logic dữ liệu, ghi vào gói .dgvc). */
const STORAGE_USER_VERSION = 1;

let _Db = null;
function Db() {
  if (_Db) return _Db;
  try { _Db = require('node:sqlite').DatabaseSync; } catch (e) { throw new AppError('STORAGE_ERROR', `Môi trường không có node:sqlite (cần Node ≥ 22.13 / Electron 45): ${e.message}`); }
  return _Db;
}
function sqliteAvailable() { try { Db(); return true; } catch { return false; } }

const q = (id) => `"${id}"`;
const SQL_TYPE = { TEXT: 'TEXT', ENUM: 'TEXT', DATE: 'TEXT', TIME: 'TEXT', DATETIME: 'TEXT', JSON: 'TEXT', INT: 'INTEGER', NUM: 'REAL', BOOL: 'INTEGER' };

/** DDL sinh từ shared/schema.json bằng MỘT hàm (không có tệp .sql viết tay để khỏi lệch). */
function buildDdl() {
  const out = [];
  for (const [name, def] of Object.entries(SCHEMA.tables)) {
    const cols = def.columns.map((c) => {
      let chk = '';
      const n = q(c.name);
      if (c.type === 'INT') chk = ` CHECK (${n} IS NULL OR ${n} = '' OR typeof(${n}) = 'integer')`;
      else if (c.type === 'NUM') chk = ` CHECK (${n} IS NULL OR ${n} = '' OR typeof(${n}) IN ('real','integer'))`;
      else if (c.type === 'BOOL') chk = ` CHECK (${n} IS NULL OR ${n} = '' OR ${n} IN (0,1))`;
      else if (c.type === 'ENUM') chk = ` CHECK (${n} IS NULL OR ${n} = '' OR ${n} IN (${c.enum.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}))`;
      return `  ${n} ${SQL_TYPE[c.type]}${chk}`;
    });
    out.push(`CREATE TABLE ${q(name)} (\n${cols.join(',\n')},\n  PRIMARY KEY (${q(def.pk)})\n)`);
    def.unique.forEach((cs, i) => out.push(`CREATE UNIQUE INDEX ${q(`ux_${name}_${i}`)} ON ${q(name)} (${cs.map(q).join(', ')})`));
    def.partialUnique.forEach((pu, i) => {
      const cs = pu.split(' WHERE ')[0].split('+');
      const m = /IN \(([^)]*)\)/.exec(pu); const vals = m ? m[1].split(',').map((x) => `'${x.trim()}'`).join(',') : "''";
      out.push(`CREATE UNIQUE INDEX ${q(`ux_${name}_p${i}`)} ON ${q(name)} (${cs.map(q).join(', ')}) WHERE "is_current" = 1 AND "usage_state" IN (${vals})`);
    });
  }
  const idx = {
    PHIEU_CAN: [['weigh1_date'], ['plate_no', 'weigh1_date']], GIAO_NHAN_DAU: [['receive_date'], ['contract_id', 'receive_date']],
    TRANSPORT_DETAIL: [['period_id', 'is_current'], ['ticket_id', 'is_current']], FUEL_DETAIL: [['period_id', 'is_current'], ['receipt_id', 'is_current']],
    TRANSPORT_CALCULATION: [['period_id', 'is_current']], BKVC_LINE: [['period_id', 'is_current']], KY_TINH: [['contract_id', 'status']],
    HOP_DONG_XE: [['contract_id', 'plate_no']], AUDIT_LOG: [['entity', 'entity_id'], ['ts']], IMPORT_BATCH: [['file_sha256', 'import_type', 'status']],
  };
  for (const [t, list] of Object.entries(idx)) {
    const have = new Set(SCHEMA.tables[t].columns.map((c) => c.name));
    list.forEach((cs, i) => { if (cs.every((c) => have.has(c))) out.push(`CREATE INDEX ${q(`ix_${t}_${i}`)} ON ${q(t)} (${cs.map(q).join(', ')})`); });
  }
  out.push('CREATE TABLE "_meta" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL)');
  return out;
}

const encode = (c, v) => {
  if (v === null || v === undefined) return v === undefined ? '' : null;
  if (c.type === 'BOOL') return v === true ? 1 : v === false ? 0 : v;
  return v;
};
const decode = (c, v) => {
  if (v === null) return null;
  if (c.type === 'BOOL' && (v === 0 || v === 1)) return v === 1;
  return v;
};

class SqliteStore extends JsonStore {
  /** Tạo thư mục dữ liệu mới (rỗng) với kho SQLite. */
  static create(root, { installCode, unitCode, installId, appVersion = '0.1.0' }) {
    const dbp = path.join(root, DB_FILE);
    if (fs.existsSync(dbp)) throw new AppError('STORAGE_ERROR', `Thư mục đã có dữ liệu: ${root}`);
    for (const d of ['backups/daily', 'backups/monthly', 'backups/manual', 'exports', 'logs']) fs.mkdirSync(path.join(root, d), { recursive: true });
    const db = new (Db())(dbp);
    try {
      db.exec('PRAGMA journal_mode=WAL');
      db.exec('BEGIN');
      for (const ddl of buildDdl()) db.exec(ddl);
      const manifest = { app: 'DGVC', schemaVersion: SCHEMA.schemaVersion, installId: installId || `INS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        installCode, unitCode, createdAt: nowIso(), appVersion, dataVersion: 0, lastBackupAt: null, sequences: {}, storage: 'sqlite' };
      db.prepare('INSERT INTO "_meta" ("key","value") VALUES (?,?)').run('manifest', JSON.stringify(manifest));
      db.exec(`PRAGMA user_version=${STORAGE_USER_VERSION}`);
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch { /* chưa mở giao dịch */ } throw new AppError('STORAGE_ERROR', `Không tạo được kho SQLite: ${e.message}`); } finally { db.close(); }
    return root;
  }

  open({ takeoverStaleLock = false } = {}) {
    this._acquireLock(takeoverStaleLock);
    try {
      const dbp = path.join(this.root, DB_FILE);
      if (!fs.existsSync(dbp)) throw new AppError('INTEGRITY_ERROR', `Không có ${DB_FILE} — không phải thư mục dữ liệu DGVC (SQLite)`);
      this.recovered = null;
      const db = new (Db())(dbp); this.db = db;
      db.exec('PRAGMA journal_mode=WAL'); db.exec('PRAGMA synchronous=FULL'); db.exec('PRAGMA busy_timeout=5000');
      const uv = db.prepare('PRAGMA user_version').get().user_version;
      if (uv > STORAGE_USER_VERSION) throw new AppError('INTEGRITY_ERROR', `Kho SQLite cấu trúc v${uv}, APP chỉ hỗ trợ đến v${STORAGE_USER_VERSION} — hãy cập nhật APP`);
      const chk = db.prepare('PRAGMA quick_check').all();
      if (chk.length !== 1 || chk[0].quick_check !== 'ok') throw new AppError('INTEGRITY_ERROR', 'Kho SQLite hỏng (quick_check) — đề nghị khôi phục bản sao lưu', { files: chk });
      const mrow = db.prepare('SELECT "value" FROM "_meta" WHERE "key"=?').get('manifest');
      if (!mrow) throw new AppError('INTEGRITY_ERROR', 'Thiếu manifest trong kho SQLite');
      this.manifest = JSON.parse(mrow.value); this.manifest.files = {};
      if (this.manifest.schemaVersion !== SCHEMA.schemaVersion) throw new AppError('INTEGRITY_ERROR', `Dữ liệu schemaVersion ${this.manifest.schemaVersion}, APP cần ${SCHEMA.schemaVersion}`);
      this.data = {}; this.oldFormatFiles = 0; this.mounted = new Map();
      for (const [name, def] of Object.entries(SCHEMA.tables)) {
        const cols = def.columns;
        this.data[name] = db.prepare(`SELECT ${cols.map((c) => q(c.name)).join(',')} FROM ${q(name)}`).all().map((rw) => {
          const o = {}; for (const c of cols) o[c.name] = decode(c, rw[c.name]); return o;
        });
      }
      this._reindex(); this._stmts = {};
      this.opened = true;
      return this;
    } catch (e) { try { if (this.db) this.db.close(); } catch { /* đã đóng */ } this.db = null; this._releaseLock(); throw e; }
  }

  close() {
    if (this.db) { try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* bỏ qua */ } try { this.db.close(); } catch { /* đã đóng */ } this.db = null; }
    this._releaseLock(); this.opened = false;
  }

  _stmt(sql) { return (this._stmts[sql] = this._stmts[sql] || this.db.prepare(sql)); }

  _commit(tx) {
    this._validateTx(tx);
    const newManifest = this._nextManifest(tx); newManifest.files = {};
    const db = this.db;
    try {
      db.exec('BEGIN IMMEDIATE');
      for (const t of tx.touched) {
        const def = SCHEMA.tables[t]; const cols = def.columns;
        const keep = new Set(tx.tables[t].map((r) => r[def.pk]));
        const del = this._stmt(`DELETE FROM ${q(t)} WHERE ${q(def.pk)}=?`);
        for (const r of this.data[t]) if (!keep.has(r[def.pk]) && !this.isMountedRow(t, r[def.pk])) del.run(r[def.pk]);
        const up = this._stmt(`INSERT OR REPLACE INTO ${q(t)} (${cols.map((c) => q(c.name)).join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
        for (const r of tx.changedRows.get(t).values()) { const n = normalizeRow(def, r); up.run(...cols.map((c) => encode(c, n[c.name]))); }
      }
      const { files, ...persist } = newManifest; void files;
      this._stmt('INSERT OR REPLACE INTO "_meta" ("key","value") VALUES (?,?)').run('manifest', JSON.stringify(persist));
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* chưa/không còn giao dịch */ }
      throw e instanceof AppError ? e : new AppError('STORAGE_ERROR', `Không ghi được kho SQLite: ${e.message}`, { cause: e.code || '' });
    }
    this._applyTx(tx, newManifest);
    tx.txnId = `sqlite-${newManifest.dataVersion}`;
  }

  /** Kho SQLite không cần chuyển định dạng. */
  compact() { return Promise.resolve({ files: 0, removed: 0, before: 0, after: 0 }); }
  stats() { return { files: 1, rows: Object.fromEntries(Object.keys(this.data).map((t) => [t, this.data[t].length])) }; }
}

module.exports = { SqliteStore, buildDdl, sqliteAvailable, DB_FILE, STORAGE_USER_VERSION };
