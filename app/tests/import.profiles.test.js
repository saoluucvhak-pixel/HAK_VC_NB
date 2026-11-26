'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { newStore } = require('../main/repo/createStore');
const { openWorkbook } = require('../main/import/excelReader');
const { ImportService } = require('../main/import/ImportService');
const Profiles = require('../main/import/TicketProfiles');
const { install, rid, storageKinds } = require('./install');
const { CONFIG, workbook } = require('./import.profiles-fixture');

const sheetName = 'Phiếu nhà cung cấp';

for (const kind of storageKinds()) test(`Mẫu phiếu cân (${kind}) giữ cách đọc sau khi mở lại và từ chối đổi cách đọc lỗi`, async (t) => {
  const { dir, store } = await install('HAKQN', { withData: false, kind });
  let storage = store;
  t.after(async () => { storage.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const imp = new ImportService(store);
  const user = 'admin';
  const input = { importType: 'PHIEU_CAN', user };
  const catalog = { plate: store.all('XE')[0].plate_no, route: store.all('TUYEN_VC')[0].route_code };
  const initial = await workbook(dir, 'mau.xlsx', catalog);
  const reordered = await workbook(dir, 'doi-thu-tu.xlsx', { ...catalog, order: [7, 4, 2, 6, 1, 5, 0, 3] });
  const inspected = await imp.inspectProfile({ filePath: initial, sheetName, headerRow: 3 });
  assert.equal(inspected.sheets.length, 2);
  assert.equal(inspected.suggested.weigh1_date, 'Ngày\ngiờ cân');
  assert.equal(inspected.suggested.weight_unit, 'ĐVT');
  const draft = await imp.inspectProfile({ filePath: initial, sheetName, config: CONFIG });
  assert.equal(draft.count, 2);
  assert.equal(draft.totalKg, 3800);
  assert.deepEqual(draft.rows.map((row) => row.normalized.ticket_no), ['000042', '000043']);
  assert.deepEqual(draft.rows.map((row) => row.normalized.weigh1_time), ['08:15:30', '09:30:00']);
  assert.deepEqual(draft.declaredTotals, [{ rowNo: 6, kg: 3900, differenceKg: -100 }]);
  assert.equal(draft.warnings[0].rowNo, 7);
  assert.equal(store.all('IMPORT_BATCH').length, 0);

  const { item } = await Profiles.save(store, { name: 'Mẫu nhà cung cấp', filePath: initial, sheetName, config: CONFIG }, user);
  const { item: copy } = await Profiles.save(store, { name: 'Bản sao', copyFromId: item.id }, user);
  await Profiles.selectDefault(store, { id: item.id }, user);
  const active = Profiles.list(store).items.find((profile) => profile.isDefault);
  const stored = store.get('IMPORT_PROFILE', active.id);
  assert.deepEqual(Object.keys(JSON.parse(stored.config_json)).sort(), ['fallbackUnit', 'headerRow', 'mapping']);
  assert.ok(!stored.config_json.includes(initial));
  await Profiles.save(store, { id: active.id, rowVersion: active.rowVersion, name: 'Mẫu đang dùng', filePath: initial, sheetName, config: CONFIG }, user);

  for (const [kind, message] of [['missing', /Thiếu tiêu đề “Biển số”/], ['duplicate', /Trùng tiêu đề “Biển số”/], ['unit', /Dòng 4: Đơn vị “bao”/]]) {
    const filePath = await workbook(dir, `${kind}.xlsx`, { ...catalog, malformed: kind });
    await assert.rejects(imp.preview({ ...input, filePath }), message);
    assert.equal(store.all('IMPORT_BATCH').length, 0);
  }
  const pv = await imp.preview({ ...input, filePath: reordered });
  assert.equal(pv.readConfig.profileId, item.id);
  assert.equal(pv.sheet, sheetName);
  assert.equal(pv.summary.ok, 2);
  assert.equal(pv.rows[0].normalized.warehouse, 'Kho A');
  assert.deepEqual(pv.rows.map((row) => row.normalized.net_kg), [1500, 2300]);
  const badReading = { ...CONFIG, mapping: { ...CONFIG.mapping, plate_no: 'Không có' } };
  await assert.rejects(imp.preview({ ...input, filePath: reordered, replaceBatchId: pv.batchId, readConfig: badReading }), /Thiếu tiêu đề/);
  assert.equal(store.get('IMPORT_BATCH', pv.batchId).status, 'PREVIEW');
  assert.equal(imp.previewRows({ batchId: pv.batchId }).rows.length, 2);
  const replacement = await imp.preview({ ...input, filePath: reordered, replaceBatchId: pv.batchId, profileId: copy.id });
  assert.equal(store.get('IMPORT_BATCH', pv.batchId).status, 'CANCELLED');
  const confirmed = await imp.confirm({ batchId: replacement.batchId, acceptWarnings: true, clientRequestId: rid(), user });
  assert.equal(confirmed.inserted, 2);
  assert.equal(store.get('PHIEU_CAN', confirmed.insertedIds[0]).import_note, 'Lô sớm');
  await Profiles.remove(store, { id: copy.id }, user);
  await Profiles.selectDefault(store, {}, user);
  storage.close();
  storage = newStore(dir, {}, kind).open();
  assert.equal(Profiles.list(storage).items[0].name, 'Mẫu đang dùng');
  assert.equal(Profiles.list(storage).items[0].isDefault, false);
  const reopened = new ImportService(storage);
  await assert.rejects(reopened.preview({ ...input, filePath: initial, sourceBatchId: replacement.batchId }), /đúng file Excel gốc/);
  const historical = await reopened.preview({ ...input, filePath: reordered, sourceBatchId: replacement.batchId });
  assert.equal(historical.readConfig.name, 'Bản sao');
  assert.deepEqual(historical.readConfig.config, CONFIG);
  assert.deepEqual(historical.rows.map((row) => row.normalized.ticket_no), ['000042', '000043']);
  assert.equal(historical.summary.duplicate, 2);
});

test('Mẫu ghép hai tầng, tính chênh hai lần cân, đơn vị dự phòng và mã phiếu tự sinh', async (t) => {
  const { tmpdir } = require('node:os');
  const path = require('node:path');
  const ExcelJS = require('exceljs');
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'dgvc-profile-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'can.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cân');
  ws.addRow(['Biển số', 'Cân lần 1', 'Cân lần 2', 'Ngày cân']);
  ws.addRow([null, 'KL', 'KL']);
  ws.addRow(['92H-00057', 12.3, 10.1, '22/09/2026']);
  ws.addRow(['Tổng khối lượng hàng: 2300 kg']);
  ws.addRow(['Đà Nẵng, ngày 22 tháng 9 năm 2026']);
  await wb.xlsx.writeFile(file);
  const book = await openWorkbook(file);
  const config = { headerRow: 2, fallbackUnit: 't', mapping: { plate_no: 'Biển số', weigh1_date: 'Ngày cân', weight1_kg: 'Cân lần 1 KL', weight2_kg: 'Cân lần 2 KL' } };
  assert.throws(() => Profiles.read(book, 'Cân', { ...config, mapping: { ...config.mapping, weight1_kg: 'KL' } }), /Trùng tiêu đề “KL”/);
  const res = Profiles.read(book, 'Cân', config).trial;
  assert.equal(res.count, 1);
  assert.equal(res.totalKg, 2200);
  assert.deepEqual(res.declaredTotals, [{ rowNo: 4, kg: 2300, differenceKg: -100 }]);
  assert.ok(res.warnings.some((warning) => warning.rowNo === 5 && /ngoài bảng/.test(warning.message)));
  assert.match(res.rows[0].normalized.ticket_no, /^AUTO-/);
  assert.equal(res.rows[0].normalized.weigh2_date, '2026-09-22');
});
