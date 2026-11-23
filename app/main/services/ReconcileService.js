'use strict';
/**
 * ReconcileService — Đối chiếu dữ liệu (API: reconcile.audit, reconcile.compare, reconcile.export). Chỉ đọc, không ghi dữ liệu.
 *
 *  audit   : kiểm tra nội bộ — phiếu cân của xe thuộc hợp đồng mình vận chuyển mà CHƯA được tính ở kỳ nào:
 *            LATE     về muộn: ngày cân nằm trong kỳ đã xác nhận / đã khóa nhưng phiếu không có trong kỳ (nhập sau khi chốt)
 *            DRAFT    nằm trong kỳ nháp nhưng kỳ chưa tính lại
 *            GAP      lọt khe: trước ngày cuối của kỳ đã chốt gần nhất mà không kỳ nào phủ ngày đó
 *            WAITING  chờ kỳ sau (sau kỳ đã chốt gần nhất) — bình thường
 *            EXCLUDED người dùng chủ động bỏ khỏi kỳ (chỉ để biết)
 *          + xe nằm trong 2 hợp đồng cùng lúc (thời gian hiệu lực chồng nhau).
 *  compare : so phiếu cân của đơn vị khác (gói .dgvc có phiếu cân, hoặc file Excel phiếu cân) với phiếu cân của mình, theo
 *            số phiếu + ngày cân 1 + biển số: KHOP · LECH (khác số cân) · KHAC_SO_PHIEU (cùng xe, ngày, KL nhưng khác số phiếu)
 *            · THIEU_BEN_MINH (bên kia có, mình chưa có) · THIEU_BEN_KIA (mình có, bên kia không có).
 */
const path = require('node:path');
const fs = require('node:fs');
const { AppError } = require('../../shared/errors');
const { buildCoverage, ticketUsage, excludedTickets, CLOSED } = require('./periodCoverage');
const { normTickets, normFuels, extractFromObj, fuelDate } = require('../import/partnerNorm');
const { rentLine } = require('./rentMath');

const CORE = [['weigh1_time', 'Giờ cân 1'], ['weigh2_date', 'Ngày cân 2'], ['weigh2_time', 'Giờ cân 2'], ['weight1_kg', 'Cân lần 1'], ['weight2_kg', 'Cân lần 2'], ['net_kg', 'KL hàng'], ['route_code', 'Mã tuyến']];
const STATUS_TEXT = { NHAP: 'nháp', DA_XAC_NHAN: 'đã xác nhận', DA_KHOA: 'đã khóa' };
const AUDIT_KIND = {
  LATE: ['Về muộn — ngày cân thuộc kỳ đã chốt nhưng chưa tính', 'high'],
  GAP: ['Lọt khe — không kỳ nào phủ ngày cân', 'high'],
  DRAFT: ['Thuộc kỳ nháp, kỳ chưa tính lại', 'mid'],
  WAITING: ['Chờ kỳ sau', 'low'],
  EXCLUDED: ['Đã chủ động bỏ khỏi kỳ', 'low'],
};
const CMP_KIND = {
  KHOP: 'Khớp',
  LECH: 'Lệch số liệu',
  KHAC_SO_PHIEU: 'Khác số phiếu (cùng xe, ngày, KL)',
  THIEU_BEN_MINH: 'Bên mình chưa có',
  THIEU_BEN_KIA: 'Bên kia không có',
};
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const num = (v) => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(v));

class ReconcileService {
  constructor(store, { importService, exchange, subcontract } = {}) {
    this.store = store;
    this.importService = importService;
    this.exchange = exchange;
    this.subcontract = subcontract;
  }

  // ─────────────────────────── kiểm tra nội bộ ───────────────────────────
  audit({ dateFrom = '', dateTo = '', includeWaiting = false } = {}) {
    const s = this.store; const cov = buildCoverage(s); const used = ticketUsage(s); const excl = excludedTickets(s);
    const rows = [];
    for (const t of s.all('PHIEU_CAN')) {
      if (t.is_deleted || used.has(t.ticket_id)) continue;
      if ((dateFrom && t.weigh1_date < dateFrom) || (dateTo && t.weigh1_date > dateTo)) continue;
      const scopes = cov.periodsFor(t); if (!scopes.length) continue; // xe không thuộc hợp đồng mình vận chuyển
      for (const sc of scopes) {
        const closed = sc.periods.find((p) => CLOSED.has(p.status)); const draft = sc.periods.find((p) => p.status === 'NHAP');
        let kind; let period = closed || draft || null;
        if (excl.has(t.ticket_id)) { kind = 'EXCLUDED'; period = excl.get(t.ticket_id); }
        else if (closed) kind = 'LATE';
        else if (draft) kind = 'DRAFT';
        else if (sc.lastClosedEnd && cov.dateOf(t) <= sc.lastClosedEnd) kind = 'GAP';
        else kind = 'WAITING';
        if (kind === 'WAITING' && !includeWaiting) continue;
        rows.push({ kind, kindText: AUDIT_KIND[kind][0], severity: AUDIT_KIND[kind][1], ticketId: t.ticket_id, ticketNo: t.ticket_no, date: t.weigh1_date, time: t.weigh1_time,
          plateNo: t.plate_no, routeCode: t.route_code, netKg: t.net_kg, owner: t.owner_unit_code || '', contractId: sc.contract.contract_id, contractCode: sc.contract.contract_code,
          customer: sc.contract.customer_unit_code, periodId: period ? period.period_id : '', periodCode: period ? period.period_code : '', periodStatus: period ? period.status : '',
          periodStatusText: period ? STATUS_TEXT[period.status] || period.status : '', importBatch: t.import_batch_id || '', createdAt: t.created_at || '' });
      }
    }
    const order = { LATE: 0, GAP: 1, DRAFT: 2, EXCLUDED: 3, WAITING: 4 };
    rows.sort((a, b) => order[a.kind] - order[b.kind] || a.date.localeCompare(b.date) || a.plateNo.localeCompare(b.plateNo) || String(a.ticketNo).localeCompare(String(b.ticketNo)));
    const summary = Object.fromEntries(Object.keys(AUDIT_KIND).map((k) => [k, { label: AUDIT_KIND[k][0], count: 0, kg: 0 }]));
    for (const r of rows) { summary[r.kind].count += 1; summary[r.kind].kg += r.netKg || 0; }
    // xe nằm trong 2 hợp đồng (của mình) có thời gian hiệu lực chồng nhau
    const overlaps = []; const active = cov.cv.filter((v) => cov.byId.get(v.contract_id).is_active !== false);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]; const b = active[j];
        if (a.plate_no !== b.plate_no || a.contract_id === b.contract_id) continue;
        const from = a.effective_from > b.effective_from ? a.effective_from : b.effective_from;
        const ends = [a.effective_to, b.effective_to].filter(Boolean).sort(); const to = ends[0] || '';
        if (to && to < from) continue;
        const ca = cov.byId.get(a.contract_id); const cb = cov.byId.get(b.contract_id);
        overlaps.push({ plateNo: a.plate_no, contractA: ca.contract_code, rangeA: `${dmy(a.effective_from)} → ${a.effective_to ? dmy(a.effective_to) : '…'}`,
          contractB: cb.contract_code, rangeB: `${dmy(b.effective_from)} → ${b.effective_to ? dmy(b.effective_to) : '…'}`, overlap: `${dmy(from)} → ${to ? dmy(to) : '…'}`,
          sameCustomer: ca.customer_unit_code === cb.customer_unit_code, severity: ca.customer_unit_code === cb.customer_unit_code ? 'high' : 'mid' });
      }
    }
    return { dateFrom, dateTo, summary, rows, overlaps, problems: summary.LATE.count + summary.GAP.count + summary.DRAFT.count + overlaps.filter((o) => o.sameCustomer).length };
  }

  /** Phiếu vừa import có ngày nằm trong kỳ đã chốt → cảnh báo ngay khi import. records: bản ghi PHIEU_CAN (chưa ghi). */
  lateOf(records) {
    const cov = buildCoverage(this.store); const out = new Map();
    for (const r of records) {
      for (const sc of cov.periodsFor(r)) {
        const p = sc.periods.find((x) => CLOSED.has(x.status));
        if (p) { out.set(r.ticket_key, p); break; }
      }
    }
    return out;
  }

  // ─────────────────────────── đối chiếu với đơn vị khác ───────────────────────────
  async _theirs(filePath) {
    if (!filePath || !fs.existsSync(filePath)) throw new AppError('VALIDATION_FAILED', 'Chọn file cần đối chiếu');
    const ext = path.extname(filePath).toLowerCase();
    // MỌI đường đọc (gói .dgvc, .json, file đợt đã nạp) đi qua CÙNG bộ chuẩn hóa — cùng file ra cùng kết quả (dầu lấy receive_date trước)
    if (ext === '.dgvc') {
      const pkg = this.exchange ? this.exchange.read(filePath) : JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(filePath)));
      const h = pkg.header || {};
      const ex = extractFromObj(pkg);
      const tickets = normTickets(ex.tickets); const fuelRows = normFuels(ex.fuelRows);
      if (!tickets.length && !fuelRows.length) throw new AppError('VALIDATION_FAILED', 'Gói không có phiếu cân hoặc dầu');
      const kind = { DANH_MUC: 'gói Danh mục', PHIEU_CAN: 'gói Phiếu cân', KY_TINH: 'gói Kỳ tính' }[h.packageType] || 'gói';
      return { fileName: path.basename(filePath), sourceText: `${kind} của ${h.sourceUnitCode || 'đối tác'} (${h.createdBy || ''}, ${String(h.createdAt || '').slice(0, 10)})`, sourceUnit: h.sourceUnitCode || '', tickets, fuelRows, unreadable: [] };
    }
    if (ext === '.json') {
      const raw = fs.readFileSync(filePath);
      let data;
      try {
        data = JSON.parse(require('node:zlib').gunzipSync(raw));
      } catch {
        try {
          data = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          throw new AppError('VALIDATION_FAILED', `Không đọc được file JSON ${path.basename(filePath)}: ${e.message}`);
        }
      }
      const ex = extractFromObj(data);
      let srcText = `file JSON: ${path.basename(filePath)}`;
      let srcUnit = ex.partner || '';
      if (ex.header) {
        srcUnit = ex.header.sourceUnitCode || '';
        srcText = `Gói ${ex.header.packageType || 'dữ liệu'} của ${srcUnit || 'đối tác'}`;
      } else if (data && !Array.isArray(data) && data.batchName) srcText = `${data.batchName} (${srcUnit || 'Đơn vị thuê'})`;
      return { fileName: path.basename(filePath), sourceText: srcText, sourceUnit: srcUnit, tickets: normTickets(ex.tickets), fuelRows: normFuels(ex.fuelRows), unreadable: [] };
    }
    if (!['.xlsx', '.xlsm', '.xls'].includes(ext)) throw new AppError('VALIDATION_FAILED', 'Chỉ đối chiếu được file .json, gói .dgvc hoặc file Excel (mẫu phiếu cân / mẫu dầu)');
    if (!this.importService) throw new AppError('VALIDATION_FAILED', 'ImportService chưa được khởi tạo để đọc Excel');
    const r = await this.importService.readPartnerExcel({ filePath });
    const ok = (x) => x.record.ticket_no && x.record.weigh1_date && x.record.plate_no && typeof x.record.net_kg === 'number' && x.record.net_kg > 0;
    const unreadable = []; let tickets = []; let fuelRows = [];
    const parts = [];
    if (r.tickets) {
      tickets = r.tickets.rows.filter(ok).map((x) => ({ ...x.record, _rowNo: x.rowNo }));
      for (const x of r.tickets.rows.filter((y) => !ok(y))) unreadable.push({ rowNo: x.rowNo, ticketNo: x.record.ticket_no, note: x.errors.join('; ') });
      parts.push(`phiếu cân (sheet "${r.tickets.sheet}")`);
    }
    if (r.fuel) {
      fuelRows = r.fuel.rows.filter((x) => !x.errors.length).map((x) => ({ ...x.record, _rowNo: x.rowNo }));
      for (const x of r.fuel.rows.filter((y) => y.errors.length)) unreadable.push({ rowNo: x.rowNo, ticketNo: '', note: `Dầu: ${x.errors.join('; ')}` });
      parts.push(`dầu (sheet "${r.fuel.sheet}")`);
    }
    return { fileName: r.fileName, sourceText: `file Excel ${parts.join(' + ')}`, sourceUnit: '', tickets: normTickets(tickets), fuelRows: normFuels(fuelRows), unreadable };
  }

  async compare({ filePath, batchId, periodId = '', contractId = '', dateFrom = '', dateTo = '', allPlates = false, rentUnitPrice, fuelUnitPrice, deductFuel }) {
    let resolvedFilePath = filePath;
    let resolvedRentPrice = rentUnitPrice != null ? Number(rentUnitPrice) : 0;
    let resolvedFuelPrice = fuelUnitPrice != null ? Number(fuelUnitPrice) : 0;
    let resolvedDeductFuel = deductFuel == null ? true : deductFuel !== false; // không gửi → dùng giá trị đã lưu của đợt (nếu có), rồi mới mặc định có trừ dầu
    let batch = null;

    if (batchId && this.subcontract) {
      batch = this.subcontract.getBatch({ batchId });
      if (batch) {
        resolvedFilePath = batch.filePath;
        if (!periodId && batch.periodId) periodId = batch.periodId;
        if (rentUnitPrice == null && batch.rentUnitPrice != null) resolvedRentPrice = Number(batch.rentUnitPrice);
        if (fuelUnitPrice == null && batch.fuelUnitPrice != null) resolvedFuelPrice = Number(batch.fuelUnitPrice);
        if (deductFuel == null && batch.deductFuel != null) resolvedDeductFuel = Boolean(batch.deductFuel);
      }
    }

    let period = null;
    if (periodId) {
      period = this.store.get('KY_TINH', periodId);
      if (period) {
        if (!contractId) contractId = period.contract_id;
        if (!dateFrom && period.date_from) dateFrom = period.date_from;
        if (!dateTo && period.date_to) dateTo = period.date_to;
      }
    }

    const th = await this._theirs(resolvedFilePath);
    const fDate = fuelDate; // CÙNG hàm với đường đợt đã nạp: receive_date ?? receipt_date ?? issue_date ?? date
    const dates = [...th.tickets.map((t) => t.weigh1_date), ...(th.fuelRows || []).map(fDate)].filter(Boolean).sort();
    const from = dateFrom || dates[0] || ''; const to = dateTo || dates[dates.length - 1] || '';
    const contractPlates = contractId ? new Set(this.store.find('HOP_DONG_XE', (v) => v.contract_id === contractId).map((v) => v.plate_no)) : null;
    const filterTheirsByContract = contractId && !batchId && !batch;
    const theirs = th.tickets.filter((t) => (!from || t.weigh1_date >= from) && (!to || t.weigh1_date <= to) && (!filterTheirsByContract || !contractPlates || contractPlates.has(t.plate_no)));
    const plates = new Set(theirs.map((t) => t.plate_no));
    const key = (t) => `${t.ticket_no}|${t.weigh1_date}|${t.plate_no}`;
    const mine = this.store.all('PHIEU_CAN').filter((t) => !t.is_deleted && (!from || t.weigh1_date >= from) && (!to || t.weigh1_date <= to) && (!contractPlates || contractPlates.has(t.plate_no)) && (allPlates || plates.has(t.plate_no)));
    const used = ticketUsage(this.store);
    const pInfo = (t) => { const p = t && (used.get(t.ticket_id) || [])[0]; return p ? { periodCode: p.period_code, periodStatus: STATUS_TEXT[p.status] || p.status } : { periodCode: '', periodStatus: '' }; };
    const mineBy = new Map(mine.map((t) => [key(t), t]));
    const theirBy = new Map(); const dupTheirs = [];
    for (const t of theirs) { if (theirBy.has(key(t))) dupTheirs.push(t); else theirBy.set(key(t), t); }
    const rows = []; const row = (kind, m, o, extra = {}) => {
      const a = m || o;
      rows.push({ kind, kindText: CMP_KIND[kind], date: a.weigh1_date, plateNo: a.plate_no, ticketNo: m ? m.ticket_no : '', theirTicketNo: o ? o.ticket_no : '',
        time: (m || o).weigh1_time || '', mineKg: m ? m.net_kg : null, theirKg: o ? num(o.net_kg) : null, diffKg: m && o ? num(o.net_kg) - m.net_kg : null,
        routeCode: (m && m.route_code) || (o && o.route_code) || '', owner: (m && m.owner_unit_code) || '', theirRowNo: o && o._rowNo ? o._rowNo : '', ...pInfo(m), ...extra });
    };
    const leftMine = new Map(); const leftTheirs = [];
    for (const [k, m] of mineBy) if (!theirBy.has(k)) leftMine.set(k, m);
    for (const [k, o] of theirBy) {
      const m = mineBy.get(k);
      if (!m) { leftTheirs.push(o); continue; }
      const norm = (f, v) => (f.endsWith('_kg') ? num(v) : String(v ?? '').trim().toUpperCase());
      const diff = CORE.filter(([f]) => o[f] !== undefined && o[f] !== null && o[f] !== '' && norm(f, o[f]) !== norm(f, m[f]));
      if (diff.length) row('LECH', m, o, { fields: diff.map(([f, lab]) => `${lab}: ${m[f] ?? ''} ≠ ${o[f]}`).join('; ') });
      else row('KHOP', m, o);
    }
    // ghép phiếu khác số: cùng xe + ngày cân 1 + KL hàng
    for (const o of leftTheirs) {
      const hit = [...leftMine.entries()].find(([, m]) => m.plate_no === o.plate_no && m.weigh1_date === o.weigh1_date && m.net_kg === num(o.net_kg));
      if (hit) { leftMine.delete(hit[0]); row('KHAC_SO_PHIEU', hit[1], o, { fields: `Số phiếu: ${hit[1].ticket_no} ≠ ${o.ticket_no}` }); }
      else row('THIEU_BEN_MINH', null, o);
    }
    for (const m of leftMine.values()) row('THIEU_BEN_KIA', m, null);
    const order = { LECH: 0, KHAC_SO_PHIEU: 1, THIEU_BEN_MINH: 2, THIEU_BEN_KIA: 3, KHOP: 4 };
    rows.sort((a, b) => order[a.kind] - order[b.kind] || a.date.localeCompare(b.date) || a.plateNo.localeCompare(b.plateNo) || String(a.ticketNo || a.theirTicketNo).localeCompare(String(b.ticketNo || b.theirTicketNo)));
    const summary = Object.fromEntries(Object.keys(CMP_KIND).map((k) => [k, { label: CMP_KIND[k], count: 0, mineKg: 0, theirKg: 0 }]));
    for (const r of rows) { const x = summary[r.kind]; x.count += 1; x.mineKg += r.mineKg || 0; x.theirKg += r.theirKg || 0; }
    const byPlate = new Map();
    const bp = (p) => { if (!byPlate.has(p)) byPlate.set(p, { plateNo: p, mineTrips: 0, mineKg: 0, theirTrips: 0, theirKg: 0, issues: 0 }); return byPlate.get(p); };
    for (const t of mine) { const x = bp(t.plate_no); x.mineTrips += 1; x.mineKg += t.net_kg; }
    for (const t of theirBy.values()) { const x = bp(t.plate_no); x.theirTrips += 1; x.theirKg += num(t.net_kg); }
    for (const r of rows) if (r.kind !== 'KHOP') bp(r.plateNo).issues += 1;
    const plateRows = [...byPlate.values()].map((x) => ({ ...x, diffTrips: x.theirTrips - x.mineTrips, diffKg: x.theirKg - x.mineKg })).sort((a, b) => a.plateNo.localeCompare(b.plateNo));
    const totals = { mineTrips: mine.length, mineKg: mine.reduce((a, t) => a + t.net_kg, 0), theirTrips: theirBy.size, theirKg: [...theirBy.values()].reduce((a, t) => a + num(t.net_kg), 0) };

    // Đối chiếu Dầu nhận (GIAO_NHAN_DAU) giữa bên mình và bên mình thuê / bên thuê mình
    const theirFuel = (th.fuelRows || []).filter((f) => {
      const d = fDate(f);
      return (!from || d >= from) && (!to || d <= to) && (!filterTheirsByContract || !contractPlates || contractPlates.has(f.plate_no));
    });
    const fuelPlates = new Set([...plates, ...theirFuel.map((f) => f.plate_no)]);
    const mineFuel = this.store.all('GIAO_NHAN_DAU').filter((f) => {
      if (f.is_deleted) return false;
      if (contractId && f.contract_id && f.contract_id !== contractId) return false;
      const d = fDate(f);
      return (!from || d >= from) && (!to || d <= to) && (!contractPlates || contractPlates.has(f.plate_no)) && (allPlates || fuelPlates.has(f.plate_no));
    });
    const fKey = (f, idx) => `${fDate(f)}|${f.plate_no}|${f.receipt_no || f.receipt_id || idx}`;
    const fMineLeft = [...mineFuel];
    const fRows = [];
    for (const o of theirFuel) {
      const od = fDate(o); const ol = num(o.qty_liter) || 0;
      let idx = fMineLeft.findIndex((m) => fDate(m) === od && m.plate_no === o.plate_no && Math.abs((num(m.qty_liter) || 0) - ol) < 0.01);
      if (idx >= 0) {
        const m = fMineLeft.splice(idx, 1)[0];
        fRows.push({ kind: 'KHOP', kindText: 'Khớp', date: od, plateNo: o.plate_no, mineLiter: num(m.qty_liter), theirLiter: ol, diffLiter: 0, fields: '' });
      } else {
        idx = fMineLeft.findIndex((m) => fDate(m) === od && m.plate_no === o.plate_no);
        if (idx >= 0) {
          const m = fMineLeft.splice(idx, 1)[0]; const ml = num(m.qty_liter) || 0;
          fRows.push({ kind: 'LECH', kindText: 'Lệch số lít', date: od, plateNo: o.plate_no, mineLiter: ml, theirLiter: ol, diffLiter: ol - ml, fields: `Số lít: ${ml} ≠ ${ol}` });
        } else {
          fRows.push({ kind: 'THIEU_BEN_MINH', kindText: 'Bên mình chưa có', date: od, plateNo: o.plate_no, mineLiter: null, theirLiter: ol, diffLiter: ol, fields: 'Thiếu dòng dầu bên mình' });
        }
      }
    }
    for (const m of fMineLeft) {
      const ml = num(m.qty_liter) || 0;
      fRows.push({ kind: 'THIEU_BEN_KIA', kindText: 'Bên kia không có', date: fDate(m), plateNo: m.plate_no, mineLiter: ml, theirLiter: null, diffLiter: -ml, fields: 'Bên kia không có dòng dầu này' });
    }
    const fByPlate = new Map();
    const fbp = (p) => { if (!fByPlate.has(p)) fByPlate.set(p, { plateNo: p, mineRows: 0, theirRows: 0, mineLiter: 0, theirLiter: 0, issues: 0 }); return fByPlate.get(p); };
    for (const m of mineFuel) { const x = fbp(m.plate_no); x.mineRows += 1; x.mineLiter += num(m.qty_liter) || 0; }
    for (const o of theirFuel) { const x = fbp(o.plate_no); x.theirRows += 1; x.theirLiter += num(o.qty_liter) || 0; }
    for (const r of fRows) if (r.kind !== 'KHOP') fbp(r.plateNo).issues += 1;
    const fuelCompare = {
      hasTheirFuel: theirFuel.length > 0,
      totals: {
        mineRows: mineFuel.length, theirRows: theirFuel.length,
        mineLiter: mineFuel.reduce((a, f) => a + (num(f.qty_liter) || 0), 0),
        theirLiter: theirFuel.reduce((a, f) => a + (num(f.qty_liter) || 0), 0),
      },
      summary: {
        KHOP: fRows.filter((r) => r.kind === 'KHOP').length,
        LECH: fRows.filter((r) => r.kind === 'LECH').length,
        THIEU_BEN_MINH: fRows.filter((r) => r.kind === 'THIEU_BEN_MINH').length,
        THIEU_BEN_KIA: fRows.filter((r) => r.kind === 'THIEU_BEN_KIA').length,
      },
      byPlate: [...fByPlate.values()].map((x) => ({ ...x, diffLiter: x.theirLiter - x.mineLiter })).sort((a, b) => a.plateNo.localeCompare(b.plateNo)),
      rows: fRows
    };

    // ─────────────────────────── TIÊU CHÍ 3: ĐƠN GIÁ, THÀNH TIỀN & THỰC TRẢ ───────────────────────────
    const rentPrice = resolvedRentPrice;
    const fuelPrice = resolvedFuelPrice;
    const fByPlateMap = new Map((fuelCompare.byPlate || []).map((x) => [x.plateNo, x]));

    for (const x of plateRows) {
      const fItem = fByPlateMap.get(x.plateNo) || { mineRows: 0, theirRows: 0, mineLiter: 0, theirLiter: 0, diffLiter: 0 };
      x.mineFuelRows = fItem.mineRows;
      x.theirFuelRows = fItem.theirRows;
      x.mineFuelLiter = fItem.mineLiter;
      x.theirFuelLiter = fItem.theirLiter;
      x.diffFuelLiter = fItem.diffLiter;

      x.mineTon = Math.round((x.mineKg / 1000) * 100) / 100;
      x.theirTon = Math.round((x.theirKg / 1000) * 100) / 100;
      x.diffTon = Math.round(((x.theirKg - x.mineKg) / 1000) * 100) / 100;

      x.rentUnitPrice = rentPrice;
      x.fuelUnitPrice = fuelPrice;

      // công thức tiền thuê / dầu / thực trả: DÙNG CHUNG với Báo cáo thuê vận chuyển (rentMath.js)
      const mineL = rentLine({ kg: x.mineKg, liter: x.mineFuelLiter, rentPrice, fuelPrice, deductFuel: resolvedDeductFuel });
      const theirL = rentLine({ kg: x.theirKg, liter: x.theirFuelLiter, rentPrice, fuelPrice, deductFuel: resolvedDeductFuel });
      x.mineRentAmount = mineL.rentAmount;
      x.theirRentAmount = theirL.rentAmount;
      x.diffRentAmount = x.theirRentAmount - x.mineRentAmount;

      x.mineFuelAmount = mineL.fuelAmount;
      x.theirFuelAmount = theirL.fuelAmount;
      x.diffFuelAmount = x.theirFuelAmount - x.mineFuelAmount;

      x.mineDeductFuel = mineL.deductFuelAmount;
      x.theirDeductFuel = theirL.deductFuelAmount;

      x.minePayable = mineL.payable;
      x.theirPayable = theirL.payable;
      x.diffPayable = x.theirPayable - x.minePayable;

      // Đánh giá trạng thái đối chiếu 3 tiêu chuẩn
      const hasDiffKg = Math.abs(x.diffKg || 0) > 0.001;
      const hasDiffFuel = Math.abs(x.diffFuelLiter || 0) > 0.001;

      if (x.mineTrips === 0 && x.theirTrips > 0) {
        x.matchStatus = 'MISSING_MINE';
        x.matchText = '⚠ Thiếu bên mình';
      } else if (x.theirTrips === 0 && x.mineTrips > 0) {
        x.matchStatus = 'MISSING_THEIRS';
        x.matchText = '⚠ Thiếu bên kia';
      } else if (hasDiffKg && hasDiffFuel) {
        x.matchStatus = 'DIFF_BOTH';
        x.matchText = '⚠ Lệch Cân & Dầu';
      } else if (hasDiffKg) {
        x.matchStatus = 'DIFF_WEIGHT';
        x.matchText = '⚠ Lệch Cân';
      } else if (hasDiffFuel) {
        x.matchStatus = 'DIFF_FUEL';
        x.matchText = '⚠ Lệch Dầu';
      } else {
        x.matchStatus = 'MATCH';
        x.matchText = '✔ Khớp 100%';
      }

      // Doanh thu cước khách hàng (nếu gắn vào kỳ tính công ty)
      if (periodId) {
        const lines = this.store.find('BKVC_LINE', (c) => c.period_id === periodId && c.plate_no === x.plateNo && c.is_current !== false);
        const custAmt = lines.reduce((sum, c) => sum + (c.amount || 0), 0);
        x.customerRevenue = custAmt;
        x.profitMargin = custAmt ? custAmt - x.theirRentAmount : null;
      } else {
        x.customerRevenue = null;
        x.profitMargin = null;
      }
    }

    totals.rentUnitPrice = rentPrice;
    totals.fuelUnitPrice = fuelPrice;
    totals.deductFuel = resolvedDeductFuel;
    totals.mineTon = Math.round((totals.mineKg / 1000) * 100) / 100;
    totals.theirTon = Math.round((totals.theirKg / 1000) * 100) / 100;
    totals.diffTon = Math.round(((totals.theirKg - totals.mineKg) / 1000) * 100) / 100;

    totals.mineRentAmount = plateRows.reduce((a, r) => a + r.mineRentAmount, 0);
    totals.theirRentAmount = plateRows.reduce((a, r) => a + r.theirRentAmount, 0);
    totals.diffRentAmount = totals.theirRentAmount - totals.mineRentAmount;

    totals.mineFuelAmount = plateRows.reduce((a, r) => a + r.mineFuelAmount, 0);
    totals.theirFuelAmount = plateRows.reduce((a, r) => a + r.theirFuelAmount, 0);
    totals.diffFuelAmount = totals.theirFuelAmount - totals.mineFuelAmount;

    totals.minePayable = totals.mineRentAmount - (resolvedDeductFuel ? totals.mineFuelAmount : 0);
    totals.theirPayable = totals.theirRentAmount - (resolvedDeductFuel ? totals.theirFuelAmount : 0);
    totals.diffPayable = totals.theirPayable - totals.minePayable;

    if (periodId) {
      totals.customerRevenue = plateRows.reduce((a, r) => a + (r.customerRevenue || 0), 0);
      totals.profitMargin = totals.customerRevenue ? totals.customerRevenue - totals.theirRentAmount : null;
    }

    return {
      source: { fileName: th.fileName, sourceText: th.sourceText, sourceUnit: th.sourceUnit, rows: th.tickets.length, fuelRows: theirFuel.length, unreadable: th.unreadable, duplicates: dupTheirs.map((t) => ({ ticketNo: t.ticket_no, date: t.weigh1_date, plateNo: t.plate_no })) },
      batch: batch ? { batchId: batch.batchId, batchName: batch.batchName, partnerName: batch.partnerName } : null,
      period: period ? { periodId: period.period_id, periodCode: period.period_code } : null,
      dateFrom: from, dateTo: to, allPlates, contractId, periodId, plates: [...plates].sort(), summary, totals, rows, byPlate: plateRows, fuelCompare,
      matched: summary.KHOP.count, problems: rows.length - summary.KHOP.count
    };
  }

  // ─────────────────────────── xuất Excel ───────────────────────────
  async report({ kind, params = {} }) {
    const s = this.store; const company = s.get('DON_VI', s.unitCode);
    const C = (header, key, fmt = 'text') => ({ header, key, fmt });
    if (kind === 'AUDIT') {
      const d = this.audit({ ...params, includeWaiting: params.includeWaiting !== false });
      const sub = `( ${d.dateFrom || d.dateTo ? `Phiếu cân từ ngày ${dmy(d.dateFrom) || '…'} đến ngày ${dmy(d.dateTo) || '…'}` : 'Toàn bộ dữ liệu'} · lập ${dmy(new Date().toISOString().slice(0, 10))} )`;
      return { company, title: 'KIỂM TRA PHIẾU CÂN CHƯA TÍNH VÀO KỲ', subtitle: sub, sheets: [
        { name: 'Tong hop', title: 'TỔNG HỢP', columns: [C('Loại', 'label'), C('Số phiếu', 'count', 'int'), C('KL hàng (KG)', 'kg', 'int')], rows: Object.values(d.summary) },
        { name: 'Phieu chua tinh', title: 'PHIẾU CÂN CHƯA TÍNH VÀO KỲ', columns: [C('STT', 'stt', 'int'), C('Tình trạng', 'kindText'), C('Số phiếu', 'ticketNo'), C('Ngày cân 1', 'date', 'date'), C('Giờ cân 1', 'time'),
          C('Biển số', 'plateNo'), C('Mã tuyến', 'routeCode'), C('KL hàng (KG)', 'netKg', 'int'), C('Chủ xe', 'owner'), C('Hợp đồng', 'contractCode'), C('Bên thuê', 'customer'), C('Kỳ', 'periodCode'), C('Trạng thái kỳ', 'periodStatusText'), C('Lô import', 'importBatch')],
          rows: d.rows.map((r, i) => ({ stt: i + 1, ...r })), totalsRow: { kindText: 'TỔNG CỘNG', ticketNo: `${d.rows.length} phiếu`, netKg: d.rows.reduce((a, r) => a + (r.netKg || 0), 0) } },
        { name: 'Xe 2 hop dong', title: 'XE NẰM TRONG 2 HỢP ĐỒNG CÙNG LÚC', columns: [C('Biển số', 'plateNo'), C('Hợp đồng A', 'contractA'), C('Hiệu lực A', 'rangeA'), C('Hợp đồng B', 'contractB'), C('Hiệu lực B', 'rangeB'), C('Chồng nhau', 'overlap'), C('Cùng bên thuê', 'same')],
          rows: d.overlaps.map((o) => ({ ...o, same: o.sameCustomer ? 'CÓ — nguy cơ tính 2 lần' : 'không' })) },
      ] };
    }
    if (kind === 'COMPARE') {
      const d = await this.compare(params);
      const sub = `( ${d.source.fileName} — ${d.source.sourceText} · phiếu cân từ ngày ${dmy(d.dateFrom)} đến ngày ${dmy(d.dateTo)} )`;
      const sumRows = Object.values(d.summary).map((x) => ({ ...x }));
      sumRows.push({ label: 'TỔNG (phiếu của từng bên)', count: null, mineKg: d.totals.mineKg, theirKg: d.totals.theirKg, _b: true, mineTrips: d.totals.mineTrips, theirTrips: d.totals.theirTrips });
      const sheets = [
        { name: 'Tong hop', title: 'TỔNG HỢP', columns: [C('Kết quả', 'label'), C('Số phiếu', 'count', 'int'), C('Chuyến bên mình', 'mineTrips', 'int'), C('Chuyến bên kia', 'theirTrips', 'int'), C('KG bên mình', 'mineKg', 'int'), C('KG bên kia', 'theirKg', 'int')], rows: sumRows },
        { name: 'Theo xe', title: 'ĐỐI CHIẾU 3 TIÊU CHUẨN THEO XE', columns: [
          C('Biển số', 'plateNo'),
          C('Chuyến (mình)', 'mineTrips', 'int'), C('Chuyến (bên kia)', 'theirTrips', 'int'), C('Chênh chuyến', 'diffTrips', 'int'),
          C('Tấn (mình)', 'mineTon', 'num'), C('Tấn (bên kia)', 'theirTon', 'num'), C('Chênh KG', 'diffKg', 'int'),
          C('Lần dầu (mình)', 'mineFuelRows', 'int'), C('Lần dầu (bên kia)', 'theirFuelRows', 'int'),
          C('Lít dầu (mình)', 'mineFuelLiter', 'num'), C('Lít dầu (bên kia)', 'theirFuelLiter', 'num'), C('Chênh lít', 'diffFuelLiter', 'num'),
          C('Đơn giá thuê', 'rentUnitPrice', 'int'), C('Tiền cước (bên kia)', 'theirRentAmount', 'int'),
          C('Tiền dầu bù trừ', 'theirDeductFuel', 'int'), C('Thực trả bên thuê', 'theirPayable', 'int'),
          C('Tình trạng', 'matchText')
        ], rows: d.byPlate,
          totalsRow: {
            plateNo: 'TỔNG CỘNG',
            mineTrips: d.totals.mineTrips, theirTrips: d.totals.theirTrips, diffTrips: d.totals.theirTrips - d.totals.mineTrips,
            mineTon: d.totals.mineTon, theirTon: d.totals.theirTon, diffKg: d.totals.theirKg - d.totals.mineKg,
            mineFuelLiter: d.fuelCompare.totals.mineLiter, theirFuelLiter: d.fuelCompare.totals.theirLiter, diffFuelLiter: d.fuelCompare.totals.theirLiter - d.fuelCompare.totals.mineLiter,
            theirRentAmount: d.totals.theirRentAmount, theirDeductFuel: d.totals.theirFuelAmount, theirPayable: d.totals.theirPayable, matchText: ''
          }
        },
        { name: 'Chi tiet', title: 'CHI TIẾT TỪNG PHIẾU CÂN', columns: [C('STT', 'stt', 'int'), C('Kết quả', 'kindText'), C('Ngày cân 1', 'date', 'date'), C('Giờ cân 1', 'time'), C('Biển số', 'plateNo'), C('Số phiếu bên mình', 'ticketNo'), C('Số phiếu bên kia', 'theirTicketNo'),
          C('KG bên mình', 'mineKg', 'int'), C('KG bên kia', 'theirKg', 'int'), C('Chênh KG', 'diffKg', 'int'), C('Chi tiết lệch', 'fields'), C('Kỳ (bên mình)', 'periodCode'), C('Trạng thái kỳ', 'periodStatus'), C('Dòng file', 'theirRowNo')],
          rows: d.rows.map((r, i) => ({ stt: i + 1, ...r, fields: r.fields || '' })) },
      ];
      if (d.fuelCompare && d.fuelCompare.rows && d.fuelCompare.rows.length && d.fuelCompare.hasTheirFuel) {
        sheets.push({ name: 'Chi tiet dau nhan', title: 'CHI TIẾT DẦU NHẬN', columns: [C('STT', 'stt', 'int'), C('Kết quả', 'kindText'), C('Ngày nhận', 'date', 'date'), C('Biển số', 'plateNo'), C('Lít (bên mình)', 'mineLiter', 'num'), C('Lít (bên kia)', 'theirLiter', 'num'), C('Chênh lệch (L)', 'diffLiter', 'num'), C('Ghi chú', 'fields')],
          rows: d.fuelCompare.rows.map((r, i) => ({ stt: i + 1, ...r })) });
      }
      return { company, title: 'BẢNG ĐỐI CHIẾU THUÊ VẬN CHUYỂN TOÀN DIỆN (3 TIÊU CHUẨN)', subtitle: sub, sheets };
    }
    throw new AppError('VALIDATION_FAILED', `Loại đối chiếu không hợp lệ: ${kind}`);
  }

  async export({ kind, params = {}, targetPath }) {
    if (!targetPath) throw new AppError('VALIDATION_FAILED', 'Thiếu đường dẫn lưu file');
    const { writeSheets } = require('../reports/xlsxExport');
    const d = await this.report({ kind, params });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await writeSheets(d, targetPath);
    return { path: targetPath, sizeBytes: fs.statSync(targetPath).size };
  }
}

module.exports = { ReconcileService, AUDIT_KIND, CMP_KIND };
