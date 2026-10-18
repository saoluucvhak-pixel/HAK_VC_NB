'use strict';
/**
 * Runtime dùng chung cho Electron main và dev server:
 * thư mục dữ liệu (tách khỏi source), DB, backup, bảng handler, dispatch an toàn.
 *   <dataDir>/data/app.db  /backups  /exports  /imports  /logs
 */
const fs = require('fs');
const path = require('path');
const { createApp, SEED_DIR } = require('./app');
const { createHandlers } = require('./ipc/handlers');
const { loadInitialData, isFreshDb } = require('./services/InitialDataService');
const { BackupService } = require('./services/BackupService');

function createRuntime({ dataDir, version = 'dev', driver = null, autoInit = false, renderPdf = null }) {
  const dirs = {
    dataDir,
    db: path.join(dataDir, 'data', 'app.db'),
    backups: path.join(dataDir, 'backups'),
    exports: path.join(dataDir, 'exports'),
    imports: path.join(dataDir, 'imports'),
    logs: path.join(dataDir, 'logs'),
  };
  for (const d of [path.dirname(dirs.db), dirs.backups, dirs.exports, dirs.imports, dirs.logs]) fs.mkdirSync(d, { recursive: true });
  const logFile = path.join(dirs.logs, `app_${new Date().toISOString().slice(0, 10)}.log`);
  const log = (msg) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

  const rt = { dirs, log };
  const preMigrationBackup = () => {
    if (fs.existsSync(dirs.db)) {
      const f = path.join(dirs.backups, `app_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_PRE_MIGRATION.db`);
      fs.copyFileSync(dirs.db, f);
      log(`Backup trước migration: ${f}`);
    }
  };
  const open = () => {
    rt.app = createApp({ dbFile: dirs.db, driver, backupFn: preMigrationBackup });
    rt.handlers = createHandlers(rt.app, { exportsDir: dirs.exports, importsDir: dirs.imports, seedDir: SEED_DIR, backup: rt.backup, version, dataDir, renderPdf: (...a) => { const f = rt.renderPdf || renderPdf; if (!f) throw new Error('Xuất PDF chưa khả dụng trong môi trường này'); return f(...a); } });
    log(`Mở DB (${rt.app.db.driver}), migration: ${JSON.stringify(rt.app.db.migration)}`);
  };
  rt.backup = new BackupService({ getDb: () => rt.app.db, dbFile: dirs.db, backupsDir: dirs.backups, settings: { get: (k) => rt.app.settings.get(k) }, reopen: () => open() });
  open();
  if (autoInit) {
    try {
      if (isFreshDb(rt.app)) { const r = loadInitialData(rt.app, SEED_DIR); log(`Nạp dữ liệu ban đầu: ${JSON.stringify(r.phieu)}`); }
    } catch (e) { log(`Nạp dữ liệu ban đầu lỗi: ${e.stack}`); }
  }
  try { rt.backup.autoDaily(); } catch (e) { log(`Auto backup lỗi: ${e.message}`); }

  rt.dispatch = async (channel, args) => {
    const h = rt.handlers[channel];
    if (!h) return { ok: false, error: `Kênh không tồn tại: ${channel}` };
    try {
      return { ok: true, data: await h(args || {}) };
    } catch (e) {
      if (e.name !== 'ValidationError') log(`Lỗi ${channel}: ${e.stack}`);
      return { ok: false, error: e.message, type: e.name };
    }
  };
  rt.close = () => rt.app.close();
  return rt;
}

module.exports = { createRuntime };
