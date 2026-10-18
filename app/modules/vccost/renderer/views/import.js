'use strict';
/** Import phiếu cân (4 bước) + Import danh mục xe + Cần kiểm tra + Lịch sử import. */
(() => {
  const { h, fmt, api, call, table, tag } = App;
  const FIELDS = [['so_phieu', 'Số phiếu *'], ['ngay_gio_can_1', 'Ngày giờ cân 1 *'], ['ngay_gio_can_2', 'Ngày giờ cân 2'], ['bien_so', 'Biển số *'], ['can_lan_1', 'Cân lần 1'], ['can_lan_2', 'Cân lần 2'], ['kl_hang_kg', 'KL hàng (kg) *'], ['noi_xuat', 'Nơi xuất *'], ['noi_den', 'Nơi đến']];
  const PHAN_LOAI = { NEW: 'green', EXACT_DUPLICATE: 'gray', KEY_CONFLICT: 'amber', IN_FILE_DUPLICATE: 'gray', ERROR: 'red' };

  App.register('import', {
    async render(v) {
      const S = { step: 1, open: null, info: null, mapping: {}, sheet: null, headerRow: 0, dotId: '', noiDenId: '', prev: null, filter: null, result: null };
      const root = h('div', {});
      const steps = () => h('div', { class: 'steps' }, ['1. Chọn file', '2. Sheet & cột', '3. Xem trước', '4. Kết quả'].map((t, i) => h('div', { class: 'step ' + (S.step === i + 1 ? 'on' : S.step > i + 1 ? 'done' : '') }, t)));
      const draw = () => { App.clear(root).append(steps()); ({ 1: s1, 2: s2, 3: s3, 4: s4 })[S.step](); };

      function s1() {
        root.append(h('div', { class: 'card' }, h('h3', {}, 'Chọn file phiếu cân (.xlsx / .xls / .csv)'),
          h('p', { class: 'muted' }, 'Import lại cùng file không tạo phiếu trùng: phiếu giống hệt được bỏ qua, phiếu cùng số phiếu + nơi xuất nhưng khác dữ liệu vào "Cần kiểm tra".'),
          h('div', { class: 'row' }, h('button', { class: 'btn', 'data-act': 'pick', onclick: async () => {
            const f = await App.pickFile(); if (!f) return;
            const o = await call('import.open', f); if (!o) return;
            S.open = o; S.sheet = o.suggestedSheet; await loadSheet(); S.step = 2; draw();
          } }, '📂 Chọn file…'), h('button', { class: 'btn ghost', onclick: () => importVehicles() }, '🚛 Import danh mục xe (sheet "Số xe")…')),
          h('div', { class: 'row', style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--line)' } }, h('span', { class: 'muted' }, 'Chưa có file? Tải file mẫu chuẩn rồi điền dữ liệu:'),
            h('button', { class: 'btn ghost sm', 'data-act': 'tpl-tickets', onclick: () => App.exportXlsx('template.tickets', {}) }, '⬇ File mẫu phiếu cân'),
            h('button', { class: 'btn ghost sm', 'data-act': 'tpl-vehicles', onclick: () => App.exportXlsx('template.vehicles', {}) }, '⬇ File mẫu danh sách xe'))));
      }
      async function loadSheet() { S.info = await api('import.sheetInfo', { token: S.open.token, sheetName: S.sheet, headerRow: null }); S.mapping = { ...S.info.mapping }; S.headerRow = S.info.headerRow; }

      async function s2() {
        const o = S.open;
        const dots = await api('catalog.options', { table: 'dot_van_chuyen' }); const dd = await api('catalog.options', { table: 'dia_diem' });
        root.append(
          h('div', { class: 'card' }, h('h3', {}, `${o.fileName}`), o.previouslyImported ? h('p', { class: 'tag amber' }, `File này đã import ở lô #${o.previouslyImported.batchId} (${fmt.dt(o.previouslyImported.at)}) — dòng trùng sẽ được bỏ qua`) : null,
            h('div', { class: 'form-grid' },
              h('label', { class: 'field' }, 'Sheet', h('select', { 'data-f': 'sheet', onchange: async (e) => { S.sheet = e.target.value; await loadSheet(); draw(); } }, o.sheets.map((s) => h('option', { value: s.name, selected: s.name === S.sheet }, `${s.name} (${s.rows} dòng)`)))),
              h('label', { class: 'field' }, 'Dòng tiêu đề (bắt đầu từ 1)', h('input', { type: 'number', min: 1, value: S.headerRow + 1, onchange: async (e) => { S.info = await api('import.sheetInfo', { token: o.token, sheetName: S.sheet, headerRow: Number(e.target.value) - 1 }); S.mapping = { ...S.info.mapping }; S.headerRow = S.info.headerRow; draw(); } })),
              h('label', { class: 'field' }, 'Gán vào đợt / tàu', h('select', { 'data-f': 'dot', onchange: (e) => (S.dotId = e.target.value) }, h('option', { value: '' }, '— không gán —'), dots.map((d) => h('option', { value: d.id, selected: String(S.dotId) === String(d.id) }, d.label)))),
              h('label', { class: 'field' }, 'Nơi đến mặc định (nếu file không có cột)', h('select', { 'data-f': 'noiden', onchange: (e) => (S.noiDenId = e.target.value) }, h('option', { value: '' }, '— không —'), dd.map((d) => h('option', { value: d.id, selected: String(S.noiDenId) === String(d.id) }, d.label)))))),
          h('div', { class: 'card' }, h('h3', {}, 'Ghép cột (tự nhận dạng — có thể sửa)'),
            h('div', { class: 'form-grid' }, FIELDS.map(([k, lbl]) => h('label', { class: 'field' }, lbl, h('select', { 'data-map': k, onchange: (e) => { if (e.target.value === '') delete S.mapping[k]; else S.mapping[k] = Number(e.target.value); } },
              h('option', { value: '' }, '— bỏ qua —'), S.info.headers.map((c) => h('option', { value: c.index, selected: S.mapping[k] === c.index }, `${c.index + 1}. ${c.text}`)))))),
            h('h3', { style: { marginTop: '14px' } }, 'Dữ liệu mẫu'), table({ columns: S.info.headers.map((c) => ({ key: String(c.index), label: c.text || `Cột ${c.index + 1}` })), rows: S.info.sample.map((r) => Object.fromEntries(r.map((x, i) => [String(i), x == null ? '' : String(x)]))) })),
          h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => { S.step = 1; draw(); } }, '‹ Quay lại'), h('button', { class: 'btn', 'data-act': 'preview', onclick: async () => {
            const miss = ['so_phieu', 'ngay_gio_can_1', 'bien_so', 'kl_hang_kg', 'noi_xuat'].filter((k) => S.mapping[k] === undefined);
            if (miss.length) return App.toast(`Thiếu cột bắt buộc: ${miss.join(', ')}`, true);
            const r = await call('import.preview', { token: S.open.token, sheetName: S.sheet, headerRow: S.headerRow, mapping: S.mapping, dotId: S.dotId || null, noiDenId: S.noiDenId || null });
            if (!r) return; S.prev = r; S.filter = null; S.step = 3; draw();
          } }, 'Xem trước ›')));
      }

      async function s3() {
        const c = S.prev.counts;
        const d = await api('import.previewRows', { token: S.open.token, filter: S.filter, offset: 0, limit: 300 });
        const chip = (key, label, n, cls = '') => h('div', { class: 'kpi click' + (cls ? ' ' + cls : ''), style: S.filter === key ? { outline: '2px solid var(--green)' } : null, onclick: () => { S.filter = S.filter === key ? null : key; draw(); } }, h('small', {}, label), h('b', {}, fmt.int(n)));
        root.append(h('div', { class: 'grid g6', style: { marginBottom: '12px' } },
          chip(null, 'Tổng dòng', c.total), chip('new', 'Mới', c.new), chip('exact', 'Trùng hoàn toàn', c.exact), chip('conflict', 'Trùng khóa – khác', c.conflict, c.conflict ? 'warn' : ''), chip('inFile', 'Trùng trong file', c.inFile), chip('error', 'Lỗi', c.error, c.error ? 'warn' : '')),
        h('div', { class: 'grid g4', style: { marginBottom: '12px' } }, chip('unknownVehicle', 'Xe chưa xác định', c.unknownVehicle, c.unknownVehicle ? 'warn' : ''), chip('unknownLocation', 'Nơi xuất chưa rõ', c.unknownLocation, c.unknownLocation ? 'warn' : ''),
          chip('noPrice', 'Chưa có đơn giá', c.noPrice, c.noPrice ? 'warn' : ''), chip('multiplePrice', 'Xung đột giá', c.multiplePrice, c.multiplePrice ? 'warn' : '')),
        h('div', { class: 'card' }, table({
          columns: [{ key: 'idx', label: 'Dòng', render: (r) => r.source_row || r.idx + 1, num: true }, { key: 'phan_loai', label: 'Phân loại', render: (r) => h('span', { class: `tag ${PHAN_LOAI[r.phan_loai]}` }, App.STATUS_TAG[r.phan_loai][1]) },
            { key: 'so_phieu', label: 'Số phiếu', mono: true }, { key: 'ngay_gio_can_1', label: 'Cân 1', fmt: 'dt', mono: true }, { key: 'bien_so', label: 'Biển số', mono: true }, { key: 'noi_xuat', label: 'Nơi xuất' },
            { key: 'kl_hang_kg', label: 'KL (kg)', fmt: 'kg' }, { key: 'don_gia', label: 'Đơn giá', fmt: 'money' }, { key: 'tien_truoc_vat', label: 'Trước VAT', fmt: 'money' },
            { key: 'warnings', label: 'Ghi chú', render: (r) => h('span', {}, (r.errors || []).join('; '), (r.warnings || []).map((w) => h('span', { class: 'tag red', style: { marginRight: '3px' } }, (App.STATUS_TAG[w] || [0, w])[1]))) }],
          rows: d.rows, rowClass: (r) => (r.phan_loai === 'ERROR' ? 'err' : r.phan_loai === 'KEY_CONFLICT' ? 'flag' : r.phan_loai.includes('DUPLICATE') ? 'dup' : ''), wrapClass: 'tall' }),
        h('p', { class: 'muted' }, `Hiển thị ${d.rows.length}/${d.total} dòng.`)),
        h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => { S.step = 2; draw(); } }, '‹ Quay lại'),
          h('button', { class: 'btn', 'data-act': 'commit', disabled: c.new + c.conflict === 0, onclick: async () => {
            if (!(await App.confirmBox('Xác nhận import', `Ghi ${c.new} phiếu mới. ${c.conflict} dòng trùng khóa sẽ vào "Cần kiểm tra", ${c.exact + c.inFile} dòng trùng bị bỏ qua, ${c.error} dòng lỗi không được ghi. Hệ thống sẽ tự backup trước khi ghi.`, 'Import'))) return;
            const r = await call('import.commit', { token: S.open.token, dotId: S.dotId || null, noiDenId: S.noiDenId || null }); if (!r) return; S.result = r; S.step = 4; draw();
          } }, `Import ${c.new} phiếu mới`)));
      }

      function s4() {
        const r = S.result;
        root.append(h('div', { class: 'card' }, h('h3', {}, '✅ Import hoàn tất'), h('div', { class: 'grid g4' },
          h('div', { class: 'kpi' }, h('small', {}, 'Phiếu mới'), h('b', {}, fmt.int(r.inserted))), h('div', { class: 'kpi' }, h('small', {}, 'Trùng bỏ qua'), h('b', {}, fmt.int(r.duplicate))),
          h('div', { class: 'kpi' + (r.conflict ? ' warn' : '') }, h('small', {}, 'Cần kiểm tra'), h('b', {}, fmt.int(r.conflict))), h('div', { class: 'kpi' }, h('small', {}, 'Đã tính giá'), h('b', {}, fmt.int(r.calculated)))),
          h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn', onclick: () => App.go('tickets') }, 'Xem phiếu cân'), r.conflict ? h('button', { class: 'btn amber', onclick: () => App.go('review') }, 'Xử lý "Cần kiểm tra"') : null,
            h('button', { class: 'btn ghost', onclick: () => App.go('alerts') }, 'Xem cảnh báo'), h('button', { class: 'btn ghost', onclick: () => App.go('import') }, 'Import file khác'))));
      }
      v.append(App.pageHead('Import phiếu cân', 'Không ghi DB cho tới khi bạn xác nhận ở bước 3'), root); draw();
    },
  });

  async function importVehicles() {
    const f = await App.pickFile(); if (!f) return;
    const r = await call('vehicles.importPreview', f); if (!r) return;
    const flags = { createMissingCarriers: false };
    const lbl = { NEW: 'Xe mới', SAME: 'Không đổi', CHANGED_CARRIER: 'Đổi đơn vị', ASSIGN_CARRIER: 'Gán đơn vị', NEW_UNKNOWN_CARRIER: 'Xe mới – đơn vị chưa có', UNKNOWN_CARRIER: 'Đơn vị chưa có', INVALID_PLATE: 'Biển số sai', DUP_IN_FILE: 'Trùng trong file' };
    const cb = h('input', { type: 'checkbox', onchange: (e) => (flags.createMissingCarriers = e.target.checked) });
    const chg = h('input', { type: 'date', style: { width: '160px' } });
    App.modal({ title: `Import danh mục xe — sheet "${r.sheet}"`, wide: true,
      body: h('div', {}, h('p', {}, Object.entries(r.counts).map(([k, n]) => `${lbl[k] || k}: ${n}`).join(' · ')),
        r.missingCarriers.length ? h('label', { class: 'row gap-s' }, cb, `Tự tạo đơn vị chưa có: ${r.missingCarriers.join(', ')}`) : null,
        r.counts.CHANGED_CARRIER ? h('label', { class: 'field' }, 'Xe đổi đơn vị: áp dụng từ ngày (để trống = không đổi)', chg) : null,
        table({ columns: [{ key: 'bien_so', label: 'Biển số', mono: true }, { key: 'don_vi_ma', label: 'Đơn vị trong file' }, { key: 'don_vi_hien_tai', label: 'Hiện tại' }, { key: 'status', label: 'Kết quả', render: (x) => lbl[x.status] || x.status }], rows: r.rows.slice(0, 200), wrapClass: '' })),
      actions: [{ label: 'Hủy', primary: false }, { label: 'Ghi danh mục xe', onClick: async () => { const x = await call('vehicles.importCommit', { token: r.token, createMissingCarriers: flags.createMissingCarriers, changeFrom: chg.value || null }, 'Đã import danh mục xe'); if (x) App.reload(); } }] });
  }

  // ------------------------------------------------------------ Cần kiểm tra
  App.register('review', {
    async render(v) {
      const rows = await api('import.pending');
      const show = (r) => {
        const FIELD = { ngay_gio_can_1: 'Cân 1', ngay_gio_can_2: 'Cân 2', bien_so: 'Biển số', can_lan_1: 'Cân lần 1', can_lan_2: 'Cân lần 2', kl_hang_kg: 'KL (kg)', noi_xuat: 'Nơi xuất' };
        const act = (a, label, cls) => ({ label, cls, onClick: async () => { const note = a === 'UPDATE' ? await App.promptBox('Lý do cập nhật', 'Ghi chú') : ''; if (a === 'UPDATE' && !note) return false; const x = await call('import.resolve', { id: r.id, action: a, note }, 'Đã xử lý'); if (x) App.reload(); } });
        App.modal({ title: `Phiếu ${r.so_phieu}: so sánh dữ liệu cũ và mới`, wide: true,
          body: h('div', {}, r.chot_ky_id ? h('p', { class: 'tag purple' }, 'Phiếu đã chốt kỳ — không thể cập nhật') : null,
            table({ columns: [{ key: 'f', label: 'Trường' }, { key: 'o', label: 'Đang lưu', render: (x) => h('span', { class: 'diff-old' }, x.o) }, { key: 'n', label: 'File mới', render: (x) => h('span', { class: 'diff-new' }, x.n) }],
              rows: (r.diffs.length ? r.diffs : []).map((d) => ({ f: FIELD[d.field] || d.field, o: String(d.old ?? ''), n: String(d.new ?? '') })), empty: 'Không có chênh lệch chi tiết' })),
          actions: [{ label: 'Đóng', primary: false }, act('IGNORE', 'Bỏ qua dòng mới', 'ghost'), act('KEEP_OLD', 'Giữ dữ liệu cũ', ''), ...(r.chot_ky_id ? [] : [act('UPDATE', 'Cập nhật theo file mới', 'amber')])] });
      };
      v.append(App.pageHead('Cần kiểm tra', 'Phiếu cùng số phiếu + nơi xuất nhưng dữ liệu khác — không bao giờ tự ghi đè'),
        h('div', { class: 'card' }, table({ columns: [{ key: 'so_phieu', label: 'Số phiếu', mono: true }, { key: 'bien_so', label: 'Biển số đang lưu', mono: true }, { key: 'kl_hang_kg', label: 'KL đang lưu', fmt: 'kg' }, { key: 'file_name', label: 'File nguồn' }, { key: 'source_row', label: 'Dòng', num: true },
          { key: 'diffs', label: 'Khác biệt', render: (r) => (r.diffs || []).map((d) => d.field).join(', ') }, { key: 'x', label: '', render: (r) => h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); show(r); } }, 'Xem & xử lý') }],
        rows, empty: '🎉 Không có phiếu nào cần kiểm tra', onRow: show })));
    },
  });

  // ------------------------------------------------------------ Lịch sử import
  App.register('batches', {
    async render(v) {
      const rows = await api('import.batches');
      const rowsOf = async (b) => { const d = await api('import.batchRows', { batchId: b.id, limit: 300 }); App.modal({ title: `Lô #${b.id} — ${b.file_name}`, wide: true, actions: [{ label: 'Đóng', primary: false }],
        body: table({ columns: [{ key: 'source_row', label: 'Dòng', num: true }, { key: 'so_phieu', label: 'Số phiếu', mono: true }, { key: 'bien_so', label: 'Biển số', mono: true }, { key: 'hanh_dong', label: 'Hành động' }, { key: 'trang_thai_phieu', label: 'Phiếu', tag: true }], rows: d.rows }) }); };
      const undo = async (b) => { const reason = await App.promptBox('Hoàn tác lô import', 'Lý do hoàn tác'); if (!reason) return; const x = await call('import.undo', { batchId: b.id, reason }, 'Đã hoàn tác lô'); if (x) App.reload(); };
      v.append(App.pageHead('Lịch sử import', 'Mỗi lần import là một lô; có thể hoàn tác cả lô nếu chưa chốt kỳ'),
        h('div', { class: 'card' }, table({ columns: [{ key: 'id', label: 'Lô', num: true }, { key: 'import_time', label: 'Thời gian', fmt: 'dt' }, { key: 'file_name', label: 'File' }, { key: 'total_rows', label: 'Dòng', fmt: 'int' }, { key: 'inserted_rows', label: 'Mới', fmt: 'int' },
          { key: 'duplicate_rows', label: 'Trùng', fmt: 'int' }, { key: 'conflict_rows', label: 'Cần kiểm tra', fmt: 'int' }, { key: 'error_rows', label: 'Lỗi', fmt: 'int' }, { key: 'trang_thai', label: 'Trạng thái', tag: true },
          { key: 'x', label: '', render: (b) => h('span', { class: 'row gap-s' }, h('button', { class: 'btn ghost sm', onclick: () => rowsOf(b) }, 'Chi tiết'), b.trang_thai === 'COMMITTED' ? h('button', { class: 'btn danger sm', onclick: () => undo(b) }, 'Hoàn tác') : null) }], rows, empty: 'Chưa import lần nào' })));
    },
  });
})();
