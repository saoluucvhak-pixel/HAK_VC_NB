'use strict';
/**
 * Nghiệm thu quy trình SAO LƯU trên kho SQLite (mặc định): tự động hằng ngày / hằng tháng, xoay vòng giữ N bản, bản an toàn giữ 10,
 * chép ra USB (thiếu USB không làm hỏng sao lưu), cảnh báo quá 7 ngày, sao lưu khi đang ghi liên tục vẫn nhất quán, khôi phục từ bản đó.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { AppContext } = require('../main/app/AppContext');
const { BackupService } = require('../main/services/BackupService');
const { newStore } = require('../main/repo/createStore');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-bl-${p}-`));
const U = { username: 'admin', role: 'ADMIN' };
async function machine() {
  const home = tmp('m'); const ctx = new AppContext({ configFile: path.join(home, 'u', 'c.json'), documentsDir: home });
  await ctx.init({ mode: 'NEW', dataFolder: path.join(home, 'DATA'), unitCode: 'DH' });
  let day = new Date(2026, 8, 10, 9, 0, 0); // 10/09/2026 09:00 giờ máy
  const clock = { set: (d) => { day = d; }, now: () => new Date(day) };
  const bs = new BackupService(ctx.store, { reopen: (root) => newStore(root, {}, ctx.store.storageKind).open(), now: clock.now });
  const setCfg = (k, v) => ctx.store.transaction((tx) => { const r = tx.get('CONFIG', k); if (r) tx.update('CONFIG', k, { config_value: String(v) }); else tx.insert('CONFIG', { config_key: k, config_value: String(v), value_type: 'TEXT', description: '', is_secret: false }); }, { user: 'test' });
  const files = (kind) => fs.readdirSync(path.join(ctx.store.root, 'backups', kind)).filter((f) => f.endsWith('.zip')).sort();
  return { ctx, home, bs, clock, setCfg, files };
}

test('Tự động hằng ngày: mỗi ngày 1 bản; xoay vòng giữ N bản; ngày 1 thêm bản hằng tháng; kho SQLite → zip có dgvc.db', async () => {
  const m = await machine(); await m.setCfg('BACKUP_DAILY_KEEP', 2);
  assert.equal(m.ctx.store.storageKind, 'sqlite');
  const made1 = await m.bs.autoDaily(); assert.equal(made1.length, 2, '1.6.1: tháng chưa có bản monthly → tạo luôn (không phải đợi ngày 1)'); assert.ok(new AdmZip(made1[0].file).getEntry('dgvc.db'));
  assert.equal((await m.bs.autoDaily()).length, 0, 'cùng ngày không tạo thêm');
  for (const d of [11, 12, 13]) { m.clock.set(new Date(2026, 8, d, 9, 0, 0)); assert.equal((await m.bs.autoDaily()).length, 1); }
  assert.equal(m.files('daily').length, 2, 'giữ đúng 2 bản hằng ngày'); assert.ok(m.files('daily')[1].includes('20260913'), 'giữ bản mới nhất');
  m.clock.set(new Date(2026, 9, 1, 9, 0, 0)); const first = await m.bs.autoDaily(); assert.equal(first.length, 2, 'ngày 1 tháng mới: daily + monthly'); assert.equal(m.files('monthly').length, 2, 'tháng 9 (tạo ngay lần đầu) + tháng 10');
  // bản an toàn giữ 10
  for (let i = 0; i < 12; i++) { m.clock.set(new Date(2026, 9, 2, 9, 0, i)); await m.bs.backup({ kind: 'safety', note: `t${i}`, user: U }); }
  assert.equal(m.files('safety').length, 10); m.ctx.close();
});

test('Chép ra USB: có USB thì chép; thiếu USB không làm hỏng sao lưu (báo rõ); cảnh báo khi quá 7 ngày hoặc chưa có bản nào', async () => {
  const m = await machine(); const usb = tmp('usb');
  assert.equal(m.bs.list().warning.code, 'W_BACKUP_OLD'); assert.match(m.bs.list().warning.message, /Chưa có bản sao lưu/);
  await m.setCfg('BACKUP_MIRROR_ENABLED', 'TRUE'); await m.setCfg('BACKUP_MIRROR_FOLDER', usb);
  const ok = await m.bs.backup({ kind: 'manual', user: U }); assert.equal(ok.mirrored.ok, true); assert.ok(fs.existsSync(ok.mirrored.path));
  await m.setCfg('BACKUP_MIRROR_FOLDER', path.join(usb, 'khong-co', 'rut-usb'));
  const miss = await m.bs.backup({ kind: 'manual', note: 'khong-usb', user: U }); assert.equal(miss.mirrored.ok, false); assert.match(miss.mirrored.message, /USB|Google Drive|thư mục/); assert.ok(fs.existsSync(miss.file), 'bản chính vẫn được tạo');
  assert.equal(m.bs.list().warning, null);
  m.clock.set(new Date(2026, 8, 20, 9, 0, 0)); assert.match(m.bs.list().warning.message, /ngày/); m.ctx.close();
});

test('Sao lưu khi đang ghi liên tục: mọi bản sao nhất quán (mỗi giao dịch ghi CẶP dòng, không có cặp lẻ, integrity_check ok) và khôi phục được bản cuối', async () => {
  const m = await machine(); const s = m.ctx.store;
  let stop = false; let n = 0;
  const writer = (async () => { while (!stop) { n++; await s.transaction((tx) => { tx.audit('PAIR_A', 'X', String(n)); tx.audit('PAIR_B', 'X', String(n)); }, { user: 'w' }); await new Promise((r) => setImmediate(r)); } })(); // nhường vòng lặp sự kiện (không thì bộ hẹn giờ của test không bao giờ chạy)
  const files = []; for (let i = 0; i < 4; i++) { files.push((await m.bs.backup({ kind: 'manual', note: `c${i}`, user: U })).file); await new Promise((r) => setTimeout(r, 15)); }
  stop = true; await writer;
  const { DatabaseSync } = require('node:sqlite');
  for (const f of files) {
    assert.equal(m.bs.verify(f).storageFormat, 'sqlite');
    const db = path.join(tmp('x'), 'copy.sqlite'); fs.writeFileSync(db, new AdmZip(f).readFile('dgvc.db'));
    const d = new DatabaseSync(db, { readOnly: true });
    const q = (act) => d.prepare('SELECT entity_id FROM AUDIT_LOG WHERE action=? ORDER BY entity_id').all(act).map((r) => r.entity_id);
    assert.deepEqual(q('PAIR_A'), q('PAIR_B'), `bản ${path.basename(f)}: có cặp lẻ`); assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); d.close();
  }
  const r = await m.bs.restore({ file: files[files.length - 1], reason: 'thử', user: U }); assert.equal(r.store.storageKind, 'sqlite'); assert.ok(r.store.find('AUDIT_LOG', (x) => x.action === 'PAIR_A').length > 0); r.store.close();
});
