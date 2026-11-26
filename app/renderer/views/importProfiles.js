'use strict';

(function () {
  const D = window.DGVC;
  const { h } = D;
  const pickExcel = (title) => D.pickFile({ title, filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv'] }] });
  const option = (value, text, disabled = false) => h('option', { value, disabled }, text);
  const select = (choices, selected, change) => {
    const el = h('select', { onchange: change }, choices);
    el.value = selected;
    return el;
  };
  const field = (label, control) => {
    control.setAttribute('aria-label', label);
    return h('label', { class: 'field' }, h('span', {}, label), control);
  };
  const excelColumn = (index) => {
    let label = '';
    while (index > 0) {
      index--;
      label = String.fromCharCode(65 + index % 26) + label;
      index = Math.floor(index / 26);
    }
    return label;
  };
  const button = (label, onclick, color = '') => h('button', { type: 'button', class: `btn ${color}`, onclick }, label);

  D.importTrialResult = (result) => h('div', { class: 'stack', 'aria-label': 'Kết quả đọc thử' },
    h('h3', {}, 'Kết quả đọc thử'),
    h('p', {}, `${D.vn(result.count)} phiếu hợp lệ / ${D.vn(result.totalRows)} dòng · Tổng ${D.vnAuto(result.totalKg)} kg`),
    ...result.declaredTotals.map((t) => h('p', { class: 'small' }, `Dòng ${t.rowNo} · Tổng công bố ${D.vnAuto(t.kg)} kg · Chênh lệch (đọc − công bố) ${D.vnAuto(t.differenceKg)} kg`)),
    D.table({ rows: result.rows, columns: [
      { key: 'rowNo', label: 'Dòng Excel' },
      { key: 'ticket_no', label: 'Số phiếu', render: (row) => row.normalized.ticket_no },
      { key: 'plate_no', label: 'Biển số', render: (row) => row.normalized.plate_no },
      { key: 'weigh1_date', label: 'Ngày cân 1', render: (row) => D.dmy(row.normalized.weigh1_date) },
      { key: 'weigh1_time', label: 'Giờ cân 1', render: (row) => row.normalized.weigh1_time },
      { key: 'weigh2_date', label: 'Ngày cân 2', render: (row) => D.dmy(row.normalized.weigh2_date) },
      { key: 'weigh2_time', label: 'Giờ cân 2', render: (row) => row.normalized.weigh2_time },
      { key: 'net_kg', label: 'Khối lượng (kg)', num: true, render: (row) => D.vnAuto(row.normalized.net_kg) },
      { key: 'warehouse', label: 'Kho', render: (row) => row.normalized.warehouse },
      { key: 'import_note', label: 'Ghi chú', wrap: true, render: (row) => row.normalized.import_note },
    ] }),
    result.warningCount ? h('details', { open: true }, h('summary', {}, `${D.vn(result.warningCount)} cảnh báo / lỗi đọc`),
      h('ul', { class: 'small' }, result.warnings.map((w) => h('li', {}, `Dòng ${w.rowNo} · ${w.message}`))),
      result.warningCount > result.warnings.length ? h('p', { class: 'small muted' }, `Hiển thị ${result.warnings.length} cảnh báo / lỗi đầu tiên`) : null) : null);

  const showError = (out, error) => {
    const warnings = error.details?.warnings || [];
    out.replaceChildren(h('p', { class: 'issue', role: 'alert' }, D.errorText(error)),
      warnings.length ? h('ul', { class: 'small' }, warnings.map((w) => h('li', {}, `Dòng ${w.rowNo} · ${w.message}`))) : '');
  };

  function editor({ profile, fields, initialFile, numberStyle = 'AUTO', onSave, onDefault, onApply }) {
    const root = h('div', { class: 'card' });
    const mappingArea = h('div');
    const result = h('div', { 'aria-live': 'polite' });
    const name = h('input', { type: 'text', maxlength: 120, value: profile?.name || '', oninput: () => { saveButton.disabled = !trial?.count || !name.value.trim(); } });
    const fileStatus = h('span', { class: 'small muted' });
    const actions = h('div');
    root.addEventListener('profile-default', (event) => {
      if (profile?.id === event.detail.id) {
        profile = event.detail;
        defaultButton.hidden = profile.isDefault;
      }
    });
    const unit = select([option('', 'Theo ô hoặc tiêu đề'), option('kg', 'kg'), option('t', 'Tấn')], profile?.fallbackUnit ?? '', invalidate);
    const style = select([option('AUTO', 'Tự động'), option('VN', 'Việt Nam (1.234,5)'), option('EN', 'Anh / Mỹ (1,234.5)')], numberStyle, invalidate);
    let filePath = initialFile;
    let state = null;
    let mapped = { ...profile?.mapping };
    let trial = null;
    let revision = 0;
    const config = () => ({ headerRow: state.headerRow, mapping: mapped, fallbackUnit: unit.value });
    const payload = () => ({ filePath, sheetName: state.sheet, config: config(), numberStyle: style.value });
    const trialButton = button('Đọc thử', async () => {
      const version = ++revision;
      trialButton.disabled = true;
      result.textContent = 'Đang đọc file…';
      try {
        const { trial: read } = await D.api('import.profiles.inspect', payload(), { quiet: true });
        if (version !== revision) return;
        trial = read;
        result.replaceChildren(D.importTrialResult(trial));
        saveButton.disabled = !trial.count || (onSave && !name.value.trim());
      } catch (error) {
        if (version === revision) showError(result, error);
      } finally {
        if (version === revision) trialButton.disabled = false;
      }
    });
    const saveButton = button(onSave ? 'Lưu mẫu' : 'Áp dụng cách ghép', async () => {
      const current = payload();
      saveButton.disabled = true;
      try {
        if (onApply) {
          if (!await onApply({ readConfig: current.config, sheetName: current.sheetName, numberStyle: current.numberStyle })) saveButton.disabled = false;
          return;
        }
        const saved = await D.api('import.profiles.save', { ...current, id: profile?.id, rowVersion: profile?.rowVersion, name: name.value }, { quiet: true });
        profile = saved.item;
        trial = saved.trial;
        result.replaceChildren(D.importTrialResult(trial), h('p', { role: 'status' }, `Đã lưu mẫu “${profile.name}”.`));
        await onSave(profile);
      } catch (error) {
        showError(result, error);
        saveButton.disabled = false;
      }
    }, 'primary');

    const defaultButton = onDefault ? button('Đặt mẫu này làm mặc định', () => onDefault(profile.id)) : null;
    if (defaultButton) defaultButton.hidden = !profile || profile.isDefault;

    function invalidate() {
      revision++;
      trial = null;
      result.replaceChildren();
      saveButton.disabled = true;
      trialButton.disabled = !state;
    }

    async function inspect(sheetName, headerRow, suggest = true) {
      state = null;
      invalidate();
      mappingArea.replaceChildren();
      actions.hidden = true;
      const version = revision;
      try {
        const found = await D.api('import.profiles.inspect', { filePath, sheetName, headerRow }, { quiet: true });
        if (version !== revision) return;
        state = found;
        if (suggest) mapped = Object.fromEntries(Object.keys(fields).map((key) => [key, mapped[key] || found.suggested[key]]).filter(([, value]) => value));
        draw();
      } catch (error) {
        if (version !== revision) return;
        showError(result, error);
        if (sheetName && headerRow) mappingArea.append(button('Chọn lại dòng tiêu đề của sheet', () => inspect(sheetName)));
      }
    }

    function draw() {
      const sheet = select(state.sheets.map((s) => option(s.name, s.name)), state.sheet, (event) => inspect(event.target.value));
      const header = h('input', { type: 'number', min: 1, max: state.rowCount, value: state.headerRow,
        onchange: (event) => inspect(state.sheet, Number(event.target.value)) });
      const extraFields = ['origin', 'customer', 'ldd', 'weigh_type', 'transport_unit_name', 'row_no'];
      const columns = Object.entries(fields).map(([key, title]) => {
        const value = mapped[key] || '';
        const available = state.options.find((o) => o.name === value);
        const opts = [option('', '— Bỏ qua —'), ...state.options.map((o) => option(o.name, o.duplicate ? `${o.name} (trùng)` : o.name, o.duplicate))];
        if (value && !available) opts.push(option(value, `${value} (thiếu)`, true));
        return { extra: extraFields.includes(key), node: field(title, select(opts, value, (event) => {
          mapped = { ...mapped };
          if (event.target.value) mapped[key] = event.target.value;
          else delete mapped[key];
          invalidate();
        })) };
      });
      mappingArea.replaceChildren(h('div', { class: 'grid g2' }, field('Sheet', sheet), field('Dòng tiêu đề', header)),
        h('section', { 'aria-label': 'Xem trước tiêu đề' },
          h('h3', {}, `Tiêu đề Excel · Dòng ${state.headerRow}`),
          state.headerCells.length ? h('ul', { class: 'small' }, state.headerCells.map(({ column, title }) => h('li', {}, `${excelColumn(column)}: ${title}`)))
            : h('p', { class: 'small muted' }, 'Dòng này không có ô tiêu đề.')),
        h('div', { class: 'row' }, h('h3', {}, 'Ghép cột'), button('Gợi ý lại', () => { mapped = { ...state.suggested }; invalidate(); draw(); })),
        h('p', { class: 'small muted' }, 'Nếu Excel tách ngày và giờ, ghép từng cột vào Ngày cân và Giờ cân tương ứng. Nếu chung một cột, ghép vào Ngày cân và để trống Giờ cân.'),
        h('div', { class: 'grid g3' }, columns.filter((c) => !c.extra).map((c) => c.node)),
        h('details', { open: extraFields.some((key) => mapped[key]), style: { margin: '12px 0' } },
          h('summary', {}, 'Cột bổ sung'), h('div', { class: 'grid g3' }, columns.filter((c) => c.extra).map((c) => c.node))),
        h('div', { class: 'grid g2' }, field('Đơn vị dự phòng', unit), field('Kiểu số khi đọc thử', style)));
      actions.hidden = false;
      trialButton.disabled = false;
    }

    const open = button('Chọn file mẫu', async () => {
      const chosen = await pickExcel('Chọn file Excel mẫu');
      if (!chosen) return;
      filePath = chosen;
      fileStatus.textContent = chosen.split(/[\\/]/).pop();
      await inspect(undefined, profile?.headerRow);
      if (!state && profile?.headerRow) await inspect();
    });
    actions.append(h('div', { class: 'btns' }, trialButton, saveButton, defaultButton));
    actions.hidden = true;
    trialButton.disabled = true;
    saveButton.disabled = true;
    root.append(h('div', { class: 'row' }, open, fileStatus), onSave ? field('Tên mẫu', name) : '', mappingArea, actions, result);
    if (initialFile) {
      fileStatus.textContent = initialFile.split(/[\\/]/).pop();
      inspect(undefined, profile?.headerRow).then(() => { if (!state && profile?.headerRow) return inspect(); });
    }
    return root;
  }

  D.renderImportProfiles = async () => {
    const root = h('div', { class: 'stack' });
    const listing = h('div', { class: 'card stack' });
    const editing = h('div');
    const admin = D.can('ADMIN');
    const refresh = async () => {
      const { items, fields } = await D.api('import.profiles.list');
      const active = items.find((item) => item.isDefault);
      if (editing.firstChild) {
        for (const item of items) editing.firstChild.dispatchEvent(new CustomEvent('profile-default', { detail: item }));
      }
      const setDefault = async (id) => {
        const saved = await D.api('import.profiles.default', { id });
        await refresh();
        return saved;
      };
      const edit = (profile) => {
        editing.replaceChildren(editor({ profile, fields, onSave: refresh, onDefault: setDefault }));
      };
      listing.replaceChildren(
        h('div', { class: 'row' }, h('h2', {}, 'Mẫu nhập Excel'), D.tag('info', `Mặc định: ${active?.name || 'Tự nhận diện'}`)),
        admin ? h('div', { class: 'btns' }, button('Tạo mẫu', () => edit(), 'primary'),
          button('Dùng Tự nhận diện', () => setDefault(''))) : null,
        D.table({ rows: items, empty: 'Chưa có mẫu nhập. File mới sẽ dùng Tự nhận diện.', columns: [
          { key: 'name', label: 'Tên mẫu' },
          { key: 'headerRow', label: 'Dòng tiêu đề' },
          { key: 'fallbackUnit', label: 'Đơn vị dự phòng', render: (item) => ({ kg: 'kg', t: 'Tấn' })[item.fallbackUnit] || '—' },
          { key: 'isDefault', label: 'Trạng thái', render: (item) => item.isDefault ? D.tag('ok', 'Đang dùng') : '' },
          ...(admin ? [{ key: 'actions', label: 'Thao tác', render: (item) => h('div', { class: 'btns' },
            button('Sửa', () => edit(item), 'small'),
            button('Sao chép', () => D.formModal({ title: 'Sao chép mẫu', fields: [{ key: 'name', label: 'Tên mẫu', required: true, full: true }],
              values: { name: `${item.name} (bản sao)` }, submit: async ({ name }) => {
                await D.api('import.profiles.save', { name, copyFromId: item.id });
                await refresh();
              } }), 'small'),
            item.isDefault ? null : button('Đặt mặc định', () => setDefault(item.id), 'small'),
            button('Xóa', async () => {
              if (!await D.confirm({ title: 'Xóa mẫu nhập', message: `Xóa mẫu “${item.name}”?`, okLabel: 'Xóa mẫu', danger: true })) return;
              await D.api('import.profiles.delete', { id: item.id });
              editing.replaceChildren();
              await refresh();
            }, 'small danger')) }] : []),
        ] }));
    };
    root.append(listing, editing);
    await refresh();
    return root;
  };

  D.fixImportReading = async ({ filePath, numberStyle, previous, error, apply }) => {
    const { items, fields } = await D.api('import.profiles.list');
    const status = h('div', { 'aria-live': 'polite' });
    const config = h('div');
    const active = previous?.profileId ?? items.find((item) => item.isDefault)?.id ?? '';
    const choice = select([option('', 'Tự nhận diện'), ...items.map((item) => option(item.id, `${item.name}${item.isDefault ? ' (mặc định)' : ''}`))], active);
    if (error) showError(status, error);
    return new Promise((resolve) => {
      let pending = false;
      let closed = false;
      const attempt = async (next) => {
        if (pending) return false;
        pending = true;
        try {
          const response = await apply(next);
          if (!response) return false;
          resolve(response);
          if (!closed) modal.close();
          return true;
        } catch (err) {
          if (!closed) showError(status, err);
          return false;
        } finally {
          pending = false;
          if (closed) resolve(null);
        }
      };
      const modal = D.modal({ title: 'Cách đọc file phiếu cân', wide: true, onClose: () => { closed = true; if (!pending) resolve(null); },
        body: h('div', { class: 'stack' }, status, field('Mẫu đọc file', choice),
          h('div', { class: 'btns' },
            button('Đọc bằng mẫu đã chọn', async (event) => {
              event.currentTarget.disabled = true;
              const control = event.currentTarget;
              try { await attempt({ profileId: choice.value }); } finally { control.disabled = false; }
            }, 'primary'),
            button('Sửa cách ghép', () => config.replaceChildren(editor({
              profile: items.find((item) => item.id === choice.value) || previous?.config,
              fields, initialFile: filePath, numberStyle, onApply: attempt,
            })))), config),
        actions: [{ label: 'Quay lại', run: () => true }],
      });
    });
  };

  D.showImportHistory = async (onDone) => {
    const { items } = await D.api('import.list');
    const rows = items.filter((item) => item.import_type === 'PHIEU_CAN' && (item.status === 'CONFIRMED' || item.read_config_json));
    const readConfig = (item) => JSON.parse(item.read_config_json || 'null');
    const detail = (item) => {
      const c = readConfig(item);
      const { headerRow, fallbackUnit, mapping } = c?.config || c || {};
      const entries = Object.entries(mapping || JSON.parse(item.mapping_json || '{}')).map(([a, b]) => ({
        title: c?.mode === 'PROFILE' ? b : a, field: c?.mode === 'PROFILE' ? a : typeof b === 'object' ? JSON.stringify(b) : b,
      }));
      D.modal({ title: `Cách đọc đợt ${item.batch_id}`, body: h('div', {},
        h('p', {}, `${c?.name || 'Đợt cũ'} · Sheet ${item.sheet_name}${headerRow ? ` · Dòng tiêu đề ${headerRow}` : ''}`),
        fallbackUnit ? h('p', {}, `Đơn vị dự phòng: ${fallbackUnit === 't' ? 'Tấn' : 'kg'}`) : null,
        c?.fixed?.route_code ? h('p', {}, `Mã tuyến chung: ${c.fixed.route_code}`) : null,
        c?.numberStyle ? h('p', {}, `Kiểu số: ${{ AUTO: 'Tự động', VN: 'Việt Nam', EN: 'Anh / Mỹ' }[c.numberStyle]}`) : null,
        D.table({ rows: entries, columns: [{ key: 'title', label: 'Tiêu đề' }, { key: 'field', label: 'Trường dữ liệu' }] })),
      actions: D.writer() ? [{ label: 'Đọc lại file gốc', primary: true, run: async () => {
        const filePath = await pickExcel('Chọn lại file Excel gốc của đợt');
        if (!filePath) return false;
        return D.importWizard({ importType: 'PHIEU_CAN', filePath, sourceBatchId: item.batch_id, onDone });
      } }] : [] });
    };
    D.modal({ title: 'Lịch sử nhập phiếu cân', wide: true, body: D.table({ rows, onRow: detail, maxHeight: '55vh', columns: [
      { key: 'batch_id', label: 'Đợt' }, { key: 'file_name', label: 'File' },
      { key: 'date', label: 'Thời điểm', render: (item) => D.dt(item.confirmed_at || item.created_at) },
      { key: 'status', label: 'Trạng thái', render: (item) => ({ CONFIRMED: 'Đã nhập', PREVIEW: 'Đang xem trước', CANCELLED: 'Đã hủy xem trước' })[item.status] },
      { key: 'read_config_json', label: 'Cách đọc', render: (item) => readConfig(item)?.name || 'Đợt cũ' },
      { key: 'details', label: 'Thao tác', render: (item) => button('Xem cấu hình', (event) => { event.stopPropagation(); detail(item); }, 'small') },
    ] }) });
  };
})();
