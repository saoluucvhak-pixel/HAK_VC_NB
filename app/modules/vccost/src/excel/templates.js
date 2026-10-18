'use strict';
/**
 * File Excel MẪU để người dùng điền rồi Import: Phiếu cân, Danh sách xe.
 * Sheet dữ liệu đứng đầu, chỉ có tiêu đề + dòng trống đã định dạng (không có dòng ví dụ để khỏi bị import nhầm).
 * Sheet "Hướng dẫn" giải thích từng cột kèm ví dụ; sheet "Danh mục" liệt kê đơn vị/địa điểm đang có để chọn.
 * Tiêu đề cột khớp từ đồng nghĩa của bộ nhận dạng cột nên import tự map đúng.
 */
const ExcelJS = require('exceljs');

const BRAND = 'FF0E7C86', BRAND_DARK = 'FF0F2740', LINE = 'FFC9D3DF', ZEBRA = 'FFF4F8FB', REQ = 'FFFDE8E8', OPT = 'FFEAF1F8';
const F = (o = {}) => ({ name: 'Calibri', size: 11, ...o });
const border = { top: { style: 'thin', color: { argb: LINE } }, left: { style: 'thin', color: { argb: LINE } }, bottom: { style: 'thin', color: { argb: LINE } }, right: { style: 'thin', color: { argb: LINE } } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/** cols: [{key, header, width, req, fmt, align, note, eg, validate}] */
function dataSheet(wb, { name, title, subtitle, cols, rows = 500, extra = null }) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: BRAND } } });
  const NC = cols.length;
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  ws.mergeCells(1, 1, 1, NC); const t = ws.getCell(1, 1); t.value = title; t.font = F({ size: 16, bold: true, color: { argb: 'FFFFFFFF' } });
  t.fill = fill(BRAND_DARK); t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }; ws.getRow(1).height = 34;
  ws.mergeCells(2, 1, 2, NC); const s = ws.getCell(2, 1); s.value = subtitle; s.font = F({ italic: true, size: 10, color: { argb: 'FF44546A' } }); s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }; ws.getRow(2).height = 30;
  ws.getRow(3).height = 6;
  ws.mergeCells(4, 1, 4, NC); const lg = ws.getCell(4, 1);
  lg.value = { richText: [{ text: '■ ', font: F({ color: { argb: 'FFC0392B' }, bold: true }) }, { text: 'Cột bắt buộc (tiêu đề xanh đậm, gạch đỏ)    ', font: F({ size: 10 }) }, { text: '■ ', font: F({ color: { argb: 'FF5B8DB8' }, bold: true }) }, { text: 'Cột tùy chọn (tiêu đề xanh nhạt)    ', font: F({ size: 10 }) }, { text: 'Điền từ dòng 6 trở xuống — giữ nguyên dòng tiêu đề.', font: F({ size: 10, italic: true }) }] };
  lg.alignment = { vertical: 'middle', indent: 1, wrapText: true }; ws.getRow(4).height = NC < 6 ? 34 : 20;
  cols.forEach((c, i) => {
    const h = ws.getCell(5, i + 1); h.value = c.header; h.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); h.fill = fill(c.req ? BRAND : 'FF6B9FC4');
    h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; h.border = border;
    const tag = ws.getCell(5, i + 1); tag.note = undefined;
  });
  ws.getRow(5).height = 32;
  for (let r = 6; r < 6 + rows; r++) {
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1); cell.border = border; cell.font = F();
      cell.alignment = { horizontal: c.align || 'left', vertical: 'middle' };
      if (c.fmt) cell.numFmt = c.fmt;
      if (c.text) cell.numFmt = '@';
      if ((r - 6) % 2) cell.fill = fill(ZEBRA);
      if (c.formula) cell.value = { formula: c.formula(r) };
    });
  }
  // ghi chú bắt buộc/tùy chọn: tô màu viền dưới tiêu đề
  cols.forEach((c, i) => { const h = ws.getCell(5, i + 1); h.border = { ...border, bottom: { style: 'medium', color: { argb: c.req ? 'FFC0392B' : 'FF5B8DB8' } } }; });
  cols.forEach((c, i) => {
    if (c.validate) for (let r = 6; r < 6 + rows; r++) ws.getCell(r, i + 1).dataValidation = c.validate;
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: NC } };
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:5' };
  if (extra) extra(ws);
  return ws;
}

function guideSheet(wb, { title, intro, cols, tips }) {
  const ws = wb.addWorksheet('Hướng dẫn', { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FFE0A100' } } });
  [24, 14, 34, 44].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.mergeCells(1, 1, 1, 4); const t = ws.getCell(1, 1); t.value = title; t.font = F({ size: 15, bold: true, color: { argb: 'FFFFFFFF' } }); t.fill = fill(BRAND_DARK);
  t.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(1).height = 32;
  let r = 3;
  for (const line of intro) { ws.mergeCells(r, 1, r, 4); const c = ws.getCell(r, 1); c.value = line; c.font = F(); c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = 32; r++; }
  r++;
  ['Cột', 'Yêu cầu', 'Định dạng', 'Ví dụ / giải thích'].forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = fill(BRAND); c.border = border; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
  ws.getRow(r).height = 24; r++;
  for (const c of cols) {
    const vals = [c.header, c.req ? 'Bắt buộc' : 'Tùy chọn', c.format, c.eg];
    vals.forEach((v, i) => { const cell = ws.getCell(r, i + 1); cell.value = v; cell.border = border; cell.alignment = { wrapText: true, vertical: 'top' }; cell.font = F({ bold: i === 0, color: i === 1 ? { argb: c.req ? 'FFC0392B' : 'FF44546A' } : undefined }); if (i === 1) cell.fill = fill(c.req ? REQ : OPT); });
    ws.getRow(r).height = Math.max(22, 15 * Math.ceil(String(c.eg || '').length / 48)); r++;
  }
  r++;
  ws.mergeCells(r, 1, r, 4); const th = ws.getCell(r, 1); th.value = 'LƯU Ý'; th.font = F({ bold: true, color: { argb: BRAND } }); r++;
  for (const tip of tips) { ws.mergeCells(r, 1, r, 4); const c = ws.getCell(r, 1); c.value = '•  ' + tip; c.font = F(); c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = tip.length > 110 ? 32 : 18; r++; }
  return ws;
}

function listSheet(wb, name, header, items) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FF8896A5' } } });
  ws.getColumn(1).width = 44;
  const h = ws.getCell(1, 1); h.value = header; h.font = F({ bold: true, color: { argb: 'FFFFFFFF' } }); h.fill = fill(BRAND); h.border = border;
  items.forEach((v, i) => { const c = ws.getCell(i + 2, 1); c.value = v; c.border = border; c.font = F(); });
  return ws;
}

const listValidation = (sheet, n, msg) => ({ type: 'list', allowBlank: true, formulae: [`'${sheet}'!$A$2:$A$${Math.max(2, n + 1)}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Giá trị chưa có trong danh mục', error: msg });

async function ticketTemplate({ locations = [] } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'VC Cost'; wb.created = new Date();
  const dtFmt = 'dd/mm/yyyy hh:mm';
  const cols = [
    { header: 'STT', width: 7, align: 'center', fmt: '0', req: false, format: 'Số thứ tự', eg: 'Không bắt buộc, chỉ để dễ đối chiếu.' },
    { header: 'Số phiếu', width: 16, req: true, text: true, format: 'Văn bản (giữ số 0 đầu)', eg: 'Ví dụ: 000123 hoặc PC-0123. Mỗi phiếu một số riêng.' },
    { header: 'Ngày giờ cân 1', width: 19, align: 'center', req: true, fmt: dtFmt, format: 'dd/mm/yyyy hh:mm', eg: 'Ví dụ: 29/09/2026 13:16 — thời điểm cân lần 1.',
      validate: { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(2000, 0, 1)], showErrorMessage: true, errorTitle: 'Ngày giờ không hợp lệ', error: 'Nhập ngày giờ dạng dd/mm/yyyy hh:mm' } },
    { header: 'Ngày giờ cân 2', width: 19, align: 'center', req: false, fmt: dtFmt, format: 'dd/mm/yyyy hh:mm', eg: 'Ví dụ: 29/09/2026 13:52 — thời điểm cân lần 2 (nếu có).' },
    { header: 'Biển số', width: 14, align: 'center', req: true, text: true, format: 'Văn bản', eg: 'Gõ kiểu nào cũng được: 43H-01021, 43h 01021…' },
    { header: 'Cân lần 1 (kg)', width: 15, align: 'right', req: false, fmt: '#,##0', format: 'Số, kg', eg: 'Ví dụ: 45.500 — trọng lượng xe + hàng.' },
    { header: 'Cân lần 2 (kg)', width: 15, align: 'right', req: false, fmt: '#,##0', format: 'Số, kg', eg: 'Ví dụ: 27.700 — trọng lượng xe không.' },
    { header: 'KL hàng (kg)', width: 15, align: 'right', req: true, fmt: '#,##0', format: 'Số, kg', eg: 'Ví dụ: 17.800. Có sẵn công thức = |Cân 1 − Cân 2|; có thể nhập trực tiếp nếu không có hai lần cân.',
      formula: (r) => `IF(AND(ISNUMBER(F${r}),ISNUMBER(G${r})),ABS(F${r}-G${r}),"")` },
    { header: 'Nơi xuất', width: 28, req: true, format: 'Chọn từ danh sách hoặc gõ tên', eg: 'Ví dụ: Quế Sơn. Tên gọi khác đã khai báo ở Danh mục → Địa điểm vẫn nhận.',
      validate: locations.length ? listValidation('Danh mục', locations.length, 'Địa điểm này chưa có trong danh mục — vẫn nhập được, nhưng cần khai báo tên gọi trước khi tính giá.') : undefined },
  ];
  dataSheet(wb, { name: 'Phiếu cân', title: 'MẪU IMPORT PHIẾU CÂN — VC COST', cols,
    subtitle: 'Mỗi dòng là một phiếu cân (một chuyến xe). Điền xong lưu file .xlsx rồi vào VC Cost → Import phiếu cân → Chọn file. Xem sheet "Hướng dẫn" để biết định dạng từng cột.' });
  guideSheet(wb, { title: 'HƯỚNG DẪN ĐIỀN FILE MẪU PHIẾU CÂN',
    intro: ['File này dùng để nhập hàng loạt phiếu cân vào VC Cost. Chỉ cần điền sheet "Phiếu cân", từ dòng 6 trở xuống.',
      'Import lại cùng một file không tạo phiếu trùng: phiếu giống hệt được bỏ qua; phiếu trùng số nhưng khác dữ liệu được đưa vào "Cần kiểm tra".'],
    cols, tips: ['Không đổi tên, không xóa, không chèn cột trước dòng tiêu đề (dòng 5). Có thể thêm cột phụ phía sau, VC Cost sẽ bỏ qua.',
      'Số phiếu và Biển số để dạng văn bản để không mất số 0 đầu.',
      'Khối lượng tính bằng kg. Nếu chỉ có số tấn, đặt tên cột là "KL hàng (tấn)" và VC Cost tự đổi ra kg.',
      'Mỗi dòng cần có Số phiếu, Biển số, Nơi xuất và khối lượng (hoặc đủ hai lần cân). Dòng thiếu sẽ được báo lỗi ở bước Xem trước, không làm hỏng dữ liệu.',
      'Xe phải có trong Danh mục Xe và đã gán đơn vị vận chuyển thì mới tính được giá; xe mới có thể thêm trước bằng file mẫu "Danh sách xe".'] });
  if (locations.length) listSheet(wb, 'Danh mục', 'Địa điểm đang có trong VC Cost', locations);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function vehicleTemplate({ carriers = [] } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'VC Cost'; wb.created = new Date();
  const cols = [
    { header: 'STT', width: 7, align: 'center', fmt: '0', req: false, format: 'Số thứ tự', eg: 'Không bắt buộc.' },
    { header: 'Biển số', width: 16, align: 'center', req: true, text: true, format: 'Văn bản', eg: 'Gõ kiểu nào cũng được: 43H-01021, 43h 01021, 92H00903…' },
    { header: 'Công ty vận chuyển', width: 36, req: true, format: 'Chọn từ danh sách', eg: 'Mã đơn vị vận chuyển, ví dụ: HAK, HHH, QC. Chưa có thì chọn "tạo đơn vị mới" ở bước Xem trước khi import.',
      validate: carriers.length ? listValidation('Danh mục', carriers.length, 'Đơn vị này chưa có trong VC Cost — có thể tạo mới ở bước Xem trước khi import.') : undefined },
    { header: 'Từ ngày', width: 18, align: 'center', req: false, fmt: 'dd/mm/yyyy', format: 'dd/mm/yyyy', eg: 'Ngày xe bắt đầu thuộc đơn vị này. Để trống nếu là từ trước tới nay.' },
  ];
  dataSheet(wb, { name: 'Danh sách xe', title: 'MẪU IMPORT DANH SÁCH XE — VC COST', cols,
    subtitle: 'Mỗi dòng gán một xe cho một đơn vị vận chuyển. Điền xong lưu file .xlsx rồi vào VC Cost → Import phiếu cân → "Import danh sách xe".' });
  guideSheet(wb, { title: 'HƯỚNG DẪN ĐIỀN FILE MẪU DANH SÁCH XE',
    intro: ['Dùng để khai báo hàng loạt xe và đơn vị vận chuyển (chủ xe) của từng xe. Điền sheet "Danh sách xe", từ dòng 6 trở xuống.',
      'Phiếu cân sẽ tính cho đơn vị nào là dựa vào danh sách này theo ngày cân.'],
    cols, tips: ['Mỗi biển số chỉ nên xuất hiện một lần trong file. Cần ghi nhận xe đổi đơn vị theo thời gian thì import lần lượt từng đợt, mỗi đợt có cột "Từ ngày".',
      'Xe đã có trong VC Cost và cùng đơn vị: bỏ qua. Xe đã có nhưng khác đơn vị: VC Cost hỏi ngày bắt đầu áp dụng đơn vị mới, không tự ghi đè.',
      'Biển số sai định dạng sẽ được liệt kê ở bước Xem trước để sửa lại.'] });
  if (carriers.length) listSheet(wb, 'Danh mục', 'Đơn vị vận chuyển đang có trong VC Cost', carriers);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { ticketTemplate, vehicleTemplate };
