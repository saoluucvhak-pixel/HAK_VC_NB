'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');

const CONFIG = { headerRow: 3, fallbackUnit: '', mapping: {
  ticket_no: 'Số phiếu', plate_no: 'Biển số', weigh1_date: 'Ngày giờ cân', net_kg: 'Khối lượng hàng', weight_unit: 'ĐVT',
  warehouse: 'Kho', import_note: 'Ghi chú', route_code: 'Mã tuyến',
} };

async function workbook(dir, name, { plate, route, order, splitDates = false, malformed = '', firstTicket = 42, firstMass = 1.5 } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Hướng dẫn').addRow(['File tổng hợp']);
  const ws = wb.addWorksheet('Phiếu nhà cung cấp');
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'BẢNG KÊ PHIẾU CÂN';
  const baseOrder = order || [0, 1, 2, 3, 4, 5, 6, 7];
  const columns = splitDates ? [...baseOrder, 8, 9, 10] : baseOrder;
  const add = (values) => ws.addRow(columns.map((i) => values[i]));
  add(['Phiếu', 'Phương tiện', 'Thời gian', 'Khối lượng', 'Khối lượng', 'Thông tin', 'Thông tin', 'Tuyến']);
  const titles = ['Số phiếu', 'Biển số', 'Ngày\ngiờ cân', 'Khối lượng hàng', 'ĐVT', 'Kho', 'Ghi chú', 'Mã tuyến'];
  if (splitDates) {
    titles[2] = 'Ngày cân 1';
    titles.push('Giờ cân 1', 'Ngày cân 2', 'Giờ cân 2');
  }
  if (malformed === 'missing') titles[1] = 'Xe mới';
  if (malformed === 'duplicate') titles[5] = 'BIỂN SỐ';
  add(titles);
  const first = add([firstTicket, plate, splitDates ? '22/09/2026' : new Date('2026-09-22T08:15:30Z'), firstMass, malformed === 'unit' ? 'bao' : 'tấn', 'Kho A', 'Lô sớm', route, '23:50:00', '23/09/2026', '00:30:00']);
  first.getCell(columns.indexOf(0) + 1).numFmt = '000000';
  add(['000043', plate, splitDates ? '22/09/2026' : '22/09/2026 09:30', 2300, 'KG', 'Kho B', 'Ca sáng', route, '09:30:00', '22/09/2026', '09:45:00']);
  add(['Tổng cộng (kg)', null, null, 3900, null, null, null, null]);
  add(['Đà Nẵng, ngày 22 tháng 09 năm 2026', null, new Date('2026-09-22T00:00:00Z'), null, null, null, null, null]);
  const file = path.join(dir, name);
  await wb.xlsx.writeFile(file);
  return file;
}

module.exports = { CONFIG, workbook };
