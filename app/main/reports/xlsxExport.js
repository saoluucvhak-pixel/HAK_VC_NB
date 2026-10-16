'use strict';
/** Xuất Excel bằng exceljs. BKVC theo bố cục sheet BKVC hiện tại (A4 dọc, 10 cột A–J); bảng khác: A4 ngang, dòng tiêu đề cố định. */
const ExcelJS = require('exceljs');

const FMT = { int: '#,##0', money: '#,##0', dec1: '#,##0.0', dec2: '#,##0.00', date: '@', text: '@' };
const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = 'Times New Roman';
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

async function writeBkvc(d, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  const ws = wb.addWorksheet('BKVC', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  ws.columns = [6, 14, 9, 15, 13, 11, 16, 14, 16, 12].map((w) => ({ width: w }));
  const put = (addr, v, st = {}) => { const c = ws.getCell(addr); c.value = v; c.font = { name: FONT, size: 11, ...st.font }; if (st.align) c.alignment = st.align; return c; };
  const merge = (a, b, v, st) => { ws.mergeCells(`${a}:${b}`); return put(a, v, st); };
  const H = d.header;
  put('A1', H.carrier.unitName, { font: { bold: true } });
  put('A2', H.carrier.address);
  if (H.carrier.taxCode) put('A3', `MST: ${H.carrier.taxCode}`);
  if (H.contractNo) put('H1', `Hợp đồng số: ${H.contractNo}`, { font: { italic: true } });
  merge('A4', 'J4', H.title, { font: { bold: true, size: 14 }, align: { horizontal: 'center' } });
  merge('A5', 'J5', H.periodText, { font: { italic: true }, align: { horizontal: 'center' } });
  const heads = ['STT', 'Biển số xe', 'Số chuyến', 'Khối lượng (KG)', 'Khối lượng (Tấn)', 'Đơn giá', 'Thành tiền', `VAT (${H.vatPct}%)`, 'Thành tiền', 'Ghi chú'];
  const hr = ws.getRow(6); hr.height = 30;
  heads.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { name: FONT, bold: true, size: 11 }; c.border = box;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; });
  let r = 7;
  for (const l of d.lines) {
    const vals = [l.seq, l.plate_no, l.trip_count, l.kg, l.ton, l.unit_price, l.amount, l.vat, l.amount_incl_vat, l.note || ''];
    const fm = [FMT.int, '@', FMT.int, FMT.int, FMT.dec2, FMT.money, FMT.money, FMT.money, FMT.money, '@'];
    vals.forEach((v, i) => { const c = ws.getRow(r).getCell(i + 1); c.value = v; c.numFmt = fm[i]; c.border = box; c.font = { name: FONT, size: 11 };
      c.alignment = { horizontal: i === 0 ? 'center' : (i === 1 || i === 9 ? 'left' : 'right') }; });
    r++;
  }
  const T = d.totals;
  ws.mergeCells(`A${r}:B${r}`);
  const tv = { A: 'TỔNG CỘNG', C: T.trips, D: T.kg, E: T.ton, G: T.amount, H: T.vat, I: T.total };
  for (const col of 'ABCDEFGHIJ') { const c = ws.getCell(`${col}${r}`); if (tv[col] !== undefined) c.value = tv[col]; c.border = box; c.font = { name: FONT, bold: true, size: 11 };
    c.numFmt = col === 'E' ? FMT.dec2 : FMT.int; c.alignment = { horizontal: col === 'A' ? 'center' : 'right' }; }
  r++;
  merge(`A${r}`, `J${r}`, `Bằng chữ: ${d.amountInWords}`, { font: { italic: true, bold: true }, align: { wrapText: true, vertical: 'top' } }); ws.getRow(r).height = 32; r++;
  merge(`G${r}`, `J${r}`, H.placeDate, { font: { italic: true }, align: { horizontal: 'center' } }); r++;
  const S = d.signers;
  merge(`A${r}`, `E${r}`, S.carrier.unitName, { font: { bold: true }, align: { horizontal: 'center', shrinkToFit: true } });
  merge(`F${r}`, `J${r}`, S.customer.unitName, { font: { bold: true }, align: { horizontal: 'center', shrinkToFit: true } }); ws.getRow(r).height = 18; r++;
  merge(`A${r}`, `C${r}`, S.carrier.signer.title, { font: { bold: true }, align: { horizontal: 'center' } });
  if (S.carrier.accountant) merge(`D${r}`, `E${r}`, 'Kế toán', { font: { bold: true }, align: { horizontal: 'center' } });
  merge(`F${r}`, `H${r}`, S.customer.signer.title, { font: { bold: true }, align: { horizontal: 'center' } });
  if (S.customer.accountant) merge(`I${r}`, `J${r}`, 'Kế toán', { font: { bold: true }, align: { horizontal: 'center' } });
  r += 5;
  merge(`A${r}`, `C${r}`, S.carrier.signer.name, { font: { bold: true }, align: { horizontal: 'center' } });
  if (S.carrier.accountant) merge(`D${r}`, `E${r}`, S.carrier.accountant, { font: { bold: true }, align: { horizontal: 'center' } });
  merge(`F${r}`, `H${r}`, S.customer.signer.name, { font: { bold: true }, align: { horizontal: 'center' } });
  if (S.customer.accountant) merge(`I${r}`, `J${r}`, S.customer.accountant, { font: { bold: true }, align: { horizontal: 'center' } });
  ws.pageSetup.printArea = `A1:J${r}`;
  ws.headerFooter.oddFooter = `&L&8${H.periodCode}&R&8Trang &P/&N`;
  // như BKVC!C37 của Excel: diễn giải cước để viết hóa đơn — NGOÀI vùng in, 1 dòng / xe
  if (d.invoiceLines && d.invoiceLines.length) {
    r += 3; put(`C${r}`, 'Diễn giải cước để viết hóa đơn (không in):', { font: { italic: true, bold: true } });
    for (const l of d.invoiceLines) { r++; put(`C${r}`, l.description, { font: { size: 10 } }); }
    const inv = wb.addWorksheet('HOA_DON', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    inv.columns = [6, 90, 7, 11, 11, 15, 8, 13, 15].map((w) => ({ width: w }));
    const hh = inv.addRow(['STT', 'Tên hàng hóa, dịch vụ (diễn giải)', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thuế suất (%)', 'Tiền thuế GTGT', 'Tổng cộng']);
    hh.eachCell((c) => { c.font = { name: FONT, bold: true }; c.border = box; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    const fm = [FMT.int, '@', '@', FMT.dec2, FMT.money, FMT.money, FMT.dec1, FMT.money, FMT.money];
    for (const l of d.invoiceLines) {
      const row = inv.addRow([l.seq, l.description, l.uom, l.qty, l.unit_price, l.amount, l.vat_rate_pct, l.vat, l.total]);
      row.eachCell((c, i) => { c.numFmt = fm[i - 1]; c.border = box; c.font = { name: FONT, size: 10 }; c.alignment = { vertical: 'top', wrapText: i === 2 }; });
    }
    const t = inv.addRow(['', 'TỔNG CỘNG', '', d.totals.ton, '', d.totals.amount, '', d.totals.vat, d.totals.total]);
    t.eachCell((c, i) => { c.numFmt = fm[i - 1]; c.border = box; c.font = { name: FONT, bold: true }; });
  }
  await wb.xlsx.writeFile(file);
}

async function writeTable(d, file, { landscape = true } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  tableSheet(wb, d, { landscape });
  await wb.xlsx.writeFile(file);
}

/** Nhiều bảng trong 1 file: d = { company, title, subtitle, sheets:[{ name, title, columns, rows, totalsRow }] } */
async function writeSheets(d, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  for (const sh of d.sheets) {
    tableSheet(wb, { company: d.company, title: sh.title === sh.name ? d.title : `${d.title} — ${sh.title}`, subtitle: d.subtitle, columns: sh.columns, rows: sh.rows, totalsRow: sh.totalsRow }, { sheetName: sh.name });
  }
  await wb.xlsx.writeFile(file);
}

function tableSheet(wb, d, { landscape = true, sheetName } = {}) {
  const ws = wb.addWorksheet((sheetName || d.title).slice(0, 30), { pageSetup: { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }] });
  ws.getCell('A1').value = d.company ? d.company.unit_name.toUpperCase() : ''; ws.getCell('A1').font = { name: FONT, bold: true };
  ws.getCell('A2').value = d.title; ws.getCell('A2').font = { name: FONT, bold: true, size: 14 };
  ws.getCell('A3').value = d.subtitle; ws.getCell('A3').font = { name: FONT, italic: true };
  const hr = ws.getRow(4); hr.height = 42;
  d.columns.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.header; cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2740' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = box;
    const fit = c.fmt === 'text' && c.key !== 'description' ? Math.min(42, Math.max(0, ...d.rows.map((r) => String(r[c.key] == null ? '' : r[c.key]).length)) + 2) : 0;
    ws.getColumn(i + 1).width = c.key === 'description' ? 70 : Math.max(8, fit, Math.min(28, c.header.length < 12 ? 12 : 16)); });
  d.rows.forEach((row, ri) => {
    d.columns.forEach((c, i) => {
      const cell = ws.getRow(5 + ri).getCell(i + 1);
      const v = row[c.key];
      cell.value = c.fmt === 'date' ? dmy(v) : (v === '' ? null : v);
      cell.numFmt = FMT[c.fmt] || '@'; cell.border = box; cell.font = { name: FONT, size: 10, bold: !!row._b };
      if (row._b) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F8' } };
      cell.alignment = { horizontal: ['int', 'money', 'dec1', 'dec2'].includes(c.fmt) ? 'right' : 'left', vertical: 'top', wrapText: c.key === 'description' };
    });
  });
  if (d.totalsRow) {
    const r = ws.getRow(5 + d.rows.length);
    d.columns.forEach((c, i) => { if (d.totalsRow[c.key] === undefined) return; const cell = r.getCell(i + 1); cell.value = d.totalsRow[c.key];
      cell.numFmt = FMT[c.fmt] || '@'; cell.border = box; cell.font = { name: FONT, bold: true, size: 10 }; });
  }
  if (d.totals) {
    const r = ws.getRow(5 + d.rows.length);
    r.getCell(2).value = 'TỔNG CỘNG'; r.getCell(1).value = d.totals.trips;
    const kgCol = d.columns.findIndex((c) => c.key === 'net_kg'); if (kgCol >= 0) { r.getCell(kgCol + 1).value = d.totals.kg; r.getCell(kgCol + 1).numFmt = FMT.int; }
    r.font = { name: FONT, bold: true };
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: d.columns.length } };
  // bảng phụ (vd đối chiếu km đồng hồ) ghi tiếp bên dưới
  let rr = 5 + d.rows.length + (d.totals || d.totalsRow ? 1 : 0) + 1;
  for (const x of d.extraTables || []) {
    ws.getCell(rr, 1).value = x.title; ws.getCell(rr, 1).font = { name: FONT, bold: true, size: 12 }; rr++;
    x.columns.forEach((c, i) => { const cell = ws.getCell(rr, i + 1); cell.value = c.header; cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2740' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = box; });
    ws.getRow(rr).height = 32; rr++;
    for (const r of [...x.rows, ...(x.totalsRow ? [{ ...x.totalsRow, _b: true }] : [])]) {
      x.columns.forEach((c, i) => { const cell = ws.getCell(rr, i + 1); const v = r[c.key]; cell.value = v === '' || v === undefined ? null : v; cell.numFmt = FMT[c.fmt] || '@'; cell.border = box; cell.font = { name: FONT, size: 10, bold: !!r._b }; });
      rr++;
    }
    rr++;
  }
  if (d.signers) {
    const last = writeSignBlock(ws, 5 + d.rows.length + (d.totals || d.totalsRow ? 1 : 0) + 1, d.columns.length, d.signers, d.placeDate);
    ws.pageSetup.printArea = `A1:${colName(d.columns.length)}${last}`;
    ws.headerFooter.oddFooter = `&L&8${d.title} · ${d.contractCode || ''}&R&8Trang &P/&N`;
  }
  return ws;
}

const MISA_TEMPLATE = require('node:path').join(__dirname, '../../resources/templates/MISA_HoaDon_GTGT_1ThueSuat.xlsx');
/**
 * Ghi file nhập hóa đơn MISA từ chính file mẫu của MISA (giữ nguyên dòng hướng dẫn 1–7, tiêu đề cột dòng 9, định dạng, kiểm tra dữ liệu).
 * Mỗi hóa đơn: dòng đầu đủ thông tin người mua + thuế suất + tiền thuế; các dòng sau chỉ số thứ tự hóa đơn + hàng hóa.
 * Ghi GIÁ TRỊ (không công thức) để phần mềm hóa đơn đọc đúng.
 */
async function writeMisa(d, file, template = MISA_TEMPLATE) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(template);
  const ws = wb.worksheets[0];
  const heads = ws.getRow(9).values.slice(1).map((v) => String(v || '').trim());
  if (heads[0] !== 'Số thứ tự hóa đơn (*)' || heads[13] !== 'Tên hàng hóa/dịch vụ (*)') throw new Error('File mẫu MISA không đúng cấu trúc (dòng 9)');
  const style = {}; for (let c = 1; c <= 19; c++) { const x = ws.getRow(10).getCell(c); style[c] = { numFmt: x.numFmt, font: x.font, alignment: x.alignment, border: x.border }; }
  for (let r = ws.rowCount; r >= 10; r--) ws.spliceRows(r, 1); // bỏ các dòng ví dụ minh họa
  let r = 10;
  for (const inv of d.invoices) {
    inv.lines.forEach((l, i) => {
      const vals = i === 0
        ? [inv.no, inv.date, inv.buyer.name, inv.buyer.address, inv.buyer.taxCode, '', inv.buyer.email, inv.payment, inv.currency, inv.rate, inv.vatPct, inv.vat, inv.vat * inv.rate, l.description, l.uom, l.qty, l.unitPrice, l.amount, l.amount * inv.rate]
        : [inv.no, '', '', '', '', '', '', '', '', '', '', '', '', l.description, l.uom, l.qty, l.unitPrice, l.amount, l.amount * inv.rate];
      const row = ws.getRow(r++);
      vals.forEach((v, j) => { const c = row.getCell(j + 1); c.value = v === '' ? null : v; const st = style[j + 1];
        c.font = st.font; c.border = st.border; c.alignment = j === 13 ? { ...(st.alignment || {}), wrapText: true, vertical: 'top' } : st.alignment;
        c.numFmt = [0, 1, 4].includes(j) ? '@' : j === 15 ? '#,##0.00' : [11, 12, 16, 17, 18].includes(j) ? '#,##0' : (st.numFmt || 'General'); });
      row.commit();
    });
  }
  await wb.xlsx.writeFile(file);
}

const colName = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };

/** Khối ký như chân sheet BKVC / BKCT của Excel: nơi-ngày bên phải; bên vận chuyển trái, bên thuê phải; mỗi bên Giám đốc + Kế toán. Trả về dòng cuối. */
function writeSignBlock(ws, row, nCols, S, placeDate) {
  const h = Math.floor(nCols / 2);
  const span = (r, c1, c2, v, st = {}) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    const c = ws.getCell(r, c1); c.value = v; c.font = { name: FONT, size: 11, bold: !!st.bold, italic: !!st.italic };
    c.alignment = st.one ? { horizontal: 'center', vertical: 'middle', shrinkToFit: true } : { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  if (placeDate) { span(row, h + 1, nCols, placeDate, { italic: true }); row++; }
  // tên đơn vị: mỗi dòng 1 hàng, không xuống dòng (tự thu nhỏ chữ nếu ô hẹp)
  const a = String(S.carrier.unitName).split('\n'); const b = String(S.customer.unitName).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    span(row, 1, h, a[i] || '', { bold: true, one: true }); span(row, h + 1, nCols, b[i] || '', { bold: true, one: true }); ws.getRow(row).height = 17; row++;
  }
  const side = (c1, c2, x, r) => {
    // chia đôi theo ĐỘ RỘNG cột (không theo số cột) để tên người ký đủ chỗ, không bị thu nhỏ
    let mid = c2;
    if (x.accountant && c2 > c1) {
      const w = (c) => ws.getColumn(c).width || 9; let best = c1; let diff = Infinity;
      for (let m = c1; m < c2; m++) { let a = 0; let b = 0; for (let c = c1; c <= c2; c++) (c <= m ? (a += w(c)) : (b += w(c))); if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); best = m; } }
      mid = best;
    }
    span(r, c1, mid, x.signer.title, { bold: true, one: true }); if (x.accountant) span(r, mid + 1, c2, 'Kế toán', { bold: true, one: true });
    span(r + 5, c1, mid, x.signer.name, { bold: true, one: true }); if (x.accountant) span(r + 5, mid + 1, c2, x.accountant, { bold: true, one: true });
  };
  side(1, h, S.carrier, row); side(h + 1, nCols, S.customer, row);
  return row + 5;
}

// ───────────── mẫu chuyên nghiệp: bảng tính đơn giá · biên bản giao nhận dầu ─────────────
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF3' } };
const SEC_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F8' } };
const FINAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4F5' } };
const parseVn = (t) => { if (t === '' || t === null || t === undefined) return { v: null, d: 0 }; const str = String(t);
  if (!/^[−-]?[\d.]+(,\d+)?$/.test(str)) return { v: str, d: 0 }; const d = (str.split(',')[1] || '').length;
  return { v: Number(str.replace('−', '-').replace(/\./g, '').replace(',', '.')), d }; };
const numFmtD = (d) => (d ? `#,##0.${'0'.repeat(d)}` : '#,##0');

function sheetKit(ws, nCols) {
  const L = colName(nCols);
  const cell = (r, c, v, st = {}) => { const x = ws.getCell(r, c); x.value = v; x.font = { name: FONT, size: st.size || 11, bold: !!st.bold, italic: !!st.italic, underline: st.underline };
    x.alignment = { vertical: 'middle', wrapText: st.wrap !== false, ...(st.wrap === false ? { shrinkToFit: true } : {}), horizontal: st.h || 'left', indent: st.indent || 0 }; if (st.fill) x.fill = st.fill; if (st.border) x.border = box; if (st.fmt) x.numFmt = st.fmt; return x; };
  const span = (r, c1, c2, v, st = {}) => { if (c2 > c1) ws.mergeCells(r, c1, r, c2); const x = cell(r, c1, v, st); if (st.border) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = box; return x; };
  return { L, cell, span };
}
function docHeader(ws, nCols, left, rightNo, { nation = true } = {}) {
  const { cell, span } = sheetKit(ws, nCols); const h = Math.ceil(nCols / 2);
  span(1, 1, h, left.unitName, { bold: true, size: 11, wrap: false }); span(2, 1, h, left.address || '', { size: 10 }); if (left.taxCode) span(3, 1, h, `MST: ${left.taxCode}`, { size: 10 });
  if (nation) { span(1, h + 1, nCols, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, h: 'center', size: 11 }); span(2, h + 1, nCols, 'Độc lập – Tự do – Hạnh phúc', { bold: true, underline: true, h: 'center' }); }
  if (rightNo) span(3, h + 1, nCols, `Số: ${rightNo}`, { h: 'center', size: 10 });
  return { cell, span };
}

async function writePricingSheet(d, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  const ws = wb.addWorksheet('BANG_TINH_DON_GIA', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: d.routes.length > 1 ? 0 : 1,
    margins: { left: 0.6, right: 0.45, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 } } });
  ws.columns = [7, 42, 20, 27, 15, 10].map((w) => ({ width: w }));
  const N = 6; const { cell, span } = docHeader(ws, N, d.carrier, `${d.periodCode}/BTĐG`);
  let r = 5;
  span(r, 1, N, d.title, { bold: true, size: 15, h: 'center' }); ws.getRow(r).height = 24; r++;
  span(r, 1, N, d.periodText, { italic: true, h: 'center' }); r += 2;
  const info = (k, v, bold) => { span(r, 1, 2, k, {}); span(r, 3, N, v, { bold }); r++; };
  info('Căn cứ hợp đồng vận chuyển số:', d.contractNo, true); info('Bên thuê vận chuyển:', d.customer.unitName, true); info('Bên vận chuyển:', d.carrier.unitName, true);
  info('Kỳ tính:', `${d.periodCode} · lần tính ${d.calcVersion}${d.status === 'NHAP' ? ' · BẢN NHÁP' : ''}`);
  for (const rt of d.routes) {
    r++; info('Tuyến vận chuyển:', `${rt.routeCode} — ${rt.routeName}`, true);
    if (rt.fromPlace || rt.toPlace) info('Điểm đi → điểm đến:', `${rt.fromPlace} → ${rt.toPlace}`);
    info('Bảng giá áp dụng:', `${rt.priceId}${rt.priceFrom ? `, hiệu lực từ ${dmy(rt.priceFrom)}` : ''}`);
    info('Phương thức giá:', rt.priceMethod === 'CO_DINH' ? 'Đơn giá cố định (không điều chỉnh theo giá dầu)' : 'Theo giá dầu (đơn giá HĐ + chênh lệch dầu)', rt.priceMethod === 'CO_DINH');
    ['STT', 'Chỉ tiêu', 'Cách tính', 'Diễn giải', 'Giá trị', 'ĐVT'].forEach((t, i) => cell(r, i + 1, t, { bold: true, h: 'center', fill: HEAD_FILL, border: true }));
    ws.getRow(r).height = 22; const headRow = r; r++;
    for (const sec of rt.sections) {
      span(r, 1, N, sec.title, { bold: true, fill: SEC_FILL, border: true }); r++;
      for (const x of sec.rows) {
        const pv = parseVn(x.value); const st = { border: true, bold: !!x.strong, fill: x.final ? FINAL_FILL : undefined, size: x.final ? 12 : 11 };
        cell(r, 1, `(${x.no})`, { ...st, h: 'center' }); cell(r, 2, x.label, st); cell(r, 3, x.how, { ...st, h: 'center' });
        cell(r, 4, x.expr, { ...st, size: 9.5, bold: false }); cell(r, 5, pv.v, { ...st, h: 'right', fmt: numFmtD(pv.d) }); cell(r, 6, x.unit, { ...st, h: 'center' });
        const len = Math.max(x.label.length / 42, x.how.length / 20, x.expr.length / 30); ws.getRow(r).height = len > 1 ? 30 : 17; r++;
      }
    }
    void headRow;
    r++; span(r, 1, 4, `ĐƠN GIÁ VẬN CHUYỂN TUYẾN ${rt.routeCode} (chưa VAT)`, { bold: true, border: true, size: 12 });
    span(r, 5, N, rt.transportPrice, { bold: true, border: true, size: 14, h: 'right', fmt: '#,##0" đ/tấn"' }); ws.getRow(r).height = 26; r++;
    span(r, 1, N, `Bằng chữ: ${rt.words}`, { italic: true, border: true }); r++;
  }
  r++; span(r, 1, N, 'D. GIÁ TRỊ CƯỚC THEO BẢNG XÁC NHẬN KHỐI LƯỢNG', { bold: true }); r++;
  const B = d.bkvc;
  for (const [k, v, fmt, bold] of [['Tổng khối lượng vận chuyển (tấn)', B.ton, '#,##0.00'], ['Thành tiền chưa VAT (đồng)', B.amount, '#,##0'], [`Thuế GTGT ${B.vatPct}% (đồng)`, B.vat, '#,##0'], ['TỔNG GIÁ TRỊ THANH TOÁN (đồng)', B.total, '#,##0', true]]) {
    span(r, 1, 4, k, { border: true, bold, fill: bold ? SEC_FILL : undefined }); span(r, 5, N, v, { border: true, bold, h: 'right', fmt, fill: bold ? SEC_FILL : undefined }); r++;
  }
  span(r, 1, N, `Bằng chữ: ${B.words}`, { italic: true, border: true }); ws.getRow(r).height = 30; r++;
  for (const nt of d.notes) { span(r, 1, N, `• ${nt}`, { size: 10, italic: true }); r++; }
  r++; const last = writeSignBlock(ws, r, N, { carrier: { ...d.signers.carrier, unitName: `BÊN VẬN CHUYỂN\n${d.signers.carrier.unitName}` }, customer: { ...d.signers.customer, unitName: `BÊN THUÊ VẬN CHUYỂN\n${d.signers.customer.unitName}` } }, d.placeDate);
  ws.pageSetup.printArea = `A1:F${last}`; ws.headerFooter.oddFooter = `&L&8${d.periodCode} · Bảng tính đơn giá&R&8Trang &P/&N`;
  await wb.xlsx.writeFile(file);
}

async function writeFuelHandover(d, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  d.docs.forEach((doc, di) => {
    const ws = wb.addWorksheet(d.docs.length > 1 ? `BBGN_DAU_${di + 1}` : 'BBGN_DAU', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.6, right: 0.45, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 } } });
    ws.columns = [6, 12, 13, 10, 7, 12, 14, 16, 13].map((w) => ({ width: w }));
    const N = 9; const { cell, span } = docHeader(ws, N, { unitName: doc.receiver.unitName }, doc.no);
    let r = 5; const T = doc.totals; const q = (x) => (Number.isInteger(x) ? '#,##0' : '#,##0.00');
    span(r, 1, N, d.title, { bold: true, size: 15, h: 'center' }); ws.getRow(r).height = 24; r++;
    span(r, 1, N, `(Dầu cấp cho xe vận chuyển dăm gỗ — kỳ vận chuyển từ ngày ${dmy(d.dateFrom)} đến ngày ${dmy(d.dateTo)})`, { italic: true, h: 'center' }); r += 2;
    const para = (t, st = {}) => { span(r, 1, N, t, st); ws.getRow(r).height = Math.max(16, Math.ceil(t.length / 105) * 15); r++; };
    para(`– Căn cứ Hợp đồng vận chuyển số ${d.contractNo}${d.contractFrom ? ` ngày ${dmy(d.contractFrom)}` : ''} giữa ${d.customer.unitName} và ${d.carrier.unitName};`);
    para(`– Căn cứ số lượng dầu diesel thực tế đã cấp cho các xe vận chuyển từ ngày ${dmy(doc.from)} đến ngày ${dmy(doc.to)}.`);
    para(`Hôm nay, ${d.dateText}, tại ${d.signPlace || '……………'}, chúng tôi gồm:`);
    for (const [lb, x] of [['BÊN GIAO (Bên A)', doc.giver], ['BÊN NHẬN (Bên B)', doc.receiver]]) {
      para(`${lb}: ${x.unitName}`, { bold: true });
      span(r, 1, 2, '   Địa chỉ:', {}); span(r, 3, N, x.address || '', {}); r++;
      if (x.taxCode) { span(r, 1, 2, '   Mã số thuế:', {}); span(r, 3, N, x.taxCode, {}); r++; }
      span(r, 1, 2, '   Đại diện:', {}); span(r, 3, N, `${x.signer.name} — Chức vụ: ${x.signer.title}`, { bold: true }); r++;
    }
    para('Hai bên cùng xác nhận số lượng dầu diesel Bên A đã giao cho các xe vận chuyển của Bên B như sau:');
    r++; span(r, 1, N, 'I. CHI TIẾT CÁC LẦN GIAO NHẬN', { bold: true }); r++;
    ['STT', 'Ngày nhận', 'Biển số xe', 'Tuyến', 'ĐVT', 'Số lượng', 'Đơn giá chưa VAT (đ/lít)', 'Thành tiền chưa VAT (đ)', 'Ghi chú'].forEach((t, i) => cell(r, i + 1, t, { bold: true, h: 'center', fill: HEAD_FILL, border: true, size: 10 }));
    ws.getRow(r).height = 30; r++;
    for (const x of doc.rows) {
      [x.seq, dmy(x.date), x.plateNo, x.routeCode, x.uom, x.qty, x.price, x.amount, x.note].forEach((v, i) =>
        cell(r, i + 1, v, { border: true, size: 10.5, h: [5, 6, 7].includes(i) ? 'right' : 'center', fmt: i === 5 ? q(x.qty) : [6, 7].includes(i) ? '#,##0' : undefined }));
      r++;
    }
    span(r, 1, 5, `TỔNG CỘNG (${T.times} lần nhận)`, { bold: true, h: 'center', border: true, fill: SEC_FILL });
    cell(r, 6, T.qty, { bold: true, border: true, h: 'right', fmt: q(T.qty), fill: SEC_FILL }); cell(r, 7, null, { border: true, fill: SEC_FILL });
    cell(r, 8, T.amount, { bold: true, border: true, h: 'right', fmt: '#,##0', fill: SEC_FILL }); cell(r, 9, null, { border: true, fill: SEC_FILL }); r += 2;
    span(r, 1, N, 'II. TỔNG HỢP THEO XE', { bold: true }); r++;
    const cols = [[1, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
    ['STT', 'Biển số xe', 'Số lần nhận', 'Số lượng (lít)', 'Thành tiền chưa VAT (đ)'].forEach((t, i) => span(r, cols[i][0], cols[i][1], t, { bold: true, h: 'center', fill: HEAD_FILL, border: true, size: 10 })); r++;
    for (const o of doc.byPlate) {
      [o.seq, o.plateNo, o.times, o.qty, o.amount].forEach((v, i) => span(r, cols[i][0], cols[i][1], v, { border: true, h: i >= 3 ? 'right' : 'center', fmt: i === 3 ? q(o.qty) : i === 4 ? '#,##0' : undefined })); r++;
    }
    [[`TỔNG CỘNG (${T.vehicles} xe)`, 0, 1], [T.times, 2, 2], [T.qty, 3, 3], [T.amount, 4, 4]].forEach(([v, a, b]) =>
      span(r, cols[a][0], cols[b][1], v, { bold: true, border: true, fill: SEC_FILL, h: a >= 3 ? 'right' : 'center', fmt: a === 3 ? q(T.qty) : a === 4 ? '#,##0' : undefined })); r += 2;
    span(r, 1, N, 'III. KẾT LUẬN', { bold: true }); r++;
    para(`1. Tổng số lượng dầu diesel Bên A đã giao, Bên B đã nhận đủ: ${fmtNum(T.qty)} lít (bằng chữ: ${doc.qtyWords}).`);
    para(`2. Đơn giá dầu bình quân (chưa VAT, ${d.fuelPriceMethod === 'WEIGHTED' ? 'bình quân gia quyền theo lít' : 'trung bình cộng các lần nhận'}): ${fmtNum(T.avgPrice, 2)} đ/lít.`);
    para(`3. Số liệu trên là căn cứ tính chênh lệch nhiên liệu trong Bảng tính đơn giá vận chuyển kỳ ${d.periodCode}. Biên bản được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.`);
    r++; const last = writeSignBlock(ws, r, N, { carrier: { ...doc.giver, unitName: `ĐẠI DIỆN BÊN GIAO\n${doc.giver.unitName}` }, customer: { ...doc.receiver, unitName: `ĐẠI DIỆN BÊN NHẬN\n${doc.receiver.unitName}` } }, '');
    ws.pageSetup.printArea = `A1:I${last}`; ws.headerFooter.oddFooter = `&L&8${doc.no}&R&8Trang &P/&N`;
  });
  await wb.xlsx.writeFile(file);
}
const fmtNum = (x, d) => { const dd = d === undefined ? (Number.isInteger(x) ? 0 : 2) : d; const [i, f] = Math.abs(x).toFixed(dd).split('.'); return (x < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? `,${f}` : ''); };

/**
 * Căn cứ giá hợp đồng (Excel): cột nhập (xanh) + cột tính bằng CÔNG THỨC EXCEL → sửa đơn giá cước / KL / định mức / giá dầu
 * ngay trong file để thử phương án ký hợp đồng.
 */
async function writeContractBasis(d, file) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'DGVC';
  const ws = wb.addWorksheet('CAN_CU_GIA_HD', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  const N = 16; ws.columns = [5, 9, 30, 9, 6, 12, 9, 13, 9, 10, 11, 12, 9, 14, 14, 16].map((w) => ({ width: w }));
  const { cell, span } = docHeader(ws, N, d.carrier, '');
  let r = 5;
  span(r, 1, N, d.title, { bold: true, size: 15, h: 'center' }); ws.getRow(r).height = 24; r++;
  span(r, 1, N, `(Áp dụng từ ngày ${dmy(d.asOf)}${d.contract ? ` — kèm theo Hợp đồng vận chuyển số ${d.contract.no}` : ' — bảng giá chung'})`, { italic: true, h: 'center' }); r += 2;
  const heads = ['STT', 'Mã tuyến', 'Tuyến vận chuyển', 'Cự ly chuyến (km)', 'ĐVT', 'Đơn giá cước (đ)\n(1)', 'KL TB / chuyến\n(2)', 'ĐG 1 chuyến (đ)\n(3)=(1)×(2)', 'Định mức (lít/km)\n(4)',
    'Dầu / chuyến (lít)\n(5)=CL×(4)', 'ĐG dầu chưa VAT\n(6)', 'Tiền dầu / chuyến\n(7)=(5)×(6)', 'Tỷ lệ dầu\n(8)=(7)/(3)', 'ĐGVC chưa dầu\n(9)=[(3)−(7)]/KL_TB', 'ĐƠN GIÁ HĐ\n(10)=ROUND((9);-3)', 'Bảng giá'];
  heads.forEach((t, i) => cell(r, i + 1, t, { bold: true, h: 'center', fill: HEAD_FILL, border: true, size: 9.5 })); ws.getRow(r).height = 44; const h0 = r; r++;
  const IN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF8F9' } };
  const r0 = r; const dig = d.rounding.contractDigits;
  for (const x of d.rows) {
    if (x.fixed) {
      // đơn giá cố định: không có phần dầu → ghi thẳng đơn giá vào cột (10)
      [x.stt, x.routeCode, x.routeName, x.tripDistanceKm, x.uom].forEach((val, i) => cell(r, i + 1, val, { border: true, size: 10, h: i === 2 ? 'left' : [0, 1, 4].includes(i) ? 'center' : 'right', wrap: i === 2 }));
      span(r, 6, 14, 'Đơn giá cố định — không tính theo giá dầu', { border: true, size: 10, h: 'center', italic: true });
      cell(r, 15, x.contractPrice, { border: true, size: 11, bold: true, h: 'right', fill: FINAL_FILL }); ws.getCell(r, 15).numFmt = '#,##0';
      cell(r, 16, `${x.priceId} · ${dmy(x.effectiveFrom)} · giá cố định${x.source === 'Giá riêng hợp đồng' ? ' · giá riêng HĐ' : ''}`, { border: true, size: 10, wrap: true });
      ws.getCell(r, 4).numFmt = '#,##0'; r++; continue;
    }
    const load = x.uom === 'M3' ? x.avgVolumeM3 : x.avgLoadTon;
    const v = [x.stt, x.routeCode, x.routeName, x.tripDistanceKm, x.uom, x.newPrice, load, null, x.fuelNormLPerKm, null, x.fuelPriceCatalog, null, null, null, null, `${x.priceId} · ${dmy(x.effectiveFrom)}${x.source === 'Giá riêng hợp đồng' ? ' · giá riêng HĐ' : ''}`];
    v.forEach((val, i) => cell(r, i + 1, val, { border: true, size: 10, h: i === 2 || i === 15 ? 'left' : [0, 1, 4].includes(i) ? 'center' : 'right', fill: [5, 6, 8, 10].includes(i) ? IN : undefined, wrap: i === 2 || i === 15 }));
    const kl = x.avgLoadTon; // chia cho KL_TB kể cả tuyến m³ (như file Excel cũ)
    const f = (col, formula, result, fmt, st = {}) => { const c = ws.getCell(r, col); c.value = { formula, result }; c.numFmt = fmt; c.border = box; c.font = { name: FONT, size: st.size || 10, bold: !!st.bold }; c.alignment = { horizontal: 'right', vertical: 'middle' }; if (st.fill) c.fill = st.fill; };
    f(8, `F${r}*G${r}`, x.tripPrice, '#,##0');
    f(10, `D${r}*I${r}`, x.fuelPerTrip, '#,##0.0');
    f(12, `K${r}*J${r}`, x.fuelCostPerTrip, '#,##0');
    f(13, `IF(H${r}=0,0,L${r}/H${r})`, x.fuelCostRatio, '0.00%');
    f(14, x.uom === 'M3' ? `(H${r}-L${r})/${kl}` : `(H${r}-L${r})/G${r}`, x.priceNoDiesel, '#,##0.00');
    f(15, `ROUND(N${r},${dig})`, x.contractPrice, '#,##0', { bold: true, size: 11, fill: FINAL_FILL });
    ws.getCell(r, 6).numFmt = '#,##0'; ws.getCell(r, 7).numFmt = x.uom === 'M3' ? '#,##0.00' : '#,##0'; ws.getCell(r, 9).numFmt = '0.0'; ws.getCell(r, 11).numFmt = '#,##0'; ws.getCell(r, 4).numFmt = '#,##0';
    r++;
  }
  ws.views = [{ state: 'frozen', ySplit: h0, xSplit: 3 }];
  r++;
  const notes = ['Ô nền xanh nhạt là số nhập (sửa được để thử phương án); các cột (3), (5), (7), (8), (9), (10) là công thức, tự tính lại.',
    'Đơn giá cước (1) đã gồm tiền dầu theo định mức, chưa VAT. Đơn giá hợp đồng (10) là phần CHƯA GỒM NHIÊN LIỆU.',
    'Hằng kỳ: Đơn giá vận chuyển = (10) + (Dầu định mức − Dầu thực nhận) × Đơn giá dầu thực tế / Tổng khối lượng, làm tròn đến hàng trăm.',
    'Hàm ROUND của Excel làm tròn …500 lên; phần mềm làm tròn kiểu ngân hàng (…500 về số chẵn) — chỉ khác khi (9) có đúng …500.',
    'Tuyến tính theo m³: (9) chia cho KL_TB (tấn), không chia Thể tích TB.',
    ...(d.rows.some((x) => x.fixed) ? ['Tuyến ghi "Đơn giá cố định": (10) là đơn giá vận chuyển cố định đ/tấn — hằng kỳ dùng nguyên đơn giá này, không nhận dầu, không tính chênh lệch dầu.'] : [])];
  span(r, 1, N, 'Ghi chú:', { bold: true }); r++;
  for (const t of notes) { span(r, 1, N, `• ${t}`, { size: 10 }); r++; }
  if (d.signers) { r++; r = writeSignBlock(ws, r, N, { carrier: { ...d.signers.carrier, unitName: `BÊN VẬN CHUYỂN\n${d.signers.carrier.unitName}` }, customer: { ...d.signers.customer, unitName: `BÊN THUÊ VẬN CHUYỂN\n${d.signers.customer.unitName}` } }, d.placeDate); }
  ws.pageSetup.printArea = `A1:P${r}`; ws.headerFooter.oddFooter = '&L&8Căn cứ tính đơn giá ký hợp đồng&R&8Trang &P/&N';
  void r0;
  await wb.xlsx.writeFile(file);
}

module.exports = { writeBkvc, writeTable, writeSheets, writeSignBlock, writeMisa, writePricingSheet, writeFuelHandover, writeContractBasis, MISA_TEMPLATE };
