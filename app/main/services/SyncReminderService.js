'use strict';
/**
 * Nhắc sửa danh mục ở các nhà máy còn lại (chốt 25/09/2026: bản cài dùng cho MỌI nhà máy, không riêng HAKQN).
 *  - Bất kỳ bản cài nào sửa danh mục chung (tuyến, giá, đơn vị, xe, hợp đồng) → 1 dòng SYNC_REMINDER
 *    với danh sách nhà máy cần sửa giống = CONFIG SYNC_TARGET_UNITS trừ đơn vị của bản cài.
 *  - Xong cho 1 nhà máy khi: xuất gói DANH_MUC gửi nhà máy đó (tự đánh dấu) hoặc người dùng bấm "Đã sửa ở …" (sửa tay).
 *  - Dashboard hiện các nhắc còn mở.
 */
const { AppError } = require('../../shared/errors');

function targets(store) {
  const row = store.all('CONFIG').find((c) => c.config_key === 'SYNC_TARGET_UNITS');
  const list = String((row && row.config_value) || 'HAK;HAKQN;DH;CNHAK').split(/[;,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return [...new Set(list)].filter((u) => u !== store.unitCode && store.get('DON_VI', u));
}

/** Gọi TRONG transaction của thao tác sửa danh mục. Trả về câu nhắc để hiện cho người dùng. */
function remindTx(tx, store, { entity, entityId, action, summary }) {
  const t = targets(store);
  if (!t.length) return null;
  tx.insert('SYNC_REMINDER', { reminder_id: tx.nextId('SR', 5), entity, entity_id: String(entityId), action, summary, source_unit_code: store.unitCode,
    targets_json: JSON.stringify(t), done_json: '{}', status: 'OPEN', created_at: tx.now, created_by: tx.user || '', updated_at: '' });
  return { code: 'I_SYNC_REMINDER', level: 'INFO', message: `Đã lưu. Nhớ sửa giống ở các nhà máy còn lại: ${t.join(', ')} — gửi gói danh mục hoặc sửa tay rồi đánh dấu "đã sửa"`, targets: t };
}

class SyncReminderService {
  constructor(store) { this.store = store; }

  list({ status = 'OPEN' } = {}) {
    const items = this.store.find('SYNC_REMINDER', (r) => !status || r.status === status).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(view);
    const pending = {};
    for (const r of items) if (r.status === 'OPEN') for (const u of r.pendingUnits) pending[u] = (pending[u] || 0) + 1;
    return { items, total: items.length, pendingByUnit: pending };
  }

  async markDone({ reminderIds, unitCode, how = 'MANUAL', note = '', user }) {
    const u = String(unitCode || '').toUpperCase();
    if (!u) throw new AppError('VALIDATION_FAILED', 'Chọn nhà máy đã sửa');
    const ids = reminderIds && reminderIds.length ? reminderIds : this.store.find('SYNC_REMINDER', (r) => r.status === 'OPEN').map((r) => r.reminder_id);
    return this.store.transaction((tx) => markTx(tx, ids, u, how, note), { user: user.username });
  }
}

/** Đánh dấu nhà máy `unit` đã nhận các thay đổi `ids` (dùng cả khi xuất gói DANH_MUC). */
function markTx(tx, ids, unit, how, note = '') {
  let n = 0;
  for (const id of ids) {
    const r = tx.get('SYNC_REMINDER', id);
    if (!r || r.status !== 'OPEN') continue;
    const t = JSON.parse(r.targets_json); if (!t.includes(unit)) continue;
    const done = JSON.parse(r.done_json || '{}'); if (done[unit]) continue;
    done[unit] = { at: tx.now, by: tx.user || '', how, note };
    tx.update('SYNC_REMINDER', id, { done_json: JSON.stringify(done), status: t.every((x) => done[x]) ? 'DONE' : 'OPEN', updated_at: tx.now });
    n++;
  }
  return { updated: n };
}

function view(r) {
  const t = JSON.parse(r.targets_json); const done = JSON.parse(r.done_json || '{}');
  return { reminderId: r.reminder_id, entity: r.entity, entityId: r.entity_id, action: r.action, summary: r.summary, sourceUnitCode: r.source_unit_code,
    targets: t, done, pendingUnits: t.filter((u) => !done[u]), status: r.status, createdAt: r.created_at, createdBy: r.created_by };
}

module.exports = { SyncReminderService, remindTx, markTx, syncTargets: targets };
