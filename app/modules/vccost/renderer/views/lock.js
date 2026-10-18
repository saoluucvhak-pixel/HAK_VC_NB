'use strict';
/** Chốt kỳ: khóa phiếu đã tính giá theo đợt/tàu hoặc theo khoảng ngày. */
(() => {
  const { h, fmt, api, call, table } = App;

  App.register('lock', {
    async render(v) {
      const [dots, dv] = await Promise.all([api('catalog.options', { table: 'dot_van_chuyen' }), api('catalog.options', { table: 'don_vi_van_chuyen' })]);
      const st = { loai: 'KY', dot_id: '', tu_ngay: '', den_ngay: '', don_vi_id: '' };
      const pv = h('div', {}); const hist = h('div', {});
      const scope = () => ({ ...st });

      const loadHist = async () => {
        const rows = await api('lock.list');
        App.clear(hist).append(h('div', { class: 'card' }, h('h3', {}, 'Lịch sử chốt kỳ'), table({
          columns: [
            { key: 'ma', label: 'Mã', mono: true },
            { key: 'loai', label: 'Loại', render: (r) => (r.loai === 'DOT' ? 'Đợt ' + (r.ma_dot || '') : 'Kỳ ngày') },
            { key: 'tu_ngay', label: 'Từ ngày', fmt: 'date' }, { key: 'den_ngay', label: 'Đến ngày', fmt: 'date' },
            { key: 'don_vi', label: 'Đơn vị' },
            { key: 'so_phieu', label: 'Số phiếu', fmt: 'int' }, { key: 'tong_kg', label: 'Khối lượng (kg)', fmt: 'kg' },
            { key: 'tong_tien', label: 'Tổng tiền (đ)', fmt: 'money' },
            { key: 'trang_thai', label: 'Trạng thái', tag: true },
            { key: '_a', label: '', render: (r) => (r.trang_thai === 'DA_CHOT' ? h('button', { class: 'btn danger sm', onclick: async () => {
              const reason = await App.promptBox('Mở khóa kỳ ' + r.ma, 'Lý do mở khóa');
              if (!reason) return;
              if (await call('lock.unlock', { id: r.id, reason }, 'Đã mở khóa')) { loadHist(); App.refreshInfo(); }
            } }, 'Mở khóa') : '') },
          ], rows, empty: 'Chưa chốt kỳ nào',
        })));
      };

      const preview = async () => {
        const d = await call('lock.preview', scope()); if (!d) return;
        const un = d.chua_tinh_gia
          ? h('div', { class: 'card', style: { borderColor: 'var(--red,#c0392b)' } }, h('b', {}, `⚠ Còn ${fmt.int(d.chua_tinh_gia)} phiếu chưa tính giá — phải xử lý xong mới chốt được`),
            table({ columns: [{ key: 'trang_thai', label: 'Lý do', tag: true }, { key: 'so_chuyen', label: 'Số chuyến', fmt: 'int' }], rows: d.chua_tinh_theo_ly_do }))
          : null;
        App.clear(pv).append(
          h('div', { class: 'card' }, h('h3', {}, 'Xem trước'),
            h('p', {}, `${fmt.int(d.so_phieu)} phiếu chưa chốt trong phạm vi` + (d.da_chot_truoc_do ? ` (đã có ${fmt.int(d.da_chot_truoc_do)} phiếu chốt trước đó, không tính lại)` : '')),
            table({
              columns: [{ key: 'don_vi', label: 'Đơn vị' }, { key: 'so_chuyen', label: 'Số chuyến', fmt: 'int' }, { key: 'tong_kg', label: 'Khối lượng (kg)', fmt: 'kg' },
                { key: 'tien_truoc_vat', label: 'Trước VAT (đ)', fmt: 'money' }, { key: 'tien_vat', label: 'VAT (đ)', fmt: 'money' }, { key: 'tong_tien', label: 'Tổng tiền (đ)', fmt: 'money' }],
              rows: d.statements, totals: { don_vi: 'Cộng', ...d.tong }, empty: 'Không có phiếu đã tính giá',
            }),
            h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', disabled: !d.chot_duoc, onclick: async () => {
              if (!(await App.confirmBox('Chốt kỳ', `Chốt ${fmt.int(d.tong.so_chuyen)} phiếu, tổng ${fmt.money(d.tong.tong_tien)} đ? Phiếu chốt không sửa được cho đến khi mở khóa.`, 'Chốt kỳ'))) return;
              if (await call('lock.create', scope(), 'Đã chốt kỳ')) { App.clear(pv); loadHist(); App.refreshInfo(); }
            } }, '🔒 Chốt kỳ'))),
          un);
      };

      const sel = (key, label, opts) => h('label', { class: 'field' }, label, h('select', { onchange: (e) => { st[key] = e.target.value; } },
        h('option', { value: '' }, key === 'dot_id' ? '— chọn —' : 'Tất cả'), opts.map((o) => h('option', { value: o.id }, o.label))));
      const date = (key, label) => h('label', { class: 'field' }, label, h('input', { type: 'date', onchange: (e) => { st[key] = e.target.value; } }));
      const kyBox = h('div', { class: 'row' }, date('tu_ngay', 'Từ ngày'), date('den_ngay', 'Đến ngày'));
      const dotBox = h('div', { class: 'row', style: { display: 'none' } }, sel('dot_id', 'Đợt / Tàu', dots));
      const setLoai = (x) => { st.loai = x; kyBox.style.display = x === 'KY' ? '' : 'none'; dotBox.style.display = x === 'DOT' ? '' : 'none'; App.clear(pv); };

      v.append(App.pageHead('Chốt kỳ', 'Khóa các phiếu đã tính giá sau khi đối soát xong — chỉ phiếu đã tính giá mới chốt được'),
        h('div', { class: 'card' }, h('div', { class: 'row' },
          h('label', { class: 'field' }, 'Chốt theo', h('select', { onchange: (e) => setLoai(e.target.value) }, h('option', { value: 'KY' }, 'Khoảng ngày'), h('option', { value: 'DOT' }, 'Đợt / Tàu'))),
          kyBox, dotBox, sel('don_vi_id', 'Đơn vị vận chuyển', dv),
          h('button', { class: 'btn', onclick: preview }, 'Xem trước'))),
        pv, hist);
      await loadHist();
    },
  });
})();
