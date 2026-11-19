'use strict';
/**
 * AppContext — "bộ não" của 1 bản cài đang chạy: file cấu hình máy (đường dẫn thư mục dữ liệu),
 * kho dữ liệu JsonStore và toàn bộ service. Electron main và dev-server đều dùng lớp này (không phụ thuộc Electron).
 *
 * MỘT BẢN CÀI CHO MỌI NHÀ MÁY (chốt 25/09/2026): lúc khởi tạo người dùng chọn đơn vị của máy này
 * (HAK / HAKQN / ĐH / CNHAK …); danh mục đi kèm bản cài (resources/catalog) dùng chung cho mọi đơn vị.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStorage, newStore, storageKinds } = require('../repo/createStore');
// Loại kho của bản cài lấy từ cấu hình máy (dgvc-config.json: storage). Mặc định 'json'; chỉ trình di chuyển (migrateStorage) mới đặt 'sqlite'. Không đọc biến môi trường.
const { AppError } = require('../../shared/errors');
const { AuthService } = require('../services/AuthService');
const { ImportService } = require('../import/ImportService');
const { ImportTemplates } = require('../import/templates');
const { PeriodService } = require('../services/PeriodService');
const { TicketService } = require('../services/TicketService');
const { CatalogService } = require('../services/CatalogService');
const { MasterDataService } = require('../services/MasterDataService');
const { RecordService } = require('../services/RecordService');
const { QueryService } = require('../services/QueryService');
const { SyncReminderService } = require('../services/SyncReminderService');
const { BackupService } = require('../services/BackupService');
const { ArchiveService } = require('../services/ArchiveService');
const { ExchangeService } = require('../services/ExchangeService');
const { ReconcileService } = require('../services/ReconcileService');
const { VehicleKmService } = require('../services/VehicleKmService');
const { ReportService } = require('../reports/ReportService');

const CATALOG_FILE = path.join(__dirname, '../../resources/catalog/catalog.json');
const CATALOG_TABLES = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'HOP_DONG_XE', 'PRICE_HISTORY', 'CONFIG', 'USERS'];
const APP_VERSION = require('../../package.json').version;

/** Thư mục dữ liệu có nằm trong vùng đồng bộ / ổ mạng không? SQLite (WAL) cần `-shm` và không chịu được trình đồng bộ giữa chừng → không chuyển, chỉ cảnh báo. */
function syncFolderKind(p) {
  const s = String(p || '');
  if (/^\\\\/.test(s) || /^\/\//.test(s)) return 'NETWORK';
  const m = /(onedrive|google ?drive|dropbox|icloud|my drive|box sync)/i.exec(s);
  return m ? m[1].toUpperCase().replace(/\s+/g, '') : '';
}

function defaultDataFolder() {
  const docs = process.platform === 'win32' ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), 'Documents');
  return path.join(docs, 'DGVC_DATA');
}

class AppContext {
  /**
   * @param configFile  file cấu hình máy (Electron: <userData>/dgvc-config.json)
   * @param pdfRenderer hàm in PDF (Electron: printToPDF; kiểm thử: Chromium)
   */
  constructor({ configFile, pdfRenderer = null, catalogFile = CATALOG_FILE, documentsDir = '', defaultStorage = '' } = {}) {
    this.configFile = configFile; this.pdfRenderer = pdfRenderer; this.catalogFile = catalogFile;
    this.defaultFolder = documentsDir ? path.join(documentsDir, 'DGVC_DATA') : defaultDataFolder();
    this.store = null; this.svc = null;
    // Kho mặc định của bản cài MỚI: SQLite (nếu máy hỗ trợ). Có thể đặt 'json' qua tùy chọn / DGVC_DEFAULT_STORAGE (chỉ dùng cho kiểm thử).
    const want = defaultStorage || process.env.DGVC_DEFAULT_STORAGE || 'sqlite';
    this.defaultStorage = want === 'sqlite' && !storageKinds().includes('sqlite') ? 'json' : want;
    this.storageNotice = null;
  }

  readConfig() { try { return JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch { return {}; } }
  /** Ghi cấu hình nguyên tử (tệp tạm + đổi tên): hoặc bản cũ hoặc bản mới nguyên vẹn, không bao giờ nửa vời. */
  writeConfig(c) {
    fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
    const tmp = `${this.configFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(c, null, 1)); fs.renameSync(tmp, this.configFile);
  }
  /** Thông tin kho cho màn hình Cài đặt: loại kho, vùng đồng bộ, dấu chuyển, khả năng chuyển / quay lại. */
  storageInfo() {
    const kind = this.storageKind(); const folder = this.readConfig().dataFolder || '';
    let sqliteOk = true; try { require('node:sqlite'); } catch { sqliteOk = false; }
    let marker = null; try { marker = JSON.parse(fs.readFileSync(path.join(folder, 'STORAGE_MIGRATED.json'), 'utf8')); } catch { /* chưa chuyển */ }
    const sync = syncFolderKind(folder);
    const canRevert = kind === 'sqlite' && !!marker && !!this.store && this.store.dataVersion <= marker.sourceDataVersion + 1;
    return { storage: kind, dataFolder: folder, sqliteAvailable: sqliteOk, syncFolder: sync, migratedAt: marker ? marker.migratedAt : null, sourceDataVersion: marker ? marker.sourceDataVersion : null,
      canMigrate: kind === 'json' && sqliteOk && !sync, canRevert, blockedReason: kind !== 'json' ? '' : !sqliteOk ? 'Môi trường không hỗ trợ SQLite' : sync ? `Thư mục dữ liệu nằm trong vùng đồng bộ / ổ mạng (${sync}) — chuyển sang ổ cục bộ cố định (vd D:\\DGVC_DATA) trước` : '' };
  }
  /** Loại kho đang dùng của bản cài này. */
  storageKind() {
    const cfg = this.readConfig();
    if (cfg.storage === 'sqlite' || cfg.storage === 'json') return cfg.storage;
    const f = cfg.dataFolder || '';
    if (f && fs.existsSync(path.join(f, 'manifest.json'))) return 'json'; // bản cài cũ chưa nâng cấp
    if (f && fs.existsSync(path.join(f, 'dgvc.sqlite'))) return 'sqlite';
    return this.defaultStorage; // bản cài mới
  }
  /** Đọc manifest của thư mục dữ liệu theo loại kho (không mở kho, không khóa). */
  _readManifest(folder, kind) {
    try {
      if (kind === 'sqlite') {
        const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(folder, 'dgvc.sqlite'), { readOnly: true });
        try { return JSON.parse(db.prepare('SELECT "value" FROM "_meta" WHERE "key"=?').get('manifest').value); } finally { db.close(); }
      }
      return JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
    } catch { return null; }
  }
  _hasData(folder, kind) { return !!folder && fs.existsSync(path.join(folder, kind === 'sqlite' ? 'dgvc.sqlite' : 'manifest.json')); }
  catalog() { return JSON.parse(fs.readFileSync(this.catalogFile, 'utf8')); }

  /** Đơn vị chọn được khi khởi tạo (mọi đơn vị trong danh mục đi kèm, kèm hợp đồng mà đơn vị là 1 bên). */
  installableUnits() {
    const cat = this.catalog().tables;
    return cat.DON_VI.filter((u) => u.is_active).sort((a, b) => a.sign_priority - b.sign_priority).map((u) => ({
      unitCode: u.unit_code, unitName: u.unit_name, factoryName: u.factory_name || '', address: u.address || '',
      contracts: cat.HOP_DONG.filter((c) => c.carrier_unit_code === u.unit_code || c.customer_unit_code === u.unit_code)
        .map((c) => ({ contractCode: c.contract_code, role: c.carrier_unit_code === u.unit_code ? 'CARRIER' : 'CUSTOMER', other: c.carrier_unit_code === u.unit_code ? c.customer_unit_code : c.carrier_unit_code })) }));
  }

  status() {
    const cfg = this.readConfig();
    const folder = cfg.dataFolder || '';
    const kind = this.storageKind();
    const exists = this._hasData(folder, kind);
    const manifest = exists ? this._readManifest(folder, kind) : null;
    return { initialized: exists && !!manifest, dataFolder: folder, defaultDataFolder: this.defaultFolder, installId: manifest && manifest.installId,
      installCode: manifest && manifest.installCode, unitCode: manifest && manifest.unitCode, schemaVersion: manifest && manifest.schemaVersion,
      usersNeedPassword: this.svc ? this.svc.auth.usersNeedPassword() : [], units: exists ? [] : this.installableUnits(), appVersion: APP_VERSION, opened: !!this.store };
  }

  /**
   * Khởi tạo bản cài:
   *   mode NEW    : tạo thư mục dữ liệu mới cho `unitCode`, nạp danh mục đi kèm (chỉ hợp đồng mà đơn vị là 1 bên)
   *   mode ATTACH : dùng thư mục dữ liệu có sẵn (cài lại máy, chuyển máy, khôi phục từ ổ khác)
   * Tùy chọn: catalogPackagePath (gói DANH_MUC mới nhất nhận từ nhà máy khác), mirrorFolder (USB / Google Drive).
   */
  async init({ mode = 'NEW', dataFolder, unitCode, catalogPackagePath = '', mirrorFolder = '', user = { username: 'setup' } }) {
    if (!dataFolder) throw new AppError('VALIDATION_FAILED', 'Chọn thư mục dữ liệu');
    if (this.store) throw new AppError('VALIDATION_FAILED', 'Bản cài đã khởi tạo');
    const hasJson = fs.existsSync(path.join(dataFolder, 'manifest.json')); const hasSqlite = fs.existsSync(path.join(dataFolder, 'dgvc.sqlite'));
    const hasData = hasJson || hasSqlite;
    if (mode === 'ATTACH') {
      if (!hasData) throw new AppError('NOT_FOUND', `Thư mục ${dataFolder} không có dữ liệu DGVC`);
      // thư mục đã chuyển sang SQLite (có dgvc.sqlite + STORAGE_MIGRATED.json) → dùng SQLite; còn lại giữ JSON (an toàn: JSON là nguồn chính cho tới khi có dấu chuyển)
      const storage = hasSqlite && (!hasJson || fs.existsSync(path.join(dataFolder, 'STORAGE_MIGRATED.json'))) ? 'sqlite' : 'json';
      this.writeConfig({ ...this.readConfig(), dataFolder, storage });
      this.open();
      return { mode, ...this.status() };
    }
    if (hasData) throw new AppError('VALIDATION_FAILED', `Thư mục ${dataFolder} đã có dữ liệu — chọn "Dùng dữ liệu có sẵn" hoặc chọn thư mục khác`);
    const cat = this.catalog().tables;
    const unit = cat.DON_VI.find((u) => u.unit_code === unitCode && u.is_active);
    if (!unit) throw new AppError('VALIDATION_FAILED', `Chọn đơn vị của bản cài (${this.installableUnits().map((u) => u.unitCode).join(' / ')})`);
    if (fs.existsSync(dataFolder) && fs.readdirSync(dataFolder).length) throw new AppError('VALIDATION_FAILED', `Thư mục ${dataFolder} không trống — chọn thư mục trống`);
    // SQLite (WAL) không chịu được thư mục đồng bộ / ổ mạng → bản cài mới đặt ở đó dùng JSON và được nhắc chuyển thư mục
    const kindNew = syncFolderKind(dataFolder) ? 'json' : this.defaultStorage;
    createStorage(dataFolder, { installCode: unitCode, unitCode, installId: `INS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, appVersion: APP_VERSION }, kindNew);
    const store = newStore(dataFolder, {}, kindNew).open();
    const mine = new Set(cat.HOP_DONG.filter((c) => c.carrier_unit_code === unitCode || c.customer_unit_code === unitCode).map((c) => c.contract_id));
    await store.transaction((tx) => {
      for (const t of CATALOG_TABLES) {
        for (const r of cat[t]) {
          if ((t === 'HOP_DONG' || t === 'HOP_DONG_XE') && !mine.has(r.contract_id)) continue;
          if (t === 'PRICE_HISTORY' && r.contract_id && !mine.has(r.contract_id)) continue;
          const row = { ...r };
          if (t === 'CONFIG' && r.config_key === 'BACKUP_MIRROR_FOLDER') row.config_value = mirrorFolder || '';
          if (t === 'CONFIG' && r.config_key === 'BACKUP_MIRROR_ENABLED') row.config_value = mirrorFolder ? 'TRUE' : 'FALSE';
          if (t === 'CONFIG' && r.config_key === 'DATA_FOLDER_DEFAULT') row.config_value = dataFolder;
          if (t === 'USERS') Object.assign(row, { password_hash: '', password_salt: '', password_algo: '', must_change_password: true, failed_attempts: 0, locked_until: '', last_login_at: '' });
          tx.insert(t, row);
        }
      }
      tx.audit('SETUP_INIT', 'DATA', unitCode, null, { unitCode, dataFolder, contracts: [...mine], catalog: path.basename(this.catalogFile) });
    }, { user: user.username });
    store.close();
    this.writeConfig({ ...this.readConfig(), dataFolder, storage: kindNew });
    this.open();
    let catalogImport = null;
    if (catalogPackagePath) {
      const pv = this.svc.exchange.previewPackage({ filePath: catalogPackagePath, user });
      if (pv.header.packageType !== 'DANH_MUC') throw new AppError('VALIDATION_FAILED', 'Gói khởi tạo phải là gói Danh mục');
      catalogImport = await this.svc.exchange.importPackage({ previewId: pv.previewId, decisions: Object.fromEntries(pv.conflicts.map((c) => [`${c.table}:${c.id}`, 'TAKE'])), user });
    }
    return { mode, ...this.status(), catalogImport };
  }

  open({ takeoverStaleLock = false } = {}) {
    const { dataFolder } = this.readConfig();
    if (!dataFolder) throw new AppError('NOT_INITIALIZED', 'Bản cài chưa khởi tạo');
    this._attach(newStore(dataFolder, {}, this.storageKind()).open({ takeoverStaleLock }));
    const store = this.store;
    this.migrated = (async () => {
      // bản 1.2.5: dữ liệu định dạng cũ → sao lưu an toàn rồi chuyển sang định dạng gọn, chia tháng (số liệu giữ nguyên)
      if (store.needsCompaction) {
        try { await this.svc.backup.backup({ kind: 'safety', note: 'truoc-doi-dinh-dang-1.2.5', user: { username: 'system' } }); this.compacted = await store.compact(); }
        catch (e) { this.compactError = e.message; }
      }
      return this.migrateConfig();
    })().catch(() => null);
    return this.store;
  }

  /** Cập nhật phiên bản: thêm các tham số CONFIG mới của bản cài (vd VAT_RATE_OPTIONS) vào dữ liệu cũ — không đổi giá trị đang có. */
  async migrateConfig() {
    let cat; try { cat = this.catalog().tables.CONFIG || []; } catch { return []; }
    const miss = cat.filter((r) => !this.store.get('CONFIG', r.config_key));
    if (!miss.length) return [];
    await this.store.transaction((tx) => { for (const r of miss) { tx.insert('CONFIG', { ...r }); tx.audit('CONFIG_ADD', 'CONFIG', r.config_key, null, { value: r.config_value }, { reason: `cập nhật lên bản ${APP_VERSION}` }); } }, { user: 'system' });
    return miss.map((r) => r.config_key);
  }

  _attach(store) {
    const sessions = this.svc ? this.svc.auth.sessions : null;
    this.store = store;
    const importService = new ImportService(store);
    const backup = new BackupService(store, { reopen: (root) => newStore(root, {}, store.storageKind).open() });
    this.svc = {
      auth: new AuthService(store), import: importService, templates: new ImportTemplates(store), periods: new PeriodService(store), tickets: new TicketService(store),
      catalog: new CatalogService(store), master: new MasterDataService(store), records: new RecordService(store, { importService }),
      query: new QueryService(store), sync: new SyncReminderService(store), backup,
      exchange: new ExchangeService(store, { backup }), reports: new ReportService(store, { pdfRenderer: this.pdfRenderer }),
    };
    this.svc.reconcile = new ReconcileService(store, { importService, exchange: this.svc.exchange });
    this.svc.vehicleKm = new VehicleKmService(store);
    this.svc.archive = new ArchiveService(store, { backup });
    if (sessions) this.svc.auth.sessions = sessions; // giữ phiên đăng nhập khi mở lại kho (sau khôi phục)
    this.orphanBatches = importService.cancelOrphans().catch(() => ({ cancelled: [] })); // lô xem trước bỏ dở từ lần chạy trước → CANCELLED
  }

  /** Sau khôi phục sao lưu: store mới → dựng lại service. */
  replaceStore(store) { this._attach(store); }

  /** Đổi thư mục dữ liệu (vd sang ổ D:): sao lưu an toàn → chép → mở ở chỗ mới. */
  async changeFolder({ newFolder, user }) {
    if (!newFolder) throw new AppError('VALIDATION_FAILED', 'Chọn thư mục mới');
    if (fs.existsSync(newFolder) && fs.readdirSync(newFolder).length) throw new AppError('VALIDATION_FAILED', 'Thư mục mới phải trống');
    await this.svc.backup.backup({ kind: 'safety', note: 'truoc-doi-thu-muc', user });
    const old = this.store.root;
    await this.store.transaction((tx) => tx.audit('CHANGE_FOLDER', 'DATA', 'dataFolder', { dataFolder: old }, { dataFolder: newFolder }), { user: user.username });
    this.store.close();
    fs.mkdirSync(newFolder, { recursive: true });
    for (const e of fs.readdirSync(old)) if (e !== '.lock' && !/\.sqlite-(wal|shm)$/.test(e)) fs.cpSync(path.join(old, e), path.join(newFolder, e), { recursive: true }); // SQLite: đã đóng + checkpoint nên chép tệp .sqlite là nhất quán
    this.writeConfig({ ...this.readConfig(), dataFolder: newFolder, previousDataFolder: old });
    this.open();
    return { dataFolder: newFolder, previousDataFolder: old, note: 'Thư mục cũ vẫn giữ nguyên — xóa tay khi đã kiểm tra xong' };
  }

  /**
   * Nâng cấp TỰ ĐỘNG bản cài cũ (kho JSON) sang SQLite — gọi một lần lúc khởi động. An toàn: sao lưu trước, đối chiếu từng bảng và từng kỳ đã chốt,
   * kho JSON cũ được giữ nguyên làm dự phòng; lỗi bất kỳ → vẫn dùng JSON. Không làm khi thư mục dữ liệu nằm trong vùng đồng bộ / ổ mạng.
   * Đã thất bại ở đúng bản app này thì không thử lại (tránh vòng lặp) — vẫn chuyển tay được ở Cài đặt.
   */
  async autoUpgradeStorage() {
    if (!this.store || this.storageKind() !== 'json') return { state: 'skip' };
    const info = this.storageInfo();
    if (!info.sqliteAvailable) return { state: 'skip', reason: 'no-sqlite' };
    if (info.syncFolder) { this.storageNotice = { level: 'warn', message: `Dữ liệu đang ở thư mục đồng bộ / ổ mạng (${info.syncFolder}) nên chưa dùng được kho SQLite. Chuyển thư mục dữ liệu sang ổ cục bộ (vd D:\\DGVC_DATA) trong Cài đặt để app tự nâng cấp.` }; return { state: 'blocked' }; }
    const tried = this.readConfig().storageUpgrade;
    if (tried && tried.state === 'failed' && tried.version === APP_VERSION) return { state: 'skip', reason: 'failed-before' };
    try {
      await this.migrateStorage({ user: { username: 'system' } });
      this.writeConfig({ ...this.readConfig(), storageUpgrade: { state: 'done', at: new Date().toISOString(), version: APP_VERSION } });
      this.storageNotice = { level: 'ok', message: 'Dữ liệu đã được nâng cấp sang kho SQLite (đã sao lưu và đối chiếu; kho JSON cũ được giữ làm dự phòng).' };
      return { state: 'done' };
    } catch (e) {
      this.writeConfig({ ...this.readConfig(), storageUpgrade: { state: 'failed', at: new Date().toISOString(), version: APP_VERSION, message: e.message } });
      this.storageNotice = { level: 'warn', message: `Chưa nâng cấp được sang SQLite (${e.message}). Vẫn dùng kho JSON — dữ liệu an toàn.` };
      if (!this.store) { try { this.open(); } catch { /* báo ở nơi gọi */ } }
      return { state: 'failed', error: e.message };
    }
  }

  /**
   * SAO LƯU PHỤ (JSON) để GỬI MÁY KHÁC: một file .zip duy nhất gồm manifest.json + tables/ + snapshot-info.json (đọc được trên mọi bản, không phụ thuộc kho SQLite).
   * Máy nhận dùng "Khôi phục từ file…" chọn đúng file này.
   */
  async exportJsonShare({ file, user = { username: 'system' } }) {
    if (!file) throw new AppError('VALIDATION_FAILED', 'Chọn nơi lưu file');
    const AdmZip = require('adm-zip'); const tmp = path.join(os.tmpdir(), `dgvc-share-${process.pid}-${Date.now()}`);
    try {
      if (this.storageKind() === 'sqlite') await this.exportStorageToJson({ dest: tmp }); else await this.svc.backup.exportJsonFolder({ dest: tmp, user });
      const m = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
      if (!fs.existsSync(path.join(tmp, 'snapshot-info.json'))) fs.writeFileSync(path.join(tmp, 'snapshot-info.json'), JSON.stringify({ app: 'DGVC', source: 'sqlite', exportedAt: new Date().toISOString(), exportedBy: user.username, dataVersion: m.dataVersion, schemaVersion: m.schemaVersion, installId: m.installId, unitCode: m.unitCode, appVersion: APP_VERSION }, null, 1));
      const zip = new AdmZip(); zip.addLocalFolder(tmp);
      zip.addFile('backup-info.json', Buffer.from(JSON.stringify({ app: 'DGVC', kind: 'json-share', note: 'sao lưu phụ JSON gửi máy khác', createdAt: new Date().toISOString(), createdBy: user.username, installId: m.installId, unitCode: m.unitCode, dataVersion: m.dataVersion }, null, 1)));
      const out = file.toLowerCase().endsWith('.zip') ? file : `${file}.zip`; fs.mkdirSync(path.dirname(out), { recursive: true });
      const buf = zip.toBuffer(); fs.writeFileSync(`${out}.part`, buf); fs.renameSync(`${out}.part`, out);
      return { ok: true, file: out, sizeBytes: buf.length, unitCode: m.unitCode, dataVersion: m.dataVersion };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  /**
   * Chuyển bản cài sang kho SQLite (giai đoạn 2: CHƯA có nút trên giao diện — gọi từ công cụ dòng lệnh / thí điểm có kiểm soát).
   * Đóng kho JSON → di chuyển + kiểm chứng (kho JSON nguồn nguyên vẹn) → điểm chốt = ghi cấu hình `storage:'sqlite'` (nguyên tử) → mở từ SQLite + audit.
   * Lỗi ở bất kỳ bước nào → mở lại kho JSON như cũ, ném lỗi. dryRun: chỉ kiểm chứng, không đổi gì.
   */
  async migrateStorage({ user = { username: 'system' }, dryRun = false } = {}) {
    if (this.storageKind() === 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản cài đã dùng kho SQLite');
    const { dataFolder } = this.readConfig(); if (!dataFolder) throw new AppError('NOT_INITIALIZED', 'Bản cài chưa khởi tạo');
    const blocked = this.storageInfo().blockedReason; if (blocked) throw new AppError('BUSINESS_RULE', blocked, { code: 'E_STORAGE_BLOCKED' });
    const { migrateJsonToSqlite } = require('../repo/migrate/migrate');
    const sessions = this.svc ? this.svc.auth.sessions : null;
    this.close();
    let res;
    try { res = await migrateJsonToSqlite({ root: dataFolder, dryRun, user: user.username }); }
    catch (e) { this.open(); throw e; }
    if (dryRun) { this.open(); return res; }
    this.writeConfig({ ...this.readConfig(), storage: 'sqlite', sqliteMigratedAt: res.report.startedAt, jsonSourceManifestSha256: res.report.source.manifestSha256 }); // ĐIỂM CHỐT
    this.open();
    if (sessions) this.svc.auth.sessions = sessions;
    await this.store.transaction((tx) => tx.audit('MIGRATE_STORAGE', 'DATA', 'storage', { storage: 'json', dataVersion: res.report.source.dataVersion }, { storage: 'sqlite', rows: res.report.verification.rows, fingerprint: res.report.verification.fingerprint }, { reason: 'chuyển kho JSON → SQLite' }), { user: user.username });
    return res;
  }

  /**
   * Đường lui về JSON. Chưa có giao dịch mới trên SQLite (dataVersion = mốc lúc chuyển) → chỉ đổi cấu hình về `json` (kho JSON đóng băng trùng khớp, kiểm SHA-256 manifest).
   * Đã có giao dịch mới → kho JSON cũ KHÔNG có chúng: phải xuất ngược (exportStorageToJson) rồi dùng "Dùng dữ liệu có sẵn" trỏ vào thư mục xuất.
   */
  async revertStorage({ user = { username: 'system' } } = {}) {
    if (this.storageKind() !== 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản cài đang dùng kho JSON');
    const cfg = this.readConfig(); const root = this.store.root;
    const marker = JSON.parse(fs.readFileSync(path.join(root, 'STORAGE_MIGRATED.json'), 'utf8'));
    // dataVersion sau chuyển = mốc nguồn + 1 (giao dịch audit MIGRATE_STORAGE); lớn hơn nghĩa là đã có giao dịch mới
    if (this.store.dataVersion > marker.sourceDataVersion + 1) throw new AppError('BUSINESS_RULE', 'Đã có giao dịch mới trên SQLite mà kho JSON cũ không có — hãy xuất ngược SQLite → JSON (exportStorageToJson) rồi trỏ vào thư mục xuất', { code: 'E_NEW_TRANSACTIONS' });
    const mp = path.join(root, 'manifest.json'); const sha = crypto.createHash('sha256').update(fs.readFileSync(mp)).digest('hex');
    if (sha !== marker.sourceManifestSha256) throw new AppError('INTEGRITY_ERROR', 'Kho JSON cũ đã bị thay đổi sau khi chuyển — không dùng làm đường lui');
    this.close();
    this.writeConfig({ ...cfg, storage: 'json' });
    this.open();
    await this.store.transaction((tx) => tx.audit('REVERT_STORAGE', 'DATA', 'storage', { storage: 'sqlite' }, { storage: 'json' }, { reason: 'quay lại kho JSON' }), { user: user.username });
    return { storage: 'json', dataVersion: this.store.dataVersion };
  }

  /** Sao lưu JSON ra thư mục trống (kho JSON: bản chụp manifest.json + tables/; kho SQLite: xuất ngược có kiểm chứng). */
  async exportJsonSnapshot({ dest, user = { username: 'system' } }) {
    if (this.storageKind() === 'sqlite') return this.exportStorageToJson({ dest });
    return this.svc.backup.exportJsonFolder({ dest, user });
  }

  /** Xuất ngược SQLite → thư mục JSON mới (bản chụp nhất quán + kiểm chứng). Không đổi cấu hình. */
  async exportStorageToJson({ dest }) {
    if (this.storageKind() !== 'sqlite') throw new AppError('VALIDATION_FAILED', 'Bản cài đang dùng kho JSON');
    const { exportSqliteToJson } = require('../repo/migrate/migrate');
    const root = this.store.root; const sessions = this.svc.auth.sessions;
    this.close();
    try { return await exportSqliteToJson({ root, dest }); }
    finally { this.open(); this.svc.auth.sessions = sessions; }
  }

  close() { if (this.store) { this.store.close(); this.store = null; } }
}

module.exports = { AppContext, defaultDataFolder, syncFolderKind, CATALOG_FILE };
