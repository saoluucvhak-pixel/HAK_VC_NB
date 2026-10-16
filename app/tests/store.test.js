'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../main/repo/JsonStore');
const { loadDataFolder } = require('./helpers');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-'));
const SEED = loadDataFolder('HAKQN').rows;
const CATALOG = ['DON_VI', 'XE', 'TUYEN_VC', 'HOP_DONG', 'PRICE_HISTORY', 'HOP_DONG_XE', 'CONFIG', 'USERS', 'IMPORT_BATCH'];

function newStore(opts = {}) {
  const dir = tmp();
  JsonStore.create(dir, { installCode: 'HAKQN', unitCode: 'HAKQN', installId: 'INS-TEST' });
  return { dir, store: new JsonStore(dir, opts).open() };
}
async function seedCatalog(store) {
  await store.transaction((tx) => { for (const t of CATALOG) for (const r of SEED[t]) tx.insert(t, r); }, { user: 'seed' });
}
const ticket = (over = {}) => ({ ...SEED.PHIEU_CAN[0], ...over });

test('Tạo kho mới, ghi danh mục + phiếu cân, đóng, mở lại: dữ liệu còn nguyên, SHA-256 khớp, dataVersion tăng', async () => {
  const { dir, store } = newStore();
  await seedCatalog(store);
  await store.transaction((tx) => { for (const t of SEED.PHIEU_CAN) tx.insert('PHIEU_CAN', t); });
  assert.equal(store.dataVersion, 2);
  store.close();
  const s2 = new JsonStore(dir).open();
  assert.equal(s2.all('PHIEU_CAN').length, 326);
  assert.equal(s2.all('XE').length, 17);
  assert.ok(fs.existsSync(path.join(dir, 'tables/PHIEU_CAN/2026/2026-09.json')));
  assert.deepEqual(s2.get('PHIEU_CAN', SEED.PHIEU_CAN[5].ticket_id), SEED.PHIEU_CAN[5]);
  s2.close();
});

test('Khóa thư mục: mở lần 2 → DATA_LOCKED; khóa chết phải xác nhận chiếm quyền', async () => {
  const { dir, store } = newStore();
  assert.throws(() => new JsonStore(dir).open(), (e) => e.code === 'DATA_LOCKED' && e.details.stale === false);
  store.close();
  // khóa chết: APP trước tắt đột ngột, nhịp tim cũ
  fs.writeFileSync(path.join(dir, '.lock'), JSON.stringify({ host: 'MAY-KHAC', heartbeatAt: '2026-01-01T00:00:00Z', instanceId: 'x' }));
  assert.throws(() => new JsonStore(dir).open(), (e) => e.code === 'DATA_LOCKED' && e.details.stale === true);
  const s = new JsonStore(dir).open({ takeoverStaleLock: true });
  s.close();
});

test('File bị sửa ngoài APP → INTEGRITY_ERROR, chỉ rõ file', async () => {
  const { dir, store } = newStore();
  await seedCatalog(store); store.close();
  const p = path.join(dir, 'tables/XE.json');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('43H-01021', '43H-99999'));
  assert.throws(() => new JsonStore(dir).open(), (e) => e.code === 'INTEGRITY_ERROR' && e.details.files[0].rel === 'tables/XE.json' && e.details.files[0].problem === 'SHA256_MISMATCH');
  assert.ok(!fs.existsSync(path.join(dir, '.lock')), 'mở lỗi phải trả khóa');
});

const FAULTS = ['afterJournalPrepared', 'afterFirstNewFile', 'afterAllNewFiles', 'afterCommitting', 'afterFirstSwap', 'beforeManifestSwap', 'afterManifestSwap'];
for (const point of FAULTS) {
  test(`Mất điện tại "${point}" → mở lại: dữ liệu ở trạng thái trước HOẶC sau giao dịch, không nửa vời, toàn vẹn OK`, async () => {
    const { dir, store } = newStore();
    await seedCatalog(store); store.close();
    const s = new JsonStore(dir, { fault: (p) => { if (p === point) throw Object.assign(new Error('CRASH'), { crash: true }); } }).open();
    await assert.rejects(s.transaction((tx) => {
      for (const t of SEED.PHIEU_CAN.slice(0, 50)) tx.insert('PHIEU_CAN', t);
      tx.update('XE', '43H-01021', { note: 'đã sửa' });
    }), /CRASH/);
    fs.unlinkSync(path.join(dir, '.lock')); // tiến trình chết: khóa còn lại trên đĩa
    const r = new JsonStore(dir).open();
    const nTickets = r.all('PHIEU_CAN').length; const note = r.get('XE', '43H-01021').note;
    const before = nTickets === 0 && note === '';
    const after = nTickets === 50 && note === 'đã sửa';
    assert.ok(before || after, `trạng thái nửa vời: ${nTickets} phiếu, note="${note}"`);
    const rolledForward = ['afterCommitting', 'afterFirstSwap', 'beforeManifestSwap', 'afterManifestSwap'].includes(point);
    assert.equal(after, rolledForward, rolledForward ? 'phải làm tiếp cho xong' : 'phải hoàn tác');
    assert.deepEqual(fs.readdirSync(path.join(dir, 'journal')), []);
    const leftovers = [];
    const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(new|bak|tmp)$/.test(n)) leftovers.push(p); } };
    walk(dir);
    assert.deepEqual(leftovers, []);
    r.close();
  });
}

test('Lỗi trong giao dịch → không ghi gì (kể cả bộ đếm ID)', async () => {
  const { store } = newStore();
  await seedCatalog(store);
  const v = store.dataVersion;
  await assert.rejects(store.transaction((tx) => { tx.nextId('GD'); tx.insert('PHIEU_CAN', ticket()); throw new Error('dừng'); }), /dừng/);
  assert.equal(store.dataVersion, v); assert.equal(store.all('PHIEU_CAN').length, 0);
  const id = await store.transaction((tx) => tx.nextId('GD'));
  assert.equal(id, 'GD-HAKQN-00001');
});

test('Ràng buộc: trùng khóa chính, trùng ticket_key, khóa ngoại, enum, kiểu, bắt buộc', async () => {
  const { store } = newStore();
  await seedCatalog(store);
  await assert.rejects(store.transaction((tx) => { tx.insert('PHIEU_CAN', ticket()); tx.insert('PHIEU_CAN', ticket()); }), (e) => e.code === 'DUPLICATE');
  await assert.rejects(store.transaction((tx) => { tx.insert('PHIEU_CAN', ticket()); tx.insert('PHIEU_CAN', ticket({ ticket_id: 'PC-khac' })); }),
    (e) => e.code === 'VALIDATION_FAILED' && e.details.errors.some((x) => x.message.includes('ticket_key')));
  await assert.rejects(store.transaction((tx) => tx.insert('PHIEU_CAN', ticket({ plate_no: '99Z-99999' }))), (e) => e.details.errors.some((x) => x.code === 'FK'));
  await assert.rejects(store.transaction((tx) => tx.insert('TUYEN_VC', { ...SEED.TUYEN_VC[0], route_code: 'VC.900', uom: 'KG' })), (e) => e.details.errors.some((x) => x.code === 'TYPE' && x.field === 'uom'));
  await assert.rejects(store.transaction((tx) => tx.insert('PHIEU_CAN', ticket({ net_kg: '17470' }))), (e) => e.details.errors.some((x) => x.field === 'net_kg'));
  await assert.rejects(store.transaction((tx) => tx.insert('PHIEU_CAN', ticket({ weigh1_date: '2026-02-30' }))), (e) => e.details.errors.some((x) => x.field === 'weigh1_date'));
  await assert.rejects(store.transaction((tx) => tx.insert('PHIEU_CAN', ticket({ route_code: '' }))), (e) => e.details.errors.some((x) => x.code === 'REQUIRED'));
  assert.equal(store.all('PHIEU_CAN').length, 0);
});

test('Chống tính trùng ở tầng lưu trữ: 1 phiếu không thể CONFIRMED ở 2 kỳ của cùng hợp đồng', async () => {
  const { store } = newStore();
  await seedCatalog(store);
  const t = ticket();
  const period = (id) => ({ period_id: id, period_code: id, contract_id: 'HD-HAKQN-QS', date_from: '2026-09-18', date_to: '2026-09-23', status: 'DA_XAC_NHAN',
    calc_version: 1, needs_recalc: false, origin: 'LOCAL' });
  const calc = (id, pid) => ({ calc_id: id, period_id: pid, run_id: 'CR-1', calc_version: 1, is_current: true, contract_id: 'HD-HAKQN-QS', route_code: 'VC.007', route_name: 'x', uom: 'TAN',
    price_id: 'PR-VC.007-v1', trip_distance_km: 144, new_price: 165000, avg_load_ton: 18, fuel_price_catalog: 15500, fuel_norm_l_per_km: 0.4, start_date: '2026-09-18', end_date: '2026-09-18',
    trip_count: 1, total_kg: 1, total_ton: 0.001, fuel_line_count: 0, trip_price: 1, fuel_per_trip: 1, fuel_cost_per_trip: 1, fuel_cost_ratio: 1, price_no_diesel: 1, contract_price: 1,
    standard_fuel_liter: 1, result_status: 'OK', trace_json: '{}' });
  const det = (id, pid, cid, state) => ({ id, calc_id: cid, period_id: pid, contract_id: 'HD-HAKQN-QS', ticket_id: t.ticket_id, ticket_key: t.ticket_key, plate_no: t.plate_no,
    weigh1_date: t.weigh1_date, net_kg: t.net_kg, is_current: true, usage_state: state });
  await store.transaction((tx) => { tx.insert('PHIEU_CAN', t); tx.insert('KY_TINH', period('KY-A')); tx.insert('TRANSPORT_CALCULATION', calc('TC-A', 'KY-A')); tx.insert('TRANSPORT_DETAIL', det('TD-A', 'KY-A', 'TC-A', 'CONFIRMED')); });
  await assert.rejects(store.transaction((tx) => { tx.insert('KY_TINH', period('KY-B')); tx.insert('TRANSPORT_CALCULATION', calc('TC-B', 'KY-B')); tx.insert('TRANSPORT_DETAIL', det('TD-B', 'KY-B', 'TC-B', 'CONFIRMED')); }),
    (e) => e.details.errors.some((x) => x.message.includes('đã dùng ở kỳ đã xác nhận')));
  await store.transaction((tx) => { tx.insert('KY_TINH', period('KY-C')); tx.insert('TRANSPORT_CALCULATION', calc('TC-C', 'KY-C')); tx.insert('TRANSPORT_DETAIL', det('TD-C', 'KY-C', 'TC-C', 'DRAFT')); });
});

test('Sửa đồng thời: row_version sai → CONFLICT_VERSION; đúng → tăng version, ghi audit', async () => {
  const { store } = newStore();
  await seedCatalog(store);
  await store.transaction((tx) => { const { before, after } = tx.update('XE', '43H-01021', { note: 'a' }, { expectedRowVersion: 1 }); tx.audit('UPDATE', 'XE', '43H-01021', before, after); }, { user: 'ketoan' });
  const x = store.get('XE', '43H-01021');
  assert.equal(x.row_version, 2); assert.equal(x.updated_by, 'ketoan');
  await assert.rejects(store.transaction((tx) => tx.update('XE', '43H-01021', { note: 'b' }, { expectedRowVersion: 1 })), (e) => e.code === 'CONFLICT_VERSION');
  const a = store.all('AUDIT_LOG');
  assert.equal(a.length, 1); assert.equal(a[0].log_id, 'AL-HAKQN-0000001'); assert.equal(JSON.parse(a[0].after_json).note, 'a');
});

test('Hàng đợi ghi: 20 giao dịch gọi cùng lúc được xếp lần lượt, không mất dữ liệu', async () => {
  const { dir, store } = newStore();
  await seedCatalog(store);
  const ts = SEED.PHIEU_CAN.slice(0, 20);
  await Promise.all(ts.map((t) => store.transaction((tx) => { tx.insert('PHIEU_CAN', t); })));
  assert.equal(store.all('PHIEU_CAN').length, 20);
  store.close();
  assert.equal(new JsonStore(dir).open().all('PHIEU_CAN').length, 20);
});
