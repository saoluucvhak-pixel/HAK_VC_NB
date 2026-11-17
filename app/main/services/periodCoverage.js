'use strict';
/**
 * Phạm vi kỳ tính của bản cài (bên vận chuyển): phiếu cân nào lẽ ra thuộc kỳ nào.
 * Dùng chung cho Đối chiếu dữ liệu (reconcile.audit) và cảnh báo "phiếu cân về muộn" khi import.
 * Quy tắc chọn phiếu giống Engine (period.js): xe thuộc hợp đồng tại ngày cân 1, ngày kỳ (PERIOD_DATE_FIELD) trong [Từ ngày, Đến ngày],
 * kỳ có lọc tuyến thì phải đúng tuyến.
 */
const effectiveAt = (row, d) => row.effective_from <= d && (!row.effective_to || row.effective_to >= d);
const CLOSED = new Set(['DA_XAC_NHAN', 'DA_KHOA']);

function buildCoverage(store) {
  const cfg = Object.fromEntries(store.all('CONFIG').map((c) => [c.config_key, c.config_value]));
  const dateField = cfg.PERIOD_DATE_FIELD === 'WEIGH2_DATE' ? 'weigh2_date' : 'weigh1_date';
  const contracts = store.all('HOP_DONG').filter((c) => c.carrier_unit_code === store.unitCode);
  const byId = new Map(contracts.map((c) => [c.contract_id, c]));
  const cv = store.all('HOP_DONG_XE').filter((v) => byId.has(v.contract_id));
  const periods = store.all('KY_TINH').filter((p) => p.origin === 'LOCAL' && p.status !== 'HUY' && byId.has(p.contract_id));
  const lastClosedEnd = new Map();
  for (const p of periods) if (CLOSED.has(p.status) && (lastClosedEnd.get(p.contract_id) || '') < p.date_to) lastClosedEnd.set(p.contract_id, p.date_to);
  const dateOf = (t) => t[dateField] || t.weigh1_date;
  const contractsOf = (plate, d) => [...new Set(cv.filter((v) => v.plate_no === plate && effectiveAt(v, d)).map((v) => v.contract_id))].map((id) => byId.get(id));
  const periodsFor = (t) => {
    const d = dateOf(t);
    return contractsOf(t.plate_no, t.weigh1_date).map((c) => ({
      contract: c,
      periods: periods.filter((p) => p.contract_id === c.contract_id && d >= p.date_from && d <= p.date_to && (!p.route_filter || p.route_filter === t.route_code)),
      lastClosedEnd: lastClosedEnd.get(c.contract_id) || '',
    }));
  };
  return { contracts, byId, cv, periods, dateOf, contractsOf, periodsFor, CLOSED };
}

/** Kỳ đang dùng phiếu (chưa hủy): Map ticket_id → [KY_TINH] */
function ticketUsage(store) {
  const out = new Map();
  for (const d of store.all('TRANSPORT_DETAIL')) {
    if (!d.is_current || d.usage_state === 'RELEASED') continue;
    const p = store.get('KY_TINH', d.period_id);
    if (!p || p.status === 'HUY') continue;
    if (!out.has(d.ticket_id)) out.set(d.ticket_id, []);
    out.get(d.ticket_id).push(p);
  }
  return out;
}

/** Phiếu người dùng chủ động bỏ khỏi kỳ (lưu trong CALC_RUN.summary_json của lần tính hiện hành) */
function excludedTickets(store) {
  const out = new Map();
  for (const p of store.all('KY_TINH')) {
    if (!p.current_run_id || p.status === 'HUY') continue;
    const run = store.get('CALC_RUN', p.current_run_id);
    if (!run || !run.summary_json) continue;
    let s; try { s = JSON.parse(run.summary_json); } catch { continue; }
    for (const id of s.excludeTicketIds || []) out.set(id, p);
  }
  return out;
}

/** Phiếu / dòng dầu người dùng đã bỏ khỏi kỳ (lần tính hiện hành): Map period_id → Set(id). kind = 'excludeTicketIds' | 'excludeReceiptIds' */
function excludedIds(store, kind) {
  const out = new Map();
  for (const p of store.all('KY_TINH')) {
    if (!p.current_run_id || p.status === 'HUY') continue;
    const run = store.get('CALC_RUN', p.current_run_id);
    if (!run || !run.summary_json) continue;
    let s; try { s = JSON.parse(run.summary_json); } catch { continue; }
    if ((s[kind] || []).length) out.set(p.period_id, new Set(s[kind]));
  }
  return out;
}

/**
 * Kỳ NHÁP (của bản cài này) mà 1 phiếu cân / dòng dầu thuộc phạm vi — dùng khi phiếu / dầu MỚI, KHÔI PHỤC hoặc ĐỔI số liệu:
 * kỳ đã tính trước đó không có (hoặc có số cũ) → phải đánh dấu "cần tính lại", nếu không có thể xác nhận một kỳ thiếu dữ liệu.
 * Quy tắc phạm vi giống Engine: phiếu = xe thuộc hợp đồng tại ngày cân 1 + ngày kỳ trong [Từ, Đến] + đúng tuyến (nếu kỳ lọc tuyến);
 * dầu = "tính hết bảng kê" của hợp đồng (+ đúng tuyến nếu kỳ lọc tuyến), không phụ thuộc ngày. Bỏ qua dòng người dùng đã chủ động bỏ khỏi kỳ.
 */
function draftFinder(store) {
  const cov = buildCoverage(store);
  const exT = excludedIds(store, 'excludeTicketIds'); const exR = excludedIds(store, 'excludeReceiptIds');
  return {
    forTicket(t) {
      if (!t || t.is_deleted) return [];
      const ids = new Set();
      for (const x of cov.periodsFor(t)) for (const p of x.periods) if (p.status === 'NHAP' && !(exT.get(p.period_id) || new Set()).has(t.ticket_id)) ids.add(p.period_id);
      return [...ids];
    },
    forFuel(r) {
      if (!r || r.is_deleted) return [];
      return cov.periods.filter((p) => p.status === 'NHAP' && p.contract_id === r.contract_id && (!p.route_filter || p.route_filter === r.route_code)
        && !(exR.get(p.period_id) || new Set()).has(r.receipt_id)).map((p) => p.period_id);
    },
  };
}

/**
 * Phiếu cân / dòng dầu HỢP LỆ trong phạm vi của kỳ nháp `p` nhưng CHƯA nằm trong kết quả tính hiện hành (nhập / khôi phục sau lần tính)
 * và không bị kỳ khác giữ. Dùng làm cổng chặn "Xác nhận kỳ": kỳ còn thiếu thì phải tính lại.
 */
function missingSources(store, p) {
  const cov = buildCoverage(store);
  const exT = (excludedIds(store, 'excludeTicketIds').get(p.period_id)) || new Set();
  const exR = (excludedIds(store, 'excludeReceiptIds').get(p.period_id)) || new Set();
  const myT = new Set(); const otherT = new Set();
  for (const d of store.all('TRANSPORT_DETAIL')) { if (!d.is_current || d.usage_state === 'RELEASED') continue; (d.period_id === p.period_id ? myT : otherT).add(d.ticket_id); }
  const myF = new Set(); const otherF = new Set();
  for (const d of store.all('FUEL_DETAIL')) { if (!d.is_current || d.usage_state === 'RELEASED') continue; (d.period_id === p.period_id ? myF : otherF).add(d.receipt_id); }
  const tickets = store.all('PHIEU_CAN').filter((t) => !t.is_deleted && !exT.has(t.ticket_id) && !myT.has(t.ticket_id) && !otherT.has(t.ticket_id)
    && cov.periodsFor(t).some((x) => x.periods.some((pp) => pp.period_id === p.period_id)));
  const fuel = store.all('GIAO_NHAN_DAU').filter((r) => !r.is_deleted && r.contract_id === p.contract_id && (!p.route_filter || p.route_filter === r.route_code)
    && !exR.has(r.receipt_id) && !myF.has(r.receipt_id) && !otherF.has(r.receipt_id));
  return { tickets, fuel };
}

module.exports = { buildCoverage, ticketUsage, excludedTickets, excludedIds, draftFinder, missingSources, effectiveAt, CLOSED };
