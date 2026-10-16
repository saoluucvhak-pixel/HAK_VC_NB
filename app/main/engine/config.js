'use strict';
/** Đọc bảng CONFIG (danh sách {config_key, config_value, value_type}) thành cấu hình Engine có kiểu. Không hard-code tham số nghiệp vụ. */

const DEFAULTS = {
  ROUND_CONTRACT_DIGITS: '-3', ROUND_FINAL_DIGITS: '-2', ROUND_PRICE_MODE: 'HALF_EVEN', PQ_INT64_CAST: 'TRUE',
  FLOOR_TRANSPORT_PRICE_AT_ZERO: 'TRUE', ROUND_MONEY_DIGITS: '0', ROUND_MONEY_MODE: 'HALF_UP', VAT_RATE: '0.08',
  FUEL_PRICE_METHOD: 'AVERAGE', PERIOD_DATE_FIELD: 'WEIGH1_DATE', PRICE_VERSION_DATE: 'PERIOD_END',
  NO_FUEL_POLICY: 'BLOCK_WITH_OVERRIDE', MULTI_FUEL_GROUP_POLICY: 'BLOCK', BKVC_GROUP_BY: 'PLATE_ROUTE', BKVC_SORT: 'PLATE',
  KG_CHECK_TOLERANCE: '0', AMOUNT_WORDS_THOUSAND: 'ngàn', AMOUNT_WORDS_SUFFIX: 'đồng y ./.',
  INVOICE_DESC_TEMPLATE: 'Vận chuyển dăm gỗ từ {DIEM_DI} đến {DIEM_DEN} bằng xe thùng biển kiểm soát: {BKS_LIEN}',
  INVOICE_PAYMENT_METHOD: 'Chuyển khoản', VAT_ROUND_BASIS: 'LINE',
  VAT_RATE_OPTIONS: '0;0.05;0.08;0.1', VAT_RATE_SCHEDULE: '',
  SIGNER_PRIMARY_JSON: '{"name":"VÕ VĂN PHỤNG","title":"Giám đốc"}', SIGNER_SECONDARY_JSON: '{"name":"VÕ THỊ NHƯ NGỌC","title":"Phó Giám đốc"}',
};

/** Thuế suất GTGT mặc định cho kỳ có ngày cuối `date`: theo lịch VAT_RATE_SCHEDULE, không có lịch → VAT_RATE. */
function vatRateFor(cfg, date) {
  let r = cfg.vatRate;
  for (const x of cfg.vatSchedule || []) if (x.from <= date) r = x.rate;
  return r;
}

function buildConfig(configRows = []) {
  const raw = { ...DEFAULTS };
  for (const r of configRows) if (r.config_value !== '' && r.config_value != null) raw[r.config_key] = String(r.config_value);
  const num = (k) => { const v = Number(raw[k]); if (!Number.isFinite(v)) throw new Error(`CONFIG ${k} không phải số: ${raw[k]}`); return v; };
  const int = (k) => { const v = num(k); if (!Number.isInteger(v)) throw new Error(`CONFIG ${k} phải là số nguyên`); return v; };
  const bool = (k) => raw[k] === 'TRUE' || raw[k] === 'true';
  const oneOf = (k, allowed) => { if (!allowed.includes(raw[k])) throw new Error(`CONFIG ${k} = ${raw[k]} không hợp lệ (${allowed.join('/')})`); return raw[k]; };
  const rate = (k, v) => { const x = Number(String(v).trim().replace(',', '.').replace(/%$/, '')); const r = /%$/.test(String(v).trim()) || x > 1 ? x / 100 : x;
    if (!Number.isFinite(r) || r < 0 || r > 1) throw new Error(`CONFIG ${k}: thuế suất không hợp lệ "${v}"`); return Math.round(r * 10000) / 10000; };
  const vatRateOptions = String(raw.VAT_RATE_OPTIONS).split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((x) => rate('VAT_RATE_OPTIONS', x));
  // lịch thuế suất theo thời điểm: "2026-01-01=0.08; 2027-01-01=0.10" — kỳ tính lấy thuế suất có hiệu lực tại ngày cuối kỳ
  const vatSchedule = String(raw.VAT_RATE_SCHEDULE || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [d, v] = x.split('='); if (!/^\d{4}-\d{2}-\d{2}$/.test((d || '').trim())) throw new Error(`CONFIG VAT_RATE_SCHEDULE: ngày không hợp lệ "${x}" (dạng yyyy-MM-dd=0.08)`);
    return { from: d.trim(), rate: rate('VAT_RATE_SCHEDULE', v) }; }).sort((a, b) => (a.from < b.from ? -1 : 1));
  return Object.freeze({
    vatRateOptions, vatSchedule,
    roundContractDigits: int('ROUND_CONTRACT_DIGITS'),
    roundFinalDigits: int('ROUND_FINAL_DIGITS'),
    roundPriceMode: oneOf('ROUND_PRICE_MODE', ['HALF_EVEN', 'HALF_UP']),
    pqInt64Cast: bool('PQ_INT64_CAST'),
    floorTransportPriceAtZero: bool('FLOOR_TRANSPORT_PRICE_AT_ZERO'),
    roundMoneyDigits: int('ROUND_MONEY_DIGITS'),
    roundMoneyMode: oneOf('ROUND_MONEY_MODE', ['HALF_EVEN', 'HALF_UP']),
    vatRate: num('VAT_RATE'),
    vatRoundBasis: oneOf('VAT_ROUND_BASIS', ['LINE', 'TOTAL']),
    invoicePaymentMethod: raw.INVOICE_PAYMENT_METHOD,
    fuelPriceMethod: oneOf('FUEL_PRICE_METHOD', ['AVERAGE', 'WEIGHTED']),
    periodDateField: oneOf('PERIOD_DATE_FIELD', ['WEIGH1_DATE', 'WEIGH2_DATE']),
    priceVersionDate: oneOf('PRICE_VERSION_DATE', ['PERIOD_END', 'PERIOD_START']),
    noFuelPolicy: oneOf('NO_FUEL_POLICY', ['BLOCK_WITH_OVERRIDE', 'BLOCK']),
    multiFuelGroupPolicy: oneOf('MULTI_FUEL_GROUP_POLICY', ['BLOCK']),
    bkvcGroupBy: oneOf('BKVC_GROUP_BY', ['PLATE_ROUTE', 'PLATE']),
    bkvcSort: oneOf('BKVC_SORT', ['PLATE', 'TRIPS_DESC']),
    kgCheckTolerance: num('KG_CHECK_TOLERANCE'),
    amountWordsThousand: raw.AMOUNT_WORDS_THOUSAND,
    amountWordsSuffix: raw.AMOUNT_WORDS_SUFFIX,
    invoiceDescTemplate: raw.INVOICE_DESC_TEMPLATE,
    signerPrimary: JSON.parse(raw.SIGNER_PRIMARY_JSON),
    signerSecondary: JSON.parse(raw.SIGNER_SECONDARY_JSON),
  });
}

module.exports = { buildConfig, vatRateFor, DEFAULTS };
