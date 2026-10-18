'use strict';
/**
 * Migration runner: chạy lần lượt các file NNN_*.sql chưa áp dụng, mỗi file trong 1 transaction.
 * KHÔNG BAO GIỜ xóa DB tạo lại. Trước khi migrate DB đã có dữ liệu → gọi backupFn (PRE_MIGRATION).
 * Tương thích API better-sqlite3 (Electron) và node:sqlite (test): db.exec(), db.prepare().get()/all()
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: parseInt(f.slice(0, 3), 10), file: path.join(dir, f), name: f }));
}

function currentVersion(db) {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  if (!t) return 0;
  const r = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  return (r && r.v) || 0;
}

function migrate(db, { dir = MIGRATIONS_DIR, backupFn = null, log = () => {} } = {}) {
  const from = currentVersion(db);
  const all = listMigrations(dir);
  const latest = all.length ? all[all.length - 1].version : 0;
  if (from > latest) throw new Error(`Cơ sở dữ liệu có phiên bản ${from} mới hơn phần mềm (${latest}). Hãy cài bản VC Cost mới hơn — không mở bằng bản cũ để tránh hỏng dữ liệu.`);
  const pending = all.filter((m) => m.version > from);
  if (!pending.length) return { from, to: from, applied: [] };
  if (from > 0 && backupFn) backupFn({ kind: 'PRE_MIGRATION', from });
  const applied = [];
  for (const m of pending) {
    const sql = fs.readFileSync(m.file, 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      const v = currentVersion(db);
      if (v !== m.version) throw new Error(`${m.name} phải tự INSERT schema_version(${m.version}) (hiện: ${v})`);
      db.exec('COMMIT');
      applied.push(m.name);
      log(`Đã áp dụng ${m.name}`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.name} lỗi, đã rollback: ${e.message}`);
    }
  }
  return { from, to: currentVersion(db), applied };
}

module.exports = { migrate, currentVersion, listMigrations };
