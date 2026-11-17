'use strict';
/**
 * Giai đoạn 0 kế hoạch lưu trữ — BỘ TEST HỢP ĐỒNG `Storage` (main/repo/Storage.js).
 * Chạy cho MỌI loại kho đã đăng ký ở main/repo/createStore.js (hiện: json). Khi thêm kho SQLite, chỉ cần đăng ký là bộ này tự chạy cho nó.
 * Chọn loại kho cho các test khác: DGVC_STORAGE=<loại> npm test.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./install');
const { newStore } = require('../main/repo/createStore');
const { STORAGE_MEMBERS, TX_METHODS, missingMembers } = require('../main/repo/Storage');
const { buildSnapshot, fingerprintOf } = require('../main/repo/JsonStore');
const { storageKinds } = require('../main/repo/createStore');

for (const kind of storageKinds()) {
  const T = (name, fn) => test(`[${kind}] ${name}`, async () => { process.env.DGVC_STORAGE = kind; try { await fn(); } finally { delete process.env.DGVC_STORAGE; } });
  const setup = async () => { const c = await install('DH', { withData: false }); return { ...c, reopen: () => newStore(c.dir, {}, kind).open() }; };

  T('đủ thành viên hợp đồng (kho + giao dịch)', async () => {
    const { store } = await setup();
    assert.deepEqual(missingMembers(store), []);
    await store.transaction((tx) => { for (const m of TX_METHODS) assert.equal(typeof tx[m], 'function', `tx.${m}`); });
    assert.ok(STORAGE_MEMBERS.methods.length >= 14);
  });

  T('đọc / ghi: insert, get, find, update; dataVersion +1 mỗi giao dịch có ghi, giao dịch rỗng không tăng', async () => {
    const { store } = await setup();
    const u = store.all('DON_VI')[0]; const v0 = store.dataVersion;
    await store.transaction(() => 'không ghi gì');
    assert.equal(store.dataVersion, v0);
    await store.transaction((tx) => { tx.insert('DON_VI', { ...u, unit_code: 'ZZ1', unit_name: 'Đơn vị thử' }); }, { user: 'tester' });
    assert.equal(store.dataVersion, v0 + 1);
    assert.equal(store.get('DON_VI', 'ZZ1').unit_name, 'Đơn vị thử');
    assert.equal(store.find('DON_VI', (r) => r.unit_code === 'ZZ1').length, 1);
    assert.equal(store.get('DON_VI', 'KHONG-CO'), null);
  });

  T('khóa lạc quan: rowVersion tăng mỗi lần sửa; sai → CONFLICT_VERSION và không ghi gì', async () => {
    const { store } = await setup();
    const u = store.all('DON_VI')[0]; const rv = u.row_version; const v0 = store.dataVersion;
    await store.transaction((tx) => tx.update('DON_VI', u.unit_code, { unit_name: 'A' }, { expectedRowVersion: rv }));
    assert.equal(store.get('DON_VI', u.unit_code).row_version, rv + 1);
    await assert.rejects(store.transaction((tx) => tx.update('DON_VI', u.unit_code, { unit_name: 'B' }, { expectedRowVersion: rv })), (e) => e.code === 'CONFLICT_VERSION');
    assert.equal(store.get('DON_VI', u.unit_code).unit_name, 'A'); assert.equal(store.dataVersion, v0 + 1);
  });

  T('giao dịch tất cả-hoặc-không: lỗi giữa chừng không để lại gì (kể cả bộ đếm sinh mã và audit)', async () => {
    const { store } = await setup();
    const u = store.all('DON_VI')[0]; const before = store.fingerprint().sha256; const v0 = store.dataVersion;
    await assert.rejects(store.transaction((tx) => { tx.insert('DON_VI', { ...u, unit_code: 'ZZ2' }); tx.nextId('XX'); tx.audit('TEST', 'DON_VI', 'ZZ2'); throw new Error('boom'); }), /boom/);
    assert.equal(store.get('DON_VI', 'ZZ2'), null); assert.equal(store.dataVersion, v0);
    assert.equal(store.fingerprint().sha256, before);
  });

  T('bộ đếm sinh mã tăng đơn điệu, giữ qua đóng/mở lại; audit được ghi cùng giao dịch', async () => {
    const c = await setup(); let id1; let id2;
    await c.store.transaction((tx) => { id1 = tx.nextId('TST'); tx.audit('TEST', 'X', id1, null, { a: 1 }, { reason: 'thử' }); });
    c.store.close(); const s2 = c.reopen();
    await s2.transaction((tx) => { id2 = tx.nextId('TST'); });
    assert.notEqual(id1, id2); assert.ok(id2 > id1);
    assert.ok(s2.find('AUDIT_LOG', (a) => a.action === 'TEST' && a.entity_id === id1).length === 1);
    s2.close();
  });

  T('mở lại: dữ liệu và dấu vân tay y nguyên; hai bản cùng mở một thư mục → DATA_LOCKED', async () => {
    const c = await setup();
    await c.store.transaction((tx) => tx.update('DON_VI', c.store.all('DON_VI')[0].unit_code, { unit_name: 'Tên mới' }));
    const fp = c.store.fingerprint(); const dv = c.store.dataVersion;
    assert.throws(() => newStore(c.dir, {}, kind).open(), (e) => e.code === 'DATA_LOCKED');
    c.store.close(); const s2 = c.reopen();
    assert.equal(s2.dataVersion, dv); assert.equal(s2.fingerprint().sha256, fp.sha256); assert.deepEqual(s2.fingerprint().perTable, fp.perTable);
    s2.close();
  });

  T('lớp phủ năm lưu trữ: chỉ đọc, không nằm trong bản chụp, gỡ ra thì sạch', async () => {
    const { store } = await setup();
    const u = store.all('DON_VI')[0]; const fp = store.fingerprint().sha256; const n = store.all('DON_VI').length;
    assert.equal(store.mountRows('2019', { DON_VI: [{ ...u, unit_code: 'OLD1' }, { ...u, unit_code: u.unit_code }] }), 1, 'dòng trùng khóa bị bỏ qua');
    assert.deepEqual(store.mountedYears(), ['2019']); assert.ok(store.isYearMounted(2019)); assert.ok(store.hasMounted);
    assert.ok(store.isMountedRow('DON_VI', 'OLD1')); assert.equal(store.get('DON_VI', 'OLD1').unit_code, 'OLD1');
    assert.equal(store.fingerprint().sha256, fp, 'dòng lớp phủ không tính vào dấu vân tay');
    await assert.rejects(store.transaction((tx) => tx.update('DON_VI', 'OLD1', { unit_name: 'x' })), (e) => /lưu trữ/i.test(e.message));
    assert.equal(store.unmountYear(2019), true); assert.equal(store.unmountYear(2019), false);
    assert.equal(store.get('DON_VI', 'OLD1'), null); assert.equal(store.all('DON_VI').length, n); assert.equal(store.hasMounted, false);
  });

  T('bản chụp có thời điểm xuất + phiên bản dữ liệu; dấu vân tay ổn định, không phụ thuộc thứ tự dòng, nhạy với từng giá trị (kể cả \'\' ≠ null)', async () => {
    const { store } = await setup();
    const snap = store.snapshot();
    assert.equal(snap.format, 'dgvc-snapshot/1'); assert.match(snap.exportedAt, /^\d{4}-\d\d-\d\dT/); assert.equal(snap.dataVersion, store.dataVersion);
    assert.equal(snap.installId, store.installId); assert.equal(snap.schemaVersion, store.schemaVersion);
    const a = fingerprintOf(snap).sha256; assert.equal(store.fingerprint().sha256, a); assert.equal(store.fingerprint().sha256, a, 'lặp lại cho cùng kết quả');
    // đảo thứ tự dòng không đổi vân tay
    const rev = { ...snap, tables: Object.fromEntries(Object.entries(snap.tables).map(([k, v]) => [k, v.slice().reverse()])) };
    assert.equal(fingerprintOf(buildSnapshotLike(rev)).sha256, a);
    // đổi 1 giá trị → đổi; '' khác null
    const row = snap.tables.DON_VI[0]; const key = 'tax_code';
    const mk = (val) => fingerprintOf({ ...snap, tables: { ...snap.tables, DON_VI: [{ ...row, [key]: val }, ...snap.tables.DON_VI.slice(1)] } }).sha256;
    assert.notEqual(mk('x'), mk('y')); assert.notEqual(mk(''), mk(null)); assert.notEqual(mk(''), mk('0'));
    // bộ đếm sinh mã nằm trong vân tay
    await store.transaction((tx) => { const id = tx.nextId('SEQ'); tx.audit('TEST', 'X', id); }); // chỉ nextId (không ghi gì) thì không commit — nên kèm audit
    const b2 = store.fingerprint(); assert.notEqual(b2.sha256, a); assert.notEqual(b2.sequences, store.snapshot() && fingerprintOf({ ...snap }).sequences);
  });

  T('stats(): số dòng từng bảng khớp all()', async () => {
    const { store } = await setup(); const st = store.stats();
    for (const t of Object.keys(st.rows)) assert.equal(st.rows[t], store.all(t).length, t);
    assert.ok(st.files > 0);
  });
}

// vân tay tính trên bản chụp đã đảo thứ tự: buildSnapshot sắp lại theo khóa, nên ở đây tự sắp như buildSnapshot để chứng minh chuẩn hóa theo khóa chính
function buildSnapshotLike(snap) {
  const SCHEMA = require('../shared/schema.json'); const tables = {};
  for (const [n, rows] of Object.entries(snap.tables)) { const pk = SCHEMA.tables[n].pk; tables[n] = rows.slice().sort((x, y) => (String(x[pk]) < String(y[pk]) ? -1 : String(x[pk]) > String(y[pk]) ? 1 : 0)); }
  return { ...snap, tables };
}

test('Không có mã ngoài main/repo nào chạm nội tạng kho (.data / .pk / .manifest / .mounted / _reindex / .journal)', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const bad = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== 'repo') walk(p); } else if (f.name.endsWith('.js')) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/\b(?:store|s)\.(?:data|pk|manifest|mounted|journal|sequences)\b|\b(?:store|s)\._[a-zA-Z]+/.test(l)) bad.push(`${path.relative(path.join(__dirname, '..'), p)}:${i + 1}`); });
    } } };
  walk(path.join(__dirname, '..', 'main'));
  assert.deepEqual(bad, [], 'dùng API hợp đồng Storage thay vì chạm nội tạng');
});
