'use strict';
/**
 * FILE EXCEL MẪU ĐỂ IMPORT — sinh theo danh mục HIỆN TẠI của bản cài (tuyến, xe, đơn vị, hợp đồng).
 *   PHIEU_CAN     → sheet "NL_VC"          (tên sheet giống file Excel cũ → phần mềm tự chọn đúng sheet)
 *   GIAO_NHAN_DAU → sheet "NL_GIAONHANDAU"
 * Mỗi file gồm: sheet nhập liệu (tiêu đề cột đúng tên phần mềm nhận, cột bắt buộc có dấu *, định dạng ô, danh sách chọn,
 * cảnh báo khi nhập sai), HUONG_DAN (giải thích từng cột + cách import), DANH_MUC (tuyến / xe / đơn vị để chọn), VI_DU (dòng mẫu — không import).
 */
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../../shared/errors');

const C = { dark: 'FF0F2740', green: 'FF0E7C86', accent: 'FF7BE0E6', cream: 'FFF3F6FA', band: 'FFF8FAFC', line: 'FFD5DEE8', red: 'FFE5484D', mute: 'FF6B7A8C', white: 'FFFFFFFF' }; // bộ màu HAK: navy + teal
const FIRST = 6;           // dòng dữ liệu đầu tiên
const LAST = FIRST + 999;  // 1.000 dòng có sẵn định dạng / danh sách chọn
const FONT = 'Arial';

/** Định nghĩa cột: header phải là 1 alias trong mapping.js (dấu * được bỏ khi so khớp). */
const COLS = {
  PHIEU_CAN: [
    { h: 'STT', w: 6, kind: 'int', note: 'Số thứ tự (không bắt buộc)', ex: 1 },
    { h: 'Số phiếu', req: true, w: 11, kind: 'text', note: 'Số phiếu cân của trạm cân. Số phiếu + ngày cân 1 + biển số không được trùng', ex: '8012' },
    { h: 'Ngày cân 1', req: true, w: 12, kind: 'date', note: 'Ngày cân lần 1 (dd/MM/yyyy). Kỳ tính theo ngày này', ex: '18/09/2026' },
    { h: 'Giờ cân 1', w: 10, kind: 'time', note: 'hh:mm:ss', ex: '07:35:12' },
    { h: 'Ngày cân 2', req: true, w: 12, kind: 'date', note: 'Ngày cân lần 2 (dd/MM/yyyy); khác ngày cân 1 = phiếu qua đêm (cảnh báo)', ex: '18/09/2026' },
    { h: 'Giờ cân 2', w: 10, kind: 'time', note: 'hh:mm:ss', ex: '07:58:40' },
    { h: 'Biển số', req: true, w: 12, kind: 'plate', note: 'Biển số xe dạng 92H-00057 — chọn trong danh sách (xe mới vẫn nhập được, phần mềm cảnh báo)', ex: '92H-00057' },
    { h: 'Cân lần 1', w: 11, kind: 'kg', note: 'kg', ex: 13540 },
    { h: 'Cân lần 2', w: 11, kind: 'kg', note: 'kg', ex: 32150 },
    { h: 'KL hàng (kg)', req: true, w: 13, kind: 'kg', note: 'Khối lượng hàng (kg) = |Cân lần 2 − Cân lần 1|. Ô tô đỏ nếu lệch', ex: 18610 },
    { h: 'Nguồn gốc', w: 14, kind: 'text', note: 'Mô tả (không dùng tính)', ex: '' },
    { h: 'Khách hàng', w: 16, kind: 'text', note: 'Mô tả (không dùng tính)', ex: '' },
    { h: 'LDĐ', w: 9, kind: 'text', note: 'Lệnh điều động, vd 0726', ex: '0726' },
    { h: 'Kiểu cân', w: 10, kind: 'text', note: 'Mô tả (không dùng tính)', ex: 'Xuất' },
    { h: 'Mã tuyến', req: true, w: 10, kind: 'route', note: 'Mã tuyến vận chuyển — chọn trong danh sách (sheet DANH_MUC)', ex: 'VC.007' },
    { h: 'Đơn vị VC', w: 18, kind: 'unit', note: 'Đơn vị vận chuyển ghi trên phiếu (mã hoặc tên). Khác chủ xe trong danh mục → cảnh báo', ex: 'DH' },
  ],
  GIAO_NHAN_DAU: [
    { h: 'Ngày nhận dầu', req: true, w: 13, kind: 'date', note: 'Ngày xe nhận dầu (dd/MM/yyyy). Mọi dòng dầu của bảng kê đều tính vào kỳ, kể cả nhận trước Từ ngày', ex: '18/09/2026' },
    { h: 'Mã tuyến', req: true, w: 10, kind: 'route', note: 'Mã tuyến — chọn trong danh sách', ex: 'VC.007' },
    { h: 'Biển số xe', req: true, w: 13, kind: 'plate', note: 'Biển số xe của hợp đồng — chọn trong danh sách', ex: '92H-00057' },
    { h: 'ĐVT', w: 7, kind: 'uom', note: 'Mặc định Lít', ex: 'Lít' },
    { h: 'Số lượng (lít)', req: true, w: 13, kind: 'liter', note: 'Số lít khác 0, tối đa 2 chữ số lẻ. Dòng BÙ TRỪ nhiên liệu ghi số ÂM (vd -100): trừ vào dầu thực nhận', ex: 400 },
    { h: 'Đơn giá dầu (chưa VAT)', req: true, w: 15, kind: 'money', note: 'Đơn giá dầu CHƯA VAT (đ/lít). Đơn giá dầu của kỳ = trung bình cộng các dòng DƯƠNG; dòng bù trừ (âm) được để trống, không kéo giá', ex: 29940 },
    { h: 'Ngày mua dầu', w: 13, kind: 'date', note: 'Không bắt buộc', ex: '18/09/2026' },
    { h: 'Đơn vị', req: true, w: 12, kind: 'unit', note: 'Bên giao dầu (mã đơn vị) — chọn trong danh sách', ex: 'DH' },
    { h: 'Kho nhận dầu', w: 20, kind: 'text', note: 'Kho / cây xăng xe nhận dầu (không bắt buộc) — hiện trên nhật trình xe và bảng kê dầu', ex: 'Kho dầu HAKQN' },
    { h: 'Thành tiền (tự tính)', w: 16, kind: 'formula', note: 'Tự tính = Số lượng × Đơn giá, chỉ để đối chiếu — phần mềm không đọc cột này', ex: '' },
  ],
};
const SHEET = { PHIEU_CAN: 'NL_VC', GIAO_NHAN_DAU: 'NL_GIAONHANDAU' };
const TITLE = { PHIEU_CAN: 'MẪU IMPORT PHIẾU CÂN', GIAO_NHAN_DAU: 'MẪU IMPORT BẢNG KÊ GIAO NHẬN DẦU' };
const colL = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const thin = { style: 'thin', color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

class ImportTemplates {
  constructor(store) { this.store = store; }

  /** Dữ liệu danh mục đưa vào file mẫu. */
  _catalog(importType, contractId) {
    const s = this.store;
    const unit = s.get('DON_VI', s.unitCode) || {};
    let contract = null; let plates;
    const routes = s.all('TUYEN_VC').filter((r) => r.is_active).sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }));
    if (importType === 'GIAO_NHAN_DAU') {
      contract = s.get('HOP_DONG', contractId);
      if (!contract) throw new AppError('VALIDATION_FAILED', 'Chọn hợp đồng để tạo file mẫu bảng kê dầu');
      const ids = new Set(s.find('HOP_DONG_XE', (x) => x.contract_id === contractId && (!x.effective_to || x.effective_to >= new Date().toISOString().slice(0, 10))).map((x) => x.plate_no));
      plates = s.all('XE').filter((x) => ids.has(x.plate_no));
    } else plates = s.all('XE').filter((x) => x.is_active !== false);
    plates.sort((a, b) => a.plate_no.localeCompare(b.plate_no));
    const units = s.all('DON_VI').filter((u) => u.is_active).sort((a, b) => (a.sign_priority || 99) - (b.sign_priority || 99));
    return { unit, contract, routes, plates, units };
  }

  async build({ importType, contractId = '', targetPath }) {
    if (!COLS[importType]) throw new AppError('VALIDATION_FAILED', `importType không hợp lệ: ${importType}`);
    if (!targetPath) throw new AppError('VALIDATION_FAILED', 'Chọn nơi lưu file mẫu');
    const cat = this._catalog(importType, contractId);
    const cols = COLS[importType]; const n = cols.length;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DGVC — Đơn giá vận chuyển dăm'; wb.created = new Date();
    const today = new Date().toISOString().slice(0, 10);

    // ── Sheet nhập liệu
    const ws = wb.addWorksheet(SHEET[importType], { properties: { tabColor: { argb: C.green } }, pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const last = colL(n - 1);
    const fmt = { date: 'dd/mm/yyyy', time: 'hh:mm:ss', kg: '#,##0', liter: '#,##0.##', money: '#,##0', int: '0', formula: '#,##0' };

    ws.mergeCells(`A1:${last}1`); ws.mergeCells(`A2:${last}2`); ws.mergeCells(`A3:${last}3`);
    ws.getCell('A1').value = `${TITLE[importType]} — PHẦN MỀM ĐƠN GIÁ VẬN CHUYỂN DĂM`;
    ws.getCell('A1').font = { name: FONT, bold: true, size: 14, color: { argb: C.white } }; ws.getCell('A1').fill = fill(C.green);
    ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 }; ws.getRow(1).height = 28;
    const sub = importType === 'GIAO_NHAN_DAU'
      ? `Hợp đồng ${cat.contract.contract_code} · Bên vận chuyển ${cat.contract.carrier_unit_code} → bên thuê ${cat.contract.customer_unit_code} · ${cat.plates.length} xe`
      : `Đơn vị: ${cat.unit.unit_name || cat.unit.unit_code || ''}`;
    ws.getCell('A2').value = `${sub} · Mẫu tạo ngày ${dmy(today)}`;
    ws.getCell('A2').font = { name: FONT, size: 10, color: { argb: C.dark } }; ws.getCell('A2').fill = fill(C.cream); ws.getCell('A2').alignment = { indent: 1 };
    ws.getCell('A3').value = { richText: [
      { text: '* ', font: { name: FONT, bold: true, size: 9, color: { argb: C.red } } },
      { text: `= bắt buộc. Nhập từ dòng ${FIRST}, mỗi dòng 1 ${importType === 'PHIEU_CAN' ? 'phiếu cân' : 'lần nhận dầu'}. Không đổi tên / thứ tự dòng tiêu đề (dòng 5). Ngày dạng dd/MM/yyyy. Cách làm: xem sheet HUONG_DAN. Dòng mẫu: sheet VI_DU.`,
        font: { name: FONT, size: 9, color: { argb: C.mute } } }] };
    ws.getCell('A3').alignment = { indent: 1, wrapText: true }; ws.getRow(3).height = 26; ws.getCell('A3').fill = fill(C.cream);
    ws.getRow(4).height = 6;

    const hr = ws.getRow(5); hr.height = 34;
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.req ? { richText: [{ text: c.h, font: { name: FONT, bold: true, size: 10, color: { argb: C.white } } }, { text: ' *', font: { name: FONT, bold: true, size: 10, color: { argb: C.accent } } }] } : c.h;
      if (!c.req) cell.font = { name: FONT, bold: true, size: 10, color: { argb: c.kind === 'formula' ? C.cream : C.white } };
      cell.fill = fill(c.kind === 'formula' ? C.mute : C.dark); cell.border = box;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.note = { texts: [{ text: `${c.h}${c.req ? ' (bắt buộc)' : ''}\n${c.note}` }], margins: { insetmode: 'auto' } };
      ws.getColumn(i + 1).width = c.w;
    });

    // phiếu cân: KL hàng lệch |Cân 2 − Cân 1| → tô đỏ
    if (importType === 'PHIEU_CAN') {
      const [w1, w2, net] = ['Cân lần 1', 'Cân lần 2', 'KL hàng (kg)'].map((h) => colL(cols.findIndex((c) => c.h === h)));
      ws.addConditionalFormatting({ ref: `${net}${FIRST}:${net}${LAST}`, rules: [{ type: 'expression', priority: 1,
        formulae: [`AND(${w1}${FIRST}<>"",${w2}${FIRST}<>"",${net}${FIRST}<>"",${net}${FIRST}<>ABS(${w2}${FIRST}-${w1}${FIRST}))`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFCE4E4' } }, font: { color: { argb: C.red }, bold: true } } }] });
    }
    // tô đỏ ô bắt buộc còn trống khi dòng đã có dữ liệu
    const lastData = colL(cols.map((c) => c.kind).lastIndexOf(cols.filter((c) => c.kind !== 'formula').pop().kind));
    const anyCell = `COUNTA($A${FIRST}:$${lastData}${FIRST})>0`;
    cols.forEach((c, i) => { if (!c.req) return; const L = colL(i);
      ws.addConditionalFormatting({ ref: `${L}${FIRST}:${L}${LAST}`, rules: [{ type: 'expression', priority: 2, formulae: [`AND(${anyCell},${L}${FIRST}="")`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3D6' } } } }] }); });
    ws.pageSetup.printArea = `$A$1:$${last}$${FIRST + 39}`; ws.pageSetup.printTitlesRow = '5:5';
    ws.views = [{ state: 'frozen', xSplit: importType === 'PHIEU_CAN' ? 2 : 1, ySplit: 5, activeCell: `A${FIRST}` }];
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };

    // ── HUONG_DAN
    const hd = wb.addWorksheet('HUONG_DAN', { properties: { tabColor: { argb: C.accent } }, pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    hd.getColumn(1).width = 4; hd.getColumn(2).width = 24; hd.getColumn(3).width = 10; hd.getColumn(4).width = 16; hd.getColumn(5).width = 14; hd.getColumn(6).width = 70;
    hd.mergeCells('A1:F1'); hd.getCell('A1').value = `HƯỚNG DẪN — ${TITLE[importType]}`;
    hd.getCell('A1').font = { name: FONT, bold: true, size: 14, color: { argb: C.white } }; hd.getCell('A1').fill = fill(C.green); hd.getRow(1).height = 26; hd.getCell('A1').alignment = { indent: 1, vertical: 'middle' };
    const steps = importType === 'PHIEU_CAN' ? [
      `Nhập / dán dữ liệu vào sheet ${SHEET[importType]} từ dòng ${FIRST}. Dán từ file trạm cân: dùng "Dán giá trị" (Paste Values) để giữ định dạng ô.`,
      'Cột có dấu * là bắt buộc — ô bắt buộc còn trống sẽ tô cam khi dòng đã có dữ liệu. KL hàng lệch |Cân 2 − Cân 1| tô đỏ.',
      'Lưu file (.xlsx). Trong phần mềm: Phiếu cân → Import từ Excel → chọn file.',
      'Màn hình xem trước chia OK / Cảnh báo / Lỗi / Trùng. Phiếu đã có (cùng số phiếu, ngày cân 1, biển số) tự bỏ qua — import lại cùng file không nhân đôi.',
      'Tích "Chấp nhận các dòng cảnh báo" nếu đã kiểm tra → Xác nhận import. Dòng lỗi không được nhập — sửa file rồi import lại.',
    ] : [
      `Nhập bảng kê dầu của hợp đồng ${cat.contract.contract_code} vào sheet ${SHEET[importType]} từ dòng ${FIRST}.`,
      'Cột có dấu * là bắt buộc. Đơn giá dầu là giá CHƯA VAT. Cột "Thành tiền (tự tính)" chỉ để đối chiếu.',
      'Lưu file (.xlsx). Trong phần mềm: Giao nhận dầu → chọn đúng hợp đồng → Import từ Excel → chọn file.',
      'Dòng giống hệt nhau (cùng ngày, xe, số lít) bị cảnh báo NGHI TRÙNG. Khi tính giá có nút "Bỏ khỏi kỳ" / "Không trùng".',
      'Dầu trong bảng kê tính hết vào kỳ, kể cả dầu nhận trước Từ ngày của kỳ.',
    ];
    hd.getCell('B3').value = 'CÁC BƯỚC'; hd.getCell('B3').font = { name: FONT, bold: true, size: 11, color: { argb: C.green } };
    steps.forEach((t, i) => { const r = hd.getRow(4 + i); r.getCell(1).value = i + 1; r.getCell(1).font = { name: FONT, bold: true, color: { argb: C.green } }; r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      hd.mergeCells(4 + i, 2, 4 + i, 6); r.getCell(2).value = t; r.getCell(2).font = { name: FONT, size: 10 }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; r.height = 28; });
    const t0 = 5 + steps.length;
    hd.getCell(`B${t0}`).value = 'GIẢI THÍCH TỪNG CỘT'; hd.getCell(`B${t0}`).font = { name: FONT, bold: true, size: 11, color: { argb: C.green } };
    const hh = ['#', 'Tên cột trong file', 'Bắt buộc', 'Định dạng', 'Ví dụ', 'Ghi chú'];
    hh.forEach((t, i) => { const c = hd.getCell(t0 + 1, i + 1); c.value = t; c.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } }; c.fill = fill(C.dark); c.border = box; c.alignment = { vertical: 'middle' }; });
    const kindText = { int: 'Số nguyên', text: 'Chữ', date: 'Ngày dd/MM/yyyy', time: 'Giờ hh:mm:ss', plate: 'Biển số (danh sách)', kg: 'Số nguyên (kg)', route: 'Mã tuyến (danh sách)', unit: 'Mã đơn vị (danh sách)', uom: 'Chữ', liter: 'Số (lít)', money: 'Số (đồng)', formula: 'Công thức' };
    cols.forEach((c, i) => { const r = hd.getRow(t0 + 2 + i);
      [i + 1, c.h, c.req ? 'Có' : '', kindText[c.kind], c.ex, c.note].forEach((v, j) => { const cell = r.getCell(j + 1); cell.value = v; cell.border = box; cell.font = { name: FONT, size: 10, bold: j === 1, color: { argb: j === 2 && c.req ? C.red : 'FF1C1C1A' } }; cell.alignment = { wrapText: true, vertical: 'top' }; if (i % 2) cell.fill = fill(C.band); }); });

    // ── DANH_MUC (nguồn các danh sách chọn)
    const dm = wb.addWorksheet('DANH_MUC', { properties: { tabColor: { argb: C.mute } }, pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const lists = {};
    const block = (col, title, head, rows, key) => {
      const c0 = col;
      dm.mergeCells(1, c0, 1, c0 + head.length - 1);
      Object.assign(dm.getCell(1, c0), { value: title }); dm.getCell(1, c0).font = { name: FONT, bold: true, size: 11, color: { argb: C.green } };
      head.forEach((t, i) => { const c = dm.getCell(2, c0 + i); c.value = t; c.font = { name: FONT, bold: true, color: { argb: C.white }, size: 9 }; c.fill = fill(C.dark); c.border = box; c.alignment = { vertical: 'middle' }; });
      rows.forEach((r, j) => r.forEach((v, i) => { const c = dm.getCell(3 + j, c0 + i); c.value = v; c.font = { name: FONT, size: 9 }; c.border = box; if (j % 2) c.fill = fill(C.band); }));
      head.forEach((t, i) => { dm.getColumn(c0 + i).width = Math.max(10, Math.min(38, Math.max(t.length + 4, ...rows.map((r) => String(r[i] ?? '').length + 2)))); });
      lists[key] = `DANH_MUC!$${colL(c0 - 1)}$3:$${colL(c0 - 1)}$${Math.max(3, rows.length + 2)}`;
    };
    block(1, 'TUYẾN VẬN CHUYỂN', ['Mã', 'Tên tuyến', 'Cự ly chuyến (km)', 'ĐVT'], cat.routes.map((r) => [r.route_code, r.route_name, r.trip_distance_km, r.uom === 'M3' ? 'm³' : 'Tấn']), 'route');
    block(6, importType === 'GIAO_NHAN_DAU' ? 'XE CỦA HĐ' : 'XE', ['Biển số', 'Chủ xe'], cat.plates.map((x) => [x.plate_no, x.owner_unit_code || '']), 'plate');
    block(9, 'ĐƠN VỊ', ['Mã', 'Tên đơn vị'], cat.units.map((u) => [u.unit_code, u.unit_name]), 'unit');
    dm.getCell(1, 12).value = 'ĐVT'; dm.getCell(1, 12).font = { name: FONT, bold: true, size: 11, color: { argb: C.green } };
    ['Lít'].forEach((v, i) => { dm.getCell(3 + i, 12).value = v; }); lists.uom = 'DANH_MUC!$L$3:$L$3';
    dm.getCell(1, 14).value = `Danh mục lấy từ bản cài ${cat.unit.unit_code || ''} ngày ${dmy(today)}${cat.contract ? ` · xe của hợp đồng ${cat.contract.contract_code}` : ''} — sửa danh mục trong phần mềm, không sửa ở đây`;
    dm.getCell(1, 14).font = { name: FONT, italic: true, size: 9, color: { argb: C.mute } };
    dm.views = [{ state: 'frozen', ySplit: 2 }];

    cols.forEach((c, i) => {
      const L = colL(i);
      for (let r = FIRST; r <= LAST; r++) {
        const cell = ws.getCell(`${L}${r}`);
        cell.font = { name: FONT, size: 10 }; cell.border = box;
        if (fmt[c.kind]) cell.numFmt = fmt[c.kind];
        if (['text', 'plate', 'route', 'unit', 'uom'].includes(c.kind)) cell.numFmt = '@';
        if (c.kind === 'formula') {
          const q = colL(cols.findIndex((x) => x.kind === 'liter')); const p = colL(cols.findIndex((x) => x.kind === 'money'));
          cell.value = { formula: `IF(OR(${q}${r}="",${p}${r}=""),"",ROUND(${q}${r}*${p}${r},0))` };
          cell.font = { name: FONT, size: 10, color: { argb: C.mute } }; cell.fill = fill(C.band);
        }
        const dv = this._validation(c, lists);
        if (dv) cell.dataValidation = dv;
      }
    });
    // ── VI_DU
    const vd = wb.addWorksheet('VI_DU (không import)', { properties: { tabColor: { argb: C.line } }, pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    vd.getCell('A1').value = 'DÒNG MẪU — chỉ để xem cách điền, phần mềm KHÔNG đọc sheet này'; vd.getCell('A1').font = { name: FONT, italic: true, size: 10, color: { argb: C.mute } };
    cols.forEach((c, i) => { const h = vd.getCell(3, i + 1); h.value = `${c.h}${c.req ? ' *' : ''}`; h.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } }; h.fill = fill(C.mute); h.border = box; h.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }; vd.getColumn(i + 1).width = c.w;
      const v = vd.getCell(4, i + 1); v.value = c.kind === 'formula' ? 11976000 : c.ex; v.font = { name: FONT, size: 10 }; v.border = box; if (fmt[c.kind] && typeof c.ex === 'number') v.numFmt = fmt[c.kind]; });
    vd.getRow(3).height = 30;

    wb.worksheets.forEach((w) => { w.headerFooter = { oddFooter: '&L&8DGVC — file mẫu import&R&8Trang &P/&N' }; });
    wb.views = [{ activeTab: 0, firstSheet: 0 }];
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await wb.xlsx.writeFile(targetPath);
    return { path: targetPath, sizeBytes: fs.statSync(targetPath).size, sheet: SHEET[importType], firstDataRow: FIRST, columns: cols.map((c) => ({ header: c.h, required: !!c.req })) };
  }

  _validation(c, lists) {
    const warn = (title, error) => ({ showErrorMessage: true, errorStyle: 'warning', errorTitle: title, error });
    const stop = (title, error) => ({ showErrorMessage: true, errorStyle: 'stop', errorTitle: title, error });
    switch (c.kind) {
      case 'date': return { type: 'date', operator: 'between', allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2100, 11, 31))], ...stop('Ngày không hợp lệ', 'Nhập ngày dạng dd/MM/yyyy, vd 18/09/2026') };
      case 'time': return { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 0.99999], ...stop('Giờ không hợp lệ', 'Nhập giờ dạng hh:mm:ss, vd 07:35:12') };
      case 'kg': return { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 200000], ...stop('Khối lượng không hợp lệ', 'Nhập số nguyên kg (0 – 200.000)') };
      case 'liter': return { type: 'decimal', operator: 'between', allowBlank: true, formulae: [-50000, 50000], ...stop('Số lít không hợp lệ', 'Nhập số lít khác 0; dòng bù trừ ghi số âm') };
      case 'money': return { type: 'decimal', operator: 'between', allowBlank: true, formulae: [1, 1000000], ...stop('Đơn giá không hợp lệ', 'Nhập đơn giá dầu CHƯA VAT (đ/lít)') };
      case 'int': return { type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0] };
      case 'route': return { type: 'list', allowBlank: true, formulae: [lists.route], ...stop('Mã tuyến không có trong danh mục', 'Chọn mã tuyến trong danh sách (sheet DANH_MUC). Tuyến mới: thêm trong phần mềm → Danh mục tuyến, rồi tải lại file mẫu') };
      case 'plate': return { type: 'list', allowBlank: true, formulae: [lists.plate], ...warn('Biển số chưa có trong danh mục', 'Xe này chưa có trong danh mục — vẫn nhập được, phần mềm sẽ cảnh báo. Viết dạng 92H-00057') };
      case 'unit': return { type: 'list', allowBlank: true, formulae: [lists.unit], ...warn('Đơn vị chưa có trong danh mục', 'Chọn mã đơn vị trong danh sách') };
      case 'uom': return { type: 'list', allowBlank: true, formulae: [lists.uom] };
      default: return null;
    }
  }
}

module.exports = { ImportTemplates, TEMPLATE_COLUMNS: COLS, TEMPLATE_SHEET: SHEET, TEMPLATE_FIRST_ROW: FIRST };
