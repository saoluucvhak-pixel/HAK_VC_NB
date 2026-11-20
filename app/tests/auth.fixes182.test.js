'use strict';
/** Rà soát 1.8.2 — tài khoản: không lách mã kích hoạt khi ADMIN duy nhất bị đặt lại / ngừng dùng / hạ vai trò; E_LAST_ADMIN;
 *  "Thêm người dùng" trùng tên không ghi đè; sửa phải có rowVersion. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./install');
const { AuthService } = require('../main/services/AuthService');
const { Router } = require('../main/api/router');

const PW = 'HakGroup2026'; const A = { username: 'admin.root', role: 'ADMIN' };
async function setup() {
  const ctx = await install('DH', { withData: false }); const auth = new AuthService(ctx.store);
  const admins = ctx.store.find('USERS', (u) => u.role === 'ADMIN' && u.is_active).map((u) => u.username);
  await auth.setFirstPassword({ username: admins[0], newPassword: PW }); // ADMIN đầu tiên của bản cài mới
  const b = await auth.saveUser({ record: { username: 'admin.b', role: 'ADMIN', unitCode: 'DH' }, create: true, user: A });
  return { ...ctx, auth, admins, codeB: b.setupCode };
}
const noCode = (s, u) => s.auth.setFirstPassword({ username: u, newPassword: PW });

test('ADMIN duy nhất tự đặt lại mật khẩu → bị chặn E_LAST_ADMIN; ngoại lệ "ADMIN đầu tiên" không mở lại', async () => {
  const s = await setup();
  await assert.rejects(s.auth.resetPassword({ username: s.admins[0], user: A }), (e) => e.details && e.details.code === 'E_LAST_ADMIN');
  assert.equal(s.auth.firstAdminOpen(), false);
  await assert.rejects(noCode(s, 'admin.b'), (e) => e.code === 'AUTH_FAILED', 'admin.b vẫn phải có mã');
  await assert.rejects(noCode(s, s.admins[1]), (e) => e.code === 'AUTH_FAILED', 'ADMIN mẫu thứ 2 (chưa có mã) cũng không được đặt không mã');
});

test('Khi có 2 ADMIN đăng nhập được: đặt lại 1 người vẫn được; sau đó KHÔNG ai đặt mật khẩu không mã', async () => {
  const s = await setup();
  await s.auth.setFirstPassword({ username: 'admin.b', newPassword: PW, setupCode: s.codeB });
  await s.auth.resetPassword({ username: s.admins[0], user: { username: 'admin.b' } });
  assert.equal(s.auth.firstAdminOpen(), false);
  await assert.rejects(noCode(s, s.admins[0]), (e) => e.code === 'AUTH_FAILED');
  await assert.rejects(noCode(s, s.admins[1]), (e) => e.code === 'AUTH_FAILED');
});

test('Ngừng dùng / hạ vai trò ADMIN cuối cùng đăng nhập được → E_LAST_ADMIN; dữ liệu cũ đã có mật khẩu → không còn ngoại lệ', async () => {
  const s = await setup(); const me = s.store.get('USERS', s.admins[0]);
  await assert.rejects(s.auth.saveUser({ record: { username: me.username, role: 'ADMIN', isActive: false }, rowVersion: me.row_version, create: false, user: A }), (e) => e.details && e.details.code === 'E_LAST_ADMIN');
  await assert.rejects(s.auth.saveUser({ record: { username: me.username, role: 'KE_TOAN' }, rowVersion: me.row_version, create: false, user: A }), (e) => e.details && e.details.code === 'E_LAST_ADMIN');
  // giả lập dữ liệu đã lỡ ở trạng thái "không ADMIN nào có mật khẩu" (vd bản 1.8.1 đã đặt lại hết) → vẫn KHÔNG mở ngoại lệ vì đã từng có người dùng
  await s.store.transaction((tx) => { for (const u of tx.all('USERS')) tx.update('USERS', u.username, { password_hash: '', password_salt: '' }); }, { user: 't' });
  assert.equal(s.auth.firstAdminOpen(), false);
  await assert.rejects(noCode(s, s.admins[1]), (e) => e.code === 'AUTH_FAILED');
});

test('Thêm người dùng trùng tên → DUPLICATE, tài khoản cũ giữ nguyên; sửa thiếu rowVersion → bị từ chối', async () => {
  const s = await setup();
  await s.auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Kế toán X', role: 'KE_TOAN', unitCode: 'DH', canUnlock: true }, create: true, user: A });
  await assert.rejects(s.auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Người khác', role: 'XEM' }, create: true, user: A }), (e) => e.code === 'DUPLICATE');
  const u = s.store.get('USERS', 'ketoan.x'); assert.deepEqual([u.full_name, u.role, u.can_unlock], ['Kế toán X', 'KE_TOAN', true]);
  await assert.rejects(s.auth.saveUser({ record: { username: 'ketoan.x', role: 'XEM' }, create: false, user: A }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(s.auth.saveUser({ record: { username: 'khong.co', role: 'XEM' }, create: false, rowVersion: 1, user: A }), (e) => e.code === 'NOT_FOUND');
});

test('Qua Router (AppContext thật): users.save create=true trùng tên → DUPLICATE', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { AppContext } = require('../main/app/AppContext');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-a182-')); const ctx = new AppContext({ configFile: path.join(home, 'c.json') }); const r = new Router(ctx);
  await r.handle('setup.init', { dataFolder: path.join(home, 'D'), unitCode: 'DH' });
  const t = (await r.handle('auth.setFirstPassword', { username: 'phuthuy.apple@gmail.com', newPassword: PW })).data.token;
  const first = await r.handle('users.save', { record: { username: 'ke.toan1', role: 'KE_TOAN' }, create: true }, t); assert.equal(first.ok, true, JSON.stringify(first.error));
  const dup = await r.handle('users.save', { record: { username: 'ke.toan1', role: 'XEM' }, create: true }, t);
  assert.equal(dup.ok, false); assert.equal(dup.error.code, 'DUPLICATE');
  // ADMIN mẫu thứ hai không còn đặt được mật khẩu không cần mã
  const b = await r.handle('auth.setFirstPassword', { username: 'saoluucvhak@gmail.com', newPassword: PW }); assert.equal(b.ok, false); assert.equal(b.error.code, 'AUTH_FAILED');
  assert.equal((await r.handle('setup.status')).data.firstAdminOpen, false);
  ctx.close();
});

test('users.save không gửi create: sửa tài khoản đã có vẫn bắt buộc rowVersion; tạo mới vẫn được', async () => {
  const s = await setup();
  const n = await s.auth.saveUser({ record: { username: 'ketoan.y', role: 'KE_TOAN', unitCode: 'DH' }, user: A }); assert.equal(n.created, true);
  await assert.rejects(s.auth.saveUser({ record: { username: 'ketoan.y', role: 'XEM' }, user: A }), (e) => e.code === 'VALIDATION_FAILED');
  assert.equal(s.store.get('USERS', 'ketoan.y').role, 'KE_TOAN', 'không bị ghi đè');
});
