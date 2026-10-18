'use strict';
/**
 * Kết nối SQLite dùng chung cho app (better-sqlite3 trong Electron) và test (node:sqlite).
 * Repositories chỉ dùng API của lớp Db này → không phụ thuộc driver.
 */
const fs = require('fs');
const path = require('path');
const { migrate } = require('./migrator');

const clean = (p) => {
  if (p === undefined) return [];
  if (Array.isArray(p)) return p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  if (p && typeof p === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(p)) o[k] = v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
    return [o];
  }
  return [p];
};

class Db {
  constructor(raw, driver) {
    this.raw = raw;
    this.driver = driver;
    this._stmts = new Map();
    this._depth = 0;
  }
  exec(sql) { this.raw.exec(sql); }
  _stmt(sql) {
    let s = this._stmts.get(sql);
    if (!s) { s = this.raw.prepare(sql); this._stmts.set(sql, s); }
    return s;
  }
  run(sql, params) { const r = this._stmt(sql).run(...clean(params)); return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }; }
  get(sql, params) { const r = this._stmt(sql).get(...clean(params)); return r ? { ...r } : undefined; }
  all(sql, params) { return this._stmt(sql).all(...clean(params)).map((r) => ({ ...r })); }
  prepare(sql) { return this.raw.prepare(sql); }
  /** Transaction lồng nhau an toàn (savepoint). Lỗi → rollback toàn bộ phần bên trong. */
  tx(fn) {
    const name = `sp${this._depth}`;
    this.exec(this._depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this._depth++;
    try {
      const out = fn(this);
      this._depth--;
      this.exec(this._depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return out;
    } catch (e) {
      this._depth--;
      this.exec(this._depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  }
  close() { this.raw.close(); }
}

function openRaw(file) {
  try {
    const Better = require('better-sqlite3');
    return { raw: new Better(file), driver: 'better-sqlite3' };
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    return { raw: new DatabaseSync(file), driver: 'node:sqlite' };
  }
}

/**
 * Mở (tạo nếu chưa có) DB, bật WAL + foreign keys, chạy migration.
 * @param {string} file ':memory:' hoặc đường dẫn
 */
function openDatabase(file, { backupFn = null, driver = null } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  let o;
  if (driver === 'node:sqlite') { const { DatabaseSync } = require('node:sqlite'); o = { raw: new DatabaseSync(file), driver }; }
  else o = openRaw(file);
  const db = new Db(o.raw, o.driver);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.migration = migrate(db.raw, { backupFn });
  return db;
}

module.exports = { openDatabase, Db };
