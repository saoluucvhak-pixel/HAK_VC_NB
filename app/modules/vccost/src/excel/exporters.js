'use strict';
/**
 * Xuất Excel chuyên nghiệp (ExcelJS): tiêu đề, tiêu chí lọc, header đóng băng + autofilter,
 * định dạng ngày/tiền/kg/tấn, dòng tổng (SUBTOTAL), số phiếu & biển số kiểu TEXT, font Arial.
 */
const ExcelJS = require('exceljs');

const FONT = { name: 'Times New Roman', size: 11 };
const FMT = { money: '#,##0;[Red]-#,##0;-', money2: '#,##0.00;[Red]-#,##0.00;-', kg: '#,##0', tan: '#,##0.000', date: 'dd/mm/yyyy hh:mm', day: 'dd/mm/yyyy', int: '#,##0', pct: '0.##' };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141F19' } };

/** Thiết lập in A4: vừa khít chiều ngang, lặp dòng tiêu đề, chân trang có số trang. */
function printSetup(ws, { landscape = false, titleRow = null, footer = '' } = {}) {
  ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } };
  if (titleRow) ws.pageSetup.printTitlesRow = `${titleRow}:${titleRow}`;
  ws.headerFooter.oddFooter = `&L&8${String(footer).replace(/&/g, '&&')}&C&8Trang &P / &N&R&8In ngày &D`;
}
const THIN = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const PRINT_HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
const dmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '');

const toDate = (iso) => (iso ? new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso + 'Z') : null);
const filterText = (f = {}) => Object.entries(f).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join('; ') || 'Tất cả';

/**
 * Tạo 1 sheet bảng: cols = [{header, key, width, fmt, text, sum}]
 */
function addTable(ws, { title, subtitle, cols, rows, startRow = 1, totalLabel = 'Tổng cộng' }) {
  let r = startRow;
  ws.getCell(r, 1).value = title;
  ws.getCell(r, 1).font = { ...FONT, size: 14, bold: true };
  ws.mergeCells(r, 1, r, cols.length);
  r++;
  if (subtitle) { ws.getCell(r, 1).value = subtitle; ws.getCell(r, 1).font = { ...FONT, italic: true, color: { argb: 'FF77756A' } }; ws.mergeCells(r, 1, r, cols.length); r++; }
  r++;
  const headRow = r;
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.header; cell.fill = HEAD_FILL;
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getColumn(i + 1).width = c.width || 14;
  });
  ws.getRow(r).height = 30;
  for (const row of rows) {
    r++;
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      let v = typeof c.value === 'function' ? c.value(row) : row[c.key];
      if (c.text && v !== null && v !== undefined) v = String(v);
      if ((c.fmt === 'date' || c.fmt === 'day') && typeof v === 'string') v = toDate(v);
      cell.value = v === undefined ? null : v;
      cell.font = FONT;
      if (c.fmt) cell.numFmt = FMT[c.fmt];
      if (c.text) cell.numFmt = '@';
    });
  }
  const last = r;
  r++;
  ws.getCell(r, 1).value = totalLabel;
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    if (c.sum && last > headRow) {
      const col = ws.getColumn(i + 1).letter;
      cell.value = { formula: `SUBTOTAL(9,${col}${headRow + 1}:${col}${last})` };
      cell.numFmt = FMT[c.fmt] || FMT.int;
    }
    if (c.count && last > headRow) {
      const col = ws.getColumn(i + 1).letter;
      cell.value = { formula: `SUBTOTAL(3,${col}${headRow + 1}:${col}${last})` };
    }
    cell.font = { ...FONT, bold: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  });
  printSetup(ws, { landscape: true, titleRow: headRow, footer: title });
  ws.views = [{ state: 'frozen', ySplit: headRow, xSplit: 0 }];
  ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: Math.max(last, headRow), column: cols.length } };
  return { headRow, last, totalRow: r };
}

async function done(wb) { return Buffer.from(await wb.xlsx.writeBuffer()); }
const newWb = () => { const wb = new ExcelJS.Workbook(); wb.creator = 'VC Cost'; wb.created = new Date(); return wb; };

async function ticketsWorkbook(data, filter) {
  const wb = newWb();
  const ws = wb.addWorksheet('Chi tiết vận chuyển');
  addTable(ws, {
    title: 'CHI TIẾT VẬN CHUYỂN', subtitle: `Lọc: ${filterText(filter)} — ${data.total} phiếu. Tiền từng phiếu chưa làm tròn (số thanh toán theo bảng kê).`,
    cols: [
      { header: 'STT', value: (r) => data.rows.indexOf(r) + 1, width: 6 },
      { header: 'Số phiếu', key: 'so_phieu', text: true, width: 10, count: true },
      { header: 'Ngày giờ cân 1', key: 'ngay_gio_can_1', fmt: 'date', width: 17 },
      { header: 'Ngày giờ cân 2', key: 'ngay_gio_can_2', fmt: 'date', width: 17 },
      { header: 'Biển số', key: 'bien_so', text: true, width: 12 },
      { header: 'Đơn vị VC', key: 'don_vi', width: 10 },
      { header: 'Nơi xuất', value: (r) => r.noi_xuat || r.noi_xuat_goc, width: 14 },
      { header: 'Nơi đến', key: 'noi_den', width: 14 },
      { header: 'Tuyến', key: 'tuyen', width: 12 },
      { header: 'Cân lần 1', key: 'can_lan_1', fmt: 'kg' },
      { header: 'Cân lần 2', key: 'can_lan_2', fmt: 'kg' },
      { header: 'KL hàng (KG)', key: 'kl_hang_kg', fmt: 'kg', sum: true },
      { header: 'KL (tấn)', key: 'kl_hang_tan', fmt: 'tan', sum: true },
      { header: 'Đơn giá', key: 'don_gia', fmt: 'money' },
      { header: 'Thành tiền', key: 'tien_truoc_vat', fmt: 'money2', sum: true, width: 16 },
      { header: 'VAT', key: 'tien_vat', fmt: 'money2', sum: true, width: 14 },
      { header: 'Tổng tiền', key: 'tong_tien', fmt: 'money2', sum: true, width: 16 },
      { header: 'Đợt/Tàu', key: 'dot', width: 12 },
      { header: 'Trạng thái giá', key: 'trang_thai_tinh_gia', width: 14 },
      { header: 'Đối chiếu', key: 'trang_thai_doi_chieu', width: 14 },
      { header: 'Ghi chú', key: 'ghi_chu', width: 20 },
    ],
    rows: data.rows,
  });
  return done(wb);
}

async function timelineWorkbook(bienSo, rows, f) {
  const wb = newWb();
  const ws = wb.addWorksheet('Chi tiết xe');
  addTable(ws, {
    title: `CHI TIẾT CHUYẾN XE ${bienSo}`, subtitle: `Từ ${f.tu_ngay || '…'} đến ${f.den_ngay || '…'} — cờ chỉ là cảnh báo dữ liệu bất thường, không phải kết luận`,
    cols: [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Ngày', key: 'ngay_can', fmt: 'day', width: 11 },
      { header: 'Giờ cân 1', key: 'ngay_gio_can_1', fmt: 'date', width: 17 },
      { header: 'Giờ cân 2', key: 'ngay_gio_can_2', fmt: 'date', width: 17 },
      { header: 'Số phiếu', key: 'so_phieu', text: true, count: true },
      { header: 'Nơi xuất', value: (x) => x.noi_xuat || x.noi_xuat_goc },
      { header: 'Nơi đến', key: 'noi_den' },
      { header: 'KL (KG)', key: 'kl_hang_kg', fmt: 'kg', sum: true },
      { header: 'KL (tấn)', key: 'kl_hang_tan', fmt: 'tan', sum: true },
      { header: 'Đơn giá', key: 'don_gia', fmt: 'money' },
      { header: 'Thành tiền', key: 'tien_truoc_vat', fmt: 'money2', sum: true, width: 16 },
      { header: 'VAT', key: 'tien_vat', fmt: 'money2', sum: true },
      { header: 'Tổng tiền', key: 'tong_tien', fmt: 'money2', sum: true, width: 16 },
      { header: 'Thời gian cân (phút)', value: (x) => (x.thoi_gian_can_phut === null ? null : Math.round(x.thoi_gian_can_phut)), fmt: 'int' },
      { header: 'Cách chuyến trước (phút)', value: (x) => (x.khoang_cach_chuyen_phut === null ? null : Math.round(x.khoang_cach_chuyen_phut)), fmt: 'int' },
      { header: 'Cảnh báo', value: (x) => x.flags.join(', '), width: 28 },
    ],
    rows,
  });
  return done(wb);
}

const KQ = { KHOP: 'Khớp', THIEU_BEN_A: 'Thiếu bên hệ thống', THIEU_BEN_B: 'Thiếu bên đối tác', LECH_KHOI_LUONG: 'Lệch khối lượng', LECH_DON_GIA: 'Lệch đơn giá', LECH_TIEN: 'Lệch thành tiền', LECH_VAT: 'Lệch VAT', TRUNG_DU_LIEU: 'Trùng dữ liệu', CAN_KIEM_TRA: 'Cần kiểm tra' };
const XL = { CHUA_XU_LY: 'Chưa xử lý', CHAP_NHAN_A: 'Chấp nhận hệ thống', CHAP_NHAN_B: 'Chấp nhận đối tác', DIEU_CHINH: 'Điều chỉnh', BO_QUA: 'Bỏ qua' };
async function reconWorkbook(batch, rows) {
  const wb = newWb();
  const diff = (x, col) => { const d = x.diffs.find((y) => y.cot === col); return d ? d.chenh : null; };
  const cols = [
    { header: 'Kết quả', value: (x) => KQ[x.ket_qua] || x.ket_qua, width: 20 },
    { header: 'Khóa khớp', key: 'khoa_khop', width: 16 },
    { header: 'Số phiếu HT', key: 'a_so_phieu', text: true }, { header: 'Số phiếu ĐT', key: 'b_so_phieu', text: true },
    { header: 'Biển số HT', key: 'a_bien_so' }, { header: 'Biển số ĐT', key: 'b_bien_so' },
    { header: 'KL HT (kg)', key: 'a_kl', fmt: 'kg' }, { header: 'KL ĐT (kg)', key: 'b_kl', fmt: 'kg' }, { header: 'Chênh KL', value: (x) => diff(x, 'kl_hang_kg'), fmt: 'kg' },
    { header: 'Đơn giá HT', key: 'a_don_gia', fmt: 'money' }, { header: 'Đơn giá ĐT', key: 'b_don_gia', fmt: 'money' }, { header: 'Chênh giá', value: (x) => diff(x, 'don_gia'), fmt: 'money' },
    { header: 'Tiền HT', key: 'a_tien', fmt: 'money2', width: 16 }, { header: 'Tiền ĐT', key: 'b_tien', fmt: 'money2', width: 16 }, { header: 'Chênh tiền', value: (x) => diff(x, 'tien_truoc_vat'), fmt: 'money2', width: 16 },
    { header: 'Xử lý', value: (x) => XL[x.xu_ly] || x.xu_ly }, { header: 'Ghi chú', key: 'ghi_chu', width: 28 },
  ];
  const sub = `Lô: ${batch.ten} · tổng ${rows.length} dòng`;
  addTable(wb.addWorksheet('Bảng đối chiếu'), { title: 'BẢNG ĐỐI CHIẾU HỆ THỐNG – ĐỐI TÁC', subtitle: sub, cols, rows });
  addTable(wb.addWorksheet('Sai lệch'), { title: 'CÁC DÒNG SAI LỆCH', subtitle: sub, cols, rows: rows.filter((x) => x.ket_qua !== 'KHOP') });
  return done(wb);
}

/** Bảng tính đơn giá: có CÔNG THỨC Excel sống (đổi giá dầu ở ô trên cùng → đơn giá tự tính lại). */
const dmyS = (d) => (d ? String(d).split('-').reverse().join('/') : '');
async function priceSheetWorkbook(sh, parties = null) {
  const wb = newWb();
  const ws = wb.addWorksheet('Bảng tính đơn giá');
  const mc = (row, text, opts, h) => { ws.mergeCells(row, 1, row, 18); const c = ws.getCell(row, 1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: 'center', vertical: 'middle' }; if (h) ws.getRow(row).height = h; };
  mc(1, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true }); mc(2, 'Độc lập – Tự do – Hạnh phúc', { bold: true });
  mc(4, 'BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN (điều chỉnh theo giá dầu)', { size: 14, bold: true }, 24);
  mc(5, `Ngày hiệu lực: ${dmyS(sh.ngay)}`, { italic: true });
  mc(6, 'Số: ………… / BTĐG', { italic: true });
  const FR = 8;
  ws.getCell(FR, 1).value = 'Giá dầu áp dụng (đ/lít) — sửa ô này, đơn giá tự tính lại:'; ws.getCell(FR, 1).font = { ...FONT, bold: true };
  const fuelCell = ws.getCell(FR, 6); fuelCell.value = sh.gia_dau_ap_dung ?? null; fuelCell.numFmt = FMT.money2; fuelCell.font = { ...FONT, bold: true, color: { argb: 'FF0000FF' } };
  const head = ['Tuyến', 'Nơi xuất', 'Nơi đến', 'Phương thức', 'Giá cước cơ sở (đ/tấn)', 'Giá dầu cơ sở', 'Giá dầu áp dụng', 'Km (khứ hồi)', 'Định mức (L/100km)', 'Tấn BQ/chuyến',
    'Lít dầu/chuyến', 'Chênh giá dầu', 'CP chênh lệch/chuyến', 'Điều chỉnh/tấn', 'Làm tròn (−2)', 'Đơn giá áp dụng', 'Giá hiện hành', 'Chênh so hiện hành'];
  const R0 = 10; head.forEach((t, i) => { const c = ws.getCell(R0, i + 1); c.value = t; c.fill = HEAD_FILL; c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }; ws.getColumn(i + 1).width = i < 3 ? 22 : 15; });
  ws.getRow(R0).height = 34; ws.views = [{ state: 'frozen', ySplit: R0, xSplit: 1 }];
  let r = R0;
  for (const x of sh.rows) {
    r++;
    const put = (col, v, fmt) => { const c = ws.getCell(r, col); c.value = v; c.font = FONT; if (fmt) c.numFmt = fmt; return c; };
    put(1, x.ma_tuyen); put(2, x.noi_xuat); put(3, x.noi_den);
    if (x.thieu) { put(4, x.thieu); continue; }
    put(4, x.phuong_thuc === 'DIEU_CHINH_DAU' ? 'Điều chỉnh theo dầu' : 'Giá cố định');
    put(5, x.don_gia_goc, FMT.money);
    if (x.phuong_thuc === 'DIEU_CHINH_DAU') {
      put(6, x.gia_dau_co_so, FMT.money2);
      put(7, { formula: `IF($F$${FR}="",${x.gia_dau_ap_dung},$F$${FR})`, result: x.gia_dau_ap_dung }, FMT.money2);
      put(8, x.km, '#,##0.##'); put(9, x.dinh_muc, '#,##0.##'); put(10, x.tan_bq, '#,##0.##');
      put(11, { formula: `H${r}*I${r}/100`, result: x.lit_chuyen }, '#,##0.00');
      put(12, { formula: `G${r}-F${r}`, result: x.chenh_dau }, FMT.money2);
      put(13, { formula: `K${r}*L${r}`, result: x.cp_chenh_chuyen }, FMT.money2);
      put(14, { formula: `ROUND(M${r}/J${r},0)`, result: x.dc_tan }, FMT.money);
      put(15, { formula: `ROUND(N${r},-2)`, result: x.dieu_chinh }, FMT.money);
      put(16, { formula: `E${r}+O${r}`, result: x.gia_moi }, FMT.money).font = { ...FONT, bold: true };
    } else put(16, { formula: `E${r}`, result: x.gia_moi }, FMT.money).font = { ...FONT, bold: true };
    put(17, x.gia_hien_hanh, FMT.money); put(18, { formula: `P${r}-Q${r}`, result: x.gia_moi - x.gia_hien_hanh }, FMT.money);
  }
  for (let rr = R0 + 1; rr <= r; rr++) for (let c = 1; c <= 18; c++) { const cell = ws.getCell(rr, c); cell.border = BOX; if (c >= 5) cell.alignment = { horizontal: 'right' }; }
  r += 2;
  ws.mergeCells(r, 10, r, 18); const dl = ws.getCell(r, 10); dl.value = `${(parties && parties.benB && parties.benB.noi_ky) || '……………'}, ngày ……… tháng ……… năm ………`; dl.font = { ...FONT, italic: true }; dl.alignment = { horizontal: 'center' }; r++;
  const emptyB = { ten: '', chuc_vu: 'Giám đốc', dai_dien: '', ke_toan: '' };
  signParties(ws, r, (parties && parties.benA) || emptyB, (parties && parties.benB) || emptyB, [[1, 8], [10, 18]]);
  printSetup(ws, { landscape: true, titleRow: R0, footer: `Bảng tính đơn giá vận chuyển — ${sh.ngay}` }); ws.pageSetup.fitToHeight = 1;
  return done(wb);
}

/** Bảng tiêu đề + dữ liệu kiểu in (viền kẻ, đầu bảng xám nhạt, chữ đen). cols: [{header,w,fmt,align,get(row,i)}] */
function printTable(ws, r0, cols, rows, { totals = null } = {}) {
  cols.forEach((c, i) => { const cell = ws.getCell(r0, i + 1); cell.value = c.header; cell.fill = PRINT_HEAD; cell.border = BOX; cell.font = { ...FONT, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; if (c.w) ws.getColumn(i + 1).width = c.w; });
  ws.getRow(r0).height = 32;
  let r = r0;
  rows.forEach((row, idx) => {
    r++;
    cols.forEach((c, i) => { const cell = ws.getCell(r, i + 1); const v = c.get(row, idx); cell.value = v === undefined ? null : v; cell.border = BOX; cell.font = FONT;
      cell.alignment = { vertical: 'middle', wrapText: !!c.wrap, horizontal: c.align || (c.fmt ? 'right' : 'left') }; if (c.fmt) cell.numFmt = FMT[c.fmt]; if (c.text) cell.numFmt = '@'; });
  });
  if (totals) {
    r++;
    cols.forEach((c, i) => { const cell = ws.getCell(r, i + 1); cell.border = BOX; cell.font = { ...FONT, bold: true }; cell.fill = PRINT_HEAD;
      const t = totals[i]; if (t !== undefined && t !== null) { cell.value = t; if (c.fmt) cell.numFmt = FMT[c.fmt]; cell.alignment = { horizontal: c.fmt ? 'right' : 'left' }; } });
  }
  return r;
}

/** Khối chữ ký: nhãn trái/phải, chừa chỗ ký + đóng dấu, dòng họ tên. */
function signatureBlock(ws, r, left, right, { span = [[1, 3], [5, 7]] } = {}) {
  const put = (blk, text, opts) => { const [c1, c2] = blk; ws.mergeCells(r, c1, r, c2); const cell = ws.getCell(r, c1); cell.value = text; cell.font = { ...FONT, ...opts }; cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }; };
  put(span[0], left.title, { bold: true }); put(span[1], right.title, { bold: true }); r++;
  put(span[0], '(Ký, ghi rõ họ tên, đóng dấu)', { italic: true, size: 9 }); put(span[1], '(Ký, ghi rõ họ tên, đóng dấu)', { italic: true, size: 9 }); r++;
  ws.getRow(r).height = 62; r++;
  put(span[0], left.name || '', { bold: true }); put(span[1], right.name || '', { bold: true });
  return r;
}

/** Chữ ký 2 bên: mỗi bên có ô KẾ TOÁN và ô GIÁM ĐỐC/đại diện. */
function signParties(ws, r, A, B, span = [[1, 3], [5, 8]]) {
  const half = ([c1, c2]) => { const m = c1 + Math.ceil((c2 - c1 + 1) / 2) - 1; return [[c1, m], [Math.min(m + 1, c2), c2]]; };
  const put = (blk, text, opts) => { const [c1, c2] = blk; if (c2 > c1) ws.mergeCells(r, c1, r, c2); const cell = ws.getCell(r, c1); cell.value = text; cell.font = { ...FONT, ...opts }; cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }; };
  const [a1, a2] = half(span[0]), [b1, b2] = half(span[1]);
  put(span[0], `BÊN A – ${(A.ten || '').toUpperCase()}`, { bold: true, size: 10 }); put(span[1], `BÊN B – ${(B.ten || '').toUpperCase()}`, { bold: true, size: 10 }); ws.getRow(r).height = 30; r++;
  const four = (fa, fb, opts, h) => { put(a1, fa(A, 0), opts); put(a2, fa(A, 1), opts); put(b1, fb(B, 0), opts); put(b2, fb(B, 1), opts); if (h) ws.getRow(r).height = h; r++; };
  const f = (kt, gd) => (p, i) => (i === 0 ? kt(p) : gd(p));
  four(f(() => 'KẾ TOÁN', (p) => (p.chuc_vu || 'Giám đốc').toUpperCase()), f(() => 'KẾ TOÁN', (p) => (p.chuc_vu || 'Giám đốc').toUpperCase()), { bold: true });
  const sg = f(() => '(Ký, ghi rõ họ tên)', () => '(Ký, ghi rõ họ tên, đóng dấu)');
  four(sg, sg, { italic: true, size: 9 });
  ws.getRow(r).height = 62; r++;
  const nm = f((p) => p.ke_toan || p.nguoi_lap || '', (p) => p.dai_dien || '');
  four(nm, nm, { bold: true });
  return r;
}
const partyLines = (tag, p) => [
  [`${tag}: ${(p.ten || '').toUpperCase() || '…………………………………………………'}`, { bold: true }],
  [`Địa chỉ: ${p.dia_chi || '…………………………………………………'}`, {}],
  [`Mã số thuế: ${p.ma_so_thue || '……………………'}${p.dien_thoai ? `   ·   Điện thoại: ${p.dien_thoai}` : ''}${p.email ? `   ·   Email: ${p.email}` : ''}`, {}],
  [`Đại diện: ${[p.xung_ho, p.dai_dien].filter(Boolean).join(' ') || '……………………'}   ·   Chức vụ: ${p.chuc_vu || 'Giám đốc'}${p.so_tai_khoan ? `   ·   TK: ${p.so_tai_khoan}${p.ngan_hang ? ` – ${p.ngan_hang}` : ''}` : ''}`, {}],
];

/** BẢNG KÊ để in/ký giữa 2 công ty (kiểu DGVC). Sheet: Bảng kê · Chi tiết theo xe · [Đối chiếu khối lượng] · Phụ lục phiếu cân. */
async function statementWorkbook(doc) {
  const { st, benA, benB } = doc;
  const wb = newWb();
  const ws = wb.addWorksheet('Bảng kê');
  const NC = 8; let r = 1;
  const merged = (text, opts = {}, align = 'left') => { ws.mergeCells(r, 1, r, NC); const c = ws.getCell(r, 1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: align, vertical: 'middle', wrapText: true }; r++; };
  merged('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true }, 'center');
  merged('Độc lập – Tự do – Hạnh phúc', { bold: true }, 'center');
  r++;
  merged(doc.tieu_de || 'BẢNG KÊ CHI PHÍ VẬN CHUYỂN', { size: 16, bold: true }, 'center'); ws.getRow(r - 1).height = 26;
  merged(doc.period, {}, 'center');
  merged(`Số: ………… / BK-${benB.ma}${doc.thang ? `-${doc.thang.replace('/', '')}` : ''}`, {}, 'center');
  if (doc.contract) merged(doc.contract, { italic: true }, 'center');
  r++;
  for (const [tag, p] of [['BÊN A (Bên thuê vận chuyển)', benA], ['BÊN B (Bên vận chuyển)', benB]]) { for (const [t, o] of partyLines(tag, p)) merged(t, o); r++; }
  if (doc.extra) merged(`Phạm vi lọc: ${doc.extra}`, { italic: true, size: 9 });
  const cols = [
    { header: 'STT', w: 6, align: 'center', get: (l, i) => i + 1 },
    { header: 'Tuyến vận chuyển', w: 34, wrap: true, get: (l) => l.tuyen_ten },
    { header: 'Số xe', w: 8, fmt: 'int', get: (l) => l.so_xe },
    { header: 'Số chuyến', w: 10, fmt: 'int', get: (l) => l.so_chuyen },
    { header: 'KL (kg)', w: 14, fmt: 'kg', get: (l) => Math.round(Number(l.tong_tan) * 1000) },
    { header: 'KL (tấn)', w: 13, fmt: 'tan', get: (l) => l.tong_tan },
    { header: 'Đơn giá (đ/tấn)', w: 15, fmt: 'money', get: (l) => l.don_gia },
    { header: 'Thành tiền (đ)', w: 18, fmt: 'money', get: (l) => l.thanh_tien },
  ];
  const headRow = r;
  r = printTable(ws, r, cols, st.lines, { totals: ['', 'CỘNG', null, st.so_chuyen, Math.round(st.tong_tan * 1000), st.tong_tan, null, st.tien_truoc_vat] });
  const lab = (text, value, bold) => { r++; ws.mergeCells(r, 1, r, 7); const a = ws.getCell(r, 1); a.value = text; a.font = { ...FONT, bold }; a.alignment = { horizontal: 'right' }; const b = ws.getCell(r, 8); b.value = value; b.numFmt = FMT.money; b.font = { ...FONT, bold }; b.border = BOX; };
  lab('Cộng tiền hàng (chưa VAT)', st.tien_truoc_vat, true);
  for (const v of st.vatLines) lab(`Thuế GTGT ${v.vat_percent}% (trên ${Number(v.thanh_tien).toLocaleString('vi-VN')})`, v.tien_vat, false);
  lab('TỔNG CỘNG THANH TOÁN', st.tong_tien, true);
  r += 2;
  ws.mergeCells(r, 1, r, NC); ws.getCell(r, 1).value = `Bằng chữ: ${doc.bangChu}`; ws.getCell(r, 1).font = { ...FONT, italic: true, bold: true }; ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = 30; r++;
  ws.mergeCells(r, 1, r, NC); ws.getCell(r, 1).value = 'Ghi chú: thành tiền từng dòng đơn giá làm tròn đến đồng; thuế GTGT tính một lần trên tổng thành tiền cùng thuế suất, làm tròn đến đồng. Cước tính theo khối lượng cân thực tế. Chi tiết theo xe và phiếu cân xem các Phụ lục.';
  ws.getCell(r, 1).font = { ...FONT, size: 9, italic: true }; ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = 28; r++;
  if (st.so_chuyen_chua_tinh_gia) { ws.mergeCells(r, 1, r, NC); ws.getCell(r, 1).value = `Lưu ý: còn ${st.so_chuyen_chua_tinh_gia} chuyến chưa tính được giá, chưa nằm trong bảng kê này.`; ws.getCell(r, 1).font = { ...FONT, bold: true, color: { argb: 'FFB4453B' } }; r++; }
  r += 1;
  ws.mergeCells(r, 5, r, 8); ws.getCell(r, 5).value = `${benB.noi_ky || '……………'}, ngày ……… tháng ……… năm ………`; ws.getCell(r, 5).font = { ...FONT, italic: true }; ws.getCell(r, 5).alignment = { horizontal: 'center' }; r++;
  r = signParties(ws, r, benA, benB);
  printSetup(ws, { titleRow: headRow, footer: `Bảng kê ${benB.ma} — ${doc.period}` });
  ws.pageSetup.printArea = `A1:H${r}`;

  // ---- Chi tiết theo xe (tham khảo)
  const w2 = wb.addWorksheet('Chi tiết theo xe');
  w2.mergeCells(1, 1, 1, 7); w2.getCell(1, 1).value = `CHI TIẾT THEO XE — ${benB.ma}`; w2.getCell(1, 1).font = { ...FONT, size: 13, bold: true };
  w2.mergeCells(2, 1, 2, 7); w2.getCell(2, 1).value = `${doc.period} · số phân bổ theo xe, chưa làm tròn (tham khảo)`; w2.getCell(2, 1).font = { ...FONT, italic: true, size: 9 };
  const vc = [
    { header: 'STT', w: 6, align: 'center', get: (x, i) => i + 1 },
    { header: 'Biển số', w: 13, text: true, get: (x) => x.bien_so },
    { header: 'Tuyến', w: 28, wrap: true, get: (x) => x.tuyen },
    { header: 'Đơn giá', w: 14, fmt: 'money', get: (x) => x.don_gia },
    { header: 'Số chuyến', w: 10, fmt: 'int', get: (x) => x.so_chuyen },
    { header: 'KL (tấn)', w: 13, fmt: 'tan', get: (x) => x.tong_tan },
    { header: 'Thành tiền (đ)', w: 18, fmt: 'money', get: (x) => x.thanh_tien },
  ];
  const sv = (k) => st.vehicles.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  printTable(w2, 4, vc, st.vehicles, { totals: ['', 'CỘNG', '', '', sv('so_chuyen'), sv('tong_tan'), sv('thanh_tien')] });
  printSetup(w2, { titleRow: 4, footer: `Chi tiết theo xe — ${benB.ma}` });

  // ---- Đối chiếu khối lượng 2 bên (khi chọn lô đối chiếu)
  if (doc.recon) {
    const rc = doc.recon, w4 = wb.addWorksheet('Đối chiếu khối lượng');
    const NR = 9; let q = 1;
    const mg = (text, opts = {}, align = 'left') => { w4.mergeCells(q, 1, q, NR); const c = w4.getCell(q, 1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: align, vertical: 'middle', wrapText: true }; q++; };
    mg('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true }, 'center'); mg('Độc lập – Tự do – Hạnh phúc', { bold: true }, 'center'); q++;
    mg('BIÊN BẢN ĐỐI CHIẾU KHỐI LƯỢNG', { size: 15, bold: true }, 'center'); w4.getRow(q - 1).height = 24;
    mg(doc.period, {}, 'center');
    mg(`Lô đối chiếu: ${rc.batch.ten}${rc.batch.created_at ? ` · ngày chạy ${dmy(rc.batch.created_at.slice(0, 10))}` : ''}`, { italic: true, size: 9 }, 'center'); q++;
    mg(`Bên A (số liệu trạm cân của ${benA.ten || '…'}) và Bên B (số liệu của ${benB.ten}) cùng đối chiếu khối lượng hàng vận chuyển theo từng xe như sau:`);
    q++;
    const rcols = [
      { header: 'STT', w: 6, align: 'center', get: (x, i) => i + 1 },
      { header: 'Biển số', w: 14, text: true, get: (x) => x.bien_so },
      { header: 'Bên A\nSố chuyến', w: 10, fmt: 'int', get: (x) => x.a_chuyen },
      { header: 'Bên A\nKL (kg)', w: 15, fmt: 'kg', get: (x) => x.a_kg },
      { header: 'Bên B\nSố chuyến', w: 10, fmt: 'int', get: (x) => x.b_chuyen },
      { header: 'Bên B\nKL (kg)', w: 15, fmt: 'kg', get: (x) => x.b_kg },
      { header: 'Chênh lệch\nB − A (kg)', w: 15, fmt: 'kg', get: (x) => x.chenh_kg },
      { header: 'Chênh\n(%)', w: 9, fmt: 'pct', get: (x) => (x.chenh_pct === null ? null : Math.round(x.chenh_pct * 100) / 100) },
      { header: 'Kết luận', w: 16, align: 'center', get: (x) => ({ KHOP: 'Khớp', LECH: 'Lệch', CHI_BEN_A: 'Chỉ Bên A có', CHI_BEN_B: 'Chỉ Bên B có' }[x.ket_luan]) },
    ];
    const t = rc.tot;
    const hr = q;
    q = printTable(w4, q, rcols, rc.rows, { totals: ['', 'CỘNG', t.a_chuyen, t.a_kg, t.b_chuyen, t.b_kg, t.chenh_kg, t.chenh_pct === null ? null : Math.round(t.chenh_pct * 100) / 100, ''] });
    rc.rows.forEach((x, i) => { if (x.ket_luan !== 'KHOP') for (let c = 1; c <= NR; c++) w4.getCell(hr + 1 + i, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBECEB' } }; });
    w4.getRow(hr).height = 32; for (let c = 1; c <= NR; c++) w4.getCell(hr, c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    q++; const c = rc.counts;
    w4.mergeCells(q, 1, q, NR); w4.getCell(q, 1).value = `Tổng ${rc.rows.length} xe: ${c.KHOP} khớp · ${c.LECH} lệch · ${c.CHI_BEN_A} chỉ Bên A có · ${c.CHI_BEN_B} chỉ Bên B có. Chênh lệch (B − A) = ${t.chenh_kg.toLocaleString('vi-VN')} kg (${(t.chenh_kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} tấn). Chi phí thanh toán theo khối lượng cân của Bên A; các xe lệch cần rà soát phiếu cân trước khi ký.`;
    w4.getCell(q, 1).font = { ...FONT, size: 9, italic: true }; w4.getCell(q, 1).alignment = { wrapText: true, vertical: 'top' }; w4.getRow(q).height = 40; q++;
    w4.mergeCells(q, 1, q, NR); w4.getCell(q, 1).value = 'Hai bên thống nhất:   ☐ Khớp toàn bộ      ☐ Có chênh lệch, xử lý: ………………………………………………'; w4.getCell(q, 1).font = { ...FONT, bold: true, italic: true }; q += 2;
    w4.mergeCells(q, 5, q, NR); w4.getCell(q, 5).value = `${benB.noi_ky || '……………'}, ngày ……… tháng ……… năm ………`; w4.getCell(q, 5).font = { ...FONT, italic: true }; w4.getCell(q, 5).alignment = { horizontal: 'center' }; q++;
    q = signParties(w4, q, benA, benB, [[1, 4], [6, 9]]);
    printSetup(w4, { titleRow: hr, footer: `Đối chiếu khối lượng — ${benB.ma} — ${doc.period}` }); w4.pageSetup.printArea = `A1:I${q}`;
  }

  // ---- Phụ lục phiếu cân (để hai bên đối chiếu)
  const w3 = wb.addWorksheet('Phụ lục phiếu cân');
  w3.mergeCells(1, 1, 1, 9); w3.getCell(1, 1).value = `PHỤ LỤC — DANH SÁCH PHIẾU CÂN (${benB.ma})`; w3.getCell(1, 1).font = { ...FONT, size: 13, bold: true };
  w3.mergeCells(2, 1, 2, 9); w3.getCell(2, 1).value = `${doc.period} · ${doc.tickets.length} phiếu đã tính giá (các phiếu nằm trong bảng kê)`; w3.getCell(2, 1).font = { ...FONT, italic: true, size: 9 };
  const tc = [
    { header: 'STT', w: 6, align: 'center', get: (x, i) => i + 1 },
    { header: 'Số phiếu', w: 11, text: true, get: (x) => x.so_phieu },
    { header: 'Ngày giờ cân', w: 17, align: 'center', get: (x) => { const d = x.ngay_gio_can_1 || ''; return d ? `${dmy(d.slice(0, 10))} ${d.slice(11, 16)}` : ''; } },
    { header: 'Biển số', w: 12, text: true, get: (x) => x.bien_so },
    { header: 'Nơi xuất', w: 22, wrap: true, get: (x) => x.noi_xuat || x.noi_xuat_goc },
    { header: 'Nơi đến', w: 18, wrap: true, get: (x) => x.noi_den },
    { header: 'KL hàng (kg)', w: 13, fmt: 'kg', get: (x) => x.kl_hang_kg },
    { header: 'KL (tấn)', w: 11, fmt: 'tan', get: (x) => x.kl_hang_tan },
    { header: 'Đơn giá', w: 12, fmt: 'money', get: (x) => x.don_gia },
  ];
  const kgSum = doc.tickets.reduce((a, x) => a + (Number(x.kl_hang_kg) || 0), 0);
  const rEnd = printTable(w3, 4, tc, doc.tickets, { totals: ['', 'CỘNG', '', '', '', `${doc.tickets.length} phiếu`, kgSum, kgSum / 1000, null] });
  signParties(w3, rEnd + 3, benA, benB, [[1, 4], [6, 9]]);
  printSetup(w3, { landscape: true, titleRow: 4, footer: `Phụ lục phiếu cân — ${benB.ma} — ${doc.period}` });
  return done(wb);
}

/** Báo cáo tổng hợp (theo xe/đơn vị/nơi xuất/ngày/đợt) để in: có cột KG + tấn, không cột "chưa tính giá" (chỉ ghi chú nếu có). */
async function reportWorkbook(doc) {
  const { def, rows, tot } = doc;
  const wb = newWb();
  const ws = wb.addWorksheet(def.title.slice(0, 28).replace(/[\/?*[\]:]/g, ' '));
  const cols = [
    { header: 'STT', w: 6, align: 'center', get: (x, i) => i + 1 },
    { header: def.key, w: 24, text: !!def.text, wrap: true, get: (x) => x.label },
    { header: def.extra.header, w: 13, fmt: def.extra.int ? 'int' : undefined, get: (x) => x[def.extra.key] },
    { header: 'Số chuyến', w: 10, fmt: 'int', get: (x) => x.so_chuyen },
    { header: 'KL cân (kg)', w: 14, fmt: 'kg', get: (x) => x.tong_kg },
    { header: 'KL cân (tấn)', w: 14, fmt: 'tan', get: (x) => x.tong_tan },
  ];
  if (def.dot) cols.push({ header: 'KL giám định (tấn)', w: 14, fmt: 'tan', get: (x) => x.kl_giam_dinh_tan }, { header: 'Chênh (GĐ − cân)', w: 13, fmt: 'tan', get: (x) => x.chenh_giam_dinh_tan });
  cols.push(
    { header: 'Đơn giá (đ/tấn)', w: 15, align: 'right', get: (x) => (x.don_gia || []).map((g) => Number(g).toLocaleString('vi-VN')).join(' / ') },
    { header: 'Thành tiền (đ)', w: 17, fmt: 'money', get: (x) => x.tien_truoc_vat },
    { header: 'VAT (đ)', w: 15, fmt: 'money', get: (x) => x.tien_vat },
    { header: 'Tổng tiền (đ)', w: 17, fmt: 'money', get: (x) => x.tong_tien },
  );
  const NC = cols.length; let r = 1;
  const line = (text, opts, align = 'left') => { ws.mergeCells(r, 1, r, NC); const c = ws.getCell(r, 1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: align, wrapText: true, vertical: 'middle' }; r++; };
  line(doc.title, { size: 15, bold: true }, 'center'); ws.getRow(1).height = 24;
  if (doc.benA.ten) line(doc.benA.ten, { bold: true }, 'center');
  line(doc.filters.length ? doc.filters.map(([k, v]) => `${k}: ${v}`).join('  ·  ') : 'Phạm vi: toàn bộ dữ liệu', { italic: true, size: 10 }, 'center');
  line('Số tiền theo dòng là số phân bổ chưa làm tròn (tham khảo); số thanh toán chính thức theo "Bảng kê thanh toán".', { italic: true, size: 9, color: { argb: 'FF77756A' } }, 'center');
  if (doc.chuaTinh) line(`Lưu ý: còn ${doc.chuaTinh} chuyến chưa tính được giá, chưa nằm trong số liệu tiền.`, { bold: true, color: { argb: 'FFB4453B' } });
  r++;
  const head = r;
  const tl = cols.map((c) => null); tl[1] = 'CỘNG';
  const idx = (h) => cols.findIndex((c) => c.header === h);
  tl[idx('Số chuyến')] = tot.so_chuyen; tl[idx('KL cân (kg)')] = tot.tong_kg; tl[idx('KL cân (tấn)')] = tot.tong_tan; tl[idx('Thành tiền (đ)')] = tot.tien_truoc_vat; tl[idx('VAT (đ)')] = tot.tien_vat; tl[idx('Tổng tiền (đ)')] = tot.tong_tien;
  r = printTable(ws, r, cols, rows, { totals: tl });
  r += 3;
  const mid = Math.max(2, Math.floor(NC / 2));
  signatureBlock(ws, r, { title: 'NGƯỜI LẬP BIỂU', name: doc.benA.nguoi_lap || '' }, { title: 'KẾ TOÁN TRƯỞNG / PHỤ TRÁCH', name: '' }, { span: [[1, mid], [mid + 1, NC]] });
  printSetup(ws, { landscape: true, titleRow: head, footer: doc.title });
  return done(wb);
}

module.exports = { FONT, FMT, BOX, PRINT_HEAD, newWb, done, signParties, partyLines, reportWorkbook, printTable, signatureBlock, printSetup, priceSheetWorkbook, reconWorkbook, ticketsWorkbook, statementWorkbook, timelineWorkbook, addTable };
