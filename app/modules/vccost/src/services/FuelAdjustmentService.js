'use strict';
/**
 * FUEL ADJUSTMENT ENGINE — chuyển nguyên logic sheet "Giá dầu + Giá VC" thành hàm thuần.
 *
 * Excel gốc (khối NM Đại Hiệp):
 *   I.5  Lượng dầu/chuyến       = G33*0.35                 (khoảng cách × 35 lít/100km)
 *   I.6  Giá dầu kỳ hiện tại    = AVERAGE(B2:B7)           (bình quân giá dầu các ngày của kỳ tham chiếu)
 *   I.7  Chênh lệch giá dầu     = I.6 - I.2
 *   II.1 CP dầu chênh lệch/chuyến = I.5 × I.7
 *   II.2 Cước điều chỉnh/tấn    = ROUND(II.1 / I.4, 0)
 *   II.3 Làm tròn               = ROUND(II.2, -2)
 *   III.1 Đơn giá áp dụng       = I.1 + II.3
 *
 * KHÔNG hard-code 35 lít/100km, 19 tấn/chuyến, khoảng cách, làm tròn: tất cả là tham số.
 */
const { D, applyRule, sum } = require('../utils/money');

const DEFAULT_ROUNDING = {
  fuelAverage: null,                          // Excel AVERAGE không làm tròn
  adjustmentPerTon: { digits: 0, mode: 'HALF_UP' },   // ROUND(.,0)
  adjustmentFinal: { digits: -2, mode: 'HALF_UP' },   // ROUND(.,-2)
  appliedPrice: null,
};

/**
 * @param {object} p
 * @param {number} p.basePrice            Giá cước cơ sở (đồng/tấn)            — I.1
 * @param {number} p.baseFuelPrice        Giá dầu cơ sở (đồng/lít)             — I.2
 * @param {number} [p.currentFuelPrice]   Giá dầu kỳ hiện tại (đồng/lít)        — I.6 (hoặc truyền fuelPrices)
 * @param {number[]} [p.fuelPrices]       Danh sách giá dầu từng ngày để lấy bình quân
 * @param {number} p.distanceKm           Khoảng cách tính dầu (km, thường = 2 chiều)  — I.3
 * @param {number} p.fuelNormPer100km     Định mức tiêu hao (lít/100km)        — 35
 * @param {number} p.avgTonPerTrip        Khối lượng bình quân/chuyến (tấn)    — I.4
 * @param {object} [p.rounding]           Ghi đè quy tắc làm tròn
 * @returns {object} breakdown đầy đủ từng bước (để hiển thị + lưu vết)
 */
function computeFuelAdjustment(p) {
  const r = { ...DEFAULT_ROUNDING, ...(p.rounding || {}) };
  for (const k of ['basePrice', 'baseFuelPrice', 'distanceKm', 'fuelNormPer100km', 'avgTonPerTrip']) {
    if (p[k] === undefined || p[k] === null || isNaN(Number(p[k]))) throw new Error(`Thiếu tham số ${k}`);
  }
  if (Number(p.avgTonPerTrip) <= 0) throw new Error('Khối lượng bình quân/chuyến phải > 0');

  let current;
  if (Array.isArray(p.fuelPrices) && p.fuelPrices.length) {
    current = applyRule(sum(p.fuelPrices).div(p.fuelPrices.length), r.fuelAverage);
  } else if (p.currentFuelPrice !== undefined && p.currentFuelPrice !== null) {
    current = D(p.currentFuelPrice);
  } else {
    throw new Error('Thiếu giá dầu kỳ hiện tại (currentFuelPrice hoặc fuelPrices)');
  }

  const fuelLitPerTrip = D(p.distanceKm).mul(p.fuelNormPer100km).div(100);           // I.5
  const fuelDiff = current.minus(p.baseFuelPrice);                                    // I.7
  const costDiffPerTrip = fuelLitPerTrip.mul(fuelDiff);                               // II.1
  const adjPerTonRaw = costDiffPerTrip.div(p.avgTonPerTrip);
  const adjPerTon = applyRule(adjPerTonRaw, r.adjustmentPerTon);                      // II.2
  const adjFinal = applyRule(adjPerTon, r.adjustmentFinal);                           // II.3
  const applied = applyRule(D(p.basePrice).plus(adjFinal), r.appliedPrice);          // III.1

  return {
    basePrice: D(p.basePrice).toNumber(),
    baseFuelPrice: D(p.baseFuelPrice).toNumber(),
    currentFuelPrice: current.toNumber(),
    distanceKm: D(p.distanceKm).toNumber(),
    fuelNormPer100km: D(p.fuelNormPer100km).toNumber(),
    avgTonPerTrip: D(p.avgTonPerTrip).toNumber(),
    fuelLitPerTrip: fuelLitPerTrip.toNumber(),
    fuelDiff: fuelDiff.toNumber(),
    costDiffPerTrip: costDiffPerTrip.toNumber(),
    adjustmentPerTonRaw: adjPerTonRaw.toNumber(),
    adjustmentPerTon: adjPerTon.toNumber(),
    adjustmentFinal: adjFinal.toNumber(),
    appliedPrice: applied.toNumber(),
  };
}

/**
 * Đơn giá áp dụng TỰ TÍNH từ thông số bảng giá (người dùng chỉ nhập thông số).
 *  - CO_DINH: đơn giá = đơn giá gốc.
 *  - DIEU_CHINH_DAU: công thức Excel (computeFuelAdjustment) với giá dầu áp dụng.
 * @param {object} p {phuong_thuc, don_gia_goc, gia_dau_co_so, gia_dau_ap_dung, khoang_cach_km, dinh_muc_dau, khoi_luong_binh_quan, rounding}  (số thường, đ)
 * @returns {{appliedPrice:number, adjustment:number, breakdown:object|null}}
 */
function derivePrice(p) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const base = num(p.don_gia_goc);
  if (base === null || isNaN(base)) throw new Error('Thiếu đơn giá gốc');
  if (p.phuong_thuc !== 'DIEU_CHINH_DAU') return { appliedPrice: base, adjustment: 0, breakdown: null };
  const miss = [['gia_dau_co_so', 'giá dầu cơ sở'], ['gia_dau_ap_dung', 'giá dầu áp dụng'], ['khoang_cach_km', 'khoảng cách (km)'], ['dinh_muc_dau', 'định mức dầu'], ['khoi_luong_binh_quan', 'KL bình quân']]
    .filter(([k]) => num(p[k]) === null || isNaN(num(p[k]))).map(([, l]) => l);
  if (miss.length) throw new Error(`Phương thức điều chỉnh theo dầu cần nhập: ${miss.join(', ')}`);
  const b = computeFuelAdjustment({
    basePrice: base, baseFuelPrice: num(p.gia_dau_co_so), currentFuelPrice: num(p.gia_dau_ap_dung),
    distanceKm: num(p.khoang_cach_km), fuelNormPer100km: num(p.dinh_muc_dau), avgTonPerTrip: num(p.khoi_luong_binh_quan), rounding: p.rounding,
  });
  return { appliedPrice: b.appliedPrice, adjustment: b.adjustmentFinal, breakdown: b };
}

module.exports = { computeFuelAdjustment, derivePrice, DEFAULT_ROUNDING };
