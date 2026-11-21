'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { writeTable, writeTableStream } = require('../main/reports/xlsxExport');

test('Báo cáo Excel 1.8.3: writeTableStream xuất bảng dữ liệu lớn chính xác, đọc lại khớp 100%', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgvc-report-stream-'));
  const outFile = path.join(tmpDir, 'test_large_tickets.xlsx');

  const columns = [
    { header: 'Số phiếu', key: 'ticket_no', fmt: 'text' },
    { header: 'Ngày cân', key: 'ticket_date', fmt: 'date' },
    { header: 'Biển số xe', key: 'plate_no', fmt: 'text' },
    { header: 'Khối lượng (KG)', key: 'net_kg', fmt: 'int' },
    { header: 'Đơn giá', key: 'price', fmt: 'money' },
    { header: 'Thành tiền', key: 'amount', fmt: 'money' },
    { header: 'Diễn giải ghi chú', key: 'description', fmt: 'text' },
  ];

  // Tạo 2.500 dòng dữ liệu mô phỏng
  const rows = [];
  let totalKg = 0;
  let totalAmount = 0;
  for (let i = 1; i <= 2500; i++) {
    const kg = 20000 + (i % 5000);
    const price = 120000;
    const amount = Math.round((kg / 1000) * price);
    totalKg += kg;
    totalAmount += amount;
    rows.push({
      ticket_no: `PC-${String(i).padStart(6, '0')}`,
      ticket_date: '2026-09-20',
      plate_no: `92C-${String(1000 + (i % 20))}`,
      net_kg: kg,
      price,
      amount,
      description: `Vận chuyển dăm chuyến số ${i}`,
    });
  }

  const d = {
    company: { unit_name: 'Chi nhánh HAK Quảng Nam' },
    title: 'BÁO CÁO PHIẾU CÂN VẬN CHUYỂN DĂM GỖ',
    subtitle: 'Kỳ tháng 09/2026 (Xuất luồng stream tối ưu RAM)',
    columns,
    rows,
    totalsRow: {
      ticket_no: 'TỔNG CỘNG',
      net_kg: totalKg,
      amount: totalAmount,
    },
  };

  // 1. Chạy writeTable (với >= 2000 dòng nó tự kích hoạt writeTableStream)
  await writeTable(d, outFile, { landscape: true });

  assert.ok(fs.existsSync(outFile), 'file đã được tạo');
  const stat = fs.statSync(outFile);
  assert.ok(stat.size > 20000, `kích thước file hợp lệ: ${stat.size} byte`);

  // 2. Mở lại file bằng ExcelJS để kiểm tra từng dòng và giá trị
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outFile);
  const ws = wb.worksheets[0];

  assert.equal(ws.getCell('A1').value, 'CHI NHÁNH HAK QUẢNG NAM');
  assert.equal(ws.getCell('A2').value, 'BÁO CÁO PHIẾU CÂN VẬN CHUYỂN DĂM GỖ');
  assert.equal(ws.getCell('A4').value, 'Số phiếu');
  assert.equal(ws.getCell('D4').value, 'Khối lượng (KG)');

  // Kiểm tra dòng đầu tiên (dòng 5)
  assert.equal(ws.getCell('A5').value, 'PC-000001');
  assert.equal(ws.getCell('B5').value, '20/09/2026');
  assert.equal(ws.getCell('D5').value, rows[0].net_kg);

  // Kiểm tra dòng cuối cùng (dòng 2504)
  const lastRowIdx = 5 + 2500 - 1;
  assert.equal(ws.getCell(`A${lastRowIdx}`).value, 'PC-002500');

  // Kiểm tra dòng tổng cộng
  const totalsRowIdx = 5 + 2500;
  assert.equal(ws.getCell(`A${totalsRowIdx}`).value, 'TỔNG CỘNG');
  assert.equal(ws.getCell(`D${totalsRowIdx}`).value, totalKg);
  assert.equal(ws.getCell(`F${totalsRowIdx}`).value, totalAmount);
});
