'use strict';
/** P1 (1.6.1): mã kích hoạt dùng một lần cho "đặt mật khẩu lần đầu" — chặn chiếm tài khoản, vẫn cho ADMIN đầu tiên của bản cài mới tự khởi động. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./install');
const { AuthService } = require('../main/services/AuthService');

const PW = 'HakGroup2026';
const ADMIN_USER = { username: 'admin.root' };
async function setup() {
  const ctx = await install('DH', { withData: false });
  const clock = { t: Date.parse('2026-11-19T08:00:00Z') };
  const auth = new AuthService(ctx.store, { now: () => clock.t });
  const admins = ctx.store.find('USERS', (u) => u.role === 'ADMIN' && u.is_active).map((u) => u.username);
  assert.ok(admins.length >= 2, 'dữ liệu mẫu có ≥ 2 ADMIN');
  return { ...ctx, auth, clock, admins };
}
const rejects = (p, code) => assert.rejects(p, (e) => (code ? e.code === code : true));
const mk = (s, username = 'ketoan.moi', role = 'KE_TOAN') => s.auth.saveUser({ record: { username, fullName: 'Kế toán mới', role, unitCode: 'DH' }, user: ADMIN_USER });

test('Bản cài mới: ADMIN đầu tiên đặt mật khẩu không cần mã; ADMIN thứ hai sau đó KHÔNG đặt được nếu thiếu mã', async () => {
  const s = await setup();
  assert.equal(s.auth.firstAdminOpen(), true);
  const r = await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  assert.ok(r.token); assert.equal(s.auth.firstAdminOpen(), false);
  await rejects(s.auth.setFirstPassword({ username: s.admins[1], newPassword: PW }), 'AUTH_FAILED');
  assert.equal(s.store.get('USERS', s.admins[1]).password_hash, '', 'tài khoản chưa bị đặt mật khẩu');
});

test('Tạo người dùng → trả mã 8 ký tự một lần, hạn 24 giờ; không lưu mã gốc; không có mã trong audit', async () => {
  const s = await setup(); await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  const out = await mk(s);
  assert.match(out.setupCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/, 'bảng chữ không có 0/O/1/I/L');
  assert.equal(out.setupCodeExpiresAt, new Date(s.clock.t + 24 * 3600000).toISOString());
  const row = s.store.get('USERS', 'ketoan.moi');
  assert.ok(row.setup_code_hash && row.setup_code_salt && row.setup_code_expires_at);
  const dump = JSON.stringify({ users: s.store.all('USERS'), audit: s.store.all('AUDIT_LOG') });
  assert.ok(!dump.includes(out.setupCode), 'mã gốc không nằm trong USERS / AUDIT_LOG');
  assert.equal(s.auth.listUsers().items.find((u) => u.username === 'ketoan.moi').setupCode, undefined, 'danh sách người dùng không lộ mã');
});

test('Thiếu mã / sai mã / mã hết hạn bị từ chối; đúng mã thành công và KHÔNG dùng lại được', async () => {
  const s = await setup(); await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  const { setupCode } = await mk(s);
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW }), 'AUTH_FAILED');
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: 'AAAAAAAA' }), 'AUTH_FAILED');
  s.clock.t += 25 * 3600000; // quá 24 giờ
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode }), 'AUTH_FAILED');
  s.clock.t -= 25 * 3600000;
  const weak = s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: 'abc', setupCode }); await rejects(weak, 'VALIDATION_FAILED');
  assert.ok(s.store.get('USERS', 'ketoan.moi').setup_code_hash, 'mật khẩu yếu không làm mất mã');
  const ok = await s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: setupCode.toLowerCase() });
  assert.ok(ok.token);
  const row = s.store.get('USERS', 'ketoan.moi'); assert.equal(row.setup_code_hash, ''); assert.equal(row.setup_code_salt, ''); assert.equal(row.setup_code_expires_at, '');
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: 'Khac12345', setupCode }), 'FORBIDDEN');
});

test('ADMIN đặt lại mật khẩu → mã mới; mã cũ vô hiệu; không có mã gốc trong audit', async () => {
  const s = await setup(); await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  const first = await mk(s); await s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: first.setupCode });
  const rs = await s.auth.resetPassword({ username: 'ketoan.moi', user: ADMIN_USER });
  assert.match(rs.setupCode, /^[A-Z2-9]{8}$/); assert.ok(rs.setupCodeExpiresAt); assert.equal(rs.mustSetPassword, true);
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW }), 'AUTH_FAILED');
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: first.setupCode }), 'AUTH_FAILED');
  assert.ok(!JSON.stringify(s.store.all('AUDIT_LOG')).includes(rs.setupCode));
  assert.ok((await s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: rs.setupCode })).token);
});

test('Sai mã quá LOGIN_MAX_FAILED lần → khóa tài khoản (đúng mã cũng bị từ chối khi đang khóa)', async () => {
  const s = await setup(); await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  const { setupCode } = await mk(s);
  let last;
  for (let i = 0; i < 5; i += 1) last = await s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode: 'ZZZZZZZZ' }).catch((e) => e);
  assert.equal(last.code, 'ACCOUNT_LOCKED');
  await rejects(s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode }), 'ACCOUNT_LOCKED');
  s.clock.t += 16 * 60000; // hết khóa 15 phút
  assert.ok((await s.auth.setFirstPassword({ username: 'ketoan.moi', newPassword: PW, setupCode })).token);
});

test('Tài khoản đã có mật khẩu đăng nhập bình thường; cấu hình SETUP_CODE_HOURS đổi được hạn mã', async () => {
  const s = await setup(); await s.auth.setFirstPassword({ username: s.admins[0], newPassword: PW });
  assert.ok((await s.auth.login({ username: s.admins[0], password: PW })).token);
  await s.store.transaction((tx) => { tx.insert('CONFIG', { config_key: 'SETUP_CODE_HOURS', config_value: '2', value_type: 'NUM', description: 'thử' }); }, { user: 'test' });
  const out = await mk(s, 'xem.moi', 'XEM');
  assert.equal(out.setupCodeExpiresAt, new Date(s.clock.t + 2 * 3600000).toISOString());
});

test('SINGLE_USER_MODE: chỉ gợi ý tên đăng nhập khi TRUE và chỉ có 1 tài khoản hoạt động', async () => {
  const s = await setup();
  assert.equal(s.auth.singleUserName(), '');
  const only = s.store.all('USERS').map((u) => u.username);
  await s.store.transaction((tx) => { for (const u of only.slice(1)) tx.update('USERS', u, { is_active: false }); tx.insert('CONFIG', { config_key: 'SINGLE_USER_MODE', config_value: 'TRUE', value_type: 'TEXT', description: 'thử' }); }, { user: 'test' });
  assert.equal(s.auth.singleUserName(), only[0]);
  await s.store.transaction((tx) => { tx.update('USERS', only[1], { is_active: true }); }, { user: 'test' });
  assert.equal(s.auth.singleUserName(), '');
});
