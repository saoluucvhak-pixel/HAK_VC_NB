'use strict';
/* Phiếu cân (4.2) · Giao nhận dầu (4.3) · Import dùng chung (4.3b) · Kiểm tra dữ liệu */
(function () {
  const D = window.DGVC; const { h } = D;

  // ───────── Bộ lọc thông minh dùng chung cho Phiếu cân / Giao nhận dầu ─────────
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDay = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
  const monthEnd = (y, m) => isoOf(new Date(y, m, 0));
  /** 24 tháng gần nhất (mới → cũ) cho ô "Kỳ". */
  const recentMonths = () => { const now = new Date(); const out = []; for (let i = 0; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ value: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` }); } return out; };
  const sfLoad = (id) => { try { const s = JSON.parse(window.localStorage.getItem(`dgvc.sf.last.${id}`) || 'null'); return s && typeof s === 'object' ? D.sf.normalize(s) : null; } catch { return null; } };
  const sfKeep = (id, s) => { try { window.localStorage.setItem(`dgvc.sf.last.${id}`, JSON.stringify(s)); } catch { /* không lưu được thì bỏ qua */ } };
  /** Nút chọn nhanh khoảng ngày: Hôm nay · 7 ngày · Tháng này · Tháng trước · Từ kỳ tính gần nhất. setRange(từ, đến) do màn hình áp dụng. */
  const rangeButtons = (setRange, lastPeriodEnd) => {
    const b = (label, fn, title) => h('button', { type: 'button', class: 'btn small sf-ghost', title: title || '', onclick: fn }, label);
    const today = () => isoOf(new Date());
    return [
      b('Hôm nay', () => setRange(today(), today())),
      b('7 ngày', () => setRange(addDay(today(), -6), today()), '7 ngày gần nhất, tính cả hôm nay'),
      b('Tháng này', () => { const n = new Date(); setRange(`${n.getFullYear()}-${pad2(n.getMonth() + 1)}-01`, monthEnd(n.getFullYear(), n.getMonth() + 1)); }),
      b('Tháng trước', () => { const n = new Date(); const y = n.getMonth() ? n.getFullYear() : n.getFullYear() - 1; const m = n.getMonth() || 12; setRange(`${y}-${pad2(m)}-01`, monthEnd(y, m)); }),
      b('Từ kỳ tính gần nhất', async () => { const e = await lastPeriodEnd(); if (!e) { D.toast('Chưa có kỳ tính nào', 'info'); return; } setRange(addDay(e, 1), ''); }, 'Từ ngày sau kỳ tính (không hủy) gần nhất đến hết')
    ];
  };
  /** Ngày kết thúc của kỳ tính không hủy gần nhất (của hợp đồng nếu có). */
  const lastPeriodEnd = async (contractId) => {
    const d = await D.api('periods.list', contractId ? { contractId } : {}, { quiet: true }).catch(() => ({ items: [] }));
    const ends = (d.items || []).filter((p) => p.status !== 'HUY').map((p) => p.date_to).filter(Boolean).sort();
    return ends.length ? ends[ends.length - 1] : '';
  };

  // ───────── Import (dùng chung phiếu cân / dầu) ─────────
  /** Tải file Excel mẫu để import (sinh theo danh mục hiện tại: tuyến, xe, đơn vị). */
  D.importTemplate = async ({ importType, contractId }) => {
    const def = importType === 'PHIEU_CAN' ? `Mau_Import_PhieuCan_${D.state.boot.install.unitCode || ''}.xlsx` : `Mau_Import_GiaoNhanDau_${contractId || ''}.xlsx`;
    const target = window.dgvc ? await D.pickFile({ title: 'Lưu file Excel mẫu', save: true, defaultPath: def, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }) : '';
    if (window.dgvc && !target) return;
    const r = await D.api('import.template', { importType, contractId, targetPath: target || undefined });
    D.toast(`Đã tạo file mẫu: ${r.path} — nhập từ dòng ${r.firstDataRow} sheet ${r.sheet}`, 'ok', 9000);
    if (window.dgvc) D.api('system.openPath', { path: r.path }, { quiet: true }).catch(() => {});
  };
  /** Tự động nhận diện file Excel là Phiếu cân hay Bảng kê dầu và mở luồng nạp tương ứng. */
  D.autoDetectImport = async ({ filePath: targetFile, onDone, defaultContractId } = {}) => {
    const filePath = targetFile || await D.pickFile({ title: 'Chọn file Excel phiếu cân hoặc bảng kê dầu', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv'] }] });
    if (!filePath) return;
    try {
      const inspect = await D.api('import.profiles.inspect', { filePath }, { quiet: true });
      const sheetNames = (inspect.sheets || []).map((s) => (s.name || '').toUpperCase());
      const headerTitles = (inspect.headerCells || []).map((c) => (c.title || '').toLowerCase());
      const isFuel = sheetNames.some((s) => s.includes('GIAONHANDAU') || s.includes('DAU'))
        || headerTitles.some((t) => t.includes('nhận dầu') || t.includes('lít') || t.includes('đơn giá dầu'));
      const importType = isFuel ? 'GIAO_NHAN_DAU' : 'PHIEU_CAN';
      let contractId = defaultContractId;
      if (importType === 'GIAO_NHAN_DAU' && !contractId) {
        const contracts = D.contractOptions(false);
        if (contracts.length === 1) contractId = contracts[0][0];
        else if (contracts.length > 1) {
          contractId = await new Promise((resolve) => {
            const sel = h('select', {}, contracts.map(([v, t]) => h('option', { value: v }, t)));
            D.modal({
              title: 'Chọn hợp đồng cho bảng kê dầu',
              body: h('div', { class: 'stack' },
                h('p', {}, 'Hệ thống nhận diện file là Bảng kê giao nhận dầu. Vui lòng chọn hợp đồng áp dụng:'),
                h('label', { class: 'field' }, h('span', {}, 'Hợp đồng'), sel)),
              actions: [
                { label: 'Hủy', run: () => true },
                { label: 'Tiếp tục', primary: true, run: () => resolve(sel.value) }
              ],
              onClose: () => resolve('')
            });
          });
          if (!contractId) return;
        }
      }
      D.toast(`Nhận diện tự động: ${importType === 'PHIEU_CAN' ? 'Phiếu cân' : 'Bảng kê giao nhận dầu'}`, 'info', 4000);
      return D.importWizard({ importType, contractId, filePath, onDone });
    } catch {
      return D.importWizard({ importType: 'PHIEU_CAN', contractId: defaultContractId, filePath, onDone });
    }
  };

  /** Khung kéo thả thông minh hỗ trợ thả file trực tiếp vào ứng dụng. */
  D.smartDropzone = (onDone, getContractId) => {
    const el = h('div', {
      class: 'smart-dropzone',
      onclick: () => D.autoDetectImport({ onDone, defaultContractId: typeof getContractId === 'function' ? getContractId() : getContractId }),
      ondragover: (e) => { e.preventDefault(); el.classList.add('drag-over'); },
      ondragleave: () => el.classList.remove('drag-over'),
      ondrop: async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;
        const file = files[0].path;
        if (!file) return;
        await D.autoDetectImport({ filePath: file, onDone, defaultContractId: typeof getContractId === 'function' ? getContractId() : getContractId });
      }
    },
      h('span', { class: 'dropzone-icon' }, '📥'),
      h('div', { class: 'dropzone-text' },
        h('strong', {}, 'Kéo thả file Excel / CSV vào đây hoặc bấm để chọn'),
        h('span', { class: 'small muted' }, 'Tự động phân biệt Phiếu cân hoặc Bảng kê dầu, quét cột dữ liệu và mở xem trước')
      )
    );
    return el;
  };

  D.importWizard = async ({ importType, contractId, onDone, filePath: knownFile, numberStyle, sourceBatchId,
    preview: knownPreview, reading = {} }) => {
    const filePath = knownFile || await D.pickFile({ title: importType === 'PHIEU_CAN' ? 'Chọn file Excel phiếu cân' : 'Chọn file Excel bảng kê dầu', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv'] }] });
    if (!filePath) return;
    const readApi = (extra) => D.api('import.preview', { importType, contractId, filePath, numberStyle, sourceBatchId, ...extra }, { quiet: true });
    const read = async (extra) => {
      try {
        return await readApi(extra);
      } catch (err) {
        const missing = err.details?.missing || [];
        if (err.details?.code !== 'E_MAPPING_REQUIRED' || missing.length !== 1 || missing[0] !== 'route_code') throw err;
        const sel = h('select', {}, D.routeOptions(false).map(([v, t]) => h('option', { value: v }, t)));
        const confirmed = await new Promise((resolve) => D.modal({
          title: 'File không có cột mã tuyến',
          body: h('div', {}, h('p', {}, 'Chọn mã tuyến áp dụng cho mọi dòng.'), h('label', { class: 'field' }, h('span', {}, 'Mã tuyến'), sel)),
          actions: [{ label: 'Hủy', run: () => true }, { label: 'Tiếp', primary: true, run: () => resolve(sel.value) }],
          onClose: () => resolve(''),
        }));
        if (!confirmed) return null;
        return readApi({ ...extra, fixedValues: { route_code: confirmed } });
      }
    };
    let pv = knownPreview;
    if (!pv) {
      try {
        pv = await read(reading);
      } catch (error) {
        if (importType === 'PHIEU_CAN' && !sourceBatchId && ['E_MAPPING_REQUIRED', 'E_IMPORT_PROFILE'].includes(error.details?.code)) {
          pv = await D.fixImportReading({ filePath, numberStyle, error, apply: read });
        } else {
          D.toast(D.errorText(error), 'err', 9000);
          return false;
        }
      }
    }
    if (!pv) return false;
    const profileMapping = pv.readConfig?.config?.mapping;
    const previewMapping = profileMapping
      ? Object.entries(profileMapping).map(([f, h]) => ({ h, f }))
      : Object.entries(pv.mapping).map(([h, f]) => ({ h, f }));
    const skip = new Set();
    const rows = [];
    try {
      let total;
      for (let page = 1; total === undefined || rows.length < total; page++) {
        const result = await D.api('import.previewRows', { batchId: pv.batchId, page, pageSize: 1000 });
        total = result.total;
        rows.push(...result.rows);
        if (!result.rows.length && rows.length < total) throw new Error('Không tải đủ dòng xem trước — hãy mở lại file');
      }
    } catch (error) {
      await D.api('import.cancel', { batchId: pv.batchId }, { quiet: true }).catch(() => {});
      throw error;
    }
    const S = pv.summary;
    const accept = h('input', { type: 'checkbox', id: 'acc' });
    let modal = null;
    // kiểu số trong file: ô chữ "17,470" đọc được 17,47 (kiểu Việt) hoặc 17.470 (kiểu Anh) → bắt buộc người dùng chọn, đổi thì xem trước lại
    const reopen = (preview) => {
      modal.close();
      return D.importWizard({ importType, contractId, onDone, filePath, sourceBatchId, preview });
    };
    const styleSel = h('select', { 'aria-label': 'Kiểu số trong file', disabled: !!sourceBatchId, onchange: async (event) => {
      const selector = event.currentTarget;
      selector.disabled = true;
      const sameReading = pv.readConfig ? { reuseReading: true }
        : { mapping: pv.mapping, headerRow: pv.headerRowNo, sheetName: pv.sheet, fixedValues: pv.fixedValues };
      try {
        const next = await read({ ...sameReading, numberStyle: selector.value,
          replaceBatchId: pv.batchId });
        if (next) await reopen(next);
      } catch (error) {
        D.toast(D.errorText(error), 'err', 9000);
      } finally {
        selector.disabled = false;
        selector.value = pv.numberStyle || 'AUTO';
      }
    } },
      [['AUTO', 'Tự động'], ['VN', 'Việt Nam — 1.234,5 (chấm ngăn nghìn, phẩy thập phân)'], ['EN', 'Anh / Mỹ — 1,234.5 (phẩy ngăn nghìn, chấm thập phân)']].map(([v, t]) => h('option', { value: v, selected: v === (pv.numberStyle || 'AUTO') }, t)));
    const ambiguous = rows.some((r) => (r.issues || []).some((i) => i.code === 'E_NUMBER_AMBIGUOUS'));
    const preview = h('div');
    const status = h('select', { 'aria-label': 'Trạng thái dòng nhập', onchange: () => { page = 1; drawPreview(); } },
      [['', 'Tất cả dòng'], ['ERROR', 'Dòng lỗi'], ['WARNING', 'Cảnh báo'], ['UPDATE', 'Cập nhật / khôi phục'], ['OK', 'Hợp lệ'], ['DUPLICATE', 'Đã có']]
        .map(([value, label]) => h('option', { value }, label)));
    let page = 1;
    const pageSize = 200;
    const drawPreview = () => {
      const filtered = status.value ? rows.filter((row) => row.status === status.value) : rows;
      preview.replaceChildren(
      D.table({ maxHeight: '46vh', columns: [{ key: 'rowNo', label: 'Dòng', fmt: 'int' }, { key: 'status', label: 'Kiểm tra', render: (r) => h('span', { class: `tag ${{ OK: 'ok', WARNING: 'warn', ERROR: 'err', DUPLICATE: 'mute', UPDATE: 'info' }[r.status]}` }, { OK: 'Hợp lệ', WARNING: 'Cảnh báo', ERROR: 'Lỗi', DUPLICATE: 'Đã có', UPDATE: 'Cập nhật' }[r.status]) },
        ...(importType === 'PHIEU_CAN' ? [{ key: 'a', label: 'Số phiếu', render: (r) => r.normalized.ticket_no }, { key: 'weigh1_date', label: 'Ngày cân 1', render: (r) => D.dmy(r.normalized.weigh1_date) },
          { key: 'weigh1_time', label: 'Giờ cân 1', render: (r) => r.normalized.weigh1_time },
          { key: 'weigh2_date', label: 'Ngày cân 2', render: (r) => D.dmy(r.normalized.weigh2_date) },
          { key: 'weigh2_time', label: 'Giờ cân 2', render: (r) => r.normalized.weigh2_time },
          { key: 'c', label: 'Biển số', render: (r) => r.normalized.plate_no },
          { key: 'd', label: 'KL (KG)', num: true, render: (r) => D.vn(r.normalized.net_kg) }, { key: 'e', label: 'Tuyến', render: (r) => r.normalized.route_code }]
          : [{ key: 'a', label: 'Ngày nhận', render: (r) => D.dmy(r.normalized.receive_date) }, { key: 'b', label: 'Mã xe', render: (r) => r.normalized.fuel_vehicle_code }, { key: 'c', label: 'Biển số', render: (r) => r.normalized.plate_no },
            { key: 'd', label: 'Lít', num: true, render: (r) => D.vnAuto(r.normalized.qty_liter) }, { key: 'e', label: 'Đơn giá', num: true, render: (r) => D.vnAuto(r.normalized.fuel_price_excl_vat) }]),
        { key: 'i', label: 'Ghi chú', wrap: true, render: (r) => {
          const notes = (r.issues || []).map((i) => i.message);
          const hasUnknownVehicle = (r.issues || []).some((i) => ['W_VEHICLE_UNKNOWN', 'E_VEHICLE_NOT_FOUND'].includes(i.code));
          const hasUnknownRoute = (r.issues || []).some((i) => ['E_ROUTE_NOT_FOUND', 'E_ROUTE_MISSING'].includes(i.code));
          const plateNo = r.normalized.plate_no || r.normalized.fuel_vehicle_code;
          const routeCode = r.normalized.route_code;
          const quickActions = [];
          if (hasUnknownVehicle && plateNo && D.writer()) {
            quickActions.push(h('button', {
              class: 'btn small primary quick-add-btn',
              title: `Thêm nhanh xe ${plateNo} vào danh mục xe`,
              onclick: async (e) => {
                e.stopPropagation();
                D.formModal({
                  title: `Thêm nhanh xe ${plateNo}`,
                  fields: [
                    { key: 'plate_no', label: 'Biển số xe', required: true },
                    { key: 'owner_unit_code', label: 'Chủ xe', type: 'select', options: D.unitOptions(), required: true },
                    { key: 'payload_ton', label: 'Tải trọng định mức (tấn)', type: 'number', hint: 'Tùy chọn' },
                    { key: 'volume_m3', label: 'Thể tích thùng (m³)', type: 'number', hint: 'Tùy chọn' },
                  ],
                  values: { plate_no: plateNo, owner_unit_code: D.state.boot?.install?.unitCode || '' },
                  submit: async (vals) => {
                    await D.api('vehicles.save', vals);
                    D.toast(`Đã thêm xe ${plateNo} vào danh mục`, 'ok');
                    const next = await read({ reuseReading: true, replaceBatchId: pv.batchId });
                    if (next) await reopen(next);
                  }
                });
              }
            }, `+ Thêm xe ${plateNo}`));
          }
          if (hasUnknownRoute && routeCode && D.writer()) {
            quickActions.push(h('button', {
              class: 'btn small primary quick-add-btn',
              title: `Thêm nhanh tuyến ${routeCode} vào danh mục tuyến`,
              onclick: async (e) => {
                e.stopPropagation();
                D.formModal({
                  title: `Thêm nhanh tuyến ${routeCode}`,
                  fields: [
                    { key: 'route_code', label: 'Mã tuyến', required: true },
                    { key: 'route_name', label: 'Tên tuyến', required: true },
                    { key: 'trip_distance_km', label: 'Cự ly chuyến (km)', type: 'number', required: true },
                    { key: 'uom', label: 'ĐVT', type: 'select', options: [['TAN', 'Tấn'], ['M3', 'm³']], required: true },
                  ],
                  values: { route_code: routeCode, route_name: `Tuyến ${routeCode}`, trip_distance_km: 10, uom: 'TAN' },
                  submit: async (vals) => {
                    await D.api('routes.save', vals);
                    D.toast(`Đã thêm tuyến ${routeCode} vào danh mục`, 'ok');
                    const next = await read({ reuseReading: true, replaceBatchId: pv.batchId });
                    if (next) await reopen(next);
                  }
                });
              }
            }, `+ Thêm tuyến ${routeCode}`));
          }
          return h('div', {}, notes.join('; '), ...quickActions);
        } },
        { key: 's', label: 'Bỏ', render: (r) => h('input', { type: 'checkbox', 'aria-label': `Bỏ dòng ${r.rowNo}`, checked: r.status === 'ERROR' || skip.has(r.rowNo), disabled: r.status === 'ERROR', onchange: (e) => { if (e.target.checked) skip.add(r.rowNo); else skip.delete(r.rowNo); refreshConfirm(); } }) }], rows: filtered.slice((page - 1) * pageSize, page * pageSize) }),
        D.pager({ total: filtered.length, page, pageSize, goto: (next) => { page = next; drawPreview(); } }));
    };
    const body = h('div', {},
      h('label', { class: 'field', style: { maxWidth: '520px', marginBottom: '8px' } }, h('span', {}, 'Kiểu số trong file'), styleSel),
      ambiguous ? h('p', { class: 'small', style: { color: 'var(--red-text)' } }, 'Có dòng số dạng chữ như "17,470" đọc được hai cách (khác nhau 1.000 lần). Chọn đúng "Kiểu số trong file" ở trên để xem trước lại.') : null,
      importType === 'PHIEU_CAN' ? h('div', { class: 'row' }, D.tag('info', `Cách đọc: ${pv.readConfig?.name || 'Tự nhận diện'}`),
        sourceBatchId ? h('span', { class: 'small muted' }, `Theo cấu hình đợt ${sourceBatchId}`) : h('button', { class: 'btn small', onclick: async (event) => {
          const control = event.currentTarget;
          control.disabled = true;
          try {
            const next = await D.fixImportReading({ filePath, numberStyle: pv.numberStyle, previous: pv.readConfig,
              apply: (opts) => read({ ...opts, replaceBatchId: pv.batchId }) });
            if (next) await reopen(next);
          } finally { control.disabled = false; }
        } }, 'Đổi cách đọc')) : null,
      h('div', { class: 'row small' }, h('span', { class: 'mono' }, pv.fileName), `· sheet "${pv.sheet}" · dòng tiêu đề ${pv.headerRowNo}`, Object.keys(pv.fixedValues || {}).length ? D.tag('info', `Mã tuyến chung: ${pv.fixedValues.route_code}`) : null),
      pv.sameFileImportedBefore ? h('p', {}, h('span', { class: 'tag warn' }, 'Cảnh báo'), ' File này đã import trước đây (cùng SHA-256).') : null,
      h('div', { class: 'kpis', style: { marginTop: '10px' } }, [['Tổng dòng', S.total], ['Hợp lệ', S.ok], ['Cảnh báo', S.warning], ...(S.update ? [['Cập nhật / khôi phục', S.update]] : []), ['Đã có (bỏ qua)', S.duplicate], ['Lỗi', S.error]].map(([l, v]) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, D.vn(v))))),
      pv.trial ? h('details', {}, h('summary', {}, 'Tổng kg, tổng công bố và cảnh báo đọc file'), D.importTrialResult(pv.trial)) : null,
      h('details', {}, h('summary', {}, 'Ghép cột'), D.table({ columns: [{ key: 'h', label: 'Cột trong file' }, { key: 'f', label: 'Cột dữ liệu' }], rows: previewMapping, maxHeight: '220px' })),
      h('label', { class: 'field' }, h('span', {}, 'Lọc dòng xem trước'), status), preview,
      h('label', { class: 'check', for: 'acc', style: { marginTop: '10px' } }, accept, S.update ? 'Chấp nhận các dòng cảnh báo và cập nhật phiếu đã có theo file' : 'Chấp nhận các dòng cảnh báo'));
    for (const r of rows) if (r.status === 'ERROR') skip.add(r.rowNo);
    const confirmCount = () => rows.filter((row) => ['OK', 'WARNING', 'UPDATE'].includes(row.status) && !skip.has(row.rowNo)).length;
    const refreshConfirm = () => { if (modal) modal.box.querySelector('.foot button.primary').textContent = `Xác nhận import ${confirmCount()} dòng`; };
    drawPreview();
    modal = D.modal({ title: importType === 'PHIEU_CAN' ? 'Import phiếu cân — xem trước' : 'Import bảng kê dầu — xem trước', wide: true, body,
      onClose: () => D.api('import.cancel', { batchId: pv.batchId }, { quiet: true }).catch(() => {}),
      actions: [{ label: 'Hủy', run: () => true }, { label: `Xác nhận import ${confirmCount()} dòng`, primary: true, run: async () => {
        const r = await D.api('import.confirm', { batchId: pv.batchId, skipRowNos: [...skip], acceptWarnings: accept.checked, clientRequestId: D.rid() });
        const dates = rows.filter((row) => ['OK', 'WARNING', 'UPDATE'].includes(row.status) && !skip.has(row.rowNo))
          .map((row) => importType === 'PHIEU_CAN' ? row.normalized.weigh1_date : row.normalized.receive_date)
          .filter(Boolean).sort();
        const carriers = D.state.boot.contracts.filter((c) => c.role === 'CARRIER' && c.is_active !== false);
        const target = carriers.find((c) => c.contract_id === contractId)
          || (!contractId && carriers.length === 1 ? carriers[0] : null);
        const shortcut = dates.length && target && (r.inserted || r.updated || r.restored) ? {
          label: 'Tính giá kỳ này',
          run: () => D.go('calc', { contractId: target.contract_id, dateFrom: dates[0], dateTo: dates.at(-1) })
        } : null;
        D.toast(`Đã import ${r.inserted} dòng${r.updated ? ` · cập nhật ${r.updated} phiếu` : ''}${r.restored ? ` · khôi phục ${r.restored} phiếu` : ''} · bỏ qua ${r.duplicates} dòng đã có${r.recalcPeriods && r.recalcPeriods.length ? ` · ${r.recalcPeriods.length} kỳ nháp phải tính lại` : ''}`, 'ok', 8000, shortcut);
        if (onDone) onDone();
        return true;
      } }] });
  };

  // ───────── Phiếu cân ─────────
  D.views.tickets = {
    async render(p) {
      // Bộ lọc thông minh (HAK Smart Filter): lọc phía máy chủ để vẫn phân trang đủ mọi phiếu
      const TK_USAGE = [{ value: 'FREE', label: 'Chưa tính kỳ' }, { value: 'NHAP', label: 'Ở kỳ nháp' }, { value: 'DA_XAC_NHAN', label: 'Đã xác nhận' }, { value: 'DA_KHOA', label: 'Đã khóa' }, { value: 'DELETED', label: 'Đã xóa' }];
      let sfState = D.sf.empty();
      const fromParams = (q0) => D.sf.normalize({ q: q0.q || '', tu: q0.dateFrom || '', den: q0.dateTo || '', one: { route: q0.routeCode || '', owner: q0.ownerUnitCode || '', usage: q0.usage || '' }, flag: { flags: !!q0.onlyFlags } });
      const hasParams = !!(p && (p.dateFrom || p.dateTo || p.routeCode || p.ownerUnitCode || p.usage || p.q || p.onlyFlags));
      sfState = hasParams ? fromParams(p) : (sfLoad('tickets') || sfState); // không có tham số chuyển màn → nhớ bộ lọc lần trước
      const toServer = (s) => ({ dateFrom: s.tu || '', dateTo: s.den || '', q: s.q || '', routeCode: (s.one || {}).route || '', ownerUnitCode: (s.one || {}).owner || '', usage: (s.one || {}).usage || '', onlyFlags: !!(s.flag || {}).flags,
        importedSince: (s.flag || {}).today ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : '' });
      let sfInfo = { kept: 0, total: 0 }; let sfMount = null;
      const sfCfg = {
        screenId: 'tickets', searchPlaceholder: '🔍 Tìm số phiếu / biển số…', qAttrs: { 'aria-label': 'Tìm phiếu cân theo số phiếu hoặc biển số' },
        quickFields: ['q', 'period', 'route', 'usage'], advancedFields: ['q', 'period', 'route', 'owner', 'usage', 'flags', 'today'],
        periods: recentMonths, periodNoneLabel: 'Kỳ: tất cả',
        fields: [
          { key: 'route', label: 'Tuyến', type: 'enum', options: () => D.routeOptions(false).map(([v, l]) => ({ value: v, label: l })) },
          { key: 'owner', label: 'Chủ xe', type: 'enum', options: () => D.unitOptions().map(([v, l]) => ({ value: v, label: l })) },
          { key: 'usage', label: 'Trạng thái', type: 'enum', options: TK_USAGE },
          { key: 'flags', label: 'Chỉ phiếu có cảnh báo', type: 'bool' },
          { key: 'today', label: 'Chỉ phiếu mới nhập hôm nay', type: 'bool' }
        ],
        state: { get: () => sfState, set: (s) => { sfState = s; sfKeep('tickets', s); } },
        dataSource: () => sfInfo, onApply: () => { pg = 1; load(); }, onReset: () => {}, scopeFallback: () => 'Tất cả phiếu',
        actions: () => rangeButtons((tu, den) => { sfState = D.sf.setDates(sfState, tu, den); sfKeep('tickets', sfState); pg = 1; load(); if (sfMount) sfMount.refresh(); }, () => lastPeriodEnd(''))
      };
      const out = h('div', { class: 'card flush' });
      const PAGE = 500; let pg = 1; const guard = D.latest();
      const load = async (opts = {}) => {
        if (opts === true || (opts && opts.reset)) pg = 1; // bấm Lọc / đổi điều kiện → về trang 1
        const tok = guard.next();
        const sv = toServer(sfState); const filtered = !D.sf.isEmpty(sfState);
        const d = await D.api('tickets.list', { ...sv, page: pg, pageSize: PAGE });
        const base = filtered ? await D.api('tickets.list', { page: 1, pageSize: 1 }, { quiet: true }).catch(() => null) : null; // tổng chưa lọc, để hiện "đang hiện N / tổng"
        if (!guard.ok(tok)) return; // đã có lần tải mới hơn — bỏ kết quả cũ
        sfInfo = { kept: d.total, total: base ? base.total : d.total };
        if (d.total && pg > Math.ceil(d.total / PAGE)) { pg = Math.ceil(d.total / PAGE); return load(); } // sau khi xóa hết trang cuối
        out.innerHTML = '';
        const deletedView = (sfState.one || {}).usage === 'DELETED';
        out.append(h('div', { class: 'row', style: { padding: '10px 14px', borderBottom: '1px solid var(--line)' } },
          h('span', { class: 'small muted grow' }, deletedView ? 'Phiếu đã xóa — bấm vào 1 phiếu để khôi phục (import lại file có phiếu đó cũng tự khôi phục).' : 'Bấm vào 1 phiếu để xem / sửa / xóa. Import lại file đã sửa số liệu sẽ cập nhật phiếu đã có (trừ phiếu ở kỳ đã chốt).'),
          D.writer() && !deletedView && d.total ? h('button', { class: 'btn small danger', onclick: () => bulkDelete(toServer(sfState), load) }, `Xóa ${D.vn(d.total)} phiếu đang lọc…`) : null));
        out.append(D.table({ rows: d.items, onRow: (r) => ticketDrawer(r.ticket_id, load), footer: { ticket_no: `${D.vn(d.totals.trips)} phiếu`, net_kg: d.totals.kg },
          columns: [...D.TICKET_COLS, { key: 'ldd', label: 'LDĐ' }, { key: 'u', label: 'Kỳ đang dùng', render: (r) => (r.usages.length ? r.usages.map((u) => h('div', {}, D.tag(u.status), ' ', h('span', { class: 'mono small' }, u.periodCode))) : h('span', { class: 'tag mute' }, 'Chưa tính')) },
            { key: 'validation_flags', label: 'Cảnh báo', render: (r) => (r.validation_flags && !r.flags_ack ? h('span', { class: 'tag warn' }, r.validation_flags) : '') }],
          empty: 'Chưa có phiếu cân — bấm "Import từ Excel"' }));
        out.append(D.pager({ total: d.total, page: pg, pageSize: PAGE, goto: (n) => { pg = n; load(); } }));
        if (sfMount) sfMount.refresh();
      };
      const page = D.page('Phiếu cân', '2 · Phiếu cân', [D.writer() ? h('button', { class: 'btn', onclick: () => bulkDesc(load) }, 'Sửa hàng loạt cột mô tả') : null,
        D.writer() ? h('button', { class: 'btn', onclick: () => D.importTemplate({ importType: 'PHIEU_CAN' }) }, 'Tải file mẫu') : null,
        h('button', { class: 'btn', onclick: () => D.showImportHistory(load) }, 'Lịch sử nhập'),
        D.writer() ? h('button', { class: 'btn primary', onclick: () => D.importWizard({ importType: 'PHIEU_CAN', onDone: load }) }, 'Import từ Excel') : null],
      D.writer() ? D.smartDropzone(load) : null,
      h('div', { class: 'card' }, (sfMount = D.smartFilter.mount(sfCfg)).el), out);
      await load();
      return page;
    },
  };

  async function ticketDrawer(ticketId, reload) {
    const g = await D.api('tickets.get', { ticketId }); const t = g.record;
    const locked = g.usages.some((u) => u.status !== 'NHAP');
    const fields = [
      { key: 'weigh1_time', label: 'Giờ cân 1', readonly: locked }, { key: 'weigh2_date', label: 'Ngày cân 2', type: 'date', readonly: locked }, { key: 'weigh2_time', label: 'Giờ cân 2', readonly: locked },
      { key: 'weight1_kg', label: 'Cân lần 1', type: 'number', readonly: locked }, { key: 'weight2_kg', label: 'Cân lần 2', type: 'number', readonly: locked }, { key: 'net_kg', label: 'KL hàng (KG)', type: 'number', readonly: locked },
      { key: 'route_code', label: 'Mã tuyến', type: 'select', options: D.routeOptions(false), readonly: locked }, { key: 'ldd', label: 'LDĐ' }, { key: 'origin', label: 'Nguồn gốc' }, { key: 'customer', label: 'Khách hàng' },
      { key: 'weigh_type', label: 'Kiểu cân' }, { key: 'transport_unit_name', label: 'Đơn vị VC' }, { key: 'reason', label: 'Lý do sửa', full: true }];
    const form = D.form(fields, t);
    const body = h('div', {}, h('p', {}, h('b', { class: 'mono' }, `Phiếu ${t.ticket_no}`), ` · ${D.dmy(t.weigh1_date)} · ${t.plate_no}`),
      t.warehouse ? h('p', { class: 'small' }, `Kho: ${t.warehouse}`) : null,
      t.import_note ? h('p', { class: 'small' }, `Ghi chú nhập: ${t.import_note}`) : null,
      locked ? h('p', { class: 'small' }, h('span', { class: 'tag ok' }, 'Đã xác nhận / khóa'), ' Chỉ sửa được cột mô tả (bắt buộc lý do).') : null,
      h('h2', {}, 'Kỳ đang dùng'), g.usages.length ? h('ul', {}, g.usages.map((u) => h('li', {}, D.tag(u.status), ' ', u.periodCode))) : h('p', { class: 'muted' }, 'Chưa vào kỳ nào'),
      D.writer() ? form : null, h('h2', { style: { marginTop: '14px' } }, 'Dữ liệu gốc trong file'), h('pre', { class: 'small mono', style: { whiteSpace: 'pre-wrap' } }, JSON.stringify(g.raw || JSON.parse(t.raw_row_json || '{}'), null, 1)),
      h('h2', {}, 'Lịch sử sửa'), D.table({ columns: [{ key: 'ts', label: 'Lúc', fmt: 'datetime' }, { key: 'username', label: 'Người' }, { key: 'action', label: 'Việc' }, { key: 'after_json', label: 'Nội dung' }, { key: 'reason', label: 'Lý do' }], rows: g.audit, maxHeight: '220px' }));
    if (t.is_deleted) {
      D.modal({ title: 'Phiếu cân đã xóa', drawer: true, body, actions: D.writer() ? [{ label: 'Khôi phục phiếu', primary: true, run: async () => { await D.api('tickets.restore', { ticketId, reason: 'Khôi phục' }); D.toast(`Đã khôi phục phiếu ${t.ticket_no}`, 'ok'); reload(); return true; } }] : [] });
      return;
    }
    const actions = D.writer() ? [{ label: 'Xóa phiếu', danger: true, run: async () => { const r = await D.confirm({ title: 'Xóa phiếu cân', message: 'Xóa mềm — vẫn còn trong lịch sử.', reason: true, danger: true }); if (!r) return false; await D.api('tickets.softDelete', { ticketId, reason: r }); reload(); return true; } },
      ...(t.validation_flags && !t.flags_ack ? [{ label: 'Xác nhận cảnh báo (giữ nguyên)', run: async () => { const r = await D.confirm({ title: 'Giữ nguyên dữ liệu', message: `Cảnh báo: ${t.validation_flags}`, reason: true }); if (!r) return false; await D.api('tickets.ackFlags', { ticketIds: [ticketId], note: r }); reload(); return true; } }] : []),
      { label: 'Lưu thay đổi', primary: true, run: async () => {
        const v = form.values(); const changes = {}; for (const f of fields) if (f.key !== 'reason' && String(v[f.key] ?? '') !== String(t[f.key] ?? '')) changes[f.key] = v[f.key];
        if (!Object.keys(changes).length) return true;
        const r = await D.api('tickets.update', { ticketId, changes, rowVersion: t.row_version, reason: v.reason });
        if (r.affectedPeriods.length) D.toast('Kỳ nháp có phiếu này phải tính lại', 'info'); reload(); return true; } }] : [];
    D.modal({ title: 'Chi tiết phiếu cân', body, drawer: true, actions });
  }

  async function bulkDelete(filter, reload) {
    // áp lên TOÀN BỘ phiếu khớp bộ lọc (mọi trang), không chỉ trang đang hiện
    const all = await D.api('tickets.list', { ...filter, idsOnly: true });
    const locked = all.lockedCount; const kg = all.totals.kg;
    const r = await D.confirm({ title: 'Xóa phiếu cân đang lọc', danger: true, reason: true,
      message: `Xóa ${D.vn(all.total)} phiếu (${D.vn(kg)} kg) khớp bộ lọc hiện tại (tất cả các trang).${locked ? ` ${D.vn(locked)} phiếu ở kỳ đã xác nhận / khóa sẽ được GIỮ LẠI.` : ''} Xóa mềm — khôi phục được (lọc "Đã xóa", hoặc import lại file).` });
    if (!r) return;
    const x = await D.api('tickets.softDeleteMany', { ticketIds: all.ids, reason: r });
    D.toast(`Đã xóa ${x.deleted} phiếu${x.skipped.length ? ` · giữ ${x.skipped.length} phiếu ở kỳ đã chốt` : ''}${x.notFound && x.notFound.length ? ` · ${x.notFound.length} mã không tồn tại` : ''}${x.alreadyDeleted && x.alreadyDeleted.length ? ` · ${x.alreadyDeleted.length} phiếu đã xóa từ trước` : ''}${x.affectedPeriods.length ? ` · ${x.affectedPeriods.length} kỳ nháp phải tính lại` : ''}`, 'ok', 9000);
    reload();
  }

  async function bulkDesc(reload) {
    const f = D.form([{ key: 'field', label: 'Cột', type: 'select', options: [['ldd', 'LDĐ'], ['origin', 'Nguồn gốc'], ['customer', 'Khách hàng'], ['weigh_type', 'Kiểu cân'], ['transport_unit_name', 'Đơn vị VC']] },
      { key: 'fromValue', label: 'Giá trị đang có (đúng từng chữ)', required: true }, { key: 'toValue', label: 'Giá trị mới', required: true }, { key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' },
      { key: 'reason', label: 'Lý do', full: true, required: true }], { field: 'ldd' });
    D.modal({ title: 'Sửa hàng loạt cột mô tả', body: h('div', {}, h('p', { class: 'small muted' }, 'Cột mô tả không ảnh hưởng số tính — kỳ không phải tính lại. Ghi lịch sử từng phiếu.'), f), actions: [{ label: 'Hủy', run: () => true },
      { label: 'Xem trước', run: async () => { const v = f.values(); const pv = await D.api('tickets.previewBulkDescriptive', v); D.toast(`${pv.count} phiếu (${D.vn(pv.kg)} kg) · ở kỳ đã xác nhận ${pv.inConfirmed} · đã khóa ${pv.inLocked}`, 'info', 8000); return false; } },
      { label: 'Sửa', primary: true, run: async () => { const v = f.values(); if (!v.reason) { D.toast('Nhập lý do', 'err'); return false; } const r = await D.api('tickets.bulkUpdateDescriptive', { ...v, clientRequestId: D.rid() }); D.toast(`Đã sửa ${r.updated} phiếu`, 'ok'); reload(); return true; } }] });
  }

  // ───────── Giao nhận dầu ─────────
  D.views.fuel = {
    async render(p) {
      const opts = D.contractOptions(false);
      const f = D.form([{ key: 'contractId', label: 'Hợp đồng', type: 'select', options: opts }],
        { contractId: p.contractId || (D.contractOptions(true)[0] || opts[0] || [''])[0] });
      f.className = 'filters filters-one';
      const out = h('div', { class: 'card flush' });
      const isCarrier = () => (D.state.boot.contracts.find((c) => c.contract_id === f.values().contractId) || {}).role === 'CARRIER';
      const acts = h('div', { class: 'btns' });
      // Bộ lọc thông minh (HAK Smart Filter): lọc ngay trên toàn bộ dòng dầu của hợp đồng đang chọn
      const FU_USAGE = [{ value: 'FREE', label: 'Chưa vào kỳ' }, { value: 'NHAP', label: 'Ở kỳ nháp' }, { value: 'DA_XAC_NHAN', label: 'Đã xác nhận' }, { value: 'DA_KHOA', label: 'Đã khóa' }];
      let allRows = []; let sfState = sfLoad('fuel') || D.sf.empty(); let sfInfo = { kept: 0, total: 0 }; let sfMount = null;
      const uniq = (k) => [...new Set(allRows.map((r) => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true })).map((v) => ({ value: String(v), label: String(v) }));
      const sfCfg = {
        screenId: 'fuel', searchPlaceholder: '🔍 Tìm biển số / mã xe / kho…', qAttrs: { 'aria-label': 'Tìm dòng dầu theo biển số, mã xe hoặc kho nhận' },
        quickFields: ['q', 'period', 'plate', 'usage'], advancedFields: ['q', 'period', 'plate', 'route', 'usage', 'flags'],
        periods: recentMonths, periodNoneLabel: 'Kỳ: tất cả',
        fields: [
          { key: 'plate', label: 'Biển số', type: 'multi', options: () => uniq('plate_no'), match: (r, sel) => D.sf.inSet(sel, r.plate_no) },
          { key: 'route', label: 'Tuyến', type: 'multi', options: () => uniq('route_code'), match: (r, sel) => D.sf.inSet(sel, r.route_code) },
          { key: 'usage', label: 'Trạng thái kỳ', type: 'enum', options: FU_USAGE, match: (r, v) => (v === 'FREE' ? !r.period : !!r.period && r.period.status === v) },
          { key: 'flags', label: 'Chỉ dòng có cảnh báo', type: 'bool', match: (r) => !!(r.validation_flags && !r.flags_ack) }
        ],
        matchQ: (r, q) => D.sf.hay([r.plate_no, r.fuel_vehicle_code, r.receipt_id, r.route_code, r.giver_unit_code, r.fuel_depot]).indexOf(q) >= 0,
        matchDate: (r, tu, den) => (!tu || r.receive_date >= tu) && (!den || r.receive_date <= den),
        state: { get: () => sfState, set: (s) => { sfState = s; sfKeep('fuel', s); } },
        dataSource: () => sfInfo, onApply: () => draw(), onReset: () => {}, scopeFallback: () => 'Tất cả dòng dầu của hợp đồng',
        summary: () => [],
        actions: () => rangeButtons((tu, den) => { sfState = D.sf.setDates(sfState, tu, den); sfKeep('fuel', sfState); draw(); }, () => lastPeriodEnd(f.values().contractId))
      };
      const fixedNote = h('div', { role: 'status' }); // hợp đồng toàn tuyến cố định → không cần nhập dầu (vẫn nhập được)
      const load = async () => {
        const v = f.values(); if (!v.contractId) return;
        const d = await D.api('fuel.list', { contractId: v.contractId }); allRows = d.items;
        const rs = await D.api('contracts.routeSources', { contractId: v.contractId }, { quiet: true }).catch(() => ({ items: [] }));
        fixedNote.replaceChildren(...(rs.allFixed === true ? [h('p', { class: 'small', style: { margin: '8px 0 0' } }, D.tag('info', 'Đơn giá cố định'), ' Hợp đồng toàn tuyến cố định — không cần nhập dầu (vẫn nhập được nếu có). Dầu chỉ dùng cho tuyến theo giá dầu.')] : []));
        acts.innerHTML = '';
        if (D.writer() && isCarrier()) acts.append(h('button', { class: 'btn', onclick: () => manualFuel(v.contractId, load) }, 'Nhập tay'), h('button', { class: 'btn', onclick: () => D.importTemplate({ importType: 'GIAO_NHAN_DAU', contractId: v.contractId }) }, 'Tải file mẫu'), h('button', { class: 'btn primary', onclick: () => D.importWizard({ importType: 'GIAO_NHAN_DAU', contractId: v.contractId, onDone: load }) }, 'Import từ Excel'));
        draw();
      };
      const draw = () => {
        const v = f.values(); if (!v.contractId) return;
        const res = D.sf.filterRows(allRows, sfCfg, sfState); const rows = res.rows;
        const liters = rows.reduce((a, r) => a + r.qty_liter, 0); const pos = rows.filter((r) => r.qty_liter > 0); const avgPrice = pos.length ? pos.reduce((a, r) => a + r.fuel_price_excl_vat, 0) / pos.length : 0;
        sfInfo = { kept: res.kept, total: res.total, unsupported: res.unsupported };
        out.innerHTML = '';
        // bản 1.2.6: file dầu tải lên sai → lọc theo ngày rồi xóa 1 lần, tải lại file đúng
        out.append(h('div', { class: 'row', style: { padding: '10px 14px', borderBottom: '1px solid var(--line)' } },
          h('span', { class: 'small muted grow' }, 'Bấm vào 1 dòng để sửa / xóa. Tải file dầu sai: lọc đúng khoảng ngày của file → "Xóa … dòng đang lọc" → Import lại file đúng.'),
          D.writer() && isCarrier() && rows.length ? h('button', { class: 'btn small danger', onclick: () => bulkDeleteFuel(rows, load) }, `Xóa ${D.vn(rows.length)} dòng đang lọc…`) : null));
        out.append(D.table({ rows, onRow: D.writer() && isCarrier() ? (r) => fuelEdit(r, load) : null, footer: { receive_date: `${rows.length} dòng`, qty_liter: liters, fuel_price_excl_vat: `TB ${D.vn(avgPrice, 2)}` },
          columns: [...D.FUEL_COLS, { key: 'p', label: 'Kỳ', render: (r) => (r.period ? h('span', {}, D.tag(r.period.status), ' ', h('span', { class: 'mono small' }, r.period.periodCode)) : h('span', { class: 'tag mute' }, 'Chưa tính')) },
            { key: 'validation_flags', label: 'Kiểm tra', render: (r) => (r.validation_flags && !r.flags_ack ? h('span', { class: 'tag warn' }, r.validation_flags) : '') }], empty: res.total ? 'Không có dòng dầu nào khớp bộ lọc' : 'Chưa có dòng dầu cho hợp đồng này' }));
        if (sfMount) sfMount.refresh();
      };
      f.inputs.contractId.addEventListener('change', load);
      const page = D.page('Giao nhận dầu', '3 · Bảng kê dầu theo hợp đồng', [acts],
        D.writer() && isCarrier() ? D.smartDropzone(load, () => f.values().contractId) : null,
        h('div', { class: 'card' }, f, (sfMount = D.smartFilter.mount(sfCfg)).el,
        h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Đơn giá dầu của kỳ = trung bình cộng các dòng; dầu trong bảng kê tính hết vào kỳ (kể cả dòng nhận trước ngày bắt đầu).'), fixedNote), out);
      await load();
      return page;
    },
  };
  async function bulkDeleteFuel(items, reload) {
    const locked = items.filter((r) => r.period && r.period.status !== 'NHAP').length;
    const liters = items.reduce((a, r) => a + r.qty_liter, 0);
    const r = await D.confirm({ title: 'Xóa dòng dầu đang lọc', danger: true, reason: true, okLabel: 'Xóa',
      message: `Xóa ${D.vn(items.length)} dòng dầu (${D.vnAuto(Math.round(liters * 100) / 100)} lít) đang hiện trong danh sách.${locked ? ` ${D.vn(locked)} dòng ở kỳ đã xác nhận / khóa sẽ được GIỮ LẠI.` : ''} Kỳ nháp có các dòng này sẽ phải tính lại. Sau đó Import lại file đúng.` });
    if (!r) return;
    const x = await D.api('fuel.softDeleteMany', { receiptIds: items.map((i) => i.receipt_id), reason: r });
    D.toast(`Đã xóa ${x.deleted} dòng dầu${x.skipped.length ? ` · giữ ${x.skipped.length} dòng ở kỳ đã chốt` : ''}${x.notFound && x.notFound.length ? ` · ${x.notFound.length} mã không tồn tại` : ''}${x.alreadyDeleted && x.alreadyDeleted.length ? ` · ${x.alreadyDeleted.length} dòng đã xóa từ trước` : ''}${x.affectedPeriods.length ? ` · ${x.affectedPeriods.length} kỳ nháp phải tính lại` : ''}`, 'ok', 9000);
    reload();
  }
  async function manualFuel(contractId, reload) {
    // bên giao mặc định = đơn vị đã dùng ở các dòng dầu gần nhất của hợp đồng (không thì bên thuê) — tránh chọn nhầm bên giao khác
    const c = D.state.boot.contracts.find((x) => x.contract_id === contractId) || {};
    const last = (await D.api('fuel.list', { contractId }, { quiet: true }).catch(() => ({ items: [] }))).items.slice(-1)[0];
    const giver = (last && last.giver_unit_code) || c.customer_unit_code || '';
    const f = D.form([{ key: 'receive_date', label: 'Ngày nhận dầu', type: 'date', required: true }, { key: 'route_code', label: 'Mã tuyến', type: 'select', options: D.routeOptions(false) },
      { key: 'fuel_vehicle_code', label: 'Biển số / mã xe', required: true }, { key: 'qty_liter', label: 'Số lít (bù trừ: ghi số âm, vd -100)', type: 'number', required: true }, { key: 'fuel_price_excl_vat', label: 'Đơn giá dầu (chưa VAT) — dòng bù trừ được để trống', type: 'number' },
      { key: 'purchase_date', label: 'Ngày mua dầu', type: 'date' }, { key: 'giver_unit_code', label: 'Bên giao dầu', type: 'select', options: D.unitOptions(), readonly: !!(last && last.giver_unit_code), hint: last && last.giver_unit_code ? '1 hợp đồng chỉ 1 bên giao — theo các dòng dầu đã có' : '' },
      { key: 'fuel_depot', label: 'Kho nhận dầu', hint: 'kho / cây xăng xe nhận dầu — nhiều kho vẫn tính chung' }], { receive_date: D.today(), giver_unit_code: giver });
    D.modal({ title: 'Nhập tay dòng dầu', body: f, actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
      const r = await D.api('fuel.saveRows', { contractId, rows: [f.values()], acceptWarnings: true, clientRequestId: D.rid() }); D.toast(`Đã thêm ${r.inserted} dòng`, 'ok'); reload(); return true; } }] });
  }
  function fuelEdit(r, reload) {
    const fields = [{ key: 'receive_date', label: 'Ngày nhận', type: 'date' }, { key: 'fuel_vehicle_code', label: 'Mã xe' }, { key: 'qty_liter', label: 'Số lít', type: 'number' },
      { key: 'fuel_price_excl_vat', label: 'Đơn giá (chưa VAT)', type: 'number' }, { key: 'purchase_date', label: 'Ngày mua', type: 'date' }, { key: 'giver_unit_code', label: 'Đơn vị (bên giao dầu)', type: 'select', options: D.unitOptions() }, { key: 'fuel_depot', label: 'Kho nhận dầu' }, { key: 'reason', label: 'Lý do', full: true }];
    const f = D.form(fields, r);
    D.modal({ title: `Dòng dầu ${r.receipt_id}`, body: f, actions: [{ label: 'Xóa', danger: true, run: async () => { const x = await D.confirm({ title: 'Xóa dòng dầu', message: 'Xóa mềm.', reason: true, danger: true }); if (!x) return false; await D.api('fuel.softDelete', { receiptId: r.receipt_id, reason: x }); reload(); return true; } },
      { label: 'Lưu', primary: true, run: async () => { const v = f.values(); const changes = {}; for (const k of ['receive_date', 'fuel_vehicle_code', 'qty_liter', 'fuel_price_excl_vat', 'purchase_date', 'giver_unit_code', 'fuel_depot']) if (String(v[k] ?? '') !== String(r[k] ?? '')) changes[k] = v[k];
        await D.api('fuel.update', { receiptId: r.receipt_id, changes, rowVersion: r.row_version, reason: v.reason }); reload(); return true; } }] });
  }

  // ───────── Kiểm tra dữ liệu ─────────
  D.views.validation = {
    async render() {
      const d = await D.api('validation.run', {});
      return D.page('Kiểm tra dữ liệu', 'Cảnh báo chưa xử lý của phiếu cân / dầu', [],
        h('div', { class: 'kpis' }, Object.entries(d.byCode).map(([c, n]) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, c), h('div', { class: 'v' }, D.vn(n)), h('div', { class: 'small muted' }, d.messages[c] || '')))),
        h('div', { class: 'card flush' }, D.table({ rows: d.items, columns: [{ key: 'code', label: 'Mã' }, { key: 'entity', label: 'Loại' }, { key: 'label', label: 'Bản ghi' },
          { key: 'x', label: '', render: (r) => (r.entity === 'PHIEU_CAN' ? h('button', { class: 'btn small', onclick: () => ticketDrawer(r.id, () => D.go('validation')) }, 'Mở') : '') }], empty: 'Không có cảnh báo tồn đọng' })));
    },
  };
})();
