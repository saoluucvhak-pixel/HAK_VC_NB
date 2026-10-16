'use strict';
/**
 * Bước 15 — đầu-cuối qua đúng cửa API của giao diện (Router): 1 bộ cài cho mọi nhà máy.
 * Khởi tạo nhiều bản cài (HAKQN, ĐH, HAK, CNHAK) → đăng nhập → import file Excel gốc → tính → xác nhận → gói KY_TINH ĐH → HAKQN
 * → sửa danh mục ở 1 nhà máy → nhắc các nhà máy còn lại → gói DANH_MUC → nhà máy khác nhận → sao lưu / khôi phục.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppContext } = require('../main/app/AppContext');
const { Router } = require('../main/api/router');
const { FILE } = require('./install');

const PW = 'HakGroup2026';
const ADMIN = 'phuthuy.apple@gmail.com';
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc15-${p}-`));

/** 1 máy = 1 AppContext + Router (như 1 bản cài Electron). */
async function machine(unitCode, { mirror = '' } = {}) {
  const home = tmp(unitCode);
  const ctx = new AppContext({ configFile: path.join(home, 'userData', 'dgvc-config.json') });
  const r = new Router(ctx);
  let token = '';
  const call = async (action, payload = {}) => r.handle(action, payload, token);
  const ok = async (action, payload) => { const x = await call(action, payload); assert.equal(x.ok, true, `${action}: ${x.error && `${x.error.code} ${x.error.message}`}`); return x.data; };
  const st = await ok('setup.status');
  assert.equal(st.initialized, false);
  const init = await ok('setup.init', { dataFolder: path.join(home, 'DGVC_DATA'), unitCode, mirrorFolder: mirror });
  assert.equal(init.unitCode, unitCode);
  const login = await ok('auth.setFirstPassword', { username: ADMIN, newPassword: PW });
  token = login.token;
  return { ctx, r, call, ok, home, setToken: (t) => { token = t; } };
}

test('1 bộ cài cho mọi nhà máy: chọn đơn vị lúc khởi tạo, chỉ nhận hợp đồng mình là 1 bên', async () => {
  const ctx = new AppContext({ configFile: path.join(tmp('x'), 'c.json') });
  const units = ctx.installableUnits();
  assert.deepEqual(units.map((u) => u.unitCode).slice(0, 4), ['HAK', 'HAKQN', 'DH', 'CNHAK']);
  const expect = { HAKQN: ['DH-HAKQN', 'HAK-HAKQN', 'HAKQN-QS'], DH: ['DH-HAKQN'], HAK: ['HAK-HAKQN'], CNHAK: ['HAKQN-QS'] };
  for (const [u, codes] of Object.entries(expect)) {
    const m = await machine(u);
    const b = await m.ok('meta.bootstrap');
    assert.equal(b.install.unitCode, u);
    assert.deepEqual(b.contracts.map((c) => c.contract_code).sort(), codes);
    if (u === 'CNHAK') assert.equal(b.contracts[0].role, 'CUSTOMER');
    assert.equal(b.routes.length, 12, 'danh mục tuyến đi kèm bản cài');
    // khởi tạo lần 2 bị chặn
    assert.equal((await m.call('setup.init', { dataFolder: path.join(m.home, 'X'), unitCode: u })).error.code, 'FORBIDDEN');
    m.ctx.close();
  }
});

test('Đăng nhập: chưa có mật khẩu → đặt lần đầu; mật khẩu yếu bị từ chối; sai 5 lần khóa 15 phút; phiên bắt buộc; quyền theo vai trò', async () => {
  const home = tmp('auth'); const ctx = new AppContext({ configFile: path.join(home, 'c.json') }); const r = new Router(ctx);
  await r.handle('setup.init', { dataFolder: path.join(home, 'D'), unitCode: 'DH' });
  assert.deepEqual((await r.handle('setup.status')).data.usersNeedPassword.sort(), ['phuthuy.apple@gmail.com', 'saoluucvhak@gmail.com']);
  assert.equal((await r.handle('auth.login', { username: ADMIN, password: 'x' })).error.code, 'PASSWORD_NOT_SET');
  assert.equal((await r.handle('auth.setFirstPassword', { username: ADMIN, newPassword: 'abc' })).error.code, 'VALIDATION_FAILED');
  const t = (await r.handle('auth.setFirstPassword', { username: ADMIN, newPassword: PW })).data.token;
  assert.equal((await r.handle('periods.list', {})).error.code, 'SESSION_EXPIRED');
  assert.equal((await r.handle('periods.list', {}, t)).ok, true);
  // ADMIN tạo tài khoản XEM và KẾ TOÁN cho đơn vị
  assert.equal((await r.handle('users.save', { record: { username: 'xem.dh', fullName: 'Người xem', role: 'XEM', unitCode: 'DH' } }, t)).ok, true);
  assert.equal((await r.handle('users.save', { record: { username: 'ketoan.dh', fullName: 'Kế toán ĐH', role: 'KE_TOAN', unitCode: 'DH' } }, t)).ok, true);
  const tx = (await r.handle('auth.setFirstPassword', { username: 'xem.dh', newPassword: 'Xem12345' })).data.token;
  assert.equal((await r.handle('periods.list', {}, tx)).ok, true, 'XEM xem được');
  assert.equal((await r.handle('import.preview', { importType: 'PHIEU_CAN', filePath: FILE.DH }, tx)).error.code, 'FORBIDDEN', 'XEM không import được');
  assert.equal((await r.handle('users.list', {}, tx)).error.code, 'FORBIDDEN');
  const tk = (await r.handle('auth.setFirstPassword', { username: 'ketoan.dh', newPassword: 'Ketoan2026' })).data.token;
  assert.equal((await r.handle('users.save', { record: { username: 'x1', role: 'ADMIN' } }, tk)).error.code, 'FORBIDDEN', 'kế toán không tạo user');
  // sai mật khẩu 5 lần → khóa
  for (let i = 1; i <= 4; i++) assert.match((await r.handle('auth.login', { username: 'ketoan.dh', password: 'sai' })).error.message, new RegExp(`còn ${5 - i} lần`));
  const locked = await r.handle('auth.login', { username: 'ketoan.dh', password: 'sai' });
  assert.equal(locked.error.code, 'ACCOUNT_LOCKED');
  assert.equal((await r.handle('auth.login', { username: 'ketoan.dh', password: 'Ketoan2026' })).error.code, 'ACCOUNT_LOCKED', 'đúng mật khẩu vẫn bị khóa trong 15 phút');
  // ADMIN đặt lại mật khẩu → user tự đặt lại
  assert.equal((await r.handle('users.resetPassword', { username: 'ketoan.dh' }, t)).ok, true);
  assert.equal((await r.handle('auth.login', { username: 'ketoan.dh', password: 'Ketoan2026' })).error.code, 'PASSWORD_NOT_SET');
  // đổi mật khẩu, đăng xuất
  assert.equal((await r.handle('auth.changePassword', { oldPassword: PW, newPassword: 'MoiMoi2026' }, t)).ok, true);
  assert.equal((await r.handle('auth.login', { username: ADMIN, password: PW })).error.code, 'AUTH_FAILED');
  const t2 = (await r.handle('auth.login', { username: ADMIN, password: 'MoiMoi2026' })).data.token;
  await r.handle('auth.logout', {}, t2);
  assert.equal((await r.handle('auth.me', {}, t2)).error.code, 'SESSION_EXPIRED');
  const users = JSON.stringify(ctx.store.all('USERS'));
  assert.ok(!users.includes(PW) && !users.includes('MoiMoi2026'), 'không lưu mật khẩu gốc');
  ctx.close();
});

test('Luồng thật qua API: ĐH import → tính → xác nhận → gửi gói kỳ → HAKQN nhận (chỉ xem), in lại BKVC', async () => {
  const dh = await machine('DH');
  const pv = await dh.ok('import.preview', { importType: 'PHIEU_CAN', filePath: FILE.DH });
  await dh.ok('import.confirm', { batchId: pv.batchId, acceptWarnings: true });
  const pf = await dh.ok('import.preview', { importType: 'GIAO_NHAN_DAU', contractId: 'HD-DH-HAKQN', filePath: FILE.DH });
  await dh.ok('import.confirm', { batchId: pf.batchId, acceptWarnings: true });
  await dh.ok('tickets.bulkUpdateDescriptive', { field: 'ldd', fromValue: 'UTXK/ĐN-QS/0526', toValue: 'UTXK/ĐN-QS/0726', reason: 'Chốt LDĐ 0726' });
  const k = await dh.ok('periods.calculate', { contractId: 'HD-DH-HAKQN', dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', reportDate: '2026-09-24' });
  assert.equal(k.results[0].transportPrice, 88900);
  await dh.ok('periods.confirm', { periodId: k.period.period_id });
  const x = await dh.ok('reports.export', { report: 'BKVC', format: 'XLSX', params: { periodId: k.period.period_id } });
  assert.ok(fs.existsSync(x.path));
  const dash = await dh.ok('dashboard.summary', { dateFrom: '2026-09-18', dateTo: '2026-09-23' });
  assert.equal(dash.kpi.trips, 77); assert.equal(dash.kpi.avgTransportPrice, 88900);
  const pkg = await dh.ok('exchange.exportPackage', { packageType: 'KY_TINH', periodIds: [k.period.period_id] });
  assert.equal(pkg.header.targetUnitCode, 'HAKQN');

  const qn = await machine('HAKQN');
  const pr = await qn.ok('exchange.previewPackage', { filePath: pkg.file });
  assert.equal(pr.integrity, 'OK'); assert.equal(pr.canImport, true);
  assert.equal(pr.summary.KY_TINH.NEW, 1); assert.equal(pr.summary.PHIEU_CAN.NEW, 77); assert.equal(pr.summary.GIAO_NHAN_DAU.NEW, 16);
  assert.equal(pr.totals.prices[0].transportPrice, 88900); assert.equal(pr.totals.totalInclVat, 139421905);
  const im = await qn.ok('exchange.importPackage', { previewId: pr.previewId });
  assert.ok(im.safetyBackup && fs.existsSync(im.safetyBackup), 'sao lưu an toàn trước khi nhập gói');
  const list = await qn.ok('periods.list', {});
  const got = list.items.find((p) => p.period_id === k.period.period_id);
  assert.equal(got.origin, 'IMPORTED'); assert.equal(got.role, 'CUSTOMER'); assert.equal(got.totalInclVat, 139421905);
  const b = await qn.ok('reports.bkvc', { periodId: got.period_id });
  assert.equal(b.totals.total, 139421905); assert.equal(b.header.origin, 'IMPORTED');
  // bản cài nhận không sửa được kỳ đó
  assert.equal((await qn.call('periods.cancel', { periodId: got.period_id, reason: 'x' })).error.details.code, 'E_READONLY_IMPORTED');
  // nhập lại cùng gói: mọi thứ đã có
  const again = await qn.ok('exchange.previewPackage', { filePath: pkg.file });
  assert.equal(again.summary.KY_TINH.SAME, 1); assert.equal(again.summary.PHIEU_CAN.SAME, 77);
  // gói bị sửa → từ chối
  const zlib = require('node:zlib'); const bad = JSON.parse(zlib.gunzipSync(fs.readFileSync(pkg.file)));
  bad.tables.BKVC_LINE[0].amount += 1000; const bf = path.join(qn.home, 'bad.dgvc'); fs.writeFileSync(bf, zlib.gzipSync(JSON.stringify(bad)));
  assert.equal((await qn.call('exchange.previewPackage', { filePath: bf })).error.code, 'INTEGRITY_ERROR');
  // gói kỳ gửi nhầm cho bản cài không phải bên thuê → từ chối
  const hak = await machine('HAK');
  const wrong = await hak.ok('exchange.previewPackage', { filePath: pkg.file });
  assert.equal(wrong.canImport, false); assert.match(wrong.rejected[0].note, /không phải bên thuê/);
  for (const m of [dh, qn, hak]) m.ctx.close();
});

test('Sửa danh mục ở BẤT KỲ nhà máy nào → nhắc sửa các nhà máy còn lại; gửi gói danh mục → tự đánh dấu đã nhận', async () => {
  const hak = await machine('HAK'); const dh = await machine('DH'); const qn = await machine('HAKQN');
  // HAK (không phải HAKQN) thêm tuyến + sửa điểm đến tuyến VC.007
  const add = await hak.ok('routes.save', { create: true, record: { routeCode: 'VC.016', routeName: 'Bà Nà - Cảng Liên Chiểu', distanceKm: 20, fromPlace: 'NM dăm gỗ Bà Nà', toPlace: 'Cảng Liên Chiểu' } });
  assert.equal(add.warnings[0].code, 'I_SYNC_REMINDER');
  const r7 = hak.ctx.store.get('TUYEN_VC', 'VC.007');
  await hak.ok('routes.save', { record: { routeCode: 'VC.007', toPlace: 'Cảng Tiên Sa, TP Đà Nẵng' }, rowVersion: r7.row_version });
  let sync = await hak.ok('sync.list', {});
  assert.equal(sync.total, 2); assert.deepEqual(sync.pendingByUnit, { HAKQN: 2, DH: 2, CNHAK: 2 });
  const dash = await hak.ok('dashboard.summary', {});
  assert.equal(dash.todo.filter((t) => t.kind === 'SYNC_REMINDER').length, 3);
  // HAK gửi gói danh mục cho ĐH → ĐH đánh dấu xong; HAKQN, CNHAK còn chờ
  const p1 = await hak.ok('exchange.exportPackage', { packageType: 'DANH_MUC', targetUnitCode: 'DH' });
  assert.equal(p1.remindersMarked, 2);
  sync = await hak.ok('sync.list', {}); assert.deepEqual(sync.pendingByUnit, { HAKQN: 2, CNHAK: 2 });
  // ĐH nhận: tuyến mới + tuyến sửa
  const pv = await dh.ok('exchange.previewPackage', { filePath: p1.file });
  assert.equal(pv.summary.TUYEN_VC.NEW, 1); assert.equal(pv.summary.TUYEN_VC.UPDATE, 1); assert.equal(pv.conflicts.length, 0);
  await dh.ok('exchange.importPackage', { previewId: pv.previewId });
  assert.equal(dh.ctx.store.get('TUYEN_VC', 'VC.016').route_name, 'Bà Nà - Cảng Liên Chiểu');
  assert.equal(dh.ctx.store.get('TUYEN_VC', 'VC.007').to_place, 'Cảng Tiên Sa, TP Đà Nẵng');
  assert.equal(dh.ctx.store.all('HOP_DONG').length, 1, 'chỉ nhận hợp đồng liên quan ĐH');
  // HAKQN sửa tay (không qua gói) → HAK đánh dấu "đã sửa ở HAKQN"
  await hak.ok('sync.markDone', { unitCode: 'HAKQN', note: 'Đã gọi điện, HAKQN tự sửa' });
  sync = await hak.ok('sync.list', {}); assert.deepEqual(sync.pendingByUnit, { CNHAK: 2 });
  // xung đột: HAKQN và HAK cùng sửa VC.016 → HAKQN nhận gói của HAK: bản HAKQN sửa sau → giữ bản mình (mặc định)
  const pq = await qn.ok('exchange.previewPackage', { filePath: (await hak.ok('exchange.exportPackage', { packageType: 'DANH_MUC', targetUnitCode: 'HAKQN' })).file });
  await qn.ok('exchange.importPackage', { previewId: pq.previewId });
  const q16 = qn.ctx.store.get('TUYEN_VC', 'VC.016');
  await new Promise((res) => setTimeout(res, 1100));
  await qn.ok('routes.save', { record: { routeCode: 'VC.016', note: 'HAKQN ghi chú' }, rowVersion: q16.row_version });
  const h16 = hak.ctx.store.get('TUYEN_VC', 'VC.016');
  await hak.ok('routes.save', { record: { routeCode: 'VC.016', distanceKm: 21 }, rowVersion: h16.row_version });
  const pc = await qn.ok('exchange.previewPackage', { filePath: (await hak.ok('exchange.exportPackage', { packageType: 'DANH_MUC', targetUnitCode: 'HAKQN' })).file });
  const conflict = pc.conflicts.find((c) => c.table === 'TUYEN_VC' && c.id === 'VC.016');
  assert.ok(conflict, 'hai bên cùng sửa → xung đột');
  await qn.ok('exchange.importPackage', { previewId: pc.previewId, decisions: { 'TUYEN_VC:VC.016': 'TAKE' } });
  assert.equal(qn.ctx.store.get('TUYEN_VC', 'VC.016').distance_km, 21, 'người dùng chọn lấy bản đến');
  for (const m of [hak, dh, qn]) m.ctx.close();
});

test('Sao lưu: ngay / tự động hằng ngày / chép ra USB-Google Drive; khôi phục có kiểm SHA-256 và bản an toàn', async () => {
  const usb = tmp('usb');
  const m = await machine('HAKQN', { mirror: usb });
  const b = await m.ok('data.backupNow', { note: 'truoc khi thu' });
  assert.ok(fs.existsSync(b.file)); assert.equal(b.mirrored.ok, true); assert.ok(fs.existsSync(b.mirrored.path));
  assert.ok(fs.readdirSync(path.join(m.ctx.store.root, 'backups', 'daily')).length >= 1, 'bản hằng ngày tự tạo sau lần gọi API đầu tiên trong ngày');
  // thay đổi dữ liệu sau khi sao lưu
  const r = m.ctx.store.get('TUYEN_VC', 'VC.007');
  await m.ok('routes.save', { record: { routeCode: 'VC.007', routeName: 'ĐỔI TÊN SAU SAO LƯU' }, rowVersion: r.row_version });
  assert.equal(m.ctx.store.get('TUYEN_VC', 'VC.007').route_name, 'ĐỔI TÊN SAU SAO LƯU');
  assert.equal((await m.call('data.restore', { file: b.file })).error.code, 'VALIDATION_FAILED', 'phải có lý do');
  const res = await m.ok('data.restore', { file: b.file, reason: 'Thử khôi phục' });
  assert.ok(fs.existsSync(res.safetyBackup));
  assert.equal(m.ctx.store.get('TUYEN_VC', 'VC.007').route_name, 'Xã Quế Sơn - Tiên Sa', 'dữ liệu trở về lúc sao lưu');
  assert.equal((await m.call('auth.me')).ok, true, 'vẫn đăng nhập sau khôi phục');
  // file sao lưu hỏng → không khôi phục
  const AdmZip = require('adm-zip'); const z = new AdmZip(b.file); z.updateFile('tables/TUYEN_VC.json', Buffer.from('{"hack":1}')); const bad = path.join(m.home, 'bad.zip'); z.writeZip(bad);
  assert.equal((await m.call('data.restore', { file: bad, reason: 'x' })).error.code, 'INTEGRITY_ERROR');
  const list = await m.ok('data.listBackups', {});
  assert.ok(list.items.some((i) => i.kind === 'safety')); assert.equal(list.warning, null);
  m.ctx.close();
});

test('Cập nhật phiên bản: tham số CONFIG mới của bản cài được tự thêm vào dữ liệu cũ khi mở (không đổi giá trị đang có)', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { AppContext, CATALOG_FILE } = require('../main/app/AppContext');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  const ctx = new AppContext({ configFile: path.join(d, 'cfg.json') });
  await ctx.init({ dataFolder: path.join(d, 'data'), unitCode: 'DH' }); await ctx.migrated; ctx.close();
  const cat = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  cat.tables.CONFIG.push({ ...cat.tables.CONFIG.find((c) => c.config_key === 'VAT_RATE_OPTIONS'), config_key: 'NEW_KEY_TEST', config_value: 'X' });
  const cf = path.join(d, 'catalog.json'); fs.writeFileSync(cf, JSON.stringify(cat));
  const ctx2 = new AppContext({ configFile: path.join(d, 'cfg.json'), catalogFile: cf });
  ctx2.open(); await ctx2.migrated;
  const assert = require('node:assert/strict');
  assert.equal(ctx2.store.get('CONFIG', 'NEW_KEY_TEST').config_value, 'X');
  assert.equal(ctx2.store.get('CONFIG', 'VAT_RATE').config_value, '0.08');
  ctx2.close();
});
