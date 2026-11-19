'use strict';
/** P1 (1.6.1): users.save có khóa lạc quan — hai ADMIN sửa cùng một người dùng, người sau nhận CONFLICT_VERSION. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./install');
const { AuthService } = require('../main/services/AuthService');

test('Hai ADMIN sửa cùng lúc: người sau (rowVersion cũ) bị CONFLICT_VERSION; danh sách trả rowVersion', async () => {
  const ctx = await install('DH', { withData: false });
  const auth = new AuthService(ctx.store);
  const A = { username: 'admin.a' }; const B = { username: 'admin.b' };
  await auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Kế toán X', role: 'KE_TOAN', unitCode: 'DH' }, user: A });
  const seenByA = auth.listUsers().items.find((u) => u.username === 'ketoan.x'); const seenByB = auth.listUsers().items.find((u) => u.username === 'ketoan.x');
  assert.ok(Number.isInteger(seenByA.rowVersion), 'danh sách người dùng có rowVersion');
  const ok = await auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Do A sửa', role: 'KE_TOAN', unitCode: 'DH' }, rowVersion: seenByA.rowVersion, user: A });
  assert.equal(ok.record.fullName, 'Do A sửa'); assert.ok(ok.record.rowVersion > seenByA.rowVersion);
  await assert.rejects(auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Do B sửa', role: 'XEM', unitCode: 'DH' }, rowVersion: seenByB.rowVersion, user: B }), (e) => e.code === 'CONFLICT_VERSION');
  assert.equal(ctx.store.get('USERS', 'ketoan.x').full_name, 'Do A sửa', 'bản của A không bị B ghi đè');
  // lấy lại bản mới thì B lưu được
  const fresh = auth.listUsers().items.find((u) => u.username === 'ketoan.x');
  assert.equal((await auth.saveUser({ record: { username: 'ketoan.x', fullName: 'Do B sửa', role: 'XEM', unitCode: 'DH' }, rowVersion: fresh.rowVersion, user: B })).record.role, 'XEM');
});
