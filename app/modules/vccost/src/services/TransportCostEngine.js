'use strict';
/**
 * TRANSPORT_COST_ENGINE — nơi DUY NHẤT tính tiền vận chuyển. Giao diện không tự tính.
 *
 * Input  : phiếu cân + ngữ cảnh (xe→đơn vị, tuyến, bảng giá, cấu hình).
 * Output : KL tấn, bảng giá dùng (price_rule_id), đơn giá, tiền trước VAT, VAT, tổng, trạng thái + cảnh báo.
 *
 * Hai cấp làm tròn (cấu hình settings.roundingLevel):
 *   'TICKET' : làm tròn từng phiếu rồi cộng (khớp chứng từ từng phiếu).
 *   'GROUP'  : cộng KG theo nhóm (xe / đơn vị / bảng kê) rồi mới nhân giá & làm tròn
 *              (đây là cách file Excel mẫu đang làm: SUMIFS KG → /1000 → × đơn giá → × 8%).
 */
const { D, applyRule, sum } = require('../utils/money');
const { resolvePrice } = require('./PriceResolver');
const { datePart } = require('../utils/datetime');

const DEFAULT_SETTINGS = {
  roundingLevel: 'GROUP',
  rounding: {
    unitPrice: null,                       // đơn giá đã được làm tròn ở bảng giá
    amount: null,                          // null = không làm tròn (giống Excel mẫu)
    vat: null,
    total: null,
  },
  defaultVatPercent: null,                 // KHÔNG mặc định 8% — phải lấy từ bảng giá/cấu hình
};

function amountFor(unit, kg, price) {
  if (unit === 'DONG_TAN') return D(kg).div(1000).mul(price);
  if (unit === 'DONG_CHUYEN') return D(price);
  throw new Error(`Đơn vị tính giá chưa hỗ trợ: ${unit}`);
}

/**
 * Tính 1 phiếu.
 * @param {object} t   phiếu: {id, so_phieu, ngay_gio_can_1, bien_so, kl_hang_kg, noi_xuat_id, noi_den_id, loai_hang, locked_snapshot?}
 * @param {object} ctx {vehicleResolver, routeResolver, priceRules, settings}
 */
function computeTicket(t, ctx) {
  const s = mergeSettings(ctx.settings);
  const warnings = [];
  const out = {
    ticket_id: t.id, so_phieu: t.so_phieu, kl_hang_kg: t.kl_hang_kg,
    kl_hang_tan: D(t.kl_hang_kg || 0).div(1000).toNumber(),
    don_vi_van_chuyen_id: null, tuyen_id: null, price_rule_id: null,
    don_gia: null, don_vi_tinh: null, vat_percent: null,
    tien_truoc_vat: null, tien_vat: null, tong_tien: null,
    status: 'OK', warnings,
  };

  // Phiếu đã chốt: trả snapshot, KHÔNG tính lại.
  if (t.locked_snapshot) return { ...out, ...t.locked_snapshot, status: 'LOCKED', warnings };

  if (!(Number(t.kl_hang_kg) > 0)) warnings.push('INVALID_WEIGHT');
  if (!t.ngay_gio_can_1) warnings.push('INVALID_TIME');

  const date = datePart(t.ngay_gio_can_1);
  const v = ctx.vehicleResolver.resolve(t.bien_so, date);
  if (v.status !== 'OK') warnings.push(v.status);
  out.don_vi_van_chuyen_id = v.carrierId;

  const r = ctx.routeResolver(t.noi_xuat_id, t.noi_den_id);
  if (!r || r.status !== 'OK') warnings.push('UNKNOWN_LOCATION');
  out.tuyen_id = r ? r.routeId : null;

  if (out.tuyen_id && date) {
    const p = resolvePrice({ routeId: out.tuyen_id, carrierId: v.carrierId, goodsType: t.loai_hang ?? null, date }, ctx.priceRules);
    if (p.status !== 'OK') warnings.push(p.status);
    else {
      const rule = p.rule;
      out.price_rule_id = rule.id;
      out.don_gia = applyRule(rule.don_gia_ap_dung, s.rounding.unitPrice).toNumber();
      out.don_vi_tinh = rule.don_vi_tinh;
      out.vat_percent = rule.vat_percent ?? s.defaultVatPercent;
      if (out.vat_percent === null || out.vat_percent === undefined) warnings.push('NO_VAT_RATE');
    }
  }

  if (out.don_gia !== null && out.vat_percent !== null && out.vat_percent !== undefined && Number(t.kl_hang_kg) > 0) {
    const amt = applyRule(amountFor(out.don_vi_tinh, t.kl_hang_kg, out.don_gia), s.rounding.amount);
    const vat = applyRule(amt.mul(out.vat_percent).div(100), s.rounding.vat);
    out.tien_truoc_vat = amt.toNumber();
    out.tien_vat = vat.toNumber();
    out.tong_tien = applyRule(amt.plus(vat), s.rounding.total).toNumber();
  }

  const blocking = ['INVALID_WEIGHT', 'INVALID_TIME', 'UNKNOWN_VEHICLE', 'UNKNOWN_CARRIER', 'AMBIGUOUS_VEHICLE',
    'UNKNOWN_LOCATION', 'NO_PRICE', 'MULTIPLE_PRICE', 'NO_VAT_RATE'];
  const firstBlocking = warnings.find((w) => blocking.includes(w));
  if (firstBlocking) out.status = firstBlocking;
  return out;
}

/**
 * Tổng hợp kết quả theo khóa nhóm (theo xe / đơn vị / nơi xuất ...).
 * Mỗi nhóm có thể có nhiều mức giá → tách dòng con theo (price_rule_id, đơn giá, VAT) rồi cộng.
 */
function aggregate(results, keyFn, settings) {
  const s = mergeSettings(settings);
  const groups = new Map();
  for (const r of results) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const priced = list.filter((x) => x.tien_truoc_vat !== null);
    const sub = new Map();
    for (const x of priced) {
      const sk = `${x.price_rule_id}|${x.don_gia}|${x.vat_percent}|${x.don_vi_tinh}`;
      if (!sub.has(sk)) sub.set(sk, []);
      sub.get(sk).push(x);
    }
    let amount = D(0), vat = D(0), total = D(0);
    const prices = [];
    for (const [, xs] of sub) {
      const { don_gia, vat_percent, don_vi_tinh } = xs[0];
      prices.push(don_gia);
      if (s.roundingLevel === 'GROUP') {
        const kg = sum(xs.map((x) => x.kl_hang_kg));
        const a = applyRule(don_vi_tinh === 'DONG_TAN' ? kg.div(1000).mul(don_gia) : D(don_gia).mul(xs.length), s.rounding.amount);
        const v = applyRule(a.mul(vat_percent).div(100), s.rounding.vat);
        amount = amount.plus(a); vat = vat.plus(v); total = total.plus(applyRule(a.plus(v), s.rounding.total));
      } else {
        amount = amount.plus(sum(xs.map((x) => x.tien_truoc_vat)));
        vat = vat.plus(sum(xs.map((x) => x.tien_vat)));
        total = total.plus(sum(xs.map((x) => x.tong_tien)));
      }
    }
    const kgAll = sum(list.map((x) => x.kl_hang_kg));
    rows.push({
      key,
      so_chuyen: list.length,
      so_chuyen_chua_tinh_gia: list.length - priced.length,
      tong_kg: kgAll.toNumber(),
      tong_tan: kgAll.div(1000).toNumber(),
      don_gia: [...new Set(prices)].sort((a, b) => a - b),
      tien_truoc_vat: amount.toNumber(),
      tien_vat: vat.toNumber(),
      tong_tien: total.toNumber(),
    });
  }
  return rows;
}

function mergeSettings(st) {
  const s = st || {};
  return { ...DEFAULT_SETTINGS, ...s, rounding: { ...DEFAULT_SETTINGS.rounding, ...(s.rounding || {}) } };
}

module.exports = { computeTicket, aggregate, DEFAULT_SETTINGS };
