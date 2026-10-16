'use strict';
/** File Excel mẫu để import: sinh theo danh mục bản cài → điền dữ liệu → import lại được ngay, không phải ghép cột. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { ImportTemplates, TEMPLATE_FIRST_ROW } = require('../main/import/templates');
const { ImportService } = require('../main/import/ImportService');
const { install, CONTRACT, rid } = require('./install');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-mau-'));
const D = (s) => new Date(`${s}T00:00:00Z`);
const T = (h, m, s) => new Date(Date.UTC(1899, 11, 30, h, m, s));

test('File mẫu phiếu cân: 4 sheet, tiêu đề đúng tên phần mềm nhận, danh sách chọn từ danh mục; điền 3 dòng → import OK', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const f = path.join(tmp(), 'Mau_Import_PhieuCan.xlsx');
  const r = await new ImportTemplates(store).build({ importType: 'PHIEU_CAN', targetPath: f });
  assert.equal(r.sheet, 'NL_VC');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['NL_VC', 'HUONG_DAN', 'DANH_MUC', 'VI_DU (không import)']);
  const ws = wb.getWorksheet('NL_VC');
  const hdr = ws.getRow(5).values.slice(1).map((v) => (v && v.richText ? v.richText.map((t) => t.text).join('') : v));
  assert.equal(hdr[1], 'Số phiếu *'); assert.equal(hdr[14], 'Mã tuyến *');
  assert.equal(ws.getCell('O6').dataValidation.type, 'list');
  assert.match(ws.getCell('O6').dataValidation.formulae[0], /^DANH_MUC!\$A\$3:\$A\$\d+$/);
  assert.equal(ws.getCell('C6').numFmt, 'dd/mm/yyyy');
  const dm = wb.getWorksheet('DANH_MUC'); const routes = []; for (let i = 3; dm.getCell(`A${i}`).value; i++) routes.push(dm.getCell(`A${i}`).value);
  assert.ok(routes.includes('VC.007') && routes.length === store.all('TUYEN_VC').filter((x) => x.is_active).length);
  // điền như kế toán
  const rows = [
    [1, '9001', D('2026-10-01'), T(7, 5, 0), D('2026-10-01'), T(7, 30, 10), '92H-00057', 13500, 31800, 18300, '', '', '0726', 'Xuất', 'VC.007', 'DH'],
    [2, '9002', D('2026-10-01'), T(8, 0, 0), D('2026-10-01'), T(8, 20, 0), '92H-00133', 13000, 31000, 18000, '', '', '0726', 'Xuất', 'VC.007', 'DH'],
    [3, '9003', D('2026-10-01'), T(9, 0, 0), D('2026-10-01'), T(9, 25, 0), '92H-00141', 13200, 31500, 18300, '', '', '0726', 'Xuất', 'VC.007', 'DH'],
  ];
  rows.forEach((v, i) => v.forEach((x, j) => { ws.getCell(TEMPLATE_FIRST_ROW + i, j + 1).value = x; }));
  await wb.xlsx.writeFile(f);
  const pv = await new ImportService(store).preview({ importType: 'PHIEU_CAN', filePath: f, user: 'ketoan' });
  assert.equal(pv.sheet, 'NL_VC'); assert.equal(pv.headerRowNo, 5);
  assert.equal(Object.keys(pv.mapping).length, 16, 'mọi cột tự ghép, không phải chọn tay');
  assert.equal(pv.total, 3); assert.equal(pv.summary.error_rows || 0, 0, JSON.stringify(pv.rows.map((x) => x.issues)));
  assert.deepEqual(pv.rows.map((x) => [x.normalized.ticket_no, x.normalized.weigh1_date, x.normalized.weigh1_time, x.normalized.net_kg, x.normalized.route_code]),
    [['9001', '2026-10-01', '07:05:00', 18300, 'VC.007'], ['9002', '2026-10-01', '08:00:00', 18000, 'VC.007'], ['9003', '2026-10-01', '09:00:00', 18300, 'VC.007']]);
  store.close();
});

test('File mẫu bảng kê dầu theo hợp đồng: xe của hợp đồng, cột Thành tiền tự tính không bị đọc; điền → import OK; mẫu trống → 0 dòng', async () => {
  const { store } = await install('HAKQN', { withData: false });
  const T2 = new ImportTemplates(store); const imp = new ImportService(store);
  const f = path.join(tmp(), 'Mau_Import_Dau.xlsx');
  await assert.rejects(T2.build({ importType: 'GIAO_NHAN_DAU', targetPath: f }), /Chọn hợp đồng/);
  await T2.build({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, targetPath: f });
  const empty = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, filePath: f, user: 'ketoan' });
  assert.equal(empty.total, 0, 'mẫu trống (có công thức Thành tiền) không sinh dòng rác');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); const ws = wb.getWorksheet('NL_GIAONHANDAU');
  const plates = store.find('HOP_DONG_XE', (x) => x.contract_id === CONTRACT.HAKQN).map((x) => x.plate_no);
  const dm = wb.getWorksheet('DANH_MUC'); const listed = []; for (let i = 3; dm.getCell(`F${i}`).value; i++) listed.push(dm.getCell(`F${i}`).value);
  assert.deepEqual(listed.sort(), [...new Set(plates)].sort());
  [[D('2026-10-01'), 'VC.007', listed[0], 'Lít', 400, 29940, D('2026-10-01'), 'HAKQN'], [D('2026-10-02'), 'VC.007', listed[1], 'Lít', 350.5, 29940, null, 'HAKQN']]
    .forEach((v, i) => v.forEach((x, j) => { if (x !== null) ws.getCell(TEMPLATE_FIRST_ROW + i, j + 1).value = x; }));
  await wb.xlsx.writeFile(f);
  const pv = await imp.preview({ importType: 'GIAO_NHAN_DAU', contractId: CONTRACT.HAKQN, filePath: f, user: 'ketoan' });
  assert.equal(pv.sheet, 'NL_GIAONHANDAU'); assert.equal(pv.total, 2);
  assert.ok(!Object.values(pv.mapping).includes(undefined) && Object.keys(pv.mapping).length === 9, JSON.stringify(pv.mapping));
  assert.equal(pv.summary.error_rows || 0, 0, JSON.stringify(pv.rows.map((x) => x.issues)));
  const c = await imp.confirm({ batchId: pv.batchId, acceptWarnings: true, clientRequestId: rid(), user: 'ketoan' });
  assert.equal(c.inserted, 2);
  store.close();
});
