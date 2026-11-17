'use strict';
/**
 * Giai đoạn 2 — di chuyển kho JSON → SQLite (T-MIG-01..04) và xuất ngược:
 *  - thành công: kho JSON nguồn nguyên vẹn (manifest cùng SHA-256), SQLite cùng số dòng + dấu vân tay + tổng kỳ đã chốt, có bản sao an toàn + báo cáo + dấu STORAGE_MIGRATED;
 *  - dry-run không để lại gì; chạy lại cho cùng kết quả; tệp tạm cũ (mất điện giữa chừng) bị dựng lại;
 *  - kiểm chứng thất bại / hết dung lượng → dừng, KHÔNG có dgvc.sqlite, nguồn không đổi;
 *  - vòng tròn JSON → SQLite → JSON bằng nhau; giao dịch mới trên SQLite có trong bản xuất ngược.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { install, KETOAN } = require('./install');
const { JsonStore } = require('../main/repo/JsonStore');
const { SqliteStore, sqliteAvailable } = require('../main/repo/SqliteStore');
const { migrateJsonToSqlite, exportSqliteToJson, TMP_DB } = require('../main/repo/migrate/migrate');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const skip = !sqliteAvailable() && 'không có node:sqlite';

async function seeded() {
  const c = await install('DH', { kind: 'json' });
  const { store, periods, contractId } = c;
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: 'mig-1', user: KETOAN });
  const pid = k.period.period_id;
  await periods.confirm({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  await periods.lock({ periodId: pid, rowVersion: store.get('KY_TINH', pid).row_version, user: KETOAN });
  const fp = store.fingerprint(); store.close();
  return { ...c, fp, pid };
}

test('T-MIG-01: di chuyển thành công — nguồn nguyên vẹn, đích khớp từng bảng, kỳ đã chốt nguyên trạng, có sao lưu + báo cáo', { skip, timeout: 300000 }, async () => {
  const c = await seeded(); const mBefore = sha(path.join(c.dir, 'manifest.json'));
  const r = await migrateJsonToSqlite({ root: c.dir });
  assert.equal(r.verified, true); assert.equal(r.report.sourceUnchanged, true);
  assert.equal(sha(path.join(c.dir, 'manifest.json')), mBefore, 'manifest nguồn không đổi');
  assert.ok(fs.existsSync(path.join(c.dir, 'dgvc.sqlite'))); assert.ok(!fs.existsSync(path.join(c.dir, TMP_DB)));
  assert.ok(fs.existsSync(path.join(c.dir, 'STORAGE_MIGRATED.json'))); assert.ok(r.safetyBackup && fs.existsSync(r.safetyBackup));
  assert.ok(fs.readdirSync(path.join(c.dir, 'backups/safety')).some((f) => f.startsWith('migration-report-')));
  const s = new SqliteStore(c.dir).open();
  assert.equal(s.fingerprint().sha256, c.fp.sha256); assert.equal(s.dataVersion, r.report.source.dataVersion);
  assert.equal(s.get('KY_TINH', c.pid).status, 'DA_KHOA'); assert.ok(s.find('BKVC_LINE', (l) => l.period_id === c.pid).length > 0);
  assert.equal(s.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  s.close();
  // kho JSON nguồn vẫn mở được và y nguyên
  const j = new JsonStore(c.dir).open(); assert.equal(j.fingerprint().sha256, c.fp.sha256); j.close();
});

test('T-MIG-02: dry-run không để lại gì; chạy lại cho cùng kết quả (xác định)', { skip, timeout: 300000 }, async () => {
  const c = await seeded();
  const d = await migrateJsonToSqlite({ root: c.dir, dryRun: true });
  assert.equal(d.dryRun, true); assert.ok(!fs.existsSync(path.join(c.dir, 'dgvc.sqlite'))); assert.ok(!fs.existsSync(path.join(c.dir, TMP_DB)));
  const a = await migrateJsonToSqlite({ root: c.dir, backup: false }); const fpa = a.report.verification.fingerprint;
  const b = await migrateJsonToSqlite({ root: c.dir, backup: false });
  assert.equal(b.report.verification.fingerprint, fpa, 'cùng nguồn → cùng dấu vân tay');
  assert.ok(fs.readdirSync(c.dir).some((f) => f.startsWith('dgvc.sqlite.replaced-')), 'DB cũ được đặt sang một bên, không bị ghi đè');
  assert.equal(new SqliteStore(c.dir).open().fingerprint().sha256, c.fp.sha256);
});

test('T-MIG-03: mất điện giữa chừng (còn tệp tạm hỏng từ lần trước) → dựng lại từ đầu, không bản ghi trùng', { skip, timeout: 300000 }, async () => {
  const c = await seeded();
  fs.writeFileSync(path.join(c.dir, TMP_DB), 'nửa vời, hỏng'); fs.writeFileSync(path.join(c.dir, `${TMP_DB}-wal`), 'x');
  const r = await migrateJsonToSqlite({ root: c.dir, backup: false });
  assert.equal(r.verified, true);
  const s = new SqliteStore(c.dir).open(); assert.equal(s.fingerprint().sha256, c.fp.sha256);
  assert.equal(s.all('PHIEU_CAN').length, c.fp.perTable.PHIEU_CAN.rows, 'không nhân đôi bản ghi'); s.close();
});

test('T-MIG-04: kiểm chứng thất bại hoặc hết dung lượng → dừng, không có dgvc.sqlite, nguồn không đổi', { skip, timeout: 300000 }, async () => {
  const c = await seeded(); const mBefore = sha(path.join(c.dir, 'manifest.json'));
  // (a) DB dựng ra thiếu 1 dòng
  const orig = SqliteStore.populate;
  SqliteStore.populate = (dbPath, manifest, getRows) => orig(dbPath, manifest, (t) => (t === 'PHIEU_CAN' ? getRows(t).slice(1) : getRows(t)));
  try { await assert.rejects(migrateJsonToSqlite({ root: c.dir, backup: false }), (e) => e.code === 'INTEGRITY_ERROR' && /PHIEU_CAN/.test(e.message)); } finally { SqliteStore.populate = orig; }
  assert.ok(!fs.existsSync(path.join(c.dir, 'dgvc.sqlite'))); assert.ok(!fs.existsSync(path.join(c.dir, TMP_DB)));
  // (b) hết dung lượng
  const sf = fs.statfsSync; fs.statfsSync = () => ({ bavail: 1, bsize: 1 });
  try { await assert.rejects(migrateJsonToSqlite({ root: c.dir, backup: false }), (e) => e.code === 'STORAGE_ERROR' && /dung lượng/.test(e.message)); } finally { fs.statfsSync = sf; }
  assert.ok(!fs.existsSync(path.join(c.dir, 'dgvc.sqlite')));
  assert.equal(sha(path.join(c.dir, 'manifest.json')), mBefore);
  const j = new JsonStore(c.dir).open(); assert.equal(j.fingerprint().sha256, c.fp.sha256); j.close();
});

test('Xuất ngược: JSON → SQLite → JSON bằng nhau; giao dịch mới trên SQLite có mặt trong bản xuất ngược', { skip, timeout: 300000 }, async () => {
  const c = await seeded();
  await migrateJsonToSqlite({ root: c.dir, backup: false });
  const dest1 = path.join(os.tmpdir(), `dgvc-export-${Date.now()}-a`);
  const e1 = await exportSqliteToJson({ root: c.dir, dest: dest1 });
  assert.equal(e1.ok, true); assert.equal(e1.fingerprint, c.fp.sha256);
  const j1 = new JsonStore(dest1).open(); assert.equal(j1.fingerprint().sha256, c.fp.sha256); j1.close();
  // phát sinh giao dịch mới trên SQLite → bản JSON cũ KHÔNG có, bản xuất ngược CÓ
  const s = new SqliteStore(c.dir).open();
  await s.transaction((tx) => { tx.audit('SAU_CHUYEN', 'X', 'moi'); }, { user: 'test' }); const fpNew = s.fingerprint().sha256; s.close();
  const old = new JsonStore(c.dir).open(); assert.equal(old.find('AUDIT_LOG', (a) => a.action === 'SAU_CHUYEN').length, 0, 'JSON đóng băng không có giao dịch mới'); old.close();
  const dest2 = path.join(os.tmpdir(), `dgvc-export-${Date.now()}-b`);
  const e2 = await exportSqliteToJson({ root: c.dir, dest: dest2 });
  assert.equal(e2.fingerprint, fpNew); assert.notEqual(fpNew, c.fp.sha256);
  const j2 = new JsonStore(dest2).open(); assert.equal(j2.find('AUDIT_LOG', (a) => a.action === 'SAU_CHUYEN').length, 1); j2.close();
  await assert.rejects(exportSqliteToJson({ root: c.dir, dest: dest2 }), /phải trống/);
});
