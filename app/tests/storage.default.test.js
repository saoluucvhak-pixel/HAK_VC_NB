'use strict';
/**
 * Yêu cầu sản phẩm: máy LUÔN làm việc trên SQLite (kho chính, mặc định) và tự sao lưu; JSON chỉ là sao lưu PHỤ để gửi máy khác;
 * khôi phục được từ cả bản SQL lẫn bản JSON.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { AppContext } = require('../main/app/AppContext');
const { sqliteAvailable } = require('../main/repo/SqliteStore');
const { FILE, CONTRACT, ADMIN: ADMIN_USER, rid } = require('./install');

const skip = !sqliteAvailable() && 'không có node:sqlite';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-df-${p}-`));
const U = { username: ADMIN_USER.username, role: 'ADMIN' };

async function machine(unit, { folder, json = false, seed = true } = {}) {
  const home = tmp(unit);
  const ctx = new AppContext({ configFile: path.join(home, 'userData', 'c.json'), documentsDir: home, ...(json ? { defaultStorage: 'json' } : {}) });
  await ctx.init({ mode: 'NEW', dataFolder: folder || path.join(home, 'DATA'), unitCode: unit });
  if (seed) {
    const imp = ctx.svc.import;
    const a = await imp.preview({ importType: 'PHIEU_CAN', filePath: FILE[unit], user: 'k' }); await imp.confirm({ batchId: a.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'k' });
  }
  return { ctx, home };
}

test('Bản cài MỚI mặc định dùng SQLite (có dgvc.sqlite, không có manifest.json); cấu hình ghi storage=sqlite', { skip }, async () => {
  const { ctx, home } = await machine('DH');
  assert.equal(ctx.storageKind(), 'sqlite'); assert.equal(ctx.store.storageKind, 'sqlite'); assert.equal(ctx.readConfig().storage, 'sqlite');
  assert.ok(fs.existsSync(path.join(home, 'DATA', 'dgvc.sqlite'))); assert.ok(!fs.existsSync(path.join(home, 'DATA', 'manifest.json')));
  assert.equal(ctx.status().initialized, true); ctx.close();
  // mở lại (khởi động lại app) vẫn là SQLite
  const again = new AppContext({ configFile: path.join(home, 'userData', 'c.json'), documentsDir: home }); again.open(); assert.equal(again.store.storageKind, 'sqlite'); again.close();
});

test('Bản cài mới đặt trong thư mục đồng bộ (OneDrive) → dùng JSON và được nhắc; bản cài cũ chỉ cấu hình JSON được nâng cấp tự động', { skip, timeout: 300000 }, async () => {
  const base = tmp('od');
  const { ctx } = await machine('DH', { folder: path.join(base, 'OneDrive', 'DGVC_DATA'), seed: false });
  assert.equal(ctx.storageKind(), 'json'); const u = await ctx.autoUpgradeStorage(); assert.equal(u.state, 'blocked'); assert.match(ctx.storageNotice.message, /đồng bộ/); assert.equal(ctx.storageKind(), 'json'); ctx.close();
});

test('Nâng cấp tự động bản cài cũ (JSON → SQLite): đối chiếu khớp, kho JSON cũ giữ nguyên; lỗi thì vẫn JSON và không thử lại ở cùng phiên bản', { skip, timeout: 300000 }, async () => {
  const { ctx, home } = await machine('DH', { json: true });
  const n = ctx.store.all('PHIEU_CAN').length; assert.ok(n > 0); assert.equal(ctx.storageKind(), 'json');
  // lỗi giả lập: không nâng cấp, vẫn JSON, ghi nhận đã thử
  const orig = ctx.migrateStorage.bind(ctx); ctx.migrateStorage = async () => { throw new Error('lỗi giả lập'); };
  const f = await ctx.autoUpgradeStorage(); assert.equal(f.state, 'failed'); assert.equal(ctx.storageKind(), 'json'); assert.equal(ctx.store.all('PHIEU_CAN').length, n); assert.match(ctx.storageNotice.message, /Vẫn dùng kho JSON/);
  assert.equal((await ctx.autoUpgradeStorage()).state, 'skip', 'không thử lại ở cùng phiên bản app');
  // gỡ cờ thất bại → nâng cấp thật
  ctx.migrateStorage = orig; const cfg = ctx.readConfig(); delete cfg.storageUpgrade; ctx.writeConfig(cfg);
  const u = await ctx.autoUpgradeStorage(); assert.equal(u.state, 'done'); assert.equal(ctx.storageKind(), 'sqlite'); assert.equal(ctx.store.all('PHIEU_CAN').length, n); assert.match(ctx.storageNotice.message, /SQLite/);
  assert.ok(fs.existsSync(path.join(home, 'DATA', 'manifest.json')), 'kho JSON cũ còn nguyên làm dự phòng'); assert.equal((await ctx.autoUpgradeStorage()).state, 'skip');
  ctx.close();
});

test('Sao lưu phụ JSON gửi máy khác: 1 file .zip; máy nhận (SQLite) khôi phục được; khôi phục cả bản SQL cũ; máy làm việc trên SQL', { skip, timeout: 300000 }, async () => {
  const a = await machine('DH'); const fp = a.ctx.store.fingerprint().perTable.PHIEU_CAN.sha256; const n = a.ctx.store.all('PHIEU_CAN').length;
  const zipPath = path.join(tmp('share'), 'DGVC_JSON_DH.zip');
  const r = await a.ctx.exportJsonShare({ file: zipPath, user: U });
  assert.equal(r.ok, true); assert.ok(fs.existsSync(zipPath)); assert.equal(a.ctx.storageKind(), 'sqlite', 'máy gửi vẫn là SQLite sau khi xuất');
  const z = new AdmZip(zipPath); const names = z.getEntries().map((e) => e.entryName);
  assert.ok(names.includes('manifest.json') && names.includes('snapshot-info.json') && names.includes('backup-info.json') && names.some((x) => x.startsWith('tables/')));
  assert.equal(JSON.parse(z.readAsText('backup-info.json')).kind, 'json-share');
  // máy khác (cùng đơn vị, cài riêng, dữ liệu trống) nhận file JSON → khôi phục (chuyển thành SQLite)
  const b = await machine('DH', { seed: false }); assert.equal(b.ctx.store.all('PHIEU_CAN').length, 0);
  const i = b.ctx.svc.backup.inspect({ file: zipPath }); assert.equal(i.canRestore, true); assert.equal(i.storageFormat, 'json'); assert.equal(i.needsOtherInstallConfirm, true);
  await assert.rejects(b.ctx.svc.backup.restore({ file: zipPath, reason: 'x', user: U }), (e) => e.details && e.details.code === 'E_OTHER_INSTALL');
  const rs = await b.ctx.svc.backup.restore({ file: zipPath, reason: 'nhận từ máy khác', user: U, allowOtherInstall: true }); b.ctx.replaceStore(rs.store);
  assert.equal(b.ctx.store.storageKind, 'sqlite'); assert.equal(b.ctx.store.all('PHIEU_CAN').length, n); assert.equal(b.ctx.store.fingerprint().perTable.PHIEU_CAN.sha256, fp);
  // khôi phục từ bản sao lưu SQL (zip có dgvc.db) trên chính máy gửi
  const sql = await a.ctx.svc.backup.backup({ kind: 'manual', user: U }); assert.ok(new AdmZip(sql.file).getEntry('dgvc.db'));
  await a.ctx.svc.records.softDeleteTickets({ ticketIds: a.ctx.store.all('PHIEU_CAN').slice(0, 4).map((t) => t.ticket_id), reason: 'thử', user: { username: 'k', role: 'KE_TOAN' } });
  const back = await a.ctx.svc.backup.restore({ file: sql.file, reason: 'thử SQL', user: U }); a.ctx.replaceStore(back.store);
  assert.equal(a.ctx.store.find('PHIEU_CAN', (t) => !t.is_deleted).length, n); a.ctx.close(); b.ctx.close();
});
