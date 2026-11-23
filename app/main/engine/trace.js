'use strict';
/** Chuỗi "XEM CHI TIẾT TÍNH" (API_DESIGN §7): mỗi bước = công thức chữ + thay số + kết quả chưa làm tròn hiển thị. */

function fmt(x, d = 0) {
  if (x === null || x === undefined) return '—';
  const neg = x < 0;
  const [i, f] = Math.abs(x).toFixed(d).split('.');
  const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + (f ? `${ii},${f}` : ii);
}
const dec = (x) => (Number.isInteger(x) ? 0 : 2);

function buildFormulaTrace(r, cfg) {
  const m3 = r.uom === 'M3'; // uom của kết quả = ĐVT của DÒNG giá có cờ, dòng cũ = ĐVT tuyến
  const oil3 = !!r.basisM3; // công thức theo giá dầu tính theo m³ (chia Thể tích TB / tổng m³)
  const uomStr = m3 ? 'đ/m³' : 'đ/tấn';
  if (r.priceMethod === 'CO_DINH') {
    const steps = [
      ['fixedPrice', 'Đơn giá cố định', 'Bảng giá (phương thức ĐƠN GIÁ CỐ ĐỊNH)', `phiên bản ${r.priceId}`, r.fixedPrice, uomStr],
      ['tripCount', 'Số chuyến', 'số phiếu cân', `${r.tripCount} phiếu`, r.tripCount, 'chuyến', 'calc.tickets'],
      ['totalTon', 'Tổng khối lượng', m3 ? 'Σ m³ quy đổi từ danh sách xe' : 'Σ KL hàng (KG) / 1000', m3 ? `${fmt(r.totalM3 != null ? r.totalM3 : r.totalTon, 2)} m³` : `${fmt(r.totalKg, dec(r.totalKg))} / 1000`, m3 && r.totalM3 != null ? r.totalM3 : r.totalTon, m3 ? 'm³' : 'tấn', 'calc.tickets'],
      ['transportPrice', 'Đơn giá vận chuyển', '= Đơn giá cố định (không tính chênh lệch dầu, không làm tròn lại)', fmt(r.fixedPrice, dec(r.fixedPrice)), r.transportPrice, uomStr],
    ];
    return { version: 1, priceMethod: 'CO_DINH', routeCode: r.routeCode, priceId: r.priceId,
      steps: steps.map(([key, label, formula, expr, value, unit, drill]) => (drill ? { key, label, formula, expr, value, unit, drill } : { key, label, formula, expr, value, unit })) };
  }
  const steps = [
    // ── CÔNG THỨC 1: TÍNH ĐƠN GIÁ DỰ KIẾN KÝ HỢP ĐỒNG (Bóc tách dầu cơ sở) ──
    ['tripPrice', 'ĐG 1 chuyến', `Đơn giá mới × ${m3 ? 'Thể tích TB' : 'KL_TB'}`, `${fmt(r.newPrice)} × ${fmt(m3 ? r.avgVolumeM3 : r.avgLoadTon, m3 ? 2 : 0)}`, r.tripPrice, 'đ/chuyến', null, 1],
    ['fuelPerTrip', 'Tiêu hao NL/chuyến', 'Cự ly chuyến × Định mức (lít/km)', `${fmt(r.tripDistanceKm)} × ${fmt(r.fuelNormLPerKm, 1)}`, r.fuelPerTrip, 'lít', null, 1],
    ['fuelCostPerTrip', 'Tiền dầu/chuyến', 'ĐG dầu chưa VAT (danh mục) × Tiêu hao NL/chuyến', `${fmt(r.fuelPriceCatalog)} × ${fmt(r.fuelPerTrip, 1)}`, r.fuelCostPerTrip, 'đ', null, 1],
    ['fuelCostRatio', 'Tỷ lệ tiêu hao dầu', 'Tiền dầu / ĐG 1 chuyến', `${fmt(r.fuelCostPerTrip)} / ${fmt(r.tripPrice)}`, r.fuelCostRatio, '%', null, 1],
    ['priceNoDiesel', 'ĐGVC chưa diesel', `(ĐG 1 chuyến − Tiền dầu) / ${oil3 ? 'Thể tích TB' : 'KL_TB'}`, `(${fmt(r.tripPrice)} − ${fmt(r.fuelCostPerTrip)}) / ${oil3 ? fmt(r.avgVolumeM3, 2) : fmt(r.avgLoadTon)}`, r.priceNoDiesel, uomStr, null, 1],
    r.isManualContractPrice
      ? ['contractPrice', 'ĐG ký HĐ (Điền thủ công)', 'Số thỏa thuận chốt hợp đồng (không bắt buộc bằng công thức)', `Thủ công: ${fmt(r.contractPrice)} (công thức tham khảo: ${fmt(r.formulaContractPrice)})`, r.contractPrice, uomStr, null, 1]
      : ['contractPrice', 'ĐG ký HĐ (Mặc định tự tính)', `ROUND(ĐGVC chưa diesel; ${cfg.roundContractDigits}) [${cfg.roundPriceMode}]`, `ROUND(${fmt(r.priceNoDiesel, 2)}; ${cfg.roundContractDigits})`, r.contractPrice, uomStr, null, 1],

    // ── CÔNG THỨC 2: TÍNH GIÁ KHI THỰC HIỆN KỲ (Liên hoàn bù trừ chênh lệch dầu) ──
    ['tripCount', 'Số chuyến thực tế', 'số phiếu cân', `${r.tripCount} phiếu`, r.tripCount, 'chuyến', 'calc.tickets', 2],
    oil3 ? ['totalTon', 'Tổng thể tích thực tế', 'Σ m³ từng chuyến (thể tích thùng xe; xe chưa khai thì Thể tích TB)', `${r.tripCount} chuyến`, r.totalM3, 'm³', 'calc.tickets', 2]
      : ['totalTon', 'Tổng khối lượng thực tế', 'Σ KL hàng (KG) / 1000', `${fmt(r.totalKg, dec(r.totalKg))} / 1000`, r.totalTon, 'tấn', 'calc.tickets', 2],
    ['actualFuelLiter', 'Dầu thực nhận', 'Σ số lượng bảng kê dầu của hợp đồng',
      r.fuelLineCount ? `Σ ${r.fuelLineCount} dòng (${r.fuelStartDate} → ${r.fuelEndDate})` : '0 (xác nhận không có dầu)', r.actualFuelLiter, 'lít', 'calc.fuel', 2],
    ['fuelPrice', 'Đơn giá dầu thực tế', cfg.fuelPriceMethod === 'WEIGHTED' ? 'Bình quân gia quyền theo lít (chưa VAT)' : 'Trung bình cộng đơn giá các dòng dương (chưa VAT; dòng bù trừ âm chỉ trừ lít)',
      r.fuelLineCount ? `TB(${r.fuelLineCount} dòng)` : 'nhập khi xác nhận', r.fuelPrice, 'đ/lít', 'calc.fuel', 2],
    ['standardFuelLiter', 'Dầu định mức kỳ', 'Cự ly chuyến × Số chuyến × Định mức', `${fmt(r.tripDistanceKm)} × ${r.tripCount} × ${fmt(r.fuelNormLPerKm, 1)}`, r.standardFuelLiter, 'lít', null, 2],
    ['fuelDiffLiter', 'Chênh lệch dầu', 'Dầu định mức − Dầu thực nhận', `${fmt(r.standardFuelLiter, 2)} − ${fmt(r.actualFuelLiter, 2)}`, r.fuelDiffLiter, 'lít', null, 2],
    ['fuelAdjustPrice', 'ĐG CL Diesel', `Chênh lệch × Đơn giá dầu / ${oil3 ? 'Tổng m³' : 'Tổng tấn'}`, `${fmt(r.fuelDiffLiter, 2)} × ${fmt(r.fuelPrice, 2)} / ${fmt(oil3 ? r.totalM3 : r.totalTon, 2)}`, r.fuelAdjustPrice, oil3 ? 'đ/m³' : 'đ/tấn', null, 2],
    ['transportPriceRaw', 'ĐG VC trước làm tròn', 'ĐG ký HĐ (từ CT1) + ĐG CL Diesel (từ CT2)', `${fmt(r.contractPrice)} + ${fmt(r.fuelAdjustPrice, 2)}`, r.transportPriceRaw, uomStr, null, 2],
    ['transportPrice', 'ĐƠN GIÁ VC THỰC HIỆN', `< 0 → 0; ngược lại ROUND(…; ${cfg.roundFinalDigits}) [${cfg.roundPriceMode}]`,
      r.transportPriceFloored ? `${fmt(r.transportPriceRaw, 2)} < 0 → 0` : `ROUND(${fmt(r.transportPriceRaw, 2)}; ${cfg.roundFinalDigits})`, r.transportPrice, uomStr, null, 2],
  ];
  return {
    version: 1, routeCode: r.routeCode, priceId: r.priceId,
    steps: steps.map(([key, label, formula, expr, value, unit, drill, part]) => ({ key, label, formula, expr, value, unit, ...(drill ? { drill } : {}), ...(part ? { part } : {}) })),
  };
}

module.exports = { buildFormulaTrace, fmt };
