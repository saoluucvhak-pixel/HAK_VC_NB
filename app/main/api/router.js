'use strict';
/**
 * Bộ định tuyến API — MỘT cửa cho giao diện: window.dgvc.api(action, payload) → ipcMain 'api' → Router.handle().
 * Trả phong bì chuẩn { ok, data, error:{code,message,details}, warnings, meta:{requestId, durationMs, dataVersion} }.
 * Quyền theo shared/api_spec.json (roles của từng action); action mới bổ sung ở bảng ROUTES bên dưới.
 * Router không biết Electron: hộp thoại file / mở thư mục do `host` cung cấp (Electron main hoặc dev-server).
 */
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const SPEC = require('../../shared/api_spec.json');
const { AppError } = require('../../shared/errors');

const PUBLIC = '(chưa đăng nhập)';
const specRoles = Object.fromEntries(SPEC.actions.map((a) => [a.action, a.roles]));
const A = ['ADMIN']; const AK = ['ADMIN', 'KE_TOAN']; const AKX = ['ADMIN', 'KE_TOAN', 'XEM'];
const needStore = (ctx) => { if (!ctx.store) throw new AppError('NOT_INITIALIZED', 'Bản cài chưa khởi tạo'); return ctx.svc; };
const rid = (p) => p.clientRequestId || `srv-${crypto.randomBytes(6).toString('hex')}`;

/** action → [roles | null (lấy từ api_spec), handler(ctx, payload, session, host)] */
const ROUTES = {
  // khởi tạo, đăng nhập
  'setup.status': [[PUBLIC], (ctx) => ctx.status()],
  'setup.units': [[PUBLIC], (ctx) => ({ items: ctx.installableUnits() })],
  'setup.init': [[PUBLIC], (ctx, p) => { if (ctx.store) throw new AppError('FORBIDDEN', 'Bản cài đã khởi tạo'); return ctx.init(p); }],
  'auth.login': [[PUBLIC], (ctx, p) => needStore(ctx).auth.login(p)],
  'auth.setFirstPassword': [[PUBLIC], (ctx, p) => needStore(ctx).auth.setFirstPassword(p)],
  'auth.changePassword': [null, (ctx, p, s) => ctx.svc.auth.changePassword({ ...p, token: s.token })],
  'auth.logout': [null, (ctx, p, s) => ctx.svc.auth.logout({ token: s.token })],
  'auth.me': [null, (ctx, p, s) => ({ user: s.user })],
  'meta.bootstrap': [null, (ctx, p, s) => ctx.svc.query.bootstrap(s)],
  'system.health': [null, (ctx) => ctx.svc.query.health()],
  // hộp thoại (Electron) — dev-server trả đường dẫn truyền sẵn trong payload
  'dialog.openFile': [AKX, (ctx, p, s, host) => host.openFile(p)],
  'dialog.openFolder': [[PUBLIC], (ctx, p, s, host) => host.openFolder(p)],
  'dialog.saveFile': [AKX, (ctx, p, s, host) => host.saveFile(p)],
  'system.openPath': [AKX, (ctx, p, s, host) => host.openPath(p)],
  // danh mục
  'units.list': [null, (ctx, p) => ctx.svc.master.listUnits(p)],
  'units.save': [null, (ctx, p, s) => ctx.svc.master.saveUnit({ ...p, user: s.user })],
  'units.setActive': [null, (ctx, p, s) => ctx.svc.master.setUnitActive({ ...p, user: s.user })],
  'vehicles.list': [null, (ctx, p) => ctx.svc.master.listVehicles(p)],
  'vehicles.save': [null, (ctx, p, s) => ctx.svc.master.saveVehicle({ ...p, user: s.user })],
  'vehicles.setActive': [null, (ctx, p, s) => ctx.svc.master.setVehicleActive({ ...p, user: s.user })],
  'vehicles.usage': [null, (ctx, p) => ctx.svc.master.vehicleUsage(p)],
  'vehicleKm.list': [null, (ctx, p) => ctx.svc.vehicleKm.list(p)],
  'vehicleKm.save': [null, (ctx, p, s) => ctx.svc.vehicleKm.save({ ...p, user: s.user })],
  'vehicles.rename': [null, (ctx, p, s) => ctx.svc.master.renameVehicle({ ...p, user: s.user })],
  'vehicles.delete': [null, (ctx, p, s) => ctx.svc.master.deleteVehicle({ ...p, user: s.user })],
  'vehicles.resolvePlate': [null, (ctx, p) => ({ results: (p.codes || []).map((c) => { const { plateKey } = require('../import/mapping'); const v = ctx.store.find('XE', (x) => x.plate_key === plateKey(c))[0]; return { input: c, plateNo: v ? v.plate_no : null, ownerUnitCode: v ? v.owner_unit_code : null }; }) })],
  'routes.list': [null, (ctx, p) => ctx.svc.catalog.listRoutes(p)],
  'routes.save': [null, (ctx, p, s) => ctx.svc.catalog.saveRoute({ ...p, user: s.user })],
  'routes.setActive': [null, (ctx, p, s) => ctx.svc.catalog.setRouteActive({ ...p, user: s.user })],
  'prices.list': [null, (ctx, p) => ctx.svc.catalog.listPrices(p)],
  'prices.preview': [null, (ctx, p) => ctx.svc.catalog.previewPrice(p)],
  'prices.createVersion': [null, (ctx, p, s) => ctx.svc.catalog.createPriceVersion({ ...p, user: s.user })],
  'prices.updateDraft': [null, (ctx, p, s) => ctx.svc.catalog.updatePriceDraft({ ...p, user: s.user })],
  'prices.activate': [null, (ctx, p, s) => ctx.svc.catalog.activatePrice({ ...p, user: s.user })],
  'contracts.list': [null, (ctx) => ctx.svc.master.listContracts()],
  'contracts.save': [null, (ctx, p, s) => ctx.svc.master.saveContract({ ...p, user: s.user })],
  'archive.years': [A, (ctx) => ctx.svc.archive.years()],
  'archive.preview': [A, (ctx, p) => ctx.svc.archive.preview(p)],
  'archive.archive': [A, (ctx, p, s) => ctx.svc.archive.archive({ ...p, user: s.user })],
  'archive.mount': [AKX, (ctx, p) => ctx.svc.archive.mount(p)],
  'archive.unmount': [AKX, (ctx, p) => ctx.svc.archive.unmount(p)],
  'archive.reopen': [A, (ctx, p, s) => ctx.svc.archive.reopen({ ...p, user: s.user })],
  'archive.restoreFile': [A, (ctx, p) => ctx.svc.archive.restoreFile(p)],
  'contracts.usage': [AKX, (ctx, p) => ctx.svc.master.contractUsage(p)],
  'contracts.delete': [AK, (ctx, p, s) => ctx.svc.master.deleteContract({ ...p, user: s.user })],
  'contracts.setActive': [AK, (ctx, p, s) => ctx.svc.master.setContractActive({ ...p, user: s.user })],
  'contracts.vehicles': [AKX, (ctx, p) => ({ items: ctx.store.find('HOP_DONG_XE', (v) => v.contract_id === p.contractId) })],
  'contracts.setVehicles': [null, (ctx, p, s) => ctx.svc.master.setContractVehicles({ ...p, user: s.user })],
  'contracts.suggestVehicles': [null, (ctx, p) => ctx.svc.master.suggestVehicles(p)],
  'contracts.resolveSigners': [null, (ctx, p) => ctx.svc.master.resolveSigners(p)],
  // nhắc sửa danh mục ở các nhà máy còn lại
  'sync.list': [AKX, (ctx, p) => ctx.svc.sync.list(p)],
  'sync.markDone': [AK, (ctx, p, s) => ctx.svc.sync.markDone({ ...p, user: s.user })],
  // phiếu cân, dầu
  'tickets.list': [null, (ctx, p) => ctx.svc.query.tickets(p)],
  'tickets.get': [null, (ctx, p) => ctx.svc.tickets.get(p)],
  'tickets.update': [null, (ctx, p, s) => ctx.svc.tickets.update({ ...p, user: s.user })],
  'tickets.previewBulkDescriptive': [null, (ctx, p) => ctx.svc.tickets.previewBulkDescriptive(p)],
  'tickets.bulkUpdateDescriptive': [null, (ctx, p, s) => ctx.svc.tickets.bulkUpdateDescriptive({ ...p, clientRequestId: rid(p), user: s.user })],
  'tickets.softDelete': [null, (ctx, p, s) => ctx.svc.records.softDeleteTicket({ ...p, user: s.user })],
  'tickets.softDeleteMany': [null, (ctx, p, s) => ctx.svc.records.softDeleteTickets({ ...p, user: s.user })],
  'tickets.restore': [null, (ctx, p, s) => ctx.svc.records.restoreTicket({ ...p, user: s.user })],
  'tickets.ackFlags': [null, (ctx, p, s) => ctx.svc.records.ackTicketFlags({ ...p, user: s.user })],
  'fuel.list': [null, (ctx, p) => ctx.svc.query.fuel(p)],
  'fuel.saveRows': [null, (ctx, p, s) => ctx.svc.records.saveFuelRows({ ...p, clientRequestId: rid(p), user: s.user })],
  'fuel.update': [null, (ctx, p, s) => ctx.svc.records.updateFuel({ ...p, user: s.user })],
  'fuel.softDelete': [null, (ctx, p, s) => ctx.svc.records.softDeleteFuel({ ...p, user: s.user })],
  'fuel.ackFlags': [null, (ctx, p, s) => ctx.svc.records.ackFuelFlags({ ...p, user: s.user })],
  'import.preview': [null, (ctx, p, s) => ctx.svc.import.preview({ ...p, user: s.user.username })],
  'import.previewRows': [null, (ctx, p) => ctx.svc.import.previewRows(p)],
  'import.confirm': [null, (ctx, p, s) => ctx.svc.import.confirm({ ...p, clientRequestId: rid(p), user: s.user.username })],
  'import.cancel': [null, (ctx, p, s) => ctx.svc.import.cancel({ ...p, user: s.user.username })],
  'import.list': [null, (ctx) => ctx.svc.query.imports()],
  'import.template': [null, (ctx, p) => {
    const name = p.importType === 'GIAO_NHAN_DAU' ? `Mau_Import_GiaoNhanDau_${p.contractId || ''}.xlsx` : `Mau_Import_PhieuCan_${ctx.store.unitCode}.xlsx`;
    return ctx.svc.templates.build({ ...p, targetPath: p.targetPath || path.join(ctx.store.root, 'exports', name) });
  }],
  // kỳ tính
  'periods.list': [null, (ctx, p) => ctx.svc.query.periods(p)],
  'periods.preview': [null, (ctx, p) => ctx.svc.periods.preview(p)],
  'periods.calculate': [null, (ctx, p, s) => ctx.svc.periods.calculate({ ...p, clientRequestId: rid(p), user: s.user })],
  'periods.get': [null, (ctx, p) => ctx.svc.periods.get(p)],
  'periods.confirm': [null, (ctx, p, s) => ctx.svc.periods.confirm({ ...p, user: s.user })],
  'periods.lock': [null, (ctx, p, s) => ctx.svc.periods.lock({ ...p, user: s.user })],
  'periods.unlock': [AK, (ctx, p, s) => ctx.svc.periods.unlock({ ...p, user: s.user })], // service kiểm ADMIN / can_unlock
  'periods.reopen': [AK, (ctx, p, s) => ctx.svc.periods.reopen({ ...p, user: s.user })],
  'periods.cancel': [null, (ctx, p, s) => ctx.svc.periods.cancel({ ...p, user: s.user })],
  'calc.trace': [null, (ctx, p) => ctx.svc.query.trace(p)],
  'calc.tickets': [null, (ctx, p) => ctx.svc.query.calcTickets(p)],
  'calc.fuel': [null, (ctx, p) => ctx.svc.query.calcFuel(p)],
  'validation.run': [null, (ctx, p) => ctx.svc.query.validation(p)],
  // báo cáo
  'reports.bkvc': [null, (ctx, p) => ctx.svc.reports.bkvc(p)],
  'reports.bkct': [null, (ctx, p) => ctx.svc.reports.bkct(p)],
  'reports.pricing': [null, (ctx, p) => ctx.svc.reports.pricing(p)],
  'reports.invoice': [null, (ctx, p) => ctx.svc.reports.invoice(p)],
  'reports.html': [AKX, (ctx, p) => ({ html: ctx.svc.reports.html(p) })],
  'reports.export': [null, async (ctx, p, s) => {
    const r = await ctx.svc.reports.export({ ...p, targetPath: p.targetPath || path.join(ctx.store.root, 'exports', `${p.report}_${(p.params && (p.params.periodId || [p.params.dateFrom, p.params.dateTo].filter(Boolean).join('_'))) || ''}.${String(p.format).toLowerCase()}`) });
    await ctx.store.transaction((tx) => tx.audit('EXPORT', 'REPORT', p.report, null, { format: p.format, file: path.basename(r.path), params: p.params }), { user: s.user.username });
    return { path: r.path, sizeBytes: r.sizeBytes, warnings: r.warnings || [] };
  }],
  'reports.misa': [null, (ctx, p) => ctx.svc.reports.misa(p)],
  'reports.contractBasis': [null, (ctx, p) => ctx.svc.reports.contractBasis(p)],
  'reports.tickets': [null, (ctx, p) => ctx.svc.reports.ticketList(p)],
  'reports.fuel': [null, (ctx, p) => ctx.svc.reports.fuelList(p)],
  'reports.volume': [null, (ctx, p) => ctx.svc.reports.volumeSummary(p)],
  'reports.vehicleLog': [null, (ctx, p) => ctx.svc.reports.vehicleLog(p)],
  'reports.print': [null, (ctx, p, s, host) => host.print({ html: ctx.svc.reports.html(p), landscape: !['BKVC', 'PRICING_SHEET', 'FUEL_HANDOVER'].includes(p.report) })],
  // tổng quan, lịch sử, cấu hình
  'dashboard.summary': [null, (ctx, p) => ctx.svc.query.dashboard({ ...p, reminders: ctx.svc.sync.list(), backup: ctx.svc.backup.list() })],
  'audit.list': [null, (ctx, p) => ctx.svc.query.audit(p)],
  'users.list': [null, (ctx) => ctx.svc.auth.listUsers()],
  'users.save': [null, (ctx, p, s) => ctx.svc.auth.saveUser({ ...p, user: s.user })],
  'users.resetPassword': [null, (ctx, p, s) => ctx.svc.auth.resetPassword({ ...p, user: s.user })],
  'config.list': [null, (ctx) => ctx.svc.query.configList()],
  'config.save': [null, (ctx, p, s) => ctx.svc.query.configSave({ ...p, user: s.user })],
  // dữ liệu, sao lưu
  'data.backupNow': [null, (ctx, p, s) => ctx.svc.backup.backup({ kind: 'manual', note: p.note || '', user: s.user })],
  'data.listBackups': [null, (ctx) => ctx.svc.backup.list()],
  'data.restore': [null, async (ctx, p, s) => { const r = await ctx.svc.backup.restore({ ...p, user: s.user }); ctx.replaceStore(r.store); return { restoredFrom: r.restoredFrom, safetyBackup: r.safetyBackup, dataVersion: r.dataVersion }; }],
  'data.changeFolder': [null, (ctx, p, s) => ctx.changeFolder({ ...p, user: s.user })],
  // trao đổi
  'exchange.exportPackage': [null, (ctx, p, s) => ctx.svc.exchange.exportPackage({ ...p, user: s.user })],
  'exchange.previewPackage': [null, (ctx, p, s) => ctx.svc.exchange.previewPackage({ ...p, user: s.user })],
  'exchange.importPackage': [null, (ctx, p, s) => ctx.svc.exchange.importPackage({ ...p, user: s.user })],
  'exchange.list': [null, (ctx) => ctx.svc.exchange.list()],
  // đối chiếu dữ liệu (chỉ đọc)
  'reconcile.audit': [null, (ctx, p) => ctx.svc.reconcile.audit(p)],
  'reconcile.compare': [null, (ctx, p) => ctx.svc.reconcile.compare(p)],
  'reconcile.export': [null, async (ctx, p, s) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await ctx.svc.reconcile.export({ ...p, targetPath: p.targetPath || path.join(ctx.store.root, 'exports', `DoiChieu_${p.kind}_${stamp}.xlsx`) });
    await ctx.store.transaction((tx) => tx.audit('EXPORT', 'REPORT', `RECONCILE_${p.kind}`, null, { format: 'XLSX', file: path.basename(r.path), params: p.params }), { user: s.user.username });
    return r;
  }],
};

class Router {
  constructor(ctx, { host = {}, log = () => {} } = {}) { this.ctx = ctx; this.host = { ...DEFAULT_HOST, ...host }; this.log = log; }

  rolesOf(action) { const r = ROUTES[action]; return r ? (r[0] || specRoles[action] || A) : null; }

  async handle(action, payload = {}, token = '') {
    const t0 = Date.now(); const requestId = crypto.randomBytes(6).toString('hex');
    const meta = () => ({ requestId, durationMs: Date.now() - t0, dataVersion: this.ctx.store ? this.ctx.store.dataVersion : null,
      archiveMounted: this.ctx.store && this.ctx.store.mounted ? [...this.ctx.store.mounted.keys()] : [] });
    try {
      const route = ROUTES[action]; if (!route) throw new AppError('NOT_FOUND', `Không có chức năng ${action}`);
      const roles = this.rolesOf(action);
      let session = null;
      if (!roles.includes(PUBLIC)) {
        needStore(this.ctx);
        session = { ...this.ctx.svc.auth.check(token), token };
        if (!roles.includes(session.user.role)) throw new AppError('FORBIDDEN', `Vai trò ${session.user.role} không dùng được chức năng này`);
      }
      // bản 1.2.5: tra cứu / báo cáo theo khoảng ngày (hoặc kỳ) chạm năm đã lưu trữ → tự mở năm đó ở chế độ chỉ xem
      if (session && this.ctx.svc.archive && payload && (payload.dateFrom || payload.dateTo || payload.periodId || (payload.params && (payload.params.dateFrom || payload.params.dateTo || payload.params.periodId)))) {
        await this.ctx.svc.archive.ensureFor(payload.params && typeof payload.params === 'object' ? { ...payload, ...payload.params } : payload);
      }
      const data = await route[1](this.ctx, payload || {}, session, this.host);
      const warnings = (data && Array.isArray(data.warnings)) ? data.warnings : [];
      if (this.ctx.store && session && !['auth.logout'].includes(action)) this.ctx.svc.backup.autoDaily().catch((e) => this.log('backup', e));
      return { ok: true, data: data === undefined ? null : data, error: null, warnings, meta: meta() };
    } catch (e) {
      const code = e.code && typeof e.code === 'string' && !/^E[A-Z]+$/.test(e.code) ? e.code : 'INTERNAL';
      if (code === 'INTERNAL') this.log('error', action, e);
      return { ok: false, data: null, error: { code, message: code === 'INTERNAL' ? `Lỗi hệ thống: ${e.message}` : e.message, details: e.details || null }, warnings: [], meta: meta() };
    }
  }
}

const DEFAULT_HOST = {
  openFile: (p) => { if (p && p.path && fs.existsSync(p.path)) return { path: p.path }; return { canceled: true }; },
  openFolder: (p) => (p && p.path ? { path: p.path } : { canceled: true }),
  saveFile: (p) => (p && p.path ? { path: p.path } : { canceled: true }),
  openPath: () => ({ ok: false, message: 'Chỉ mở được trong bản cài Windows' }),
  print: () => ({ ok: false, message: 'In trực tiếp chỉ có trong bản cài — dùng Xuất PDF' }),
};

module.exports = { Router, ROUTES, PUBLIC };
