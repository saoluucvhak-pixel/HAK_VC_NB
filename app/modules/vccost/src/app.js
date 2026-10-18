'use strict';
/**
 * Composition root: mở DB, khởi tạo services, nối sự kiện (đổi danh mục → tính lại phiếu liên quan).
 * Dùng chung cho Electron main process, dev server và test.
 */
const path = require('path');
const { openDatabase } = require('./database/connection');
const { AuditService } = require('./services/AuditService');
const { SettingsService } = require('./services/SettingsService');
const { AlertService } = require('./services/AlertService');
const { CatalogService } = require('./services/CatalogService');
const { CostService } = require('./services/CostService');
const { PriceService } = require('./services/PriceService');
const { TicketImportService } = require('./services/TicketImportService');
const { VehicleImportService } = require('./services/VehicleImportService');
const { TicketService } = require('./services/TicketService');
const { ReconciliationService } = require('./services/ReconciliationService');
const { ReportService } = require('./services/ReportService');
const { SeedService } = require('./services/SeedService');
const { ChotKyService } = require('./services/ChotKyService');

function createApp({ dbFile = ':memory:', driver = null, backupFn = null, user = null } = {}) {
  const db = openDatabase(dbFile, { driver, backupFn });
  const audit = new AuditService(db, { user });
  const settings = new SettingsService(db, audit);
  const alerts = new AlertService(db);
  const cost = new CostService(db, alerts, settings);
  const catalog = new CatalogService(db, audit, {
    onChange: (table, info) => {
      // Danh mục ảnh hưởng tính giá → tính lại phiếu CHƯA CHỐT liên quan (BR-XE-05)
      if (table === 'xe_don_vi_lich_su') cost.recalc({ xeId: (info.row || info.old).xe_id });
      else if (table === 'xe') cost.recalc({ unresolved: true });
      else if (table === 'dia_diem_alias' || table === 'dia_diem' || table === 'tuyen_van_chuyen') cost.recalc({ unresolved: true });
      else if (table === 'bang_gia_van_chuyen') { cost.recalc({ unresolved: true }); if (info.row && info.row.tuyen_id) cost.recalc({ tuyenId: info.row.tuyen_id }); }
    },
  });
  const price = new PriceService(db, audit, cost);
  const imports = new TicketImportService(db, { audit, alerts, cost, settings });
  const vehicleImport = new VehicleImportService(db, { audit, catalog, cost });
  const fuelImport = new (require('./services/FuelImportService').FuelImportService)(db, { audit });
  const tickets = new TicketService(db, { audit, cost });
  const reports = new ReportService(db, settings);
  const recon = new ReconciliationService(db, { audit, alerts, reports });
  const lock = new ChotKyService(db, { audit, reports });
  const seed = new SeedService(db, { catalog, price, settings, audit });
  return { db, audit, settings, alerts, cost, catalog, price, imports, vehicleImport, fuelImport, tickets, reports, recon, lock, seed, close: () => db.close() };
}

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');

module.exports = { createApp, SEED_DIR };
