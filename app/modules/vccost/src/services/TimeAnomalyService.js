'use strict';
/**
 * Timeline từng xe: thời gian cân, khoảng cách với chuyến trước, cảnh báo bất thường.
 * Chỉ CẢNH BÁO dữ liệu bất thường — không kết luận gian lận.
 */
const { diffMinutes } = require('../utils/datetime');

const DEFAULT_THRESHOLDS = {
  minGapMinutes: 30,          // 2 chuyến liên tiếp cách nhau < 30 phút → cần kiểm tra
  maxWeighDurationMinutes: 240, // cân 1 → cân 2 > 4 giờ → cần kiểm tra
  minWeighDurationMinutes: 1,
};

/** @param {Array} tickets phiếu của 1 xe (bất kỳ thứ tự) */
function buildTimeline(tickets, thresholds = {}) {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const list = [...tickets].sort((a, b) => (a.ngay_gio_can_1 < b.ngay_gio_can_1 ? -1 : 1));
  let prev = null;
  return list.map((t, i) => {
    const flags = [];
    const duration = diffMinutes(t.ngay_gio_can_1, t.ngay_gio_can_2);
    const gap = prev ? diffMinutes(prev.ngay_gio_can_2, t.ngay_gio_can_1) : null;
    if (duration !== null && duration < 0) flags.push('INVALID_TIME');
    if (duration !== null && duration > th.maxWeighDurationMinutes) flags.push('LONG_WEIGH_DURATION');
    if (duration !== null && duration >= 0 && duration < th.minWeighDurationMinutes) flags.push('SHORT_WEIGH_DURATION');
    if (gap !== null && gap < 0) flags.push('OVERLAP_PREVIOUS_TRIP');
    else if (gap !== null && gap < th.minGapMinutes) flags.push('SHORT_GAP');
    if (Number(t.can_lan_1) > Number(t.can_lan_2)) flags.push('REVERSE_WEIGHING'); // cân 1 (có hàng) > cân 2 (xe rỗng)
    prev = t;
    return { stt: i + 1, ...t, thoi_gian_can_phut: duration, khoang_cach_chuyen_phut: gap, flags };
  });
}

module.exports = { buildTimeline, DEFAULT_THRESHOLDS };
