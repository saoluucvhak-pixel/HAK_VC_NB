'use strict';
/**
 * RecordService — thao tác trên phiếu cân / dòng dầu đã nhập (API tickets.softDelete / ackFlags, fuel.saveRows / update / softDelete / ackFlags).
 * Luật chung: dữ liệu đang ở kỳ ĐÃ XÁC NHẬN / ĐÃ KHÓA → không sửa số liệu, không xóa; ở kỳ NHÁP → kỳ đó "cần tính lại".
 * Xóa = xóa mềm (is_deleted), bắt lý do. Mọi thao tác ghi AUDIT_LOG.
 */
const { AppError, businessError } = require('../../shared/errors');
const { issue } = require('../engine/issues');

const FUEL_EDITABLE = ['receive_date', 'route_code', 'fuel_vehicle_code', 'uom', 'qty_liter', 'fuel_price_excl_vat', 'purchase_date', 'giver_unit_code', 'fuel_depot'];

class RecordService {
  constructor(store, { importService }) { this.store = store; this.imp = importService; this.done = new Map(); }

  _periodsOf(detailTable, idField, id) {
    return this.store.find(detailTable, (d) => d[idField] === id && d.is_current && d.usage_state !== 'RELEASED')
      .map((d) => this.store.get('KY_TINH', d.period_id)).filter((p) => p && p.status !== 'HUY');
  }
  _guard(periods, what) {
    const hard = periods.find((p) => p.status !== 'NHAP');
    if (hard) throw businessError('E_TICKET_LOCKED', `${what} nằm trong kỳ ${hard.period_code} đã xác nhận/khóa — không sửa / xóa được`);
    return periods.map((p) => p.period_id);
  }

  async _softDelete(table, pk, detailTable, id, reason, user, label) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Xóa phải nhập lý do');
    const r = this.store.get(table, id); if (!r || r.is_deleted) throw new AppError('NOT_FOUND', `Không có ${label} ${id}`);
    const drafts = this._guard(this._periodsOf(detailTable, pk, id), `${label} ${id}`);
    return this.store.transaction((tx) => {
      const { after } = tx.update(table, id, { is_deleted: true });
      for (const p of drafts) tx.update('KY_TINH', p, { needs_recalc: true });
      tx.audit('DELETE', table, id, { is_deleted: false }, { is_deleted: true }, { reason });
      return { record: after, affectedPeriods: drafts };
    }, { user: user.username });
  }
  async _ack(table, ids, note, user) {
    if (!note) throw new AppError('VALIDATION_FAILED', 'Ghi chú lý do giữ nguyên dữ liệu');
    return this.store.transaction((tx) => {
      let n = 0;
      for (const id of ids) { const r = tx.get(table, id); if (!r || !r.validation_flags || r.flags_ack) continue; tx.update(table, id, { flags_ack: true, flags_ack_note: note }); tx.audit('ACK_FLAGS', table, id, { flags: r.validation_flags }, { note }); n++; }
      return { updated: n };
    }, { user: user.username });
  }

  /** Xóa nhiều phiếu cân 1 lần (vd file import nhầm). Phiếu ở kỳ đã xác nhận / khóa: bỏ qua, báo lại. */
  async softDeleteTickets({ ticketIds = [], reason, user }) {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Xóa phải nhập lý do');
    const ok = []; const skipped = []; const drafts = new Set();
    for (const id of [...new Set(ticketIds)]) {
      const t = this.store.get('PHIEU_CAN', id); if (!t || t.is_deleted) continue;
      const ps = this._periodsOf('TRANSPORT_DETAIL', 'ticket_id', id);
      const hard = ps.find((p) => p.status !== 'NHAP');
      if (hard) { skipped.push({ ticketId: id, ticketNo: t.ticket_no, periodCode: hard.period_code }); continue; }
      ps.forEach((p) => drafts.add(p.period_id)); ok.push(id);
    }
    if (!ok.length) return { deleted: 0, skipped, affectedPeriods: [] };
    await this.store.transaction((tx) => {
      for (const id of ok) { tx.update('PHIEU_CAN', id, { is_deleted: true }); tx.audit('DELETE', 'PHIEU_CAN', id, { is_deleted: false }, { is_deleted: true }, { reason }); }
      for (const p of drafts) tx.update('KY_TINH', p, { needs_recalc: true });
    }, { user: user.username });
    return { deleted: ok.length, skipped, affectedPeriods: [...drafts] };
  }
  /** Khôi phục phiếu đã xóa. */
  async restoreTicket({ ticketId, reason = '', user }) {
    const t = this.store.get('PHIEU_CAN', ticketId); if (!t || !t.is_deleted) throw new AppError('NOT_FOUND', `Không có phiếu đã xóa ${ticketId}`);
    return this.store.transaction((tx) => {
      const { after } = tx.update('PHIEU_CAN', ticketId, { is_deleted: false });
      tx.audit('RESTORE', 'PHIEU_CAN', ticketId, { is_deleted: true }, { is_deleted: false }, { reason });
      return { record: after };
    }, { user: user.username });
  }
  softDeleteTicket({ ticketId, reason, user }) { return this._softDelete('PHIEU_CAN', 'ticket_id', 'TRANSPORT_DETAIL', ticketId, reason, user, 'phiếu cân'); }
  ackTicketFlags({ ticketIds, note, user }) { return this._ack('PHIEU_CAN', ticketIds, note, user); }
  softDeleteFuel({ receiptId, reason, user }) { return this._softDelete('GIAO_NHAN_DAU', 'receipt_id', 'FUEL_DETAIL', receiptId, reason, user, 'dòng dầu'); }
  ackFuelFlags({ receiptIds, note, user }) { return this._ack('GIAO_NHAN_DAU', receiptIds, note, user); }

  async updateFuel({ receiptId, changes = {}, rowVersion, reason = '', user }) {
    const r = this.store.get('GIAO_NHAN_DAU', receiptId); if (!r || r.is_deleted) throw new AppError('NOT_FOUND', `Không có dòng dầu ${receiptId}`);
    const unknown = Object.keys(changes).filter((k) => !FUEL_EDITABLE.includes(k));
    if (unknown.length) throw new AppError('VALIDATION_FAILED', `Không sửa được cột: ${unknown.join(', ')}`);
    const merged = { ...r, ...changes };
    const v = this._validateFuel([merged], r.contract_id)[0];
    const errs = v.issues.filter((i) => i.level === 'ERROR'); if (errs.length) throw new AppError('VALIDATION_FAILED', errs.map((i) => i.message).join('; '));
    const patch = {}; for (const k of [...FUEL_EDITABLE, 'plate_no', 'owner_unit_code']) if ((v.record[k] ?? '') !== (r[k] ?? '')) patch[k] = v.record[k];
    if (!Object.keys(patch).length) return { record: r, affectedPeriods: [] };
    // chỉ sửa kho nhận dầu (mô tả, không ảnh hưởng số tính) → sửa được cả khi dòng dầu đã ở kỳ đã chốt
    const descOnly = Object.keys(patch).every((k) => k === 'fuel_depot');
    const drafts = descOnly ? [] : this._guard(this._periodsOf('FUEL_DETAIL', 'receipt_id', receiptId), `Dòng dầu ${receiptId}`);
    return this.store.transaction((tx) => {
      const { before, after } = tx.update('GIAO_NHAN_DAU', receiptId, { ...patch, validation_flags: v.record.validation_flags }, { expectedRowVersion: rowVersion });
      for (const p of drafts) tx.update('KY_TINH', p, { needs_recalc: true });
      tx.audit('UPDATE', 'GIAO_NHAN_DAU', receiptId, Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])), patch, { reason });
      return { record: after, affectedPeriods: drafts };
    }, { user: user.username });
  }

  /** Kiểm các dòng dầu bằng đúng bộ kiểm tra của import (một nguồn luật). */
  _validateFuel(rows, contractId) {
    const headers = FUEL_EDITABLE;
    const st = { importType: 'GIAO_NHAN_DAU', contractId, headers, colOf: Object.fromEntries(headers.map((h, i) => [h, i])), fixed: {},
      dataRows: rows.map((r, i) => ({ rowNo: i + 1, cells: headers.map((h) => (r[h] === undefined ? null : r[h])) })) };
    return this.imp._validate(st).rows;
  }

  /** Nhập tay nhiều dòng dầu cho 1 hợp đồng — cùng luật kiểm như import; dòng lỗi → trả lỗi, không ghi gì. */
  async saveFuelRows({ contractId, rows = [], acceptWarnings = false, clientRequestId, user }) {
    if (!clientRequestId) throw new AppError('VALIDATION_FAILED', 'Thiếu clientRequestId');
    if (this.done.has(clientRequestId)) return this.done.get(clientRequestId);
    this.imp._checkFuelContract(contractId);
    if (!rows.length) throw new AppError('VALIDATION_FAILED', 'Chưa có dòng nào');
    const checked = this._validateFuel(rows.map((r) => ({ uom: 'LÍT', ...r })), contractId);
    const errs = checked.filter((r) => r.status === 'ERROR');
    if (errs.length) throw businessError('E_IMPORT_HAS_ERRORS', `Còn ${errs.length} dòng lỗi`, { rows: errs.map((r) => ({ rowNo: r.rowNo, issues: r.issues })) });
    if (!acceptWarnings && checked.some((r) => r.status === 'WARNING')) {
      throw new AppError('VALIDATION_FAILED', 'Có dòng cảnh báo — cần xác nhận "chấp nhận cảnh báo"', { rows: checked.filter((r) => r.status === 'WARNING').map((r) => ({ rowNo: r.rowNo, issues: r.issues })) });
    }
    const out = await this.store.transaction((tx) => {
      const ids = [];
      for (const r of checked.filter((x) => x.status !== 'DUPLICATE')) {
        const rec = { ...r.record, receipt_id: tx.nextId('GD'), import_batch_id: '', raw_row_json: JSON.stringify({ nhap_tay: true, ...rows[r.rowNo - 1] }) };
        tx.insert('GIAO_NHAN_DAU', rec); ids.push(rec.receipt_id);
      }
      tx.audit('CREATE', 'GIAO_NHAN_DAU', contractId, null, { manual: true, inserted: ids.length, ids });
      return { inserted: ids.length, insertedIds: ids, duplicates: checked.filter((x) => x.status === 'DUPLICATE').length, warnings: checked.filter((x) => x.status === 'WARNING').map((x) => ({ rowNo: x.rowNo, issues: x.issues })) };
    }, { user: user.username });
    this.done.set(clientRequestId, out);
    return out;
  }
}

module.exports = { RecordService, _issue: issue };
