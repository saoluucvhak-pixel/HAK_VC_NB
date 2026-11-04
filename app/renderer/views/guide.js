'use strict';
/* Hướng dẫn & quy trình — nội dung tĩnh, đối chiếu với docs/HUONG_DAN_CAI_DAT_VA_SU_DUNG.md và quy tắc kỳ tính (PeriodService / TicketService) */
(function () {
  const D = window.DGVC; const { h } = D;
  const TABS = [['flow', 'Quy trình hằng kỳ'], ['fix', 'Sửa sai sót'], ['roles', 'Vai trò & quyền'], ['tips', 'Lưu ý nhanh']];
  const link = (label, view, params) => h('button', { class: 'btn small', onclick: () => D.go(view, params || {}) }, label);
  const b = (t) => h('b', {}, t);

  // ── 1. Quy trình hằng kỳ ──
  const STEPS = [
    ['Phiếu cân', 'tickets', ['Bấm ', b('Import từ Excel'), ' → chọn file trạm cân (hoặc file mẫu NL_VC). Xem trước → tích ', b('Chấp nhận các dòng cảnh báo'), ' → ', b('Xác nhận import'), '. Cần file mẫu: bấm ', b('Tải file mẫu'), '.']],
    ['Giao nhận dầu', 'fuel', ['Chọn hợp đồng → ', b('Import từ Excel'), ' (bảng kê dầu) hoặc ', b('Nhập tay'), '. Mỗi hợp đồng chỉ có 1 bên giao dầu (cột Đơn vị).']],
    ['Tính giá vận chuyển', 'calc', ['Chọn hợp đồng, ', b('Từ ngày – Đến ngày'), ', tuyến, thuế suất GTGT → ', b('Xem trước'), ' → ', b('TÍNH GIÁ'), '. Kỳ được lưu ở trạng thái ', b('Nháp'), '. Bấm vào đơn giá để xem chi tiết tính (15 bước).']],
    ['Kiểm tra & xác nhận kỳ', 'calc', ['Đọc mục ', b('Kiểm tra trước khi xác nhận'), ' (lỗi / cảnh báo) → ', b('Xác nhận kỳ'), ' → (tùy chọn) ', b('Khóa kỳ'), '. Sau khi xác nhận, phiếu và dầu của kỳ không đưa vào kỳ khác được.']],
    ['Bảng xác nhận KL', 'bkvc', ['Xem trước A4 → ', b('In'), ' / ', b('Xuất Excel / PDF / CSV'), '. Có chứng từ kèm theo (bảng tính đơn giá, biên bản giao nhận dầu) và file hóa đơn MISA (bên vận chuyển).']],
    ['Gửi bên thuê', 'exchange', ['Ở màn hình kỳ bấm ', b('Xuất gói gửi bên thuê'), ' → gửi file ', b('.dgvc'), ' (Zalo / email / USB). Bên thuê vào ', b('Trao đổi dữ liệu → Nhập gói'), ' để xem và in lại.']],
  ];
  function flowTab() {
    return h('div', {},
      h('div', { class: 'card' }, h('h2', {}, 'Vòng đời của một kỳ'),
        h('div', { class: 'status-flow' }, h('span', { class: 's on' }, 'Nháp'), h('span', {}, '→'), h('span', { class: 's on' }, 'Đã xác nhận'), h('span', {}, '→'), h('span', { class: 's on' }, 'Đã khóa')),
        h('p', { class: 'small muted' }, 'Quay lại: Đã khóa → (Mở khóa) → Đã xác nhận → (Trả về nháp) → Nháp. Hai thao tác quay lại cần ADMIN hoặc người có quyền mở khóa, và bắt buộc ghi lý do.')),
      ...STEPS.map(([title, view, text], i) => h('div', { class: 'card guide-step' },
        h('div', { class: 'guide-n' }, String(i + 1)), h('div', { class: 'grow' }, h('h2', {}, title), h('p', {}, ...text)), link('Mở màn hình', view))),
      h('div', { class: 'card' }, h('h2', {}, 'Cuối ngày làm việc'), h('p', {}, 'Vào ', b('Cài đặt → Dữ liệu & sao lưu'), ' để sao lưu ra USB / thư mục Google Drive. Mọi thay đổi quan trọng đều được ghi ở ', b('Lịch sử thao tác'), '.'), link('Mở Cài đặt', 'settings')));
  }

  // ── 2. Sửa sai sót ──
  const FIX = [
    { a: 'Sai cột mô tả (LDĐ, nguồn gốc, khách hàng, kiểu cân, đơn vị VC)', n: 'Sửa trực tiếp', x: 'Sửa được, bắt buộc ghi lý do', k: 'Cần quyền mở khóa + lý do' },
    { a: 'Sai số liệu tính (cân lần 1 / 2, KL hàng, mã tuyến, chủ xe, giờ cân)', n: 'Sửa được; kỳ chuyển sang "cần tính lại"', x: 'Bị chặn (E_TICKET_LOCKED) → Trả về nháp rồi sửa', k: 'Mở khóa → Trả về nháp rồi sửa' },
    { a: 'Sai số phiếu, ngày cân 1 hoặc biển số', n: 'Không sửa được: xóa phiếu rồi nhập lại', x: 'Không sửa / xóa được', k: 'Không sửa / xóa được' },
  ];
  // bảng chữ thuần (không sắp xếp): mỗi cột là hàm render
  const plain = (cols, rows) => D.table({ rows, columns: cols.map(([label, key]) => ({ label, key, wrap: true, render: (r) => r[key] })) });
  const TASKS = [
    ['Import nhầm file phiếu cân', 'Phiếu cân → lọc đúng các phiếu cần xóa → ', 'Xóa N phiếu đang lọc…', ' (ghi lý do). Phiếu ở kỳ đã chốt được giữ lại. Khôi phục: lọc Trạng thái = Đã xóa → bấm phiếu → Khôi phục phiếu.'],
    ['Tải file dầu sai', 'Giao nhận dầu → chọn hợp đồng, lọc Từ ngày – Đến ngày đúng khoảng của file → ', 'Xóa … dòng đang lọc…', ' → import lại file đúng. Dòng dầu ở kỳ đã chốt được giữ lại; kỳ nháp phải tính lại.'],
    ['Trạm cân gửi lại file đã sửa', 'Phiếu cân → ', 'Import từ Excel', ' như bình thường: phiếu khác số liệu hiện "Cập nhật", ghi rõ cột đổi. Kỳ nháp có phiếu đó được đánh dấu tính lại.'],
    ['Phiếu nhập muộn sau khi kỳ đã chốt', 'Đối chiếu dữ liệu → thẻ "Phiếu cân chưa tính vào kỳ" → ', 'Mở kỳ để tính lại', ' → Tính giá → Xác nhận kỳ → xuất lại gói gửi bên thuê (bên thuê nhập gói mới sẽ thay bản cũ).'],
    ['Kỳ nháp tính sai', 'Tính giá vận chuyển → mở kỳ → ', 'TÍNH GIÁ', ' lại, hoặc ', 'Hủy kỳ', ' (ghi lý do) để trả phiếu và dầu về trạng thái chưa dùng.'],
  ];
  function fixTab() {
    const can = D.can('ADMIN') || (D.state.boot && D.state.boot.user.canUnlock);
    return h('div', {},
      h('div', { class: `card ${can ? 'ok-card' : ''}` }, h('h2', {}, 'Kỳ đã xác nhận mà phát hiện sai — làm thế nào?'),
        h('ol', { class: 'guide-ol' },
          h('li', {}, 'Mở kỳ ở màn ', b('Tính giá vận chuyển'), '. Nếu kỳ đang ', b('Đã khóa'), ' bấm ', b('Mở khóa'), ' trước (ghi lý do).'),
          h('li', {}, 'Ở kỳ ', b('Đã xác nhận'), ' bấm ', b('Trả về nháp'), ' (ghi lý do).'),
          h('li', {}, 'Sửa phiếu cân / dầu ở màn hình tương ứng. Kỳ hiện cờ "cần tính lại".'),
          h('li', {}, 'Bấm ', b('TÍNH GIÁ'), ' lại → kiểm tra → ', b('Xác nhận kỳ'), ' (→ ', b('Khóa kỳ'), ' nếu cần).'),
          h('li', {}, 'Nếu đã gửi gói cho bên thuê: ', b('Xuất gói gửi bên thuê'), ' lại để họ thay bản cũ.')),
        h('p', { class: 'small' }, can ? 'Tài khoản của bạn có quyền Trả về nháp / Mở khóa.' : 'Tài khoản của bạn chưa có quyền này — nhờ ADMIN hoặc người có quyền mở khóa thực hiện bước 1–2.'),
        link('Mở Tính giá vận chuyển', 'calc')),
      h('div', { class: 'card flush' }, plain([['Tình huống', 'a'], ['Kỳ Nháp', 'n'], ['Kỳ Đã xác nhận', 'x'], ['Kỳ Đã khóa', 'k']], FIX)),
      ...TASKS.map(([t, a, btn, rest, btn2, rest2]) => h('div', { class: 'card' }, h('h2', {}, t), h('p', {}, a, b(btn), rest, btn2 ? b(btn2) : null, rest2 || null))));
  }

  // ── 3. Vai trò & quyền ──
  function rolesTab() {
    const u = D.state.boot.user; const can = D.can('ADMIN') || u.canUnlock;
    return h('div', {},
      h('div', { class: 'card' }, h('h2', {}, 'Tài khoản của bạn'), h('p', {}, b(u.fullName || u.username), ` · vai trò ${u.role}`, can ? ' · có quyền mở khóa' : '')),
      h('div', { class: 'card flush' }, plain([['Việc', 'a'], ['Ai làm được', 'b']], [
        { a: 'Nhập liệu, tính giá, xác nhận kỳ, khóa kỳ, xuất gói', b: 'ADMIN, KE_TOAN' },
        { a: 'Mở khóa kỳ, Trả về nháp, sửa phiếu ở kỳ đã khóa, sửa số liệu tính của danh mục đã dùng', b: 'ADMIN hoặc người được cấp quyền mở khóa — luôn ghi lý do' },
        { a: 'Xem, in, xuất báo cáo', b: 'Mọi tài khoản' },
        { a: 'Quản lý người dùng, cấp quyền mở khóa', b: 'Cài đặt → Người dùng (ADMIN)' }])),
      h('p', { class: 'small muted' }, 'Mọi thao tác sửa / mở khóa đều ghi vào ', b('Lịch sử thao tác'), ' (người, lúc, trước / sau, lý do).'), link('Mở Lịch sử thao tác', 'audit'));
  }

  // ── 4. Lưu ý nhanh ──
  const TIPS = [
    ['Nhập muộn thì chưa được tính', 'Phiếu cân có ngày thuộc kỳ đã chốt sẽ được cảnh báo "nhập muộn nên CHƯA được tính" khi import. Xử lý ở Đối chiếu dữ liệu.'],
    ['Dầu tính hết vào kỳ', 'Dầu trong bảng kê tính hết vào kỳ, kể cả dầu nhận trước ngày bắt đầu kỳ. Số lít âm = dòng bù trừ.'],
    ['Đơn giá cố định', 'Tuyến chọn "Đơn giá cố định (đ/tấn)" thì không nhận dầu; nếu kỳ có dòng dầu của tuyến đó sẽ báo lỗi — sửa mã tuyến dòng dầu hoặc bấm "Bỏ N dòng dầu khỏi kỳ".'],
    ['Sửa danh mục ở một nhà máy', 'App nhắc sửa giống ở các nhà máy còn lại (menu Nhắc sửa danh mục). Xuất gói danh mục gửi nhà máy kia, hoặc bấm "Đã sửa tay".'],
    ['Không mất dữ liệu', 'Dữ liệu lưu trên máy, không cần Internet. Sao lưu ra USB / Google Drive ở Cài đặt → Dữ liệu & sao lưu.'],
  ];
  const tipsTab = () => h('div', { class: 'grid g2' }, TIPS.map(([t, x]) => h('div', { class: 'card' }, h('h2', {}, t), h('p', { class: 'small' }, x))));

  D.views.guide = {
    async render(params = {}) {
      const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'flow';
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => D.go('guide', { tab: k }) }, t)));
      const body = { flow: flowTab, fix: fixTab, roles: rolesTab, tips: tipsTab }[tab]();
      return D.page('Hướng dẫn & quy trình', 'Trợ giúp', [], tabs, body);
    },
  };
})();
