'use strict';
/**
 * Xác định đơn vị vận chuyển của 1 xe tại 1 thời điểm, dựa trên LỊCH SỬ XE → ĐƠN VỊ (tu_ngay/den_ngay).
 * Xe chưa có trong danh mục → UNKNOWN_VEHICLE, KHÔNG tự gán.
 * Có > 1 dòng lịch sử cùng hiệu lực → AMBIGUOUS_VEHICLE (dữ liệu danh mục lỗi, không tự chọn).
 */
const { normalizePlate } = require('../utils/plate');

class VehicleResolver {
  /**
   * @param {Array<{bien_so_chuan,don_vi_van_chuyen_id,tu_ngay,den_ngay}>} history
   * @param {Iterable<string>} [knownPlates] xe có trong danh mục (kể cả chưa gán đơn vị)
   */
  constructor(history, knownPlates = []) {
    this.known = new Set([...knownPlates].map(normalizePlate));
    this.byPlate = new Map();
    for (const h of history) {
      const k = normalizePlate(h.bien_so_chuan);
      if (!this.byPlate.has(k)) this.byPlate.set(k, []);
      this.byPlate.get(k).push(h);
    }
  }

  resolve(plateRaw, date) {
    const k = normalizePlate(plateRaw);
    const list = this.byPlate.get(k);
    if (!list) return { status: this.known.has(k) ? 'UNKNOWN_CARRIER' : 'UNKNOWN_VEHICLE', carrierId: null };
    const d = String(date).slice(0, 10);
    const hit = list.filter((h) => (h.tu_ngay == null || h.tu_ngay <= d) && (h.den_ngay == null || d <= h.den_ngay));
    if (hit.length === 0) return { status: 'UNKNOWN_CARRIER', carrierId: null };
    if (hit.length > 1) return { status: 'AMBIGUOUS_VEHICLE', carrierId: null, candidates: hit };
    return { status: 'OK', carrierId: hit[0].don_vi_van_chuyen_id };
  }
}

module.exports = { VehicleResolver };
