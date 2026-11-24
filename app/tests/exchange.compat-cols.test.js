'use strict';
/**
 * Tương thích bản cũ (≤ 1.9.3 từ chối "cột lạ" khi nhập gói): cột thêm sau 1.9.3 (calc_basis, total_m3) chỉ có trong gói khi CÓ giá trị.
 *  - Gói chỉ có dữ liệu cũ (không dòng m³): KHÔNG có hai cột đó → đúng định dạng 1.9.3.
 *  - Gói có dòng m³ (calc_basis = M3): chỉ dòng đó mang cột; bản mới nhận đủ (kể cả khi các dòng khác thiếu cột).
 * Kiểm tay trên mã v1.9.3 thật: gói kỳ tính cũ nhập được; gói danh mục có dòng m³ bị bản cũ từ chối (bản cũ không tính được dòng đó).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { install, KETOAN, rid } = require('./install');
const { ExchangeService } = require('../main/services/ExchangeService');
const { CatalogService } = require('../main/services/CatalogService');

const U = { username: 'ketoan', role: 'KE_TOAN' };
const NEW_COLS = ['calc_basis', 'total_m3'];
const read = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
const withCols = (rows) => rows.filter((r) => NEW_COLS.some((k) => k in r));

test('Gói kỳ tính chỉ có dữ liệu cũ: không có cột calc_basis / total_m3 (bản 1.9.3 nhập được)', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-compat-'));
  const { store, periods, contractId } = await install('DH', { installId: 'INS-COMPAT-1' });
  const k = await periods.calculate({ contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', excludeReceiptIds: [], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await periods.confirm({ periodId: k.period.period_id, user: KETOAN });
  const file = path.join(out, 'ky.dgvc'); await new ExchangeService(store).exportPackage({ packageType: 'KY_TINH', periodIds: [k.period.period_id], targetPath: file, user: U });
  const pkg = read(file);
  assert.ok(pkg.tables.TRANSPORT_CALCULATION.length && pkg.tables.PRICE_HISTORY.length, 'gói có dòng tính và dòng giá');
  assert.deepEqual(withCols(pkg.tables.TRANSPORT_CALCULATION), [], 'dòng tính: không cột m³');
  assert.deepEqual(withCols(pkg.tables.PRICE_HISTORY), [], 'dòng giá: không cột calc_basis');
  // kho gốc không bị đổi (chỉ bản sao trong gói bị bỏ cột)
  assert.ok(store.all('PRICE_HISTORY').every((r) => r.calc_basis === ''), 'kho gốc giữ calc_basis rỗng');
  store.close();
});

test('Gói danh mục có dòng m³: chỉ dòng m³ mang calc_basis; bản mới nhận đủ và nhập lại là "giống nhau"', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-compat-'));
  const a = await install('DH', { installId: 'INS-COMPAT-2', withData: false }); const cat = new CatalogService(a.store);
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  const l = await cat.addCodeLine({ priceCode: 'PT-TD', record: { routeCode: 'VC.007', effectiveFrom: '2027-04-01', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 0, avgVolumeM3: 22, calcBasis: 'M3' }, user: KETOAN });
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  const file = path.join(out, 'dm.dgvc'); await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: file, user: U });
  const pkg = read(file);
  const m3 = withCols(pkg.tables.PRICE_HISTORY); assert.equal(m3.length, 1, 'đúng 1 dòng mang cột'); assert.equal(m3[0].calc_basis, 'M3'); assert.equal(m3[0].price_id, l.record.price_id);
  assert.ok(pkg.tables.PRICE_HISTORY.length > 1 && pkg.tables.PRICE_HISTORY.filter((r) => !('calc_basis' in r)).length === pkg.tables.PRICE_HISTORY.length - 1, 'các dòng còn lại không có cột');
  // bản mới ở máy khác nhận đủ: dòng m³ giữ calc_basis, dòng cũ là rỗng
  const b = await install('HAKQN', { installId: 'INS-COMPAT-3', withData: false }); const ex = new ExchangeService(b.store);
  const pv = ex.previewPackage({ filePath: file, user: U }); assert.equal(pv.canImport, true);
  await ex.importPackage({ previewId: pv.previewId, decisions: {}, user: U });
  assert.equal(b.store.get('PRICE_HISTORY', l.record.price_id).calc_basis, 'M3');
  assert.ok(b.store.all('PRICE_HISTORY').filter((r) => r.price_id !== l.record.price_id).every((r) => (r.calc_basis || '') === ''), 'dòng cũ vẫn là cách cũ (calc_basis rỗng)');
  const again = ex.previewPackage({ filePath: file, user: U }); assert.equal(again.summary.PRICE_HISTORY.NEW + again.summary.PRICE_HISTORY.UPDATE + again.summary.PRICE_HISTORY.CONFLICT, 0, 'nhập lại cùng gói: không có gì mới / khác');
  a.store.close(); b.store.close();
});
