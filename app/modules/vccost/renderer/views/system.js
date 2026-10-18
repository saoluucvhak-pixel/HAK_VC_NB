'use strict';
/** Cảnh báo, Audit log, Backup, Cài đặt, Đối chiếu (đang xây). */
(() => {
  const { h, fmt, api, call, table, tag } = App;

  App.register('alerts', {
    async render(v) {
      const st = { trang_thai: 'MOI,DANG_XU_LY', loai: '' };
      const defs = await api('alerts.types');
      const body = h('div', {});
      const load = async () => {
        const d = await api('alerts.list', { trang_thai: st.trang_thai || null, loai: st.loai || null });
        const set = async (a, s) => { const note = s === 'BO_QUA' ? await App.promptBox('Lý do bỏ qua', 'Ghi chú') : null; if (s === 'BO_QUA' && !note) return; await call('alerts.setStatus', { id: a.id, status: s, note }); load(); App.refreshInfo(); };
        App.clear(body).append(
          h('div', { class: 'row', style: { marginBottom: '12px' } }, d.summary.map((s) => h('span', { class: 'tag ' + (s.muc_do === 'CAO' ? 'red' : 'amber') }, `${(defs[s.loai] || [0, s.loai])[1]}: ${s.n}`))),
          h('div', { class: 'card' }, table({ columns: [{ key: 'muc_do', label: 'Mức', tag: true }, { key: 'loai', label: 'Loại', render: (a) => (defs[a.loai] || [0, a.loai])[1] }, { key: 'so_phieu', label: 'Phiếu', mono: true }, { key: 'bien_so', label: 'Biển số', mono: true },
            { key: 'nguyen_nhan', label: 'Chi tiết' }, { key: 'trang_thai', label: 'Trạng thái', tag: true },
            { key: '_a', label: '', render: (a) => (['MOI', 'DANG_XU_LY'].includes(a.trang_thai) ? h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost sm', onclick: () => set(a, 'DANG_XU_LY') }, 'Đang xử lý'), h('button', { class: 'btn ghost sm', onclick: () => set(a, 'BO_QUA') }, 'Bỏ qua')) : '') }],
          rows: d.rows, empty: '🎉 Không có cảnh báo', wrapClass: 'tall' }), h('p', { class: 'muted' }, `${d.total} cảnh báo. Cảnh báo do engine tự đóng khi dữ liệu được sửa.`)));
      };
      v.append(App.pageHead('Trung tâm cảnh báo', 'Mọi bất thường dữ liệu tập trung một nơi'),
        h('div', { class: 'card row' }, h('label', { class: 'field' }, 'Trạng thái', h('select', { onchange: (e) => { st.trang_thai = e.target.value; load(); } }, h('option', { value: 'MOI,DANG_XU_LY' }, 'Đang mở'), h('option', { value: '' }, 'Tất cả'), h('option', { value: 'DA_XU_LY' }, 'Đã xử lý'), h('option', { value: 'BO_QUA' }, 'Bỏ qua'))),
          h('label', { class: 'field' }, 'Loại', h('select', { onchange: (e) => { st.loai = e.target.value; load(); } }, h('option', { value: '' }, 'Tất cả'), Object.entries(defs).map(([k, d]) => h('option', { value: k }, d[1]))))), body);
      await load();
    },
  });

  App.register('audit', {
    async render(v) {
      const st = { entity: '', action: '', offset: 0 }; const body = h('div', {});
      const load = async () => {
        const d = await api('audit.list', { entity: st.entity || undefined, action: st.action || undefined, limit: 100, offset: st.offset });
        App.clear(body).append(h('div', { class: 'card' }, table({ columns: [{ key: 'id', label: '#', num: true }, { key: 'ts', label: 'Thời gian', fmt: 'dts', mono: true }, { key: 'action', label: 'Hành động', mono: true }, { key: 'entity', label: 'Đối tượng' }, { key: 'entity_id', label: 'ID', num: true }, { key: 'note', label: 'Ghi chú' },
          { key: 'old_value', label: 'Giá trị', render: (r) => h('span', { class: 'mono muted' }, String(r.new_value || r.old_value || '').slice(0, 90)) }], rows: d.rows, onRow: (r) => App.modal({ title: `Audit #${r.id} — ${r.action}`, wide: true, actions: [{ label: 'Đóng', primary: false }], body: h('div', {}, h('h3', {}, 'Trước'), h('pre', { class: 'json' }, r.old_value || '—'), h('h3', {}, 'Sau'), h('pre', { class: 'json' }, r.new_value || '—')) }), wrapClass: 'tall' }),
          h('div', { class: 'pager' }, `${d.total} dòng`, h('button', { class: 'btn ghost sm', disabled: st.offset === 0, onclick: () => { st.offset -= 100; load(); } }, '‹'), h('button', { class: 'btn ghost sm', disabled: st.offset + 100 >= d.total, onclick: () => { st.offset += 100; load(); } }, '›'))));
      };
      v.append(App.pageHead('Audit log', 'Mọi thay đổi dữ liệu đều được ghi lại — không sửa/xóa được'),
        h('div', { class: 'card row' }, h('label', { class: 'field' }, 'Đối tượng', h('input', { placeholder: 'phieu_can, bang_gia…', onchange: (e) => { st.entity = e.target.value.trim(); st.offset = 0; load(); } })), h('label', { class: 'field' }, 'Hành động', h('input', { placeholder: 'CREATE, UPDATE…', onchange: (e) => { st.action = e.target.value.trim().toUpperCase(); st.offset = 0; load(); } }))), body);
      await load();
    },
  });

  App.register('backup', {
    async render(v) {
      const rows = await api('backup.list');
      v.append(App.pageHead('Backup & khôi phục', 'Tự backup hằng ngày và trước mỗi lần import/khôi phục', h('button', { class: 'btn', 'data-act': 'backup', onclick: async () => { if (await call('backup.now', {}, 'Đã tạo backup')) App.reload(); } }, '💾 Backup ngay')),
        h('div', { class: 'card' }, table({ columns: [{ key: 'name', label: 'File', mono: true }, { key: 'kind', label: 'Loại' }, { key: 'time', label: 'Thời gian', fmt: 'dt' }, { key: 'size', label: 'Dung lượng (KB)', fmt: (x) => fmt.int(x / 1024), num: true },
          { key: '_a', label: '', render: (b) => h('button', { class: 'btn danger sm', onclick: async () => { if (await App.confirmBox('Khôi phục', `Khôi phục dữ liệu từ ${b.name}? Dữ liệu hiện tại được backup lại trước.`, 'Khôi phục', 'danger')) { if (await call('backup.restore', { file: b.file }, 'Đã khôi phục')) App.reload(); } } }, 'Khôi phục') }], rows, empty: 'Chưa có backup' })));
    },
  });

  const mb = (n) => (n / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' MB';
  async function storageCard() {
    const api_ = window.vcApi;
    if (!api_ || !api_.storageInfo) return h('div', { class: 'card' }, h('h3', {}, 'Thư mục lưu trữ dữ liệu'), h('p', { class: 'muted' }, 'Chỉ đổi được trong ứng dụng cài trên máy (Windows).'));
    const info = await api_.storageInfo();
    const apply = async (target, mode) => {
      const r = await api_.changeStorage({ target, mode });
      if (!r.ok) return App.toast(r.error, true);
      App.modal({ title: 'Đang khởi động lại…', body: h('p', {}, `Dữ liệu sẽ nằm ở: ${r.target}. ${r.note || ''}`), actions: [] });
    };
    const choose = async () => {
      const dir = await api_.pickFolder(); if (!dir) return;
      const mode = await new Promise((res) => App.modal({ title: 'Chuyển thư mục lưu trữ', onClose: () => res(null), body: h('div', {},
        h('p', {}, h('b', {}, 'Thư mục mới: '), h('span', { class: 'mono' }, dir)),
        h('p', {}, 'Chọn cách chuyển:'), h('p', { class: 'muted' }, '• Chép dữ liệu hiện tại sang thư mục mới (thư mục mới phải trống). Thư mục cũ được giữ nguyên.'), h('p', { class: 'muted' }, '• Dùng dữ liệu có sẵn ở thư mục mới (khi bạn đã chép tay từ máy khác/USB). Không ghi đè gì cả.')),
      actions: [{ label: 'Hủy', primary: false, onClick: () => res(null) }, { label: 'Dùng dữ liệu có sẵn ở đó', cls: 'ghost', onClick: () => res('USE') }, { label: 'Chép dữ liệu sang đó', onClick: () => res('COPY') }] }));
      if (mode) apply(dir, mode);
    };
    return h('div', { class: 'card' }, h('h3', {}, 'Thư mục lưu trữ dữ liệu'),
      h('p', {}, h('span', { class: 'mono', 'data-f': 'storage-path' }, info.current), '  ', h('span', { class: 'tag gray' }, mb(info.size)), info.source === 'CUSTOM' ? h('span', { class: 'tag blue', style: { marginLeft: '6px' } }, 'Do bạn chọn') : null),
      h('p', { class: 'muted' }, 'Gồm CSDL, backup, file đã import/xuất. Nên chọn ổ có backup riêng. Ứng dụng sẽ tự khởi động lại sau khi đổi.'),
      info.source === 'ENV' ? h('p', { class: 'tag amber' }, 'Đang bị cố định bởi biến môi trường VCCOST_DATA_DIR') : h('div', { class: 'row' }, h('button', { class: 'btn', 'data-act': 'choose-storage', onclick: choose }, '📁 Chọn thư mục khác…'),
        info.source === 'CUSTOM' ? h('button', { class: 'btn ghost', onclick: async () => { if (await App.confirmBox('Về thư mục mặc định', `Dùng lại ${info.default}? Dữ liệu ở đó phải còn nguyên.`, 'Đồng ý')) apply(null, 'USE'); } }, 'Về thư mục mặc định') : null));
  }

  App.register('settings', {
    async render(v) {
      const s = await api('settings.all'); const info = await api('app.info');
      const r = s.rounding.statement; const ta = s.time_anomaly;
      const modes = [['HALF_UP', 'Làm tròn thường (như Excel ROUND)'], ['DOWN', 'Cắt bớt'], ['UP', 'Làm tròn lên']];
      const mode = (val, k) => h('select', { 'data-s': k }, modes.map(([m, l]) => h('option', { value: m, selected: m === val }, l)));
      const f = { la: h('input', { type: 'number', value: r.lineAmount.digits, style: { width: '80px' } }), lm: mode(r.lineAmount.mode, 'lm'), va: h('input', { type: 'number', value: r.vat.digits, style: { width: '80px' } }), vm: mode(r.vat.mode, 'vm'),
        gap: h('input', { type: 'number', value: ta.minGapMinutes }), dur: h('input', { type: 'number', value: ta.maxWeighDurationMinutes }) };
      const bcfg = s.backup || {}; const bk = h('input', { type: 'number', value: bcfg.intervalDays === undefined ? 1 : bcfg.intervalDays, style: { width: '80px' } });
      const co = s.company || {};
      const cf = {}; const cmk = (k, label, ph) => { cf[k] = h('input', { value: co[k] || '', placeholder: ph || '' }); return h('label', { class: 'field' }, label, cf[k]); };
      const companyCard = h('div', { class: 'card' }, h('h3', {}, 'Thông tin Bên A (in trên Bảng kê / báo cáo)'), h('p', { class: 'muted' }, 'Công ty của bạn — bên thuê/thanh toán vận chuyển. Bên B lấy từ danh mục Đơn vị vận chuyển (tên, MST, địa chỉ).'),
        h('div', { class: 'form-grid' }, cmk('ten', 'Tên công ty'), cmk('ma_so_thue', 'Mã số thuế'), cmk('dia_chi', 'Địa chỉ'), cmk('dai_dien', 'Người đại diện ký'), cmk('chuc_vu', 'Chức danh', 'Giám đốc'), cmk('nguoi_lap', 'Kế toán / người lập biểu'), cmk('xung_ho', 'Xưng hô (Ông/Bà)'), cmk('dien_thoai', 'Điện thoại'), cmk('email', 'Email'), cmk('noi_ky', 'Địa danh ghi trên chứng từ', 'Quảng Ngãi')),
        h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn', 'data-act': 'save-company', onclick: async () => { await call('settings.set', { key: 'company', value: Object.fromEntries(Object.entries(cf).map(([k, el]) => [k, el.value.trim()])) }, 'Đã lưu thông tin công ty'); } }, 'Lưu')));
      v.append(App.pageHead('Cài đặt'), companyCard,
        h('div', { class: 'card' }, h('h3', {}, 'Làm tròn theo bảng kê'), h('p', { class: 'muted' }, 'Số chữ số thập phân: 0 = đến đồng; −2 = đến trăm đồng.'),
          h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Thành tiền mỗi dòng — số chữ số', f.la), h('label', { class: 'field' }, 'Kiểu', f.lm), h('label', { class: 'field' }, 'VAT — số chữ số', f.va), h('label', { class: 'field' }, 'Kiểu', f.vm)),
          h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn', 'data-act': 'save-rounding', onclick: async () => { await call('settings.set', { key: 'rounding', value: { level: 'STATEMENT', statement: { lineAmount: { digits: Number(f.la.value), mode: f.lm.value }, vat: { digits: Number(f.va.value), mode: f.vm.value } } } }, 'Đã lưu'); } }, 'Lưu'))),
        h('div', { class: 'card' }, h('h3', {}, 'Ngưỡng cảnh báo thời gian'), h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Hai chuyến liên tiếp cách nhau tối thiểu (phút)', f.gap), h('label', { class: 'field' }, 'Một lần cân kéo dài tối đa (phút)', f.dur)),
          h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: async () => { await call('settings.set', { key: 'time_anomaly', value: { ...ta, minGapMinutes: Number(f.gap.value), maxWeighDurationMinutes: Number(f.dur.value) } }, 'Đã lưu & cập nhật cảnh báo'); } }, 'Lưu'))),
        h('div', { class: 'card' }, h('h3', {}, 'Sao lưu tự động khi mở phần mềm'),
          h('p', { class: 'muted' }, 'Mỗi lần mở phần mềm, nếu bản sao lưu tự động gần nhất đã quá số ngày này thì tự sao lưu lại. Nhập 0 để tắt.'),
          h('div', { class: 'row', style: { alignItems: 'flex-end' } }, h('label', { class: 'field' }, 'Định kỳ sao lưu (ngày / lần)', bk),
            h('button', { class: 'btn', 'data-act': 'save-backup', onclick: async () => { const n = Math.max(0, Math.floor(Number(bk.value) || 0)); await call('settings.set', { key: 'backup', value: { ...bcfg, auto: n ? 'INTERVAL' : 'OFF', intervalDays: n } }, n ? `Đã lưu: sao lưu mỗi ${n} ngày` : 'Đã tắt sao lưu tự động'); } }, 'Lưu'))),
        await storageCard(),
        h('div', { class: 'card' }, h('h3', {}, 'Thông tin hệ thống'), h('div', { class: 'muted' }, `Phiên bản ${info.version} · schema v${info.schema} · ${info.driver}`, h('br'), `Dữ liệu: ${info.dataDir || '(trình duyệt dev)'}`),
          h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn ghost', onclick: async () => { if (await App.confirmBox('Tính lại', 'Tính lại toàn bộ phiếu chưa chốt theo bảng giá hiện hành?')) { const x = await call('cost.recalc', { all: true }); if (x) App.toast(`Đã tính lại ${x.count ?? ''} phiếu`); } } }, '🔄 Tính lại tất cả phiếu'),
            h('button', { class: 'btn ghost', 'data-act': 'initial', onclick: async () => { if (await App.confirmBox('Nạp dữ liệu ban đầu', 'Nạp danh mục, bảng giá, giá dầu, xe và phiếu cân từ file Excel V.47 đi kèm? Dữ liệu đã có không bị ghi đè, phiếu trùng được bỏ qua.')) { const r = await call('initial.load', {}); if (r) { App.toast(`Đã nạp: ${r.phieu.inserted} phiếu mới, ${r.phieu.duplicate} trùng bỏ qua`); App.reload(); } } } }, '📦 Nạp dữ liệu ban đầu (Excel V.47)'),
            h('button', { class: 'btn ghost', 'data-act': 'seed', onclick: async () => { if (await App.confirmBox('Nạp dữ liệu mẫu', 'Nạp danh mục, bảng giá, giá dầu của file mẫu V.47?')) { if (await call('seed.loadSample', {}, 'Đã nạp dữ liệu mẫu')) App.reload(); } } }, '🌱 Nạp dữ liệu mẫu V.47'))));
    },
  });
})();
