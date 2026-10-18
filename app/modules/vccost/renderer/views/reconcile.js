'use strict';
/** Đối chiếu hệ thống ↔ bảng kê đối tác (cấp phiếu). */
(() => {
  const { h, fmt, api, call, table, tag } = App;
  const KQ = { KHOP: ['green', 'Khớp'], THIEU_BEN_A: ['red', 'Thiếu bên hệ thống'], THIEU_BEN_B: ['red', 'Thiếu bên đối tác'], LECH_KHOI_LUONG: ['amber', 'Lệch KL'], LECH_DON_GIA: ['amber', 'Lệch đơn giá'],
    LECH_TIEN: ['amber', 'Lệch tiền'], LECH_VAT: ['amber', 'Lệch VAT'], TRUNG_DU_LIEU: ['purple', 'Trùng dữ liệu'], CAN_KIEM_TRA: ['blue', 'Cần kiểm tra'] };
  const XL = { CHUA_XU_LY: 'Chưa xử lý', CHAP_NHAN_A: 'Chấp nhận hệ thống', CHAP_NHAN_B: 'Chấp nhận đối tác', DIEU_CHINH: 'Điều chỉnh', BO_QUA: 'Bỏ qua' };
  const kq = (k) => h('span', { class: `tag ${KQ[k][0]}` }, KQ[k][1]);
  const FIELDS = [['so_phieu', 'Số phiếu'], ['bien_so', 'Biển số'], ['ngay', 'Ngày'], ['kl_hang_kg', 'KL (kg)'], ['don_gia', 'Đơn giá'], ['tien_truoc_vat', 'Thành tiền (trước VAT)'], ['tien_vat', 'VAT'], ['tong_tien', 'Tổng tiền']];

  async function results(v, batch) {
    const st = { ket_qua: '' };
    const body = h('div', {});
    const load = async () => {
      const d = await api('recon.results', { batchId: batch.id, ket_qua: st.ket_qua || null, limit: 500 });
      const diffCls = (r, col) => (r.diffs.some((x) => x.cot === col) ? 'diff-old' : '');
      const cell = (key, f) => (r) => h('span', { class: key.diff ? diffCls(r, key.diff) : '' }, r[key.col] === null || r[key.col] === undefined ? '' : f(r[key.col]));
      const resolve = (r) => App.modal({ title: 'Xử lý dòng lệch', actions: [{ label: 'Đóng', primary: false }, ...['CHAP_NHAN_A', 'CHAP_NHAN_B', 'DIEU_CHINH', 'BO_QUA'].map((x) => ({ label: XL[x], cls: x === 'BO_QUA' ? 'ghost' : '', onClick: async () => {
        const ok = await call('recon.resolve', { id: r.id, xu_ly: x, note: note.value }, 'Đã ghi nhận'); if (!ok) return false; load();
      } }))], body: h('div', {}, h('p', {}, kq(r.ket_qua), ' ', h('b', {}, r.a_so_phieu || r.b_so_phieu || ''), ' — hiện: ', XL[r.xu_ly]),
        r.diffs.length ? table({ columns: [{ key: 'cot', label: 'Cột' }, { key: 'he_thong', label: 'Hệ thống', num: true, fmt: (x) => fmt.money2(x) }, { key: 'doi_tac', label: 'Đối tác', num: true, fmt: (x) => fmt.money2(x) }, { key: 'chenh', label: 'Chênh', num: true, fmt: (x) => (x === null ? '' : fmt.money2(x)) }], rows: r.diffs }) : null,
        h('p', { class: 'muted' }, 'Đối chiếu không sửa phiếu cân. Muốn sửa dữ liệu hãy sửa phiếu/bảng giá (có log) rồi đối chiếu lại.'), note = h('textarea', { placeholder: 'Ghi chú xử lý' })) });
      let note;
      App.clear(body).append(
        h('div', { class: 'row', style: { marginBottom: '10px' } }, Object.entries(KQ).map(([k, [c, t]]) => (d.counts[k] ? h('div', { class: 'kpi click', style: st.ket_qua === k ? { outline: '2px solid var(--green)' } : null, onclick: () => { st.ket_qua = st.ket_qua === k ? '' : k; load(); } }, h('small', {}, t), h('b', {}, d.counts[k])) : null))),
        h('div', { class: 'card' }, table({
          columns: [
            { key: 'ket_qua', label: 'Kết quả', render: (r) => kq(r.ket_qua) }, { key: 'a_so_phieu', label: 'Số phiếu', mono: true, render: (r) => r.a_so_phieu || r.b_so_phieu },
            { key: 'a_bien_so', label: 'Biển số', mono: true, render: (r) => r.a_bien_so || r.b_bien_so },
            { key: 'a_kl', label: 'KL HT', fmt: 'kg' }, { key: 'b_kl', label: 'KL ĐT', render: cell({ col: 'b_kl', diff: 'kl_hang_kg' }, fmt.kg), cls: 'num' },
            { key: 'a_don_gia', label: 'Giá HT', fmt: 'money' }, { key: 'b_don_gia', label: 'Giá ĐT', render: cell({ col: 'b_don_gia', diff: 'don_gia' }, fmt.money), cls: 'num' },
            { key: 'a_tien', label: 'Tiền HT', fmt: 'money' }, { key: 'b_tien', label: 'Tiền ĐT', render: cell({ col: 'b_tien', diff: 'tien_truoc_vat' }, fmt.money), cls: 'num' },
            { key: 'diffs', label: 'Chênh', cls: 'num', render: (r) => (r.diffs.find((x) => x.cot === 'tien_truoc_vat') ? fmt.money(r.diffs.find((x) => x.cot === 'tien_truoc_vat').chenh) : '') },
            { key: 'xu_ly', label: 'Xử lý', render: (r) => (r.ket_qua === 'KHOP' ? '' : h('button', { class: 'btn ghost sm', onclick: (e) => { e.stopPropagation(); resolve(r); } }, XL[r.xu_ly])) },
          ], rows: d.rows, rowClass: (r) => (r.ket_qua === 'KHOP' ? 'dup' : ['THIEU_BEN_A', 'THIEU_BEN_B'].includes(r.ket_qua) ? 'err' : 'flag'), wrapClass: 'tall' }),
        h('p', { class: 'muted' }, `Hiển thị ${d.rows.length}/${d.total} dòng — dòng lệch xếp trước.`)));
    };
    v.append(App.pageHead(`Kết quả: ${batch.ten}`, `${batch.don_vi || 'Mọi đơn vị'} · ${fmt.dt(batch.created_at)}`, h('button', { class: 'btn ghost', onclick: () => App.exportXlsx('export.recon', { batchId: batch.id }) }, '⬇ Xuất Excel'),
      h('button', { class: 'btn ghost', onclick: () => App.go('reconcile') }, '‹ Danh sách')), body);
    await load();
  }

  async function wizard(v) {
    const S = { o: null, info: null, mapping: {}, sheet: null, headerRow: 0 };
    const [dv, dots] = await Promise.all([api('catalog.options', { table: 'don_vi_van_chuyen' }), api('catalog.options', { table: 'dot_van_chuyen' })]);
    const root = h('div', {});
    const f = { ten: h('input', { 'data-f': 'ten', placeholder: 'VD: HAK – V.47' }), dv: h('select', { 'data-f': 'dv' }, h('option', { value: '' }, 'Mọi đơn vị'), dv.map((d) => h('option', { value: d.id }, d.label))),
      dot: h('select', {}, h('option', { value: '' }, 'Mọi đợt'), dots.map((d) => h('option', { value: d.id }, d.label))), tu: h('input', { type: 'date' }), den: h('input', { type: 'date' }),
      kg: h('input', { type: 'number', value: 0, style: { width: '90px' } }), tien: h('input', { type: 'number', value: 1, style: { width: '90px' } }) };
    const draw = () => {
      App.clear(root);
      root.append(h('div', { class: 'card' }, h('h3', {}, '1. Phạm vi hệ thống (bên A)'), h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, 'Tên lô đối chiếu *', f.ten), h('label', { class: 'field' }, 'Đơn vị vận chuyển', f.dv), h('label', { class: 'field' }, 'Đợt / Tàu', f.dot),
        h('div', { class: 'row' }, h('label', { class: 'field' }, 'Từ ngày', f.tu), h('label', { class: 'field' }, 'Đến ngày', f.den)),
        h('label', { class: 'field' }, 'Dung sai KL (kg)', f.kg), h('label', { class: 'field' }, 'Dung sai tiền (đ)', f.tien))),
      h('div', { class: 'card' }, h('h3', {}, '2. File của đối tác (bên B)'),
        h('button', { class: 'btn', 'data-act': 'pick', onclick: async () => { const x = await App.pickFile(); if (!x) return; const o = await call('recon.open', x); if (!o) return; S.o = o; S.sheet = o.suggestedSheet; await sheet(); draw(); } }, S.o ? `📂 ${S.o.fileName} — chọn file khác` : '📂 Chọn file…'),
        S.info ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, 'Sheet', h('select', { onchange: async (e) => { S.sheet = e.target.value; await sheet(); draw(); } }, S.o.sheets.map((s) => h('option', { value: s.name, selected: s.name === S.sheet }, s.name)))),
          h('label', { class: 'field' }, 'Dòng tiêu đề', h('input', { type: 'number', min: 1, value: S.headerRow + 1, onchange: async (e) => { S.info = await api('recon.sheetInfo', { token: S.o.token, sheetName: S.sheet, headerRow: Number(e.target.value) - 1 }); S.mapping = { ...S.info.mapping }; S.headerRow = S.info.headerRow; draw(); } })),
          FIELDS.map(([k, l]) => h('label', { class: 'field' }, l, h('select', { 'data-map': k, onchange: (e) => { if (e.target.value === '') delete S.mapping[k]; else S.mapping[k] = Number(e.target.value); } }, h('option', { value: '' }, '— không có —'), S.info.headers.map((c) => h('option', { value: c.index, selected: S.mapping[k] === c.index }, `${c.index + 1}. ${c.text}`)))))),
        h('p', { class: 'muted' }, 'Khớp theo Số phiếu; nếu file không có số phiếu thì khớp theo Biển số + Ngày + KL. Chỉ so các cột mà file đối tác có.')) : null),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-act': 'run', disabled: !S.info, onclick: async () => {
        const r = await call('recon.run', { token: S.o.token, ten: f.ten.value.trim(), don_vi_id: f.dv.value || null, dot_id: f.dot.value || null, tu_ngay: f.tu.value || null, den_ngay: f.den.value || null, sheetName: S.sheet, headerRow: S.headerRow, mapping: S.mapping, tolKg: Number(f.kg.value), tolMoney: Number(f.tien.value) });
        if (!r) return; App.toast(`Đã đối chiếu ${r.soA} phiếu hệ thống với ${r.soB} dòng đối tác`); const b = (await api('recon.batches')).find((x) => x.id === r.batchId); App.clear(v); await results(v, b);
      } }, 'Chạy đối chiếu')));
    };
    async function sheet() { S.info = await api('recon.sheetInfo', { token: S.o.token, sheetName: S.sheet }); S.mapping = { ...S.info.mapping }; S.headerRow = S.info.headerRow; }
    v.append(App.pageHead('Đối chiếu mới', 'Không sửa phiếu cân — chỉ ghi kết quả đối chiếu'), root); draw();
  }

  App.register('reconcile', {
    async render(v, params = {}) {
      const rows = await api('recon.batches');
      if (params.batchId) return results(v, rows.find((x) => x.id === params.batchId));
      v.append(App.pageHead('Đối chiếu', 'So bảng kê / đề nghị thanh toán của đơn vị vận chuyển với phiếu cân trong hệ thống', h('button', { class: 'btn', 'data-act': 'new', onclick: () => { App.clear(v); wizard(v); } }, '+ Đối chiếu mới')),
        h('div', { class: 'card' }, table({ columns: [{ key: 'id', label: '#', num: true }, { key: 'ten', label: 'Tên lô' }, { key: 'don_vi', label: 'Đơn vị' }, { key: 'created_at', label: 'Thời gian', fmt: 'dt' }, { key: 'tong', label: 'Dòng', fmt: 'int' }, { key: 'khop', label: 'Khớp', fmt: 'int' },
          { key: 'lech', label: 'Lệch', num: true, render: (b) => (b.tong - b.khop ? h('span', { class: 'tag red' }, b.tong - b.khop) : h('span', { class: 'tag green' }, 0)) }], rows, empty: 'Chưa có lô đối chiếu nào', onRow: (b) => App.go('reconcile', { batchId: b.id }) })));
    },
  });
})();
