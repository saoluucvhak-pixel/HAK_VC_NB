'use strict';
/* Phiếu cân (4.2) · Giao nhận dầu (4.3) · Import dùng chung (4.3b) · Kiểm tra dữ liệu */
(function () {
  const D = window.DGVC; const { h } = D;

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
  D.importWizard = async ({ importType, contractId, onDone }) => {
    const filePath = await D.pickFile({ title: importType === 'PHIEU_CAN' ? 'Chọn file Excel phiếu cân' : 'Chọn file Excel bảng kê dầu', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv'] }] });
    if (!filePath) return;
    let pv; let fixed = {};
    const run = async (extra = {}) => { pv = await D.api('import.preview', { importType, contractId, filePath, fixedValues: fixed, ...extra }, { quiet: true }); };
    try { await run(); } catch (e) {
      if (e.details && e.details.code === 'E_MAPPING_REQUIRED' && (e.details.missing || []).includes('route_code')) {
        const sel = h('select', {}, D.routeOptions(false).map(([v, t]) => h('option', { value: v }, t)));
        const ok = await new Promise((res) => D.modal({ title: 'File không có cột mã tuyến', body: h('div', {}, h('p', {}, 'File xuất từ trạm cân không có cột "Mã cự ly VC". Chọn 1 mã tuyến áp cho mọi dòng:'), h('label', { class: 'field' }, h('span', {}, 'Mã tuyến'), sel)),
          actions: [{ label: 'Hủy', run: () => res(false) }, { label: 'Tiếp', primary: true, run: () => res(true) }] }));
        if (!ok) return; fixed = { route_code: sel.value }; await run();
      } else { D.toast(`${D.errorText(e)}${e.details && e.details.code === 'E_MAPPING_REQUIRED' ? ' — bấm "Tải file mẫu" để lấy file Excel đúng mẫu' : ''}`, 'err', 9000); return; }
    }
    const skip = new Set();
    const rows = (await D.api('import.previewRows', { batchId: pv.batchId, pageSize: 5000 })).rows;
    const S = pv.summary;
    const accept = h('input', { type: 'checkbox', id: 'acc' });
    const body = h('div', {},
      h('div', { class: 'row small' }, h('span', { class: 'mono' }, pv.fileName), `· sheet "${pv.sheet}" · dòng tiêu đề ${pv.headerRowNo}`, Object.keys(pv.fixedValues || {}).length ? D.tag('info', `Mã tuyến chung: ${pv.fixedValues.route_code}`) : null),
      pv.sameFileImportedBefore ? h('p', {}, h('span', { class: 'tag warn' }, 'Cảnh báo'), ' File này đã import trước đây (cùng SHA-256).') : null,
      h('div', { class: 'kpis', style: { marginTop: '10px' } }, [['Tổng dòng', S.total], ['Hợp lệ', S.ok], ['Cảnh báo', S.warning], ...(S.update ? [['Cập nhật / khôi phục', S.update]] : []), ['Đã có (bỏ qua)', S.duplicate], ['Lỗi', S.error]].map(([l, v]) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, D.vn(v))))),
      h('details', {}, h('summary', {}, 'Ghép cột (tự nhận)'), D.table({ columns: [{ key: 'h', label: 'Cột trong file' }, { key: 'f', label: 'Cột dữ liệu' }], rows: Object.entries(pv.mapping).map(([k, v]) => ({ h: k, f: v })), maxHeight: '220px' })),
      D.table({ maxHeight: '46vh', columns: [{ key: 'rowNo', label: 'Dòng', fmt: 'int' }, { key: 'status', label: 'Kiểm tra', render: (r) => h('span', { class: `tag ${{ OK: 'ok', WARNING: 'warn', ERROR: 'err', DUPLICATE: 'mute', UPDATE: 'info' }[r.status]}` }, { OK: 'Hợp lệ', WARNING: 'Cảnh báo', ERROR: 'Lỗi', DUPLICATE: 'Đã có', UPDATE: 'Cập nhật' }[r.status]) },
        ...(importType === 'PHIEU_CAN' ? [{ key: 'a', label: 'Số phiếu', render: (r) => r.normalized.ticket_no }, { key: 'b', label: 'Ngày cân 1', render: (r) => D.dmy(r.normalized.weigh1_date) }, { key: 'c', label: 'Biển số', render: (r) => r.normalized.plate_no },
          { key: 'd', label: 'KL (KG)', num: true, render: (r) => D.vn(r.normalized.net_kg) }, { key: 'e', label: 'Tuyến', render: (r) => r.normalized.route_code }]
          : [{ key: 'a', label: 'Ngày nhận', render: (r) => D.dmy(r.normalized.receive_date) }, { key: 'b', label: 'Mã xe', render: (r) => r.normalized.fuel_vehicle_code }, { key: 'c', label: 'Biển số', render: (r) => r.normalized.plate_no },
            { key: 'd', label: 'Lít', num: true, render: (r) => D.vnAuto(r.normalized.qty_liter) }, { key: 'e', label: 'Đơn giá', num: true, render: (r) => D.vnAuto(r.normalized.fuel_price_excl_vat) }]),
        { key: 'i', label: 'Ghi chú', wrap: true, render: (r) => (r.issues || []).map((i) => i.message).join('; ') },
        { key: 's', label: 'Bỏ', render: (r) => h('input', { type: 'checkbox', 'aria-label': `Bỏ dòng ${r.rowNo}`, checked: r.status === 'ERROR', disabled: r.status === 'ERROR', onchange: (e) => (e.target.checked ? skip.add(r.rowNo) : skip.delete(r.rowNo)) }) }], rows }),
      h('label', { class: 'check', for: 'acc', style: { marginTop: '10px' } }, accept, S.update ? 'Chấp nhận các dòng cảnh báo và cập nhật phiếu đã có theo file' : 'Chấp nhận các dòng cảnh báo'));
    for (const r of rows) if (r.status === 'ERROR') skip.add(r.rowNo);
    D.modal({ title: importType === 'PHIEU_CAN' ? 'Import phiếu cân — xem trước' : 'Import bảng kê dầu — xem trước', wide: true, body,
      onClose: () => D.api('import.cancel', { batchId: pv.batchId }, { quiet: true }).catch(() => {}),
      actions: [{ label: 'Hủy', run: () => true }, { label: `Xác nhận import ${S.ok + S.warning + (S.update || 0) - [...skip].filter((n) => rows.find((r) => r.rowNo === n && r.status !== 'ERROR')).length} dòng`, primary: true, run: async () => {
        const r = await D.api('import.confirm', { batchId: pv.batchId, skipRowNos: [...skip], acceptWarnings: accept.checked, clientRequestId: D.rid() });
        D.toast(`Đã import ${r.inserted} dòng${r.updated ? ` · cập nhật ${r.updated} phiếu` : ''}${r.restored ? ` · khôi phục ${r.restored} phiếu` : ''} · bỏ qua ${r.duplicates} dòng đã có${r.recalcPeriods && r.recalcPeriods.length ? ` · ${r.recalcPeriods.length} kỳ nháp phải tính lại` : ''}`, 'ok', 8000); if (onDone) onDone(); return true;
      } }] });
  };

  // ───────── Phiếu cân ─────────
  D.views.tickets = {
    async render(p) {
      const f = D.form([{ key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }, { key: 'routeCode', label: 'Tuyến', type: 'select', options: D.routeOptions() },
        { key: 'ownerUnitCode', label: 'Chủ xe', type: 'select', options: [['', 'Tất cả'], ...D.unitOptions()] },
        { key: 'usage', label: 'Trạng thái sử dụng', type: 'select', options: [['', 'Tất cả'], ['FREE', 'Chưa tính'], ['NHAP', 'Ở kỳ nháp'], ['DA_XAC_NHAN', 'Đã xác nhận'], ['DA_KHOA', 'Đã khóa'], ['DELETED', 'Đã xóa']] },
        { key: 'q', label: 'Số phiếu / biển số', placeholder: 'tìm…' }, { key: 'onlyFlags', label: 'Chỉ phiếu có cảnh báo', type: 'check' }], p);
      f.className = 'filters';
      const out = h('div', { class: 'card flush' });
      const load = async () => {
        const d = await D.api('tickets.list', { ...f.values(), pageSize: 5000 });
        out.innerHTML = '';
        const deletedView = f.values().usage === 'DELETED';
        out.append(h('div', { class: 'row', style: { padding: '10px 14px', borderBottom: '1px solid var(--line)' } },
          h('span', { class: 'small muted grow' }, deletedView ? 'Phiếu đã xóa — bấm vào 1 phiếu để khôi phục (import lại file có phiếu đó cũng tự khôi phục).' : 'Bấm vào 1 phiếu để xem / sửa / xóa. Import lại file đã sửa số liệu sẽ cập nhật phiếu đã có (trừ phiếu ở kỳ đã chốt).'),
          D.writer() && !deletedView && d.items.length ? h('button', { class: 'btn small danger', onclick: () => bulkDelete(d.items, load) }, `Xóa ${D.vn(d.items.length)} phiếu đang lọc…`) : null));
        out.append(D.table({ rows: d.items, onRow: (r) => ticketDrawer(r.ticket_id, load), footer: { ticket_no: `${D.vn(d.totals.trips)} phiếu`, net_kg: d.totals.kg },
          columns: [...D.TICKET_COLS, { key: 'ldd', label: 'LDĐ' }, { key: 'u', label: 'Kỳ đang dùng', render: (r) => (r.usages.length ? r.usages.map((u) => h('div', {}, D.tag(u.status), ' ', h('span', { class: 'mono small' }, u.periodCode))) : h('span', { class: 'tag mute' }, 'Chưa tính')) },
            { key: 'validation_flags', label: 'Cảnh báo', render: (r) => (r.validation_flags && !r.flags_ack ? h('span', { class: 'tag warn' }, r.validation_flags) : '') }],
          empty: 'Chưa có phiếu cân — bấm "Import từ Excel"' }));
      };
      const page = D.page('Phiếu cân', '2 · Phiếu cân', [D.writer() ? h('button', { class: 'btn', onclick: () => bulkDesc(load) }, 'Sửa hàng loạt cột mô tả') : null,
        D.writer() ? h('button', { class: 'btn', onclick: () => D.importTemplate({ importType: 'PHIEU_CAN' }) }, 'Tải file mẫu') : null,
        D.writer() ? h('button', { class: 'btn primary', onclick: () => D.importWizard({ importType: 'PHIEU_CAN', onDone: load }) }, 'Import từ Excel') : null],
      h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Lọc'))), out);
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

  async function bulkDelete(items, reload) {
    const locked = items.filter((t) => t.usages.some((u) => u.status !== 'NHAP')).length;
    const kg = items.reduce((a, t) => a + t.net_kg, 0);
    const r = await D.confirm({ title: 'Xóa phiếu cân đang lọc', danger: true, reason: true,
      message: `Xóa ${D.vn(items.length)} phiếu (${D.vn(kg)} kg) đang hiện trong danh sách.${locked ? ` ${D.vn(locked)} phiếu ở kỳ đã xác nhận / khóa sẽ được GIỮ LẠI.` : ''} Xóa mềm — khôi phục được (lọc "Đã xóa", hoặc import lại file).` });
    if (!r) return;
    const x = await D.api('tickets.softDeleteMany', { ticketIds: items.map((t) => t.ticket_id), reason: r });
    D.toast(`Đã xóa ${x.deleted} phiếu${x.skipped.length ? ` · giữ ${x.skipped.length} phiếu ở kỳ đã chốt` : ''}${x.affectedPeriods.length ? ` · ${x.affectedPeriods.length} kỳ nháp phải tính lại` : ''}`, 'ok', 9000);
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
      const f = D.form([{ key: 'contractId', label: 'Hợp đồng', type: 'select', options: opts }, { key: 'dateFrom', label: 'Từ ngày', type: 'date' }, { key: 'dateTo', label: 'Đến ngày', type: 'date' }],
        { contractId: p.contractId || (D.contractOptions(true)[0] || opts[0] || [''])[0] });
      f.className = 'filters';
      const out = h('div', { class: 'card flush' });
      const isCarrier = () => (D.state.boot.contracts.find((c) => c.contract_id === f.values().contractId) || {}).role === 'CARRIER';
      const acts = h('div', { class: 'btns' });
      const load = async () => {
        const v = f.values(); if (!v.contractId) return;
        const d = await D.api('fuel.list', v);
        acts.innerHTML = '';
        if (D.writer() && isCarrier()) acts.append(h('button', { class: 'btn', onclick: () => manualFuel(v.contractId, load) }, 'Nhập tay'), h('button', { class: 'btn', onclick: () => D.importTemplate({ importType: 'GIAO_NHAN_DAU', contractId: v.contractId }) }, 'Tải file mẫu'), h('button', { class: 'btn primary', onclick: () => D.importWizard({ importType: 'GIAO_NHAN_DAU', contractId: v.contractId, onDone: load }) }, 'Import từ Excel'));
        out.innerHTML = '';
        out.append(D.table({ rows: d.items, onRow: D.writer() && isCarrier() ? (r) => fuelEdit(r, load) : null, footer: { receive_date: `${d.total} dòng`, qty_liter: d.totals.liters, fuel_price_excl_vat: `TB ${D.vn(d.totals.avgPrice, 2)}` },
          columns: [...D.FUEL_COLS, { key: 'p', label: 'Kỳ', render: (r) => (r.period ? h('span', {}, D.tag(r.period.status), ' ', h('span', { class: 'mono small' }, r.period.periodCode)) : h('span', { class: 'tag mute' }, 'Chưa tính')) },
            { key: 'validation_flags', label: 'Kiểm tra', render: (r) => (r.validation_flags && !r.flags_ack ? h('span', { class: 'tag warn' }, r.validation_flags) : '') }], empty: 'Chưa có dòng dầu cho hợp đồng này' }));
      };
      f.inputs.contractId.addEventListener('change', load);
      const page = D.page('Giao nhận dầu', '3 · Bảng kê dầu theo hợp đồng', [acts], h('div', { class: 'card' }, h('div', { class: 'filters' }, f, h('button', { class: 'btn primary', onclick: load }, 'Lọc')),
        h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Đơn giá dầu của kỳ = trung bình cộng các dòng; dầu trong bảng kê tính hết vào kỳ (kể cả dòng nhận trước ngày bắt đầu).')), out);
      await load();
      return page;
    },
  };
  function manualFuel(contractId, reload) {
    const f = D.form([{ key: 'receive_date', label: 'Ngày nhận dầu', type: 'date', required: true }, { key: 'route_code', label: 'Mã tuyến', type: 'select', options: D.routeOptions(false) },
      { key: 'fuel_vehicle_code', label: 'Biển số / mã xe', required: true }, { key: 'qty_liter', label: 'Số lít (bù trừ: ghi số âm, vd -100)', type: 'number', required: true }, { key: 'fuel_price_excl_vat', label: 'Đơn giá dầu (chưa VAT) — dòng bù trừ được để trống', type: 'number' },
      { key: 'purchase_date', label: 'Ngày mua dầu', type: 'date' }, { key: 'giver_unit_code', label: 'Bên giao dầu', type: 'select', options: D.unitOptions() }, { key: 'fuel_depot', label: 'Kho nhận dầu', hint: 'kho / cây xăng xe nhận dầu' }], { receive_date: D.today() });
    D.modal({ title: 'Nhập tay dòng dầu', body: f, actions: [{ label: 'Hủy', run: () => true }, { label: 'Lưu', primary: true, run: async () => {
      const r = await D.api('fuel.saveRows', { contractId, rows: [f.values()], acceptWarnings: true, clientRequestId: D.rid() }); D.toast(`Đã thêm ${r.inserted} dòng`, 'ok'); reload(); return true; } }] });
  }
  function fuelEdit(r, reload) {
    const fields = [{ key: 'receive_date', label: 'Ngày nhận', type: 'date' }, { key: 'fuel_vehicle_code', label: 'Mã xe' }, { key: 'qty_liter', label: 'Số lít', type: 'number' },
      { key: 'fuel_price_excl_vat', label: 'Đơn giá (chưa VAT)', type: 'number' }, { key: 'purchase_date', label: 'Ngày mua', type: 'date' }, { key: 'fuel_depot', label: 'Kho nhận dầu' }, { key: 'reason', label: 'Lý do', full: true }];
    const f = D.form(fields, r);
    D.modal({ title: `Dòng dầu ${r.receipt_id}`, body: f, actions: [{ label: 'Xóa', danger: true, run: async () => { const x = await D.confirm({ title: 'Xóa dòng dầu', message: 'Xóa mềm.', reason: true, danger: true }); if (!x) return false; await D.api('fuel.softDelete', { receiptId: r.receipt_id, reason: x }); reload(); return true; } },
      { label: 'Lưu', primary: true, run: async () => { const v = f.values(); const changes = {}; for (const k of ['receive_date', 'fuel_vehicle_code', 'qty_liter', 'fuel_price_excl_vat', 'purchase_date', 'fuel_depot']) if (String(v[k] ?? '') !== String(r[k] ?? '')) changes[k] = v[k];
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
