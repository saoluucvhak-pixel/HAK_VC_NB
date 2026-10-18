'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const L = require('../src/utils/storageLocation');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vcs-'));
const mkData = (d) => { fs.mkdirSync(path.join(d, 'data'), { recursive: true }); fs.writeFileSync(path.join(d, 'data', 'app.db'), 'DB'); fs.mkdirSync(path.join(d, 'backups'), { recursive: true }); fs.writeFileSync(path.join(d, 'backups', 'b.db'), 'B'); };

test('mặc định: Portable cạnh .exe, Setup ở APPDATA; file cấu hình ghi đè; ENV thắng; xóa cấu hình quay về mặc định', () => {
  const exe = tmp(); const ap = tmp();
  assert.equal(L.resolveDataDir({ portableDir: exe, appData: ap }).dir, path.join(exe, 'VCCost-data'));
  assert.equal(L.resolveDataDir({ appData: ap }).dir, path.join(ap, 'VCCost'));
  const target = tmp();
  L.writeCustom(exe, target);
  const r = L.resolveDataDir({ portableDir: exe, appData: ap });
  assert.equal(r.dir, target); assert.equal(r.source, 'CUSTOM'); assert.ok(!r.missing);
  assert.equal(L.resolveDataDir({ env: { VCCOST_DATA_DIR: '/x' }, portableDir: exe, appData: ap }).source, 'ENV');
  L.writeCustom(exe, null);
  assert.equal(L.resolveDataDir({ portableDir: exe, appData: ap }).source, 'DEFAULT');
});

test('thư mục tùy chọn biến mất (rút USB) → missing=true, không tự tạo', () => {
  const exe = tmp(); L.writeCustom(exe, path.join(os.tmpdir(), 'khong-ton-tai-' + Date.now()));
  assert.equal(L.resolveDataDir({ portableDir: exe, appData: exe }).missing, true);
});

test('validateTarget: không ghi đè dữ liệu có sẵn, không lồng nhau, USE cần có dữ liệu', () => {
  const cur = tmp(); mkData(cur);
  const empty = tmp(); const full = tmp(); mkData(full);
  assert.equal(L.validateTarget({ current: cur, target: empty, mode: 'COPY' }).ok, true);
  assert.equal(L.validateTarget({ current: cur, target: full, mode: 'COPY' }).ok, false);   // sẽ ghi đè
  assert.equal(L.validateTarget({ current: cur, target: full, mode: 'USE' }).ok, true);
  assert.equal(L.validateTarget({ current: cur, target: empty, mode: 'USE' }).ok, false);   // chưa có dữ liệu
  assert.equal(L.validateTarget({ current: cur, target: cur, mode: 'COPY' }).ok, false);
  assert.equal(L.validateTarget({ current: cur, target: path.join(cur, 'con'), mode: 'COPY' }).ok, false);
});

test('copyData chép đủ data + backups, giữ nguyên nguồn; chép lên đích đã có dữ liệu thì lỗi', () => {
  const cur = tmp(); mkData(cur); const dst = tmp();
  L.copyData(cur, dst);
  assert.equal(fs.readFileSync(path.join(dst, 'data', 'app.db'), 'utf8'), 'DB');
  assert.equal(fs.readFileSync(path.join(dst, 'backups', 'b.db'), 'utf8'), 'B');
  assert.ok(L.hasData(cur));
  assert.throws(() => L.copyData(cur, dst));
});
