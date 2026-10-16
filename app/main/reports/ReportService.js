'use strict';
/**
 * ReportService — dữ liệu báo cáo lấy từ KẾT QUẢ KỲ ĐÃ LƯU (không tính lại) + xuất file.
 *   bkvc(periodId)    Bảng xác nhận khối lượng vận chuyển dăm (mẫu sheet BKVC)
 *   bkct(periodId)    Bảng kê chi tiết phiếu cân (15 cột, yêu cầu §20)
 *   pricing(periodId) Bảng tính đơn giá vận chuyển (17 cột như QR_DGVC (2))
 *   export({report, format: XLSX|CSV|PDF|HTML, params, targetPath})
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine');
const { AppError } = require('../../shared/errors');
const xlsx = require('./xlsxExport');
const { toCsv } = require('./csvExport');
const html = require('./htmlTemplates');

const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const fmtVn = (x, d = 0) => { if (x === '' || x === null || x === undefined) return ''; const neg = x < 0; const [i, f] = Math.abs(Number(x)).toFixed(d).split('.');
  return (neg ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? `,${f}` : ''); };
/** Địa chỉ in trên bảng tính đơn giá: bỏ ", Việt Nam" ở cuối. */
const noCountry = (a) => String(a || '').replace(/[\s,.;–-]*(Việt Nam|Viet Nam|VN)\.?\s*$/i, '').trim();
/** Số lít bằng chữ: "Năm nghìn ba trăm ba mươi bốn phẩy sáu mươi chín lít". */
function litersInWords(q) {
  if (q < 0) return `Âm ${litersInWords(-q).replace(/^./, (c) => c.toLowerCase())}`;
  const [ip, fp] = (Math.round(q * 100) / 100).toFixed(2).split('.');
  const w = E.numberToVietnameseWords(Number(ip), { thousand: 'nghìn', suffix: '' }).replace(/[\s,./]+$/, '').replace(/ y$/, '').trim();
  const f = Number(fp) ? ` phẩy ${E.numberToVietnameseWords(Number(fp.replace(/0$/, '')), { suffix: '' }).replace(/[\s,./]+$/, '').replace(/ y$/, '').trim().toLowerCase()}` : '';
  return `${w}${f} lít`;
}
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const PRICING_COLUMNS = [
  ['STT', 'stt', 'int'], ['Mã tuyến', 'route_code', 'text'], ['Tuyến', 'route_name', 'text'], ['Cự ly tuyến', 'trip_distance_km', 'int'],
  ['Ngày bắt đầu', 'start_date', 'date'], ['Ngày kết thúc', 'end_date', 'date'], ['Đơn giá theo hợp đồng (chưa bao gồm nhiên liệu)', 'contract_price', 'money'],
  ['Số chuyến', 'trip_count', 'int'], ['Tổng KL (Tấn)', 'total_ton', 'dec2'], ['Dầu Diezel thực nhận', 'actual_fuel_liter', 'dec2'],
  ['Định mức dầu Diezel', 'fuel_norm_l_per_km', 'dec1'], ['Nhiên liệu dầu Diezel tiêu hao theo định mức (lít)', 'standard_fuel_liter', 'dec2'],
  ['CL Tiêu hao Diezel', 'fuel_diff_liter', 'dec2'], ['Đơn giá dầu', 'fuel_price', 'dec2'], ['Ngày nhập dầu', 'fuel_import_date', 'date'],
  ['Đơn giá CL Diezel', 'fuel_adjust_price', 'dec2'], ['Đơn giá vận chuyển', 'transport_price', 'money'],
].map(([header, key, fmt]) => ({ header, key, fmt }));

const BKCT_COLUMNS = [
  ['STT', 'stt', 'int'], ['Số phiếu', 'ticket_no', 'text'], ['Ngày cân 1', 'weigh1_date', 'date'], ['Giờ cân 1', 'weigh1_time', 'text'],
  ['Ngày cân 2', 'weigh2_date', 'date'], ['Giờ cân 2', 'weigh2_time', 'text'], ['Biển số', 'plate_no', 'text'], ['Cân lần 1', 'weight1_kg', 'int'],
  ['Cân lần 2', 'weight2_kg', 'int'], ['KL hàng (KG)', 'net_kg', 'int'], ['Nguồn gốc', 'origin', 'text'],
  ['LDĐ', 'ldd', 'text'], ['Kiểu cân', 'weigh_type', 'text'], ['Mã tuyến', 'route_code', 'text'], ['Đơn vị VC', 'transport_unit_name', 'text'],
].map(([header, key, fmt]) => ({ header, key, fmt }));

class ReportService {
  constructor(store, { pdfRenderer } = {}) { this.store = store; this.pdfRenderer = pdfRenderer; }

  _period(periodId) {
    const p = this.store.get('KY_TINH', periodId);
    if (!p) throw new AppError('NOT_FOUND', `Không có kỳ ${periodId}`);
    if (!p.calc_version) throw new AppError('NOT_FOUND', `Kỳ ${p.period_code} chưa được tính`);
    return p;
  }

  /** Phần đầu / chân dùng chung cho mọi báo cáo của kỳ: 2 bên, người ký, nơi / ngày lập, dòng "Vận chuyển từ ngày … đến ngày …". */
  _meta(p) {
    const s = this.store; const contract = s.get('HOP_DONG', p.contract_id);
    const cfg = E.buildConfig(s.all('CONFIG'));
    const signers = E.resolveSigners(contract, s.all('DON_VI'), cfg);
    const rd = p.report_date || today();
    return { contract, cfg, signers,
      periodText: `( Vận chuyển từ ngày ${dmy(p.date_from)} đến ngày ${dmy(p.date_to)} )`,
      placeDate: `${contract.sign_place || ''}, ngày ${rd.slice(8, 10)} tháng ${rd.slice(5, 7)} năm ${rd.slice(0, 4)}` };
  }

  bkvc({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    const { contract, cfg, signers, periodText, placeDate } = this._meta(p);
    const lines = s.find('BKVC_LINE', (l) => l.period_id === periodId && l.is_current).sort((a, b) => a.seq - b.seq);
    const totals = lines.reduce((t, l) => ({ trips: t.trips + l.trip_count, kg: t.kg + l.kg, amount: t.amount + l.amount, vat: t.vat + l.vat, total: t.total + l.amount_incl_vat }),
      { trips: 0, kg: 0, amount: 0, vat: 0, total: 0 });
    totals.ton = totals.kg / 1000;
    const vatPct = lines.length ? Math.round(lines[0].vat_rate * 1000) / 10 : cfg.vatRate * 100;
    return {
      header: {
        title: contract.report_title || 'BẢNG XÁC NHẬN KHỐI LƯỢNG VẬN CHUYỂN DĂM',
        carrier: signers.carrier, customer: signers.customer,
        contractNo: contract.contract_no || '', periodCode: p.period_code, status: p.status, origin: p.origin, reportDate: p.report_date || '',
        canInvoice: p.origin === 'LOCAL' && contract.carrier_unit_code === s.unitCode,
        periodText, placeDate,
        serviceDesc: contract.service_desc || '', vatPct,
      },
      lines, totals, invoiceLines: this.invoice({ periodId }).rows,
      amountInWords: lines.length ? E.numberToVietnameseWords(totals.total, { thousand: cfg.amountWordsThousand, suffix: cfg.amountWordsSuffix }) : '',
      signers,
    };
  }

  /**
   * Diễn giải cước để VIẾT HÓA ĐƠN: 1 dòng / xe của BKVC (cùng số tấn, đơn giá, thành tiền, VAT đã làm tròn).
   * Mẫu câu: HOP_DONG.service_desc (sửa được theo từng hợp đồng) → CONFIG INVOICE_DESC_TEMPLATE.
   * Chỗ trống: {BKS} biển số (92H-00057) · {BKS_LIEN} biển số viết liền (92H00057, như hóa đơn MISA) · {TUYEN} tên tuyến · {MA_TUYEN} · {DIEM_DI} {DIEM_DEN} (danh mục tuyến) · {TU_NGAY} {DEN_NGAY} (dd/MM/yyyy).
   */
  invoice({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    const { contract, cfg, signers, periodText, placeDate } = this._meta(p);
    const template = (contract.service_desc || '').trim() || cfg.invoiceDescTemplate;
    const lines = s.find('BKVC_LINE', (l) => l.period_id === periodId && l.is_current).sort((a, b) => a.seq - b.seq);
    const rows = lines.map((l) => ({ seq: l.seq, plate_no: l.plate_no, route_code: l.route_code,
      description: fillTemplate(template, { BKS: l.plate_no, BKS_LIEN: l.plate_no.replace(/[-.\s]/g, ''), MA_TUYEN: l.route_code, TU_NGAY: dmy(p.date_from), DEN_NGAY: dmy(p.date_to), ...routePlaces(s.get('TUYEN_VC', l.route_code), l.route_code) }),
      uom: 'Tấn', qty: l.ton, unit_price: l.unit_price, amount: l.amount, vat_rate_pct: Math.round(l.vat_rate * 1000) / 10, vat: l.vat, total: l.amount_incl_vat }));
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    return { title: 'DIỄN GIẢI CƯỚC VẬN CHUYỂN ĐỂ VIẾT HÓA ĐƠN', subtitle: periodText, contractCode: contract.contract_code, status: p.status, template,
      templateSource: (contract.service_desc || '').trim() ? 'HOP_DONG' : 'CONFIG', buyer: signers.customer, seller: signers.carrier, placeDate,
      company: s.get('DON_VI', contract.carrier_unit_code), columns: INVOICE_COLUMNS, rows,
      totalsRow: { description: 'TỔNG CỘNG', qty: lines.reduce((a, l) => a + l.kg, 0) / 1000, amount: sum('amount'), vat: sum('vat'), total: sum('total') } };
  }

  /**
   * File nhập hóa đơn cho phần mềm hóa đơn điện tử MISA meInvoice — mẫu "Hóa đơn GTGT 1 thuế suất (mẫu ngoại tệ)" (resources/templates).
   * 1 kỳ = 1 hóa đơn; mỗi xe 1 dòng hàng (diễn giải, Tấn, số lượng, đơn giá, thành tiền). Chỉ bên vận chuyển (bên bán) xuất.
   * Tiền thuế GTGT ghi ở dòng đầu của hóa đơn = làm tròn(tổng tiền hàng × thuế suất) — đúng cách MISA tính;
   * nếu khác tổng VAT của BKVC (VAT_ROUND_BASIS = LINE) → cảnh báo W_INVOICE_VAT_DIFF.
   */
  misa({ periodId, periodIds, invoiceDate = '' }) {
    const ids = periodIds && periodIds.length ? periodIds : [periodId];
    const invoices = []; const warnings = [];
    ids.forEach((id, i) => {
      const p = this._period(id); const s = this.store;
      const c = s.get('HOP_DONG', p.contract_id);
      if (p.origin !== 'LOCAL' || c.carrier_unit_code !== s.unitCode) throw new AppError('FORBIDDEN', `Kỳ ${p.period_code}: chỉ bên vận chuyển (${c.carrier_unit_code}) lập hóa đơn`);
      if (p.status === 'NHAP') warnings.push({ code: 'W_INVOICE_DRAFT_PERIOD', level: 'WARNING', message: `Kỳ ${p.period_code} còn nháp — nên xác nhận kỳ trước khi lập hóa đơn` });
      const inv = this.invoice({ periodId: id }); const bk = this.bkvc({ periodId: id }); const cfg = E.buildConfig(s.all('CONFIG'));
      const buyer = s.get('DON_VI', c.customer_unit_code);
      const amount = inv.rows.reduce((a, r) => a + r.amount, 0);
      const vatPct = inv.rows.length ? inv.rows[0].vat_rate_pct : cfg.vatRate * 100;
      const vat = E.calculateInvoiceVat(amount, vatPct / 100, cfg);
      if (vat !== bk.totals.vat) warnings.push({ code: 'W_INVOICE_VAT_DIFF', level: 'WARNING', message: `Kỳ ${p.period_code}: VAT hóa đơn ${vat} (tính trên tổng tiền hàng như MISA) ≠ VAT bảng xác nhận ${bk.totals.vat} (cộng từng dòng) — lệch ${vat - bk.totals.vat} đ` });
      const d = invoiceDate || p.report_date || today();
      invoices.push({ no: String(i + 1), periodCode: p.period_code, date: `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`,
        buyer: { name: buyer.unit_name.toUpperCase(), address: buyer.address || '', taxCode: buyer.tax_code || '', email: buyer.email || '' },
        payment: cfg.invoicePaymentMethod || 'Chuyển khoản', currency: 'VND', rate: 1, vatPct, vat,
        lines: inv.rows.map((r) => ({ description: r.description, uom: r.uom, qty: r.qty, unitPrice: r.unit_price, amount: r.amount })),
        totals: { amount, vat, total: amount + vat }, bkvc: { vat: bk.totals.vat, total: bk.totals.total } });
    });
    return { title: 'FILE NHẬP HÓA ĐƠN MISA', invoices, warnings };
  }

  bkct({ periodId, plateNo = '', q = '' }) {
    const p = this._period(periodId); const s = this.store;
    let rows = s.find('TRANSPORT_DETAIL', (d) => d.period_id === periodId && d.is_current).map((d) => s.get('PHIEU_CAN', d.ticket_id));
    if (plateNo) rows = rows.filter((t) => t.plate_no === plateNo);
    if (q) rows = rows.filter((t) => t.ticket_no.includes(q) || t.plate_no.includes(q.toUpperCase()));
    rows.sort((a, b) => (a.weigh1_date + a.weigh1_time).localeCompare(b.weigh1_date + b.weigh1_time) || a.ticket_no.localeCompare(b.ticket_no, 'vi', { numeric: true }));
    rows = rows.map((t, i) => ({ stt: i + 1, ...t }));
    const { contract, signers, periodText, placeDate } = this._meta(p);
    return { title: 'BẢNG KÊ CHI TIẾT KHỐI LƯỢNG VẬN CHUYỂN DĂM', subtitle: periodText, contractCode: contract.contract_code, status: p.status,
      company: s.get('DON_VI', contract.carrier_unit_code), columns: BKCT_COLUMNS, rows, signers, placeDate,
      totals: { trips: rows.length, kg: rows.reduce((a, t) => a + t.net_kg, 0) } };
  }

  pricing({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    const rows = s.find('TRANSPORT_CALCULATION', (c) => c.period_id === periodId && c.is_current).sort((a, b) => a.route_code.localeCompare(b.route_code)).map((c, i) => ({ stt: i + 1, ...c }));
    const { contract, signers, placeDate } = this._meta(p);
    return { title: 'BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN', subtitle: `Hợp đồng ${contract.contract_code} · kỳ ${dmy(p.date_from)} – ${dmy(p.date_to)} · lần tính ${p.calc_version}`,
      contractCode: contract.contract_code, status: p.status,
      company: s.get('DON_VI', contract.carrier_unit_code), columns: PRICING_COLUMNS, rows, signers, placeDate };
  }

  /**
   * BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN (mẫu in chuyên nghiệp, A4 dọc): mỗi tuyến 20 chỉ tiêu đánh số (1)…(20), có công thức theo số thứ tự,
   * thay số và kết quả — lấy đúng số đã lưu của lần tính hiện hành (TRANSPORT_CALCULATION), không tính lại.
   */
  pricingSheet({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    const { contract, cfg, signers, periodText, placeDate } = this._meta(p);
    const n = (x, d = 0) => fmtVn(x, d);
    const roundText = (digits) => ({ '-3': 'làm tròn đến hàng nghìn', '-2': 'làm tròn đến hàng trăm', '-1': 'làm tròn đến hàng chục', 0: 'làm tròn đến đồng' }[String(digits)] || `làm tròn ${digits} chữ số`);
    const calcs = s.find('TRANSPORT_CALCULATION', (c) => c.period_id === periodId && c.is_current).sort((a, b) => a.route_code.localeCompare(b.route_code));
    const bk = this.bkvc({ periodId });
    const routes = calcs.map((c) => {
      const route = s.get('TUYEN_VC', c.route_code) || {}; const price = s.get('PRICE_HISTORY', c.price_id) || {};
      const m3 = c.uom === 'M3'; const load = m3 ? c.avg_volume_m3 : c.avg_load_ton; const lu = m3 ? 'm³' : 'tấn';
      const row = (no, label, how, expr, value, unit, o = {}) => ({ no, label, how, expr, value, unit, ...o });
      if (c.price_method === 'CO_DINH') {
        // ĐƠN GIÁ CỐ ĐỊNH: không có phần dầu — 4 chỉ tiêu
        const fixedSections = [
          { title: 'A. ĐƠN GIÁ THEO HỢP ĐỒNG — ĐƠN GIÁ CỐ ĐỊNH (không điều chỉnh theo giá dầu)', rows: [
            row(1, 'Đơn giá vận chuyển cố định (chưa VAT)', 'Bảng giá', `${c.price_id}${price.effective_from ? ` · từ ${dmy(price.effective_from)}` : ''}`, n(c.contract_price), 'đ/tấn', { strong: true }),
          ] },
          { title: 'B. KHỐI LƯỢNG THỰC HIỆN TRONG KỲ', rows: [
            row(2, 'Số chuyến vận chuyển', 'Phiếu cân trong kỳ', `${dmy(c.start_date)} – ${dmy(c.end_date)}`, n(c.trip_count), 'chuyến'),
            row(3, 'Tổng khối lượng vận chuyển', 'Σ KL hàng (kg) / 1.000', `${n(c.total_kg)} kg`, n(c.total_ton, 2), 'tấn'),
          ] },
          { title: 'C. ĐƠN GIÁ VẬN CHUYỂN CỦA KỲ', rows: [
            row(4, 'ĐƠN GIÁ VẬN CHUYỂN (chưa VAT)', '= (1)', 'tuyến giá cố định — không nhận dầu, không tính chênh lệch dầu', n(c.transport_price), 'đ/tấn', { strong: true, final: true }),
          ] },
        ];
        return { routeCode: c.route_code, routeName: c.route_name, fromPlace: route.from_place || '', toPlace: route.to_place || '', priceId: c.price_id,
          priceFrom: price.effective_from || '', uom: c.uom, priceMethod: 'CO_DINH', sections: fixedSections, transportPrice: c.transport_price,
          words: E.numberToVietnameseWords(c.transport_price, { thousand: cfg.amountWordsThousand, suffix: 'đồng/tấn' }) };
      }
      const sections = [
        { title: 'A. ĐƠN GIÁ THEO HỢP ĐỒNG (chưa bao gồm nhiên liệu)', rows: [
          row(1, 'Đơn giá cước vận chuyển (đã gồm dầu định mức, chưa VAT)', 'Bảng giá', '', n(c.new_price), `đ/${lu}`),
          row(2, m3 ? 'Thể tích trung bình / chuyến' : 'Khối lượng trung bình / chuyến', 'Bảng giá', '', n(load, m3 ? 2 : 0), lu),
          row(3, 'Đơn giá 1 chuyến', '(1) × (2)', `${n(c.new_price)} × ${n(load, m3 ? 2 : 0)}`, n(c.trip_price), 'đ/chuyến'),
          row(4, 'Cự ly chuyến (đi và về)', 'Danh mục tuyến', '', n(c.trip_distance_km), 'km'),
          row(5, 'Định mức tiêu hao dầu diesel', 'Bảng giá', `${n(c.fuel_norm_l_per_km * 100)} lít/100 km`, n(c.fuel_norm_l_per_km, 1), 'lít/km'),
          row(6, 'Dầu tiêu hao theo định mức / chuyến', '(4) × (5)', `${n(c.trip_distance_km)} × ${n(c.fuel_norm_l_per_km, 1)}`, n(c.fuel_per_trip, 2), 'lít'),
          row(7, 'Đơn giá dầu cơ sở (chưa VAT)', 'Bảng giá', '', n(c.fuel_price_catalog), 'đ/lít'),
          row(8, 'Tiền dầu / chuyến', '(6) × (7)', `${n(c.fuel_per_trip, 2)} × ${n(c.fuel_price_catalog)}`, n(c.fuel_cost_per_trip), 'đ'),
          row(9, 'Tỷ lệ tiền dầu trong cước', '(8) / (3)', `${n(c.fuel_cost_per_trip)} / ${n(c.trip_price)}`, n(c.fuel_cost_ratio * 100, 2), '%'),
          row(10, 'Đơn giá vận chuyển chưa gồm dầu', '[(3) − (8)] / (2)', `(${n(c.trip_price)} − ${n(c.fuel_cost_per_trip)}) / ${n(load, m3 ? 2 : 0)}`, n(c.price_no_diesel, 2), `đ/${lu}`),
          row(11, 'ĐƠN GIÁ HỢP ĐỒNG (chưa gồm nhiên liệu)', `(10) ${roundText(cfg.roundContractDigits)}`, '', n(c.contract_price), `đ/${lu}`, { strong: true }),
        ] },
        { title: 'B. KHỐI LƯỢNG VÀ NHIÊN LIỆU THỰC HIỆN TRONG KỲ', rows: [
          row(12, 'Số chuyến vận chuyển', 'Phiếu cân trong kỳ', `${dmy(c.start_date)} – ${dmy(c.end_date)}`, n(c.trip_count), 'chuyến'),
          row(13, 'Tổng khối lượng vận chuyển', 'Σ KL hàng (kg) / 1.000', `${n(c.total_kg)} kg`, n(c.total_ton, 2), 'tấn'),
          row(14, 'Dầu tiêu hao theo định mức', '(4) × (12) × (5)', `${n(c.trip_distance_km)} × ${n(c.trip_count)} × ${n(c.fuel_norm_l_per_km, 1)}`, n(c.standard_fuel_liter, 2), 'lít'),
          row(15, 'Dầu diesel thực nhận', 'Biên bản giao nhận dầu', c.fuel_line_count ? `${c.fuel_line_count} lần nhận, ${dmy(c.fuel_start_date)} – ${dmy(c.fuel_end_date)}` : 'không nhận dầu', n(c.actual_fuel_liter, 2), 'lít'),
          row(16, 'Chênh lệch dầu (định mức − thực nhận)', '(14) − (15)', `${n(c.standard_fuel_liter, 2)} − ${n(c.actual_fuel_liter, 2)}`, n(c.fuel_diff_liter, 2), 'lít'),
          row(17, 'Đơn giá dầu thực tế bình quân (chưa VAT)', !c.fuel_line_count ? 'Nhập khi tính kỳ' : cfg.fuelPriceMethod === 'WEIGHTED' ? 'Bình quân gia quyền theo lít' : 'Trung bình cộng các lần nhận', !c.fuel_line_count ? 'kỳ không nhận dầu' : '', n(c.fuel_price, 2), 'đ/lít'),
          row(18, 'Đơn giá chênh lệch dầu diesel', '(16) × (17) / (13)', `${n(c.fuel_diff_liter, 2)} × ${n(c.fuel_price, 2)} / ${n(c.total_ton, 2)}`, n(c.fuel_adjust_price, 2), 'đ/tấn'),
        ] },
        { title: 'C. ĐƠN GIÁ VẬN CHUYỂN CỦA KỲ', rows: [
          row(19, 'Đơn giá vận chuyển trước làm tròn', '(11) + (18)', `${n(c.contract_price)} + ${n(c.fuel_adjust_price, 2)}`, n(c.transport_price_raw, 2), 'đ/tấn'),
          row(20, 'ĐƠN GIÁ VẬN CHUYỂN (chưa VAT)', c.transport_price_raw < 0 ? '(19) < 0 → 0' : `(19) ${roundText(cfg.roundFinalDigits)}`, '', n(c.transport_price), 'đ/tấn', { strong: true, final: true }),
        ] },
      ];
      return { routeCode: c.route_code, routeName: c.route_name, fromPlace: route.from_place || '', toPlace: route.to_place || '', priceId: c.price_id,
        priceFrom: price.effective_from || '', uom: c.uom, sections, transportPrice: c.transport_price,
        words: E.numberToVietnameseWords(c.transport_price, { thousand: cfg.amountWordsThousand, suffix: 'đồng/tấn' }) };
    });
    const ex = s.find('KY_TINH', (x) => x.period_id === periodId)[0];
    let excluded = [];
    try { const run = ex.current_run_id && s.get('CALC_RUN', ex.current_run_id); const sum = JSON.parse((run && run.summary_json) || '{}');
      excluded = (sum.excludeReceiptIds || []).map((id) => s.get('GIAO_NHAN_DAU', id)).filter(Boolean); } catch { excluded = []; }
    return { title: 'BẢNG TÍNH ĐƠN GIÁ VẬN CHUYỂN DĂM GỖ', periodText, periodCode: p.period_code, status: p.status, calcVersion: p.calc_version,
      calculatedAt: p.calculated_at || '', contractNo: contract.contract_no || contract.contract_code, contractCode: contract.contract_code,
      carrier: { ...signers.carrier, address: noCountry(signers.carrier.address) }, customer: { ...signers.customer, address: noCountry(signers.customer.address) }, signers, placeDate, routes,
      bkvc: { ton: bk.totals.ton, amount: bk.totals.amount, vat: bk.totals.vat, total: bk.totals.total, vatPct: bk.header.vatPct, words: bk.amountInWords },
      notes: (() => {
        const fixedRoutes = new Set(calcs.filter((c) => c.price_method === 'CO_DINH').map((c) => c.route_code));
        const fx = excluded.filter((r) => fixedRoutes.has(r.route_code)); const other = excluded.filter((r) => !fixedRoutes.has(r.route_code));
        const out = other.map((r) => `Đã bỏ khỏi kỳ dòng dầu ${r.receipt_id} (${dmy(r.receive_date)}, xe ${r.plate_no || r.fuel_vehicle_code}, ${fmtVn(r.qty_liter, 2)} lít) — nhập trùng.`);
        for (const rc of fixedRoutes) { const g = fx.filter((r) => r.route_code === rc); if (g.length) out.push(`Tuyến ${rc} tính theo đơn giá cố định, không nhận dầu: đã bỏ khỏi kỳ ${g.length} dòng dầu (${fmtVn(g.reduce((a, r) => a + r.qty_liter, 0), 2)} lít) ghi mã tuyến này.`); }
        return out;
      })() };
  }

  /**
   * BIÊN BẢN GIAO NHẬN DẦU DIESEL của kỳ: các dòng dầu đã tính vào kỳ (FUEL_DETAIL hiện hành), mỗi BÊN GIAO 1 biên bản.
   * Bên nhận = bên vận chuyển. Có bảng chi tiết từng lần nhận + tổng hợp theo xe + kết luận làm căn cứ tính chênh lệch dầu.
   */
  fuelHandover({ periodId }) {
    const p = this._period(periodId); const s = this.store;
    const { contract, cfg, signers, periodText } = this._meta(p);
    const fd = s.find('FUEL_DETAIL', (f) => f.period_id === periodId && f.is_current);
    if (!fd.length) throw new AppError('NOT_FOUND', `Kỳ ${p.period_code} không có dòng dầu nào`);
    const rec = fd.map((f) => ({ f, r: s.get('GIAO_NHAN_DAU', f.receipt_id) })).filter((x) => x.r)
      .sort((a, b) => (a.r.receive_date + a.r.plate_no).localeCompare(b.r.receive_date + b.r.plate_no));
    const rd = p.report_date || today();
    const sideOf = (code) => {
      if (code === contract.customer_unit_code) return signers.customer;
      if (code === contract.carrier_unit_code) return signers.carrier;
      const u = s.get('DON_VI', code) || { unit_code: code, unit_name: code };
      return { unitCode: code, unitName: (u.doc_display_name || u.unit_name).toUpperCase(), address: u.address || '', taxCode: u.tax_code || '',
        signer: { title: u.legal_rep_title || 'Đại diện', name: u.legal_rep_name || '' }, accountant: u.accountant_name || null };
    };
    const givers = [...new Set(rec.map((x) => x.r.giver_unit_code || contract.customer_unit_code))];
    const docs = givers.map((g, gi) => {
      const mine = rec.filter((x) => (x.r.giver_unit_code || contract.customer_unit_code) === g);
      const posPrices = mine.filter((x) => x.f.qty_liter > 0).map((x) => x.f.fuel_price_excl_vat);
      const posAvg = posPrices.length ? posPrices.reduce((a, b) => a + b, 0) / posPrices.length : 0;
      const rows = mine.map((x, i) => {
        const qty = x.f.qty_liter; const offset = qty < 0;
        // dòng bù trừ không ghi giá → thành tiền theo đơn giá bình quân các dòng dương
        const price = offset && !(x.f.fuel_price_excl_vat > 0) ? Math.round(posAvg) : x.f.fuel_price_excl_vat;
        const when = x.r.receive_date < p.date_from ? 'Nhận trước kỳ' : x.r.receive_date > p.date_to ? 'Nhận sau kỳ' : '';
        return { seq: i + 1, receiptId: x.r.receipt_id, date: x.r.receive_date, plateNo: x.r.plate_no || x.r.fuel_vehicle_code, routeCode: x.r.route_code,
          uom: 'Lít', qty, price, amount: Math.round(qty * price), offset,
          note: [offset ? (x.f.fuel_price_excl_vat > 0 ? 'Bù trừ' : 'Bù trừ (giá BQ)') : '', when, x.r.fuel_depot ? `Kho: ${x.r.fuel_depot}` : ''].filter(Boolean).join(' · ') };
      });
      const byPlate = [...rows.reduce((m, r) => { const o = m.get(r.plateNo) || { plateNo: r.plateNo, times: 0, qty: 0, amount: 0 }; o.times++; o.qty += r.qty; o.amount += r.amount; m.set(r.plateNo, o); return m; }, new Map()).values()]
        .sort((a, b) => a.plateNo.localeCompare(b.plateNo)).map((o, i) => ({ seq: i + 1, ...o, qty: Math.round(o.qty * 100) / 100 }));
      const qty = Math.round(rows.reduce((a, r) => a + r.qty, 0) * 100) / 100; const amount = rows.reduce((a, r) => a + r.amount, 0);
      const pr = rows.filter((r) => !r.offset); const avg = pr.length ? pr.reduce((a, r) => a + r.price, 0) / pr.length : 0;
      return { no: `${p.period_code}/BBGN-DẦU${givers.length > 1 ? `-${gi + 1}` : ''}`, giver: sideOf(g), receiver: signers.carrier, rows, byPlate,
        totals: { times: rows.length, qty, amount, avgPrice: avg, vehicles: byPlate.length },
        qtyWords: litersInWords(qty), from: rows[0].date, to: rows[rows.length - 1].date };
    });
    return { title: 'BIÊN BẢN GIAO NHẬN DẦU DIESEL', periodText, periodCode: p.period_code, status: p.status,
      contractNo: contract.contract_no || contract.contract_code, contractCode: contract.contract_code, contractFrom: contract.effective_from || '',
      carrier: signers.carrier, customer: signers.customer, signPlace: contract.sign_place || '',
      dateText: `ngày ${rd.slice(8, 10)} tháng ${rd.slice(5, 7)} năm ${rd.slice(0, 4)}`, dateFrom: p.date_from, dateTo: p.date_to, docs,
      fuelPriceMethod: cfg.fuelPriceMethod };
  }

  /**
   * CĂN CỨ TÍNH ĐƠN GIÁ KÝ HỢP ĐỒNG (Tầng A — cách tính như file Excel cũ), cho mọi tuyến đang dùng tại ngày `asOf`.
   * contractId trống = bảng giá chung; có hợp đồng = giá riêng của hợp đồng (nếu có) thay cho giá chung của tuyến đó.
   */
  contractBasis({ contractId = '', asOf = '', routeCode = '' } = {}) {
    const s = this.store; const cfg = E.buildConfig(s.all('CONFIG'));
    const d = asOf || today();
    const contract = contractId ? s.get('HOP_DONG', contractId) : null;
    if (contractId && !contract) throw new AppError('NOT_FOUND', `Không có hợp đồng ${contractId}`);
    const pick = (rc, cid) => s.find('PRICE_HISTORY', (x) => x.route_code === rc && (x.contract_id || '') === cid && x.status !== 'DRAFT'
      && x.effective_from <= d && (!x.effective_to || x.effective_to >= d)).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    const rows = [];
    for (const r of s.all('TUYEN_VC').filter((x) => x.is_active && (!routeCode || x.route_code === routeCode)).sort((a, b) => a.route_code.localeCompare(b.route_code, 'vi', { numeric: true }))) {
      const own = contractId ? pick(r.route_code, contractId) : null; const pr = own || pick(r.route_code, '');
      if (!pr) continue;
      const a = E.computeContractPrice(r, pr, cfg);
      rows.push({ stt: rows.length + 1, routeCode: r.route_code, routeName: r.route_name, distanceKm: r.distance_km, tripDistanceKm: a.tripDistanceKm, uom: r.uom === 'M3' ? 'M3' : 'Tấn',
        basePrice: pr.base_price_excl_vat === '' ? null : pr.base_price_excl_vat, newPrice: a.newPrice, avgLoadTon: a.avgLoadTon, avgVolumeM3: r.uom === 'M3' ? a.avgVolumeM3 : null,
        tripPrice: a.tripPrice, fuelNormLPerKm: a.fuelNormLPerKm, fuelPerTrip: a.fuelPerTrip, fuelPriceCatalog: a.fuelPriceCatalog, fuelCostPerTrip: a.fuelCostPerTrip,
        fuelCostRatio: a.fuelCostRatio, priceNoDiesel: a.priceNoDiesel, contractPrice: a.contractPrice,
        priceId: pr.price_id, effectiveFrom: pr.effective_from, source: own ? 'Giá riêng hợp đồng' : 'Giá chung', unitVc: r.catalog_unit_code || '',
        priceMethod: a.priceMethod, fixed: a.priceMethod === 'CO_DINH' });
    }
    const signers = contract ? E.resolveSigners(contract, s.all('DON_VI'), cfg) : null;
    const company = s.get('DON_VI', contract ? contract.carrier_unit_code : s.unitCode) || {};
    return { title: 'CĂN CỨ TÍNH ĐƠN GIÁ VẬN CHUYỂN KÝ HỢP ĐỒNG', asOf: d, contract: contract ? { id: contract.contract_id, code: contract.contract_code, no: contract.contract_no || contract.contract_code } : null,
      carrier: signers ? { ...signers.carrier, address: noCountry(signers.carrier.address) } : { unitName: (company.doc_display_name || company.unit_name || '').toUpperCase(), address: noCountry(company.address), taxCode: company.tax_code || '' },
      customer: signers ? signers.customer : null, signers,
      placeDate: `${(contract && contract.sign_place) || ''}, ngày ${d.slice(8, 10)} tháng ${d.slice(5, 7)} năm ${d.slice(0, 4)}`,
      rounding: { contractDigits: cfg.roundContractDigits, mode: cfg.roundPriceMode, int64: cfg.pqInt64Cast }, rows };
  }

  // ───────────── Báo cáo theo khoảng ngày (không theo kỳ) ─────────────
  _rangeText(dateFrom, dateTo) {
    return dateFrom || dateTo ? `( Từ ngày ${dmy(dateFrom) || '…'} đến ngày ${dmy(dateTo) || '…'} )` : '( Toàn bộ dữ liệu )';
  }
  _periodOfTicket() {
    const s = this.store; const m = new Map();
    for (const d of s.find('TRANSPORT_DETAIL', (x) => x.is_current && x.usage_state !== 'RELEASED')) {
      const p = s.get('KY_TINH', d.period_id); if (p && p.status !== 'HUY') m.set(d.ticket_id, p);
    }
    return m;
  }

  /** Danh sách PHIẾU CÂN theo khoảng ngày (ngày cân 1) — tải Excel. */
  ticketList({ dateFrom = '', dateTo = '', routeCode = '', plateNo = '', ownerUnitCode = '', customer = '' } = {}) {
    const s = this.store; const per = this._periodOfTicket(); const k = customer.trim().toUpperCase();
    const rows = s.find('PHIEU_CAN', (t) => !t.is_deleted && inRange(t.weigh1_date, dateFrom, dateTo) && (!routeCode || t.route_code === routeCode)
      && (!plateNo || t.plate_no === plateNo) && (!ownerUnitCode || t.owner_unit_code === ownerUnitCode) && (!k || String(t.customer || '').toUpperCase().includes(k)))
      .sort((a, b) => (a.weigh1_date + a.weigh1_time).localeCompare(b.weigh1_date + b.weigh1_time) || a.ticket_no.localeCompare(b.ticket_no, 'vi', { numeric: true }))
      .map((t, i) => { const p = per.get(t.ticket_id); return { stt: i + 1, ...t, net_ton: t.net_kg / 1000, owner: t.owner_unit_code || '', period_code: p ? p.period_code : '' }; });
    const cols = [...BKCT_COLUMNS.slice(0, 10), { header: 'KL hàng (Tấn)', key: 'net_ton', fmt: 'dec2' }, ...BKCT_COLUMNS.slice(10), { header: 'Chủ xe', key: 'owner', fmt: 'text' }, { header: 'Kỳ tính', key: 'period_code', fmt: 'text' }];
    const kg = rows.reduce((a, t) => a + t.net_kg, 0);
    return { title: 'DANH SÁCH PHIẾU CÂN', subtitle: this._rangeText(dateFrom, dateTo), company: s.get('DON_VI', s.unitCode), columns: cols, rows,
      totalsRow: { ticket_no: `${rows.length} phiếu`, net_kg: kg, net_ton: kg / 1000 }, totals: undefined };
  }

  /** Bảng kê GIAO NHẬN DẦU theo khoảng ngày (ngày nhận) — tải Excel. */
  fuelList({ dateFrom = '', dateTo = '', contractId = '', plateNo = '', giverUnitCode = '' } = {}) {
    const s = this.store;
    const used = new Map(s.find('FUEL_DETAIL', (d) => d.is_current && d.usage_state !== 'RELEASED').map((d) => [d.receipt_id, s.get('KY_TINH', d.period_id)]));
    const rows = s.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && inRange(r.receive_date, dateFrom, dateTo) && (!contractId || r.contract_id === contractId)
      && (!plateNo || r.plate_no === plateNo) && (!giverUnitCode || r.giver_unit_code === giverUnitCode))
      .sort((a, b) => a.receive_date.localeCompare(b.receive_date) || (a.plate_no || '').localeCompare(b.plate_no || '') || a.receipt_id.localeCompare(b.receipt_id))
      .map((r, i) => { const p = used.get(r.receipt_id); const c = s.get('HOP_DONG', r.contract_id);
        return { stt: i + 1, receive_date: r.receive_date, contract: c ? c.contract_code : r.contract_id, route_code: r.route_code, plate_no: r.plate_no || r.fuel_vehicle_code,
          uom: 'Lít', qty_liter: r.qty_liter, fuel_price_excl_vat: r.fuel_price_excl_vat, amount: Math.round(r.qty_liter * r.fuel_price_excl_vat), purchase_date: r.purchase_date,
          giver: r.giver_unit_code, depot: r.fuel_depot || '', period_code: p && p.status !== 'HUY' ? p.period_code : '', note: [r.qty_liter < 0 ? 'Bù trừ' : '', /W_POSSIBLE_DUPLICATE/.test(r.validation_flags || '') && !r.flags_ack ? 'Nghi trùng' : ''].filter(Boolean).join(' · ') }; });
    const cols = [['STT', 'stt', 'int'], ['Ngày nhận', 'receive_date', 'date'], ['Hợp đồng', 'contract', 'text'], ['Mã tuyến', 'route_code', 'text'], ['Biển số xe', 'plate_no', 'text'],
      ['ĐVT', 'uom', 'text'], ['Số lượng (lít)', 'qty_liter', 'dec2'], ['Đơn giá chưa VAT (đ/lít)', 'fuel_price_excl_vat', 'money'], ['Thành tiền chưa VAT (đ)', 'amount', 'money'],
      ['Ngày mua', 'purchase_date', 'date'], ['Bên giao', 'giver', 'text'], ['Kho nhận dầu', 'depot', 'text'], ['Kỳ tính', 'period_code', 'text'], ['Ghi chú', 'note', 'text']].map(([header, key, fmt]) => ({ header, key, fmt }));
    const q = rows.reduce((a, r) => a + r.qty_liter, 0);
    return { title: 'BẢNG KÊ GIAO NHẬN DẦU DIESEL', subtitle: this._rangeText(dateFrom, dateTo), company: s.get('DON_VI', s.unitCode), columns: cols, rows,
      totalsRow: { contract: `${rows.length} lần nhận`, qty_liter: Math.round(q * 100) / 100, amount: rows.reduce((a, r) => a + r.amount, 0) },
      avgPrice: (() => { const pos = rows.filter((r) => r.qty_liter > 0); return pos.length ? pos.reduce((a, r) => a + r.fuel_price_excl_vat, 0) / pos.length : 0; })() };
  }

  /**
   * TỔNG HỢP KHỐI LƯỢNG VẬN CHUYỂN theo khoảng ngày (phiếu cân), gom theo 1 hoặc 2 chiều:
   * CUSTOMER (khách hàng = bên thuê của hợp đồng) · CONTRACT · TICKET_CUSTOMER (khách hàng ghi trên phiếu) · OWNER (nhóm xe — chủ xe) · TRANSPORT_UNIT (đơn vị VC trên phiếu) · PLATE · ROUTE · ORIGIN · MONTH · DAY.
   */
  volumeSummary({ dateFrom = '', dateTo = '', routeCode = '', groupBy = 'CUSTOMER', groupBy2 = '' } = {}) {
    const s = this.store; const per = this._periodOfTicket();
    const routes = new Map(s.all('TUYEN_VC').map((r) => [r.route_code, r.route_name]));
    // hợp đồng của phiếu: theo kỳ tính đã dùng phiếu; chưa tính kỳ → theo phạm vi xe của hợp đồng tại ngày cân
    const scope = s.all('HOP_DONG_XE'); const contracts = new Map(s.all('HOP_DONG').map((c) => [c.contract_id, c]));
    const contractOf = (t) => { const p = per.get(t.ticket_id); if (p) return contracts.get(p.contract_id);
      const x = scope.find((v) => v.plate_no === t.plate_no && (!v.effective_from || v.effective_from <= t.weigh1_date) && (!v.effective_to || v.effective_to >= t.weigh1_date));
      return x ? contracts.get(x.contract_id) : null; };
    const units = new Map(s.all('DON_VI').map((u) => [u.unit_code, u.short_name || u.unit_name]));
    const DIM = {
      CUSTOMER: ['Khách hàng (bên thuê)', (t) => { const c = contractOf(t); return c ? `${c.customer_unit_code} · ${units.get(c.customer_unit_code) || ''}` : '(chưa thuộc hợp đồng nào)'; }],
      CONTRACT: ['Hợp đồng', (t) => { const c = contractOf(t); return c ? c.contract_code : '(chưa thuộc hợp đồng nào)'; }],
      TICKET_CUSTOMER: ['Khách hàng ghi trên phiếu', (t) => (t.customer || '').trim() || '(không ghi)'],
      OWNER: ['Nhóm xe (chủ xe)', (t) => (t.owner_unit_code ? `${t.owner_unit_code} · ${units.get(t.owner_unit_code) || ''}` : '(chưa có trong danh mục xe)')],
      TRANSPORT_UNIT: ['Đơn vị VC (trên phiếu)', (t) => (t.transport_unit_name || '').trim() || '(không ghi)'],
      PLATE: ['Biển số xe', (t) => t.plate_no],
      ROUTE: ['Tuyến', (t) => `${t.route_code} · ${routes.get(t.route_code) || ''}`],
      ORIGIN: ['Nguồn gốc', (t) => (t.origin || '').trim() || '(không ghi)'],
      MONTH: ['Tháng', (t) => `${t.weigh1_date.slice(5, 7)}/${t.weigh1_date.slice(0, 4)}`],
      DAY: ['Ngày', (t) => dmy(t.weigh1_date)],
    };
    if (!DIM[groupBy]) throw new AppError('VALIDATION_FAILED', `Chiều tổng hợp không hỗ trợ: ${groupBy}`);
    if (groupBy2 && (!DIM[groupBy2] || groupBy2 === groupBy)) throw new AppError('VALIDATION_FAILED', `Chiều thứ 2 không hợp lệ: ${groupBy2}`);
    const tickets = s.find('PHIEU_CAN', (t) => !t.is_deleted && inRange(t.weigh1_date, dateFrom, dateTo) && (!routeCode || t.route_code === routeCode));
    const totalKg = tickets.reduce((a, t) => a + t.net_kg, 0);
    const agg = (list) => ({ trips: list.length, vehicles: new Set(list.map((t) => t.plate_no)).size, kg: list.reduce((a, t) => a + t.net_kg, 0) });
    const group = (list, fn) => { const m = new Map(); for (const t of list) { const k = fn(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); } return m; };
    const chrono = (d) => d === 'DAY' || d === 'MONTH';
    const sortKeys = (m, d) => [...m.keys()].sort((a, b) => (chrono(d) ? (a.split('/').reverse().join('') < b.split('/').reverse().join('') ? -1 : 1) : agg(m.get(b)).kg - agg(m.get(a)).kg || a.localeCompare(b, 'vi')));
    const line = (g1, g2, x, bold) => ({ g1, g2, trips: x.trips, vehicles: x.vehicles, kg: x.kg, ton: x.kg / 1000, share: totalKg ? (x.kg / totalKg) * 100 : 0, ...(bold ? { _b: true } : {}) });
    const rows = []; const m1 = group(tickets, DIM[groupBy][1]);
    for (const k1 of sortKeys(m1, groupBy)) {
      const l1 = m1.get(k1);
      if (!groupBy2) { rows.push(line(k1, '', agg(l1))); continue; }
      const m2 = group(l1, DIM[groupBy2][1]);
      sortKeys(m2, groupBy2).forEach((k2, j) => rows.push(line(j ? '' : k1, k2, agg(m2.get(k2)))));
      rows.push(line(`Cộng ${k1}`, '', agg(l1), true));
    }
    rows.forEach((r, i) => { r.stt = r._b ? '' : rows.slice(0, i + 1).filter((x) => !x._b).length; });
    const cols = [{ header: 'STT', key: 'stt', fmt: 'int' }, { header: DIM[groupBy][0], key: 'g1', fmt: 'text' }, ...(groupBy2 ? [{ header: DIM[groupBy2][0], key: 'g2', fmt: 'text' }] : []),
      { header: 'Số chuyến', key: 'trips', fmt: 'int' }, { header: 'Số xe', key: 'vehicles', fmt: 'int' }, { header: 'Khối lượng (KG)', key: 'kg', fmt: 'int' },
      { header: 'Khối lượng (Tấn)', key: 'ton', fmt: 'dec2' }, { header: 'Tỷ trọng (%)', key: 'share', fmt: 'dec2' }];
    const all = agg(tickets);
    return { title: 'TỔNG HỢP KHỐI LƯỢNG VẬN CHUYỂN', subtitle: `${this._rangeText(dateFrom, dateTo)} · theo ${DIM[groupBy][0].toLowerCase()}${groupBy2 ? ` và ${DIM[groupBy2][0].toLowerCase()}` : ''}${routeCode ? ` · tuyến ${routeCode}` : ''}`,
      company: s.get('DON_VI', s.unitCode), columns: cols, rows, dimensions: Object.fromEntries(Object.entries(DIM).map(([k, v]) => [k, v[0]])),
      totalsRow: { g1: 'TỔNG CỘNG', trips: all.trips, vehicles: all.vehicles, kg: all.kg, ton: all.kg / 1000, share: totalKg ? 100 : 0 } };
  }

  /**
   * NHẬT TRÌNH VẬN CHUYỂN của 1 xe theo khoảng ngày (tháng / quý / năm): mỗi dòng = 1 ngày × 1 tuyến × 1 chủ hàng.
   * Cự ly = cự ly 1 chiều của tuyến; Số km = cự ly chuyến (đi + về) × số chuyến; Dầu nhận = Σ lít bảng kê dầu của xe trong ngày (dòng bù trừ âm trừ đi);
   * Dầu định mức = số km × định mức (lít/km) của phiên bản giá hiệu lực; Chủ hàng = bên thuê của hợp đồng (theo kỳ đã tính, chưa tính → phạm vi xe hợp đồng).
   */
  vehicleLog({ plateNo, dateFrom, dateTo, label = '' } = {}) {
    const s = this.store;
    if (!plateNo) throw new AppError('VALIDATION_FAILED', 'Chọn xe');
    if (!dateFrom || !dateTo || dateFrom > dateTo) throw new AppError('VALIDATION_FAILED', 'Chọn khoảng ngày (tháng / quý / năm)');
    const xe = s.get('XE', plateNo); if (!xe) throw new AppError('NOT_FOUND', `Không có xe ${plateNo}`);
    const cfg = E.buildConfig(s.all('CONFIG'));
    const per = this._periodOfTicket();
    const routes = new Map(s.all('TUYEN_VC').map((r) => [r.route_code, r]));
    const units = new Map(s.all('DON_VI').map((u) => [u.unit_code, u]));
    const contracts = new Map(s.all('HOP_DONG').map((c) => [c.contract_id, c]));
    const scope = s.all('HOP_DONG_XE').filter((v) => v.plate_no === plateNo);
    const prices = s.all('PRICE_HISTORY');
    const contractOf = (t) => { const p = per.get(t.ticket_id); if (p) return contracts.get(p.contract_id);
      const v = scope.find((x) => (!x.effective_from || x.effective_from <= t.weigh1_date) && (!x.effective_to || x.effective_to >= t.weigh1_date)); return v ? contracts.get(v.contract_id) : null; };
    const ownerName = (c, t) => { if (c) { const u = units.get(c.customer_unit_code); return c.customer_print_name || (u && (u.doc_display_name || u.unit_name)) || c.customer_unit_code; } return (t.customer || '').trim() || '(chưa thuộc hợp đồng)'; };
    const tickets = s.find('PHIEU_CAN', (t) => !t.is_deleted && t.plate_no === plateNo && t.weigh1_date >= dateFrom && t.weigh1_date <= dateTo);
    const fuel = s.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.plate_no === plateNo && r.receive_date >= dateFrom && r.receive_date <= dateTo);
    const fuelByDay = new Map(); const depotByDay = new Map();
    for (const r of fuel) {
      fuelByDay.set(r.receive_date, (fuelByDay.get(r.receive_date) || 0) + r.qty_liter);
      const k = (r.fuel_depot || '').trim(); if (k) { if (!depotByDay.has(r.receive_date)) depotByDay.set(r.receive_date, new Set()); depotByDay.get(r.receive_date).add(k); }
    }
    // chốt đồng hồ km (vd đầu năm / cuối năm)
    const { VehicleKmService } = require('../services/VehicleKmService');
    const vk = new VehicleKmService(s);
    const readByDay = new Map(); for (const r of vk.readings(plateNo)) if (r.date >= dateFrom && r.date <= dateTo) readByDay.set(r.date, r);
    const groups = new Map();
    for (const t of tickets) {
      const c = contractOf(t); const owner = ownerName(c, t); const k = `${t.weigh1_date}|${t.route_code}|${owner}`;
      if (!groups.has(k)) groups.set(k, { date: t.weigh1_date, route_code: t.route_code, owner, contractId: c ? c.contract_id : '', trips: 0, kg: 0, tickets: [] });
      const g = groups.get(k); g.trips += 1; g.kg += t.net_kg; g.tickets.push(t.ticket_no);
    }
    for (const d of new Set([...fuelByDay.keys(), ...readByDay.keys()])) if (![...groups.values()].some((g) => g.date === d)) groups.set(`${d}||`, { date: d, route_code: '', owner: '', contractId: '', trips: 0, kg: 0, tickets: [] });
    const list = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.route_code.localeCompare(b.route_code) || a.owner.localeCompare(b.owner));
    const seenDay = new Set(); const rows = []; const monthTot = new Map();
    const tot = { trips: 0, km: 0, ton: 0, fuel: 0, norm: 0 };
    for (const g of list) {
      const r = routes.get(g.route_code);
      const sel = g.route_code ? E.selectPriceVersion(prices, g.route_code, g.contractId, g.date, g.date, cfg) : {};
      const norm = sel.price ? Number(sel.price.fuel_norm_l_per_km) || 0 : 0;
      const km = r ? (Number(r.trip_distance_km) || 0) * g.trips : 0;
      // dầu nhận, kho, km khai báo: ghi 1 lần mỗi ngày (dòng đầu của ngày)
      const first = !seenDay.has(g.date); seenDay.add(g.date);
      const f = first && fuelByDay.has(g.date) ? Math.round(fuelByDay.get(g.date) * 100) / 100 : null;
      const rd = first && readByDay.has(g.date) ? readByDay.get(g.date) : null;
      const only = !g.route_code ? (f !== null ? '(chỉ nhận dầu)' : '(chốt đồng hồ km)') : '';
      const row = { date: g.date, route: g.route_code ? `${g.route_code} · ${r ? r.route_name : ''}` : only, distance_km: r ? Number(r.distance_km) || 0 : null,
        trips: g.trips || null, km: km || null, odo: rd ? `${fmtVn(rd.odometer, 0)} (${rd.readAtText})` : '',
        ton: g.kg ? Math.round(g.kg / 10) / 100 : null, fuel: f, depot: first && depotByDay.has(g.date) ? [...depotByDay.get(g.date)].join('; ') : '',
        norm: norm && km ? Math.round(km * norm * 100) / 100 : null, owner: g.owner, ticket_nos: g.tickets.join(', ') };
      rows.push(row);
      const m = g.date.slice(0, 7); if (!monthTot.has(m)) monthTot.set(m, { trips: 0, km: 0, ton: 0, fuel: 0, norm: 0 });
      for (const T of [tot, monthTot.get(m)]) { T.trips += g.trips; T.km += km; T.ton += g.kg / 1000; T.fuel += f || 0; T.norm += row.norm || 0; }
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    // nhiều tháng → dòng cộng từng tháng
    let out = rows;
    if (monthTot.size > 1) {
      out = [];
      for (const [m, T] of monthTot) {
        out.push(...rows.filter((x) => x.date.startsWith(m)));
        out.push({ _b: true, date: '', route: `Cộng tháng ${m.slice(5)}/${m.slice(0, 4)}`, trips: T.trips, km: T.km, ton: r2(T.ton), fuel: r2(T.fuel), norm: r2(T.norm), owner: '', ticket_nos: '' });
      }
    }
    let n = 0; for (const x of out) if (!x._b) x.stt = ++n;
    // đối chiếu km đồng hồ (giữa các lần chốt) với km theo tuyến — tính trên mọi chuyến / dầu của xe, kể cả ngoài kỳ đang xem
    const allT = s.find('PHIEU_CAN', (t) => !t.is_deleted && t.plate_no === plateNo);
    const allF = s.find('GIAO_NHAN_DAU', (r) => !r.is_deleted && r.plate_no === plateNo);
    const inR = (d, a, b) => d >= a && d <= b;
    const odoCheck = vk.segments(plateNo, { dateFrom, dateTo,
      routeKmOf: (a, b) => allT.filter((t) => inR(t.weigh1_date, a, b)).reduce((x, t) => x + (Number((routes.get(t.route_code) || {}).trip_distance_km) || 0), 0),
      tripsOf: (a, b) => allT.filter((t) => inR(t.weigh1_date, a, b)).length,
      fuelOf: (a, b) => allF.filter((r) => inR(r.receive_date, a, b)).reduce((x, r) => x + r.qty_liter, 0) });
    const C2 = (header, key, fmt) => ({ header, key, fmt });
    const odoTable = { title: 'ĐỐI CHIẾU KM ĐỒNG HỒ VỚI KM THEO TUYẾN', columns: [C2('Từ lần chốt', 'fromText', 'text'), C2('Đến lần chốt', 'toText', 'text'), C2('Đồng hồ đầu', 'odoStart', 'int'), C2('Đồng hồ cuối', 'odoEnd', 'int'),
      C2('Km đồng hồ', 'odoKm', 'dec1'), C2('Số chuyến', 'trips', 'int'), C2('Km theo tuyến', 'routeKm', 'int'), C2('Chênh lệch (km)', 'diffKm', 'dec1'), C2('Chênh lệch (%)', 'diffPct', 'dec1'),
      C2('Dầu nhận (lít)', 'fuel', 'dec2'), C2('Lít / 100 km đồng hồ', 'per100', 'dec2'), C2('Ghi chú', 'warn', 'text')],
      rows: odoCheck.segments, totalsRow: odoCheck.total && odoCheck.segments.length > 1 ? { fromText: 'CỘNG', ...odoCheck.total, fromTextOverride: true } : null };
    if (odoTable.totalsRow) { odoTable.totalsRow.fromText = 'CỘNG'; odoTable.totalsRow.toText = `${odoCheck.total.fromText} → ${odoCheck.total.toText}`; }
    const owner = units.get(xe.owner_unit_code);
    const columns = [['STT', 'stt', 'int'], ['Ngày', 'date', 'date'], ['Tuyến', 'route', 'text'], ['Cự ly 1 chiều (km)', 'distance_km', 'int'], ['Số chuyến', 'trips', 'int'],
      ['Số km theo tuyến (đi + về)', 'km', 'int'], ['Chốt đồng hồ km', 'odo', 'text'], ['KL hàng (tấn)', 'ton', 'dec2'], ['Dầu nhận (lít)', 'fuel', 'dec2'], ['Kho nhận dầu', 'depot', 'text'],
      ['Dầu định mức (lít)', 'norm', 'dec2'], ['Chủ hàng', 'owner', 'text'], ['Số phiếu cân', 'ticket_nos', 'text']]
      .map(([header, key, fmt]) => ({ header, key, fmt }));
    return { title: `NHẬT TRÌNH VẬN CHUYỂN XE ${plateNo}`, subtitle: `( ${label ? `${label} · ` : ''}từ ngày ${dmy(dateFrom)} đến ngày ${dmy(dateTo)} · chủ xe: ${owner ? owner.unit_name : xe.owner_unit_code} )`,
      company: s.get('DON_VI', s.unitCode), plateNo, columns, rows: out,
      totalsRow: { route: 'TỔNG CỘNG', trips: tot.trips, km: tot.km, ton: r2(tot.ton), fuel: r2(tot.fuel), norm: r2(tot.norm) },
      odo: odoCheck, extraTables: odoCheck.segments.length ? [odoTable] : [],
      summary: { trips: tot.trips, km: tot.km, ton: r2(tot.ton), fuel: r2(tot.fuel), norm: r2(tot.norm),
        per100: tot.km ? r2(tot.fuel / tot.km * 100) : null, readings: odoCheck.readings.length,
        odoKm: odoCheck.total ? odoCheck.total.odoKm : null, odoRouteKm: odoCheck.total ? odoCheck.total.routeKm : null, odoDiffKm: odoCheck.total ? odoCheck.total.diffKm : null,
        odoDiffPct: odoCheck.total ? odoCheck.total.diffPct : null, per100Odo: odoCheck.total ? odoCheck.total.per100 : null, odoFrom: odoCheck.total ? odoCheck.total.fromText : '', odoTo: odoCheck.total ? odoCheck.total.toText : '',
        days: new Set(tickets.map((t) => t.weigh1_date)).size, fuelLines: fuel.length } };
  }

  /** Trang HTML A4 của báo cáo (xem trước / in / PDF). */
  html({ report, params }) {
    if (report === 'PRICING_SHEET') return html.pricingSheet(this.pricingSheet(params));
    if (report === 'CONTRACT_BASIS') return html.contractBasis(this.contractBasis(params));
    if (report === 'FUEL_HANDOVER') return html.fuelHandover(this.fuelHandover(params));
    const b = { BKVC: () => this.bkvc(params), BKCT: () => this.bkct(params), PRICING: () => this.pricing(params), INVOICE: () => this.invoice(params),
      TICKETS: () => this.ticketList(params), FUEL_LIST: () => this.fuelList(params), VOLUME: () => this.volumeSummary(params), VEHICLE_LOG: () => this.vehicleLog(params) }[report];
    if (!b) throw new AppError('VALIDATION_FAILED', `Báo cáo không hỗ trợ: ${report}`);
    return report === 'BKVC' ? html.bkvc(b()) : html.table(b(), { landscape: true });
  }

  async export({ report, format, params, targetPath }) {
    const builders = { BKVC: () => this.bkvc(params), BKCT: () => this.bkct(params), PRICING: () => this.pricing(params), INVOICE: () => this.invoice(params), MISA: () => this.misa(params),
      PRICING_SHEET: () => this.pricingSheet(params), FUEL_HANDOVER: () => this.fuelHandover(params), CONTRACT_BASIS: () => this.contractBasis(params),
      TICKETS: () => this.ticketList(params), FUEL_LIST: () => this.fuelList(params), VOLUME: () => this.volumeSummary(params), VEHICLE_LOG: () => this.vehicleLog(params) };
    if (!builders[report]) throw new AppError('VALIDATION_FAILED', `Báo cáo không hỗ trợ: ${report}`);
    const data = builders[report]();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (report === 'MISA') {
      if (format !== 'XLSX') throw new AppError('VALIDATION_FAILED', 'File nhập hóa đơn MISA chỉ xuất Excel');
      await xlsx.writeMisa(data, targetPath);
      return { path: targetPath, sizeBytes: fs.statSync(targetPath).size, data, warnings: data.warnings };
    }
    if (['PRICING_SHEET', 'FUEL_HANDOVER', 'CONTRACT_BASIS'].includes(report)) {
      const W = { PRICING_SHEET: [xlsx.writePricingSheet, html.pricingSheet], FUEL_HANDOVER: [xlsx.writeFuelHandover, html.fuelHandover], CONTRACT_BASIS: [xlsx.writeContractBasis, html.contractBasis] }[report];
      if (format === 'XLSX') await W[0](data, targetPath);
      else if (format === 'HTML' || format === 'PDF') {
        const page = W[1](data);
        if (format === 'HTML') fs.writeFileSync(targetPath, page);
        else { if (!this.pdfRenderer) throw new AppError('INTERNAL', 'Chưa có bộ in PDF'); fs.writeFileSync(targetPath, await this.pdfRenderer(page, { landscape: report === 'CONTRACT_BASIS' })); }
      } else throw new AppError('VALIDATION_FAILED', 'Mẫu này xuất Excel hoặc PDF');
      return { path: targetPath, sizeBytes: fs.statSync(targetPath).size, data };
    }
    if (format === 'XLSX') {
      if (report === 'BKVC') await xlsx.writeBkvc(data, targetPath);
      else await xlsx.writeTable(data, targetPath, { landscape: true });
    } else if (format === 'CSV') {
      const cols = report === 'BKVC' ? BKVC_CSV : data.columns;
      const rows = report === 'BKVC' ? data.lines.map((l) => ({ ...l })) : data.rows;
      fs.writeFileSync(targetPath, toCsv(cols, rows));
    } else if (format === 'HTML' || format === 'PDF') {
      const page = report === 'BKVC' ? html.bkvc(data) : html.table(data, { landscape: true });
      if (format === 'HTML') fs.writeFileSync(targetPath, page);
      else {
        if (!this.pdfRenderer) throw new AppError('INTERNAL', 'Chưa có bộ in PDF');
        fs.writeFileSync(targetPath, await this.pdfRenderer(page, { landscape: report !== 'BKVC' }));
      }
    } else throw new AppError('VALIDATION_FAILED', `Định dạng không hỗ trợ: ${format}`);
    return { path: targetPath, sizeBytes: fs.statSync(targetPath).size, data };
  }
}

const INVOICE_COLUMNS = [['STT', 'seq', 'int'], ['Tên hàng hóa, dịch vụ (diễn giải)', 'description', 'text'], ['ĐVT', 'uom', 'text'], ['Số lượng', 'qty', 'dec2'],
  ['Đơn giá', 'unit_price', 'money'], ['Thành tiền', 'amount', 'money'], ['Thuế suất (%)', 'vat_rate_pct', 'dec1'], ['Tiền thuế GTGT', 'vat', 'money'], ['Tổng cộng', 'total', 'money']]
  .map(([header, key, fmt]) => ({ header, key, fmt }));
const fillTemplate = (t, v) => t.replace(/\{(BKS_LIEN|BKS|TUYEN|MA_TUYEN|TU_NGAY|DEN_NGAY|DIEM_DI|DIEM_DEN)\}/g, (_, k) => v[k] ?? '');
/** Điểm đi / điểm đến của tuyến: cột from_place / to_place (sửa được trong danh mục tuyến); trống → tách tên tuyến "A - B". */
function routePlaces(route, code) {
  const name = route?.route_name || code; const [a, ...b] = name.split(/\s+-\s+/);
  return { TUYEN: name, DIEM_DI: (route?.from_place || '').trim() || a, DIEM_DEN: (route?.to_place || '').trim() || (b.length ? b.join(' - ') : a) };
}

const BKVC_CSV = [['STT', 'seq', 'int'], ['Biển số xe', 'plate_no', 'text'], ['Số chuyến', 'trip_count', 'int'], ['Khối lượng (KG)', 'kg', 'int'], ['Khối lượng (Tấn)', 'ton', 'dec2'],
  ['Đơn giá', 'unit_price', 'money'], ['Thành tiền', 'amount', 'money'], ['VAT', 'vat', 'money'], ['Thành tiền sau VAT', 'amount_incl_vat', 'money'], ['Ghi chú', 'note', 'text']]
  .map(([header, key, fmt]) => ({ header, key, fmt }));

module.exports = { ReportService, PRICING_COLUMNS, BKCT_COLUMNS, INVOICE_COLUMNS, fillTemplate, dmy };
