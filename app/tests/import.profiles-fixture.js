'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');

const CONFIG = { headerRow: 3, fallbackUnit: '', mapping: {
  ticket_no: 'Số phiếu', plate_no: 'Biển số', weigh1_date: 'Ngày giờ cân', net_kg: 'Khối lượng hàng', weight_unit: 'ĐVT',
  warehouse: 'Kho', import_note: 'Ghi chú', route_code: 'Mã tuyến',
} };

async function workbook(dir, name, { plate, route, order = [0, 1, 2, 3, 4, 5, 6, 7], malformed = '', firstTicket = 42 } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Hướng dẫn').addRow(['File tổng hợp']);
  const ws = wb.addWorksheet('Phiếu nhà cung cấp');
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'BẢNG KÊ PHIẾU CÂN';
  const add = (values) => ws.addRow(order.map((i) => values[i]));
  add(['Phiếu', 'Phương tiện', 'Thời gian', 'Khối lượng', 'Khối lượng', 'Thông tin', 'Thông tin', 'Tuyến']);
  const titles = ['Số phiếu', 'Biển số', 'Ngày\ngiờ cân', 'Khối lượng hàng', 'ĐVT', 'Kho', 'Ghi chú', 'Mã tuyến'];
  if (malformed === 'missing') titles[1] = 'Xe mới';
  if (malformed === 'duplicate') titles[5] = 'BIỂN SỐ';
  add(titles);
  const first = add([firstTicket, plate, new Date('2026-09-22T08:15:30Z'), 1.5, malformed === 'unit' ? 'bao' : 'tấn', 'Kho A', 'Lô sớm', route]);
  first.getCell(order.indexOf(0) + 1).numFmt = '000000';
  add(['000043', plate, '22/09/2026 09:30', 2300, 'KG', 'Kho B', 'Ca sáng', route]);
  add(['Tổng cộng (kg)', null, null, 3900, null, null, null, null]);
  add(['Đà Nẵng, ngày 22 tháng 09 năm 2026', null, new Date('2026-09-22T00:00:00Z'), null, null, null, null, null]);
  const file = path.join(dir, name);
  await wb.xlsx.writeFile(file);
  return file;
}

module.exports = { CONFIG, workbook };
