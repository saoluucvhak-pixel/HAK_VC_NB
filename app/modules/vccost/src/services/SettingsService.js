'use strict';
class SettingsService {
  constructor(db, audit) { this.db = db; this.audit = audit; }
  get(key, dflt = null) {
    const r = this.db.get('SELECT value_json FROM settings WHERE key = ?', [key]);
    return r ? JSON.parse(r.value_json) : dflt;
  }
  all() { return Object.fromEntries(this.db.all('SELECT key, value_json FROM settings').map((r) => [r.key, JSON.parse(r.value_json)])); }
  set(key, value) {
    const old = this.get(key);
    this.db.run(`INSERT INTO settings(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%S','now','localtime')`, [key, JSON.stringify(value)]);
    if (this.audit) this.audit.log('SETTING', 'settings', null, { [key]: old }, { [key]: value });
  }
}
module.exports = { SettingsService };
