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
  if (r.priceMethod === 'CO_DINH') {
    const steps = [
      ['fixedPrice', 'Đơn giá cố định', 'Bảng giá (phương thức ĐƠN GIÁ CỐ ĐỊNH)', `phiên bản ${r.priceId}`, r.fixedPrice, 'đ/tấn'],
      ['tripCount', 'Số chuyến', 'số phiếu cân', `${r.tripCount} phiếu`, r.tripCount, 'chuyến', 'calc.tickets'],
      ['totalTon', 'Tổng khối lượng', 'Σ KL hàng (KG) / 1000', `${fmt(r.totalKg, dec(r.totalKg))} / 1000`, r.totalTon, 'tấn', 'calc.tickets'],
      ['transportPrice', 'Đơn giá vận chuyển', '= Đơn giá cố định (không tính chênh lệch dầu, không làm tròn lại)', fmt(r.fixedPrice, dec(r.fixedPrice)), r.transportPrice, 'đ/tấn'],
    ];
    return { version: 1, priceMethod: 'CO_DINH', routeCode: r.routeCode, priceId: r.priceId,
      steps: steps.map(([key, label, formula, expr, value, unit, drill]) => (drill ? { key, label, formula, expr, value, unit, drill } : { key, label, formula, expr, value, unit })) };
  }
  const m3 = r.uom === 'M3';
  const steps = [
    ['tripPrice', 'ĐG 1 chuyến', `Đơn giá mới × ${m3 ? 'Thể tích TB' : 'KL_TB'}`, `${fmt(r.newPrice)} × ${fmt(m3 ? r.avgVolumeM3 : r.avgLoadTon, m3 ? 2 : 0)}`, r.tripPrice, 'đ/chuyến'],
    ['fuelPerTrip', 'Tiêu hao NL/chuyến', 'Cự ly chuyến × Định mức (lít/km)', `${fmt(r.tripDistanceKm)} × ${fmt(r.fuelNormLPerKm, 1)}`, r.fuelPerTrip, 'lít'],
    ['fuelCostPerTrip', 'Tiền dầu/chuyến', 'ĐG dầu chưa VAT (danh mục) × Tiêu hao NL/chuyến', `${fmt(r.fuelPriceCatalog)} × ${fmt(r.fuelPerTrip, 1)}`, r.fuelCostPerTrip, 'đ'],
    ['fuelCostRatio', 'Tỷ lệ tiêu hao dầu', 'Tiền dầu / ĐG 1 chuyến', `${fmt(r.fuelCostPerTrip)} / ${fmt(r.tripPrice)}`, r.fuelCostRatio, '%'],
    ['priceNoDiesel', 'ĐGVC chưa diesel', '(ĐG 1 chuyến − Tiền dầu) / KL_TB', `(${fmt(r.tripPrice)} − ${fmt(r.fuelCostPerTrip)}) / ${fmt(r.avgLoadTon)}`, r.priceNoDiesel, 'đ/tấn'],
    ['contractPrice', 'ĐG HĐ', `ROUND(ĐGVC chưa diesel; ${cfg.roundContractDigits}) [${cfg.roundPriceMode}]`, `ROUND(${fmt(r.priceNoDiesel, 2)}; ${cfg.roundContractDigits})`, r.contractPrice, 'đ/tấn'],
    ['tripCount', 'Số chuyến', 'số phiếu cân', `${r.tripCount} phiếu`, r.tripCount, 'chuyến', 'calc.tickets'],
    ['totalTon', 'Tổng khối lượng', 'Σ KL hàng (KG) / 1000', `${fmt(r.totalKg, dec(r.totalKg))} / 1000`, r.totalTon, 'tấn', 'calc.tickets'],
    ['actualFuelLiter', 'Dầu thực nhận', 'Σ số lượng bảng kê dầu của hợp đồng',
      r.fuelLineCount ? `Σ ${r.fuelLineCount} dòng (${r.fuelStartDate} → ${r.fuelEndDate})` : '0 (xác nhận không có dầu)', r.actualFuelLiter, 'lít', 'calc.fuel'],
    ['fuelPrice', 'Đơn giá dầu', cfg.fuelPriceMethod === 'WEIGHTED' ? 'Bình quân gia quyền theo lít (chưa VAT)' : 'Trung bình cộng đơn giá các dòng dương (chưa VAT; dòng bù trừ âm chỉ trừ lít)',
      r.fuelLineCount ? `TB(${r.fuelLineCount} dòng)` : 'nhập khi xác nhận', r.fuelPrice, 'đ/lít', 'calc.fuel'],
    ['standardFuelLiter', 'Dầu định mức', 'Cự ly chuyến × Số chuyến × Định mức', `${fmt(r.tripDistanceKm)} × ${r.tripCount} × ${fmt(r.fuelNormLPerKm, 1)}`, r.standardFuelLiter, 'lít'],
    ['fuelDiffLiter', 'Chênh lệch dầu', 'Dầu định mức − Dầu thực nhận', `${fmt(r.standardFuelLiter, 2)} − ${fmt(r.actualFuelLiter, 2)}`, r.fuelDiffLiter, 'lít'],
    ['fuelAdjustPrice', 'ĐG CL Diesel', 'Chênh lệch × Đơn giá dầu / Tổng tấn', `${fmt(r.fuelDiffLiter, 2)} × ${fmt(r.fuelPrice, 2)} / ${fmt(r.totalTon, 2)}`, r.fuelAdjustPrice, 'đ/tấn'],
    ['transportPriceRaw', 'ĐG VC trước làm tròn', 'ĐG HĐ + ĐG CL Diesel', `${fmt(r.contractPrice)} + ${fmt(r.fuelAdjustPrice, 2)}`, r.transportPriceRaw, 'đ/tấn'],
    ['transportPrice', 'Đơn giá vận chuyển', `< 0 → 0; ngược lại ROUND(…; ${cfg.roundFinalDigits}) [${cfg.roundPriceMode}]`,
      r.transportPriceFloored ? `${fmt(r.transportPriceRaw, 2)} < 0 → 0` : `ROUND(${fmt(r.transportPriceRaw, 2)}; ${cfg.roundFinalDigits})`, r.transportPrice, 'đ/tấn'],
  ];
  return {
    version: 1, routeCode: r.routeCode, priceId: r.priceId,
    steps: steps.map(([key, label, formula, expr, value, unit, drill]) => (drill ? { key, label, formula, expr, value, unit, drill } : { key, label, formula, expr, value, unit })),
  };
}

module.exports = { buildFormulaTrace, fmt };
