'use strict';
/**
 * Các công thức nghiệp vụ — mỗi công thức 1 hàm thuần (không đọc file, không phụ thuộc giao diện).
 * Nguồn: CALCULATION_RULES.md (v5) — chuyển từ Power Query QR_DATA (2), TBL_GIAONHANDAU (2), QR_DGVC (2).
 *
 * LƯU Ý THỨ TỰ PHÉP TÍNH: giữ đúng thứ tự như Power Query (vd Cự ly chuyến × Số chuyến × Định mức,
 * rồi (CL × Đơn giá dầu) / Tổng tấn) để kết quả số thực trùng khớp tuyệt đối với Excel.
 */
const { roundDigits, int64PQ } = require('./rounding');

// ───────────────────────────── Tầng A — Đơn giá hợp đồng (QR_DATA (2)) ─────────────────────────────

/** §2.1 ĐG 1 chuyến = Đơn giá mới × (Thể tích TB nếu ĐVT = M3, ngược lại KL_TB). */
function calculateTripPrice({ newPrice, uom, avgLoadTon, avgVolumeM3 }) {
  return uom === 'M3' ? newPrice * avgVolumeM3 : newPrice * avgLoadTon;
}

/** §2.2 Tiêu hao NL chuyến (lít) = Cự ly chuyến × Định mức (lít/km). Định mức 0,4 = 40 lít/100km — KHÔNG chia 100. */
function calculateFuelConsumption({ tripDistanceKm, fuelNormLPerKm }) {
  return tripDistanceKm * fuelNormLPerKm;
}

/** §2.3 Tiền dầu / chuyến = ĐG dầu chưa VAT (danh mục) × Tiêu hao NL chuyến. */
function calculateFuelCost({ fuelPriceCatalog, fuelPerTrip }) {
  return fuelPriceCatalog * fuelPerTrip;
}

/** §2.4 Tỷ lệ tiêu hao dầu = Tiền dầu / ĐG 1 chuyến (chỉ để tham khảo). */
function calculateFuelCostRatio({ fuelCostPerTrip, tripPrice }) {
  return fuelCostPerTrip / tripPrice;
}

/** §2.5 ĐGVC chưa diesel = (ĐG 1 chuyến − Tiền dầu) / KL_TB — chia KL_TB kể cả tuyến M3 (như Excel). */
function calculatePriceNoDiesel({ tripPrice, fuelCostPerTrip, avgLoadTon }) {
  return (tripPrice - fuelCostPerTrip) / avgLoadTon;
}

/** §2.6 ĐG_HĐ = ROUND(ĐGVC chưa diesel, −3) — chế độ theo cấu hình (mặc định HALF_EVEN như Power Query). */
function calculateContractPrice({ priceNoDiesel }, cfg) {
  return roundDigits(priceNoDiesel, cfg.roundContractDigits, cfg.roundPriceMode);
}

/**
 * Tầng A đầy đủ cho 1 tuyến + 1 phiên bản giá.
 * Ép Int64 như Power Query (khi cfg.pqInt64Cast): Cự ly/chuyến, Đơn giá mới, ĐG dầu chưa VAT, KL_TB.
 * Định mức dầu và Thể tích TB giữ số thực.
 */
function computeContractPrice(route, price, cfg) {
  if (isFixedPrice(price)) return computeFixedPrice(route, price);
  const cast = cfg.pqInt64Cast ? int64PQ : (v) => v;
  const a = {
    uom: route.uom,
    tripDistanceKm: cast(route.trip_distance_km),
    newPrice: cast(price.new_price),
    fuelPriceCatalog: cast(price.fuel_price_excl_vat),
    avgLoadTon: cast(price.avg_load_ton),
    avgVolumeM3: price.avg_volume_m3,
    fuelNormLPerKm: price.fuel_norm_l_per_km,
  };
  a.tripPrice = calculateTripPrice(a);
  a.fuelPerTrip = calculateFuelConsumption(a);
  a.fuelCostPerTrip = calculateFuelCost(a);
  a.fuelCostRatio = calculateFuelCostRatio(a);
  a.priceNoDiesel = calculatePriceNoDiesel(a);
  a.contractPrice = calculateContractPrice(a, cfg);
  a.priceMethod = 'THEO_DAU';
  return a;
}

/** Phương thức giá của 1 phiên bản: CO_DINH = đơn giá cố định đ/tấn; trống / THEO_DAU = theo giá dầu (cách cũ). */
const isFixedPrice = (price) => !!price && price.price_method === 'CO_DINH';

/**
 * ĐƠN GIÁ CỐ ĐỊNH (bản 1.2.3, chốt 07/10/2026): Đơn giá VC = đơn giá cố định đ/tấn ghi trong bảng giá — không làm tròn lại,
 * không tính chênh lệch dầu (tuyến cố định không nhận dầu). Các chỉ tiêu dầu = 0 để bảng kết quả / snapshot giữ đủ cột.
 */
function computeFixedPrice(route, price) {
  const fixed = Number(price.fixed_price);
  return { priceMethod: 'CO_DINH', fixedPrice: fixed, uom: route.uom, tripDistanceKm: route.trip_distance_km,
    newPrice: 0, fuelPriceCatalog: 0, avgLoadTon: 0, avgVolumeM3: null, fuelNormLPerKm: 0,
    tripPrice: 0, fuelPerTrip: 0, fuelCostPerTrip: 0, fuelCostRatio: 0, priceNoDiesel: fixed, contractPrice: fixed };
}

// ───────────────────────────── Tầng B — Tổng hợp kỳ (QR_DGVC (2)) ─────────────────────────────

/** §4.1 Gom phiếu cân của 1 tuyến: số chuyến = số phiếu; tấn = KG / 1000; ngày đầu = min(ngày cân 1), ngày cuối = max(ngày cân 2). */
function aggregateTrips(tickets) {
  let totalKg = 0; let start = null; let end = null;
  for (const t of tickets) {
    totalKg += t.net_kg;
    if (start === null || t.weigh1_date < start) start = t.weigh1_date;
    if (end === null || t.weigh2_date > end) end = t.weigh2_date;
  }
  return { tripCount: tickets.length, totalKg, totalTon: calculateTotalTon(totalKg), startDate: start, endDate: end };
}

/** Tổng KL (Tấn) = Tổng KL (KG) / 1000. */
function calculateTotalTon(totalKg) {
  return totalKg / 1000;
}

/** §3.1 Dầu thực nhận = Σ số lượng (lít) các dòng bảng kê. */
function calculateActualFuel(receipts) {
  let s = 0;
  for (const r of receipts) s += r.qty_liter;
  return s;
}

/**
 * §3.1 Đơn giá dầu kỳ = TRUNG BÌNH CỘNG đơn giá các dòng DƯƠNG (đã chốt 24/09/2026; dòng bù trừ âm không tính — 05/10/2026), từng dòng ép Int64 như PQ.
 * (Tùy chọn WEIGHTED chỉ để tham khảo / thử nghiệm, không dùng mặc định.)
 */
function calculateFuelPrice(receipts, cfg) {
  if (!receipts.length) return null;
  const cast = cfg.pqInt64Cast ? int64PQ : (v) => v;
  if (cfg.fuelPriceMethod === 'WEIGHTED') {
    let q = 0; let m = 0;
    for (const r of receipts) { q += r.qty_liter; m += r.qty_liter * cast(r.fuel_price_excl_vat); }
    return m / q;
  }
  // dòng bù trừ (số lít âm) chỉ trừ lít, không kéo đơn giá trung bình (chốt 05/10/2026);
  // kỳ chỉ có dòng bù trừ → TB đơn giá các dòng bù trừ có ghi giá; không có → null (báo lỗi)
  const pos = receipts.filter((r) => r.qty_liter > 0);
  const use = pos.length ? pos : receipts.filter((r) => r.fuel_price_excl_vat > 0);
  if (!use.length) return null;
  let s = 0;
  for (const r of use) s += cast(r.fuel_price_excl_vat);
  return s / use.length;
}

/** §3.1 Gom dầu theo (Đơn vị giao, ĐVT) như Table.Group của PQ — trả nhiều nhóm để phát hiện nhân dòng. */
function aggregateFuel(receipts, cfg) {
  const groups = new Map();
  for (const r of receipts) {
    const k = `${r.giver_unit_code}|${r.uom}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()].map(([k, rs]) => {
    const [giverUnitCode, uom] = k.split('|');
    let s = null; let e = null; let imp = null;
    for (const r of rs) {
      if (s === null || r.receive_date < s) s = r.receive_date;
      if (e === null || r.receive_date > e) e = r.receive_date;
      if (r.purchase_date && (imp === null || r.purchase_date > imp)) imp = r.purchase_date;
    }
    return { giverUnitCode, uom, lineCount: rs.length, actualFuelLiter: calculateActualFuel(rs), fuelPrice: calculateFuelPrice(rs, cfg),
             fuelStartDate: s, fuelEndDate: e, fuelImportDate: imp };
  });
}

/** §4.4 Dầu định mức (lít) = Cự ly chuyến × Số chuyến × Định mức. */
function calculateStandardFuel({ tripDistanceKm, tripCount, fuelNormLPerKm }) {
  return tripDistanceKm * tripCount * fuelNormLPerKm;
}

/** §4.5 Chênh lệch tiêu hao = Dầu định mức − Dầu thực nhận (dương: nhận thiếu → cộng vào giá). */
function calculateFuelDifference({ standardFuelLiter, actualFuelLiter }) {
  return standardFuelLiter - actualFuelLiter;
}

/** §4.6 ĐG CL Diesel (đ/tấn) = Chênh lệch × Đơn giá dầu / Tổng tấn. */
function calculateFuelAdjustment({ fuelDiffLiter, fuelPrice, totalTon }) {
  return fuelDiffLiter * fuelPrice / totalTon;
}

/** §4.7 Đơn giá VC = (ĐG_HĐ + ĐG CL Diesel < 0 → 0) ngược lại ROUND(…, −2). Điều kiện < 0 xét TRƯỚC khi làm tròn. */
function calculateTransportPrice({ contractPrice, fuelAdjustPrice }, cfg) {
  const raw = contractPrice + fuelAdjustPrice;
  const floored = cfg.floorTransportPriceAtZero && raw < 0;
  return { raw, floored, value: floored ? 0 : roundDigits(raw, cfg.roundFinalDigits, cfg.roundPriceMode) };
}

// ───────────────────────────── Tầng C — Bảng xác nhận khối lượng (BKVC) ─────────────────────────────

/** §5.2 Một dòng BKVC: Tấn = KG/1000; Thành tiền = ROUND(Tấn × Đơn giá, 0); VAT = ROUND(Thành tiền × VAT%, 0) (đã chốt: làm tròn đến đồng). */
/** VAT của hóa đơn = làm tròn(tổng tiền hàng × thuế suất) — cách phần mềm hóa đơn điện tử (MISA meInvoice) tính. */
function calculateInvoiceVat(totalAmount, vatRate, cfg) {
  return roundDigits(totalAmount * vatRate, cfg.roundMoneyDigits, cfg.roundMoneyMode);
}

function calculateConfirmationLine({ kg, unitPrice, vatRate }, cfg) {
  const ton = kg / 1000;
  const amount = roundDigits(ton * unitPrice, cfg.roundMoneyDigits, cfg.roundMoneyMode);
  const vat = roundDigits(amount * vatRate, cfg.roundMoneyDigits, cfg.roundMoneyMode);
  return { ton, amount, vat, amountInclVat: amount + vat };
}

module.exports = {
  calculateTripPrice, calculateFuelConsumption, calculateFuelCost, calculateFuelCostRatio, calculatePriceNoDiesel,
  calculateContractPrice, computeContractPrice, computeFixedPrice, isFixedPrice,
  aggregateTrips, calculateTotalTon, calculateActualFuel, calculateFuelPrice, aggregateFuel,
  calculateStandardFuel, calculateFuelDifference, calculateFuelAdjustment, calculateTransportPrice,
  calculateConfirmationLine, calculateInvoiceVat,
};
