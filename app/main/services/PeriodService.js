'use strict';
/**
 * PeriodService — kỳ tính (API: periods.preview / calculate / confirm / lock / unlock / reopen / cancel / get).
 * Mọi lần ghi = 1 giao dịch JsonStore: KY_TINH + CALC_RUN + TRANSPORT_CALCULATION + TRANSPORT_DETAIL + FUEL_DETAIL + BKVC_LINE + AUDIT_LOG.
 * Không xóa kết quả cũ: lần tính trước chuyển is_current = false (lịch sử còn nguyên).
 */
const E = require('../engine');
const { AppError, businessError } = require('../../shared/errors');

const USAGE = { NHAP: 'DRAFT', DA_XAC_NHAN: 'CONFIRMED', DA_KHOA: 'LOCKED', HUY: 'RELEASED' };
const ymd = (d) => d.replace(/-/g, '');

class PeriodService {
  constructor(store) { this.store = store; this.done = new Map(); }

  _contract(contractId) {
    const c = this.store.get('HOP_DONG', contractId);
    if (!c) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    return c;
  }
  _period(periodId) {
    const p = this.store.get('KY_TINH', periodId);
    if (!p) throw new AppError('NOT_FOUND', `Không có kỳ ${periodId}`);
    return p;
  }
  _guardWrite(period, contract) {
    if (period && period.origin === 'IMPORTED') throw businessError('E_READONLY_IMPORTED', `Kỳ ${period.period_code} nhận từ bản cài khác — chỉ xem`);
    if (contract.carrier_unit_code !== this.store.unitCode) {
      throw businessError('E_NOT_CARRIER', `Đơn vị của bản cài (${this.store.unitCode}) không phải bên vận chuyển của hợp đồng ${contract.contract_code}`);
    }
  }

  /** Mã kỳ = <mã HĐ>/<từ>-<đến>[-<tuyến>]; trùng kỳ còn sống → DUPLICATE; trùng kỳ đã hủy → thêm #n. */
  _periodCode(contract, dateFrom, dateTo, routeCode, all = this.store.all('KY_TINH')) {
    const code = `${contract.contract_code}/${ymd(dateFrom)}-${ymd(dateTo)}${routeCode ? `-${routeCode}` : ''}`;
    const same = all.filter((p) => p.period_code === code || p.period_code.startsWith(`${code}#`));
    const live = same.find((p) => p.status !== 'HUY');
    if (live) throw new AppError('DUPLICATE', `Đã có kỳ ${live.period_code} (${live.status}) cho cùng hợp đồng và khoảng ngày — mở kỳ đó để tính lại`, { periodId: live.period_id });
    return same.length ? `${code}#${same.length + 1}` : code;
  }

  /** Chạy Engine trên dữ liệu hiện có (không ghi). */
  /** Thuế suất GTGT của kỳ: người dùng chọn → giữ như lần tính trước → lịch VAT_RATE_SCHEDULE theo ngày cuối kỳ → VAT_RATE. */
  _vat(vatRate, prevRate, dateTo) {
    const cfg = E.buildConfig(this.store.all('CONFIG'));
    if (vatRate === undefined || vatRate === null || vatRate === '') return { rate: prevRate !== undefined && prevRate !== null ? prevRate : E.vatRateFor(cfg, dateTo), chosen: false, cfg };
    const r = Number(vatRate);
    if (!cfg.vatRateOptions.some((x) => Math.abs(x - r) < 1e-9)) throw new AppError('VALIDATION_FAILED', `Thuế suất GTGT ${r * 100}% không có trong danh sách cho chọn (${cfg.vatRateOptions.map((x) => `${x * 100}%`).join(', ')}) — sửa CONFIG VAT_RATE_OPTIONS`);
    return { rate: r, chosen: true, cfg };
  }

  _run(contract, params) {
    const s = this.store;
    const base = E.buildConfig(s.all('CONFIG'));
    const cfg = params.vatRate === undefined ? base : Object.freeze({ ...base, vatRate: params.vatRate });
    return E.calculatePeriod({
      contract, allContracts: s.all('HOP_DONG'), contractVehicles: s.all('HOP_DONG_XE'), units: s.all('DON_VI'), routes: s.all('TUYEN_VC'), prices: s.all('PRICE_HISTORY'),
      tickets: s.all('PHIEU_CAN'), receipts: s.all('GIAO_NHAN_DAU'), ticketUsages: s.all('TRANSPORT_DETAIL'), fuelUsages: s.all('FUEL_DETAIL'),
      periods: s.all('KY_TINH'), installUnitCode: s.unitCode, cfg, params,
    });
  }

  preview({ contractId, dateFrom, dateTo, routeCode = '', periodId, excludeTicketIds, excludeReceiptIds, moveFromDraft, overrides, vatRate }) {
    const contract = this._contract(contractId);
    if (periodId) this._guardWrite(this._period(periodId), contract);
    const prev = periodId ? this.exclusions({ periodId }) : {};
    if (periodId && excludeTicketIds === undefined) excludeTicketIds = prev.excludeTicketIds;
    if (periodId && excludeReceiptIds === undefined) excludeReceiptIds = prev.excludeReceiptIds;
    if (periodId && overrides === undefined) overrides = prev.overrides;
    const v = this._vat(vatRate, prev.vatRate, dateTo);
    return { ...this._run(contract, { dateFrom, dateTo, routeCode, periodId, excludeTicketIds, excludeReceiptIds, moveFromDraft, overrides, vatRate: v.rate }), vatRate: v.rate };
  }

  async calculate({ contractId, dateFrom, dateTo, routeCode = '', periodId, excludeTicketIds, excludeReceiptIds, moveFromDraft = false, overrides,
                    reportDate = '', vatRate, clientRequestId, user = { username: 'system' } }) {
    if (!clientRequestId) throw new AppError('VALIDATION_FAILED', 'Thiếu clientRequestId');
    if (this.done.has(clientRequestId)) return this.done.get(clientRequestId);
    const contract = this._contract(contractId);
    const existing = periodId ? this._period(periodId) : null;
    this._guardWrite(existing, contract);
    if (existing && existing.status !== 'NHAP') throw businessError('E_PERIOD_STATUS', `Kỳ ${existing.period_code} đang "${existing.status}" — phải trả về nháp trước khi tính lại`);
    if (existing && (existing.date_from !== dateFrom || existing.date_to !== dateTo || existing.contract_id !== contractId)) {
      throw new AppError('VALIDATION_FAILED', 'Tính lại phải giữ nguyên hợp đồng và khoảng ngày của kỳ');
    }
    // phiếu / dòng dầu đã bỏ khỏi kỳ: tính lại mà không truyền → giữ như lần tính trước (không tự đưa lại dòng đã bỏ)
    const prev = existing ? this.exclusions({ periodId: existing.period_id }) : { excludeTicketIds: [], excludeReceiptIds: [] };
    if (excludeTicketIds === undefined) excludeTicketIds = prev.excludeTicketIds;
    if (excludeReceiptIds === undefined) excludeReceiptIds = prev.excludeReceiptIds;
    if (overrides === undefined) overrides = prev.overrides || [];
    for (const o of overrides) if (!o.reason) throw new AppError('VALIDATION_FAILED', `Cho phép ${o.code} phải có lý do`);
    if (!existing) this._periodCode(contract, dateFrom, dateTo, routeCode); // kỳ trùng → báo ngay, trước khi chạy Engine
    const vat = this._vat(vatRate, prev.vatRate, dateTo);
    const params = { dateFrom, dateTo, routeCode, periodId, excludeTicketIds, excludeReceiptIds, moveFromDraft, overrides, vatRate: vat.rate };
    const out = this._run(contract, params);
    if (!out.canCalculate) throw businessError('E_CALC_BLOCKED', 'Còn lỗi chặn — không tính được', { issues: out.issues.filter((i) => i.level === 'ERROR'), blocked: out.blocked });
    const cfgSnap = { ...Object.fromEntries(this.store.all('CONFIG').map((c) => [c.config_key, c.config_value])), VAT_RATE: String(vat.rate) };

    const result = await this.store.transaction((tx) => {
      // 1. kỳ
      let period = existing ? tx.get('KY_TINH', existing.period_id) : null;
      if (!period) {
        const code = this._periodCode(contract, dateFrom, dateTo, routeCode, tx.all('KY_TINH'));
        period = tx.insert('KY_TINH', { period_id: tx.nextId('KY', 6), period_code: code, contract_id: contractId, date_from: dateFrom, date_to: dateTo,
          route_filter: routeCode, status: 'NHAP', calc_version: 0, needs_recalc: false, origin: 'LOCAL', origin_install_id: this.store.manifest.installId });
      }
      const pid = period.period_id; const version = period.calc_version + 1;
      const runId = tx.nextId('CR', 6);
      tx.insert('CALC_RUN', { run_id: runId, period_id: pid, action: version === 1 ? 'CALC' : 'RECALC', status: 'DONE', started_at: tx.now, finished_at: tx.now,
        username: user.username, summary_json: JSON.stringify({ routes: out.results.length, tickets: out.tickets.length, receipts: out.receipts.length, blocked: out.blocked.length,
          excludeTicketIds: [...excludeTicketIds], excludeReceiptIds: [...excludeReceiptIds], vatRate: vat.rate, overrides }) });
      // 2. lần tính cũ → không còn hiện hành
      for (const t of ['TRANSPORT_CALCULATION', 'TRANSPORT_DETAIL', 'FUEL_DETAIL', 'BKVC_LINE']) {
        const pk = t === 'TRANSPORT_CALCULATION' ? 'calc_id' : 'id';
        for (const r of tx.all(t).filter((x) => x.period_id === pid && x.is_current)) tx.update(t, r[pk], { is_current: false, ...(r.usage_state ? { usage_state: 'RELEASED' } : {}) });
      }
      // 3. kết quả mới
      const ticketById = new Map(tx.all('PHIEU_CAN').map((t) => [t.ticket_id, t]));
      const calcIdOf = new Map();
      for (const r of out.results) {
        const calcId = tx.nextId('TC', 6); calcIdOf.set(r.routeCode, calcId);
        tx.insert('TRANSPORT_CALCULATION', toCalcRow(r, { calcId, pid, runId, version, contractId }, out.issues));
        for (const tid of r.ticketIds) {
          const t = ticketById.get(tid);
          tx.insert('TRANSPORT_DETAIL', { id: tx.nextId('TD', 7), calc_id: calcId, period_id: pid, contract_id: contractId, ticket_id: tid, ticket_key: t.ticket_key,
            plate_no: t.plate_no, weigh1_date: t.weigh1_date, net_kg: t.net_kg, is_current: true, usage_state: 'DRAFT' });
        }
        for (const rid of r.receiptIds) {
          const f = tx.get('GIAO_NHAN_DAU', rid);
          tx.insert('FUEL_DETAIL', { id: tx.nextId('FD', 7), calc_id: calcId, period_id: pid, contract_id: contractId, receipt_id: rid, qty_liter: f.qty_liter,
            fuel_price_excl_vat: f.fuel_price_excl_vat, is_current: true, usage_state: 'DRAFT' });
        }
      }
      for (const l of out.bkvc.lines) {
        tx.insert('BKVC_LINE', { id: tx.nextId('BL', 7), period_id: pid, calc_id: calcIdOf.get(l.routeCode), contract_id: contractId, route_code: l.routeCode, seq: l.seq,
          plate_no: l.plateNo, owner_unit_code: l.ownerUnitCode, trip_count: l.tripCount, kg: l.kg, ton: l.ton, unit_price: l.unitPrice, amount: l.amount,
          vat_rate: l.vatRate, vat: l.vat, amount_incl_vat: l.amountInclVat, note: '', is_current: true });
      }
      // 4. kỳ nháp khác bị lấy phiếu → cần tính lại
      for (const ap of out.affectedPeriods) tx.update('KY_TINH', ap, { needs_recalc: true });
      const { before, after } = tx.update('KY_TINH', pid, { calc_version: version, current_run_id: runId, config_snapshot_json: JSON.stringify(cfgSnap), needs_recalc: false,
        report_date: reportDate || period.report_date || '', calculated_at: tx.now, calculated_by: user.username });
      tx.audit(version === 1 ? 'CALC' : 'RECALC', 'KY_TINH', pid, version === 1 ? null : before, { calc_version: version, prices: out.results.map((r) => [r.routeCode, r.transportPrice]),
        overrides, excludeTicketIds, excludeReceiptIds, vatRate: vat.rate }, { runId, reason: overrides.map((o) => `${o.code}: ${o.reason}`).join('; ') });
      return { period: after, runId, excludeTicketIds, excludeReceiptIds, vatRate: vat.rate, overrides, results: out.results, bkvc: out.bkvc, issues: out.issues, blocked: out.blocked, affectedPeriods: out.affectedPeriods };
    }, { user: user.username });
    this.done.set(clientRequestId, result);
    return result;
  }

  async _transition(periodId, { from, to, action, rowVersion, reason, user, needUnlock }) {
    const p = this._period(periodId);
    const contract = this._contract(p.contract_id);
    this._guardWrite(p, contract);
    if (needUnlock && !(user.role === 'ADMIN' || user.canUnlock)) throw new AppError('FORBIDDEN', 'Chỉ ADMIN hoặc người có quyền mở khóa mới làm được');
    if (needUnlock && !reason) throw new AppError('VALIDATION_FAILED', 'Phải nhập lý do');
    if (p.status !== from) throw businessError('E_PERIOD_STATUS', `Kỳ ${p.period_code} đang "${p.status}", không thể ${action.toLowerCase()} (cần "${from}")`);
    if (to === 'DA_XAC_NHAN' && from === 'NHAP') {
      if (p.needs_recalc) throw businessError('E_NEEDS_RECALC', `Dữ liệu nguồn đã sửa sau lần tính — tính lại kỳ ${p.period_code} trước khi xác nhận`);
      if (!p.calc_version) throw businessError('E_PERIOD_STATUS', 'Kỳ chưa được tính');
    }
    return this.store.transaction((tx) => {
      const patch = { status: to };
      if (action === 'CONFIRM') Object.assign(patch, { confirmed_at: tx.now, confirmed_by: user.username });
      if (action === 'LOCK') Object.assign(patch, { locked_at: tx.now, locked_by: user.username });
      if (action === 'REOPEN') Object.assign(patch, { confirmed_at: '', confirmed_by: '' });
      const { before, after } = tx.update('KY_TINH', periodId, patch, { expectedRowVersion: rowVersion });
      const state = USAGE[to];
      for (const t of ['TRANSPORT_DETAIL', 'FUEL_DETAIL']) for (const r of tx.all(t).filter((x) => x.period_id === periodId && x.is_current)) tx.update(t, r.id, { usage_state: state });
      if (action === 'CONFIRM') {
        const used = new Set(tx.all('TRANSPORT_CALCULATION').filter((c) => c.period_id === periodId && c.is_current).map((c) => c.price_id));
        for (const id of used) if (!tx.get('PRICE_HISTORY', id).is_used) tx.update('PRICE_HISTORY', id, { is_used: true });
      }
      tx.insert('CALC_RUN', { run_id: tx.nextId('CR', 6), period_id: periodId, action, status: 'DONE', started_at: tx.now, finished_at: tx.now, username: user.username });
      tx.audit(action, 'KY_TINH', periodId, { status: before.status }, { status: after.status }, { reason: reason || '' });
      return after;
    }, { user: user.username });
  }

  confirm({ periodId, rowVersion, user }) { return this._transition(periodId, { from: 'NHAP', to: 'DA_XAC_NHAN', action: 'CONFIRM', rowVersion, user }); }
  lock({ periodId, rowVersion, user }) { return this._transition(periodId, { from: 'DA_XAC_NHAN', to: 'DA_KHOA', action: 'LOCK', rowVersion, user }); }
  unlock({ periodId, rowVersion, reason, user }) { return this._transition(periodId, { from: 'DA_KHOA', to: 'DA_XAC_NHAN', action: 'UNLOCK', rowVersion, reason, user, needUnlock: true }); }
  reopen({ periodId, rowVersion, reason, user }) { return this._transition(periodId, { from: 'DA_XAC_NHAN', to: 'NHAP', action: 'REOPEN', rowVersion, reason, user, needUnlock: true }); }
  async cancel({ periodId, rowVersion, reason, user }) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Phải nhập lý do hủy kỳ');
    return this._transition(periodId, { from: 'NHAP', to: 'HUY', action: 'CANCEL', rowVersion, reason, user });
  }

  /** Phiếu / dòng dầu người dùng đã bỏ khỏi kỳ ở lần tính hiện hành (lưu trong CALC_RUN.summary_json). */
  exclusions({ periodId }) {
    const p = this._period(periodId);
    const run = p.current_run_id ? this.store.get('CALC_RUN', p.current_run_id) : null;
    let sum = {}; try { sum = JSON.parse((run && run.summary_json) || '{}'); } catch { sum = {}; }
    let vr = sum.vatRate;
    if (vr === undefined && p.config_snapshot_json) { try { const snap = JSON.parse(p.config_snapshot_json); if (snap.VAT_RATE !== undefined && snap.VAT_RATE !== '') vr = Number(snap.VAT_RATE); } catch { /* bỏ qua */ } }
    const ex = { excludeTicketIds: sum.excludeTicketIds || [], excludeReceiptIds: sum.excludeReceiptIds || [], vatRate: vr, overrides: sum.overrides || [] };
    ex.receipts = ex.excludeReceiptIds.map((id) => this.store.get('GIAO_NHAN_DAU', id)).filter(Boolean)
      .map((r) => ({ receiptId: r.receipt_id, date: r.receive_date, plateNo: r.plate_no || r.fuel_vehicle_code, qty: r.qty_liter, price: r.fuel_price_excl_vat }));
    return ex;
  }

  get({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    return { period: p, exclusions: this.exclusions({ periodId }), results: s.find('TRANSPORT_CALCULATION', (c) => c.period_id === periodId && c.is_current),
      bkvc: s.find('BKVC_LINE', (l) => l.period_id === periodId && l.is_current).sort((a, b) => a.seq - b.seq),
      runs: s.find('CALC_RUN', (r) => r.period_id === periodId) };
  }
}

/** Kết quả Engine (camelCase) → dòng TRANSPORT_CALCULATION (snake_case, snapshot đầy đủ để truy vết). */
function toCalcRow(r, { calcId, pid, runId, version, contractId }, allIssues) {
  const nz = (v) => (v === null || v === undefined ? '' : v);
  return { calc_id: calcId, period_id: pid, run_id: runId, calc_version: version, is_current: true, contract_id: contractId, route_code: r.routeCode, route_name: r.routeName,
    uom: r.uom, price_id: r.priceId, trip_distance_km: r.tripDistanceKm, new_price: r.newPrice, avg_load_ton: r.avgLoadTon, avg_volume_m3: nz(r.avgVolumeM3),
    fuel_price_catalog: r.fuelPriceCatalog, fuel_norm_l_per_km: r.fuelNormLPerKm, start_date: r.startDate, end_date: r.endDate, trip_count: r.tripCount,
    total_kg: r.totalKg, total_ton: r.totalTon, fuel_giver_unit: nz(r.fuelGiverUnit), fuel_uom: nz(r.fuelUom), fuel_line_count: r.fuelLineCount,
    actual_fuel_liter: r.actualFuelLiter, fuel_start_date: nz(r.fuelStartDate), fuel_end_date: nz(r.fuelEndDate), fuel_price: nz(r.fuelPrice), fuel_import_date: nz(r.fuelImportDate),
    trip_price: r.tripPrice, fuel_per_trip: r.fuelPerTrip, fuel_cost_per_trip: r.fuelCostPerTrip, fuel_cost_ratio: r.fuelCostRatio, price_no_diesel: r.priceNoDiesel,
    contract_price: r.contractPrice, standard_fuel_liter: r.standardFuelLiter, fuel_diff_liter: r.fuelDiffLiter, fuel_adjust_price: r.fuelAdjustPrice,
    transport_price_raw: r.transportPriceRaw, transport_price: r.transportPrice, price_method: r.priceMethod || 'THEO_DAU', result_status: r.resultStatus,
    warnings_json: JSON.stringify([...r.issues, ...allIssues.filter((i) => !r.issues.includes(i) && !i.params?.routeCode)].map(({ code, level, message, ref }) => ({ code, level, message, ref }))),
    trace_json: JSON.stringify(r.trace) };
}

module.exports = { PeriodService, toCalcRow };
