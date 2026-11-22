'use strict';
/** Nhóm 3 (rà soát bảo mật): cờ ADMIN-đầu-tiên theo từng bản cài; so sánh băm không sập khi dữ liệu hỏng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { install } = require('./install');
const { AuthService } = require('../main/services/AuthService');

test('M-1: hai bản cài trên CÙNG máy — bản thứ hai vẫn được đặt ADMIN đầu tiên; bản thứ nhất vẫn bị khóa khi khôi phục kiểu "xóa mật khẩu"', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-g3-'));
  const configFile = path.join(home, 'userData', 'dgvc-config.json');
  const a = new AppContext({ configFile }); await a.init({ mode: 'NEW', dataFolder: path.join(home, 'A'), unitCode: 'DH' });
  const adminA = a.store.all('USERS').find((u) => u.role === 'ADMIN').username;
  await a.svc.auth.setFirstPassword({ username: adminA, newPassword: 'HakGroup2026' });
  assert.equal(a.svc.auth.firstAdminOpen(), false);
  const ms = a.readMachineState(); assert.deepEqual(ms.firstAdminInstalls, [a.store.installId]);
  const b = new AppContext({ configFile }); await b.init({ mode: 'NEW', dataFolder: path.join(home, 'B'), unitCode: 'DH' });
  assert.notEqual(b.store.installId, a.store.installId);
  assert.equal(b.svc.auth.firstAdminOpen(), true, 'bản cài mới thứ hai trên cùng máy không bị khóa nhầm');
  const adminB = b.store.all('USERS').find((u) => u.role === 'ADMIN').username;
  assert.ok((await b.svc.auth.setFirstPassword({ username: adminB, newPassword: 'HakGroup2026' })).token);
  assert.deepEqual(b.readMachineState().firstAdminInstalls.sort(), [a.store.installId, b.store.installId].sort());
  // bản A: xóa sạch dấu vết mật khẩu (giả lập khôi phục bản cũ) → vẫn không mở lại ngoại lệ
  await a.store.transaction((tx) => { for (const u of a.store.all('USERS')) tx.update('USERS', u.username, { password_hash: '', password_salt: '', last_login_at: '' }); }, { user: 'test' });
  assert.equal(a.svc.auth.firstAdminOpen(), false);
  a.store.close(); b.store.close();
});

test('Cờ cũ 1.8.3 (firstAdminCompleted, chưa có danh sách theo bản cài): bản cài đã có tài khoản hoạt động vẫn bị khóa; bản cài trống thì không', async () => {
  const ctx = await install('DH', { withData: false });
  const ms = { firstAdminCompleted: true };
  const auth = new AuthService(ctx.store, { machineState: ms });
  assert.equal(auth.firstAdminOpen(), true, 'bản trống: không khóa nhầm vì cờ máy cũ');
  const u = ctx.store.all('USERS').find((x) => x.role === 'ADMIN');
  await ctx.store.transaction((tx) => { tx.update('USERS', u.username, { password_hash: 'ab', password_salt: 'cd' }); }, { user: 'test' });
  assert.equal(auth.firstAdminOpen(), false); assert.deepEqual(ms.firstAdminInstalls, [ctx.store.installId], 'ghi nhận cho bản cài này');
});

test('M-2: hash mật khẩu trong dữ liệu bị hỏng / khác độ dài → đăng nhập báo sai mật khẩu (AUTH_FAILED), không ném RangeError', async () => {
  const ctx = await install('DH', { withData: false }); const auth = new AuthService(ctx.store);
  const u = ctx.store.all('USERS').find((x) => x.role === 'ADMIN');
  await auth.setFirstPassword({ username: u.username, newPassword: 'HakGroup2026' });
  await ctx.store.transaction((tx) => { tx.update('USERS', u.username, { password_hash: 'abcd' }); }, { user: 'test' });
  await assert.rejects(auth.login({ username: u.username, password: 'HakGroup2026' }), (e) => e.code === 'AUTH_FAILED');
});
