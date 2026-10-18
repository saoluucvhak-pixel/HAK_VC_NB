'use strict';
/**
 * Backup/Restore SQLite (offline).
 * - backupNow: `VACUUM INTO` → file nhất quán kể cả khi đang WAL; ghi backup_log + sha256.
 * - autoDaily: nếu bản AUTO gần nhất cũ hơn 1 ngày → backup.
 * - retention: AUTO giữ `keepDaily` bản gần nhất + 1 bản/tháng cho `keepMonthly` tháng; loại khác giữ 20 bản gần nhất.
 *   Không bao giờ xóa bản backup ngoài quy tắc này.
 * - restore: backup PRE_RESTORE trước, đóng DB, chép file, mở lại (callback reopen).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BackupService {
  constructor({ getDb, dbFile, backupsDir, settings, reopen }) {
    Object.assign(this, { getDb, dbFile, backupsDir, settings, reopen });
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  backupNow(kind = 'MANUAL', note = null) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let file = path.join(this.backupsDir, `app_${ts}_${kind}.db`);
    // Hai backup trong cùng 1 giây (vd PRE_IMPORT rồi PRE_RESTORE) không được ghi đè/va chạm nhau
    for (let i = 2; fs.existsSync(file); i++) file = path.join(this.backupsDir, `app_${ts}-${i}_${kind}.db`);
    const db = this.getDb();
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    try { db.run('INSERT INTO backup_log(kind, file_path, size_bytes, sha256, note) VALUES (?,?,?,?,?)', [kind === 'PRE_IMPORT' ? 'MANUAL' : kind, file, buf.length, sha, note || kind]); } catch (e) { /* DB chỉ đọc */ }
    this.applyRetention();
    return { file, size: buf.length, sha256: sha };
  }

  list() {
    return fs.readdirSync(this.backupsDir).filter((f) => f.endsWith('.db')).map((f) => {
      const st = fs.statSync(path.join(this.backupsDir, f));
      const m = f.match(/_(AUTO|MANUAL|PRE_RESTORE|PRE_MIGRATION|PRE_IMPORT)\.db$/);
      return { file: path.join(this.backupsDir, f), name: f, size: st.size, time: st.mtime.toISOString(), kind: m ? m[1] : 'KHAC' };
    }).sort((a, b) => (a.time < b.time ? 1 : -1));
  }

  /** Gọi khi mở phần mềm: sao lưu nếu bản AUTO gần nhất đã quá `intervalDays` ngày (0 = tắt; mặc định 1). */
  autoDaily() {
    const cfg = (this.settings && this.settings.get('backup')) || {};
    const days = cfg.intervalDays === undefined || cfg.intervalDays === null ? 1 : Number(cfg.intervalDays);
    if (!(days > 0)) return null;
    const last = this.list().find((b) => b.kind === 'AUTO');
    if (!last || Date.now() - Date.parse(last.time) >= days * 24 * 3600 * 1000) return this.backupNow('AUTO');
    return null;
  }

  applyRetention() {
    const cfg = (this.settings && this.settings.get('backup')) || { keepDaily: 30, keepMonthly: 12 };
    const all = this.list();
    const keep = new Set();
    const auto = all.filter((b) => b.kind === 'AUTO');
    auto.slice(0, cfg.keepDaily || 30).forEach((b) => keep.add(b.file));
    const months = new Map();
    for (const b of auto) { const m = b.time.slice(0, 7); if (!months.has(m)) months.set(m, b.file); }
    [...months.values()].slice(0, cfg.keepMonthly || 12).forEach((f) => keep.add(f));
    for (const kind of ['MANUAL', 'PRE_RESTORE', 'PRE_MIGRATION', 'PRE_IMPORT', 'KHAC']) all.filter((b) => b.kind === kind).slice(0, 20).forEach((b) => keep.add(b.file));
    for (const b of all) if (!keep.has(b.file)) fs.unlinkSync(b.file);
  }

  restore(file) {
    const full = path.resolve(file);
    if (path.dirname(full) !== path.resolve(this.backupsDir) || !fs.existsSync(full)) throw new Error('File backup không hợp lệ');
    // Kiểm tra file là SQLite hợp lệ TRƯỚC khi đóng DB hiện tại
    const fd = fs.openSync(full, 'r'); const head = Buffer.alloc(16);
    try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
    if (head.toString('latin1') !== 'SQLite format 3\0') throw new Error('File backup không phải cơ sở dữ liệu SQLite hợp lệ');
    const pre = this.backupNow('PRE_RESTORE', `Trước khi khôi phục ${path.basename(full)}`);
    this.getDb().close();
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(this.dbFile + ext)) fs.unlinkSync(this.dbFile + ext);
    fs.copyFileSync(full, this.dbFile);
    this.reopen();
    return { restored: path.basename(full), safetyBackup: pre.file };
  }
}

module.exports = { BackupService };
