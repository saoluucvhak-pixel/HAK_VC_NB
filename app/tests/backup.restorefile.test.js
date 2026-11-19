'use strict';
/**
 * Người dùng báo (1.3.3): Cài đặt không có cách CHỌN FILE để khôi phục (chỉ danh sách bản sao lưu trong thư mục dữ liệu) và không có "sao lưu JSON".
 *  - khôi phục từ file .zip ở NƠI KHÁC (USB), từ manifest.json của thư mục dữ liệu JSON; xem trước (inspect) không đổi gì;
 *  - bản của máy khác CÙNG đơn vị cần xác nhận; khác đơn vị bị từ chối; thư mục thiếu tệp / sai SHA bị chặn;
 *  - sao lưu JSON (exportJsonFolder) ra thư mục trống, khôi phục lại được.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, ADMIN, KETOAN } = require('./install');
const { newStore } = require('../main/repo/createStore');
const { BackupService } = require('../main/services/BackupService');

const U = { username: 'admin', role: 'ADMIN' };
const mk = async (inst = 'DH', installId) => { const c = await install(inst, { kind: 'json', installId }); const bs = new BackupService(c.store, { reopen: (root) => newStore(root, {}, 'json').open() }); return { ...c, bs }; };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `dgvc-rf-${p}-`));
const bump = (store, name) => store.transaction((tx) => tx.update('DON_VI', store.all('DON_VI')[0].unit_code, { unit_name: name }), { user: 'test' });

test('Khôi phục từ file .zip đặt ở nơi khác; inspect không đổi gì', async () => {
  const c = await mk(); const orig = c.store.all('DON_VI')[0].unit_name;
  const b = await c.bs.backup({ kind: 'manual', user: U }); const usb = path.join(tmp('usb'), 'sao-luu.zip'); fs.copyFileSync(b.file, usb);
  await bump(c.store, 'TÊN ĐÃ ĐỔI'); const dv = c.store.dataVersion;
  const i = c.bs.inspect({ file: usb });
  assert.equal(i.canRestore, true); assert.equal(i.sameInstall, true); assert.equal(i.needsOtherInstallConfirm, false); assert.equal(i.unitCode, 'DH'); assert.equal(c.store.dataVersion, dv, 'inspect không đổi gì');
  const r = await c.bs.restore({ file: usb, reason: 'thử', user: U });
  assert.equal(r.store.all('DON_VI')[0].unit_name, orig); assert.ok(fs.existsSync(r.safetyBackup)); r.store.close();
});

test('Sao lưu JSON ra thư mục trống rồi khôi phục bằng manifest.json; thư mục đích phải trống', async () => {
  const c = await mk(); const orig = c.store.all('DON_VI')[0].unit_name;
  const dest = path.join(tmp('json'), 'DGVC_JSON');
  const e = await c.bs.exportJsonFolder({ dest, user: U });
  assert.equal(e.ok, true); assert.ok(fs.existsSync(path.join(dest, 'manifest.json'))); assert.ok(fs.existsSync(path.join(dest, 'snapshot-info.json')));
  const info = JSON.parse(fs.readFileSync(path.join(dest, 'snapshot-info.json'), 'utf8')); assert.equal(info.source, 'json'); assert.ok(info.exportedAt && info.dataVersion >= 1);
  await assert.rejects(c.bs.exportJsonFolder({ dest, user: U }), /phải trống/);
  await bump(c.store, 'SAU KHI XUẤT');
  const i = c.bs.inspect({ file: path.join(dest, 'manifest.json') }); assert.equal(i.canRestore, true); assert.equal(i.kind, 'folder');
  const r = await c.bs.restore({ file: path.join(dest, 'manifest.json'), reason: 'thử', user: U });
  assert.equal(r.store.all('DON_VI')[0].unit_name, orig); r.store.close();
  // thư mục JSON xuất ra cũng mở được như một kho độc lập
  const s2 = newStore(dest, {}, 'json').open(); assert.equal(s2.fingerprint().perTable.DON_VI.rows, s2.all('DON_VI').length); s2.close();
});

test('Chặn: file .json không phải manifest.json; thư mục thiếu tệp / sai SHA-256', async () => {
  const c = await mk(); const dest = path.join(tmp('bad'), 'J'); await c.bs.exportJsonFolder({ dest, user: U });
  const other = path.join(tmp('x'), 'du-lieu.json'); fs.writeFileSync(other, '{}');
  assert.throws(() => c.bs.inspect({ file: other }), /manifest\.json/);
  const m = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8')); const rel = Object.keys(m.files)[0];
  fs.appendFileSync(path.join(dest, rel), ' ');
  assert.throws(() => c.bs.inspect({ file: path.join(dest, 'manifest.json') }), (e) => e.code === 'INTEGRITY_ERROR' && /SHA-256/.test(e.message));
  fs.rmSync(path.join(dest, rel));
  assert.throws(() => c.bs.inspect({ file: path.join(dest, 'manifest.json') }), (e) => e.code === 'INTEGRITY_ERROR' && /thiếu/.test(e.message));
});

test('Bản sao lưu của máy KHÁC cùng đơn vị cần xác nhận (E_OTHER_INSTALL); khác đơn vị bị từ chối', async () => {
  const a = await mk('DH', 'INS-MAY-A'); const b = await mk('DH', 'INS-MAY-B'); const q = await mk('HAKQN', 'INS-QN');
  const zb = (await b.bs.backup({ kind: 'manual', user: U })).file; const zq = (await q.bs.backup({ kind: 'manual', user: U })).file;
  const i = a.bs.inspect({ file: zb }); assert.equal(i.sameUnit, true); assert.equal(i.sameInstall, false); assert.equal(i.needsOtherInstallConfirm, true); assert.equal(i.canRestore, true);
  await assert.rejects(a.bs.restore({ file: zb, reason: 'thử', user: U }), (e) => e.details && e.details.code === 'E_OTHER_INSTALL');
  const iq = a.bs.inspect({ file: zq }); assert.equal(iq.canRestore, false); assert.match(iq.problem, /HAKQN/);
  await assert.rejects(a.bs.restore({ file: zq, reason: 'thử', user: U, allowOtherInstall: true }), /đơn vị HAKQN/);
  const r = await a.bs.restore({ file: zb, reason: 'thay máy', user: U, allowOtherInstall: true });
  assert.equal(r.store.installId, 'INS-MAY-B'); r.store.close();
});
