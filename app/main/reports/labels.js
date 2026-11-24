'use strict';
/** Nhãn dùng chung cho xuất Excel / CSV của Bảng kê vận chuyển (BKVC). */
/**
 * Tiêu đề cột số lượng của Excel / CSV. Chỉ kỳ có BẢN CHỤP m³ (kỳ tính từ 1.9.4, `uomLabel` khác "tấn") mới ghi "Khối lượng (Tấn / m³)": ở các kỳ này cột là Σ số lượng
 * tính cước (m³ ở dòng m³). Kỳ CŨ (bản chụp chưa có total_m3) cột vẫn là kg/1000 = tấn → GIỮ NGUYÊN "Khối lượng (Tấn)" (không đổi tiêu đề báo cáo có sẵn),
 * kể cả khi kỳ cũ đó có dòng giá cố định m³. Điều kiện này chính là điều kiện `ReportService.bkvc` dùng để chọn cách tính tổng.
 */
const bkvcFileQtyHeader = (d) => (d && d.uomLabel && d.uomLabel !== 'tấn' ? 'Khối lượng (Tấn / m³)' : 'Khối lượng (Tấn)');
module.exports = { bkvcFileQtyHeader };
