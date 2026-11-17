'use strict';
/** Chạy TRONG Electron (không cửa sổ): kho SQLite hoạt động trên runtime Electron đóng gói (node:sqlite của Electron, WAL, backup, tiếng Việt). Thoát mã 0 nếu đạt. */
const { app } = require('electron');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  try {
    const { SqliteStore } = require('../main/repo/SqliteStore');
    const { newStore } = require('../main/repo/createStore');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-electron-sqlite-'));
    SqliteStore.create(dir, { installCode: 'DH', unitCode: 'DH', installId: 'INS-ELECTRON' });
    const s = newStore(dir, {}, 'sqlite').open();
    await s.transaction((tx) => { tx.audit('ELECTRON', 'X', 'Đà Nẵng', null, { tiền: 62985.46213344446 }, { reason: 'Đ' }); }, { user: 'điện tử' });
    const fp = s.fingerprint().sha256; const dv = s.dataVersion;
    // bản sao nhất quán khi đang mở (WAL): backup() của node:sqlite
    const { backup } = require('node:sqlite'); const dest = path.join(dir, 'copy.sqlite');
    if (typeof backup === 'function') { await backup(s.db, dest); assert.ok(fs.statSync(dest).size > 0); }
    s.close();
    const s2 = newStore(dir, {}, 'sqlite').open();
    assert.equal(s2.dataVersion, dv); assert.equal(s2.fingerprint().sha256, fp);
    const row = s2.find('AUDIT_LOG', (r) => r.action === 'ELECTRON')[0];
    assert.equal(row.entity_id, 'Đà Nẵng'); assert.equal(JSON.parse(row.after_json).tiền, 62985.46213344446);
    s2.close();
    console.log(`ELECTRON SQLITE OK — electron ${process.versions.electron} · node ${process.versions.node} · sqlite ${new (require('node:sqlite').DatabaseSync)(':memory:').prepare('select sqlite_version() v').get().v}`);
    app.exit(0);
  } catch (e) { console.error('ELECTRON SQLITE FAIL', e); app.exit(1); }
});
