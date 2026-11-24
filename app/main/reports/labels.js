'use strict';
/** Nhãn dùng chung cho mọi định dạng xuất (HTML / PDF / Excel / CSV) của Bảng kê vận chuyển (BKVC). */
const hasM3Lines = (lines) => (lines || []).some((l) => l.uom === 'M3');
/** Tiêu đề cột số lượng: kỳ có dòng tính theo m³ → "Khối lượng (Tấn / m³)"; kỳ chỉ có tấn giữ đúng tiêu đề cũ "Khối lượng (Tấn)". */
const bkvcQtyHeader = (lines) => (hasM3Lines(lines) ? 'Khối lượng (Tấn / m³)' : 'Khối lượng (Tấn)');
module.exports = { bkvcQtyHeader, hasM3Lines };
