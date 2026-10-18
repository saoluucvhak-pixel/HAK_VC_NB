'use strict';
/** Phiếu cân (phân trang phía server) + Chi tiết theo xe (timeline). */
(() => {
  const { h, fmt, api, call, table, tag } = App;
  const FLAG_TXT = { LONG_WEIGH_DURATION: 'Cân quá lâu', SHORT_GAP: 'Hai chuyến sát nhau', REVERSE_WEIGHING: 'Cân ngược', INVALID_TIME: 'Thời gian lỗi', SHORT_WEIGH_DURATION: 'Cân quá nhanh', OVERLAP_PREVIOUS_TRIP: 'Chồng chuyến trước' };

  async function explain(id) {
    const e = await call('tickets.explain', { id });
    if (!e) return;
    const t = e.ticket; const r = e.rule;
    const kv = (k, val) => h('div', { class: 'row gap-s' }, h('span', { class: 'muted', style: { width: '170px' } }, k), h('b', {}, val ?? '—'));
    App.modal({ title: `Vì sao phiếu ${t.so_phieu} có giá này?`, wide: true, actions: [{ label: 'Xóa phiếu này', cls: 'danger', onClick: () => { setTimeout(() => delTickets([t.id], () => { App.refreshInfo(); App.reload(); }), 0); } }, { label: 'Đóng', primary: false }],
      body: h('div', {}, kv('Biển số', t.bien_so), kv('Khối lượng', `${fmt.kg(t.kl_hang_kg)} kg`), kv('Trạng thái', App.STATUS_TAG[t.trang_thai_tinh_gia] ? App.STATUS_TAG[t.trang_thai_tinh_gia][1] : t.trang_thai_tinh_gia),
        kv('Đơn giá áp dụng', fmt.money(t.don_gia)), kv('Thành tiền trước VAT', fmt.money(t.tien_truoc_vat)), kv('VAT', `${t.ty_le_vat ?? ''}% = ${fmt.money(t.tien_vat)}`), kv('Tổng', fmt.money(t.tong_tien)),
        r ? h('div', { style: { marginTop: '10px' } }, h('h3', {}, 'Bảng giá áp dụng'), kv('Mã bảng giá', r.ma_bang_gia), kv('Hiệu lực', `${fmt.date(r.tu_ngay)} → ${r.den_ngay ? fmt.date(r.den_ngay) : 'nay'}`), kv('Phương thức', r.phuong_thuc),
          kv('Đơn giá gốc / điều chỉnh', `${fmt.money(r.don_gia_goc)} + ${fmt.money(r.don_gia_dieu_chinh)} = ${fmt.money(r.don_gia_ap_dung)}`),
          e.ky ? kv('Kỳ giá dầu', `${e.ky.ma_ky}: bình quân ${fmt.money(e.ky.gia_dau_binh_quan)} đ/lít`) : null,
          r.cong_thuc ? h('pre', { class: 'json' }, JSON.stringify(r.cong_thuc, null, 2)) : null) : h('p', { class: 'muted' }, 'Chưa gắn bảng giá.')) });
  }

  /** Xóa phiếu (xóa mềm, có lý do + audit). Hiện xem trước: bao nhiêu phiếu xóa được / đã áp giá / bị chặn. */
  async function delTickets(ids, onDone) {
    if (!ids.length) return App.toast('Chưa có phiếu nào', true);
    const pv = await call('tickets.removePreview', { ids }); if (!pv) return;
    if (!pv.xoa_duoc) return App.modal({ title: 'Không có phiếu nào xóa được', actions: [{ label: 'Đóng', primary: false }],
      body: h('p', {}, `${fmt.int(pv.da_chot_ky)} phiếu đã chốt kỳ, ${fmt.int(pv.dot_khoa)} phiếu thuộc đợt đã khóa. Mở khóa kỳ/đợt trước rồi xóa lại.`) });
    const reason = h('input', { style: { width: '100%' }, placeholder: 'Ví dụ: nhập nhầm, phiếu trùng, hủy chuyến…' });
    App.modal({ title: `Xóa ${fmt.int(pv.xoa_duoc)} phiếu cân`, body: h('div', {},
      h('p', {}, `Sẽ xóa ${fmt.int(pv.xoa_duoc)} phiếu`, pv.da_tinh_gia ? `, trong đó ${fmt.int(pv.da_tinh_gia)} phiếu đã áp giá vận chuyển (tiền của các phiếu này sẽ biến khỏi Bảng kê/báo cáo).` : '.'),
      pv.da_chot_ky || pv.dot_khoa ? h('p', { class: 'tag red' }, `Không thể xóa: ${fmt.int(pv.da_chot_ky)} phiếu đã chốt kỳ, ${fmt.int(pv.dot_khoa)} phiếu thuộc đợt đã khóa — hãy bỏ chúng ra khỏi lựa chọn hoặc mở khóa trước.`) : null,
      h('p', { class: 'muted' }, 'Phiếu xóa được ghi vào nhật ký; có thể import lại file gốc nếu cần.'), h('label', { class: 'field' }, 'Lý do xóa', reason)),
    actions: [{ label: 'Hủy', primary: false }, { label: 'Xóa phiếu', cls: 'danger', disabled: !!(pv.da_chot_ky || pv.dot_khoa), onClick: async () => {
      if (!reason.value.trim()) { App.toast('Cần ghi lý do xóa', true); return false; }
      const r = await call('tickets.remove', { ids, reason: reason.value.trim() }, 'Đã xóa phiếu'); if (!r) return false; onDone(r); } }] });
  }

  App.register('tickets', {
    async render(v, params = {}) {
      Object.assign(App.state.filter, Object.fromEntries(Object.entries(params).filter(([k]) => ['tu_ngay', 'den_ngay', 'dot_id', 'noi_xuat_id', 'don_vi_id'].includes(k))));
      const st = { offset: 0, limit: 100, sort: 'ngay_gio_can_1', dir: 'asc', search: '', chua: !!params.chua_tinh_gia, status: params.trang_thai_tinh_gia || '' };
      const body = h('div', {}); const sel = new Set();
      const flt = () => ({ ...App.cleanFilter(App.state.filter), search: st.search || undefined, chua_tinh_gia: st.chua || undefined, trang_thai_tinh_gia: st.status || undefined });
      const load = async () => {
        const d = await api('tickets.list', { filter: flt(), offset: st.offset, limit: st.limit, sort: st.sort, dir: st.dir });
        const pages = Math.max(1, Math.ceil(d.total / st.limit)); const page = Math.floor(st.offset / st.limit) + 1;
        App.clear(body).append(h('div', { class: 'card' },
          table({
            columns: [
              { key: '_sel', label: h('input', { type: 'checkbox', title: 'Chọn cả trang', onclick: (e) => e.stopPropagation(), onchange: (e) => { d.rows.forEach((r) => (e.target.checked ? sel.add(r.id) : sel.delete(r.id))); load(); } }),
                render: (r) => h('input', { type: 'checkbox', checked: sel.has(r.id), onclick: (e) => e.stopPropagation(), onchange: (e) => { e.target.checked ? sel.add(r.id) : sel.delete(r.id); selBtn.textContent = `🗑 Xóa phiếu đã chọn (${sel.size})`; selBtn.disabled = !sel.size; } }) },
              { key: 'so_phieu', label: 'Số phiếu', mono: true, sort: true }, { key: 'ngay_gio_can_1', label: 'Cân 1', fmt: 'dt', mono: true, sort: true }, { key: 'bien_so', label: 'Biển số', mono: true, sort: true },
              { key: 'don_vi', label: 'Đơn vị', sort: true }, { key: 'noi_xuat', label: 'Nơi xuất', sort: true, render: (r) => r.noi_xuat || h('span', { class: 'muted' }, r.noi_xuat_goc || '') },
              { key: 'kl_hang_kg', label: 'KL (kg)', fmt: 'kg', sort: true }, { key: 'don_gia', label: 'Đơn giá', fmt: 'money', sort: true }, { key: 'tien_truoc_vat', label: 'Trước VAT', fmt: 'money', sort: true },
              { key: 'tong_tien', label: 'Tổng', fmt: 'money', sort: true }, { key: 'dot', label: 'Đợt' },
              { key: 'trang_thai_tinh_gia', label: 'Trạng thái', render: (r) => h('span', {}, tag(r.trang_thai_tinh_gia), r.xe_tra_ve ? ' ' : '', r.xe_tra_ve ? tag('KHAC', 'Trả về') : null) },
            ], rows: d.rows, sort: { key: st.sort, dir: st.dir }, onSort: (k) => { st.dir = st.sort === k && st.dir === 'asc' ? 'desc' : 'asc'; st.sort = k; st.offset = 0; load(); },
            totals: { so_phieu: null, kl_hang_kg: d.totals.tong_kg, tien_truoc_vat: d.totals.tien_truoc_vat, tong_tien: d.totals.tong_tien }, onRow: (r) => explain(r.id),
            rowClass: (r) => (['OK', 'LOCKED'].includes(r.trang_thai_tinh_gia) ? '' : 'err'), wrapClass: 'tall',
          }),
          h('div', { class: 'pager' }, `${fmt.int(d.total)} phiếu`, h('button', { class: 'btn ghost sm', disabled: page <= 1, onclick: () => { st.offset -= st.limit; load(); } }, '‹'), `Trang ${page}/${pages}`,
            h('button', { class: 'btn ghost sm', disabled: page >= pages, onclick: () => { st.offset += st.limit; load(); } }, '›'))));
      };
      const reset = () => { st.offset = 0; sel.clear(); selBtn.textContent = '🗑 Xóa phiếu đã chọn (0)'; selBtn.disabled = true; load(); };
      const done = (r) => { sel.clear(); selBtn.textContent = '🗑 Xóa phiếu đã chọn (0)'; selBtn.disabled = true; App.refreshInfo(); load(); };
      const selBtn = h('button', { class: 'btn danger', disabled: true, 'data-act': 'del-selected', onclick: () => delTickets([...sel], done) }, '🗑 Xóa phiếu đã chọn (0)');
      const allBtn = h('button', { class: 'btn ghost', 'data-act': 'del-filtered', title: 'Xóa mọi phiếu khớp bộ lọc hiện tại (kể cả các trang khác)', onclick: async () => { const ids = await api('tickets.ids', { filter: flt() }); delTickets(ids, done); } }, '🗑 Xóa tất cả phiếu đang lọc');
      const search = h('input', { placeholder: 'Tìm số phiếu / biển số / nơi xuất…', style: { width: '260px' }, onchange: (e) => { st.search = e.target.value.trim(); reset(); } });
      v.append(App.pageHead('Phiếu cân', 'Bấm một dòng để xem vì sao phiếu có đơn giá đó',
        h('span', { class: 'row gap-s' }, selBtn, allBtn, h('button', { class: 'btn ghost', onclick: () => App.exportXlsx('export.tickets', { filter: flt() }) }, '⬇ Xuất Excel'))),
      await App.filterBar(reset),
      h('div', { class: 'card row' }, search,
        h('label', { class: 'row gap-s' }, h('input', { type: 'checkbox', checked: st.chua, onchange: (e) => { st.chua = e.target.checked; reset(); } }), 'Chỉ phiếu chưa tính được giá'),
        h('select', { onchange: (e) => { st.status = e.target.value; reset(); } }, h('option', { value: '' }, 'Mọi trạng thái'), ['OK', 'NO_PRICE', 'MULTIPLE_PRICE', 'UNKNOWN_VEHICLE', 'UNKNOWN_CARRIER', 'UNKNOWN_LOCATION', 'LOCKED'].map((s) => h('option', { value: s }, App.STATUS_TAG[s][1])))),
      body);
      await load();
    },
  });

  App.register('vehicle', {
    async render(v, params = {}) {
      const xe = await api('catalog.list', { table: 'xe' });
      const sel = h('select', {}, h('option', { value: '' }, '— chọn xe —'), xe.map((x) => h('option', { value: x.bien_so_hien_thi, selected: x.bien_so_hien_thi === params.bien_so }, `${x.bien_so_hien_thi} · ${x.don_vi_hien_tai || '?'} · ${x.so_chuyen} chuyến`)));
      const body = h('div', {});
      const load = async () => {
        App.clear(body);
        if (!sel.value) return body.append(h('div', { class: 'empty' }, 'Chọn một xe để xem lịch sử chuyến.'));
        const f = App.cleanFilter(App.state.filter);
        const rows = await api('reports.timeline', { bien_so: sel.value, tu_ngay: f.tu_ngay, den_ngay: f.den_ngay });
        const kg = rows.reduce((a, r) => a + r.kl_hang_kg, 0); const amt = rows.reduce((a, r) => a + (r.tien_truoc_vat || 0), 0);
        body.append(h('div', { class: 'grid g4', style: { marginBottom: '12px' } },
          h('div', { class: 'kpi' }, h('small', {}, 'Số chuyến'), h('b', {}, rows.length)), h('div', { class: 'kpi' }, h('small', {}, 'Khối lượng (tấn)'), h('b', {}, fmt.tan(kg / 1000))),
          h('div', { class: 'kpi' }, h('small', {}, 'Trước VAT'), h('b', {}, fmt.money(amt))), h('div', { class: 'kpi' + (rows.some((r) => r.flags.length) ? ' warn' : '') }, h('small', {}, 'Chuyến bất thường'), h('b', {}, rows.filter((r) => r.flags.length).length))),
        h('div', { class: 'card' }, table({
          columns: [{ key: 'stt', label: '#', num: true }, { key: 'so_phieu', label: 'Số phiếu', mono: true }, { key: 'ngay_gio_can_1', label: 'Cân 1', fmt: 'dt', mono: true }, { key: 'ngay_gio_can_2', label: 'Cân 2', fmt: 'dt', mono: true },
            { key: 'thoi_gian_can_phut', label: 'Thời gian cân', fmt: 'min' }, { key: 'khoang_cach_chuyen_phut', label: 'Cách chuyến trước', fmt: 'min' }, { key: 'noi_xuat', label: 'Nơi xuất' },
            { key: 'kl_hang_kg', label: 'KL (kg)', fmt: 'kg' }, { key: 'don_gia', label: 'Đơn giá', fmt: 'money' }, { key: 'tien_truoc_vat', label: 'Trước VAT', fmt: 'money' },
            { key: 'flags', label: 'Cảnh báo', render: (r) => h('span', {}, r.flags.map((x) => h('span', { class: 'tag amber', style: { marginRight: '3px' } }, FLAG_TXT[x] || x))) }],
          rows, rowClass: (r) => (r.flags.length ? 'flag' : ''), wrapClass: 'tall' }),
        h('p', { class: 'muted' }, 'Cảnh báo thời gian chỉ để kiểm tra — hệ thống không kết luận sai/đúng.')));
        if (rows.length) body.firstChild.before(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('button', { class: 'btn ghost sm', onclick: () => App.exportXlsx('export.timeline', { bien_so: sel.value, tu_ngay: f.tu_ngay, den_ngay: f.den_ngay }) }, '⬇ Xuất Excel')));
      };
      sel.addEventListener('change', load);
      v.append(App.pageHead('Chi tiết theo xe', 'Lịch sử chuyến theo thời gian, cờ thời gian bất thường'), h('div', { class: 'card row' }, h('label', { class: 'field' }, 'Xe', sel)), await App.filterBar(load, { fields: ['tu_ngay', 'den_ngay'] }), body);
      await load();
    },
  });
})();
