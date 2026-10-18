'use strict';
/** Mẫu PDF (HTML→PDF) cho 3 biểu mẫu in/ký: Tổng hợp xuất hàng tàu · Chi tiết vận chuyển · Bảng tính đơn giá. */
const { wrap, esc, nf, money, tan, signParties, partyBlock, national, dateLine } = require('./htmlTemplates');
const { dmy } = require('./documents');

const kg = (n) => nf(n);
const EXTRA = `.sec { page-break-after: always; } .sec:last-child { page-break-after: auto; } table.d td, table.d th { font-size: 11px; padding: 2px 4px; } table.p td, table.p th { font-size: 7.5pt; padding: 0.8mm 0.9mm; }
tr.sub td { background: #f1efe9; font-weight: bold; } .parties{display:flex;gap:8mm}.parties .party{flex:1;font-size:10pt} .sign .gap{height:15mm} .sign{margin-top:4mm} .date{margin-top:3mm} .t2 { text-align:center; font-weight:bold; font-size:13pt; margin: 2mm 0; }`;
const wrapL = (title, body) => wrap(title, `<style>${EXTRA}</style>${body}`);

/** Đầu chứng từ kiểu PRICING_SHEET: Bên A (trái) · quốc hiệu + Số (phải) · tiêu đề · khối thông tin có nhãn. */
function docHead(benA, so, titleLines, sub, infos) {
  return `<div class="center" style="font-size:11pt"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập – Tự do – Hạnh phúc</b></div>
    <div style="margin-top:4mm">${titleLines.map((l, i) => `<div class="t2"${i ? ' style="font-size:12pt;margin:0"' : ' style="font-size:14pt"'}>${esc(l)}</div>`).join('')}</div>${sub ? `<div class="center"><i>${esc(sub)}</i></div>` : ''}<div class="center"><i>Số: ${esc(so)}</i></div>
    <table class="inf">${infos.filter(Boolean).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`;
}
const INF = `table.inf{border:0;margin-top:3mm} table.inf td{border:0;padding:0.3mm 1mm;font-size:10.5pt;vertical-align:top} table.inf td.k{width:42mm;color:#333}`;
const contractText = (b) => (b && b.so_hop_dong ? `Hợp đồng vận chuyển số <b>${esc(b.so_hop_dong)}</b>${b.ngay_hop_dong ? ` ngày ${esc(dmy(b.ngay_hop_dong))}` : ''}` : '');
const partyInfos = (A, B) => [contractText(B) && ['Căn cứ hợp đồng:', contractText(B)], ['Bên thuê vận chuyển:', `<b>${esc((A.ten || '').toUpperCase())}</b>`], ['Bên vận chuyển:', `<b>${esc((B.ten || '').toUpperCase())}</b>`]];
const wrapP = (title, body) => wrap(title, `<style>${EXTRA}${INF}</style>${body}`);

function tauSummaryHtml(doc) {
  const secs = doc.sections.map((s) => {
    const rows = s.rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="c">${esc(r.bien_so)}</td><td class="c">${nf(r.so_chuyen)}</td><td class="n">${kg(r.kg)}</td><td class="n">${tan(r.tan)}</td><td class="n">${money(r.don_gia)}</td><td class="n">${money(r.tien)}</td><td class="n">${money(r.vat)}</td><td class="n">${money(r.tong)}</td></tr>`).join('');
    const t = s.tot;
    return `<div class="sec">${docHead(doc.benA, `………… / TH-${s.benB.ma}`, s.titleLines.slice(0, 2), s.titleLines[2], [...partyInfos(doc.benA, s.benB), ['Tuyến vận chuyển:', `<b>${esc(s.noi_xuat)} → ${esc(s.noi_den)}</b>`]])}
      <table class="d"><thead><tr><th style="width:9mm">STT</th><th>Số xe</th><th style="width:15mm">Số chuyến</th><th>Khối lượng (KG)</th><th>Khối lượng (Tấn)</th><th style="width:19mm">Đơn giá</th><th>Thành tiền</th><th style="width:21mm">VAT</th><th>Tổng tiền</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td colspan="2">Tổng cộng (${t.xe} xe)</td><td class="c">${nf(t.so_chuyen)}</td><td class="n">${kg(t.kg)}</td><td class="n">${tan(t.tan)}</td><td></td><td class="n">${money(t.tien)}</td><td class="n">${money(t.vat)}</td><td class="n">${money(t.tong)}</td></tr></tbody></table>
      <div class="words">Bằng chữ: ${esc(s.bangChu)}</div><div class="note">Số liệu theo xe là số phân bổ theo phiếu cân; số thanh toán chính thức theo Bảng kê chi phí vận chuyển.</div>
      <div class="date">${dateLine(s.benB)}</div>${signParties(doc.benA, s.benB)}</div>`;
  }).join('');
  return wrapP('Tổng hợp xuất hàng tàu', secs || '<p>Không có phiếu đã tính giá theo bộ lọc.</p>');
}

function detailHtml(doc) {
  const dt = (iso) => (iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '');
  const secs = doc.sections.map((s) => {
    let n = 0; const body = s.xes.map((x) => x.rows.map((t) => { n++; return `<tr><td class="c">${n}</td><td>${esc(t.so_phieu)}</td><td class="c">${dt(t.ngay_gio_can_1)}</td><td class="c">${dt(t.ngay_gio_can_2)}</td><td class="c">${esc(t.bien_so)}</td><td class="n">${kg(t.can_lan_1)}</td><td class="n">${kg(t.can_lan_2)}</td><td class="n">${kg(t.kl_hang_kg)}</td><td class="n">${tan(t.kl_hang_tan)}</td><td>${esc(t.noi_xuat || t.noi_xuat_goc)}</td><td>${esc(t.noi_den)}</td><td class="n">${money(t.don_gia)}</td><td class="n">${t.tien_truoc_vat === null ? '' : money(t.tien_truoc_vat)}</td></tr>`; }).join('')
      + `<tr class="sub"><td></td><td colspan="3">Cộng ${esc(x.bien_so)}</td><td class="c">${x.so_chuyen} chuyến</td><td></td><td></td><td class="n">${kg(x.kg)}</td><td class="n">${tan(x.kg / 1000)}</td><td colspan="3"></td><td class="n">${money(x.tien)}</td></tr>`).join('');
    const t = s.tot;
    return `<div class="sec">${docHead(doc.benA, `………… / CT-${s.benB.ma}`, [s.title], doc.period.text.replace(/^Đợt /, 'Vận chuyển ') , partyInfos(doc.benA, s.benB))}
      <table class="d"><thead><tr><th style="width:8mm">STT</th><th>Số phiếu</th><th>Ngày giờ cân 1</th><th>Ngày giờ cân 2</th><th>Biển số</th><th>Cân lần 1 (KG)</th><th>Cân lần 2 (KG)</th><th>KL hàng (KG)</th><th>KL (Tấn)</th><th>Nơi xuất</th><th>Nơi đến</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
      <tbody>${body}<tr class="tot"><td></td><td colspan="3">TỔNG CỘNG (${t.xe} xe)</td><td class="c">${t.so_chuyen} chuyến</td><td></td><td></td><td class="n">${kg(t.kg)}</td><td class="n">${tan(t.kg / 1000)}</td><td colspan="3"></td><td class="n">${money(t.tien)}</td></tr></tbody></table>
      ${t.chuaTinh ? `<div class="warn">Lưu ý: ${t.chuaTinh} chuyến chưa tính được giá.</div>` : ''}
      <div class="date">${dateLine(s.benB)}</div>${signParties(doc.benA, s.benB)}</div>`;
  }).join('');
  return wrapP('Chi tiết vận chuyển', `<style>table.d td, table.d th { font-size: 9px; padding: 1.5px 2.5px; } .sec table.d td.c { white-space: normal; }</style>${secs || '<p>Không có phiếu theo bộ lọc.</p>'}`);
}

// Mỗi tuyến vừa khít 1 trang A4 dọc
const PRICE1P = `@page { size: A4 portrait; margin: 9mm 11mm 10mm 13mm; } body { font-size: 12px; } .sec { height: 276mm; overflow: hidden; page-break-after: always; } .sec:last-child { page-break-after: auto; }
.sec table.d td, .sec table.d th { font-size: 9pt; padding: 0.55mm 1.2mm; } .sec table { margin-top: 2mm; } .sec .t2 { margin: 1mm 0; } .sec .qh { margin-bottom: 1mm; } .sec .words { margin-top: 1.5mm; } .sec .date { margin-top: 2mm; }
.sec .sign { margin-top: 2mm; } .sec .sign .gap { height: 13mm; } .sec .sign .s { font-size: 8pt; } .sec table.sum td { padding: 0.3mm 1.5mm; font-size: 9.5pt; }`;
function priceHtml(doc) {
  const { benA } = doc; const B = doc.benB || { ten: '', chuc_vu: 'Giám đốc', dai_dien: '', ke_toan: '' };
  const fm = (v, k) => (v === null || v === undefined ? '' : k === 'money' ? nf(v, 0) : k === 'money2' || k === 'dec2' ? nf(v, 2) : k === 'dec4' ? nf(v, 4) : nf(v, 0));
  const pages = doc.sections.filter((s) => !s.x.thieu).map((sec) => {
    const x = sec.x;
    const rows = sec.steps.map((st) => st.head ? `<tr class="sub"><td colspan="6">${esc(st.head)}</td></tr>`
      : `<tr class="${st.bold ? 'tot' : ''}"><td class="c">(${st.stt})</td><td>${esc(st.label)}</td><td class="c">${esc(st.how)}</td><td class="c" style="font-size:9pt;color:#444">${esc(st.note)}</td><td class="n">${fm(st.value, st.fmt)}</td><td class="c">${esc(st.unit)}</td></tr>`).join('');
    const ky = sec.kyTri ? `<div style="margin-top:3mm"><b>D. GIÁ TRỊ CƯỚC THEO PHIẾU CÂN${doc.tu_ngay || doc.den_ngay ? ` (${doc.tu_ngay ? esc(dmy(doc.tu_ngay)) : '…'} → ${doc.den_ngay ? esc(dmy(doc.den_ngay)) : '…'})` : ''}</b></div>
      <table class="sum"><tr><td class="l">Số chuyến</td><td class="v">${nf(sec.kyTri.so_chuyen)}</td></tr><tr><td class="l">Tổng khối lượng vận chuyển (tấn)</td><td class="v">${tan(sec.kyTri.tan)}</td></tr><tr><td class="l">Thành tiền chưa VAT (đồng)</td><td class="v">${money(sec.kyTri.tien)}</td></tr>
      <tr><td class="l">Thuế GTGT ${sec.vat || 8}% (đồng)</td><td class="v">${money(sec.kyTri.vat)}</td></tr><tr><td class="l"><b>TỔNG GIÁ TRỊ THANH TOÁN (đồng)</b></td><td class="v"><b>${money(sec.kyTri.tong)}</b></td></tr></table><div class="words">Bằng chữ: ${esc(sec.kyTri.bangChu)}</div>` : '';
    return `<div class="sec"><div class="center" style="font-size:11pt"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập – Tự do – Hạnh phúc</b></div>
      <div class="t2" style="font-size:15pt;margin-top:4mm">BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN</div><div class="center"><i>( Bảng giá hiệu lực ngày ${esc(dmy(doc.sh.ngay))}${doc.sh.gia_dau_ap_dung != null ? ` · giá dầu áp dụng ${nf(doc.sh.gia_dau_ap_dung, 2)} đ/lít` : ''} )</i></div><div class="center"><i>Số: ………… / BTĐG-${esc(x.ma_tuyen)}</i></div>
      <div style="margin-top:3mm;font-size:10.5pt">${doc.contract ? `<div>Căn cứ: ${esc(doc.contract)}</div>` : ''}<div>Bên thuê vận chuyển (Bên A): <b>${esc((benA.ten || '').toUpperCase())}</b></div>${doc.benB ? `<div>Bên vận chuyển (Bên B): <b>${esc((doc.benB.ten || '').toUpperCase())}</b></div>` : ''}
      <div>Tuyến vận chuyển: <b>${esc(x.ma_tuyen)} — ${esc(x.noi_xuat)} → ${esc(x.noi_den)}</b></div><div>Bảng giá áp dụng: ${esc(x.bang_gia)}${sec.rule ? `, hiệu lực từ ${esc(dmy(sec.rule.tu_ngay))}` : ''} · ${x.phuong_thuc === 'DIEU_CHINH_DAU' ? 'điều chỉnh theo giá dầu' : 'giá cố định'}</div></div>
      <table class="d"><thead><tr><th style="width:11mm">STT</th><th>Chỉ tiêu</th><th style="width:32mm">Cách tính</th><th style="width:36mm">Diễn giải</th><th style="width:26mm">Giá trị</th><th style="width:17mm">ĐVT</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="words">Bằng chữ: ${esc(sec.giaBangChu)}</div>${ky}
      <div class="date">${dateLine(B)}</div>${signParties(benA, B)}</div>`;
  }).join('');
  const skipped = doc.sections.filter((s) => s.x.thieu).map((s) => `${s.x.ma_tuyen}: ${s.x.thieu}`);
  return wrap('Bảng tính đơn giá vận chuyển', `<style>${EXTRA}${PRICE1P}</style>${pages || '<p>Chưa có tuyến nào có bảng giá hiệu lực.</p>'}${skipped.length ? `<p class="note">Không lập được: ${esc(skipped.join('; '))}</p>` : ''}`);
}

module.exports = { tauSummaryHtml, detailHtml, priceHtml };
