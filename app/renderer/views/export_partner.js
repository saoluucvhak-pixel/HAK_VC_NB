'use strict';
/*
 * DGVC — Xuất dữ liệu vận chuyển gửi đối tác: ĐÃ GỘP vào màn "Trao đổi dữ liệu" (tab Xuất gói, renderer/views/system.js).
 * Tab Xuất gói giữ đủ: gói Kỳ tính đã chốt, gói Phiếu cân & dầu theo khoảng ngày (có lọc biển số), gói Danh mục; định dạng .dgvc hoặc .json.
 * Lịch sử xuất nằm ở tab "Lịch sử gói" — đọc `exchange.list` → `items` (trước đây màn này đọc nhầm `exports` nên luôn rỗng).
 * File này chỉ còn bí danh: D.go('export_partner', { tab }) được app.js chuyển sang Trao đổi dữ liệu (period → Xuất gói/Kỳ tính, tickets → Xuất gói/Phiếu cân, history → Lịch sử).
 */
(function () {
  const D = window.DGVC; const { h } = D;
  D.views.export_partner = {
    async render(params = {}) {
      setTimeout(() => D.go('exchange', { tab: params.tab === 'history' ? 'history' : 'export', kind: params.tab === 'tickets' ? 'PHIEU_CAN' : 'KY_TINH' }));
      return h('div');
    },
  };
})();
