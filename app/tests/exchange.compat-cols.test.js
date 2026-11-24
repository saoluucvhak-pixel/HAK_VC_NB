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

// ── So sánh gói đến với dòng trên máy: cột calc_basis / total_m3 KHÔNG có trong gói = "không có thông tin" (không so); có mặt nhưng rỗng ('') vẫn so ──
const crypto = require('node:crypto');
const { canon } = require('../main/services/ExchangeService');
const resign = (pkg) => { pkg.contentSha256 = crypto.createHash('sha256').update(canon(pkg.tables)).digest('hex'); return pkg; };

async function twoMachines(tag) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-compat-'));
  const a = await install('DH', { installId: `INS-CMP-${tag}-A`, withData: false }); const cat = new CatalogService(a.store);
  await cat.backfillCodeMethods({ user: { username: 'system' } });
  const l = await cat.addCodeLine({ priceCode: 'PT-TD', record: { routeCode: 'VC.007', effectiveFrom: '2027-04-01', newPrice: 165000, fuelPriceExclVat: 15500, fuelNormLPerKm: 0.4, avgLoadTon: 0, avgVolumeM3: 22, calcBasis: 'M3' }, user: KETOAN });
  await cat.activatePrice({ priceId: l.record.price_id, rowVersion: l.record.row_version, user: KETOAN });
  const full = path.join(out, 'full.json'); await new ExchangeService(a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: full, user: U });
  const variant = (name, mut) => { const pkg = JSON.parse(fs.readFileSync(full, 'utf8')); const row = pkg.tables.PRICE_HISTORY.find((r) => r.price_id === l.record.price_id); mut(row, pkg); const f = path.join(out, name); fs.writeFileSync(f, JSON.stringify(resign(pkg))); return f; };
  const b = await install('HAKQN', { installId: `INS-CMP-${tag}-B`, withData: false }); const ex = new ExchangeService(b.store);
  const take = async (file, decisions = {}) => { const pv = ex.previewPackage({ filePath: file, user: U }); await ex.importPackage({ previewId: pv.previewId, decisions, user: U }); return pv; };
  const lineChange = (pv) => { const c = pv.conflicts.find((x) => x.table === 'PRICE_HISTORY' && x.id === l.record.price_id); return c || null; };
  return { a, b, ex, id: l.record.price_id, full, variant, take, lineChange, dispose: () => { a.store.close(); b.store.close(); } };
}

test('Máy nhận đã có dòng m³; gói đến thiếu cột calc_basis, các trường khác y hệt → SAME, không có dòng khác biệt giả', async () => {
  const m = await twoMachines('1'); await m.take(m.full);
  assert.equal(m.b.store.get('PRICE_HISTORY', m.id).calc_basis, 'M3');
  const noCol = m.variant('nocol.json', (r) => { delete r.calc_basis; });
  const pv = m.ex.previewPackage({ filePath: noCol, user: U });
  assert.equal(m.lineChange(pv), null, 'không xung đột'); assert.ok(pv.summary.PRICE_HISTORY.SAME >= 1, 'dòng giá được coi là giống nhau'); assert.equal(pv.summary.PRICE_HISTORY.CONFLICT + pv.summary.PRICE_HISTORY.UPDATE + pv.summary.PRICE_HISTORY.NEW, 0, 'không có gì mới / khác');
  m.dispose();
});

test('Máy nhận có calc_basis rỗng; gói đến thiếu cột → SAME, không dòng khác biệt giả', async () => {
  const m = await twoMachines('2'); const noCol = m.variant('nocol.json', (r) => { delete r.calc_basis; });
  await m.take(noCol); assert.equal(m.b.store.get('PRICE_HISTORY', m.id).calc_basis || '', '');
  const pv = m.ex.previewPackage({ filePath: noCol, user: U });
  assert.equal(pv.summary.PRICE_HISTORY.CONFLICT + pv.summary.PRICE_HISTORY.UPDATE + pv.summary.PRICE_HISTORY.NEW, 0); m.dispose();
});

test('Máy nhận có calc_basis rỗng; gói đến M3 → thay đổi VẪN hiện (không bị giấu)', async () => {
  const m = await twoMachines('3'); await m.take(m.variant('nocol.json', (r) => { delete r.calc_basis; }));
  const pv = m.ex.previewPackage({ filePath: m.full, user: U }); const c = m.lineChange(pv);
  assert.ok(c, 'có xung đột / thay đổi ở dòng giá'); assert.ok(c.changes.some((x) => x.field === 'calc_basis' && (x.local || '') === '' && x.incoming === 'M3'), 'thấy calc_basis: rỗng → M3');
  m.dispose();
});

test('Máy nhận đã có m³; gói thiếu cột và KHÁC ở trường khác → xung đột không nhắc calc_basis; chọn lấy bản đến: giữ M3 và lần sau là SAME', async () => {
  const m = await twoMachines('4'); await m.take(m.full);
  const edited = m.variant('edited.json', (r) => { delete r.calc_basis; r.source_note = 'ghi chú khác'; });
  const pv = m.ex.previewPackage({ filePath: edited, user: U }); const c = m.lineChange(pv);
  assert.ok(c, 'khác nội dung → có xung đột'); assert.ok(c.changes.some((x) => x.field === 'source_note'), 'thấy trường khác'); assert.ok(!c.changes.some((x) => x.field === 'calc_basis'), 'KHÔNG liệt kê calc_basis');
  await m.ex.importPackage({ previewId: pv.previewId, decisions: { [`PRICE_HISTORY:${m.id}`]: 'TAKE' }, user: U });
  const row = m.b.store.get('PRICE_HISTORY', m.id); assert.equal(row.calc_basis, 'M3', 'M3 được giữ'); assert.equal(row.source_note, 'ghi chú khác', 'trường khác được lấy');
  const again = m.ex.previewPackage({ filePath: edited, user: U }); assert.equal(m.lineChange(again), null, 'lần sau không còn xung đột'); m.dispose();
});

test('Xuất gói có dòng m³ → cảnh báo bên gửi (bản ≤ 1.9.3 sẽ từ chối); gói chỉ dữ liệu cũ → không cảnh báo', async () => {
  const m = await twoMachines('5'); const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-compat-'));
  const r = await new ExchangeService(m.a.store).exportPackage({ packageType: 'DANH_MUC', targetPath: path.join(out, 'x.dgvc'), user: U });
  assert.equal(r.warnings.length, 1); assert.match(r.warnings[0].message, /1 dòng đơn giá tính theo m³.*1\.9\.3 trở xuống/); assert.equal(r.warnings[0].level, 'WARNING');
  const legacy = await install('DH', { installId: 'INS-CMP-5-L' }); const kp = await legacy.periods.calculate({ contractId: legacy.contractId, dateFrom: '2026-09-18', dateTo: '2026-09-23', routeCode: 'VC.007', excludeReceiptIds: [], reportDate: '2026-09-25', clientRequestId: rid(), user: KETOAN });
  await legacy.periods.confirm({ periodId: kp.period.period_id, user: KETOAN });
  const r2 = await new ExchangeService(legacy.store).exportPackage({ packageType: 'KY_TINH', periodIds: [kp.period.period_id], targetPath: path.join(out, 'y.dgvc'), user: U });
  assert.deepEqual(r2.warnings, []); legacy.store.close(); m.dispose();
});
