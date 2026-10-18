'use strict';
/**
 * BẢNG KÊ THANH TOÁN — mỗi đơn vị vận chuyển 1 bảng kê / 1 hóa đơn riêng (chốt 06–07/10/2026).
 *
 * Làm tròn THEO BẢNG KÊ (BR-ROUND-01):
 *   - 1 bảng kê = 1 đơn vị VC × phạm vi (đợt/tàu hoặc khoảng ngày) — người gọi lọc trước.
 *   - Mỗi DÒNG = (tuyến, đơn giá, đơn vị tính, VAT%):
 *        KL tấn dòng = Σ KG / 1000
 *        Thành tiền  = ROUND(KL tấn × đơn giá, rounding.lineAmount)      (mặc định: đến đồng)
 *   - VAT tính 1 LẦN trên tổng thành tiền cùng thuế suất:
 *        VAT = ROUND(Σ thành tiền × VAT%, rounding.vat)                   (mặc định: đến đồng)
 *   - Tổng thanh toán = Σ thành tiền + Σ VAT.
 *   - Phiếu chưa tính được giá KHÔNG vào bảng kê, đếm ở so_chuyen_chua_tinh_gia.
 * Chi tiết theo xe (vehicles) là số PHÂN BỔ chưa làm tròn — chỉ tham khảo.
 *
 * buildStatement(results, { rounding: {lineAmount:{digits,mode}, vat:{digits,mode}}, routeLabel: id => text })
 */
const { D, applyRule, sum } = require('../utils/money');

const DEFAULT_ROUNDING = {
  lineAmount: { digits: 0, mode: 'HALF_UP' },
  vat: { digits: 0, mode: 'HALF_UP' },
};

const isPriced = (r) => r.don_gia !== null && r.don_gia !== undefined && r.vat_percent !== null && r.vat_percent !== undefined
  && Number(r.kl_hang_kg) > 0 && (!r.status || r.status === 'OK' || r.status === 'LOCKED');

function rawAmount(unit, kg, price, trips) {
  return (unit || 'DONG_TAN') === 'DONG_CHUYEN' ? D(price).mul(trips) : D(kg).div(1000).mul(price);
}

function buildStatement(results, opt = {}) {
  const rounding = { ...DEFAULT_ROUNDING, ...(opt.rounding || {}) };
  const label = opt.routeLabel || ((id) => (id == null ? '' : String(id)));
  const priced = results.filter(isPriced);

  // ---- dòng bảng kê
  const map = new Map();
  for (const r of priced) {
    const k = `${r.tuyen_id}|${r.don_gia}|${r.don_vi_tinh || 'DONG_TAN'}|${r.vat_percent}`;
    if (!map.has(k)) map.set(k, { tuyen_id: r.tuyen_id, tuyen: label(r.tuyen_id), don_gia: Number(r.don_gia), don_vi_tinh: r.don_vi_tinh || 'DONG_TAN', vat_percent: Number(r.vat_percent), items: [] });
    map.get(k).items.push(r);
  }
  const lines = [...map.values()].map((l) => {
    const kg = sum(l.items.map((x) => x.kl_hang_kg));
    const raw = rawAmount(l.don_vi_tinh, kg, l.don_gia, l.items.length);
    return {
      tuyen_id: l.tuyen_id, tuyen: l.tuyen, don_gia: l.don_gia, don_vi_tinh: l.don_vi_tinh, vat_percent: l.vat_percent,
      so_xe: new Set(l.items.map((x) => x.bien_so)).size, so_chuyen: l.items.length,
      tong_kg: kg.toNumber(), tong_tan: kg.div(1000).toNumber(),
      thanh_tien_chua_lam_tron: raw.toNumber(),
      thanh_tien: applyRule(raw, rounding.lineAmount).toNumber(),
    };
  }).sort((a, b) => String(a.tuyen).localeCompare(String(b.tuyen)) || a.don_gia - b.don_gia);

  // ---- VAT theo thuế suất, tính trên tổng
  const byRate = new Map();
  for (const l of lines) byRate.set(l.vat_percent, D(byRate.get(l.vat_percent) || 0).plus(l.thanh_tien));
  const vatLines = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, amt]) => ({
    vat_percent: rate, thanh_tien: amt.toNumber(), tien_vat: applyRule(amt.mul(rate).div(100), rounding.vat).toNumber(),
  }));

  // ---- chi tiết theo xe (phân bổ, chưa làm tròn)
  const vmap = new Map();
  for (const r of results) {
    const k = r.bien_so || '(không biển số)';
    if (!vmap.has(k)) vmap.set(k, { bien_so: k, tuyenSet: new Set(), giaSet: new Set(), so_chuyen: 0, so_chuyen_chua_tinh_gia: 0, kg: D(0), amt: D(0), vat: D(0) });
    const v = vmap.get(k);
    if (isPriced(r)) {
      v.so_chuyen++; v.kg = v.kg.plus(r.kl_hang_kg || 0);
      const a = rawAmount(r.don_vi_tinh, r.kl_hang_kg, r.don_gia, 1);
      v.amt = v.amt.plus(a); v.vat = v.vat.plus(a.mul(r.vat_percent).div(100));
      v.tuyenSet.add(label(r.tuyen_id)); v.giaSet.add(Number(r.don_gia));
    } else v.so_chuyen_chua_tinh_gia++;
  }
  const vehicles = [...vmap.values()].sort((a, b) => a.bien_so.localeCompare(b.bien_so)).map((v) => ({
    bien_so: v.bien_so, tuyen: [...v.tuyenSet].join(', '),
    don_gia: v.giaSet.size === 1 ? [...v.giaSet][0] : [...v.giaSet].sort((a, b) => a - b).join(' / '),
    so_chuyen: v.so_chuyen, so_chuyen_chua_tinh_gia: v.so_chuyen_chua_tinh_gia,
    tong_kg: v.kg.toNumber(), tong_tan: v.kg.div(1000).toNumber(),
    thanh_tien: v.amt.toNumber(), tien_vat: v.vat.toNumber(), tong_tien: v.amt.plus(v.vat).toNumber(),
  }));

  const amountTotal = sum(lines.map((l) => l.thanh_tien));
  const vatTotal = sum(vatLines.map((v) => v.tien_vat));
  const kgPriced = sum(priced.map((r) => r.kl_hang_kg));
  return {
    lines, vatLines, vehicles,
    so_chuyen: priced.length,
    so_chuyen_chua_tinh_gia: results.length - priced.length,
    so_xe: new Set(priced.map((r) => r.bien_so)).size,
    tong_kg: kgPriced.toNumber(),
    tong_tan: kgPriced.div(1000).toNumber(),
    tien_truoc_vat: amountTotal.toNumber(),
    tien_vat: vatTotal.toNumber(),
    tong_tien: amountTotal.plus(vatTotal).toNumber(),
    rounding,
  };
}

module.exports = { isPriced, buildStatement, DEFAULT_STATEMENT_ROUNDING: DEFAULT_ROUNDING };
