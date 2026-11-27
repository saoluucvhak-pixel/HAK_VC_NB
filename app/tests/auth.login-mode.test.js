'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { Router } = require('../main/api/router');
const { storageKinds } = require('../main/repo/createStore');

const owner = { username: 'chu.may', password: 'ChuMay2026' };
function fixture(t, kind) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-login-mode-'));
  const configFile = path.join(home, 'config.json');
  const dataFolder = path.join(home, 'data');
  const ctx = new AppContext({ configFile, defaultStorage: kind });
  t.after(() => { ctx.close(); fs.rmSync(home, { recursive: true, force: true }); });
  return { ctx, r: new Router(ctx), dataFolder, configFile };
}

const dataOf = async (r, action, args, token) => {
  const result = await r.handle(action, args, token);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
};

for (const kind of storageKinds()) {
  test(`Chuyển chế độ có xác thực và vô hiệu phiên cũ (${kind})`, async (t) => {
    const { ctx, r, dataFolder } = fixture(t, kind);
    await dataOf(r, 'setup.init', { unitCode: 'DH', dataFolder });
    assert.equal(ctx.store.all('USERS').length, 0);
    const local = await dataOf(r, 'auth.openLocal');
    const other = await dataOf(r, 'auth.openLocal');
    assert.equal((await dataOf(r, 'meta.bootstrap', {}, local.token)).loginMode, 'SINGLE');
    assert.equal((await r.handle('auth.setLoginMode', { mode: 'ACCOUNT', ...owner })).error.code, 'SESSION_EXPIRED');
    const before = await ctx.svc.backup.backup({ kind: 'manual', user: local.user });
    await dataOf(r, 'auth.setLoginMode', { mode: 'ACCOUNT', ...owner }, local.token);
    assert.equal((await r.handle('auth.me', {}, other.token)).error.code, 'SESSION_EXPIRED');
    assert.equal((await r.handle('auth.openLocal')).error.code, 'FORBIDDEN');
    assert.equal((await r.handle('auth.setFirstPassword', { username: owner.username, newPassword: 'KhongDung2026' })).error.code, 'FORBIDDEN');
    assert.ok(!JSON.stringify(ctx.store.all('USERS')).includes(owner.password));
    assert.equal(ctx.store.all('USERS').length, 1);
    ctx.close();
    ctx.open();
    await ctx.migrated;
    assert.equal((await dataOf(r, 'setup.status')).loginMode, 'ACCOUNT');
    const { token } = await dataOf(r, 'auth.login', owner);
    assert.equal((await r.handle('auth.setLoginMode', { mode: 'SINGLE', ...owner, username: 'nguoi.khac' }, token)).error.code, 'AUTH_FAILED');
    assert.equal((await r.handle('auth.setLoginMode', { mode: 'SINGLE', ...owner, password: 'KhongDung2026' }, token)).error.code, 'AUTH_FAILED');
    assert.equal((await dataOf(r, 'setup.status')).loginMode, 'ACCOUNT');
    await dataOf(r, 'data.restore', { file: before.file, reason: 'Kiểm tra khôi phục' }, token);
    assert.equal((await dataOf(r, 'setup.status')).loginMode, 'ACCOUNT');
    assert.equal((await r.handle('auth.openLocal')).error.code, 'FORBIDDEN');
    const session = await dataOf(r, 'auth.login', owner);
    await dataOf(r, 'auth.setLoginMode', { mode: 'SINGLE', ...owner }, session.token);
    assert.equal((await r.handle('auth.me', {}, session.token)).error.code, 'SESSION_EXPIRED');
    assert.equal((await r.handle('auth.login', owner)).error.code, 'AUTH_FAILED');
    assert.equal((await dataOf(r, 'auth.openLocal')).user.role, 'ADMIN');
  });

  test(`Cài mới bằng tài khoản bắt buộc mật khẩu và giữ chế độ khi gắn lại kho (${kind})`, async (t) => {
    const { ctx, r, dataFolder } = fixture(t, kind);
    const install = { dataFolder, unitCode: 'DH', loginMode: 'ACCOUNT' };
    assert.equal((await r.handle('setup.init', { ...install, account: { username: owner.username } })).error.code, 'VALIDATION_FAILED');
    assert.equal(fs.existsSync(dataFolder), false);
    await dataOf(r, 'setup.init', { ...install, account: owner });
    assert.deepEqual(ctx.store.all('USERS').map((u) => u.username), [owner.username]);
    assert.equal((await r.handle('users.save', {})).error.code, 'NOT_FOUND');
    ctx.close();
    await dataOf(r, 'setup.init', { mode: 'ATTACH', dataFolder, loginMode: 'SINGLE' });
    assert.equal((await r.handle('auth.openLocal')).error.code, 'FORBIDDEN');
    assert.ok((await dataOf(r, 'auth.login', owner)).token);
  });
}

test('Dữ liệu từ bản cũ giữ yêu cầu đăng nhập cho đến khi quản trị viên nhập lại mật khẩu', async (t) => {
  const { ctx, r, dataFolder } = fixture(t, 'json');
  const username = 'phuthuy.apple@gmail.com';
  await ctx.init({ unitCode: 'DH', dataFolder });
  const { token } = await dataOf(r, 'auth.setFirstPassword', { username, newPassword: owner.password });
  assert.equal((await dataOf(r, 'setup.status')).loginMode, 'LEGACY');
  assert.equal((await r.handle('auth.openLocal')).error.code, 'FORBIDDEN');
  assert.equal((await r.handle('auth.setLoginMode', { mode: 'SINGLE', username, password: 'KhongDung2026' }, token)).error.code, 'AUTH_FAILED');
  const local = await dataOf(r, 'auth.setLoginMode', { mode: 'SINGLE', username, password: owner.password }, token);
  await dataOf(r, 'auth.setLoginMode', { mode: 'ACCOUNT', ...owner }, local.token);
  assert.equal((await r.handle('auth.login', { username, password: owner.password })).error.code, 'AUTH_FAILED');
  assert.ok((await dataOf(r, 'auth.login', owner)).token);
});

test('Chuyển kho JSON → SQLite → xuất JSON giữ chế độ đăng nhập và tài khoản', { skip: !storageKinds().includes('sqlite') }, async (t) => {
  const { migrateJsonToSqlite, exportSqliteToJson } = require('../main/repo/migrate/migrate');
  const { ctx, r, dataFolder } = fixture(t, 'json');
  await dataOf(r, 'setup.init', { dataFolder, unitCode: 'DH', loginMode: 'ACCOUNT', account: owner });
  ctx.close();
  await migrateJsonToSqlite({ root: dataFolder, backup: false });
  const dest = path.join(path.dirname(dataFolder), 'export-json');
  await exportSqliteToJson({ root: dataFolder, dest });
  await dataOf(r, 'setup.init', { mode: 'ATTACH', dataFolder: dest });
  assert.equal((await r.handle('auth.openLocal')).error.code, 'FORBIDDEN');
  assert.ok((await dataOf(r, 'auth.login', owner)).token);
});
