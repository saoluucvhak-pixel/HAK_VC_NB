'use strict';
/** Ghi nhật ký mọi thao tác quan trọng (MASTER_PROMPT XXVIII). */
const j = (v) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));

class AuditService {
  constructor(db, { user = null } = {}) { this.db = db; this.user = user; }
  log(action, entity, entityId, oldValue, newValue, note) {
    this.db.run(
      'INSERT INTO audit_log(action, entity, entity_id, old_value, new_value, note, user_name) VALUES (?,?,?,?,?,?,?)',
      [action, entity, entityId ?? null, j(oldValue), j(newValue), note ?? null, this.user]
    );
  }
  list({ entity, entityId, action, limit = 200, offset = 0 } = {}) {
    const w = []; const p = [];
    if (entity) { w.push('entity = ?'); p.push(entity); }
    if (entityId) { w.push('entity_id = ?'); p.push(entityId); }
    if (action) { w.push('action = ?'); p.push(action); }
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    return {
      total: this.db.get(`SELECT COUNT(*) n FROM audit_log ${where}`, p).n,
      rows: this.db.all(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, p),
    };
  }
}

module.exports = { AuditService };
