'use strict';
/** Excel in/ký cho 3 biểu mẫu: Tổng hợp xuất hàng tàu · Chi tiết vận chuyển · Bảng tính đơn giá. Times New Roman, kẻ viền, A4, 2 bên ký. */
const { FONT, FMT, BOX, PRINT_HEAD, newWb, done, signParties, partyLines, printTable, printSetup } = require('./exporters');
const { dmy } = require('../print/documents');

const sheetName = (s, used) => { let n = String(s).replace(/[\/\\?*[\]:]/g, ' ').slice(0, 28) || 'Sheet'; let i = 1; while (used.has(n)) n = `${n.slice(0, 25)} ${++i}`; used.add(n); return n; };
const merged = (ws, r, NC, text, opts = {}, align = 'left', h) => { ws.mergeCells(r, 1, r, NC); const c = ws.getCell(r, 1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: align, vertical: 'middle', wrapText: true }; if (h) ws.getRow(r).height = h; return r + 1; };
const header = (ws, NC, title, lines) => {
  let r = 1; const tl = Array.isArray(title) ? title : [title];
  r = merged(ws, r, NC, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true }, 'center');
  r = merged(ws, r, NC, 'Độc lập – Tự do – Hạnh phúc', { bold: true }, 'center');
  r++;
  tl.forEach((t, i) => { r = merged(ws, r, NC, t, { bold: true, size: i === 0 ? 14 : 12 }, 'center', i === 0 ? 26 : 20); });
  for (const [t, o] of lines) r = merged(ws, r, NC, t, o || {}, 'center');
  return r + 1;
};
/**
 * Khối đầu trang: chỉ quốc hiệu căn GIỮA trang (không in tên công ty ở đầu trang); trả về dòng kế tiếp.
 */
const topBlock = (ws, r0, NC) => {
  ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'Độc lập – Tự do – Hạnh phúc'].forEach((t, i) => {
    ws.mergeCells(r0 + i, 1, r0 + i, NC); const c = ws.getCell(r0 + i, 1); c.value = t; c.font = { ...FONT, bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  return r0 + 2;
};
/** Đầu chứng từ kiểu PRICING_SHEET: Bên A (trái) · quốc hiệu + Số (phải) · tiêu đề · khối thông tin có nhãn. */
const docHead = (ws, NC, A, so, titleLines, sub, infos, widths = null) => {
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = topBlock(ws, 1, NC, A);
  const cell = (r0, c1, c2, text, opts, align) => { ws.mergeCells(r0, c1, r0, c2); const c = ws.getCell(r0, c1); c.value = text; c.font = { ...FONT, ...opts }; c.alignment = { horizontal: align, vertical: 'middle', wrapText: true }; };
  r++;
  titleLines.forEach((t, i) => { r = merged(ws, r, NC, t, { bold: true, size: i === 0 ? 14 : 12 }, 'center', i === 0 ? 26 : 20); });
  if (sub) r = merged(ws, r, NC, sub, { italic: true }, 'center');
  r = merged(ws, r, NC, `Số: ${so}`, { italic: true }, 'center');
  r++;
  let k = 1; let kw = ws.getColumn(1).width || 9; while (kw < 28 && k < NC - 2) { k++; kw += ws.getColumn(k).width || 9; }
  for (const row of infos.filter(Boolean)) { ws.mergeCells(r, 1, r, k); ws.getCell(r, 1).value = row[0]; ws.getCell(r, 1).font = FONT; cell(r, k + 1, NC, row[1], { bold: !!row[2] }, 'left'); r++; }
  return r + 1;
};
const contractTxt = (b) => (b && b.so_hop_dong ? `Hợp đồng vận chuyển số ${b.so_hop_dong}${b.ngay_hop_dong ? ` ngày ${dmy(b.ngay_hop_dong)}` : ''}` : '');
const partyInfos = (A, B) => [contractTxt(B) && ['Căn cứ hợp đồng:', contractTxt(B)], ['Bên thuê vận chuyển:', (A.ten || '').toUpperCase(), true], ['Bên vận chuyển:', (B.ten || '').toUpperCase(), true]];
const parties = (ws, r, NC, A, B) => { for (const [tag, p] of [['BÊN A (Bên thuê vận chuyển)', A], ['BÊN B (Bên vận chuyển)', B]]) { if (!p) continue; for (const [t, o] of partyLines(tag, p)) r = merged(ws, r, NC, t, o); } return r + 1; };
const split = (NC) => { const m = Math.ceil(NC / 2); return [[1, Math.max(1, m - 1)], [m + 1, NC]]; };
const dateSign = (ws, r, NC, B) => { const m = Math.ceil(NC / 2) + 1; ws.mergeCells(r, m, r, NC); const c = ws.getCell(r, m); c.value = `${(B && B.noi_ky) || '……………'}, ngày ……… tháng ……… năm ………`; c.font = { ...FONT, italic: true }; c.alignment = { horizontal: 'center' }; return r + 1; };

/** 1) TỔNG HỢP XUẤT HÀNG TÀU — mỗi (đơn vị, nơi xuất) 1 sheet */
async function tauSummaryWorkbook(doc) {
  const wb = newWb(); const used = new Set();
  if (!doc.sections.length) { const ws = wb.addWorksheet('Trống'); ws.getCell('A1').value = 'Không có phiếu đã tính giá theo bộ lọc'; ws.getCell('A1').font = FONT; }
  for (const sec of doc.sections) {
    const ws = wb.addWorksheet(sheetName(sec.sheet, used)); const NC = 9;
    let r = docHead(ws, NC, doc.benA, `………… / TH-${sec.benB.ma}`, sec.titleLines.slice(0, 2), sec.titleLines[2], [...partyInfos(doc.benA, sec.benB), ['Tuyến vận chuyển:', `${sec.noi_xuat} → ${sec.noi_den}`, true]], [6, 13, 10, 16, 16, 12, 16, 15, 16]);
    const cols = [
      { header: 'STT', w: 6, align: 'center', get: (x, i) => i + 1 },
      { header: 'Số xe', w: 13, text: true, get: (x) => x.bien_so },
      { header: 'Số chuyến', w: 10, fmt: 'int', get: (x) => x.so_chuyen },
      { header: 'Khối lượng (KG)', w: 16, fmt: 'kg', get: (x) => x.kg },
      { header: 'Khối lượng (Tấn)', w: 16, fmt: 'tan', get: (x) => x.tan },
      { header: 'Đơn giá', w: 12, fmt: 'money', get: (x) => x.don_gia },
      { header: 'Thành tiền', w: 16, fmt: 'money', get: (x) => Math.round(x.tien) },
      { header: 'VAT', w: 15, fmt: 'money', get: (x) => Math.round(x.vat) },
      { header: 'Tổng tiền', w: 16, fmt: 'money', get: (x) => Math.round(x.tong) },
    ];
    const head = r; const t = sec.tot;
    r = printTable(ws, r, cols, sec.rows, { totals: ['', `Tổng cộng (${t.xe} xe)`, t.so_chuyen, t.kg, t.tan, null, Math.round(t.tien), Math.round(t.vat), Math.round(t.tong)] });
    r += 2; r = merged(ws, r, NC, `Bằng chữ: ${sec.bangChu}`, { bold: true, italic: true });
    r = merged(ws, r, NC, 'Ghi chú: số liệu theo xe là số phân bổ theo phiếu cân; số thanh toán chính thức theo Bảng kê chi phí vận chuyển.', { italic: true, size: 9 });
    r++; r = dateSign(ws, r, NC, sec.benB);
    r = signParties(ws, r, doc.benA, sec.benB, split(NC));
    printSetup(ws, { landscape: false, titleRow: head, footer: `${sec.titleLines[0]} — ${sec.benB.ma}` }); ws.pageSetup.printArea = `A1:I${r}`; if (sec.rows.length <= 14) ws.pageSetup.fitToHeight = 1;
  }
  return done(wb);
}

/** 2) CHI TIẾT VẬN CHUYỂN — mỗi đơn vị 1 sheet, nhóm theo xe có cộng */
async function detailWorkbook(doc) {
  const wb = newWb(); const used = new Set();
  if (!doc.sections.length) { const ws = wb.addWorksheet('Trống'); ws.getCell('A1').value = 'Không có phiếu theo bộ lọc'; ws.getCell('A1').font = FONT; }
  for (const sec of doc.sections) {
    const ws = wb.addWorksheet(sheetName(sec.sheet, used)); const NC = 13;
    let r = docHead(ws, NC, doc.benA, `………… / CT-${sec.benB.ma}`, [sec.title], doc.period.text.replace(/^Đợt /, 'Vận chuyển '), partyInfos(doc.benA, sec.benB), [5, 9, 14, 14, 10, 10, 10, 10, 9, 13, 13, 9, 12]);
    const cols = [
      { header: 'STT', w: 5, align: 'center' }, { header: 'Số phiếu', w: 9, text: true }, { header: 'Ngày giờ cân 1', w: 14, align: 'center' }, { header: 'Ngày giờ cân 2', w: 14, align: 'center' },
      { header: 'Biển số', w: 10, text: true }, { header: 'Cân lần 1 (KG)', w: 10, fmt: 'kg' }, { header: 'Cân lần 2 (KG)', w: 10, fmt: 'kg' }, { header: 'KL hàng (KG)', w: 10, fmt: 'kg' },
      { header: 'KL (Tấn)', w: 9, fmt: 'tan' }, { header: 'Nơi xuất', w: 13 }, { header: 'Nơi đến', w: 13 }, { header: 'Đơn giá', w: 9, fmt: 'money' }, { header: 'Thành tiền', w: 12, fmt: 'money' },
    ];
    cols.forEach((c, i) => { const cell = ws.getCell(r, i + 1); cell.value = c.header; cell.fill = PRINT_HEAD; cell.border = BOX; cell.font = { ...FONT, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; ws.getColumn(i + 1).width = c.w; });
    ws.getRow(r).height = 32; const head = r; r++;
    const dt = (iso) => (iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '');
    const put = (row, vals, { bold = false, fill = false } = {}) => vals.forEach((v, i) => { const c = ws.getCell(row, i + 1); c.value = v === undefined || v === '' ? null : v; c.border = BOX; c.font = { ...FONT, bold };
      c.alignment = { vertical: 'middle', horizontal: cols[i].fmt ? 'right' : (i === 0 || i === 2 || i === 3 ? 'center' : 'left') }; if (cols[i].fmt) c.numFmt = FMT[cols[i].fmt]; if (cols[i].text) c.numFmt = '@'; if (fill) c.fill = PRINT_HEAD; });
    let n = 0;
    for (const x of sec.xes) {
      for (const t of x.rows) { n++; put(r++, [n, t.so_phieu, dt(t.ngay_gio_can_1), dt(t.ngay_gio_can_2), t.bien_so, t.can_lan_1, t.can_lan_2, t.kl_hang_kg, t.kl_hang_tan, t.noi_xuat || t.noi_xuat_goc, t.noi_den, t.don_gia, t.tien_truoc_vat === null ? null : Math.round(t.tien_truoc_vat)]); }
      put(r++, ['', `Cộng ${x.bien_so}`, '', '', `${x.so_chuyen} chuyến`, '', '', x.kg, x.kg / 1000, '', '', '', Math.round(x.tien)], { bold: true, fill: true });
    }
    put(r++, ['', 'TỔNG CỘNG', '', '', `${sec.tot.so_chuyen} chuyến / ${sec.tot.xe} xe`, '', '', sec.tot.kg, sec.tot.kg / 1000, '', '', '', Math.round(sec.tot.tien)], { bold: true, fill: true });
    if (sec.tot.chuaTinh) r = merged(ws, r, NC, `Lưu ý: ${sec.tot.chuaTinh} chuyến chưa tính được giá (cột Đơn giá/Thành tiền để trống).`, { bold: true, color: { argb: 'FFB4453B' } });
    r++; r = dateSign(ws, r, NC, sec.benB);
    r = signParties(ws, r, doc.benA, sec.benB, split(NC));
    printSetup(ws, { landscape: false, titleRow: head, footer: `${sec.title} — ${sec.don_vi}` }); ws.pageSetup.printArea = `A1:M${r}`;
  }
  return done(wb);
}


const VFMT = { money: '#,##0', money2: '#,##0.00', dec2: '#,##0.00', dec4: '0.0000' };
/** 3) BẢNG TÍNH ĐƠN GIÁ — mỗi tuyến 1 sheet theo mẫu DGVC (STT · Chỉ tiêu · Cách tính · Diễn giải · Giá trị · ĐVT); công thức Excel sống. Thêm vào workbook có sẵn. */
function addPriceSheets(wb, doc) {
  const used = new Set(wb.worksheets.map((w) => w.name));
  const { benA, benB } = doc; const A = benA, B = benB || { ten: '', chuc_vu: 'Giám đốc', dai_dien: '', ke_toan: '' };
  for (const sec of doc.sections.filter((x) => !x.x.thieu)) {
    const x = sec.x; const ws = wb.addWorksheet(sheetName(sec.sheet, used)); const NC = 6; let r = 1;
    ws.getColumn(1).width = 7; ws.getColumn(2).width = 42; ws.getColumn(3).width = 22; ws.getColumn(4).width = 30; ws.getColumn(5).width = 17; ws.getColumn(6).width = 12;
    r = topBlock(ws, r, NC, A);
    r++;
    r = merged(ws, r, NC, 'BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN', { bold: true, size: 15 }, 'center', 26);
    r = merged(ws, r, NC, `( Bảng giá hiệu lực ngày ${dmy(doc.sh.ngay)}${doc.sh.gia_dau_ap_dung != null ? ` · giá dầu áp dụng ${Number(doc.sh.gia_dau_ap_dung).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} đ/lít` : ''} )`, { italic: true }, 'center'); r++;
    r = merged(ws, r, NC, `Số: ………… / BTĐG-${x.ma_tuyen}`, { italic: true }, 'center');
    const info = (k, v, bold) => { ws.getCell(r, 1).value = k; ws.mergeCells(r, 1, r, 2); ws.getCell(r, 1).font = FONT; ws.mergeCells(r, 3, r, NC); const c = ws.getCell(r, 3); c.value = v; c.font = { ...FONT, bold: !!bold }; c.alignment = { wrapText: true, vertical: 'top' }; r++; };
    if (doc.contract) info('Căn cứ hợp đồng:', doc.contract);
    info('Bên thuê vận chuyển (Bên A):', (A.ten || '').toUpperCase(), true);
    if (benB) info('Bên vận chuyển (Bên B):', (benB.ten || '').toUpperCase(), true);
    info('Tuyến vận chuyển:', `${x.ma_tuyen} — ${x.noi_xuat} → ${x.noi_den}`, true);
    info('Bảng giá áp dụng:', `${x.bang_gia}${sec.rule ? `, hiệu lực từ ${dmy(sec.rule.tu_ngay)}` : ''} · ${x.phuong_thuc === 'DIEU_CHINH_DAU' ? 'điều chỉnh theo giá dầu' : 'giá cố định'}`);
    r++;
    ['STT', 'Chỉ tiêu', 'Cách tính', 'Diễn giải', 'Giá trị', 'ĐVT'].forEach((t, i) => { const c = ws.getCell(r, i + 1); c.value = t; c.font = { ...FONT, bold: true }; c.fill = PRINT_HEAD; c.border = BOX; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    const head = r; r++; const rowOf = {};
    for (const st of sec.steps) {
      if (st.head) { ws.mergeCells(r, 1, r, NC); const c = ws.getCell(r, 1); c.value = st.head; c.font = { ...FONT, bold: true }; c.fill = PRINT_HEAD; for (let i = 1; i <= NC; i++) ws.getCell(r, i).border = BOX; r++; continue; }
      rowOf[st.stt] = r;
      const f = st.f ? st.f.replace(/\{(\d+)\}/g, (_, n) => `E${rowOf[n]}`) : null;
      const vals = [`(${st.stt})`, st.label, st.how, st.note, f ? { formula: f, result: st.value } : st.value, st.unit];
      vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = BOX; c.font = { ...FONT, bold: !!st.bold, size: i === 3 ? 10 : 11 };
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: i === 4 ? 'right' : (i === 0 || i === 2 || i === 5 ? 'center' : 'left') }; if (i === 4) c.numFmt = VFMT[st.fmt] || '#,##0'; if (st.bold) c.fill = PRINT_HEAD; });
      r++;
    }
    r = merged(ws, r, NC, `Bằng chữ: ${sec.giaBangChu}`, { bold: true, italic: true }, 'left', 22);
    if (sec.kyTri) {
      r++; ws.mergeCells(r, 1, r, NC); const t = ws.getCell(r, 1); t.value = `D. GIÁ TRỊ CƯỚC THEO PHIẾU CÂN${doc.tu_ngay || doc.den_ngay ? ` (${doc.tu_ngay ? dmy(doc.tu_ngay) : '…'} → ${doc.den_ngay ? dmy(doc.den_ngay) : '…'})` : ''}`; t.font = { ...FONT, bold: true }; r++;
      for (const [k, v, fm] of [['Số chuyến', sec.kyTri.so_chuyen, '#,##0'], ['Tổng khối lượng vận chuyển (tấn)', sec.kyTri.tan, '#,##0.000'], ['Thành tiền chưa VAT (đồng)', sec.kyTri.tien, '#,##0'], [`Thuế GTGT ${sec.vat || 8}% (đồng)`, sec.kyTri.vat, '#,##0'], ['TỔNG GIÁ TRỊ THANH TOÁN (đồng)', sec.kyTri.tong, '#,##0']]) {
        ws.mergeCells(r, 1, r, 4); const a = ws.getCell(r, 1); a.value = k; a.font = { ...FONT, bold: k.startsWith('TỔNG') }; const b = ws.getCell(r, 5); b.value = v; b.numFmt = fm; b.font = { ...FONT, bold: k.startsWith('TỔNG') }; b.alignment = { horizontal: 'right' }; r++;
      }
      r = merged(ws, r, NC, `Bằng chữ: ${sec.kyTri.bangChu}`, { bold: true, italic: true });
    }
    r++; ws.mergeCells(r, 3, r, NC); const d = ws.getCell(r, 3); d.value = `${B.noi_ky || '……………'}, ngày ……… tháng ……… năm ………`; d.font = { ...FONT, italic: true }; d.alignment = { horizontal: 'center' }; r++;
    r = signParties(ws, r, A, B, [[1, 3], [4, 6]]);
    printSetup(ws, { titleRow: head, footer: `Bảng tính đơn giá ${x.ma_tuyen} — ${doc.sh.ngay}` }); ws.pageSetup.fitToHeight = 1; ws.pageSetup.printArea = `A1:F${r}`;
  }
  return wb;
}

module.exports = { tauSummaryWorkbook, detailWorkbook, addPriceSheets };
