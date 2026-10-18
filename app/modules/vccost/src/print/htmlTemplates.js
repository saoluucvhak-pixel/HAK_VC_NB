'use strict';
/** Mẫu in HTML → PDF (A4) cho Bảng kê và Báo cáo. Font hệ thống (Arial/Times) hỗ trợ tiếng Việt. */
const { dmy } = require('./documents');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (n, d = 0) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '' : Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const money = (n) => nf(n, 0);
const tan = (n) => nf(n, 3);

const CSS = `
@page { size: A4 portrait; margin: 14mm 13mm 15mm 17mm; } html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { box-sizing: border-box; }
body { font-family: 'Times New Roman', Times, serif; font-size: 13px; line-height: 1.38; color: #111; margin: 0; }
h1 { text-align: center; font-size: 19px; letter-spacing: .3px; margin: 4mm 0 1mm; }
.center { text-align: center; } .right { text-align: right; } .muted { color: #666; font-size: 9pt; }
.party { margin: 1mm 0; } .party b { font-size: 10.5pt; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
th, td { border: 0.6pt solid #444; padding: 3px 5px; vertical-align: middle; }
th { background: #e8eef3; text-align: center; font-weight: bold; }
td.n { text-align: right; white-space: nowrap; } table { font-size: 12px; } td.c { text-align: center; }
tr.tot td { font-weight: bold; background: #f2f5f8; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
.sum { margin-top: 3mm; width: 100%; } .sum td { border: none; padding: 0.6mm 1.8mm; } .sum td.l { text-align: right; } .sum td.v { text-align: right; width: 38mm; border: 0.6pt solid #000; }
.words { margin-top: 3mm; font-style: italic; font-weight: bold; }
.note { margin-top: 2mm; font-size: 9pt; font-style: italic; }
.warn { margin-top: 2mm; font-weight: bold; color: #b4453b; }
.sign { display: flex; margin-top: 8mm; page-break-inside: avoid; } .sign > div { flex: 1; text-align: center; }
.sign .t { font-weight: bold; } .sign .s { font-style: italic; font-size: 9pt; } .sign .gap { height: 24mm; } .sign .nm { font-weight: bold; }
.date { text-align: right; margin-top: 6mm; font-style: italic; }
.pb { page-break-before: always; }
.qh { text-align: center; font-size: 11pt; margin-bottom: 3mm; } .qh .ln { width: 38mm; border-top: 0.8pt solid #000; margin: 1mm auto 0; }
.sign .sg { flex: 1; } .sign .two { display: flex; margin-top: 1mm; } .sign .two > div { flex: 1; text-align: center; } .sign .sg > .t { font-size: 10pt; border-bottom: 0.4pt solid #444; padding-bottom: 1mm; } .sign .acc { margin-top: 2mm; font-size: 10pt; } tr.diff td { background: #fbeceb; }
h2 { font-size: 12pt; margin: 0 0 1mm; }
`;

function wrap(title, body, landscape = false) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${landscape ? '@page { size: A4 landscape; }' : ''}</style></head><body>${body}</body></html>`;
}
const party = (tag, p) => `<div class="party"><b>${tag}: ${esc(p.ten) || '………………………………………………'}</b><br>&nbsp;&nbsp;&nbsp;Mã số thuế: ${esc(p.ma_so_thue) || '……………………'} &nbsp; Địa chỉ: ${esc(p.dia_chi) || '………………………………………………'}</div>`;
const sign = (l, r) => `<div class="sign"><div><div class="t">${esc(l.title)}</div><div class="s">(Ký, ghi rõ họ tên, đóng dấu)</div><div class="gap"></div><div class="nm">${esc(l.name)}</div></div>
  <div><div class="t">${esc(r.title)}</div><div class="s">(Ký, ghi rõ họ tên, đóng dấu)</div><div class="gap"></div><div class="nm">${esc(r.name)}</div></div></div>`;

const KET = { KHOP: 'Khớp', LECH: 'Lệch', CHI_BEN_A: 'Chỉ Bên A có', CHI_BEN_B: 'Chỉ Bên B có' };
const dots = (v, n = 20) => (v ? esc(v) : '.'.repeat(n));
const dateLine = (b) => `${esc(b.noi_ky || '………………')}, ngày ……… tháng ……… năm ………`;
/** Chữ ký 2 bên theo mẫu DGVC: tên công ty (in hoa) · chức danh · đại diện · kế toán. */
const signParties = (A, B) => {
  const grp = (p, tag) => `<div class="sg"><div class="t">${esc(tag)} – ${esc((p.ten || '').toUpperCase())}</div>
    <div class="two"><div><div class="t">KẾ TOÁN</div><div class="s">(Ký, ghi rõ họ tên)</div><div class="gap"></div><div class="nm">${esc(p.ke_toan || p.nguoi_lap || '')}</div></div>
    <div><div class="t">${esc((p.chuc_vu || 'Giám đốc').toUpperCase())}</div><div class="s">(Ký, ghi rõ họ tên, đóng dấu)</div><div class="gap"></div><div class="nm">${esc(p.dai_dien || '')}</div></div></div></div>`;
  return `<div class="sign">${grp(A, 'BÊN A')}${grp(B, 'BÊN B')}</div>`;
};
const partyBlock = (tag, p) => `<div class="party"><b>${tag}: ${esc((p.ten || '').toUpperCase()) || dots('', 40)}</b>
  <div>Địa chỉ: ${dots(p.dia_chi, 40)}</div><div>Mã số thuế: ${dots(p.ma_so_thue, 14)}${p.dien_thoai ? ` &nbsp;·&nbsp; Điện thoại: ${esc(p.dien_thoai)}` : ''}${p.email ? ` &nbsp;·&nbsp; Email: ${esc(p.email)}` : ''}</div>
  <div>Đại diện: ${esc([p.xung_ho, p.dai_dien].filter(Boolean).join(' ')) || dots('', 20)} &nbsp;·&nbsp; Chức vụ: ${esc(p.chuc_vu || 'Giám đốc')}${p.so_tai_khoan ? ` &nbsp;·&nbsp; TK: ${esc(p.so_tai_khoan)}${p.ngan_hang ? ` – ${esc(p.ngan_hang)}` : ''}` : ''}</div></div>`;
const national = `<div class="qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập – Tự do – Hạnh phúc</b><div class="ln"></div></div>`;

function reconHtml(doc) {
  const { recon, benA, benB } = doc;
  const rows = recon.rows.map((r, i) => `<tr class="${r.ket_luan === 'KHOP' ? '' : 'diff'}"><td class="c">${i + 1}</td><td>${esc(r.bien_so)}</td><td class="c">${nf(r.a_chuyen)}</td><td class="n">${nf(r.a_kg)}</td><td class="c">${nf(r.b_chuyen)}</td><td class="n">${nf(r.b_kg)}</td><td class="n">${nf(r.chenh_kg)}</td><td class="n">${r.chenh_pct === null ? '' : nf(r.chenh_pct, 2) + '%'}</td><td class="c">${KET[r.ket_luan]}</td></tr>`).join('');
  const t = recon.tot, c = recon.counts;
  return `<div class="pb"></div>${national}<h1>BIÊN BẢN ĐỐI CHIẾU KHỐI LƯỢNG</h1><div class="center">${esc(doc.period)}</div>
    <div class="center muted">Lô đối chiếu: ${esc(recon.batch.ten)}${recon.batch.created_at ? ` · ngày chạy ${esc(dmy(recon.batch.created_at.slice(0, 10)))}` : ''}</div>
    <div style="margin-top:3mm"><b>Bên A</b> (số liệu trạm cân của ${esc(benA.ten)}) và <b>Bên B</b> (số liệu của ${esc(benB.ten)}) cùng đối chiếu khối lượng hàng vận chuyển theo từng xe như sau:</div>
    <table><thead><tr><th rowspan="2" style="width:9mm">STT</th><th rowspan="2">Biển số</th><th colspan="2">Bên A (trạm cân)</th><th colspan="2">Bên B (đối tác)</th><th colspan="2">Chênh lệch (B − A)</th><th rowspan="2" style="width:24mm">Kết luận</th></tr>
      <tr><th style="width:15mm">Chuyến</th><th style="width:24mm">KL (kg)</th><th style="width:15mm">Chuyến</th><th style="width:24mm">KL (kg)</th><th style="width:24mm">kg</th><th style="width:16mm">%</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td></td><td>CỘNG</td><td class="c">${nf(t.a_chuyen)}</td><td class="n">${nf(t.a_kg)}</td><td class="c">${nf(t.b_chuyen)}</td><td class="n">${nf(t.b_kg)}</td><td class="n">${nf(t.chenh_kg)}</td><td class="n">${t.chenh_pct === null ? '' : nf(t.chenh_pct, 2) + '%'}</td><td></td></tr></tbody></table>
    <div class="note">Tổng ${recon.rows.length} xe: ${c.KHOP} xe khớp · ${c.LECH} xe lệch · ${c.CHI_BEN_A} xe chỉ Bên A có · ${c.CHI_BEN_B} xe chỉ Bên B có. Khối lượng chênh lệch (B − A) = ${nf(t.chenh_kg)} kg (${nf(t.chenh_kg / 1000, 3)} tấn).
    Chi phí vận chuyển thanh toán theo khối lượng cân của Bên A; các xe lệch hai bên cần rà soát lại phiếu cân trước khi ký.</div>
    <div class="words">Hai bên thống nhất kết quả đối chiếu: &nbsp;☐ Khớp toàn bộ &nbsp;&nbsp; ☐ Có chênh lệch, xử lý: ………………………………………………</div>
    <div class="date">${dateLine(benB)}</div>${signParties(benA, benB)}`;
}

function statementHtml(doc) {
  const { st, benA, benB } = doc;
  const kg = (l) => Math.round(Number(l.tong_tan) * 1000);
  const lines = st.lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.tuyen_ten)}</td><td class="c">${nf(l.so_xe)}</td><td class="c">${nf(l.so_chuyen)}</td><td class="n">${nf(kg(l))}</td><td class="n">${tan(l.tong_tan)}</td><td class="n">${money(l.don_gia)}</td><td class="n">${money(l.thanh_tien)}</td></tr>`).join('');
  const vat = st.vatLines.map((v) => `<tr><td class="l">Thuế GTGT ${v.vat_percent}% (trên ${money(v.thanh_tien)})</td><td class="v">${money(v.tien_vat)}</td></tr>`).join('');
  const p1 = `${national}<h1>${esc(doc.tieu_de || 'BẢNG KÊ CHI PHÍ VẬN CHUYỂN')}</h1><div class="center">${esc(doc.period)}</div>
    <div class="center">Số: ………… / BK-${esc(benB.ma)}${doc.thang ? `-${esc(doc.thang.replace('/', ''))}` : ''}</div>
    ${doc.contract ? `<div class="center"><i>${esc(doc.contract)}</i></div>` : ''}
    <div style="margin-top:4mm">${partyBlock('BÊN A (Bên thuê vận chuyển)', benA)}${partyBlock('BÊN B (Bên vận chuyển)', benB)}
    ${doc.extra ? `<div class="muted">Phạm vi lọc: ${esc(doc.extra)}</div>` : ''}</div>
    <table><thead><tr><th style="width:9mm">STT</th><th>Tuyến vận chuyển</th><th style="width:12mm">Số xe</th><th style="width:15mm">Số chuyến</th><th style="width:23mm">KL (kg)</th><th style="width:22mm">KL (tấn)</th><th style="width:22mm">Đơn giá (đ/tấn)</th><th style="width:28mm">Thành tiền (đ)</th></tr></thead>
    <tbody>${lines}<tr class="tot"><td></td><td>CỘNG</td><td></td><td class="c">${nf(st.so_chuyen)}</td><td class="n">${nf(Math.round(st.tong_tan * 1000))}</td><td class="n">${tan(st.tong_tan)}</td><td></td><td class="n">${money(st.tien_truoc_vat)}</td></tr></tbody></table>
    <table class="sum"><tr><td class="l"><b>Cộng tiền hàng (chưa VAT)</b></td><td class="v"><b>${money(st.tien_truoc_vat)}</b></td></tr>${vat}<tr><td class="l"><b>TỔNG CỘNG THANH TOÁN</b></td><td class="v"><b>${money(st.tong_tien)}</b></td></tr></table>
    <div class="words">Bằng chữ: ${esc(doc.bangChu)}</div>
    <div class="note">Ghi chú: thành tiền từng dòng đơn giá làm tròn đến đồng; thuế GTGT tính một lần trên tổng thành tiền cùng thuế suất, làm tròn đến đồng. Cước tính theo khối lượng cân thực tế. Chi tiết theo xe và phiếu cân xem Phụ lục.</div>
    ${st.so_chuyen_chua_tinh_gia ? `<div class="warn">Lưu ý: còn ${st.so_chuyen_chua_tinh_gia} chuyến chưa tính được giá, chưa nằm trong bảng kê này.</div>` : ''}
    <div class="date">${dateLine(benB)}</div>${signParties(benA, benB)}`;
  const vrows = st.vehicles.map((v, i) => `<tr><td class="c">${i + 1}</td><td>${esc(v.bien_so)}</td><td>${esc(v.tuyen)}</td><td class="c">${nf(v.so_chuyen)}</td><td class="n">${nf(Math.round(v.tong_tan * 1000))}</td><td class="n">${tan(v.tong_tan)}</td><td class="n">${typeof v.don_gia === 'number' ? money(v.don_gia) : esc(v.don_gia)}</td><td class="n">${money(v.thanh_tien)}</td></tr>`).join('');
  const vs = (k) => st.vehicles.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const pv = `<div class="pb"></div><h2>PHỤ LỤC 1 — BẢNG KÊ VẬN CHUYỂN THEO XE (${esc(benB.ma)})</h2><div class="muted">${esc(doc.period)} · số phân bổ theo xe, chưa làm tròn (tham khảo)</div>
    <table><thead><tr><th>STT</th><th>Biển số</th><th>Tuyến</th><th>Số chuyến</th><th>KL (kg)</th><th>KL (tấn)</th><th>Đơn giá</th><th>Thành tiền (đ)</th></tr></thead>
    <tbody>${vrows}<tr class="tot"><td></td><td>CỘNG</td><td></td><td class="c">${nf(vs('so_chuyen'))}</td><td class="n">${nf(Math.round(vs('tong_tan') * 1000))}</td><td class="n">${tan(vs('tong_tan'))}</td><td></td><td class="n">${money(vs('thanh_tien'))}</td></tr></tbody></table>`;
  const kgSum = doc.tickets.reduce((a, x) => a + (Number(x.kl_hang_kg) || 0), 0);
  const trs = doc.tickets.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.so_phieu)}</td><td class="c">${esc(dmy((x.ngay_gio_can_1 || '').slice(0, 10)))} ${esc((x.ngay_gio_can_1 || '').slice(11, 16))}</td><td>${esc(x.bien_so)}</td><td>${esc(x.noi_xuat || x.noi_xuat_goc)}</td><td>${esc(x.noi_den)}</td><td class="n">${nf(x.kl_hang_kg)}</td><td class="n">${tan(x.kl_hang_tan)}</td><td class="n">${money(x.don_gia)}</td></tr>`).join('');
  const p3 = `<div class="pb"></div><h2>PHỤ LỤC ${doc.recon ? 3 : 2} — DANH SÁCH PHIẾU CÂN (${esc(benB.ma)})</h2><div class="muted">${esc(doc.period)} · ${doc.tickets.length} phiếu nằm trong bảng kê</div>
    <table><thead><tr><th>STT</th><th>Số phiếu</th><th>Ngày giờ cân</th><th>Biển số</th><th>Nơi xuất</th><th>Nơi đến</th><th>KL (kg)</th><th>KL (tấn)</th><th>Đơn giá</th></tr></thead>
    <tbody>${trs}<tr class="tot"><td></td><td>CỘNG</td><td></td><td></td><td></td><td class="c">${doc.tickets.length} phiếu</td><td class="n">${nf(kgSum)}</td><td class="n">${tan(kgSum / 1000)}</td><td></td></tr></tbody></table>`;
  return wrap(`Bảng kê ${benB.ma}`, p1 + pv + (doc.recon ? reconHtml(doc).replace('<div class="pb"></div>', '<div class="pb"></div>') : '') + p3);
}

function reportHtml(doc) {
  const { def, rows, tot } = doc;
  const head = ['STT', def.key, def.extra.header, 'Số chuyến', 'KL cân (kg)', 'KL cân (tấn)', ...(def.dot ? ['KL giám định (tấn)', 'Chênh (GĐ − cân)'] : []), 'Đơn giá (đ/tấn)', 'Thành tiền (đ)', 'VAT (đ)', 'Tổng tiền (đ)'];
  const tr = rows.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.label)}</td><td class="${def.extra.int ? 'c' : ''}">${esc(x[def.extra.key])}</td><td class="c">${nf(x.so_chuyen)}</td><td class="n">${nf(x.tong_kg)}</td><td class="n">${tan(x.tong_tan)}</td>
    ${def.dot ? `<td class="n">${tan(x.kl_giam_dinh_tan)}</td><td class="n">${tan(x.chenh_giam_dinh_tan)}</td>` : ''}<td class="n">${esc((x.don_gia || []).map((g) => money(g)).join(' / '))}</td><td class="n">${money(x.tien_truoc_vat)}</td><td class="n">${money(x.tien_vat)}</td><td class="n">${money(x.tong_tien)}</td></tr>`).join('');
  const body = `<h1>${esc(doc.title)}</h1>${doc.benA.ten ? `<div class="center"><b>${esc(doc.benA.ten)}</b></div>` : ''}
    <div class="center muted">${doc.filters.length ? esc(doc.filters.map(([k, v]) => `${k}: ${v}`).join(' · ')) : 'Phạm vi: toàn bộ dữ liệu'}</div>
    <div class="center muted">Số tiền theo dòng là số phân bổ chưa làm tròn (tham khảo); số thanh toán chính thức theo "Bảng kê thanh toán".</div>
    ${doc.chuaTinh ? `<div class="warn center">Lưu ý: còn ${doc.chuaTinh} chuyến chưa tính được giá, chưa nằm trong số liệu tiền.</div>` : ''}
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${tr}
    <tr class="tot"><td></td><td>CỘNG</td><td></td><td class="c">${nf(tot.so_chuyen)}</td><td class="n">${nf(tot.tong_kg)}</td><td class="n">${tan(tot.tong_tan)}</td>${def.dot ? '<td></td><td></td>' : ''}<td></td><td class="n">${money(tot.tien_truoc_vat)}</td><td class="n">${money(tot.tien_vat)}</td><td class="n">${money(tot.tong_tien)}</td></tr></tbody></table>
    ${sign({ title: 'NGƯỜI LẬP BIỂU', name: doc.benA.nguoi_lap || '' }, { title: 'KẾ TOÁN TRƯỞNG / PHỤ TRÁCH', name: '' })}`;
  return wrap(doc.title, body, true);
}

module.exports = { statementHtml, reportHtml, reconHtml, wrap, esc, nf, money, tan, signParties, partyBlock, national, dateLine, dots };
