'use strict';
/* Báo cáo thuê vận chuyển — công ty thuê đơn vị khác vận chuyển: hướng dẫn 3 bước + điều hướng nhanh + các đợt dữ liệu đã nạp gần đây.
 * Chưa có chức năng tạo kỳ vận chuyển cho bên thuê (chờ chủ sản phẩm chốt cách tính). */
(function () {
  const D = window.DGVC; const { h } = D;
  D.views.rentreport = {
    async render() {
      const res = await D.api('subcontract.list', {}).catch(() => []);
      const batches = (Array.isArray(res) ? res : []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 10);
      const go = (v, p) => () => D.go(v, p);
      const guide = h('div', { class: 'card', role: 'region', 'aria-label': 'Hướng dẫn 3 bước' }, h('h2', {}, 'Làm thế nào: 3 bước'),
        h('ol', { class: 'rr-steps' },
          h('li', {}, h('b', {}, 'Nhận dữ liệu do đơn vị vận chuyển gửi theo mẫu (phiếu cân, dầu)'), ' → Trao đổi dữ liệu › Nhập gói, hoặc nạp file mẫu ở Đối chiếu dữ liệu › Đối chiếu 3 tiêu chí.'),
          h('li', {}, h('b', {}, 'Đối chiếu với kỳ của bạn'), ' nếu cùng kỳ vận chuyển → Đối chiếu dữ liệu.'),
          h('li', {}, h('b', {}, 'Nếu công ty thuê vận chuyển hàng của mình mà không tự làm dịch vụ'), ': tạo kỳ vận chuyển ', h('span', { class: 'tag warn rr-wip' }, 'đang hoàn thiện'), ' (chưa có nút).')),
        h('div', { class: 'rr-nav' },
          h('button', { class: 'btn primary', onclick: go('exchange', { tab: 'import' }) }, 'Trao đổi dữ liệu › Nhập gói'),
          h('button', { class: 'btn', onclick: go('reconcile', { tab: 'compare' }) }, 'Đối chiếu dữ liệu'),
          h('button', { class: 'btn', onclick: go('reconcile', { tab: 'batches' }) }, 'Các đợt đã nạp'),
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu phiếu cân để gửi / nhận với đơn vị vận chuyển', onclick: () => D.partnerTemplate('PHIEU_CAN') }, 'Tải file mẫu Excel — phiếu cân') : null,
          D.writer() ? h('button', { class: 'btn', title: 'Tải file Excel mẫu dầu', onclick: () => D.partnerTemplate('GIAO_NHAN_DAU') }, 'Tải file mẫu Excel — dầu') : null));
      const list = !batches.length
        ? h('div', { class: 'card empty-card' }, 'Chưa có đợt dữ liệu nào từ đơn vị vận chuyển. Làm bước 1 ở trên: nhận gói hoặc nạp file mẫu, rồi bấm "Lưu thành đợt" ở Đối chiếu 3 tiêu chí.')
        : h('div', { class: 'card flush' }, h('div', { class: 'card-h row' }, h('h2', { class: 'grow' }, `Đợt đã nạp gần đây (${batches.length})`)),
          D.table({ rows: batches, onRow: () => D.go('reconcile', { tab: 'batches' }), empty: 'Không có đợt nào', columns: [
            { key: 'batchName', label: 'Tên đợt', render: (r) => h('b', {}, r.batchName) }, { key: 'partnerName', label: 'Đơn vị vận chuyển', wrap: true, render: (r) => r.partnerName || '—' },
            { key: 'periodCode', label: 'Kỳ', render: (r) => r.periodCode || '—' }, { key: 'createdAt', label: 'Ngày nạp', fmt: 'date' },
            { key: 'ton', label: 'Tổng tấn', num: true, render: (r) => D.vnAuto(r.summary && r.summary.totalTon) }] }));
      return D.page('Báo cáo thuê vận chuyển', 'Đối tác · công ty thuê đơn vị khác vận chuyển', [], guide, list);
    },
  };
})();
