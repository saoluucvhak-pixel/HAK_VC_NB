'use strict';
/**
 * QueryService — các màn hình tra cứu (chỉ đọc): dashboard, phiếu cân, bảng kê dầu, kỳ tính, truy vết, kiểm tra dữ liệu, lịch sử, cấu hình.
 */
const E = require('../engine');
const { AppError } = require('../../shared/errors');

const page = (rows, { page: p = 1, pageSize = 100 } = {}) => {
  const size = Math.min(Math.max(1, Number(pageSize) || 100), 5000); const n = Math.max(1, Number(p) || 1);
  return { items: rows.slice((n - 1) * size, n * size), total: rows.length, page: n, pageSize: size };
};
const inRange = (d, a, b) => (!a || d >= a) && (!b || d <= b);

class QueryService {
  constructor(store) { this.store = store; }

  bootstrap(session) {
    const s = this.store; const unit = s.get('DON_VI', s.unitCode);
    return { install: { installId: s.manifest.installId, installCode: s.installCode, unitCode: s.unitCode, unitName: unit ? unit.unit_name : s.unitCode,
      dataFolder: s.root, schemaVersion: s.manifest.schemaVersion, dataVersion: s.dataVersion, appVersion: require('../../package.json').version },
    user: session && session.user, units: s.all('DON_VI'), routes: s.all('TUYEN_VC').filter((r) => r.is_active),
    contracts: s.all('HOP_DONG').map((c) => ({ ...c, role: c.carrier_unit_code === s.unitCode ? 'CARRIER' : c.customer_unit_code === s.unitCode ? 'CUSTOMER' : 'OTHER' })),
    config: Object.fromEntries(s.all('CONFIG').map((c) => [c.config_key, c.config_value])) };
  }

  health() {
    const s = this.store; const files = Object.keys(s.manifest.files).length;
    return { ok: true, dataFolder: s.root, files, dataVersion: s.dataVersion, rows: Object.fromEntries(Object.keys(s.data).map((t) => [t, s.data[t].length])) };
  }

  _usageByTicket() {
    const m = new Map();
    for (const d of this.store.all('TRANSPORT_DETAIL')) {
      if (!d.is_current || d.usage_state === 'RELEASED') continue;
      const p = this.store.get('KY_TINH', d.period_id); if (!p || p.status === 'HUY') continue;
      (m.get(d.ticket_id) || m.set(d.ticket_id, []).get(d.ticket_id)).push({ periodId: p.period_id, periodCode: p.period_code, status: p.status, origin: p.origin });
    }
    return m;
  }

  tickets({ dateFrom = '', dateTo = '', routeCode = '', plateNo = '', ownerUnitCode = '', usage = '', onlyFlags = false, q = '', page: p, pageSize } = {}) {
    const use = this._usageByTicket(); const k = q.trim().toUpperCase();
    const rows = this.store.find('PHIEU_CAN', (t) => (usage === 'DELETED' ? t.is_deleted : !t.is_deleted) && inRange(t.weigh1_date, dateFrom, dateTo) && (!routeCode || t.route_code === routeCode)
      && (!plateNo || t.plate_no === plateNo) && (!ownerUnitCode || t.owner_unit_code === ownerUnitCode) && (!onlyFlags || (t.validation_flags && !t.flags_ack))
      && (!k || t.ticket_no.includes(k) || t.plate_no.includes(k)))
      .map((t) => ({ ...t, usages: use.get(t.ticket_id) || [] }))
      .filter((t) => !usage || usage === 'DELETED' || (usage === 'FREE' ? !t.usages.length : t.usages.some((u) => u.status === usage)))
      .sort((a, b) => (a.weigh1_date + a.weigh1_time).localeCompare(b.weigh1_date + b.weigh1_time));
    const out = page(rows, { page: p, pageSize });
    out.totals = { trips: rows.length, kg: rows.reduce((a, t) => a + t.net_kg, 0) };
    return out;
  }

  fuel({ contractId, dateFrom = '', dateTo = '', plateNo = '' } = {}) {
    if (!contractId) throw new AppError('VALIDATION_FAILED', 'Chọn hợp đồng');
    const used = new Map(this.store.find('FUEL_DETAIL', (d) => d.is_current && d.usage_state !== 'RELEASED').map((d) => [d.receipt_id, this.store.get('KY_TINH', d.period_id)]));
    const rows = this.store.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.contract_id === contractId && inRange(r.receive_date, dateFrom, dateTo) && (!plateNo || r.plate_no === plateNo))
      .map((r) => { const p = used.get(r.receipt_id); return { ...r, period: p && p.status !== 'HUY' ? { periodCode: p.period_code, status: p.status } : null }; })
      .sort((a, b) => a.receive_date.localeCompare(b.receive_date) || a.receipt_id.localeCompare(b.receipt_id));
    return { items: rows, total: rows.length, totals: { liters: rows.reduce((a, r) => a + r.qty_liter, 0), avgPrice: (() => { const pos = rows.filter((r) => r.qty_liter > 0); return pos.length ? pos.reduce((a, r) => a + r.fuel_price_excl_vat, 0) / pos.length : 0; })() } };
  }

  periods({ contractId = '', status = '', dateFrom = '', dateTo = '' } = {}) {
    const rows = this.store.find('KY_TINH', (p) => (!contractId || p.contract_id === contractId) && (!status || p.status === status)
      && (!dateFrom || p.date_to >= dateFrom) && (!dateTo || p.date_from <= dateTo))
      .map((p) => {
        const c = this.store.get('HOP_DONG', p.contract_id);
        const calcs = this.store.find('TRANSPORT_CALCULATION', (x) => x.period_id === p.period_id && x.is_current);
        const lines = this.store.find('BKVC_LINE', (l) => l.period_id === p.period_id && l.is_current);
        return { ...p, contractCode: c && c.contract_code, carrier: c && c.carrier_unit_code, customer: c && c.customer_unit_code,
          role: c && (c.carrier_unit_code === this.store.unitCode ? 'CARRIER' : 'CUSTOMER'),
          routes: calcs.map((x) => ({ routeCode: x.route_code, transportPrice: x.transport_price, tripCount: x.trip_count, totalTon: x.total_ton })),
          trips: lines.reduce((a, l) => a + l.trip_count, 0), ton: lines.reduce((a, l) => a + l.kg, 0) / 1000, totalInclVat: lines.reduce((a, l) => a + l.amount_incl_vat, 0) };
      }).sort((a, b) => (a.date_from < b.date_from ? 1 : -1) || a.period_code.localeCompare(b.period_code));
    return { items: rows, total: rows.length };
  }

  trace({ calcId }) {
    const c = this.store.get('TRANSPORT_CALCULATION', calcId); if (!c) throw new AppError('NOT_FOUND', `Không có kết quả ${calcId}`);
    return { calc: c, trace: JSON.parse(c.trace_json || '{}'), warnings: JSON.parse(c.warnings_json || '[]') };
  }
  calcTickets({ calcId }) {
    const rows = this.store.find('TRANSPORT_DETAIL', (d) => d.calc_id === calcId).map((d) => ({ ...this.store.get('PHIEU_CAN', d.ticket_id), usage_state: d.usage_state }));
    return { items: rows, total: rows.length, totals: { kg: rows.reduce((a, t) => a + t.net_kg, 0) } };
  }
  calcFuel({ calcId }) {
    const rows = this.store.find('FUEL_DETAIL', (d) => d.calc_id === calcId).map((d) => ({ ...this.store.get('GIAO_NHAN_DAU', d.receipt_id), usage_state: d.usage_state }));
    return { items: rows, total: rows.length, totals: { liters: rows.reduce((a, r) => a + r.qty_liter, 0) } };
  }

  /** Dashboard: số liệu các kỳ trong khoảng ngày + việc cần làm. */
  dashboard({ dateFrom = '', dateTo = '', reminders = null, backup = null } = {}) {
    const ps = this.periods({ dateFrom, dateTo }).items.filter((p) => p.status !== 'HUY');
    const calcs = ps.flatMap((p) => this.store.find('TRANSPORT_CALCULATION', (x) => x.period_id === p.period_id && x.is_current));
    const ton = calcs.reduce((a, c) => a + c.total_ton, 0);
    const kpi = { trips: calcs.reduce((a, c) => a + c.trip_count, 0), ton, actualFuel: calcs.reduce((a, c) => a + c.actual_fuel_liter, 0),
      standardFuel: calcs.reduce((a, c) => a + c.standard_fuel_liter, 0), routes: new Set(calcs.map((c) => c.route_code)).size,
      avgTransportPrice: ton ? calcs.reduce((a, c) => a + c.transport_price * c.total_ton, 0) / ton : 0 };
    kpi.fuelDiff = kpi.standardFuel - kpi.actualFuel;
    const use = this._usageByTicket();
    const freeTickets = this.store.find('PHIEU_CAN', (t) => !t.is_deleted && inRange(t.weigh1_date, dateFrom, dateTo) && !use.has(t.ticket_id)).length;
    const flagged = this.store.find('PHIEU_CAN', (t) => !t.is_deleted && inRange(t.weigh1_date, dateFrom, dateTo) && t.validation_flags && !t.flags_ack).length;
    const todo = [];
    for (const p of ps) {
      if (p.origin === 'LOCAL' && p.status === 'NHAP') todo.push({ kind: 'PERIOD_DRAFT', message: `Kỳ ${p.period_code} còn nháp — kiểm tra rồi xác nhận`, periodId: p.period_id });
      if (p.needs_recalc) todo.push({ kind: 'NEEDS_RECALC', message: `Kỳ ${p.period_code} cần tính lại (dữ liệu nguồn đã sửa)`, periodId: p.period_id });
    }
    if (reminders) for (const [u, n] of Object.entries(reminders.pendingByUnit)) todo.push({ kind: 'SYNC_REMINDER', message: `Nhà máy ${u}: còn ${n} thay đổi danh mục chưa sửa giống — gửi gói danh mục hoặc sửa tay`, unitCode: u, count: n });
    if (backup && backup.warning) todo.push({ kind: 'BACKUP_OLD', message: backup.warning.message });
    const contracts = this.store.all('HOP_DONG').map((c) => {
      const last = ps.filter((p) => p.contract_id === c.contract_id)[0];
      return { contractId: c.contract_id, contractCode: c.contract_code, role: c.carrier_unit_code === this.store.unitCode ? 'CARRIER' : c.customer_unit_code === this.store.unitCode ? 'CUSTOMER' : 'OTHER',
        carrier: c.carrier_unit_code, customer: c.customer_unit_code, lastPeriod: last ? { periodId: last.period_id, periodCode: last.period_code, status: last.status, origin: last.origin, prices: last.routes } : null };
    });
    return { kpi, freeTickets, flaggedTickets: flagged, periods: ps.length, todo, contracts };
  }

  /** Kiểm tra dữ liệu: gom cảnh báo của phiếu cân / dầu chưa xác nhận + kết quả Engine của các kỳ nháp. */
  validation({ contractId = '', dateFrom = '', dateTo = '' } = {}) {
    const items = [];
    for (const t of this.store.find('PHIEU_CAN', (x) => !x.is_deleted && x.validation_flags && !x.flags_ack && inRange(x.weigh1_date, dateFrom, dateTo))) {
      for (const code of t.validation_flags.split(';').filter(Boolean)) items.push({ code, level: 'WARNING', entity: 'PHIEU_CAN', id: t.ticket_id, label: `Phiếu ${t.ticket_no} · ${t.plate_no} · ${t.weigh1_date}` });
    }
    for (const r of this.store.find('GIAO_NHAN_DAU', (x) => !x.is_deleted && x.validation_flags && !x.flags_ack && (!contractId || x.contract_id === contractId) && inRange(x.receive_date, dateFrom, dateTo))) {
      for (const code of r.validation_flags.split(';').filter(Boolean)) items.push({ code, level: 'WARNING', entity: 'GIAO_NHAN_DAU', id: r.receipt_id, label: `Dầu ${r.receipt_id} · ${r.fuel_vehicle_code} · ${r.receive_date}` });
    }
    const byCode = {}; for (const i of items) byCode[i.code] = (byCode[i.code] || 0) + 1;
    return { items, total: items.length, byCode, messages: Object.fromEntries(Object.keys(byCode).map((c) => [c, (E.ISSUE && E.ISSUE[c] ? E.ISSUE[c][1] : c)])) };
  }

  audit({ username = '', action = '', entity = '', dateFrom = '', dateTo = '', page: p, pageSize } = {}) {
    const rows = this.store.find('AUDIT_LOG', (a) => (!username || a.username === username) && (!action || a.action === action) && (!entity || a.entity === entity)
      && inRange(a.ts.slice(0, 10), dateFrom, dateTo)).sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return page(rows, { page: p, pageSize });
  }

  imports() { return { items: this.store.all('IMPORT_BATCH').slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) }; }
  configList() { return { items: this.store.all('CONFIG').slice().sort((a, b) => a.config_key.localeCompare(b.config_key)) }; }

  async configSave({ key, value, reason = '', user }) {
    const r = this.store.get('CONFIG', key); if (!r) throw new AppError('NOT_FOUND', `Không có tham số ${key}`);
    const v = value === null || value === undefined ? '' : String(value);
    if (r.value_type === 'NUM' && v !== '' && !Number.isFinite(Number(v))) throw new AppError('VALIDATION_FAILED', `${key} phải là số`);
    if (r.value_type === 'BOOL' && !['TRUE', 'FALSE', ''].includes(v.toUpperCase())) throw new AppError('VALIDATION_FAILED', `${key} phải là TRUE / FALSE`);
    if (r.value_type === 'JSON' && v) { try { JSON.parse(v); } catch { throw new AppError('VALIDATION_FAILED', `${key} phải là JSON hợp lệ`); } }
    const calcKeys = /^(ROUND_|PQ_|FLOOR_|VAT_|FUEL_PRICE_METHOD|PERIOD_DATE_FIELD|PRICE_VERSION_DATE|NO_FUEL_POLICY|MULTI_FUEL)/;
    if (calcKeys.test(key) && !reason) throw new AppError('VALIDATION_FAILED', 'Tham số tính toán — phải nhập lý do (áp dụng cho các kỳ tính sau)');
    const val = r.value_type === 'BOOL' ? v.toUpperCase() : v;
    const probe = this.store.all('CONFIG').map((c) => (c.config_key === key ? { ...c, config_value: val } : c));
    try { E.buildConfig(probe); } catch (e) { throw new AppError('VALIDATION_FAILED', e.message); }
    return this.store.transaction((tx) => {
      const { before, after } = tx.update('CONFIG', key, { config_value: val, updated_at: tx.now, updated_by: user.username });
      tx.audit('CONFIG_SAVE', 'CONFIG', key, { value: before.config_value }, { value: val }, { reason });
      return { record: after };
    }, { user: user.username });
  }
}

module.exports = { QueryService };
