'use strict';
/**
 * Giai đoạn 2 — ứng dụng (AppContext) chạy trên kho SQLite sau khi di chuyển: sao lưu / xác minh / khôi phục SQLite, khôi phục bản sao lưu JSON CŨ vào kho SQLite (Q9),
 * đổi thư mục, đường lui (revert) khi chưa có giao dịch mới, xuất ngược khi đã có, chống bấm hai lần bền qua khởi động lại (Q5), và gói .dgvc giữa hai loại kho (T-DGVC-04).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { AppContext } = require('../main/app/AppContext');
const { sqliteAvailable } = require('../main/repo/SqliteStore');
const { FILE, CONTRACT, KETOAN, ADMIN, rid } = require('./install');

const skip = !sqliteAvailable() && 'không có node:sqlite';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-ac-${p}-`));

async function app(unit = 'DH') {
  const home = tmp(unit);
  const ctx = new AppContext({ configFile: path.join(home, 'userData', 'dgvc-config.json'), documentsDir: home });
  await ctx.init({ mode: 'NEW', dataFolder: path.join(home, 'DATA'), unitCode: unit });
  const imp = ctx.svc.import;
  const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE[unit], user: 'ketoan' });
  await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  const f = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT[unit], filePath: FILE[unit], user: 'ketoan' });
  await imp.confirm({ batchId: f.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  return { ctx, home, folder: path.join(home, 'DATA') };
}
const calc = (ctx, rq) => ctx.svc.periods.calculate({ contractId: 'HD-DH-HAKQN', dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rq, user: KETOAN });

test('migrateStorage → ứng dụng chạy SQLite; sao lưu SQLite verify + khôi phục; khôi phục bản sao lưu JSON cũ (Q9); chống trùng bền (Q5)', { skip, timeout: 400000 }, async () => {
  const { ctx, folder } = await app();
  const jsonBackup = await ctx.svc.backup.backup({ kind: 'manual', note: 'json-cu', user: ADMIN }); // bản sao lưu ĐỊNH DẠNG JSON
  assert.equal(new AdmZip(jsonBackup.file).getEntry('manifest.json') !== null, true);
  const before = ctx.store.snapshot().tables.PHIEU_CAN.length;
  const r = await ctx.migrateStorage({ user: ADMIN });
  assert.equal(r.verified, true); assert.equal(ctx.storageKind(), 'sqlite'); assert.equal(ctx.store.storageKind, 'sqlite');
  assert.equal(ctx.store.all('PHIEU_CAN').length, before);
  assert.equal(ctx.status().initialized, true); assert.equal(ctx.status().installId, ctx.store.installId);
  assert.ok(ctx.store.find('AUDIT_LOG', (a) => a.action === 'MIGRATE_STORAGE').length === 1);

  // nghiệp vụ chạy bình thường trên SQLite
  const k = await calc(ctx, 'ac-1'); const pid = k.period.period_id;
  // Q5: cùng clientRequestId sau khi MỞ LẠI (khởi động lại) trả kết quả cũ, không tính lại
  ctx.close(); ctx.open();
  const again = await calc(ctx, 'ac-1');
  assert.equal(again.period.period_id, pid); assert.equal(ctx.store.all('KY_TINH').length, 1);

  // sao lưu SQLite: zip có dgvc.db, verify đạt, hỏng 1 byte thì phát hiện
  const b = await ctx.svc.backup.backup({ kind: 'manual', note: 'sqlite', user: ADMIN });
  const z = new AdmZip(b.file); assert.ok(z.getEntry('dgvc.db')); assert.equal(JSON.parse(z.readAsText('backup-info.json')).storageFormat, 'sqlite');
  assert.equal(ctx.svc.backup.verify(b.file).storageFormat, 'sqlite');
  const bad = path.join(path.dirname(b.file), 'hong.zip'); const zz = new AdmZip(b.file); const buf = zz.readFile('dgvc.db'); buf[buf.length - 10] ^= 0xff; zz.updateFile('dgvc.db', buf); zz.writeZip(bad);
  assert.throws(() => ctx.svc.backup.verify(bad), (e) => e.code === 'INTEGRITY_ERROR');
  fs.rmSync(bad);

  // thay đổi thêm rồi khôi phục SQLite → về đúng trạng thái sao lưu
  const fpAtBackup = ctx.store.fingerprint().perTable.PHIEU_CAN.sha256;
  await ctx.svc.records.softDeleteTickets({ ticketIds: [ctx.store.all('PHIEU_CAN')[0].ticket_id], reason: 'thử', user: KETOAN });
  assert.notEqual(ctx.store.fingerprint().perTable.PHIEU_CAN.sha256, fpAtBackup);
  const rs = await ctx.svc.backup.restore({ file: b.file, reason: 'thử khôi phục', user: ADMIN }); ctx.replaceStore(rs.store);
  assert.equal(ctx.store.storageKind, 'sqlite'); assert.equal(ctx.store.fingerprint().perTable.PHIEU_CAN.sha256, fpAtBackup);
  assert.ok(ctx.store.find('AUDIT_LOG', (a) => a.action === 'RESTORE').length >= 1);
  assert.ok(!fs.existsSync(path.join(folder, 'dgvc.sqlite.before-restore')));

  // Q9: khôi phục bản sao lưu JSON CŨ vào kho SQLite
  const rj = await ctx.svc.backup.restore({ file: jsonBackup.file, reason: 'Q9', user: ADMIN }); ctx.replaceStore(rj.store);
  assert.equal(ctx.store.storageKind, 'sqlite'); assert.equal(ctx.store.all('KY_TINH').length, 0, 'về đúng trạng thái trước khi có kỳ'); assert.equal(ctx.store.all('PHIEU_CAN').length, before);
  ctx.close();
});

test('đổi thư mục dữ liệu khi đang dùng SQLite; đường lui revert khi chưa có giao dịch mới; xuất ngược khi đã có', { skip, timeout: 400000 }, async () => {
  const { ctx, home } = await app();
  await ctx.migrateStorage({ user: ADMIN });
  const fp = ctx.store.fingerprint().sha256;
  const nf = path.join(home, 'D2'); const ch = await ctx.changeFolder({ newFolder: nf, user: ADMIN });
  assert.equal(ch.dataFolder, nf); assert.equal(ctx.store.storageKind, 'sqlite'); assert.ok(!fs.existsSync(path.join(nf, 'dgvc.sqlite-wal')) || fs.statSync(path.join(nf, 'dgvc.sqlite-wal')).size === 0);
  assert.equal(ctx.store.find('AUDIT_LOG', (a) => a.action === 'CHANGE_FOLDER').length, 1);
  assert.notEqual(ctx.store.fingerprint().sha256, fp, 'có thêm audit đổi thư mục');
  // đã có giao dịch mới (CHANGE_FOLDER + sao lưu...) → revert bị từ chối, phải xuất ngược
  await ctx.svc.records.softDeleteTickets({ ticketIds: [ctx.store.all('PHIEU_CAN')[0].ticket_id], reason: 'thử', user: KETOAN });
  await assert.rejects(ctx.revertStorage({ user: ADMIN }), (e) => e.details && e.details.code === 'E_NEW_TRANSACTIONS');
  const dest = path.join(home, 'JSON_OUT'); const ex = await ctx.exportStorageToJson({ dest });
  assert.equal(ex.ok, true); assert.equal(ctx.store.storageKind, 'sqlite', 'ứng dụng vẫn chạy SQLite sau khi xuất');
  // bản xuất ngược mở bằng "Dùng dữ liệu có sẵn" → kho JSON, đúng dữ liệu
  const ctx2 = new AppContext({ configFile: path.join(home, 'u2', 'c.json'), documentsDir: home });
  await ctx2.init({ mode: 'ATTACH', dataFolder: dest }); assert.equal(ctx2.storageKind(), 'json'); assert.equal(ctx2.store.fingerprint().sha256, ex.fingerprint); ctx2.close();
  ctx.close();
});

test('revert về JSON khi CHƯA có giao dịch nghiệp vụ mới: kho JSON đóng băng dùng lại được', { skip, timeout: 400000 }, async () => {
  const { ctx } = await app();
  const jfp = ctx.store.fingerprint().sha256;
  await ctx.migrateStorage({ user: ADMIN });
  const r = await ctx.revertStorage({ user: ADMIN });
  assert.equal(r.storage, 'json'); assert.equal(ctx.storageKind(), 'json');
  assert.equal(ctx.store.find('PHIEU_CAN', () => true).length, ctx.store.fingerprint().perTable.PHIEU_CAN.rows);
  assert.ok(ctx.store.find('AUDIT_LOG', (a) => a.action === 'REVERT_STORAGE').length === 1);
  void jfp; ctx.close();
});

test('T-DGVC-04: gói kỳ tính xuất từ kho JSON và từ kho SQLite có CÙNG contentSha256; nhập chéo hai chiều được', { skip, timeout: 400000 }, async () => {
  const a = await app(); const k = await calc(a.ctx, 'dg-1'); const pid = k.period.period_id;
  await a.ctx.svc.periods.confirm({ periodId: pid, rowVersion: a.ctx.store.get('KY_TINH', pid).row_version, user: KETOAN });
  const pkgJson = await a.ctx.svc.exchange.exportPackage({ packageType: 'KY_TINH', periodIds: [pid], user: KETOAN });
  await a.ctx.migrateStorage({ user: ADMIN });
  const pkgSql = await a.ctx.svc.exchange.exportPackage({ packageType: 'KY_TINH', periodIds: [pid], user: KETOAN });
  const h = (f) => JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(f)).toString('utf8')).header;
  assert.equal(h(pkgSql.file).contentSha256, h(pkgJson.file).contentSha256, 'cùng dữ liệu logic → cùng contentSha256');
  // nhập chéo: máy HAKQN chạy SQLite nhận gói do máy DH (JSON) xuất, và ngược lại
  const q = await app('HAKQN'); await q.ctx.migrateStorage({ user: ADMIN });
  const pv = await q.ctx.svc.exchange.previewPackage({ filePath: pkgJson.file, user: KETOAN });
  assert.equal(pv.integrity, 'OK'); assert.equal(pv.canImport, true);
  const im = await q.ctx.svc.exchange.importPackage({ previewId: pv.previewId, user: KETOAN }); assert.ok(im.safetyBackup);
  assert.equal(q.ctx.store.get('KY_TINH', pid).origin, 'IMPORTED');
  a.ctx.close(); q.ctx.close();
});

test('Thư mục nằm trong vùng đồng bộ / ổ mạng: nhận diện, cảnh báo, và KHÔNG cho chuyển sang SQLite', { skip, timeout: 200000 }, async () => {
  const { syncFolderKind } = require('../main/app/AppContext');
  assert.equal(syncFolderKind('C:\\Users\\a\\OneDrive\\DGVC_DATA'), 'ONEDRIVE'); assert.equal(syncFolderKind('C:\\Users\\a\\Google Drive\\x'), 'GOOGLEDRIVE');
  assert.equal(syncFolderKind('\\\\may-chu\\chia-se\\DGVC'), 'NETWORK'); assert.equal(syncFolderKind('D:\\DGVC_DATA'), ''); assert.equal(syncFolderKind('/home/u/Documents/DGVC_DATA'), '');
  const home = tmp('sync'); const dataFolder = path.join(home, 'OneDrive', 'DGVC_DATA');
  const ctx = new AppContext({ configFile: path.join(home, 'userData', 'c.json'), documentsDir: home });
  await ctx.init({ mode: 'NEW', dataFolder, unitCode: 'DH' });
  const info = ctx.storageInfo(); assert.equal(info.syncFolder, 'ONEDRIVE'); assert.equal(info.canMigrate, false); assert.match(info.blockedReason, /vùng đồng bộ/);
  await assert.rejects(ctx.migrateStorage({ user: ADMIN }), (e) => e.details && e.details.code === 'E_STORAGE_BLOCKED');
  assert.equal(ctx.storageKind(), 'json'); assert.ok(!fs.existsSync(path.join(dataFolder, 'dgvc.sqlite')));
  ctx.close();
});
