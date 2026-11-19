'use strict';
/** P4 (1.6.1): dòng giao nhận dầu cùng nội dung đã có ở máy nhận (nhập tay / import, receipt_id khác) lại đến trong gói trao đổi → nghi trùng, mặc định bỏ qua; kỳ vẫn đủ dầu. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');
const { fuelContentKey } = require('../main/import/fuelKey');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-fdup-'));
const W = { dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007' };
const U = { username: 'ketoan' };

async function scene() {
  const a = await install('DH', { installId: 'INS-AAAA1111' }); // máy bên vận chuyển (gửi)
  const k = await a.periods.calculate({ contractId: a.contractId, ...W, reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await a.periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const file = path.join(OUT, `A-${Date.now()}.dgvc`);
  await new ExchangeService(a.store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: file, user: U });
  const q = await install('HAKQN'); const ex = new ExchangeService(q.store);
  const fuelOf = (store) => store.find('GIAO_NHAN_DAU', (r) => r.contract_id === a.contractId && !r.is_deleted);
  // máy nhận đã NHẬP TAY dòng dầu cùng nội dung nhưng khác receipt_id
  const typed = async (rows) => { let i = 0; await q.store.transaction((tx) => { for (const r of rows) tx.insert('GIAO_NHAN_DAU', { ...r, receipt_id: `GD-TAY-${++i}`, import_batch_id: '' }); }, { user: 'test' }); };
  return { a, k, q, ex, file, fuelOf, typed, pid: k.period.period_id };
}
const dupConflicts = (pv) => pv.conflicts.filter((c) => c.table === 'GIAO_NHAN_DAU' && c.kind === 'POSSIBLE_DUPLICATE');

test('fuelContentKey: khóa nội dung dùng chung (ngày nhận, xe, lít, giá, ngày mua, bên giao, tuyến)', () => {
  const r = { receive_date: '2026-09-18', plate_no: '92H-1', qty_liter: 400, fuel_price_excl_vat: 20000, purchase_date: '2026-09-17', giver_unit_code: 'HAKQN', route_code: 'VC.007', receipt_id: 'X' };
  assert.equal(fuelContentKey(r), '2026-09-18|92H-1|400|20000|2026-09-17|HAKQN|VC.007'); assert.equal(fuelContentKey({ ...r, receipt_id: 'Y' }), fuelContentKey(r));
});

test('Máy nhận đã nhập tay dòng dầu X; gói có cùng dòng X (receipt_id khác) → POSSIBLE_DUPLICATE mặc định bỏ qua; nhập xong chỉ còn 1 dòng X; kỳ khớp máy gửi', async () => {
  const s = await scene(); const src = s.fuelOf(s.a.store); const x = src[0];
  await s.typed([x]);
  const pv = s.ex.previewPackage({ filePath: s.file, user: U });
  const dups = dupConflicts(pv); assert.equal(dups.length, 1); assert.equal(dups[0].default, 'SKIP'); assert.match(dups[0].note, /đã có ở máy này \(mã GD-TAY-1\)/);
  assert.equal(pv.canImport, true);
  await s.ex.importPackage({ previewId: pv.previewId, user: U });
  const mine = s.fuelOf(s.q.store); const sameAsX = mine.filter((r) => fuelContentKey(r) === fuelContentKey(x));
  assert.equal(sameAsX.length, 1, 'chỉ còn 1 dòng X'); assert.equal(sameAsX[0].receipt_id, 'GD-TAY-1');
  assert.equal(mine.length, src.length, 'tổng số dòng dầu khớp máy gửi');
  const sum = (rows) => rows.reduce((t, r) => t + r.qty_liter, 0); assert.equal(sum(mine), sum(src), 'tổng dầu khớp máy gửi');
  // kỳ nhận đủ dầu: mọi FUEL_DETAIL trỏ tới dòng dầu có thật; số lít thực nhận khớp máy gửi
  const fd = s.q.store.find('FUEL_DETAIL', (d) => d.period_id === s.pid && d.is_current); assert.equal(fd.length, src.length);
  for (const d of fd) assert.ok(s.q.store.get('GIAO_NHAN_DAU', d.receipt_id), `dòng dầu ${d.receipt_id} có ở máy nhận`);
  assert.ok(fd.some((d) => d.receipt_id === 'GD-TAY-1'), 'dòng dầu của kỳ được ánh xạ sang dòng đã có');
  const calc = (store) => store.find('TRANSPORT_CALCULATION', (c) => c.period_id === s.pid && c.is_current)[0];
  assert.equal(calc(s.q.store).actual_fuel_liter, calc(s.a.store).actual_fuel_liter); assert.equal(calc(s.q.store).transport_price, calc(s.a.store).transport_price);
  assert.ok(s.q.store.all('AUDIT_LOG').some((a) => a.action === 'FUEL_DUP_REMAP'), 'ghi audit việc ánh xạ');
  // cùng gói nhập lần nữa: không phát sinh thêm nghi trùng / dòng
  assert.equal(s.ex.previewPackage({ filePath: s.file, user: U }).summary.KY_TINH.SAME, 1);
});

test('2 dòng X giống hệt trong gói, máy nhận có 1 → chỉ 1 dòng bị đánh dấu nghi trùng, dòng còn lại NEW', async () => {
  const s = await scene(); const src = s.fuelOf(s.a.store);
  const groups = new Map(); for (const r of src) groups.set(fuelContentKey(r), [...(groups.get(fuelContentKey(r)) || []), r]);
  const pair = [...groups.values()].find((g) => g.length >= 2); assert.ok(pair, 'dữ liệu mẫu có 2 dòng dầu giống hệt');
  await s.typed([pair[0]]);
  const pv = s.ex.previewPackage({ filePath: s.file, user: U }); assert.equal(dupConflicts(pv).length, 1);
  await s.ex.importPackage({ previewId: pv.previewId, user: U });
  const mine = s.fuelOf(s.q.store); assert.equal(mine.filter((r) => fuelContentKey(r) === fuelContentKey(pair[0])).length, pair.length, 'đủ số dòng giống hệt như máy gửi (1 có sẵn + còn lại NEW)');
  assert.equal(mine.length, src.length);
});

test('Chọn KEEP (vẫn nhập) → dòng dầu của gói được ghi thêm, không ánh xạ', async () => {
  const s = await scene(); const src = s.fuelOf(s.a.store); const x = src[0];
  await s.typed([x]);
  const pv = s.ex.previewPackage({ filePath: s.file, user: U }); const d = dupConflicts(pv)[0];
  await s.ex.importPackage({ previewId: pv.previewId, decisions: { [`GIAO_NHAN_DAU:${d.id}`]: 'KEEP' }, user: U });
  const mine = s.fuelOf(s.q.store); assert.equal(mine.length, src.length + 1, 'cả dòng nhập tay lẫn dòng của gói');
  assert.ok(s.q.store.get('GIAO_NHAN_DAU', d.id)); assert.ok(!s.q.store.all('AUDIT_LOG').some((a) => a.action === 'FUEL_DUP_REMAP'));
});
