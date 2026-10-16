'use strict';
/** Mẫu HTML để in / xuất PDF (A4). Không tải gì từ Internet — font hệ thống Times New Roman như chứng từ Excel hiện tại. */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function vn(x, d = 0) {
  if (x === '' || x === null || x === undefined) return '';
  const neg = x < 0; const [i, f] = Math.abs(x).toFixed(d).split('.');
  return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? `,${f}` : '');
}
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const fmtCell = (v, f) => ({ int: () => vn(v, 0), money: () => vn(v, 0), dec1: () => vn(v, 1), dec2: () => vn(v, 2), date: () => dmy(v) }[f] || (() => esc(v)))();

const BASE_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:"Times New Roman",Times,serif;color:#000;font-size:12.5px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 6px}th{background:#efefef;font-weight:bold}
.r{text-align:right;white-space:nowrap}.nw{white-space:nowrap}.c{text-align:center}.b{font-weight:bold}.i{font-style:italic}
thead{display:table-header-group}tr{page-break-inside:avoid}`;

function bkvc(d) {
  const H = d.header; const S = d.signers; const T = d.totals;
  const draft = H.status === 'NHAP' ? '<div class="wm">BẢN NHÁP — CHƯA XÁC NHẬN</div>' : '';
  const rows = d.lines.map((l) => `<tr><td class="c">${l.seq}</td><td class="nw">${esc(l.plate_no)}</td><td class="r">${vn(l.trip_count)}</td><td class="r">${vn(l.kg)}</td>
<td class="r">${vn(l.ton, 2)}</td><td class="r">${vn(l.unit_price)}</td><td class="r">${vn(l.amount)}</td><td class="r">${vn(l.vat)}</td><td class="r">${vn(l.amount_incl_vat)}</td><td>${esc(l.note)}</td></tr>`).join('\n');
  const acc = (s) => (s.accountant ? `<div><div class="b">Kế toán</div><div class="sp"></div><div class="b">${esc(s.accountant)}</div></div>` : '');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(H.title)} ${esc(H.periodCode)}</title><style>${BASE_CSS}
@page{size:A4 portrait;margin:12mm 10mm 14mm 12mm}
.top{display:flex;justify-content:space-between}.title{text-align:center;margin:14px 0 4px;font-size:18px;font-weight:bold}
.sub{text-align:center;font-style:italic;margin-bottom:10px}.words{margin:8px 0;font-style:italic;font-weight:bold}.date{text-align:right;font-style:italic;margin:6px 30px 6px 0}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;margin-top:6px}.sign .row{display:flex;justify-content:space-around}.sp{height:70px}.sign .b{white-space:nowrap}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:44px;color:rgba(180,69,59,.18);transform:rotate(-20deg);font-weight:bold}
</style></head><body>${draft}
<div class="top"><div><div class="b">${esc(H.carrier.unitName)}</div><div>${esc(H.carrier.address)}</div>${H.carrier.taxCode ? `<div>MST: ${esc(H.carrier.taxCode)}</div>` : ''}</div>
<div class="i" style="text-align:right">${H.contractNo ? `Hợp đồng số: ${esc(H.contractNo)}<br>` : ''}Kỳ: ${esc(H.periodCode)}</div></div>
<div class="title">${esc(H.title)}</div><div class="sub">${esc(H.periodText)}</div>
<table><thead><tr><th>STT</th><th>Biển số xe</th><th>Số chuyến</th><th>Khối lượng (KG)</th><th>Khối lượng (Tấn)</th><th>Đơn giá</th><th>Thành tiền</th><th>VAT (${H.vatPct}%)</th><th>Thành tiền</th><th>Ghi chú</th></tr></thead>
<tbody>${rows}
<tr class="b"><td colspan="2" class="c">TỔNG CỘNG</td><td class="r">${vn(T.trips)}</td><td class="r">${vn(T.kg)}</td><td class="r">${vn(T.ton, 2)}</td><td></td>
<td class="r">${vn(T.amount)}</td><td class="r">${vn(T.vat)}</td><td class="r">${vn(T.total)}</td><td></td></tr></tbody></table>
<div class="words">Bằng chữ: ${esc(d.amountInWords)}</div>
<div class="date">${esc(H.placeDate)}</div>
<div class="sign"><div><div class="b">${esc(S.carrier.unitName)}</div><div class="row"><div><div class="b">${esc(S.carrier.signer.title)}</div><div class="sp"></div><div class="b">${esc(S.carrier.signer.name)}</div></div>${acc(S.carrier)}</div></div>
<div><div class="b">${esc(S.customer.unitName)}</div><div class="row"><div><div class="b">${esc(S.customer.signer.title)}</div><div class="sp"></div><div class="b">${esc(S.customer.signer.name)}</div></div>${acc(S.customer)}</div></div></div>
</body></html>`;
}

const SIGN_CSS = `.date{text-align:right;font-style:italic;margin:8px 30px 4px 0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;page-break-inside:avoid}
.sign .row{display:flex;justify-content:space-around}.sp{height:70px}.sign .b{white-space:nowrap}`;
function signBlock(S, placeDate) {
  const acc = (x) => (x.accountant ? `<div><div class="b">Kế toán</div><div class="sp"></div><div class="b">${esc(x.accountant)}</div></div>` : '');
  const side = (x) => `<div><div class="b">${esc(x.unitName)}</div><div class="row"><div><div class="b">${esc(x.signer.title)}</div><div class="sp"></div><div class="b">${esc(x.signer.name)}</div></div>${acc(x)}</div></div>`;
  return `<div class="keep"><div class="date">${esc(placeDate)}</div><div class="sign">${side(S.carrier)}${side(S.customer)}</div></div>`;
}

/** Bảng phụ in tiếp dưới bảng chính (vd đối chiếu km đồng hồ của nhật trình xe). */
function extraTable(x) {
  const num = (f) => ['int', 'money', 'dec1', 'dec2'].includes(f);
  const tr = (r, b) => `<tr${b ? ' class="b"' : ''}>${x.columns.map((c) => `<td class="${num(c.fmt) ? 'r' : 'nw'}">${r[c.key] === undefined || r[c.key] === null ? '' : num(c.fmt) ? fmtCell(r[c.key], c.fmt) : esc(r[c.key])}</td>`).join('')}</tr>`;
  return `<h2 style="font-size:13px;margin:14px 0 4px">${esc(x.title)}</h2><table><thead><tr>${x.columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead><tbody>${x.rows.map((r) => tr(r)).join('')}${x.totalsRow ? tr(x.totalsRow, true) : ''}</tbody></table>`;
}

function table(d, { landscape = true } = {}) {
  const th = d.columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
  const num = (f) => ['int', 'money', 'dec1', 'dec2'].includes(f);
  const body = d.rows.map((r) => `<tr${r._b ? ' class="b" style="background:#f2f5f8"' : ''}>${d.columns.map((c) => `<td class="${num(c.fmt) ? 'r' : ['date', 'text'].includes(c.fmt) && !['route_name', 'description', 'ticket_nos', 'owner', 'depot'].includes(c.key) ? 'nw' : ''}">${fmtCell(r[c.key], c.fmt)}</td>`).join('')}</tr>`).join('\n');
  const kgIdx = d.columns.findIndex((c) => c.key === 'net_kg');
  const foot = d.totalsRow ? `<tr class="b">${d.columns.map((c) => `<td class="${num(c.fmt) ? 'r' : ''}">${d.totalsRow[c.key] === undefined ? '' : num(c.fmt) ? fmtCell(d.totalsRow[c.key], c.fmt) : esc(d.totalsRow[c.key])}</td>`).join('')}</tr>` : d.totals ? `<tr class="b">${d.columns.map((c, i) => `<td class="r">${i === 0 ? vn(d.totals.trips) : i === 1 ? 'TỔNG CỘNG' : i === kgIdx ? vn(d.totals.kg) : ''}</td>`).join('')}</tr>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${BASE_CSS}
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}body{font-size:10px}th{font-size:9.5px}td,th{padding:2px 4px}
${SIGN_CSS}.keep{page-break-inside:avoid;font-size:12px}h1{font-size:17px;margin:6px 0 2px;text-align:center}.sub{text-align:center;font-style:italic;margin-bottom:8px}</style></head><body>
<div class="b">${esc(d.company ? d.company.unit_name.toUpperCase() : '')}</div><h1>${esc(d.title)}</h1><div class="sub">${esc(d.subtitle)}</div>
<table><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table>${(d.extraTables || []).map((x) => extraTable(x)).join('')}${d.signers ? signBlock(d.signers, d.placeDate) : ''}</body></html>`;
}

// ───────────── MẪU IN CHUYÊN NGHIỆP: bảng tính đơn giá · biên bản giao nhận dầu ─────────────
const DOC_CSS = `
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Times New Roman",Times,serif;color:#111;font-size:13px;line-height:1.38}
@page{size:A4 portrait;margin:14mm 13mm 15mm 17mm}
.page{width:100%;margin:0 auto}@media screen{.page{min-width:180mm}}
.hdr{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.hdr>div:first-child{flex:1 1 auto;min-width:0}.hdr .nat{flex:none}
.hdr .co{font-weight:bold;text-transform:uppercase;font-size:12.5px;white-space:nowrap}.hdr .co + div{font-size:12px}
.hdr .nat{text-align:center}.nat b{display:block;font-size:12.5px}.nat u{font-weight:bold;text-decoration:none;border-bottom:1px solid #111;padding-bottom:1px}
.no{font-size:12px;margin-top:4px}.rule{width:34%;margin:3px auto 0;border-top:1px solid #111}
h1{font-size:19px;letter-spacing:.3px;text-align:center;margin:18px 0 2px;font-weight:bold}
.sub{text-align:center;font-style:italic;margin-bottom:12px}
.info{display:grid;grid-template-columns:32mm 1fr;gap:2px 8px;margin:6px 0 12px;font-size:13px}.info div:nth-child(odd){color:#333}
.party{margin:6px 0}.party .t{font-weight:bold;text-transform:uppercase}.party .l{display:grid;grid-template-columns:28mm 1fr;padding-left:6mm}
table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}
th,td{border:0.6pt solid #444;padding:3px 5px;vertical-align:middle;overflow-wrap:anywhere}
thead th{background:#e8eef3;font-weight:bold;text-align:center;font-size:12px}
thead{display:table-header-group}tr{page-break-inside:avoid}
.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.c{text-align:center}.nw{white-space:nowrap}.b{font-weight:bold}.i{font-style:italic}
tr.sec td{background:#f2f5f8;font-weight:bold;text-transform:none;letter-spacing:.2px}
tr.strong td{font-weight:bold}tr.final td{font-weight:bold;font-size:13.5px;background:#eaf4f5;border-top:1.4pt double #111}
tr.tot td{font-weight:bold;background:#f2f5f8}
.muted{color:#555}.small{font-size:11px}
.result{margin:14px 0 6px;border:1.2pt solid #111;padding:10px 14px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;page-break-inside:avoid}
.result .lb{font-weight:bold;text-transform:uppercase;font-size:13px}.result .v{font-size:22px;font-weight:bold;white-space:nowrap}.result .w{grid-column:1 / -1;font-style:italic}
h2{font-size:13.5px;margin:14px 0 6px;text-transform:uppercase}
p{margin:4px 0;text-align:justify}ul.notes{margin:4px 0 0 0;padding-left:18px;font-size:12px}
.keep{page-break-inside:avoid}
.date{text-align:right;font-style:italic;margin:14px 8mm 4px 0}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:14px;text-align:center;page-break-inside:avoid;margin-top:4px}
.sign .u{font-weight:bold;text-transform:uppercase;font-size:12px;min-height:34px;white-space:nowrap}.sign .row{display:flex;justify-content:space-around;gap:8px}
.sign .ti{font-weight:bold;white-space:nowrap}.sign .hint{font-style:italic;font-size:11px;color:#444;white-space:nowrap}.sign .sp{height:78px}.sign .nm{font-weight:bold;white-space:nowrap}
.wm{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:46px;color:rgba(200,40,40,.13);transform:rotate(-22deg);font-weight:bold;pointer-events:none}
.pb{page-break-before:always}@media screen{body{padding:10px 8px;background:#fff}}`;

function docHead(title, extra = '') { return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}${extra}</style></head><body>`; }
const draftMark = (st) => (st === 'NHAP' ? '<div class="wm">BẢN NHÁP — CHƯA XÁC NHẬN</div>' : '');
function signer(x, role, hint) {
  const acc = x.accountant ? `<div><div class="ti">Kế toán</div><div class="hint">(Ký, ghi rõ họ tên)</div><div class="sp"></div><div class="nm">${esc(x.accountant)}</div></div>` : '';
  return `<div><div class="u">${role ? `${esc(role)}<br>` : ''}${esc(x.unitName)}</div><div class="row">${acc}<div><div class="ti">${esc(x.signer.title)}</div><div class="hint">${esc(hint)}</div><div class="sp"></div><div class="nm">${esc(x.signer.name)}</div></div></div></div>`;
}

/** Bảng tính đơn giá vận chuyển — A4 dọc, 20 chỉ tiêu đánh số, khung kết quả, bằng chữ, ký 2 bên. */
function pricingSheet(d) {
  const C = d.carrier;
  const routes = d.routes.map((rt, ri) => {
    const body = rt.sections.map((sec) => `<tr class="sec"><td colspan="6">${esc(sec.title)}</td></tr>` + sec.rows.map((r) =>
      `<tr class="${r.final ? 'final' : r.strong ? 'strong' : ''}"><td class="c">(${r.no})</td><td>${esc(r.label)}</td><td class="c">${esc(r.how)}</td><td class="small muted">${esc(r.expr)}</td><td class="r">${esc(r.value)}</td><td class="c nw">${esc(r.unit)}</td></tr>`).join('')).join('');
    return `${ri ? '<div class="pb"></div>' : ''}
<div class="info">
  <div>Tuyến vận chuyển:</div><div class="b">${esc(rt.routeCode)} — ${esc(rt.routeName)}</div>
  ${rt.fromPlace || rt.toPlace ? `<div>Điểm đi / điểm đến:</div><div>${esc(rt.fromPlace)} → ${esc(rt.toPlace)}</div>` : ''}
  <div>Bảng giá áp dụng:</div><div>${esc(rt.priceId)}${rt.priceFrom ? `, hiệu lực từ ${dmy(rt.priceFrom)}` : ''}</div>
  <div>Phương thức giá:</div><div>${rt.priceMethod === 'CO_DINH' ? '<b>Đơn giá cố định</b> (không điều chỉnh theo giá dầu)' : 'Theo giá dầu (đơn giá HĐ + chênh lệch dầu)'}</div>
</div>
<table><colgroup><col style="width:8%"><col style="width:33%"><col style="width:17%"><col style="width:21%"><col style="width:12%"><col style="width:9%"></colgroup>
<thead><tr><th>STT</th><th>Chỉ tiêu</th><th>Cách tính</th><th>Diễn giải</th><th>Giá trị</th><th>ĐVT</th></tr></thead><tbody>${body}</tbody></table>
<div class="result"><div class="lb">Đơn giá vận chuyển tuyến ${esc(rt.routeCode)} (chưa VAT)</div><div class="v">${vn(rt.transportPrice)} đ/tấn</div><div class="w">Bằng chữ: ${esc(rt.words)}</div></div>`;
  }).join('');
  const B = d.bkvc;
  return `${docHead(`${d.title} ${d.periodCode}`)}${draftMark(d.status)}<div class="page">
<div class="hdr"><div><div class="co">${esc(C.unitName)}</div><div>${esc(C.address)}</div>${C.taxCode ? `<div>MST: ${esc(C.taxCode)}</div>` : ''}</div>
<div class="nat"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><u>Độc lập – Tự do – Hạnh phúc</u><div class="no">Số: ${esc(d.periodCode)}/BTĐG</div></div></div>
<h1>${esc(d.title)}</h1><div class="sub">${esc(d.periodText)}</div>
<div class="info">
  <div>Căn cứ hợp đồng:</div><div>Hợp đồng vận chuyển số <b>${esc(d.contractNo)}</b></div>
  <div>Bên thuê vận chuyển:</div><div class="b">${esc(d.customer.unitName)}</div>
  <div>Bên vận chuyển:</div><div class="b">${esc(C.unitName)}</div>
  <div>Kỳ tính:</div><div>${esc(d.periodCode)} · lần tính ${d.calcVersion}${d.status === 'NHAP' ? ' · <i>bản nháp</i>' : d.status === 'DA_KHOA' ? ' · đã khóa' : ' · đã xác nhận'}</div>
</div>
${routes}
<h2>D. Giá trị cước theo bảng xác nhận khối lượng</h2>
<table><colgroup><col style="width:72%"><col style="width:28%"></colgroup><tbody>
<tr><td>Tổng khối lượng vận chuyển (tấn)</td><td class="r">${vn(B.ton, 2)}</td></tr>
<tr><td>Thành tiền chưa VAT (đồng)</td><td class="r">${vn(B.amount)}</td></tr>
<tr><td>Thuế GTGT ${esc(B.vatPct)}% (đồng)</td><td class="r">${vn(B.vat)}</td></tr>
<tr class="tot"><td>TỔNG GIÁ TRỊ THANH TOÁN (đồng)</td><td class="r">${vn(B.total)}</td></tr>
<tr><td colspan="2" class="i">Bằng chữ: ${esc(B.words)}</td></tr></tbody></table>
${d.notes.length ? `<ul class="notes">${d.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
<div class="keep"><div class="date">${esc(d.placeDate)}</div>
<div class="sign">${signer(d.signers.carrier, 'Bên vận chuyển', '(Ký, ghi rõ họ tên, đóng dấu)')}${signer(d.signers.customer, 'Bên thuê vận chuyển', '(Ký, ghi rõ họ tên, đóng dấu)')}</div></div>
</div></body></html>`;
}

/** Biên bản giao nhận dầu diesel — mỗi bên giao 1 biên bản (ngắt trang), A4 dọc. */
function fuelHandover(d) {
  const party = (label, x) => `<div class="party"><div class="t">${esc(label)}: ${esc(x.unitName)}</div>
<div class="l"><span>Địa chỉ:</span><span>${esc(x.address)}</span>${x.taxCode ? `<span>Mã số thuế:</span><span>${esc(x.taxCode)}</span>` : ''}<span>Đại diện:</span><span><b>${esc(x.signer.name)}</b> — Chức vụ: ${esc(x.signer.title)}</span></div></div>`;
  const docs = d.docs.map((doc, i) => {
    const T = doc.totals;
    const rows = doc.rows.map((r) => `<tr><td class="c">${r.seq}</td><td class="c nw">${dmy(r.date)}</td><td class="c nw">${esc(r.plateNo)}</td><td class="c">${esc(r.routeCode)}</td><td class="c">${esc(r.uom)}</td><td class="r">${vn(r.qty, Number.isInteger(r.qty) ? 0 : 2)}</td><td class="r">${vn(r.price)}</td><td class="r">${vn(r.amount)}</td><td class="c small">${esc(r.note)}</td></tr>`).join('');
    const plates = doc.byPlate.map((o) => `<tr><td class="c">${o.seq}</td><td class="c nw">${esc(o.plateNo)}</td><td class="c">${o.times}</td><td class="r">${vn(o.qty, Number.isInteger(o.qty) ? 0 : 2)}</td><td class="r">${vn(o.amount)}</td></tr>`).join('');
    return `${i ? '<div class="pb"></div>' : ''}
<div class="hdr"><div><div class="co">${esc(doc.receiver.unitName)}</div><div class="no">Số: ${esc(doc.no)}</div></div>
<div class="nat"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><u>Độc lập – Tự do – Hạnh phúc</u></div></div>
<h1>${esc(d.title)}</h1><div class="sub">(Dầu cấp cho xe vận chuyển dăm gỗ — kỳ vận chuyển từ ngày ${dmy(d.dateFrom)} đến ngày ${dmy(d.dateTo)})</div>
<p>– Căn cứ Hợp đồng vận chuyển số <b>${esc(d.contractNo)}</b>${d.contractFrom ? ` ngày ${dmy(d.contractFrom)}` : ''} giữa ${esc(d.customer.unitName)} và ${esc(d.carrier.unitName)};</p>
<p>– Căn cứ số lượng dầu diesel thực tế đã cấp cho các xe vận chuyển từ ngày ${dmy(doc.from)} đến ngày ${dmy(doc.to)}.</p>
<p>Hôm nay, ${esc(d.dateText)}, tại ${esc(d.signPlace || '……………')}, chúng tôi gồm:</p>
${party('BÊN GIAO (Bên A)', doc.giver)}${party('BÊN NHẬN (Bên B)', doc.receiver)}
<p>Hai bên cùng xác nhận số lượng dầu diesel Bên A đã giao cho các xe vận chuyển của Bên B như sau:</p>
<h2>I. Chi tiết các lần giao nhận</h2>
<table><colgroup><col style="width:6%"><col style="width:12%"><col style="width:13%"><col style="width:10%"><col style="width:7%"><col style="width:12%"><col style="width:13%"><col style="width:15%"><col style="width:12%"></colgroup>
<thead><tr><th>STT</th><th>Ngày nhận</th><th>Biển số xe</th><th>Tuyến</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá chưa VAT (đ/lít)</th><th>Thành tiền chưa VAT (đ)</th><th>Ghi chú</th></tr></thead>
<tbody>${rows}<tr class="tot"><td colspan="5" class="c">TỔNG CỘNG (${T.times} lần nhận)</td><td class="r">${vn(T.qty, Number.isInteger(T.qty) ? 0 : 2)}</td><td></td><td class="r">${vn(T.amount)}</td><td></td></tr></tbody></table>
<h2>II. Tổng hợp theo xe</h2>
<table><colgroup><col style="width:8%"><col style="width:28%"><col style="width:18%"><col style="width:22%"><col style="width:24%"></colgroup>
<thead><tr><th>STT</th><th>Biển số xe</th><th>Số lần nhận</th><th>Số lượng (lít)</th><th>Thành tiền chưa VAT (đ)</th></tr></thead>
<tbody>${plates}<tr class="tot"><td colspan="2" class="c">TỔNG CỘNG (${T.vehicles} xe)</td><td class="c">${T.times}</td><td class="r">${vn(T.qty, Number.isInteger(T.qty) ? 0 : 2)}</td><td class="r">${vn(T.amount)}</td></tr></tbody></table>
<h2>III. Kết luận</h2>
<p>1. Tổng số lượng dầu diesel Bên A đã giao, Bên B đã nhận đủ: <b>${vn(T.qty, Number.isInteger(T.qty) ? 0 : 2)} lít</b> (bằng chữ: <i>${esc(doc.qtyWords)}</i>).</p>
<p>2. Đơn giá dầu bình quân (chưa VAT, ${d.fuelPriceMethod === 'WEIGHTED' ? 'bình quân gia quyền theo lít' : 'trung bình cộng các lần nhận'}): <b>${vn(T.avgPrice, 2)} đ/lít</b>.</p>
<p>3. Số liệu trên là căn cứ tính chênh lệch nhiên liệu trong Bảng tính đơn giá vận chuyển kỳ <b>${esc(d.periodCode)}</b>. Biên bản được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
<div class="keep"><div class="sign" style="margin-top:14px">${signer(doc.giver, 'Đại diện bên giao', '(Ký, ghi rõ họ tên, đóng dấu)')}${signer(doc.receiver, 'Đại diện bên nhận', '(Ký, ghi rõ họ tên, đóng dấu)')}</div></div>`;
  }).join('');
  return `${docHead(`${d.title} ${d.periodCode}`)}${draftMark(d.status)}<div class="page">${docs}</div></body></html>`;
}

/** Căn cứ tính đơn giá ký hợp đồng — A4 ngang: bảng tính cho mọi tuyến + cách tính + ký. */
function contractBasis(d) {
  const C = d.carrier; const dig = d.rounding.contractDigits;
  const rt = { '-3': 'hàng nghìn', '-2': 'hàng trăm', 0: 'đồng' }[String(dig)] || `${dig}`;
  const head = ['STT', 'Mã tuyến', 'Tuyến vận chuyển', 'Cự ly chuyến (km)', 'ĐVT', 'Đơn giá cước (đ)<br>(1)', 'KL TB / chuyến<br>(2)', 'ĐG 1 chuyến (đ)<br>(3)=(1)×(2)',
    'Định mức (lít/km)<br>(4)', 'Dầu / chuyến (lít)<br>(5)=CL×(4)', 'ĐG dầu chưa VAT (đ/lít)<br>(6)', 'Tiền dầu / chuyến (đ)<br>(7)=(5)×(6)', 'Tỷ lệ dầu<br>(8)=(7)/(3)',
    'ĐGVC chưa dầu (đ)<br>(9)=[(3)−(7)]/KL_TB', `ĐƠN GIÁ HĐ (đ)<br>(10)=(9) làm tròn ${rt}`, 'Bảng giá'];
  const body = d.rows.map((r) => (r.fixed ? `<tr><td class="c">${r.stt}</td><td class="c nw">${esc(r.routeCode)}</td><td>${esc(r.routeName)}</td><td class="r">${vn(r.tripDistanceKm)}</td><td class="c">${esc(r.uom)}</td>
<td colspan="9" class="c muted"><i>Đơn giá cố định — không tính theo giá dầu</i></td><td class="r b hl">${vn(r.contractPrice)}</td><td class="c" style="font-size:9px">${esc(r.priceId)}<br>từ ${dmy(r.effectiveFrom)}${r.source === 'Giá riêng hợp đồng' ? '<br><i>giá riêng HĐ</i>' : ''}</td></tr>` : `<tr><td class="c">${r.stt}</td><td class="c nw">${esc(r.routeCode)}</td><td>${esc(r.routeName)}</td><td class="r">${vn(r.tripDistanceKm)}</td><td class="c">${esc(r.uom)}</td>
<td class="r">${vn(r.newPrice)}</td><td class="r">${r.uom === 'M3' ? `${vn(r.avgVolumeM3, 2)} m³` : vn(r.avgLoadTon)}</td><td class="r">${vn(r.tripPrice)}</td><td class="r">${vn(r.fuelNormLPerKm, 1)}</td>
<td class="r">${vn(r.fuelPerTrip, 1)}</td><td class="r">${vn(r.fuelPriceCatalog)}</td><td class="r">${vn(r.fuelCostPerTrip)}</td><td class="r">${vn(r.fuelCostRatio * 100, 2)}%</td>
<td class="r">${vn(r.priceNoDiesel, 2)}</td><td class="r b hl">${vn(r.contractPrice)}</td><td class="c" style="font-size:9px">${esc(r.priceId)}<br>từ ${dmy(r.effectiveFrom)}${r.source === 'Giá riêng hợp đồng' ? '<br><i>giá riêng HĐ</i>' : ''}</td></tr>`)).join('');
  const sign = d.signers ? `<div class="keep"><div class="date">${esc(d.placeDate)}</div><div class="sign">${signer(d.signers.carrier, 'Bên vận chuyển', '(Ký, ghi rõ họ tên, đóng dấu)')}${signer(d.signers.customer, 'Bên thuê vận chuyển', '(Ký, ghi rõ họ tên, đóng dấu)')}</div></div>`
    : `<div class="keep"><div class="date">${esc(d.placeDate.replace(/^, /, ''))}</div><div class="sign"><div></div><div><div class="u">NGƯỜI LẬP</div><div class="hint">(Ký, ghi rõ họ tên)</div><div class="sp"></div></div></div></div>`;
  return `${docHead(d.title, '@page{size:A4 landscape;margin:11mm 10mm 12mm 12mm}table{font-size:10.5px}thead th{font-size:10px}td,th{padding:3px 4px}td.hl{background:#eaf4f5;font-size:11.5px}.mono{font-family:Consolas,monospace;font-size:9.5px}')}<div class="page">
<div class="hdr"><div><div class="co">${esc(C.unitName)}</div><div>${esc(C.address || '')}</div>${C.taxCode ? `<div>MST: ${esc(C.taxCode)}</div>` : ''}</div>
<div class="nat"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><u>Độc lập – Tự do – Hạnh phúc</u></div></div>
<h1>${esc(d.title)}</h1><div class="sub">(Áp dụng từ ngày ${dmy(d.asOf)}${d.contract ? ` — kèm theo Hợp đồng vận chuyển số ${esc(d.contract.no)}` : ' — bảng giá chung'})</div>
${d.customer ? `<div class="info"><div>Bên thuê vận chuyển:</div><div class="b">${esc(d.customer.unitName)}</div><div>Bên vận chuyển:</div><div class="b">${esc(C.unitName)}</div></div>` : ''}
<table><colgroup>${[3, 5.5, 13, 5, 4, 6.5, 5.5, 7, 5, 5.5, 6, 7, 5, 7.5, 7.5, 7].map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
<h2>Cách tính</h2>
<p>– Đơn giá cước (1) đã gồm tiền dầu theo định mức, chưa VAT. Đơn giá hợp đồng (10) là phần <b>chưa gồm nhiên liệu</b>: (10) = làm tròn ${rt} của [(1)×(2) − CL×(4)×(6)] / KL_TB.</p>
<p>– Hằng kỳ: Đơn giá vận chuyển = (10) + (Dầu định mức − Dầu thực nhận) × Đơn giá dầu thực tế / Tổng khối lượng, làm tròn đến hàng trăm.</p>
${d.rows.some((r) => r.fixed) ? '<p>– Tuyến ghi <i>"Đơn giá cố định"</i>: (10) là đơn giá vận chuyển cố định đ/tấn ghi trong bảng giá — hằng kỳ dùng nguyên đơn giá này, không nhận dầu, không tính chênh lệch dầu.</p>' : ''}
<p>– Làm tròn: ${d.rounding.mode === 'HALF_EVEN' ? 'kiểu ngân hàng (…500 làm tròn về số chẵn)' : 'làm tròn lên khi ≥ …500'}${d.rounding.int64 ? '; Cự ly chuyến, Đơn giá cước, ĐG dầu, KL TB được làm tròn về số nguyên trước khi tính' : ''}.</p>
${sign}</div></body></html>`;
}

module.exports = { bkvc, table, vn, pricingSheet, fuelHandover, contractBasis };
