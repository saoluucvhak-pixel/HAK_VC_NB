'use strict';
/**
 * Chuẩn hóa dữ liệu của ĐỐI TÁC (phiếu cân, dòng dầu) — DÙNG CHUNG cho SubcontractService (đường "đợt đã nạp") và ReconcileService
 * (đường đọc file trực tiếp) để cùng một file ra cùng một kết quả. Trước đây hai nơi tự chuẩn hóa riêng: file .json đọc trực tiếp
 * chỉ lấy `receipt_date ?? issue_date ?? date` nên mất ngày `receive_date` (cột thật của GIAO_NHAN_DAU) → dầu về 0 dòng.
 */
const num = (v) => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(v));
const str = (v) => (v == null ? '' : String(v));

/** Ngày của một dòng dầu: receive_date (cột thật) trước, rồi các tên cũ / tên của file tự lập. */
const fuelDate = (f) => str(f.receive_date ?? f.receipt_date ?? f.issue_date ?? f.date ?? '').slice(0, 10);

function normTicket(t, idx) {
  return {
    ticket_no: str(t.ticket_no ?? t.ticketNo ?? `PH-${idx + 1}`).trim(),
    weigh1_date: str(t.weigh1_date ?? t.date ?? t.weighDate ?? '').slice(0, 10),
    weigh1_time: str(t.weigh1_time ?? t.time ?? t.weighTime ?? '').slice(0, 8),
    weigh2_date: str(t.weigh2_date ?? t.weigh2Date ?? '').slice(0, 10),
    weigh2_time: str(t.weigh2_time ?? t.weigh2Time ?? '').slice(0, 8),
    plate_no: str(t.plate_no ?? t.plateNo ?? '').trim().toUpperCase(),
    weight1_kg: t.weight1_kg != null ? num(t.weight1_kg) : null,
    weight2_kg: t.weight2_kg != null ? num(t.weight2_kg) : null,
    net_kg: num(t.net_kg ?? t.netKg ?? t.weightKg ?? 0) || 0,
    route_code: str(t.route_code ?? t.routeCode ?? '').trim(),
    owner_unit_code: str(t.owner_unit_code ?? t.owner ?? '').trim(),
    _rowNo: t._rowNo || idx + 1,
  };
}

function normFuel(f, idx) {
  const d = fuelDate(f);
  return {
    receipt_no: str(f.receipt_no ?? f.receiptNo ?? `D-${idx + 1}`).trim(),
    receipt_date: d,
    receive_date: d,
    plate_no: str(f.plate_no ?? f.plateNo ?? '').trim().toUpperCase(),
    qty_liter: num(f.qty_liter ?? f.qtyLiter ?? f.liter ?? f.liters ?? 0) || 0,
    note: str(f.note).trim(),
  };
}

const normTickets = (list) => (list || []).filter((t) => !t.is_deleted).map(normTicket).filter((t) => t.ticket_no && t.plate_no);
const normFuels = (list) => (list || []).filter((f) => !f.is_deleted).map(normFuel).filter((f) => f.plate_no);

/**
 * Lấy phiếu cân + dầu + tên đối tác từ nội dung JSON đã giải mã (gói .dgvc / .json / mảng phiếu / file đợt đã lưu).
 * Trả { tickets, fuelRows, partner, packageHeader } — CHƯA chuẩn hóa (gọi normTickets / normFuels).
 */
function extractFromObj(data) {
  if (!data) return { tickets: [], fuelRows: [], partner: '', header: null };
  if (Array.isArray(data)) return { tickets: data, fuelRows: [], partner: '', header: null };
  if (data.tables) {
    return { tickets: (data.tables.PHIEU_CAN || data.tables.tickets || []).filter((t) => !t.is_deleted),
      fuelRows: (data.tables.GIAO_NHAN_DAU || data.tables.fuel || []).filter((f) => !f.is_deleted),
      partner: (data.header && data.header.sourceUnitCode) || '', header: data.header || null };
  }
  return { tickets: (data.tickets || data.PHIEU_CAN || []).filter((t) => !t.is_deleted),
    fuelRows: (data.fuel || data.fuelRows || data.GIAO_NHAN_DAU || []).filter((f) => !f.is_deleted),
    partner: data.partnerName || data.partner || data.sourceUnit || '', header: null };
}

module.exports = { num, fuelDate, normTicket, normFuel, normTickets, normFuels, extractFromObj };
