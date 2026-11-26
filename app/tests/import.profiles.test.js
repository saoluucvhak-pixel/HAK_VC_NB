'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { newStore } = require('../main/repo/createStore');
const { openWorkbook, parseCsv } = require('../main/import/excelReader');
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
  const reordered = await workbook(dir, 'doi-thu-tu.xlsx', { ...catalog, firstMass: '1.500', order: [7, 4, 2, 6, 1, 5, 0, 3] });
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

  const { item } = await Profiles.save(store, { name: 'Mẫu nhà cung cấp', filePath: initial, sheetName, config: CONFIG, numberStyle: 'EN' }, user);
  const { item: copy } = await Profiles.save(store, { name: 'Bản sao', copyFromId: item.id }, user);
  assert.equal(copy.numberStyle, 'EN');
  await Profiles.selectDefault(store, { id: item.id }, user);
  const active = Profiles.list(store).items.find((profile) => profile.isDefault);
  const stored = store.get('IMPORT_PROFILE', active.id);
  assert.deepEqual(Object.keys(JSON.parse(stored.config_json)).sort(), ['fallbackUnit', 'headerRow', 'mapping', 'numberStyle']);
  assert.ok(!stored.config_json.includes(initial));
  await Profiles.save(store, { id: active.id, rowVersion: active.rowVersion, name: 'Mẫu đang dùng', filePath: initial, sheetName, config: CONFIG, numberStyle: 'EN' }, user);

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
  assert.equal(pv.numberStyle, 'EN');
  const manual = await imp.preview({ ...input, filePath: reordered, numberStyle: 'AUTO' });
  assert.equal(manual.numberStyle, 'AUTO');
  assert.equal(manual.readConfig.config.numberStyle, 'EN');
  assert.ok(manual.rows[0].issues.some((issue) => issue.code === 'E_NUMBER_AMBIGUOUS'));
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
  assert.equal(Profiles.list(storage).items[0].numberStyle, 'EN');
  const current = Profiles.list(storage).items[0];
  await storage.transaction((tx) => tx.update('IMPORT_PROFILE', current.id, { config_json: JSON.stringify(CONFIG) }));
  assert.equal(Profiles.list(storage).items[0].numberStyle, 'AUTO', 'Mẫu lưu ở bản cũ mặc định tự động');
  await Profiles.selectDefault(storage, { id: current.id }, user);
  const reopened = new ImportService(storage);
  await assert.rejects(reopened.preview({ ...input, filePath: initial, sourceBatchId: replacement.batchId }), /đúng file Excel gốc/);
  const historical = await reopened.preview({ ...input, filePath: reordered, sourceBatchId: replacement.batchId, numberStyle: 'VN' });
  assert.equal(historical.readConfig.name, 'Bản sao');
  assert.equal(historical.numberStyle, 'EN');
  assert.deepEqual(historical.readConfig.config, { ...CONFIG, numberStyle: 'EN' });
  assert.equal(historical.rows[0].normalized.net_kg, 1500);
  assert.deepEqual(historical.rows.map((row) => row.normalized.ticket_no), ['000042', '000043']);
  assert.equal(historical.summary.duplicate, 2);
  const id = confirmed.insertedIds[0];
  await storage.transaction((tx) => tx.update('PHIEU_CAN', id, { weigh2_date: '2026-09-23', weigh2_time: '00:30:00' }));
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Cân');
  sheet.addRow(['Số phiếu', 'Biển số', 'Ngày cân 1', 'Khối lượng hàng (kg)', 'Mã tuyến']);
  const row = sheet.addRow(['000042', catalog.plate, new Date('2026-09-22T00:00:00Z'), 1600, catalog.route]);
  row.getCell(3).numFmt = 'dd/mm/yyyy';
  const plainDate = path.join(dir, 'phieu-chi-co-ngay.xlsx');
  await wb.xlsx.writeFile(plainDate);
  const readConfig = { headerRow: 1, mapping: { ticket_no: 'Số phiếu', plate_no: 'Biển số', weigh1_date: 'Ngày cân 1',
    net_kg: 'Khối lượng hàng (kg)', route_code: 'Mã tuyến' } };
  const update = await reopened.preview({ ...input, filePath: plainDate, readConfig });
  assert.equal(update.rows[0].normalized.weigh1_time, '');
  assert.equal(update.summary.update, 1);
  await reopened.confirm({ batchId: update.batchId, acceptWarnings: true, clientRequestId: rid(), user });
  const preserved = storage.get('PHIEU_CAN', id);
  assert.deepEqual([preserved.weigh1_time, preserved.weigh2_date, preserved.weigh2_time, preserved.net_kg],
    ['08:15:30', '2026-09-23', '00:30:00', 1600]);
});

test('Mẫu ghép hai tầng, tính chênh hai lần cân, đơn vị dự phòng và mã phiếu tự sinh', async (t) => {
  const { tmpdir } = require('node:os');
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

test('Mẫu nhập phân biệt dấu thập phân của tấn và từ chối nhóm chữ số sai', () => {
  const mapping = { ticket_no: 'Mã', plate_no: 'Xe', weigh1_date: 'Ngày', net_kg: 'Cân' };
  const read = (inputs, numberStyle, fallbackUnit = '') => {
    const rows = [
      ['Mã', 'Xe', 'Ngày', 'Cân'],
      ...inputs.map((input, i) => [`0000${i + 1}`, '99A-00001', '26/11/2026', input]),
    ];
    const book = { sheets: [{ name: sheetName }], rows: () => rows };
    return Profiles.read(book, sheetName, { headerRow: 1, mapping, fallbackUnit }, numberStyle).trial;
  };
  const auto = read(['17.470 t', '17,470 t', '17.470 kg', '1,2,3 kg', '12,34.56 kg']);
  assert.equal(auto.count, 1);
  assert.equal(auto.totalKg, 17470);
  assert.equal(auto.rows[0].issues[0].code, 'E_NUMBER_AMBIGUOUS');
  assert.equal(auto.rows[1].issues[0].code, 'E_NUMBER_AMBIGUOUS');
  for (const row of auto.rows.slice(3)) assert.match(row.issues[0].message, /số không đọc được/);
  assert.equal(read(['17.470 t'], 'EN').totalKg, 17470);
  assert.equal(read(['17,470 t'], 'VN').totalKg, 17470);
  assert.equal(read(['1.234,5 kg'], 'VN').totalKg, 1234.5);
  assert.equal(read(['1,234.5 kg'], 'EN').totalKg, 1234.5);
  assert.equal(read(['17.470'], 'AUTO', 't').rows[0].issues[0].code, 'E_NUMBER_AMBIGUOUS');
  assert.equal(read([17.47], 'AUTO', 't').totalKg, 17470);
  assert.equal(read(['1,2,3 kg'], 'EN').count, 0);
  assert.equal(read(['12,34.56 kg'], 'VN').count, 0);
});

test('Mẫu tách ngày giờ hai lần cân, cho xem đúng tiêu đề và bỏ qua phần ký sau dòng tổng', () => {
  const headers = ['Số phiếu', 'Biển số', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Khối lượng hàng (kg)', 'ĐVT'];
  const rows = [
    ['BẢNG KÊ PHIẾU CÂN'],
    headers,
    ['00042', '92H-00057', '26/11/2026', { __time: '23:50:00' }, '27/11/2026', 1 / 48, 2500, 'kg'],
    ['Tổng cộng (kg)', null, null, null, null, null, 2500, null],
    [null, null, null, null, null, null, 'Ngày 26 tháng 11 năm 2026', 'Ngày 26 tháng 11 năm 2026'],
    [null, null, null, null, null, null, 'Người kiểm tra', 'Người duyệt'],
    [null, null, null, null, null, null, '(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)'],
  ];
  const wb = { sheets: [{ name: sheetName }], rows: () => rows };
  const inspected = Profiles.inspect(wb, sheetName, 2);
  assert.deepEqual(inspected.headerCells, headers.map((title, i) => ({ column: i + 1, title })));
  assert.deepEqual(Profiles.inspect(wb, sheetName, 1).headerCells, [{ column: 1, title: 'BẢNG KÊ PHIẾU CÂN' }]);
  const mapping = inspected.suggested;
  assert.equal(mapping.weigh1_date, 'Ngày cân 1');
  assert.equal(mapping.weigh1_time, 'Giờ cân 1');
  assert.equal(mapping.weigh2_date, 'Ngày cân 2');
  assert.equal(mapping.weigh2_time, 'Giờ cân 2');
  const result = Profiles.read(wb, sheetName, { headerRow: 2, mapping }).trial;
  const ticket = result.rows[0].normalized;
  assert.deepEqual(
    [ticket.weigh1_date, ticket.weigh1_time, ticket.weigh2_date, ticket.weigh2_time],
    ['2026-11-26', '23:50:00', '2026-11-27', '00:30:00']
  );
  assert.equal(result.totalRows, 1);
  assert.equal(result.totalKg, 2500);
  assert.deepEqual(result.declaredTotals, [{ rowNo: 4, kg: 2500, differenceKg: 0 }]);
  assert.deepEqual(result.warnings.map((warning) => warning.rowNo), [5, 6, 7]);

  rows.push(['00043', '92H-00057', '27/11/2026', '09:00', null, null, 'Sai dữ liệu', 'bao']);
  assert.throws(() => Profiles.read(wb, sheetName, { headerRow: 2, mapping }), /Dòng 8: Đơn vị “bao”/);
});

test('Một cột Date Time được ghép vào cả ngày và giờ của cùng một lần cân', () => {
  const rows = [
    ['Số phiếu', 'Biển số', 'Ngày giờ cân 1', 'Ngày giờ cân 2', 'Khối lượng hàng (kg)'],
    ['00042', '92H-00057', { __date: '2026-11-26', __time: '23:50:00' }, '27/11/2026 00:30', 2500],
  ];
  const wb = { sheets: [{ name: sheetName }], rows: () => rows };
  const config = { headerRow: 1, mapping: {
    ...Profiles.inspect(wb, sheetName, 1).suggested,
    weigh1_time: 'Ngày giờ cân 1',
    weigh2_time: 'Ngày giờ cân 2',
  } };
  const result = Profiles.read(wb, sheetName, config).trial;
  assert.equal(result.count, 1);
  const ticket = result.rows[0].normalized;
  assert.deepEqual(
    [ticket.weigh1_date, ticket.weigh1_time, ticket.weigh2_date, ticket.weigh2_time],
    ['2026-11-26', '23:50:00', '2026-11-27', '00:30:00']
  );
  assert.throws(() => Profiles.read(wb, sheetName, { ...config, mapping: { ...config.mapping, weigh2_time: 'Ngày giờ cân 1' } }),
    /Chỉ được ghép chung một cột/);
});

test('Ngày cân 2 dùng chung cột Ngày cân 1 và tự động qua đêm khi giờ ra nhỏ hơn giờ vào', () => {
  const rows = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Giờ vào', 'Giờ ra', 'Khối lượng (kg)'],
    ['00099', '92H-00057', '26/11/2026', '23:45:00', '01:15:00', 3200],
  ];
  const wb = { sheets: [{ name: sheetName }], rows: () => rows };
  const config = { headerRow: 1, mapping: {
    ticket_no: 'Số phiếu',
    plate_no: 'Biển số',
    weigh1_date: 'Ngày cân',
    weigh2_date: 'Ngày cân',
    weigh1_time: 'Giờ vào',
    weigh2_time: 'Giờ ra',
    net_kg: 'Khối lượng (kg)',
  } };
  const result = Profiles.read(wb, sheetName, config).trial;
  assert.equal(result.count, 1);
  const ticket = result.rows[0].normalized;
  assert.deepEqual(
    [ticket.weigh1_date, ticket.weigh1_time, ticket.weigh2_date, ticket.weigh2_time],
    ['2026-11-26', '23:45:00', '2026-11-27', '01:15:00']
  );
});


test('Đọc thử phân biệt ngày cân 2 trống và ngày cân 2 ghi rõ', () => {
  const rows = [
    ['Số phiếu', 'Biển số', 'Ngày cân 1', 'Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2', 'Khối lượng hàng (kg)'],
    ['001', '92H-00057', '26/11/2026', '23:50', '', '00:30', 1600],
    ['002', '92H-00057', '26/11/2026', '23:50', '26/11/2026', '00:30', 1700],
    ['003', '92H-00057', '26/11/2026', '07:00', '25/11/2026', '08:00', 1800],
    ['004', '92H-00057', '26/11/2026', '23:50', '27/11/2026', '00:30', 1900],
  ];
  const wb = { sheets: [{ name: sheetName }], rows: () => rows };
  const result = Profiles.read(wb, sheetName, { headerRow: 1, mapping: Profiles.inspect(wb, sheetName, 1).suggested }).trial;
  assert.equal(result.count, 2);
  assert.equal(result.totalKg, 3500);
  assert.equal(result.rows[0].normalized.weigh2_date, '2026-11-27');
  assert.equal(result.rows[1].normalized.weigh2_date, '2026-11-26');
  for (const row of result.rows.slice(1, 3)) assert.deepEqual(row.issues.map((item) => item.code), ['E_DATE_INVALID']);
});

test('CSV giữ dấu phẩy thập phân và nội dung có dấu phân cách trong ô', () => {
  const text = 'Số phiếu;Biển số;Ngày cân;Khối lượng (t);Ghi chú\r\n'
    + '0001;92H-00057;26/11/2026;17,470;"Có ""ghi chú""; hợp lệ"\r\n';
  const rows = parseCsv(text);
  assert.deepEqual(rows[1], ['0001', '92H-00057', '26/11/2026', '17,470', 'Có "ghi chú"; hợp lệ']);
  assert.deepEqual(parseCsv('Mã,Ghi chú\n001,"Dòng 1;\nDòng 2"'), [['Mã', 'Ghi chú'], ['001', 'Dòng 1;\nDòng 2']]);
  const wb = { sheets: [{ name: 'CSV' }], rows: () => rows };
  const result = Profiles.read(wb, 'CSV', { headerRow: 1, mapping: Profiles.inspect(wb, 'CSV', 1).suggested }, 'VN').trial;
  assert.equal(result.totalKg, 17470);
});
