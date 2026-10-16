'use strict';
/**
 * TicketService — sửa phiếu cân (API: tickets.update / previewBulkDescriptive / bulkUpdateDescriptive / get).
 *
 * 3 nhóm cột:
 *   ĐỊNH DANH  ticket_no, weigh1_date, plate_no → không sửa (E_TICKET_IDENTITY): ID phiếu suy ra từ 3 cột này, giống nhau ở mọi bản cài.
 *   CỐT LÕI    giờ cân, ngày/giờ cân 2, cân lần 1/2, KL hàng, mã tuyến, chủ xe → ảnh hưởng số tính:
 *              phiếu ở kỳ ĐÃ XÁC NHẬN / ĐÃ KHÓA → E_TICKET_LOCKED; ở kỳ NHÁP → kỳ đó needs_recalc.
 *   MÔ TẢ      LDĐ, nguồn gốc, khách hàng, kiểu cân, đơn vị VC → không ảnh hưởng số tính, chỉ hiện trên bảng kê:
 *              sửa được cả khi phiếu đã vào kỳ; kỳ đã xác nhận → bắt buộc lý do; kỳ đã khóa → thêm quyền mở khóa.
 * Mọi thay đổi ghi AUDIT_LOG từng phiếu (trước / sau / lý do).
 */
const { AppError, businessError } = require('../../shared/errors');

const IDENTITY = ['ticket_no', 'weigh1_date', 'plate_no'];
const CORE = ['weigh1_time', 'weigh2_date', 'weigh2_time', 'weight1_kg', 'weight2_kg', 'net_kg', 'route_code', 'owner_unit_code'];
const DESCRIPTIVE = ['ldd', 'origin', 'customer', 'weigh_type', 'transport_unit_name'];
const STATUS_TEXT = { NHAP: 'nháp', DA_XAC_NHAN: 'đã xác nhận', DA_KHOA: 'đã khóa' };
const canUnlock = (u) => u && (u.role === 'ADMIN' || u.canUnlock);

/** Dữ liệu gốc trong file của 1 dòng: bản ≥ 1.2.5 lưu mảng giá trị, tên cột lấy từ lô import (header_json); bản cũ lưu sẵn object. */
function expandRaw(store, row) {
  let v; try { v = JSON.parse(row.raw_row_json || '{}'); } catch { return {}; }
  if (!Array.isArray(v)) return v;
  const b = row.import_batch_id && store.get('IMPORT_BATCH', row.import_batch_id);
  let heads = []; try { heads = JSON.parse((b && b.header_json) || '[]'); } catch { heads = []; }
  return Object.fromEntries(v.map((x, i) => [String(heads[i] ?? '').replace(/\s+/g, ' ').trim() || `Cột ${i + 1}`, x]));
}

class TicketService {
  constructor(store) { this.store = store; this.done = new Map(); }

  /** Các kỳ (chưa hủy) đang dùng phiếu: [{period, state}] */
  _usages(ticketIds) {
    const want = new Set(ticketIds); const out = new Map();
    for (const d of this.store.all('TRANSPORT_DETAIL')) {
      if (!d.is_current || d.usage_state === 'RELEASED' || !want.has(d.ticket_id)) continue;
      const p = this.store.get('KY_TINH', d.period_id);
      if (!p || p.status === 'HUY') continue;
      if (!out.has(d.ticket_id)) out.set(d.ticket_id, []);
      out.get(d.ticket_id).push(p);
    }
    return out;
  }

  get({ ticketId }) {
    const t = this.store.get('PHIEU_CAN', ticketId);
    if (!t) throw new AppError('NOT_FOUND', `Không có phiếu ${ticketId}`);
    return { record: t, raw: expandRaw(this.store, t), usages: (this._usages([ticketId]).get(ticketId) || []).map((p) => ({ periodId: p.period_id, periodCode: p.period_code, status: p.status })),
      audit: this.store.find('AUDIT_LOG', (a) => a.entity === 'PHIEU_CAN' && a.entity_id === ticketId) };
  }

  async update({ ticketId, changes = {}, rowVersion, reason = '', user }) {
    const t = this.store.get('PHIEU_CAN', ticketId);
    if (!t) throw new AppError('NOT_FOUND', `Không có phiếu ${ticketId}`);
    const fields = Object.keys(changes).filter((k) => changes[k] !== t[k]);
    if (!fields.length) return { record: t, affectedPeriods: [] };
    const unknown = fields.filter((f) => !IDENTITY.includes(f) && !CORE.includes(f) && !DESCRIPTIVE.includes(f));
    if (unknown.length) throw new AppError('VALIDATION_FAILED', `Không sửa được cột: ${unknown.join(', ')}`);
    if (fields.some((f) => IDENTITY.includes(f))) throw businessError('E_TICKET_IDENTITY', 'Không sửa số phiếu / ngày cân 1 / biển số (định danh phiếu) — xóa mềm rồi nhập lại');
    for (const f of ['weight1_kg', 'weight2_kg', 'net_kg']) if (f in changes && !(Number.isFinite(changes[f]) && changes[f] >= 0)) throw new AppError('VALIDATION_FAILED', `${f} phải là số ≥ 0`);
    if ('route_code' in changes && !this.store.get('TUYEN_VC', changes.route_code)) throw new AppError('VALIDATION_FAILED', `Mã tuyến ${changes.route_code} không có trong danh mục`);

    const periods = this._usages([ticketId]).get(ticketId) || [];
    const core = fields.filter((f) => CORE.includes(f));
    const hard = periods.find((p) => p.status !== 'NHAP');
    if (core.length && hard) {
      throw businessError('E_TICKET_LOCKED', `Phiếu ${t.ticket_no} nằm trong kỳ ${hard.period_code} ${STATUS_TEXT[hard.status]} — không sửa được ${core.join(', ')}`);
    }
    this._guardDescriptive(periods, reason, user);
    const drafts = core.length ? periods.filter((p) => p.status === 'NHAP').map((p) => p.period_id) : [];
    return this.store.transaction((tx) => {
      const patch = Object.fromEntries(fields.map((f) => [f, changes[f]]));
      const { before, after } = tx.update('PHIEU_CAN', ticketId, patch, { expectedRowVersion: rowVersion });
      for (const pid of drafts) tx.update('KY_TINH', pid, { needs_recalc: true });
      tx.audit('UPDATE', 'PHIEU_CAN', ticketId, pick(before, fields), pick(after, fields), { reason });
      return { record: after, affectedPeriods: drafts };
    }, { user: user.username });
  }

  _guardDescriptive(periods, reason, user) {
    if (periods.some((p) => p.status !== 'NHAP') && !reason) throw new AppError('VALIDATION_FAILED', 'Phiếu đã ở kỳ đã xác nhận/khóa — phải nhập lý do');
    if (periods.some((p) => p.status === 'DA_KHOA') && !canUnlock(user)) throw new AppError('FORBIDDEN', 'Phiếu ở kỳ đã khóa — chỉ ADMIN hoặc người có quyền mở khóa được sửa');
  }

  _match({ field, fromValue, dateFrom, dateTo }) {
    if (!DESCRIPTIVE.includes(field)) throw new AppError('VALIDATION_FAILED', `Sửa hàng loạt chỉ cho cột mô tả: ${DESCRIPTIVE.join(', ')}`);
    return this.store.find('PHIEU_CAN', (t) => !t.is_deleted && (t[field] ?? '') === fromValue
      && (!dateFrom || t.weigh1_date >= dateFrom) && (!dateTo || t.weigh1_date <= dateTo));
  }

  previewBulkDescriptive({ field, fromValue, toValue, dateFrom = '', dateTo = '' }) {
    if (fromValue === toValue) throw new AppError('VALIDATION_FAILED', 'Giá trị mới trùng giá trị cũ');
    const rows = this._match({ field, fromValue, dateFrom, dateTo });
    const use = this._usages(rows.map((t) => t.ticket_id));
    const ps = new Map(); let inConfirmed = 0; let inLocked = 0;
    for (const t of rows) {
      const list = use.get(t.ticket_id) || [];
      if (list.some((p) => p.status === 'DA_XAC_NHAN')) inConfirmed += 1;
      if (list.some((p) => p.status === 'DA_KHOA')) inLocked += 1;
      for (const p of list) ps.set(p.period_id, p);
    }
    return { field, fromValue, toValue, count: rows.length, kg: rows.reduce((a, t) => a + t.net_kg, 0), inConfirmed, inLocked,
      periods: [...ps.values()].map((p) => ({ periodCode: p.period_code, status: p.status })),
      sample: rows.slice(0, 5).map((t) => ({ ticketId: t.ticket_id, ticketNo: t.ticket_no, weigh1Date: t.weigh1_date, plateNo: t.plate_no, value: t[field] })) };
  }

  async bulkUpdateDescriptive({ field, fromValue, toValue, dateFrom = '', dateTo = '', reason, clientRequestId, user }) {
    if (!clientRequestId) throw new AppError('VALIDATION_FAILED', 'Thiếu clientRequestId');
    if (this.done.has(clientRequestId)) return this.done.get(clientRequestId);
    if (!reason) throw new AppError('VALIDATION_FAILED', 'Sửa hàng loạt phải nhập lý do');
    const pv = this.previewBulkDescriptive({ field, fromValue, toValue, dateFrom, dateTo });
    if (pv.inLocked && !canUnlock(user)) throw new AppError('FORBIDDEN', `${pv.inLocked} phiếu ở kỳ đã khóa — chỉ ADMIN hoặc người có quyền mở khóa được sửa`);
    const rows = this._match({ field, fromValue, dateFrom, dateTo });
    const res = await this.store.transaction((tx) => {
      for (const t of rows) {
        const { before, after } = tx.update('PHIEU_CAN', t.ticket_id, { [field]: toValue });
        tx.audit('UPDATE', 'PHIEU_CAN', t.ticket_id, { [field]: before[field] }, { [field]: after[field] }, { reason });
      }
      tx.audit('BULK_UPDATE', 'PHIEU_CAN', `${field}:${fromValue}`, { [field]: fromValue, count: rows.length }, { [field]: toValue, count: rows.length }, { reason });
      return { updated: rows.length, periods: pv.periods };
    }, { user: user.username });
    this.done.set(clientRequestId, res);
    return res;
  }
}

const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));

module.exports = { expandRaw, TicketService, IDENTITY, CORE, DESCRIPTIVE };
