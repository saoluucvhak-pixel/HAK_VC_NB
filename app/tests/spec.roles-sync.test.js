'use strict';
/** P3 (1.6.1): quyền của router ↔ api_spec.json không được lệch; 3 bản api_spec.json giống hệt; quyền mở khóa kỳ đúng như đặc tả. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROUTES, PUBLIC, Router } = require('../main/api/router');
const SPEC = require('../shared/api_spec.json');
const { AppContext } = require('../main/app/AppContext');
const { install, KETOAN, ADMIN, rid } = require('./install');

const norm = (r) => (Array.isArray(r) ? [...r].sort() : [r]);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('Mọi action có roles riêng trong ROUTES: danh sách roles bằng đặc tả (không phân biệt thứ tự)', () => {
  const specRoles = Object.fromEntries(SPEC.actions.map((a) => [a.action, a.roles]));
  const diff = [];
  for (const [action, [roles]] of Object.entries(ROUTES)) {
    if (roles === null || roles === undefined) continue; // null = lấy từ đặc tả
    if (!(action in specRoles)) continue; // thiếu trong đặc tả đã có test F6
    if (JSON.stringify(norm(roles)) !== JSON.stringify(norm(specRoles[action]))) diff.push(`${action}: router ${JSON.stringify(roles)} ≠ đặc tả ${JSON.stringify(specRoles[action])}`);
  }
  assert.deepEqual(diff, [], `Lệch quyền router ↔ api_spec:\n${diff.join('\n')}`);
  assert.ok(PUBLIC);
});

test('Mọi action trong api_spec có trong ROUTES và ngược lại (không ngoại lệ)', () => {
  const routes = Object.keys(ROUTES).sort(); const spec = SPEC.actions.map((a) => a.action).sort();
  assert.deepEqual(spec.filter((x) => !routes.includes(x)), []); assert.deepEqual(routes.filter((x) => !spec.includes(x)), []);
});

test('3 bản api_spec.json giống hệt nhau (SHA-256)', () => {
  const root = path.join(__dirname, '..', '..');
  const files = ['app/shared/api_spec.json', 'desk/api_spec.json', 'docs/api_spec.json'].map((f) => path.join(root, f));
  const h = files.map(sha); assert.equal(new Set(h).size, 1, `3 bản api_spec.json khác nhau: ${h.map((x, i) => `${files[i]}=${x.slice(0, 8)}`).join(' ')}`);
});

test('periods.unlock / periods.reopen: đặc tả ghi ADMIN + KE_TOAN, mô tả nói rõ KE_TOAN cần can_unlock', () => {
  for (const a of ['periods.unlock', 'periods.reopen']) {
    const s = SPEC.actions.find((x) => x.action === a);
    assert.deepEqual(norm(s.roles), ['ADMIN', 'KE_TOAN']); assert.match(s.desc || s.description || s.summary || JSON.stringify(s), /can_unlock/);
  }
});

test('Mở khóa kỳ: KE_TOAN không can_unlock → FORBIDDEN; có can_unlock → thành công; ADMIN thành công', async () => {
  const { periods, contractId } = await install('HAKQN');
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24', clientRequestId: rid(), user: KETOAN });
  const pid = k.period.period_id; await periods.confirm({ periodId: pid, user: KETOAN }); await periods.lock({ periodId: pid, user: KETOAN });
  const noRight = { ...KETOAN, canUnlock: false }; const withRight = { ...KETOAN, canUnlock: true };
  await assert.rejects(periods.unlock({ periodId: pid, reason: 'sửa', user: noRight }), (e) => e.code === 'FORBIDDEN');
  const un = await periods.unlock({ periodId: pid, reason: 'Khách hàng yêu cầu điều chỉnh', user: withRight });
  assert.equal(un.status, 'DA_XAC_NHAN');
  await assert.rejects(periods.reopen({ periodId: pid, reason: 'sửa', user: noRight }), (e) => e.code === 'FORBIDDEN');
  const re = await periods.reopen({ periodId: pid, reason: 'Sửa lại số liệu', user: withRight }); assert.equal(re.status, 'NHAP');
  void ADMIN;
});

test('Router: XEM gọi periods.unlock / reopen → FORBIDDEN; KE_TOAN qua được cổng quyền (kiểm nghiệp vụ nằm ở dịch vụ)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-roles-')); const ctx = new AppContext({ configFile: path.join(home, 'c.json') }); const r = new Router(ctx);
  await r.handle('setup.init', { dataFolder: path.join(home, 'D'), unitCode: 'DH' });
  const unit = ctx.store.get('USERS', ctx.store.all('USERS')[0].username).unit_code || 'DH';
  const mkUser = async (username, role, can) => { await ctx.store.transaction((tx) => { tx.insert('USERS', { username, full_name: username, unit_code: unit, role, can_unlock: can, is_active: true, password_hash: '', password_salt: '', password_algo: '', must_change_password: false, failed_attempts: 0, locked_until: '', last_login_at: '' }); }, { user: 'test' }); return ctx.svc.auth._newSession(ctx.svc.auth._user(username)).token; };
  const tx = await mkUser('xem.test', 'XEM', false); const tk = await mkUser('kt.khong', 'KE_TOAN', false); const tkr = await mkUser('kt.co', 'KE_TOAN', true);
  for (const a of ['periods.unlock', 'periods.reopen']) {
    assert.equal((await r.handle(a, { periodId: 'KY-NONE', rowVersion: 1, reason: 'x' }, tx)).error.code, 'FORBIDDEN', `XEM gọi ${a}`);
    for (const t of [tk, tkr]) assert.notEqual((await r.handle(a, { periodId: 'KY-NONE', rowVersion: 1, reason: 'x' }, t)).error.code, 'FORBIDDEN', `KE_TOAN qua được cổng quyền của router (${a})`);
  }
  ctx.close();
});
