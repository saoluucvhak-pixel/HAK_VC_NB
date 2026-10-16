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
const { JsonStore } = require('../repo/JsonStore');
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

function defaultDataFolder() {
  const docs = process.platform === 'win32' ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), 'Documents');
  return path.join(docs, 'DGVC_DATA');
}

class AppContext {
  /**
   * @param configFile  file cấu hình máy (Electron: <userData>/dgvc-config.json)
   * @param pdfRenderer hàm in PDF (Electron: printToPDF; kiểm thử: Chromium)
   */
  constructor({ configFile, pdfRenderer = null, catalogFile = CATALOG_FILE, documentsDir = '' } = {}) {
    this.configFile = configFile; this.pdfRenderer = pdfRenderer; this.catalogFile = catalogFile;
    this.defaultFolder = documentsDir ? path.join(documentsDir, 'DGVC_DATA') : defaultDataFolder();
    this.store = null; this.svc = null;
  }

  readConfig() { try { return JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch { return {}; } }
  writeConfig(c) { fs.mkdirSync(path.dirname(this.configFile), { recursive: true }); fs.writeFileSync(this.configFile, JSON.stringify(c, null, 1)); }
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
    const exists = !!folder && fs.existsSync(path.join(folder, 'manifest.json'));
    let manifest = null; if (exists) { try { manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')); } catch { manifest = null; } }
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
    const hasData = fs.existsSync(path.join(dataFolder, 'manifest.json'));
    if (mode === 'ATTACH') {
      if (!hasData) throw new AppError('NOT_FOUND', `Thư mục ${dataFolder} không có dữ liệu DGVC`);
      this.writeConfig({ ...this.readConfig(), dataFolder });
      this.open();
      return { mode, ...this.status() };
    }
    if (hasData) throw new AppError('VALIDATION_FAILED', `Thư mục ${dataFolder} đã có dữ liệu — chọn "Dùng dữ liệu có sẵn" hoặc chọn thư mục khác`);
    const cat = this.catalog().tables;
    const unit = cat.DON_VI.find((u) => u.unit_code === unitCode && u.is_active);
    if (!unit) throw new AppError('VALIDATION_FAILED', `Chọn đơn vị của bản cài (${this.installableUnits().map((u) => u.unitCode).join(' / ')})`);
    if (fs.existsSync(dataFolder) && fs.readdirSync(dataFolder).length) throw new AppError('VALIDATION_FAILED', `Thư mục ${dataFolder} không trống — chọn thư mục trống`);
    JsonStore.create(dataFolder, { installCode: unitCode, unitCode, installId: `INS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, appVersion: APP_VERSION });
    const store = new JsonStore(dataFolder).open();
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
    this.writeConfig({ ...this.readConfig(), dataFolder });
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
    this._attach(new JsonStore(dataFolder).open({ takeoverStaleLock }));
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
    const backup = new BackupService(store, { reopen: (root) => new JsonStore(root).open() });
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
    for (const e of fs.readdirSync(old)) if (e !== '.lock') fs.cpSync(path.join(old, e), path.join(newFolder, e), { recursive: true });
    this.writeConfig({ ...this.readConfig(), dataFolder: newFolder, previousDataFolder: old });
    this.open();
    return { dataFolder: newFolder, previousDataFolder: old, note: 'Thư mục cũ vẫn giữ nguyên — xóa tay khi đã kiểm tra xong' };
  }

  close() { if (this.store) { this.store.close(); this.store = null; } }
}

module.exports = { AppContext, defaultDataFolder, CATALOG_FILE };
