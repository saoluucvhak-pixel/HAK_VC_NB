'use strict';
/** Rà soát 1.8.2 — khôi phục lỗi / đổi thư mục lỗi KHÔNG làm app tê liệt (kho luôn mở lại, dữ liệu cũ còn nguyên), cho cả kho JSON và SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { Router } = require('../main/api/router');
const { sqliteAvailable } = require('../main/repo/SqliteStore');

const PW = 'HakGroup2026'; const ADMIN = 'phuthuy.apple@gmail.com';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-s182-${p}-`));
async function boot(kind) {
  const home = tmp(kind);
  const ctx = new AppContext({ configFile: path.join(home, 'c.json'), documentsDir: home, defaultStorage: kind });
  const r = new Router(ctx);
  await r.handle('setup.init', { dataFolder: path.join(home, 'DATA'), unitCode: 'DH' });
  const t = (await r.handle('auth.setFirstPassword', { username: ADMIN, newPassword: PW })).data.token;
  const call = (a, p = {}) => r.handle(a, p, t);
  assert.equal(ctx.storageKind(), kind);
  return { ctx, home, call };
}
const canWrite = async (call, name) => {
  const l = await call('routes.list', {}); const rt = l.data.items.find((x) => x.route_code === 'VC.007');
  const w = await call('routes.save', { record: { routeCode: 'VC.007', note: name }, rowVersion: rt.row_version });
  assert.equal(w.ok, true, `ghi được sau lỗi: ${w.error && w.error.message}`);
};

for (const kind of ['json', 'sqlite']) {
  const skip = kind === 'sqlite' && !sqliteAvailable() && 'không có node:sqlite';
  test(`[${kind}] Khôi phục lỗi khi mở lại kho → app vẫn ghi được, dữ liệu trước khôi phục còn nguyên`, { skip }, async () => {
    const s = await boot(kind);
    const b = await s.call('data.backupNow', { note: 'thu' }); assert.equal(b.ok, true);
    const bs = s.ctx.svc.backup; const real = bs.reopen; let n = 0;
    bs.reopen = (root) => { n += 1; if (n === 1) throw new Error('giả lập: mở lại lỗi'); return real(root); };
    const res = await s.call('data.restore', { file: b.data.file, reason: 'thử lỗi' });
    assert.equal(res.ok, false, 'khôi phục báo lỗi');
    await canWrite(s.call, 'sau-khoi-phuc-loi');
    assert.equal((await s.call('auth.me')).ok, true, 'phiên đăng nhập vẫn giữ');
    s.ctx.close();
  });

  test(`[${kind}] Đổi thư mục: thư mục con của thư mục cũ → từ chối, kho vẫn mở; chép lỗi → mở lại kho cũ, cấu hình không đổi`, { skip }, async () => {
    const s = await boot(kind); const old = s.ctx.store.root;
    const sub = await s.call('data.changeFolder', { newFolder: path.join(old, 'moi') });
    assert.equal(sub.ok, false); assert.equal(sub.error.code, 'VALIDATION_FAILED');
    assert.equal(fs.existsSync(path.join(old, 'moi')), false, 'không để lại bản chép dở');
    await canWrite(s.call, 'sau-thu-muc-con');
    const orig = fs.cpSync; fs.cpSync = () => { throw new Error('giả lập: ổ đầy'); };
    let bad; try { bad = await s.call('data.changeFolder', { newFolder: path.join(s.home, 'MOI') }); } finally { fs.cpSync = orig; }
    assert.equal(bad.ok, false); assert.match(bad.error.message, /vẫn dùng thư mục cũ/);
    assert.equal(s.ctx.store.root, old); assert.equal(s.ctx.readConfig().dataFolder, old, 'cấu hình giữ thư mục cũ');
    assert.equal(fs.existsSync(path.join(s.home, 'MOI')), false, 'bản chép dở đã dọn');
    await canWrite(s.call, 'sau-chep-loi');
    // chép xong nhưng mở kho ở chỗ mới lỗi → trả cấu hình về thư mục cũ, kho cũ mở lại
    const op = s.ctx.open.bind(s.ctx); let k = 0; s.ctx.open = (...x) => { k += 1; if (k === 1) throw new Error('giả lập: không mở được kho mới'); return op(...x); };
    let bo; try { bo = await s.call('data.changeFolder', { newFolder: path.join(s.home, 'MOI3') }); } finally { s.ctx.open = op; }
    assert.equal(bo.ok, false); assert.match(bo.error.message, /vẫn dùng thư mục cũ/);
    assert.equal(s.ctx.readConfig().dataFolder, old, 'cấu hình trả về thư mục cũ'); await canWrite(s.call, 'sau-mo-moi-loi');
    const ok = await s.call('data.changeFolder', { newFolder: path.join(s.home, 'MOI2') }); assert.equal(ok.ok, true, JSON.stringify(ok.error));
    assert.ok(s.ctx.store.all('AUDIT_LOG').some((a) => a.action === 'CHANGE_FOLDER'), 'nhật ký đổi thư mục nằm ở kho mới');
    s.ctx.close();
  });
}
