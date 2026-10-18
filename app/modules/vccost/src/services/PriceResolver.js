'use strict';
/**
 * Tra bảng giá theo: tuyến + (đơn vị VC) + (loại hàng) + ngày cân.
 *
 * Quy tắc (BUSINESS_RULES BR-PRICE-*):
 *  - Bảng giá phải có tu_ngay; den_ngay null = còn hiệu lực.
 *  - Chỉ lấy bảng giá trang_thai = 'ACTIVE'.
 *  - Ngày cân (ngày của ngay_gio_can_1) phải nằm trong [tu_ngay, den_ngay].
 *  - Độ ưu tiên XÁC ĐỊNH (không tùy ý): bảng giá gắn đúng đơn vị VC > bảng giá chung (carrier null);
 *    gắn đúng loại hàng > loại hàng chung.
 *  - Nếu ở mức ưu tiên cao nhất còn > 1 bảng giá → MULTIPLE_PRICE (không tự chọn).
 *  - Không có → NO_PRICE.
 */
const STATUS = { OK: 'OK', NO_PRICE: 'NO_PRICE', MULTIPLE_PRICE: 'MULTIPLE_PRICE' };

function resolvePrice({ routeId, carrierId, goodsType, date }, rules) {
  const d = String(date).slice(0, 10);
  const candidates = rules.filter((r) =>
    (r.trang_thai || 'ACTIVE') === 'ACTIVE' &&
    r.tuyen_id === routeId &&
    (r.don_vi_van_chuyen_id == null || r.don_vi_van_chuyen_id === carrierId) &&
    (r.loai_hang == null || r.loai_hang === goodsType) &&
    r.tu_ngay <= d && (r.den_ngay == null || d <= r.den_ngay)
  );
  if (!candidates.length) return { status: STATUS.NO_PRICE, rule: null, candidates: [] };
  const score = (r) => (r.don_vi_van_chuyen_id != null ? 2 : 0) + (r.loai_hang != null ? 1 : 0);
  const best = Math.max(...candidates.map(score));
  const top = candidates.filter((r) => score(r) === best);
  if (top.length > 1) return { status: STATUS.MULTIPLE_PRICE, rule: null, candidates: top };
  return { status: STATUS.OK, rule: top[0], candidates };
}

module.exports = { resolvePrice, PRICE_STATUS: STATUS };
